# Improving the tests — recommendations

**Type:** Recommendation. Nothing here is decided.
**Date:** 2026-08-27, after the Lithium build run and the two-defect hotfix (PR #64).
**Companion:** `story-18-3-amendment.md` §5.1 and §5.3, `docs/open-items.md` §C.

---

## The diagnosis

We have two verification instruments and **neither has any detection power for the class of defect that keeps getting through.**

| | what it does well | what it cannot see |
|---|---|---|
| **Unit tests** (191) | anything you can construct | anything you did not think of — they are written by whoever wrote the code, at the same time, under the same assumptions |
| **Corpus delta gate** (49 domains) | real data, catches things nobody thought of | anything real domains do not do |

The gap is the intersection: **paths real domains do not take and nobody thought to unit-test.**

**Six have been found. Every single one was found by reading code, not by a test failing.**

1. Certificate behaviour — 0 of 49 domains carry certificate data
2. Accumulation, entirely — corpus maximum is one concern
3. *"A failed check blocks Green"* — every corpus domain has `dns_spf` status `ok`
4. `THIN_SNAPSHOT_COUNT`'s failure mode — no heavily-crawled young domain
5. Trustpilot ratings published as positive — no observation carries a rating
6. The established-no-SPF residual citing Wayback — 0 of 49 reach the branch

**Measured, not asserted.** `computeIndicator` has **eight** distinct return paths. The corpus delta gate — our review artifact for four consecutive stories — enters **five**:

```
HIT    blue                                  n=6
HIT    green                                 n=32
HIT    amber-with-concerns                   n=4
HIT    amber, NO reason at all               n=2
HIT    amber residual, not established       n=5
MISS   red-by-listing                        n=0
MISS   red-by-accumulation                   n=0
MISS   amber residual, SPF checked + absent  n=0
```

**Three of eight rubric paths have never been entered by the gate.** Two of the six defects above live on exactly those paths.

**And the characterization matters more than the count** (§5.1): these are not six unrelated omissions. **Every gap is a path that does not correspond to a verdict** — a failure mode, a degraded branch, a rare conjunction. The corpus was built so every *outcome* had a triggering candidate, which selects for outcomes and is structurally blind to routes. **Adding domains will not fix it.**

---

## Recommendations, in value order

### 1. Make the gate report path coverage, not just diffs
**~30 lines. Do this first.**

Every recent report has contained a hand-written sentence saying *"zero changes, and that proves nothing here."* **That sentence should be output, not discipline.**

Label each `return verdict(...)` site and have `corpus-verdicts.ts` tally them, so every run ends with:

```
5 of 8 rubric paths exercised — NEVER ENTERED: red-by-listing,
red-by-accumulation, amber residual (SPF checked + absent)
```

A clean delta then arrives with its own caveat attached, permanently, for whoever reads it next — including the readers who were not here for the reasoning.

**Label the sites explicitly; do not infer the path from output shape.** Inferring is what I did when measuring the table above, and I got it wrong on the first attempt — residual reasons carry `kind: "residual"`, so filtering for `"main"` silently misfiled five domains. An instrument that can be wrong in the same way as the code is not an instrument.

### 2. A failure-mode sweep: run the corpus with each collector forced to fail
**~20 lines. This would have caught B11 before it deployed.**

```bash
FAIL_COLLECTOR=wayback pnpm tsx scripts/corpus-verdicts.ts
```

Run once per collector; report which verdicts become **unreachable**. With Wayback failed, Green goes to **zero across all 49 domains** — B11, visible in one command, before the production deploy rather than minutes after it.

This is the highest-value new capability because it converts a whole class — *"what happens when a dependency is down?"* — from unaskable to a one-line question. It also partly addresses the live-versus-recorded gap: the harness cannot model archive.org's latency, but it can model **the outcome** of that latency.

**Suggested gate:** if any single collector failing takes a verdict to zero reachability, that is a finding requiring a decision, not a warning to scroll past.

### 3. Invariants over every output, instead of examples
**~60 lines. This is the copy discipline becoming a check.**

Several project rules are universally quantified, and are currently enforced by remembering them. Assert them across every reason emitted by every fixture:

- **§6.2 symmetry** — every published reason carries a source
- **No composed arguments** — no finding text contains ` but `, ` however `, ` despite `, or a semicolon joining two clauses
- **Claim/source agreement** *(heuristic, and it is enough)* — a reason mentioning SPF / DMARC / email-authentication must cite DNS; *Archived* / *Wayback* must cite Wayback; *certificate* / *TLS* must cite crt.sh; *registered* / *registration* must cite RDAP or WHOIS
- **Observation failure is not absence** — no reason states a value drawn from a signal whose status is not `ok`

**The third would have caught defect 2 exactly. The second would have caught the "but".** Both defects in the last hotfix were introduced *by a correction fixing the same class of defect* — which is the argument for making these checks rather than conventions. You cannot see a property of your own prose while you are concentrating on the claim it makes.

### 4. Path-targeted fixtures, following the Story 18.2 precedent
**One story. Small.**

18.2 already built synthetic accumulation fixtures because real 4+-flag domains do not exist. **Generalise it: one fixture per rubric path no real domain reaches.** Today that is three.

The mechanism that keeps it true matters more than the fixtures: **a test that fails when a new `return verdict(...)` appears without a corresponding fixture.** Otherwise this decays the first time someone adds a branch in a hurry.

This is explicitly *not* "write tests for everything." It is "every enumerated path has at least one."

### 5. Make the harness declare what it cannot model
**~10 lines. Nearly free.**

`corpus-verdicts.ts` hardcodes `first_cert_date: "failed"`, threat feeds `"not_attempted"`, and `trustpilot.valueText: null`. **Those are blind spots baked into the instrument**, and they are only visible to someone who reads its source.

Print them every run:

> *This harness cannot model: certificate data (0 observations), threat listings (never collected), Trustpilot ratings (0 observations). Results say nothing about these paths.*

### 6. A post-deploy smoke check
**Ops, not unit tests — but it is the real instrument for B11's class.**

No offline fixture can catch *"archive.org answers in 60 seconds from Vercel."* What catches it is fetching two or three known domains after a deploy and asserting the verdict distribution is not degenerate — e.g. *at least one Green among a set of long-established domains.*

B11 was caught this way by hand, minutes after deploying. **It should not have depended on someone deciding to look.**

---

## What not to do

- **Do not chase line or branch coverage percentage.** It would have been high while all six defects were live — every one of them was on a line that executes. Coverage measures *execution*, not whether the claim a line publishes is true.
- **Do not add domains to the corpus expecting this to improve.** Every gap found is a path, not an outcome. More domains produce more traversals of the same five paths. This is the §5.1 characterization, and it is the reason recommendation 4 is fixtures rather than data.
- **Do not build a full semantic source-checker.** The keyword heuristic in recommendation 3 catches the real defect at a fraction of the cost. A false alarm there is cheap; a missed mis-citation is what we are trying to stop.
- **Do not test against live third parties in CI.** Non-deterministic, and it would have been red all week — archive.org timing out, crt.sh returning 502.

---

## Cost and sequencing

| | Recommendation | Cost | Catches |
|---|---|---|---|
| 1 | Path coverage in the gate | ~30 lines | makes every future blind spot self-announcing |
| 2 | Failure-mode sweep | ~20 lines | **B11, before deploy** |
| 5 | Harness declares its blind spots | ~10 lines | the instrument's own gaps |
| 3 | Invariants over all outputs | ~60 lines | both hotfix defects; the whole copy-discipline class |
| 4 | Path-targeted fixtures | one story | the three unentered paths, and future ones |
| 6 | Post-deploy smoke check | small, ops | the live-versus-recorded gap |

**1, 2 and 5 are roughly an hour together** and convert three classes of silent failure into printed output. They are worth doing before Story 19.1, because 19.1 adds a channel and will want the coverage report to prove it did not disturb the others.

**3 and 4 are a story**, and a natural companion to 19.2 — that story is entirely about properties of published prose, which is what recommendation 3 mechanises.

**6 is small but belongs to whoever owns deploys**, not to the test suite.

---

## The honest limit

None of this would have caught the two defects fixed in PR #64 **at the moment they were written** — recommendation 3 would have caught them on the next run, which is the best available outcome, not prevention.

And nothing here addresses the largest gap, which is not a testing gap at all: **we have no true positives.** The corpus contains no domain that actually did the thing the product exists to detect, because the 18.2 brief forbade adverse pre-labelling of real companies. Every claim about whether a signal *works* — as opposed to whether it *fires* — remains unmeasured. That is a data-collection decision, not a test-suite one, and it should not be quietly folded into a testing plan.
