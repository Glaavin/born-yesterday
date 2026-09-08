# Build log — Story 27 (Beryllium W4): certificates, right-sized

- Branch: `feature/story-27-w4-certificates`   - Base: `develop` @ `67411e2`, **rebased onto** `f989abe` before merge (develop advanced during the build)   - Date (UTC): 2026-09-08
- Type: Source decision + neutral observations. Collector-scoped. **Owner granted an `indicator.ts` exception for the retirement (2026-09-08).** No verdict/state change.
- Authorities: roadmap §5-W4; amendment §3.4.4 (the cap), §5.3 (the coverage gap), the Stage 3a demotion; the §6.4 semicolon lesson.
- Isolation: built in a **separate git worktree** (per the parallel-branch discipline; Story 28/W5 ran concurrently).

## Stage 0 — crt.sh status
**Still down: HTTP 502** (re-checked live 2026-09-08; a sibling query returned 404). The W8 panel would have shown the same, but its probe needs `BY_OPERATOR_KEY`, which the owner had put on hold — so I used a direct reachability check, exactly as the authorities recorded crt.sh's status all along. crt.sh's 502 is a global outage, not egress-specific, so the direct check is dispositive.

## Stage 1 — the decision (confirmed by the owner before building)
1. **SSLMate returns unexpired-only — confirmed live.** For stripe.com the earliest issuance returned is `not_before` 2026-05-14 (~4 months old); 0 expired. It cannot supply a first-cert date from years ago.
2. **No other free CT-history source.** crt.sh (down) is the only free full-history source; alternatives are current-only (SSLMate), paywalled for history (Censys/SecurityTrails — C7), or impractical (raw log querying).
3. **The TLS handshake already gives** issuer, validFrom, validTo, subject O/OU — collected but, before this story, **never rendered** (assemble read only `first_cert_date`). It uses `rejectUnauthorized:false`, so it inspects invalid/expired/mismatched certs too.

**Read, confirmed:** certificate history is unavailable, so first-cert age was **retired**, not re-sourced.

## Stage 2 — the build

**Retired first-cert age.** Removed from `indicator.ts` (exception granted): `CT_INTERPRETABLE_FROM_ISO`, `CERT_AGE_CAP_YEARS`, `certAgeClaim`, `certAgeIsFloorOnly`, and the Green corroboration branch — replaced with a tombstone. Removed the `first_cert_date`/`cert_count` signals from `certs.ts` and the first-cert block from `assemble.ts`. Amendment §3.4.4 updated to record the cap became moot because the *signal* was retired (source unavailable), not because the reasoning changed — the cap logic is preserved for whoever revives CT.

**Double-print resolved by construction.** The two printers both gated on `first_cert_date` — the indicator corroboration branch and the assembler block. Retirement removed **both**. The new current-cert facts print from `assemble.ts` **only** (the indicator has no current-cert branch), so nothing renders twice and the `stated` dedup set needs no `cert` entry. Confirmed by test (`does not render a first-cert-age line even if a stale first_cert_date signal appears`).

**Current-certificate facts, published as neutral observations** (from the TLS handshake): issuer + validity window, and the subject organisation. Own wording, own source, feed no verdict.

**SSLMate added as the second source** (`certspotter.ts`). Architectural redundancy only (Move 05's evidentiary half does not apply — these feed no verdict). **Fall back, not race:** the handshake is strictly richer (org, self-signed, hostname match, which a CT index cannot supply), so racing could hand us the poorer answer; SSLMate backstops issuer + validity when the handshake cannot complete, and is a genuinely independent transport + operator. When it answers, the signal is sourced to "SSLMate Cert Spotter" with a `via SSLMate fallback` note.

**Negative certificate facts — published, wired to nothing.** Expired (computed in `assemble` from `tls_valid_to` vs now), self-signed (issuer == subject, `tls.ts`), and hostname mismatch (RFC-6125 single-wildcard SAN/CN matching, `tls.ts`). All neutral, sourced, and wired to **no verdict / concern / gate** — accumulation redefinition is deferred (ruling #6). **Recorded here as accumulation candidates** for the redefinition story: `tls_self_signed`, `tls_hostname_mismatch`, and the expired-cert derivation. Copy reports the fact, never characterizes it ("Certificate expired 2026-03-04.", "Certificate is self-signed.").

## Corpus delta
**Indicator: 0 state changes, 0 reason-list changes. Assembled: 0 state changes, 0 finding changes.** As the story warned, the corpus carries **no certificate data at all** (§5.3) — every cert check is modelled failed — so the delta is **uninformative in the strong sense**: its zero is *silence, not proof* about every new cert fact. The new facts are exercised by unit tests here and by the production check, not by the corpus.

## Verification (gates, in the worktree)
`tsc --noEmit` clean · `eslint` clean · `vitest` **330/330** (+ new: `certspotter.test.ts`, `tls.test.ts`, reworked `certs.test.ts`, new assemble cert block) · `next build` clean (after a real `pnpm install` — a symlinked `node_modules` in the worktree tripped Turbopack's filesystem-root check; not a code issue).

## Anything that would have needed `indicator.ts`
The retirement itself — granted as an exception. It removes a demoted, never-exercised **observation** (no verdict/state depends on it), which is why the corpus delta is zero. No other indicator change.

## Production check — PENDING (operator key on hold)
Per the story, after promote via the 23.1 operator bypass, paced 6–10 s/domain:
1. Current-cert facts rendered on a live report, quoted.
2. Which source answered (handshake, SSLMate, or both).
3. A negative cert fact — `badssl.com` subdomains (`expired.badssl.com`, `self-signed.badssl.com`, `wrong.host.badssl.com`) if the harness reaches them.
4. Confirm no double-print.

## Files changed
- `src/signals/certspotter.ts` (new) + `certspotter.test.ts` (new) — SSLMate second source
- `src/signals/tls.ts` — `subjectCN`/`altNames`, `parseAltNames`, `isSelfSigned`, `hostMatchesPattern`, `certHostnameMismatch` + `tls.test.ts` (new)
- `src/signals/certs.ts` — crt.sh path removed; TLS primary + SSLMate fallback; current-cert + negative-fact signals; `certs.test.ts` reworked
- `src/report/indicator.ts` — first-cert-age constants/functions/branch removed; tombstone; `indicator.test.ts` retirement test
- `src/report/assemble.ts` — first-cert block removed; current-cert + negative facts published; `assemble.test.ts` cert block
- `docs/decisions/story-18-3-amendment.md` — §3.4.4 retirement note
- `crtsh.ts` kept intact (the W8 panel still imports `crtshUrl`; `fetchCrtsh`/`parseCrtsh` are dormant, for CT revival)
