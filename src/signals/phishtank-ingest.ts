import type { Fetcher } from "../lib/cached-fetch";
import type { NewThreatHostRow } from "../db/schema";
import { extractHost } from "./host";

/**
 * PhishTank ingest — best-effort. Downloads the public "online-valid" dump
 * (optionally keyed by PHISHTANK_APP_KEY), extracts+normalizes the host from each
 * phish URL, and upserts into threat_hosts (source="phishtank"). The dump is too
 * large for external_cache, so it's fetched with ttl:0 (no caching) but still
 * through the harness (polite UA, SSRF, timeout). If the dump is unavailable /
 * unauthorized, returns skipped:true with a reason and ingests nothing — lookups
 * then simply report "not checked". NEVER throws on a bad source.
 */

const DUMP_TIMEOUT_MS = 60_000;

export interface IngestDeps {
  fetcher: Fetcher;
  appKey?: string;
  upsert: (rows: NewThreatHostRow[]) => Promise<void>;
  now: () => number; // epoch seconds
}

export interface IngestResult {
  ingested: number;
  skipped: boolean;
  reason?: string;
}

const dumpUrl = (appKey?: string): string =>
  appKey
    ? `https://data.phishtank.com/data/${appKey}/online-valid.json`
    : "https://data.phishtank.com/data/online-valid.json";

export async function ingestPhishtank(deps: IngestDeps): Promise<IngestResult> {
  const res = await deps.fetcher({
    source: "phishtank-dump",
    key: "online-valid",
    url: dumpUrl(deps.appKey),
    ttlSeconds: 0, // never cache the dump
    kind: "third-party",
    timeoutMs: DUMP_TIMEOUT_MS,
    maxRetries: 1,
  });
  if (!res.ok) {
    return { ingested: 0, skipped: true, reason: `download failed (${res.error})` };
  }

  let entries: unknown;
  try {
    entries = JSON.parse(res.body);
  } catch {
    return { ingested: 0, skipped: true, reason: "dump was not JSON (a free app key may now be required)" };
  }
  if (!Array.isArray(entries)) {
    return { ingested: 0, skipped: true, reason: "unexpected dump shape (a free app key may now be required)" };
  }

  const firstSeen = deps.now();
  const seen = new Set<string>();
  const rows: NewThreatHostRow[] = [];
  for (const e of entries) {
    const host = extractHost((e as { url?: unknown })?.url);
    if (host && !seen.has(host)) {
      seen.add(host);
      rows.push({ source: "phishtank", host, firstSeen });
    }
  }

  await deps.upsert(rows);
  return { ingested: rows.length, skipped: false };
}
