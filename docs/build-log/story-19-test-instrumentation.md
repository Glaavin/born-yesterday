# Build log — Test instrumentation: the three cheap recommendations

- PR: #TBD   - Branch: feature/test-instrumentation   - Base: develop   - Date (UTC): 2026-08-27
- Implements recommendations **1, 2 and 5** from `docs/testing-recommendations.md`.
- **No behaviour change.** Zero state changes, zero reason changes across the corpus.

## 1. Rubric-path labels, and coverage reporting

`Indicator` gains `path: RubricPath` — a diagnostic label naming which branch produced the verdict. It never reaches `Report` and is never rendered.

**Labelled explicitly, not inferred.** The recommendation insisted on this and the work proved why twice:

- Measuring coverage by inferring the path from the reason list **misfiled five domains**, because residual reasons carry `kind: "residual"` and the classifier filtered for `"main"`.
- The same hand-measurement reported **"5 of 8"** paths. The real number is **5 of 9** — `amber-no-reason-spf-unchecked` and `amber-no-reason-archive-unchecked` both emit `verdict(state, [])` and were collapsed into one bucket by eye.

**An instrument that can be wrong in the same way as the code is not an instrument.** Both errors were mine, in the measurement that motivated the fix.

`verdict()` now takes the path as its first argument, so **a new `return` site cannot be added without naming its path — the compiler asks.**

### What the gate now prints, every run

```
── rubric-path coverage ──
   MISS  red-threat-listing                   n=0
   MISS  red-accumulation                     n=0
   HIT   blue-thin-footprint                  n=6
   HIT   green-established-clean              n=32
   HIT   amber-concerns                       n=4
   MISS  amber-residual-no-spf                n=0
   HIT   amber-residual-not-established       n=5
   MISS  amber-no-reason-spf-unchecked        n=0
   HIT   amber-no-reason-archive-unchecked    n=2

   5 of 9 paths entered.  NEVER ENTERED: red-threat-listing, red-accumulation,
   amber-residual-no-spf, amber-no-reason-spf-unchecked
   A clean delta is not evidence about the paths above — it never reached them.
```

Every recent report carried a hand-written sentence to this effect. **It is now output rather than discipline**, and it reaches readers who were not here for the reasoning.

### The unit suite covers what the corpus cannot

A new `describe("rubric-path coverage")` holds a `Record<RubricPath, …>` fixture table — **exhaustive by construction**, because the key type is the union. Adding a return site without adding a case fails the type-check.

Eight paths have a fixture that reaches them and asserts the label. **One is declared unreachable with its reason:** `red-accumulation`, because the concern pool has one member since the pivot was demoted (§3.1, §2.7). Its companion test — *"accumulation is STRICTLY unreachable while the concern pool has one member"* — fails the moment the pool grows, at which point the declaration must become a fixture.

## 2. The failure-mode sweep

`pnpm tsx scripts/corpus-verdicts.ts --sweep` runs the corpus once per collector with that collector forced to `failed`, and reports which verdicts become **unreachable**.

```
   (none — baseline)  green 32  amber 11  blue  6  red  0
   domain-identity    green 32  amber 17  blue  0  red  0
   dns                green  0  amber 43  blue  6  red  0
   certs              green 32  amber 11  blue  6  red  0   ← already failed in baseline: UNINFORMATIVE
   threats            green 32  amber 11  blue  6  red  0   ← already failed in baseline: UNINFORMATIVE
   reputation         green 32  amber 11  blue  6  red  0
   ai-pivot           green  0  amber 49  blue  0  red  0
```

### It found four single points of failure, not one

The recommendation predicted this would catch **B11**. It caught B11 **and three siblings**:

| Finding | |
|---|---|
| **GREEN unreachable when `ai-pivot` fails** | B11 — Wayback lives in this collector; archive span is Green's only route |
| **BLUE unreachable when `ai-pivot` fails** | Blue needs `thinArchive`, which needs the same check |
| **GREEN unreachable when `dns` fails** | Green requires SPF |
| **BLUE unreachable when `domain-identity` fails** | Blue needs `young`, which needs the registration date |

**B11 is not one defect. It is an instance of a class:** three of the four verdicts each depend on a single collector completing, and two collectors each take out two verdicts. With `ai-pivot` down, **all 49 domains return Amber** — which is exactly what production did on 2026-08-27.

Run before the Lithium deploy, this table would have shown `green 0` in one command.

### Uninformative rows are labelled as such

`certs` and `threats` are **already** modelled as failed in the baseline, so forcing them to fail changes nothing — and an unchanged row would read as *"this dependency is safe"* when it means *"we never had it."*

They are flagged inline and repeated at the end:

> **NOT TESTED: certs, threats** — already failed in the baseline, so forcing them to fail proves nothing. Their unchanged rows above are silence, not safety.

**This was not in the recommendation.** Without it the new instrument would have reproduced, in its own output, precisely the defect it was built to remove.

## 3. The harness declares what it cannot model

Printed on **every** run, to stderr:

> **── what this harness cannot model ──**
> · certificate data — 0 of 49 observations carry any (crt.sh 5xx throughout 18.2, and again on 2026-08-27)
> · threat-feed listings — never collected; both feeds modelled as `not_attempted`
> · Trustpilot ratings — 0 observations carry one; `valueText` is always null here
> · live latency — observations came from a **patient 45s** qualifier, so the production **8s** budget is never exercised (B11)
> **Results say NOTHING about these paths.**

These are blind spots baked into the **instrument**, and were previously visible only to someone who read its source. The person reading a delta is usually not that person.

## Verification

- **Zero state changes, zero reason changes** across all 49 domains against the pre-instrumentation run.
- `path` is additive in the ndjson; existing baselines still diff.
- Coverage and blind-spot reports go to **stderr**, so stdout stays machine-readable.
- Tests **191 → 201**: nine path fixtures plus a drift check that the runtime list matches the union.

## Not done — recommendations 3, 4 and 6

Recommendation 3 (invariants over all outputs) and 4 (path-targeted fixtures) are a story, and a natural companion to 19.2. Recommendation 6 (post-deploy smoke check) belongs to whoever owns deploys.

## Gate
`tsc --noEmit` clean · `eslint` clean · `vitest` **201/201** · `next build` clean.
