# Born Yesterday — Sprint 1.2 Story Plan

**Sprint:** 1.2 — Owner-led branded visual design system
**Source of truth:** `docs/design-system.md`
**Feeds:** one story at a time into Claude Code; Mike returns structured reports per story.

---

## Cross-cutting conventions (apply to every story)

- **Stack:** Astro + TypeScript; **vanilla HTML/CSS (no Tailwind)**; Cloudflare Pages/Workers/D1.
- **Styling:** consume design tokens as CSS custom properties; component styles scoped.
- **Source of truth:** all visual/copy details come from `docs/design-system.md` (section refs noted per story). If a detail is missing, stop and ask — do not invent.
- **Branching:** gitflow-lite — one `feature/*` branch per story → PR → `main`; respect branch protection.
- **Accessibility baseline:** WCAG AA; accessible `<h1>`; real `<label>`s; an indicator's meaning is never carried by color alone.
- **Responsive:** desktop matches the mockups; ad rails collapse to a single content column below the mobile breakpoint.
- **MVP phasing:** static mascot placeholders (no Rive yet); ad *architecture* only (no live ad scripts); no real search/data wiring — counter, report content, and recent searches use mock/prop data to be wired in a later data sprint.

---

## Story 1 — Land the foundational specs

**Goal:** Get the source-of-truth docs into the repo so all subsequent stories reference them in-repo.
**Depends on:** none.
**Branch:** `feature/docs-foundation`

