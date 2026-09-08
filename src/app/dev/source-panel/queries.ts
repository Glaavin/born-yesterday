import { neon } from "@neondatabase/serverless";

/**
 * Read-only historical queries for the source panel — Story 26 (W8).
 *
 * NO NEW TABLES, NO NEW COLUMNS. Everything below reads `signal_history` and the
 * `meta_*` rows Story 23.1 already writes there. All statements are SELECTs.
 *
 * They run through the raw neon tagged-template runner (the same shape the
 * `scripts/*.ts` instruments use), NOT the drizzle write helpers in
 * `db/queries.ts` — the panel has no reason to import a function that can
 * `insert`. The runner is INJECTED so a test can hand every query a spy and
 * assert the emitted SQL is read-only (see the write-prevention sweep in
 * handler.test.ts). Values are always
 * parameterised, never interpolated.
 *
 * WHAT THE HISTORY CANNOT SHOW — stated here because it is a real limit, not an
 * omission: `signal_history.status` is DB-constrained to `ok | failed |
 * not_attempted` (schema check `signal_history_status_check`). The harness's
 * `rate-limited` and `budget-exhausted` outcomes are collapsed to `failed`
 * before a signal is ever persisted (`SignalStatus` has only three members).
 * So the historical status distribution has THREE buckets; the two refusal
 * codes live only in the LIVE probe half, which reads the harness result
 * directly. Distinguishing them historically would need a schema or a
 * persistence change — both out of scope for this read-only story, and reported
 * as a finding rather than smuggled in.
 */

export type Row = Record<string, unknown>;
export type SqlRunner = <T = Row>(
  strings: TemplateStringsArray,
  ...params: unknown[]
) => Promise<T[]>;

let cached: SqlRunner | undefined;

/** The real runner, lazily built from the pooled connection string. */
export function defaultRunner(): SqlRunner {
  if (!cached) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error("DATABASE_URL is not set — the source panel cannot read history.");
    }
    cached = neon(url) as unknown as SqlRunner;
  }
  return cached;
}

/** Clamp a caller-supplied day window into a sane, bounded range. */
export function clampDays(days: unknown, fallback = 30): number {
  const n = typeof days === "number" && Number.isFinite(days) ? Math.floor(days) : fallback;
  return Math.min(120, Math.max(1, n));
}

const sinceEpoch = (days: number) => Math.floor(Date.now() / 1000) - days * 86400;

/**
 * Per-signal success rate, BROKEN OUT BY DAY (W0 item-0's shape, and its
 * lesson: an aggregate said "42% failure" while the daily view showed 11 clean
 * runs then 8 straight failures — a regime change the aggregate hid completely).
 * This is the query the acceptance test re-runs against `wayback_first`.
 */
export function successRateByDay(run: SqlRunner, signalType: string, days: number) {
  const since = sinceEpoch(days);
  return run`
    select to_timestamp(captured_at)::date::text        as day,
           count(*)::int                                 as runs,
           sum((status = 'ok')::int)::int                as ok,
           sum((status = 'failed')::int)::int            as failed,
           sum((status = 'not_attempted')::int)::int     as not_attempted
    from signal_history
    where signal_type = ${signalType}
      and captured_at > ${since}
    group by 1
    order by 1 desc`;
}

/** Status distribution for one signal (the THREE persisted states only). */
export function statusDistribution(run: SqlRunner, signalType: string, days: number) {
  const since = sinceEpoch(days);
  return run`
    select status, count(*)::int as n
    from signal_history
    where signal_type = ${signalType}
      and captured_at > ${since}
    group by status
    order by status`;
}

/**
 * Generation timing from `meta_generation_ms` (Story 23.1). Cache hits do no
 * collection and record no timing row, so this series is real generations by
 * construction — there is nothing to filter out. Operator-tagged runs ARE mixed
 * in the table and are EXCLUDED BY DEFAULT (the whole point of the tag); the
 * toggle includes them.
 */
export function generationTiming(
  run: SqlRunner,
  opts: { includeOperator: boolean; days: number },
) {
  const since = sinceEpoch(opts.days);
  if (opts.includeOperator) {
    return run`
      select to_timestamp(captured_at)::date::text  as day,
             count(*)::int                           as generations,
             round(avg(value_num))::int              as mean_ms,
             min(value_num)::int                     as min_ms,
             max(value_num)::int                     as max_ms
      from signal_history
      where signal_type = 'meta_generation_ms'
        and captured_at > ${since}
      group by 1
      order by 1 desc`;
  }
  return run`
    select to_timestamp(sh.captured_at)::date::text  as day,
           count(*)::int                             as generations,
           round(avg(sh.value_num))::int             as mean_ms,
           min(sh.value_num)::int                    as min_ms,
           max(sh.value_num)::int                    as max_ms
    from signal_history sh
    where sh.signal_type = 'meta_generation_ms'
      and sh.captured_at > ${since}
      and not exists (
        select 1 from signal_history op
        where op.signal_type = 'meta_operator_run'
          and op.domain = sh.domain
          and op.captured_at = sh.captured_at)
    group by 1
    order by 1 desc`;
}

/**
 * No-verdict rate over time — EXACT (§C, Story 21.1). The proxy is retired.
 *
 * Story 21.1 stamps a `meta_no_verdict` row on the no-verdict path only, so the
 * count of those rows IS the no-verdict count — no reconstruction. The
 * denominator is free: every generation (served or no-verdict) records a
 * `meta_generation_ms` row, so the rate is `no_verdicts / generations` per day.
 *
 * The whole 26.1/26.2 `CONJUNCT_SIGNALS` / establishment `bool_or` machinery
 * that used to live here is GONE: it approximated a thing we can now count. Its
 * looseness (traced in 26.2 — no marker existed to count directly, and the
 * establishment axis was masked by `wayback_thin_archive`) was the reason this
 * story exists. The exact series starts at the 21.1 deploy; there is no
 * backfill, so days before it show `no_verdicts = 0` here (the pre-marker window
 * has only the retired proxy's estimate, which is not this view's job to show).
 */
export function noVerdictByDay(run: SqlRunner, days: number) {
  const since = sinceEpoch(days);
  return run`
    select to_timestamp(captured_at)::date::text                              as day,
           count(*) filter (where signal_type = 'meta_generation_ms')::int    as generations,
           count(*) filter (where signal_type = 'meta_no_verdict')::int       as no_verdicts
    from signal_history
    where captured_at > ${since}
      and signal_type in ('meta_generation_ms', 'meta_no_verdict')
    group by 1
    order by 1 desc`;
}

/**
 * Exact no-verdict CAUSE breakdown (Story 21.1). `meta_no_verdict.value_text`
 * carries a stable serialization of the blocked states and the conjuncts each
 * left unknown (see `encodeUndecided`), so grouping by it is the exact answer to
 * "which check, blocking which state, caused the no-verdicts" — the real version
 * of what the retired proxy's per-check breakdown only approximated.
 */
export function noVerdictCauses(run: SqlRunner, days: number) {
  const since = sinceEpoch(days);
  return run`
    select value_text as cause, count(*)::int as n
    from signal_history
    where signal_type = 'meta_no_verdict'
      and captured_at > ${since}
    group by 1
    order by 2 desc, 1`;
}
