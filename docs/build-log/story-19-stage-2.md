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
| **after** | **32** | **11** | **6** | **0** |

**Exactly four domains move**, all `amber → green`, all the F2 cases Q6 targets: masshist.org, slackware.com, suckless.org, xfce.org. **Parts 3 and 4 move nothing.** Red is 0 before and after — accumulation outcomes unchanged, as required.

The as-recorded run and the run with every check completing are now **identical — zero domains differ**, and Blue is the same six either way. That is the check that reputation no longer gates anything.

### What an earlier draft of this stage got wrong, and how it surfaced
Two rules were wrong in the first pass, and the corpus delta caught one of them:

1. **Blue gated on the reputation check completing.** Blue collapsed to zero in the as-recorded run. Chasing it found a corpus gap (18.2 never ran the reputation collector) and then a worse production problem behind it: Trustpilot routinely blocks scrapers, so the check fails by design, so **Blue — the modal verdict for the modal query — would have been unreachable whenever it did.** Fixing §1.3's determinism problem had introduced it somewhere else. Reputation was removed from the conjunction.
2. **A failed SPF check did not block Green.** This conflated "missing data must not create a concern" (true) with "missing data must not block Green" (inverts Story 18 §3.5). Corrected: a check that produced no evidence cannot satisfy a conjunction that requires evidence.

**The corpus could not catch the second one** — no corpus domain has a failed DNS lookup, so both versions produce identical verdicts. It would have shipped and surfaced on the first DoH hiccup. A green corpus delta is not proof of correctness for paths the corpus does not exercise.

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
