# Source & Method Roadmap — pre-methodology-statement

**From:** Claude Code (session of 2026-09-02)
**Date:** 2026-09-02
**Audience:** Claude Chat, for reworking story plans and writing new stories. Also the durable record of the owner's 2026-09-02 rulings.
**Inputs:** the Methodology of Record artifact · the PM reconfiguration proposal (2026-09-01) · *Sources Under Test* (live-verified review, 2026-09-01) · the owner's feedback memo ("BY Methodology Input from Mike," 2026-09-02).
**Scope:** sources and scoring mechanisms only. Product and goals unchanged. **No LLM on the hot path — unchanged and restated below where the owner's asks brush against it.**
**Status of every claim:** sources marked **VERIFIED** were called live from this machine on 2026-09-01/02; everything else says so.
**Rulings status:** COMPLETE — all four rulings this document requested were made by the owner on 2026-09-02 (§10). Nothing here is waiting on a decision; this version is final for story planning.

---

## The summary in plain terms

We checked our data sources against the real internet, and the owner has reviewed everything and made calls. Here is what is changing, in one breath:

The site will stop depending on one slow archive for its most important judgment — we are adding a second, independent archive (Common Crawl) so a bad day at archive.org no longer wrecks reports. We are talking to domain registries directly instead of through a middleman. The certificate-history source that has been down for months is being retired honestly instead of waited on; certificates become supporting facts, not evidence of age. The threat-list section gets bigger and more visual — three or four trusted watchdogs shown together, because "clean everywhere" or "flagged everywhere" is more persuasive than one line. Trustpilot is out; a manipulation-resistant popularity ranking (Tranco) and, later, government data (lawsuits, complaints, SEC filings) come in. The "AI pivot" will never by itself paint a company red — red is reserved for objective external evidence like a phishing listing; everything else becomes rich, sourced context for the amber and blue states. And before any of it is scoped, one ten-minute test from the production servers decides how urgent the archive problem really is.

A handful of the owner's asks hit licensing or feasibility walls (VirusTotal's free tier, Reddit content display, "fake AI" detection); those are resolved below rather than quietly dropped — and every follow-up ruling this document requested has since been made, so nothing in it is waiting on a decision.

---

## 1. Owner rulings recorded (2026-09-02)

