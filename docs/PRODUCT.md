# Born Yesterday — Product Strategy

**Document:** `docs/PRODUCT.md`
**Version:** 1.3
**Status:** Source of truth for product & strategy
**Companions:** `docs/design-system.md` (visual system), `docs/mvp-spec.md` (build spec)

---

## 0. About this document

This version reconciles three inputs: the original PM-agent strategy brief, the decisions made through Phase 0 and the Hydrogen/Helium epics, and the project's working memory. Where the original brief and current direction conflict, **current direction wins** and the change is noted inline.

> **Changelog — v1.3 (2026-08-12, Story 18.1 reconciliation):** the previously-planned **Year-2 B2B API is dropped** (§5–§7, §10); revenue is documented as **ad- *or* tip-supported, open, leaning tip** (§6–§7). The **AI Pivot Timeline is corrected from "post-MVP, LLM-based" to shipped and deterministic** (regex, no LLM — §4), and **Risk 4** is rewritten accordingly (§8). Indicator-model questions now point at the **Story 18 decision doc** and thresholds at **Story 19** (§3, §16). Sprint-numbered roadmap converted to the **epic convention** (§10). Corrections **SLA** replaced with a pending placeholder (§12). Repo visibility corrected to **public, re-privatization tracked** (§14).

> Reconciliation note: this draft was synthesized rather than edited from a held copy of v1.1. Reconcile against any v1.1 details not reflected here. (The AI-keyword list is now locked and matches the code; see `mvp-spec.md` §2B.)

Key reframes since the original brief:
- "Skepticism **Score**" / "Born Yesterday **Score**" → **Skepticism Indicator** (categorical, *not* a score).
- LLM analysis *inside* the report → **no LLMs in the MVP**; LLM-dependent features deferred.
- "No editorial language, facts only" → **findings stay factual and sourced; editorial voice lives in the chrome** (see §2).
- Stack: → **Next.js 16 + Vercel** (Tailwind v4, serverless Postgres). Cloudflare/Astro appeared in earlier drafts without repo provenance and is parked as a scale-time option (§14).

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

How the indicator reaches its verdict is decided in **Story 18** — a **rule-based** model (not a numeric score): the verdict is a transparent function of a small set of enumerated, linked, sourced facts, with precedence Red → Blue → Green → Amber. See [`docs/decisions/story-18-indicator-model.md`](decisions/story-18-indicator-model.md). The *thresholds* (age bands, the pivot window, the accumulation trigger, etc.) are **Story 19** calibration outputs. The *visual expression* and state contract are fixed in `design-system.md`.

---

## 4. What a Trust Report contains

Reports are tiered by cost. The MVP report is deterministic and near-zero marginal cost; expensive signals are deferred to later, traffic-justified tiers.

| Signal | Tier | Source | Notes |
|---|---|---|---|
| Domain age | MVP | WHOIS (commodity / open-source) | Necessary but not sufficient on its own (see Risk 5) |
| Domain reputation basics | MVP | SSL validity, DMARC, DNS age | Deterministic, cheap |
| Ownership / investor "receipts" | Later | Public investor data; free alternatives preferred over paid APIs | Crunchbase/Harmonic/LinkedIn paid APIs are last resorts on cost grounds |
| **AI Pivot Timeline** | **Shipped (MVP)** | Wayback Machine CDX + **deterministic regex** against cached snapshots | Compares AI-language onset to domain age. **No LLM** on any path. |

> **Correction (do not lose the history):** prior versions of this table listed the AI Pivot Timeline as "Later (post-MVP)" built on "Wayback CDX + **LLM analysis**," shipping only with an LLM-mitigation pipeline. That was wrong about the architecture: the feature **shipped in Helium** and is **deterministic regex, no LLM** (see `mvp-spec.md` §2B). This matters because the LLM version the doc once described is the architecture the legal research identifies as the primary risk vector in current AI-defamation cases — the product deliberately did **not** build it. A separate, still-hypothetical *LLM-assisted* analysis would be a distinct post-MVP feature and would carry that risk; it is not what shipped.

Domain age alone is insufficient: a 45-day-old site may be a legitimate startup; a 10-year-old domain may be a repurposed parked scam. The MVP layers the cheap deterministic signals above; richer signals arrive by tier.

---

## 5. Target users

| Persona | Description | Pattern |
|---|---|---|
| Skeptical SaaS buyer | SMB owner evaluating vendors | Medium repeat, monthly eval cycles |
| Tech journalist / researcher | Covers the AI/SaaS space | High repeat, 20–50 reports/month |
| Curious consumer | Saw a hyped AI ad, wants a sanity check | Low repeat, high volume, thin monetization |
| Procurement / vendor-risk pro | Screens vendor shortlists | High repeat, low frequency — **out of scope** (the Year-2 B2B API that once targeted them was dropped; see §6) |

