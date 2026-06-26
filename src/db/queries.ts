import { and, eq, gt, sql } from "drizzle-orm";
import { getDb } from "./client";
import {
  domains,
  reports,
  signalHistory,
  externalCache,
  searchQuota,
  threatHosts,
  type DomainRow,
  type ReportRow,
  type NewReportRow,
  type NewSignalHistoryRow,
  type ExternalCacheRow,
  type NewThreatHostRow,
} from "./schema";

/**
 * Thin, typed data access — one function per §6 verb. NO business logic:
 * no freshness/cache *decisions* (whether to use or regenerate a report) and no
 * signal logic — that lives in Story 16. These functions only read/write rows.
 * Timestamps are written in unix epoch SECONDS (see docs/conventions.md).
 */
const nowSec = () => Math.floor(Date.now() / 1000);

/** Insert the domain if it's new (stamping first_seen / last_refreshed), then
 *  return the row. */
export async function getOrCreateDomain(domain: string): Promise<DomainRow> {
  const db = getDb();
  const ts = nowSec();
  await db
    .insert(domains)
    .values({ domain, firstSeenAt: ts, lastRefreshedAt: ts, searchCount: 0 })
    .onConflictDoNothing();
  const [row] = await db
    .select()
    .from(domains)
    .where(eq(domains.domain, domain));
  if (!row) {
    throw new Error(`getOrCreateDomain: row missing after upsert for ${domain}`);
  }
  return row;
}

/** Bump the per-domain search counter. */
export async function incrementSearchCount(domain: string): Promise<void> {
  const db = getDb();
  await db
    .update(domains)
    .set({ searchCount: sql`${domains.searchCount} + 1` })
    .where(eq(domains.domain, domain));
}

/** The current cached report row for a domain, or null. */
export async function getReport(domain: string): Promise<ReportRow | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(reports)
    .where(eq(reports.domain, domain));
  return row ?? null;
}

/** Upsert the current report (overwritten on refresh). */
export async function saveReport(report: NewReportRow): Promise<void> {
  const db = getDb();
  await db
    .insert(reports)
    .values(report)
    .onConflictDoUpdate({
      target: reports.domain,
      set: {
        generatedAt: report.generatedAt,
        expiresAt: report.expiresAt,
        reportJson: report.reportJson,
        skepticismState: report.skepticismState,
        schemaVersion: report.schemaVersion,
      },
    });
}

/** Append one or more signal rows. APPEND-ONLY — never updates or deletes. */
export async function appendSignalHistory(
  entries: NewSignalHistoryRow | NewSignalHistoryRow[],
): Promise<void> {
  const rows = Array.isArray(entries) ? entries : [entries];
  if (rows.length === 0) return;
  const db = getDb();
  await db.insert(signalHistory).values(rows);
}

/** Return a cached payload only if it hasn't expired (respects expires_at). */
export async function cacheGet(
  cacheKey: string,
): Promise<ExternalCacheRow | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(externalCache)
    .where(
      and(
        eq(externalCache.cacheKey, cacheKey),
        gt(externalCache.expiresAt, nowSec()),
      ),
    );
  return row ?? null;
}

/** Upsert a cached payload with a TTL in SECONDS. */
export async function cacheSet(
  cacheKey: string,
  payload: string,
  ttlSeconds: number,
): Promise<void> {
  const db = getDb();
  const fetchedAt = nowSec();
  const expiresAt = fetchedAt + ttlSeconds;
  await db
    .insert(externalCache)
    .values({ cacheKey, fetchedAt, expiresAt, payload })
    .onConflictDoUpdate({
      target: externalCache.cacheKey,
      set: { fetchedAt, expiresAt, payload },
    });
}

/** Today's search count for a session (0 if none). `day` is a "YYYY-MM-DD"
 *  string supplied by the caller — the day boundary is the caller's decision. */
export async function getSessionQuota(
  sessionKey: string,
  day: string,
): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(searchQuota)
    .where(and(eq(searchQuota.sessionKey, sessionKey), eq(searchQuota.day, day)));
  return row?.count ?? 0;
}

/** Number of locally-stored threat hosts for a source (0 ⇒ never ingested). */
export async function countThreatHosts(source: string): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(threatHosts)
    .where(eq(threatHosts.source, source));
  return row?.c ?? 0;
}

/** Is `host` listed under `source` in the local threat table? */
export async function isThreatHostListed(source: string, host: string): Promise<boolean> {
  const db = getDb();
  const rows = await db
    .select({ h: threatHosts.host })
    .from(threatHosts)
    .where(and(eq(threatHosts.source, source), eq(threatHosts.host, host)))
    .limit(1);
  return rows.length > 0;
}

/** Bulk upsert threat hosts (append-only; keeps the earliest first_seen). */
export async function upsertThreatHosts(rows: NewThreatHostRow[]): Promise<void> {
  if (rows.length === 0) return;
  const db = getDb();
  const CHUNK = 1000;
  for (let i = 0; i < rows.length; i += CHUNK) {
    await db
      .insert(threatHosts)
      .values(rows.slice(i, i + CHUNK))
      .onConflictDoNothing();
  }
}

/** Atomically bump and return the session's count for the given day. */
export async function incrementSessionQuota(
  sessionKey: string,
  day: string,
): Promise<number> {
  const db = getDb();
  const [row] = await db
    .insert(searchQuota)
    .values({ sessionKey, day, count: 1 })
    .onConflictDoUpdate({
      target: [searchQuota.sessionKey, searchQuota.day],
      set: { count: sql`${searchQuota.count} + 1` },
    })
    .returning({ count: searchQuota.count });
  return row.count;
}
