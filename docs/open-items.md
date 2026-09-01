# Open items — decisions owed, and flaws we know about

**Purpose.** One place for what is *not* settled, so nobody rediscovers it and nobody ships assuming otherwise. Every entry names where the reasoning lives.

**Status:** current as of **2026-08-27**, end of the Lithium build run (PRs #44–#62, deployed to production).
**Companion documents:** `docs/decisions/story-18-3-amendment.md` (the reasoning), `docs/conventions.md` (the rules that came out of it), `docs/mvp-spec.md` §2E (the published rubric).

**Reading rule.** A flaw listed here is **disclosed, not hidden**. Several are live in the product on purpose, with the cost accepted explicitly. What is *not* acceptable is discovering one of them fresh and treating it as new.

---

## A. Decisions owed

### A1. Operator continuity — **BLOCKING TWO RULES**
Does a domain's current operator match the one its history belongs to? Not built; not designed.

**Blocks:** Green's establishment soundness (§3.4.6) *and* pivot substantiation (§2.4). §3.4.7 established that one piece of work serves both — which is why this is the single most load-bearing open decision in the project.

**Consequences while it is open:** B1, B2 and B3 below. Two of those are live in the report today.

*This is the item to answer first. Everything in section B that says "until substantiation ships" means this.*

> **B11 may now outrank it.** Operator continuity fixes verdicts that are *wrong*; B11 is about verdicts we cannot *produce at all* when one third party is slow. Both are open; the second was found in production and is visible to any user today.

### A2. When does a rubric change invalidate cached reports? — **DECIDED, and deferred**
`reports.schema_version` is **written and never read.** `serve.ts` invalidates on the 7-day TTL alone, so a rubric change does not expire anything. After the Lithium run, 12 of 17 cached reports were still serving verdicts computed by rules that no longer exist.

Found while preparing the production deploy of 2026-08-27. The column exists for exactly this and nothing consumes it.

> **Owner ruling, 2026-08-27:** Story 19.1 does **(a)** only — the renderer tolerates a missing field and defaults to empty. Cached reports render without the new section until they expire.
>
> **Bumping `SCHEMA_VERSION` was explicitly rejected as a no-op**: nothing reads the column, so it would write a different integer that no code compares. Building real invalidation is right eventually and is **its own small story** — it is new logic on the serve path, and bundling it into 19.1 would land it while that path cannot reach Green at all (**B11**).

### A3. ~~`subkind` on `Reason`~~ — **CLOSED (Story 21)**
Would have made the disclosure/observation source invariant testable (§3.2). Deferred to the no-verdict story, **which has now decided it.**

> **Closed, and §3.2 predicted which half would survive.** Story 19.1's neutral channel made the invariant **structural**: sourced observations become findings, unsourced disclosures stay in the note, and §6.2 already forbids publishing an unsourced reason. **No field needed.**
>
> The residue — prose that carries a source but describes *our* limits — is what §3.2 itself said no type could catch. It is logged against `docs/testing-recommendations.md` recommendation 3 (invariant assertions over output), not left here as a half-dead item.

### A4. Re-privatize the repo before launch
Tracked as issue #6. Public since 2026-06-18 for pre-release.

---

## B. Known flaws — live in the product

### B1. We over-vouch for re-registered domains, knowingly
A domain registered in 2023 on an archive stretching to 2014 reaches Green on the older span. `secondlibrary.com` is the corpus case: **two captures, eleven years apart.**

The sound upper bound (registration date, §3.4.1) contradicts the published span, and **we hold the fact and publish the other one.** A registration-date clamp would fix it without operator continuity.

> **Owner ruling, 2026-08-26: declined.** The disclosure caveat carries it. **Do not add the clamp as a stopgap** — operator continuity is the fix.

**Reasoning:** §3.4.8.

### B2. `cursor.com`-class domains reach Green on a previous owner's history
Undetectable without operator continuity, unlike B1. The *rationale* is now true — *"Archived since 1996"* is a fact about the domain — and every long-span report discloses that we do not check whether the site changed hands. **Reasoning:** §3.4.5, §3.4.8.

### B3. The AI pivot — the product's headline signal — produces no verdict
Demoted to a neutral observation on 2026-08-26. Collected in full, published in full; we simply no longer draw the conclusion.

**Why:** the signal cannot separate *"added AI features"* — which nearly every software company did — from *"pivoted to AI."* The corpus's own hand-picked exemplar (`sugarcrm.com`, tier 1 slot 6) fires at no defensible threshold, and at the threshold that would fire it, it is arguably a false positive too.

**Cost, accepted explicitly:** a real narrowing of what the product does, and **we cannot measure what we lose** because the corpus contains no true positives by construction.

> **What reverses it: substantiation shipping (A1). NOT a better window value.** `PIVOT_RECENT_DAYS` drives no verdict — **do not retune it while it drives none.**

**Reasoning:** §2.7.

### B4. Accumulation is strictly unreachable
B3 left the concern pool with **one** member, so `concerns.length` can never reach `ACCUMULATION_MIN_FINDINGS = 2`. The rule and its calibrated constants are retained deliberately — the signal set is expected to grow — and a test fails the moment anyone grows the pool.

**The methodology page must say this.** A published rubric describing a Red route nobody can reach is not publishable. **Reasoning:** §3.1, §2.7.

### B5. ~~Amber with no rationale at all~~ — **FIXED (Story 21)**, and it was the same problem as B11
When the archive check fails, the domain falls to Amber carrying **no main reason** — an unsourced one would break the §6.2 symmetry rule, so none is manufactured. `github.com` and `kexp.org` do this in the corpus: *"Some concerns"* beside *"none worth a closer look."*

Honest but thin. **§3.2's no-verdict outcome was the intended fix**, and these were its named cases.

> **Fixed by Story 21, and the way it was fixed is the evidence it was right.**
>
> The no-verdict predicate was derived from a completely different question — *"can we tell the verdicts apart?"* — and it fires on **exactly** `github.com` and `kexp.org`, the two domains that produced this shape. **Two independently-derived rules converging on the same two cases is not coincidence.**
>
> **B5 and B11 were one problem seen from two ends:** *"Amber with no rationale"* is what it looks like to a reader; *"Green unreachable because a dependency stalled"* is what it looks like in the sweep. Both are now a no-verdict.

### B6. A hyped young domain would miss Blue and land in Amber
`THIN_SNAPSHOT_COUNT` is rescued by §5.2's argument that *"a young domain has had no time to accumulate captures regardless of popularity."* **That is false at the margin:** `bolt.new` accumulated 0.59 daily-collapsed captures a day — five in nine days.

A heavily-crawled young domain therefore misses *"too new to tell"* and lands under *"some concerns."* Same defect class as §3.4.3, one state over. **The fix is a span test rather than a count test — a rule change.** The corpus contains no domain that exercises it.

### B11. Green has a SINGLE POINT OF FAILURE, and it failed on the first live test
**Found in production, 2026-08-27, minutes after the Lithium deploy.**

Archive **span** is now the *only* route to establishment (§3.4). So when the Wayback CDX call does not complete, **no domain can reach Green** — it falls through to Amber carrying no main reason (B5).

That is not hypothetical. Three live report generations immediately after the deploy:

| Domain | `wayback_first` | verdict |
|---|---|---|
| `suckless.org` | **failed** | amber |
| `wikipedia.org` | **failed** | amber |
| `stripe.com` | **failed** | amber *(background refresh overwrote a cached Green)* |

`web.archive.org` was returning **60s+ timeouts** at the time against an **8s** collector budget (`WAYBACK_TIMEOUT_MS`), and crt.sh was returning 502 — so `first_cert_date` failed on all three as well.

**Two separate problems, and they must not be conflated.**

1. **Transient:** archive.org was badly degraded that day. It will recover.
2. **Structural, and ours:** *before* Lithium, registration age could carry Green when Wayback failed. That route was **unsound** and removing it was correct — but removing it also removed the redundancy, and nothing replaced it. **A correctness fix concentrated all of Green's evidence in the single slowest, least reliable third party we query.**

**The corpus could not have caught this.** `corpus-verdicts.ts` replays observations recorded by a *patient 45-second* qualifier (Story 18.2 measured archive.org at ~38s/request). Every corpus domain therefore has a successful Wayback observation, and the delta gate has never once seen the live 8-second budget fail. **This is §5.1 firing on the sharpest possible example: the corpus spans verdicts, not failure modes — and this failure mode is the modal one in production.**

**Do not "fix" this by raising the timeout alone.** That trades a wrong verdict for a slow page and still fails whenever archive.org is down.

> **BUILT — Story 21 (2026-08-27).** The trigger shipped is a **conjunct-level reachability predicate**, not the load-bearing set this ruling assumed: *load-bearing turned out not to be a stable property of a check.* See §3.2's post-Story-21 correction and B5 above. **The other half of B11 — whether Green needs a second establishment instrument — remains open and is a separate decision.**
>
> **Owner ruling, 2026-08-27: treat an unavailable load-bearing check as §3.2's NO-VERDICT outcome.**
>
> Not a patch to the archive route — the general answer. **Raising the timeout was explicitly rejected.**
>
> This makes **B5 the same story rather than a separate one**: *"Amber with no rationale"* and *"Green unreachable because a dependency stalled"* are the same event seen from two ends, and §3.2 already specifies the outcome for both. It is not yet briefed as a story.

### B11a. It is four failures, not one — measured after the ruling

The failure-mode sweep (PR #67) forces each collector to fail across all 49 corpus domains:

| collector forced to fail | green | amber | blue | red |
|---|---|---|---|---|
| *(none — baseline)* | 32 | 11 | 6 | 0 |
| `domain-identity` | 32 | 17 | **0** | 0 |
| `dns` | **0** | 43 | 6 | 0 |
| `ai-pivot` (Wayback) | **0** | 49 | **0** | 0 |

**Green dies with Wayback and again with DNS. Blue dies with Wayback and again with the registration lookup.** Three of four verdicts each hang on a single collector completing; two collectors each take out two verdicts.

This is the argument *for* the ruling rather than against it: **a per-route patch would have fixed one of four.** The no-verdict outcome covers all of them, because it is about the checks not completing rather than about which check it was.

**The other candidate mitigations are not dead, only demoted to optimisations:** far more aggressive CDX caching (archive history changes slowly; the current TTL is one day) shrinks the window, and a second establishment instrument restores redundancy — but neither is now load-bearing for correctness.

**Related:** this is also what makes B5 user-visible rather than theoretical. Every one of those three reports is an Amber whose findings list reads *"none worth a closer look."*

### B12. The archive check fails more than half the time — measured
**Found by Story 21's instrumentation on its first run, 2026-08-27.**

§3.2's design constraint for no-verdict: *"this should fire rarely. If it fires often, that is a symptom — timeouts too tight, or an unreliable dependency — and the fix is upstream, not a better failure message."*

`pnpm tsx scripts/no-verdict-rate.ts 30`, against production history:

| load-bearing check | ok | failed |
|---|---|---|
| `dns_spf` | 32 | 0 |
| `domain_age_days` | 33 | 0 |
| **`wayback_first`** | **5** | **6** |
| **`wayback_snapshot_count`** | **6** | **6** |

**The archive check failed on more than half its attempts across 30 days.** Small n — there is almost no traffic — but the split is stark and it is the *only* check failing at all.

**So the answer to §3.2's question is: it will fire often, and that is the symptom §3.2 said to read it as.** Story 21 makes the failure honest rather than misleading; it does not make it rare. The upstream fix is the other half of B11 — a second establishment instrument, or far more aggressive CDX caching — and **neither is in Story 21's scope.**

### B7. The layout still argues where the prose no longer does
Everything in `positive[]` publishes under a **Positive** badge, so a capture count there asserts that heavy crawling is reassuring — **exactly what §3.4.3 denies.** This is §3.4.5 surviving in the layout after being removed from the wording.

**Not fixable by copy.** It needs a neutral-facts channel, i.e. a change to the `Report` shape.

> **Owner ruling, 2026-08-27 — Story 19.1 builds the channel. Classification decided:**
>
> | Finding | Channel |
> |---|---|
> | Archive span | **POSITIVE only when it is the published reason for Green; NEUTRAL otherwise** |
> | Clean threat check (*"Not listed on…"*) | **NEUTRAL** — matches what the code already says twice |
> | Trustpilot rating | **NEUTRAL** — published, with no framing attached |
> | Capture count · registration date · pivot observation · cert age · DMARC absent · Blue's two reasons | **NEUTRAL** |
> | SPF present · DMARC present | POSITIVE |
> | Threat listing | FLAGGED |
>
> **Section name: "What we found."** Names the act of observing, not the meaning; does not rank itself below the other two; does not imply completeness.
>
> Archive span is the one classification that is **context-dependent**, and deliberately so: the same fact is establishing evidence on a Green report, the disqualifier on `bolt.new`, and actively misleading on `secondlibrary.com` (§3.4.8). The assembler already knows the verdict, so this is **routing, never a rule**.

### B8. Blue's colon does what the pivot's semicolon did
> *"Too little public footprint to assess yet: registered ~5 months ago."*

The colon means *because* — our conclusion, then the fact as its ground. The same authorship the 2026-08-26 copy pass removed from the pivot, in the one state whose entire point is that we reached no conclusion. Milder (insufficiency is not adverse, and the copy is already about us), same construction.

### B9. "Worth a closer look" is a judgment inside a summary documented as factual
`assemble.ts` describes the summary as *"FACTUAL (counts only, no judgment)."* It ends *"none worth a closer look."* On Amber that phrase is the only characterisation the reader gets. Blue was given its own phrasing for exactly this reason.

### B10. The report note is getting long
Five or more sentences on some domains. Every disclosure, every observation and the pivot all route to one channel. Presentation, not correctness — a Story 20 candidate alongside B7, B8 and B9.

---

## C. Unverified — code that has never run against real data

### C1. Everything certificate-related
**Zero of 49 corpus domains carry certificate data.** crt.sh returned 5xx throughout Story 18.2 and **502 again on 2026-08-27**. The cap, the floor labelling and the corroboration branch are covered by unit tests only.

> **Requirement (§5.3): any story briefing certificate behaviour must either re-collect crt.sh first, or state explicitly that it is specifying against unexercised code.** The second is acceptable. Silently assuming coverage is not.

### C2. Accumulation, entirely
Zero real triggering cases — the corpus maximum is **one** concern on any domain. All three constants rest on synthetic fixtures and **must be re-validated the first time a real case appears.**

### C3. Failure paths generally
The corpus spans **verdicts**, not **failure modes** (§5.1). Every corpus domain has `dns_spf` status `ok`, so any rule about a failed SPF check is unfalsifiable against it. The eventual answer is synthetic fixtures for failure paths.

### C4. Convention coverage
`src/signals/` was swept for the observation-failure convention. `src/serve/`, `src/lib/` and anything future reading an external source are **spot-checked, not swept.** Three of the four known instances were found while looking for something else, so absence of known violations is weak evidence.

---

## D. Parked, with a reason

| Item | Why parked |
|---|---|
| **L-14 Trustpilot removal** | Touches the indicator, so it is a story, not a cleanup |
| **L-19 corrections suppression** | Substantial and launch-blocking; separate work |
| **The coarse onset date** — `eff.org` showing ~2 days on a 36-year archive | A §2.6 sampling artifact (6 captures from 6,687). Needs the bisect finder |
| **Continuity** (captures across most intervening years) | Post-MVP; tolerance and "most years" are Stage 3 Part B, and cannot be calibrated until the mechanism exists |
| **Visual-regression CI (Layer 2)** | Issue #5; pick up when components stabilise |

---

## E. Standing instructions that are easy to violate

These exist because the obvious move is the wrong one.

1. **Do not tighten `PIVOT_RECENT_DAYS` as a proxy for substantiation.** It reduces false positives by firing less, which looks like improvement and is the signal doing less.
2. **Do not add the registration-date clamp as a stopgap** (B1) — declined by the owner.
3. **Do not reintroduce** `ESTABLISHED_DOMAIN_DAYS`, `ESTABLISHED_SNAPSHOT_COUNT` or `ESTABLISHED_CERT_DAYS`. Tombstoned in `indicator.ts` with the reason.
4. **Do not read a clean corpus delta as proof** for a path the corpus does not exercise (§5.1) — and **diff reasons, not just states** (`conventions.md`).
5. **Never present a reasoned or definitional threshold as calibrated** (§5.2). The corpus is in the repo; anyone can check.
6. **Observation failure is not absence** (`conventions.md`). It has recurred at four layers.
