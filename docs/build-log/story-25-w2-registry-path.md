# Build log — Story 25 (Beryllium W2): registry path, transfer fact, Reincarnation Check

- Branch: `feature/story-25-w2-registry-path`   - Base: `develop` @ `50d2ac2` (Story 26 / W8 merged first, #119; branch point recorded at session start was `3d1362a`, before that merge)   - Date (UTC): 2026-09-08
- Type: Source change + neutral facts. Collector-scoped. **No rule change, no state change.**
- Authorities: roadmap §5-W2; amendment §3.4.1 (the upper-bound asymmetry), §3.4.8, ruling 18.3.27; the W0 latency measurements; the §6.4 semicolon lesson.

## What shipped

### Part 1 — Direct-registry RDAP, rdap.org demoted to the middle tier
`fetchRdap` is now a three-tier chain, all riding the existing harness (`kind:"third-party"`):

1. **Direct registry** — resolve the authoritative RDAP base from the IANA bootstrap (`data.iana.org/rdap/dns.json`, cached 7 days) and query it directly. W0 measured this ~3–7× faster than the middleman (Verisign 14–73 ms vs rdap.org 96–235 ms); the bootstrap is one file for every TLD, so per-lookup registry resolution is effectively free.
2. **rdap.org** — kept, not dropped (roadmap §5-W2: seven verified calls is thin evidence across ~1,500 TLDs, and the fallback costs one config entry). Used when the TLD is absent from the bootstrap, the direct query fails, or the bootstrap itself is unreachable.
3. **WHOIS port-43** — unchanged, still owned by `domain-identity.ts`.

`parseBootstrap` / `registryBaseForTld` / `directRdapUrl` are pure and unit-tested offline. `parseBootstrap` prefers the `https` base when a service lists both.

**Uncovered TLDs behave exactly as before.** `.edu` and several ccTLDs are absent from the bootstrap → tier 1 is skipped → rdap.org → WHOIS. A registry that answers without a creation date stays a *checked-empty* finding (`status:"ok"`, sourced to the record consulted); a lookup that did not complete stays `failed`. Neither collapses into "no date" — the observation-failure convention holds. So this story does not touch the known `.edu`/ccTLD gap and does not make it worse.

**Displayed source link is unchanged** (`rdap.org/domain/<name>`): it is a stable, canonical, user-clickable RDAP link that redirects to the same registry we query directly. Which tier actually answered is returned by `fetchRdap` (`tier`) for the production latency report, not surfaced in the report copy.

### Part 2 — The `transfer` event as a neutral dated fact
`parseRdap` now also extracts the **most recent** `transfer` eventDate. `domain-identity.ts` emits a new `domain_transfer_date` signal (RDAP-only — `parseWhois` does not read transfers, so a WHOIS-only answer marks it `failed`, never `ok`-empty). `reregistration`/`reinstantiation` are **not** read (0 of 7 registries emit them — roadmap §5-W2).

The assembler publishes it, additively, as a bare neutral fact:

> **"Registrar transfer recorded 2010-08-19."**

A transfer means the sponsoring registrar changed — same owner relocating, or a sale; we don't know which, and the copy composes nothing (the §6.4 semicolon lesson: no companion clause). It feeds no verdict. **Absence is never rendered** — the line fires only when a date exists.

### Part 3 — The Reincarnation Check
Where an archive presence genuinely precedes registration (both dates `status:"ok"`), the assembler publishes the dated **pair** as two independent, sourced neutral statements, no connective:

> **"Registered 2023."**  ·  **"Archived pages exist from 2014."**

This is the owner's approved E2 resolution (ruling 18.3.27): it *publishes a fact* rather than *suppressing Green*, which the declined registration-date clamp would have done. **The span is not suppressed** — on a Green report it remains the establishing evidence in `positive[]`; the check only adds the neutral pair.

- **Dedup, not restatement.** The registration date already reaches neutral as the indicator's demoted observation on domains ≥1 year old, and on a non-Green report the archive line is already in neutral too. Each half is added only when it is not already present (the same `alreadyStated` discipline the copy pass established), matched by **source**, not by shape. So nothing prints twice — while a recently re-registered domain, which carries neither line yet, still gets the full pair.
- **Either instrument.** Wayback supplies the earliest capture date when it has one; otherwise Common Crawl's point-in-time presence does, in **CC's own wording** ("Present in Common Crawl's February/March 2024 crawl."), never Wayback's span sentence (Story 24's rule). Selection takes the *earliest presence that precedes registration* across instruments, so the better date wins rather than a fixed order.
- **Neutral, no framing.** No "despite/however/but". It denies nothing and establishes nothing.

## Corpus delta — the gate

| | green | amber | blue | no-verdict |
|---|---|---|---|---|
| indicator tally | 32 | 9 | 6 | 2 |

