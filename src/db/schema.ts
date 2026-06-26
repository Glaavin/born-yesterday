import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  integer,
  bigint,
  doublePrecision,
  index,
  primaryKey,
  unique,
  check,
} from "drizzle-orm/pg-core";

/**
 * Helium data model — implemented EXACTLY per mvp-spec.md §5.
 *
 * Timestamps are unix epoch SECONDS stored as BIGINT (see docs/conventions.md →
 * "Database"). Migrate forward additively — NEVER drop columns.
 *
 * This file only DECLARES tables; it opens no connection. The runtime client is
 * in ./client.ts and is lazy, so importing the schema is safe at build time.
 */

/** The 4-state contract as STORED in the DB (mvp-spec §5). NOTE: these values
 *  intentionally differ from the view's ReportStateKey; that mapping is Story 16. */
export type SkepticismState = "green" | "amber" | "red" | "blue";

/** The report schema_version the app writes. Starts at 1 (mvp-spec §5). */
export const SCHEMA_VERSION = 1;

// One row per domain we've ever processed.
export const domains = pgTable("domains", {
  domain: text("domain").primaryKey(), // normalized: lowercase, no scheme, no www
  firstSeenAt: bigint("first_seen_at", { mode: "number" }).notNull(),
  lastRefreshedAt: bigint("last_refreshed_at", { mode: "number" }).notNull(),
  searchCount: integer("search_count").notNull().default(0),
});

// Current cached report per domain. Overwritten on refresh.
export const reports = pgTable(
  "reports",
  {
    domain: text("domain")
      .primaryKey()
      .references(() => domains.domain),
    generatedAt: bigint("generated_at", { mode: "number" }).notNull(),
    expiresAt: bigint("expires_at", { mode: "number" }).notNull(), // generated_at + 7 days
    reportJson: text("report_json").notNull(), // JSONB is fine too; TEXT per §5
    skepticismState: text("skepticism_state").$type<SkepticismState>().notNull(),
    schemaVersion: integer("schema_version").notNull(),
  },
  // Defense-in-depth: the column stays TEXT (§5), but the DB itself rejects any
  // value outside the four states. The $type<> guard above is compile-time only.
  (t) => [
    check(
      "skepticism_state_check",
      sql`${t.skepticismState} in ('green', 'amber', 'red', 'blue')`,
    ),
  ],
);

// Longitudinal record. Append-only. The proprietary moat.
export const signalHistory = pgTable(
  "signal_history",
  {
    id: bigint("id", { mode: "number" })
      .generatedAlwaysAsIdentity()
      .primaryKey(),
    domain: text("domain")
      .notNull()
      .references(() => domains.domain),
    capturedAt: bigint("captured_at", { mode: "number" }).notNull(),
    signalType: text("signal_type").notNull(),
    valueText: text("value_text"),
    valueNum: doublePrecision("value_num"),
  },
  (t) => [
    index("idx_signal_history_domain").on(t.domain, t.capturedAt),
    index("idx_signal_history_type").on(t.signalType, t.capturedAt),
  ],
);

// Cached external responses.
export const externalCache = pgTable("external_cache", {
  cacheKey: text("cache_key").primaryKey(),
  fetchedAt: bigint("fetched_at", { mode: "number" }).notNull(),
  expiresAt: bigint("expires_at", { mode: "number" }).notNull(),
  payload: text("payload").notNull(),
});

// Per-session daily search limit (3/day). App/DB-enforced; this table backs it.
export const searchQuota = pgTable(
  "search_quota",
  {
    sessionKey: text("session_key").notNull(), // hashed session/IP identifier
    day: text("day").notNull(), // YYYY-MM-DD
    count: integer("count").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.sessionKey, t.day] })],
);

// Watchlist (post-MVP retention; provisioned now, unused at MVP).
export const watchlistSubscriptions = pgTable(
  "watchlist_subscriptions",
  {
    id: bigint("id", { mode: "number" })
      .generatedAlwaysAsIdentity()
      .primaryKey(),
    email: text("email").notNull(),
    domain: text("domain")
      .notNull()
      .references(() => domains.domain),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
    confirmedAt: bigint("confirmed_at", { mode: "number" }),
  },
  (t) => [unique("watchlist_email_domain_unique").on(t.email, t.domain)],
);

// Inferred row types for the typed DB module (queries.ts).
export type DomainRow = typeof domains.$inferSelect;
export type ReportRow = typeof reports.$inferSelect;
export type NewReportRow = typeof reports.$inferInsert;
export type SignalHistoryRow = typeof signalHistory.$inferSelect;
export type NewSignalHistoryRow = typeof signalHistory.$inferInsert;
export type ExternalCacheRow = typeof externalCache.$inferSelect;
