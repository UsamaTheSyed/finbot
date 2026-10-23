import { randomUUID } from "node:crypto";
import type { DatabasePool } from "../db/client.js";
import {
  creditNoteInput,
  creditRefundInput,
  applyCreditInput,
} from "../domain/creditNoteInput.js";
import {
  planCreditNote,
  planCreditApplication,
  planRefund,
  type CreditDocument,
} from "../../src/domain/creditNotes.js";
import { invoiceDto, requireScopedRecord } from "./ledger.js";
import { creditContext } from "./creditContext.js";
import { ApiError } from "../lib/errors.js";
import { sumMinor } from "../../src/utils/money.js";
export type CreditAction = "note" | "application" | "refund";
export async function postCredit(
  pool: DatabasePool,
  businessId: string,
  userId: string,
  kind: CreditAction,
  raw: unknown,
) {
  const input =
    kind === "note"
      ? creditNoteInput.parse(raw)
      : kind === "refund"
        ? creditRefundInput.parse(raw)
        : applyCreditInput.parse(raw);
  const client = await pool.connect();
  try {
    await client.query("begin");
    const invoiceId = "invoiceId" in input ? input.invoiceId : undefined;
    const first = invoiceId
      ? await requireScopedRecord(client, "invoices", businessId, invoiceId)
      : undefined;
    const partyId = first
      ? String(first.party_id)
      : "partyId" in input
        ? input.partyId
        : "";
    await requireScopedRecord(client, "parties", businessId, partyId, true);
    const key = `${businessId}:${input.requestId}`;
    const previous = await client.query(
      "select * from credit_operations where id=$1",
      [key],
    );
    if (previous.rows[0]) {
      const row = previous.rows[0];
      if (
        row.kind !== kind ||
        row.party_id !== partyId ||
        JSON.stringify(row.payload) !==
          JSON.stringify(JSON.parse(JSON.stringify(input)))
      ) {
        // jsonb key order is not guaranteed: compare canonical entries instead.
        const canonical = (value: unknown): string =>
          JSON.stringify(value, Object.keys(value as object).sort());
        if (
          row.kind !== kind ||
          row.party_id !== partyId ||
          canonical(row.payload) !== canonical(input)
        )
          throw new ApiError(
            409,
            "REQUEST_REUSED",
            "This request ID was already used for different values.",
          );
      }
      await client.query("commit");
      return row.response;
    }
    if (invoiceId)
      await requireScopedRecord(
        client,
        "invoices",
        businessId,
        invoiceId,
        true,
      );
    const context = await creditContext(client, businessId, partyId);
    const scope = { businessId, partyId, kind: context.kind };
    const invoice = invoiceId
      ? await invoiceDto(client, businessId, invoiceId)
      : undefined;
    if (invoice && invoice.partyId !== partyId)
      throw new ApiError(
        409,
        "DOCUMENT_CHANGED",
        "Document changed. Reopen the form.",
      );
    if (invoice && "revision" in input && invoice.revision !== input.revision)
      throw new ApiError(
        409,
        "DOCUMENT_CHANGED",
        "Document changed. Reopen the form.",
      );
    if (invoice?.transactionId) {
      await requireScopedRecord(
        client,
        "transactions",
        businessId,
        invoice.transactionId,
        true,
      );
      const future = await client.query(
        `select 1 from ledger_movements where business_id=$1 and transaction_id=$2 and date>$3 union all select 1 from ledger_settlements where business_id=$1 and transaction_id=$2 and effective_date>$3 limit 1`,
        [businessId, invoice.transactionId, input.effectiveDate],
      );
      if (future.rowCount)
        throw new ApiError(
          409,
          "FUTURE_ACTIVITY",
          "Document has activity after this date.",
        );
    }
    const doc: CreditDocument | undefined = invoice
      ? {
          id: invoice.id,
          ...scope,
          status: invoice.status === "Draft" ? "Draft" : "Issued",
          revision: invoice.revision,
          date: invoice.date,
          grossMinor: invoice.totalMinor,
          creditedMinor: invoice.creditedMinor ?? 0,
          allocatedMinor: invoice.paidMinor,
        }
      : undefined;
    let response: Record<string, unknown>;
    if (kind === "note") {
      const data = creditNoteInput.parse(input);
      const plan = planCreditNote(doc!, data, context.today);
      const prior = context.notes.filter((n) => n.invoiceId === invoiceId);
      for (const field of [
        "subtotalMinor",
        "taxMinor",
        "discountMinor",
      ] as const) {
        if (
          data[field] >
          invoice![field] - sumMinor(prior.map((n) => n[field]))
        )
          throw new ApiError(
            400,
            "CREDIT_COMPONENT_EXCEEDED",
            "Credit subtotal, tax or discount exceeds the remaining document component.",
          );
      }
      if (
        data.discountMinor > data.subtotalMinor ||
        sumMinor([data.subtotalMinor, data.taxMinor, -data.discountMinor]) !==
          data.amountMinor
      )
        throw new ApiError(
          400,
          "CREDIT_TOTAL_INVALID",
          "Credit total must equal subtotal plus tax minus discount.",
        );
      const id = `CN-${randomUUID()}`;
      await client.query(
        `insert into credit_notes(id,business_id,party_id,invoice_id,transaction_id,user_id,date,reason,subtotal_minor,tax_minor,discount_minor,total_minor,funded_minor,"before") values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb)`,
        [
          id,
          businessId,
          partyId,
          invoiceId,
          invoice!.transactionId,
          userId,
          data.effectiveDate,
          data.reason,
          data.subtotalMinor,
          data.taxMinor,
          data.discountMinor,
          data.amountMinor,
          plan.fundedCreditMinor,
          JSON.stringify(invoice),
        ],
      );
      response = { id, ...plan };
    } else {
      const plan =
        kind === "refund"
          ? planRefund(
              scope,
              context.lots,
              input.amountMinor,
              input.effectiveDate,
              context.today,
            )
          : planCreditApplication(
              scope,
              context.lots,
              doc!,
              input.amountMinor,
              input.effectiveDate,
              context.today,
            );
      let paymentId: string | undefined;
      if (kind === "refund") {
        const data = creditRefundInput.parse(input);
        paymentId = `PAY-${randomUUID()}`;
        await client.query(
          `insert into payments(id,display_id,business_id,party_id,direction,amount_minor,method,date,reference,notes,status,allocation_mode) values($1,$1,$2,$3,$4,$5,$6,$7,$8,$9,'Completed','manual')`,
          [
            paymentId,
            businessId,
            partyId,
            context.kind === "Customer" ? "Sent" : "Received",
            data.amountMinor,
            data.method,
            data.effectiveDate,
            data.reference,
            `Refund: ${data.reason}`,
          ],
        );
      }
      for (const allocation of plan.allocations)
        await client.query(
          `insert into credit_uses(id,credit_id,business_id,transaction_id,payment_id,user_id,kind,amount_minor,date,reason) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [
            `CU-${randomUUID()}`,
            allocation.creditId,
            businessId,
            kind === "application" ? invoice!.transactionId : null,
            paymentId || null,
            userId,
            kind,
            allocation.amountMinor,
            input.effectiveDate,
            input.reason,
          ],
        );
      response = { ...plan, paymentId };
    }
    if (invoice) {
      await client.query(
        "update invoices set updated_at=now() where business_id=$1 and id=$2",
        [businessId, invoice.id],
      );
      await client.query(
        "update transactions set updated_at=now() where business_id=$1 and id=$2",
        [businessId, invoice.transactionId],
      );
    }
    await client.query(
      "insert into credit_operations(id,business_id,party_id,kind,payload,response) values($1,$2,$3,$4,$5::jsonb,$6::jsonb)",
      [
        key,
        businessId,
        partyId,
        kind,
        JSON.stringify(input),
        JSON.stringify(response),
      ],
    );
    await client.query("commit");
    return response;
  } catch (error) {
    await client.query("rollback");
    if (error instanceof ApiError) throw error;
    if (error instanceof Error && "code" in error) throw error;
    throw new ApiError(
      400,
      "CREDIT_INVALID",
      error instanceof Error ? error.message : "Invalid credit operation.",
    );
  } finally {
    client.release();
  }
}
