# Build log — Hotfix: Trustpilot mis-framed as positive + residual source mismatch

- PR: #TBD   - Branch: fix/trustpilot-framing-and-residual-source   - Base: develop   - Date (UTC): 2026-08-27
- Type: **Hotfix. Two live defects, both publishing something false, both on paths the corpus cannot reach.**
- Not in production — `main` is behind `develop`.

## Defect 1 — Trustpilot ratings published under "Positive findings"

```ts
if (tp?.valueText != null) push(`Trustpilot: ${tp.valueText}.`, tp.source);
```

`valueText` is the rating **verbatim** — *"4.2/5 (1,203 reviews)"* or *"1.8/5 (40 reviews)"* — and nothing checked its direction. A badly-rated company had its bad rating published under a heading asserting the finding is reassuring.

**Two things wrong at once:** adverse evidence presented as favourable, which misleads **in the company's favour**; and it is visibly wrong to any reader who notices.

**Fixed by removing it from `gatherPositives`. Not by a direction check** — deciding that 4.6 is good and 1.8 is bad would be us adopting a third party's verdict on a company's quality, which is exactly what `reputation.ts` says we do not do (*"we count and link, we don't judge"*) and what the intake rule prohibits.

### Where it goes: nowhere, for now — deliberately

Its destination is the **neutral channel**, which does not exist until Story 19.1. The brief allowed routing it to the summary note *if that is a one-line change and reads correctly there*. **It is neither.**

- **Not one line.** The note is built from `indicator.reasons`, so `indicator.ts` would have to read the reputation signal and emit an observation caveat — new coupling between the indicator and a collector it does not otherwise consume, added for a few days.
- **It reads badly.** The note is prose about our limits and our observations. A bare rating dropped among *"PhishTank and URLhaus were not reachable at check time"* is a non-sequitur.

**So it is withheld from the findings rather than published under a false heading.** Per the brief: not publishing a fact for a few days beats publishing it under a heading that misrepresents it.

**Mitigation, and it is a real one: the Trustpilot LINK still reaches the reader.** The signal's source flows into `sources[]`, so the Sources tab still carries a labelled Trustpilot link. The rating is one click away, not lost — and one click away with no framing attached is arguably where it belonged all along.

## Defect 2 — the residual's citation, and its "but"

```ts
const fallbackText = established
  ? "Archived history is established, but we couldn't confirm the email-authentication records we look for."
  : "We couldn't establish enough archived history to vouch for this domain yet.";
return verdict("amber", [{ text: fallbackText, source: archiveSource, kind: "residual" }]);
```

`archiveSource` is **Wayback**. The sentence's operative clause is about **email authentication**, which Wayback does not evidence. **The citation travelled with the sentence rather than with the claim.** The sentence also carried a contrastive **"but"**, composing two clauses into an argument — the semicolon defect, in a sentence written while fixing the semicolon.

### Branch analysis

The residual's `established` branch is reached when: **established**, no concerns fired, and `clean` is false — which, since `clean = spfEstablished && concerns.length === 0`, means **SPF is the reason**. Two genuinely different situations were sharing one sentence:

| | situation | §3.2 kind | evidence |
|---|---|---|---|
| **(i)** | SPF **checked and absent** | a **finding** — a confirmed empty state (§1.1) | the DNS query we ran |
| **(ii)** | SPF lookup **did not complete** | a **disclosure** about our limits | nothing |

**Fix — split by `spfChecked`:**

- **(i)** → *"No SPF email-authentication record was found."* sourced to `dns_spf.source`. `status === "ok"` ⟺ `txtQ.ok` ⟺ the source is non-null, so the symmetry rule is always satisfiable here.
- **(ii)** → **no reason at all.** The *"email-authentication lookup did not complete"* disclosure caveat already states it, in the channel built for it, and §6.2 forbids manufacturing an unsourced reason beside it.

The *"Archived history is established"* clause is dropped rather than relocated: it is already published in `positive[]` by the assembler, so nothing is lost — only the contrast we built.

**Reachability of (i):** established, SPF checked and absent, **DMARC present** (otherwise the both-missing concern fires and we never reach the residual).

