import { z } from "zod";

export const id = z.string().trim().min(1).max(160);
export const calendarDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return (
      !Number.isNaN(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === value
    );
  }, "Choose a real calendar date");
const money = z
  .number()
  .finite()
  .min(0)
  .max(1_000_000_000)
  .refine(
    (value) => Math.round(value * 100) / 100 === value,
    "Use at most two decimal places",
  );
export const partyInput = z.object({
  kind: z.enum(["Customer", "Supplier"]),
  name: z.string().trim().min(1).max(120),
  phone: z.string().trim().max(30),
  email: z.union([z.string().trim().email(), z.literal("")]),
  ntn: z.string().trim().max(60),
  address: z.string().trim().max(500),
  paymentTerms: z.enum(["Due on receipt", "Net 15", "Net 30", "Net 60"]),
});
export const invoiceItemInput = z.object({
  productId: z.string().max(160).optional(),
  item: z.string().trim().min(1).max(160),
  description: z.string().trim().max(250),
  quantity: z
    .number()
    .finite()
    .positive()
    .max(1_000_000)
    .refine(
      (value) => Math.round(value * 1000) / 1000 === value,
      "Use at most three decimal places",
    ),
  unit: z.string().trim().min(1).max(40),
  rate: money,
  taxPercent: z
    .number()
    .finite()
    .min(0)
    .max(100)
    .refine(
      (value) => Math.round(value * 100) / 100 === value,
      "Use at most two decimal places",
    ),
});
export const invoiceInput = z
  .object({
    partyId: id,
    date: calendarDate,
    dueDate: calendarDate,
    reference: z.string().trim().max(100),
    items: z.array(invoiceItemInput).min(1).max(100),
    discount: money,
    amountPaid: money,
    method: z.enum([
      "Cash",
      "Bank Transfer",
      "Easypaisa",
      "JazzCash",
      "Cheque",
    ]),
    notes: z.string().max(1000),
    terms: z.string().max(1000),
    draft: z.boolean().default(false),
  })
  .superRefine((value, context) => {
    if (value.dueDate < value.date)
      context.addIssue({
        code: "custom",
        path: ["dueDate"],
        message: "Due date cannot precede invoice date",
      });
    if (value.draft && value.amountPaid > 0)
      context.addIssue({
        code: "custom",
        path: ["amountPaid"],
        message: "A draft cannot record a payment",
      });
  });
export const paymentInput = z.object({
  allocationMode: z.enum(["manual", "fifo"]).optional(),
  direction: z.enum(["Received", "Sent"]),
  partyId: id,
  invoiceId: z.string().max(160),
  amount: money.refine(
    (value) => value > 0,
    "Amount must be greater than zero",
  ),
  method: z.enum(["Cash", "Bank Transfer", "Easypaisa", "JazzCash", "Cheque"]),
  date: calendarDate,
  reference: z.string().trim().max(100),
  notes: z.string().max(1000),
});
export const transactionEditInput = z.object({
  date: calendarDate,
  notes: z.string().max(1000),
});
export const transactionPaymentInput = z.object({
  amount: money.refine((value) => value > 0),
  method: z.enum(["Cash", "Bank Transfer", "Easypaisa", "JazzCash", "Cheque"]),
  date: calendarDate,
});
export const profileInput = z.object({
  name: z.string().trim().min(1).max(100),
  owner: z.string().trim().min(1).max(100),
  phone: z
    .string()
    .trim()
    .regex(/^(?:\+92|0)[\d -]{9,14}$/),
  email: z.string().trim().email().max(200),
  address: z.string().trim().min(1).max(300),
  ntn: z.string().trim().max(30),
  currency: z.literal("PKR"),
  logo: z
    .string()
    .max(7_500_000)
    .refine(
      (value) =>
        !value || /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(value),
    ),
});
export const teamInviteInput = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(200),
  role: z.enum(["Admin", "Accountant", "Staff"]),
  permissions: z.array(z.string().max(80)).max(50),
});

export type InvoiceInput = z.infer<typeof invoiceInput>;
export type PaymentInput = z.infer<typeof paymentInput>;
