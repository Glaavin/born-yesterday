# Build log — Story 22: W0 production egress test

- PRs: #81 (route) · #83 (path fix) · #85 (stepwise) · #87 (burst chunking) · #89 (removal)   - Date (UTC): 2026-09-02
- Type: **Measurement.** One temporary env-gated route, now removed. No product code changed.
- Authority: `docs/source-method-roadmap.md` §5-W0.

## The headline: the expected reading was wrong

**Production is not refused. Production is slow.** Every Wayback call from Vercel returned **200**, never 429. The audit machine's `429 in 0.24s` does not reproduce from production egress.

**That inverts the pre-committed interpretation.** W0 was expected to land on *"production 429'd → W1 is an emergency, Common Crawl becomes primary."* It did not. We are in the **"singles clean, burst trips at call N"** branch — with N = 2.

## 1 · Item 0 — the signal_history baseline, and it is not a rate

```sql
select signal_type, status, count(*)::int as n,
       min(to_timestamp(captured_at))::date as first_seen,
       max(to_timestamp(captured_at))::date as last_seen
from signal_history
where signal_type in ('wayback_first','wayback_snapshot_count','ai_language_first_seen')
group by signal_type, status order by signal_type, status;

select count(*)::int as attempts,
       count(*) filter (where status <> 'ok')::int as failures,
       round(100.0 * count(*) filter (where status <> 'ok') / nullif(count(*),0), 1) as failure_pct
from signal_history where signal_type = 'wayback_first';

select to_timestamp(captured_at)::date as day, count(*)::int as attempts,
       count(*) filter (where status <> 'ok')::int as failures
from signal_history where signal_type = 'wayback_first' group by 1 order by 1;
```

`wayback_first`: **19 attempts, 8 failures, 42.1%.** But the aggregate hides the shape completely:

| window | attempts | failures |
|---|---|---|
| **2 Jul – 23 Aug** | 11 | **0** |
| **27 Aug – 2 Sep** | 8 | **8** |

**This is a step change, not a rate.** Eleven consecutive successes over eight weeks, then eight consecutive failures with nothing in between. The hour-of-day breakdown is confounded by the date and says nothing.

> **This corrects B12, which I wrote.** B12 says *"the archive check fails more than half the time"* — true as an aggregate and misleading as a description. The failures are not scattered; the check worked, and then it stopped. **B12 should be restated as a regime change dated 27 August.**

## 2 · The live table

| step | call | endpoint | status | latency |
|---|---|---|---|---|
| singles | 1 | Wayback CDX `limit=1` | **200** | **13,642 ms** |
| singles | 2 | Availability API | **200** | 364 ms |
| burst | 1 | CDX `limit=5` | **200** | 4,378 ms |
| burst | 2 | CDX `limit=5` | **ERR** | **30,005 ms** (full timeout, no response) |
| cc | 1 | CC index, latest, `stripe.com` | 200 | 358 ms |
| cc | 2 | CC index, latest, `masshist.org` | 200 | 394 ms |
| cc | 3 | CC monthly `2025-33` | 200 | 1,441 ms |
| cc | 4 | CC monthly `2025-26` | 200 | 1,071 ms |
| cc | 5 | CC monthly `2025-18` | 200 | 3,288 ms |
| cc | 6 | CC monthly `2025-13` | **502** | 9,865 ms |
| cc | 7 | CC monthly `2025-05` | 200 | 13,580 ms |
| rdap | 1 | IANA bootstrap | 200 | 32 ms |
| rdap | 2 | Verisign direct, `stripe.com` | 200 | **73 ms** |
| rdap | 3 | rdap.org, `stripe.com` | 200 | **235 ms** |
| rdap | 4 | Verisign direct, `github.com` | 200 | **14 ms** |
| rdap | 5 | rdap.org, `github.com` | 200 | **96 ms** |

## 3 · The burst — trips at call 2

**Call 1: 200 in 4.4s. Call 2: no response at all, 30-second timeout.** Not retried.

