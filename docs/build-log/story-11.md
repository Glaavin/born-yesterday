# Build log — Story 11 — Helium Epic (4 of 9): Certificates & TLS

- PR: #21   - Branch: feature/helium-certs-tls   - Status: opened (CI green)   - Date (UTC): 2026-06-26

Second signal collector (crt.sh first-cert + live TLS), which first extracts and hardens the
SSRF host-validator so the live-TLS socket — a connection to a USER-CONTROLLED host:443 — reuses
the exact same gate the harness uses. Report stays on MOCK; no report wiring, no UI.

## Files changed
- src/lib/ssrf.ts — (new) extracted IP helpers + parameterized, hardened `hostAllowed(hostname, resolveHost)` returning validated IPs
- src/lib/ssrf.test.ts — (new) 22 cases: IP classification, literal/resolve blocking, fail-open vs fail-closed
- src/lib/cached-fetch.ts — (edited) imports the shared SSRF code; calls `hostAllowed(h, resolveHost).allowed` — behavior-preserving
- src/signals/dates.ts — (new) shared `toISO` (with MM/DD-ambiguity note) + `isoToEpochSec` (the ok-contract gate)
- src/signals/crtsh.ts — (new) `fetchCrtsh` (harness) + pure `parseCrtsh`
- src/signals/tls.ts — (new) `fetchTls` (SSRF-check + IP-pin before connect), `socketTlsConnect` default, pure `parseTlsCert`
- src/signals/certs.ts — (new) `collectCerts` — crt.sh + TLS → sourced Signals
- src/signals/certs.test.ts — (new) parseCrtsh/parseTlsCert/fetchTls-block/collectCerts
- src/signals/whois.ts — (edited) shared `toISO`; **byte cap** + injectable connection factory
- src/signals/whois.test.ts — (new) byte-cap behavior
- src/signals/domain-identity.ts — (edited) ok-contract retrofit (gate on a cleanly parsed date)
- src/signals/domain-identity.test.ts — (edited) +malformed-RDAP-eventDate test
- scripts/signal-certs.ts + package.json — (new) `pnpm signal:certs <domain> [--write]`

## Section A — shared SSRF validator (refactor + harden)
- Moved `parseIPv4`, `ipv6ToBytes`, `isBlockedIPv4`, `isBlockedIPv6`, `ipIsBlocked` and a new
  `hostAllowed(hostname, resolveHost)` into `src/lib/ssrf.ts`. The harness imports them; **behavior-preserving** — all 22 harness tests stay green.
- **Resolver fail-open hardened** (closes one of Story 10's open MINORs): a genuine host-not-found
  (`ENOTFOUND`/`ENODATA`/`EAI_AGAIN`/`EAI_NONAME`) **fails OPEN** (the connection would fail as network anyway); ANY other error — e.g. a `node:dns` import failure on a non-Node runtime — **fails CLOSED (blocks)**. (Replaces the old blanket "allow on any throw".)
- `hostAllowed` now RETURNS the validated resolved IP(s) so callers can connect-by-IP (used by TLS).

## Section B — crt.sh
- `fetchCrtsh` rides the harness (`kind:"third-party"`, ttl 7d). crt.sh is the known-slow source, so this one call gets the **§6 total budget (8s)** rather than the 3s individual default; still degrades gracefully on timeout.
- `parseCrtsh` (pure): earliest `not_before` across entries + count. crt.sh emits naive **UTC-without-Z** timestamps, so they're pinned to UTC before parsing (the exact locale-ambiguity the `toISO` comment flags).

## Section C — live TLS (the user-host transport)
- `fetchTls` runs the **shared `hostAllowed` FIRST** — if blocked, returns `{ ok:false, error:"blocked" }` and **never connects**. It then connects to a **validated resolved IP** (pinned) with `servername=<domain>` for SNI/cert match — **closing the DNS-rebinding TOCTOU** for this path (we never connect to an unvalidated address). 3s timeout; non-throwing (`blocked`/`timeout`/`network`); `tlsConnect` injectable so CI opens no socket.
- `parseTlsCert` (pure): issuer (O→CN), validFrom/validTo (ISO), subject O/OU.

## Section D — certs collector + folded template fixes
- `collectCerts`: signals `first_cert_date` (ISO+epoch), `cert_count`, `tls_issuer`, `tls_valid_to`, `ssl_org`, `ssl_ou` — each SOURCED (crt.sh query URL / `Live TLS handshake` → `https://<domain>`). **ok gates on the cleanly-parsed `first_cert_date`**; both-fail → `ok:false` + nulls, no throw.
- **Folded fixes (now shared):**
  - **(i) ok-contract** — chose to *gate ok on a valid parse* via shared `isoToEpochSec`, not normalize-in-parser (keeps parsers returning source-faithful strings; the collector decides assertability). Retrofitted `domain-identity.ts`; added a malformed-eventDate test (ok:false, date+age null).
  - **(ii) WHOIS byte cap** — `socketWhois` caps accumulation at 1 MiB and `destroy()`s on overflow (returns truncated); connection factory made injectable; tested.
  - **(iii) `toISO` comment** — documents the MM/DD numeric-date locale ambiguity in `dates.ts`.

## Tests (81 total; +35; fixtures + injected deps, NO network/socket/DB)
- ssrf: IP classification (v4/v6/mapped/CGNAT/metadata), literal-blocked-without-resolve, resolve-to-internal blocked, **fail-open ENOTFOUND vs fail-closed unexpected-error**
- crt.sh: earliest `not_before` + count; empty → nulls; malformed → nulls
- TLS: parseTlsCert fields; **fetchTls BLOCKS an internal-resolving domain and `tlsConnect` is never called**; connects to the validated IP with `servername=domain`; timeout vs network mapping
- certs collector: sourced signals + ok-on-first_cert_date; both-fail → ok:false/nulls
- folded: malformed-RDAP-date (domain-identity); WHOIS byte cap

## Part B (owner-gated; real collector, secret-free)
- `pnpm signal:certs stripe.com` — **live TLS handshake succeeded**: `tls_issuer = "DigiCert Inc"`, `tls_valid_to = 2026-09-03T23:59:59Z`, `ssl_org = "Stripe, Inc"`, sourced to the live handshake.
- crt.sh was **unreachable from the dev environment during this run** (HTTP 000 / connection timeout, even for a tiny domain — crt.sh is frequently slow/down), so `first_cert_date` degraded to null and `ok:false` — exactly the designed non-throwing partial-result behavior. `parseCrtsh` correctness is covered by fixtures.
- SSRF block-before-connect is proven by the `fetchTls` unit test (internal-resolving host → `blocked`, `tlsConnect` never called).

## Decisions & deviations
- ok-contract: gate-on-parse (not normalize-in-parser) — noted above.
- crt.sh per-call timeout raised to 8s (the §6 *total* budget) because the 3s individual default never beats crt.sh; the report-level 8s deadline will cap it in Story 16.
- TLS uses `rejectUnauthorized:false` — we INSPECT the cert (reporting on it), not trust it.

## Follow-ups / tech debt
- **The second open harness MINOR — explicit `http(s)` scheme allowlist in `cached-fetch` — is NOT in this story's brief and remains OPEN** (tracked for a later slot, ideally before the live-homepage fetch in Story 15).
- crt.sh reliability: consider a CT alternative or a longer async refresh if first-cert coverage matters at launch.

## Gates
- install | lint | typecheck | test (81 passed; +35) | build (no DB present → exit 0): **pass**
- No network/socket/DB in CI (pure parsers + injected deps). Section A behavior-preserving (22 harness tests green).
