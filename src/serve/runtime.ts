import type { Report } from "../components/report-state";
import type { Signal } from "../signals/types";
import { cachedFetch } from "../lib/cached-fetch";
import { socketWhois } from "../signals/whois";
import { socketTlsConnect } from "../signals/tls";
import { collectAll } from "../report/collect-all";
import { derive } from "../report/derive";
import { computeIndicator } from "../report/indicator";
import { assembleReport, KEY_TO_STATE } from "../report/assemble";
import { signalsToHistory } from "../signals/types";
import { SCHEMA_VERSION } from "../db/schema";
import {
  cacheGet,
  cacheSet,
  getOrCreateDomain,
  saveReport,
  appendSignalHistory,
  getReport,
  getSessionQuota,
  incrementSessionQuota,
  countThreatHosts,
  isThreatHostListed,
} from "../db/queries";
import { REPORT_TTL_SECONDS } from "./freshness";
import type { ServeDeps } from "./serve";

/**
 * Integration wiring (Story 17 §D/§E) — builds the REAL ServeDeps from Story
 * 16's engine + Story 8's verbs. NOT unit-tested (that's the injected-stub
 * job); proven via `pnpm serve:report` + live. Nothing connects at import.
 */

const COLLECT_DEADLINE_MS = 8000;

const resolveHost = async (host: string): Promise<string[]> => {
  const { lookup } = await import("node:dns/promises");
  const addrs = await lookup(host, { all: true });
  return addrs.map((a) => a.address);
};

/** Run all collectors → derive → indicator → assemble; also return the flat signals. */
export async function realCollect(
  domain: string,
  nowSec: number,
): Promise<{ report: Report; signals: Signal[] }> {
  const results = await collectAll(
    domain,
    {
      fetcher: cachedFetch,
      cache: { get: cacheGet, set: cacheSet },
      whoisQuery: socketWhois,
      resolveHost,
      tlsConnect: socketTlsConnect,
      urlhausKey: process.env.URLHAUS_AUTH_KEY || undefined,
      phishtankCount: () => countThreatHosts("phishtank"),
      phishtankListed: (h) => isThreatHostListed("phishtank", h),
      now: () => Date.now(),
    },
    { deadlineMs: COLLECT_DEADLINE_MS },
  );
  const derivations = derive(results, nowSec);
  const indicator = computeIndicator(domain, results, derivations, nowSec);
  const report = assembleReport(domain, results, derivations, indicator, nowSec);
  const signals = results.flatMap((r) => r.signals);
  return { report, signals };
}

/** Persist: ensure the domain, upsert the report (expires = now + TTL), APPEND history. */
export async function realPersist(
  domain: string,
  report: Report,
  signals: Signal[],
  nowSec: number,
): Promise<void> {
  await getOrCreateDomain(domain);
  await saveReport({
    domain,
    generatedAt: nowSec,
    expiresAt: nowSec + REPORT_TTL_SECONDS,
    reportJson: JSON.stringify(report),
    skepticismState: KEY_TO_STATE[report.state],
    schemaVersion: SCHEMA_VERSION,
  });
  // APPEND-ONLY — never overwrite/delete prior rows (the moat, §3).
  await appendSignalHistory(signalsToHistory(domain, signals, nowSec));
}

/** Build real ServeDeps; the route passes a Next after()-based runBackground. */
export function buildServeDeps(runBackground: (fn: () => Promise<void>) => void): ServeDeps {
  return {
    getReport,
    getQuota: getSessionQuota,
    incrementQuota: incrementSessionQuota,
    collect: realCollect,
    persist: realPersist,
    now: () => Math.floor(Date.now() / 1000),
    runBackground,
  };
}
