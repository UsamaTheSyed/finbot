import { validateProducts,  } from "./inventory.js";
import type { DatabasePool } from "../db/client.js";
import { invoiceInput, type InvoiceInput } from "../domain/validation.js";
import { calculateInvoice } from "../domain/money.js";
import { ApiError } from "../lib/errors.js";
import { requireScopedRecord } from "./ledger.js";

// Parties are locked before invoices, as in payment allocation and issuance.
// xmin is an opaque revision token; it changes on each committed row update.
export async function editDraft(
  pool: DatabasePool,
  businessId: string,
  invoiceId: string,
  value: InvoiceInput,
  revision?: string,
) {
  const input = invoiceInput.parse(value);
  if (!input.draft || input.amountPaid !== 0)
    throw new ApiError(
      400,
      "DRAFT_ONLY",
      "Save a draft without a payment. Issue it separately.",
    );
  let totals: ReturnType<typeof calculateInvoice>;
  try {
    totals = calculateInvoice(input);
  } catch (error) {
    throw new ApiError(
      400,
      "INVALID_TOTAL",
      error instanceof Error ? error.message : "Invalid invoice total.",
    );
  }
  const client = await pool.connect();
  try {
    await client.query("begin");
    const original = await requireScopedRecord(
      client,
      "invoices",
      businessId,
      invoiceId,
    );
    const parties = new Map<string, Record<string, unknown>>();
    for (const partyId of [
      ...new Set([String(original.party_id), input.partyId]),
    ].sort()) {
      parties.set(
        partyId,
        await requireScopedRecord(client, "parties", businessId, partyId, true),
      );
    }
    const result = await client.query(
      "select *, xmin::text as revision from invoices where id=$1 and business_id=$2 for update",
      [invoiceId, businessId],
    );
    const current = result.rows[0];
    if (!current)
      throw new ApiError(404, "INVOICE_NOT_FOUND", "Invoice not found.");
    if (current.status !== "Draft" || current.transaction_id)
      throw new ApiError(
        409,
        "INVOICE_NOT_DRAFT",
        "Only drafts can be edited. This document has already been issued.",
      );
    if (
      current.party_id !== original.party_id ||
      (revision !== undefined && current.revision !== revision)
    )
      throw new ApiError(
        409,
        "DRAFT_CHANGED",
        "This draft changed in another session. Return to its details and reopen Edit Draft before saving.",
      );
    if (
      parties.get(String(original.party_id))?.kind !==
      parties.get(input.partyId)?.kind
    )
      throw new ApiError(
        400,
        "PARTY_KIND_MISMATCH",
        "Keep the same document type: choose a party of the same kind.",
      );
    await validateProducts(client, businessId, input.items);
    await client.query(
      `update invoices set party_id=$3,date=$4,due_date=$5,reference=$6,
       subtotal_minor=$7,tax_minor=$8,discount_minor=$9,total_minor=$10,
       notes=$11,terms=$12,updated_at=now() where id=$1 and business_id=$2`,
      [
        invoiceId,
        businessId,
        input.partyId,
        input.date,
        input.dueDate,
        input.reference,
        totals.subtotalMinor,
        totals.taxMinor,
        totals.discountMinor,
        totals.totalMinor,
        input.notes,
        input.terms,
      ],
    );
    await client.query("delete from invoice_items where invoice_id=$1", [
      invoiceId,
    ]);
    for (const [position, item] of totals.items.entries()) {
      await client.query(
        `insert into invoice_items (id,invoice_id,position,item,description,quantity_milli,unit,rate_minor,tax_basis_points,product_id)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          `${invoiceId}-line-${position + 1}`,
          invoiceId,
          position,
          item.item,
          item.description,
          item.quantityMilli,
          item.unit,
          item.rateMinor,
          item.taxBasisPoints,
          item.productId || null,
        ],
      );
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
