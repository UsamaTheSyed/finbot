CREATE TABLE "payment_transaction_allocations" (
	"payment_id" text NOT NULL,
	"transaction_id" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	"effective_date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_transaction_allocations_payment_id_transaction_id_pk" PRIMARY KEY("payment_id","transaction_id"),
	CONSTRAINT "payment_transaction_allocations_amount_minor_check" CHECK ("payment_transaction_allocations"."amount_minor" > 0)
);
--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "allocation_mode" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_transaction_allocations" ADD CONSTRAINT "payment_transaction_allocations_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_transaction_allocations" ADD CONSTRAINT "payment_transaction_allocations_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payment_transaction_allocations_transaction_idx" ON "payment_transaction_allocations" USING btree ("transaction_id");--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_allocation_mode" CHECK ("payments"."allocation_mode" IN ('manual','fifo'));
--> statement-breakpoint
CREATE VIEW ledger_settlements AS
 SELECT p.business_id, a.payment_id, a.transaction_id, a.amount_minor, a.effective_date
 FROM payment_transaction_allocations a JOIN payments p ON p.id=a.payment_id
 WHERE p.status='Completed'
 UNION ALL
 SELECT p.business_id,p.id,p.transaction_id,p.amount_minor,p.date
 FROM payments p WHERE p.status='Completed' AND p.transaction_id IS NOT NULL
 AND p.allocation_mode='manual'
 AND NOT EXISTS (SELECT 1 FROM payment_transaction_allocations a WHERE a.payment_id=p.id);

--> statement-breakpoint
-- Repair missing invoice mirrors for historical payments made from Transaction Detail.
-- Existing allocations and cash movements are preserved.
INSERT INTO payment_allocations(payment_id,invoice_id,amount_minor)
SELECT p.id,i.id,p.amount_minor FROM payments p
JOIN invoices i ON i.transaction_id=p.transaction_id AND i.business_id=p.business_id AND i.party_id=p.party_id
WHERE p.allocation_mode='manual'
ON CONFLICT(payment_id,invoice_id) DO NOTHING;
