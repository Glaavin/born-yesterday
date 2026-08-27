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
 *
 * EVERY signal is recorded, including valueless ones (Story 18.3 §1.1). The old
 * filter — "no value carries no information, skip it" — was wrong twice over:
 *
 *   - A check that RAN and found nothing is a finding ("DMARC absent on this
 *     date"). Dropping it made absence unrecordable.
 *   - A check that FAILED became indistinguishable from a value that
 *     DISAPPEARED. The Phase-2 "what changed" digest would read a DNS timeout
 *     as "DMARC was removed" — a false change event manufactured by a network
 *     hiccup.
 *
 * History records what was true when, and "we didn't look" is part of what was
 * true. `status` is what makes the three cases distinguishable, so it travels
 * with every row.
 */
export function signalsToHistory(
  domain: string,
  signals: Signal[],
  capturedAt: number,
): NewSignalHistoryRow[] {
  return signals.map((s) => ({
    domain,
    capturedAt,
    signalType: s.key,
    valueText: s.valueText,
    valueNum: s.valueNum,
    status: s.status,
  }));
}
