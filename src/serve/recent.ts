import type { ReportStateKey } from "../components/report-state";
import { stateToKey } from "../report/assemble";
import type { IndicatorState } from "../report/indicator";

/**
 * Recent-searches feed (mvp-spec §7b) — ANONYMIZED. Only domain + state +
 * generated_at; NEVER any session/IP/user field. Injected query for testing.
 */

export interface RecentReport {
  domain: string;
  state: ReportStateKey;
  generatedAt: number;
}

export interface RecentDeps {
  getRecentReports: (
    limit: number,
  ) => Promise<Array<{ domain: string; skepticismState: string; generatedAt: number }>>;
}

export async function recentReports(limit: number, deps: RecentDeps): Promise<RecentReport[]> {
  const rows = await deps.getRecentReports(limit);
  // Map the stored green|amber|red|blue → the view's ReportStateKey; drop
  // everything else. The shape is intentionally minimal (no PII).
  return rows.map((r) => ({
    domain: r.domain,
    state: stateToKey(r.skepticismState as IndicatorState),
    generatedAt: r.generatedAt,
  }));
}
