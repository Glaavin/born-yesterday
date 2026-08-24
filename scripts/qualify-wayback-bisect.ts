/**
 * Story 18.3 §5 measurement — BISECT the AI-language onset.
 *
 * `pnpm tsx scripts/qualify-wayback-bisect.ts <list-file> [ndjson-out]`
 *
 * Uniform sampling (the 6 captures qualify-wayback.ts reads) cannot resolve a
 * deep archive: eff.org has ~6,700 captures, so 6 samples resolves to YEARS and
 * reports the newest sampled capture as the "onset" — a sampling FLOOR, not a
 * measurement. This binary-searches the capture list instead: ~log2(N) fetches
 * (about 13 for 6,700) locate the earliest capture that mentions AI.
 *
 * ASSUMPTION, stated because it bounds the result: monotonicity — once the
 * language appears it stays. A site that added, removed, then re-added AI
 * language can land this on a later transition. The reported bracket makes the
 * residual uncertainty explicit.
 *
 * Reuses the collectors' PURE helpers; patient 45s fetches (archive.org is ~38s
 * from here). Run with the sandbox disabled. Does NOT set any threshold.
 */
import { cdxUrl, snapshotUrl, parseCdx, tsToIso, type Snapshot } from "../src/signals/wayback";
import { stripToText, matchAiTerms, mostSpecific } from "../src/signals/ai-keywords";
import { readFileSync, appendFileSync } from "node:fs";

const UA = "BornYesterdayBot/1.0 (+https://bornyesterday.tech/about-bot)";
const TIMEOUT_MS = 45_000;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

class Blocked extends Error {}
let consecutiveFail = 0;

async function get(url: string): Promise<{ ok: boolean; body: string }> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { "user-agent": UA } });
    const body = await res.text();
    consecutiveFail = 0;
    return { ok: res.status >= 200 && res.status < 300, body };
  } catch (e) {
    if (++consecutiveFail >= 3) throw new Blocked(`aborting: 3 consecutive failures (${e instanceof Error ? e.message : e})`);
    return { ok: false, body: "" };
  }
}

/** Does this capture mention AI? null = the capture could not be read. */
async function mentionsAi(s: Snapshot): Promise<{ hit: boolean; term: string | null } | null> {
  const r = await get(snapshotUrl(s.ts, s.original));
  await sleep(1200);
  if (!r.ok || !r.body) return null;
  const terms = matchAiTerms(stripToText(r.body));
  if (!terms) return null; // scan failed — not "no AI language"
  return { hit: terms.length > 0, term: terms.length ? mostSpecific(terms) : null };
}

async function main() {
  const file = process.argv[2];
  const out = process.argv[3];
  if (!file) { console.error("usage: qualify-wayback-bisect.ts <list-file> [ndjson-out]"); process.exit(2); }
  const domains = readFileSync(file, "utf8").split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));

  for (const domain of domains) {
    try {
      const cdx = await get(cdxUrl(domain));
      await sleep(1200);
      if (!cdx.ok) { console.error(`✗ ${domain}: CDX failed`); continue; }
      const p = parseCdx(cdx.body);
      if (!p) { console.error(`✗ ${domain}: CDX body unparseable`); continue; }
      const snaps = p.snapshots;
      if (snaps.length < 2) { console.error(`- ${domain}: ${snaps.length} capture(s), nothing to bisect`); continue; }

      // Confirm the invariant the bisect relies on: newest mentions AI, oldest does not.
      const newest = await mentionsAi(snaps[snaps.length - 1]);
      const oldest = await mentionsAi(snaps[0]);
      let fetches = 2;
      if (!newest?.hit) { console.error(`- ${domain}: newest capture has no AI language — not a floor case`); continue; }
      if (oldest?.hit) {
        const rec = { domain, resolved: false, reason: "oldest capture ALREADY mentions AI — onset predates the archive", first: tsToIso(p.firstTs), captures: snaps.length, fetches };
        console.error(`= ${domain}: AI language present in the OLDEST capture (${tsToIso(p.firstTs)})`);
        if (out) appendFileSync(out, JSON.stringify(rec) + "\n");
        continue;
      }

      // Invariant: lo does NOT mention AI, hi DOES. Narrow until adjacent.
      let lo = 0, hi = snaps.length - 1, term = newest.term;
      while (hi - lo > 1) {
        const mid = Math.floor((lo + hi) / 2);
        const m = await mentionsAi(snaps[mid]);
        fetches++;
        if (m === null) { lo = mid; continue; } // unreadable → treat as no-evidence, keep narrowing
        if (m.hit) { hi = mid; term = m.term ?? term; } else { lo = mid; }
      }

      const onset = tsToIso(snaps[hi].ts);
      const prior = tsToIso(snaps[lo].ts);
      const rec = {
        domain, resolved: true,
        onset, last_capture_without_ai: prior,
        bracket_days: Math.round((Date.parse(onset!) - Date.parse(prior!)) / 864e5),
        matched_term: term,
        onset_url: snapshotUrl(snaps[hi].ts, snaps[hi].original),
        captures: snaps.length, archive_first: tsToIso(p.firstTs), archive_last: tsToIso(p.lastTs),
        fetches,
      };
      console.error(`✓ ${domain.padEnd(16)} onset ${onset} (bracket ${rec.bracket_days}d, ${fetches} fetches, ${snaps.length} captures)`);
      if (out) appendFileSync(out, JSON.stringify(rec) + "\n");
    } catch (e) {
      if (e instanceof Blocked) { console.error(`\n⚠ ${e.message} — stopping.`); break; }
      throw e;
    }
  }
}
main().catch((e) => { console.error("bisect failed:", e instanceof Error ? e.message : e); process.exit(1); });
