# Build log — Green establishment: span replaces count

- PR: #TBD   - Branch: feature/establishment-span   - Base: develop   - Status: opened   - Date (UTC): 2026-08-26

Authority: `docs/decisions/story-18-3-amendment.md` §3.4. That section found **all three of Green's establishment routes unsound** and specified archive **span + continuity, operator-guarded** as the replacement.

**Operator continuity is scoped POST-MVP by the owner.** So this story builds *the available fix, not the correct one*, and says so in the report copy rather than hiding it. Continuity (captures across most intervening years) is likewise not built — that is span only, deliberately.

## Files changed
- `src/report/indicator.ts` — span route, cert cap + corroboration, registration demoted, three-case Amber fallback
- `src/report/assemble.ts` — the `positive[]` audit (Part 4)
- `src/report/indicator.test.ts` — 8 new tests; the `established()` fixture now overrides by key
- `docs/mvp-spec.md` §2E.1 — the published rubric rewritten around span

## The four parts

### 1. Span replaces count
`wayback_first` has been collected since Helium and never consumed; the count it sat beside was consumed and measured the wrong thing.

- `establishedByArchive = snapshots >= ESTABLISHED_SNAPSHOT_COUNT` → **`longArchiveSpan = archiveSpanDays >= ESTABLISHED_ARCHIVE_SPAN_DAYS`**
- Guarded on `checked("wayback_first")`. A check that did not complete cannot establish a span, and "no first capture" is not "captured long ago" (§3.2).

### 2. Registration age demoted
`establishedByAge` is gone. Registration age survives **only** in `YOUNG_DOMAIN_DAYS`, which uses it as the valid *upper* bound (§3.4.1).

The §3.4.5 live defect — `Registered ~30 years ago.` published under a **Positive** badge as evidence a 2022 company is established — is removed from `positive[]`. The date is **still published**, as a neutral sourced observation that denies the inference it invites:

> Domain registered 1995-12-20. A registration date records when the domain name was first registered, not when its current operator began using it.

Demoted from evidence to fact, not deleted.

### 3. Certificate age corroborates, capped
- `establishedByCert` is no longer a route. It appears only *alongside* an established span.
- **Capped at `CERT_AGE_CAP_YEARS = 10`, and only for dates CT cannot interpret.** Chrome required CT compliance for certificates issued after **30 April 2018**; earlier ones were grandfathered and logged only voluntarily. So a pre-2018 first-cert date is not a measurement — *"the first certificate was 2012"* and *"the first **logged** certificate was 2012"* are indistinguishable. Published as `over N years`, labelled a floor. Post-2018 dates are interpretable and stated precisely.
- `certAgeClaim()` is exported and used by **both** `indicator.ts` and `assemble.ts` — the cap has to hold in both places or it does not hold at all.

### 4. Claim language
Publish the fact, never the inference:

> Archived since 1996 — the Wayback Machine's record for this domain spans ~30 years.

and, wherever a long span exists at any state, the disclosure:

> Archive history describes the domain name, not whoever runs it now — we don't yet check whether the site has changed hands, so some of this history may belong to a previous owner.

Also audited: the archive-gap caveat said *"the capture count is not established"* (the count is no longer load-bearing); the Amber fallback cited **RDAP** as the source for a claim about establishment — §3.4.5 in its quietest form.

## Draft constants

| Constant | Value | Basis |
|---|---|---|
| `ESTABLISHED_ARCHIVE_SPAN_DAYS` | `365 * 3` | **DRAFT.** Deliberately the retired `ESTABLISHED_DOMAIN_DAYS` value, so the delta reads as one change (*which clock*) rather than two (*which clock* + *how high*). **Not** the decade rule — §3.4.6 says a decade is *sufficient*, not *necessary*. Stage 3 sets the real value. |
| `CT_INTERPRETABLE_FROM_ISO` | `2018-04-30` | **Not a draft.** A fact about the instrument, verified in §3.4.4. |
| `CERT_AGE_CAP_YEARS` | `10` | **Not a draft.** The owner's decade rule (§3.4.6): beyond a decade further precision adds nothing. |

Retired, with a tombstone comment in `indicator.ts` so they are not reintroduced: `ESTABLISHED_DOMAIN_DAYS`, `ESTABLISHED_SNAPSHOT_COUNT`, `ESTABLISHED_CERT_DAYS`.

## Verdict delta (the review gate)

Reconstructed from the 18.2 observations — a controlled diff of indicator logic against fixed inputs.

| | green | amber | blue | red |
|---|---|---|---|---|
| before | 32 | 11 | 6 | 0 |
| **after** | **30** | **13** | **6** | **0** |

**Four domains move. 37 of 49 change their published rationale** — the point of the story.

