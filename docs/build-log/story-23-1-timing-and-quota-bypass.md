# Build log — Story 23.1: page timing + dev quota bypass

- Branch: feature/story-23-1-timing-quota-bypass   - Base: develop   - Date (UTC): 2026-09-03
- Type: **Instrumentation + operator tooling.** No rule, report, or reader-facing change.
- Both parts additive: no migration, no serve-path refactor, no change to caller identification. (Scope boundary held — see below.)

## Part 1 — page timing

**What is recorded:** total wall-clock of a generation (collection → assembly), in ms, as a `signal_history` row with `signal_type = "meta_generation_ms"`, `value_num = ms`.

**Per-collector timing is NOT recorded.** `collect-all` tracks none, and the story forbids refactoring it to. Total only, as instructed.

**Where:** in `realCollect`, wrapping `collectAll`. The signal is appended to the flattened signal list the function already returns, so it rides the existing `signalsToHistory → appendSignalHistory` write — **no extra round trip**, and nothing perturbs the duration being measured (constraint 2).

**Cache-hit handling: not recorded on cache hits, and this is structural rather than a guard.** Timing exists only on the collect path; `serve-fresh` / `serve-stale` never call collect, so a cached serve produces no timing row and cannot poison the series with near-zero values (constraint 1). `serve-stale-refresh`, which *does* collect (in the background), is correctly timed.

**Read-back query** (documented in `meta-signals.ts`, mirroring W0 item 0):

```sql
select to_timestamp(captured_at)::date as day,
       count(*)::int                    as generations,
       round(avg(value_num))::int       as mean_ms,
       min(value_num)::int              as min_ms,
       max(value_num)::int              as max_ms
from signal_history
where signal_type = 'meta_generation_ms'
group by 1 order by 1 desc;
```

### It cannot reach a report (constraint 3)

Two independent reasons, either sufficient:

1. **Reports are assembled from `CollectorResult[]`, never read back from `signal_history`.** Any row not in the `results` passed to `assembleReport` is invisible to it by construction.
2. **The timing signal is appended AFTER `assembleReport` has run, and is not a member of `results`.** The "Surfaces N signals" count, `sources[]`, and every finding are all computed over `results` — none sees it.

Asserted on the **assembled output**, per the story: a serve-path test injects a timing signal into the collect result exactly as `realCollect` does, then asserts the served `report` JSON contains neither `meta_generation_ms` nor the ms value, while `persist` still received it. `meta_` is the naming contract — nothing in `report/` reads such a key.

## Part 2 — dev quota bypass

**Mechanism:** a request header `x-by-operator` compared to the private env var `BY_OPERATOR_KEY`, via `isOperatorRequest(headerValue, envKey)`. A header-vs-env compare is the shape the story anticipated; it fits the serve path's existing "read headers in the route, pass a flag into `serveReport`" pattern (the same shape as Tier 1's `identified`), so no change to how callers are identified.

**Fails closed** — asserted three ways in `quota.test.ts`: env key unset/empty → false; header absent → false; mismatch → false. Only an exact, non-empty match opens it. `BY_OPERATOR_KEY` is unset in production by default.

**Normal path byte-identical when off.** `bypass = meta.operator === true`, and `meta.operator` is only ever true when `isOperatorRequest` returned true, which requires the env key. With it unset, `bypass` is always false and every downstream expression (`quotaRemaining`, the increment, the tag) reduces to exactly today's code. A test asserts quota-spent + no-bypass still returns `limit-reached` with no collect and no increment.

**What bypass does, and only this (quota, nothing else):**
- forces `quotaRemaining = true`, so a spent-quota caller still reaches `collect` / `serve-stale-refresh`;
- **skips the increment** (`&& !bypass`), so verification does not burn the daily allowance;
- **tags the generation** with a `meta_operator_run` row, appended to the same history write.

Untouched: `SERVER_SALT`, the IP hashing, `identified`, and everything Tier 1 (#76) hardened. The bypass lifts the quota gate and touches no other gate.

**The trace, and why it matters:** a bypassed report is self-identifying in `signal_history`. The Story 23 verification's five-organic-collections sample would have been worthless if operator runs were mixed in; the read-back query excludes them:

```sql
select sh.domain, sh.value_num as gen_ms
from signal_history sh
where sh.signal_type = 'meta_generation_ms'
  and not exists (
    select 1 from signal_history op
    where op.signal_type = 'meta_operator_run'
      and op.domain = sh.domain and op.captured_at = sh.captured_at);
```

## Tests

| test | kind |
|---|---|
| operator bypass collects when quota spent; no increment; tagged | **fails against pre-change code** ✓ |
| quota spent + no bypass → limit-reached, no collect, no increment | guard (normal path unchanged) |
| organic generation is not tagged operator | guard |
| a timing row rides the write but never reaches the report | property assertion on assembled output |
| `isOperatorRequest` fails closed — 3 cases | unit |

Honest note on "confirmed failing first": **one behavioural test genuinely fails without the feature** (the bypass). The timing-leak test is a *property* assertion — it holds whether or not the timing append exists, because it proves the serve path passes the report through untouched — so it is not sensitive to the Part 1 code being present. The two "unchanged" tests are guards by design. The actual timing append lives in `realCollect`, which has real socket deps and is not unit-testable; **production is its real gate** (below), the same standard used for enrichment in Story 23.

## Corpus delta — zero, and expected

Green 32 · Amber 9 · Blue 6 · no-verdict 2, unchanged. **Zero state changes, zero reason changes.** Both parts are additive instrumentation; a move here would have meant one of them touched the rubric, which neither does.

## Production check — after promote
Run one report with the `x-by-operator` header and one without, then show: both `meta_generation_ms` rows (proving timing lands on real generations), and the `meta_operator_run` row on the bypassed one only (proving the trace and that organic runs are untagged).

## Gate
`tsc --noEmit` clean · `eslint` clean · `vitest` **243/243** (236 → 243) · `next build` clean.
