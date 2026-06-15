# Born Yesterday — Product Strategy

**Document:** `docs/PRODUCT.md`
**Version:** 1.2
**Status:** Source of truth for product & strategy
**Companions:** `docs/design-system.md` (visual system), `docs/mvp-spec.md` (build spec)

---

## 0. About this document

This version reconciles three inputs: the original PM-agent strategy brief, the decisions made through Phase 0 and Sprint 1.2, and the project's working memory. Where the original brief and current direction conflict, **current direction wins** and the change is noted inline.

> Reconciliation note: this draft was synthesized rather than edited from a held copy of v1.1. Reconcile against any v1.1 details not reflected here (notably the finalized AI-keyword list and exact sprint contents).

Key reframes since the original brief:
- "Skepticism **Score**" / "Born Yesterday **Score**" → **Skepticism Indicator** (categorical, *not* a score).
- LLM analysis *inside* the report → **no LLMs in the MVP**; LLM-dependent features deferred.
- "No editorial language, facts only" → **findings stay factual and sourced; editorial voice lives in the chrome** (see §2).
- Stack: → **Astro + Cloudflare Pages/Workers/D1**.

---

## 1. What the product is

Born Yesterday is a free, ad-supported tool that helps anyone evaluating a SaaS product, AI tool, or digital service judge whether the company behind it is credible. A user enters a URL; the product returns a **Trust Report** built entirely from public data and fixed, published rubrics, surfacing signals worth a closer look.

The brand name is a deliberate asset: the product is itself "born yesterday," and its most distinctive verdict is when a *target* is too new to assess.

---

## 2. Positioning & brand voice

**Playful about ourselves; rigorous about our findings.**

The product *is* credibility, so the voice is split by surface:
- **Chrome** (mascot, hatch counter, microcopy, empty/loading states): playful, witty, on-brand. This is "the skeptical, helpful friend."
- **Substance** (methodology, report findings, the indicator, the disclaimer): factual, sourced, non-subjective. Every signal links to the public source it came from.

This reconciles the original "facts only" legal principle with an editorial publication posture: the *findings* carry no subjective or editorial language; the *framing* does. Corrections, not disputes (see §12).

Brand motifs to preserve: the egg/hatching metaphor; "receipts" as evidence.

**Tagline (locked):** "Checking the receipts before you check out."

---

## 3. The Skepticism Indicator

The core output is the **Skepticism Indicator** — categorical, not a numeric score. Its visual expression is the **mascot** (an egg with flags), conveyed without words, with the report card's worded pill stating the result in text so meaning never rests on color alone.

MVP verdicts (four states — a green→amber→red severity ladder plus blue for "can't assess"):
- **Checks out** (green) — established, clean signals.
- **Some concerns** (amber) — worth a closer look; mixed or moderate flags, not damning.
- **Red flags found** (red) — material concerns.
- **Too new to tell** (blue) — insufficient public footprint to assess; the target is, literally, born yesterday.

Indicator *weights* (which signals push toward which verdict) are finalized in Sprint 1.7. The *visual expression* and state contract are fixed in `design-system.md`.

---

## 4. What a Trust Report contains

Reports are tiered by cost. The MVP report is deterministic and near-zero marginal cost; expensive signals are deferred to later, traffic-justified tiers.

| Signal | Tier | Source | Notes |
|---|---|---|---|
| Domain age | MVP | WHOIS (commodity / open-source) | Necessary but not sufficient on its own (see Risk 5) |
| Domain reputation basics | MVP | SSL validity, DMARC, DNS age | Deterministic, cheap |
| Ownership / investor "receipts" | Later | Public investor data; free alternatives preferred over paid APIs | Crunchbase/Harmonic/LinkedIn paid APIs are last resorts on cost grounds |
| **AI Pivot Timeline** | **Later (post-MVP)** | Wayback Machine CDX + LLM analysis | The most differentiated *and* most dangerous feature; ships only with the LLM-mitigation pipeline (Risk 4) |

Domain age alone is insufficient: a 45-day-old site may be a legitimate startup; a 10-year-old domain may be a repurposed parked scam. The MVP layers the cheap deterministic signals above; richer signals arrive by tier.

---

## 5. Target users

| Persona | Description | Pattern |
|---|---|---|
| Skeptical SaaS buyer | SMB owner evaluating vendors | Medium repeat, monthly eval cycles |
| Tech journalist / researcher | Covers the AI/SaaS space | High repeat, 20–50 reports/month |
| Curious consumer | Saw a hyped AI ad, wants a sanity check | Low repeat, high volume, thin monetization |
| Procurement / vendor-risk pro | Screens vendor shortlists | High repeat, low frequency — prime Year-2 B2B API target |

---

## 6. Locked strategic principles

- **No LLMs in the MVP.** Deterministic logic only; no real-time AI on the hot path. (This is also the primary mitigation for the inverted-economics risk — see §7–8.)
- **The cache/dataset is the moat.** No proprietary data asset exists at launch; the moat accrues as generated reports accumulate.
- **Free at point of use, ad-supported.** B2B API in Year 2.
- **Every substantive claim is sourced.** This is both the credibility moat and the legal posture.
- **Editorial "corrections," not "disputes."** Publication posture, not legal-defense posture.
- **Budget discipline is non-negotiable** (see §13). Every expensive operation is cached, batched, or deferred.

---

## 7. Economics & monetization

| Metric | Value |
|---|---|
| Ad RPM (blended) | $4.50 low / $7.00 base / $9.50 optimistic |
| Pages per session | ~1.8 |
| Ad revenue per visit (base) | ~$0.012 |
| Cost per *enriched* report (LLM + paid APIs) | $0.21–0.58 |
| Cost per *MVP* report (deterministic + cached) | ≈ near-zero marginal |
| B2B API target (Year 2) | $500–1,200 / month per customer |