| Domain | Move | Cause |
|---|---|---|
| `bolt.new` | green → amber | **§3.4.3, fixed.** 449 captures, archived only since 2024-09 — span 2.0y, under the 3y draft. The hyped 2-year-old startup stops passing on crawler attention. |
| `github.com` | green → amber | Wayback failed in the corpus; it had been reaching Green on registration age (2007). Route gone, gap disclosed. **Corpus instrument gap, not production behaviour.** |
| `kexp.org` | green → amber | Same shape (registration 1999). |
| `secondlibrary.com` | amber → green | Registered 2023-10 (under the old 3y age route) but archived since 2014-01 → span 12.6y. **See below — this is the finding.** |

Red is 0 before and after. Blue is the same six either way.

### The recycled-domain cases — the acceptance test

`cursor.com`, before → after:

> **BEFORE** Established domain — registered ~31 years ago.
> **AFTER** Archived since 1996 — the Wayback Machine's record for this domain spans ~30 years.
> **AFTER (caveat)** Archive history describes the domain name, not whoever runs it now — we don't yet check whether the site has changed hands…
> **AFTER (caveat)** Domain registered 1995-12-20. A registration date records when the domain name was first registered, not when its current operator began using it.

`retool.com` is identical in shape (1997 → *"Archived since 1999 … spans ~27 years"*).

Both stay Green, as expected — operator continuity is what would catch them. **The false rationale is gone**: no report now offers prior-owner registration age as evidence a 2022 company is established.

### `secondlibrary.com` — a new instance of the same defect, created by this change

Registered **2023-10-29**. First capture **2014-01-03**. Two captures total, eleven years apart.

It fails §3.4.6 twice over:

1. **No continuity.** *"Captures in 2016 and 2026 with nothing between is two data points a decade apart, not ten years of operation."* Two captures is that case exactly.
2. **The span start precedes the registration date.** Registration is a valid *upper* bound on operating history (§3.4.1) — registered 2023 means the current operator cannot have run the site for more than ~2.8 years. The span says 13. **The sound bound and the published claim disagree, and we publish the unsound one.**

Part 4's disclosure covers it in the copy, which is what this story was scoped to do.

**DECIDED (owner, 2026-08-26): leave it; the warning text carries it.**

The alternative was on the table and was declined: clamping the published span to the registration date where both are known is cheap arithmetic, is §3.4.1 applied rather than a new rule, and does **not** require operator continuity. It is **not** to be implemented as a stopgap. `secondlibrary.com` stays Green on a 12.6-year span with a 2023 registration, and the disclosure — *"we don't yet check whether the site has changed hands"* — is the whole of our answer until operator continuity exists.

The consequence, stated plainly so it is not rediscovered as a surprise: **the report will over-vouch for re-registered domains, and we know it does.** That is a deliberate, disclosed limit, not an oversight. It belongs to the post-MVP operator-continuity work (§3.4.6 / §3.4.7), which is the fix — not the clamp.

### Not exercised by the corpus

**Zero corpus domains carry certificate data** — crt.sh was returning 5xx throughout 18.2, so `first_cert_date` is `failed` for all 49. **Part 3 is covered by unit tests only.** Per `docs/conventions.md`, a clean corpus delta is not proof for paths the corpus cannot exercise; the cap, the floor labelling, and the corroboration branch have never run against real data.

## Amendment defects found while implementing

1. **§3.4.6 specifies the mechanism but not the bar.** "A decade of continuity is categorically sufficient" is a *sufficiency* statement; the span threshold is a *necessity* statement, and the amendment gives no value or basis for it. The draft here is a deliberate placeholder, not a reading of §3.4.6.
2. **§3.4.1's upper bound is stated as a principle and then not applied.** The demotion is specified as *removal* from Green's disjunction; nothing in §3.4 says what to do when the sound upper bound contradicts the span. `secondlibrary.com` is the case, and it appeared the moment span shipped.
3. **§3.4.4's cap is not expressible as written.** *"Expressed as 'over 10 years'"* is unsound for a first-cert date between 2016 and April 2018 — the true age may be under ten. Implemented as `min(floor(actual years), 10)`, which is a lower bound in every case; the amendment's flat phrasing is not.
4. **§3.4.1's principle now has an owner ruling attached.** Defect 2 above is real and stays recorded, but the *response* to it is settled: the sound upper bound is not applied to the span, by decision. Anyone reading §3.4.1 and reaching for the clamp should read the `secondlibrary.com` section first.
5. **§3.4 does not say what an unestablished-because-unchecked domain should publish.** §3.2 answers it (no verdict), but that story is not built, so this degrades to Amber with the gap disclosed and **no main reason at all** — an unsourced reason would break the symmetry rule. `github.com` and `kexp.org` land there. It is honest but thin, and §3.2's no-verdict story is the real fix.

## Known, not fixed (pre-existing)

- **Duplicate archive line in `positive[]`** for Green: the indicator's establishing reason and `gatherPositives`' fact line both name the span. The same duplication already existed for registration age and still exists for SPF; presentation only, and outside this story's scope.
- The Amber generous-default reason renders under a **Flagged** badge. Pre-existing shape.

## Gate
`tsc --noEmit` clean · `eslint` clean · `vitest` 184/184 · `next build` clean · corpus delta above.
