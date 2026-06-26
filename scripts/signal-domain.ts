/**
 * Dev proof — `pnpm signal:domain <domain> [--write]`.
 *
 * Runs the REAL domain-identity collector (real harness + real port-43 WHOIS)
 * and prints the sourced CollectorResult JSON. With --write, appends the signals
 * to signal_history on the dev DB (after ensuring the domain row exists). This is
 * how we SEE a signal work before the report is wired (Story 16). NOT part of CI.
 * Prints no secrets.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { normalizeDomain } from "../src/lib/domain";
import { cachedFetch } from "../src/lib/cached-fetch";
import {
  cacheGet,
  cacheSet,
  getOrCreateDomain,
  appendSignalHistory,
} from "../src/db/queries";
import { collectDomainIdentity } from "../src/signals/domain-identity";
import { socketWhois } from "../src/signals/whois";
import { signalsToHistory } from "../src/signals/types";

async function main() {
  const argv = process.argv.slice(2);
  const write = argv.includes("--write");
  const input = argv.find((a) => !a.startsWith("--"));
  if (!input) {
    console.error("usage: pnpm signal:domain <domain> [--write]");
    process.exit(2);
  }
  const domain = normalizeDomain(input);
  if (!domain) {
    console.error(`invalid domain: ${input}`);
    process.exit(2);
  }

  const result = await collectDomainIdentity(domain, {
    fetcher: cachedFetch,
    cache: { get: cacheGet, set: cacheSet },
    whoisQuery: socketWhois,
    now: () => Date.now(),
  });

  console.log(JSON.stringify(result, null, 2));

  if (write) {
    await getOrCreateDomain(domain);
    const rows = signalsToHistory(
      domain,
      result.signals,
      Math.floor(Date.now() / 1000),
    );
    await appendSignalHistory(rows);
    console.log(`\n✓ appended ${rows.length} signal_history row(s) for ${domain}`);
  }
}

main().catch((e) => {
  console.error("signal:domain failed:", e instanceof Error ? e.message : String(e));
  process.exit(1);
});
