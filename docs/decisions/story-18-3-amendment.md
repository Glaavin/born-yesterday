# Story 18.3 — Lithium Epic (1 of 3)
## Amendment to the indicator model decision

**Document:** `docs/decisions/story-18-3-amendment.md`
**Version:** v2
**Type:** Decision document. Amends `docs/decisions/story-18-indicator-model.md`. No PR, no code, no build.
**Status:** DRAFT — for owner review
**Date drafted:** 2026-08-24
**Amends:** Story 18 decision doc §3.4, §3.5, §5, §9
**Triggered by:** Story 19 Stage 1 reconciliation report

---

## 0. Why this amendment exists

Story 19 Stage 1 diffed the Story 18 decision doc against `src/report/indicator.ts`. It found six structural divergences and one defect in the decision doc itself.

The decision doc was written from `mvp-spec.md` and from owner/PM discussion without reading the shipped implementation. Its §0 precedence rule — *doc wins, but every divergence is reported before it is closed* — assumed divergences would be drift. Several were not. They were deliberate safety decisions made during Helium, with reasoning recorded in build logs and code comments.

That clause is why this amendment exists rather than a silent overwrite of Helium's design. It earned its place.

**This document:**

1. Names the root cause underlying most divergences (§1)
2. Restructures the AI-pivot signal, resolving Q1 (§2)
3. Resolves Q3, Q4, Q6, and verdict-on-incomplete-data (§3)
4. Records four production hotfixes and three infrastructure stories shipped during the pass (§6, §7)

**Version note:** v1 was drafted before the plumbing, measurement, and sweep work completed. v2 corrects several claims v1 made that the work disproved — most importantly §1.4, where v1 predicted questions would dissolve that did not. Corrections are marked inline.

**Post-Stage-2 corrections.** Blocks marked **CORRECTED POST-STAGE-2** / **ADDED POST-STAGE-2** were added after Story 19 Stage 2 implemented §3, and are informed by that implementation. They are **not all the same kind of change**, and the distinction is deliberate: §3.1 is a **mechanism completion** (the mechanism was incomplete, the reasoning was sound), while §3.2's reputation change and §3.3's Green-blocking change are **rule changes** (one exposed by implementation, one correcting an error in the Stage 2 brief). §5.1 is a new constraint. Where these disagree with the text above them, **they win** — they are later and informed by implementation.

---

## 1. The root cause: the indicator cannot distinguish "not checked" from "checked, found nothing"

Every collector returned a value or `null`. `null` meant both *"this check did not complete"* and *"this check completed and found nothing."* The indicator read only values, never `CollectorResult.ok`. **Collector failure was invisible to it as a category.**

### 1.1 The governing principle (owner, 2026-08-24)

> **A confirmed empty state is a finding, and needs to be validated like any finding.**

A check that ran and found nothing has produced information. A check that did not run has produced nothing. Treating them identically is a design flaw, not a tuning problem.

### 1.2 The defect recurred at four layers

Each was found while looking for something else:

| Layer | Symptom | Status |
|---|---|---|
| **Indicator** | Failed archive check counted as evidence of thinness → created Blue | Fixed by §3.2 (Q4) |
| **Report copy** | Published *"0 archived captures"* when the check failed | Fixed — hotfix §6.1 |
| **`signal_history`** | Valueless signals dropped, so the append-only record could not distinguish "DMARC absent on date X" from "not checked on date X" | Fixed — migration 0003, §7.2 |
| **Signal parsers** | Seven parsers returned benign defaults on unparseable payloads; callers derived status from *fetch* success, not *parse* success | Fixed — sweep, §7.3 |

The parser layer re-created the exact false statement the §6.1 hotfix had removed, one level down: an HTTP 200 with a truncated body produced `cdxChecked = true, count = 0` → *"0 archived captures,"* sourced.

### 1.3 The determinism problem

Initially scoped as a TLD quirk — `.edu` and ccTLDs that do not publish creation dates. It was not.

**Any registration lookup that missed the 8-second deadline hit it.** `masshist.org` — thirty years old, creation date successfully collected during Story 18.2 — returned Amber with `flagged: []` and a summary reading *"none worth a closer look"* under a "Some concerns" pill, because RDAP was slow on one request.

**The same domain could return different verdicts on different requests with nothing about the domain having changed.**

Story 18 §5E rule 1 states the indicator is deterministic — *"same inputs always produce the same output."* That was true only if network conditions counted as inputs, which is not what a reader would understand and not what the methodology page can claim.

### 1.4 Sequencing — CORRECTED IN v2

v1 stated that Q4 and the empty-rationale defect would *dissolve* once the plumbing landed. **They did not.**

The plumbing shipped (§7.1). `SignalStatus` exists on every signal, all collectors set it, the parsers are swept. But **the indicator and assembler read signal values only — neither consumes `status`.** So `fewSnaps` is still true when snapshots are null, and a failed archive check still creates Blue.

The correct statement: **the plumbing is a prerequisite, not a resolution.** It made the fix expressible. The fix itself is §3.2.

One half did resolve as predicted: where a registry answered but published no creation date, the fallback reason is now sourced and publishes, so the Amber-with-empty-rationale case is fixed for that path. Where the lookup *timed out*, the rationale correctly stays empty — a failed check must not produce a finding — and the residue is a rule gap, addressed by §3.2.

### 1.5 The convention

Recorded in `docs/conventions.md`:

> Any code path that can fail to observe something must represent that failure distinctly from observing nothing. A fetch error, timeout, or parse failure must never collapse into the same value as a completed check that found nothing.
>
> **Carve-out:** where an external standard defines the meaning of absence (e.g. a missing `robots.txt` permits crawling), applying that standard is not a collapse. Cite the standard at the call site.
>
> **Scope of verification:** `src/signals/` was swept in Story 18.3. `src/serve/`, `src/lib/`, and any future code reading an external source are governed by this rule but have been spot-checked, not swept. Three of the four known instances were found while looking for something else, so absence of known violations is weak evidence.

---

## 2. Q1 resolved: the AI-pivot signal is restructured

### 2.1 The defect in Story 18

`indicator.ts:36`:

> *"A loose `PIVOT_RECENT_DAYS` can't cause a false Red — the pivot is only one of ≥2 points."*

Helium made a **coupled** decision: because a pivot cannot fire Red alone, a loose recency window (365 days) is safe. Story 18 §3.4 took one half — making the pivot a standalone Red trigger — and deferred the other to Story 19 as a routine threshold, silently making `PIVOT_RECENT_DAYS` load-bearing.

The decision doc was wrong. Helium's design was better reasoned, and its reasoning was recorded where anyone reading the code would find it.

### 2.2 Why the restructure stands — CORRECTED IN v2

v1 gave two arguments. **One collapsed under measurement.**

**Collapsed:** v1 asserted that AI-marketing language was near-universal among established software companies in 2024–2026, so a 365-day window would fire Red across the industry. The PM asserted this without verification.

The §5 measurement found: among established commercial software in the corpus, **zero** pivoted within the last twelve months. Median onset 2.4 years ago, clustering 2021–2024. Four of eighteen usable pivots fell within twelve months; three of those four were young or non-commercial.

Two limits on that correction, both recorded in the committed scan README:

- **The corpus is the wrong instrument for the specific claim.** The assertion concerned mid-market enterprise SaaS. The corpus is dev-infrastructure, OSS, nonprofit, and institutional, deliberately skewed old and clean (finding F3). The honest statement is *"not supported by this corpus,"* never *"disproven."*
- **n = 18 usable of 49 scanned, 9 unresolved.** A small sample carrying a strong conclusion.

**Standing, and stronger:** `cursor.com` shows 27.7 years of archive presence preceding its AI language — belonging to **prior owners**, for a company founded in 2022. Continuous by every date-and-count measure, and continuous for someone else.

A substantiation test built on raw first-capture date is trivially fooled by an aftermarket domain, which is exactly what someone gaming this would use. Combined with the instrument's coarseness and the signal's own *"not provably first,"* firing the most severe verdict on it alone remains wrong.

**The reasoning is precision and gameability, not prevalence.** That distinction matters for the methodology page: *"we don't fire Red on a pivot alone because the signal is approximate and spoofable"* is defensible. *"Because everyone pivoted"* would have been false.

### 2.3 What we deliberately cannot distinguish

Recorded because it will be asked again.

Two companies can execute the same pivot with very different outcomes — one emerging transformed, another damaging its product, pricing, and customer relationships. That difference is real, publicly discussed, and **entirely outside what Born Yesterday measures.**

