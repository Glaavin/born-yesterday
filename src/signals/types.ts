import type { NewSignalHistoryRow } from "../db/schema";

/**
 * The collector contract — the template every Helium signal collector (Stories
 * 10–15) reuses: fetch-through-harness → parse (pure) → sourced Signals →
 * signal_history rows. Every emitted value carries its public source; if we
 * can't source a value we don't assert it (null, not a guess).
 */

/** A public source for a value (rendered as a "Source ↗" link in the report). */
export interface SignalSource {
  label: string;
  url: string;
}

/**
 * The OUTCOME of a check, carried separately from its value (Story 18.3 §1.1).
 *
 * A null value alone is ambiguous — it used to mean both "this check did not
 * complete" and "this check completed and found nothing." Those are different
 * facts and the second one is a FINDING:
 *
 *   "ok"            the check RAN to completion. The value may be present
 *                   (found) or null (**checked, found nothing** — a finding,
 *                   which is why this case carries a source: the query we ran).
 *   "failed"        the check was attempted but did not complete (network
 *                   error, timeout, HTTP error, unparseable response).
 *   "not_attempted" the check was never run (missing key, gated, or an upstream
 *                   dependency was unavailable).
 *
 * INVARIANT: a source is carried when (and only when) status is "ok". So
 * `source != null` continues to mean "we have something we can cite," and a
 * failed check can never be mistaken for an observation.
 */
export type SignalStatus = "ok" | "failed" | "not_attempted";

/** One sourced data point. valueText/valueNum are null when not found. */
export interface Signal {
  key: string; // becomes signal_history.signal_type
  label: string;
  valueText: string | null;
  valueNum: number | null;
  source: SignalSource | null;
  /** Did the check run? Required — a null value alone cannot answer it. */
  status: SignalStatus;
  note?: string;
}

/** True when the check ran to completion and found nothing — itself a finding. */
export const isCheckedEmpty = (s: Signal): boolean =>
  s.status === "ok" && s.valueText == null && s.valueNum == null;

export interface CollectorResult {
  collector: string;
  signals: Signal[];
  ok: boolean;
  error?: string;
}

export type Collector<D = unknown> = (
  domain: string,
  deps: D,
) => Promise<CollectorResult>;

/**
 * PURE: map collected Signals to append-only signal_history rows. Sources live
 * in the report JSON (the schema has no source column), so they're dropped here.
 * Signals with no value at all (both null) carry no information and are skipped.
 */
export function signalsToHistory(
  domain: string,
  signals: Signal[],
  capturedAt: number,
): NewSignalHistoryRow[] {
  return signals
    .filter((s) => s.valueText != null || s.valueNum != null)
    .map((s) => ({
      domain,
      capturedAt,
      signalType: s.key,
      valueText: s.valueText,
      valueNum: s.valueNum,
    }));
}
