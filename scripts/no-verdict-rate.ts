/**
 * Story 21 instrumentation — how often does no-verdict fire, and which check
 * caused it?
 *
 * `pnpm tsx scripts/no-verdict-rate.ts [days]`   (default 14)
 *
 * §3.2's design constraint: THIS SHOULD FIRE RARELY. If it fires often that is
 * a symptom — timeouts too tight, or an unreliable dependency — and the fix is
 * upstream, not a better failure message. So the rate has to be answerable.
 *
 * A no-verdict deliberately writes NO report row, so `signal_history` is its
 * only trace. That is not a workaround: migration 0003 added `status` precisely
 * so the append-only record could say "we attempted these checks on this date
 * and they failed", and this is the case it was built for.
 *
 * Deliberately a script and not a dashboard. No analytics package is installed
 * and this does not justify adding one.
 *
 * WHAT IT CANNOT SEE: history rows do not record which verdict was blocked, so
 * this reports the CANDIDATE conditions — a day on which a load-bearing check
 * failed for a domain. A domain that failed its archive check but published a
 * sourced concern is counted here and did NOT produce a no-verdict (case C).
 * Read this as an upper bound on the rate and a precise answer on the cause.
 */
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

/** The signals the no-verdict predicate reads. Keep in step with `undecidableFor`. */
const CONJUNCT_SIGNALS = ["wayback_first", "wayback_snapshot_count", "dns_spf", "domain_age_days"];

async function main() {
  const days = Number(process.argv[2] ?? 14);
  const m = /^DATABASE_URL=(.*)$/m.exec(readFileSync(".env.local", "utf8"));
  if (!m) {
    console.error("No DATABASE_URL in .env.local");
    process.exit(1);
  }
  const sql = neon(m[1].trim().replace(/^["']|["']$/g, ""));
  const since = Math.floor(Date.now() / 1000) - days * 86400;

  const byCheck = await sql`
    select signal_type, status, count(*)::int as n
    from signal_history
    where captured_at > ${since} and signal_type = any(${CONJUNCT_SIGNALS})
    group by signal_type, status order by signal_type, status`;

  const affected = await sql`
    select to_timestamp(captured_at)::date as day,
           count(distinct domain)::int as domains
    from signal_history
    where captured_at > ${since} and status <> 'ok' and signal_type = any(${CONJUNCT_SIGNALS})
    group by 1 order by 1 desc`;

  const total = await sql`
    select count(distinct (domain, captured_at))::int as n
    from signal_history where captured_at > ${since}`;

  console.log(`no-verdict candidates — last ${days} days\n`);
  console.log("per load-bearing check:");
  for (const r of byCheck as Array<Record<string, unknown>>) {
    const flag = r.status === "ok" ? "    " : "  ⚠ ";
    console.log(`${flag}${String(r.signal_type).padEnd(24)} ${String(r.status).padEnd(14)} ${r.n}`);
  }
  console.log("\ndays with a load-bearing failure:");
  if ((affected as unknown[]).length === 0) console.log("    none");
  for (const r of affected as Array<Record<string, unknown>>) {
    console.log(`    ${String(r.day).slice(0, 10)}   ${r.domains} domain(s)`);
  }
  console.log(`\ncollection runs in window: ${(total as Array<{ n: number }>)[0]?.n ?? 0}`);
  console.log(
    "\nRead as an UPPER BOUND on the no-verdict rate: a domain whose archive check\n" +
      "failed but which published a sourced concern is counted here and did not\n" +
      "produce a no-verdict. The cause breakdown above is exact.",
  );
}

main().catch((e) => {
  console.error("failed:", e instanceof Error ? e.message : String(e));
  process.exit(1);
});