The **inverted unit economics** are the critical risk: an enriched report costs 20–50 ad-visits to break even. The architecture answer is to keep the MVP deterministic (near-zero cost) and gate expensive enrichment behind traffic. Modest ad density (two IAB slots per page, per `design-system.md`) is the correct brand call but thins per-visit revenue, which raises the importance of cost control and the Year-2 API.

---

## 8. Known risks & mitigations

| # | Risk | Mitigation |
|---|---|---|
| 1 | API costs outpace ad revenue | Deterministic MVP (no LLM); aggressive caching; batch pre-generation; tiered enrichment gated by traffic |
| 2 | No proprietary data at launch | Speed + brand as the only launch moat; cache/archive becomes the moat over time; embeddable badge for network effects (later) |
| 3 | **Ad-network eligibility** | AdSense has historically rejected trust/review tools assessing named companies. **Submit to AdSense during the build, not after, to learn eligibility before launch.** Fallbacks: Mediavine/Ezoic/Carbon, direct sales to SaaS security/compliance vendors, or a "Trust Verified" badge program |
| 4 | LLM hallucination (AI Pivot Timeline) | Feature deferred; when it ships, every claim links to a verifiable Wayback URL, human review for top companies, confidence scoring with suppression of low-confidence claims, fact-based framing + disclaimers |
| 5 | Domain age insufficient alone | Layer cheap deterministic signals (SSL/DMARC/DNS) at MVP; richer signals by tier |

---

## 9. Cost-reduction architecture

- **Caching:** every generated report is cached and reserved for subsequent visitors (target 30–90 day freshness window). The cache is also the moat.
- **Batch pre-generation:** nightly job pre-generates reports for the most-searched companies, driving per-request cost toward zero for common queries.
- **Tiering:** free near-zero MVP report; expensive enrichment unlocked only when traffic/revenue justify it.
- **Free-data-first:** prefer open-source/free sources (open WHOIS libraries, public DNS/SSL/DMARC checks) over paid APIs; paid APIs are a deliberate, gated cost.
- **No hot-path LLM:** users always see a cached report or a "generating, check back" state — never a real-time LLM call on page load.
- **Rate limit:** 3 searches/day per session (Cloudflare-enforced) at MVP, protecting cost and abuse surface.

---

## 10. Roadmap & phasing

- **Phase 0 — complete.** Teaser site live; repo, branch protection, CI/deploy, DNS established; stack pivoted to Astro + Cloudflare.
- **Phase 1 — 8 sprints.** Notable sprints: **1.1** foundational data layer · **1.2** design system (current) · **1.7** Skepticism Indicator weights · **1.8** analytics (deferred). Sprint 1.2 is front-loaded so the branded visual system is settled before data work resumes.
- **Tiering across the phase:** launch deterministic (Tier 0) → enrich (AI Pivot Timeline, ownership signals) as traction allows → **Year 2: B2B API + premium** (batch access, change monitoring, white-label embed).
- **Retention (post-MVP, free):** an email-only watchlist (double opt-in, ~3 domains, no accounts) with a weekly "what changed" digest powered by `signal_history` diffs. Drives repeat ad-visits and monetizes the longitudinal moat without paid APIs. Provisioned in the data model now; ships after the MVP report is live.

---

## 11. Distribution & go-to-market

- First channel is **Twitter/X and LinkedIn, not SEO.**
- Launch by publishing Trust Reports on ~20 actively hyped AI companies and posting them publicly.
- **The shareable report format is the distribution mechanism** — share/copy actions are first-class.
- The **anonymized recent-searches feed** doubles as community proof and discovery, and feeds the cache-as-moat loop.

---

## 12. Corrections & feedback

Two channels, deliberately split:
- **"Report an issue"** (global nav) → site bugs / technical issues.
- **"Request a correction"** (on each report, beside the disclaimer) → content disputes → **corrections@bornyesterday.tech**.

SLA for content corrections: **72-hour public / 48-hour internal.** The editorial "corrections" voice and SLA apply to content, not bugs.

---

## 13. Constraints

- **Budget:** $15K–20K to launch + first 90 days; **≤ $3K/month** API + infra pre-revenue.
- **Team:** 1–2 engineers, 1 part-time designer; no dedicated DS/ML team.
- **Timeline:** MVP shippable in 60 days; first curated public reports (~20 companies) live and shareable by ~day 75.

---

## 14. Tech stack

- **Framework:** Astro + TypeScript; vanilla HTML/CSS for the design system.
- **Infra:** Cloudflare Pages / Workers / D1; Cloudflare Email Routing; Cloudflare-enforced rate limiting.
- **Registrar/DNS:** Porkbun → Cloudflare.
- **Repo:** private GitHub (`Glaavin`), gitflow-lite branch protection.
- **Legacy:** Vercel-hosted teaser (Phase 0).

---

## 15. Companion documents

- `docs/design-system.md` — voice, mascot/indicator state contract, ad architecture, layout, tokens, component inventory.
- `docs/mvp-spec.md` — the build specification.
- This file (`docs/PRODUCT.md`) — product & strategy source of truth.

---

## 16. Open questions (deliberately deferred)

- **Skepticism Indicator weights** — Sprint 1.7 (now mapping to four states).
- **Ad-network choice** — pending AdSense eligibility reality check (Risk 3); apply early.
- **Economics validation** — RPM and per-report cost figures are estimates inherited from the original brief; revisit with real traffic.
- **AI Pivot Timeline mitigation pipeline** — designed before that feature ships.
