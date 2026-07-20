# Build log — Story 11.1 — Helium Epic (4 of 9): TLS pin fail-closed

- PR: #22   - Branch: feature/helium-tls-pin-failclosed   - Status: opened (CI green)   - Date (UTC): 2026-06-26

Tiny follow-up closing a gap in Story 11's TLS pin. Security only; no behavior change for the
happy path. No report wiring, no UI.

## The gap
`fetchTls` connected to `check.ips[0] ?? domain`. When `hostAllowed` returned **allowed-but-no-IP**
(a fail-open `ENOTFOUND`/`EAI_AGAIN`, or an empty resolver result), it fell back to the hostname —
which makes `tls.connect` **re-resolve**, reopening the DNS-rebinding TOCTOU on the exact path built
to close it. The pin guarantee had an exception.

## The fix (src/signals/tls.ts)
The only valid connect target is a validated IP from `check.ips`. If there's none, **FAIL CLOSED** —
return `{ ok:false, error:"blocked" }`; never connect by hostname.

```ts
const connectHost = check.ips[0];
if (!connectHost) return { ok: false, error: "blocked" };
```

IP-literal inputs already yield `ips:[literal]` from `hostAllowed`, so direct-IP targets are
unaffected. The pin is now exceptionless: every TLS connection goes to a validated IP.

## Tests (vitest, injected resolver/tlsConnect — no network/socket)
- [x] `hostAllowed → { allowed:true, ips:[] }` (empty resolver result) ⇒ `fetchTls` returns `blocked`, `tlsConnect` NOT called
- [x] fail-open `ENOTFOUND` (allowed, no IP) ⇒ `blocked`, `tlsConnect` NOT called
- [x] happy path (allowed + validated IP) still connects to that IP with `servername=domain` — green
- [x] existing block-before-connect + IP-literal + timeout/network tests stay green

## Gates
- install | lint | typecheck | test (83 passed; +2) | build (no DB present → exit 0): **pass**
- No network/socket/DB in CI; secret sweep clean; `.env.local` untracked.
