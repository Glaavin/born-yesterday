/**
 * Story 18.2 calibration-corpus qualifier — CHEAP pass (RDAP + DoH only).
 *
 * `pnpm tsx scripts/qualify-corpus.ts <domains-file>`
 *
 * Runs the REAL domain-identity (RDAP/WHOIS) + DNS (DoH) collectors over a list
 * of candidate domains and prints raw observed signals as a JSON array. It does
 * NOT run the indicator and records NO verdict/state. Wayback + cert history are
 * marked not-collected here (Wayback = separate patient pass; crt.sh = down).
 *
 * Honest absence: every signal carries an explicit status; a null value means
 * "collected, absent" (SPF/DMARC use null for absent), never an implicit gap.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { readFileSync, appendFileSync } from "node:fs";
import { normalizeDomain } from "../src/lib/domain";
import { cachedFetch } from "../src/lib/cached-fetch";
import { cacheGet, cacheSet } from "../src/db/queries";
import { collectDomainIdentity } from "../src/signals/domain-identity";
import { collectDns } from "../src/signals/dns-signals";
import { socketWhois } from "../src/signals/whois";
import type { Signal } from "../src/signals/types";

const find = (sigs: Signal[], key: string): Signal | undefined =>
  sigs.find((s) => s.key === key);
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function qualify(domain: string) {
  const id = await collectDomainIdentity(domain, {
    fetcher: cachedFetch,
    cache: { get: cacheGet, set: cacheSet },
    whoisQuery: socketWhois,
    now: () => Date.now(),
  });
  const dns = await collectDns(domain, { fetcher: cachedFetch });

  const reg = find(id.signals, "domain_registration_date");
  const regIso = reg?.valueText ?? null;
  const regEpoch = reg?.valueNum ?? null;
  const ageDays =
    regEpoch != null ? Math.floor(Date.now() / 1000 - regEpoch) / 86400 : null;
  const registrar = find(id.signals, "registrar")?.valueText ?? null;

  const spf = find(dns.signals, "dns_spf")?.valueText ?? null;
  const dmarc = find(dns.signals, "dns_dmarc")?.valueText ?? null;
  const mx = find(dns.signals, "dns_mx")?.valueText ?? null;
  const hosting = find(dns.signals, "hosting_provider")?.valueText ?? null;

  return {
    domain,
    observed_at: new Date().toISOString().slice(0, 10),
    resolved: dns.ok,
    age: {
      status: regIso ? "collected" : "not_collected",
      registration_date: regIso,
      age_days: ageDays != null ? Math.round(ageDays) : null,
      age_years: ageDays != null ? Math.round((ageDays / 365) * 10) / 10 : null,
      registrar,
      collector_ok: id.ok,
    },
    dmarc: { status: "collected", present: dmarc != null, value: dmarc },
    spf: { status: "collected", present: spf != null, value: spf },
    mx: { status: "collected", value: mx },
    hosting: { status: "collected", value: hosting },
    wayback: { status: "not_collected", reason: "deferred to patient Wayback pass" },
    cert_history: {
      status: "not_collected",
      reason: "crt.sh returning 5xx at run time; skipped per Story 18.2",
    },
  };
}

async function main() {
  const file = process.argv[2];
  const ndjsonOut = process.argv[3]; // optional: append each result as one JSON line
  if (!file) {
    console.error("usage: pnpm tsx scripts/qualify-corpus.ts <domains-file> [ndjson-out]");
    process.exit(2);
  }
  const domains = readFileSync(file, "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => normalizeDomain(l))
    .filter((d): d is string => !!d);

  const out: unknown[] = [];
  for (const d of domains) {
    try {
      const r = await qualify(d);
      out.push(r);
      if (ndjsonOut) appendFileSync(ndjsonOut, JSON.stringify(r) + "\n");
      const a = r.age.age_years != null ? `${r.age.age_years}y` : "age?";
      const flags = [!r.dmarc.present ? "no-DMARC" : "", !r.spf.present ? "no-SPF" : "", !r.resolved ? "NO-RESOLVE" : ""]
        .filter(Boolean)
        .join(",");
      console.error(`✓ ${d.padEnd(34)} ${a.padEnd(7)} ${flags}`);
    } catch (e) {
      console.error(`✗ ${d}: ${e instanceof Error ? e.message : String(e)}`);
      out.push({ domain: d, error: e instanceof Error ? e.message : String(e) });
    }
    await sleep(400); // polite
  }
  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error("qualify-corpus failed:", e instanceof Error ? e.message : String(e));
  process.exit(1);
});
