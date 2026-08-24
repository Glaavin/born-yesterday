# AI-language onset measurement (Story 18.3 §5)

**Data:** `pivot-onset-scan.ndjson` — one row per corpus domain.
**Produced by:** `scripts/qualify-wayback.ts` (uniform sampling) and
`scripts/qualify-wayback-bisect.ts` (binary search), run 2026-08-24.

## What this measured
The distribution of AI-marketing-language onset dates across the 49 real domains
in `corpus.json`. Run because the Story 18.3 §2.2 reasoning rested on an
unverified assertion that most established software companies added AI language
within the last twelve months.

**No threshold is set from this data** (§5 is explicit: report the distribution,
do not set a threshold in the same pass).

## Method, and its limits
Two instruments, because the first proved too coarse:

1. **Uniform sampling (6 captures).** What the shipped collector does. On a deep
   archive this resolves to YEARS: eff.org has ~6,700 captures. Five domains came
   back with `onset == the newest capture` — a **sampling floor**, not a
   measurement.
2. **Bisect.** Binary-searches the capture list for the earliest capture
   mentioning AI: ~log2(N) fetches. It corrected the floors by **up to 14 months**
   (lwn.net: 2026-08-23 → 2025-06-27, resolved to a 1-day bracket in 14 fetches).
   *Assumption:* monotonicity — once the language appears it stays. A site that
   added, removed and re-added can land this on a later transition; each row
   records its bracket so the residual uncertainty is explicit.

## Reading the rows
- `method` — which instrument produced the row.
- `ai_language_onset.first_seen` — earliest capture found to mention AI.
- `bisect.bracket_days` — resolution: the gap between the last capture WITHOUT
  the language and the first capture WITH it. Smaller is sharper.
- A row whose onset equals `wayback.first` is **AI-native** (the archive begins
  with the language), not a pivot.

## Population caveats (both bound the conclusion)
- **The corpus is the wrong instrument for the original claim.** The assertion
  concerned mid-market enterprise SaaS (CRMs, help-desk, conferencing). Almost
  none of that population is here: the corpus is dev infrastructure, OSS,
  nonprofits and institutions, deliberately skewed old and clean (finding F3).
  The correct phrasing is **"not supported by this corpus"**, never "disproven".
- **Small n, with unresolved cases.** 18 usable of 49 scanned; 9 unresolved
  (repeat CDX failures, or archives too thin to bisect).
