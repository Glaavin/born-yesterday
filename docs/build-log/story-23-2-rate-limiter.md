# Build log — Story 23.2: per-host rate limiter

- Branch: feature/story-23-2-rate-limiter   - Base: develop   - Date (UTC): 2026-09-04
- Type: **Shared harness infrastructure. Defect fix against Story 23.** No rule/threshold/verdict change.
- Gates: Story 24 Stage 2's production verification.

## The defect

Story 23's budget is **per-host concurrency** — one call in flight. Both archive hosts rate-limit **per minute**. Story 24 Q1 measured it: **7 sequential CC calls tripped a 503**, every one satisfying the concurrency budget. The budget measures the wrong dimension.

## 1 · Algorithm — token bucket per host, alongside the concurrency budget

A token bucket composes naturally with what is there: the **budget gates the instantaneous slot**, the **bucket gates the rate**. Both apply. Refills continuously at `ratePerMin`; `burst` is capacity. State is a module-level `Map<host, {tokens, lastRefillMs, blockedUntilMs}>`, keyed by host exactly like the concurrency `inFlight` map, and cleared by the same `__resetBudgets` test hook.

Time comes from the injectable `deps.now`, so the refill is deterministic under test rather than wall-clock-dependent.

## 2 · Per-host values — all REASONED, err slow

| host | rate | burst | basis |
|---|---|---|---|
| `web.archive.org` · `archive.org` | 15/min | 3 | **REASONED** — the `wayback` lib dropped to 24/min (June 2026) to match Wayback's hard limits; we sit below it. Exceeding earns an hour-long firewall block, so err slow. |
| `index.commoncrawl.org` | 10/min | 2 | **REASONED** — limit unpublished; one observation (503 at 7 sequential). 10/min is conservative below that single sample, explicitly **not** read as "the limit is ~10". |
| everything else | none | — | DNS/RDAP/threat feeds have shown no rate problem; the mechanism accepts a per-host config so adding one later is a config change. |

We have **no measured limit for either host** — only one observed trip. REASONED is the honest label, per the prompt.

## 3 · Requirement 5 — does waiting count against the 8 s deadline?

**It cannot, because the limiter never waits.** If no token is available it returns `rate-limited` **immediately** — it does not block. This is the same decision, for the same reason, as Story 23's concurrency budget: a call that blocked for a token and then ran would still be in flight when the 8 s deadline fired and would surface as a **`timeout`** — the exact conflation the distinct status exists to prevent.

Pacing across a burst is therefore achieved by **declining** the over-rate call — the host never receives it, so the 503 / firewall block never triggers — **not** by holding it. "No 503" comes from not sending the call, whichever way; failing fast is the deadline-safe way.

## 4 · Backoff — a 429/503 arms a cooldown; never retry into it

A 429/503 from a rate-configured host feeds back via `armRateCooldown`: it sets `blockedUntilMs`, during which every call to that host defers (`rate-limited`) without being sent.

- **429 → 5-minute hard stop** (`RATE_429_COOLDOWN_MS`, REASONED — err long). 429 is the escalating signal: continuing past it earns the hour-long firewall block that doubles on repeat. So a 429 stops the host cold for a meaningful interval.
- **503 → 1-minute stop** (`RATE_503_COOLDOWN_MS`, REASONED). The softer "slow down".

**Never retried.** The existing retry loop treated 429/5xx as retryable; for a rate-configured host that is now intercepted — arm the cooldown, return the http error, **one attempt**. Retrying into a 429 is precisely what earns the block. Non-rate hosts keep the old retry behaviour untouched.

## 5 · Tests — 7 new, 5 confirmed failing first

Failing against pre-change code (rate check + 429-feedback neutralised):
- (burst+1)th call is deferred, not sent
- a token refills after enough time
- `rate-limited` distinguishable from `budget-exhausted` and `timeout`
- a 429 arms a cooldown; the next call defers even with tokens
- a 429 is not retried (one attempt)

**Guards** (pass either way, named as such): an unconfigured host is unaffected; every rate config carries a basis + reason. And the **whole prior suite (243) still passes**, which is the assertion that the concurrency budget's Story 23 behaviour is unchanged.

Deterministic clock via injected `now`, so no wall-clock flake.

## 6 · Corpus delta — zero, uninformative

Green 32 · Amber 9 · Blue 6 · no-verdict 2, unchanged. **The corpus has no wall-clock, no concurrency, no rate** — it cannot exercise this. Ninth §5.1 instance.

## 7 · Production check
The seven-call CC sequence that tripped the 503, re-run through the limiter: expect the first `burst` to go out, the rest to return `rate-limited` (not sent), and **no 503**. Via the 23.1 operator bypass; key removed after.

## 8 · Does Story 24 Stage 2's verification run unpaced now?
Answered after the production check.

## Per-instance limitation, stated
Same as the concurrency budget: serverless memory is ephemeral, so this bounds **one warm instance**, not the fleet. That is the exact scenario that tripped the 503 and the one Story 24's verification reproduces; a fan-out across many cold instances is not bounded, and cannot be without shared state we are not adding pre-traffic.

## Gate
`tsc` clean · `eslint` clean · `vitest` **250/250** (243 → 250) · `next build` clean.