Distinguishing them requires judgments about business quality, corporate intent, or customer harm. Every such judgment characterizes competence or honesty, which the cardinal copy rule forbids and which defamation *per se* attaches to. Reaching those conclusions from RDAP, DNS, certificates, and Wayback would also mean inventing a signal to justify a conclusion already held.

**Where two companies differ only in execution quality, Born Yesterday reports the same facts about both.** A correct limitation, not a gap to close.

### 2.4 The replacement signal: substantiation depth

Severity narrows and gains a substantiation condition. Reported: **timing and continuity, never quality.**

| Fact | Status |
|---|---|
| When AI-marketing language first appears | Collected |
| What the homepage said before | Collected |
| Whether continuous archive presence precedes the language | `wayback_first` / `wayback_last` collected, never consumed |
| Whether AI-adjacent *technical* vocabulary predates the *marketing* vocabulary | Buildable — second keyword class, scanned separately |

This is finding F1 applied to the pivot rather than to Green.

**Gap identified in v2 — operator continuity.** Archive continuity alone is spoofable. `cursor.com` demonstrates it: continuous archive, different operator. Substantiation needs a second component — did the same entity run the site across the window, or did it change hands? That is content comparison across captures (branding, title, subject), a different mechanism from anything scoped here.

Not scoped in this amendment. Flagged so the substantiation story does not discover it. It may need its own decision: detecting ownership change from archive data has a real false-positive surface, since rebrands look like handovers.

> **CORRECTED POST-STAGE-2 — this is no longer a pivot-only concern.** Operator continuity is now **also required by Green's establishment routes** (§3.4.6), which are replaced by span-plus-continuity for the same reason the pivot needed it. The decision therefore **blocks two rules, not one**, and the machinery built for either serves both (§3.4.7). It also moves earlier in the sequence — see §8.

### 2.5 The narrative block

The pivot's **narrative presence expands** into a non-scoring block: dates, before-and-after homepage text, Wayback links, substantiation evidence — a sourced factual timeline with no verdict attached.

- **Legally strongest.** Neutral juxtaposition is protected because the reader draws the inference. Editorializing supplies the endorsement that creates liability.
- **Most shareable artifact the product can produce.** *"Here is what this company's homepage said in 2019, 2022, and 2025"* is compelling and contains no claim.
- **Solves the non-event problem.** Green and Blue give a reader little. A pivot timeline is content regardless of verdict.

**The split: severity narrows and gains substantiation; narrative presence grows.**

Presentation is deliberately out of scope — its own UI story after the data work is live, designed against what the scan actually returns. **Dependency:** the narrative block needs more than the indicator consumes (before/after text, multiple dated captures, per-capture links). The data story must persist what the UI story will need.

### 2.6 Instrument and time budget — CORRECTED IN v2

v1 imposed a time budget. v2 names the instrument, and corrects a PM overclaim.

**Bisect, for onset.** A binary-search onset finder achieved 1–18 day resolution in 12–14 fetches against archives of 700–4,400 captures, where uniform sampling of comparable resolution would need hundreds. It also revealed that the "sampling floors" in the first measurement pass were the *instrument* being wrong, not archive.org being slow — corrections of up to 14 months.

**PM overclaim, corrected.** The PM suggested bisect might make substantiation "routinely feasible rather than routinely degraded." It does not:

- Binary search needs a monotone predicate. Continuity is a property of a *range*; there is nothing to converge toward.
- Bisect is cheap *because* it discards half the data each step — which is the data continuity needs. Continuity is inherently O(k), with k set by the budget.
- Bisect reads one bit per fetch (*"AI mentioned?"*). Continuity needs content identity — a comparison problem, not a scan.
- **Neither instrument catches the gameability case.** `cursor.com` is continuous by every sampling measure. Ownership change requires §2.4's operator-continuity test.

**Scoped shape:** 1 CDX fetch → ~log₂N for onset (hard-bounded) → k samples for continuity (budgeted), with per-capture status throughout.

**Budget behavior:** if continuity cannot complete within budget, the report renders without substantiation and discloses that it was not established. A partial scan never produces a conclusion.

**Inherited hazard.** The bisect finder treats an unreadable capture as *"no evidence, keep narrowing."* Safe for onset — it biases toward a later onset, which is conservative. For continuity it would read as a gap, penalising a domain for archive.org's failures. That is §1.1 at the per-capture layer. The substantiation scan must carry per-capture status or it will manufacture discontinuity out of fetch errors.

### 2.7 `PIVOT_RECENT_DAYS`

No longer load-bearing for false-Red risk. Remains a calibration input, informed by §5.

> **CORRECTED POST-STAGE-3 — the false-RED framing missed the harm that is actually live.**
>
> §2.1 recovered Helium's licence for a loose window: *a pivot cannot fire Red alone, so a loose recency window is safe.* **That is still true, and it is the wrong reassurance.** The pivot alone **denies Green** (`concerns.length === 0` is a Green conjunct) and then **publishes as the sole flagged finding under "Some concerns."** A false Amber was never analysed, and it is what the corpus produces.
>
> **Measured at the current value (Stage 3): the pivot fires for two corpus domains, and both are false positives.**
>
> | Domain | Published today |
> |---|---|
> | `eff.org` | *"Domain registered ~36 years ago; AI language first appeared in sampled archive captures ~2 days ago"* — under **Some concerns**, as its only finding |
> | `bun.sh` | Same shape, onset ~7 months |
>
> The Electronic Frontier Foundation is a thirty-six-year-old civil-liberties organisation that **writes about** AI. `matchAiTerms` matches any **mention**, so editorial coverage is indistinguishable from a pivot. `eff.org`'s two-day onset is additionally a §2.6 sampling artifact — six captures sampled from 6,687.
>
> **No value of this constant fixes it.** Tightening cannot exclude a two-day onset; loosening to three years pulls in eight more domains including `cloudflare.com`, `cursor.com` and `retool.com`. Measured precision at the current threshold is **0 of 2**, and the corpus contains **no true positive at any window** — every one of its 24 usable onsets is either a legitimate company adding AI features or a young AI-native company the `PIVOT_ESTABLISHED_DAYS` precondition already excludes.
>
> **Owner ruling, 2026-08-26: leave the default as-is.** The two false Ambers ship knowingly. **Do not tighten this constant as a proxy for substantiation** — tightening trades a measured false-positive rate for an unmeasured false-negative one and buys nothing in either direction.
>
> **This is a second constituency for §2.4.** Like §3.4.9's, it converts an argument from principle into named cases: substantiation is not only what the pivot rule *ought* to have, it is what stops us publishing a concern about the EFF.

