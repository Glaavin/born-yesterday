# Build log — Story 18.2: Build the calibration corpus

- PR: #41   - Branch: data/story-18-2-corpus   - Base: develop   - Status: opened (CI green)   - Date (UTC): 2026-08-13

Lithium Epic. Research + data. Anchors off Story 18; does not advance the counter. Ran COLLECTORS to qualify domains; **never ran the indicator and recorded no verdict** (Tier 1 retains its pre-Story-18 smoke states from `test-domains.md`).

## Files changed
- `docs/test-domains.md` — (new to repo) Tier 1 / methodology doc; open slots resolved to named domains, Slot 6 annotated, pointer to the corpus.
- `docs/calibration/corpus.json` — (new) **50 entries** (Tier 1 = 10 incl. 1 open slot [Slot 10], Tier 2 = 26, Tier 3 = 14); raw observed signals with explicit per-signal status; no verdicts (except Tier 1 expected states). Includes a `findings` block (archive-continuity, hygiene-rarity, age-skew) for Story 19.
- `docs/calibration/synthetic-accumulation.json` — (new) 6 clearly-labelled SYNTHETIC fixtures (3–7 concurrent soft flags, varied denominator) for the accumulation-Red threshold; each flag grounded/marked observed-vs-extrapolated.
- `docs/calibration/observations.ndjson` — (new) raw merged collector output for all 73 qualified domains (provenance).
- `scripts/qualify-corpus.ts` — (new) cheap pass: real domain-identity (RDAP/WHOIS) + DNS (DoH) collectors, batch, incremental NDJSON.
- `scripts/qualify-wayback.ts` — (new) patient Wayback: reuses the collector PURE helpers with a 45s fetch (archive.org is ~38s from here, past the live 8s deadline); polite UA, hard-stop on block.
- `scripts/build-corpus.ts` — (new) assembles `corpus.json` from `observations.ndjson` + an embedded curation (tier/probe/provenance); observed values pulled verbatim.
- `package.json` — `corpus:qualify` / `corpus:wayback` / `corpus:build` aliases.

## Acceptance criteria
- [x] Central constraint held: collectors run, indicator never run, no state recorded (Tier 1 excepted, by design).
- [x] Tier 1 open slots resolved to named domains where possible: Slot 5 → masshist.org (observed no-DMARC/has-SPF), Slot 6 → sugarcrm.com (AI-onset 2021-04-25 vs domain from 2008), Slot 7 → bolt.new (2.1y, 449 captures). Slot 8 (owner-supplied) and Slot 10 (URLhaus, at test time) left open. Slot 9 UNRESOLVED — no days-old domain qualified.
- [x] Slot 6 annotated per owner: expected state contingent on Story-19 `PIVOT_RECENT_DAYS`; the one Tier-1 boundary probe. States otherwise left alone.
- [x] Tier 2 boundary clusters built by OBSERVED signals; gaps reported (below).
- [x] Tier 3 volume with sector/geography variety (US/FR/DE/UK/India; assoc/nonprofit/co-op/radio/charity/fintech/email/ISP/OSS/credit-union/college/media).
- [x] Synthetic accumulation fixtures, realistic + grounded + re-validation caveat.
- [x] Honest `observed`: every signal carries an explicit status; a null under status:collected is an observed negative, status:not_collected is an explicit gap.
- [x] No adverse pre-labeling of real companies (swept).
- [x] Do not commit a URLhaus host (Slot 10 open by design).

