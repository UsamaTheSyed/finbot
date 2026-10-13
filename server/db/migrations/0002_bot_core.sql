CREATE TABLE "bot_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identity_id" uuid NOT NULL,
	"business_id" text NOT NULL,
	"user_id" text NOT NULL,
	"intent" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"result" jsonb,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmed_at" timestamp with time zone,
	"executed_at" timestamp with time zone,
	CONSTRAINT "bot_action_status" CHECK ("bot_actions"."status" in ('pending','confirmed','executed','cancelled','expired','failed'))
);
--> statement-breakpoint
CREATE TABLE "bot_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" text,
	"user_id" text,
	"channel" text NOT NULL,
	"message_id" text NOT NULL,
	"intent" text NOT NULL,
	"action_id" uuid,
	"result" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bot_conversations" (
	"identity_id" uuid PRIMARY KEY NOT NULL,
	"state" jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bot_identities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"business_id" text NOT NULL,
	"channel" text NOT NULL,
	"external_user_id" text NOT NULL,
	"external_chat_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bot_link_tokens" (
	"hash" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"business_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "bot_rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bot_receipts" (
	"key" text PRIMARY KEY NOT NULL,
	"response" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bot_runtime" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bot_actions" ADD CONSTRAINT "bot_actions_identity_id_bot_identities_id_fk" FOREIGN KEY ("identity_id") REFERENCES "public"."bot_identities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bot_actions" ADD CONSTRAINT "bot_actions_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bot_actions" ADD CONSTRAINT "bot_actions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bot_audit" ADD CONSTRAINT "bot_audit_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bot_audit" ADD CONSTRAINT "bot_audit_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bot_conversations" ADD CONSTRAINT "bot_conversations_identity_id_bot_identities_id_fk" FOREIGN KEY ("identity_id") REFERENCES "public"."bot_identities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bot_identities" ADD CONSTRAINT "bot_identities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bot_identities" ADD CONSTRAINT "bot_identities_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bot_link_tokens" ADD CONSTRAINT "bot_link_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bot_link_tokens" ADD CONSTRAINT "bot_link_tokens_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bot_actions_identity_idx" ON "bot_actions" USING btree ("identity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "bot_external_identity_unique" ON "bot_identities" USING btree ("channel","external_user_id","external_chat_id");