import { validateProducts, postInvoiceStock } from "./inventory.js";
import { applyAdvance } from "./allocations.js";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { InvoiceInput } from "../domain/validation.js";
import { calculateInvoice } from "../domain/money.js";
import { requireScopedRecord } from "./ledger.js";
export async function insertInvoiceGraph(
  client: PoolClient,
  businessId: string,
  userId: string,
  invoiceId: string,
  input: InvoiceInput,
  displayId: string,
) {
  const party = await requireScopedRecord(
    client,
    "parties",
    businessId,
    input.partyId,
    true,
  );
  const direction = party.kind === "Supplier" ? "Sent" : "Received";
  const type = party.kind === "Supplier" ? "Purchase" : "Sale";
  await validateProducts(client, businessId, input.items);
  const totals = calculateInvoice(input);
  const transactionId = input.draft
    ? null
    : `${type === "Sale" ? "SALE" : "PURCHASE"}-${randomUUID()}`;
  const storedStatus = input.draft
    ? "Draft"
    : totals.paidMinor === totals.totalMinor
      ? "Paid"
      : totals.paidMinor > 0
        ? "Partial"
        : "Sent";
  await client.query(
    `insert into invoices
     (id,display_id,business_id,transaction_id,party_id,date,due_date,reference,subtotal_minor,tax_minor,discount_minor,total_minor,status,notes,terms)
     values ($1,$15,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
    [
      invoiceId,
      businessId,
      null,
      input.partyId,
      input.date,
      input.dueDate,
      input.reference,
      totals.subtotalMinor,
      totals.taxMinor,
      totals.discountMinor,
      totals.totalMinor,
      storedStatus,
      input.notes,
      input.terms,
      displayId,
    ],
  );
  for (const [position, item] of totals.items.entries()) {
    const itemId = `${invoiceId}-line-${position + 1}`;
    await client.query(
      `insert into invoice_items (id,invoice_id,position,item,description,quantity_milli,unit,rate_minor,tax_basis_points,product_id)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        itemId,
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
  if (transactionId) {
    const uniformTax = totals.items.every(
      (item) => item.taxBasisPoints === totals.items[0]?.taxBasisPoints,
    )
      ? (totals.items[0]?.taxBasisPoints ?? 0)
      : null;
    await client.query(
      `insert into transactions
       (id,display_id,business_id,party_id,created_by,date,due_date,type,status,subtotal_minor,discount_minor,tax_minor,tax_rate_basis_points,total_minor,notes)
       values ($1,$1,$2,$3,$4,$5,$6,$14,$7,$8,$9,$10,$11,$12,$13)`,
      [
        transactionId,
        businessId,
        input.partyId,
        userId,
        input.date,
        input.dueDate,
        totals.paidMinor === totals.totalMinor
          ? "Completed"
          : totals.paidMinor > 0
            ? "Partial"
            : "Unpaid",
        totals.subtotalMinor,
        totals.discountMinor,
        totals.taxMinor,
        uniformTax,
        totals.totalMinor,
        input.notes,
        type,
      ],
    );
    await client.query(
      `update invoices
      set transaction_id = $1, updated_at = now()
      where id = $2 and business_id = $3`,
      [transactionId, invoiceId, businessId],
    );
    for (const [position, item] of totals.items.entries())
      await client.query(
        `insert into transaction_items (id,transaction_id,position,description,quantity_milli,unit,rate_minor)
         values ($1,$2,$3,$4,$5,$6,$7)`,
        [
          `${transactionId}-line-${position + 1}`,
          transactionId,
          position,
          item.description || item.item,
          item.quantityMilli,
          item.unit,
          item.rateMinor,
        ],
      );
    if (totals.paidMinor > 0) {
      const paymentId = `PAY-${randomUUID()}`;
      await client.query(
        `insert into payments
         (id,display_id,business_id,party_id,transaction_id,direction,amount_minor,method,date,reference,notes,status)
         values ($1,$1,$2,$3,$4,$9,$5,$6,$7,$8,'Initial invoice payment','Completed')`,
        [
          paymentId,
          businessId,
          input.partyId,
          transactionId,
          totals.paidMinor,
          input.method,
          input.date,
          input.reference,
          direction,
        ],
      );
      await client.query(
        "insert into payment_allocations (payment_id,invoice_id,amount_minor) values ($1,$2,$3)",
        [paymentId, invoiceId, totals.paidMinor],
      );
    }
    await postInvoiceStock(client, businessId, userId, invoiceId, input, party.kind === "Supplier");
    await applyAdvance(client, businessId, input.partyId, direction);
  }
}
