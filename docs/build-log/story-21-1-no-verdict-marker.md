# Build log — Story 21.1: the no-verdict marker (`meta_no_verdict`)

- Merged: [PR #125](https://github.com/Glaavin/born-yesterday/pull/125) → `develop` (`523b950`), with review fix `f989abe`. Base: `67411e2`.
- Type: **operator instrumentation** — product-code change on the no-verdict path only. Anchors off Story 21; does not advance the counter.
- Corpus delta: zero (`src/report/` untouched). typecheck · lint · 312 tests · build clean.

## What it does

Makes §3.2 (*"a no-verdict should fire rarely; if it fires often the fix is upstream"*) measurable for the first time. `serveReport` stamps a `meta_no_verdict` signal on the no-verdict path; counting those rows is the **exact** no-verdict count, replacing the reconstructed proxy (26.1/26.2), which is retired.

- **Free denominator.** `realCollect` appends `meta_generation_ms` *before* `persistAttempt`, so a no-verdict attempt already records a generation row. Rate = `count(meta_no_verdict) / count(meta_generation_ms)` per day — exact on both sides, nothing added.
- **Count doubles as cause histogram.** `value_text` encodes the decided cause (see the contract below), so §3.2's "which check, blocking which state, fires often" is one `group by value_text`, not a second query.
- **Two paths, not one.** The marker is written on BOTH no-verdict paths: the synchronous `collect` branch and the background `serve-stale-refresh` branch. The refresh path was missed in the first cut and caught in review (`f989abe`): it had dropped `undecided` and `persist`ed the fallback report, which both under-counted the rate (a floor, not exact) and could overwrite a real cached verdict for the 7-day TTL (the B11 scenario). Both fixed by mirroring the collect branch.
- **Discipline.** `meta_` prefix (nothing in `report/` reads it), appended after assembly, no-verdict path only. Tested: exactly one marker with the right cause on each no-verdict path; none on the served path; report JSON never contains it.

## FORMAT CONTRACT — `meta_no_verdict.value_text` (read before changing it)

`signal_history` is **append-only and permanent** — PRODUCT.md calls it the strategic asset. This marker's `value_text` therefore carries a **permanent value shape**, and it must be treated as a contract, not an implementation detail.

**The shape.** A `;`-joined list of per-blocked-state entries, each `<state>:<conjuncts>`, where `<conjuncts>` is a comma-joined list of the unknown-conjunct signal names. **Sorted at both levels** (entries by state, conjuncts within each) so identical causes collapse to one string. Produced by `encodeUndecided(undecided: Undecided[])` in `src/serve/meta-signals.ts`.

```
blue:domain_age_days,wayback_thin_archive;green:dns_spf,establishment
```

**Consumers** (both group by the raw string; neither parses sub-structure today, though a reader may): `noVerdictCauses` in `src/app/dev/source-panel/queries.ts`, and `scripts/no-verdict-rate.ts`.

**Why this is a contract.** If the encoding ever changes, **every historical `meta_no_verdict` row becomes uninterpretable**, and there is no way to tell which format a given row used — there is no per-row format tag. This is A2's shape again: `reports.schema_version` exists and is written but never read, so it cannot disambiguate here either. A silent re-definition would corrupt the exact series this story exists to produce, retroactively and unrecoverably.

**The rule.** If a future story needs a different cause shape, **add a new signal type** (e.g. `meta_no_verdict_v2`) rather than redefining `meta_no_verdict`. Readers then union across types, keyed by format, and every old row stays interpretable. Do **not** repurpose this key.

## Pending (not in this story)

The production check needs the operator key enabled in Vercel. Per Chat: run it in **one enable/disable cycle together with Story 27's four items** — both stories verified in a single pass — then report the **actual no-verdict rate**, the number §3.2 has made decided-but-unmeasurable until now. Cannot be run until the marker is live and the key is on.
