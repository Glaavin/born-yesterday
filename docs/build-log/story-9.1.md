# Build log — Story 9.1 — Helium Epic (2 of 9): Fetch-harness SSRF hardening

- PR: #19   - Branch: feature/helium-ssrf-hardening   - Status: opened (CI green)   - Date (UTC): 2026-06-26

SSRF egress protection on the cached-fetch chokepoint, before any collector points
`kind:"live-site"` at a user-submitted domain (Story 10), plus two correctness fixes flagged
in review. Security hardening only — no signal collection, no UI.

## Files changed
- src/lib/cached-fetch.ts — (edited) SSRF egress filter + injectable `resolveHost` dep; manual redirect following with per-hop re-validation; malformed-URL non-throw; empty-UA robots guard; new `error:"blocked"`
- src/lib/cached-fetch.test.ts — (edited) default public-IP resolver stub; `resp()` gains headers; +9 SSRF/redirect/malformed/empty-UA tests

## 1) SSRF egress filtering (MAJOR)
Before **every** outbound request (all kinds), the target host is validated; on reject we return
`{ ok:false, error:"blocked" }` **without fetching**. An IP **literal** is checked directly; a
**hostname** is resolved via the injected `resolveHost` (default `node:dns/promises` lookup, lazy
import) and rejected if **any** resolved address falls in a blocked range:
- IPv4: `127.0.0.0/8`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `169.254.0.0/16` (incl. the `169.254.169.254` metadata IP), `100.64.0.0/10` (CGNAT), `0.0.0.0/8`
- IPv6: `::1`, `::` (unspecified), `fc00::/7`, `fe80::/10`, and **IPv4-mapped** `::ffff:a.b.c.d` (the embedded v4 is re-checked against the v4 ranges)
- An unparseable IP literal / a hostname that resolves to a non-IP → rejected (fail-closed). A resolver *error* (NXDOMAIN etc.) → not blocked: it isn't an SSRF case and the real fetch will fail as `network`.

Applied to all kinds as cheap defense-in-depth — public third-party hosts (Wayback/crt.sh/DoH/threat lists) resolve to public IPs and are unaffected.

## 2) Redirects re-validated per hop
`redirect:"manual"` on every request; we follow manually, cap at **3 hops**, and for **each** hop
re-run the **SSRF check** on the new host and (for `live-site`) **re-evaluate robots** for the new
URL before following. A failing hop → `blocked` (or `robots-disallowed`) and the target is never
fetched; exceeding the hop cap → `{ ok:false, error:"http", status }` (the last 3xx status). We never
follow a redirect to an unvalidated host.

## 3) Malformed-URL non-throw (MINOR)
`new URL(opts.url)` is wrapped; an invalid/relative URL (and a malformed redirect `Location`) returns
`{ ok:false, error:"network" }` instead of throwing — upholds the non-throwing contract.

## 4) Empty-UA robots guard (NIT)
`selectRules` now requires `a && uaToken.includes(a)`, so an **empty** `User-agent:` value can't match
our bot as a "specific" group (`includes("")` is always true) and shadow the `*` group.

## 5) Post-loop return
Kept the trailing `return { ok:false, error:"http", status:lastStatus }` — it's logically unreachable
(the retry loop always returns on its last iteration) but required for TS control-flow exhaustiveness.

## Tests (+9; 34 total; injected stubs, NO network/DB)
- [x] live-site host resolving to `127.0.0.1` / `169.254.169.254` / `10.x` / `192.168.x` → `blocked`, target never fetched, nothing cached (resolver stub)
- [x] IP-literal target (`169.254.169.254`) → `blocked` with **no** DNS resolution
- [x] 3xx redirect to an internal host → `blocked`; post-redirect host re-validated; body never returned/cached; only hop 0 fetched
- [x] 3xx redirect to a public host → followed; robots re-checked at the new host; final body returned
- [x] malformed/relative `url` → `{ ok:false, error:"network" }` (does not throw)
- [x] empty User-agent robots group does not override `*`
- [x] all existing 25 cases still green (the default resolver stub keeps them off real DNS)

## DNS-rebinding residual (known, documented)
Resolve-then-fetch has a **TOCTOU window**: a hostname could resolve to a public IP during our check
and rebind to a private IP by the time `fetch` does its own resolution. Full mitigation — pin the
resolved IP and fetch by IP with a `Host` header — is awkward on the serverless `fetch` (no
per-request DNS pin / custom dispatcher) and is **not implemented now**. Mitigating factors: short
TTLs aren't honored by us as a vector, the blocked-range check still catches IP-literal targets and
the common metadata-IP case, and signals run server-side on a managed egress. Revisit with a pinned
resolver/dispatcher if/when we add untrusted live-site fetching at scale.

## Gates
- install | lint | typecheck | test (34 passed; 9 new) | build (no DB present → exit 0): **pass**
- No network/DB in CI tests (injected stubs incl. resolver); nothing connects at import/build.
