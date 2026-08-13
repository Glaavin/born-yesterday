# Ops tasks — tracked follow-ups

**Document:** `docs/ops-tasks.md`
**Purpose:** durable home for known gaps, deferred work, and pre-launch chores that are
tracked but not part of the current story. Created in Story 18.1; several entries were
surfaced by the reconciliation pass and by `docs/decisions/story-18-indicator-model.md`.

Status legend: **OPEN** · **BLOCKED** · **PENDING DECISION** · **DONE**

---

## Product / design gaps

### Mascot does not indicate — per-state art outstanding
**Status:** OPEN · **Surfaced:** Story 18.1 (design-system §4.1/§4.2)
The mascot **is** the Skepticism Indicator (design-system §4), but the state contract is wired
to **one shared inline-SVG asset across all eight states** (`src/components/Mascot.tsx`) — the
`state` prop switches, the pixels do not. There is no `BY_egg.png`, and the fourth **amber**
flag the four-state contract needs does not exist. Meaning is not lost (the `SkepticismPill`
carries the verdict in words), but the indicator's *visual* channel is inert. Needs distinct
per-state art (and the amber flag), then Rive later. **Product gap, not just a doc fix.**

### Design-token names → role-based (no color words)  — **DONE** (Story 18.1 Stage 6)
**Status:** DONE · **Closed:** Story 18.1
The palette will change several more times during skin exploration, so token names were
renamed to describe **role, never color** — names now survive any reskin. Names only; every
value byte-identical; `report-state.ts` verdict→token mapping preserved. Mapping:
`accent-gold→accent-primary` · `link-coral→link-default` · `label-teal→label-accent` ·
`wordmark-cream→wordmark-born` · `wordmark-cyan→wordmark-yesterday` (+ stops/gradient) ·
`wordmark-blue→wordmark-tech` · `navy-deep→surface-header-deep` ·
`indicator-green→indicator-checks-out` · `indicator-amber→indicator-concerns` ·
`indicator-red→indicator-red-flags` · `indicator-blue→indicator-too-new`. The convention is
recorded in `design-system.md` §8.2. Historical build-logs keep the old names (point-in-time
records). *(Possible follow-up, owner to scope: extend the ESLint token guardrail to reject
`@theme` names containing a color word — see the Story 18.1 final report.)*

### WCAG AA re-verify parked pending palette lock
**Status:** OPEN (parked by owner) · **Surfaced:** Story 18.1 (design-system §8.2)
The AA ratios in §8.2 were measured against the old navy body and no longer apply. Known
sub-AA spot: the **pink accent as small text** (hatch-counter number, "View Our Report
Methodology" link) measures ~**3.4–4.2:1** on the teal body gradient, below the 4.5:1
normal-text standard. Re-verify the full palette once the style is locked.

---

## Code vs. decision gaps

### Trustpilot demotion to link-out (L-14) not yet in code
**Status:** OPEN · **Surfaced:** Story 18.1 (mvp-spec §2C)
Decision L-14 (owner-held legal register, not in repo) demotes Trustpilot from a scrape to a
link-out on ToS grounds. `mvp-spec.md` §2C now documents it as a link-out, but
`src/signals/reputation.ts` **still scrapes** Trustpilot best-effort. A small code story should
make Trustpilot a link-out like BBB. (The sibling L-10 neutral-search-terms fix already shipped
in `src/signals/reputation-links.ts`.)

---

## Indicator calibration inputs (for Story 19)

Referenced by `docs/decisions/story-18-indicator-model.md` (§5, §8) as tracked here.

### `PIVOT_RECENT_DAYS` — define "very recently"
**Status:** OPEN · The pivot-window threshold. Decide research-vs-placeholder during Story 19
calibration.

### Test-domain gap — a reliable Blue needs a domain we control
**Status:** OPEN · Exercising the Blue ("too new to tell") path reliably requires a domain whose
thin footprint we control. Needed for Story 19 calibration.

### Threat-feed API keys
**Status:** BLOCKED (owner action) · Set `URLHAUS_AUTH_KEY`, `PHISHTANK_APP_KEY`, and
`SERVER_SALT` in the Vercel environment. Until then threat checks read "not checked" (disclosed
in the report summary). Gates any Green tightening that depends on a performed threat check;
blocks **Story 20b**.

---

## Launch pre-flight

### Re-privatize the repo before launch (issue #5)
**Status:** OPEN · The repo is currently **public** to support the agent-driven workflow.
Re-privatization before launch is tracked as issue #5. (PRODUCT.md §14.)

### Set production secrets before launch
**Status:** OPEN · Threat-feed keys (above) plus `SERVER_SALT` must be set in Vercel before
launch, or threat signals and quota hashing degrade.
