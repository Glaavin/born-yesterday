import { normalizeDomain } from "../lib/domain";
import type { Report } from "../components/report-state";
import type { ReportRow } from "../db/schema";
import type { Signal } from "../signals/types";
import { isFresh } from "./freshness";
import { decideServe } from "./decide";
import { SEARCH_LIMIT_PER_DAY, utcDay } from "./quota";

/**
 * Serve orchestration (mvp-spec §6) — wires the pure decision to the data layer.
 * Deps are INJECTED so this is unit-tested with no DB/network. Note the quota
 * divergence from §6's literal "increment every request": quota gates
 * COLLECTION, not cached views — it protects the expensive op while keeping
 * shared reports viewable (§11). signal_history is APPEND-ONLY (persist, §3).
 */

export type ServeState = "served" | "stale" | "refreshing" | "limit-reached" | "error";
export type Freshness = "fresh" | "stale" | "new" | "none";

export interface ServeResult {
  state: ServeState;
  report?: Report;
  freshness: Freshness;
}

export interface RequestMeta {
  sessionKey: string;
  /** False when the caller could NOT determine a trusted client IP (e.g. no
   *  x-forwarded-for). Such a request can still VIEW already-generated reports,
   *  but must not be able to trigger a new collection: pooling all header-less
   *  requests under one sessionKey shares a single 3/day bucket (accidental
   *  site-wide DoS), and a per-request key would bypass the limit entirely.
   *  Treating it as out-of-quota declines only the expensive, quota-gated action
   *  while keeping cached reports viewable (§11). Defaults to identified.
   *  (Tier 1 · 1c) */
  identified?: boolean;
}

export interface ServeDeps {
  getReport: (domain: string) => Promise<ReportRow | null>;
  getQuota: (sessionKey: string, day: string) => Promise<number>;
  incrementQuota: (sessionKey: string, day: string) => Promise<number>;
  /** Generate a report + the signals to append. */
  collect: (domain: string, nowSec: number) => Promise<{ report: Report; signals: Signal[] }>;
  /** Persist (getOrCreateDomain + saveReport + appendSignalHistory). */
  persist: (domain: string, report: Report, signals: Signal[], nowSec: number) => Promise<void>;
  now: () => number; // epoch SECONDS
  /** Run a refresh after the response (Next after()/waitUntil); fire-and-forget. */
  runBackground: (fn: () => Promise<void>) => void;
}

function parseReport(row: ReportRow): Report {
  return JSON.parse(row.reportJson) as Report;
}

export async function serveReport(
  rawDomain: string,
  meta: RequestMeta,
  deps: ServeDeps,
): Promise<ServeResult> {
  const domain = normalizeDomain(rawDomain);
  if (!domain) return { state: "error", freshness: "none" };

  const nowSec = deps.now();
  const day = utcDay(nowSec);

  const existing = await deps.getReport(domain);
  const fresh = existing != null && isFresh(existing, nowSec);
  const used = await deps.getQuota(meta.sessionKey, day);
  // An unidentified caller has no collection quota (Tier 1 · 1c) — it can still
  // be served a cached report, but cannot trigger the expensive collect.
  const quotaRemaining = meta.identified !== false && used < SEARCH_LIMIT_PER_DAY;

  const decision = decideServe({ existing: existing != null, fresh, quotaRemaining });

  switch (decision.action) {
    case "serve-fresh":
      return { state: "served", report: parseReport(existing!), freshness: "fresh" };

    case "serve-stale":
      return { state: "stale", report: parseReport(existing!), freshness: "stale" };

    case "serve-stale-refresh":
      // The stale report is served now; the refresh is the quota-charged work,
      // so charge up front (the caller IS getting a report). A background failure
      // can't be surfaced and the stale report already stands, so swallow it.
      if (decision.consumesQuota) await deps.incrementQuota(meta.sessionKey, day);
      deps.runBackground(async () => {
        try {
          const t = deps.now();
          const { report, signals } = await deps.collect(domain, t);
          await deps.persist(domain, report, signals, t);
        } catch {
          // Refresh failed; the stale report was already served. Nothing to do.
        }
      });
      return { state: "refreshing", report: parseReport(existing!), freshness: "stale" };

    case "collect": {
      // Charge quota only AFTER a successful synchronous generation. A failed
      // collect/persist must not burn the caller's daily allowance, and must
      // surface as the friendly error state — never a thrown 500 (Tier 1 · 1b).
      let report: Report;
      try {
        const generated = await deps.collect(domain, nowSec);
        await deps.persist(domain, generated.report, generated.signals, nowSec);
        report = generated.report;
      } catch {
        return { state: "error", freshness: "none" };
      }
      if (decision.consumesQuota) await deps.incrementQuota(meta.sessionKey, day);
      return { state: "served", report, freshness: "new" };
    }

    case "limit-reached":
    default:
      return { state: "limit-reached", freshness: "none" };
  }
}

export { SEARCH_LIMIT_PER_DAY };
