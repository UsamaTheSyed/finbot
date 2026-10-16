import assert from "node:assert/strict";
import type { TestContext } from "node:test";
import type { Pool } from "pg";
import {
  blankExtraction,
  type Extraction,
  type OutgoingMessage,
} from "../../server/bot/types";
import { invoiceDto } from "../../server/services/ledger";
import { executePayment } from "../../server/services/payments";

export async function botItemEditIntegration(
  t: TestContext,
  pool: Pool,
  send: (text: string, callback?: string) => Promise<OutgoingMessage>,
  setNext: (next: Extraction) => void,
) {
  const button = (out: OutgoingMessage, label: string) => {
    const found = out.buttons?.find((b) => b.text === label);
    assert.ok(found, out.text);
    return found.data;
  };
  for (const kind of ["Customer", "Supplier"] as const)
    await t.test(
      `specific item ${kind}: restart recovery, selection, old confirmation and exact settlement`,
      async () => {
        await pool.query("delete from bot_rate_limits");
        await send("/cancel");
        const partyId = `bot-edit-${kind}`,
          name = `Item Edit ${kind}`;
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
              amount: 500,
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
        const intent = kind === "Supplier" ? "RECORD_PURCHASE" : "RECORD_SALE";
        const draft: Extraction = {
          ...blankExtraction(),
          intent,
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
              rateText: "500",
              taxText: "0",
            },
          ],
          discountText: "100",
          initialPaidText: kind === "Supplier" ? "0" : "100",
          method: kind === "Supplier" ? null : "Cash",
          amountText: "2500",
          dateText: "2026-11-28",
          dueDateText: "2026-12-28",
        };
        setNext(draft);
        let out = await send("multi invoice");
        const original = button(out, "Confirm");
        await send("", button(out, "Edit"));
        setNext({
          ...blankExtraction(),
          intent: "EDIT_PENDING_ACTION",
          itemEdit: {
            itemNumber: 2,
            itemName: null,
            changes: {
              description: null,
              quantity: 0,
              unit: null,
              rateText: null,
              taxText: null,
            },
          },
        });
        assert.match(
          (await send("item 2 quantity 0")).text,
          /Item 2.*quantity/,
        );
        // The enclosing harness creates a new BotEngine per send: persisted field cursor is required.
        out = await send("2");
        assert.match(out.text, /Total: PKR 3,000.00/);
        assert.match((await send("", original)).text, /already cancelled/);
        const intermediate = button(out, "Confirm");
        await send("", button(out, "Edit"));
        setNext({
          ...blankExtraction(),
          intent,
          itemEdit: {
            itemNumber: null,
            itemName: null,
            changes: {
              description: null,
              quantity: null,
              unit: null,
              rateText: "600",
              taxText: null,
            },
          },
        });
        assert.match((await send("rate 600 karo")).text, /Kaunsa item/);
        assert.match((await send("99")).text, /Kaunsa item/);
        out = await send("2");
        assert.match(out.text, /Total: PKR 3,200.00/);
        assert.match(out.text, /1\. Rice: 2 Bag/);
        assert.match(out.text, /2\. Oil: 2 Carton/);
        assert.match((await send("", intermediate)).text, /already cancelled/);
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
        const records = (
          await pool.query("select id from invoices where party_id=$1", [
            partyId,
          ])
        ).rows;
        assert.equal(records.length, 1);
        const invoice = await invoiceDto(pool, "business-1", records[0].id);
        assert.equal(invoice.totalMinor, 320000);
        assert.equal(invoice.items.length, 2);
        assert.equal(invoice.items[0].rateMinor, 100000);
        assert.equal(invoice.items[1].rateMinor, 60000);
        assert.equal(invoice.items[1].quantity, 2);
        assert.equal(invoice.paidMinor, kind === "Supplier" ? 50000 : 10000);
        assert.equal(
          invoice.balanceMinor,
          kind === "Supplier" ? 270000 : 310000,
        );
        const history = (
          await pool.query(
            "select amount_minor,direction from payments where party_id=$1",
            [partyId],
          )
        ).rows;
        assert.equal(history.length, 1);
        assert.equal(
          Number(history[0].amount_minor),
          kind === "Supplier" ? 50000 : 10000,
        );
        assert.equal(
          history[0].direction,
          kind === "Supplier" ? "Sent" : "Received",
        );
        setNext(draft);
        out = await send("another invoice");
        await send("", button(out, "Edit"));
        setNext({
          ...blankExtraction(),
          intent,
          itemEdit: {
            itemNumber: null,
            itemName: null,
            changes: {
              description: null,
              quantity: null,
              unit: null,
              rateText: "700",
              taxText: null,
            },
          },
        });
        assert.match((await send("rate 700")).text, /Kaunsa item/);
        await send("/cancel");
        assert.equal(
          (
            await pool.query(
              "select count(*)::int n from invoices where party_id=$1",
              [partyId],
            )
          ).rows[0].n,
          1,
        );
        // Fresh item-edit request is rejected after cancellation, not applied to stale context.
        assert.match((await send("item edit")).text, /Edit button/);
      },
    );
}
