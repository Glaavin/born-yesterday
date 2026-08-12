# Build log — Story 18.1: Documentation reconciliation

- PR: #38   - Branch: docs/story-18-1-reconciliation   - Base: develop   - Status: opened (CI green)   - Date (UTC): 2026-08-12

Lithium Epic (1 of 3). Docs-only through Stage 5; Stage 6 (token rename) is code, approved by the owner. Anchors off Story 18; does not advance the story counter.

## Files changed
- `docs/decisions/story-18-indicator-model.md` — (new) the Story 18 decision, written **verbatim** (byte-identical to the owner's source: 250 lines, 19,218 chars).
- `docs/mvp-spec.md` — (edited) §2E → rule-based Story 18 model (point-based draft retired, linked to the decision doc); §2C reputation → link-outs + neutral search terms (L-10/L-14, owner-held); §2D tech-stack fingerprint → reassigned to the Profile Section (hand-rolled, no Wappalyzer); analytics not-implemented; §9 four-state; §10 SLA placeholder; B2B dropped; sprint→epic.
- `docs/PRODUCT.md` — (edited) → **v1.3** + changelog. B2B API dropped (§5–§7); revenue ad-or-tip, open, leaning tip; §4 AI-pivot corrected to shipped/deterministic (no LLM); §8 Risk 4 rewritten; §10 roadmap → epic convention; §12 SLA placeholder; §14 repo public + re-privatization (issue #5); §3/§16 → Story 18/19.
- `docs/design-system.md` — (edited) §8.2 palette replaced with shipped `globals.css` values + **role-based naming convention**; §2 methodology-disclosure; §4.1/§4.2 mascot gap (one shared asset across 8 states); §5 ad-slot restyle; §9 component inventory reconciled; header/§10/§11 epic + v1.3.
- `docs/ops-tasks.md` — (new) tracked follow-ups (mascot per-state art, token rename [done], parked WCAG AA, Trustpilot L-14 code demotion, Story 19 calibration inputs, launch pre-flight).
- `src/app/globals.css`, `src/components/*`, `src/app/**` — (edited) **token rename** to role-based names (Stage 6). Names only; every value byte-identical.

## Acceptance criteria
- [x] Stage 1 drift inventory produced and approved before any edit.
- [x] Stage 2 decision doc written verbatim (evidence: `diff` empty vs source).
- [x] Stage 3 mvp-spec reconciled; §2E is the rule-based model, no thresholds/weights invented.
- [x] Stage 4 PRODUCT → v1.3; B2B dropped; AI-pivot corrected; Risk 4 rewritten.
- [x] Stage 5 design-system reconciled to shipped palette + component tree; mascot gap recorded.
- [x] Stage 6 token rename (owner-approved, extended to role-based across the whole layer). Values byte-identical; `report-state.ts` verdict→token mapping preserved; live render verified identical (pill = expected color).
- [x] Legal citations marked owner-held; no legal docs added to the repo.
- [x] SLA left as a marked-pending placeholder — not invented.

## Decisions & deviations
- **Prompt vs. current-develop drift:** three of the prompt's known starting points were already correct on develop (PRODUCT §10 Astro/Cloudflare; mvp-spec §4/§11 analytics "contradiction"; §2B keyword list) — reported as reality, not "corrected." Owner confirmed.
- **`navy-deep → surface-header-deep`:** renamed beyond the owner's explicit mapping — it is the same color-word trap. Flagged for veto.
- **`indicator-red-flags`:** kept the word "red" deliberately (warning-sign idiom from the locked "Red flags found" label, not a color claim).
- **Historical build-logs excluded from the rename:** `docs/build-log/story-7.md` keeps the old token names — a point-in-time record; renaming it would falsify history.
- **Trustpilot L-14:** documented as a link-out (the decision), but the code still scrapes — flagged as a code follow-up, not fixed here (out of scope).

## Follow-ups / tech debt
See `docs/ops-tasks.md`: mascot per-state art (the mascot does not visually indicate), Trustpilot L-14 code demotion, Story 19 calibration inputs (PIVOT_RECENT_DAYS, test-domain gap, threat-feed keys), launch pre-flight (re-privatize #5, prod secrets). Optional: extend the ESLint token guardrail to reject color-word `@theme` names (owner to scope).

## Gates
- lint (+ token guardrail) | typecheck | test (161) | build: **pass**
- Token rename verified: hex-value multiset unchanged; live render identical.
