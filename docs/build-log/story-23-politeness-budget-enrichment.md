# Build log — Story 23: politeness budget + async enrichment

- Branch: feature/story-23-politeness-enrichment   - Base: develop   - Date (UTC): 2026-09-03
- Type: **Shared harness infrastructure + one collector change.** No rule, threshold or indicator change.
- Authority: roadmap §5-W1 (split), W0 findings, B12 production verification.

## 1 · The `wayback_last` reader audit — answered before building

**Nothing reads it.** Every reference:

| site | role |
|---|---|
| `signals/ai-pivot.ts` | **producer** |
| `signals/ai-pivot.test.ts` | asserts the producer emits it |
| `scripts/corpus-verdicts.ts` | harness reconstructs it; nothing consumes it |
| `story-18-3-amendment.md` §139 | *"collected, never consumed"* — recorded at the time |

**No reader in `report/indicator.ts`, `report/assemble.ts`, `report/derive.ts` or the renderer.** Green consumes the span *start* (`wayback_first`); the Reincarnation Check will compare that start against registration. Neither needs `last`.

**Two second-order effects, both trivial and both checked:**
- `sources[]` is unaffected — `wayback_last` shared `cdxSource` with `wayback_first`, the same URL, and `dedupeSources` deduped them already.
- The *"Surfaces N public signals"* count drops by one on reports where `last` currently succeeds — 1 in 4. It is a count of valued signals, not a claim about the archive.

## 2 · Part 1 — the per-host politeness budget

A concurrency cap in `cached-fetch.ts`, keyed per host, applied to every collector uniformly so no source story reimplements burst protection.

| host | max | basis | why |
|---|---|---|---|
| `web.archive.org` | **1** | **MEASURED** | W0: the second consecutive CDX call hung 30 s with no response. Production confirmed — call 2 succeeded 1 of 4 while call 1 succeeded 3 of 4. |
| `archive.org` | **1** | **MEASURED** | Same operator, same throttle. The Availability API answered in 364 ms but shares the budget rather than being assumed exempt. |
| `index.commoncrawl.org` | **1** | **REASONED** | W0: single lookups 358–394 ms, but the 5-call monthly walk degraded to a 502 and a 13.6 s response. That sequence is the pattern Story 24 would depend on, so it gets a budget **before** it gets traffic. |
| everything else | **no limit** | — | DNS, RDAP and the threat feeds have never demonstrated a burst problem. **Inventing a constraint for a source that has not shown one costs latency and buys nothing.** |

**`budget-exhausted` is a distinct `FetchResult` error.** *"We chose not to call"* and *"we called and nothing came back"* are different facts — the observation-failure convention applies to our own refusals too, and a caller that cannot tell them apart cannot report honestly.

**It fails fast rather than queueing.** A queued call would still be waiting when the 8 s deadline fires, which converts a refusal into a timeout — the exact conflation the error code exists to prevent.

**The token is taken *after* the cache check** (a cache hit makes no call) and released in `finally` (a throw cannot leak one).

**No retries.** W0's evidence is that a throttled Wayback call *hangs* rather than refusing, so a retry is a second full timeout, not a second chance.

## 3 · Part 2 — async enrichment, `wayback_last` as first tenant

**Reuses the existing post-render path** — `deps.runBackground`, the same Vercel `after()` mechanism the stale-refresh already uses. One background path, not two.

- Runs **outside** the 8 s collection deadline (no `signal` is passed) and **under** the Part 1 budget, because it goes through the harness like everything else.
- Appends to `signal_history` with proper status. **Additive; no migration.**
- **A failed enrichment is invisible.** No caveat, no note — the report never claimed it would be there. `realEnrich` returns without writing if it obtained nothing.
- On the hot path `wayback_last` now emits `status: "not_attempted"` with a deferral note — **not `failed`.** We did not call and fail; we chose not to call.

### The diagnosis this design rests on

**It is not "the second call is throttled."** Call 1 consumes most of the page budget and call 2 times out against the remainder — both carry their own 8 s `WAYBACK_TIMEOUT_MS`, but they share a page budget that fits one.

