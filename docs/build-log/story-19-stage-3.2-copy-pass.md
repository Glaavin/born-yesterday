# Build log — Report presentation and copy pass (pre-Story-20)

- PR: #TBD   - Branch: feature/report-copy-pass   - Base: feature/pivot-observation-only → develop   - Date (UTC): 2026-08-26
- Type: **Presentation and copy. No rule changes, no verdict logic.** Zero state changes confirmed.

Four known presentation defects, fixed before Story 20 describes them.

## Item 1 — the semicolon

**Before:**

> *"Domain registered ~36 years ago; AI language first appeared in sampled archive captures ~2 days ago (approximate — earliest sampled snapshot, not provably first)."*

**After** — one statement, one subject, no connective, and the registration half removed entirely rather than deduplicated:

> *"AI language first appears in a sampled capture from 2026-08-22 (approximate — earliest sampled snapshot, not provably first)."*

The registration date publishes separately and once, from the indicator's own registration observation:

> *"Domain registered 1990-10-10. A registration date records when the domain name was first registered, not when its current operator began using it."*

**Also fixed: the sentence was sourced to the wrong instrument.** It took `sources[0]` — **RDAP** — which evidences the registration half we just removed. It now cites the Wayback capture that actually matched. `Pivot` gained a `source` field for the statement; `sources` is unchanged and still feeds the Sources tab.

Less punchy, as expected. The punch was the argument.

## Item 2 — registration age stated twice

**Gone, not deduplicated.** The pivot sentence no longer references registration at all, so there is nothing to collide with. Confirmed in the rendered output above: `eff.org`'s note states the registration date exactly once.

## Item 3 — the residual under a "Flagged" badge

`Reason.kind` gains `"residual"`. Amber's generous default routes to the **summary**, never to `flagged[]`, and is never counted.

**Before:** *"Surfaces 15 public signals for bolt.new; **1 worth a closer look**."* with the reason badged **Flagged**.

**After:**

> *"Surfaces 15 public signals for bolt.new; **nothing flagged. We couldn't establish enough archived history to vouch for this domain yet.**"*

**Routing change, not a shape change** — `Report` is untouched, and `page.tsx` needed nothing: with `flagged[]` empty there is no wrong badge to relabel.

**Copy discipline applied, same as Blue.** Both variants were reworded to describe what *we* could not determine:

| | before | after |
|---|---|---|
| not established | *"Some positive signals, but the archived record doesn't reach back far enough to fully vouch yet."* | *"We couldn't establish enough archived history to vouch for this domain yet."* |
| established, no SPF | *"Established archive history, but some expected signals (e.g. SPF) are missing."* | *"Archived history is established, but we couldn't confirm the email-authentication records we look for."* |

Note the first pair also removed a **"but"** — the same connective-implying-contrast problem as item 1, in the residual.

## Item 4 — the span named twice

Same artifact as item 2, as suspected. The indicator's establishing reason now carries the capture count as trailing context, and the assembler suppresses what the indicator already stated.

**Before:** *"Archived since 1996 — … spans ~30 years."* **and** *"Archived on the Wayback Machine since 1996 (6687 captures recorded)."*
**After:** *"Archived since 1996 — the Wayback Machine's record for this domain spans ~30 years (6687 captures recorded)."*

**Suppression, not string-matching on output** — `gatherPositives` takes an `alreadyStated` set so the two copies cannot drift into disagreeing about which is authoritative.

**The identical SPF pair was deduplicated too** (*"Email authentication configured (SPF present)."* + *"SPF email-authentication record present."*). Not named in the brief, but the same artifact, one line of the same mechanism, and leaving a known twin in place is how the small instance comes back.

**Unplanned benefit:** `secondlibrary.com` now reads *"Archived since 2014 — … spans ~13 years (2 captures recorded)."* The count, demoted from headline to context, now does useful work: it exposes how thin the evidence behind a 13-year span is (§3.4.8).

## Verdict delta

| | green | amber | blue | red |
|---|---|---|---|---|
| before | 32 | 11 | 6 | 0 |
| **after** | **32** | **11** | **6** | **0** |

**Zero state changes.** 37 domains change reasons, in exactly the four expected classes: 28 archive lines gain the count, 4 residuals reworded, 2 pivot sentences replaced, and the corresponding positives deduplicated.

## Nothing needed a rule or shape change

`Report` is untouched. `page.tsx` is untouched. No collector, no threshold, no verdict logic.

## Item 5 — other places where facts are composed into an argument

Reported, not fixed. Story 20 needs these named.

**(a) Blue's reasons use a colon the way the pivot used a semicolon.**

> *"Too little public footprint to assess yet: registered ~5 months ago."*

The colon means *because*. We state our conclusion, then supply the fact as its ground — which is the same authorship the semicolon performed, and it is doing it in the state whose whole point is that we reached no conclusion. It is milder, because insufficiency is not adverse and the copy is already about us. But it is the same construction.

**(b) The summary's tally is a judgment inside a sentence documented as factual.**

`assemble.ts` says the summary is *"FACTUAL (counts only, no judgment)."* It ends *"none worth a closer look"* — **"worth a closer look" is an editorial judgment**, and on Amber it is the only characterisation the reader gets. Blue was given its own phrasing precisely because this one carried judgment; the same objection applies to the phrase generally.

**(c) The "Positive findings" heading asserts favourability over facts that are merely neutral.**

Anything routed to `positive[]` is published under a **Positive** badge. That framing is itself a claim, and it is doing the composing that the copy no longer does. *"Archived on the Wayback Machine since 2024 (449 captures recorded)"* under a Positive badge asserts that a high capture count is reassuring — which is precisely what §3.4.3 says it is not. **This is the §3.4.5 defect surviving in the layout after being removed from the prose.** It cannot be fixed by wording; it needs a neutral-facts channel, which is a report-shape change and therefore out of scope here.

**(d) Amber with no rationale at all**, unchanged and previously reported: `github.com` and `kexp.org` show *"Some concerns"* alongside *"none worth a closer look"* when the archive check failed. §3.2's no-verdict outcome is the intended fix.

## Files changed
- `src/report/derive.ts` — the pivot statement split; `Pivot.source` added
- `src/report/indicator.ts` — pivot cites the capture; residual kind + copy; Green's reason carries the count
- `src/report/assemble.ts` — residual routing, tally, `alreadyStated` suppression
- `src/report/indicator.test.ts`, `src/report/assemble.test.ts` — fixtures + 2 new tests
- this build log

## Gate
`tsc --noEmit` clean · `eslint` clean · `vitest` **188/188** · `next build` clean · zero state changes.
