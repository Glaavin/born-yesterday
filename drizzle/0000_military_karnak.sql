CREATE TABLE "domains" (
	"domain" text PRIMARY KEY NOT NULL,
	"first_seen_at" bigint NOT NULL,
	"last_refreshed_at" bigint NOT NULL,
	"search_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "external_cache" (
	"cache_key" text PRIMARY KEY NOT NULL,
	"fetched_at" bigint NOT NULL,
	"expires_at" bigint NOT NULL,
	"payload" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"domain" text PRIMARY KEY NOT NULL,
	"generated_at" bigint NOT NULL,
	"expires_at" bigint NOT NULL,
	"report_json" text NOT NULL,
	"skepticism_state" text NOT NULL,
	"schema_version" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "search_quota" (
	"session_key" text NOT NULL,
	"day" text NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "search_quota_session_key_day_pk" PRIMARY KEY("session_key","day")
);
--> statement-breakpoint
CREATE TABLE "signal_history" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "signal_history_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"domain" text NOT NULL,
	"captured_at" bigint NOT NULL,
	"signal_type" text NOT NULL,
	"value_text" text,
	"value_num" double precision
);
--> statement-breakpoint
CREATE TABLE "watchlist_subscriptions" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "watchlist_subscriptions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"email" text NOT NULL,
	"domain" text NOT NULL,
	"created_at" bigint NOT NULL,
	"confirmed_at" bigint,
	CONSTRAINT "watchlist_email_domain_unique" UNIQUE("email","domain")
);
--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_domain_domains_domain_fk" FOREIGN KEY ("domain") REFERENCES "public"."domains"("domain") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signal_history" ADD CONSTRAINT "signal_history_domain_domains_domain_fk" FOREIGN KEY ("domain") REFERENCES "public"."domains"("domain") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watchlist_subscriptions" ADD CONSTRAINT "watchlist_subscriptions_domain_domains_domain_fk" FOREIGN KEY ("domain") REFERENCES "public"."domains"("domain") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_signal_history_domain" ON "signal_history" USING btree ("domain","captured_at");--> statement-breakpoint
CREATE INDEX "idx_signal_history_type" ON "signal_history" USING btree ("signal_type","captured_at");