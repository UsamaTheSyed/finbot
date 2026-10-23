CREATE TABLE "credit_notes" (
	"id" text PRIMARY KEY NOT NULL,
	"business_id" text NOT NULL,
	"party_id" text NOT NULL,
	"invoice_id" text NOT NULL,
	"transaction_id" text NOT NULL,
	"user_id" text NOT NULL,
	"date" date NOT NULL,
	"reason" text NOT NULL,
	"subtotal_minor" bigint NOT NULL,
	"tax_minor" bigint NOT NULL,
	"discount_minor" bigint NOT NULL,
	"total_minor" bigint NOT NULL,
	"funded_minor" bigint NOT NULL,
	"before" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "credit_note_money" CHECK ("credit_notes"."subtotal_minor">=0 and "credit_notes"."tax_minor">=0 and "credit_notes"."discount_minor">=0 and "credit_notes"."discount_minor"<="credit_notes"."subtotal_minor" and "credit_notes"."total_minor"="credit_notes"."subtotal_minor"+"credit_notes"."tax_minor"-"credit_notes"."discount_minor" and "credit_notes"."total_minor">0 and "credit_notes"."funded_minor">=0 and "credit_notes"."funded_minor"<="credit_notes"."total_minor")
);
--> statement-breakpoint
CREATE TABLE "credit_operations" (
	"id" text PRIMARY KEY NOT NULL,
	"business_id" text NOT NULL,
	"party_id" text NOT NULL,
	"kind" text NOT NULL,
	"payload" jsonb NOT NULL,
	"response" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credit_uses" (
	"id" text PRIMARY KEY NOT NULL,
	"credit_id" text NOT NULL,
	"business_id" text NOT NULL,
	"transaction_id" text,
	"payment_id" text,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	"date" date NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "credit_use_valid" CHECK ("credit_uses"."amount_minor">0 and (("credit_uses"."kind"='application' and "credit_uses"."transaction_id" is not null and "credit_uses"."payment_id" is null) or ("credit_uses"."kind"='refund' and "credit_uses"."payment_id" is not null and "credit_uses"."transaction_id" is null)))
);
--> statement-breakpoint
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_operations" ADD CONSTRAINT "credit_operations_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_operations" ADD CONSTRAINT "credit_operations_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_uses" ADD CONSTRAINT "credit_uses_credit_id_credit_notes_id_fk" FOREIGN KEY ("credit_id") REFERENCES "public"."credit_notes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_uses" ADD CONSTRAINT "credit_uses_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_uses" ADD CONSTRAINT "credit_uses_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_uses" ADD CONSTRAINT "credit_uses_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_uses" ADD CONSTRAINT "credit_uses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "credit_notes_party_idx" ON "credit_notes" USING btree ("business_id","party_id");--> statement-breakpoint
CREATE INDEX "credit_notes_invoice_idx" ON "credit_notes" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "credit_uses_note_idx" ON "credit_uses" USING btree ("credit_id");
--> statement-breakpoint
ALTER VIEW ledger_settlements RENAME TO ledger_settlements_before_credits;
--> statement-breakpoint
-- Settlement projection includes non-cash credit debt reduction. It is NOT a
-- cash-payment history: cash remains exclusively in the payments table.
CREATE VIEW ledger_settlements AS
SELECT * FROM ledger_settlements_before_credits
UNION ALL
SELECT business_id,id,transaction_id,(total_minor-funded_minor)::bigint,date FROM credit_notes
UNION ALL
SELECT business_id,id,transaction_id,amount_minor,date FROM credit_uses WHERE kind='application';
--> statement-breakpoint
ALTER VIEW ledger_movements RENAME TO ledger_movements_before_credits;
--> statement-breakpoint
CREATE VIEW ledger_movements AS
SELECT m.*,CASE WHEN is_correction THEN 'correction' ELSE 'original' END::text AS movement_kind FROM ledger_movements_before_credits m
UNION ALL
SELECT c.id,c.transaction_id,c.business_id,c.party_id,c.date,t.type,c.id,
 -c.subtotal_minor,-c.tax_minor,-c.discount_minor,-c.total_minor,false,'credit'
FROM credit_notes c JOIN transactions t ON t.id=c.transaction_id AND t.business_id=c.business_id;
