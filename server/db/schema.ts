import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const partyKind = pgEnum("party_kind", ["Customer", "Supplier"]);
export const membershipRole = pgEnum("membership_role", [
  "Owner",
  "Admin",
  "Accountant",
  "Staff",
]);
export const membershipStatus = pgEnum("membership_status", [
  "Active",
  "Invited",
  "Inactive",
]);
export const transactionType = pgEnum("transaction_type", ["Sale", "Purchase"]);
export const transactionStatus = pgEnum("transaction_status", [
  "Completed",
  "Partial",
  "Overdue",
  "Unpaid",
]);
export const invoiceStatus = pgEnum("invoice_status", [
  "Draft",
  "Sent",
  "Paid",
  "Partial",
  "Overdue",
]);
export const paymentDirection = pgEnum("payment_direction", ["Received", "Sent"]);
export const paymentStatus = pgEnum("payment_status", [
  "Completed",
  "Pending",
  "Failed",
]);
export const paymentMethod = pgEnum("payment_method", [
  "Cash",
  "Bank Transfer",
  "Easypaisa",
  "JazzCash",
  "Cheque",
]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    avatar: text("avatar"),
    passwordHash: text("password_hash").notNull(),
    ...timestamps,
  },
  (table) => [uniqueIndex("users_email_unique").on(sql`lower(${table.email})`)],
);

export const businesses = pgTable("businesses", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  currency: text("currency").notNull().default("PKR"),
  timezone: text("timezone").notNull().default("Asia/Karachi"),
  city: text("city").notNull().default("Karachi"),
  phone: text("phone").notNull().default(""),
  email: text("email").notNull().default(""),
  address: text("address").notNull().default(""),
  ntn: text("ntn").notNull().default(""),
  logo: text("logo").notNull().default(""),
  openingCashMinor: bigint("opening_cash_minor", { mode: "number" }).notNull().default(0),
  ...timestamps,
});

