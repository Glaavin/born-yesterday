# Build log — Story 15 — Helium Epic (8 of 9): Wayback & AI-language scan

- PR: #26   - Branch: feature/helium-ai-pivot   - Status: opened (CI green)   - Date (UTC): 2026-06-26

The signature signal: when AI language first appeared on the site vs. how old the domain is (the "AI
pivot"). Two transports — Wayback (web.archive.org, FIXED host, harness) and a LIVE homepage fetch to
`<domain>` (kind:"live-site", the first user-host HTTP fetch). REGEX ONLY — no LLM. Because the live
fetch pulls untrusted HTML, this story first hardened the harness (the two deferred items), then did
the scan work. Report stays on MOCK; no report wiring, no UI.

## Files changed
- src/lib/cached-fetch.ts + .test.ts — (Section A) scheme allowlist + response-size cap (+3 tests; 22 harness tests stay green)
- src/signals/ai-keywords.ts — (Section B) locked §2B list + pure `stripToText` + `matchAiTerms` + `mostSpecific`
- src/signals/wayback.ts — (Section C) `fetchCdx`/`parseCdx`/`fetchSnapshot`/`pickSnapshots`/`snapshotUrl`/`tsToIso`
- src/signals/homepage.ts — (Section D) `fetchHomepage` (kind:"live-site")
- src/signals/ai-pivot.ts — (Section E) `collectAiPivot`
- src/signals/ai-pivot.test.ts — matcher/CDX/collector (13 cases)
- scripts/signal-ai.ts + package.json — `pnpm signal:ai <domain> [--write]`

## Section A — harness hardening (closes BOTH deferred MINORs)
1. **Scheme allowlist:** any URL whose scheme isn't `http:`/`https:` ⇒ `{ ok:false, error:"blocked" }` without fetching — checked on the INITIAL url AND every redirect `Location` (in `follow()`, before the SSRF host-check). Closes `file:`/`gopher:`/`data:` etc. **This closes the last open 9.1-review MINOR.**
2. **Response-size cap:** new `maxBytes` option (default **5 MB**). `readBodyCapped` reads the byte **stream** when present (real fetch) and **cancels the reader on overflow** (closes the connection — no unbounded buffering); stubs without a stream fall back to `text()` + truncate. On overflow the result carries `truncated:true` (added only when true, so existing exact-equality assertions are unaffected). Applies to all HTTP calls; matters most for live-site.
- **Behavior-preserving on http/https:** all 22 harness tests stay green; restrictive only on non-http schemes + over-cap bodies.

## Section B — AI keyword matcher (§2B, exact)
- `AI_TERMS` reproduces the LOCKED list EXACTLY (29 terms); **bare `agent`/`agents` are excluded** (only `AI agent`/`AI agents`/`autonomous agent`/`agentic`).
- Each term compiles to `(?<![a-z0-9])<literal>(?![a-z0-9])` — word/phrase bounded, so `AI` matches `ai`/`a.i.` but not `rain`/`email`, and phrases match as phrases. **ReDoS-safe** (literals between zero-width assertions; no quantifiers over untrusted text). `stripToText` drops script/style, strips tags, collapses whitespace, lowercases. Pure; never throws.

## Section C/D — Wayback + live homepage
- **Wayback** rides the harness (`web.archive.org`, third-party). CDX query is daily-collapsed (`collapse=timestamp:8`, `filter=statuscode:200`) so the response stays well under the cap; `parseCdx` returns count + first/last ts + sorted snapshots. `pickSnapshots` takes ≤8 representative captures (first, last, evenly spaced); each is fetched with the `id_` raw modifier, `stripToText` + `matchAiTerms`, and we record the EARLIEST sampled snapshot that matches — citing `{ date, matchedTerm, snapshotUrl }`. Wayback gets the §6 8s budget (it's slow, like crt.sh).
- **Live homepage** (`homepage.ts`) is `kind:"live-site"`, so the SSRF host-check, robots.txt respect, the new scheme allowlist, and the size cap all apply. A blocked/robots-disallowed/errored fetch ⇒ current status null ("not checked"); Wayback signals still stand.

## Section E — collector
`collectAiPivot` emits sourced signals: `wayback_snapshot_count`, `wayback_first`, `wayback_last` (→ the CDX query URL), `ai_language_first_seen` (→ the matching SNAPSHOT URL, note = matched term), `ai_language_current` ("Mentions AI"/"Does not mention AI"/null, → the live homepage URL, note = matched term or "not checked"). `ok = Wayback reachable OR live reachable`; non-throwing; partial OK. **The headline "AI Language Age vs Domain Age" pivot is a CROSS-SIGNAL derivation (needs Story 10's registration date) — that's STORY 16's job; this collector only produces the AI-language dates + status.**

## Tests (126 total; +13; fixtures + injected fetcher, NO network/DB)
- Section A: non-http initial scheme → blocked (no fetch); redirect to `file:` → blocked (per-hop); over-cap body → truncated. Existing 22 harness tests green.
- matcher: every locked term matches; **bare agent/agents do NOT**; AI/A.I. word-bounded (not "rain"/"ukraine"); phrases; `stripToText` drops script/style.
- `parseCdx` full/empty/header-only/malformed; **earliest-sampled-AI selection** (2018 "machine learning" chosen over a later 2023 capture).
- collector: full result with cited earliest date + current status; partial (Wayback ok + live blocked → "not checked", ok:true); everything unreachable → ok:false, no throw.

## Part B (owner-gated; real collector, secret-free)
`pnpm signal:ai stripe.com`:
- **Live homepage scan succeeded** ⇒ `ai_language_current = "Mentions AI"`, note `matched "AI-powered"`, sourced to `https://stripe.com/` — proving the `kind:"live-site"` path end-to-end (SSRF + robots + scheme allowlist + size cap).
- **web.archive.org was unreachable from the dev environment** (HTTP 000 / 20s timeout — same as crt.sh), so the Wayback signals degraded to null and `ai_language_first_seen` null — `ok:true` because the live scan was reachable. Exactly the designed partial/non-throwing behavior; `parseCdx` + earliest-AI selection are fixture-covered. (The unit tests also cover the inverse partial: Wayback ok + live robots-disallowed → current "not checked", Wayback signals stand.)

## Decisions & deviations
- REGEX ONLY — no LLM anywhere.
- CDX is daily-collapsed; `wayback_snapshot_count` is the count of returned (statuscode-200, daily-deduped) captures, not every raw capture — keeps the response bounded and the timeline clean.
- Wayback per-call timeout = 8s (the §6 total budget); the report-level 8s deadline will cap it in Story 16.
- Size cap returns a CAPPED body (with `truncated:true`) rather than an error — simpler for callers and still bounds memory.

## Gates
- install | lint | typecheck | test (126 passed; +13) | build (no DB present → exit 0): **pass**
- No network/DB in CI (pure matcher/parsers + injected fetcher). No report wiring, no UI.
