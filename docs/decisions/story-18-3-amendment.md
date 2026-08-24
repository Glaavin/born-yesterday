# Story 18.3 — Lithium Epic (1 of 3)
## Amendment to the indicator model decision

**Document:** `docs/decisions/story-18-3-amendment.md`
**Type:** Decision document. Amends `docs/decisions/story-18-indicator-model.md`. No PR, no code, no build.
**Status:** DRAFT — for owner review
**Date drafted:** 2026-08-24
**Author:** PM
**Amends:** Story 18 decision doc §3.4, §3.5, §5, §9
**Triggered by:** Story 19 Stage 1 reconciliation report

---

## 0. Why this amendment exists

Story 19 Stage 1 diffed the Story 18 decision doc against `src/report/indicator.ts`. It found six structural divergences and one defect in the decision doc itself.

The decision doc was written from `mvp-spec.md` and from owner/PM discussion, without reading the shipped implementation. Its §0 precedence rule — *doc wins, but every divergence is reported before it is closed* — was drafted assuming divergences would be drift. Several were not. They were deliberate safety decisions made during Helium, with reasoning recorded in the build logs and in code comments.

The most consequential is documented in §2 below: Story 18 §3.4 removed one half of a coupled safety argument without noticing the other half existed.

**This amendment does three things:**

1. Names the root cause underlying most of the divergences, and makes fixing it a prerequisite rather than an outcome.
2. Restructures the AI-pivot signal, resolving Q1.
3. Defers three questions that cannot be honestly answered until the root cause is fixed.

Three production hotfixes were shipped during the reconciliation pass (see §7). They are recorded here because they changed live behavior and because two of them corrected published false statements.

---

## 1. The root cause: the indicator cannot distinguish "not checked" from "checked, found nothing"

Every collector returns a value or `null`. `null` means both *"this check did not complete"* and *"this check completed and found nothing."*

The indicator reads only signal values. It never reads `CollectorResult.ok`. **Collector failure is invisible to it as a category.**

### 1.1 The principle (owner, 2026-08-24)

> **A confirmed empty state is a finding, and needs to be validated like any finding.**

This is the governing statement for the whole amendment. A check that ran and found nothing has produced information. A check that did not run has produced nothing. Treating them identically is a design flaw, not a tuning problem, and it must be corrected before any threshold is set on top of it.

### 1.2 Symptoms traced to this single gap

| Symptom | Where | Status |
|---|---|---|
| Failed archive check counts as evidence of thinness → creates Blue | `indicator.ts:86` — `fewSnaps` true when `snapshots == null` | **Open** — this is Q4 |
| Report published *"0 archived captures"* when the check failed | `indicator.ts:92` | **Fixed** — hotfix, §7.1 |
| Report published *"no major reviews found"* sourced to the registration record | Same Blue sentence | **Fixed** — hotfix, §7.1 |
| Slow registration lookup → `ageDays` null → unsourced fallback reason → dropped from `flagged[]` → **Amber with an empty rationale** | `indicator.ts:150`, `assemble.ts:95` | **Open** — see §1.3 |
| `reputation.ts` sets `trustpilot.valueText = null` for both "not found" and "fetch failed" | `reputation.ts` | **Open** — same conflation, one collector over |
| Degraded signal renders as *"some expected signals are missing"* — an unperformed check described as a missing signal | `indicator.ts` Amber copy | **Open** |

### 1.3 The determinism problem

The empty-rationale path was initially scoped as a TLD quirk — `.edu` and some ccTLDs that do not publish creation dates via RDAP. It is not.

**Any registration lookup that misses the 8-second collection deadline hits it.** During hotfix verification, `masshist.org` — a thirty-year-old `.org` whose creation date was successfully collected during Story 18.2 — returned Amber with `flagged: []` and a summary reading *"none worth a closer look"* under a "Some concerns" pill, because RDAP was slow on that one request.

The consequence is that **the same domain can return different verdicts on different requests with nothing about the domain having changed.**

The product describes itself as deterministic. Story 18 §5E rule 1 states: *"Deterministic. Same inputs always produce the same output."* That is currently true only if network conditions are counted as inputs — which is not what a reader would understand by the word, and not what the methodology page will be able to claim.

### 1.4 Consequence for sequencing

**The plumbing is fixed before the remaining rules are decided.**

Three of the six structural questions from the Stage 1 report are not judgment calls. They are consequences of this gap:

