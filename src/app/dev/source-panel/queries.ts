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
 * No-verdict candidate rate over time (§C). A day counts a domain when a
 * LOAD-BEARING check for some outrank-capable state could not be settled.
 *
 * TRACED TO STORY 21's PREDICATE, not to the pre-B12 script it was first
 * modelled on. `undecidableFor` (indicator.ts) reads exactly:
 *   · green: `establishment` (DERIVED), `dns_spf`, `concerns` (DERIVED, always known)
 *   · blue:  `domain_age_days`, `wayback_thin_archive`
 * So the load-bearing signals are `dns_spf`, `domain_age_days`,
 * `wayback_thin_archive`, and green's DERIVED `establishment` term.
 * (`concerns` has no persisted signal and is `known: true` always — it can
 * never be the unknown conjunct, so there is nothing to count for it.)
 *
 * ESTABLISHMENT IS A DISJUNCTION (Story 24): `wayback_first` span OR
 * `cc_established` present. It is undecidable only when NEITHER instrument
 * settled it. Story 26.1 counted `wayback_first <> 'ok'` flat, which — since
 * Story 24, where CC rescues most deep archives Wayback can't date — was
 * DOMINATED by the case that did NOT no-verdict. Story 26.2 expresses "both
 * instruments failed" properly: a per-(domain, day) aggregation (`bool_or`),
 * then `wb_first_bad AND NOT cc_present`. Measured impact on live data: e.g.
 * 2026-09-07 flat=2 → tight=0 (both CC-rescued); 2026-09-03 flat=14 → tight=9.
 * For pre-CC days (no `cc_established` row) `cc_present` is false, so the tight
 * form equals the old flat one — it degrades correctly to Wayback-only history.
 *
 * STILL AN UPPER BOUND, and this is not fixable here: a no-verdict writes the
 * SAME `signal_history` shape as a served collection minus the report row
 * (`realPersistAttempt`), with NO distinguishing marker — traced for Story 26.2
 * (there is no `meta_no_verdict` to count directly). Two residual sources of
 * loosening remain: (1) `wayback_first = ok` is treated as establishment-settled
 * even when the 913-day SPAN was short — status alone cannot see the span; a
 * short-but-known span is a known-not-established (correctly NOT a no-verdict),
 * so this errs toward NOT counting, not toward inflation. (2) a non-`ok` SPF/age/
 * thin check is counted even when it was not the conjunct that gated the domain's
 * actual verdict. The per-check status view remains the exact part.
 *
 * `cc_present` = a `cc_established` row with a non-null `value_text` (Story 24:
 * present carries the crawl label; ABSENT is status `ok` with a NULL value and
 * does NOT establish; a failed probe is status `failed`). So "did CC establish"
 * is a value test, not a status test.
 */
export function noVerdictCandidatesByDay(run: SqlRunner, days: number) {
  const since = sinceEpoch(days);
  return run`
    with per_domain_day as (
      select domain,
             to_timestamp(captured_at)::date::text as day,
             bool_or(signal_type = 'wayback_first'        and status <> 'ok')         as wb_first_bad,
             bool_or(signal_type = 'cc_established'        and value_text is not null) as cc_present,
             bool_or(signal_type = 'dns_spf'              and status <> 'ok')         as spf_bad,
             bool_or(signal_type = 'domain_age_days'      and status <> 'ok')         as age_bad,
             bool_or(signal_type = 'wayback_thin_archive' and status <> 'ok')         as thin_bad
      from signal_history
      where captured_at > ${since}
      group by 1, 2
    )
    select day, count(*)::int as domains_with_failure
    from per_domain_day
    where (wb_first_bad and not cc_present)  -- establishment undecidable: neither instrument settled it
       or spf_bad or age_bad or thin_bad
    group by 1
    order by 1 desc`;
}
