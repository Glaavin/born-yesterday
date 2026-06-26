# Build log — Story 13 — Helium Epic (6 of 9): Threat-list lookups

- PR: #24   - Branch: feature/helium-threat-lists   - Status: opened (CI green)   - Date (UTC): 2026-06-26

Binary red-flag signals: is the domain on a public phishing/malware feed? Two sources — URLhaus
(per-domain API, rides the harness) and PhishTank (a downloadable dump stored in Postgres, queried
locally). Reuses the collector template; folds the Story 12 DNS provenance fix. Report stays on MOCK;
no report wiring, no UI.

## Files changed
- src/signals/dns-signals.ts + .test.ts — (Section 0) neutral source label "DNS over HTTPS"; test updated
- src/db/schema.ts — (Section A) `threat_hosts(source, host, first_seen)` PK(source,host) + index on host; `NewThreatHostRow`
- drizzle/0002_*.sql + meta — (new) additive migration (0000/0001 untouched)
- src/db/queries.ts — `countThreatHosts`, `isThreatHostListed`, `upsertThreatHosts` (chunked)
- src/signals/host.ts — pure `extractHost(url)`
- src/signals/phishtank-ingest.ts — (Section B) best-effort `ingestPhishtank(deps)`
- src/signals/urlhaus.ts — (Section C) `fetchUrlhaus` (harness POST) + pure `parseUrlhaus`
- src/signals/threats.ts — (Section D) `collectThreats`
- src/signals/threats.test.ts — parseUrlhaus / extractHost / ingest / collector (11 cases)
- src/lib/cached-fetch.ts — added optional `body` to FetchOptions/FetchImpl (POST support; behavior-preserving)
- scripts/threat-ingest.ts (`pnpm threat:ingest`), scripts/signal-threats.ts (`pnpm signal:threats`), package.json
- .env.example — `PHISHTANK_APP_KEY=` / `URLHAUS_AUTH_KEY=` empty placeholders

## Section 0 — DNS provenance fix (from #23)
`dnsSource` label changed from "DNS over HTTPS (Cloudflare)" → neutral **"DNS over HTTPS"** (the URL still points at dns.google's record viewer — a human view of the same record — so the label no longer names a different operator). Test at dns-signals.test.ts updated to match. One-line behavior change.

## Keys are OPTIONAL; sources degrade, never block
Both `PHISHTANK_APP_KEY` and `URLHAUS_AUTH_KEY` are optional env vars (read only from `process.env`, never committed; empty placeholders in `.env.example`). **DATA-SOURCE RISK confirmed during build:** PhishTank's dump and abuse.ch's URLhaus API now require free registration. When a source is unreachable/unauthorized, that signal degrades to `valueText:null` + `note:"not checked"`; the other source still reports; the collector **never blocks and never throws**.

## ok-contract
`ok = at least one source was actually CHECKED` (not both null). A clean domain (checked, not listed) is `ok:true` with "Not listed" — clean is information. Both sources unreachable ⇒ `ok:false` + nulls, no throw.

## URLhaus + PhishTank wiring
- **URLhaus** (harness): `POST host=<domain>` (form-encoded) to the fixed `urlhaus-api.abuse.ch` host, `kind:"third-party"`, ttl 1d, `Auth-Key` header sent only if the key is set. `parseUrlhaus` (pure): `query_status "ok"` ⇒ listed (+count); `"no_results"` ⇒ not listed; anything else/unauthorized ⇒ null. (Required adding optional `body` to the harness — a small, behavior-preserving extension; existing 22 harness tests stay green.)
- **PhishTank** (local table): `threat:ingest` downloads the dump (ttl:0, no caching of the large payload, still via the harness for UA/SSRF/timeout), extracts+normalizes the host from each phish URL via `extractHost`, dedupes, and upserts into `threat_hosts`. The collector looks up `host = domain` under `source="phishtank"`; `countThreatHosts("phishtank") === 0` ⇒ never ingested ⇒ "not checked" (null), so an empty table reads as "not checked" rather than a false "Not listed".

## Migration
`0002_*.sql` is purely additive (`CREATE TABLE threat_hosts` + index); `0000`/`0001` untouched (`git diff` empty). Applied cleanly to the dev DB.

## Tests (105 total; +11; fixtures + injected deps, NO network/DB)
- `parseUrlhaus`: listed (+count) / no_results / unauthorized / malformed → null
- `extractHost`: URL + scheme-less + trailing dot + junk(null)
- `ingestPhishtank`: host extract/normalize/dedupe + upsert payload; unavailable dump → skipped, no upsert
- `collectThreats`: one source listed (other "not checked") ok:true; both clean ok:true "Not listed" + sources; both unreachable ok:false + nulls, no throw
- the corrected DNS provenance test; existing tests green

## Part B (owner-gated; secret-free)
- **Keys were NOT available** in the dev env (`PHISHTANK_APP_KEY`/`URLHAUS_AUTH_KEY` unset).
- `pnpm threat:ingest` → **skipped non-fatally** ("download failed (http)") — exactly the degrade path.
- `pnpm signal:threats stripe.com` → both signals `null` + `note:"not checked"`, `ok:false` — graceful degradation, no throw.
- **Local-table path proven** via a throwaway (insert one host → lookup → cleanup): `phishtank_listed = "Listed"`, sourced to PhishTank — confirms `0002` + the queries + collector wiring against the live dev DB.

## Decisions & deviations
- The dump is too large for `external_cache`, so ingest uses `ttlSeconds:0` (no caching) but still goes through the harness for the polite UA / SSRF / timeout.
- PhishTank lookup is exact-host (`host = domain`); per-registrable-form expansion can be added later if needed.
- `ingestPhishtank` lives in `src/signals/` (testable, injected) with a thin `scripts/threat-ingest.ts` runner — matches the template's fetch/parse-vs-wiring split.

## Gates
- install | lint | typecheck | test (105 passed; +11) | build (no DB present → exit 0): **pass**
- No network/DB in CI; secret/key sweep clean; `.env.local` untracked; `.env.example` has both keys as empty placeholders.