## Decisions & deviations
- **Prompt premise corrected:** `docs/test-domains.md` did NOT exist in the repo (Blocker 1). Owner supplied it; committed here.
- **Environment:** crt.sh returned 5xx throughout (source outage) and web.archive.org is ~38s/request from this sandbox (past the collectors' 8s deadline). Per owner: cert history SKIPPED (marked not_collected everywhere; backfill in Story 19); Wayback via a patient reuse-the-pure-helpers script for a targeted ~11-domain subset only.
- **Key finding — hygiene gaps are rare in reputable domains:** of 73 qualified, DMARC present 76% / SPF 89%; max **2** concurrent hygiene flags (0-flag=28, 1=5, 2=4 in the corpus), **zero at 3+**. This validates + extends the owner's synthetic call: even 3-flag real domains don't occur.
- **Key finding — registration age poorly separates establishment:** age is heavily right-skewed (corpus median ~25y; 21/35 are 20y+; youngest 2.1y), and young PRODUCTS routinely sit on OLD domains (cursor.com 30.7y reg / 2022 product; retool/render/deno/raycast same). Wayback archive-onset — not registration age — is the real discriminator. Direct input to the §5 Green archive-depth question.
- **warp.dev** was intended as a 5-7yr THIN archive but observed HEALTHY (660 captures) — kept as honest observed data, not fitted to intent.
- **threat_listing not queried** — asserting "not listed" without a check would be an unsourced claim; marked not_collected.

## Distribution summary (report item 5 — matters most)
Across 37 real corpus domains (3 open slots excluded):
- **Domain age (reg-yrs, n=35):** min 2.1 · p25 6.4 · median 24.8 · p75 29.7 · max 35.9. Buckets: <2y=0, 2-5y=6, 5-10y=3, 10-20y=5, 20y+=21. (age unknown for kenyon.edu, ccc.de — .edu/.de RDAP gaps.)
- **Email auth:** DMARC 28/37 (76%), SPF 33/37 (89%). Hygiene-flag count: 0=28, 1=5, 2=4, 3+=0.
- **Wayback (n=9 collected):** min 318 · median 449 · max 2524 daily-collapsed captures.
- **AI-onset (sampled, approx):** sugarcrm.com 2021-04-25 (constantcontact.com 2021-01-12 in observations.ndjson; freshbooks.com none).
- **Clustering flag:** the corpus over-represents old, clean, well-run domains and under-represents (a) sub-2-year registrations and (b) multi-flag domains. Story 19 should read Green/Amber calibration as well-supported, but Blue/Amber-youth and accumulation-Red as thin on real data (synthetics + owner-supplied Slot 8 fill part of the gap).

## Follow-up pass — sub-2-year addition (owner-requested)
The first pass produced **zero** sub-2-year registrations (median ~25y) — disqualifying, since Story 19 must set Blue thresholds and domain-age bands that all sit below 2 years. Additive fix (nothing removed):
- **+10 domains under 2 years**, sourced deliberately (findable-by-reputation correlates with established, so young data had to be sought): **all organic HN Show HN launches**, RDAP-verified age. Wayback SKIPPED for these (young ⇒ thin by definition; snapshot_count recorded not_collected, never inferred zero).
- **Distribution:** <3mo=3, 3-12mo=4, 12-24mo=3 (10 under-2y), spanning **1d → 609d** — not clustered at the 24-month edge, so the Blue/young-band thresholds have real data beneath them.
- **Slot 8 → txta.dev** (organic launch, ~1d — the thinnest real domain in the corpus). The *durable* Slot 8 answer is documented as a **METHODOLOGY** in `test-domains.md` (register a fresh throwaway when a guaranteed Blue is needed), not a committed domain. **Slot 9 → writelikepg.com** (organic HN launch, ~4d). Only Slot 10 (URLhaus) remains open, by design.
- **+constantcontact.com** as a 2nd real pivot (AI-onset ~2021-01-12) so Slot 6's highest-stakes case isn't a single example.
- **+secondlibrary.com** (~2.8y, DMARC+SPF+MX present) — the youngest CLEAN domain in the 2-5y band, so it probes the low end of the Green/Amber establishment boundary with no hygiene confound. Archive depth not collected.
- **Tier 2 sub-group labelled:** the 9 young additions carry `cohort: "young-age coverage"`, and `tier2_composition` records that the **17 original boundary probes were vetted individually** while the cohort was **sourced as a block**. Story 19 should weight accordingly.
- **Named findings in corpus.json** (`findings`): **F1** archive-continuity (retool.com/cursor.com = old domains with prior-owner archives → Green needs an archive-CONTINUITY test, not registration age); **F2** promoted — a lone email-auth gap is a **candidate for removal as a standalone concern** (~24% of the corpus lacks DMARC, so the draft "missing SPF/DMARC → +1 concern" rule measures adoption lag, not risk) **and** accumulation-Red **cannot fire on hygiene alone** (3+ gaps never occur in established domains; stacking tracks youth), so the trigger needs non-hygiene signals; **F3** age-skew.
- **Owner-domain privacy (owner decision):** repo is public (re-privatize = issue #6), so anything committed today is public today. **No owner-supplied domain is published in this corpus.** Three were initially committed on the branch; per the owner all were removed pre-merge and replaced with organic launches, and the work was rebuilt on a **fresh branch** so the removed names appear nowhere in the history that reaches `main`. Provenance was **not** softened to disguise ownership — the domains were removed instead, because falsifying a provenance field to conceal sourcing would undermine the corpus's whole value. (Removed names are deliberately not recorded here.)

## Known gaps (report item 6)
- **No sub-2-year real registration** — youngest is bolt.new (2.1y). Would need a genuinely days/weeks-old launch captured at test time (Slot 9) or the owner-supplied Slot 8 throwaway.
- **Blue/Amber "6-12mo, meaningful archive"** and **"1-2yr, almost no archive"** clusters: no clean fits (youngest domains had healthy archives).
- **Accumulation-Red 3+/4+ real domains:** none — covered synthetically.
- **cert history:** none (crt.sh 5xx) — backfill when it recovers.
- **.edu / .de ages:** RDAP gaps; WHOIS port-43 fallback did not fill them here.

## Collector-run cost (report item 7)
- Cheap pass: ~76 domain attempts × (1 RDAP + ~5 DoH ± 1 WHOIS fallback) ≈ **~450 external calls** (mostly cached on re-run via `external_cache`).
- Patient Wayback: 11 CDX + 3×6 snapshot fetches + 3 CDX retries ≈ **~32 archive.org requests** at ~38s each (~20 min; uncached — re-run pays it again).
- Re-run: cheap pass ~near-zero if the cache is warm; Wayback ~20 min. No indicator, no DB writes beyond `external_cache`.

## Gates
- lint (+ token guardrail) | typecheck | test (161) | build: **pass**
- JSON valid (corpus + synthetic); adverse-word sweep clean.
