ALTER TABLE stock_movements ADD COLUMN sequence bigserial;
--> statement-breakpoint
CREATE TABLE "inventory_operations" (
	"id" text PRIMARY KEY NOT NULL,
	"business_id" text NOT NULL,
	"user_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_units" (
	"product_id" text NOT NULL,
	"name" text NOT NULL,
	"factor_milli" bigint NOT NULL,
	CONSTRAINT "product_units_product_id_name_pk" PRIMARY KEY("product_id","name"),
	CONSTRAINT "positive_conversion" CHECK ("product_units"."factor_milli">0)
);
--> statement-breakpoint
CREATE TABLE "stock_lines" (
	"id" text PRIMARY KEY NOT NULL,
	"business_id" text NOT NULL,
	"invoice_id" text NOT NULL,
	"product_id" text NOT NULL,
	"warehouse_id" text NOT NULL,
	"kind" text NOT NULL,
	"expected_milli" bigint NOT NULL,
	"fulfilled_milli" bigint DEFAULT 0 NOT NULL,
	"returned_milli" bigint DEFAULT 0 NOT NULL,
	"reserved_milli" bigint DEFAULT 0 NOT NULL,
	"purchase_minor" bigint DEFAULT 0 NOT NULL,
	"fulfilled_cost_minor" bigint,
	"returned_cost_minor" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "stock_line_valid" CHECK ("stock_lines"."expected_milli">0 and "stock_lines"."fulfilled_milli">=0 and "stock_lines"."fulfilled_milli"<="stock_lines"."expected_milli" and "stock_lines"."returned_milli">=0 and "stock_lines"."returned_milli"<="stock_lines"."fulfilled_milli" and "stock_lines"."reserved_milli">=0 and "stock_lines"."reserved_milli"<="stock_lines"."expected_milli"-"stock_lines"."fulfilled_milli")
);
--> statement-breakpoint
CREATE TABLE "warehouse_stock" (
	"product_id" text NOT NULL,
	"warehouse_id" text NOT NULL,
	"quantity_milli" bigint DEFAULT 0 NOT NULL,
	"reserved_milli" bigint DEFAULT 0 NOT NULL,
	"value_minor" bigint,
	"revision" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "warehouse_stock_product_id_warehouse_id_pk" PRIMARY KEY("product_id","warehouse_id"),
	CONSTRAINT "warehouse_stock_valid" CHECK ("warehouse_stock"."quantity_milli">=0 and "warehouse_stock"."reserved_milli">=0 and "warehouse_stock"."reserved_milli"<="warehouse_stock"."quantity_milli" and ("warehouse_stock"."value_minor" is null or "warehouse_stock"."value_minor">=0))
);
--> statement-breakpoint
CREATE TABLE "warehouses" (
	"id" text PRIMARY KEY NOT NULL,
	"business_id" text NOT NULL,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "stock_mode" text DEFAULT 'Immediate' NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "warehouse_id" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "category" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "variant" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD COLUMN "warehouse_id" text;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD COLUMN "line_id" text;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD COLUMN "cost_minor" bigint;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD COLUMN "value_after_minor" bigint;--> statement-breakpoint
ALTER TABLE "inventory_operations" ADD CONSTRAINT "inventory_operations_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_operations" ADD CONSTRAINT "inventory_operations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_units" ADD CONSTRAINT "product_units_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_lines" ADD CONSTRAINT "stock_lines_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_lines" ADD CONSTRAINT "stock_lines_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_lines" ADD CONSTRAINT "stock_lines_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_lines" ADD CONSTRAINT "stock_lines_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_stock" ADD CONSTRAINT "warehouse_stock_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_stock" ADD CONSTRAINT "warehouse_stock_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "warehouse_business_name" ON "warehouses" USING btree ("business_id","name");
--> statement-breakpoint
DO $$ BEGIN IF EXISTS (SELECT 1 FROM products p WHERE p.stock_milli <> coalesce((SELECT sum(delta_milli) FROM stock_movements s WHERE s.product_id=p.id),0)) THEN RAISE EXCEPTION 'Existing stock does not reconcile with movement history'; END IF; END $$;
--> statement-breakpoint
INSERT INTO warehouses(id,business_id,name) SELECT 'main:'||id,id,'Main warehouse' FROM businesses;
--> statement-breakpoint
INSERT INTO warehouse_stock(product_id,warehouse_id,quantity_milli,value_minor) SELECT id,'main:'||business_id,stock_milli,CASE WHEN stock_milli=0 THEN 0 ELSE NULL END FROM products;
--> statement-breakpoint
UPDATE stock_movements SET warehouse_id='main:'||business_id;
