# Story 18 — Lithium Epic (1 of 3)
## Indicator model decision: rule-based vs. numeric weighting

**Document:** `docs/decisions/story-18-indicator-model.md`
**Type:** Decision document. No PR, no code, no build.
**Status:** DRAFT — for owner review, then advisory ratification
**Date drafted:** 2026-08-12
**Author:** PM
**Companions:** `PRODUCT.md`, `mvp-spec.md` §2E, `legal-risk-register.md`, `legal-summary-for-advisors.md`, `risk-exposure-and-derisk-analysis.md`, `profile-section-brief.md`

---

## 0. Verification gap and precedence (read first)

This document describes the indicator's rule structure from `mvp-spec.md` §2E, the four-state contract in `design-system.md` §4.1, and the decisions reached in owner/PM discussion. **It has not been diffed against the shipped implementation in `src/report/indicator.ts`.**

Helium shipped a working indicator, so divergence is likely.

**Precedence (owner decision):** where this document and the shipped code disagree, **this document wins.** It is the intended design; the code predates the decision. Divergences are resolved by changing the code, not by amending this document to match.

**With one condition: every divergence is reported, not silently overwritten.** The Story 19 reconciliation pass produces a delta list, and each delta is surfaced to the owner before it is closed. The reason is that some divergences will exist because implementation discovered something the spec missed — an edge case, an ordering problem, a signal that behaves differently in practice than on paper. Those are findings worth keeping, and a blanket overwrite would discard them without anyone noticing.

So: the doc is authoritative, the code conforms, and any place the code knew something the doc didn't gets escalated rather than deleted.

Nothing below describes current behavior. It describes agreed target behavior.

---

## 1. What this story decides

Four things:

1. **The model.** Rule-based or numeric-weighted.
2. **The rule structure.** How many rule shapes, what logical form each state takes, precedence between them.
3. **The firewall.** Whether Profile Section data may feed the Skepticism Indicator.
4. **What is explicitly deferred to Story 19.**

It does **not** decide any threshold value. Every number in the rubric is a Story 19 calibration output.

---

## 2. Decision 1 — Model: rule-based

**Decided: rule-based.**

### 2.1 What the legal axis actually found

The legal research does not disqualify numeric weighting, and it explicitly debunks the common assumption that a numeric score is an easier defamation target — numeric ratings have repeatedly survived (the Avvo line).

The finding is narrower and more useful: the protective ingredient is **disclosed facts plus subjective framing**. Rule-based gets this structurally and for free — the verdict is a transparent function of a small set of enumerated, linked, sourced facts. A weighted model can achieve the same protection but must *engineer* it and then *maintain* it continuously: the per-factor breakdown must render with the score, the weights must be published, and the labeling must stay subjective. Forever, across every future rubric change.

So the legal axis is not "weighted is dangerous." It is **"weighted costs more to keep safe, permanently."** That reframes the question as engineering and economics, which is where it is actually settled.

### 2.2 The decisive argument: we already forfeited weighting's benefit

Weighted's advantage over rule-based is granularity — finer gradations, a continuous surface, the ability to rank and compare.

The product has architecturally discarded granularity. The four-state categorical contract is locked in `PRODUCT.md` §3, `mvp-spec.md` §2E, `design-system.md` §4.1, and the mascot state machine. A weighted model would compute a number that we then throw away by bucketing it into four states.

That is paying weighted's full ongoing cost and capturing almost none of its benefit.

### 2.3 Supporting arguments

**Calibration is tractable at our sample size; weight-fitting is not.** The calibration corpus is ~40 domains (§5 of the Profile brief, adopted here). Forty samples is enough to confirm that categorical rules bucket domains sensibly — you can inspect each one and ask "is this the right state." Forty samples is not enough to fit weights: interaction effects are not locally inspectable, adjusting the domain-age weight silently changes how every other signal behaves at the margins, and any apparent fit is likely noise.

