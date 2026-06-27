/**
 * Dev proof — `pnpm serve:report <domain> [--force]`.
 *
 * Default: runs the FULL serve path against the real DB. Run it twice for the
 * same domain — the first call collects+persists+serves ("new"), the second is a
 * cache hit ("fresh"). With --force, it does a direct collect+persist and prints
 * the signal_history row count BEFORE and AFTER, proving the moat is APPEND-ONLY
 * (the count grows; prior rows are never overwritten). NOT in CI. Secret-free.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { normalizeDomain } from "../src/lib/domain";
import { countSignalHistory } from "../src/db/queries";
import { serveReport } from "../src/serve/serve";
import { buildServeDeps, realCollect, realPersist } from "../src/serve/runtime";
import { sessionKey } from "../src/serve/quota";

async function main() {
  const argv = process.argv.slice(2);
  const force = argv.includes("--force");
  const input = argv.find((a) => !a.startsWith("--"));
  if (!input) {
    console.error("usage: pnpm serve:report <domain> [--force]");
    process.exit(2);
  }
  const domain = normalizeDomain(input);
  if (!domain) {
    console.error(`invalid domain: ${input}`);
    process.exit(2);
  }

  if (force) {
    const nowSec = Math.floor(Date.now() / 1000);
    const before = await countSignalHistory(domain);
    const { report, signals } = await realCollect(domain, nowSec);
    await realPersist(domain, report, signals, nowSec);
    const after = await countSignalHistory(domain);
    console.log(
      JSON.stringify(
        {
          forcedCollection: domain,
          state: report.state,
          signalHistoryRows: { before, after, appended: after - before },
        },
        null,
        2,
      ),
    );
    return;
  }

  const deps = buildServeDeps((fn) => {
    void fn(); // dev: fire-and-forget the background refresh
  });
  const result = await serveReport(input, { sessionKey: sessionKey("dev-cli") }, deps);

  console.log(
    JSON.stringify(
      {
        state: result.state,
        freshness: result.freshness,
        report: result.report
          ? {
              domain: result.report.domain,
              verdict: result.report.state,
              summary: result.report.summary,
              flagged: result.report.flagged.length,
              positive: result.report.positive.length,
              sources: result.report.sources.length,
            }
          : null,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error("serve:report failed:", e instanceof Error ? e.message : String(e));
  process.exit(1);
});
