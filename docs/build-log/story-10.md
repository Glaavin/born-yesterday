# Build log — Story 10 — Helium Epic (3 of 9): Domain identity & age

- PR: #20   - Branch: feature/helium-domain-identity   - Status: opened (CI green)   - Date (UTC): 2026-06-26

The FIRST real signal collector and the template for Stories 11–15: fetch-through-harness →
parse (pure) → sourced values → signal_history mapping. Produces the domain's registration date,
age, and registrar. Report stays on MOCK until Story 16 — this story wires no report and no UI.

## Files changed
- src/signals/types.ts — (new) collector contract (`SignalSource`/`Signal`/`CollectorResult`/`Collector`) + pure `signalsToHistory`
- src/signals/rdap.ts — (new) `fetchRdap` (rides the harness, kind:"third-party") + pure `parseRdap`
- src/signals/whois.ts — (new) port-43 socket sidecar: `socketWhois` (default), `queryWhois` (cached, IANA-discovery), pure `parseWhois`
- src/signals/domain-identity.ts — (new) the collector: RDAP primary → WHOIS fallback, sourced Signals
- src/signals/domain-identity.test.ts — (new) 12 vitest cases, fixtures + injected deps (no network/socket/DB)
- scripts/signal-domain.ts — (new) `pnpm signal:domain <domain> [--write]` dev proof (real harness + real WHOIS)
- package.json — (edited) `signal:domain` script

## Collector contract + history mapping
- `Signal = { key, label, valueText|null, valueNum|null, source|null, note? }`; `CollectorResult = { collector, signals, ok, error? }`. Every value carries its public `source`; unsourced ⇒ null, never a guess.
- `signalsToHistory(domain, signals, capturedAt)` is **pure**: `key→signal_type`, `valueText→value_text`, `valueNum→value_num`. Sources live in the report JSON (the schema has no source column) and are dropped; all-null signals carry no information and are skipped.

## Fetch / parse split (parsers are the only thing CI tests)
- **RDAP rides the existing harness** — `fetchRdap` calls the injected `Fetcher` with `kind:"third-party"`, `ttl 7d`; rdap.org's redirect to the authoritative registry + caching are the harness's job (no new fetch path). `parseRdap(json)` is pure: registration = `events[].eventAction==="registration"→eventDate`; registrar = `entities[]` with role `registrar` → `vcardArray` `fn`. Defensive; never throws on shape variance.
- **WHOIS is the socket sidecar** — `queryWhois` does a port-43 lookup over a *different transport* (not the HTTP harness), caches the raw text in `external_cache`, and discovers the server via a static TLD map (falling back to an IANA referral). `whoisQuery` is **injectable** so tests/CI never open a socket. `parseWhois(text)` is pure: matches common `Creation Date`/`Created`/`Registered on` and `Registrar:` lines; returns nulls when unsure.
- **WHOIS approach: hand-rolled minimal socket, not a library.** A lib (e.g. whoiser) returns pre-parsed objects, which would defeat the raw-text-in / pure-parser-out split; a ~20-line `node:net` query keeps the split clean and adds no dependency.

## Collector behavior
- RDAP first; WHOIS fills whatever RDAP didn't (`!regIso || !registrar`). Signals: `domain_registration_date` (ISO text + epoch-seconds num), `domain_age_days` (whole days, derived once), `registrar` (**display only** — never editorialized). Source attached per value (RDAP record / WHOIS), `note:"via WHOIS fallback"` when WHOIS supplied it. **Both fail → `ok:false`, signals present with null values — not a thrown error** ("Not found" is information).

## Tests (12 new; 46 total; fixtures + injected deps, NO network/socket/DB)
- [x] `parseRdap` on .com + .io shapes → date + registrar; missing-fields → nulls; malformed JSON → nulls (no throw)
- [x] `parseWhois` on verisign-style .com (ignores `Registrar URL`/`WHOIS Server` lines) + lowercase `created:`/`registrar:` → date + registrar; ambiguous → nulls
- [x] collector RDAP-success (sourced to RDAP, **WHOIS not called**); RDAP-fail → WHOIS-fallback (note + WHOIS source set); both-fail → `ok:false`, null values, no throw
- [x] `domain_age_days` derivation (365 days); `signalsToHistory` mapping (text vs num; drops sources + all-null)

## Part B (owner-gated; real collector, secret-free) — both paths proven live
- **RDAP primary** — `pnpm signal:domain stripe.com`:
  `domain_registration_date = 1995-09-12T04:00:00Z` (epoch 810878400), `domain_age_days = 11245`, `registrar = "SafeNames Ltd."`, all sourced to the RDAP record; `ok:true`.
- **WHOIS fallback (IANA discovery)** — `pnpm signal:domain repubblica.it` (`.it` is not in the RDAP bootstrap, so rdap.org 404s → IANA referral → `whois.nic.it`):
  `domain_registration_date = 1996-05-15T05:00:00.000Z`, `domain_age_days = 10999`, both sourced to WHOIS with `note:"via WHOIS fallback"`; `ok:true`. `registrar` came back null (the `.it` registrar block is multi-line) — correctly **not guessed**.

## Decisions & deviations
- WHOIS dates are normalized to ISO via `new Date(...)` and rejected (null) if they don't parse — no guessing.
- `now` (deps) is epoch **ms** (default `Date.now`) for the age derivation; the registration `valueNum` is epoch **seconds** (consistent with the schema's BIGINT epoch-seconds convention).

## Follow-ups / tech debt
- Registrar parsing for multi-line WHOIS blocks (e.g. `.it`, `.uk`) — currently null rather than guessed; add per-registry handling if a later signal needs it.
- Epoch-seconds typed helper still pending for Story 16 (carried).

## Gates
- install | lint | typecheck | test (46 passed; 12 new) | build (no DB present → exit 0): **pass**
- No network/socket/DB in CI (pure parsers + injected deps). Part B (live RDAP + WHOIS) run owner-side, secret-free.
