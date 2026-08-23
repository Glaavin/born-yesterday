/**
 * Story 18.2 calibration-corpus qualifier — PATIENT Wayback pass (~10 domains).
 *
 * `pnpm tsx scripts/qualify-wayback.ts <list-file> [ndjson-out]`
 *   list-file: one `domain` per line; append ` ai` to also scan AI-language onset.
 *
 * archive.org is reachable from this environment but ~38s/request — far past the
 * live collector's 8s deadline. So this reuses the collector's PURE helpers
 * (cdxUrl / parseCdx / snapshotUrl / pickSnapshots / stripToText / matchAiTerms)
 * with a patient 45s fetch. It does NOT modify any collector and records NO
 * verdict. Run with the sandbox disabled (egress to web.archive.org).
 *
 * Politeness: sequential, one domain at a time, delay between calls, polite UA.
 * Hard stop: two consecutive network failures ⇒ abort and report (do not retry
 * into a block).
 */
import { cdxUrl, snapshotUrl, parseCdx, pickSnapshots, tsToIso, type Snapshot } from "../src/signals/wayback";
import { stripToText, matchAiTerms, mostSpecific } from "../src/signals/ai-keywords";
import { readFileSync, appendFileSync } from "node:fs";

const UA = "BornYesterdayBot/1.0 (+https://bornyesterday.tech/about-bot)";
const TIMEOUT_MS = 45_000;
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

class BlockedError extends Error {}
let consecutiveFail = 0;

async function patientGet(url: string): Promise<{ ok: boolean; status: number; body: string }> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { "user-agent": UA, accept: "*/*" },
    });
    const body = await res.text();
    consecutiveFail = 0;
    return { ok: res.status >= 200 && res.status < 300, status: res.status, body };
  } catch (e) {
    consecutiveFail++;
    if (consecutiveFail >= 2) throw new BlockedError(`aborting: 2 consecutive fetch failures (${e instanceof Error ? e.message : String(e)})`);
    return { ok: false, status: 0, body: "" };
  }
}

/** Earliest sampled snapshot whose visible text matches an AI term. Mirrors ai-pivot.ts. */
async function aiOnset(snapshots: Snapshot[]) {
  const sampled = pickSnapshots(snapshots, 6); // first, last, evenly-spaced (<=6), asc — bounded for latency
  for (const s of sampled) {
    const r = await patientGet(snapshotUrl(s.ts, s.original));
    await sleep(1500);
    if (!r.ok || !r.body) continue;
    const terms = matchAiTerms(stripToText(r.body));
    if (terms.length) {
      return { first_seen: tsToIso(s.ts), snapshot_url: snapshotUrl(s.ts, s.original), matched_term: mostSpecific(terms) };
    }
  }
  return { first_seen: null, snapshot_url: null, matched_term: null, note: "no AI term in sampled captures" };
}

async function main() {
  const file = process.argv[2];
  const ndjsonOut = process.argv[3];
  if (!file) {
    console.error("usage: pnpm tsx scripts/qualify-wayback.ts <list-file> [ndjson-out]");
    process.exit(2);
  }
  const entries = readFileSync(file, "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => {
      const [domain, ...rest] = l.split(/\s+/);
      return { domain, scanAi: rest.includes("ai") };
    });

  const out: unknown[] = [];
  try {
    for (const { domain, scanAi } of entries) {
      const cdx = await patientGet(cdxUrl(domain));
      await sleep(1500);
      let rec: Record<string, unknown>;
      if (!cdx.ok) {
        rec = { domain, observed_at: new Date().toISOString().slice(0, 10), wayback: { status: "error", http: cdx.status } };
      } else {
        const p = parseCdx(cdx.body);
        const wb = {
          status: "collected",
          snapshot_count: p.count,
          first: tsToIso(p.firstTs),
          last: tsToIso(p.lastTs),
        };
        let ai: unknown = { status: "not_collected", reason: "AI-onset scan not requested for this domain" };
        if (scanAi && p.snapshots.length) {
          ai = { status: "collected", ...(await aiOnset(p.snapshots)) };
        }
        rec = { domain, observed_at: new Date().toISOString().slice(0, 10), wayback: wb, ai_language_onset: ai };
      }
      out.push(rec);
      if (ndjsonOut) appendFileSync(ndjsonOut, JSON.stringify(rec) + "\n");
      const w = (rec.wayback as { snapshot_count?: number; status?: string });
      console.error(`✓ ${domain.padEnd(28)} snapshots=${w.snapshot_count ?? w.status}${scanAi ? "  [ai-scanned]" : ""}`);
      await sleep(1500);
    }
  } catch (e) {
    if (e instanceof BlockedError) {
      console.error(`\n⚠ ${e.message} — stopped after ${out.length} domain(s), reporting partial.`);
    } else {
      throw e;
    }
  }
  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error("qualify-wayback failed:", e instanceof Error ? e.message : String(e));
  process.exit(1);
});
