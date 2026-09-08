/**
 * Story 25 (W2) — run the FULL assembly (indicator + assembleReport) across the
 * calibration corpus and print, per domain, the assembled report's flagged /
 * positive / neutral finding TEXTS. For BEFORE/AFTER delta review of changes
 * that live in the ASSEMBLER (the neutral channel) rather than the indicator —
 * which `corpus-verdicts.ts` cannot see, because it stops at the indicator.
 *
 *   pnpm tsx scripts/corpus-assembled.ts > out.ndjson
 *
 * Reuses `build`/`NOW` from corpus-verdicts.ts so the reconstruction of collector
 * output is identical to the indicator-delta harness (one source of truth).
 *
 * BLIND SPOT this harness inherits AND one it adds: the corpus carries no RDAP
 * `transfer` events (18.2 recorded only registration_date) and models Common
 * Crawl as absent for every domain (corpus-verdicts.ts). So this delta is
 * UNINFORMATIVE about the `transfer` fact and about the CC-instrument
 * reincarnation path — both are production-only checks. It DOES exercise the
 * Wayback-instrument reincarnation pair, which the corpus can move.
 */
import { readFileSync } from "node:fs";
import { build, NOW } from "./corpus-verdicts";
import { computeIndicator } from "../src/report/indicator";
import { derive } from "../src/report/derive";
import { assembleReport } from "../src/report/assemble";

type Obs = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const read = (f: string) =>
  readFileSync(f, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));

function main() {
  const corpus = JSON.parse(readFileSync("docs/calibration/corpus.json", "utf8"));
  const domains: string[] = corpus.entries.filter((e: Obs) => e.domain).map((e: Obs) => e.domain);
  const obs = new Map<string, Obs>(read("docs/calibration/observations.ndjson").map((o) => [o.domain, o]));
  const piv = new Map<string, Obs>(read("docs/calibration/pivot-onset-scan.ndjson").map((o) => [o.domain, o]));

  for (const d of domains.sort()) {
    const o = obs.get(d);
    if (!o) { console.error(`(no observation for ${d})`); continue; }
    const results = build(o, piv.get(d));
    const ind = computeIndicator(d, results, derive(results, NOW), NOW);
    const report = assembleReport(d, results, derive(results, NOW), ind, NOW);
    console.log(JSON.stringify({
      domain: d,
      state: report.state,
      flagged: report.flagged.map((f) => f.text),
      positive: report.positive.map((f) => f.text),
      neutral: (report.neutral ?? []).map((f) => f.text),
    }));
  }
}
main();
