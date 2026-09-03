# Build log — Story 24 Stage 2: Common Crawl as an establishment instrument

- Branch: feature/story-24-cc-establishment   - Base: develop   - Date (UTC): 2026-09-04
- Type: New source + establishment rule change. Authorities: roadmap §5-W1, amendment §3.4, Move 05, plus the Stage 1 / 1.5 production findings.

## What shipped

**A second establishment instrument, and it is primary.** Stage 1.5 measured every Wayback establishment endpoint as slow and unreliable — Availability returned 200-but-empty for `masshist.org`. CC's single-crawl probe answered in 231–533 ms and was correct on every test domain. So:

**Establishment is a disjunction (Move 05 Reading A):** `established = ccPresent || longArchiveSpan`. Either instrument may satisfy it; **neither may deny it.** Reading B (both required) is rejected — CC's coverage asymmetry lands hardest on obscure-but-real businesses, which would reintroduce the fairness failure Stage 3a removed.

**The CC query is a single point-in-time probe** against the crawl at the threshold vintage (`CC-MAIN-2024-10`, "February/March 2024", ≈ `now − ESTABLISHED_ARCHIVE_SPAN_DAYS`). One call. It establishes "present at least that far back" — not the earliest date, which would need the slow backward walk.

**The claim is deliberately weaker than Wayback's span**, in its own words with its own source: *"Present in Common Crawl's February/March 2024 crawl — on the live web at least that far back."* It never reuses the "Archived since…" span sentence. Wayback's span leads whenever available (the richer claim); CC carries establishment otherwise.

## The 404 refinement (required by Chat, buildable as specified)

CC absence must not deny establishment. Encoded in the no-verdict predicate via a two-part known/holds:

| CC | Wayback | establishment | verdict |
|---|---|---|---|
| 200 present | anything | holds | Green (CC claim, or Wayback span if also present) |
| 404 absent | span ≥ threshold | holds | Green (Wayback span) |
| 404 absent | **failed** | **unknown** | **no-verdict** (CC absence is weak; can't conclude) |
| 404 absent | known-short | known-false | Amber (both instruments definitively negative) |
| 5xx/timeout | failed | unknown | no-verdict |
| 5xx/timeout | span | holds | Green (Wayback) |

The code:
```
established           = ccPresent || longArchiveSpan
establishmentKnown    = established || (ccAbsent && waybackShort)
```
`establishmentKnown=false && !established` → the Story 21 predicate marks Green undecidable → no-verdict. A CC 404 alone never makes it known (coverage asymmetry — weak evidence); only CC-404 **and** a known-short Wayback span is a definitive negative.

**Into the rubric basis, not a footnote:** *Common Crawl presence is sound positive evidence of operation. Common Crawl absence is weak evidence of anything, because crawl coverage correlates with prominence — the same asymmetry that retired `ESTABLISHED_SNAPSHOT_COUNT` in Stage 3a, in a different shape.* (Recorded at the top of `common-crawl.ts`.)

## Architecture — the race

`common-crawl` is a new collector, running in parallel with `ai-pivot` (Wayback) under the shared 8 s deadline. Different hosts → the per-host budget/rate limiter never contend (Q2, verified). Whichever returns a sound answer inside the deadline satisfies establishment. `ESTABLISHED_ARCHIVE_SPAN_DAYS` is unchanged; the CC vintage is a CC-specific parameter flagged for Stage 3 Part B.

## Tests — 15 new

- **Collector** (`common-crawl.test.ts`): 200→present, 404→absent, 5xx/timeout/rate-limited→failed, a 200-non-NDJSON→failed; the three signal shapes.
- **Disjunction** (`indicator.test.ts`): CC-present+Wayback-failed→Green (CC's words, never the span sentence); CC-404+Wayback-span→Green via Wayback; **CC-404+Wayback-failed→no-verdict** (the refinement); CC-404+Wayback-short→Amber; CC-failed+Wayback-failed→no-verdict; CC-present+Wayback-short→Green (either suffices).
- The two Story 21 predicate tests updated for the new `establishment` conjunct signal.

## Corpus delta — zero, and uninformative

Green 32 · Amber 9 · Blue 6 · no-verdict 2 — unchanged. **CC modelled as absent** (its default production outcome for a domain not in the threshold crawl), which preserves the pre-Story-24 verdicts. The corpus has **no CC observations**, so it cannot exercise CC's positive contribution — the §5.1 instance, and why production is the gate. (Modelling CC as *failed* instead produced a misleading 5-domain amber→no-verdict shift that production would not — young domains get a definite 404, not a failure.)

## Production verification — after promote
≥10 fresh domains via the 23.1 operator bypass, **paced 6–10 s** (Story 23.2's limiter makes a flood safe, not measurable). Report: served-rate vs Story 23's 2-of-11; per-domain which instrument established; any CC/Wayback disagreement; realistic single harnessed CC latency; whether `wayback_last` enrichment rates change. **Served-rate below ~7/10 is a finding about CC, not a story failure** — it would make the race load-bearing rather than prudent.

## Gate
`tsc` clean · `eslint` clean · `vitest` **265/265** (250 → 265) · `next build` clean.
