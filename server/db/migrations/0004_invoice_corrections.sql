CREATE TABLE "invoice_corrections" (
	"id" text PRIMARY KEY NOT NULL,
	"business_id" text NOT NULL,
	"invoice_id" text NOT NULL,
	"transaction_id" text NOT NULL,
	"user_id" text NOT NULL,
	"date" date NOT NULL,
	"reason" text NOT NULL,
	"before" jsonb NOT NULL,
	"after" jsonb NOT NULL,
	"subtotal_delta" bigint NOT NULL,
	"tax_delta" bigint NOT NULL,
	"discount_delta" bigint NOT NULL,
	"total_delta" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoice_corrections_delta_valid" CHECK ("invoice_corrections"."total_delta" = "invoice_corrections"."subtotal_delta" + "invoice_corrections"."tax_delta" - "invoice_corrections"."discount_delta")
);
--> statement-breakpoint
CREATE TABLE "payment_allocation_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_id" text NOT NULL,
	"transaction_id" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	"effective_date" date NOT NULL,
	CONSTRAINT "allocation_events_amount_positive" CHECK ("payment_allocation_events"."amount_minor" > 0)
);
--> statement-breakpoint
ALTER TABLE "invoice_corrections" ADD CONSTRAINT "invoice_corrections_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_corrections" ADD CONSTRAINT "invoice_corrections_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_corrections" ADD CONSTRAINT "invoice_corrections_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_corrections" ADD CONSTRAINT "invoice_corrections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocation_events" ADD CONSTRAINT "payment_allocation_events_payment_id_transaction_id_payment_transaction_allocations_payment_id_transaction_id_fk" FOREIGN KEY ("payment_id","transaction_id") REFERENCES "public"."payment_transaction_allocations"("payment_id","transaction_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invoice_corrections_invoice_date_idx" ON "invoice_corrections" USING btree ("invoice_id","date");--> statement-breakpoint
CREATE INDEX "allocation_events_transaction_date_idx" ON "payment_allocation_events" USING btree ("transaction_id","effective_date");--> statement-breakpoint
-- Original posted amounts plus dated adjustment movements. Current invoice and
-- transaction totals remain the source for payments; history uses this view.
CREATE VIEW ledger_movements AS
SELECT t.id, t.id AS transaction_id, t.business_id,t.party_id,t.date,t.type,
 t.display_id,
 (t.subtotal_minor-coalesce(c.subtotal_delta,0))::bigint AS subtotal_minor,
 (t.tax_minor-coalesce(c.tax_delta,0))::bigint AS tax_minor,
 (t.discount_minor-coalesce(c.discount_delta,0))::bigint AS discount_minor,
 (t.total_minor-coalesce(c.total_delta,0))::bigint AS total_minor,
 false AS is_correction
FROM transactions t LEFT JOIN (
 SELECT transaction_id,sum(subtotal_delta) subtotal_delta,sum(tax_delta) tax_delta,
 sum(discount_delta) discount_delta,sum(total_delta) total_delta
 FROM invoice_corrections GROUP BY transaction_id
) c ON c.transaction_id=t.id
UNION ALL
SELECT c.id,c.transaction_id,c.business_id,t.party_id,c.date,t.type,
 c.id,c.subtotal_delta,c.tax_delta,c.discount_delta,c.total_delta,true
FROM invoice_corrections c JOIN transactions t ON t.id=c.transaction_id AND t.business_id=c.business_id;

--> statement-breakpoint
-- Preserve each allocation increment's date. A later advance applied to a
-- corrected invoice must not move its earlier settled amount into a new month.
INSERT INTO payment_allocation_events(payment_id,transaction_id,amount_minor,effective_date)
SELECT payment_id,transaction_id,amount_minor,effective_date FROM payment_transaction_allocations;
--> statement-breakpoint
CREATE FUNCTION record_allocation_event() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE increment bigint;
BEGIN
  IF TG_OP='INSERT' THEN increment := NEW.amount_minor;
  ELSE
    increment := NEW.amount_minor-OLD.amount_minor;
    IF increment<0 THEN RAISE EXCEPTION 'Allocation reductions require a reversal workflow'; END IF;
  END IF;
  IF increment>0 THEN
    INSERT INTO payment_allocation_events(payment_id,transaction_id,amount_minor,effective_date)
    VALUES(NEW.payment_id,NEW.transaction_id,increment,NEW.effective_date);
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER allocation_event_insert AFTER INSERT OR UPDATE ON payment_transaction_allocations
FOR EACH ROW EXECUTE FUNCTION record_allocation_event();
--> statement-breakpoint
CREATE OR REPLACE VIEW ledger_settlements AS
 SELECT p.business_id,a.payment_id,a.transaction_id,a.amount_minor,a.effective_date
 FROM payment_allocation_events a JOIN payments p ON p.id=a.payment_id
 WHERE p.status='Completed'
 UNION ALL
 SELECT p.business_id,p.id,p.transaction_id,p.amount_minor,p.date
 FROM payments p WHERE p.status='Completed' AND p.transaction_id IS NOT NULL
 AND p.allocation_mode='manual'
 AND NOT EXISTS (SELECT 1 FROM payment_transaction_allocations a WHERE a.payment_id=p.id);