**The politeness budget is one call.** Not "N−1 with spacing" in any comfortable sense — the second consecutive CDX call did not come back.

And the failure mode matters: **it hung, it did not refuse.** A 429 is a fast, explicit "no". This was silence. Whatever is throttling us does it by not answering, which is worse for a system with an 8-second deadline — you pay the full timeout to learn nothing.

**Caveat, recorded in the route and repeated here:** the chunked burst means calls 1 and 2 came from separate invocations, which are very likely but not guaranteed to share an egress IP. **A trip observed is real evidence; a clean run would have been weaker evidence.** We observed the trip.

## 4 · Common Crawl vs the audit machine

Audit machine: 0.4–6.6s. **Production: 358 ms – 13.6 s, with one 502.**

- **Latest-crawl lookups are fast and consistent** — 358 ms and 394 ms.
- **The monthly sequence degrades sharply**: 1.4s → 1.1s → 3.3s → **502** → 13.6s.

The 5-call monthly walk *is* the continuity mechanism's real access pattern, and it produced a 502 and a 13.6-second response in five calls. **Common Crawl is materially faster than Wayback at the single-lookup case and is not obviously reliable at the sequence case.** That is the pattern W1 would depend on, so it needs its own measurement before Story 24 treats it as primary.

## 5 · RDAP — the 4× finding holds, and then some

| | direct (Verisign) | via rdap.org | ratio |
|---|---|---|---|
| `stripe.com` | 73 ms | 235 ms | **3.2×** |
| `github.com` | 14 ms | 96 ms | **6.9×** |

Both `.com` deliberately, so the registry is held constant — a `.com`/`.org` pair would have compared Verisign against Public Interest Registry rather than direct-vs-middleman. The IANA bootstrap file itself is **32 ms**, so resolving the registry per TLD is nearly free.

**W2 is validated.** The middleman costs 3–7×, and everything here is far inside any deadline.

## 6 · My read

**We are in the "singles clean, burst trips at call N" branch, with N = 2 — but that branch's label understates it.** The pre-committed reading for a clean single was *"W1 is scheduled work, calmer"*. The measurement does not support calm: a single CDX call took **13.6 seconds** against our **8-second** collection deadline, and the second consecutive call never returned. Wayback is not refusing us; it is answering too slowly to use, and it stops answering under the mildest burst.

**The live result agrees with the baseline, and explains it.** History shows the archive check failing since 27 August; the live test shows why — not refusal, but latency past our own deadline. **B12's "fails half the time" and this story's "13.6 seconds" are the same fact seen through an 8-second clip.** Nothing needs reconciling; the discrepancy I was told to watch for did not occur.

**What this changes for W1:** the emergency framing was right, the stated reason was wrong. Wayback cannot be the primary establishment instrument at a 1-call budget and 4–14 second latencies, regardless of whether anyone is refusing us. **Common Crawl's single-lookup latency (≈370 ms) makes it a credible primary — but its monthly-sequence behaviour, which is the pattern continuity actually needs, produced a 502 and a 13.6s call in five attempts and must be measured properly before Story 24 leans on it.**

## 7 · Route status

- **`BY_W0_TEST` removed from production** — confirmed, zero entries remain.
- **The route is deleted** (#89), so the env gate is not the only thing standing between it and the world.
- The probe shape is the seed **W8** should absorb.

## What went wrong building it, recorded because it wasted three deploys

1. **`api/_w0` was never a route.** In the App Router an underscore-prefixed folder is a *private folder*, opted out of routing. It returned **the same 404 the closed env gate returns**, so the two failure modes were indistinguishable from outside and I first assumed the flag had not bound.
2. **The whole battery in one request never returned**, though the platform logged a 200 — ~28 calls and over a minute of wall clock. Split per step.
3. **The burst then blew the same limit on its own**, because production CDX latency is ~4–14 s per call. Chunked.

Points 2 and 3 are the finding wearing a disguise: **the reason this was hard to run is the reason the collector fails.**
