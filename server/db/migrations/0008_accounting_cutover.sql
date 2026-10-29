CREATE TABLE "accounting_credit_resolutions" (
	"id" text PRIMARY KEY NOT NULL,
	"business_id" text NOT NULL,
	"credit_id" text NOT NULL,
	"user_id" text NOT NULL,
	"date" date NOT NULL,
	"inventory_minor" bigint NOT NULL,
	"cogs_minor" bigint NOT NULL,
	"clearing_minor" bigint NOT NULL,
	"expense_minor" bigint NOT NULL,
	"allocations" jsonb NOT NULL,
	"reason" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "accounting_cutovers" (
	"business_id" text PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"user_id" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"baseline" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "accounting_journals" (
	"business_id" text NOT NULL,
	"source" text NOT NULL,
	"date" date NOT NULL,
	"source_hash" text NOT NULL,
	"lines" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounting_journals_business_id_source_pk" PRIMARY KEY("business_id","source")
);
--> statement-breakpoint
ALTER TABLE "accounting_credit_resolutions" ADD CONSTRAINT "accounting_credit_resolutions_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounting_credit_resolutions" ADD CONSTRAINT "accounting_credit_resolutions_credit_id_credit_notes_id_fk" FOREIGN KEY ("credit_id") REFERENCES "public"."credit_notes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounting_credit_resolutions" ADD CONSTRAINT "accounting_credit_resolutions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounting_cutovers" ADD CONSTRAINT "accounting_cutovers_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounting_cutovers" ADD CONSTRAINT "accounting_cutovers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounting_journals" ADD CONSTRAINT "accounting_journals_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "accounting_credit_resolution_unique" ON "accounting_credit_resolutions" USING btree ("credit_id");--> statement-breakpoint
-- Baseline and journal fingerprints cover financial facts, not display labels.
CREATE VIEW accounting_sources AS
SELECT m.business_id,'document:'||m.id source,m.date,
 jsonb_build_object('kind','document','type',m.type,'movement',m.movement_kind,
 'party',m.party_id,'net',m.subtotal_minor-m.discount_minor,'tax',m.tax_minor,'total',m.total_minor,
 'tracked',coalesce((select sum(l.purchase_minor) from stock_lines l where l.invoice_id=i.id),0),
 'legacyTracked',exists(select 1 from invoice_items x where x.invoice_id=i.id and x.product_id is not null) AND NOT EXISTS(select 1 from stock_lines l where l.invoice_id=i.id),
 'invoice',i.id) payload
FROM ledger_movements m LEFT JOIN invoices i ON i.transaction_id=m.transaction_id AND i.business_id=m.business_id
UNION ALL
SELECT p.business_id,'payment:'||p.id,p.date,
 jsonb_build_object('kind','payment','party',p.party_id,'partyKind',a.kind,'amount',p.amount_minor,'direction',p.direction)
FROM payments p JOIN parties a ON a.id=p.party_id WHERE p.status='Completed'
UNION ALL
SELECT s.business_id,'stock:'||s.id,s.date,
 jsonb_build_object('kind','stock','movement',s.kind,'product',s.product_id,'warehouse',s.warehouse_id,
 'quantity',s.delta_milli,'cost',s.cost_minor,'invoice',s.invoice_id,
 'gross',case when s.kind='Sale' and s.line_id is not null then
 (select round(l.purchase_minor::numeric*coalesce((select sum(-x.delta_milli) from stock_movements x where x.line_id=l.id and x.kind='Sale' and x.sequence<=s.sequence),0)/l.expected_milli)::bigint
 -round(l.purchase_minor::numeric*coalesce((select sum(-x.delta_milli) from stock_movements x where x.line_id=l.id and x.kind='Sale' and x.sequence<s.sequence),0)/l.expected_milli)::bigint
 from stock_lines l where l.id=s.line_id) else 0 end) payload
FROM stock_movements s
UNION ALL
SELECT r.business_id,'resolution:'||r.id,r.date,
 jsonb_build_object('kind','resolution','credit',r.credit_id,'cogs',r.cogs_minor,
 'inventory',r.inventory_minor,'clearing',r.clearing_minor,'expense',r.expense_minor,'allocations',r.allocations)
FROM accounting_credit_resolutions r;
--> statement-breakpoint
CREATE FUNCTION accounting_line(a text,n bigint) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
 SELECT jsonb_build_object('account',a,'amountMinor',n)
$$;
--> statement-breakpoint
CREATE FUNCTION accounting_revenue_delta(b text,p jsonb) RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE invoice_key text:=p->>'invoice'; original_net bigint; tracked bigint; credits bigint; gross bigint; recognized bigint;
BEGIN
 SELECT (s.payload->>'net')::bigint,(s.payload->>'tracked')::bigint INTO original_net,tracked
 FROM accounting_sources s WHERE s.business_id=b AND s.payload->>'invoice'=invoice_key AND s.payload->>'kind'='document' AND s.payload->>'movement'='original';
 IF original_net>0 AND EXISTS(SELECT 1 FROM accounting_journals j JOIN accounting_sources s ON s.business_id=j.business_id AND s.source=j.source WHERE j.business_id=b AND s.payload->>'invoice'=invoice_key AND s.payload->>'movement'='original') THEN
  SELECT coalesce(sum((s.payload->>'net')::bigint),0) INTO credits FROM accounting_journals j JOIN accounting_sources s ON s.business_id=j.business_id AND s.source=j.source WHERE j.business_id=b AND s.payload->>'invoice'=invoice_key AND s.payload->>'kind'='document' AND s.payload->>'movement'='credit';
  IF p->>'kind'='document' THEN credits:=credits+(p->>'net')::bigint; END IF;
  SELECT coalesce(sum((s.payload->>'gross')::bigint),0) INTO gross FROM accounting_journals j JOIN accounting_sources s ON s.business_id=j.business_id AND s.source=j.source WHERE j.business_id=b AND s.payload->>'invoice'=invoice_key AND s.payload->>'kind'='stock' AND s.payload->>'movement'='Sale';
  IF p->>'kind'='stock' THEN gross:=gross+coalesce((p->>'gross')::bigint,0); END IF;
  SELECT -coalesce(sum((l->>'amountMinor')::bigint),0) INTO recognized FROM accounting_journals j JOIN accounting_sources s ON s.business_id=j.business_id AND s.source=j.source CROSS JOIN LATERAL jsonb_array_elements(j.lines) l WHERE j.business_id=b AND s.payload->>'invoice'=invoice_key AND l->>'account'='Sales revenue';
  RETURN round((original_net+credits)::numeric*(original_net-tracked+gross)/original_net)::bigint-recognized;
 END IF;
 -- Legacy documents were fully fulfilled at cutover, so a new allowance
 -- reverses recognized revenue. It does not recreate the original sale.
 RETURN CASE WHEN p->>'kind'='document' THEN (p->>'net')::bigint ELSE 0 END;
END $$;
--> statement-breakpoint
CREATE FUNCTION sync_accounting(b text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE cfg accounting_cutovers%ROWTYPE; e record; oldhash text; h text; p jsonb;
 lines jsonb; n bigint; tax bigint; total bigint; tracked bigint; cost bigint; revenue bigint; counter text; latest_date date;
BEGIN
 SELECT * INTO cfg FROM accounting_cutovers WHERE business_id=b;
 IF NOT FOUND THEN RETURN; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('accounting:'||b,0));
 IF EXISTS(SELECT 1 FROM jsonb_each_text(cfg.baseline) x LEFT JOIN accounting_sources s ON s.business_id=b AND s.source=x.key WHERE s.source IS NULL OR md5(jsonb_build_object('date',s.date,'payload',s.payload)::text)<>x.value) THEN
  RAISE EXCEPTION 'ACCOUNTING_LOCKED: Opening source history changed. Use a dated correction or credit note.';
 END IF;
 IF EXISTS(SELECT 1 FROM accounting_journals j LEFT JOIN accounting_sources s ON s.business_id=b AND s.source=j.source WHERE j.business_id=b AND j.source<>'opening' AND s.source IS NULL) THEN
  RAISE EXCEPTION 'ACCOUNTING_LOCKED: Posted journal sources cannot be deleted.';
 END IF;
 FOR e IN SELECT * FROM accounting_sources WHERE business_id=b ORDER BY date,source LOOP
  IF cfg.baseline ? e.source THEN CONTINUE; END IF;
  h:=md5(jsonb_build_object('date',e.date,'payload',e.payload)::text);
  SELECT source_hash INTO oldhash FROM accounting_journals WHERE business_id=b AND source=e.source;
  IF FOUND THEN
   IF oldhash<>h THEN RAISE EXCEPTION 'ACCOUNTING_LOCKED: Posted source changed. Use a dated correction.'; END IF;
   CONTINUE;
  END IF;
  SELECT max(date) INTO latest_date FROM accounting_journals WHERE business_id=b;
  IF e.date<cfg.date OR e.date<latest_date THEN
   RAISE EXCEPTION 'ACCOUNTING_DATE: Post on or after the latest journal date. Use a current-dated adjustment for historical changes.';
  END IF;
  p:=e.payload;lines:='[]';
  IF p->>'kind'='document' THEN
   n:=(p->>'net')::bigint;tax:=(p->>'tax')::bigint;total:=(p->>'total')::bigint;tracked:=(p->>'tracked')::bigint;
   IF (p->>'legacyTracked')::boolean AND p->>'movement'='original' THEN
    RAISE EXCEPTION 'ACCOUNTING_COST: Tracked goods require fulfilment records before posting.';
   END IF;
   IF p->>'type'='Sale' THEN
    revenue:=CASE p->>'movement' WHEN 'original' THEN n-tracked WHEN 'credit' THEN accounting_revenue_delta(b,p) ELSE n END;
    lines:=jsonb_build_array(accounting_line('Customer control',total),accounting_line('Sales revenue',-revenue),accounting_line('Deferred sales revenue',-(n-revenue)),accounting_line('Output tax control',-tax));
   ELSE
    IF p->>'movement'='credit' AND n<>0 AND (tracked>0 OR (p->>'legacyTracked')::boolean) THEN
     lines:=jsonb_build_array(accounting_line('Supplier control',-total),accounting_line('Supplier credits pending allocation',n),accounting_line('Input tax control',tax));
    ELSE
     IF p->>'movement'<>'original' THEN tracked:=0; END IF;
     lines:=jsonb_build_array(accounting_line('Supplier control',-total),accounting_line('Inventory purchasing clearing',tracked),accounting_line('Untracked purchase expense',n-tracked),accounting_line('Input tax control',tax));
    END IF;
   END IF;
  ELSIF p->>'kind'='payment' THEN
   n:=(p->>'amount')::bigint*CASE WHEN p->>'direction'='Received' THEN 1 ELSE -1 END;
   lines:=jsonb_build_array(accounting_line('Cash and bank',n),accounting_line(CASE WHEN p->>'partyKind'='Customer' THEN 'Customer control' ELSE 'Supplier control' END,-n));
  ELSIF p->>'kind'='resolution' THEN
   n:=(p->>'cogs')::bigint;
   lines:=jsonb_build_array(accounting_line('Supplier credits pending allocation',n+(p->>'clearing')::bigint+(p->>'expense')::bigint),accounting_line('Cost of goods sold',-n),accounting_line('Inventory purchasing clearing',-(p->>'clearing')::bigint),accounting_line('Untracked purchase expense',-(p->>'expense')::bigint));
  ELSE
   IF p->>'movement' IN ('Opening','Opening valuation') AND coalesce((p->>'cost')::bigint,0)>0 THEN
    RAISE EXCEPTION 'ACCOUNTING_OPENING: Verify opening stock before activation. Afterwards use receipts or explained stock adjustments.';
   END IF;
   IF p->'cost'='null'::jsonb THEN
    RAISE EXCEPTION 'ACCOUNTING_COST: A stock movement needs verified cost in an active accounting workspace.';
   END IF;
   cost:=(p->>'cost')::bigint;
   counter:=CASE p->>'movement' WHEN 'Purchase' THEN 'Inventory purchasing clearing' WHEN 'Supplier return' THEN 'Inventory purchasing clearing' WHEN 'Sale' THEN 'Cost of goods sold' WHEN 'Customer return' THEN 'Cost of goods sold' WHEN 'Transfer in' THEN 'Stock transfer clearing' WHEN 'Transfer out' THEN 'Stock transfer clearing' WHEN 'Supplier cost credit' THEN 'Supplier credits pending allocation' ELSE 'Inventory adjustments' END;
   n:=cost*CASE WHEN (p->>'quantity')::bigint<0 OR p->>'movement'='Supplier cost credit' THEN -1 ELSE 1 END;
   lines:=jsonb_build_array(accounting_line('Inventory',n),accounting_line(counter,-n));
   IF p->>'movement'='Sale' THEN
    revenue:=accounting_revenue_delta(b,p);
    lines:=lines||jsonb_build_array(accounting_line('Deferred sales revenue',revenue),accounting_line('Sales revenue',-revenue));
   END IF;
  END IF;
  IF (SELECT coalesce(sum((x->>'amountMinor')::numeric),0) FROM jsonb_array_elements(lines) x)<>0 THEN
   RAISE EXCEPTION 'ACCOUNTING_UNBALANCED: Journal does not balance.';
  END IF;
  INSERT INTO accounting_journals(business_id,source,date,source_hash,lines) VALUES(b,e.source,e.date,h,lines);
 END LOOP;
 IF (SELECT coalesce(sum((l->>'amountMinor')::numeric),0) FROM accounting_journals j CROSS JOIN LATERAL jsonb_array_elements(j.lines) l WHERE j.business_id=b AND l->>'account'='Inventory')
 <> (SELECT coalesce(sum(s.value_minor),0) FROM warehouse_stock s JOIN products p ON p.id=s.product_id WHERE p.business_id=b) THEN
  RAISE EXCEPTION 'ACCOUNTING_RECONCILIATION: Inventory journals do not reconcile with stock valuation.';
 END IF;
 IF (SELECT coalesce(sum((l->>'amountMinor')::numeric),0) FROM accounting_journals j CROSS JOIN LATERAL jsonb_array_elements(j.lines) l WHERE j.business_id=b AND l->>'account'='Cash and bank')
 <> (SELECT opening_cash_minor+coalesce((SELECT sum(CASE direction WHEN 'Received' THEN amount_minor ELSE -amount_minor END) FROM payments WHERE business_id=b AND status='Completed'),0) FROM businesses WHERE id=b) THEN
  RAISE EXCEPTION 'ACCOUNTING_RECONCILIATION: Cash journals do not reconcile with payments.';
 END IF;
END $$;
--> statement-breakpoint
CREATE FUNCTION accounting_mark_dirty() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE b text; dirty jsonb:=coalesce(nullif(current_setting('finbot.accounting_dirty',true),''),'{}')::jsonb;
BEGIN
 IF TG_OP='DELETE' THEN b:=OLD.business_id; ELSE b:=NEW.business_id; END IF;
 dirty:=dirty||jsonb_build_object(b,true);
 IF TG_OP='UPDATE' AND OLD.business_id IS DISTINCT FROM NEW.business_id THEN dirty:=dirty||jsonb_build_object(OLD.business_id,true); END IF;
 PERFORM set_config('finbot.accounting_dirty',dirty::text,true);RETURN NULL;
END $$;
--> statement-breakpoint
CREATE FUNCTION accounting_source_changed() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE b text; key text; dirty jsonb;
BEGIN
 IF TG_OP='DELETE' THEN b:=OLD.business_id; ELSE b:=NEW.business_id; END IF;
 dirty:=coalesce(nullif(current_setting('finbot.accounting_dirty',true),''),'{}')::jsonb;
 FOR key IN SELECT jsonb_object_keys(dirty) LOOP
  IF (dirty->>key)::boolean THEN
   PERFORM sync_accounting(key);
   dirty:=dirty||jsonb_build_object(key,false);
  END IF;
 END LOOP;
 PERFORM set_config('finbot.accounting_dirty',dirty::text,true);RETURN NULL;
END $$;
--> statement-breakpoint
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['transactions','payments','stock_movements','invoice_corrections','credit_notes','accounting_credit_resolutions','parties','invoices','stock_lines'] LOOP
 EXECUTE format('CREATE TRIGGER accounting_dirty AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION accounting_mark_dirty()',t);
 EXECUTE format('CREATE CONSTRAINT TRIGGER accounting_post AFTER INSERT OR UPDATE OR DELETE ON %I DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION accounting_source_changed()',t);
 END LOOP;
END $$;
--> statement-breakpoint
CREATE FUNCTION accounting_journal_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF EXISTS(SELECT 1 FROM accounting_cutovers WHERE business_id=OLD.business_id) THEN
  RAISE EXCEPTION 'ACCOUNTING_LOCKED: Posted journals are immutable.';
 END IF;RETURN OLD;
END $$;
--> statement-breakpoint
CREATE TRIGGER accounting_journal_guard BEFORE UPDATE OR DELETE ON accounting_journals FOR EACH ROW EXECUTE FUNCTION accounting_journal_immutable();
--> statement-breakpoint
CREATE FUNCTION accounting_opening_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.opening_cash_minor<>OLD.opening_cash_minor AND EXISTS(SELECT 1 FROM accounting_cutovers WHERE business_id=OLD.id) THEN
  RAISE EXCEPTION 'ACCOUNTING_LOCKED: Verified opening cash cannot be edited after activation.';
 END IF;RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER accounting_cash_guard BEFORE UPDATE ON businesses FOR EACH ROW EXECUTE FUNCTION accounting_opening_guard();