- **Q4** (should missing data create Blue?) — obviously no. It is currently yes only because the code cannot see missing data as a category.
- The empty-rationale defect — largely dissolves once the fallback can honestly say *"we attempted a registration lookup and it did not complete"* and cite the attempt.
- The degraded-signal framing — becomes accurate once "not checked" is representable.

Deciding these in the abstract, against a system that cannot express the distinction, would produce rules the implementation cannot honor.

### 1.5 What the plumbing work covers

Scoped as implementation, no rule changes:

- The indicator gains access to per-check outcome: **succeeded / failed / not attempted**, distinct from the value.
- Collectors stop conflating failure with empty. `reputation.ts` is a known instance; the whole collector set is audited.
- A check that ran and found nothing produces a *finding* with a source (the query that was run). A check that did not run produces a disclosed gap, never a finding.
- No verdict logic changes in this pass. Where the corrected data would change a verdict, that is reported and decided, not applied silently.

`Signal.status` as a discriminated field (rather than the display-string constants introduced in the item 9 hotfix) belongs to this work. It touches every collector and is worth doing once.

---

## 2. Q1 resolved: the AI-pivot signal is restructured

### 2.1 The defect in Story 18

`indicator.ts:36` carries this comment:

> *"A loose `PIVOT_RECENT_DAYS` can't cause a false Red — the pivot is only one of ≥2 points."*

Helium made a **coupled** decision: because a pivot cannot fire Red on its own, a loose recency window (365 days) is safe. Two halves of one safety argument.

Story 18 §3.4 took one half — making the pivot a standalone disjunctive Red trigger — and deferred the other half to Story 19 as a routine threshold. That silently converted `PIVOT_RECENT_DAYS` from cosmetic to load-bearing.

At the shipped value, following the decision doc would mean **any established company that added AI-marketing language within the last twelve months fires Red on its own.**

The decision doc was wrong. Helium's design was better reasoned, and its reasoning was recorded where anyone reading the code would find it.

### 2.2 The deeper problem: the signal has stopped discriminating

The pivot is the product's most distinctive finding. It is also, in the 2024–2026 period, close to universal among established software companies. A signal that fires on most of an industry is not identifying anything.

**This is currently an assertion, not a finding.** See §5 — it is to be measured against the corpus before any recency threshold is set.

What is actually notable is not *"added AI language."* It is *"added AI language with nothing visible behind it"* — a claim of AI capability from a company with no prior technical footprint to support it. That is a **conjunction**, not a single approximate fact.

### 2.3 What we can and cannot distinguish

Recorded because it will be asked again.

Two companies can execute the same pivot with very different outcomes. One may emerge transformed; another may damage its product, its pricing, and its customer relationships. That difference is real, publicly discussed, and **entirely outside what Born Yesterday measures.**

Distinguishing them would require judgments about business quality, corporate intent, or customer harm. Every such judgment characterizes competence or honesty, which is precisely what the cardinal copy rule forbids and what defamation *per se* attaches to. Reaching those conclusions from RDAP, DNS, certificates, and Wayback would also require inventing a signal to justify a conclusion already held.

**So the product does not distinguish them, and says so by omission.** Where two companies differ only in execution quality, Born Yesterday reports the same facts about both. That is a correct limitation, not a gap to close.

### 2.4 The replacement signal: substantiation depth

The pivot's severity contribution is narrowed and gains a substantiation condition. What is reported is **timing and continuity, never quality.**

Facts available or nearly available:

| Fact | Status |
|---|---|
| When AI-marketing language first appears in sampled captures | Collected |
| What the homepage said before that point | Collected |
| Whether continuous archive presence precedes the language, or the history begins near the claim | `wayback_first` / `wayback_last` are **collected and never consumed** (Stage 1, C2) |
| Whether AI-adjacent *technical* vocabulary predates the AI-*marketing* vocabulary | Buildable — a second keyword class scanned separately |

A company with two decades of continuous archive presence and technical vocabulary preceding its marketing shift reads differently from one with eighteen months of history and no prior technical footprint. Both are facts. Neither is a judgment.

This is finding F1 (archive-continuity, Story 18.2) applied to the pivot rather than to Green.

### 2.5 The narrative block: more surface, less severity

The pivot's **narrative presence expands** into a non-scoring block: the dates, what the homepage said before and after, the Wayback links, the substantiation evidence — rendered as a sourced factual timeline with no verdict attached.

