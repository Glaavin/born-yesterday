import type { Signal } from "../signals/types";
import type { Undecided } from "../report/indicator";

/**
 * OPERATOR INSTRUMENTATION that happens to live in a product table (Story 23.1).
 *
 * These are NOT findings. They are never read into a report — reports are
 * assembled from the live `CollectorResult[]`, never from `signal_history` — and
 * they are appended to the flattened signal list AFTER `assembleReport` has run,
 * so assembly is structurally blind to them (the "Surfaces N signals" count is
 * computed over `results`, which never contains these). A test asserts a report
 * built through the serve path references neither.
 *
 * They ride the EXISTING history write (`signalsToHistory` → `appendSignalHistory`),
 * so recording them costs no extra round trip and cannot perturb the duration
 * being measured.
 *
 * The `meta_` prefix is the contract: nothing in `report/` reads a key with it,
 * and nothing should start.
 */
export const META_GENERATION_MS = "meta_generation_ms";
export const META_OPERATOR_RUN = "meta_operator_run";

/**
 * Total wall-clock of a report GENERATION (collection → assembly), in ms.
 * Only produced on the collect path, so cache hits — which do no collection —
 * never record one and cannot poison the series with near-zero values.
 *
 * Read back (mirrors W0 item 0's documented-query discipline):
 *
 *   select to_timestamp(captured_at)::date as day,
 *          count(*)::int                    as generations,
 *          round(avg(value_num))::int       as mean_ms,
 *          min(value_num)::int              as min_ms,
 *          max(value_num)::int              as max_ms
 *   from signal_history
 *   where signal_type = 'meta_generation_ms'
 *   group by 1 order by 1 desc;
 */
export function generationTimingSignal(durationMs: number): Signal {
  return {
    key: META_GENERATION_MS,
    label: "Generation duration (ms)",
    valueText: null,
    valueNum: durationMs,
    source: null,
    status: "ok",
  };
}

/**
 * Marks a generation as OPERATOR-driven (quota-bypassed), so a bypassed report
 * is never counted as organic traffic when the numbers are read later — the
 * exact way a mixed sample would have been worthless in the Story 23
 * verification.
 *
 * Read back — organic generations only:
 *
 *   select sh.domain, sh.value_num as gen_ms
 *   from signal_history sh
 *   where sh.signal_type = 'meta_generation_ms'
 *     and not exists (
 *       select 1 from signal_history op
 *       where op.signal_type = 'meta_operator_run'
 *         and op.domain = sh.domain and op.captured_at = sh.captured_at);
 */
export function operatorRunSignal(): Signal {
  return {
    key: META_OPERATOR_RUN,
    label: "Operator run",
    valueText: "operator",
    valueNum: null,
    source: null,
    status: "ok",
  };
}

/**
 * NO-VERDICT MARKER (Story 21.1). Written ONLY on the no-verdict path
 * (`serveReport`'s `persistAttempt` branch), so counting these rows is the EXACT
 * no-verdict count — not the reconstructed upper bound the 26.1/26.2 proxy gave.
 * The denominator is free: every generation, served or no-verdict, records a
 * `meta_generation_ms` row, so the rate is `count(meta_no_verdict) /
 * count(meta_generation_ms)` per day.
 *
 * WHY IT EXISTS: §3.2 says a no-verdict should fire rarely and, if it does not,
 * the fix is upstream. That constraint was unevaluable — Story 21 writes no
 * report row and (26.2) the attempt's history is byte-shaped like a served
 * collection's, with no marker. This is the marker; it makes a DECIDED rule
 * measurable. The panel count is a consequence, not the point.
 *
 * `valueText` carries the DECIDED CAUSE so the count is also the exact cause
 * breakdown — a stable, sorted serialization of the blocked states and the
 * conjuncts each left unknown, e.g. `green:dns_spf,establishment;blue:wayback_thin_archive`.
 * ONE row per no-verdict outcome (not per blocked state): the primary question
 * is the rate, cleanest as `count(rows)`; the cause distribution is a group-by
 * over `value_text`.
 *
 * Same discipline as the markers above: the `meta_` prefix is the contract
 * (nothing in `report/` reads it), and it is appended AFTER assembly so it can
 * never reach a report or the "Surfaces N signals" count.
 */
export const META_NO_VERDICT = "meta_no_verdict";

/** Stable, deterministic serialization of the no-verdict cause. Sorted at both
 *  levels so identical causes collapse to one `value_text` for group-by. */
export function encodeUndecided(undecided: Undecided[]): string {
  return undecided
    .map((u) => `${u.blocked}:${[...u.unknown].sort().join(",")}`)
    .sort()
    .join(";");
}

export function noVerdictSignal(undecided: Undecided[]): Signal {
  return {
    key: META_NO_VERDICT,
    label: "No-verdict outcome",
    valueText: encodeUndecided(undecided),
    valueNum: null,
    source: null,
    status: "ok",
  };
}
