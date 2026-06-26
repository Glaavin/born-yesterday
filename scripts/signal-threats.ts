/**
 * Dev proof — `pnpm signal:threats <domain> [--write]`.
 *
 * Runs the REAL threats collector (URLhaus via the harness + local PhishTank
 * table) and prints the sourced CollectorResult JSON. With --write, appends to
 * signal_history. NOT part of CI. Prints no secrets (the URLhaus key, if set, is
 * sent as a header and never logged).
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { normalizeDomain } from "../src/lib/domain";
import { cachedFetch } from "../src/lib/cached-fetch";
import {
  getOrCreateDomain,
  appendSignalHistory,
  countThreatHosts,
  isThreatHostListed,
} from "../src/db/queries";
import { collectThreats } from "../src/signals/threats";
import { signalsToHistory } from "../src/signals/types";

async function main() {
  const argv = process.argv.slice(2);
  const write = argv.includes("--write");
  const input = argv.find((a) => !a.startsWith("--"));
  if (!input) {
    console.error("usage: pnpm signal:threats <domain> [--write]");
    process.exit(2);
  }
  const domain = normalizeDomain(input);
  if (!domain) {
    console.error(`invalid domain: ${input}`);
    process.exit(2);
  }

  const result = await collectThreats(domain, {
    fetcher: cachedFetch,
    urlhausKey: process.env.URLHAUS_AUTH_KEY || undefined,
    phishtankCount: () => countThreatHosts("phishtank"),
    phishtankListed: (host) => isThreatHostListed("phishtank", host),
  });

  console.log(JSON.stringify(result, null, 2));

  if (write) {
    await getOrCreateDomain(domain);
    const rows = signalsToHistory(domain, result.signals, Math.floor(Date.now() / 1000));
    await appendSignalHistory(rows);
    console.log(`\n✓ appended ${rows.length} signal_history row(s) for ${domain}`);
  }
}

main().catch((e) => {
  console.error("signal:threats failed:", e instanceof Error ? e.message : String(e));
  process.exit(1);
});
