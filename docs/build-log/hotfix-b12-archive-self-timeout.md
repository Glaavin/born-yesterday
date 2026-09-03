# Build log — Hotfix: the archive collector was blowing our own deadline (B12)

- Branch: fix/b12-archive-self-timeout   - Base: develop   - Date (UTC): 2026-09-02
- Type: **Hotfix. One collector, plus the rule's input signal.** No threshold or rule changed.
- Follows: Story 22 (W0). Closes the live half of **B12**.

## What W0 established

archive.org was never refusing us. **The full-CDX fetch takes 4–14 seconds from production against our own 8-second collection deadline**, and had been failing since 27 August. The check was not blocked; it was too slow to fit in the budget we set.

## The distinction that caused the brief's one wrong premise

The brief said the capture count *"is a neutral observation per 19.1; its absence must not affect any verdict — verify nothing reads it."* It does.

> **19.1 classified where the count RENDERS. It said nothing about what the RULE reads.** Those are different questions and the vocabulary invites conflating them: a finding can be neutral in the report and load-bearing in the rubric at the same time. `wayback_snapshot_count` was both.

Verified by measurement, not argument — setting the count to `not_attempted` in the corpus harness:

| | green | amber | blue | no-verdict |
|---|---|---|---|---|
| before | 32 | 9 | **6** | 2 |
| count removed as briefed | 31 | 8 | **0** | **10** |

**Blue goes to zero** — the modal verdict for the modal query, and the state the product is named after. It reads `thinArchive`, and it is a named conjunct in Story 21's no-verdict predicate, so an unknown count makes Blue *undecidable* rather than merely unreachable.

## The change

**Two bounded CDX calls replace one unbounded one.**

| | call | answers |
|---|---|---|
| 1 | `&limit=5` (ascending) | the **first capture** and **`count < THIN_SNAPSHOT_COUNT`**, exactly |
| 2 | `&fastLatest=true&limit=-1` | the **last capture** |

Fewer than five rows *is* the exact count. Exactly five means "at least five" — which is everything the thinness rule ever needed.

**New signal `wayback_thin_archive`** (`Thin` / `Not thin`, ok/failed/not_attempted). `thinArchive` and the Story 21 conjunct both remap to it. `wayback_snapshot_count` publishes **only when exact**; otherwise `not_attempted` with a note deferring it to W1 enrichment.

### Why a boolean and not a floored number

**`signal_history` is append-only.** A floored `valueNum` writes literal `5`s into the permanent record for domains with four thousand captures — fake counts sitting beside real ones, with nothing in the row to tell them apart, forever. The moat is only worth having if every number in it is real.

So: **never print a non-exact count, and never store one.** No "at least 5" copy anywhere. The thinness *answer* travels as a boolean; the *number* stays exact or stays silent. Asserted at the writer, not just the collector — `signalsToHistory` is covered by a test.

### The AI-onset scan: a guard, not a comment

Sampling captures needs the full list we no longer fetch, and W0 saw the **second consecutive CDX call hang for 30 seconds** — a per-capture fan-out is exactly the burst that fails. So the scan is `not_attempted` on the hot path, deferred to W1's bounded sampler. Neutral content since the §2.7 demotion, so nothing adverse is lost.

Handled naively this would have been the **fifth** instance of *observation failure is not absence*: `cdxChecked` true, no snapshots, and the old expression would have emitted `status: "ok"` with a null value — **claiming we looked and found nothing when we never looked.** Per the ruling it gets a guard:

```ts
type Onset =
  | { kind: "found";       dateIso; term; url }
  | { kind: "scanned";     sampled: number }
  | { kind: "not-scanned"; why: string };
```

`status: "ok"` is reachable only from `found` or `scanned`, and `scanned` cannot be constructed without the sample count that justifies it. **On the hot path only `not-scanned` is producible, so the false state is unconstructable rather than merely discouraged.**

### Coupling that cannot be typed

`signals/` must not import from `report/`, so `THIN_PROBE_LIMIT` cannot reference `THIN_SNAPSHOT_COUNT` directly. A test asserts `THIN_PROBE_LIMIT >= THIN_SNAPSHOT_COUNT` — if the probe were narrower, *"fewer than N rows came back"* would stop answering *"count < N"* and the collector would be guessing.

## Verification

### Corpus delta — zero state changes, 31 reason changes

| | green | amber | blue | red | no-verdict |
|---|---|---|---|---|---|
| before | 32 | 9 | 6 | 0 | 2 |
| **after** | **32** | **9** | **6** | **0** | **2** |

**Blue is intact at 6.** Every reason change is the same one: deep-archive domains drop the `(N captures recorded)` clause, because the count is no longer exact.

> `Archived since 2009 — … spans ~17 years (4341 captures recorded).`
> → `Archived since 2009 — … spans ~17 years.`

**The two no-verdicts did NOT resolve, and the corpus cannot make them.** `github.com` and `kexp.org` carry `wayback: not_collected` in the 18.2 observations, so the harness models them as failed whatever the collector now does. **This fix is about live latency, and the harness has no latency** — §5.1 again, and the reason production verification is the only real check.

### Rendering — the count is omitted, never ghosted

| domain | captures | published |
|---|---|---|
| `cursor.com` | 777 | *"Archived since 1996 — … spans ~30 years."* — **clause absent** |
| `secondlibrary.com` | 2 | *"… spans ~13 years (2 captures recorded)."* — exact, published |
| `txta.dev` | 0 | *"0 archived captures on the Wayback Machine."* — exact, and Blue intact |

No "0 captures" ghost, and no floor.

### History
`signalsToHistory` maps every signal, so `wayback_thin_archive` writes with no migration — additive, post-0003. A test asserts that for a deep archive the `wayback_snapshot_count` row is `valueNum: null, valueText: null, status: not_attempted`, and that the boolean row is present and `ok`.

### Still to do — production
Verification on a live deep-archive domain after promote, **watching specifically for the second-consecutive-call hang W0 found.** This design makes two calls per report where the old one made one; both are far cheaper server-side than W0's `limit=5` on a deep archive, but that is a prediction, not a measurement. **If it appears, per-call timeout behaviour and status get reported, not worked around.**

## Gate
`tsc --noEmit` clean · `eslint` clean · `vitest` **229/229** (225 → 229) · `next build` clean.
