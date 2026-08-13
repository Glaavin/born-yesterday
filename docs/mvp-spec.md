# bornyesterday.tech — MVP Product Spec & Technical Brief

**Document:** `docs/mvp-spec.md`
**Audience:** the development agent (Claude Code) implementing the MVP
**Status:** scope-locked MVP. Departures require owner approval.
**Companions:** `docs/PRODUCT.md` (strategy source of truth), `docs/design-system.md` (visual system)
**Live placeholder:** https://bornyesterday.tech/

> Reconciliation note (this version): updated to align with PRODUCT.md v1.3 and the shipped
> design system. The technical core (architecture, data model, signal collection, caching) is
> carried forward intact. Product-surface and framing sections were revised. All prior open items
> are now resolved (see §11); genuinely deferred items live in PRODUCT.md §16.
>
> Story 18.1 reconciliation (2026-08-12): §2E rewritten to the rule-based Story 18 model (the
> point-based draft is retired); §2C reputation moved to link-outs with neutral search terms;
> §2D tech-stack fingerprint reassigned to the Profile Section; analytics, the four-state naming,
> the corrections-SLA basis, the dropped B2B API, and sprint→epic references all corrected.

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

Procurement / B2B buyers are **out of scope** — the previously-planned Year-2 B2B API was **dropped** (see PRODUCT.md §6; per the legal summary §4 — owner-held, not in repo). Do not build for them.

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
| Trustpilot presence | Link-out to the public Trustpilot page | **Link only, not scraped.** Demoted from a scrape on ToS grounds (legal risk register L-14 — owner-held, not in repo). |
| BBB presence | Link-out to BBB search | **Link only, not scraped** (demoted earlier on accuracy grounds). |
| PhishTank listing | PhishTank free feed | Binary: listed / not listed |
| URLhaus listing | URLhaus free API | Binary: listed / not listed |
| Web reviews / complaints | Link-out to search; never scrape SERPs | **Neutral query terms only** ("reviews", "complaints"). Characterizing words ("scam", "fraud", "ripoff", "lawsuit", …) are **never** appended (legal risk register L-10 — owner-held, not in repo). |
| Reddit search link | Link-out to `reddit.com/search?q=<domain>` | |

> **Change from the prior version (do not lose the history):** Trustpilot was previously specced as a *scrape*, and the web-search link-out previously appended the word **"scam"** to every company. Both were wrong and are superseded — Trustpilot and BBB are now link-outs, and the search link-outs use neutral terms only (L-14, L-10). Of the reputation sources, only PhishTank/URLhaus (and the live homepage, §2B) are fetched.
>
> Implementation note: the **L-10** neutral-terms fix has shipped in `src/signals/reputation-links.ts`. The **L-14** Trustpilot demotion is decided here but **not yet in the code** — `src/signals/reputation.ts` still scrapes Trustpilot best-effort. That code demotion is a tracked follow-up (see `docs/ops-tasks.md`), not a change made by this docs pass.

### Section D — Ownership & Stack

| Signal | Source | Notes |
|---|---|---|
| Organization on SSL cert | TLS cert OU/O fields | Often reveals parent company |
| WHOIS registrant org (where not privacy-protected) | RDAP / WHOIS | |
| ~~Tech stack fingerprint~~ | *Reassigned — see note* | Moved out of the Trust Report proper into the Profile Section (non-scoring) |

> **Tech-stack fingerprint — reassigned, not dropped (Story 18).** It is **not** built into the Trust Report. It survives as scan **A5 ("Technology and services in use")** in the proposed **Profile Section** — a non-scoring block that **does not feed the Skepticism Indicator** (the Profile firewall; decision doc §4) — pending that epic. **Build constraint carried with it:** the fingerprint list must be **hand-rolled**. Wappalyzer's detection database moved to a proprietary licence in 2023 and **must not be vendored**; that constraint is precisely why this entry is kept rather than deleted — whoever builds it later needs to know not to reach for the obvious library.

### Section E — The Skepticism Indicator

A single categorical indicator, **not a score** (see PRODUCT.md §3, design-system.md §4). Deterministic, rule-based, **publishable rubric** — we show users exactly which signals contributed, with links.

