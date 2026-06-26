/**
 * `pnpm threat:ingest` — download the PhishTank dump and upsert hosts into
 * threat_hosts (source="phishtank"). Best-effort: if the dump is unavailable /
 * unauthorized (a free PHISHTANK_APP_KEY may now be required), it logs and exits
 * non-fatally. NOT part of CI. Prints no secrets.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { cachedFetch } from "../src/lib/cached-fetch";
import { upsertThreatHosts } from "../src/db/queries";
import { ingestPhishtank } from "../src/signals/phishtank-ingest";

async function main() {
  const result = await ingestPhishtank({
    fetcher: cachedFetch,
    appKey: process.env.PHISHTANK_APP_KEY || undefined,
    upsert: upsertThreatHosts,
    now: () => Math.floor(Date.now() / 1000),
  });

  if (result.skipped) {
    console.log(`⚠ PhishTank ingest skipped — ${result.reason}. Lookups will report "not checked".`);
    return; // non-fatal
  }
  console.log(`✓ PhishTank ingest: ${result.ingested} unique host(s) upserted.`);
}

main().catch((e) => {
  console.error("threat:ingest failed:", e instanceof Error ? e.message : String(e));
  process.exit(1);
});
