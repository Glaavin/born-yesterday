# Build log — Story 8 — Helium Epic (1 of 9): Schema & data access

- PR: #16   - Branch: feature/helium-schema   - Status: opened (CI green)   - Date (UTC): 2026-06-26

First Helium story: the persistence foundation — schema, migrations, a thin typed DB
module, and domain normalization. No signal collection, no UI.

## Files changed
- src/db/schema.ts — (new) Drizzle schema, mvp-spec §5 exactly; BIGINT epoch, both signal_history indexes, `SkepticismState`/`SCHEMA_VERSION`, inferred row types
- src/db/client.ts — (new) LAZY runtime client; POOLED `DATABASE_URL` via neon-http; no connection at import/build
- src/db/queries.ts — (new) thin typed data access — the nine §6 verbs, no business logic
- src/lib/domain.ts — (new) `normalizeDomain(input) → string | null`
- src/lib/domain.test.ts — (new) 12 vitest unit tests; pure, no DB
- drizzle.config.ts — (new) reads `DATABASE_URL_UNPOOLED` from env (no literal); throws if absent
- drizzle/0000_military_karnak.sql + meta/ — (new) generated additive-forward migration
- scripts/db-check.ts — (new) `pnpm db:check`: asserts 6 tables + 2 indexes; NAMES-ONLY checklist; non-zero on missing
- vitest.config.ts — (new) unit-only; excludes `*.integration.test.ts`
- .env.example — (new) committed template; variable NAMES only, no values
- .gitignore — (edited) keep `.env*` ignored but allow `!.env.example`
- .github/workflows/ci.yml — (edited) added `Test (unit only; NO database)` step before build
- package.json — (edited) `test`, `db:generate`, `db:migrate`, `db:check` scripts; drizzle/neon/vitest/dotenv/tsx deps
- pnpm-workspace.yaml — (edited) approve esbuild build (vitest/tsx); matches CI
- docs/conventions.md — (new) Epics + continuous stories, build-log, secrets
- docs/build-log/README.md — (edited) filename template → `story-<n>.md` (decimals `story-<n>.<m>.md`)

## Acceptance criteria
- [x] DB access via **Drizzle ORM + drizzle-kit** with the Neon serverless driver; runtime client LAZY from `DATABASE_URL` — met (client.ts; rationale below)
- [x] Schema = mvp-spec §5 EXACTLY: six tables, BIGINT epoch timestamps, both signal_history indexes, `reports.skepticism_state` TEXT, watchlist provisioned-but-unused — met (schema.ts; generated SQL verified)
- [x] `schema_version` starts at 1 — met (`SCHEMA_VERSION = 1`, schema.ts)
- [x] Stored state values green/amber/red/blue (differ from the view's ReportStateKey; mapping is Story 16) — met (`SkepticismState`)
- [x] drizzle.config reads `DATABASE_URL_UNPOOLED` from env, no literals; additive-forward migration committed; `db:migrate` uses unpooled — met (drizzle.config.ts, package.json)
- [x] Thin typed DB module, one fn per §6, no business logic — met (queries.ts): getOrCreateDomain · incrementSearchCount · getReport · saveReport · appendSignalHistory · cacheGet · cacheSet · getSessionQuota · incrementSessionQuota
- [x] `normalizeDomain` — lowercase; strip scheme/www/path/query/fragment/port; validate; null if invalid — met (domain.ts)
- [x] vitest + `test` script + CI step; PURE UNIT tests, NO DB in CI — met (12 tests; vitest.config excludes integration)
- [x] `.env.example` committed template (no secrets); `.gitignore` covers `.env*` except `.env.example`; `.env.local` untracked — met
- [x] `db:check` connects via unpooled, asserts 6 tables + 2 indexes, NAMES-ONLY, non-zero on missing — met (scripts/db-check.ts)
- [x] conventions.md + build-log README rename — met
- [x] Nothing connects to the DB at import/build time; build passes with no DB — met (`pnpm build` green with no env)

## Decisions & deviations
- **Drizzle over direct SQL.** Typed schema as the single source of truth, generated additive-forward migrations + a versioned journal, and `$inferSelect/$inferInsert` row types that keep `queries.ts` honest without hand-written DTOs. drizzle-kit gives us `db:check`-adjacent tooling for free.
- **neon-http (not neon-serverless Pool) for the runtime client.** All §6 access is single-statement; the HTTP driver is the lightest fit for serverless and needs no pool lifecycle. Revisit if a later story needs interactive transactions.
- **Epoch is unix SECONDS** (BIGINT). `generated_at + 7 days` and signal math read cleanly in seconds; `queries.ts` stamps with `Math.floor(Date.now()/1000)`.
- **`cacheGet` filters expired rows and `cacheSet` computes `expires_at = now + ttl`** — this is the function's defined data-access contract (spec: "respects expires_at"), not a freshness *decision*; whether to use/regenerate a report stays in Story 16.
- **`day` is a caller-supplied parameter** to the quota fns — the day-boundary choice is business logic, kept out of the data layer.
- **drizzle.config throws if `DATABASE_URL_UNPOOLED` is absent.** `db:generate` doesn't connect, so the migration was generated with an ephemeral non-connecting placeholder passed inline for that step only — never committed, never used to connect (leak scan of `drizzle/` is clean).
- **Approved the esbuild build script** in pnpm-workspace.yaml so vitest/tsx run identically locally and in CI.

## Follow-ups / tech debt
- **Part B (apply migration to the dev DB) is PENDING the owner's `.env.local`** — not present in the working copy. Once provided, run `pnpm db:migrate` then `pnpm db:check` and paste the NAMES-ONLY checklist here.
- `normalizeDomain` is ASCII-only: IDN/unicode hosts and bare IPs return null. Add punycode (toASCII) support if non-ASCII domains become in-scope.
- DB-function integration tests (`*.integration.test.ts`, excluded from CI) can be added once a throwaway/test DB is available.

## Gates
- install | lint | typecheck | test (12 passed) | build (no DB present → passes): **pass**
- db:migrate | db:check (Part B): **pending owner `.env.local`**