**Output contract — four states (locked):**
- **Checks out** (green) — established, clean signals.
- **Some concerns** (amber) — worth a closer look; mixed or moderate flags, not damning.
- **Red flags found** (red) — material concerns.
- **Too new to tell** (blue) — insufficient public footprint to assess; literally born yesterday.

The indicator's visual expression is the **mascot** (wordless), with a worded pill on the report card stating the result in text so meaning never rests on color alone. The amber state carries the overall *moderate* verdict; this is distinct from the inline pink-flagged / cyan-positive highlights in the report body, which mark which specific data points are concerning or reassuring.

**Rubric — rule-based (Story 18).** The indicator is a **rule-based** model, *not* a numeric score: the verdict is a transparent function of a small set of enumerated, linked, sourced facts. This **supersedes the point-based draft that previously lived here** — that draft (green/yellow/orange/red severity bands with per-signal weights TBD) is **retired, and a future reader should not implement it.** The authority is [`docs/decisions/story-18-indicator-model.md`](decisions/story-18-indicator-model.md); the summary below is a pointer, not a substitute.

The four states are **three rule shapes plus a residual**, not a severity ladder:
- **Red — "Red flags found"** — **disjunctive** over a short enumerated list: any single material trigger fires it. Triggers: a threat-feed listing (PhishTank/URLhaus); the classic pivot (established domain + very recent AI-language onset); or **accumulation** — a count of findings across successfully-checked signals. Accumulation is a *peer* trigger, not a lesser one, because the count is itself one nameable, linkable fact.
- **Blue — "Too new to tell"** — a **conjunction of absences**: insufficient footprint to assess. Insufficiency, not suspicion.
- **Green — "Checks out"** — **conjunctive**, requires *positive* establishment evidence, never merely the absence of red flags.
- **Amber — "Some concerns"** — the **residual**: some findings, none individually damning; the default when no other state claims the domain.

**Precedence: Red → Blue → Green → Amber**, in that order, Amber as catch-all. Material concern survives establishment evidence (Red beats Green — a live listing is not laundered by age); a clean bill cannot be certified on a thin footprint (Blue before Green). On a domain that is both thin *and* mildly flagged, **Blue wins** — soft flags on a thin evidence base do not carry Amber's weight.

Two cross-cutting rules: **caveats are orthogonal to state** — a `kind: "caveat"` note (e.g. "threat feed unreachable at check time") qualifies but never changes the verdict; and a **degraded/unperformed signal blocks Green without forcing Amber** — an unperformed check is not a finding, so the domain falls through to Blue/Amber on the strength of everything else, with a caveat disclosing the gap.

**No thresholds here, no weights.** Every number — domain-age bands, the pivot window, archive-depth floors, the accumulation threshold *and its denominator* — is a **Story 19 calibration output**, deliberately not specified in this spec. No weights are specified because the model is not weighted. See the decision doc §5.

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

Deliberately boring, deliberately cheap. Next.js on Vercel with serverless Postgres; cost stays low at MVP traffic. (Consistent with PRODUCT.md §14.) Cloudflare's edge primitives (D1/Workers/R2) are **parked as a scale-time cost optimization**, not dismissed — revisit when traffic justifies it.

| Layer | Choice | Why |
|---|---|---|
| Frontend | Next.js 16 (App Router) + TypeScript on Vercel; **Tailwind v4** (`@theme` tokens) for the design system | Server components by default, minimal client JS, fast permalinks |
| API / signal collection | Next.js route handlers / server actions (Vercel Functions) | 8s generation budget fits Vercel function limits |
| Database | Vercel Postgres / Neon (serverless Postgres) | Serverless, generous free tier; access via Drizzle or direct SQL |
| Object storage | Vercel Blob (or none at MVP — small cached HTML can live in `external_cache`) | R2 remains an option at scale (no-egress) |
| Background jobs | Vercel Cron (weekly refresh); stale-refresh via `after()` / `waitUntil` | Dedicated queue (Upstash QStash) deferred |
| Rate limiting | DB-backed via `search_quota` (see §7a) | 3 searches/day/session; no extra service needed |
| Email | corrections@ inbound via Cloudflare Email Routing or a mailbox provider (DNS-level, host-independent) | Outbound (later, watchlist) via Resend |
| Analytics | **Not yet implemented — deferred.** No analytics package is installed. Basic privacy-friendly analytics (candidate: Vercel Web Analytics) is planned; advanced funnel/insights later. No Google Analytics — wrong vibe. | Deferred to a later analytics story |
| Mascot animation | Rive via `@rive-app/react-canvas` (post-MVP); static placeholder at MVP | See design-system.md §4 |

