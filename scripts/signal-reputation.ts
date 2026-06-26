/**
 * Dev proof — `pnpm signal:reputation <domain> [--write]`.
 *
 * Runs the REAL reputation collector (Trustpilot + BBB via the harness, plus
 * link-outs) and prints the sourced CollectorResult JSON. With --write, appends
 * to signal_history. NOT part of CI. Prints no secrets. (Trustpilot/BBB may serve
 * anti-bot 403s — "Not found" on a block is expected.)
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { normalizeDomain } from "../src/lib/domain";
import { cachedFetch } from "../src/lib/cached-fetch";
import { getOrCreateDomain, appendSignalHistory } from "../src/db/queries";
import { collectReputation } from "../src/signals/reputation";
import { signalsToHistory } from "../src/signals/types";

async function main() {
  const argv = process.argv.slice(2);
  const write = argv.includes("--write");
  const input = argv.find((a) => !a.startsWith("--"));
  if (!input) {
    console.error("usage: pnpm signal:reputation <domain> [--write]");
    process.exit(2);
  }
  const domain = normalizeDomain(input);
  if (!domain) {
    console.error(`invalid domain: ${input}`);
    process.exit(2);
  }

  const result = await collectReputation(domain, { fetcher: cachedFetch });
  console.log(JSON.stringify(result, null, 2));

  if (write) {
    await getOrCreateDomain(domain);
    const rows = signalsToHistory(domain, result.signals, Math.floor(Date.now() / 1000));
    await appendSignalHistory(rows);
    console.log(`\n✓ appended ${rows.length} signal_history row(s) for ${domain}`);
  }
}

main().catch((e) => {
  console.error("signal:reputation failed:", e instanceof Error ? e.message : String(e));
  process.exit(1);
});