1. **Concurrence:** the owner concurs with all observations in *Sources Under Test* and approves the Five Moves.
2. **Move 02 ("pre-warm the top 500") → backlog.** Not near-future. Everything else in the Five Moves is to be acted on in the near future: coverage meter (Move 01), continuity framing (Move 03), timeline artifact (Move 04), two-source rule (Move 05).
3. **Corrections and fixes are noted and HELD** (see §8) — nothing in that register is to be built right now.
4. **The pivot doctrine** (see §4): evidence of a pivot never triggers Red on its own. Red is conservative and near-objective; amber/blue get generous, nuanced context; green is treated as a hand-off to the Business Profile.
5. **Second-round rulings (2026-09-02, closing this document's §10):** the **Reincarnation Check is APPROVED** (the owner concurs it is distinct from the declined E2 clamp; ships with W2) · **accumulation-Red is RETAINED, not retired** — its calculation will be redefined once the updated sources are connected and tested for what can be harnessed and validated · **Reddit moves to the post-MVP plan but is kept** · **W8 (the dev source panel) is near-future** and part of the roadmap Chat should story-plan from.

---

## 2. Conflicts between the owner's memo and the verified findings — resolved or routed

Each item: what the memo asked → what the evidence says → the resolution.

### C1. "Support registry data with crt.sh search" — RESOLVED (source is dead; the instinct survives in another form)
crt.sh has been down for the entire build (5xx → 403 → **502, re-verified 2026-09-01**), and its would-be replacement (SSLMate) structurally cannot provide history — the oldest certificate it returns for 31-year-old stripe.com is **three months old** (VERIFIED). So certificates cannot corroborate registration age today. **But the cross-validation instinct is right, and it already has a working form:** compare registration date against **archive history** instead. `secondlibrary.com` is registered 2023-10-29 with archived pages from 2014 — the mismatch *is* the recycled-domain detector ("the Reincarnation Check," §5-W2). If crt.sh ever returns reliably, first-cert can come back as opportunistic enrichment; nothing should depend on it.

### C2. VirusTotal — CONFLICT with licensing; NOT RECOMMENDED
The free/public VirusTotal API is licensed for **non-commercial use**; an ad-supported product is commercial. This is the same L-15 posture problem the project already takes seriously. Rather than lean on it, W3 builds the multi-watchdog display from sources with clean or clarified licenses: **Google Web Risk** (explicitly commercial, free to 100K lookups/mo — still unverified by us, needs a GCP project), URLhaus + PhishTank (keys pending — existing ops task), **OpenPhish** community feed (reachable behind a redirect; verify contents at build), **ThreatFox** (VERIFIED live but now requires a free abuse.ch auth key — same key family as URLhaus). Three to four watchdogs is achievable without VirusTotal.

### C3. Reddit content displayed in reports — ROUTED TO A RULING (the owner's own caution was correct)
The memo asks whether a styled Reddit callout would "cause legal issues or infer too much of a connection." The answer: **link-outs are safe today and stay.** Displaying fetched Reddit *content* runs through Reddit's Data API terms, which permit free access for **non-commercial** use and require approval for commercial use — the same wall as C2, and the same class of problem as the retired Trustpilot scrape (L-14). Attribution/trademark presentation is solvable (a clearly-labelled quotation with a link is standard practice); the **API license is the gate, not the styling.** → Add to the legal register as an L-item: "Reddit commercial API approval — required before any in-report Reddit content." **Ruled 2026-09-02: post-MVP, kept** — link-out through MVP; the L-item gates the post-MVP build.

### C4. Pivot policy vs the PM proposal's R6 — GENUINE DISAGREEMENT; the owner's ruling supersedes
The PM proposal's R6 re-enables a *substantiated* pivot as a **concern** — and concerns can accumulate into Red. The owner rules that a pivot is **never a Red trigger**, only an event of note that enriches amber/blue. These are incompatible; **the owner's version is adopted** (§4). It is also the more defensible position: it extends the reasoning that demoted the pivot in the first place (B3) and matches the product's legal posture (facts, not verdicts). R6 is dead as written; the substantiation *work* (continuity + operator signals) survives because it makes the *observation* more truthful, not because it re-arms a trigger.

### C5. "Detect fake AI" via Wappalyzer — PARTIALLY FEASIBLE; the second half is ruled out
Feasible, deterministically: detecting **known vendor artifacts** — chatbot widgets, AI-vendor SDKs/domains in page source — via open technology-fingerprint databases, published as facts ("a third-party chatbot product appeared on this site; first seen [date]"). Not feasible without crossing the load-bearing wall: judging whether a thing *labelled* AI is *really* AI. That is a semantic judgment requiring either runtime inspection (fragile, intrusive) or an LLM (prohibited on the hot path). The deterministic approximation that exists: the planned **vocabulary-class split** (marketing-AI terms vs technical-AI terms) says "the claims are marketing-flavored" without asserting fraud. W7 scopes the feasible half only. (Note: Wappalyzer's own API/fingerprints went commercial; W7 uses the open forks and names the licensing check.)

### C6. Qualys SSL Labs / Mozilla Observatory — ANSWERED: marginal, and mechanically wrong for the hot path
They grade TLS/security-header *configuration* — a hygiene signal, like SPF. Directionally useful, but: an SSL Labs assessment takes **minutes** per domain, which can never live inside an 8-second report. If ever added, they are async enrichment on cached reports only. Verdict: **defer both, post-MVP**; they don't materially improve the core question ("is this business what it claims to be") relative to their cost.

### C7. SecurityTrails — ANSWERED: no
$500/mo, far outside budget; the free tier is too small to build on. The one thing paid money genuinely buys in this space is **WHOIS/DNS history** (ownership-change evidence). If that ever matters enough to fund, price-check mid-market vendors first — but W2's Reincarnation Check covers the highest-value case for free.

### Clarification (not a conflict): "our RDAP connection has been failing?"
Mostly no. The systematic failures were **crt.sh** (different category, months of downtime) and certain TLDs (`.edu`, several ccTLDs) that **publish no creation date over RDAP at all** — which no source swap fixes; the port-43 WHOIS fallback and honest "no date available" handling cover it. The `rdap.org` middleman itself flaked once in seven verified calls and is ~4× slower than going to the registry directly — reason enough to switch (W2), but it was not the crisis.

---

## 3. What the owner asked that needed research — answered

**"What is our best leveraging of Whois, or should we use it at all?"** Keep exactly what exists: port-43 WHOIS as the free *fallback* for TLDs where RDAP is silent. Do not buy WHOIS data for MVP (see C7). The registry path improvement is W2 (direct RDAP via IANA bootstrap), not more WHOIS.

**"Are cert inconsistencies a red flag or common happenstance?"** Overwhelmingly happenstance. Modern certificates rotate every 90 days–1 year; issuer changes, SAN churn, and CDN-driven reissuance are routine for healthy companies. The rare cert facts that ARE signals: a **self-signed or expired certificate on a commerce site** (negative, meaningful), a **certificate/domain mismatch** (negative), and the **organization field on an OV/EV cert matching the claimed company** (positive identity corroboration — "the certificate is issued to Stripe, Inc."). W4 keeps the category as *corroboration and identity facts*, never age evidence.

**"Tranco, in simple terms."** A daily, free ranking of the ~1M most-visited domains, built by university researchers who **average several commercial traffic lists over 30 days** specifically so it can't be gamed by a burst of fake traffic. If a domain ranks on Tranco, real people demonstrably visit it, and have for a while. It's the closest thing to a manipulation-resistant "the web actually uses this" number, and it's built for research use. **VERIFIED live:** daily list `K9QPW` (2026-09-01) with a stable download API.

**"Other free/open sources for reviews, lawsuits, validated gluts?"** The best answers are government data — objective, free, and legally clean to republish:
- **CourtListener / RECAP (Free Law Project)** — federal court records incl. class actions. **VERIFIED live** (285,827 hits for "class action"), free API — but **~15s response**, so async/Profile-section only, never the hot path.
- **SEC EDGAR full-text search** — public filings; 8-Ks disclose material lawsuits. **VERIFIED live, fast (0.2–2.4s), free, no key** (requires a declared User-Agent).
- **CFPB Consumer Complaint Database** — complaint counts by company, public API. My exact query 404'd (endpoint shape needs one follow-up) but the API framework responds. Scope caveat: **financial companies only** — strong for fintech SaaS, silent elsewhere.
- **FTC enforcement actions** — press-release/actions feeds; worth a scoping look in the same story.

**The honest hazard on all four:** they index by **company name, not domain.** Entity matching (Stripe-the-company ↔ stripe.com) is the hard part, and a wrong match here is the BBB-misattribution defect with lawsuits attached. W6 mandates exact-match conservatism: publish only on high-confidence name↔domain agreement, silence otherwise. "An overwhelming glut of reviews" detection is deferred — no free source provides validated review volumes without licensing walls.

---

## 4. The governing doctrine (formalize in the rubric, then in the methodology statement)

The owner's memo articulates the clearest scoring philosophy the project has had. Story planning should treat these as the axioms:

1. **RED is us saying "do not use this business." Therefore Red triggers only on near-objective external evidence** — today: a listing on a recognized threat feed. Nothing inferential (pivot, hygiene, age) reaches Red alone.
2. **GREEN is an endorsement and a hand-off.** A green reader stops scrutinizing and moves to the Business Profile — so Green must stay conservative, multi-source (the two-source rule, Move 05), and require its checks to have actually run (Story 20b directionally).
3. **AMBER and BLUE are where the product lives.** Be generous with sourced, nuanced context there — that is the "cross-referenced, organized context for people making their own choices."
4. **Accumulation-Red is RETAINED, not retired (ruled 2026-09-02).** The route stays, and its calculation is deliberately deferred: it will be **redefined after the updated sources (W1–W6) are connected and tested**, so its inputs are limited to what we can actually harness and validate. Until that redefinition, the existing guard stands (a test fails if anyone grows the concern pool casually), the constants are not retuned, and the methodology page must keep stating plainly that the route currently cannot fire (open-items B4).

---

## 5. Workstreams — story-ready

> Sequencing gate for everything archive-related: **W0 first.**

### W0 · The ten-minute test that reorders everything
From a deployed Vercel function, call the Wayback CDX (`limit=1`) and the Availability API. **From the audit machine, archive.org returns `429` in ~0.24s to every call — refusal, not slowness.** If production egress is also 429'd, redundancy (W1) is an emergency; if production is clean, W1 is still right but calmer. One story-point; do before scoping W1.

### W1 · Archive redundancy & performance (Green's single point of failure — B11)
- **Common Crawl as the second establishment instrument.** Same pywb CDX API shape we already parse; `https://index.commoncrawl.org/CC-MAIN-<crawl>-index?url=<domain>`. **VERIFIED:** answered 200 in 0.4–6.6s *while archive.org was refusing*. Green establishment becomes *Wayback span OR CC earliest presence* — **with the measured asymmetry stated in the rubric basis:** CC covers live, linked sites (verified present: suckless.org, kexp.org, masshist.org) and lacks parked/dead ones (verified absent: secondlibrary.com, all four crawls tested) — the OR-branch is weakest where scrutiny is highest, and CC-absence is itself weak evidence of non-operation.
- **Continuity mechanism** (owner: "explore first, re-evaluate after"): presence in N of last M monthly crawls — **off the hot path** (one query per crawl at up to 6.6s each; must run async against cached reports). This powers the continuity framing (Move 03: "continuously present on the live web since X").
- **Wayback fast-path** (`limit=1`, `fastLatest=true&limit=-1`) — adopted as **hygiene, not the fix** (it reduces how often we provoke the limiter; it does not help when refused). Plus per-source response caching with long TTLs.
- **archive.today** — opportunistic third archive only: no official API, aggressive anti-bot; treat as best-effort enrichment, never load-bearing.

### W2 · Registry path (identity & age)
- **Drop the `rdap.org` middleman**: resolve the authoritative registry via the IANA bootstrap file (`https://data.iana.org/rdap/dns.json`, cacheable for days) and query directly. VERIFIED ~4× faster (0.074s vs 0.29s); one less dependency. Keep port-43 WHOIS fallback as-is.
- **Publish `transfer` events as neutral dated facts** (VERIFIED occurring: eff.org 2010-08-19). Drop the `reregistration`/`reinstantiation` idea — **0 of 7 domains carry them, including the canonical recycled case.**
- **The Reincarnation Check — APPROVED (ruled 2026-09-02):** when archive history predates the registration date by a material margin, publish the dated pair as a neutral observation ("Registered 2023 · archived pages exist from 2014") and feed pivot substantiation. This is NOT the declined registration-date clamp — it publishes a fact rather than suppressing Green — and the owner has ruled the distinction holds. **Ships as part of W2.** Registration data itself stays in the report per the owner: reevaluate weight, never remove.

### W3 · Threat category expansion (the owner's compounding-watchdogs ask)
- Roster: **Google Web Risk** (free 100K/mo, commercial license — the one still-unverified source; needs a GCP project) · **URLhaus + PhishTank** (set the pending keys — existing ops task) · **OpenPhish** community feed (verify contents behind the redirect at build) · **ThreatFox** (VERIFIED; needs the free abuse.ch auth key — bundle with the URLhaus key task).
- **UX story:** the multi-watchdog panel — each watchdog named with its dated result, clean-or-listed, so agreement compounds visually ("checked against 4 watchdogs: no listings" / "listed on 2 of 4"). Feeds the neutral channel and the coverage meter (Move 01). Copy rule: state *our* conclusion with a date; never republish a feed's verbatim response (Web Risk terms).
- Unblocks Story 20b (Green requires ≥1 successful threat check) even before the abuse.ch keys land.
- **Excluded:** VirusTotal (C2), Spamhaus DBL (license unclear — unchanged), any score/verdict vendor (L-16).

### W4 · Certificates, right-sized
- Switch history queries to **SSLMate Cert Spotter** (VERIFIED: free 100/hr, no key) for **current-cert facts only**: issuer, validity window, and the **subject organization as an identity corroboration** when present.
- **Retire first-cert age** from establishment (evidence-backed; see C1). Keep the live-handshake path (already SSRF-pinned).
- Negative cert signals worth encoding as facts: expired/self-signed on a live commerce site; hostname mismatch. Routine churn is explicitly NOT a signal (see §3).
- SSL Labs / Observatory: deferred, post-MVP, async-only if ever (C6).

### W5 · DNS depth
- **Second resolver cross-check** (owner concurs): Google DoH `https://dns.google/resolve` as fallback/validator alongside Cloudflare.
- **Extended email & trust records — adopt (free, small):** MTA-STS, TLS-RPT, DNSSEC, and especially **BIMI** — a BIMI record requires a paid Verified Mark Certificate (four figures/year), so its presence is money-where-mouth-is establishment corroboration. All published as neutral hygiene facts; none block or grant a verdict alone.
- SecurityTrails: no (C7).

### W6 · Reputation, rebuilt
- **Retire the Trustpilot scrape** (L-14; code change already owed). Link-outs remain.
- **Tranco in** (VERIFIED): daily list ingested like the PhishTank-dump pattern (download → local table → O(1) lookup). Publish rank/presence as a neutral fact with the plain-terms explanation from §3. Absence is *not* adverse — small legitimate businesses live below the top 1M; absence says "no popularity evidence," nothing more.
- **Reddit — post-MVP, kept (ruled 2026-09-02):** link-out through MVP; the styled in-report callout moves to the post-MVP plan alongside Capterra, still gated on the commercial-API L-item when it is picked up.
- **Government objective sources (the brand differentiator):** one scoping story covering SEC EDGAR (verified, fast), CourtListener (verified, slow → async/Profile only), CFPB (endpoint follow-up; fintech-scope caveat), FTC actions — with the **entity-matching conservatism rule** from §3 as an acceptance criterion. These likely land in the Business Profile section rather than the verdict path — which suits the doctrine: rich context, not new triggers.
- Capterra: post-MVP bucket, per the owner.

### W7 · Marketing history & tech fingerprints
- Common Crawl + archive.today per W1 — owner: explore these first, re-evaluate the category after.
- **Vendor-artifact detection (the feasible half of C5):** open fingerprint DB against fetched homepage source → "a known third-party chatbot/AI-vendor artifact appeared; first seen [date]" as neutral facts. Licensing check on the fingerprint DB is part of the story.
- **Vocabulary-class split** (marketing-AI vs technical-AI terms) — already planned; becomes the deterministic stand-in for "claims vs substance."
- Pivot presentation per §4: event-of-note styling, timeline artifact (Move 04) as the flagship rendering.

### W8 · Instrumentation — the dev source panel (NEAR-FUTURE, ruled 2026-09-02)
An access-gated, dev-only live panel: every source pinged for a report, shown by return order/speed, with status — dismantled before MVP launch. **Ruled near-future — story-plan it with the workstreams.** It is the instrument for the W1–W6 source swaps (watching returns in near-realtime keeps the 429 problem visible), and it shares plumbing with the public coverage meter (Move 01): same data, two renderings, one dies at launch. Constraints: env-gated route (never public), no secrets in output, excluded from caching, and its removal before MVP launch is part of its own acceptance criteria.

### Sequencing
**W0 → W1 → W2 + W3 (parallel) → W4 + W5 (small, parallel) → W6 → W7**, with **W8 built early — ideally alongside W1, so the source swaps are instrumented from the start** — and Move 01/03/04/05 riding their host workstreams (01→W3/W8, 03→W1, 04→W7, 05→rubric story alongside W1). The rubric-basis updates land with their driving workstream, per the basis-labelling requirement. **Then** the MVP methodology statements get written — describing what by then is actually true.

---

## 6. Budget

Everything in W0–W8 is **$0/month** (Web Risk free tier; SSLMate free tier; Tranco/CC/EDGAR/CourtListener free; keys are free registrations). **Move 02 (pre-warming, the one recommended spend) → backlog per the owner.** Capterra: post-MVP. No data API purchases for MVP.

---

## 7. Still unverified — carry these caveats into stories
Google Web Risk (needs a GCP project to test) · production egress vs archive.org (W0 answers it) · Common Crawl *rate limits* under sustained load (a dozen polite calls ≠ production traffic) · OpenPhish feed contents behind the redirect · CFPB endpoint shape · every ToS/licensing read above should be confirmed against the legal register's intake rule before adoption (the project's standing rule; restated, not new).

---

## 8. Held — noted, explicitly not being built now (owner ruling #3)
- Tier 2 security batch (harness IP-pinning, trusted client IP, atomic quota, IPv6 blocklist gaps) — parked until the URL is shared (existing trigger stands).
- Tier 3 copy fixes (inflated "Surfaces N signals" count; `humanAge(913)` rounding) — ride 19.1.
- The prose-keyed dedup mechanism (cert double-print latent) — awaiting the design ruling, alongside A3.
- Two route-level 500 hardening items (`decodeURIComponent` on malformed paths; unguarded `parseReport` on corrupt rows).
- A2: `schema_version` written-never-read (cached reports outlive rubric changes) — flag when 19.1 closes, per the PM.

## 9. Explicitly not changing
The four-state contract · precedence · the no-verdict outcome design · the basis-labelling requirement · no-LLM-on-the-hot-path · the sourced-or-silent rule.

## 10. Rulings — all four RESOLVED (owner, 2026-09-02)
1. **Reincarnation Check: APPROVED.** Distinct from the declined E2 clamp; ships with W2.
2. **Accumulation-Red: RETAINED, not retired.** Its calculation is redefined only after the updated sources are connected and tested (§4.4); no retuning before then.
3. **Reddit: post-MVP, kept.** Link-out through MVP; the commercial-API L-item gates the post-MVP callout.
4. **W8: near-future.** Part of this roadmap — story-plan it with the workstreams, built early alongside W1.

Nothing in this document is pending a decision. Ready for story planning.
