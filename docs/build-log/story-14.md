# Build log — Story 14 — Helium Epic (7 of 9): Reputation presence

- PR: #25   - Branch: feature/helium-reputation   - Status: opened (CI green)   - Date (UTC): 2026-06-26

Best-effort public reputation signals: Trustpilot + BBB (scrape the public page for rating/grade +
link) and link-outs (web "review scam" search + Reddit search) as LINKS, not scrapes. All sources are
FIXED hosts (trustpilot.com, bbb.org) with the domain as a path/query value — no user-host
connection, no SSRF. Report stays on MOCK; no report wiring, no UI. Principle: we count and link, we
don't judge; absence ⇒ "Not found"; this collector NEVER blocks and NEVER throws.

## Files changed
- src/signals/trustpilot.ts — (new) `fetchTrustpilot` (harness) + pure `parseTrustpilot` (JSON-LD)
- src/signals/bbb.ts — (new) `fetchBbb` (harness) + pure `parseBbb` (grade + profile link)
- src/signals/reputation-links.ts — (new) pure `webReviewSearchUrl` / `redditSearchUrl` (no fetch)
- src/signals/reputation.ts — (new) `collectReputation` — four sourced signals
- src/signals/reputation.test.ts — (new) 8 cases, HTML fixtures + injected fetcher (no network/DB)
- scripts/signal-reputation.ts + package.json — (new) `pnpm signal:reputation <domain> [--write]`

## Parse approach — JSON-LD over text
- **Trustpilot:** `parseTrustpilot` PREFERS the embedded **schema.org JSON-LD** — it walks every `<script type="application/ld+json">` block and finds `aggregateRating` (`ratingValue` / `reviewCount`), which is far more stable than visible-text scraping. Null on absent/parse-fail/block.
- **BBB:** `parseBbb` is conservative — a structured `"rating":"A+"` (falling back to "BBB Rating: A+" text) for the letter grade, plus the first `…/profile/…` link. Null on a miss.
- Both parsers are PURE and wrapped to never throw.

## Degrade behavior (403 / block ⇒ "Not found")
A blocked/odd/absent page degrades to `valueText:null` ("Not found") — distinct from a thrown error. Each fetch is wrapped: a non-2xx (`fetchTrustpilot`/`fetchBbb` return `ok:false`), an empty body, a parse miss, OR a thrown fetch all collapse to "Not found". **The collector returns `ok:true` on misses** (best-effort discovery — the link-outs are always present) and never throws / never blocks the report.

## The four signals (each sourced)
- `trustpilot` — e.g. "4.2/5 (1,203 reviews)" (`valueNum` = rating) + source = the Trustpilot review URL; null ("Not found") otherwise.
- `bbb` — the letter grade + source = the profile URL (or the BBB search URL); null otherwise.
- `reputation_search` — "Search the web for reviews / scam reports" + source = a Google search for `<domain> review scam`. **Always present.**
- `reddit_search` — "Search Reddit for mentions" + source = a Reddit search for `<domain>`. **Always present.**

Link-outs are **links, not scrapes** — we never fetch or parse search-engine results.

## Tests (113 total; +8; HTML fixtures + injected fetcher, NO network/DB)
- `parseTrustpilot`: JSON-LD → rating+count; no-rating / 403 → nulls
- `parseBbb`: grade + profile link present; absent → nulls
- link-out URL construction (correct encoding)
- collector: both present → formatted + sourced, link-outs present, ok:true; both blocked/absent → "Not found" + link-outs, ok:true; a **throwing** fetch → "Not found", ok:true, **no throw**

## Part B (owner-gated; real collector, secret-free)
`pnpm signal:reputation stripe.com`:
- **Trustpilot → HTTP 403** (anti-bot block — the documented/expected case) ⇒ `trustpilot` "Not found".
- **BBB → HTTP 200** but the grade is JS-rendered (not in the raw HTML for this search) ⇒ `bbb` "Not found".
- Both link-outs present and sourced (`google.com/search?q=stripe.com%20review%20scam`, `reddit.com/search/?q=stripe.com`); `ok:true`, no throw.
- This is exactly the best-effort degrade path; parser correctness is covered by the JSON-LD/grade fixtures. (A domain whose Trustpilot page isn't 403-blocked would populate the rating; blocks are expected and acceptable.)

## Decisions & deviations
- Web link-out uses a Google search URL (`<domain> review scam`); Reddit uses its search URL. Both are link-outs only.
- Trustpilot/BBB are heavily bot-protected/JS-rendered, so live rating/grade extraction is opportunistic; the design treats that as "Not found", never an error. A headless-render path could be a later enhancement if these signals prove valuable.

## Gates
- install | lint | typecheck | test (113 passed; +8) | build (no DB present → exit 0): **pass**
- No network/DB in CI (pure parsers + injected fetcher). No user-host connection; no SERP scraping; no report wiring.

## Dashboard
Per the established post-merge rhythm (PM sync → dashboard), the local `data.js` update (lastSession → Story 14, prepend to previousStories, advance upNext to 15/16) is applied AFTER merge, so the dashboard never shows Story 14 as done before it lands. Flagged in the PR report.
