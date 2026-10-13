import { previewAllocation } from "../../services/allocations.js";
import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { invoiceInput, paymentInput } from "../../domain/validation.js";
import { calculateInvoice } from "../../domain/money.js";
import { executePayment, validatePayment } from "../../services/payments.js";
import { insertInvoiceGraph } from "../../services/invoices.js";
import { allocateInvoiceNumber } from "../../services/invoiceNumber.js";
import { invoiceDto, requireScopedRecord } from "../../services/ledger.js";
import { ApiError } from "../../lib/errors.js";
import { amountPaisa, mutationDate, pkr } from "../core/normalize.js";
import {
  proposal,
  type Conversation,
  type Identity,
  type Proposal,
} from "../types.js";

export async function prepareWrite(
  client: PoolClient,
  identity: Identity,
  state: Conversation,
  now: Date,
) {
  const e = state.extraction;
  const party = await requireScopedRecord(
    client,
    "parties",
    identity.business_id,
    state.partyId!,
    true,
  );
  const date = mutationDate(e.dateText!, identity.timezone, now);
  let value: Proposal, summary: string;
  if (e.intent === "RECORD_PAYMENT") {
    const input = paymentInput.parse({
      partyId: state.partyId,
      invoiceId: state.invoiceId === "__fifo__" ? "" : (state.invoiceId ?? ""),
      allocationMode: state.invoiceId === "__fifo__" ? "fifo" : "manual",
      amount: amountPaisa(e.amountText!) / 100,
      method: e.method,
      direction: e.direction,
      date,
      reference: "",
      notes: "Recorded through FinBot bot",
    });
    await validatePayment(client, identity.business_id, input);
    const invoice = input.invoiceId
      ? await invoiceDto(client, identity.business_id, input.invoiceId)
      : null;
    value = { kind: "payment", input };
    if (input.allocationMode === "fifo") {
      const plan = await previewAllocation(
        client,
        identity.business_id,
        input.partyId,
        input.direction,
        amountPaisa(e.amountText!),
      );
      value.allocationFingerprint = createHash("sha256")
        .update(JSON.stringify(plan))
        .digest("hex");
      summary = `Record Payment?\nParty: ${party.name}\n${input.direction}: ${pkr(amountPaisa(e.amountText!))}\nMethod: ${input.method}\nDate: ${date}\nOldest first:\n${plan.allocations.map((a) => `${a.displayId} (${a.date}): ${pkr(a.amountMinor)}`).join("\n") || "No outstanding invoices/bills."}\nAdvance: ${pkr(plan.advanceMinor)} — automatically applies to future issued invoices/bills. Original cash date is preserved.`;
      if (summary.length > 3000)
        throw new ApiError(
          400,
          "ALLOCATION_PREVIEW_TOO_LONG",
          "Too many allocations for one Telegram confirmation. Record this payment through the API with a reviewed breakdown.",
        );
      return { value: proposal.parse(value), summary };
    }

    summary = `Record Payment?\nParty: ${party.name}\n${input.direction}: ${pkr(amountPaisa(e.amountText!))}\nMethod: ${input.method}\nDate: ${date}\nInvoice: ${invoice?.displayId ?? "On account (unallocated)"}`;
  } else {
    const tax = Number(e.taxText?.replace(/%$/, ""));
    const input = invoiceInput.parse({
      partyId: state.partyId,
      date,
      dueDate: mutationDate(e.dueDateText!, identity.timezone, now),
      reference: "",
      items: [
        {
          item: e.description,
          description: e.description,
          quantity: e.quantity,
          unit: e.unit,
          rate: amountPaisa(e.rateText!) / 100,
          taxPercent: tax,
        },
      ],
      discount: amountPaisa(e.discountText!) / 100,
      amountPaid: amountPaisa(e.initialPaidText!) / 100,
      method: e.method,
      notes: "Recorded through FinBot bot",
      terms: "",
      draft: false,
    });
    if (party.kind !== "Customer")
      throw new ApiError(
        400,
        "CUSTOMER_REQUIRED",
        "Sale ke liye Customer choose karein.",
      );
    const totals = calculateInvoice(input);
    if (e.amountText && amountPaisa(e.amountText) !== totals.totalMinor)
      throw new ApiError(
        400,
        "TOTAL_MISMATCH",
        `Items ka total ${pkr(totals.totalMinor)} hai. Requested total se match nahi karta; rate/quantity/tax/discount edit karein.`,
      );
    value = { kind: "sale", input };
    summary = `Create sales invoice?\nParty: ${party.name}\n${input.items[0].item}: ${input.items[0].quantity} ${input.items[0].unit} × ${pkr(amountPaisa(e.rateText!))}\nTax: ${tax}% · Discount: ${pkr(totals.discountMinor)}\nTotal: ${pkr(totals.totalMinor)}\nPaid: ${pkr(totals.paidMinor)} (${input.method})\nDate: ${date}\nDue: ${input.dueDate}`;
  }
  return { value: proposal.parse(value), summary };
}
// Called ONLY by the confirmed-action transaction; no independent bot ledger.
export async function executeWrite(
  client: PoolClient,
  identity: Identity,
  raw: unknown,
) {
  const p = proposal.parse(raw);
  if (p.kind === "payment") {
    if (p.input.allocationMode === "fifo") {
      const plan = await previewAllocation(
        client,
        identity.business_id,
        p.input.partyId,
        p.input.direction,
        Math.round(p.input.amount * 100),
      );
      const fingerprint = createHash("sha256")
        .update(JSON.stringify(plan))
        .digest("hex");
      if (fingerprint !== p.allocationFingerprint)
        throw new ApiError(
          409,
          "ALLOCATION_CHANGED",
          "Balances changed since preview. Review a new confirmation.",
        );
    }
    const result = await executePayment(client, identity.business_id, p.input);
    if (p.input.allocationMode === "fifo")
      return {
        id: result.id,
        text: `Payment recorded: ${result.id}\n${pkr(result.amountMinor)} ${result.direction}\n${result.allocations.map((a) => `${a.displayId}: ${pkr(a.amountMinor)}`).join("\n")}\nAdvance remaining: ${pkr(result.advanceMinor)}`,
      };
    const invoice = result.invoiceId
      ? await invoiceDto(client, identity.business_id, result.invoiceId)
      : null;
    return {
      id: result.id,
      text: `Payment recorded: ${result.id}\n${pkr(result.amountMinor)} ${result.direction}\n${invoice ? `${invoice.displayId} remaining: ${pkr(invoice.balanceMinor)}` : "On-account payment saved. Party ledger updated."}`,
    };
  }
  const id = `INV-${randomUUID()}`,
    number = await allocateInvoiceNumber(client, identity.business_id);
  await insertInvoiceGraph(
    client,
    identity.business_id,
    identity.user_id,
    id,
    p.input,
    number,
  );
  const invoice = await invoiceDto(client, identity.business_id, id);
  return {
    id,
    text: `Sale saved: ${invoice.displayId}\nTotal: ${pkr(invoice.totalMinor)}\nBalance: ${pkr(invoice.balanceMinor)}\nStatus: ${invoice.status}`,
  };
}
