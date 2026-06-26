# Build log — Story 9 — Helium Epic (2 of 9): Cached-fetch harness

- PR: #18   - Branch: feature/helium-fetch-harness   - Status: opened (CI green)   - Date (UTC): 2026-06-26

The single outbound HTTP path every signal collector (Stories 10–15) will ride — cached,
timed, polite, fault-tolerant. No signal collection, no UI. Content-agnostic (text + status
out); callers parse JSON/HTML themselves.

## Files changed
- src/lib/cached-fetch.ts — (new) `createFetcher(deps)` + default `cachedFetch`; caching, timeouts, backoff, robots (live-site only), non-throwing result
- src/lib/cached-fetch.test.ts — (new) 13 vitest cases, injected stubs, NO network/DB

## Result type & options
- **Non-throwing** discriminated union: `{ ok:true, status, body, fromCache }` | `{ ok:false, error:'timeout'|'http'|'network'|'robots-disallowed', status? }`. Network/timeout/HTTP failures **return** an error result — they never throw, so one bad source can't kill a report. Throwing is reserved for **programmer misuse** (missing `source`/`key`/`url`, bad `kind`, negative ttl).
- **Options:** `{ source, key, url, ttlSeconds, kind:'third-party'|'live-site', method?, headers?, signal?, timeoutMs=3000, maxRetries=2, minHostIntervalMs? }`. Cache key = `\`${source}:${key}\`` trimmed+lowercased. `ttlSeconds=0` ⇒ do NOT cache (always fetch).

## Timeouts: 3s per-call + the external 8s deadline
- Each attempt creates an `AbortController` aborted by `setTimeout(timeoutMs)`. The optional `opts.signal` (Story 16's report-level 8s budget) is merged in via `AbortSignal.any`, so the call aborts when **either** the per-call timeout or the external deadline fires. A call cut by either returns `{ ok:false, error:'timeout' }`. An already-aborted external signal short-circuits before any fetch.
- The harness races the fetch against an abort-watcher, so it resolves promptly even if a (stub) fetch ignores the signal.

## Politeness & caching policy (baked into the harness, not per-caller)
- **UA on every request:** `BornYesterdayBot/1.0 (+https://bornyesterday.tech/about-bot)` — forced (caller headers can't override it).
- **Backoff/retry:** exponential + jitter (via injected `sleep`) on **429/5xx** up to `maxRetries`.
- **Cache only successes:** 2xx bodies are `cacheSet`; failures (timeout/network/non-2xx) are **never** cached, so a transient outage can't poison the cache. A cache hit returns `fromCache:true` without fetching (reported `status:200`, since only 2xx is cached).
- **Per-host min interval:** optional `minHostIntervalMs` via a best-effort in-memory last-hit map (per-instance/ephemeral on serverless — acceptable alongside backoff).
- **robots.txt — live-site only:** `kind:'live-site'` fetches+caches `/robots.txt` (through the harness, so it isn't re-fetched per call), parses User-agent groups (our token beats `*`), longest-match Allow/Disallow; disallowed ⇒ `{ ok:false, error:'robots-disallowed' }` **without** fetching the target. Missing/unfetchable robots ⇒ allowed. `kind:'third-party'` (Wayback/crt.sh/DoH/threat lists) **skips** robots entirely.

## Tests (13; injected stubs; no network, no DB)
- [x] cache-hit-once: first fetches+caches; second returns `fromCache:true`, fetch NOT called again
- [x] `ttlSeconds=0` bypasses cache (fetches twice; never reads/writes cache)
- [x] polite UA sent on every request
- [x] timeout: never-resolving fetch aborts at `timeoutMs` → `timeout`; nothing cached (fake timers)
- [x] external signal: already-aborted `opts.signal` → `timeout`, target never fetched
- [x] backoff: 429→200 retried → ok (one injected backoff); 500×(1+maxRetries) → `http` 500, NOT cached
- [x] network error returns `{ ok:false, error:'network' }` (no throw), not cached
- [x] robots: live-site `Disallow:/` → `robots-disallowed`, target never fetched; allowing path proceeds; third-party fetched despite a `Disallow:/`
- [x] per-host min interval waits out the spacing
- [x] programmer misuse throws

## Decisions & deviations
- **`now` dep defaults to `Date.now` (ms), not `nowSec` (s).** The only in-harness use of `now` is the millisecond-domain per-host interval; cache-expiry seconds stay encapsulated in `cacheGet`/`cacheSet`. (Flagged per the prompt's "flag if you'd change a default".)
- **Timeout uses `setTimeout`/`AbortController`** (real timers, fake-timer-controllable) while **backoff uses the injected `sleep`** — keeps both independently testable.
- **robots matching is simple prefix** (no `*`/`$` wildcard expansion) — sufficient for our handful of live-site hosts; noted for a later upgrade if needed.

## Follow-ups / tech debt
- robots wildcard (`*`/`$`) + `Crawl-delay` support if a live-site host needs it.
- Timestamp-unit (epoch seconds) typed helper still pending for Story 16 (carried from Story 8).

## Gates
- install | lint | typecheck | test (25 passed total; 13 new) | build (no DB present → passes, exit 0): **pass**
- No DB/network in CI tests (injected stubs only); nothing connects at import/build.
