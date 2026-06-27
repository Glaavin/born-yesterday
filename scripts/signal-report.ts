/**
 * Dev proof — `pnpm signal:report <domain>`.
 *
 * Runs the full engine end-to-end with REAL collectors: orchestrator →
 * derivations → indicator → assembly, and prints the assembled Report JSON (plus
 * the indicator's sourced reasons). Proves a real, sourced report BEFORE Story 17
 * wires the route / persistence. NOT part of CI. Prints no secrets.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { normalizeDomain } from "../src/lib/domain";
import { cachedFetch } from "../src/lib/cached-fetch";
import {
  cacheGet,
  cacheSet,
  countThreatHosts,
  isThreatHostListed,
} from "../src/db/queries";
import { socketWhois } from "../src/signals/whois";
import { socketTlsConnect } from "../src/signals/tls";
import { collectAll } from "../src/report/collect-all";
import { derive } from "../src/report/derive";
import { computeIndicator } from "../src/report/indicator";
import { assembleReport } from "../src/report/assemble";

const resolveHost = async (host: string): Promise<string[]> => {
  const { lookup } = await import("node:dns/promises");
  const addrs = await lookup(host, { all: true });
  return addrs.map((a) => a.address);
};

async function main() {
  const input = process.argv.slice(2).find((a) => !a.startsWith("--"));
  if (!input) {
    console.error("usage: pnpm signal:report <domain>");
    process.exit(2);
  }
  const domain = normalizeDomain(input);
  if (!domain) {
    console.error(`invalid domain: ${input}`);
    process.exit(2);
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const results = await collectAll(domain, {
    fetcher: cachedFetch,
    cache: { get: cacheGet, set: cacheSet },
    whoisQuery: socketWhois,
    resolveHost,
    tlsConnect: socketTlsConnect,
    urlhausKey: process.env.URLHAUS_AUTH_KEY || undefined,
    phishtankCount: () => countThreatHosts("phishtank"),
    phishtankListed: (h) => isThreatHostListed("phishtank", h),
    now: () => Date.now(),
  });

  const derivations = derive(results, nowSec);
  const indicator = computeIndicator(domain, results, derivations, nowSec);
  const report = assembleReport(domain, results, derivations, indicator, nowSec);

  console.log(JSON.stringify({ indicatorState: indicator.state, reasons: indicator.reasons, report }, null, 2));
}

main().catch((e) => {
  console.error("signal:report failed:", e instanceof Error ? e.message : String(e));
  process.exit(1);
});
