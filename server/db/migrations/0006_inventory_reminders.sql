CREATE TABLE "products" (
	"id" text PRIMARY KEY NOT NULL,
	"business_id" text NOT NULL,
	"sku" text NOT NULL,
	"name" text NOT NULL,
	"unit" text NOT NULL,
	"stock_milli" bigint DEFAULT 0 NOT NULL,
	"minimum_milli" bigint DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "stock_nonnegative" CHECK ("products"."stock_milli">=0 and "products"."minimum_milli">=0)
);
--> statement-breakpoint
CREATE TABLE "reminder_recipients" (
	"party_id" text PRIMARY KEY NOT NULL,
	"business_id" text NOT NULL,
	"chat_id" text,
	"state" text DEFAULT 'Disconnected' NOT NULL,
	"token_hash" text,
	"expires_at" timestamp with time zone,
	"version" text NOT NULL,
	"consented_at" timestamp with time zone,
	CONSTRAINT "reminder_recipient_state" CHECK ("reminder_recipients"."state" in ('Disconnected','Invited','Pending approval','Connected'))
);
--> statement-breakpoint
CREATE TABLE "reminders" (
	"id" text PRIMARY KEY NOT NULL,
	"business_id" text NOT NULL,
	"invoice_id" text NOT NULL,
	"party_id" text NOT NULL,
	"user_id" text NOT NULL,
	"recipient_version" text NOT NULL,
	"text" text NOT NULL,
	"balance_minor" bigint NOT NULL,
	"status" text DEFAULT 'Queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt" timestamp with time zone DEFAULT now() NOT NULL,
	"error_code" text,
	"message_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reminder_valid" CHECK ("reminders"."balance_minor">0 and "reminders"."attempts">=0 and "reminders"."status" in ('Queued','Retry','Sending','Sent','Failed','Unknown','Cancelled'))
);
--> statement-breakpoint
CREATE TABLE "stock_movements" (
	"id" text PRIMARY KEY NOT NULL,
	"business_id" text NOT NULL,
	"product_id" text NOT NULL,
	"invoice_id" text,
	"delta_milli" bigint NOT NULL,
	"date" date NOT NULL,
	"kind" text NOT NULL,
	"reason" text NOT NULL,
	"user_id" text NOT NULL,
	"request_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "invoice_items" ADD COLUMN "product_id" text;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminder_recipients" ADD CONSTRAINT "reminder_recipients_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminder_recipients" ADD CONSTRAINT "reminder_recipients_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "products_workspace_sku" ON "products" USING btree ("business_id","sku");--> statement-breakpoint
CREATE INDEX "reminder_recipient_token" ON "reminder_recipients" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "reminder_queue" ON "reminders" USING btree ("status","next_attempt");--> statement-breakpoint
CREATE INDEX "reminder_invoice_time" ON "reminders" USING btree ("business_id","invoice_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "stock_request_unique" ON "stock_movements" USING btree ("business_id","request_id");--> statement-breakpoint
CREATE INDEX "stock_product_date" ON "stock_movements" USING btree ("product_id","date");--> statement-breakpoint
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;