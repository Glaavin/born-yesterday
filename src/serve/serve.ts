import { normalizeDomain } from "../lib/domain";
import type { Report } from "../components/report-state";
import type { ReportRow } from "../db/schema";
import type { Signal } from "../signals/types";
import type { Undecided } from "../report/indicator";
import { isFresh } from "./freshness";
import { decideServe } from "./decide";
import { SEARCH_LIMIT_PER_DAY, utcDay } from "./quota";
import { operatorRunSignal } from "./meta-signals";

/**
 * Serve orchestration (mvp-spec §6) — wires the pure decision to the data layer.
 * Deps are INJECTED so this is unit-tested with no DB/network. Note the quota
 * divergence from §6's literal "increment every request": quota gates
 * COLLECTION, not cached views — it protects the expensive op while keeping
 * shared reports viewable (§11). signal_history is APPEND-ONLY (persist, §3).
 */

/**
 * `no-verdict` (Story 21) is NOT a fifth verdict. It sits here beside
 * `limit-reached` and `error` — design-system §4.1's non-verdict outcomes —
 * because it says we concluded nothing, not that we concluded something mild.
 */
export type ServeState = "served" | "stale" | "refreshing" | "limit-reached" | "error" | "no-verdict";
export type Freshness = "fresh" | "stale" | "new" | "none";

export interface ServeResult {
  state: ServeState;
  report?: Report;
  freshness: Freshness;
  /** Set only on `no-verdict`: which states we could not rule in or out, and
   *  which checks left them unknowable. Drives the copy and the instrumentation. */
  undecided?: Undecided[];
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
  /**
   * OPERATOR quota bypass (Story 23.1). True ONLY for a request that presented a
   * header matching `BY_OPERATOR_KEY`; the route decides that via
   * `isOperatorRequest`, which fails closed. Bypasses the daily limit for
   * verification, touches NOTHING else, and every bypassed generation is tagged
   * `meta_operator_run` so it is never read back as organic traffic. Absent →
   * false → the normal path is byte-identical to today.
   */
  operator?: boolean;
}

export interface ServeDeps {
  getReport: (domain: string) => Promise<ReportRow | null>;
  getQuota: (sessionKey: string, day: string) => Promise<number>;
  incrementQuota: (sessionKey: string, day: string) => Promise<number>;
  /** Generate a report + the signals to append. `undecided` non-null means the
   *  rubric could not tell the verdicts apart — there is no report to publish,
   *  though the attempt is still worth recording. */
  collect: (
    domain: string,
    nowSec: number,
  ) => Promise<{ report: Report; signals: Signal[]; undecided?: Undecided[] | null }>;
  /** Record the ATTEMPT only — history, no report row (Story 21). */
  persistAttempt: (domain: string, signals: Signal[], nowSec: number) => Promise<void>;
  /**
   * ASYNC ENRICHMENT (Story 23) — signals fetched AFTER the response, outside
   * the collection deadline. Appends to history; the reader never waits on it
   * and never sees it fail.
   */
  enrich: (domain: string, nowSec: number) => Promise<void>;
  /** Persist (getOrCreateDomain + saveReport + appendSignalHistory). */
  persist: (domain: string, report: Report, signals: Signal[], nowSec: number) => Promise<void>;
  now: () => number; // epoch SECONDS
  /** Run a refresh after the response (Next after()/waitUntil); fire-and-forget. */
  runBackground: (fn: () => Promise<void>) => void;
}

/**
 * The ONE place a stored report re-enters the app, and therefore the one place
 * an older shape has to be reconciled with the current one.
 *
 * `neutral` post-dates every report cached before Story 19.1. Normalising here
 * rather than at each render site means a missing field is handled once, where
 * the old shape actually arrives, instead of every consumer remembering.
 * (`reports.schema_version` exists for exactly this and is never read — see
 * `docs/open-items.md` A2. Making it work is its own story; this does not
 * depend on it.)
 */
function parseReport(row: ReportRow): Report {
  const parsed = JSON.parse(row.reportJson) as Report;
  return { ...parsed, neutral: parsed.neutral ?? [] };
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
  const normalQuotaRemaining = meta.identified !== false && used < SEARCH_LIMIT_PER_DAY;
  // OPERATOR BYPASS (Story 23.1): forces collection through regardless of the
  // daily limit. It ONLY lifts the quota gate — identification, hashing and
  // everything Tier 1 hardened are untouched — and a bypassed generation neither
  // consumes quota (guarded below) nor is mistaken for organic (tagged below).
  const bypass = meta.operator === true;
  const quotaRemaining = bypass || normalQuotaRemaining;
  // Appends the operator tag in the SAME history write, so a bypassed generation
  // is self-identifying in `signal_history`. A no-op for organic traffic.
  const tag = (signals: Signal[]): Signal[] => (bypass ? [...signals, operatorRunSignal()] : signals);

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
      // Do not burn the daily allowance on an operator run (Story 23.1).
      if (decision.consumesQuota && !bypass) await deps.incrementQuota(meta.sessionKey, day);
      deps.runBackground(async () => {
        try {
          const t = deps.now();
          const { report, signals } = await deps.collect(domain, t);
          await deps.persist(domain, report, tag(signals), t);
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
        if (generated.undecided && generated.undecided.length) {
          // NO VERDICT (Story 21). Three things follow, and all three are the
          // point rather than side-effects:
          //
          //  · NOT CACHED. `reports` caches verdicts and there is not one. A
          //    seven-day TTL would freeze a transient failure for a week —
          //    exactly the B11 scenario — and `schema_version` is written but
          //    never read (A2), so there is no invalidation to lean on. Not
          //    writing is the only reliable answer.
          //  · NO QUOTA. The visitor asked for a report and did not get one.
          //    Tier 1 (#76) established this for a failed collect; charging here
          //    would repeat the defect it just fixed, one path over.
          //  · HISTORY STILL RECORDED. "We attempted these checks on this date
          //    and they failed" is what the append-only record is for, and it is
          //    the only trace a no-verdict leaves — so it is also the
          //    instrumentation (`scripts/no-verdict-rate.ts`).
          await deps.persistAttempt(domain, tag(generated.signals), nowSec);
          return { state: "no-verdict", freshness: "none", undecided: generated.undecided };
        }
        await deps.persist(domain, generated.report, tag(generated.signals), nowSec);
        report = generated.report;
      } catch {
        return { state: "error", freshness: "none" };
      }
      // Do not burn the daily allowance on an operator run (Story 23.1).
      if (decision.consumesQuota && !bypass) await deps.incrementQuota(meta.sessionKey, day);
      // ENRICHMENT RUNS AFTER THE RESPONSE, on the SAME post-render mechanism
      // the stale-refresh already uses — one background path, not two. It is
      // fire-and-forget by construction: the report above is already built, and
      // the swallow below means a throwing enrichment cannot reach the reader.
      // Asserted by test, because "must not fail the hot path" is the kind of
      // promise that quietly stops being true.
      deps.runBackground(async () => {
        try {
          await deps.enrich(domain, deps.now());
        } catch {
          // A failed enrichment is invisible: the report never claimed it.
        }
      });
      return { state: "served", report, freshness: "new" };
    }

    case "limit-reached":
    default:
      return { state: "limit-reached", freshness: "none" };
  }
}

export { SEARCH_LIMIT_PER_DAY };
