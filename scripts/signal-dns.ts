/**
 * Dev proof — `pnpm signal:dns <domain> [--write]`.
 *
 * Runs the REAL DNS collector (DoH through the harness) and prints the sourced
 * CollectorResult JSON. With --write, appends to signal_history on the dev DB.
 * NOT part of CI. Prints no secrets.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { normalizeDomain } from "../src/lib/domain";
import { cachedFetch } from "../src/lib/cached-fetch";
import { getOrCreateDomain, appendSignalHistory } from "../src/db/queries";
import { collectDns } from "../src/signals/dns-signals";
import { signalsToHistory } from "../src/signals/types";

async function main() {
  const argv = process.argv.slice(2);
  const write = argv.includes("--write");
  const input = argv.find((a) => !a.startsWith("--"));
  if (!input) {
    console.error("usage: pnpm signal:dns <domain> [--write]");
    process.exit(2);
  }
  const domain = normalizeDomain(input);
  if (!domain) {
    console.error(`invalid domain: ${input}`);
    process.exit(2);
  }

  const result = await collectDns(domain, { fetcher: cachedFetch });
  console.log(JSON.stringify(result, null, 2));

  if (write) {
    await getOrCreateDomain(domain);
    const rows = signalsToHistory(domain, result.signals, Math.floor(Date.now() / 1000));
    await appendSignalHistory(rows);
    console.log(`\n✓ appended ${rows.length} signal_history row(s) for ${domain}`);
  }
}

main().catch((e) => {
  console.error("signal:dns failed:", e instanceof Error ? e.message : String(e));
  process.exit(1);
});