**Expected fixed monthly cost: ~$20/mo (Vercel Pro — required for a commercial/ad-supported site) + low usage; still far inside the $3K/mo budget. Cloudflare would trim this toward ~$0 at MVP scale (the parked option).**

### External services used (all free)

| Service | Used for | Rate-limit notes |
|---|---|---|
| RDAP (registry-direct) | Registration data | Free, no auth. `rdap.org` redirector or query registries directly |
| WHOIS (fallback) | TLDs without RDAP | JS WHOIS library; some TLDs need direct socket queries |
| crt.sh | SSL cert history | `crt.sh/?q=<domain>&output=json`. Cache aggressively |
| Cloudflare DoH | DNS (SPF, DMARC, A) | Free, fast, no auth |
| Wayback CDX API | Snapshot enumeration | `web.archive.org/cdx/search/cdx`. ~1 req/sec, exponential backoff |
| Wayback raw fetch | HTML for regex scan | `web.archive.org/web/<ts>/<url>`. Same etiquette |
| PhishTank | Phishing list | Download free dump weekly, store in Postgres |
| URLhaus | Malware/phish list | Free API `urlhaus-api.abuse.ch` |
| Trustpilot | Reputation | Scrape public search page, polite, cache 7 days |
| BBB | Reputation | Scrape public search page, polite, cache 7 days |

**Rule:** every external call is cached. Nothing hits the hot path twice for the same domain inside a 7-day window.

---

## 5. Data model

Minimum viable Postgres schema (Vercel Postgres / Neon). Migrate forward additively — never drop columns. Timestamps are unix epoch (`BIGINT`) to match the request-flow logic in §6.

