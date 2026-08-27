# Build log — The AI pivot becomes an observation

- PR: #TBD   - Branch: feature/pivot-observation-only   - Base: develop   - Date (UTC): 2026-08-26
- Type: **RULE CHANGE.** Owner decision, 2026-08-26. Authority: `story-18-3-amendment.md` §2.1, §2.4, §2.7.

The AI-pivot signal stops producing a concern. It is still **collected in full and published in full** — the dates, the language change, the matched phrase and the Wayback links all reach the reader. What stops is **us attaching a conclusion.**

## What changed

| | before | after |
|---|---|---|
| Contributes a concern point | yes | **no** |
| Denies Green | yes | **no** |
| Publishes under an adverse heading | yes, often as the **sole** finding | **no** — an OBSERVATION caveat, routed to the summary |
| Collected | yes | **yes, unchanged** |
| Published | yes | **yes** — same text, same source, neutral channel |

One file: `src/report/indicator.ts`. The push moved from `candidateConcerns` to `caveats`. `assemble.ts` needed nothing — caveats already route to the summary and the pivot's sources were already in `sources[]`.

**The symmetry rule survives the demotion.** An unsourced pivot publishes nothing, exactly as before: the observation describes the DOMAIN, so §6.2 applies to it as an observation just as it did as a concern. Guarded explicitly and tested.

## 1. The delta — exactly as predicted

| | green | amber | blue | red |
|---|---|---|---|---|
| before | 30 | 13 | 6 | 0 |
| **after** | **32** | **11** | **6** | **0** |

**Two state changes, two reason changes, the same two domains, nothing else:**

- `eff.org` amber → green
- `bun.sh` amber → green

Both on archive-span rationale with SPF present. Red stays 0.

## 2. What the observation now publishes

`eff.org`, which previously carried the pivot as its **only** finding under "Some concerns":

> **Verdict:** Checks out
> **Summary:** *Surfaces 16 public signals for eff.org; none worth a closer look. Note: … **Domain registered ~36 years ago; AI language first appeared in sampled archive captures ~2 days ago (approximate — earliest sampled snapshot, not provably first).***
> **Positive findings:** *Archived since 1996 — the Wayback Machine's record for this domain spans ~30 years.* · *Email authentication configured (SPF present).* · *SPF email-authentication record present.* · *DMARC policy present.* · *Archived on the Wayback Machine since 1996 (6687 captures recorded).*
> **Flagged findings:** *(none)*

The observation still reaches the reader, with its source, in the summary. It is no longer a finding and no longer denies Green.

## 3. Collection is unchanged

`src/signals/ai-pivot.ts` is untouched. `wayback_first`, `wayback_last`, `ai_language_first_seen`, `ai_language_current` and `wayback_snapshot_count` are all still collected, still status-tracked, still written to `signal_history`. `derive.ts` still builds the pivot derivation. **Nothing about what we gather changed** — only what we conclude from it.

## 4. What reads oddly now the concern is gone

Reported rather than fixed silently, per the brief.

**(a) The copy still argues by juxtaposition — the significant one.** The observation reads:

> *"Domain registered ~36 years ago; AI language first appeared in sampled archive captures ~2 days ago"*

The semicolon **is** the argument. As a concern that framing was the point; as a neutral observation the sentence still makes the case we just decided not to make. Two dates joined by a semicolon and nothing else is a claim about their relationship.

The copy lives in `src/report/derive.ts`, **outside this story's scope**, so it is flagged rather than changed. If the disclosed-facts posture is to be real, this sentence probably wants to become two independent statements — *"AI language first appears in sampled captures from 2026-08-22"* alongside the registration date already published — rather than one contrastive one. **That is a copy decision, and it belongs to whoever owns the pivot's presentation.**

**(b) Registration age is now stated twice in the same note.** `eff.org`'s summary carries *"Domain registered 1990-10-10. A registration date records…"* and then *"Domain registered ~36 years ago; AI language first appeared…"*. Two registration statements, one note. A consequence of the pivot text carrying its own registration clause, which it did because it was arguing.

**(c) The note is getting long** — five sentences for `eff.org`. The summary is now the destination for every disclosure, every observation, and the pivot. Presentation, not correctness; a candidate for the Story 20 pass.

**(d) Accumulation is strictly unreachable.** With the pivot demoted the concern pool has **one** member, so `concerns.length` can never reach `ACCUMULATION_MIN_FINDINGS = 2`. §3.1 called it *"near-unreachable"*; it is now categorically unreachable until the pool grows. Rule and constants retained deliberately, and asserted by a test so that anyone growing the pool sees it fail and re-reads §3.1. **The methodology page must state this** — a published rubric that describes an unreachable Red route is not a publishable rubric.

## Recorded reasoning

Amendment §2.7 now carries the ruling, the `sugarcrm.com` argument, the corrected framing of the precision claim, and the cost. §9 rows 18.3.39–42.

**The durable argument is `sugarcrm.com`, not "0 of 2."** Corpus tier 1 slot 6 was hand-picked as *the* classic-pivot exemplar. Its onset is 1,945 days; it fires at neither 365 nor 1095, and the ~5.3-year window that would fire it flags ~14 of 49 domains — at which point SugarCRM, a twenty-year-old CRM that added AI features in 2021, is arguably a false positive too. **The corpus's own designated positive example is ambiguous at every threshold.**

**Explicitly not evidence:** *"no true positive at any window."* The corpus excludes true positives **by construction** — the 18.2 brief forbade adverse pre-labelling of real companies and forbade committing a URLhaus host. That absence measures our sampling rule, not the signal's recall.

**The cost, accepted rather than slid into:** this is a temporary disablement of the product's headline feature, a real narrowing of what Born Yesterday currently does, and we cannot measure what we lose. **What reverses it is substantiation shipping (§2.4), not a better window value.**

## Files changed
- `src/report/indicator.ts` — the rule change, with the reasoning recorded at the site
- `src/report/indicator.test.ts` — three tests replacing the retired two-concern Red test
- `docs/mvp-spec.md` §2E — the pivot removed from Red's triggers; the observation rule and the accumulation consequence published
- `docs/decisions/story-18-3-amendment.md` §2.7 + §9
- this build log

## Gate
`tsc --noEmit` clean · `eslint` clean · `vitest` **186/186** · `next build` clean · delta above.
