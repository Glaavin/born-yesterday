# Build log — Story 19 Stage 3: calibration

- PR: #TBD   - Branch: feature/story-19-stage-3-calibration   - Base: develop   - Date (UTC): 2026-08-26

Authority: `docs/decisions/story-18-3-amendment.md` §3.4, §3.1, §5.1, §5.2, §5.3.

**The bar this story was held to:** thresholds that are **defensible and documented, not optimal.** Every value is provisional for MVP and will be revised against real traffic.

## Stage 0 — crt.sh

One bounded check: **HTTP 502**, 0.55s. Not a timeout — the service is up enough to refuse, the same failure class as Story 18.2. **This story briefs no certificate behaviour and the certificate gap persists (§5.3).** Recorded in code beside both certificate constants.

## Stage 1 — three gaps in §5.2, all closed in this story

Per the owner: *"fixing gaps in the story that found them beats scheduling a pass."*

| Gap | Resolution |
|---|---|
| `ESTABLISHED_ARCHIVE_SPAN_DAYS` unclassified | §5.2 row added, **Measured**, written as the **successor** to the three unsound routes rather than a fourth peer |
| `PIVOT_ESTABLISHED_DAYS` unclassified | §5.2 row added, **Reasoned**. It survived the demotion that retired `ESTABLISHED_DOMAIN_DAYS` because the two ask **opposite questions of the same field**: lower bound (invalid) vs upper bound (sound). *Same field, same value, opposite validity.* Not calibrated here |
| A bare `365` inside an `if` | Named `REGISTRATION_NOTE_MIN_AGE_DAYS`, **Definitional**. Introduced by Stage 3a — the same defect class as accumulation's bare `2`, one week later |

## Final values

| Constant | Value | Basis | Moved? |
|---|---|---|---|
| `YOUNG_DOMAIN_DAYS` | 180 | DEFINITIONAL | Confirmed by owner |
| `THIN_SNAPSHOT_COUNT` | 5 | REASONED (measured lower bound) | — |
| `ESTABLISHED_ARCHIVE_SPAN_DAYS` | **1095 → 913** | MEASURED (interval) | **yes** |
| `PIVOT_ESTABLISHED_DAYS` | 1095 | REASONED | not in scope |
| `PIVOT_RECENT_DAYS` | 365 | REASONED | owner ruling: leave |
| `ACCUMULATION_RATIO` | 0.1 | REASONED, synthetic-only | value held, defence replaced |
| `ACCUMULATION_MIN_CHECKS` | 8 | REASONED, synthetic-only | — |
| `ACCUMULATION_MIN_FINDINGS` | 2 | REASONED (near-definitional) | — |
| `REGISTRATION_NOTE_MIN_AGE_DAYS` | 365 | DEFINITIONAL | newly named |

### `ESTABLISHED_ARCHIVE_SPAN_DAYS` — the one measured move

Sorted span, the informative range:

```
talkform.org 616 · bolt.new 717 ·——— 358-day void ———· v0.dev 1075 · turso.tech 1205
```

**Every value in [718, 1075] produces identical output across all 49 domains.** The corpus measures the **interval**; the point inside it is chosen. 913 is its centre — 196 days clear below, 162 above.

The old 1095 sat **20 days** from `v0.dev`: fragile to a fortnight of archiving, and the prompt's own description of it as carrying no reasoning of its own.

**Cannot be read above ~6 years.** Nothing between `hex.tech` (6.0y) and `secondlibrary.com` (12.7y, itself a re-registration — §3.4.8). That void is corpus construction, not population structure.

### `ACCUMULATION_RATIO` — same value, real defence

Measured the real denominators for the first time: **8, 9, 11, 12** completed checks (link-outs excluded).

`0.1` is **degradation-invariant**: two findings clear it at every one of those denominators, so a report that lost checks reaches the same verdict as a complete one. Above `2/12 = 0.167` that breaks — two findings would fire at 8 checks and not at 12, making the verdict depend on which lookups happened to succeed. **That is §1.3's determinism problem returning through the denominator.**

