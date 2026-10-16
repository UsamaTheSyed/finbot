import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { TestContext } from "node:test";
import type { Pool } from "pg";
import { BotEngine } from "../../server/bot/core/engine";
import { issueLink } from "../../server/bot/security/access";
import {
  blankExtraction,
  type Extraction,
  type InboundMessage,
  type OutgoingMessage,
} from "../../server/bot/types";
import { executePayment } from "../../server/services/payments";
import { insertInvoiceGraph } from "../../server/services/invoices";
import { allocateInvoiceNumber } from "../../server/services/invoiceNumber";
import { invoiceDto } from "../../server/services/ledger";
import { partySummaries } from "../../server/services/parties";
import {
  dashboardReport,
  financialReport,
} from "../../server/services/reports";
import { pkr } from "../../server/bot/core/normalize";

// Runs inside the existing integration test, avoiding concurrent destructive seeds.
export async function botIntegration(t: TestContext, pool: Pool) {
  const runId = randomUUID();
  const client = await pool.connect();
  let invoiceNumber: string;
  try {
    await client.query("begin");
    await client.query(
      "insert into parties (id,business_id,name,kind) values ('bot-party','business-1','Bot Customer','Customer')",
    );
    invoiceNumber = await allocateInvoiceNumber(client, "business-1");
    await insertInvoiceGraph(
      client,
      "business-1",
      "user-1",
      "bot-invoice",
      {
        partyId: "bot-party",
        date: "2026-11-28",
        dueDate: "2026-12-28",
        reference: "BOT-TEST",
        items: [
          {
            item: "Rice",
            description: "Bag",
            quantity: 1,
            unit: "Bag",
            rate: 2000,
            taxPercent: 0,
          },
        ],
        discount: 0,
        amountPaid: 0,
        method: "Cash",
        notes: "",
        terms: "",
        draft: false,
      },
      invoiceNumber,
    );
    await client.query("commit");
  } finally {
    client.release();
  }
  let next: Extraction = blankExtraction(),
    sequence = 0;
  const provider = { interpret: async () => next };
  const engine = () =>
    new BotEngine(pool, provider, 15, () => new Date("2026-11-28T10:00:00Z"));
  const message = (
    text: string,
    callback?: string,
    user = "101",
  ): InboundMessage => ({
    channel: "telegram",
    externalUserId: user,
    externalChatId: user,
    messageId: `bot-test-${runId}-${++sequence}`,
    text,
    timestamp: Date.now(),
    callback,
  });
  const send = (text: string, callback?: string, user?: string) =>
    engine().handle(message(text, callback, user));
  const button = (out: OutgoingMessage, label: string) => {
    const b = out.buttons?.find((b) => b.text === label);
    assert.ok(b, out.text);
    return b.data;
  };
  const rates = () => pool.query("delete from bot_rate_limits");
  async function token() {
    const c = await pool.connect();
    try {
      await c.query("begin");
      const value = await issueLink(c, "user-1", "business-1");
      await c.query("commit");
      return value;
    } finally {
      c.release();
    }
  }
  const count = async () =>
    Number(
      (
        await pool.query(
          "select count(*) from payments where party_id='bot-party'",
        )
      ).rows[0].count,
    );
  function payment(amount = "500") {
    next = {
      ...blankExtraction(),
      intent: "RECORD_PAYMENT",
      partyName: "Bot Customer",
      amountText: amount,
      method: "Cash",
      direction: "Received",
      dateText: "2026-11-28",
      invoiceReference: invoiceNumber,
    };
  }
  await t.test(
    "bot links once, rejects invalid/expired/reused tokens and unlinked reads",
    async () => {
      assert.match((await send("balance")).text, /link/i);
      assert.match((await send("/link invalid")).text, /invalid/i);
      const expired = await token();
      await pool.query(
        "update bot_link_tokens set expires_at=now()-interval '1 second'",
      );
      assert.match((await send(`/link ${expired}`)).text, /expired/i);
      const link = await token();
      assert.match((await send(`/link ${link}`)).text, /Telegram linked/);
      assert.match(
        (await send(`/link ${link}`, undefined, "102")).text,
        /invalid/i,
      );
      assert.equal(
        (
          await pool.query(
            "select count(*) from bot_identities where external_user_id='102'",
          )
        ).rows[0].count,
        "0",
      );
    },
  );
  await t.test(
    "bot financial replies reconcile with existing party and report services",
    async () => {
      await rates();
      next = {
        ...blankExtraction(),
        intent: "GET_PARTY_BALANCE",
        partyName: "Bot Customer",
      };
      const p = (await partySummaries(pool, "business-1")).find(
        (p) => p.id === "bot-party",
      )!;
      assert.ok((await send("balance")).text.includes(pkr(p.balanceMinor)));
      const [r] = await dashboardReport(pool, "business-1");
      next = { ...blankExtraction(), intent: "GET_RECEIVABLES" };
      assert.ok(
        (await send("receivables")).text.includes(
          pkr(Math.round(r.receivable * 100)),
        ),
      );
      next = { ...blankExtraction(), intent: "GET_PAYABLES" };
      assert.ok(
        (await send("payables")).text.includes(
          pkr(Math.round(r.payable * 100)),
        ),
      );
      next = {
        ...blankExtraction(),
        intent: "GET_DAILY_SUMMARY",
        dateText: "aaj",
      };
      const daily = await financialReport(
        pool,
        "business-1",
        "daily",
        "2026-11-28",
      );
      assert.ok(
        (await send("aaj ki sales")).text.includes(
          pkr(Math.round(daily!.lines[0].amount * 100)),
        ),
      );
      next = {
        ...blankExtraction(),
        intent: "GET_PARTY_BALANCE",
        partyName: "Private Party",
      };
      assert.match((await send("other workspace")).text, /nahi mila/);
      await send("/cancel");
    },
  );
  await t.test(
    "bot asks missing fields without AI, then persists confirmation across engine restart",
    async () => {
      await rates();
      payment();
      next.amountText = null;
      next.method = null;
      next.dateText = null;
      assert.match((await send("Bot Customer ne payment di")).text, /Kitni/);
      assert.match((await send("500")).text, /method/);
      assert.match((await send("JazzCash")).text, /date/i);
      const before = await count(),
        out = await send("aaj");
      assert.equal(await count(), before);
      const confirm = button(out, "Confirm"),
        same = message("", confirm);
      const results = await Promise.all([
        engine().handle(same),
        engine().handle(same),
        send("", confirm),
      ]);
      assert.equal(
        results.filter((r) => r.text.startsWith("Payment recorded")).length,
        1,
      );
      assert.equal(await count(), before + 1);
      const invoice = await invoiceDto(pool, "business-1", "bot-invoice");
      assert.equal(invoice.paidMinor, 50000);
      assert.equal(invoice.balanceMinor, 150000);
    },
  );
  await t.test(
    "bot cancelled and expired confirmations cannot execute",
    async () => {
      await rates();
      payment();
      let out = await send("payment");
      const cancelled = button(out, "Confirm");
      await send("", button(out, "Cancel"));
      const before = await count();
      assert.match((await send("", cancelled)).text, /cancelled/);
      assert.equal(await count(), before);
      payment();
      out = await send("payment");
      const expired = button(out, "Confirm");
      await pool.query(
        "update bot_actions set expires_at=now()-interval '1 second' where id=$1",
        [expired.split(":")[1]],
      );
      assert.match((await send("", expired)).text, /expired/);
      assert.equal(await count(), before);
    },
  );
  await t.test(
    "bot edit cancels old button and requires a new explicit confirmation",
    async () => {
      await rates();
      payment();
      const out = await send("payment"),
        old = button(out, "Confirm"),
        before = await count();
      await send("", button(out, "Edit"));
      next = { ...blankExtraction(), amountText: "400" };
      const edited = await send("amount 400 karo");
      assert.ok(edited.text.includes("400.00"));
      assert.equal(await count(), before);
      assert.match((await send("", old)).text, /cancelled/);
      assert.match(
        (await send("", button(edited, "Confirm"))).text,
        /Payment recorded/,
      );
      assert.equal(await count(), before + 1);
    },
  );
  await t.test(
    "bot overpayment fails before proposal, and full settlement uses shared invoice state",
    async () => {
      await rates();
      payment("1100.01");
      assert.match((await send("overpay")).text, /exceed|balance/i);
      assert.equal(
        (await invoiceDto(pool, "business-1", "bot-invoice")).balanceMinor,
        110000,
      );
      await send("/cancel");
      payment("1100");
      const out = await send("settle");
      assert.match(
        (await send("", button(out, "Confirm"))).text,
        /remaining: PKR 0.00/,
      );
      assert.equal(
        (await invoiceDto(pool, "business-1", "bot-invoice")).status,
        "Paid",
      );
    },
  );
  await t.test(
    "bot party and invoice ambiguity require opaque user selection",
    async () => {
      await rates();
      await pool.query(
        "insert into parties (id,business_id,name,kind) values ('bot-party-2','business-1','Bot Customer Two','Customer')",
      );
      const c = await pool.connect();
      try {
        await c.query("begin");
        for (const id of ["bot-invoice-a", "bot-invoice-b"])
          await insertInvoiceGraph(
            c,
            "business-1",
            "user-1",
            id,
            {
              partyId: "bot-party",
              date: "2026-11-28",
              dueDate: "2026-12-28",
              reference: "",
              items: [
                {
                  item: "Rice",
                  description: "",
                  quantity: 1,
                  unit: "Bag",
                  rate: 100,
                  taxPercent: 0,
                },
              ],
              discount: 0,
              amountPaid: 0,
              method: "Cash",
              notes: "",
              terms: "",
              draft: false,
            },
            await allocateInvoiceNumber(c, "business-1"),
          );
        await c.query("commit");
      } finally {
        c.release();
      }
      next = {
        ...blankExtraction(),
        intent: "RECORD_PAYMENT",
        partyName: "Bot Customer",
        amountText: "100",
        direction: "Received",
        method: "Cash",
        dateText: "2026-11-28",
      };
      const out = await send("payment");
      assert.equal(out.buttons?.length, 2);
      assert.ok(out.buttons?.every((b) => /^choose:[0-9a-f-]+$/.test(b.data)));
      const chosen = await send("", button(out, "Bot Customer (Customer)"));
      assert.match(chosen.text, /allocation/);
      assert.equal(chosen.buttons?.length, 4);
      assert.ok(
        chosen.buttons?.some(
          (b) => b.text === "Oldest first + carry forward advance",
        ),
      );
      assert.ok(
        chosen.buttons?.some((b) => b.text === "On account (unallocated)"),
      );
      await send("/cancel");
      await pool.query("delete from parties where id='bot-party-2'");
    },
  );
  await t.test(
    "different identity cannot confirm and revoked membership denies reads/writes",
    async () => {
      await rates();
      const link = await token();
      await send(`/link ${link}`, undefined, "102");
      payment("100");
      next.invoiceReference = "on account";
      const out = await send("on account"),
        confirm = button(out, "Confirm"),
        before = await count();
      assert.match((await send("", confirm, "102")).text, /not found/);
      assert.equal(await count(), before);
      await pool.query(
        "update workspace_memberships set status='Inactive' where user_id='user-1' and business_id='business-1'",
      );
      try {
        assert.match((await send("", confirm)).text, /revoked/);
        assert.equal(await count(), before);
      } finally {
        await pool.query(
          "update workspace_memberships set status='Active' where user_id='user-1' and business_id='business-1'",
        );
      }
      await send("/cancel");
    },
  );
  await t.test(
    "server revalidation rejects a cross-workspace entity even in a persisted payload",
    async () => {
      await rates();
      payment("100");
      next.invoiceReference = "on account";
      const out = await send("on account"),
        confirm = button(out, "Confirm"),
        before = await count();
      await pool.query(
        "update bot_actions set payload=jsonb_set(payload,'{input,partyId}','\"other-party\"') where id=$1",
        [confirm.split(":")[1]],
      );
      assert.match((await send("", confirm)).text, /not found/);
      assert.equal(await count(), before);
    },
  );
  await t.test(
    "sale uses existing invoice graph and numbering only after confirmation",
    async () => {
      await rates();
      next = {
        ...blankExtraction(),
        intent: "RECORD_SALE",
        partyName: "Bot Customer",
        description: "Rice",
        quantity: 2,
        unit: "Bag",
        rateText: "100",
        taxText: "5",
        discountText: "0",
        initialPaidText: "0",
        method: null,
        dateText: "2026-11-28",
        dueDateText: "2026-12-28",
      };
      const before = (
        await pool.query(
          "select count(*) from invoices where party_id='bot-party'",
        )
      ).rows[0].count;
      const out = await send("sale");
      assert.equal(
        (
          await pool.query(
            "select count(*) from invoices where party_id='bot-party'",
          )
        ).rows[0].count,
        before,
      );
      assert.match(out.text, /no new cash payment/);
      const result = await send("", button(out, "Confirm"));
      assert.match(result.text, /Sale saved: INV-\d+/);
      assert.ok(result.text.includes("210.00"));
      assert.match(
        (await send("", button(out, "Confirm"))).text,
        /already executed/,
      );
    },
  );
  await t.test(
    "purchase confirmation applies supplier advance once without new cash",
    async () => {
      await rates();
      await send("/cancel");
      await pool.query(
        "insert into parties(id,business_id,name,kind) values('bot-supplier','business-1','Bot Supplier','Supplier')",
      );
      const c = await pool.connect();
      try {
        await c.query("begin");
        await executePayment(c, "business-1", {
          partyId: "bot-supplier",
          invoiceId: "",
          direction: "Sent",
          amount: 1000,
          allocationMode: "fifo",
          method: "Cash",
          date: "2026-11-28",
          reference: "",
          notes: "",
        });
        await c.query("commit");
      } finally {
        c.release();
      }
      next = {
        ...blankExtraction(),
        intent: "RECORD_PURCHASE",
        partyName: "Bot Supplier",
        description: "Rice",
        quantity: 2,
        unit: "Bag",
        rateText: "400/Bag",
        taxText: "0",
        discountText: "0",
        initialPaidText: "0",
        method: null,
        dateText: "2026-11-28",
        dueDateText: "2026-12-28",
      };
      const out = await send("supplier purchase");
      assert.match(out.text, /Create supplier bill/);
      assert.match(out.text, /no new cash payment/);
      assert.ok(!out.text.includes("(Cash)"));
      assert.equal(
        (
          await pool.query(
            "select count(*)::int n from invoices where party_id='bot-supplier'",
          )
        ).rows[0].n,
        0,
      );
      const confirm = button(out, "Confirm");
      const result = await send("", confirm);
      assert.match(result.text, /Supplier bill saved: INV-/);
      assert.match(result.text, /Balance: PKR 0.00/);
      assert.match((await send("", confirm)).text, /already executed/);
      const inv = (
        await pool.query(
          "select id from invoices where party_id='bot-supplier'",
        )
      ).rows;
      assert.equal(inv.length, 1);
      assert.equal(
        (await invoiceDto(pool, "business-1", inv[0].id)).paidMinor,
        80000,
      );
      assert.equal(
        (
          await pool.query(
            "select count(*)::int n from payments where party_id='bot-supplier'",
          )
        ).rows[0].n,
        1,
      );
      assert.equal(
        (
          await pool.query(
            "select type from transactions where party_id='bot-supplier'",
          )
        ).rows[0].type,
        "Purchase",
      );
    },
  );
  await t.test(
    "purchase with initial paid amount asks method and shares remaining advance",
    async () => {
      await rates();
      next = {
        ...blankExtraction(),
        intent: "RECORD_PURCHASE",
        partyName: "Bot Supplier",
        description: "Rice",
        quantity: 1,
        unit: "Bag",
        rateText: "400",
        taxText: "0",
        discountText: "0",
        initialPaidText: "100",
        method: null,
        dateText: "2026-11-28",
        dueDateText: "2026-12-28",
      };
      const method = await send("supplier purchase paid 100");
      assert.match(method.text, /Payment method/);
      const out = await send("", button(method, "Bank Transfer"));
      assert.match(out.text, /Sent, Bank Transfer/);
      const result = await send("", button(out, "Confirm"));
      assert.match(result.text, /Balance: PKR 100.00/);
      const history = (
        await pool.query(
          "select amount_minor,direction,method from payments where party_id='bot-supplier' order by amount_minor",
        )
      ).rows;
      assert.equal(history.length, 2);
      assert.equal(Number(history[0].amount_minor), 10000);
      assert.equal(history[0].direction, "Sent");
      assert.equal(history[0].method, "Bank Transfer");
    },
  );
  await t.test(
    "purchase cancellation and confirmation party revalidation cannot create bills",
    async () => {
      await rates();
      next = {
        ...blankExtraction(),
        intent: "RECORD_PURCHASE",
        partyName: "Bot Supplier",
        description: "Rice",
        quantity: 1,
        unit: "Bag",
        rateText: "400",
        taxText: "0",
        discountText: "0",
        initialPaidText: "0",
        method: null,
        dateText: "2026-11-28",
        dueDateText: "2026-12-28",
      };
      const before = (await pool.query("select count(*)::int n from invoices"))
        .rows[0].n;
      const out = await send("supplier purchase");
      await send("", button(out, "Cancel"));
      await send("", button(out, "Confirm"));
      assert.equal(
        (await pool.query("select count(*)::int n from invoices")).rows[0].n,
        before,
      );
      const again = await send("supplier purchase"),
        confirm = button(again, "Confirm");
      await pool.query(
        "update bot_actions set payload=jsonb_set(payload,'{input,partyId}','\"bot-party\"') where id=$1",
        [confirm.split(":")[1]],
      );
      assert.match((await send("", confirm)).text, /Party type/);
      assert.equal(
        (await pool.query("select count(*)::int n from invoices")).rows[0].n,
        before,
      );
      await send("/cancel");
    },
  );
  for (const kind of ["Customer", "Supplier"] as const) {
    await t.test(
      `multi-item ${kind}: recovery, edit, confirmation and shared settlement`,
      async () => {
        await rates();
        await send("/cancel");
        const partyId = `bot-multi-${kind}`;
        const name = `Multi ${kind}`;
        await pool.query(
          "insert into parties(id,business_id,name,kind) values($1,'business-1',$2,$3)",
          [partyId, name, kind],
        );
        if (kind === "Supplier") {
          const c = await pool.connect();
          try {
            await c.query("begin");
            await executePayment(c, "business-1", {
              partyId,
              invoiceId: "",
              direction: "Sent",
              amount: 1000,
              allocationMode: "fifo",
              method: "Cash",
              date: "2026-11-28",
              reference: "",
              notes: "",
            });
            await c.query("commit");
          } finally {
            c.release();
          }
        }
        next = {
          ...blankExtraction(),
          intent: kind === "Supplier" ? "RECORD_PURCHASE" : "RECORD_SALE",
          partyName: name,
          items: [
            {
              description: "Rice",
              quantity: 2,
              unit: "Bag",
              rateText: "1000",
              taxText: "5",
            },
            {
              description: "Oil",
              quantity: 1,
              unit: "Carton",
              rateText: null,
              taxText: "0",
            },
          ],
          discountText: "100",
          initialPaidText: kind === "Supplier" ? "0" : "500",
          dateText: "2026-11-28",
          dueDateText: "2026-12-28",
        };
        assert.match((await send("multi item invoice")).text, /Item 2/);
        // send() creates a new engine each time; the correction cursor must persist in DB.
        let out = await send("500/Carton");
        if (kind === "Customer") {
          assert.match(out.text, /Payment method/);
          out = await send("", button(out, "Cash"));
        }
        assert.match(out.text, /Total: PKR 2,500.00/);
        const oldConfirm = button(out, "Confirm");
        await send("", button(out, "Edit"));
        next = {
          ...blankExtraction(),
          intent: kind === "Supplier" ? "RECORD_PURCHASE" : "RECORD_SALE",
          rateText: "600",
        };
        assert.match(
          (await send("change one rate")).text,
          /poori replacement list/,
        );
        next = {
          ...blankExtraction(),
          intent: kind === "Supplier" ? "RECORD_PURCHASE" : "RECORD_SALE",
          items: [
            {
              description: "Rice",
              quantity: 2,
              unit: "Bag",
              rateText: "1000",
              taxText: "5",
            },
            {
              description: "Oil",
              quantity: 1,
              unit: "Carton",
              rateText: "600",
              taxText: "0",
            },
          ],
        };
        out = await send("full replacement list");
        assert.match(out.text, /Total: PKR 2,600.00/);
        assert.match((await send("", oldConfirm)).text, /already cancelled/);
        assert.equal(
          (
            await pool.query(
              "select count(*)::int n from invoices where party_id=$1",
              [partyId],
            )
          ).rows[0].n,
          0,
        );
        const confirm = button(out, "Confirm");
        assert.match((await send("", confirm)).text, /saved: INV-/);
        assert.match((await send("", confirm)).text, /already executed/);
        const invoices = (
          await pool.query("select id from invoices where party_id=$1", [
            partyId,
          ])
        ).rows;
        assert.equal(invoices.length, 1);
        const invoice = await invoiceDto(pool, "business-1", invoices[0].id);
        assert.equal(invoice.items.length, 2);
        assert.equal(invoice.totalMinor, 260000);
        assert.equal(invoice.paidMinor, kind === "Supplier" ? 100000 : 50000);
        assert.equal(
          invoice.balanceMinor,
          kind === "Supplier" ? 160000 : 210000,
        );
        const payments = (
          await pool.query(
            "select amount_minor,direction from payments where party_id=$1",
            [partyId],
          )
        ).rows;
        assert.equal(payments.length, 1);
        assert.equal(
          Number(payments[0].amount_minor),
          kind === "Supplier" ? 100000 : 50000,
        );
        assert.equal(
          payments[0].direction,
          kind === "Supplier" ? "Sent" : "Received",
        );
        // Cancelling another complete multi-item proposal must leave invoice count unchanged.
        next = {
          ...blankExtraction(),
          intent: kind === "Supplier" ? "RECORD_PURCHASE" : "RECORD_SALE",
          partyName: name,
          items: [
            {
              description: "Rice",
              quantity: 1,
              unit: "Bag",
              rateText: "10",
              taxText: "0",
            },
            {
              description: "Oil",
              quantity: 1,
              unit: "Carton",
              rateText: "20",
              taxText: "0",
            },
          ],
          discountText: "0",
          initialPaidText: "0",
          dateText: "2026-11-28",
          dueDateText: "2026-12-28",
        };
        out = await send("another multi item invoice");
        await send("", button(out, "Cancel"));
        assert.match(
          (await send("", button(out, "Confirm"))).text,
          /already cancelled/,
        );
        assert.equal(
          (
            await pool.query(
              "select count(*)::int n from invoices where party_id=$1",
              [partyId],
            )
          ).rows[0].n,
          1,
        );
      },
    );
  }
  await t.test(
    "low confidence, AI failure and incomplete purchases cannot write",
    async () => {
      await rates();
      const before = await count();
      next = {
        ...blankExtraction(),
        intent: "RECORD_PAYMENT",
        confidence: 0.1,
      };
      assert.match((await send("unclear")).text, /clear nahi/);
      next = { ...blankExtraction(), intent: "RECORD_PURCHASE" };
      assert.match((await send("purchase")).text, /Party ka naam/);
      await send("/cancel");
      const broken = new BotEngine(pool, {
        interpret: async () => {
          throw new Error("AI_UNAVAILABLE");
        },
      });
      assert.match(
        (await broken.handle(message("payment"))).text,
        /AI abhi unavailable/,
      );
      assert.equal(await count(), before);
    },
  );
  await t.test(
    "context follow-up requires party confirmation and preserves the pending amount",
    async () => {
      await rates();
      await send("/cancel");
      next = {
        ...blankExtraction(),
        intent: "GET_PARTY_BALANCE",
        partyName: "Bot Customer (Customer)",
      };
      await send("Bot Customer ka balance");
      payment("50");
      next.partyName = null;
      next.invoiceReference = "on account";
      const suggestion = await send("Acha isne 50 jama karwaye hain");
      assert.match(suggestion.text, /isi party/);
      const preview = await send(
        "",
        button(suggestion, "Bot Customer (Customer)"),
      );
      assert.match(preview.text, /PKR 50.00/);
      assert.ok(preview.buttons?.some((b) => b.text === "Confirm"));
      await send("/cancel");
    },
  );
  await t.test(
    "direction mismatch asks business-perspective clarification before payment proposal",
    async () => {
      await rates();
      await send("/cancel");
      payment("50");
      next.direction = "Sent";
      next.invoiceReference = "on account";
      const direction = await send("Customer ne 50 send kiye");
      assert.match(direction.text, /Business ko paisay mile/);
      const preview = await send("", button(direction, "Received"));
      assert.match(preview.text, /Received: PKR 50.00/);
      await send("/cancel");
    },
  );
  await t.test(
    "new balance query interrupts missing-party collection without treating a sentence as a name",
    async () => {
      await rates();
      await send("/cancel");
      payment("50");
      next.partyName = null;
      assert.match((await send("Record payment 50")).text, /Party ka naam/);
      next = {
        ...blankExtraction(),
        intent: "GET_PARTY_BALANCE",
        partyName: "Bot Customer",
      };
      const out = await send("Bot Customer ka balance kya hai?");
      assert.doesNotMatch(out.text, /party nahi mila/);
      assert.match(out.text, /PKR/);
      await send("/cancel");
    },
  );
  await t.test(
    "sale field recovery persists across engine restart, qualified rate and due date correction",
    async () => {
      await rates();
      await send("/cancel");
      next = {
        ...blankExtraction(),
        intent: "RECORD_SALE",
        partyName: "Bot Customer",
        description: "Dates",
        quantity: 1000,
        unit: "kg",
        rateText: "350/wrongunit",
        taxText: "0",
        discountText: "0",
        initialPaidText: "0",
        method: "Cash",
        dateText: "2026-11-28",
        dueDateText: "2026-11-20",
      };
      assert.match((await send("Create invoice")).text, /Rate valid nahi/);
      assert.match((await send("350/kg")).text, /2026-11-28 se pehle/);
      const preview = await send("2026-12-28");
      assert.match(preview.text, /Total: PKR 350,000.00/);
      assert.ok(preview.buttons?.some((b) => b.text === "Confirm"));
      await send("/cancel");
    },
  );
  await t.test(
    "unlink removes messaging access and pending actions, keeps financial ledger and audit",
    async () => {
      await rates();
      const before = await count();
      assert.match((await send("/unlink")).text, /unlinked/);
      assert.match((await send("balance")).text, /one-time link/);
      assert.equal(await count(), before);
      assert.ok(
        Number(
          (
            await pool.query(
              "select count(*) from bot_audit where business_id='business-1'",
            )
          ).rows[0].count,
        ) > 0,
      );
      assert.equal(
        (
          await pool.query(
            "select count(*) from bot_identities where external_user_id='101'",
          )
        ).rows[0].count,
        "0",
      );
    },
  );
}
