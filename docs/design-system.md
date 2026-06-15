# Born Yesterday — Design System Specification

**Document:** `docs/design-system.md`
**Sprint:** 1.2 — Owner-led branded visual design system
**Status:** Decisions locked; type & color foundation accepted for MVP (iteration expected post-launch)
**Companion to:** `PRODUCT.md` v1.1 (product/strategy source of truth)

---

## 1. Brand voice principle

**Playful about ourselves; rigorous about our findings.**

Wit lives in the *chrome* — the mascot, the hatch counter, microcopy, empty states, loading states. Wit never touches the *substance* — the methodology statement, the report claims, or the way a result is described. The product is credibility; every place the voice gets cute about a finding spends trust the product depends on.

| Wit allowed | Wit forbidden |
|---|---|
| Mascot, counter ("hatching"), input placeholder, empty/loading states | Methodology statement, report findings, the indicator label, the disclaimer |

---

## 2. Copy decisions

These supersede the placeholder copy in the mockups.

- **Hatch counter:** `Something's hatching! {n} reports hatched so far.`
  ("vibe check" removed — it connotes the opposite of the sourced, rule-based positioning.)
- **Methodology statement (MVP):** deterministic and sourced. No reference to AI on the hot path — there is none in the MVP, and claiming it invites the skepticism the product exists to apply. Draft:
  > *Born Yesterday checks are built entirely from public data and fixed, published rubrics — no black box, no guesswork. Every signal we raise links back to the source it came from.*
  Supporting bullets: what a report covers · sources of data · the scoring rubric (links to methodology page) · how to read a result.
- **Disclaimer (report page):** reframed from "our AI may be wrong" to interpretation guidance. Draft:
  > *A Born Yesterday report surfaces signals, not verdicts. A raised flag means something is worth a closer look — not proof of wrongdoing.*
  Followed by the correction link (see §3).
- **AI-error language** is reserved exclusively for the future **AI Pivot Timeline** feature, scoped to that feature when it ships with its LLM-mitigation pipeline. It does not appear in MVP copy.
- **Input microcopy (draft, chrome — playful OK):** e.g. `Paste a URL — we'll go digging through the shell.`

---

## 3. Two-channel feedback split

| Intent | Label | Placement | Routes to |
|---|---|---|---|
| Site bug / technical issue | "Report an issue" | Global nav | (bug intake) |
| Content dispute on a specific report | "Request a correction" | On each report, beside the disclaimer | corrections@bornyesterday.tech |

Rationale: the editorial "corrections" voice and the 72h-public / 48h-internal SLA are for *content*, not bugs. Placing the correction request on the report itself is also better UX — the dispute is about that specific report.

- **Support link:** "Support Born Yesterday" (replaces "Support Glaavin" for legibility; reversible if a personal tie is intended).

---

## 4. Mascot — the Skepticism Indicator

The mascot **is** the Skepticism Indicator, expressed visually and **without words**. It is categorical, not a score. One animation per state; the report-delivery event triggers the matching state.

### 4.1 State contract

The mascot layer must support these named states. Each gets a static placeholder for MVP and a Rive animation later, with no layout change when the animation is slotted in.

| State | Trigger | Meaning |
|---|---|---|
| `idle` | Landing, pre-search | Ready; all flags up, calm |
| `hatching` | Report generating (loading) | Working |
| `result-green` | Report delivered — clean | **Checks out.** Established, clean signals |
| `result-amber` | Report delivered — moderate | **Some concerns.** Worth a closer look; mixed or moderate flags, not damning |
| `result-red` | Report delivered — concerns | **Red flags found.** Material concerns |
| `result-blue` | Report delivered — inconclusive | **Too new to tell.** Insufficient public footprint to assess — literally *born yesterday* |
| `limit-reached` | 3/3 daily searches used | Out of searches for now |
| `error` | Invalid URL / fetch failure | Couldn't run the check |

The four result states form a green → amber → red severity ladder plus blue as the orthogonal "can't assess yet." The amber **"Some concerns"** state carries the overall moderate verdict; this is distinct from the inline pink-flagged / cyan-positive highlights in the report body, which mark *which specific data points* are concerning or reassuring. **Mascot art note:** the placeholder PNG has three flags (blue/green/red); the four-state contract needs a fourth (amber) flag treatment — exact visual is a design pass during the mascot redraw.

The report card's status pill mirrors the active result state in words ("Checks out" / "Some concerns" / "Red flags found" / "Too new to tell"), which also satisfies the accessibility requirement that the indicator never be carried by color alone.

### 4.2 Technical direction

- **Animation tech:** **Rive** — its built-in state machine matches the "input state → transition" model directly. (Lottie was considered; it is export-from-After-Effects and linear, requiring JS segment orchestration for state logic.)
- **MVP phasing:** ship a **static SVG placeholder** for each state. Build the layer architecture and state contract now; slot the Rive file in post-MVP with zero layout change. The provided `BY_egg.png` is raster — redraw as SVG for crisp wordmark overlap and future animation.
- **Layering:** the mascot occupies a **separate, higher z-index layer** than the wordmark, within a shared positioned container, so the egg sits in the "." of the wordmark. In Next.js, the mascot is a **client component** (it will host the Rive runtime later); the wordmark and everything else stay server-rendered/static (keeps the page fast and cheap, per the cost-reduction principle).

---

## 5. Advertising architecture

