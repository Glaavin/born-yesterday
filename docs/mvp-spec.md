# bornyesterday.tech — MVP Product Spec & Technical Brief

**Document:** `docs/mvp-spec.md`
**Audience:** the development agent (Claude Code) implementing the MVP
**Status:** scope-locked MVP. Departures require owner approval.
**Companions:** `docs/PRODUCT.md` (strategy source of truth), `docs/design-system.md` (visual system)
**Live placeholder:** https://bornyesterday.tech/

> Reconciliation note (this version): updated to align with PRODUCT.md v1.2 and the Sprint 1.2
> design system. The technical core (architecture, data model, signal collection, caching) is
> carried forward intact. Product-surface and framing sections were revised. All prior open items
> are now resolved (see §11); genuinely deferred items live in PRODUCT.md §16.

---

## 1. What we are building

**One thing:** a website where a user pastes a URL and gets a one-page Trust Report built from publicly available data about that domain.

That is the entire MVP. No accounts required to generate a report. No bulk access. No public API. No browser extension. No badges. **No LLM calls. No paid data sources.**

The product reports **what is publicly visible** about a domain. The findings do not draw conclusions, make accusations, or pass judgment — the user draws their own inference from the signals. This framing is both the legal posture and the substance of the brand.

### Brand and voice — *playful chrome, rigorous substance*

The voice is split by surface (see `design-system.md` §1):

- **Chrome** (mascot, hatch counter, input microcopy, empty/loading states): playful, witty — "the skeptical, helpful friend."
- **Substance** (report findings, methodology, the indicator, the disclaimer): factual, sourced, non-subjective. **Every claim links to a public source. If we can't link a source, we don't make the claim.**

- **Tagline (locked):** "Checking the receipts before you check out."

### Who it is for (priority order for MVP)

1. SMB owners and individual buyers evaluating a SaaS vendor or AI tool.
2. Tech journalists and researchers sanity-checking companies.
3. Curious consumers reacting to hyped AI ads.

Procurement / B2B buyers are a Year-2 audience (the B2B API). Do not build for them yet.

### What success looks like at launch

- A user can paste any URL and get a useful report in under 3 seconds (cold) or near-instantly (cached).
- Every signal is sourced, public, and verifiable.
- Operating cost stays within the budget in PRODUCT.md §13 (target well under $50/month at MVP traffic).
- Repeat visits, driven by the shareable report format and the recent-searches feed.

---

## 2. The Trust Report — what it contains

The report is one page, one URL: `bornyesterday.tech/r/<domain>`. Rendered server-side from cached data.

### Section A — Domain Identity & Age

| Signal | Source | Notes |
|---|---|---|
| Domain registration date | RDAP, fall back to WHOIS | Display in months/years and exact date |
| Registrar | RDAP / WHOIS | Display only; never editorialize |
| First-ever SSL certificate date | crt.sh certificate transparency logs | Often more honest than WHOIS for "real" age — surface prominently |
| DNS first-seen estimate | Derived from earliest cert + current DNS | |
| Current hosting provider | Reverse DNS / IP allocation lookup | |
| SPF record present | DNS TXT lookup | |
| DMARC record present | DNS TXT lookup at `_dmarc.<domain>` | |
| Current SSL cert issuer + validity | Direct TLS handshake | |

### Section B — Marketing History (the "AI Pivot" signal, no LLM)

| Signal | Source | Notes |
|---|---|---|
| Total Wayback snapshot count | Wayback CDX API | |
| First Wayback snapshot date | Wayback CDX API | |
| Most recent Wayback snapshot date | Wayback CDX API | |
| Date AI-related language first appeared on homepage | Regex scan against cached Wayback snapshots | See keyword list |
| Current homepage AI language status | Live fetch + regex | "Mentions AI now" / "Does not mention AI" |
| **Derived: AI Language Age vs. Domain Age** | Calculated | Headline "pivot" signal, e.g. "Domain age: 11 years. AI language first appeared: 8 months ago." |

**AI keyword list (locked).** Match against visible page text (strip HTML, lowercase, word-boundary / phrase aware). Store the matched phrase and the snapshot URL for citation. Compound/marketing terms preferred; bare `agent`/`agents` excluded; post-2023 vocabulary included.