- **Zero state changes** (assembled corpus delta, all 49 domains). `indicator.ts` and `cached-fetch.ts` are byte-for-byte untouched (`git diff` empty); `assemble.ts` is **purely additive** (zero lines removed).
- **Finding changes on exactly two domains**, both the Reincarnation archive half added to the neutral channel:
  - `secondlibrary.com` (Green): `+ "Archived pages exist from 2014."`
  - `perplexity.ai` (Green): `+ "Archived pages exist from 2021."`
  Registration half correctly *reused* on both (the indicator's observation is already in neutral), so no duplication.

**What the corpus delta cannot say (blind spots, stated deliberately):** the corpus carries no RDAP `transfer` events and models Common Crawl as absent for every domain. So the delta is **uninformative** about the `transfer` fact and the CC-instrument reincarnation path — both are exercised only by unit tests here and by the production check. It *does* exercise the Wayback-instrument reincarnation pair.

## Decisions and things that were hard to build as written

1. **"Material margin" vs "genuinely precedes" — RESOLVED (owner, 2026-09-08): no floor, keep strict precedence.** Roadmap §5-W2 said "material margin"; the story said "genuinely precedes." A floor would be a materiality judgment — deciding some *true* facts are not worth showing — which is what this epic refuses to assert (`PIVOT_RECENT_DAYS` is the cautionary case). The pair makes no claim a threshold would protect: two dated facts side by side, no verdict; a reader seeing a small gap correctly reads a small inference. No number is needed. I was right not to invent one.
   - **The `perplexity.ai` quirk, characterized (owner ask).** Its earliest capture (2021-12-18) is an *"Apache2 Ubuntu Default Page: It works"* — a bare, un-provisioned server, not prior-owner content and not a parked-sale page. So the domain was registered and resolving before the RDAP creation date of 2022-07-08 (GoDaddy): a **registration-record / timestamp artifact** (the RDAP date under-reports true first registration), NOT prior-owner content and NOT a redirect. Fetched live from the capture — evidence, not inference.

2. **The pair overlaps facts already published, and rendering it cleanly would need the indicator.** Both dates already render somewhere (registration in neutral; archive in `positive[]` on Green, neutral otherwise). Under additive-only + no-`indicator.ts`, the only fully clean rendering — suppressing the generic registration caveat and re-routing Green's archive establishing reason to neutral when the pair fires — requires touching `indicator.ts` and the positive-routing. The source-matched dedup gets us to **one added line on the Green cases with no duplicate**, which is as clean as the discipline allows. On a Green reincarnation the archive date does appear in both `positive[]` (vouching) and `neutral[]` (the pair) — this is *inherent to "do not suppress the span, publish the pair"*, not a defect (owner concurs, 2026-09-08). **Logged as B7a** in `open-items.md` alongside B7: the same problem — the archive fact's channel is decided by which verdict claimed it first, not by role — so Story 20's presentation pass sees one problem, not two.

3. **CC-absence synergy — CLOSED, not deferred (owner, 2026-09-08).** A standalone "not present in Common Crawl" line is absence-as-evidence (rejected everywhere); composing it into "recycled, corroborated by CC absence" is prohibited. **Story 24's own finding retires it**: CC coverage correlates with prominence, so CC absence is weak evidence of anything — using it as corroboration would lean on the exact property recorded as unreliable. The roadmap proposed it; Story 24 killed it. Recorded as a standing "do not rediscover" instruction in `open-items.md` §E.7.

4. **Panel labels corrected for the inverted hot path (owner rebase note).** Story 26's `src/app/dev/source-panel/probes.ts` tagged `direct-registry` and `iana-bootstrap` as `diagnostic` and `rdap.org` as the primary `wired` source — which this story inverts. Updated: `direct-registry` → `wired` (now primary), `iana-bootstrap` → `wired` (now consulted every lookup, cached, to resolve the registry), `rdap.org` stays `wired` but its note now says *fallback tier*. Verified 26.1 does not touch `probes.ts`, so this story owns the correction. The panel mislabelling the hot path is the exact failure the wired/diagnostic tagging exists to prevent.

## Not in this story (unchanged)
Any indicator/rule change · operator continuity beyond the `transfer` fact · `reregistration`/`reinstantiation` · `collectAll` latency · W5/W6/W8.

## Production check — PENDING promote
Requires the code deployed (the four items validate this story's code, which only exists after promote), using the operator bypass per 23.1 (set, run, remove, confirm closed), paced 6–10 s/domain per 23.2:
1. Direct-registry latency vs the rdap.org baseline, from production.
2. A domain where the fallback chain drops a tier — report which tier answered.
3. At least one `transfer` fact rendered, quoted (candidate: `eff.org`, transfer 2010-08-19).
4. The Reincarnation pair rendered (`secondlibrary.com` is the known case).

## Gate
`tsc --noEmit` clean · `eslint` clean · `vitest` **303/303** · `next build` clean · corpus delta **zero state changes**, reason changes only where the pair fires.

## Files changed
- `src/signals/rdap.ts` — three-tier chain; `parseBootstrap`/`registryBaseForTld`/`directRdapUrl`/`fetchRdapBootstrap`; `parseRdap` gains `transferDate`
- `src/signals/domain-identity.ts` — emits `domain_transfer_date` (RDAP-only, status-gated)
- `src/signals/common-crawl.ts` — exports `CC_THRESHOLD_ISO` (machine date for the CC reincarnation path)
- `src/report/assemble.ts` — **additive**: transfer neutral line; `appendReincarnationPair`
- `src/app/dev/source-panel/probes.ts` — corrected wired/diagnostic labels for the inverted RDAP hot path (owner rebase note)
- `docs/open-items.md` — B7a (the reincarnation double-print, alongside B7); §E.7 (CC-absence-as-corroboration CLOSED)
- `src/signals/rdap.test.ts` (new), `src/signals/domain-identity.test.ts`, `src/report/assemble.test.ts` — coverage
- `scripts/corpus-verdicts.ts` — export `build`/`NOW`, guard `main()` on direct invocation
- `scripts/corpus-assembled.ts` (new) — assembled-report corpus delta harness (the neutral-channel delta `corpus-verdicts.ts` cannot see)