Built now, served later. No ads run during development.

- **Density:** **two slots per page**, one per rail, on every page (landing and report). Consistent and modest.
- **Sizing:** IAB-standard **160×600 wide skyscraper** per rail. (Standard sizes are mandatory — non-standard slots won't be filled by any network.)
- **Layout shift:** each slot reserves fixed dimensions so ad load causes no CLS.
- **Loading:** lazy-load; label each slot "Advertisement."
- **Component:** a single `<AdSlot size id />` — renders a labeled placeholder in dev, injects the ad script in prod, gated by config/env.
- **Never list (brand integrity — a transparency brand must not use the patterns it flags):** no interstitials · no sticky/anchor ads · no autoplay · no pop-ups · **no native ads disguised as content.**
- **Mobile:** rails drop below the responsive breakpoint; at most one in-content unit, or none, for MVP.

> Trade-off on record: modest ad density is the correct brand/UX call but thins per-visit revenue against the already-inverted per-report economics, raising the importance of cost-reduction architecture and the Year-2 B2B API.

---

## 6. Recent searches feed

- **Anonymized:** no user identities or details are ever shown.
- **Content:** recently generated reports surfaced as **community proof** and as **discovery** — seeding visitors with ideas for what to search.
- Reinforces the cache-as-moat strategy (recently generated reports are exactly what the cache accumulates).

---

## 7. Layout & grid

- **Desktop:** three columns — ad rail / max-width content / ad rail.
- **Report view tabs:** "My Report Results · Recent Searches · Search Again."
- **Breakpoints:** rails collapse below the mobile breakpoint to a single content column; the wordmark + mascot overlap is the trickiest responsive element and needs its own scaling pass (deferred but noted).

---

## 8. Foundations — ACCEPTED for MVP (iteration expected post-launch)

### 8.1 Typography

A three-role system, all open-licensed (no licensing cost):

| Role | Proposal | Notes |
|---|---|---|
| Display / wordmark | Heavy rounded sans (e.g. Fredoka / Baloo 2) | Outlined in SVG, so this is a one-time design choice, not a loaded web font — designer's discretion |
| Headings | **Fraunces** | Editorial gravitas with a playful optical range — fits "rigorous substance, playful chrome" |
| Body | **Inter** (alt: IBM Plex Sans for more character) | Clean, legible workhorse |

### 8.2 Color tokens

Approximate values read from the mockups — **sample exact values from the source files before locking.** Defined as semantic CSS custom properties.

| Token | Approx. | Use |
|---|---|---|
| `--surface-header` | navy gradient `#1a1f4d → #0a0e2a` | top nav band |
| `--surface-body` | dark teal gradient `#0e1b1f → #14282b` | page background |
| `--wordmark-cream` | `#f3d690` | "BORN" |
| `--wordmark-cyan` | `#5fd4d6 → #2ba8c4` | "YESTERDAY" |
| `--wordmark-blue` | `#5a6fe0` | ".TECH" |
| `--accent-gold` | `#e0a93f` | counter number, report title, card border |
| `--link-coral` | `#e57346` | nav links |
| `--label-teal` | `#3fb0c0` | labels, section accents |
| `--flag-negative` | `#d6486f` | flagged data, red-flag pill |
| `--flag-positive` | `#4fc3d4` | positive findings |
| `--input-surface` | `#eafaf7` | input field |

> **Accessibility:** verify `--flag-negative` (pink) and `--flag-positive` (cyan) clear WCAG AA on `--surface-body`. Pink text on dark is frequently borderline. Never carry flagged-vs-positive by color alone (the worded pill + the report's inline labels satisfy this).

---

## 9. Component inventory (Story Plan checklist)

- Top nav (Support Born Yesterday · Report an issue)
- Wordmark (SVG, accessible `<h1>`) + mascot layer (state-driven)
- Hero input (real `<label>`, not placeholder-only) + witty instructions
- Hatch counter
- Methodology card
- Report tab nav (My Report Results · Recent Searches · Search Again)
- Report card: title + worded indicator pill (4 states) + body with highlight styles + footer actions (Search again · Copy · Download — the shareable report is a well-formatted rich-text object that copies and downloads cleanly; image/PDF forms can evolve later) + Request a correction link
- Recent-search list item (anonymized)
- `<AdSlot>` (placeholder in dev, script in prod)
- Footer / disclaimer
- Non-result UI states: searches-remaining indicator, limit-reached

---

## 10. Changeset to fold back into PRODUCT.md v1.1

1. **Voice section:** add the "playful chrome, rigorous substance" principle.
2. **Methodology section:** remove all "our own AI" language; ensure MVP methodology is framed as deterministic + sourced; scope the AI-error disclaimer to the future AI Pivot Timeline feature only.
3. **Corrections section:** document the two-channel split (site bugs vs. content corrections).
4. **Branding:** support link is "Support Born Yesterday."
5. **Skepticism Indicator section:** its visual expression is the mascot flag-state; cross-reference this document.

---

## 11. MVP scope / phasing reminders

- Mascot: static SVG placeholders now; Rive animations post-MVP.
- Ads: architecture (`<AdSlot>`, reserved dimensions, config gating) now; ad scripts served later.
- 3 searches/day limit: enforce mechanism (Cloudflare) now; richer visual treatment of the limit later.
- Skepticism Indicator *weights* finalized in Sprint 1.7 — this document fixes only the *visual expression* and state contract.