---

## 6. Locked strategic principles

- **No LLMs in the MVP.** Deterministic logic only; no real-time AI on the hot path. (This is also the primary mitigation for the inverted-economics risk — see §7–8.)
- **The cache/dataset is the moat.** No proprietary data asset exists at launch; the moat accrues as generated reports accumulate.
- **Free at point of use.** Revenue is **ad-supported *or* tip-supported — the choice is open, currently leaning tip, decision pending.** The lean toward tips is on editorial-independence grounds: an ad network's content policy is often stricter than defamation law and would be the thing most likely to dull the product's voice. This is **not settled**; do not write it as decided.
- **No B2B API.** The previously-planned Year-2 B2B API is **dropped** (per the legal summary §4 — owner-held, not in repo). It was never the owner's plan, and dropping it also cleans the "commercial purpose" posture. Explicitly out of scope, not deferred.
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

> The B2B API revenue line that previously sat here (~$500–1,200/mo per customer) is **removed — the B2B API is dropped** (§6).

Revenue at launch is **ad- or tip-supported (open, leaning tip — §6)**. The **inverted unit economics** are the critical risk *for the enriched tiers*: an enriched report costs 20–50 ad-visits to break even. The architecture answer is to keep the MVP deterministic (near-zero cost) and gate expensive enrichment behind traffic. Modest ad density (two IAB slots per page, per `design-system.md`) is the correct brand call but thins per-visit revenue, which raises the importance of cost control. With the B2B API dropped, the Year-1 economics rest on the free/ad-or-tip model plus disciplined cost control, not on a licensing line.

---

## 8. Known risks & mitigations

| # | Risk | Mitigation |
|---|---|---|
| 1 | API costs outpace ad revenue | Deterministic MVP (no LLM); aggressive caching; batch pre-generation; tiered enrichment gated by traffic |
| 2 | No proprietary data at launch | Speed + brand as the only launch moat; cache/archive becomes the moat over time; embeddable badge for network effects (later) |
| 3 | **Ad-network eligibility** | AdSense has historically rejected trust/review tools assessing named companies. **Submit to AdSense during the build, not after, to learn eligibility before launch.** Fallbacks: Mediavine/Ezoic/Carbon, direct sales to SaaS security/compliance vendors, or a "Trust Verified" badge program |
| 4 | ~~LLM hallucination~~ → **regex false positives** (AI Pivot Timeline) | The LLM-hallucination risk is **largely mitigated by architecture**: the AI-pivot signal shipped **deterministic (regex, no LLM)** — there is no model to hallucinate. **Residual risk is regex false positives** (mis-dating AI-language onset, or matching incidental text). Mitigation: every AI-pivot date links to the exact cited Wayback capture, and the launch batch (~20 companies) gets **manual verification** of those dates against the cited URLs before publication. *(A future, still-hypothetical LLM-assisted analysis would reintroduce hallucination risk and its own mitigation pipeline — it is not what shipped.)* |
| 5 | Domain age insufficient alone | Layer cheap deterministic signals (SSL/DMARC/DNS) at MVP; richer signals by tier |

---

## 9. Cost-reduction architecture

- **Caching:** every generated report is cached and reserved for subsequent visitors (target 30–90 day freshness window). The cache is also the moat.
- **Batch pre-generation:** nightly job pre-generates reports for the most-searched companies, driving per-request cost toward zero for common queries.
- **Tiering:** free near-zero MVP report; expensive enrichment unlocked only when traffic/revenue justify it.
- **Free-data-first:** prefer open-source/free sources (open WHOIS libraries, public DNS/SSL/DMARC checks) over paid APIs; paid APIs are a deliberate, gated cost.
- **No hot-path LLM:** users always see a cached report or a "generating, check back" state — never a real-time LLM call on page load.
- **Rate limit:** 3 searches/day per session (app/DB-backed) at MVP, protecting cost and abuse surface.

---

## 10. Roadmap & phasing

Work is tracked as **epics named after the periodic table**, with a single continuous story counter that never resets. Epics are **milestone-based and variable length, not time-boxed** (see `docs/conventions.md`). *(This replaces the earlier "Phase 1 — 8 sprints" scheme; "Sprint 1.7 / 1.8" references throughout the docs are superseded by story numbers.)*