> `AI`, `A.I.`, `artificial intelligence`, `AI-powered`, `AI-driven`, `AI-native`, `AI-first`, `powered by AI`, `AI agent`, `AI agents`, `agentic`, `autonomous agent`, `AI assistant`, `AI copilot`, `copilot`, `generative AI`, `GenAI`, `large language model`, `LLM`, `GPT`, `machine learning`, `neural network`, `foundation model`, `multimodal`, `RAG`, `retrieval-augmented`, `fine-tuned`, `vector search`, `intelligent automation`

### Section C — Reputation Signals (public, link-out only)

Principle: we count, we don't judge. Surface public mentions and link out.

| Signal | Source | Notes |
|---|---|---|
| Trustpilot presence | Scrape public Trustpilot search page | Rating + review count if present, link out |
| BBB presence | Scrape BBB search | Rating + link if present |
| PhishTank listing | PhishTank free feed | Binary: listed / not listed |
| URLhaus listing | URLhaus free API | Binary: listed / not listed |
| "[name] scam" / "[name] review" | Link-out to search; do not scrape SERPs | Links, not displayed counts |
| Reddit search link | Link-out to `reddit.com/search?q=<domain>` | |

### Section D — Ownership & Stack

| Signal | Source | Notes |
|---|---|---|
| Organization on SSL cert | TLS cert OU/O fields | Often reveals parent company |
| WHOIS registrant org (where not privacy-protected) | RDAP / WHOIS | |
| Tech stack fingerprint | Open-source Wappalyzer-style detection | "Powered by Vercel, uses Stripe, Intercom" — useful color |

### Section E — The Skepticism Indicator

A single categorical indicator, **not a score** (see PRODUCT.md §3, design-system.md §4). Deterministic, rule-based, **publishable rubric** — we show users exactly which signals contributed, with links.

**Output contract — four states (locked):**
- **Checks out** (green) — established, clean signals.
- **Some concerns** (amber) — worth a closer look; mixed or moderate flags, not damning.
- **Red flags found** (red) — material concerns.
- **Too new to tell** (blue) — insufficient public footprint to assess; literally born yesterday.

The indicator's visual expression is the **mascot** (wordless), with a worded pill on the report card stating the result in text so meaning never rests on color alone. The amber state carries the overall *moderate* verdict; this is distinct from the inline pink-flagged / cyan-positive highlights in the report body, which mark which specific data points are concerning or reassuring.

**Rubric — DRAFT, finalized in Sprint 1.7.** The point-based draft below is a starting input only. The required change from the prior version: it must resolve to the **four states above**. The old four *severity* bands (green/yellow/orange/red) are retired — yellow and orange collapse into a single **amber**, and **blue** is added as an orthogonal "can't assess." In particular:
- **blue ("too new to tell")** fires on *thin* signals — very young domain, few/no Wayback snapshots, no reputation presence, not listed anywhere. Insufficiency, not suspicion.
- **green ("checks out")** is established + clean.
- **amber ("some concerns")** is the middle — some flags present but not damning.
- **red ("red flags found")** fires on *material* concerns — PhishTank/URLhaus listing, the classic pivot (established domain + very recent AI-language onset), or accumulated skeptic-flags past a threshold.

Draft signals (weights TBD in 1.7): domain age bands; AI-language-age-vs-domain-age pivot; PhishTank/URLhaus listing; missing SPF/DMARC; WHOIS privacy on a young domain; long-lived first SSL cert (mitigating); strong Trustpilot presence (mitigating). Always show which signals contributed, with links. The indicator is a summary of facts, not a verdict.

### Section F — Disclaimer (every report, fixed copy)

Per design-system.md §2:

> A Born Yesterday report surfaces signals, not verdicts. A raised flag means something is worth a closer look — not proof of wrongdoing.

Followed by a **"Request a correction"** link (see §10), placed beside the disclaimer.

---

## 3. The dataset is the product

Every search persists. The cache is the moat.

### Caching rules

- A report is fresh for **7 days**.
- Fresh request → cached version served instantly, no collection runs.
- Stale or missing → regeneration. If a stale version exists, serve it immediately with a "refreshing…" indicator and update in place. If none exists, generate synchronously (~2–3s).
- A weekly background job refreshes domains viewed in the last 30 days.

