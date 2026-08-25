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
| **§5** | `PIVOT_RECENT_DAYS` no longer load-bearing for false-Red risk. Added to deferred: substantiation time budget (§2.6); accumulation **ratio, checks-floor and findings-floor** (§3.1, all three — post-Stage-2); the no-verdict count threshold (§3.2); the residual SPF gate question (§3.3). |
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

### 7.2 `signal_history` status column
Migration 0003 adds `status` with a CHECK constraint. `signalsToHistory` now records **every** signal including failed and not-attempted.

**Option (b) was chosen over (a) — record all signals, not only completed ones.** Under (a), a domain that had DMARC and then hit a DNS timeout would write no row, and the Phase 2 "what changed" digest would read that gap as *DMARC was removed* — a false change event generated by a network hiccup. Cost is ~62% more rows, negligible at MVP scale.

**The backfill was provably correct, and only because of the bug.** Every existing row was written by the filter that dropped valueless signals, so every existing row had a value, so its check demonstrably completed, so `DEFAULT 'ok'` was not a guess. Measured before the writer changed: 748 rows, zero valueless. **That window closed the instant the writer changed** — which is why the migration ran first. The reverse order would have permanently poisoned the record.

### 7.3 Parser sweep
Seven parsers now return `null` for an unparseable payload, distinct from a parsed result with genuinely absent fields. Five call sites derive status from **parse** success, not fetch success. Convention recorded (§1.5), `robots.txt` exempted with the standard cited.

The sharpest instance was verdict-bearing: `parseAnswers → []` on a malformed DoH body published as *"SPF/DMARC absent, checked,"* feeding both the concern point and the Green gate. **A parse error could deny Green and push toward Red.** Its docstring stated the collapse out loud — *"[]/empty on NXDOMAIN/empty/malformed"* — deliberate, documented, and correct-looking. Nobody was wrong; there was no rule to be wrong against. That is the argument for §1.5.

---

## 8. Sequencing

1. **Implement §3** — Q3, Q4, Q6. These are the first consumers of `status`; whichever lands first sets the pattern for how the indicator reads it.
2. **Extend caveats to all states** (§3.2) — currently Green-only.
3. **Story 19 Stage 2** — calibrate against the corpus.
4. **Pivot substantiation** (§2.4, §2.6) — including the operator-continuity decision.
5. **Narrative timeline UI** (§2.5) — after 4 is live.

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

---

*This document is product and engineering decision-making informed by legal research. It is not legal advice and does not clear anything to ship. The Lane 4 licensed-attorney consult remains the launch gate.*
