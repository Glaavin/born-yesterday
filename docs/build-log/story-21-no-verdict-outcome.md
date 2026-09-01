# Build log — Story 21: the no-verdict outcome

- PR: #TBD   - Branch: feature/story-21-no-verdict   - Base: develop   - Date (UTC): 2026-08-27
- Type: **New terminal state.** Indicator, serve path, renderer, instrumentation.
- Authority: `story-18-3-amendment.md` §3.2, with three corrections recorded back into it.

## 1. The trigger as built

**A conjunct-level reachability predicate.** A state is undecidable when it was denied by an **unknown** conjunct while every conjunct we could evaluate held. *Denied by a false conjunct is a conclusion; denied by an unknown one is a gap wearing a conclusion's clothes.*

```
green ← wayback_first (span) · dns_spf · concerns.length === 0
blue  ← domain_age_days (young) · wayback_snapshot_count (thin)
```

**Not the load-bearing set §3.2 expected**, because *load-bearing is not a stable property of a check*:

- `dns_spf` fails on a 3-day-old domain → **Blue fires correctly.** Both conjuncts intact.
- `dns_spf` fails on a domain archived since 1998 → **Green unreachable**, Amber is an artifact.
- `wayback_first` fails on a domain with no SPF and no DMARC → **the concern fires and Amber is supported by evidence.** A named set containing the archive check would have suppressed a correct, sourced Amber.

**Not a count either.** Recorded in §3.2 as a **conflation, not a deferral** — it asked *"is this report thin?"* when the rule needs *"can we tell the verdicts apart?"* A sparse but sound report should publish. The predicate is an array of causes, so a count can join as one more entry if a real trigger appears — §3.2's implementation constraint honoured without shipping a number calibrated against nothing.

**A distinction worth keeping:** archive span (§19.1) is context-dependent in what the fact **means** — that needs a human. This is context-dependent in **reachability** — that needs a predicate. They look alike and are not.

## 2. Precedence — the fix, and one thing found while building

**"After Red" does not compose, because Red is not one position.** The chain runs `red-listing → Blue → red-accumulation → Green → Amber`; an early check placed after the listing branch silently preempts `red-accumulation`. Unreachable today (§3.1); a suppressed Red the moment the concern pool grows.

**Resolution: evaluate inside the single `verdict()` constructor.** Ordering-safe by construction — no return site can bypass it, and Red is exempted wherever Red is *produced* rather than wherever it sits. The code says why, so the next person who wants to hoist it reads the reason first.

**Found while building: only a state that could have OUTRANKED the verdict counts.** If Blue fires on known evidence, Green being unknowable is irrelevant — Green sits beneath Blue and could not have won. Without the rank comparison, a correct Blue is suppressed by a state below it.

The converse is real and must convert: **`secondlibrary.com`** — 13-year span, 2 captures — reaches Green while **Blue** is unknowable because the registration lookup failed. Story 18: a clean bill is not certified on a thin footprint.

**Red-by-listing is excluded from the predicate, deliberately.** An unreachable feed does not *deny* Red — it is a disjunctive **positive** trigger, so a failed feed leaves it unfired, and the *"not independently cleared"* disclosure already says so. Including it would make **every** report a no-verdict, since the feeds are key-gated and routinely not attempted.

## 3. Not cached · no quota · history recorded

