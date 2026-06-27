# Build log — Story 17 — Helium Epic (10 of 10): The serve path & retiring the mock

- PR: #30   - Branch: feature/helium-serve-path   - Status: opened (CI green)   - Date (UTC): 2026-06-26

The finale. Story 16's engine is wired into the §6 request flow so `/r/<domain>` serves REAL reports —
caching/freshness (§3), the 3/day quota (§7a), persistence + signal_history (§3 moat), the
recent-searches feed (§7b) — and the mock is RETIRED. Pure serve-decision logic is separated from the
thin route/DB wiring. **HELIUM IS COMPLETE.**

## Files changed
- src/serve/freshness.ts — (A) `REPORT_TTL_SECONDS` (7d) + pure `isFresh`
- src/serve/decide.ts — (B) pure `decideServe` (the five-branch core)
- src/serve/quota.ts — (C) `sessionKey` (sha256(ip+salt)), `utcDay`, `SEARCH_LIMIT_PER_DAY`
- src/serve/serve.ts — (D) `serveReport` (injected deps; orchestration)
- src/serve/runtime.ts — (D/E) real deps: `realCollect` (Story 16 engine), `realPersist`, `buildServeDeps`
- src/serve/recent.ts — (F) `recentReports` (anonymized)
- src/db/queries.ts — `getRecentReports`, `countReports`, `countSignalHistory`
- src/app/r/[domain]/page.tsx — (G) serves the real Report; error + limit-reached screens; **mock deleted**
- src/app/search/route.ts + components/HeroSearch.tsx — search form → normalize → redirect to /r/<domain>
- src/app/page.tsx — landing reads the REAL hatch count + recent feed (force-dynamic)
- src/components/RecentSearches.tsx — the §7b feed UI
- src/serve/serve.test.ts — 13 cases (injected stubs, no DB/network)
- scripts/serve-report.ts + package.json — `pnpm serve:report <domain> [--force]`
- .env.example — `SERVER_SALT` placeholder

## Section B — decideServe (five branches) + the quota decision
| existing | fresh | quota | action | consumesQuota |
|---|---|---|---|---|
| ✓ | ✓ | – | `serve-fresh` | false |
| ✓ | ✗ | ✓ | `serve-stale-refresh` | true |
| ✓ | ✗ | ✗ | `serve-stale` | false |
| ✗ | – | ✓ | `collect` | true |
| ✗ | – | ✗ | `limit-reached` | false |

**Quota gates COLLECTION, not cached views** — a deliberate divergence from §6's literal "increment on every request." **Why:** the quota exists to protect the expensive generate op and to enforce §7a, not to ration *viewing*. Cached/shared reports stay freely viewable (§11 keeps reports shareable); only generating a new/refresh report consumes 1. Documented here as the design call.

## Section C — quota & session identity (§7a, §10, NO PII)
`sessionKey = sha256(clientIp + SERVER_SALT)` — we store/look up **only the hash**; the raw IP is never persisted. IP comes from `x-forwarded-for` (Vercel). `SERVER_SALT` from env (optional; documented fallback constant). Quota uses the `search_quota` verbs keyed by the hash + UTC day; incremented ONLY when `decideServe` returns `consumesQuota:true`.

## Section D/E — orchestration + persistence
`serveReport` reads the report (getReport) + quota, runs `decideServe`, and: serves fresh/stale as-is; on `collect` generates synchronously then persists; on `serve-stale-refresh` returns the STALE report immediately and runs the refresh in the BACKGROUND (the route passes Next `after()`), not blocking the response. `realPersist`: `getOrCreateDomain` → `saveReport` (upsert, `expires_at = now + 7d`) → `appendSignalHistory` — **APPEND-ONLY; prior rows are never overwritten/deleted** (the moat).

## Section F — recent feed (§7b)
`recentReports(n)` returns the N most-recent reports as `{ domain, state, generatedAt }` ONLY — no session/IP/user field. The landing renders them with the worded verdict (never colour-alone).

## Section G — route + RETIRE THE MOCK
- `/r/<domain>` (RSC) calls `serveReport`, renders the real Report through the Story 7 view, shows a "refreshing…" banner on stale, an **error** screen on invalid input, and a **limit-reached** screen (mascot `limit-reached`) over quota. **The `mockReport` module is deleted.**
- The landing search submits to `/search` (normalize → redirect to `/r/<domain>`); the hatch counter reads the REAL `countReports`; the Recent Searches section reads `recentReports`. All mock props removed.
- Background stale-refresh via `after()`. The landing + route are dynamic (`headers()` / `force-dynamic`), so **no build-time DB** — the no-DB build exits 0.

## Tests (160 total; +13; injected stubs, NO network/DB)
- `isFresh`; `decideServe` across ALL FIVE branches incl. `consumesQuota`.
- `sessionKey` hashes the IP (raw IP absent from the stored key); deterministic + IP-sensitive.
- `serveReport`: invalid→error (no work); serve-fresh does NOT collect/persist/consume; collect persists with the signals + consumes quota; serve-stale-refresh returns STALE first then refreshes in bg; limit-reached collects nothing. Fake clock.
- `recentReports` shape is anonymized (domain/state/generatedAt only).

## Part B (owner-gated; real DB, secret-free)
- `pnpm serve:report stripe.com` → **state served, freshness `new`** (collected + persisted): verdict `checks-out`, 14 signals, 0 flagged, 5 positive, 10 sources; summary carries the 16.1 caveat note ("PhishTank and URLhaus were not reachable …").
- Second call → **freshness `fresh`** (cache hit; no collection).
- `pnpm serve:report stripe.com --force` → `signal_history` rows **14 → 25 (appended 11)** — the prior rows are intact, proving APPEND-ONLY against the live dev DB.

## Decisions & deviations
- Quota-gates-collection (not every request) — see §B.
- `decideServe` is pure on three booleans; `serveReport` attaches the report (no `report?` returned from the pure decider).
- Recent feed surfaced as a landing section (the mockup's "Recent Searches tab"); anonymized.

## Gates
- install | lint | typecheck | test (160 passed; +13) | build (no DB present → exit 0): **pass**
- No network/DB in CI (injected stubs); no build-time DB connection. Secret sweep: no connection strings/credentials/salt in tracked code or config; `.env.local` untracked; `SERVER_SALT` documented in `.env.example` (empty).
