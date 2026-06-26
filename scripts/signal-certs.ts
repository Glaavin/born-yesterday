/**
 * Dev proof — `pnpm signal:certs <domain> [--write]`.
 *
 * Runs the REAL certs collector (crt.sh through the harness + a live TLS
 * handshake) and prints the sourced CollectorResult JSON. With --write, appends
 * to signal_history on the dev DB. NOT part of CI. Prints no secrets.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { normalizeDomain } from "../src/lib/domain";
import { cachedFetch } from "../src/lib/cached-fetch";
import {
  getOrCreateDomain,
  appendSignalHistory,
} from "../src/db/queries";
import { collectCerts } from "../src/signals/certs";
import { socketTlsConnect } from "../src/signals/tls";
import { signalsToHistory } from "../src/signals/types";

const resolveHost = async (host: string): Promise<string[]> => {
  const { lookup } = await import("node:dns/promises");
  const addrs = await lookup(host, { all: true });
  return addrs.map((a) => a.address);
};

async function main() {
  const argv = process.argv.slice(2);
  const write = argv.includes("--write");
  const input = argv.find((a) => !a.startsWith("--"));
  if (!input) {
    console.error("usage: pnpm signal:certs <domain> [--write]");
    process.exit(2);
  }
  const domain = normalizeDomain(input);
  if (!domain) {
    console.error(`invalid domain: ${input}`);
    process.exit(2);
  }

  const result = await collectCerts(domain, {
    fetcher: cachedFetch,
    resolveHost,
    tlsConnect: socketTlsConnect,
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
  console.error("signal:certs failed:", e instanceof Error ? e.message : String(e));
  process.exit(1);
});
