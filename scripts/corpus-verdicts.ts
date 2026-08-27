/**
 * Story 19 Stage 2 — run the indicator across the calibration corpus and print
 * one verdict per domain, for BEFORE/AFTER delta review.
 *
 * `pnpm tsx scripts/corpus-verdicts.ts > out.ndjson`
 *
 * This RECONSTRUCTS collector output from the observations recorded in Story
 * 18.2 (docs/calibration/*.ndjson) rather than re-running collectors over the
 * network — hours of archive.org latency, and the point is a controlled diff of
 * indicator logic against FIXED inputs. Each reconstructed signal mirrors its
 * collector's real shape, including `status`: checks 18.2 could not complete
 * (crt.sh down, TLS/threat/Trustpilot not run) are `failed`/`not_attempted`,
 * which is faithful to what was actually observed.
 */
import { readFileSync } from "node:fs";
import type { CollectorResult, Signal, SignalStatus } from "../src/signals/types";
import { computeIndicator } from "../src/report/indicator";
import { derive } from "../src/report/derive";

const NOW = Math.floor(Date.parse("2026-08-24T00:00:00Z") / 1000);
const read = (f: string) =>
  readFileSync(f, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));

type Obs = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const sig = (
  key: string,
  status: SignalStatus,
  valueText: string | null,
  valueNum: number | null,
  sourceUrl: string | null,
): Signal => ({
  key,
  label: key,
  valueText,
  valueNum,
  source: sourceUrl ? { label: key, url: sourceUrl } : null,
  status,
});

const epoch = (iso: string | null | undefined): number | null => {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : Math.floor(ms / 1000);
};

function build(o: Obs, pivot: Obs | undefined): CollectorResult[] {
  const ageOk = o.age?.status === "collected" && o.age?.registration_date;
  const idSt: SignalStatus = ageOk ? "ok" : "failed";
  const regSec = ageOk ? epoch(o.age.registration_date) : null;

  // Prefer the observation's own Wayback data; fall back to the §5 pivot scan,
  // which collected CDX for the young tier that 18.2 deliberately skipped. Both
  // are real observations of the same corpus — ignoring the second would model a
  // check as un-run when it demonstrably ran.
  const wb = o.wayback?.status === "collected" ? o.wayback
    : pivot?.wayback?.status === "collected" ? pivot.wayback
    : null;
  const wbOk = wb != null;
  const wbSt: SignalStatus = wbOk ? "ok" : "failed";
  const snaps = wbOk ? (wb.snapshot_count ?? null) : null;

  const onset = pivot?.ai_language_onset?.status === "collected" ? pivot.ai_language_onset.first_seen : null;
  const aiSt: SignalStatus = pivot?.ai_language_onset?.status === "collected" ? "ok" : "not_attempted";

  const dnsUrl = `https://dns.google/query?name=${o.domain}`;
  return [
    { collector: "domain-identity", ok: ageOk, signals: [
      sig("domain_registration_date", idSt, ageOk ? o.age.registration_date : null, regSec, ageOk ? "rdap" : null),
      sig("domain_age_days", idSt, null, ageOk ? o.age.age_days : null, ageOk ? "rdap" : null),
      sig("registrar", idSt, ageOk ? (o.age.registrar ?? null) : null, null, ageOk ? "rdap" : null),
    ]},
    { collector: "dns", ok: !!o.resolved, signals: [
      sig("dns_spf", "ok", o.spf?.value ?? null, null, dnsUrl),
      sig("dns_dmarc", "ok", o.dmarc?.value ?? null, null, dnsUrl),
      // 18.2 recorded `resolved` rather than the A values themselves.
      sig("dns_a", "ok", o.resolved ? "(resolved)" : null, null, dnsUrl),
      sig("dns_mx", "ok", o.mx?.value ?? null, null, dnsUrl),
      sig("hosting_provider", "ok", o.hosting?.value ?? null, null, dnsUrl),
    ]},
    // crt.sh was returning 5xx throughout 18.2; TLS was not run.
    { collector: "certs", ok: false, signals: [
      sig("first_cert_date", "failed", null, null, null),
      sig("cert_count", "failed", null, null, null),
      sig("tls_issuer", "failed", null, null, null),
      sig("tls_valid_to", "failed", null, null, null),
      sig("ssl_org", "failed", null, null, null),
      sig("ssl_ou", "failed", null, null, null),
    ]},
    // Threat feeds are key-gated and were not queried.
    { collector: "threats", ok: false, signals: [
      sig("phishtank_listed", "not_attempted", null, null, null),
      sig("urlhaus_listed", "not_attempted", null, null, null),
    ]},
    { collector: "reputation", ok: true, signals: [
      // 18.2 never ran the reputation collector, so as-recorded this is
      // not_attempted. In PRODUCTION the collector always runs — set
      // TRUSTPILOT_STATUS=ok to model "checked, no rating found" and measure how
      // much Blue's reachability depends on this one check.
      sig("trustpilot", (process.env.TRUSTPILOT_STATUS as SignalStatus) ?? "not_attempted", null, null, null),
      // The four constant link-outs: navigation, not observation.
      sig("bbb", "ok", "Check BBB for this domain", null, "bbb"),
      sig("reputation_reviews", "ok", "Search the web for reviews", null, "web"),
      sig("reputation_complaints", "ok", "Search the web for complaints", null, "web"),
      sig("reddit_search", "ok", "Search Reddit for mentions", null, "reddit"),
    ]},
    { collector: "ai-pivot", ok: wbOk, signals: [
      sig("wayback_snapshot_count", wbSt, snaps != null ? String(snaps) : null, snaps, wbOk ? "cdx" : null),
      sig("wayback_first", wbSt, wbOk ? (wb.first ?? null) : null, null, wbOk ? "cdx" : null),
      sig("wayback_last", wbSt, wbOk ? (wb.last ?? null) : null, null, wbOk ? "cdx" : null),
      sig("ai_language_first_seen", aiSt, onset, null, onset ? "wayback-snap" : null),
      sig("ai_language_current", "not_attempted", null, null, null),
    ]},
  ];
}

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
    console.log(JSON.stringify({
      domain: d,
      state: ind.state,
      reasons: ind.reasons.map((r) => ({ kind: r.kind ?? "main", text: r.text })),
    }));
  }
}
main();
