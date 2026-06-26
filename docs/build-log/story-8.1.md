# Build log — Story 8.1 — Helium Epic (1 of 9): Schema guards

- PR: #17   - Branch: feature/helium-schema-guards   - Status: opened (CI green)   - Date (UTC): 2026-06-26

Small follow-up on the merged Story 8 schema — two defensive guards surfaced in review,
applied before any signal logic writes through the foundation. No new features, no UI, no
signal collection.

## Files changed
- src/db/queries.ts — (edited) Guard 1: `if (!row) throw` after the upsert+select in `getOrCreateDomain`, so its `Promise<DomainRow>` contract can't be silently violated
- src/db/schema.ts — (edited) Guard 2: table-level `check("skepticism_state_check", …)` on `reports`; added `check` (pg-core) + `sql` (drizzle-orm) imports; `reports` now uses the 3-arg table form
- drizzle/0001_damp_starjammers.sql — (new) additive `ALTER TABLE "reports" ADD CONSTRAINT "skepticism_state_check" CHECK (… in ('green','amber','red','blue'))`
- drizzle/meta/0001_snapshot.json — (new) + drizzle/meta/_journal.json — (edited, additive: appends the 0001 entry; 0000 entry untouched)
- scripts/db-check.ts — (edited) also asserts the `skepticism_state_check` constraint (names only)
- docs/build-log/story-7.md — (renamed from `1.2.7.md`) legacy file → continuous `story-<n>.md` convention; H1 relabeled, body unchanged
- docs/build-log/story-8.1.md — (new) this entry

## Acceptance criteria
- [x] Guard 1: `getOrCreateDomain` throws if the row is absent after upsert — met (queries.ts)
- [x] Guard 2: DB-level CHECK rejects any value outside the four states — met (schema.ts + 0001); column stays TEXT per §5 (CHECK is additive hardening, not a type change)
- [x] Migration is the NEW `0001`; `0000_military_karnak.sql` unchanged — met (`git diff` on 0000 empty; journal append is additive)
- [x] No column drops; additive-forward only — met
- [x] Guards only — no behavior change beyond the null-throw and the CHECK — met
- [x] (Optional) `db:check` asserts the constraint — met (scripts/db-check.ts; names only)
- [x] (Optional) legacy build-log `1.2.7.md` → `story-7.md` — met
- [x] Existing 12 unit tests stay green; typecheck/build pass with no DB — met

## Part B (owner-gated; `.env.local` present)
- `pnpm db:migrate` applied `0001` cleanly to the dev Neon DB.
- `pnpm db:check` → all six tables, both indexes, **and** `skepticism_state_check` present.
- Constraint behavior (throwaway script, test rows cleaned up, secret-free):
  ```
  invalid 'purple'      -> REJECTED ✓
  valid states accepted -> green ✓  amber ✓  red ✓  blue ✓
  cleanup               -> test rows removed ✓
  ```

## Decisions & deviations
- **CHECK references the config-callback column** (`sql`${t.skepticismState} in (...)``), not `reports.skepticismState` — inside the table-config callback the `reports` const is still in its TDZ, so the forward-reference would throw at import. Same emitted SQL either way.
- **`skepticism_state` stays TEXT** (§5). The CHECK is defense-in-depth alongside the compile-time `$type<SkepticismState>()`.

## Follow-ups / tech debt
- Timestamp-unit (epoch **seconds**) consistency still relies on callers; enforce via a typed helper when Story 16 wires the flow (carried from Story 8).

## Gates
- install | lint | typecheck | test (12 passed) | build (no DB present → passes): **pass**
- Part B — db:migrate + db:check + constraint-rejection test: **pass**
