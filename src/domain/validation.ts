import { z } from "zod";
import { toMinor, scaled } from "../utils/money";
import { calculateInvoiceTotal } from "./invoiceCalculations";
export const paymentMethods = [
  "Cash",
  "Bank Transfer",
  "Easypaisa",
  "JazzCash",
  "Cheque",
] as const;
export const calendarDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date")
  .refine((v) => {
    const d = new Date(v);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
  }, "Choose a real calendar date");
const money = z
  .number()
  .finite()
  .min(0)
  .max(1_000_000_000)
  .refine((v) => {
    try {
      toMinor(v);
      return true;
    } catch {
      return false;
    }
  }, "Use at most two decimal places");
export const partySchema = z.object({
  kind: z.enum(["Customer", "Supplier"]),
  name: z.string().trim().min(1, "Name is required").max(120),
  phone: z.string().trim().max(30),
  email: z.union([
    z.string().trim().email("Enter a valid email"),
    z.literal(""),
  ]),
  ntn: z.string().trim().max(60),
  address: z.string().trim().max(500),
  paymentTerms: z.enum(["Due on receipt", "Net 15", "Net 30", "Net 60"]),
});
export const invoiceItemSchema = z.object({
  productId: z.string().max(160).optional(),
  item: z.string().trim().min(1, "Item is required"),
  description: z.string().trim().max(250),
  quantity: z
    .number()
    .finite()
    .positive()
    .max(1_000_000)
    .refine((v) => {
      try {
        scaled(v, 3);
        return true;
      } catch {
        return false;
      }
    }, "Use at most three decimal places"),
  unit: z.string().trim().min(1),
  rate: money,
  taxPercent: z
    .number()
    .finite()
    .min(0)
    .max(100)
    .refine((v) => {
      try {
        scaled(v, 2);
        return true;
      } catch {
        return false;
      }
    }, "Use at most two decimal places"),
});
export const invoiceSchema = z
  .object({
    partyId: z.string().min(1, "Choose a customer"),
    date: calendarDate,
    dueDate: calendarDate,
    reference: z.string().trim().max(100),
    items: z.array(invoiceItemSchema).min(1, "Add at least one item").max(100),
    discount: money,
    amountPaid: money,
    method: z.enum(paymentMethods),
    notes: z.string().max(1000),
    terms: z.string().max(1000),
    stockMode:z.enum(["Immediate","Deferred"]).optional(),
    warehouseId:z.string().max(160).optional(),
  })
  .superRefine((v, c) => {
    if (v.dueDate < v.date)
      c.addIssue({
        code: "custom",
        path: ["dueDate"],
        message: "Due date cannot precede invoice date",
      });
    try {
      const totals = calculateInvoiceTotal(
        v.items.map((l) => ({ ...l, rateMinor: toMinor(l.rate) })),
        toMinor(v.discount),
      );
      if (toMinor(v.amountPaid) > totals.totalMinor)
        c.addIssue({
          code: "custom",
          path: ["amountPaid"],
          message: "Payment cannot exceed invoice total",
        });
    } catch (e) {
      c.addIssue({
        code: "custom",
        path: ["discount"],
        message: (e as Error).message,
      });
    }
  });
export const recordPaymentSchema = z.object({
  direction: z.enum(["Received", "Sent"]),
  partyId: z.string().min(1, "Choose a party"),
  invoiceId: z.string(),
  amount: money.refine((v) => v > 0, "Amount must be greater than zero"),
  method: z.enum(paymentMethods),
  date: calendarDate,
  reference: z.string().trim().max(100),
  notes: z.string().max(1000),
});
export type PartyInput = z.infer<typeof partySchema>;
export type InvoiceInput = z.infer<typeof invoiceSchema>;
export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>;
