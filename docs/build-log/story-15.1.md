# Build log — Story 15.1 — Helium Epic (8 of 9): Size-cap regression fix

- PR: #27   - Branch: feature/helium-cap-regression-fix   - Status: opened (CI green)   - Date (UTC): 2026-06-26

Story 15 added a 5 MB default response-size cap to the harness — correct for untrusted live HTML, but
it silently truncated Story 13's PhishTank dump (tens of MB) → `JSON.parse` throws → ingest skipped
with a MISLEADING "a free app key may be required" reason (blamed the key, not the cap). Dormant in
dev (no PhishTank key set) but it would break the PhishTank half of the threat signal the moment a key
is added. Fixed forward, plus two smaller cap-related items. No new features, no UI.

## Files changed
- src/signals/phishtank-ingest.ts — (1, MAJOR) dump fetch passes `maxBytes: 64 MB`
- src/lib/cached-fetch.ts — (2, MINOR) `readBodyCapped` no longer swallows mid-stream read errors; `doFetch` maps them to `{ ok:false, error:"network" }`
- src/signals/ai-keywords.ts — (3, NIT) `stripToText` strips an UNCLOSED `<script>`/`<style>` to end-of-input
- src/lib/cached-fetch.test.ts / src/signals/threats.test.ts / src/signals/ai-pivot.test.ts — +3 tests

## 1) PhishTank dump opts out of the 5 MB cap (MAJOR — the regression)
`ingestPhishtank`'s dump fetch now passes an explicit `maxBytes: 64 * 1024 * 1024` (`DUMP_MAX_BYTES`) — the dump is intentionally large, so it must not be truncated into invalid JSON. The **5 MB default is unchanged for every other call** (verified: the only `maxBytes:` override in `src/` is the dump fetch).
- **Regression test:** a ~6 MB JSON dump is run through the **real harness** (`createFetcher`) into `ingestPhishtank`; it parses in FULL (`skipped:false`, `ingested:1`). Under the 5 MB default this would truncate to invalid JSON and skip — so the override can't silently regress again.

## 2) Mid-stream read error ⇒ network failure (MINOR)
`readBodyCapped` previously caught a mid-stream `reader.read()` rejection and returned the bytes collected so far with `truncated` unchanged — a dropped read looked like a clean short body (and could be cached / mis-scanned as complete). Now the error **propagates**; `doFetch` wraps the read and returns `{ ok:false, error:"network" }` (and does not cache). A deliberate overflow-cancel still returns normally with `truncated:true`.
- **Test:** a response whose stream errors after the first chunk ⇒ `{ ok:false, error:"network" }`, nothing cached.

## 3) stripToText handles an UNCLOSED script/style (NIT — included)
The script/style strips now match `…(?:<\/script>|$)` so an unclosed `<script>`/`<style>` is removed to end-of-input — JS like a `gpt`/`llm` variable can no longer leak into the visible text and cause a false keyword hit.
- **Test:** `<p>hello</p><script>const llm = useGPT();` → "hello"; `<script>var gpt = 1` (unclosed) → no matches; a closed script still works.

## VERIFY
- `pnpm test`: **129 passed (+3)**, incl. the >5 MB-dump-parses test and the mid-stream-error test. No network/DB in CI (stubs).
- Build with `DATABASE_URL` unset → exit 0.
- Secret sweep: zero `postgresql://` / `npg_` hits; `.env.local` untracked.
- Grep confirms: the PhishTank dump fetch passes an explicit `maxBytes`; the 5 MB default (`DEFAULT_MAX_BYTES`) is unchanged for everything else.

## Gates
- install | lint | typecheck | test (129 passed) | build (no DB present → exit 0): **pass**

## Dashboard
Per the PM-sync-first post-merge rhythm, the `data.js` note (15.1; upNext stays on Story 16) is applied AFTER merge.