Three reasons:

- **Legally strongest.** Neutral juxtaposition is protected precisely because the reader draws the inference. Editorializing the gap supplies the endorsement that creates liability.
- **Most shareable artifact the product can produce.** *"Here is what this company's homepage said in 2019, 2022, and 2025"* is compelling and contains no claim.
- **Solves the non-event problem.** Green and Blue verdicts give a reader little. A pivot timeline is content regardless of verdict.

**The split: the pivot's severity contribution gets narrower and better substantiated; its narrative presence gets much larger.**

### 2.6 Time-cost constraint (binding)

Substantiation requires **more Wayback captures** than pivot detection does. Detecting onset works from a sparse sample; establishing continuity does not. Archive.org is already the slowest dependency in the system and caused three of the defects fixed during this pass.

**Therefore, as a constraint on the feature rather than a note to remember:**

- The substantiation scan gets a **fixed time budget**, separate from and subordinate to the overall collection deadline.
- If it cannot complete within budget, **the report renders without substantiation and discloses that it was not established.**
- A partial scan never produces a substantiation conclusion. Consistent with §1.1: not-attempted and completed-empty are different findings.
- Real timing data comes from production, not a synthetic test.

### 2.7 Consequence for `PIVOT_RECENT_DAYS`

Because a bare pivot is no longer the trigger, the recency window stops being load-bearing in the way §2.1 describes. It remains a calibration input, informed by the §5 measurement.

### 2.8 Follow-on story

The narrative timeline's **presentation** is deliberately not scoped here. It becomes its own UI story after the pivot data work is live and operational, so it can be designed against what the substantiation scan actually returns rather than against assumptions.

**Dependency:** the narrative block will need more than the indicator consumes — before/after homepage text, multiple dated captures, per-capture Wayback links. The data story must capture and persist what the narrative story will need, so the UI work is not blocked on a second collection pass.

---

## 3. Deferred until after the plumbing lands

These are genuine judgment calls. They depend on what the corrected system can see, and are deliberately not answered here.

| # | Question | Why deferred |
|---|---|---|
| **Q3** | What is accumulation actually counting? | The doc wants findings ÷ *successfully-checked* signals with a minimum floor. That denominator is not expressible today. Stage 1 item 14 also found the obvious candidate is wrong — *"Surfaces N public signals"* counts four constant link-outs emitted on every report regardless of findings, so it is not a count of successful checks. Finding F2 adds that accumulation needs non-hygiene inputs or it can never fire on an established domain. |
| **Q6** | Does the email-auth Green gate survive? | Stage 1 C1: it is a **binary gate**, not a weighted point — either a missing SPF or a missing DMARC blocks Green outright. Worse than F2 predicted. `masshist.org`, `suckless.org`, `slackware.com`, `xfce.org` — long-established institutions with no other findings — cannot be Green. F2 measured ~24% of the corpus lacking DMARC. The gate also appears in **no rubric document**, which is its own problem for a publishable rubric. |
| **NEW** | Should the indicator produce a verdict *at all* when foundational signals were not collected? | Not "which verdict" — **whether**. A report built on three of sixteen signals may not be a report. Only answerable once the system can count what it actually checked. |

---

## 4. Amendments to the Story 18 decision record

| Story 18 § | Amendment |
|---|---|
| **§3.4** | The classic pivot is **no longer a standalone Red trigger**. Its severity contribution is conditioned on substantiation (§2.4). Red's disjuncts are now: threat-feed listing; unsubstantiated pivot; accumulation (definition pending Q3). |
| **§3.5** | *"An unperformed check is not a finding"* stands, and is extended by §1.1: **a completed check that found nothing IS a finding, and is validated and sourced like any other.** The indicator must be able to express both. |
| **§5** | `PIVOT_RECENT_DAYS` is no longer load-bearing for false-Red risk (§2.7). Added to deferred: the substantiation time budget (§2.6). |
| **§9** | Decision 18.5 (*"Red is disjunctive over enumerated causes"*) stands. Decision 18.6 (accumulation as peer trigger) stands in principle; its definition is deferred to Q3. |
| **§0** | The precedence rule holds and is vindicated: doc wins by default, **every divergence reported before closing**. That clause is why this amendment exists rather than a silent overwrite of Helium's safety design. |

---

## 5. Measurement task (before any pivot threshold is set)