- **Phase 0 — complete.** Teaser site live; repo, branch protection, CI/deploy, DNS established; stack settled on **Next.js 16 + Vercel** (Cloudflare/Astro never shipped — see §14).
- **Hydrogen (Stories 1–7, incl. 6.1) — complete.** The branded visual foundation: design system, layout shell, landing + report views.
- **Helium (Stories 8–17, incl. decimals) — complete.** The data layer end-to-end: schema + migrations, the fetch/SSRF harness, the six collectors, the assembly engine + draft indicator, and the serve path (freshness, quota, append-only `signal_history`, recent feed).
- **Lithium (Stories 18, 18.1, 19, 20, 20b) — current.** Indicator model decision (18 — decided, **rule-based**), this documentation reconciliation (18.1), indicator threshold **calibration** (19), the **methodology page** (20), and **threat-feed keys / Green tightening** (20b).
- **Onward:** enrichment (the AI-pivot signal already shipped; ownership signals next) as traction allows, the **Profile Section** epic, and launch pre-flight. **No B2B API** (dropped — §6).
- **Retention (post-MVP, free):** an email-only watchlist (double opt-in, ~3 domains, no accounts) with a weekly "what changed" digest powered by `signal_history` diffs. Drives repeat visits and monetizes the longitudinal moat without paid APIs. Provisioned in the data model now; ships after the MVP report is live.

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

SLA for content corrections: **[PENDING — basis changed; wording not yet available].** The prior flat "72-hour public / 48-hour internal" promise is **superseded**. The corrections SLA is now a **tiered, process-not-outcome** commitment; the exact wording lives in a **Lane 3 legal document that is not in the repo (owner-held)** and is **subject to Lane 4 licensed-attorney review**. Do not treat any specific number as current until that wording lands. The editorial "corrections" voice applies to content, not bugs. *(Owner action — see the Story 18.1 final report.)*

---

## 13. Constraints

- **Budget:** $15K–20K to launch + first 90 days; **≤ $3K/month** API + infra pre-revenue.
- **Team:** 1–2 engineers, 1 part-time designer; no dedicated DS/ML team.
- **Timeline:** MVP shippable in 60 days; first curated public reports (~20 companies) live and shareable by ~day 75.

---

## 14. Tech stack

- **Framework:** Next.js 16 (App Router) + TypeScript on Vercel; Tailwind v4 (`@theme` tokens) for the design system.
- **Data:** Vercel Postgres / Neon (serverless Postgres); Vercel Cron for background refresh; rate limiting app/DB-backed via `search_quota`.
- **Email:** corrections@ inbound via Cloudflare Email Routing or a mailbox provider (DNS-level, host-independent).
- **Registrar/DNS:** Porkbun → Vercel.
- **Repo:** GitHub (`Glaavin`), gitflow-lite branch protection; pnpm. **Currently public** to support the agent-driven workflow; **re-privatization before launch is tracked (issue #5).** (Not "private" today.)
- **Parked (scale-time option):** Cloudflare Pages/Workers/D1/R2 — cheaper edge primitives worth revisiting when traffic justifies a migration. Deferring to the existing Vercel repo now does not blow the MVP economics (per-report cost is dominated by free external APIs, not hosting); Cloudflare would trim the ~$20/mo Vercel-Pro floor toward ~$0 at scale.

---

## 15. Companion documents

- `docs/design-system.md` — voice, mascot/indicator state contract, ad architecture, layout, tokens, component inventory.
- `docs/mvp-spec.md` — the build specification.
- This file (`docs/PRODUCT.md`) — product & strategy source of truth.

---

## 16. Open questions (deliberately deferred)

- **Skepticism Indicator — model decided, thresholds open.** The *model* is settled (Story 18 — rule-based; [`docs/decisions/story-18-indicator-model.md`](decisions/story-18-indicator-model.md)). The *thresholds* (age bands, pivot window, accumulation trigger + its denominator, Green's establishment conditions) are **Story 19** calibration outputs.
- **Revenue model (ad- vs tip-supported)** — open, **leaning tip** on editorial-independence grounds (§6). Decision pending.
- **Ad-network choice** — pending AdSense eligibility reality check (Risk 3); apply early. (Moot if the revenue model lands tip-only.)
- **Economics validation** — RPM and per-report cost figures are estimates inherited from the original brief; revisit with real traffic.
- **AI-pivot mitigation** — the shipped signal is deterministic (no LLM); its residual risk (regex false positives) is handled in Risk 4. A dedicated LLM-mitigation *pipeline* is needed only **if** a future LLM-assisted analysis is ever built.
