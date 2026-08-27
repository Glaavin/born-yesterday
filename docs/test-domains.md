# Born Yesterday — Test-Domain Calibration Set

**Purpose:** a set of real domains chosen so that *every branch of the indicator rubric* has a likely-triggering candidate. Use it as both the **smoke test** for the live serve path and the **Tier 1** of the calibration corpus for Lithium threshold tuning.

> **Tiered corpus (Story 18.2).** This document is **Tier 1 (Smoke)** — one clear case per branch. The full calibration corpus adds **Tier 2 (Boundary)** and **Tier 3 (Volume)** and lives in [`docs/calibration/corpus.json`](calibration/corpus.json) (raw observed signals, no verdicts), with synthetic accumulation fixtures in [`docs/calibration/synthetic-accumulation.json`](calibration/synthetic-accumulation.json) and the raw collector output in `docs/calibration/observations.ndjson`. Tier 1 is the ONLY tier that carries expected states — assigned before the "no verdicts" constraint applied, and kept as the smoke-test's purpose. Tiers 2/3 record raw signals only.

**Methodology note (and it's on-brand):** this is a set to *run*, not a set of pre-computed verdicts. The live tool is the verifier — it checks DMARC, domain age, Wayback footprint, and threat listings directly. Hand-asserting "this domain has no DMARC" without checking would be exactly the unsourced claim the product refuses to make. So: run each domain, observe where it lands, and *that observation* is your calibration data. The Greens below I'm confident about by reputation; the softer states are "run-to-confirm," with the specific signal to watch noted.

_Last updated: 2026-08-13 (Story 18.2 — open slots resolved to named domains)._

---

## GREEN — "Checks out" (4, high confidence)

Established domains, long archive history, email auth configured, not listed anywhere — positive evidence of legitimacy, which is what Green requires.

1. **stripe.com**
2. **github.com**
3. **wikipedia.org**
4. **cloudflare.com**

*Expected:* Green. *Watch:* that the indicator surfaces the *establishing* reasons (age / archive history / cert) — and, given the 16.1 fix, whether the threat-feed disclosure note appears (it will, until you set working PhishTank/URLhaus keys — that's the Ops-list item, and these Greens are a good check that the disclosure reads correctly in the summary).

---

## AMBER — "Some concerns" (3 slots, run-to-confirm)

The generous middle: *one* concern point, or legit-but-not-clearly-established. These are the cases that prove a lone soft signal lands Amber, **not** Red.

5. **masshist.org** — Missing-DMARC profile. **Resolved (18.2):** observed **no DMARC, SPF present**, otherwise clean, established (~30y). One hygiene concern on an otherwise-unremarkable established org. *(Method: ran org/nonprofit candidates and kept the one the tool reported as no-DMARC-but-otherwise-clean. Other observed no-DMARC-only established domains are held in Tier 2: suckless.org, slackware.com, xfce.org.)* *Expected:* Amber.

6. **sugarcrm.com** — Classic-pivot profile. **Resolved (18.2):** observed an **established domain (Wayback back to 2008) with an AI-language onset ~2021-04-25** ("artificial intelligence"), i.e. AI marketing appearing ~13 years into the domain's life. Evidence: earliest sampled Wayback capture carrying AI language (onset date is APPROXIMATE — earliest of 6 sampled captures; the snapshot URL is recorded in `corpus.json`). *(Candidates run: sugarcrm.com, constantcontact.com — both showed a ~2021 onset; freshbooks.com showed none. constantcontact.com's observation is in `observations.ndjson` if a second pivot is wanted.)*
   > **Expected state — annotated, not flipped (18.2).** The slot is a pivot with **no other findings** — that's what makes it useful. Whether a lone pivot fires Red depends on **`PIVOT_RECENT_DAYS`**, which Story 18 §5 explicitly defers to Story 19. So the expected state is **genuinely unresolved, not merely stale**: Story 18 §3.4 makes the classic pivot a *disjunctive Red trigger*, but the threshold that determines whether THIS domain trips it **does not exist yet**. This is the **one Tier-1 entry that functions as a boundary probe rather than a clear case**. The pre-Story-18 assignment (Amber) is left as the smoke-test record but is superseded as an expectation.

7. **bolt.new** — Young-but-not-thin SaaS. **Resolved (18.2):** observed a **2.1y domain with 449 daily-collapsed Wayback captures from 2024-09** — too young for Green (unestablished), too much footprint for Blue (not thin). *Expected:* Amber.

---

## BLUE — "Too new to tell" (2 slots)

A genuinely thin public footprint — young domain, few/no Wayback snapshots, no reputation, not listed.

8. **The reliable Blue is a METHOD, not a domain.** *(18.2: deliberately no domain committed here.)* When you need a guaranteed Blue — for a smoke run, a demo, or a regression check — **register a fresh throwaway and run it**:

   1. Register any cheap domain (Porkbun/Namecheap); note the registration date.
   2. Point it at nothing, or a bare placeholder page. Add **no** DMARC/SPF.
   3. Run it immediately: days-old registration + zero Wayback captures + no reputation presence + not on any threat feed → the textbook thin footprint.
   4. Re-register or re-use as needed; the domain ages out of Blue within months, so treat any specific name as perishable.

   **Why no committed domain:** a throwaway registered by the project owner is owner-identifying, and this repo is public (re-privatization tracked in issue #6). Committing one would link the owner's identity to the project for anyone reading the corpus. The procedure is reproducible; the domain would only ever be a dated snapshot. *(For a real observed thin-footprint data point, corpus Slot 8 records `txta.dev` at ~1 day old — an organic public launch, not an owner asset.)*

9. **writelikepg.com** — a very-recent public launch. **Resolved (18.2 follow-up):** an organic HN Show HN launch, **~4 days old** at observation, email auth configured but no archive/reputation footprint yet → a genuine days-old real launch (the modal Born Yesterday query). *(Listings like this age out; re-source a this-week launch at test time if needed.)*

---

## RED — "Red flags found" (1 slot)

10. **A current host from the URLhaus feed** (`urlhaus.abuse.ch/browse`), pulled **at test time** — listings churn hourly, so a hardcoded one would be offline by the time you run it. **Open by design; never committed.** A live URLhaus listing is the single authoritative, sourced signal that triggers Red on its own, and it doubles as a real test of the hardened `live-site` fetch against a genuinely malicious page (treat it as a test *input* to the threat path, not a site to visit). I'm deliberately **not** pre-labeling any real legitimate company as "expected Red" — Red is an accusation, and asserting it about a real business by hand, even in a test, is the precise overreach the product exists to avoid. The feed gives a fresh, real, defensible Red each time.

---

## Coverage check

| Branch | Slot(s) | Trigger being exercised |
|---|---|---|
| Red (listing) | 10 | threat-list listing → Red, overrides Blue |
| Blue (thin) | 8, 9 | insufficient footprint → "too new to tell" |
| Green (established+clean) | 1–4 | positive evidence + clean → "checks out" |
| Amber (soft/singular) | 5, 6, 7 | one concern point / mixed / not-established → the generous default |

Slots 5–7 are the ones that matter most for Lithium: they're where a loose threshold would either over-call Red or over-vouch Green, so they're the calibration signal that the "Red is a high bar, Amber is roomy" philosophy actually holds in practice. Slot 6 in particular is the boundary the `PIVOT_RECENT_DAYS` threshold turns on.

---

## Tiers 2 & 3 (the calibration bulk)

Tier 1 above is the smoke set. The **boundary** and **volume** tiers — ~30 more domains chosen for *uncertain* outcomes (Green/Amber, Blue/Amber and accumulation edges) and for *ordinary-company variety* — live in [`docs/calibration/corpus.json`](calibration/corpus.json). They carry **no expected states**: raw observed signals only (domain age, DMARC/SPF, Wayback depth, AI-onset where scanned), each with an explicit collection status. See that file and the Story 18.2 build log for the distribution summary and the known gaps (no sub-2-year real registration; no real domain with 3+ concurrent soft flags — hence the synthetic accumulation fixtures).