Run the existing AI-pivot collector across the 50-domain calibration corpus and report the **distribution of AI-language onset dates**.

This exists because the PM asserted, in discussion, that most established software companies added AI-marketing language within the last twelve months — and did not verify it. That assertion currently underpins §2.2's reasoning about the signal having stopped discriminating.

Either it is a finding or it is a correction. It directly informs where the recency window should sit, and it is cheap: the collector exists and the corpus exists.

Report the distribution. Do not set a threshold from it in the same pass.

---

## 6. Sequencing

1. **Plumbing** (§1.5) — CC implementation. No rule changes. Mechanical.
2. **Measurement** (§5) — cheap, can run in parallel.
3. **Remaining decisions** (§3) — owner + PM, against a system that can see what it checked.
4. **Pivot data work** (§2.4) — substantiation scan, time-budgeted.
5. **Story 19 Stage 2** — calibration, against a settled rubric.
6. **Narrative timeline UI** (§2.8) — after 4 is live.

Steps 1 and 2 unblock immediately and require no further decisions.

---

## 7. Production hotfixes shipped during this pass

Recorded because they changed live behavior and two corrected published false statements.

### 7.1 False claims in Blue reports
`ai-pivot.ts` conflated "CDX failed" with "CDX found zero," so a failed archive check published **"0 archived captures"** as fact. Fixed by tracking whether the check ran: a completed check publishes its count with a CDX source; a check that did not run discloses the gap. The same sentence asserted *"no major reviews found"* sourced to the registration record when only Trustpilot had been checked — removed rather than narrowed, because `reputation.ts` has the same failed-vs-empty conflation and no narrowed claim was supportable.

Verified live on the actual failure condition (archive.org unreachable from Vercel), and on the opposite branch (a domain whose check succeeded and genuinely found zero).

### 7.2 Unsourced reasons dropped asymmetrically
`assemble.ts` dropped any reason lacking a source from `flagged[]`, so a concern could count toward a verdict and then vanish from the report — the disclosed-facts defense failing in code. Now applied symmetrically: **a reason without a source does not count toward the verdict and does not publish.** Mirrored on `positive[]`.

Changed no current verdict; both concern types are structurally sourced today. The value is closing a path any future reason would inherit silently.

### 7.3 Threat-listing string equality
The Red trigger tested `valueText === "Listed"` — the product's most severe verdict depending on string equality with a human-readable display label. Replaced with exported constants. A discriminated `Signal.status` field is the stronger version and belongs with §1.5.

### 7.4 Blue rendered as a concern
Blue reasons rendered under a **"Flagged"** badge in the concern colour and counted toward *"N worth a closer look"* — presenting insufficiency as suspicion, on the modal verdict for the modal query, contradicting Story 18 §3.1 directly.

Relabelled: badge *"Couldn't establish"*, heading *"What we couldn't establish"*, tally *"not enough to assess yet"*, in `--ink-muted` rather than the concern token. Copy describes what **we** could not determine, never what the company lacks. Presentation-layer only; no report-shape change, no migration, no cached-report incompatibility.

---

## 8. Decision record

| # | Decision | Status |
|---|---|---|
| 18.3.1 | The indicator must distinguish not-checked from checked-and-empty. A confirmed empty state is a finding and is validated like any finding. | Decided |
| 18.3.2 | Plumbing precedes remaining rule decisions. | Decided |
| 18.3.3 | The classic pivot is not a standalone Red trigger. Severity is conditioned on substantiation. | Decided — amends 18 §3.4 |
| 18.3.4 | The product does not distinguish companies that differ only in post-pivot execution quality. Correct limitation, not a gap. | Decided |
| 18.3.5 | Substantiation = timing and continuity, never quality. | Decided |
| 18.3.6 | The substantiation scan is time-budgeted; failure to complete degrades to disclosure, never to a conclusion. | Decided |
| 18.3.7 | The pivot narrative block is non-scoring; its UI is a follow-on story. | Decided |
| 18.3.8 | Q3, Q6, and the verdict-on-incomplete-data question are deferred until after plumbing. | Decided |
| 18.3.9 | AI-onset distribution is measured against the corpus before any pivot threshold is set. | Decided |

---

*This document is product and engineering decision-making informed by legal research. It is not legal advice and does not clear anything to ship. The Lane 4 licensed-attorney consult remains the launch gate.*
