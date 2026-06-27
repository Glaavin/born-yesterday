# Build log — Story 16 — Helium Epic (9 of 10): Report assembly engine & draft indicator

- PR: #28   - Branch: feature/helium-assembly-engine   - Status: opened (CI green)   - Date (UTC): 2026-06-26

The ENGINE that turns the six collectors' signals into a complete Trust Report + the draft four-state
indicator — PURE and testable, collectors INJECTED, no network/DB in tests. NO route wiring, NO
caching, NO persistence (that's Story 17, which also retires the mock). Folds reputation decision A.

## Files changed
- src/signals/bbb.ts + reputation.ts + reputation.test.ts — (A) BBB demoted to a link-out
- src/report/signals.ts — `signalsByKey` (flatten collector signals)
- src/report/collect-all.ts — (B) orchestrator: parallel, one 8s deadline, partial-OK
- src/report/derive.ts — (C) the AI-pivot cross-signal derivation (+ `humanAge`)
- src/report/indicator.ts — (D) the locked rubric + named DRAFT thresholds
- src/report/assemble.ts — (E) assembly to the exact `Report` shape + state⇄key mapping
- src/report/{indicator,assemble,collect-all}.test.ts — 11 cases (injected stubs, no network/DB)
- scripts/signal-report.ts + package.json — (F) `pnpm signal:report <domain>`

## Section A — Reputation decision A
BBB is now a **link-out only** (`bbb.ts` exports just `bbbSearchUrl`; the scraped grade/profile is gone — removes the misattribution risk and the JS-render fragility). `reputation.ts` emits a `bbb` signal like the other link-outs ("Check BBB for this domain" → the BBB search URL). Trustpilot's domain-keyed JSON-LD scrape is unchanged. Tests updated.

## Section B — Orchestrator (collect-all.ts)
`runAllCollectors` runs all six collectors in PARALLEL under ONE shared deadline (`AbortSignal.timeout(8000)`, merged with any outer signal via `AbortSignal.any`). **The Story 9 seam:** rather than touch each collector, the orchestrator wraps the fetcher (`withDeadline`) so every HARNESS call carries the deadline — the harness already aborts on `opts.signal`, so the 8s budget becomes real for all HTTP calls. (The WHOIS port-43 and TLS 443 socket sidecars keep their own shorter per-call timeouts.) **Partial-OK:** a thrown/rejected collector becomes a synthetic `ok:false` result and never kills the batch.

## Section C — AI-pivot derivation (derive.ts)
When a registration date AND an `ai_language_first_seen` date both exist, derive the pivot: "Domain registered ~N ago; AI language first appeared in sampled archive captures ~M ago" — **labelled APPROXIMATE** (earliest *sampled* snapshot, not provably first). Sourced to both underlying signals; carries `domainAgeDays`/`aiOnsetAgoDays` so the indicator can decide if it qualifies as one concern point.

## Section D — Draft indicator (indicator.ts), evaluated IN ORDER
1. **On a threat list** (PhishTank OR URLhaus listed) → **RED** (one authoritative sourced signal; overrides Blue).
2. Else **footprint THIN** (young AND few/no snapshots AND no reputation, not listed) → **BLUE**.
3. Else **≥ 2 sourced concern points** → **RED** (reasons enumerate each with its source). Concern points: the qualifying pivot (established + recent AI onset); missing SPF AND DMARC.
4. Else **ESTABLISHED and CLEAN** → **GREEN** (positive evidence: old domain / long archive / long-lived first cert) AND (SPF+DMARC, no concerns). Absence of flags alone is NOT green.
5. Else → **AMBER** (generous default).
- **`reasons[]` is always populated** (publishable rubric) — incl. why Green (the establishing evidence) and why Blue (what's missing). A clean threat check reads "Not listed (this host)" and **never** makes Green by itself.
- **Named DRAFT thresholds (one place):** `YOUNG_DOMAIN_DAYS = 180`, `ESTABLISHED_DOMAIN_DAYS = 1095` (~3y), `THIN_SNAPSHOT_COUNT = 5`, `ESTABLISHED_SNAPSHOT_COUNT = 50`, `PIVOT_RECENT_DAYS = 365` — each commented as a placeholder for the later weights Epic. A loose `PIVOT_RECENT_DAYS` can't force a false Red (the pivot is only one of ≥2 points).

## Section E — Assembly (assemble.ts)
`assembleReport` returns the **exact `Report` shape** from `report-state.ts`. **State mapping (deferred from Story 8): green→checks-out, amber→some-concerns, red→red-flags, blue→too-new** (and `KEY_TO_STATE` for storage). `flagged[]` = the indicator's concern reasons (sourced; empty for Green); `positive[]` = reassuring sourced facts (established age, SPF/DMARC present, Trustpilot, archive history, first-cert age, clean threat checks) with the establishing reasons leading for Green; `sources[]` = deduped union of every signal source + the pivot's. `summary` is FACTUAL (counts only: "Surfaces N public signals for <domain>; M worth a closer look") — no judgment language. `lastChecked` = `YYYY-MM-DD`. Every finding carries a source (the `Finding.source` type requires it).

## Tests (140 total; +11; injected stubs, NO network/DB)
- indicator: each branch — threat→red (sourced); thin→blue; pivot + missing-email-auth → red (2 enumerated, sourced); one point → amber; established+clean → green; **a clean threat check does NOT force green**.
- derive: approximate pivot present (labelled) / absent.
- assembly: exact Report keys; state⇄ReportStateKey mapping; flagged/positive mapping; **source dedup**; factual summary (no editorial words); `lastChecked` format.
- orchestrator: parallel, **partial-OK** (one collector throws → batch still assembles), order preserved, deadline signal threaded in.
- reputation A: BBB is a link-out (no scraped grade); Trustpilot unchanged.

## Part B (owner-gated; real end-to-end, secret-free)
`pnpm signal:report stripe.com` → indicator **green** / state **checks-out**:
- reasons: "Established domain — registered ~31 years ago" (RDAP) + "Email authentication configured (SPF and DMARC present)" (DNS).
- report: 14 public signals surfaced, **none flagged**; positives sourced (registration, SPF, DMARC, …); `sources[]` deduped; `summary` factual; `lastChecked` 2026-06-26. (crt.sh/Wayback unreachable from dev degraded gracefully — partial-OK; the engine still produced a complete, sourced report.)

## Decisions & deviations
- The Story 9 deadline seam is implemented by wrapping the fetcher (minimal, touches no collector); socket sidecars keep their own timeouts.
- Pivot is one concern point only; it never single-handedly causes Red.
- No LLM; no editorializing in findings/summary.

## VERIFY
- install | lint | typecheck | test (140 passed; +11) | build (no DB present → exit 0): **pass**
- No network/DB in CI (collectors injected). Secret sweep: no DB connection strings / credentials in tracked code or config (`.env.local` untracked; the only pattern hit is benign build-log prose in story-15.1, not a secret).

## Dashboard
Per the PM-sync-first post-merge rhythm, `data.js` (Story 16 done; upNext → Story 17 serve path + retire mock) is updated AFTER merge.