**The disclosed-facts machinery is already built.** The `Reason` interface with `kind: "caveat"` exists and the indicator already emits structured reasons with linked causes. Rule-based consumes this natively — a rule fires, it produces a reason. Weighted would additionally require a per-factor breakdown rendered *with* the score (legal register L-04's condition), which is new report JSON, new UI, and a permanent obligation that breakdown and number never drift apart.

**Founder attention is the scarcest resource.** Under a tip-led revenue posture with near-zero Year-1 revenue, the operative cost of a model is not compute — it is recurring owner attention. Weighted requires ongoing calibration, ongoing disclosure discipline, and ongoing firewall defense. Rule-based converts a recurring cost into a one-time one.

**The Profile firewall is structurally easier to hold.** See §4.

### 2.4 What was NOT the reason

Recorded deliberately, because this question will return:

- Weighted was **not** rejected as legally unsafe.
- Weighted was **not** rejected as technically infeasible.
- Weighted was rejected as carrying a higher continuous compliance and attention cost for a benefit the four-state categorical contract discards.

**Revisit condition:** if the product ever moves off categorical output — a sortable index, a comparison view, a ranked list, an API that returns a number — this decision should be reopened rather than treated as settled. The reasoning above stops applying the moment granularity becomes a feature rather than a discarded intermediate.

---

## 3. Decision 2 — Rule structure

The four states are **not** a severity ladder with a special case attached. They are three qualitatively different rule shapes plus a residual. That asymmetry is the design.

### 3.1 The shapes

| State | Logical form | Meaning |
|---|---|---|
| **Red — "Red flags found"** | Disjunctive over a short enumerated list | Any single material trigger fires it |
| **Blue — "Too new to tell"** | Conjunction of absences | Insufficient footprint to assess |
| **Green — "Checks out"** | Conjunctive, requires positive evidence | Affirmatively established and clean |
| **Amber — "Some concerns"** | Residual | Everything the other three didn't claim |

**Red is disjunctive on a short list.** Each trigger is individually nameable and individually traceable to a linked source. This is doing legal work: every Red verdict can point at one specific cause and say *this, here, is why*. No Red is ever the product of an unnameable aggregate.

**Green is conjunctive and requires positive establishment.** Green means affirmative evidence of establishment, never merely the absence of red flags. Several conditions must be simultaneously true; any single failure drops out of Green. Green is hard to earn, which is correct — a favorable verdict from a skeptic's tool should cost something.

**Blue is a conjunction of absences.** Not "we found bad things" but "we did not find enough to say anything." Insufficiency, not suspicion.

**Amber is the residual.** Explicitly the "we found some things, none of them individually damning" bucket. This is why Amber can be generous without being dishonest — it is where uncertainty is supposed to land, and it is the default when no other state claims the domain.

### 3.2 Precedence order

**Red → Blue → Green → Amber**, evaluated in that order, Amber as catch-all.

**Red first.** Material concern survives establishment evidence. A fifteen-year-old company appearing on a threat feed today is Red, not Green-with-a-caveat. Establishment does not launder a live listing.

**Blue before Green.** A clean bill of health cannot be certified on a thin footprint — that is the false-confidence failure. When we lack data, the honest answer is "too new to tell," not "checks out."

**Green before Amber.** Amber must be the residual, not a competitor to Green. If Green's conjunction is satisfied, only Red overrides it.

### 3.3 The Blue-vs-Amber boundary (decided)

**Case:** a domain that is both thin *and* mildly flagged. Example shape: a very young domain, minimal archive, no DMARC, WHOIS privacy enabled.

**Decision: Blue wins.**

Soft flags drawn from a thin evidence base do not carry the weight Amber implies. Missing DMARC on a domain with almost no operational history tells you close to nothing — it is what you would expect at that stage. Firing Amber there makes the flag do work the evidence cannot support, and it is a direct route into the libel-by-omission problem (legal register L-12): presenting a normal-for-stage condition as a concern without noting that it is normal for that stage.

**Consequence, accepted:** most young companies will return Blue. That is on-brand, honest, and produces a large share of "too new to tell" verdicts. The Profile Section (separate epic) is the intended remedy for the resulting non-event problem, not a change to this rule.

### 3.4 Red triggers

Red fires on **any** of the following. Thresholds deferred to Story 19.

| Trigger | Nature | Displayable cause |
|---|---|---|
| Threat-feed listing | Binary, external | "Listed on [feed], as of [date]" + link |
| Classic pivot pattern | Derived, two dated facts | "Domain registered [date]; AI language first appears in sampled captures [date]" + Wayback link |
| **Accumulation** | Count of findings | "[n] of [m] checked signals returned findings" + the findings themselves, each linked |

**On the accumulation trigger.** This was initially challenged in drafting as being aggregate in nature — structurally closer to the weighted model being rejected — and therefore a weaker sibling of the other two triggers.

That challenge was wrong, and the reason matters. **The finding is the count itself.** "This domain returned findings on 8 of 14 checked signals" is a single fact with a source-of-record, as nameable and as linkable as a threat-feed listing, and every contributing signal is already displayed individually with its own source. It satisfies the same structural test the other Red triggers satisfy.

It is therefore a **peer trigger**, not a lesser one.

The product argument is equally strong: a wall of Amber findings under a "Some concerns" pill reads as the tool under-reacting. Undercalling is a credibility failure in both directions.

**Copy constraint on accumulation-Red.** Unlike the other two triggers, this one does not explain itself. Threat-feed-Red is self-evident; count-Red requires a sentence conveying magnitude without characterizing. That sentence must:

- State the count and the denominator as bare facts
- Make no comparative claim ("unusual," "more than most") unless and until we can source it against our own corpus — that is Profile Section A10, currently gated on ~1,000 domains
- Make no sector or category claim ("for a banking site," "for a company this size") — we do not classify companies and doing so supplies the reader's inference instead of letting them draw it
- Avoid adversarial framing ("flags against it") — findings are observations, not a prosecution

Target shape: *"8 of the 14 signals we check returned findings. Each is listed above with its source."* The reader supplies the significance. This is both the safer posture and the more persuasive one.

This copy is a Lane 4 review item.

### 3.5 Two cross-cutting structural rules

**Caveats are orthogonal to state.** The `kind: "caveat"` mechanism emits regardless of which state fired. A Green report may carry *"note: [threat feed] was unreachable at time of check."* A Blue report may carry *"note: many legitimate new businesses register domains shortly before launch."* **Caveats never change the verdict; they qualify it.**

This keeps L-12 compliance out of the state machine. If innocent-explanation notes were rules, each would need a precedence position and the state logic would become unreadable.

**Degraded signal blocks Green but does not force Amber.** If a check could not be performed, we did not perform it — so Green's positive-evidence conjunction cannot be satisfied. But **an unperformed check is not a finding.** It must not push toward concern either. The domain falls through to Blue or Amber on the strength of everything else, and a caveat discloses the gap.

Corollary for Story 19: the accumulation trigger's denominator must be *successfully checked* signals, not attempted ones, with a minimum-checks floor. Otherwise degraded collection becomes a path to Red, inverting this principle. See §5.

---

## 4. Decision 3 — The Profile Section firewall (D1)

**Ratified: Profile Section data does not feed the Skepticism Indicator. Under any model.**

Per `profile-section-brief.md` §7.2. The rule-based model earns the disclosed-facts opinion protection because the verdict is a transparent function of a small, enumerated, linked set of facts. The moment a curated profile signal becomes an input, the verdict stops being transparently derivative and becomes a judgment informed by an editorial selection — the posture the defamation research specifically fenced off.

**Why the model choice makes this easier to hold.** A rule-based model has no natural slot for "one more signal" — each rule is a deliberate, individually-defensible decision that someone has to argue for. A weighted model is a machine that accepts inputs, and every high-value profile signal will look like it belongs in it. Under weighted, the firewall becomes something defended against the product's own instincts every quarter. Under rule-based, the architecture simply does not invite the breach.

This is a supporting argument for §2's decision, recorded here because the firewall was ratified in the same session.

**Two scope reassignments, not breaches:**

- **Google Safe Browsing** — a sanctioned official threat feed. Routes to the Skepticism Report as a third threat source, not to the Profile Section. Separate story. *(PM note: verify commercial-use terms before scheduling — the free Safe Browsing API is non-commercial-only; Web Risk is its commercial sibling. See §8.)*
- **Regulatory enforcement records** (FTC, SEC litigation, state AG) — genuinely verdict-relevant, but entity matching is hard and the payload is severe. Routes to Lane 4, not to a build story.

---

## 5. Explicitly deferred to Story 19

Every threshold. Named here so nothing is silently invented during implementation.

| Deferred item | Note |
|---|---|
| Domain-age bands | |
| `PIVOT_RECENT_DAYS` — what "very recently" means | Already flagged in ops-tasks; decide research-vs-placeholder during calibration |
| Archive-depth floor for Blue | |
| **Green's archive-depth floor, independent of domain age** | Concept agreed: an old domain with almost no archive presence is established by registration but unestablished by activity. Whether long certificate history alone should carry it into Green is a calibration question. Owner requested fuller discussion in Story 19. |
| **Accumulation trigger: threshold AND denominator** | Denominator decision precedes the number. Recommended form: ratio of findings to *successfully checked* signals, with a minimum-checks floor so a domain with few successful checks cannot reach accumulation-Red. Follows directly from §3.5. |
| Green's positive-establishment conditions | Which signals, at what values |
| Mitigating-signal treatment | Whether any signal can pull *out* of a state or only into one |
| Accumulation-Red copy | Drafted against §3.4 constraints, then Lane 4 review |

---

## 6. What this decision does not touch

- The four-state contract itself — locked, not reopened here
- Mascot state mapping — locked in `design-system.md` §4.1
- The methodology page (Story 20)
- Any Profile Section build work — separate epic, gated on the capture spike
- The revenue posture (tip vs. ads) — open, tracked separately
- Banned-vocabulary list for indicator copy — to be advised by legal agent; §3.4's constraints stand in the interim

---

## 7. Open items carried out of this story

| Item | Owner | Where it goes |
|---|---|---|
| D2 — named-individual boundary as permanent product constraint | Owner | Standalone ratification; does not require the indicator decision |
| D3 — adopt the ~40-domain corpus as the Story 19 calibration set | Owner | Standalone ratification; also unblocks the capture spike |
| L-24 / L-25 / L-26 added to the legal register | Legal agent | Register update |
| Google Safe Browsing vs. Web Risk licensing | PM research | Before the threat-feed story is scheduled |

---

## 8. Prerequisites for Story 19

1. **Reconcile this document against `src/report/indicator.ts`.** Diff the shipped precedence order, Red triggers, Green conditions, and caveat behavior against §3. Produce a delta list.

   Per §0, this document wins by default and the deltas become Story 19 implementation scope. But the delta list is **reported to the owner before any of it is closed** — if the code diverged because implementation learned something (an edge case, an ordering problem, a signal that behaves differently in practice), that is a finding, and it gets raised rather than overwritten. Report the *reason* for each divergence where it can be inferred from the code or the build log, not just the fact of it.
2. **Build the calibration corpus** (~40 domains, committed to the repo, per the composition in `profile-section-brief.md` §2.3).
3. **Resolve the test-domain gap** — a reliable Blue requires a domain we control. Already in ops-tasks.
4. **Threat-feed keys**, which gate any Green tightening that depends on a performed threat check. Already in ops-tasks; blocks Story 20b.

---

## 9. Decision record

| # | Decision | Status |
|---|---|---|
| 18.1 | Indicator model: **rule-based** | Decided |
| 18.2 | Rule structure: three shapes plus residual, per §3.1 | Decided |
| 18.3 | Precedence: **Red → Blue → Green → Amber** | Decided |
| 18.4 | Blue beats Amber on thin-and-mildly-flagged | Decided |
| 18.5 | Red is disjunctive over enumerated causes | Decided |
| 18.6 | Accumulation is a **peer** Red trigger, not a lesser one | Decided |
| 18.7 | Caveats are orthogonal to state and never alter the verdict | Decided |
| 18.8 | Degraded signal blocks Green without forcing Amber | Decided |
| 18.9 | Profile firewall (D1) ratified under any model | Decided |
| 18.10 | All thresholds deferred to Story 19 | Decided |

---

*This document is product and engineering decision-making informed by legal research. It is not legal advice and does not clear anything to ship. The Lane 4 licensed-attorney consult remains the launch gate.*