- **No report row.** `reports` caches verdicts and there is not one. A seven-day TTL would freeze a transient failure for a week — the B11 scenario — and `schema_version` is written but never read (A2), so there is no invalidation to lean on.
- **No quota charged.** Tier 1 (#76) established this for a failed collect; this is the same category one path over. It composes rather than fights: #76 had already moved `incrementQuota` after successful generation, so the insertion point existed.
- **History still recorded**, via a new `persistAttempt` (domain + `appendSignalHistory`, no `saveReport`). This is also the instrumentation — it is the **only** trace a no-verdict leaves.

**One design note that would otherwise have surfaced mid-build:** no-verdict is decided *inside* the indicator, and collectors are non-throwing, so Tier 1's `catch` never sees it. `collect` carries the outcome out as a return value.

## 4. The copy

> **We couldn't finish checking this one**
>
> A source we rely on didn't answer in time, so we'd only be guessing. Nothing here is a finding about **example.com** — it's about our checks, not the site. Reload in a minute and we'll try again; this usually clears on its own.

**Every word is about us.** *"This domain couldn't be reached"* would transfer our failure onto the subject — inaccurate, and for a company being checked, adverse. That is the L-10 class of error in a new place.

**It reads as effort, not error.** Mascot state `checking-again`, deliberately not `error` — `error` is invalid input, where the reader did something wrong. This is us falling short.

**Retry: the honest answer is "show the state and invite a reload".** No automatic in-request retry. The collection deadline is 8s and archive.org has been observed at 38–60s, so a retry inside the request would burn the budget and fail again. A bounded client-side re-attempt would be inventing something that will not work. The copy sets the expectation instead.

**Mascot art is Beryllium work** — all eight states currently share one asset, so the mascot does not yet indicate anything. The state name is wired so the art has somewhere to land.

## 5. Instrumentation — and its first run is a finding

`pnpm tsx scripts/no-verdict-rate.ts [days]`. A script, not a dashboard; no analytics package installed and this does not justify one.

§3.2: *"this should fire rarely. If it fires often, that is a symptom — and the fix is upstream, not a better failure message."* **Against production history, 30 days:**

| load-bearing check | ok | failed |
|---|---|---|
| `dns_spf` | 32 | 0 |
| `domain_age_days` | 33 | 0 |
| **`wayback_first`** | **5** | **6** |
| **`wayback_snapshot_count`** | **6** | **6** |

**The archive check failed on more than half its attempts.** Small n — there is almost no traffic — but the split is stark and it is the only check failing at all.

**So the answer to §3.2's question is: it will fire often, and that is the symptom §3.2 said to read it as.** Story 21 makes the failure honest rather than misleading; **it does not make it rare.** The upstream fix is the other half of B11 and is out of scope here. Recorded as **B12**.

The script states its own limit: history rows do not record which verdict was blocked, so it reports **candidate** conditions — an upper bound on the rate, and an exact answer on the cause.

## 6. Verdict delta — and it proves more than expected

| | green | amber | blue | red | no-verdict |
|---|---|---|---|---|---|
| before | 32 | 11 | 6 | 0 | — |
| **after** | **32** | **9** | **6** | **0** | **2** |

**Exactly `github.com` and `kexp.org`**, both blocked on `green` by an unknown `wayback_first`.

> **B5 AND B11 ARE ONE PROBLEM, and this is the evidence.** The predicate was derived from *"can we tell the verdicts apart?"* — a completely different question from *"why is this Amber empty?"* — and it fires on **exactly** the two domains B5 named. **Two independently-derived rules converging on the same two cases is not coincidence.** Both register items are closed together.

**The failure-mode sweep now reads correctly too**, and its numbers changed shape rather than size:

```
   (none — baseline)  green 32  amber  9  blue  6  red  0  no-verdict  2
   domain-identity    green 31  amber  8  blue  0  red  0  no-verdict 10
   dns                green  0  amber  5  blue  6  red  0  no-verdict 38
   ai-pivot           green  0  amber  3  blue  0  red  0  no-verdict 46
```

With the archive down it is **46 no-verdict and 3 Amber**, not 49 Amber. **Those 3 are the case-C domains** — real sourced concerns that publish correctly despite the gap. The predicate is legible in the sweep.

*The corpus proves little here in general* — every corpus domain has completed checks, which is why B11 was found in production rather than in the delta. It happens to carry seven domains whose Wayback pass failed, which is why it exercises this at all.

## 7. Tests — 11 new, and mutation-tested

**5 fail against pre-fix code** (predicate neutralised, serve branch disabled): the two indicator trigger tests and all three serve tests.

**6 are guard tests** asserting the predicate does *not* fire. They cannot fail against code that never fires it, so **their force was verified by mutation instead** — three deliberate wrong implementations, each killed:

| mutant | killed by |
|---|---|
| drop the precedence filter | *"a state BELOW the verdict does not suppress it"* |
| treat threat feeds as a conjunct | *"threat feeds unreachable do NOT make everything undecidable"* |
| treat unknown the same as false | *"archive unknown but a REAL sourced concern → a verdict"* |

**The first mutant initially killed nothing, and that was a defect in my test.** The fixture set a short-but-*known* span, so Green was denied by a **false** conjunct and the precedence filter never engaged — the test asserted the right thing about the wrong scenario. Rewritten so `wayback_first` fails while `wayback_snapshot_count` succeeds, which also exercises the fact that Green's two archive conjuncts read **different signals**.

**This is recommendation 3 from `docs/testing-recommendations.md` arriving early, by hand.** A guard test that passes against every implementation is not evidence.

## 8. Register changes
- **B5 — closed.** Fixed, and the convergence is the reason.
- **B11 — half closed.** The no-verdict half is built; *whether Green needs a second establishment instrument remains open* and is a separate decision.
- **A3 — closed.** 19.1 made the source invariant structural; the residue is an invariant assertion over output, not a `subkind`.
- **B12 — new.** The archive check fails more than half the time, measured.
- **§3.2 — three corrections**: the count was a conflation; "after Red" does not compose; Red-by-listing is excluded.

## Files changed
`src/report/indicator.ts` · `src/serve/serve.ts` · `src/serve/runtime.ts` · `src/components/Mascot.tsx` · `src/app/r/[domain]/page.tsx` · `scripts/no-verdict-rate.ts` (new) · `scripts/corpus-verdicts.ts` · tests · `docs/decisions/story-18-3-amendment.md` · `docs/open-items.md` · this log

## Gate
`tsc --noEmit` clean · `eslint` clean · `vitest` **225/225** (213 → 225) · `next build` clean.
