CREATE TABLE "invoice_counters" (
	"business_id" text PRIMARY KEY NOT NULL,
	"last_number" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "invoice_counters" ADD CONSTRAINT "invoice_counters_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
-- Run with the API stopped. Preserve existing numeric/draft labels and every PK/FK.
LOCK TABLE invoices IN SHARE ROW EXCLUSIVE MODE;
--> statement-breakpoint
INSERT INTO invoice_counters (business_id, last_number)
SELECT b.id, COALESCE(MAX(substring(i.display_id from '^INV-([0-9]+)$')::bigint), 0)
FROM businesses b LEFT JOIN invoices i ON i.business_id = b.id
GROUP BY b.id;
--> statement-breakpoint
WITH numbered AS (
  SELECT i.id, c.last_number + row_number() OVER (
    PARTITION BY i.business_id ORDER BY i.created_at, i.id
  ) AS number
  FROM invoices i JOIN invoice_counters c ON c.business_id = i.business_id
  WHERE i.display_id ~* '^INV-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
)
UPDATE invoices i
SET display_id = 'INV-' || lpad(n.number::text, greatest(6, length(n.number::text)), '0')
FROM numbered n WHERE i.id = n.id;
--> statement-breakpoint
UPDATE invoice_counters c
SET last_number = greatest(c.last_number, COALESCE((
  SELECT max(substring(i.display_id from '^INV-([0-9]+)$')::bigint)
  FROM invoices i WHERE i.business_id = c.business_id
), 0));