### Signal history

Every regeneration **appends** to `signal_history` rather than overwriting. Over time this builds a longitudinal per-domain record — when a homepage first said "agentic," when a Trustpilot rating changed. This is the long-term proprietary asset. **Never discard history on refresh.**

---

## 4. Technical stack

Deliberately boring, deliberately cheap. Cloudflare-native so operating cost stays near zero. (Consistent with PRODUCT.md §14.)

| Layer | Choice | Why |
|---|---|---|
| Frontend | Astro, deployed to Cloudflare Pages; **vanilla HTML/CSS** for the design system | Server-rendered, near-zero JS, fast permalinks. Avoid Next.js |
| API / signal collection | Cloudflare Workers (TypeScript) | Edge, generous free tier |
| Database | Cloudflare D1 (SQLite) | Free tier, queryable from Workers |
| Object storage | Cloudflare R2 | Cached raw Wayback HTML to avoid re-hitting their API; no egress fees |
| Background jobs | Cloudflare Cron Triggers + Queues | Weekly refresh |
| Rate limiting | Cloudflare (see §7a) | 3 searches/day/session |
| Email | Cloudflare Email Routing → corrections@ | Corrections intake (watchlist email deferred) |
| Analytics | **Basic at launch** (Cloudflare Web Analytics — free, cookie-less); advanced funnel/insights in Sprint 1.8 | No Google Analytics — wrong vibe |
| Mascot animation | Rive (post-MVP); static SVG placeholder at MVP | See design-system.md §4 |

**Expected fixed monthly cost: $5–15. Ceiling at ~10K reports/mo: under $50.**

### External services used (all free)

| Service | Used for | Rate-limit notes |
|---|---|---|
| RDAP (registry-direct) | Registration data | Free, no auth. `rdap.org` redirector or query registries directly |
| WHOIS (fallback) | TLDs without RDAP | JS WHOIS library; some TLDs need direct socket queries |
| crt.sh | SSL cert history | `crt.sh/?q=<domain>&output=json`. Cache aggressively |
| Cloudflare DoH | DNS (SPF, DMARC, A) | Free, fast, no auth |
| Wayback CDX API | Snapshot enumeration | `web.archive.org/cdx/search/cdx`. ~1 req/sec, exponential backoff |
| Wayback raw fetch | HTML for regex scan | `web.archive.org/web/<ts>/<url>`. Same etiquette |
| PhishTank | Phishing list | Download free dump weekly, store in D1 |
| URLhaus | Malware/phish list | Free API `urlhaus-api.abuse.ch` |
| Trustpilot | Reputation | Scrape public search page, polite, cache 7 days |
| BBB | Reputation | Scrape public search page, polite, cache 7 days |

**Rule:** every external call is cached. Nothing hits the hot path twice for the same domain inside a 7-day window.

---

## 5. Data model

Minimum viable D1 schema. Migrate forward additively — never drop columns.

```sql
-- One row per domain we've ever processed
CREATE TABLE domains (
  domain TEXT PRIMARY KEY,                 -- normalized, lowercase, no scheme, no www
  first_seen_at INTEGER NOT NULL,
  last_refreshed_at INTEGER NOT NULL,
  search_count INTEGER NOT NULL DEFAULT 0
);

-- Current cached report per domain. Overwritten on refresh.
CREATE TABLE reports (
  domain TEXT PRIMARY KEY REFERENCES domains(domain),
  generated_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,             -- generated_at + 7 days
  report_json TEXT NOT NULL,
  skepticism_state TEXT NOT NULL,          -- 'green' | 'amber' | 'red' | 'blue' (4-state contract)
  schema_version INTEGER NOT NULL
);

-- Longitudinal record. Append-only. The proprietary moat.
CREATE TABLE signal_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  domain TEXT NOT NULL REFERENCES domains(domain),
  captured_at INTEGER NOT NULL,
  signal_type TEXT NOT NULL,
  value_text TEXT,
  value_num REAL
);
CREATE INDEX idx_signal_history_domain ON signal_history(domain, captured_at);
CREATE INDEX idx_signal_history_type ON signal_history(signal_type, captured_at);

-- Cached external responses
CREATE TABLE external_cache (
  cache_key TEXT PRIMARY KEY,
  fetched_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  payload TEXT NOT NULL
);

-- Per-session daily search limit (3/day). Cloudflare-enforced; this table backs it.
CREATE TABLE search_quota (
  session_key TEXT NOT NULL,               -- hashed session/IP identifier
  day TEXT NOT NULL,                       -- YYYY-MM-DD
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (session_key, day)
);

-- Watchlist (OPEN: not in PRODUCT.md; provision now, ship decision pending §11)
CREATE TABLE watchlist_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  domain TEXT NOT NULL REFERENCES domains(domain),
  created_at INTEGER NOT NULL,
  confirmed_at INTEGER,
  UNIQUE(email, domain)
);
```

