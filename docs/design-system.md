# Born Yesterday — Design System Specification

**Document:** `docs/design-system.md`
**Epic:** Hydrogen — owner-led branded visual design system (see `docs/conventions.md`)
**Status:** Decisions locked; type & color foundation accepted for MVP (iteration expected post-launch). **Palette retoned in PRs #34/#35 — see §8.2.**
**Companion to:** `PRODUCT.md` v1.3 (product/strategy source of truth)

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
  **As shipped (PR #34):** the methodology statement is no longer an always-open card. It sits **behind a disclosure** — a "View Our Report Methodology" link at the end of the hatch-counter line (the `HatchMethodology` client component owns the open/closed state; it reveals `MethodologyCard`). Collapsed by default.
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

The four result states form a green → amber → red severity ladder plus blue as the orthogonal "can't assess yet." The amber **"Some concerns"** state carries the overall moderate verdict; this is distinct from the inline pink-flagged / cyan-positive highlights in the report body, which mark *which specific data points* are concerning or reassuring.

> **Mascot art note (as shipped — reality, corrected in Story 18.1).** §4.2 promises "a static SVG placeholder for each state," wired so a Rive file slots in later. **What shipped is the state contract wired to *one shared inline-SVG asset* across all eight states** — the `state` prop switches, but the pixels do not (`src/components/Mascot.tsx`). There is no `BY_egg.png` in the repo, and the fourth **amber** flag the four-state contract needs still does not exist. Meaning is not lost — the `SkepticismPill` carries the verdict in words, so the never-by-color-alone requirement holds. **But the mascot *is* the Skepticism Indicator per §4, and right now it does not indicate.** This is a tracked **product gap**, not merely a doc correction (`docs/ops-tasks.md`).

The report card's status pill mirrors the active result state in words ("Checks out" / "Some concerns" / "Red flags found" / "Too new to tell"), which also satisfies the accessibility requirement that the indicator never be carried by color alone.

### 4.2 Technical direction

- **Animation tech:** **Rive** — its built-in state machine matches the "input state → transition" model directly. (Lottie was considered; it is export-from-After-Effects and linear, requiring JS segment orchestration for state logic.)
- **MVP phasing:** ship a **static SVG placeholder** for each state. Build the layer architecture and state contract now; slot the Rive file in post-MVP with zero layout change. The provided `BY_egg.png` is raster — redraw as SVG for crisp wordmark overlap and future animation.
  > **Shipped reality (Story 18.1):** the "placeholder *for each state*" part did not ship — the contract is wired to **one shared inline-SVG** across all eight states. The layering/architecture is in place (so per-state art or Rive can slot in later with no layout change), but distinct per-state art is outstanding. See the §4.1 mascot art note and `docs/ops-tasks.md`.
- **Layering:** the mascot occupies a **separate, higher z-index layer** than the wordmark, within a shared positioned container, so the egg sits in the "." of the wordmark. In Next.js, the mascot is a **client component** (it will host the Rive runtime later); the wordmark and everything else stay server-rendered/static (keeps the page fast and cheap, per the cost-reduction principle).

---

## 5. Advertising architecture

Built now, served later. No ads run during development.

- **Density:** **two slots per page**, one per rail, on every page (landing and report). Consistent and modest.
- **Sizing:** IAB-standard **160×600 wide skyscraper** per rail. (Standard sizes are mandatory — non-standard slots won't be filled by any network.)
- **Layout shift:** each slot reserves fixed dimensions so ad load causes no CLS.
- **Loading:** lazy-load; label each slot. **As shipped (PR #35):** the reserved placeholder reads as empty-but-reserved inventory — a `bg-black/30` recessed panel, **no border**, with a **stacked "FUTURE / ADVERTISEMENT"** label (was a single "Advertisement"). The §5 constraints are unchanged: still a plain in-flow, fixed-size, labeled box, ads gated off by default (`src/components/AdSlot.tsx`).
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

Values below are the **shipped palette**, read directly from `src/app/globals.css` `@theme` — the **source of truth** (each token is available as a `--color-*` utility **and** a CSS variable). The palette was **retoned in PRs #34/#35** (pink accent, green positive, mint labels, azure masthead, dark-teal body); the token layer was **renamed to role-based names in Story 18.1** (see the convention below). Gradients are vertical (top→bottom). **The name describes the role; the value is whatever the current skin sets** — so the "current colour" notes are descriptive, not guaranteed.

**Flat colors**

| Token | Value (current skin) | Role / use |
|---|---|---|
| `--accent-primary` | `#ff4f93` (pink) | counter number, report title, card border, methodology link |
| `--link-default` | `#ff6fa8` (pink) | nav links |
| `--label-accent` | `#83f0c4` (mint) | labels, section accents, search hover |
| `--flag-positive` | `#56dd86` (green) | positive findings |
| `--flag-negative` | `#ff5f88` (pink-red) | flagged data |
| `--wordmark-born` | `#ff5c9a` (pink) | "BORN" + tagline + egg fill |
| `--wordmark-tech` | `#45c8ff` (azure) | ".TECH" / mascot poles |
| `--input-surface` | `#eaffff` | input field |
| `--ink` | `#e9f1f2` | primary body copy |
| `--ink-muted` | `#99b7b3` (muted teal) | secondary copy / captions / faint borders |

**Indicator (Skepticism Indicator pill)** — role-named *per verdict*, so the name can never contradict the value:

| Token | Value (current skin) | Verdict |
|---|---|---|
| `--indicator-checks-out` | `#56dd86` (green) | "Checks out" |
| `--indicator-concerns` | `#ff5f88` (pink) | "Some concerns" |
| `--indicator-red-flags` | `#ff2f5c` (crimson) | "Red flags found" |
| `--indicator-too-new` | `#3fb0f2` (azure) | "Too new to tell" |

**Gradients** (paired stop tokens + a composed `--gradient-*`)

| Token | Value (current skin) | Role / use |
|---|---|---|
| `--gradient-surface-header` | `--surface-header-deep #071233` → `--surface-header-from #1670cc` → `--surface-header-to #2ba6f5` | masthead band |
| `--gradient-surface-body` | `--surface-body-from #0c4744` → `--surface-body-to #062c2d` | page background |
| `--gradient-wordmark-yesterday` | `--wordmark-yesterday-from #45de79` → `--wordmark-yesterday-to #8ff0a6` | "YESTERDAY" |

> **Naming convention (rule).** **Token names describe role, never color.** The palette is expected to change; names must survive it. **Do not introduce a token named for its current value.** (`--indicator-red-flags` keeps the word "red" deliberately: "red flag" is the warning-sign idiom drawn from the locked verdict label "Red flags found," not a color claim.)
>
> **Renamed in Story 18.1** (names only — every value byte-identical): `accent-gold→accent-primary` · `link-coral→link-default` · `label-teal→label-accent` · `wordmark-cream→wordmark-born` · `wordmark-cyan→wordmark-yesterday` (+ stops/gradient) · `wordmark-blue→wordmark-tech` · `navy-deep→surface-header-deep` · `indicator-green→indicator-checks-out` · `indicator-amber→indicator-concerns` · `indicator-red→indicator-red-flags` · `indicator-blue→indicator-too-new`. Historical build-logs keep the old names (point-in-time records).

> **Accessibility — WCAG AA re-verify is PARKED (owner).** The old AA ratios were measured against the previous navy body and **no longer apply**; `globals.css` marks them pending against the new dark-teal body. A formal re-verify is **parked pending palette lock — not unnoticed.** Recorded now: the **pink accent used as small text** — the hatch-counter number and the "View Our Report Methodology" link — measures roughly **3.4–4.2:1** on the teal body gradient, **below the 4.5:1 normal-text standard.** Not fixed in this story. Meaning is never carried by color alone — the four-state verdict is always worded by the pill (§4.1) and inline findings carry labels.

---

## 9. Component inventory (reconciled against `src/components/`, Story 18.1)

**Deleted since the original checklist:** `HatchCounter` and `WordmarkMascot` (both removed in PR #34). **New since:** `HatchMethodology`, `Masthead`, `Shell`.

- Top nav (Support Born Yesterday · Report an issue) — `Masthead.tsx`
- Wordmark (SVG, accessible `<h1>`) + mascot layer (state-driven) — `Wordmark.tsx` + `Mascot.tsx`, composed in `Shell.tsx` (the old combined `WordmarkMascot` is deleted)
- Hero input (real `<label>`, not placeholder-only) + witty instructions — `HeroSearch.tsx`
- Hatch counter — **no standalone component**; the counter line now lives inside `HatchMethodology.tsx` (the `HatchCounter` component was deleted)
- Methodology card — `MethodologyCard.tsx`, surfaced via the `HatchMethodology` disclosure (§2), not as an always-open card
- Report tab nav (My Report Results · Recent Searches · Search Again) — `ReportTabs.tsx`
- Report card: worded indicator pill (4 states) `SkepticismPill.tsx` (+ `report-state.ts`) + body highlight styles + footer actions `ReportActions.tsx` (Search again · Copy · Download — a rich-text object; image/PDF forms can evolve later) + Request-a-correction link
- Recent-search list item (anonymized) — `RecentSearches.tsx`
- `<AdSlot>` (placeholder in dev, script in prod) — `AdSlot.tsx` (+ `AdScriptStub.tsx`)
- Footer / disclaimer — rendered in the layout shell (`Shell.tsx`) / route pages
- Non-result UI states: limit-reached + error (via `Mascot` states + the status screen in `src/app/r/[domain]/page.tsx`). The richer **searches-remaining indicator** is still deferred (§11).

---

## 10. Changeset to fold back into PRODUCT.md (historical)

> This changeset has been **folded in** — PRODUCT.md is now **v1.3**. Kept for provenance; it describes an earlier sync, not outstanding work.

1. **Voice section:** add the "playful chrome, rigorous substance" principle.
2. **Methodology section:** remove all "our own AI" language; ensure MVP methodology is framed as deterministic + sourced; scope the AI-error disclaimer to the future AI Pivot Timeline feature only.
3. **Corrections section:** document the two-channel split (site bugs vs. content corrections).
4. **Branding:** support link is "Support Born Yesterday."
5. **Skepticism Indicator section:** its visual expression is the mascot flag-state; cross-reference this document.

---

## 11. MVP scope / phasing reminders

- Mascot: static placeholder now (**one shared inline-SVG across all eight states** as shipped — per-state art still outstanding, see §4.1); Rive animations post-MVP.
- Ads: architecture (`<AdSlot>`, reserved dimensions, config gating) now; ad scripts served later.
- 3 searches/day limit: enforce mechanism (app/DB-backed) now; richer visual treatment of the limit later.
- Skepticism Indicator: the **model** is decided in **Story 18** (rule-based — `docs/decisions/story-18-indicator-model.md`) and **thresholds** in **Story 19**; this document fixes only the *visual expression* and state contract.
