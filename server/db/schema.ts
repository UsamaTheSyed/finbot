import {
  bigserial,
  foreignKey,
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

export const botIdentities = pgTable(
  "bot_identities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    businessId: text("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    channel: text("channel").notNull(),
    externalUserId: text("external_user_id").notNull(),
    externalChatId: text("external_chat_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("bot_external_identity_unique").on(
      t.channel,
      t.externalUserId,
      t.externalChatId,
    ),
  ],
);
export const botLinkTokens = pgTable("bot_link_tokens", {
  hash: text("hash").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  businessId: text("business_id")
    .notNull()
    .references(() => businesses.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
});
export const botConversations = pgTable("bot_conversations", {
  identityId: uuid("identity_id")
    .primaryKey()
    .references(() => botIdentities.id, { onDelete: "cascade" }),
  state: jsonb("state").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});
export const botActions = pgTable(
  "bot_actions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    identityId: uuid("identity_id")
      .notNull()
      .references(() => botIdentities.id, { onDelete: "cascade" }),
    businessId: text("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    intent: text("intent").notNull(),
    payload: jsonb("payload").notNull(),
    status: text("status").notNull().default("pending"),
    result: jsonb("result"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    executedAt: timestamp("executed_at", { withTimezone: true }),
  },
  (t) => [
    index("bot_actions_identity_idx").on(t.identityId),
    check(
      "bot_action_status",
      sql`${t.status} in ('pending','confirmed','executed','cancelled','expired','failed')`,
    ),
  ],
);
export const botReceipts = pgTable("bot_receipts", {
  key: text("key").primaryKey(),
  response: jsonb("response").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const botAudit = pgTable("bot_audit", {
  id: uuid("id").primaryKey().defaultRandom(),
  businessId: text("business_id").references(() => businesses.id, {
    onDelete: "cascade",
  }),
  userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
  channel: text("channel").notNull(),
  messageId: text("message_id").notNull(),
  intent: text("intent").notNull(),
  actionId: uuid("action_id"),
  result: text("result").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const botRateLimits = pgTable("bot_rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});
export const botRuntime = pgTable("bot_runtime", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

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
export const paymentDirection = pgEnum("payment_direction", [
  "Received",
  "Sent",
]);
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
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
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
  openingCashMinor: bigint("opening_cash_minor", { mode: "number" })
    .notNull()
    .default(0),
  ...timestamps,
});

export const invoiceCounters = pgTable("invoice_counters", {
  businessId: text("business_id")
    .primaryKey()
    .references(() => businesses.id, { onDelete: "cascade" }),
  lastNumber: bigint("last_number", { mode: "bigint" })
    .notNull()
    .default(sql`0`),
});

export const memberships = pgTable(
  "workspace_memberships",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    businessId: text("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
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
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("sessions_user_idx").on(table.userId),
    index("sessions_expiry_idx").on(table.expiresAt),
  ],
);

export const parties = pgTable(
  "parties",
  {
    id: text("id").primaryKey(),
    businessId: text("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    kind: partyKind("kind").notNull(),
    phone: text("phone").notNull().default(""),
    email: text("email").notNull().default(""),
    ntn: text("ntn").notNull().default(""),
    address: text("address").notNull().default(""),
    paymentTerms: text("payment_terms").notNull().default("Net 30"),
    ...timestamps,
  },
  (table) => [
    index("parties_workspace_name_idx").on(table.businessId, table.name),
  ],
);

export const transactions = pgTable(
  "transactions",
  {
    id: text("id").primaryKey(),
    displayId: text("display_id").notNull(),
    businessId: text("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    partyId: text("party_id")
      .notNull()
      .references(() => parties.id),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id),
    date: date("date").notNull(),
    dueDate: date("due_date").notNull(),
    type: transactionType("type").notNull(),
    status: transactionStatus("status").notNull(),
    subtotalMinor: bigint("subtotal_minor", { mode: "number" }).notNull(),
    discountMinor: bigint("discount_minor", { mode: "number" })
      .notNull()
      .default(0),
    taxMinor: bigint("tax_minor", { mode: "number" }).notNull().default(0),
    taxRateBasisPoints: integer("tax_rate_basis_points"),
    totalMinor: bigint("total_minor", { mode: "number" }).notNull(),
    notes: text("notes").notNull().default(""),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("transactions_workspace_display_unique").on(
      table.businessId,
      table.displayId,
    ),
    index("transactions_workspace_date_idx").on(table.businessId, table.date),
    index("transactions_party_idx").on(table.partyId),
    check(
      "transactions_money_nonnegative",
      sql`${table.subtotalMinor} >= 0 AND ${table.discountMinor} >= 0 AND ${table.taxMinor} >= 0 AND ${table.totalMinor} >= 0`,
    ),
  ],
);

export const transactionItems = pgTable(
  "transaction_items",
  {
    id: text("id").primaryKey(),
    transactionId: text("transaction_id")
      .notNull()
      .references(() => transactions.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    description: text("description").notNull(),
    quantityMilli: bigint("quantity_milli", { mode: "number" }).notNull(),
    unit: text("unit").notNull(),
    rateMinor: bigint("rate_minor", { mode: "number" }).notNull(),
  },
  (table) => [
    uniqueIndex("transaction_items_position_unique").on(
      table.transactionId,
      table.position,
    ),
    check(
      "transaction_items_positive",
      sql`${table.quantityMilli} > 0 AND ${table.rateMinor} >= 0`,
    ),
  ],
);

export const invoices = pgTable(
  "invoices",
  {
    stockMode: text("stock_mode").notNull().default("Immediate"),
    warehouseId: text("warehouse_id"),
    id: text("id").primaryKey(),
    displayId: text("display_id").notNull(),
    businessId: text("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    transactionId: text("transaction_id").references(() => transactions.id, {
      onDelete: "restrict",
    }),
    partyId: text("party_id")
      .notNull()
      .references(() => parties.id),
    date: date("date").notNull(),
    dueDate: date("due_date").notNull(),
    reference: text("reference").notNull().default(""),
    subtotalMinor: bigint("subtotal_minor", { mode: "number" }).notNull(),
    taxMinor: bigint("tax_minor", { mode: "number" }).notNull().default(0),
    discountMinor: bigint("discount_minor", { mode: "number" })
      .notNull()
      .default(0),
    totalMinor: bigint("total_minor", { mode: "number" }).notNull(),
    status: invoiceStatus("status").notNull(),
    notes: text("notes").notNull().default(""),
    terms: text("terms").notNull().default(""),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("invoices_workspace_display_unique").on(
      table.businessId,
      table.displayId,
    ),
    uniqueIndex("invoices_transaction_unique").on(table.transactionId),
    index("invoices_workspace_status_date_idx").on(
      table.businessId,
      table.status,
      table.date,
    ),
    index("invoices_party_idx").on(table.partyId),
    check("invoices_dates_valid", sql`${table.dueDate} >= ${table.date}`),
    check(
      "invoices_money_nonnegative",
      sql`${table.subtotalMinor} >= 0 AND ${table.taxMinor} >= 0 AND ${table.discountMinor} >= 0 AND ${table.totalMinor} >= 0`,
    ),
  ],
);

export const products = pgTable(
  "products",
  {
    category: text("category").notNull().default(""),
    variant: text("variant").notNull().default(""),
    id: text("id").primaryKey(),
    businessId: text("business_id")
      .notNull()
      .references(() => businesses.id),
    sku: text("sku").notNull(),
    name: text("name").notNull(),
    unit: text("unit").notNull(),
    stockMilli: bigint("stock_milli", { mode: "number" }).notNull().default(0),
    minimumMilli: bigint("minimum_milli", { mode: "number" })
      .notNull()
      .default(0),
    active: boolean("active").notNull().default(true),
  },
  (t) => [
    uniqueIndex("products_workspace_sku").on(t.businessId, t.sku),
    check(
      "stock_nonnegative",
      sql`${t.stockMilli}>=0 and ${t.minimumMilli}>=0`,
    ),
  ],
);
export const invoiceItems = pgTable(
  "invoice_items",
  {
    id: text("id").primaryKey(),
    productId: text("product_id").references(() => products.id),
    invoiceId: text("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    item: text("item").notNull(),
    description: text("description").notNull().default(""),
    quantityMilli: bigint("quantity_milli", { mode: "number" }).notNull(),
    unit: text("unit").notNull(),
    rateMinor: bigint("rate_minor", { mode: "number" }).notNull(),
    taxBasisPoints: integer("tax_basis_points").notNull().default(0),
  },
  (table) => [
    uniqueIndex("invoice_items_position_unique").on(
      table.invoiceId,
      table.position,
    ),
    check(
      "invoice_items_positive",
      sql`${table.quantityMilli} > 0 AND ${table.rateMinor} >= 0 AND ${table.taxBasisPoints} BETWEEN 0 AND 10000`,
    ),
  ],
);

export const payments = pgTable(
  "payments",
  {
    id: text("id").primaryKey(),
    displayId: text("display_id").notNull(),
    businessId: text("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    partyId: text("party_id")
      .notNull()
      .references(() => parties.id),
    transactionId: text("transaction_id").references(() => transactions.id, {
      onDelete: "restrict",
    }),
    allocationMode: text("allocation_mode").notNull().default("manual"),
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
    uniqueIndex("payments_workspace_display_unique").on(
      table.businessId,
      table.displayId,
    ),
    index("payments_workspace_date_idx").on(table.businessId, table.date),
    index("payments_party_idx").on(table.partyId),
    check(
      "payments_allocation_mode",
      sql`${table.allocationMode} IN ('manual','fifo')`,
    ),
    check("payments_amount_positive", sql`${table.amountMinor} > 0`),
  ],
);

export const paymentAllocations = pgTable(
  "payment_allocations",
  {
    paymentId: text("payment_id")
      .notNull()
      .references(() => payments.id, { onDelete: "cascade" }),
    invoiceId: text("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "restrict" }),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.paymentId, table.invoiceId] }),
    index("payment_allocations_invoice_idx").on(table.invoiceId),
    check("payment_allocations_amount_positive", sql`${table.amountMinor} > 0`),
  ],
);

export const businessSettings = pgTable("business_settings", {
  businessId: text("business_id")
    .primaryKey()
    .references(() => businesses.id, { onDelete: "cascade" }),
  notificationPreferences: jsonb("notification_preferences")
    .$type<Record<string, boolean>>()
    .notNull()
    .default({}),
  invoiceSettings: jsonb("invoice_settings")
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  paymentMethods: jsonb("payment_methods")
    .$type<string[]>()
    .notNull()
    .default([]),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const notifications = pgTable(
  "notifications",
  {
    id: text("id").primaryKey(),
    businessId: text("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description").notNull(),
    read: boolean("read").notNull().default(false),
    href: text("href").notNull(),
    eventDate: date("event_date").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("notifications_workspace_read_idx").on(
      table.businessId,
      table.read,
      table.createdAt,
    ),
  ],
);

export const paymentTransactionAllocations = pgTable(
  "payment_transaction_allocations",
  {
    paymentId: text("payment_id")
      .notNull()
      .references(() => payments.id, { onDelete: "cascade" }),
    transactionId: text("transaction_id")
      .notNull()
      .references(() => transactions.id, { onDelete: "restrict" }),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    effectiveDate: date("effective_date").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.paymentId, table.transactionId] }),
    index("payment_transaction_allocations_transaction_idx").on(
      table.transactionId,
    ),
    check(
      "payment_transaction_allocations_amount_minor_check",
      sql`${table.amountMinor} > 0`,
    ),
  ],
);

// Append-only via application APIs. Snapshots retain the original document and
// every confirmed revision; references prevent deleting corrected ledger records.
export const invoiceCorrections = pgTable(
  "invoice_corrections",
  {
    id: text("id").primaryKey(),
    businessId: text("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "restrict" }),
    invoiceId: text("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "restrict" }),
    transactionId: text("transaction_id")
      .notNull()
      .references(() => transactions.id, { onDelete: "restrict" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    date: date("date").notNull(),
    reason: text("reason").notNull(),
    before: jsonb("before").notNull(),
    after: jsonb("after").notNull(),
    subtotalDelta: bigint("subtotal_delta", { mode: "number" }).notNull(),
    taxDelta: bigint("tax_delta", { mode: "number" }).notNull(),
    discountDelta: bigint("discount_delta", { mode: "number" }).notNull(),
    totalDelta: bigint("total_delta", { mode: "number" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("invoice_corrections_invoice_date_idx").on(t.invoiceId, t.date),
    check(
      "invoice_corrections_delta_valid",
      sql`${t.totalDelta} = ${t.subtotalDelta} + ${t.taxDelta} - ${t.discountDelta}`,
    ),
  ],
);

export const paymentAllocationEvents = pgTable(
  "payment_allocation_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    paymentId: text("payment_id").notNull(),
    transactionId: text("transaction_id").notNull(),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    effectiveDate: date("effective_date").notNull(),
  },
  (t) => [
    foreignKey({
      columns: [t.paymentId, t.transactionId],
      foreignColumns: [
        paymentTransactionAllocations.paymentId,
        paymentTransactionAllocations.transactionId,
      ],
    }).onDelete("cascade"),
    index("allocation_events_transaction_date_idx").on(
      t.transactionId,
      t.effectiveDate,
    ),
    check("allocation_events_amount_positive", sql`${t.amountMinor} > 0`),
  ],
);

export const creditNotes = pgTable(
  "credit_notes",
  {
    id: text("id").primaryKey(),
    businessId: text("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "restrict" }),
    partyId: text("party_id")
      .notNull()
      .references(() => parties.id, { onDelete: "restrict" }),
    invoiceId: text("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "restrict" }),
    transactionId: text("transaction_id")
      .notNull()
      .references(() => transactions.id, { onDelete: "restrict" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    date: date("date").notNull(),
    reason: text("reason").notNull(),
    subtotalMinor: bigint("subtotal_minor", { mode: "number" }).notNull(),
    taxMinor: bigint("tax_minor", { mode: "number" }).notNull(),
    discountMinor: bigint("discount_minor", { mode: "number" }).notNull(),
    totalMinor: bigint("total_minor", { mode: "number" }).notNull(),
    fundedMinor: bigint("funded_minor", { mode: "number" }).notNull(),
    before: jsonb("before").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("credit_notes_party_idx").on(t.businessId, t.partyId),
    index("credit_notes_invoice_idx").on(t.invoiceId),
    check(
      "credit_note_money",
      sql`${t.subtotalMinor}>=0 and ${t.taxMinor}>=0 and ${t.discountMinor}>=0 and ${t.discountMinor}<=${t.subtotalMinor} and ${t.totalMinor}=${t.subtotalMinor}+${t.taxMinor}-${t.discountMinor} and ${t.totalMinor}>0 and ${t.fundedMinor}>=0 and ${t.fundedMinor}<=${t.totalMinor}`,
    ),
  ],
);
export const creditUses = pgTable(
  "credit_uses",
  {
    id: text("id").primaryKey(),
    creditId: text("credit_id")
      .notNull()
      .references(() => creditNotes.id, { onDelete: "restrict" }),
    businessId: text("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "restrict" }),
    transactionId: text("transaction_id").references(() => transactions.id, {
      onDelete: "restrict",
    }),
    paymentId: text("payment_id").references(() => payments.id, {
      onDelete: "restrict",
    }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    kind: text("kind").notNull(),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    date: date("date").notNull(),
    reason: text("reason").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("credit_uses_note_idx").on(t.creditId),
    check(
      "credit_use_valid",
      sql`${t.amountMinor}>0 and ((${t.kind}='application' and ${t.transactionId} is not null and ${t.paymentId} is null) or (${t.kind}='refund' and ${t.paymentId} is not null and ${t.transactionId} is null))`,
    ),
  ],
);
export const creditOperations = pgTable("credit_operations", {
  id: text("id").primaryKey(),
  businessId: text("business_id")
    .notNull()
    .references(() => businesses.id, { onDelete: "restrict" }),
  partyId: text("party_id")
    .notNull()
    .references(() => parties.id, { onDelete: "restrict" }),
  kind: text("kind").notNull(),
  payload: jsonb("payload").notNull(),
  response: jsonb("response").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const stockMovements = pgTable(
  "stock_movements",
  {
    warehouseId: text("warehouse_id"),
    lineId: text("line_id"),
    costMinor: bigint("cost_minor", { mode: "number" }),
    valueAfterMinor: bigint("value_after_minor", { mode: "number" }),
    sequence: bigserial("sequence", { mode: "number" }).notNull(),
    id: text("id").primaryKey(),
    businessId: text("business_id")
      .notNull()
      .references(() => businesses.id),
    productId: text("product_id")
      .notNull()
      .references(() => products.id),
    invoiceId: text("invoice_id").references(() => invoices.id),
    deltaMilli: bigint("delta_milli", { mode: "number" }).notNull(),
    date: date("date").notNull(),
    kind: text("kind").notNull(),
    reason: text("reason").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    requestId: text("request_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("stock_request_unique").on(t.businessId, t.requestId),
    index("stock_product_date").on(t.productId, t.date),
  ],
);
export const reminderRecipients = pgTable(
  "reminder_recipients",
  {
    partyId: text("party_id")
      .primaryKey()
      .references(() => parties.id),
    businessId: text("business_id")
      .notNull()
      .references(() => businesses.id),
    chatId: text("chat_id"),
    state: text("state").notNull().default("Disconnected"),
    tokenHash: text("token_hash"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    version: text("version").notNull(),
    consentedAt: timestamp("consented_at", { withTimezone: true }),
  },
  (t) => [
    index("reminder_recipient_token").on(t.tokenHash),
    check(
      "reminder_recipient_state",
      sql`${t.state} in ('Disconnected','Invited','Pending approval','Connected')`,
    ),
  ],
);
export const reminders = pgTable(
  "reminders",
  {
    id: text("id").primaryKey(),
    businessId: text("business_id")
      .notNull()
      .references(() => businesses.id),
    invoiceId: text("invoice_id")
      .notNull()
      .references(() => invoices.id),
    partyId: text("party_id")
      .notNull()
      .references(() => parties.id),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    recipientVersion: text("recipient_version").notNull(),
    text: text("text").notNull(),
    balanceMinor: bigint("balance_minor", { mode: "number" }).notNull(),
    status: text("status").notNull().default("Queued"),
    attempts: integer("attempts").notNull().default(0),
    nextAttempt: timestamp("next_attempt", { withTimezone: true })
      .notNull()
      .defaultNow(),
    errorCode: text("error_code"),
    messageId: text("message_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("reminder_queue").on(t.status, t.nextAttempt),
    index("reminder_invoice_time").on(t.businessId, t.invoiceId, t.createdAt),
    check(
      "reminder_valid",
      sql`${t.balanceMinor}>0 and ${t.attempts}>=0 and ${t.status} in ('Queued','Retry','Sending','Sent','Failed','Unknown','Cancelled')`,
    ),
  ],
);

export const warehouses = pgTable(
  "warehouses",
  {
    id: text("id").primaryKey(),
    businessId: text("business_id")
      .notNull()
      .references(() => businesses.id),
    name: text("name").notNull(),
    active: boolean("active").notNull().default(true),
  },
  (t) => [uniqueIndex("warehouse_business_name").on(t.businessId, t.name)],
);
export const productUnits = pgTable(
  "product_units",
  {
    productId: text("product_id")
      .notNull()
      .references(() => products.id),
    name: text("name").notNull(),
    factorMilli: bigint("factor_milli", { mode: "number" }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.productId, t.name] }),
    check("positive_conversion", sql`${t.factorMilli}>0`),
  ],
);
export const warehouseStock = pgTable(
  "warehouse_stock",
  {
    productId: text("product_id")
      .notNull()
      .references(() => products.id),
    warehouseId: text("warehouse_id")
      .notNull()
      .references(() => warehouses.id),
    quantityMilli: bigint("quantity_milli", { mode: "number" })
      .notNull()
      .default(0),
    reservedMilli: bigint("reserved_milli", { mode: "number" })
      .notNull()
      .default(0),
    valueMinor: bigint("value_minor", { mode: "number" }),
    revision: bigint("revision", { mode: "number" }).notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.productId, t.warehouseId] }),
    check(
      "warehouse_stock_valid",
      sql`${t.quantityMilli}>=0 and ${t.reservedMilli}>=0 and ${t.reservedMilli}<=${t.quantityMilli} and (${t.valueMinor} is null or ${t.valueMinor}>=0)`,
    ),
  ],
);
export const stockLines = pgTable(
  "stock_lines",
  {
    id: text("id").primaryKey(),
    businessId: text("business_id")
      .notNull()
      .references(() => businesses.id),
    invoiceId: text("invoice_id")
      .notNull()
      .references(() => invoices.id),
    productId: text("product_id")
      .notNull()
      .references(() => products.id),
    warehouseId: text("warehouse_id")
      .notNull()
      .references(() => warehouses.id),
    kind: text("kind").notNull(),
    expectedMilli: bigint("expected_milli", { mode: "number" }).notNull(),
    fulfilledMilli: bigint("fulfilled_milli", { mode: "number" })
      .notNull()
      .default(0),
    returnedMilli: bigint("returned_milli", { mode: "number" })
      .notNull()
      .default(0),
    reservedMilli: bigint("reserved_milli", { mode: "number" })
      .notNull()
      .default(0),
    purchaseMinor: bigint("purchase_minor", { mode: "number" })
      .notNull()
      .default(0),
    fulfilledCostMinor: bigint("fulfilled_cost_minor", { mode: "number" }),
    returnedCostMinor: bigint("returned_cost_minor", { mode: "number" })
      .notNull()
      .default(0),
  },
  (t) => [
    check(
      "stock_line_valid",
      sql`${t.expectedMilli}>0 and ${t.fulfilledMilli}>=0 and ${t.fulfilledMilli}<=${t.expectedMilli} and ${t.returnedMilli}>=0 and ${t.returnedMilli}<=${t.fulfilledMilli} and ${t.reservedMilli}>=0 and ${t.reservedMilli}<=${t.expectedMilli}-${t.fulfilledMilli}`,
    ),
  ],
);
export const inventoryOperations = pgTable("inventory_operations", {
  id: text("id").primaryKey(),
  businessId: text("business_id")
    .notNull()
    .references(() => businesses.id),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  payload: jsonb("payload").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
