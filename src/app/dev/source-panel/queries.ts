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
 * No-verdict candidate rate over time (§C — one cheap SELECT over rows that
 * already exist). A day is counted when a LOAD-BEARING check was non-`ok` for a
 * domain.
 *
 * THE SIGNAL LIST IS TRACED TO STORY 21's PREDICATE, not to the pre-B12 script
 * it was first modelled on. `undecidableFor` (indicator.ts) reads exactly:
 *   · green: `establishment` (DERIVED), `dns_spf`, `concerns` (DERIVED, always known)
 *   · blue:  `domain_age_days`, `wayback_thin_archive`
 * So the persisted conjunct signals are `dns_spf`, `domain_age_days` and
 * `wayback_thin_archive`, plus a proxy for green's establishment term.
 *
 * TWO CORRECTIONS over the original list (Story 26.1):
 *   (a) `wayback_snapshot_count` REMOVED. Since the B12 hotfix it is
 *       `not_attempted` BY DESIGN whenever the count is not exact (≥5 rows —
 *       i.e. every well-archived domain; ai-pivot.ts line ~166). Counting it as
 *       `<> 'ok'` marked every archived domain a load-bearing failure and drove
 *       this trend to a meaningless ~100%.
 *   (b) `wayback_thin_archive` ADDED — the boolean B12 introduced and the actual
 *       Blue thinness conjunct the predicate reads.
 *
 * DELIBERATE MISMATCH, LEFT AS AN UPPER BOUND (not invented away):
 *   · `wayback_first` stands in for green's `establishment` term, but since
 *     Story 24 establishment is a DISJUNCTION — `wayback_first` span OR
 *     `cc_established`. A domain whose `wayback_first` failed but which CC
 *     established did NOT no-verdict, yet is counted here. `cc_established` is
 *     deliberately NOT added: an OR-membership query counts a domain if ANY
 *     listed signal is non-`ok`, so adding it would over-count the opposite case
 *     (CC failed, Wayback fine). Neither single-signal form can express "BOTH
 *     establishment instruments failed", so this stays an upper bound.
 *   · `concerns` (green) has no persisted signal and is `known: true` always, so
 *     it can never be the unknown conjunct — nothing to count.
 * Read this as an UPPER BOUND on the no-verdict rate; the per-check breakdown a
 * reader gets from the status view is the exact part.
 *
 * NOTE (out of scope, reported): `scripts/no-verdict-rate.ts` still carries the
 * uncorrected pre-B12 list and has defect (a). Fixing it is product-script
 * territory, outside `src/app/dev/source-panel/` — flagged, not touched.
 */
const CONJUNCT_SIGNALS = ["wayback_first", "wayback_thin_archive", "dns_spf", "domain_age_days"];

export function noVerdictCandidatesByDay(run: SqlRunner, days: number) {
  const since = sinceEpoch(days);
  return run`
    select to_timestamp(captured_at)::date::text as day,
           count(distinct domain)::int           as domains_with_failure
    from signal_history
    where captured_at > ${since}
      and status <> 'ok'
      and signal_type = any(${CONJUNCT_SIGNALS})
    group by 1
    order by 1 desc`;
}
