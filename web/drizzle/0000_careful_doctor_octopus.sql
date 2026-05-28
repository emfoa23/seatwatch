CREATE TABLE IF NOT EXISTS "crawl_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site" text NOT NULL,
	"run_id" text,
	"status" text NOT NULL,
	"seats_fetched" integer DEFAULT 0 NOT NULL,
	"error" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "events_meta" (
	"site" text NOT NULL,
	"external_event_id" text NOT NULL,
	"event_datetime" timestamp with time zone NOT NULL,
	"title" text,
	"venue" text,
	"last_crawl_at" timestamp with time zone,
	CONSTRAINT "events_meta_site_external_event_id_event_datetime_pk" PRIMARY KEY("site","external_event_id","event_datetime")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"watch_target_id" uuid NOT NULL,
	"channel" text DEFAULT 'email' NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"dedupe_key" text NOT NULL,
	"payload" jsonb,
	"sent_at" timestamp with time zone,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "oauth_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"provider_account_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"order_id" text NOT NULL,
	"toss_payment_key" text,
	"amount_krw" integer NOT NULL,
	"slots_granted" integer DEFAULT 1 NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paid_at" timestamp with time zone,
	"refunded_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "seat_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"site" text NOT NULL,
	"external_event_id" text NOT NULL,
	"event_datetime" timestamp with time zone NOT NULL,
	"seat_id" text NOT NULL,
	"old_status" text,
	"new_status" text NOT NULL,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "slot_inventory" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"free_slots" integer DEFAULT 1 NOT NULL,
	"paid_slots" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text,
	"display_name" text,
	"email_verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "watch_targets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"site" text NOT NULL,
	"external_event_id" text NOT NULL,
	"event_datetime" timestamp with time zone NOT NULL,
	"seat_selector" jsonb NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_checked_at" timestamp with time zone,
	"fulfilled_at" timestamp with time zone
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notifications" ADD CONSTRAINT "notifications_watch_target_id_watch_targets_id_fk" FOREIGN KEY ("watch_target_id") REFERENCES "public"."watch_targets"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "oauth_accounts" ADD CONSTRAINT "oauth_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payments" ADD CONSTRAINT "payments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "slot_inventory" ADD CONSTRAINT "slot_inventory_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "watch_targets" ADD CONSTRAINT "watch_targets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crawl_jobs_site_started_idx" ON "crawl_jobs" USING btree ("site","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "notifications_dedupe_unique" ON "notifications" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_user_sent_idx" ON "notifications" USING btree ("user_id","sent_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "oauth_provider_account_unique" ON "oauth_accounts" USING btree ("provider","provider_account_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "oauth_user_idx" ON "oauth_accounts" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "payments_order_id_unique" ON "payments" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "payments_toss_key_unique" ON "payments" USING btree ("toss_payment_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payments_user_status_idx" ON "payments" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "seat_events_event_time_idx" ON "seat_events" USING btree ("site","external_event_id","observed_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "users_email_unique" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "watch_event_idx" ON "watch_targets" USING btree ("site","external_event_id","event_datetime");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "watch_user_status_idx" ON "watch_targets" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "watch_active_idx" ON "watch_targets" USING btree ("site","external_event_id","event_datetime") WHERE status = 'active';