CREATE TYPE "public"."invoice_status" AS ENUM('Draft', 'Sent', 'Paid', 'Partial', 'Overdue');--> statement-breakpoint
CREATE TYPE "public"."membership_role" AS ENUM('Owner', 'Admin', 'Accountant', 'Staff');--> statement-breakpoint
CREATE TYPE "public"."membership_status" AS ENUM('Active', 'Invited', 'Inactive');--> statement-breakpoint
CREATE TYPE "public"."party_kind" AS ENUM('Customer', 'Supplier');--> statement-breakpoint
CREATE TYPE "public"."payment_direction" AS ENUM('Received', 'Sent');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('Cash', 'Bank Transfer', 'Easypaisa', 'JazzCash', 'Cheque');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('Completed', 'Pending', 'Failed');--> statement-breakpoint
CREATE TYPE "public"."transaction_status" AS ENUM('Completed', 'Partial', 'Overdue', 'Unpaid');--> statement-breakpoint
CREATE TYPE "public"."transaction_type" AS ENUM('Sale', 'Purchase');--> statement-breakpoint
CREATE TABLE "business_settings" (
	"business_id" text PRIMARY KEY NOT NULL,
	"notification_preferences" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"invoice_settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"payment_methods" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "businesses" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"currency" text DEFAULT 'PKR' NOT NULL,
	"timezone" text DEFAULT 'Asia/Karachi' NOT NULL,
	"city" text DEFAULT 'Karachi' NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"address" text DEFAULT '' NOT NULL,
	"ntn" text DEFAULT '' NOT NULL,
	"logo" text DEFAULT '' NOT NULL,
	"opening_cash_minor" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice_items" (
	"id" text PRIMARY KEY NOT NULL,
	"invoice_id" text NOT NULL,
	"position" integer NOT NULL,
	"item" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"quantity_milli" bigint NOT NULL,
	"unit" text NOT NULL,
	"rate_minor" bigint NOT NULL,
	"tax_basis_points" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "invoice_items_positive" CHECK ("invoice_items"."quantity_milli" > 0 AND "invoice_items"."rate_minor" >= 0 AND "invoice_items"."tax_basis_points" BETWEEN 0 AND 10000)
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" text PRIMARY KEY NOT NULL,
	"display_id" text NOT NULL,
	"business_id" text NOT NULL,
	"transaction_id" text,
	"party_id" text NOT NULL,
	"date" date NOT NULL,
	"due_date" date NOT NULL,
	"reference" text DEFAULT '' NOT NULL,
	"subtotal_minor" bigint NOT NULL,
	"tax_minor" bigint DEFAULT 0 NOT NULL,
	"discount_minor" bigint DEFAULT 0 NOT NULL,
	"total_minor" bigint NOT NULL,
	"status" "invoice_status" NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"terms" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoices_dates_valid" CHECK ("invoices"."due_date" >= "invoices"."date"),
	CONSTRAINT "invoices_money_nonnegative" CHECK ("invoices"."subtotal_minor" >= 0 AND "invoices"."tax_minor" >= 0 AND "invoices"."discount_minor" >= 0 AND "invoices"."total_minor" >= 0)
);
--> statement-breakpoint
CREATE TABLE "workspace_memberships" (
	"user_id" text NOT NULL,
	"business_id" text NOT NULL,
	"role" "membership_role" NOT NULL,
	"status" "membership_status" DEFAULT 'Active' NOT NULL,
	"permissions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"invited_email" text,
	"last_active_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_memberships_user_id_business_id_pk" PRIMARY KEY("user_id","business_id")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"business_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"read" boolean DEFAULT false NOT NULL,
	"href" text NOT NULL,
	"event_date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "parties" (
	"id" text PRIMARY KEY NOT NULL,
	"business_id" text NOT NULL,
	"name" text NOT NULL,
	"kind" "party_kind" NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"ntn" text DEFAULT '' NOT NULL,
	"address" text DEFAULT '' NOT NULL,
	"payment_terms" text DEFAULT 'Net 30' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_allocations" (
	"payment_id" text NOT NULL,
	"invoice_id" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_allocations_payment_id_invoice_id_pk" PRIMARY KEY("payment_id","invoice_id"),
	CONSTRAINT "payment_allocations_amount_positive" CHECK ("payment_allocations"."amount_minor" > 0)
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" text PRIMARY KEY NOT NULL,
	"display_id" text NOT NULL,
	"business_id" text NOT NULL,
	"party_id" text NOT NULL,
	"transaction_id" text,
	"direction" "payment_direction" NOT NULL,
	"amount_minor" bigint NOT NULL,
	"method" "payment_method" NOT NULL,
	"date" date NOT NULL,
	"reference" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"status" "payment_status" DEFAULT 'Completed' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_amount_positive" CHECK ("payments"."amount_minor" > 0)
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "transaction_items" (
	"id" text PRIMARY KEY NOT NULL,
	"transaction_id" text NOT NULL,
	"position" integer NOT NULL,
	"description" text NOT NULL,
	"quantity_milli" bigint NOT NULL,
	"unit" text NOT NULL,
	"rate_minor" bigint NOT NULL,
	CONSTRAINT "transaction_items_positive" CHECK ("transaction_items"."quantity_milli" > 0 AND "transaction_items"."rate_minor" >= 0)
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"display_id" text NOT NULL,
	"business_id" text NOT NULL,
	"party_id" text NOT NULL,
	"created_by" text NOT NULL,
	"date" date NOT NULL,
	"due_date" date NOT NULL,
	"type" "transaction_type" NOT NULL,
	"status" "transaction_status" NOT NULL,
	"subtotal_minor" bigint NOT NULL,
	"discount_minor" bigint DEFAULT 0 NOT NULL,
	"tax_minor" bigint DEFAULT 0 NOT NULL,
	"tax_rate_basis_points" integer,
	"total_minor" bigint NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transactions_money_nonnegative" CHECK ("transactions"."subtotal_minor" >= 0 AND "transactions"."discount_minor" >= 0 AND "transactions"."tax_minor" >= 0 AND "transactions"."total_minor" >= 0)
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"avatar" text,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "business_settings" ADD CONSTRAINT "business_settings_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_memberships" ADD CONSTRAINT "workspace_memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_memberships" ADD CONSTRAINT "workspace_memberships_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parties" ADD CONSTRAINT "parties_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_items" ADD CONSTRAINT "transaction_items_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "invoice_items_position_unique" ON "invoice_items" USING btree ("invoice_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_workspace_display_unique" ON "invoices" USING btree ("business_id","display_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_transaction_unique" ON "invoices" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "invoices_workspace_status_date_idx" ON "invoices" USING btree ("business_id","status","date");--> statement-breakpoint
CREATE INDEX "invoices_party_idx" ON "invoices" USING btree ("party_id");--> statement-breakpoint
CREATE INDEX "memberships_business_idx" ON "workspace_memberships" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX "notifications_workspace_read_idx" ON "notifications" USING btree ("business_id","read","created_at");--> statement-breakpoint
CREATE INDEX "parties_workspace_name_idx" ON "parties" USING btree ("business_id","name");--> statement-breakpoint
CREATE INDEX "payment_allocations_invoice_idx" ON "payment_allocations" USING btree ("invoice_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_workspace_display_unique" ON "payments" USING btree ("business_id","display_id");--> statement-breakpoint
CREATE INDEX "payments_workspace_date_idx" ON "payments" USING btree ("business_id","date");--> statement-breakpoint
CREATE INDEX "payments_party_idx" ON "payments" USING btree ("party_id");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_expiry_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "transaction_items_position_unique" ON "transaction_items" USING btree ("transaction_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "transactions_workspace_display_unique" ON "transactions" USING btree ("business_id","display_id");--> statement-breakpoint
CREATE INDEX "transactions_workspace_date_idx" ON "transactions" USING btree ("business_id","date");--> statement-breakpoint
CREATE INDEX "transactions_party_idx" ON "transactions" USING btree ("party_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree (lower("email"));