```sql
-- One row per domain we've ever processed
CREATE TABLE domains (
  domain TEXT PRIMARY KEY,                 -- normalized, lowercase, no scheme, no www
  first_seen_at BIGINT NOT NULL,
  last_refreshed_at BIGINT NOT NULL,
  search_count INTEGER NOT NULL DEFAULT 0
);

-- Current cached report per domain. Overwritten on refresh.
CREATE TABLE reports (
  domain TEXT PRIMARY KEY REFERENCES domains(domain),
  generated_at BIGINT NOT NULL,
  expires_at BIGINT NOT NULL,              -- generated_at + 7 days
  report_json TEXT NOT NULL,               -- JSONB is fine too
  skepticism_state TEXT NOT NULL,          -- 'green' | 'amber' | 'red' | 'blue' (4-state contract)
  schema_version INTEGER NOT NULL
);

-- Longitudinal record. Append-only. The proprietary moat.
CREATE TABLE signal_history (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  domain TEXT NOT NULL REFERENCES domains(domain),
  captured_at BIGINT NOT NULL,
  signal_type TEXT NOT NULL,
  value_text TEXT,
  value_num DOUBLE PRECISION
);
CREATE INDEX idx_signal_history_domain ON signal_history(domain, captured_at);
CREATE INDEX idx_signal_history_type ON signal_history(signal_type, captured_at);

-- Cached external responses
CREATE TABLE external_cache (
  cache_key TEXT PRIMARY KEY,
  fetched_at BIGINT NOT NULL,
  expires_at BIGINT NOT NULL,
  payload TEXT NOT NULL
);

-- Per-session daily search limit (3/day). App/DB-enforced; this table backs it.
CREATE TABLE search_quota (
  session_key TEXT NOT NULL,               -- hashed session/IP identifier
  day TEXT NOT NULL,                       -- YYYY-MM-DD
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (session_key, day)
);

-- Watchlist (post-MVP retention feature, PRODUCT.md §10; provision now, unused at MVP)
CREATE TABLE watchlist_subscriptions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email TEXT NOT NULL,
  domain TEXT NOT NULL REFERENCES domains(domain),
  created_at BIGINT NOT NULL,
  confirmed_at BIGINT,
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

3 searches per day per session, **app/DB-enforced** (backed by `search_quota`, keyed on a hashed session/IP from the request). On exhaustion, render the limit-reached state (mascot: `limit-reached`). Richer visual treatment of remaining/used searches is deferred (design-system.md §11).

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
- Public B2B API; bulk lookups (the B2B API is **dropped**, not merely deferred)
- Browser extension; embeddable badge; verified-profile / company-response feature
- Compare-two-domains view
- **Live ad serving** (architecture is in scope; serving is not)
- Image/PDF share-card export (the MVP shareable report is a rich-text object; richer forms evolve later)
- Crunchbase / LinkedIn / Harmonic integration; any paid data source
- SEO content marketing
- **Consumer paid tier** — dropped. The revenue model is **ad-supported or tip-supported — currently open, leaning tip, decision pending** (see PRODUCT.md §6–§7). The previously-planned Year-2 B2B API is also **dropped**.
- **Email watchlist** — a planned *post-MVP* retention feature (PRODUCT.md §10), not in the MVP build; the `watchlist_subscriptions` table is provisioned now but unused at MVP

For the full epic roadmap, defer to **PRODUCT.md §10**. This document defines the MVP build only; its definition-of-done is: all §2 signals working end-to-end, caching (§3) live, the four-state indicator, report permalinks rendering server-side, the rate limit, the recent-searches feed, the design system, and the disclaimer on every report.

---

## 10. Corrections, legal & ethical posture

- **Facts only in findings.** Every claim links to a source. No opinions in report text.
- **Two correction channels** (design-system.md §3, PRODUCT.md §12):
  - "Report an issue" (global nav) → site bugs.
  - "Request a correction" (on each report, by the disclaimer) → content → **corrections@bornyesterday.tech**.
  - SLA: **[PENDING — basis changed; wording not yet available].** The prior flat "72-hour public / 48-hour internal" promise is **superseded**. The corrections SLA is now a **tiered, process-not-outcome** commitment; the exact wording lives in a **Lane 3 legal document that is not in the repo (owner-held)** and is **subject to Lane 4 licensed-attorney review**. Do not treat any specific number as current until that wording lands. *(Owner action — see the final report.)*
- **Robots.txt respect.** If a site's robots.txt forbids our agent, we still report public data from third parties (Wayback, crt.sh) but do not fetch the live site.
- **Polite identification.** User agent: `BornYesterdayBot/1.0 (+https://bornyesterday.tech/about-bot)`.
- **No PII.** Companies/domains only. WHOIS personal contact fields are never displayed, even when public.
- **Pre-launch legal review.** Budget a 30–60 min media-tech lawyer consult on the disclaimer + "signals not verdicts" framing before production launch (~$500). Flag to owner when feature-complete; the agent does not handle this.

---

## 11. Resolved decisions

All prior open questions for this document are settled:

1. **AI keyword list (§2B):** locked (see §2B).
2. **Skepticism rubric:** four-state output confirmed (green/amber/red/blue); model decided in Story 18 — **rule-based, not weighted** (see `docs/decisions/story-18-indicator-model.md`); thresholds calibrated in Story 19.
3. **Consumer paid tier:** dropped.
4. **Email watchlist:** post-MVP retention feature (PRODUCT.md §10); out of the MVP build.
5. **Report download:** MVP shareable report is a rich-text object (copy + download); image/PDF forms deferred.
6. **Analytics:** not yet implemented (no analytics package installed); basic privacy-friendly analytics (candidate: Vercel Web Analytics) deferred to a later story. No Google Analytics.
7. **Indicator visual:** the mascot flag-state (design-system.md §4).

Genuinely deferred items (timing, not indecision) live in **PRODUCT.md §16**: Story 19 indicator thresholds, ad-network choice (apply to AdSense early), economics validation, and — only if it is ever built — the *post-MVP, LLM-assisted* AI-pivot analysis and its mitigation pipeline (the deterministic, no-LLM AI-pivot signal in §2B has already shipped).

---

## 12. Notes for the agent

- Source-of-truth order: PRODUCT.md (strategy) → this file (MVP build) → design-system.md (visual). If they conflict, surface it; don't silently resolve.
- No scope additions outside §9 without owner confirmation.
- Prefer working software over speculative architecture. Ship the report small and complete first.
- When in doubt, choose the cheaper, simpler, more cacheable option.
- **Every external call is cached. Every claim is sourced. No LLMs in the MVP.**
