/**
 * db:check — the "is the DB set up correctly" gate.
 *
 * Connects via the DIRECT/UNPOOLED connection, queries information_schema /
 * pg_indexes, and asserts all SIX mvp-spec §5 tables + the two signal_history
 * indexes exist. Prints a per-item present/missing checklist (NAMES ONLY — never
 * the connection string) and exits non-zero if anything is missing.
 *
 * Local gate only — not imported at build/runtime.
 */
import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";

config({ path: ".env.local" });

const EXPECTED_TABLES = [
  "domains",
  "reports",
  "signal_history",
  "external_cache",
  "search_quota",
  "watchlist_subscriptions",
];

const EXPECTED_INDEXES = ["idx_signal_history_domain", "idx_signal_history_type"];

const EXPECTED_CONSTRAINTS = ["skepticism_state_check"];

async function main() {
  const url = process.env.DATABASE_URL_UNPOOLED;
  if (!url) {
    console.error(
      "✖ DATABASE_URL_UNPOOLED is not set (see .env.example). Cannot run db:check.",
    );
    process.exit(2);
  }

  const sql = neon(url);

  const tableRows = (await sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  `) as { table_name: string }[];
  const tables = new Set(tableRows.map((r) => r.table_name));

  const indexRows = (await sql`
    SELECT indexname FROM pg_indexes WHERE schemaname = 'public'
  `) as { indexname: string }[];
  const indexes = new Set(indexRows.map((r) => r.indexname));

  const constraintRows = (await sql`
    SELECT conname FROM pg_constraint
    WHERE contype = 'c' AND connamespace = 'public'::regnamespace
  `) as { conname: string }[];
  const constraints = new Set(constraintRows.map((r) => r.conname));

  let ok = true;

  console.log("Tables (mvp-spec §5):");
  for (const t of EXPECTED_TABLES) {
    const has = tables.has(t);
    ok &&= has;
    console.log(`  ${has ? "✓" : "✗"} ${t}`);
  }

  console.log("Indexes:");
  for (const i of EXPECTED_INDEXES) {
    const has = indexes.has(i);
    ok &&= has;
    console.log(`  ${has ? "✓" : "✗"} ${i}`);
  }

  console.log("Check constraints:");
  for (const c of EXPECTED_CONSTRAINTS) {
    const has = constraints.has(c);
    ok &&= has;
    console.log(`  ${has ? "✓" : "✗"} ${c}`);
  }

  if (!ok) {
    console.error("\n✖ Schema incomplete — run `pnpm db:migrate` against the dev DB.");
    process.exit(1);
  }
  console.log("\n✓ All six tables, both indexes, and the state CHECK present.");
}

main().catch((err) => {
  // Print the error MESSAGE only — never echo the connection string.
  console.error(
    "✖ db:check failed:",
    err instanceof Error ? err.message : String(err),
  );
  process.exit(1);
});
