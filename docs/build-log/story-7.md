# Build log — Story 7 — Hydrogen Epic (7 of 7): Report view

> Renamed from `1.2.7.md` (legacy `<phase>.<sprint>.<story>` scheme) to the continuous
> `story-<n>.md` convention; content below is the original Story 7 self-report, unchanged.

- PR: #15   - Branch: feature/report-view   - Status: opened (CI green)   - Date (UTC): 2026-06-26

## Files changed
- src/app/r/[domain]/page.tsx — (new) dynamic report route; mock report, single `<h1>`, three panels, correction link, disclaimer
- src/components/report-state.ts — (new) shared types + state→label/token/mascot map + plain-text renderer
- src/components/SkepticismPill.tsx — (new, server) worded status pill + mascot
- src/components/ReportTabs.tsx — (new, client) accessible Overview/Signals/Sources tabs
- src/components/ReportActions.tsx — (new, client) Search again / Copy (functional) / Download (inert stub)
- docs/build-log/README.md — (new) build-log convention/template

## Acceptance criteria
- [x] Route `src/app/r/[domain]/page.tsx`, async param resolved via `const { domain } = await params` — met (page.tsx)
- [x] Clearly-marked MOCK report; default `some-concerns` exercises flagged + positive; comment notes swapping state — met (page.tsx `mockReport`)
- [x] Report title is the page's single `<h1>` (accent-gold + heading font); shell emits no `<h1>` — met (verified served HTML: 1 `<h1>`)
- [x] `SkepticismPill` (server) maps state→label+indicator token, renders LABEL TEXT (not colour-alone) with same-colour border/tint; mascot at matching result state, aria-hidden — met (SkepticismPill.tsx)
- [x] `ReportTabs` (client) — role tablist/tab/tabpanel, aria-selected, aria-controls/labelledby; Left/Right/Up/Down move focus (roving tabindex), Home/End, Enter/Space activate (manual activation) — met (ReportTabs.tsx)
- [x] Overview = pill+mascot, summary, lastChecked, top highlights; Signals = all flagged (flag-negative) + positive (flag-positive), each with source link + a worded "Flagged"/"Positive" cue (not colour-alone); Sources = all cited sources as external links — met (page.tsx)
- [x] `ReportActions` (client): Search again (Link → "/"), Copy (functional clipboard), Download (inert disabled stub w/ TODO + label) — met (ReportActions.tsx)
- [x] "Request a correction" → `mailto:corrections@bornyesterday.tech` w/ subject `Correction request: {domain}` — met (verified encoded href)
- [x] Provisional disclaimer, factual voice, no "AI"/"vibe check" — met (verified: no forbidden terms)
- [x] No ad slots added (shell provides both rails); exactly one `<h1>`; tokens only (Layer 1) — met
- [x] Server Components by default; only ReportTabs + ReportActions are client — met

## Decisions & deviations
- **Links use `--accent-gold`, not `--link-coral`.** link-coral is borderline AA on `--surface-body`; accent-gold passes. Same call as the landing.
- **Download is `disabled` + labelled "Download (soon)"** with a title, so it reads as present-but-not-wired (the prompt allowed disabled-with-label).
- **Tabs use manual activation** (focus moves on arrows; Enter/Space activates) per the prompt's wording, rather than automatic activation.
- **Finding data points are shown in their flag colour AND carry a worded badge** ("FLAGGED"/"POSITIVE"), so meaning is never colour-alone.
- Mascot interim art is identical across result states (expected, per 1.2.5); the pill differentiates.

## Follow-ups / tech debt
- Real report data + signal logic (Sprint 1.1) replaces the mock.
- Download: produce the rich-text/file export (later story).
- Mascot: distinct per-state SVG art incl. the 4th amber flag (SVG-redraw follow-up).
- Confirm final disclaimer wording (currently provisional/on-voice).
- Consider an AA-passing `--link-coral` (or a dedicated link token) so content links can use the brand coral.

## Gates
- install | lint | typecheck | build: pass
