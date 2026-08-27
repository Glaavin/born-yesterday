# Build log — Story 18.3 sweep: parsers distinguish unparseable from empty

- PR: #48   - Branch: feature/parser-status-sweep   - Base: develop   - Status: opened (CI green)   - Date (UTC): 2026-08-24

The fourth and (for `src/signals/`) final layer of one defect. Rounds one through three fixed it in the indicator, in `signal_history`, and in per-capture fetch. Round three found it **in code round two had just fixed** — the fetch path was corrected while the parse path still published the same false claim.

## The single pattern

Every instance had the same structure:

> **a status flag derived from the FETCH, plus a parser that swallowed its own failure into a benign default.**

The status said `"ok"` because the HTTP call returned 200; the parser silently reported "nothing found." Locally each looked correct, which is why it survived three passes.

## Files changed

**7 parsers** — return `null` for an unparseable payload, distinct from a parsed result whose fields are null because the data was genuinely absent:
- `wayback.parseCdx`, `doh.parseAnswers`, `crtsh.parseCrtsh`, `rdap.parseRdap`, `whois.parseWhois`, `trustpilot.parseTrustpilot`, `ai-keywords.matchAiTerms`

**5 call sites** — derive signal status from **parse** success, not fetch success:
- `ai-pivot.ts`, `dns-signals.ts`, `certs.ts`, `domain-identity.ts`, `reputation.ts`

**Convention** — recorded in `docs/conventions.md` ("Observation failure is not absence"), including the robots.txt carve-out.

## The two that were shipping harm

**`parseCdx` → `ai-pivot`.** A 200 carrying a malformed/truncated body set `cdxChecked = true` *before* parsing, so `count` stayed `0` and the report published **"0 archived captures"** as a checked fact, with a Wayback source. This is the identical false statement the earlier hotfix removed, reachable through the parser instead of the fetch.

**`parseAnswers` → `dns-signals`.** Verdict-bearing. `st(q)` read `q.ok` from the fetch, so a malformed DoH body published as **"SPF/DMARC absent, checked"** — feeding both the `!spf && !dmarc` concern point and the Green gate. A parse error could deny a domain Green and push toward Red. It compounds C1, which already denies Green to ~24% of established organisations for adoption lag.

`parseAnswers`' own docstring stated the collapse out loud — *"[]/empty on NXDOMAIN/empty/malformed"*. It was deliberate, documented, and looked correct. **Nobody was wrong; there was no rule to be wrong against.** That is the argument for the convention.

## Verdict deltas: NONE — and why

Checked structurally rather than assumed. **The indicator and assembler read signal VALUES only (12 reads); neither reads `status`.** So a corrected status cannot move a verdict today.

Two values did change, and both are verdict-neutral:

| Value change | Indicator effect |
|---|---|
| `wayback_snapshot_count.valueNum`: `0` → `null` on a malformed CDX | `fewSnaps` (`0 < 5` true / `null` true) unchanged; `establishedByArchive` (`0 >= 50` false / `null` false) unchanged |
| `ai_language_current.valueText`: `"Does not mention AI"` → `null` on a failed scan | Nothing downstream reads this signal. Removes a false claim. |

Everywhere else the value was already `null` and remains `null`; only `status` and `source` changed. All 170 pre-existing tests pass unchanged, which is the empirical check on the same claim.

**What this means for Q4/Q6:** the sweep makes the correct verdict changes *possible* without making them. Domains currently denied Green by a parse error still are — the corrected status is now available for the deferred rule decisions to consume, and that is where those verdict changes will land, under review.

Sources also improve: a signal whose check failed now carries `source: null` instead of citing a query we never successfully parsed.

## Clean paths found during the audit — the shape the sweep should produce

Worth keeping, because they show the plumbing already works where it was applied:
- **`threats.ts`** sets `"failed"` explicitly on a DB hiccup, with a comment saying why.
- **`cacheGet` / `isThreatHostListed` do not catch at all** — a DB error propagates rather than returning "not found" / "not listed". So **a database hiccup cannot make a listed host look clean.**
- **`parseUrlhaus`** collapses a parse failure into *not-checked*, which is the safe direction.
- `queries.ts` `?? 0` are SQL `COUNT` aggregates; `extractHost` handles junk *input*, not failed observation.

## Carve-out applied
`robotsAllows` (`cached-fetch.ts`) treats an unfetchable `robots.txt` as permitting the crawl. Exempt under the convention's carve-out: an external standard defines the meaning of absence there. The standard is cited at the call site.

## Gates
- lint | typecheck | test (176, +6) | build: **pass**
- 6 new tests, each pinning the new contract; the 3 tests that asserted the old "malformed → benign" contract were rewritten rather than deleted.
