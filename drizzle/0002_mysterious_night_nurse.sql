CREATE TABLE "threat_hosts" (
	"source" text NOT NULL,
	"host" text NOT NULL,
	"first_seen" bigint NOT NULL,
	CONSTRAINT "threat_hosts_source_host_pk" PRIMARY KEY("source","host")
);
--> statement-breakpoint
CREATE INDEX "idx_threat_hosts_host" ON "threat_hosts" USING btree ("host");