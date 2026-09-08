/**
 * Story 21 instrumentation — how often does no-verdict fire, and which check
 * caused it? EXACT since Story 21.1.
 *
 * `pnpm tsx scripts/no-verdict-rate.ts [days]`   (default 14)
 *
 * §3.2's design constraint: THIS SHOULD FIRE RARELY. If it fires often that is
 * a symptom — timeouts too tight, or an unreliable dependency — and the fix is
 * upstream, not a better failure message. Story 21.1 made that constraint
 * ANSWERABLE by stamping a `meta_no_verdict` row on the no-verdict path only.
 *
 * This counts that marker directly, so it is EXACT — not the reconstructed upper
 * bound it used to be. The old `CONJUNCT_SIGNALS` proxy (and its 26.1/26.2
 * corrections) is retired: it approximated a thing we can now count. Denominator
 * is free — every generation records a `meta_generation_ms` row, so the rate is
 * `no_verdicts / generations`. The marker's `value_text` carries the decided
 * cause, so the cause breakdown is exact too.
 *
 * Deliberately a script, not a dashboard (the source panel is the dashboard).
 *
 * WINDOW CAVEAT: the exact series starts at the 21.1 deploy — there is no
 * backfill, so a window reaching before it undercounts (those no-verdicts left
 * no marker). Not an upper bound any more; a start-date floor.
 */
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

async function main() {
  const days = Number(process.argv[2] ?? 14);
  const m = /^DATABASE_URL=(.*)$/m.exec(readFileSync(".env.local", "utf8"));
  if (!m) {
    console.error("No DATABASE_URL in .env.local");
    process.exit(1);
  }
  const sql = neon(m[1].trim().replace(/^["']|["']$/g, ""));
  const since = Math.floor(Date.now() / 1000) - days * 86400;

  const byDay = await sql`
    select to_timestamp(captured_at)::date as day,
           count(*) filter (where signal_type = 'meta_generation_ms')::int as generations,
           count(*) filter (where signal_type = 'meta_no_verdict')::int     as no_verdicts
    from signal_history
    where captured_at > ${since}
      and signal_type in ('meta_generation_ms', 'meta_no_verdict')
    group by 1 order by 1 desc`;

  const causes = await sql`
    select value_text as cause, count(*)::int as n
    from signal_history
    where captured_at > ${since} and signal_type = 'meta_no_verdict'
    group by 1 order by 2 desc, 1`;

  const totals = (byDay as Array<{ generations: number; no_verdicts: number }>).reduce(
    (a, r) => ({ generations: a.generations + r.generations, no_verdicts: a.no_verdicts + r.no_verdicts }),
    { generations: 0, no_verdicts: 0 },
  );

  console.log(`no-verdict rate — last ${days} days (EXACT, from meta_no_verdict)\n`);
  console.log("per day:  generations   no-verdicts");
  for (const r of byDay as Array<Record<string, unknown>>) {
    console.log(`    ${String(r.day).slice(0, 10)}   ${String(r.generations).padStart(11)}   ${String(r.no_verdicts).padStart(11)}`);
  }
  const rate = totals.generations ? ((100 * totals.no_verdicts) / totals.generations).toFixed(1) : "0.0";
  console.log(`\ntotal: ${totals.no_verdicts} no-verdict(s) of ${totals.generations} generation(s) — ${rate}%`);

  console.log("\ncause (blocked-state : unknown-conjunct(s)):");
  if ((causes as unknown[]).length === 0) console.log("    none");
  for (const r of causes as Array<Record<string, unknown>>) {
    console.log(`    ${String(r.n).padStart(4)}  ${String(r.cause)}`);
  }
  console.log(
    "\nEXACT since Story 21.1. Windows reaching before the 21.1 deploy undercount\n" +
      "(pre-marker no-verdicts left no row) — a start-date floor, not an upper bound.",
  );
}

main().catch((e) => {
  console.error("failed:", e instanceof Error ? e.message : String(e));
  process.exit(1);
});
