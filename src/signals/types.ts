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

/** One sourced data point. valueText/valueNum are null when not found. */
export interface Signal {
  key: string; // becomes signal_history.signal_type
  label: string;
  valueText: string | null;
  valueNum: number | null;
  source: SignalSource | null;
  note?: string;
}

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