> Change from prior version: `reports.skepticism_indicator INTEGER` is replaced by
> `reports.skepticism_state TEXT` to match the locked 4-state contract.

---

## 6. Request flow

```
GET /r/<domain>
  normalized = normalize(domain)             // lowercase, strip scheme/www, validate

  if invalid(normalized):
    render error page (mascot: error state), explain a valid domain
    return

  if over_daily_quota(session):              // 3/day limit
    render limit-reached page (mascot: limit-reached state)
    return

  domain_row = db.get_or_create_domain(normalized)
  db.increment_search_count(normalized)
  db.increment_session_quota(session)

  report = db.get_report(normalized)

  if report and report.expires_at > now():
    render(report); return

  if report and report.expires_at <= now():
    enqueue_regeneration(normalized)
    render(report, with "refreshing" banner); return

  fresh_report = generate_report(normalized) // first-ever request: synchronous
  db.save_report(fresh_report)
  db.append_signal_history(fresh_report)
  render(fresh_report)
```

### `generate_report` steps (parallel where possible)

1. RDAP / WHOIS lookup
2. crt.sh certificate history
3. DNS lookups (A, MX, TXT for SPF, TXT for DMARC)
4. TLS handshake for current cert
5. Wayback CDX snapshot list
6. Fetch 5–10 representative Wayback snapshots (first, last, evenly spaced), regex-scan for AI keywords; find earliest with AI language
7. Live homepage fetch + regex scan
8. PhishTank / URLhaus lookups
9. Trustpilot / BBB scrape (best-effort, non-blocking, timeout)
10. Compute skepticism state (→ green | amber | red | blue)
11. Assemble report JSON

All external calls wrapped in `external_cache` checks. Timeouts on every call (3s individual, 8s total). Partial reports OK — if a section times out, render the rest with "not available."

---

## 7. UI principles

The owner provides the UI via `design-system.md` and the mockups. These are guard rails.

- **Layout** is the three-column grid from design-system.md §7 — ad rail / max-width content / ad rail — collapsing to a single column below the mobile breakpoint.
- **Landing** (mockup 1): wordmark + mascot (`idle`), hero input with a real `<label>` + witty instructions, hatch counter, methodology card, two ad slots. Per design-system.md.
- **Report** (mockup 2): tab nav (My Report Results · Recent Searches · Search Again); report card with the worded indicator pill (4 states) + mascot in the matching result state, body with pink-flagged / cyan-positive highlight styles, footer actions (Search again · Copy · Download), and the Request-a-correction link; disclaimer; two ad slots. The shareable report is a **well-formatted rich-text object** that copies to the clipboard and downloads cleanly; richer forms (image/PDF) can evolve later.
- **Sources:** every signal row carries an inline "Source ↗" link to the actual public source.
- **Empty / unavailable signals** show "—" or "Not found" with a brief explanation — never hidden; absence is information.
- **No marketing language inside report findings.** Facts and counts only. (Wit stays in the chrome.)

### 7a. Rate limit

3 searches per day per session, **Cloudflare-enforced** (backed by `search_quota`). On exhaustion, render the limit-reached state (mascot: `limit-reached`). Richer visual treatment of remaining/used searches is deferred (design-system.md §11).

### 7b. Recent searches feed

An **anonymized** feed of recently generated reports — no user identities or details, ever. Serves as community proof and as discovery (seeding ideas for what to search). Reads recently-refreshed domains from the cache. Surfaced on the "Recent Searches" tab (design-system.md §6).

---

## 8. Ads (architecture now, served later)

