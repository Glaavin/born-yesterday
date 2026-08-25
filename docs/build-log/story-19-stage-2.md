# Build log — Story 19 Stage 2: the indicator reads status

- PR: #50   - Branch: feature/story-19-stage-2   - Base: develop   - Status: opened (CI green)   - Date (UTC): 2026-08-24

Amendment §1.4's framing: three stories of plumbing shipped and nothing consumed `status`. **This is the first consumer.**

## Files changed
- `src/report/indicator.ts` — Q6, caveats on all states, Q4 guards, Q3 ratio, threshold split
- `src/report/indicator.test.ts` — fixtures now state what was CHECKED; +helper
- `docs/mvp-spec.md` §2E — Green's conditions written down (18.3 §3.3: the gate lived only in code)
- `scripts/corpus-verdicts.ts` — (new) before/after harness over the calibration corpus

## Verdict delta (the review artifact)

Reconstructed from the 18.2 observations, not a live re-run — a controlled diff of indicator logic against fixed inputs.

| | green | amber | blue | red |
|---|---|---|---|---|
| before | 28 | 15 | 6 | 0 |
| after (corpus as recorded) | 32 | 17 | 0 | 0 |
| **after (all checks completing)** | **32** | **11** | **6** | **0** |

**With every check completing, only four domains move — exactly the F2 cases Q6 targets:** masshist.org, slackware.com, suckless.org, xfce.org, all `amber → green`. **Parts 3 and 4 move nothing.** Red is 0 before and after: accumulation outcomes unchanged, as required.

The `blue → amber` movement in the middle row is **entirely** attributable to `trustpilot` being `not_attempted` in the corpus — 18.2 never ran the reputation collector. It is a corpus gap, not a logic defect, and it is measured rather than asserted: setting that one check to "completed" restores all six Blues and leaves the delta at four.

**But it exposes a real production fragility.** Blue's conjunction includes `noReputation`, which now requires the Trustpilot check to have completed. Trustpilot commonly blocks scrapers (the collector records `failed` on a 403), so **a Trustpilot block makes Blue unreachable** — non-deterministic verdicts for the modal query, which is §1.3's concern in a new place. Recommendation, not applied: reputation is the least reliable check and the weakest evidence of "footprint"; consider whether it belongs in Blue's conjunction at all.

## Caveats now emitted on every state (Part 2)
Built into a separate array and appended at whichever state returns, so "caveats never alter the verdict" is structural rather than a promise. Across the corpus: 49 domains gain the threat-feed disclosure, 49 the reputation disclosure, 12 a DMARC-absent disclosure, 2 a registration-lookup gap, 2 an archive gap.

## Q4 audit — every condition
| Condition | Verdict | Action |
|---|---|---|
| threat listing | safe — requires `valueText === "Listed"` | none |
| pivot concern | unguarded | gated on `ai_language_first_seen` completing |
| email-auth concern | **violation** — fired when the TXT lookups FAILED, as long as the A lookup answered | gated on both checks completing |
| `young` | safe — requires a value | gated anyway for symmetry |
| `fewSnaps` → `thinArchive` | **violation** (Stage 1 row 3) | gated |
| `!hasReputation` → `noReputation` | **violation** — satisfied by a check that never ran | gated |
| establishment (age/archive/cert) | safe — all require values | gated anyway |
| `clean` | safe | Q6 rewrite |

## Gates
- lint | typecheck | test (176) | build: **pass**