**Scope**
- Add `docs/PRODUCT.md` (v1.1) with the §10 changeset from `design-system.md` applied (voice principle, deterministic methodology, corrections split, support-link rename, Skepticism-Indicator cross-reference).
- Add `docs/mvp-spec.md` (existing draft).
- Add `docs/design-system.md` (this sprint's spec).

**Acceptance criteria**
- All three docs present under `docs/`, internally consistent (no lingering "our own AI" / "vibe check" language in PRODUCT.md).
- PR merged to `main`.

**Out of scope:** any code or styling.

---

## Story 2 — Design tokens & fonts

**Goal:** A single token layer the whole system draws from.
**Depends on:** Story 1.
**Branch:** `feature/design-tokens`
**Spec refs:** §8.1, §8.2.

**Scope**
- Global stylesheet defining CSS custom properties for all color tokens (§8.2) and a type scale.
- Self-host fonts via Fontsource (Fraunces for headings, Inter for body) — no third-party font CDN at runtime, for performance and privacy.
- Sample exact color values from source design files to replace the approximate hex in §8.2; record the final values back into `design-system.md`.

**Acceptance criteria**
- Tokens resolve and are usable from any component.
- Fonts load self-hosted; no external font requests at runtime.
- WCAG AA contrast verified for `--flag-negative` and `--flag-positive` on `--surface-body`; any failing token adjusted and the change noted in the spec.

**Out of scope:** any page or component markup.

---

## Story 3 — Layout shell

**Goal:** The page frame every screen sits inside.
**Depends on:** Story 2.
**Branch:** `feature/layout-shell`
**Spec refs:** §7.

**Scope**
- Astro layout: header band (nav), three-column grid (ad rail / max-width content / ad rail), footer.
- Nav: "Support Born Yesterday" + "Report an issue."
- Responsive breakpoint where rails drop and content goes single-column.

**Acceptance criteria**
- Grid renders per mockup proportions on desktop; collapses cleanly to one column on mobile.
- Header/footer use tokens; no hard-coded colors.

**Out of scope:** wordmark, mascot, ads, page content (placeholders fine for rail regions).

---

## Story 4 — `<AdSlot>` component

**Goal:** Ad architecture in place, nothing served.
**Depends on:** Story 3.
**Branch:** `feature/ad-slot`
**Spec refs:** §5.

**Scope**
- `<AdSlot size id />` Astro component, IAB 160×600, **fixed reserved dimensions** (no layout shift).
- Renders a labeled "Advertisement" placeholder in dev; prod path is a config/env-gated injection stub (no real network).
- `loading="lazy"` semantics where applicable.

**Acceptance criteria**
- Two slots can be placed (one per rail) with zero CLS.
- Dev shows placeholder; prod stub is gated and inert.
- Honors the §5 "never list" by construction (no overlay/sticky/interstitial/native pathways exist).

**Out of scope:** any real ad network integration; mobile in-content unit.

---

## Story 5 — Wordmark + mascot layer

**Goal:** The centerpiece, with the mascot on its own higher layer.
**Depends on:** Story 2 (tokens).
**Branch:** `feature/wordmark-mascot`
**Spec refs:** §4.

**Scope**
- SVG wordmark "BornYesterday.tech" with the multicolor treatment (§8.2), wrapped so an accessible `<h1>` exposes the text to screen readers/SEO.
- Mascot container on a **separate, higher z-index layer** within a shared positioned container, egg seated in the ".".
- Mascot accepts a `state` prop covering the full §4.1 contract (`idle · hatching · result-green · result-red · result-blue · limit-reached · error`); render a static placeholder per state (use `BY_egg.png` interim; note SVG redraw as follow-up).

**Acceptance criteria**
- Wordmark crisp at all sizes; `<h1>` text present and accessible.
- Mascot overlaps the wordmark correctly; switching `state` swaps the placeholder with no layout change.
- Rive integration explicitly stubbed/deferred — no animation runtime added yet.

**Out of scope:** Rive files/animation; SVG redraw of the mascot.

---

## Story 6 — Landing page

**Goal:** Assemble the landing experience.
**Depends on:** Stories 3, 4, 5.
**Branch:** `feature/landing-page`
**Spec refs:** §2, §4 (`idle`), §5.

**Scope**
- Wordmark + mascot (`idle` state).
- Hero input with a real `<label>` + witty instructions (§2 microcopy); functional form element only.
- Hatch counter (§2 copy) reading from a prop/mock value.
- Methodology card (§2 deterministic copy + bullets).
- Two `<AdSlot>`s, one per rail.

**Acceptance criteria**
- Page matches mockup 1 with the corrected copy (no "vibe check," no AI claims).
- Input is labeled and keyboard-accessible.
- Counter value comes from a prop, clearly marked for later data wiring.

**Out of scope:** search submission/results logic; live counter data.

---

## Story 7 — Report view

**Goal:** Assemble the report results experience.
**Depends on:** Stories 3, 4, 5.
**Branch:** `feature/report-view`
**Spec refs:** §2 (disclaimer), §3, §4 (result states), §6.

**Scope**
- Tab nav: "My Report Results · Recent Searches · Search Again."
- Report card: title + **worded indicator pill** reflecting the result state ("Checks out" / "Red flags found" / "Too new to tell"); body with defined highlight styles for flagged (`--flag-negative`) and positive (`--flag-positive`) findings; footer actions (Search again · Copy to clipboard · Share); **"Request a correction"** link → corrections@ (§3).
- "{n} data sources found in {t}s" caption (mock values).
- Disclaimer reframed per §2.
- Mascot in the matching result state.
- Recent Searches tab: stubbed anonymized list (§6) with mock entries.
- Two `<AdSlot>`s, one per rail.

**Acceptance criteria**
- Page matches mockup 2 with corrected copy; indicator meaning is conveyed by the worded pill, not color alone.
- Highlight styles legible and AA-compliant.
- Correction link present and routed; all dynamic values clearly mock/prop, marked for later wiring.

**Out of scope:** real report generation, real recent-searches data, share/copy backend, 3/day limit enforcement.

---

## Notes for sequencing

- Stories 2→7 must follow Story 1 (docs in repo).
- Stories 6 and 7 both depend on 3, 4, 5 and can be done in either order.
- Each story is a clean PR; keep them small enough to review in one pass.