The product is ad-supported, but **no ads run during development or at initial launch**. Per design-system.md §5:

- Build a single `<AdSlot size id />` component: labeled placeholder in dev, prod path gated by config/env.
- Two slots per page (one per rail), IAB **160×600**, fixed reserved dimensions (no layout shift), lazy-loaded, labeled "Advertisement."
- **Never:** interstitials, sticky/anchor, autoplay, pop-ups, or native ads disguised as content.
- Mobile: rails drop below the breakpoint; at most one in-content unit, or none, for MVP.

Ad-network choice (AdSense eligibility risk) is tracked in PRODUCT.md §8 / §16.

---

## 9. Out of scope for MVP

Refuse scope creep on these; surface to the owner if pressure builds:

- LLM-generated narrative or summaries; the AI Pivot Timeline *as an LLM feature* (the regex version in §2B stays)
- User accounts / passwords
- Public B2B API; bulk lookups
- Browser extension; embeddable badge; verified-profile / company-response feature
- Compare-two-domains view
- **Live ad serving** (architecture is in scope; serving is not)
- Image/PDF share-card export (the MVP shareable report is a rich-text object; richer forms evolve later)
- Crunchbase / LinkedIn / Harmonic integration; any paid data source
- SEO content marketing
- **Consumer paid tier** — dropped; the model is ad-supported + Year-2 B2B API only
- **Email watchlist** — a planned *post-MVP* retention feature (PRODUCT.md §10), not in the MVP build; the `watchlist_subscriptions` table is provisioned now but unused at MVP

For the full phase/sprint roadmap, defer to **PRODUCT.md §10**. This document defines the MVP build only; its definition-of-done is: all §2 signals working end-to-end, caching (§3) live, the 3-state indicator, report permalinks rendering server-side, the rate limit, the recent-searches feed, the design system, and the disclaimer on every report.

---

## 10. Corrections, legal & ethical posture

- **Facts only in findings.** Every claim links to a source. No opinions in report text.
- **Two correction channels** (design-system.md §3, PRODUCT.md §12):
  - "Report an issue" (global nav) → site bugs.
  - "Request a correction" (on each report, by the disclaimer) → content → **corrections@bornyesterday.tech**.
  - SLA: **72-hour public / 48-hour internal** for content corrections.
- **Robots.txt respect.** If a site's robots.txt forbids our agent, we still report public data from third parties (Wayback, crt.sh) but do not fetch the live site.
- **Polite identification.** User agent: `BornYesterdayBot/1.0 (+https://bornyesterday.tech/about-bot)`.
- **No PII.** Companies/domains only. WHOIS personal contact fields are never displayed, even when public.
- **Pre-launch legal review.** Budget a 30–60 min media-tech lawyer consult on the disclaimer + "signals not verdicts" framing before production launch (~$500). Flag to owner when feature-complete; the agent does not handle this.

---

## 11. Resolved decisions

All prior open questions for this document are settled:

1. **AI keyword list (§2B):** locked (see §2B).
2. **Skepticism rubric:** four-state output confirmed (green/amber/red/blue); exact weights finalized in Sprint 1.7.
3. **Consumer paid tier:** dropped.
4. **Email watchlist:** post-MVP retention feature (PRODUCT.md §10); out of the MVP build.
5. **Report download:** MVP shareable report is a rich-text object (copy + download); image/PDF forms deferred.
6. **Analytics:** basic at launch (Cloudflare Web Analytics); advanced in Sprint 1.8.
7. **Indicator visual:** the mascot flag-state (design-system.md §4).

Genuinely deferred items (timing, not indecision) live in **PRODUCT.md §16**: Sprint 1.7 weights, ad-network choice (apply to AdSense early), economics validation, and the AI Pivot Timeline mitigation pipeline.

---

## 12. Notes for the agent

- Source-of-truth order: PRODUCT.md (strategy) → this file (MVP build) → design-system.md (visual). If they conflict, surface it; don't silently resolve.
- No scope additions outside §9 without owner confirmation.
- Prefer working software over speculative architecture. Ship the report small and complete first.
- When in doubt, choose the cheaper, simpler, more cacheable option.
- **Every external call is cached. Every claim is sourced. No LLMs in the MVP.**