## Tests — confirmed failing before the fix

Three added, each run against unfixed code first:

| Test | Failure before fix |
|---|---|
| a low Trustpilot rating never enters `positive[]` (both a bad and a good rating) | `expected true to be false` |
| the established-no-SPF residual cites the check it is talking about | `expected { label: 'Wayback CDX' } to deeply equal { label: 'DNS over HTTPS' }` |
| when the SPF check did not complete, the residual publishes no finding | `expected true to be false` |

The rating test asserts the **link survives** in `sources[]`, so a later change cannot quietly drop the fact entirely.

**This is the only real verification available.** See below.

## Corpus delta — zero, and it proves nothing

| | green | amber | blue | red |
|---|---|---|---|---|
| before | 32 | 11 | 6 | 0 |
| after | 32 | 11 | 6 | 0 |

**Zero state changes and zero reason changes** — expected, and **uninformative**. Neither defect is reachable:

- **Zero corpus observations carry a Trustpilot rating.** The 18.2 collection never ran the reputation collector, and the harness sets `trustpilot.valueText` to null.
- **Zero of 49 domains reach the established-no-SPF residual.** All seven corpus domains lacking SPF *also* lack DMARC, so every one takes the **concern** path instead.

## The pattern worth recording

**Twice now a correction has introduced the defect it was correcting.**

- The semicolon pass removed a contrastive construction and **wrote a "but"** into its replacement.
- The source-travel fix re-sourced the pivot sentence to the capture that matched, and **mis-sourced** the residual in the same pass.

This is not carelessness. Both are genuinely easy to miss: you are writing prose under a rule, the rule is about a property of the prose, and the property is invisible while you are focused on the claim. **It is the argument for the copy discipline being a check rather than a convention** — the same argument §3.2 made for `subkind`, arriving from a different direction.

## The fifth and sixth path the corpus cannot exercise

Running count:

1. Certificate behaviour — 0 of 49 carry certificate data (§5.3)
2. Accumulation, entirely — the corpus maximum is one concern
3. "A failed check blocks Green" — every corpus domain has `dns_spf` status `ok` (§5.1)
4. `THIN_SNAPSHOT_COUNT`'s failure mode — no heavily-crawled young domain
5. **Trustpilot ratings** — no observation carries one
6. **The established-no-SPF residual** — zero of 49 reach the branch

**The emerging characterization, and it belongs in §5.1:** the corpus was built to span **verdicts**, and every gap found so far is a path that **does not correspond to a verdict** — failure modes, degraded branches, rare conjunctions. That is a **property of how it was built**, not an accident of which domains were chosen. No amount of adding domains fixes it; only fixtures aimed at paths rather than outcomes will.

## Also in `gatherPositives`, reported not fixed (19.1 handles classification)

Beyond Trustpilot and the clean threat check already reported:

- **The archive line can be ADVERSE, not merely neutral.** *"Archived on the Wayback Machine since 2024 (449 captures recorded)"* publishes under **Positive** for `bolt.new` — whose short span is precisely why it is **not** Green. And for `secondlibrary.com`, *"(2 captures recorded)"* is the thinness §3.4.8 warns about, badged Positive. **Same shape as Trustpilot** — a fact whose direction varies, under a fixed favourable heading — milder, and covered by 19.1's classification.
- **The cert line carries a limitation notice under a Positive badge:** *"TLS certificates logged for over 10 years (a floor — Certificate Transparency does not reach further back)."* The parenthetical says the number is not a measurement.
- **DMARC present** is a genuine positive but the weakest one: F2 measured ~24% of established organisations without DMARC, so its absence means little — which bounds how much its presence can mean.

## Files changed
- `src/report/assemble.ts` — Trustpilot removed from `positive[]`, with the reasoning at the site
- `src/report/indicator.ts` — the residual's `established` branch split by `spfChecked`
- `src/report/assemble.test.ts`, `src/report/indicator.test.ts` — 3 tests
- `docs/decisions/story-18-3-amendment.md` §5.1 — the characterization above
- this build log

## Gate
`tsc --noEmit` clean · `eslint` clean · `vitest` **191/191** · `next build` clean.
