# Build log — Story 26 (W8): dev source panel

- Branch: feature/story-26-w8-dev-source-panel   · Base: develop @ `3d1362a`   · Date (UTC): 2026-09-08
- Type: **Internal instrumentation. Read-only route. No product code change.**
- Ran **concurrently with Story 25 (W2)** on a separate branch/thread.
- **Dismantle item:** this whole `src/app/dev/source-panel/` tree is launch-gated — remove before public launch. Tracked in `docs/ops-tasks.md` → Launch pre-flight; each route file carries a top-of-file launch-gate comment.

## What it is

One env-gated, unlinked, read-only panel that replaces the four disposable source instruments (W0 egress, 23.1 timing query, 23.2 rate-check, Story 24 verification harness). Two halves:

- **A · Live source status** — one button per source fires **one** probe **through `cachedFetch`** and reports outcome / latency / response-shape sanity. Never automatic — no polling, no page-load or timer probes.
- **B · Historical view** — per-signal success rate **by day**, status distribution, generation timing (organic vs operator), and a no-verdict candidate trend — all SELECTs over `signal_history` + the `meta_*` rows 23.1 already writes. No new tables, no new columns.

## The one hard rule: measure the harness, never around it

Every probe rides `cachedFetch` — budget, rate limiter, SSRF guard, deadline. `runProbe(def, fetcher)` is the only outbound path and takes an injected `Fetcher`; the route wires the real harness via `PANEL_FETCHER = cachedFetch`, and a unit test asserts that identity. There is **no raw `fetch`** in the tree, on purpose: the 23.2 correction came from a raw-fetch probe that measured a call path the product never takes. Probes use `ttlSeconds: 0` — live every click (a cache hit would report ~0 ms and describe nothing) and, as a bonus, the harness writes no cache row on ttl 0.

## Security — fails closed, two layers, one operator path

Reuses Story 23.1's single operator path (`BY_OPERATOR_KEY` + `isOperatorRequest`) rather than a second secret — one thing to reason about, one thing to unset.

1. `panelEnabled()` — route-existence gate. `BY_OPERATOR_KEY` unset/empty → page and API **404** (absent; the production default).
2. `panelAuthorized()` — per-request gate. Every probe/query requires the key in the `x-by-operator` header; even with the env key set, an unauthenticated GET 404s. The page shell is inert and carries no data/secret; the operator types the key in and the client attaches it per request — never a URL, never persisted.

**No mutation.** Reads and probes only — asserted, not assumed (below).

## Verification

- **Corpus delta: ZERO.** Empirical: ran `scripts/corpus-verdicts.ts` on a clean `develop` worktree and on this branch — **identical 49-row output**. Structural: `git diff develop` on `indicator.ts` / `derive.ts` / `signals/types.ts` / `docs/calibration` is empty — the corpus reconstructs verdicts from those alone, so a zero delta is guaranteed, not lucky. (Tenth §5.1 instance: the corpus has no latency/concurrency/wall-clock, so it is **uninformative** about this panel, not a pass.)
- **Write-prevention test (asserted, not assumed):** a `SqlRunner` spy captures the SQL text of every history action and asserts each begins with `select`/`with` and contains no mutating keyword; the probe path is asserted to emit **no SQL at all**, use `ttlSeconds: 0`, and never call global `fetch`. See `handler.test.ts`.
- **Gate fails-closed test:** `gate.test.ts` — unset/empty env → absent; missing/mismatched header → closed; exact match → open.
- Unit tests: 14 new, full suite **279 passed**. `typecheck` / `lint` / `build` clean. Both routes build as dynamic (`ƒ`), never prerendered.

## Item 2 — reproduce a known finding (validated pre-promote against the live DB)

Ran the panel's real query functions against production `signal_history` (via `.env.local`, the way the scripts do), so the panel — which calls the identical functions — will show the same:

- **The daily breakdown reproduces W0 item-0's actual lesson.** `wayback_first` status distribution aggregates to **34 failed / 24 ok** — which says nothing about *when*. The by-day view shows the regime plainly: **clean `ok` runs through ~Aug 23, then a wall of failures from Aug 27 onward** (Sep-3: 31 runs, 13 ok / 18 failed). The aggregate hides the regime change completely; the daily view surfaces it. That is the finding item 2 exists to confirm.
- **Honest nuance:** the *exact* W0 vintage numbers ("11 clean, 8 failures, post-B12 recovery") are not literally visible in a 120-day window ending today — the live data has moved past that window and now shows a **fresh `wayback_first` failure regime from late August** (59% failed overall). This is not a new finding — it **corroborates B12** ("the archive check fails more than half the time — measured") and B13 (Wayback fragility), with the panel adding the temporal regime detail B12's aggregate lacked. The panel reproducing a *known* flaw is exactly what item 2 asks for. **Not chased here** (scope held).
- **Item 3 — operator excluded by default: confirmed.** Sep-3 organic timing = **1 generation**; including operator = **22** (min 3197 ms vs organic ~8069 ms). The populations differ and the default excludes the operator one — exactly 23.1's point.

## What I wanted from cached-fetch.ts and did not take

§A asks to show rate-limiter/budget state per host "if cheaply readable". The **configured** ceilings are exported (`HOST_BUDGETS` / `HOST_RATES`) and the panel shows them. The **live** bucket state (tokens remaining, cooldown-until) is module-private in `cached-fetch.ts` (`buckets`, `inFlight`) with no exported accessor — surfacing it would mean editing that file, which this story forbids. So the panel shows the ceilings statically and surfaces a *live* refusal through the probe outcome (`rate-limited` / `budget-exhausted`) instead. **Reported, not routed around.**

## Findings for the register (not fixed here — read-only story)

1. **`signal_history` cannot distinguish `rate-limited` / `budget-exhausted` from an ordinary failure** — recorded as **B14** in `docs/open-items.md`. `SignalStatus` is `ok | failed | not_attempted` (DB check constraint); the harness collapses both refusal codes to `failed` before persistence. So §B's five-way status ask is **three-way historically**; the two refusal codes live only in the live-probe half. Needs a schema/persistence change — out of scope for a read-only story.
2. **`wayback_first` failure regime, late Aug onward** — corroborates **B12** (archive check fails >half the time) and **B13** (Wayback fragility); no new register entry needed.
