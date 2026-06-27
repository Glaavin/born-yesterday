# Build log — Story 16.1 — Helium Epic (9 of 10): Request-path readiness

- PR: #29   - Branch: feature/helium-request-path-readiness   - Status: opened (CI green)   - Date (UTC): 2026-06-26

Two architecture items the reviewer flagged as pre-Story-17 (NOT 1.7 tuning): make the 8s budget a
real wall-clock cap, and stop GREEN from silently over-trusting an unreachable threat feed. Surgical
fixes to the assembly engine before Story 17 puts it on the live request path. No serve path, no
routes, no persistence here.

## Files changed
- src/signals/whois.ts — (1) `socketWhois` + `WhoisDeps` thread the shared signal; abort tears the socket down
- src/signals/tls.ts — (1) `socketTlsConnect` + `TlsConnectOpts`/`TlsDeps` thread the signal; injectable connect factory; `fetchTls` forwards + short-circuits
- src/report/collect-all.ts — (1) the orchestrator now passes the deadline signal into the domain-identity (WHOIS) and certs (TLS) collectors
- src/report/indicator.ts — (2) GREEN discloses an unreachable threat feed
- src/signals/whois.test.ts / certs.test.ts / report/indicator.test.ts — +6 tests

## Section 1 — Real deadline bound (socket transports honor the shared abort)
Before this, the orchestrator threaded one 8s-budget `AbortSignal` to collectors and the HTTP harness honored it — but the SOCKET transports didn't: the WHOIS port-43 socket (~5s) and the TLS handshake (~3s) used only their own per-call timeouts, so an RDAP→WHOIS fallback could run ~13s past the budget.
- **The signal now tears the sockets down.** `socketWhois` and `socketTlsConnect` take the shared `signal`; on `abort` they `destroy()` the socket and reject with a timeout-coded error (`ETIMEDOUT`), which the collectors map to their non-throwing failure ("timeout"). An already-aborted signal throws before connecting. **Each per-call timeout stays as a FLOOR** — whichever fires first wins — so total wall-clock can't exceed the budget.
- **The seam:** `collect-all` now passes `signal: s` into the `domain-identity` and `certs` collector deps; `domain-identity` → `queryWhois` → `whoisQuery(host, query, timeoutMs, signal)`, and `certs` → `fetchTls` → `tlsConnect({…, signal})`. (The HTTP calls already carried it via the deadline-wrapped fetcher.)
- **Injectable connect:** `socketWhois(host, query, timeoutMs, signal?, connect?)` and `socketTlsConnect(opts, connect?)` accept a connect factory, so the teardown is unit-tested with a FAKE socket — no real sockets in CI.
- **Tests:** an abort on a 60s-timeout WHOIS/TLS call rejects PROMPTLY and `destroy()`s the socket (never waits the timeout); an already-aborted signal never connects; a normal handshake still resolves the cert.

## Section 2 — GREEN acknowledges the threat-check (no silent over-trust)
The indicator treated a "not checked" threat feed (unreachable / no key → value null) the same as "not listed" (checked, clean), so a domain could go GREEN while we never reached PhishTank/URLhaus.
- A feed counts as **checked** only if it returned a definitive value (`"Not listed"`; a `"Listed"` already returned RED). When GREEN is awarded and PhishTank/URLhaus wasn't checked, the rubric adds a **caveat** reason that names the ACTUAL unreachable feed(s) (e.g. *"PhishTank and URLhaus were not reachable at check time; not independently cleared."*). **Transparency over false comfort.**
- **A caveat is NOT reassurance** (PR-#29 amendment). `Reason` gained an optional `kind?: "positive" | "caveat"`. In `assemble.ts`, caveat reasons route into the **report SUMMARY** as a factual note (`"… Note: PhishTank … not reachable …"`) — **never into `positive[]` or `flagged[]`** — and the rendered `Report` shape (`report-state.ts`) is unchanged (the summary is the caveat's home). A summary note needs no source link, which also resolves the always-URLhaus-source NIT.
- **GREEN stays reachable** (requiring a successful check would make GREEN impossible while feeds are key-gated). **1.7 trade-off (deferred):** a stricter "require ≥1 successful threat check for GREEN" once working feed keys exist; default now = state-the-gap.
- **Tests:** the GREEN caveat is **absent from `positive[]` and `flagged[]`** and **present in the summary** (the placement gap that let it slip); established+clean with both feeds checked-and-clear → green WITHOUT a note. Red-on-listing unchanged.

## NIT — abort-listener cleanup
`socketWhois`/`socketTlsConnect` now `removeEventListener` the abort handler on normal completion (via a `cleanup` set when the listener is registered), so a finished call doesn't keep a listener on the shared deadline signal until it aborts/GCs.

## VERIFY
- install | lint | typecheck | test (146 passed; +6) | build (no DB present → exit 0): **pass**
- No network/DB/real sockets in CI (fakes injected).
- Secret sweep: no DB connection strings / credentials in tracked code or config; `.env.local` untracked. (The broad pattern grep still only matches benign build-log prose in story-15.1, not a secret.)

## Dashboard
Per the PM-sync-first post-merge rhythm, `data.js` (note 16.1; upNext stays Story 17) is updated AFTER merge.