The ratio is inert today and deliberately so: with a two-member concern pool, `ACCUMULATION_MIN_FINDINGS` carries the rule and the ratio is what stops a fixed count silently loosening as signals are added (§3.1).

## Verdict delta

| | green | amber | blue | red |
|---|---|---|---|---|
| Stage 3a baseline | 30 | 13 | 6 | 0 |
| **Stage 3 final** | **30** | **13** | **6** | **0** |

**No state changes. One reason change:** `v0.dev` gains the operator-continuity caveat, because 913 makes its span count as long. Its verdict does not move — it is Amber on a concern (no SPF or DMARC), not on establishment.

> **A delta that reported only state changes would have shown nothing here.** The span constant moved a real boundary and it is invisible at state level. Recorded because it is the exact failure mode §5.1 warns about, caught by reporting reasons as well as states.

## Two findings the corpus produced that calibration cannot fix

### 1. The pivot publishes a concern about the EFF — §2.7, corrected

The pivot alone **denies Green** and **publishes as the sole flagged finding under "Some concerns."** §2.1 recovered Helium's licence for a loose window — *a pivot cannot fire Red alone* — which is still true and is **the wrong reassurance**: the false **Amber** was never analysed.

At the current value it fires for two domains, both false positives:

| Domain | Published today |
|---|---|
| `eff.org` | *"Domain registered ~36 years ago; AI language first appeared in sampled archive captures ~2 days ago"* |
| `bun.sh` | Same shape, onset ~7 months |

The EFF is a thirty-six-year-old civil-liberties organisation that **writes about** AI. `matchAiTerms` matches any **mention**. Measured precision: **0 of 2**, and the corpus contains **no true positive at any window** — all 24 usable onsets are legitimate companies adding AI features, or young AI-native companies the `PIVOT_ESTABLISHED_DAYS` precondition already excludes.

**No value fixes it:** tightening cannot exclude a two-day onset; loosening to three years pulls in eight more including `cloudflare.com`, `cursor.com`, `retool.com`.

**Owner ruling: leave the default as-is.** Do not tighten as a proxy for substantiation.

### 2. `THIN_SNAPSHOT_COUNT`'s rescue does not hold at the margin

§5.2 rescues the constant by arguing a young domain *"has had no time to accumulate captures regardless of popularity."* **Falsifiable, and the corpus does not exercise it:** `bolt.new` accumulated 449 daily-collapsed captures in 764 days — **0.59/day, clearing five captures in nine days.** A hyped launch would miss Blue and land in Amber, which implies concern.

Same defect class as §3.4.3, one state over. **The fix is a span test rather than a count test — a rule change, not a calibration outcome**, so it is recorded, not made.

## Paths the corpus cannot exercise

Stated because silence is not evidence:

- **Both certificate constants** — zero of 49 domains carry certificate data (§5.3).
- **Accumulation, entirely** — the corpus maximum is **one** concern on any domain. All three constants rest on synthetic fixtures and must be re-validated the first time a real case appears.
- **`THIN_SNAPSHOT_COUNT`'s failure mode** — no young corpus domain is heavily crawled.

## Friction in the amendment

**§5.2's basis vocabulary is too coarse for `ESTABLISHED_ARCHIVE_SPAN_DAYS`.** The corpus measures a 358-day interval and cannot discriminate the point inside it, so the interval is **measured** and the point is **reasoned**. Classified Measured per the owner's ruling, with the nuance recorded in the code comment and in the published rubric ("MEASURED *(interval)*"). A future pass may want the distinction in the vocabulary itself, since Story 20 publishes these labels.

## Files changed
- `src/report/indicator.ts` — values, basis labels, one constant named
- `docs/decisions/story-18-3-amendment.md` — §5.2 rows, §2.7 correction, §9 rows 18.3.30–36
- `docs/mvp-spec.md` §2E — the published threshold table with bases and coverage limits
- `docs/build-log/story-19-stage-3-calibration.md` — this file

## Gate
`tsc --noEmit` clean · `eslint` clean · `vitest` 184/184 · `next build` clean · verdict delta above.
