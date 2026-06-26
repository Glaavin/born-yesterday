# Build log — Story 12 — Helium Epic (5 of 9): DNS signals

- PR: #23   - Branch: feature/helium-dns   - Status: opened (CI green)   - Date (UTC): 2026-06-26

Third signal collector — a clean reuse of the Story 10/11 template (fetch-through-harness → pure
parser → sourced Signals) with NO new transport and NO user-host connection. DNS is queried over
DoH to Cloudflare's FIXED resolver (the domain is a query param, never the connection host), so the
user-host SSRF class doesn't apply here. Report stays on MOCK; no report wiring, no UI.

## Files changed
- src/signals/doh.ts — (new) `fetchDoh` (harness, kind:"third-party") + pure `parseAnswers`
- src/signals/dns.ts — (new) pure `findSpf`, `findDmarc`, `hostingFromPtr`, `reverseName`
- src/signals/dns-signals.ts — (new) `collectDns` — five sourced signals
- src/signals/dns-signals.test.ts — (new) 11 cases, DoH fixtures + injected fetcher (no network/DB)
- scripts/signal-dns.ts + package.json — (new) `pnpm signal:dns <domain> [--write]`

## The five signals (each sourced; absence ⇒ null/"Not found")
- `dns_spf` — the `v=spf1…` TXT record | null
- `dns_dmarc` — the `v=DMARC1…` TXT at `_dmarc.<domain>` | null
- `dns_a` — comma-joined IPs | null; `valueNum` = count
- `dns_mx` — comma-joined MX hosts | null (null ⇒ no mail configured)
- `hosting_provider` — best-effort label from reverse-DNS of the first A IP | null

Source per value: `{ label:"DNS over HTTPS (Cloudflare)", url:"https://dns.google/query?name=<name>&type=<TYPE>" }` — Cloudflare is where we query; dns.google's query UI is the human-viewable record source for that name/type.

## ok-contract: absence is information
`ok = the domain RESOLVED` (we got DNS answers for A or any query). A resolving domain with **no SPF / no DMARC / no MX** is `ok:true` with those values null ("Not found", never hidden). Total DNS failure / NXDOMAIN ⇒ `ok:false` + all-null, **no throw**.

## DoH parse handling
- `parseAnswers(json, type)` reads the DoH `{ Status, Answer:[{type,data}] }` shape, **filtering by the numeric RR type** (A=1, MX=15, TXT=16, PTR=12, …) so a TXT answer never leaks into an A query. Pure; `[]` on NXDOMAIN/empty/malformed; never throws.
- **TXT is quoted and may be chunked** (`"part1" "part2"`); we strip the quotes and concatenate the chunks. Non-TXT data is returned trimmed; MX (`"<prio> <host>."`) → host with the trailing dot dropped; PTR drops the trailing dot.
- **hosting-from-PTR** is a small known-suffix heuristic (amazonaws.com→AWS, 1e100.net→Google, cloudflare→Cloudflare, vercel→Vercel, azure→Azure, …); unknown PTR → the raw host; no PTR → null.

## Tests (94 total; +11; DoH fixtures + injected fetcher, NO network/DB)
- [x] `parseAnswers`: TXT dequote, chunked-TXT concat, A/MX/PTR, **type filtering** (TXT asked-as-A → []), NXDOMAIN/empty/malformed → []
- [x] `findSpf`/`findDmarc` present + absent; `hostingFromPtr` known suffixes / raw fallback / no-PTR; `reverseName`
- [x] collector: all-present → five signals sourced, ok:true; **resolves-but-no-SPF/DMARC → those null, ok:true**; NXDOMAIN → ok:false + nulls, no throw

## Part B (owner-gated; real collector, secret-free)
- `pnpm signal:dns stripe.com` → **SPF** (`v=spf1 …~all`), **DMARC** (`v=DMARC1; p=reject; …`), **A** (2 IPs), **MX** (Google Workspace, 5 hosts), `ok:true`. `hosting_provider` null (no PTR on the A IP).
- `pnpm signal:dns example.com` → SPF + DMARC + A present, **`dns_mx` = null ("Not found", no mail configured)**, `ok:true` — the absence-is-information path. `hosting_provider` null (Cloudflare IPs, no PTR).

## Decisions & deviations
- DoH TTL = 1h (DNS changes more often than the 7d registration/cert signals).
- Source label says "Cloudflare" (where we query) while the URL points at dns.google's viewer (a public, human-viewable record source) — per the brief.
- `hosting_provider` is explicitly best-effort/heuristic; null is a legitimate, sourced-as-nothing outcome.

## Gates
- install | lint | typecheck | test (94 passed; +11) | build (no DB present → exit 0): **pass**
- No network/DB in CI (pure parsers + injected fetcher). No user-host connection; no report wiring.