export const memberships = pgTable(
  "workspace_memberships",
  {
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    businessId: text("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
    role: membershipRole("role").notNull(),
    status: membershipStatus("status").notNull().default("Active"),
    permissions: jsonb("permissions").$type<string[]>().notNull().default([]),
    invitedEmail: text("invited_email"),
    lastActiveAt: timestamp("last_active_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.businessId] }),
    index("memberships_business_idx").on(table.businessId),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("sessions_user_idx").on(table.userId), index("sessions_expiry_idx").on(table.expiresAt)],
);

export const parties = pgTable(
  "parties",
  {
    id: text("id").primaryKey(),
    businessId: text("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    kind: partyKind("kind").notNull(),
    phone: text("phone").notNull().default(""),
    email: text("email").notNull().default(""),
    ntn: text("ntn").notNull().default(""),
    address: text("address").notNull().default(""),
    paymentTerms: text("payment_terms").notNull().default("Net 30"),
    ...timestamps,
  },
  (table) => [index("parties_workspace_name_idx").on(table.businessId, table.name)],
);

export const transactions = pgTable(
  "transactions",
  {
    id: text("id").primaryKey(),
    displayId: text("display_id").notNull(),
    businessId: text("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
    partyId: text("party_id").notNull().references(() => parties.id),
    createdBy: text("created_by").notNull().references(() => users.id),
    date: date("date").notNull(),
    dueDate: date("due_date").notNull(),
    type: transactionType("type").notNull(),
    status: transactionStatus("status").notNull(),
    subtotalMinor: bigint("subtotal_minor", { mode: "number" }).notNull(),
    discountMinor: bigint("discount_minor", { mode: "number" }).notNull().default(0),
    taxMinor: bigint("tax_minor", { mode: "number" }).notNull().default(0),
    taxRateBasisPoints: integer("tax_rate_basis_points"),
    totalMinor: bigint("total_minor", { mode: "number" }).notNull(),
    notes: text("notes").notNull().default(""),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("transactions_workspace_display_unique").on(table.businessId, table.displayId),
    index("transactions_workspace_date_idx").on(table.businessId, table.date),
    index("transactions_party_idx").on(table.partyId),
    check("transactions_money_nonnegative", sql`${table.subtotalMinor} >= 0 AND ${table.discountMinor} >= 0 AND ${table.taxMinor} >= 0 AND ${table.totalMinor} >= 0`),
  ],
);

export const transactionItems = pgTable(
  "transaction_items",
  {
    id: text("id").primaryKey(),
    transactionId: text("transaction_id").notNull().references(() => transactions.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    description: text("description").notNull(),
    quantityMilli: bigint("quantity_milli", { mode: "number" }).notNull(),
    unit: text("unit").notNull(),
    rateMinor: bigint("rate_minor", { mode: "number" }).notNull(),
  },
  (table) => [
    uniqueIndex("transaction_items_position_unique").on(table.transactionId, table.position),
    check("transaction_items_positive", sql`${table.quantityMilli} > 0 AND ${table.rateMinor} >= 0`),
  ],
);

export const invoices = pgTable(
  "invoices",
  {
    id: text("id").primaryKey(),
    displayId: text("display_id").notNull(),
    businessId: text("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
    transactionId: text("transaction_id").references(() => transactions.id, { onDelete: "restrict" }),
    partyId: text("party_id").notNull().references(() => parties.id),
    date: date("date").notNull(),
    dueDate: date("due_date").notNull(),
    reference: text("reference").notNull().default(""),
    subtotalMinor: bigint("subtotal_minor", { mode: "number" }).notNull(),
    taxMinor: bigint("tax_minor", { mode: "number" }).notNull().default(0),
    discountMinor: bigint("discount_minor", { mode: "number" }).notNull().default(0),
    totalMinor: bigint("total_minor", { mode: "number" }).notNull(),
    status: invoiceStatus("status").notNull(),
    notes: text("notes").notNull().default(""),
    terms: text("terms").notNull().default(""),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("invoices_workspace_display_unique").on(table.businessId, table.displayId),
    uniqueIndex("invoices_transaction_unique").on(table.transactionId),
    index("invoices_workspace_status_date_idx").on(table.businessId, table.status, table.date),
    index("invoices_party_idx").on(table.partyId),
    check("invoices_dates_valid", sql`${table.dueDate} >= ${table.date}`),
    check("invoices_money_nonnegative", sql`${table.subtotalMinor} >= 0 AND ${table.taxMinor} >= 0 AND ${table.discountMinor} >= 0 AND ${table.totalMinor} >= 0`),
  ],
);

export const invoiceItems = pgTable(
  "invoice_items",
  {
    id: text("id").primaryKey(),
    invoiceId: text("invoice_id").notNull().references(() => invoices.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    item: text("item").notNull(),
    description: text("description").notNull().default(""),
    quantityMilli: bigint("quantity_milli", { mode: "number" }).notNull(),
    unit: text("unit").notNull(),
    rateMinor: bigint("rate_minor", { mode: "number" }).notNull(),
    taxBasisPoints: integer("tax_basis_points").notNull().default(0),
  },
  (table) => [
    uniqueIndex("invoice_items_position_unique").on(table.invoiceId, table.position),
    check("invoice_items_positive", sql`${table.quantityMilli} > 0 AND ${table.rateMinor} >= 0 AND ${table.taxBasisPoints} BETWEEN 0 AND 10000`),
  ],
);

export const payments = pgTable(
  "payments",
  {
    id: text("id").primaryKey(),
    displayId: text("display_id").notNull(),
    businessId: text("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
    partyId: text("party_id").notNull().references(() => parties.id),
    transactionId: text("transaction_id").references(() => transactions.id, { onDelete: "restrict" }),
    direction: paymentDirection("direction").notNull(),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    method: paymentMethod("method").notNull(),
    date: date("date").notNull(),
    reference: text("reference").notNull().default(""),
    notes: text("notes").notNull().default(""),
    status: paymentStatus("status").notNull().default("Completed"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("payments_workspace_display_unique").on(table.businessId, table.displayId),
    index("payments_workspace_date_idx").on(table.businessId, table.date),
    index("payments_party_idx").on(table.partyId),
    check("payments_amount_positive", sql`${table.amountMinor} > 0`),
  ],
);

export const paymentAllocations = pgTable(
  "payment_allocations",
  {
    paymentId: text("payment_id").notNull().references(() => payments.id, { onDelete: "cascade" }),
    invoiceId: text("invoice_id").notNull().references(() => invoices.id, { onDelete: "restrict" }),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.paymentId, table.invoiceId] }),
    index("payment_allocations_invoice_idx").on(table.invoiceId),
    check("payment_allocations_amount_positive", sql`${table.amountMinor} > 0`),
  ],
);

export const businessSettings = pgTable("business_settings", {
  businessId: text("business_id").primaryKey().references(() => businesses.id, { onDelete: "cascade" }),
  notificationPreferences: jsonb("notification_preferences").$type<Record<string, boolean>>().notNull().default({}),
  invoiceSettings: jsonb("invoice_settings").$type<Record<string, unknown>>().notNull().default({}),
  paymentMethods: jsonb("payment_methods").$type<string[]>().notNull().default([]),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const notifications = pgTable(
  "notifications",
  {
    id: text("id").primaryKey(),
    businessId: text("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description").notNull(),
    read: boolean("read").notNull().default(false),
    href: text("href").notNull(),
    eventDate: date("event_date").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("notifications_workspace_read_idx").on(table.businessId, table.read, table.createdAt)],
);