> ---
>
> **OWNER RULING, 2026-08-26 — RULE CHANGE: the pivot stops producing a concern.**
>
> It continues to be **collected and published as a neutral observation**. The dates, the before/after language and the Wayback links all still reach the reader. What stops is **us attaching a conclusion** — the disclosed-facts posture: hand over the facts, let the reader infer.
>
> Concretely, the pivot **no longer contributes a concern point, no longer denies Green, and no longer publishes as a finding under an adverse heading.** Measured delta: exactly `eff.org` and `bun.sh`, amber → green, both on archive-span rationale with SPF present. Nothing else moves; Red stays 0.
>
> **THE DURABLE ARGUMENT IS `sugarcrm.com`, NOT "0 of 2".**
>
> Corpus tier 1, slot 6 was hand-picked as **the** classic-pivot exemplar — *"established domain + a datable AI-language onset."* Its onset is **1,945 days**. It does not fire at 365 or at 1095. Making it fire needs a ~5.3-year window, which flags **~14 of 49 domains** — and SugarCRM is a twenty-year-old CRM that added AI features in 2021, so at that window it is arguably a false positive too.
>
> **The corpus's own designated positive example is ambiguous at every threshold.** That is a statement about the instrument and does not rest on n=2.
>
> The underlying problem: the signal cannot separate **"added AI features"** — which nearly every software company did — from **"pivoted to AI,"** a company repositioning around a capability it did not have. In Wayback text those are identical. Substantiation (§2.4) is what distinguishes them.
>
> **NOT EVIDENCE — do not re-derive it.** *"No true positive at any window"* is **not** a measurement of this signal. The corpus contains no true positives **by construction**: the Story 18.2 brief forbade adverse pre-labelling of real companies and forbade committing a URLhaus host. **That absence measures our sampling rule, not the signal's recall.**
>
> **CONSISTENCY.** In the same week we removed a rationale that was true-but-wrong-in-implication when it **flattered** a company (`cursor.com`'s *"registered ~30 years ago"*, §3.4.5). The pivot concern is the same shape pointed the other way: a true fact, a wrong implication, published as our **sole** reason, about named real organisations. **Removing it in one direction and keeping it in the other is not a defensible position.**
>
> **WHAT REVERSES THIS: SUBSTANTIATION SHIPPING (§2.4). NOT a better window value.** Tightening reduces false positives by firing less, which looks like improvement and is the signal doing less. `PIVOT_RECENT_DAYS` stays at **365** and stays **REASONED**. It now drives no verdict — **do not retune it while it drives none**, because a value tuned against no active use will look calibrated and will not be.
>
> **THE COST, accepted explicitly rather than slid into.** This is a **temporary disablement of the product's headline feature**. It is a real narrowing of what Born Yesterday currently does. **We cannot measure what we lose, because we have no true positives to lose.** If substantiation slips, we ship without the differentiator. *Mitigation on record:* the observation keeps publishing either way — a reader still sees the dates, the language change and the links. *Owner note: the URL will not be shared until we are confident in the data, so no reader is affected by the interim state.*
>
> **KNOCK-ON: accumulation is now STRICTLY unreachable.** With the pivot demoted the concern pool has **one** member, so `concerns.length` cannot reach `ACCUMULATION_MIN_FINDINGS`. §3.1 said "near-unreachable"; it is now categorically unreachable until the pool grows. The rule and its calibrated constants are **retained deliberately** — the Profile Section brief contemplates a dozen new scans — and §3.1's instruction that **the methodology page must state this plainly** is now load-bearing rather than a nicety.

---

## 3. Resolved questions

### 3.1 Q3 — What is accumulation counting? — CORRECTED POST-STAGE-2

Story 18 §3.4 made accumulation a peer Red trigger: the finding is the count itself, as nameable and sourceable as a threat listing. The code has `concerns.length >= 2` over a pool with exactly two possible members.

**Resolved as: ratio of concern-bearing findings to completed observations, with a minimum-checks floor.** *(Incomplete — a findings-floor is also required; see the correction below.)*

**Denominator — signals with `status == "ok"`.** Completed observations only. Excludes failed and not-attempted checks, and excludes the four constant link-outs, which are navigation rather than observation. Stage 1 item 14 found the *"Surfaces N public signals"* count includes those link-outs, so it is not a count of successful checks. The definitional line: **a check is something that could have come back either way.**

**Ratio rather than count.** The original argument — that degraded collection with a small denominator makes any count look severe — is weakened by §3.2, which now stops the denominator getting small. But the ratio survives something a count does not: **the signal set growing.** A fixed count silently becomes more lenient as signals are added; 3-of-6 and 3-of-16 are different claims. The Profile Section brief contemplates a dozen new scans, so this is not hypothetical.

**Floor retained** as belt-and-braces, and because it makes the rule readable: *a meaningful proportion of a meaningful number of checks.*

> **CORRECTED POST-STAGE-2 — MECHANISM COMPLETION (not a rule change).** The mechanism above is incomplete: a ratio and a checks-floor alone cannot express *"more than one thing,"* and accumulation means more than one thing by definition.
>
> Any threshold low enough for two findings at a realistic denominator (2/20 = 0.10) is also low enough for **one** finding at a smaller one (1/10 = 0.10). Measured, not hypothesised: at ratio-only, **seven corpus domains went Red on a single concern.**
>
> `ACCUMULATION_MIN_FINDINGS` (draft: 2) is the missing half, not a workaround. The rule needs all three: **ratio** for proportionality, **floor-on-checks** for denominator sanity, **floor-on-findings** for plurality.
>
> The ratio-over-count reasoning above is unaffected and still stands — a fixed count silently loosens as the signal set grows.

**Documented as currently near-unreachable.** With the pivot conditioned on substantiation and F2 ruling out hygiene-only accumulation, the concern pool is two items and one is now harder to trigger. **The methodology page must state this plainly** — that accumulation exists, how it works, and that it rarely fires given the current signal set. An honest statement about the rubric beats a hidden gap, and it explains why nobody encounters this verdict.

Threshold and floor are Story 19 calibration.

### 3.2 Q4 — Should missing data create Blue? (and verdict-on-incomplete-data) — CORRECTED POST-STAGE-2

**No. Missing data never creates a verdict.**

A failed or not-attempted check cannot satisfy `fewSnaps` or any other condition. This is §1.1 applied directly.

> **CORRECTED POST-STAGE-2 — RULE CHANGE: reputation leaves Blue's conjunction.**
>
> Applying the rule above exposed a second problem it did not anticipate. Blue's conjunction also required `!hasReputation`, and gating that on the check having completed made **Blue unreachable whenever Trustpilot blocked the scraper — which it commonly does by design.** That is §1.3's determinism problem reappearing in the modal verdict for the modal query, introduced *while fixing* §1.3.
>
> Beyond reachability, the evidence was never good: Trustpilot presence is the **weakest available evidence of footprint** (most legitimate businesses have no Trustpilot page, so its absence says almost nothing about whether a domain is established) and it is the **least reliable check we run**. Weakest evidence, least reliable source, and load-bearing for a verdict's reachability — wrong on all three counts.
>
> **Blue's evidence is domain age and archive depth.** That is the conjunction. The check still runs and still publishes; it no longer gates a verdict it was never good evidence for.
>
> Confirmed empirically: with reputation removed, the as-recorded corpus and the all-checks-completing corpus produce **identical results across all 49 domains** — reputation now gates nothing anywhere.

**One or two failed checks:** the verdict proceeds on what was collected, and **a caveat discloses the gap**, visible regardless of which state fired. Caveats are already orthogonal to state (Story 18 §3.5); their current Green-only scoping is a Stage 1 divergence to be corrected.

**Two caveat disciplines share one channel — DECIDED.** Extending caveats to every state made a distinction visible that Green-only scoping had hidden:

- **DISCLOSURE caveats** — we could not complete a check. Copy describes **our limits, never the domain**. Carries no source.
- **OBSERVATION caveats** — we checked and found something worth noting that is not a concern (e.g. DMARC absent, §3.3). Copy describes **the finding, neutrally**. Carries a source.

`kind: "caveat"` remains a **ROUTING** label (→ the report summary), not a semantic one.

**PROPOSED, NOT DECIDED — deferred to the no-verdict outcome story.** A `subkind?: "disclosure" | "observation"` field on `Reason` would make the source invariant *testable*: every disclosure caveat has `source: null`; every observation caveat has a source. It converts half the convention into a check. It **cannot** enforce the copy discipline itself — no type catches whether prose describes our limits or the domain.

**This is a proposal, not a decision.** It is scheduled into the no-verdict story because that is the next work generating disclosure caveats in volume, and whoever builds that story decides it. It must not be implemented on the strength of appearing in this document.

This bounds the cost of the rule. Without the caveat, a domain falling through to Amber because its archive check failed would read as *"some concerns"* about a domain whose thinness we simply could not verify — trading a false Blue for a false Amber, and Amber is the one implying concern. The caveat means the reader sees both the verdict and the reason to discount it.

**Beyond that threshold: no verdict at all.**

**"Ask again later" is not a fifth state — it is the absence of a verdict.** The four-state contract describes what we concluded. This says we concluded nothing. `design-system.md` §4.1 already carries non-verdict outcomes (`limit-reached`, `error`); this belongs beside them, not on the severity ladder. No change to the four-state contract, no change to `skepticism_state`'s domain, no methodology restructuring.

This also gives Blue its meaning back. Blue becomes purely *"we checked and found little"* — a finding — rather than a mix of that and *"our network was slow."*

**Threshold: a simple count, for now.** Story 19 calibration will find the right shape. Not all failed checks are equal — losing the registration date is foundational (`masshist.org` demonstrated a single RDAP timeout hollowing out a report) while losing Trustpilot costs almost nothing — so the eventual answer is likely a load-bearing set with a count on top.

**Implementation constraint:** express the threshold as a **predicate that currently happens to be a count**, not a bare integer comparison. If calibration finds registration and archive are load-bearing, that must be an extension rather than a rewrite.

**Caching:** a no-verdict outcome is **not cached**. `reports` caches verdicts and there is not one; a seven-day cache would make a transient failure sticky. Do not write a report row.

**History:** `signal_history` still records the attempts. *"We attempted these checks on this date and they failed"* is exactly what the append-only record is for, and migration 0003 made it representable. This is the case that migration was built for.

**UX constraints — these are requirements, not polish.** The failure mode is a reader concluding **the product does not work**, not that they got an unlucky result. Two things make it sharper than a normal error:

- **It lands disproportionately on first impressions.** A returning visitor hitting a cached report never sees it. It fires when someone pastes a domain we have never checked — the first-time user. The people most likely to see a non-report have no prior experience of the product working.
- **The copy must be about us, not the domain.** Same discipline as the Blue relabel (§6.4). *"We couldn't complete enough checks"* is about us. *"This domain couldn't be reached"* or *"no data available for this site"* transfers our failure onto the subject — inaccurate, and for a company being checked, adverse. That is the L-10 class of error in a new place.

Therefore: the re-attempt should be **automatic and usually successful**, so the state reads as *"still working"* rather than *"we failed."* The distinction between those two is most of the difference between a product that seems broken and one that seems careful. The mascot state should read as **effort, not error** — the existing `error` state is for invalid input, where the user did something wrong; this is us falling short.

**Design constraint: this should fire rarely.** If it fires often, that is a symptom — timeouts too tight, or an unreliable dependency — and the fix is upstream, not a better failure message. **Instrument the rate from day one.**

*Non-issue, noted and dismissed: a target could in principle suppress its own report by making our checks fail. Almost everything we check is third-party — RDAP, Wayback, crt.sh, threat feeds — and the only source the target controls is the live homepage fetch. Not a meaningful attack surface.*

### 3.3 Q6 — Does the email-auth Green gate survive? — CORRECTED POST-STAGE-2

**Softened to SPF only. DMARC absence no longer blocks Green.**

Email auth currently appears twice: as a concern point (fires only when SPF *and* DMARC are both missing) and as a Green gate (`clean = spf && dmarc` — **either** missing blocks Green outright). The gate appears in **no rubric document**.

Finding F2: ~24% of the corpus lacks DMARC, ~11% lacks SPF. `masshist.org`, `suckless.org`, `slackware.com`, `xfce.org` — long-established institutions with nothing else against them — were permanently capped at Amber.

**Why SPF and DMARC are not equivalent.** SPF has been standard for two decades and sits at 89% adoption in the corpus. DMARC is much newer at 76%. A domain with no SPF at all is genuinely anomalous in a way that no-DMARC is not. The adoption-lag argument applies to both, but much more weakly to SPF.

This resolves the named harm: `masshist.org` — thirty years old, SPF present, DMARC absent, nothing else — reaches Green.

**DMARC absence publishes as a caveat.** The observation is preserved; the denial is removed.

**Narrowed, not eliminated.** The direction problem still applies to the residual 11%: a domain lacking SPF is disqualified from Green rather than penalized, and some of that 11% will be legitimate. Smaller cohort, more defensible claim — a Story 19 calibration question rather than a live defect. **Calibration should look at it.**

**The gate is documented.** Appearing in no rubric document was its own problem for a publishable rubric.

The both-missing concern point is unchanged.

### 3.4 Green's establishment routes are unsound — ADDED POST-STAGE-2

> **RULE CHANGE.** Stage 3 planning asked a question that should have come earlier: **does each constant measure what its rule claims it measures?** The earlier test — *"can the corpus produce a number for this?"* — passes for constants that are precisely wrong. Applying the better test found **all three of Green's establishment routes unsound**, and one producing a **false rationale in production today**.

`established = establishedByAge || establishedByArchive || establishedByCert`

Each disjunct measures something other than establishment.

#### 3.4.1 The governing asymmetry

**Registration age is a valid upper bound on operating history, and an invalid lower bound.**

If a domain was registered 60 days ago, the operator *cannot* have been running a site there for longer than 60 days. Sound inference.

If a domain was registered 30 years ago, that says nothing about how long the *current operator* has run it. `cursor.com` is the corpus proof: registered in the 1990s, company founded 2022, 777 captures belonging to prior owners.

Same fact, sound in one direction, unsound in the other.

**Consequence:** every constant using registration age to establish *youth* is sound. Every one using it to establish *age* is broken. This is finding F1 (Story 18.2) stated as a principle rather than an observation.

#### 3.4.2 Route-by-route

| Route | Claims to measure | Actually measures | Verdict |
|---|---|---|---|
| `establishedByAge` | Establishment | Registration age — invalid lower bound (§3.4.1) | **Broken** |
| `establishedByArchive` | Establishment | **Crawler attention** — see §3.4.3 | **Broken** |
| `establishedByCert` | Establishment | First cert in CT logs | **Partly broken** — see §3.4.4 |

#### 3.4.3 Capture count measures popularity, not durability

Wayback capture frequency is not a schedule. It is driven by crawler attention, which is driven by inbound links, popularity, crawl-seed inclusion, Archive-It partnerships, and manual save requests.

A heavily-linked startup can reach 50 captures in months; an obscure but continuously-operating regional business might take a decade or never get there. The corpus shows it: `bolt.new`, roughly two years old, carries 449 captures.

So `establishedByArchive = snapshots >= 50` currently means *"this site is linked-to enough that the Internet Archive crawls it often"* — and that route confers Green.

**This is a fairness defect in the worst direction for the brand.** It hands our favorable verdict to the visible and withholds it from the durable. A twenty-year-old plumbing company fails; a two-month-old hyped AI startup passes. That is close to the opposite of what a skeptic's tool should do.

> **Open item resolved (verified against the code, 2026-08-25).** The collector **does** daily-collapse. `cdxUrl` issues `collapse=timestamp:8` — the first eight characters of a Wayback timestamp are `YYYYMMDD` — with `filter=statuscode:200`, and `parseCdx` counts the returned rows. So a "capture count" is **the number of distinct days on which the archive recorded a successful capture**, not a raw crawl count.
>
> This changes the magnitude, as anticipated, and in one specific way: because the metric is bounded by the calendar, a count of 50 **cannot** be accumulated in fewer than 50 days, and cannot exceed ~365 per year.
>
> **`ESTABLISHED_SNAPSHOT_COUNT = 50` therefore carries an implicit floor of ~50 days of existence — a genuine time signal hiding inside a popularity metric.** That is worth stating plainly, because it explains why the constant has never obviously misbehaved: **it has been doing a small amount of correct work by accident.** The route is broken, but it is **less arbitrary than this correction first described** — it is not purely a popularity measure, it is a popularity measure with a weak duration floor underneath it.
>
> **It does not rescue the route.** Fifty days is not establishment, and above that floor the **binding constraint is still attention**: `bolt.new` — ~2 years old, captured on 449 distinct days — clears the floor **ninefold**. The fairness defect above stands as written.

#### 3.4.4 Certificate history is bounded by the instrument

Better than the other two: obtaining a certificate implies serving traffic, and parked domains generally do not have them.

But **Certificate Transparency only became comprehensive in 2018**. In 2026 the CT record reliably reaches back roughly eight years. A genuinely old site can show a first-cert date reflecting when CT logging started, not when it launched.

> **Dates verified (2026-08-25).** Chrome required all TLS server certificates **issued after 30 April 2018** to comply with the Chromium CT Policy, with browser enforcement landing in **Chrome 68 (24 July 2018)**. Certificates issued *before* April 2018 were **grandfathered** and never required to be logged. The spec's "roughly eight years as of 2026" is confirmed. Sources: [Chromium ct-policy announcement](https://groups.google.com/a/chromium.org/g/ct-policy/c/wHILiYf31DE/m/iMFmpMEkAQAJ), [Chromium CT enforcement-date change](https://groups.google.com/a/chromium.org/g/ct-policy/c/sz_3W_xKBNY/m/6jq2ghJXBAAJ), [Certificate Transparency in Chrome](https://googlechrome.github.io/CertificateTransparency/).

> **STRENGTHENED POST-STAGE-2 — grandfathering is worse than "partial coverage."** Because pre-April-2018 certificates were never *required* to be logged, and voluntary logging was non-uniform, **a pre-2018 first-cert date is not interpretable at all.** We cannot distinguish *"the first certificate was issued in 2012"* from *"the first **logged** certificate was 2012, and earlier ones were never logged."* Those are different facts and the record cannot tell them apart.
>
> So the cap is **not only about precision**. A cert-derived age older than 2018 is **not a measurement** — it is an artifact of when logging happened to begin for that certificate. Capping it at "over 10 years" is not rounding a known number; it is declining to report a number we do not have.

It is also F1-vulnerable: a recycled domain inherits its predecessor's certificate history.

**Principle: do not assert precision beyond what the record supports** — and, where the record cannot support a claim at all, do not make one. Any cert-derived age reaching past CT's 2018 threshold is uninterpretable rather than merely imprecise. Cert-derived age claims are **capped** — expressed as "over 10 years" rather than a specific figure beyond the instrument's reach.

> **CORRECTED POST-STAGE-3A — the cap phrasing above is unsound as written.**
>
> *"Expressed as 'over 10 years'"* is **false for a first-cert date between 2016 and April 2018.** CT logging was voluntary in that window, so a certificate first logged in 2017 may be nine years old. Publishing *"over 10 years"* would assert a floor the instrument cannot support — **L-01, in the document that publishes our method.**
>
> **The rule is a lower bound, never an upper one:** `min(floor(actual years), CERT_AGE_CAP_YEARS)`.
>
> Below the cap this is the observed age floored to whole years. At or above the cap it is the cap. In both cases the published figure is a number the domain has **at least** reached, which is sound regardless of what CT did or did not log before April 2018.
>
> **The phrasing "over 10 years" is not safe as a general cap.** Any copy derived from this must express a floor. *"At least N years"* is sound. *"Over N years"* is sound only where N is genuinely exceeded, which is what the `min()` guarantees.
>
> **Scope — added when this correction was applied (2026-08-26).** The lower-bound rule governs the **capped branch only**: dates predating CT's mandate. A first-cert date *after* 30 April 2018 is interpretable, and ships as a marked approximation (*"~N years"*, rounded), not a floor. Stated without that scope, this correction would make §3.4.4 wrong in the opposite direction — asserting a property of the output that the interpretable branch does not have. That is the same class of error the correction exists to prevent, so the scope is part of the rule.

#### 3.4.5 The live defect

A `cursor.com`-shaped domain reaches Green today, and the report publishes *"Registered ~30 years ago"* as positive evidence of establishment for a company founded in 2022.

The verdict may be correct by accident — Cursor is a legitimate company. **The rationale is false.** A true fact is presented in support of a claim it does not support, telling the reader a four-year-old company has thirty years of history.

Structurally the same defect as §6.1 and §6.2, pointed the other way: not adverse, but **over-vouching**. True fact, misleading implication, published as our reasoning. **Reasoning must be sound even when the conclusion happens to be right** — the disclosed-facts defense rests on the disclosed facts actually supporting the verdict.

> **Copy preserved for Story 20 (methodology page).** Two lines from the Stage-2 plain-terms summary say this better than the decision docs do, and should survive into the published methodology:
>
> - **"The verdict may be right; the reason we give is false."** — the disclosed-facts principle in eight words.
> - **"A two-month-old hyped startup passes; a twenty-year-old plumbing firm fails. That's backwards for a scepticism tool."** — the stakes of §3.4.3, without jargon.

Capping (§3.4.4) reduces the assertion but does not fix it. Capped, the claim becomes *"registered over 10 years ago"* — a smaller false claim rather than a true one, because the registration belongs to a different operator. **Capping bounds what we assert; continuity ensures we assert it about the right operator. Both are needed; neither substitutes.**

#### 3.4.6 The replacement: span and continuity, operator-guarded

What actually measures establishment: **continuous archive presence across a span, under the same operator.**

*"Continuous presence since 2009, under the same operator"* is a claim about operating history that depends on neither popularity nor on who held the domain previously.

**Instrument: Wayback, not certificates.** Wayback reaches to 1996 and directly records the site being *published*. CT cannot span the window (§3.4.4). Certificates become **corroborating** evidence — better proof of serving traffic, capped at CT's reach — rather than a primary route.

**Registration age is demoted** to what it validly supports: an upper bound on operating history (§3.4.1). It remains sound for `YOUNG_DOMAIN_DAYS` and unsound as an establishment route.

**The decade rule (owner, 2026-08-25).** A decade of continuity is categorically sufficient for establishment. Beyond that span, further precision adds nothing — the domain has demonstrably been operating a long time.

This satisfies Green's establishment conjunct without touching precedence. A ten-year-old domain on a threat feed is still Red, per Red → Blue → Green → Amber. Establishment is necessary for Green, never sufficient.

**What "continuity" requires is the open calibration question**, and it is harder than the span threshold. Captures in 2016 and 2026 with nothing between is two data points a decade apart, not ten years of operation. Captures in most intervening years is.

The test must tolerate gaps, because of §3.4.3: an obscure but continuously-operating site may have no captures in some years purely because nobody linked to it. **Too strict reproduces the same fairness failure as capture count.** Too loose lets two captures a decade apart pass.

Both the tolerance and the definition of "most years" are Stage 3 calibration — but they cannot be calibrated until the mechanism exists.

> **CORRECTED POST-STAGE-3A — sufficiency and necessity are two different claims.**
>
> This subsection records the decade rule and then leaves the span threshold undefined, treating them as one question. They are not.
>
> - **The decade rule is a SUFFICIENCY claim:** ten years of span is categorically enough for establishment.
> - **The span threshold is a NECESSITY claim:** how little span is too little to establish anything.
>
> §3.4 specified the first and left the second with no value and no basis. `ESTABLISHED_ARCHIVE_SPAN_DAYS` (necessity — the floor) and `CERT_AGE_CAP_YEARS` (sufficiency — the decade rule) answer different questions and are **calibrated independently. Setting one says nothing about the other.**
>
> `ESTABLISHED_ARCHIVE_SPAN_DAYS` ships drafted at `365 * 3` — **deliberately the retired `ESTABLISHED_DOMAIN_DAYS` value, not a reading of the decade rule.** Stage 3 sets the real value.
>
> **The practice, recorded because it generalises: when replacing a mechanism, hold the threshold and change only the measure.** The delta then tells you about the measure. Changing both at once makes the result uninterpretable — you cannot tell a better instrument from a moved goalpost.

#### 3.4.7 Convergence with pivot substantiation

The machinery §2.4 specifies for pivot substantiation — archive continuity plus operator continuity — **is the same machinery Green's establishment now requires.**

One piece of work serves both rules. This is a stronger argument for building it than the pivot alone made, and it means the operator-continuity decision flagged in §2.4 is now blocking **two** rules rather than one.

#### 3.4.8 When the upper bound contradicts the span — ADDED POST-STAGE-3A

§3.4.1 establishes that registration age is a **sound upper bound** on operating history. §3.4 then specifies the demotion only as *removal from the disjunction*, and says nothing about what to do when that upper bound contradicts the span. Stage 3a surfaced the case the day span shipped.

`secondlibrary.com`: **registered 2023-10-29, first capture 2014-01-03, two captures eleven years apart.** Amber before span; Green after.

It fails §3.4.6 twice — no continuity, and **the span start precedes registration.** Per §3.4.1 registration is the sound upper bound: the current operator has roughly 2.8 years of history. The report publishes 13.

**This is F1 pointing the opposite way from `cursor.com`, and span created it.** The fix for one over-vouching case introduced a second in the same class.

**A registration-date clamp** — never publish a span start earlier than the registration date — would resolve it. It requires **no operator continuity**: it is §3.4.1 applied to two facts already collected, not a new rule.

> **Owner ruling, 2026-08-26: declined. Leave it; the warning text carries it.**

Recorded as a **decision, not an open flag**, with the consequence stated: **the report will over-vouch for re-registered domains, and we know that it does.**

**Do not brief the clamp as a stopgap.** Operator continuity is the fix.

*Preserved for the record, in case the ruling is ever revisited — it is not being revisited now: this is the only known case where we hold a collected fact that directly contradicts what the report publishes. `cursor.com` is **undetectable** without operator continuity; `secondlibrary.com` is **detectable and we are choosing not to act.** That distinction is the whole of the difference between a limit and a decision.*

#### 3.4.9 When establishment cannot be evaluated at all — ADDED POST-STAGE-3A

§3.4 does not say what a domain publishes when the archive check itself did not complete. §3.2 answers it — **no verdict** — but that story is unbuilt, so behaviour degrades.

> Where establishment cannot be evaluated because the archive check did not complete, the domain currently falls through to **Amber carrying no main reason at all** — an unsourced reason would break the §6.2 symmetry rule, so none is manufactured. This is honest but thin: **the state implies concern and the rationale is empty.**
>
> §3.2's no-verdict outcome is the intended resolution. Until it ships, this shape is a **known interim state, not a defect in the establishment rules.**

**It now has a constituency**, which strengthens the case for building it: `github.com` and `kexp.org` both land here in the corpus — precisely the Amber-with-nothing-flagged shape §3.2 exists to replace. The no-verdict outcome was previously argued from principle; it now has named cases.


> **CORRECTED POST-STAGE-2 — RULE CHANGE, correcting a PM error made in the Stage 2 brief.**
>
> The Stage 2 implementation brief instructed that *"a parse failure or timeout must not deny Green."* That is wrong, and it contradicts Story 18 §3.5 (*"degraded signal blocks Green"*). **§3.5 is right.**
>
> Green requires **positive evidence** of establishment. A check that did not complete produced no evidence, so it cannot contribute to a conjunction that requires evidence. That is not the gap pushing toward concern — it raises none — it is the gap **failing to push toward Green**.
>
> The error was conflating *"missing data must not create a concern"* (correct, and what §3.2 says) with *"missing data must not block Green"* (which inverts the rule).
>
> **Resolution: a failed SPF check DOES block Green.** It creates no concern, and a DISCLOSURE caveat explains the gap. Note that §3.2's own wording — *"cannot satisfy `fewSnaps` or any other condition"* — already implied this; the error was introduced in the brief, not in this document.
>
> **The corpus could not discriminate between the two formulations**, because every corpus domain has `dns_spf` status `ok`: both reduce to the same expression. The wrong version would have shipped and surfaced on the first DoH hiccup. See §5.1.

---

## 4. Amendments to the Story 18 decision record

| Story 18 § | Amendment |
|---|---|
| **§3.4** | The classic pivot is **no longer a standalone Red trigger**. Severity is conditioned on substantiation (§2.4). Red's disjuncts: threat-feed listing; unsubstantiated pivot; accumulation (defined §3.1). |
| **§3.5** | *"An unperformed check is not a finding"* stands, extended by §1.1: **a completed check that found nothing IS a finding**, validated and sourced like any other. Caveat scoping must extend from Green-only to all states (§3.2). **§3.5's "degraded signal blocks Green" also stands** and was reaffirmed post-Stage-2 against a contrary instruction in the implementation brief (§3.3). |
| **§5** | `PIVOT_RECENT_DAYS` no longer load-bearing for false-Red risk. Added to deferred: substantiation time budget (§2.6); accumulation **ratio, checks-floor and findings-floor** (§3.1, all three — post-Stage-2); the no-verdict count threshold (§3.2); the residual SPF gate question (§3.3). **Post-Stage-2:** Green's three establishment constants are **not** on this list — they are *replaced, not calibrated* (§3.4.6, §5.2). |
| **§9** | Decision 18.5 stands. Decision 18.6 (accumulation as peer trigger) stands, now defined. |
| **§0** | Precedence rule holds and is vindicated. |

---

## 5. Measurement performed

Per v1 §5, the AI-pivot collector was run across the calibration corpus to test the PM's unverified prevalence assertion.

**Result: correction, not confirmation.** See §2.2 for the finding and its two limits. Scan data and the bisect instrument are committed as provenance alongside the corpus.

Consolidated: 49 domains scanned → 18 usable pivots, 9 unresolved, 4 AI-native (onset = first capture; founded on AI, never pivoted), 18 with no AI language found. Median onset 2.4 years ago.

The 4 AI-native domains are worth noting as a category the rubric does not currently distinguish: a company founded on AI has no pivot, which is different from a company that pivoted long ago. Both currently produce no pivot concern; only one of them is a considered outcome.

### 5.1 Corpus coverage limits — ADDED POST-STAGE-2

**A green corpus delta is not proof of correctness for paths the corpus does not exercise.**

The calibration corpus was built to span **verdicts** — every branch of the rubric has a triggering candidate. It was **not** built to span **failure modes**. Every corpus domain has `dns_spf` status `ok`, so the §3.3 question — does a failed check block Green? — was **unfalsifiable against it**: both formulations reduce to the same expression, and the delta was clean either way.

This is structural, not an oversight. A domain whose DNS reliably fails is not something you can source. The eventual answer is **synthetic fixtures for failure paths**, following the Story 18.2 precedent where synthetic fixtures covered accumulation because real 4+ flag domains did not exist.

**Story 19 Stage 3 must not read a clean corpus delta as a pass.**

> **EXTENDED POST-STAGE-2 — the stronger version of the same lesson.**
>
> **A constant that measures the wrong thing can be calibrated precisely.**
>
> The corpus produces clean distributions for `ESTABLISHED_SNAPSHOT_COUNT`, and a threshold fitted to them would separate the corpus well. It would also be measuring crawler attention rather than establishment (§3.4.3).
>
> Before calibrating any constant, ask whether it **measures what its rule claims it measures**. *"Can the corpus produce a number for this?"* is the wrong test — it passes for constants that are precisely wrong.

> **EXTENDED POST-STAGE-3 — what the gaps have in common.**
>
> Six paths have now been found that the corpus cannot exercise: certificate behaviour (§5.3), accumulation entirely, *"a failed check blocks Green"*, `THIN_SNAPSHOT_COUNT`'s failure mode, Trustpilot ratings, and the established-but-no-SPF residual branch.
>
> **They are not six unrelated omissions. Every one is a path that does not correspond to a verdict.** Failure modes, degraded branches, rare conjunctions — the things a report can *do* rather than the things it can *conclude*.
>
> That is a **property of how the corpus was built**, not an accident of which domains were chosen: it was assembled so that every branch of the rubric had a triggering candidate, which selects for outcomes and is blind to routes. **Adding domains will not fix it.** Only fixtures aimed at paths rather than outcomes will.

### 5.2 Stage 3 constant classification — ADDED POST-STAGE-2

Recorded here so Stage 3 has a **written source** rather than a restated one. Each constant is classified by whether it is sound, and if so, on what basis its value rests.

> **EXTENDED POST-STAGE-3 — a fourth basis: BOUNDED.**
>
> Three categories were not enough. Stage 3 found that `ESTABLISHED_ARCHIVE_SPAN_DAYS` sits in a **358-day gap** in the corpus, and that *every value inside that gap produces identical output across all 49 domains*. Calling that **MEASURED** is generous: the data constrains the value to a range and says nothing about where in the range it belongs. 913 versus 1000 is a choice the corpus does not make.
>
> **BOUNDED — the data constrains the value to a range but cannot locate it within that range. The bound is measured; the point inside it is chosen.**
>
> **The general principle: every measured threshold sits in a gap; what matters is the gap's width.** A narrow gap means the point barely matters and MEASURED is honest. A wide one means the point is a judgment wearing a measurement's label.
>
> BOUNDED is more honest than MEASURED and more informative than REASONED, and it tells a future calibration pass **exactly what more data would buy: a narrower interval, not a better point.**
>
> `ESTABLISHED_ARCHIVE_SPAN_DAYS` is **BOUNDED**, not Measured. Its row below is corrected accordingly.

**Sound — calibrate in Part A**

| Constant | Basis | Note |
|---|---|---|
| `YOUNG_DOMAIN_DAYS` | **Definitional** | Encodes how much evidence we require before assessing. Fitting it to a 50-domain sample would let the sample determine our caution. Chosen, not measured. |
| `THIN_SNAPSHOT_COUNT` | **Measured, in context** | Capture count is a popularity proxy (§3.4.3), but it is conjoined with `young`. Young + few captures genuinely is thin, because a young domain has had no time to accumulate captures regardless of popularity. Sound **only** in that conjunction. |
| `PIVOT_RECENT_DAYS` | **Reasoned** | The corpus shows *when* companies pivoted (median 2.4 years), not *when a pivot becomes notable*. Different questions; the first does not imply the second. More data will not settle it. |
| Accumulation ratio + both floors | **Reasoned, synthetic-only** | Zero real triggering cases. Set against synthetic fixtures, following the Story 18.2 precedent. |
| `PIVOT_ESTABLISHED_DAYS` | **Reasoned** | **ADDED POST-STAGE-3A.** Split out of `ESTABLISHED_DOMAIN_DAYS` in Stage 2, so the table above classified only its retired parent — and classified it *unsound*. **The demotion does not carry over, because the two ask opposite questions of the same field.** `ESTABLISHED_DOMAIN_DAYS` used registration age as a **lower** bound on operating history — *"this domain is old, therefore established"* — invalid per §3.4.1. `PIVOT_ESTABLISHED_DAYS` asks whether the domain is old enough that recent AI language is notable: if registration was fifteen years ago then whoever holds it now, **the domain predates the AI era.** That is an **upper**-bound use, and sound. *Same field, same value, opposite validity.* Reasoned rather than measured because *"old enough that a pivot is notable"* is a judgment about salience, which the corpus cannot settle. |
| `ESTABLISHED_ARCHIVE_SPAN_DAYS` | **BOUNDED** *(was Measured; corrected post-Stage-3)* | **ADDED POST-STAGE-3A.** **This constant replaces all three of the unsound routes listed below** — it is the successor entry, not a fourth peer. Archive span is a time measure taken directly from `wayback_first`, and the corpus carries a first-capture date for every domain whose Wayback check completed, so the data can genuinely move it. See §3.4.6 for why span and not count, and §3.4.8 for what span still cannot see. |

**Unsound — do not calibrate, replace.** All three were replaced by `ESTABLISHED_ARCHIVE_SPAN_DAYS` in Stage 3a; this table is the succession record, not a live inventory.

| Constant | Disposition |
|---|---|
| `ESTABLISHED_DOMAIN_DAYS` | Replaced by span + continuity (§3.4.6). Demoted to upper-bound use only — the surviving upper-bound uses are `YOUNG_DOMAIN_DAYS` and `PIVOT_ESTABLISHED_DAYS`. |
| `ESTABLISHED_SNAPSHOT_COUNT` | Replaced. Measures crawler attention (§3.4.3). |
| `ESTABLISHED_CERT_DAYS` | Demoted to corroborating evidence, capped (§3.4.4). |

**The reporting requirement.** **Stage 3 must report each constant's basis — measured, reasoned, or definitional — and never present a reasoned or definitional choice as calibrated.**

The methodology page publishes these numbers. If it claims thresholds are *"calibrated against a reference corpus"* when several are judgment calls, that is **L-01 applied to our own method**: asserting more than we checked, about ourselves. It is also discoverable — the corpus is in the repo, and anyone can check whether it supports a given number.

The distinction also determines **who may change what**. A measured constant is accountable to data and updates mechanically as the dataset grows. A definitional one changes only when someone decides it should. Unlabeled, a future calibration run silently shifts a judgment about our own caution because the pipeline treated it as a number to fit.

### 5.3 No corpus domain carries certificate data — ADDED POST-STAGE-3A

**Zero of 49.** crt.sh returned 5xx throughout Story 18.2, so `first_cert_date` is `failed` across the entire corpus.

**Consequence:** §3.4's certificate work — the cap, the floor labelling, the corroboration branch — is covered by **unit tests only and has never run against a real certificate.** The §3.4.4 correction above is likewise unit-tested only.

Per `docs/conventions.md`: *a clean corpus delta is not proof for paths the corpus does not exercise.* **This is that convention firing on itself** — the review gate reported clean for a part of the story it structurally could not see.

> **Requirement: any story briefing certificate behaviour must either re-collect crt.sh first, or state explicitly in its brief that it is specifying against unexercised code.** The second is acceptable. Silently assuming coverage is not.

**§5.1's lesson now has a second instance.** The first was that the corpus spans *verdicts*, not *failure modes*. The second is narrower and easier to miss: **a source being down during corpus construction silently removes a whole signal from every subsequent delta — and nothing in the delta reports it.** A delta that covers 49 domains and 0 certificates looks exactly like a delta that covers 49 domains.

---

## 6. Production hotfixes shipped during this pass

Four, recorded because they changed live behavior and two corrected published false statements.

### 6.1 False claims in Blue reports
`ai-pivot.ts` conflated "CDX failed" with "CDX found zero," publishing **"0 archived captures"** as fact when the check failed. Fixed by tracking whether the check ran. The same sentence asserted *"no major reviews found"* sourced to the registration record when only Trustpilot had been checked — removed rather than narrowed, because `reputation.ts` had the same conflation and no narrowed claim was supportable.

Verified live on the actual failure condition (archive.org unreachable from Vercel) and on the opposite branch (check succeeded, genuinely zero).

### 6.2 Unsourced reasons dropped asymmetrically
`assemble.ts` dropped unsourced reasons from `flagged[]`, so a concern could count toward a verdict and then vanish from the report — the disclosed-facts defense failing in code. Now symmetric: **a reason without a source does not count toward the verdict and does not publish.** Mirrored on `positive[]`. Changed no current verdict; the value is closing a path any future reason would inherit silently.

### 6.3 Threat-listing string equality
The Red trigger tested `valueText === "Listed"` — the most severe verdict depending on string equality with a display label. Replaced with exported constants. `Signal.status` as a discriminated field is the stronger version, delivered in §7.1.

### 6.4 Blue rendered as a concern
Blue reasons rendered under a **"Flagged"** badge in the concern colour, counting toward *"N worth a closer look"* — presenting insufficiency as suspicion, on the modal verdict for the modal query, contradicting Story 18 §3.1.

Relabelled: badge *"Couldn't establish"*, heading *"What we couldn't establish"*, tally *"not enough to assess yet"*, in `--ink-muted`. Copy describes what **we** could not determine, never what the company lacks. Presentation-layer only.

---

## 7. Infrastructure shipped during this pass

### 7.1 SignalStatus plumbing
`SignalStatus = "ok" | "failed" | "not_attempted"`, required on `Signal`. TypeScript surfaced 32 construction sites, which served as the audit. All six collectors, 26 signals. **Invariant: a source is carried when and only when status is `"ok"`**, so `source != null` still means "we can cite this," and a failed check cannot masquerade as an observation.

No verdict changed — nothing consumes `status` yet (§1.4).

> **CORRECTED POST-STAGE-2 — a second category the plumbing did not resolve.** §1.4 already corrected v1's claim that Q4 would *dissolve* once the plumbing landed. §3.4 adds a category the plumbing was never going to reach: **Green's establishment routes are unsound in what they measure, not in whether they can see missing data.** `status` makes *"we did not check"* expressible; it does nothing about a check that completed and measured the wrong thing. Those routes are replaced, not repaired (§3.4.6).

### 7.2 `signal_history` status column
Migration 0003 adds `status` with a CHECK constraint. `signalsToHistory` now records **every** signal including failed and not-attempted.

**Option (b) was chosen over (a) — record all signals, not only completed ones.** Under (a), a domain that had DMARC and then hit a DNS timeout would write no row, and the Phase 2 "what changed" digest would read that gap as *DMARC was removed* — a false change event generated by a network hiccup. Cost is ~62% more rows, negligible at MVP scale.

**The backfill was provably correct, and only because of the bug.** Every existing row was written by the filter that dropped valueless signals, so every existing row had a value, so its check demonstrably completed, so `DEFAULT 'ok'` was not a guess. Measured before the writer changed: 748 rows, zero valueless. **That window closed the instant the writer changed** — which is why the migration ran first. The reverse order would have permanently poisoned the record.

### 7.3 Parser sweep
Seven parsers now return `null` for an unparseable payload, distinct from a parsed result with genuinely absent fields. Five call sites derive status from **parse** success, not fetch success. Convention recorded (§1.5), `robots.txt` exempted with the standard cited.

The sharpest instance was verdict-bearing: `parseAnswers → []` on a malformed DoH body published as *"SPF/DMARC absent, checked,"* feeding both the concern point and the Green gate. **A parse error could deny Green and push toward Red.** Its docstring stated the collapse out loud — *"[]/empty on NXDOMAIN/empty/malformed"* — deliberate, documented, and correct-looking. Nobody was wrong; there was no rule to be wrong against. That is the argument for §1.5.

---

## 8. Sequencing

> **CORRECTED POST-STAGE-2 — two corrections.** (1) **Stage numbering:** the old item 3 read *"Story 19 Stage 2 — calibrate against the corpus."* Stage 2 was **implementation**; **Stage 3** is calibration. A document committed to guide Stage 3 pointed at the wrong stage. (2) **Reorder:** substantiation previously sat *after* calibration. It now **blocks half of calibration**, because Green's establishment routes cannot be calibrated until they are replaced (§3.4.6).

1. **Implement §3** — Q3, Q4, Q6. First consumers of `status`. **Done (Story 19 Stage 2).**
2. **Extend caveats to all states** (§3.2). **Done (Story 19 Stage 2).**
3. **Pivot substantiation + operator continuity** (§2.4, §2.6, §3.4) — **now blocking.** Serves both the pivot rule and Green's establishment (§3.4.7).
4. **Story 19 Stage 3 — calibration**, in two parts:
   - **Part A** — constants that are sound now (§5.2)
   - **Part B** — Green's establishment constants, **after step 3**
5. **Narrative timeline UI** (§2.5) — after step 3 is live.

> **UPDATED POST-STAGE-3A.** **Stage 3a is complete** (PR #54). Green's establishment route is **replaced**: archive span, status-guarded, with registration age demoted and certificates corroborating under a cap. `ESTABLISHED_ARCHIVE_SPAN_DAYS` now exists and can be calibrated **against a measure that measures the right thing** — which is what step 3 was blocking for Part B's span constant specifically.
>
> **Still blocked and unchanged:** *continuity* and *operator continuity*, both post-MVP, both waiting on the operator-continuity decision — which per §3.4.7 blocks **two** rules, not one. Span alone is the available fix, not the correct one (§3.4.8).
>
> **Recorded for the Story 20 presentation pass** — flagged by Stage 3a as pre-existing and outside its scope, noted so they are not rediscovered as new:
>
> - **Green's `positive[]` names the archive span twice** — once as the indicator's establishing reason, once as the assembler's fact line. The same duplication already existed for registration age and still exists for SPF. Presentation only.
> - **The Amber generous-default reason renders under a "Flagged" badge** — the same class of error as the Blue relabel (§6.4), one state over.

---

## 9. Decision record

| # | Decision | Status |
|---|---|---|
| 18.3.1 | A confirmed empty state is a finding and is validated like any finding | Decided |
| 18.3.2 | The plumbing is a prerequisite, not a resolution — corrected from v1 | Decided |
| 18.3.3 | The classic pivot is not a standalone Red trigger; severity conditioned on substantiation | Decided — amends 18 §3.4 |
| 18.3.4 | The product does not distinguish companies differing only in post-pivot execution quality | Decided |
| 18.3.5 | Substantiation = timing and continuity, never quality; needs operator continuity, not just archive continuity | Decided |
| 18.3.6 | Bisect bounds the onset stage; it does not rescue substantiation — corrected from v1 | Decided |
| 18.3.7 | The pivot narrative block is non-scoring; its UI is a follow-on story | Decided |
| 18.3.8 | Accumulation = ratio of concern findings to `status == "ok"` observations, with a checks-floor **and a findings-floor**; near-unreachable and documented as such | Decided (Q3) — *mechanism completed post-Stage-2* |
| 18.3.9 | Missing data never creates a verdict; caveat at one or two failures; no verdict beyond, as a non-verdict outcome | Decided (Q4) |
| 18.3.9a | **Reputation is removed from Blue's conjunction.** Blue's evidence is domain age and archive depth | Decided — *rule change, post-Stage-2* |
| 18.3.10 | Green requires SPF, not DMARC; DMARC absence publishes as caveat; narrowed not eliminated | Decided (Q6) |
| 18.3.10a | **A failed SPF check blocks Green** (Story 18 §3.5). No concern raised; a disclosure caveat explains the gap | Decided — *rule change, post-Stage-2, correcting the Stage 2 brief* |
| 18.3.11 | The no-verdict threshold is a predicate that currently happens to be a count | Decided |
| 18.3.12 | AI-onset prevalence: not supported by this corpus, never "disproven" | Decided |
| 18.3.13 | Two caveat disciplines share one channel: DISCLOSURE (our limits, no source) and OBSERVATION (the finding, sourced). `kind: "caveat"` is a routing label | Decided — *convention, post-Stage-2* |
| 18.3.14 | A `subkind` field making the source invariant testable | **PROPOSED, NOT DECIDED** — deferred to the no-verdict story, which decides it |
| 18.3.15 | A clean corpus delta is not proof for paths the corpus does not exercise; the corpus spans verdicts, not failure modes | Decided — *constraint on Stage 3 (§5.1)* |
| 18.3.16 | Registration age is a valid upper bound on operating history and an invalid lower bound | **PRINCIPLE** (F1 generalized) — post-Stage-2 |
| 18.3.17 | All three Green establishment routes are unsound and are **replaced, not calibrated** | **RULE CHANGE** — post-Stage-2 |
| 18.3.18 | Establishment = archive span + continuity, operator-guarded; Wayback primary, certificates corroborating | **RULE CHANGE** — post-Stage-2 |
| 18.3.19 | A decade of continuity is categorically sufficient for establishment; Red still overrides | **RULE CHANGE** (owner, 2026-08-25) |
| 18.3.20 | Cert-derived age claims are capped at what CT supports; do not assert precision beyond the record | **PRINCIPLE** — post-Stage-2 |
| 18.3.21 | Publishing prior-owner registration age as establishment evidence is a **live over-vouching defect** | **DEFECT** — see §3.4.5 |
| 18.3.22 | Substantiation precedes Green calibration; §8 reordered | **SEQUENCING** — post-Stage-2 |
| 18.3.23 | Continuity tolerance and the "most years" definition | **DEFERRED** to Stage 3 Part B |
| 18.3.24 | Cert-derived age is a **lower bound**: `min(floor(years), CAP)`. *"Over N years"* is unsound as a general cap | **CORRECTION** — §3.4.4 was false as written, post-Stage-3a |
| 18.3.25 | Span threshold (necessity) and the decade rule (sufficiency) are separate claims, calibrated independently | **CLARIFICATION** — post-Stage-3a |
| 18.3.26 | When replacing a mechanism, hold the threshold and change only the measure, so the delta is attributable | **PRACTICE** — post-Stage-3a |
| 18.3.27 | Registration-date clamp **declined**; the report will over-vouch for re-registered domains, knowingly | **OWNER RULING** (2026-08-26) — §3.4.8 |
| 18.3.28 | Unestablished-because-unchecked degrades to Amber with no main reason until §3.2 ships | **INTERIM STATE** — §3.4.9 |
| 18.3.29 | No corpus domain carries certificate data; §3.4's certificate work is unexercised | **COVERAGE GAP** — §5.3 |
| 18.3.30 | `ESTABLISHED_ARCHIVE_SPAN_DAYS` = **913** (~2.5y). The corpus measures a 358-day interval and cannot discriminate the point inside it; 913 is mid-gap | **BOUNDED** — Stage 3 |
| 18.3.37 | Fourth basis category **BOUNDED**: the data constrains the value to a range but cannot locate it within it. Every measured threshold sits in a gap; what matters is the gap's width | **CLASSIFICATION** — post-Stage-3 |
| 18.3.38 | The corpus delta gate diffs **reasons**, not just states. A state-only diff reports success on a story that changed only reasoning | **CONVENTION** — `docs/conventions.md`, post-Stage-3 |
| 18.3.39 | **The AI pivot stops producing a concern**; collected and published as a neutral observation. Reversed by substantiation shipping, not by a better window | **OWNER RULING / RULE CHANGE** (2026-08-26) — §2.7 |
| 18.3.40 | The durable argument is `sugarcrm.com` — the corpus's own designated pivot exemplar is ambiguous at every threshold — **not** "0 of 2" | **FINDING** — §2.7 |
| 18.3.41 | *"No true positive at any window"* measures our **sampling rule**, not the signal's recall. The corpus excludes true positives by construction | **CORRECTION** — §2.7 |
| 18.3.42 | Accumulation is now **strictly** unreachable (concern pool = 1), not merely rare. Rule and constants retained; the methodology page must say so | **CONSEQUENCE** — §3.1 |
| 18.3.43 | Every corpus gap found so far is a path that **does not correspond to a verdict**. A property of how it was built; adding domains will not fix it | **CHARACTERIZATION** — §5.1, post-hotfix |
| 18.3.44 | Trustpilot ratings are never published as findings. We report the score and link out; we never adopt its verdict | **HOTFIX** (2026-08-27) |
| 18.3.45 | Twice a correction has introduced the defect it was correcting. The argument for the copy discipline being a **check**, not a convention | **PATTERN** — post-hotfix |
| 18.3.31 | `YOUNG_DOMAIN_DAYS` confirmed at **180**. Never touches Green; moves domains only between Blue and Amber. Tightening would dress insufficiency as concern | **OWNER RULING** (2026-08-26) — posture, not measurement |
| 18.3.32 | `PIVOT_RECENT_DAYS` left at **365** knowing it produces two false Ambers; no value improves them | **OWNER RULING** (2026-08-26) — §2.7 |
| 18.3.33 | The pivot alone denies Green and publishes as the sole finding. §2.1's false-Red licence missed the false-Amber harm | **DEFECT** — §2.7, second constituency for §2.4 |
| 18.3.34 | Accumulation ratio `0.1` defended as **degradation-invariant**: above 2/12 the verdict depends on how many checks succeeded | **REASONED** — Stage 3 |
| 18.3.35 | `THIN_SNAPSHOT_COUNT`'s §5.2 rescue does not hold at the margin (`bolt.new`: 0.59 captures/day ⇒ five in nine days); corpus cannot exercise it | **DEFECT** — recorded, fix is a rule change |
| 18.3.36 | `REGISTRATION_NOTE_MIN_AGE_DAYS` named (was a bare `365` introduced in Stage 3a) | **DEFINITIONAL** — Stage 3 |

---

*This document is product and engineering decision-making informed by legal research. It is not legal advice and does not clear anything to ship. The Lane 4 licensed-attorney consult remains the launch gate.*
