# Build log — Story 19.1: the neutral-facts channel

- PR: #TBD   - Branch: feature/story-19-1-neutral-channel   - Base: develop   - Date (UTC): 2026-08-27
- Type: **Report shape change.** Indicator untouched; assembler, renderer, serve boundary.
- Authority: owner rulings 2026-08-27 (amendment §9 rows 18.3.46–50, `docs/open-items.md` B7).

## The defect it closes

The report had two finding channels. A fact that was neither concerning nor reassuring landed in `positive[]` by default, so the **"Positive findings" heading asserted favourability over it.**

The sharpest case: a capture count under a **Positive** badge told the reader that being crawled a lot is reassuring — which §3.4.3 explicitly denies. **That is §3.4.5's defect surviving in the LAYOUT after we had removed it from the prose.** We retired the constant, rewrote the rationale, and the heading went on making the claim. A heading cannot be worded out of asserting something; it needs somewhere else to put the fact.

## Classification — routing, never a rule

Nothing here decides whether a finding fires, only where it publishes.

| Finding | Channel |
|---|---|
| SPF present · DMARC present | **POSITIVE** |
| **Archive span** | **POSITIVE when it is the published reason for Green; NEUTRAL otherwise** |
| Capture count · Trustpilot rating · certificate age · clean threat check | **NEUTRAL** |
| Registration date · AI-language date · DMARC absent | **NEUTRAL** (sourced observations) |
| Blue's two reasons | **NEUTRAL** |
| Concerns · threat listings | **FLAGGED** |

### The context-dependent one, and why it is not a fudge

The same sentence means three different things:

- `cursor.com` — Green. The span **is** the establishing evidence. → POSITIVE
- `bolt.new` — Amber. *"Archived since 2024"* is precisely **why it is not Green**. → NEUTRAL
- `secondlibrary.com` — registered 2023, archived since 2014. **Actively misleading** (§3.4.8). → NEUTRAL

The assembler already knows the verdict, so this stays routing. **Verified in the delta:** the identical string now publishes under Positive for `cursor.com` and under "What we found" for `bolt.new`.

### Trustpilot is restored to the report

Hotfix #64 withheld it rather than publish it under a false heading. It is back, in the neutral channel, **with no direction check and no framing** — both `1.8/5` and `4.6/5` land in the same section, which *is* the discipline. `reputation.ts`: *"we count and link, we don't judge."*

### The clean threat check moved because the code already said so

`indicator.ts`: *"a clean threat check is information, NOT a strong 'safe'."* `assemble.ts`: *"included as info."* **The code said "info" in two places while the layout said "positive".** Now they agree.

## §3.2's two disciplines finally get two homes

Caveats now split by **source**, and the split is **structural rather than conventional**:

| | | destination |
|---|---|---|
| **OBSERVATION** | sourced, describes the domain | the neutral channel |
| **DISCLOSURE** | unsourced, describes our limits | the summary note |

**Nothing new had to be invented to tell them apart.** The symmetry rule (§6.2) already forbids publishing an unsourced reason as a finding, so the invariant was load-bearing already — it simply had nowhere to route to.

This is what §3.2 wanted a `subkind` field for (register item **A3**), and it is worth deciding deliberately whether A3 still needs building rather than letting it lapse.

## The summary note shortened, as predicted

| | mean | worst |
|---|---|---|
| before | **3.9** sentences | **6** |
| after | **2.8** | **4** |

**51 sentences moved out of the note across 49 reports.** Every sentence that left is about the **domain**; every one that stayed is about **us**.

`cursor.com` before and after:

> **before** *…Note: PhishTank and URLhaus were not reachable… Public review presence was not checked… Archive history describes the domain name, not whoever runs it now… **Domain registered 1995-12-20. A registration date records when the domain name was first registered, not when its current operator began using it.***
>
> **after** the note ends at the operator disclosure, and the registration date appears under **What we found**.

## Cached reports — the (a)-only ruling

`neutral` is optional on the `Report` type and always written by the assembler. Reports cached before this have no such field, and `reports.schema_version` is **written but never read** (A2), so nothing regenerates them.

**Normalised in `parseReport` — the one place a stored report re-enters the app.** A missing field is handled once, where the old shape actually arrives, rather than by every consumer remembering. `page.tsx` keeps a `?? []` as the belt to that braces.

**`SCHEMA_VERSION` was not bumped**, per the ruling: nothing reads it, so it would have written a different integer that no code compares.

## Renderer

A third section, **"What we found"**, with an **Observed** badge in neutral tokens — deliberately no signal colour, since the entire reason the channel exists is that a badge asserts something the fact does not.

Two smaller things:

- **Blue's `flagged[]` is now empty**, so its overview would have shown no finding at all. The overview falls through to the first neutral finding when there is neither a flagged nor a positive one.
- **The `unestablished` kind is retained** — not dead code. Reports cached before 19.1 can still carry Blue reasons in `flagged[]`, and they must not render as concerns.

## Verdict delta

| | green | amber | blue | red |
|---|---|---|---|---|
| before | 32 | 11 | 6 | 0 |
| after | 32 | 11 | 6 | 0 |

**Zero state changes. Zero path changes. Zero indicator-reason changes** — 19.1 is assembler and renderer only, and the delta says so rather than being asserted. Path coverage unchanged at 5 of 9, which is the evidence that classification did not disturb the other paths.

## Not done

**Blue's copy still uses the colon** — *"Too little public footprint to assess yet: registered ~1 day ago."* That is Story 19.2 item 1, and it is exactly why 19.2 anchors after this one: fixing the colon first would have left an established fact under a "Couldn't establish" badge. In the neutral channel that mismatch cannot arise.

## Files changed
- `src/components/report-state.ts` — `Report.neutral`, and the Copy action's third section
- `src/serve/serve.ts` — normalise the cached shape at the boundary
- `src/report/assemble.ts` — `gatherPositives` → `gatherFindings`; the caveat split; Blue routing
- `src/app/r/[domain]/page.tsx` — the section, the badge, the Blue overview fallback
- `src/report/assemble.test.ts`, `src/serve/serve.test.ts` — 6 new tests
- this build log

## Gate
`tsc --noEmit` clean · `eslint` clean · `vitest` **206/206** (201 → 206) · `next build` clean · corpus unchanged.
