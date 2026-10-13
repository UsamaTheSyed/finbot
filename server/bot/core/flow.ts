import { validateWriteFields, recoverPreparation } from "./recovery.js";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { Conversation, Identity, OutgoingMessage } from "../types.js";
import { methods } from "../types.js";
import { searchInvoice, searchParty, readTool } from "../tools/read.js";
import { prepareWrite } from "../tools/write.js";
import { requireScopedRecord } from "../../services/ledger.js";

export const help =
  "FinBot: party balance/statement, invoices, daily summary, receivables/payables, monthly cash flow, record payment aur single-item sale. Har financial write pe confirmation zaroori hai. /unlink disconnect karta hai. AI ko bheje gaye text mein passwords ya secrets na likhein.";
const prompts = {
  partyName: "Party ka naam?",
  amountText: "Kitni amount? Misal: 15k",
  dateText: "Transaction date? YYYY-MM-DD ya aaj likhein.",
  method: "Payment method choose karein.",
  direction:
    "Business ko paisay mile (Received), ya business ne diye (Sent)? Direction confirm karein.",
  description: "Sale item/description?",
  quantity: "Quantity?",
  unit: "Unit? (Bag, Piece, etc.)",
  rateText: "Unit rate PKR?",
  taxText: "Tax percent? Zero ho to 0 likhein.",
  discountText: "Discount PKR? Zero ho to 0 likhein.",
  dueDateText: "Invoice due date YYYY-MM-DD?",
  initialPaidText: "Abhi kitna paid hai? Unpaid ho to 0 likhein.",
  choice: "Choose an option.",
} as const;
function choices(
  state: Conversation,
  values: {
    field: "partyId" | "invoiceId" | "method" | "direction";
    value: string;
    label: string;
  }[],
  text: string,
): OutgoingMessage {
  state.awaiting = "choice";
  state.choices = values.map((v) => ({ ...v, key: randomUUID() }));
  return {
    text,
    buttons: state.choices.map((v) => ({
      text: v.label,
      data: `choose:${v.key}`,
    })),
  };
}
function ask(
  state: Conversation,
  field: keyof typeof prompts,
): OutgoingMessage {
  state.awaiting = field;
  if (field === "method")
    return choices(
      state,
      methods.map((v) => ({ field: "method", value: v, label: v })),
      prompts.method,
    );
  if (field === "direction")
    return choices(
      state,
      ["Received", "Sent"].map((v) => ({
        field: "direction",
        value: v,
        label: v,
      })),
      prompts.direction,
    );
  return { text: prompts[field] };
}
export async function advance(
  client: PoolClient,
  identity: Identity,
  state: Conversation,
  now: Date,
  expiryMinutes: number,
): Promise<OutgoingMessage> {
  const e = state.extraction;
  if (e.dateText?.trim().toLowerCase() === "kal") {
    state.awaiting = "dateText";
    return {
      text: "Kal se murad yesterday ya tomorrow? Absolute YYYY-MM-DD date dein.",
    };
  }
  if (
    e.intent === "GET_CASH_FLOW" &&
    e.dateText &&
    !/^\d{4}-(0[1-9]|1[0-2])$/.test(e.dateText) &&
    !["this month", "is mahine"].includes(e.dateText.toLowerCase())
  ) {
    state.awaiting = "dateText";
    return { text: "Cash flow ke liye reporting month YYYY-MM dein." };
  }
  if (e.intent === "GREETING" || e.intent === "HELP") return { text: help };
  if (e.intent === "RECORD_PURCHASE")
    return {
      text: "Purchase creation existing backend mein supported nahi hai. Bot purchase save nahi karega. Existing supplier payments aur payable queries available hain.",
    };
  const write = e.intent === "RECORD_PAYMENT" || e.intent === "RECORD_SALE";
  const needsParty =
    write ||
    ["SEARCH_PARTY", "GET_PARTY_BALANCE", "GET_PARTY_STATEMENT"].includes(
      e.intent,
    ) ||
    Boolean(e.partyName);
  if (needsParty && !state.partyId) {
    if (!e.partyName) {
      if (state.usePartyContext && state.contextPartyId) {
        const previous = await client.query(
          "select id,name,kind from parties where id=$1 and business_id=$2",
          [state.contextPartyId, identity.business_id],
        );
        if (previous.rows[0])
          return choices(
            state,
            [
              {
                field: "partyId",
                value: previous.rows[0].id,
                label: `${previous.rows[0].name} (${previous.rows[0].kind})`,
              },
              {
                field: "partyId",
                value: "__other_party__",
                label: "Different party",
              },
            ],
            "Kya aap isi party ki baat kar rahe hain? Confirm party; abhi koi financial change nahi hua.",
          );
        delete state.contextPartyId;
      }
      return ask(state, "partyName");
    }
    const label = /^(.*?)\s*\((Customer|Supplier)\)\s*$/i.exec(e.partyName);
    const found = await searchParty(
      client,
      identity.business_id,
      label?.[1] ?? e.partyName,
    );
    const matches = label
      ? found.filter((p) => p.kind.toLowerCase() === label[2].toLowerCase())
      : found;
    if (!matches.length) {
      state.awaiting = "partyName";
      return {
        text: "Is naam ka party nahi mila. Naam dobara dein ya FinBot mein party create karein.",
      };
    }
    if (matches.length > 10) {
      state.awaiting = "partyName";
      return { text: "Bohat se matches hain. Zyada specific party naam dein." };
    }
    if (matches.length > 1)
      return choices(
        state,
        matches.map((p) => ({
          field: "partyId",
          value: p.id,
          label: `${p.name} (${p.kind})`,
        })),
        "Kaunsa party?",
      );
    state.partyId = matches[0].id;
  }
  if (state.partyId) {
    const party = await requireScopedRecord(
      client,
      "parties",
      identity.business_id,
      state.partyId,
    );
    state.contextPartyId = state.partyId;
    delete state.usePartyContext;
    if (
      e.intent === "RECORD_PAYMENT" &&
      e.direction &&
      !state.directionConfirmed &&
      e.direction !== (party.kind === "Customer" ? "Received" : "Sent")
    )
      return ask(state, "direction");
  }
  if (write) {
    const required =
      e.intent === "RECORD_PAYMENT"
        ? (["amountText", "direction", "method", "dateText"] as const)
        : ([
            "description",
            "quantity",
            "unit",
            "rateText",
            "taxText",
            "discountText",
            "initialPaidText",
            "method",
            "dateText",
            "dueDateText",
          ] as const);
    for (const field of required)
      if (e[field] === null) return ask(state, field);
    const correction = validateWriteFields(state, identity.timezone, now);
    if (correction) return correction;
    if (e.intent === "RECORD_PAYMENT" && state.invoiceId === undefined) {
      if (e.invoiceReference?.toLowerCase() === "on account")
        state.invoiceId = "";
      else {
        const list = await searchInvoice(
          client,
          identity.business_id,
          state.partyId,
          e.invoiceReference ?? undefined,
          true,
        );
        if (e.invoiceReference && !list.length)
          return {
            text: "Is party ka matching outstanding invoice nahi mila. /cancel karke sahi invoice reference ke saath shuru karein, ya edit karke on account select karein.",
          };
        if (e.invoiceReference && list.length > 10)
          return {
            text: "10 se zyada invoices hain. Invoice number ke saath request dobara likhein.",
          };
        if (e.invoiceReference && list.length === 1)
          state.invoiceId = list[0].id;
        else
          return choices(
            state,
            [
              {
                field: "invoiceId",
                value: "__fifo__",
                label: "Oldest first + carry forward advance",
              },
              ...list.slice(0, 10).map((i) => ({
                field: "invoiceId" as const,
                value: i.id,
                label: `${i.displayId} · PKR ${(i.balanceMinor / 100).toFixed(2)}`,
              })),
              {
                field: "invoiceId",
                value: "",
                label: "On account (unallocated)",
              },
            ],
            "Invoice allocation choose karein. FIFO: purani invoices/bills pehle, baqi advance future issued invoices par. Ya specific invoice / on-account choose karein.",
          );
      }
    }
    let prepared;
    try {
      prepared = await prepareWrite(client, identity, state, now);
    } catch (error) {
      const correction = recoverPreparation(error, state);
      if (correction) return correction;
      throw error;
    }
    await client.query(
      "update bot_actions set status='cancelled' where identity_id=$1 and status='pending'",
      [identity.id],
    );
    const id = randomUUID();
    await client.query(
      "insert into bot_actions (id,identity_id,user_id,business_id,intent,payload,expires_at) values ($1,$2,$3,$4,$5,$6,now()+($7*interval '1 minute'))",
      [
        id,
        identity.id,
        identity.user_id,
        identity.business_id,
        e.intent,
        prepared.value,
        expiryMinutes,
      ],
    );
    state.pendingId = id;
    delete state.awaiting;
    delete state.choices;
    return {
      text:
        prepared.summary +
        `\nExpires in ${expiryMinutes} minutes. Nothing saved yet.`,
      buttons: [
        { text: "Confirm", data: `confirm:${id}` },
        { text: "Edit", data: `edit:${id}` },
        { text: "Cancel", data: `cancel:${id}` },
      ],
    };
  }
  if (e.intent === "GET_INVOICE" && !e.invoiceReference && !state.invoiceId)
    return { text: "Invoice number ke saath poochein, misal INV-000020." };
  delete state.awaiting;
  delete state.choices;
  return { text: await readTool(client, identity, state, now) };
}
