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
  const quotaRemaining = used < SEARCH_LIMIT_PER_DAY;

  const decision = decideServe({ existing: existing != null, fresh, quotaRemaining });
  if (decision.consumesQuota) await deps.incrementQuota(meta.sessionKey, day);

  switch (decision.action) {
    case "serve-fresh":
      return { state: "served", report: parseReport(existing!), freshness: "fresh" };

    case "serve-stale":
      return { state: "stale", report: parseReport(existing!), freshness: "stale" };

    case "serve-stale-refresh":
      deps.runBackground(async () => {
        const t = deps.now();
        const { report, signals } = await deps.collect(domain, t);
        await deps.persist(domain, report, signals, t);
      });
      return { state: "refreshing", report: parseReport(existing!), freshness: "stale" };

    case "collect": {
      const { report, signals } = await deps.collect(domain, nowSec);
      await deps.persist(domain, report, signals, nowSec);
      return { state: "served", report, freshness: "new" };
    }

    case "limit-reached":
    default:
      return { state: "limit-reached", freshness: "none" };
  }
}

export { SEARCH_LIMIT_PER_DAY };
