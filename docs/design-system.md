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

> **Status (Story 2):** Tokens are implemented in `src/app/globals.css` via Tailwind v4 `@theme static` (each available as a `--color-*` / `--font-*` / `--text-*` utility **and** CSS variable). Values below are now **sampled from the mockups** in `docs/mockups/` (kept local-only / gitignored). Gradients are vertical (top→bottom) to match the mockups. `--flag-negative` is AA-adjusted (see Accessibility note).

| Token | Approx. | Use |
|---|---|---|
| `--surface-header` | navy gradient `#10153f → #111850` | top nav band |
| `--surface-body` | dark teal gradient `#111b24 → #1a3942` | page background |
| `--wordmark-cream` | `#f9db9d` | "BORN" |
| `--wordmark-cyan` | cyan gradient `#7fdce3 → #99f1f7` | "YESTERDAY" |
| `--wordmark-blue` | `#5c7ddf` | ".TECH" |
| `--accent-gold` | `#f8d181` | counter number, report title, card border |
| `--link-coral` | `#c65644` | nav links |
| `--label-teal` | `#87d3d8` | true labels & section accents (plain body copy uses `--ink`) |
| `--flag-negative` | `#e77da3` *(adjusted from sampled `#e46a95` for AA)* | flagged data, red-flag pill |
| `--flag-positive` | `#63b0bb` | positive findings |
| `--input-surface` | `#eaffff` | input field |
| `--ink` | `#e9f1f2` | primary body copy |
| `--ink-muted` | `#a7bcc0` | secondary copy / captions |
| `--indicator-green` | `#6fbf8e` | report pill — "Checks out" |
| `--indicator-amber` | `#f0b347` *(deepened vs accent-gold)* | report pill — "Some concerns" |
| `--indicator-red` | `#e8827a` *(lightened from `#e0584e` for AA)* | report pill — "Red flags found" |
| `--indicator-blue` | `#829ce7` *(lightened from wordmark-blue for AA)* | report pill — "Too new to tell" |

> **Accessibility (verified, Story 2):** Contrast measured against the sampled `--surface-body`, worst-case (lighter) stop `#1a3942`.
> - `--flag-positive` `#63b0bb` — **4.95:1**, passes WCAG AA. No change.
> - `--flag-negative` sampled `#e46a95` — **3.98:1**, *failed* AA for normal text. Lightened (same hue) to **`#e77da3` → 4.60:1**, which clears AA.
>
> Never carry flagged-vs-positive by color alone (the worded pill + the report's inline labels satisfy this).

> **Body-text tokens (added in the text-tokens follow-up):** `--ink` `#e9f1f2` (primary copy) and `--ink-muted` `#a7bcc0` (secondary / captions) are the neutral body-copy colors — replacing the earlier `--label-teal` stand-in, which is now reserved for true labels and section accents. On `--surface-body` (worst-case stop `#1a3942`): `--ink` = **10.73:1**, `--ink-muted` = **6.21:1** — both pass WCAG AA.

> **Indicator tokens (Skepticism Indicator pill):** dedicated signal colors, decoupled from accent/wordmark usage even where similar. The pill is worded text + a border/tint in the state colour, so each is verified as **text** on `--surface-body` (worst-case stop `#1a3942`):
> - `--indicator-green` `#6fbf8e` — **5.57:1** ✅ (new hue)
> - `--indicator-amber` `#f0b347` — **6.58:1** ✅ (deepened from `--accent-gold` `#f8d181` so the pill reads distinct from the gold report title)
> - `--indicator-red` `#e8827a` — **4.63:1** ✅ (lightened from `#e0584e`, which was 3.32:1)
> - `--indicator-blue` `#829ce7` — **4.60:1** ✅ (lightened from `--wordmark-blue` `#5c7ddf`, which is 3.19:1 as normal text)
>
> Color is never the sole signal — the four-state verdict is always carried in words by the pill (§4.1).

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
- 3 searches/day limit: enforce mechanism (app/DB-backed) now; richer visual treatment of the limit later.
- Skepticism Indicator *weights* finalized in Sprint 1.7 — this document fixes only the *visual expression* and state contract.
