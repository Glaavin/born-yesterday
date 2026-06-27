/**
 * Report freshness (mvp-spec §3) — 7-day TTL. PURE.
 */
export const REPORT_TTL_SECONDS = 7 * 24 * 3600; // 7 days

/** A report is fresh while its stored expires_at is still in the future. */
export function isFresh(report: { expiresAt: number }, nowSec: number): boolean {
  return report.expiresAt > nowSec;
}