**Which is why a politeness budget alone would have made `wayback_last` worse.** Spacing calls apart lengthens the sequence inside a fixed deadline. The second call had to leave the hot path; the budget protects everything else.

## 4 · Tests — 7 new, 4 confirmed failing first

Against the pre-change code (budget check disabled, enrichment moved off `runBackground`):

| test | fails before |
|---|---|
| a second concurrent call fails fast | ✅ |
| `budget-exhausted` is distinguishable from `timeout` | ✅ |
| the hot path completes when enrichment **throws** | ✅ |
| enrichment runs on the existing post-render path | ✅ |
| the token is released | guard |
| an unbudgeted host is not limited | guard |
| every budget records its basis | guard |

The three guards assert the budget's *boundaries* and so cannot fail against code that never budgets — same shape as Story 21's, and noted rather than counted as evidence.

**One test defect found and fixed while writing them.** The first version did `const first = f(opts)` and immediately called again — but SSRF resolution and the cache lookup sit in front of `fetchImpl`, so nothing was in flight yet and the test measured scheduling rather than the budget. It now awaits a promise the fetch impl resolves on entry.

## 5 · Corpus delta — zero, and **uninformative**

Green 32 · Amber 9 · Blue 6 · Red 0 · no-verdict 2, before and after. **Zero state changes, zero reason changes.**

**This proves nothing here.** The corpus replays saved observations and has no notion of latency or concurrency — it cannot exercise a concurrency limiter or a post-render path. **Sixth §5.1 instance**, and it applies squarely.

**Instrument provenance, per the convention from last story:** the corpus harness `scripts/corpus-verdicts.ts` is the live one in the repo and was regenerated for the B12 signal change. The stale local preview script that produced a false defect report last story was rebuilt from it and is not used here.

## 6 · Production verification — DONE (2026-09-03, via the Story 23.1 operator bypass)

**Enrichment works.** `ghost.org` is the unambiguous proof: the hot path wrote
`wayback_last not_attempted` at 16:52:58, the response went out, and **6 seconds
later** `after()` completed and appended `wayback_last ok "2026-09-03"` at
16:53:04. That is the mechanism W1 needs, confirmed on our plan.

**But it is not reliable, and the reason is stacked failure — carried into W1
as B13 (`docs/open-items.md`).** Enrichment only fires on a *served* report (a
no-verdict returns before the enrichment call). Across 11 fresh domains the
archive was slow enough that **only 2 reached a served report**, and of those
two, **1 enriched** (`ghost.org`) and **1 did not** (`todoist.com`, hot-path row
only after several minutes). So:

- **Upstream:** 9 of 11 never reached a served report — the archive gave up
  inside the 8 s deadline first, so enrichment was never attempted. Anything
  built on `wayback_last` inherits that.
- **The mechanism itself:** even when it fires it does not always complete
  (`todoist.com`). One case cannot distinguish `after()` not finishing from the
  CDX call failing under the budget. **W1 must treat `wayback_last` as
  frequently absent** — exactly what §3's build-log warning already said, now
  with production evidence.

**Timing + page times (Story 23.1 instrumentation, same batch):** 12 timing
rows. No-verdict runs cluster at **~8000 ms** — they hit the deadline, which is
*why* they are no-verdict — while the served reports came in **3.2–6.4 s**, under
the 8.3–9.0 s pre-fix cluster. So the hot path did get faster where it produces
a verdict; the slow tail is the archive timing out, not our own second call
(which no longer runs on the hot path).

## 7 · Contradictions with W0 / B12
**None.** This story is built on those findings and re-derives nothing. The one place it *departs* from the roadmap's framing is Part 1's scope: §5-W1 implies a politeness budget would fix the second call, and the B12 production data shows it would not — the deadline, not the throttle, is what kills it. That is recorded above as the design's premise rather than as a contradiction of a measurement.

## Gate
`tsc --noEmit` clean · `eslint` clean · `vitest` **236/236** (229 → 236) · `next build` clean.
