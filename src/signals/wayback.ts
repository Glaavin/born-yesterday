import type { Fetcher } from "../lib/cached-fetch";

/**
 * Wayback (mvp-spec §2B) — CDX capture history + representative archived
 * snapshots, all through the harness against the FIXED web.archive.org host
 * (third-party; the harness's per-host interval + backoff keep us polite). Daily-
 * collapsed so the CDX response stays well under the size cap. Fetch/parse split.
 */

const CDX_TTL_SECONDS = 60 * 60 * 24; // 1 day (history grows slowly)
const SNAPSHOT_TTL_SECONDS = 60 * 60 * 24 * 30; // snapshots are immutable
const MAX_SNAPSHOTS = 8;
// web.archive.org is slow (like crt.sh); give it the §6 total budget instead of
// the 3s individual default. Cached, so the slow path is paid at most once.
const WAYBACK_TIMEOUT_MS = 8000;

export interface Snapshot {
  ts: string; // "YYYYMMDDhhmmss"
  original: string;
}

export const cdxUrl = (domain: string): string =>
  `https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(domain)}` +
  `&output=json&fl=timestamp,original&filter=statuscode:200&collapse=timestamp:8`;

export const snapshotUrl = (ts: string, original: string): string =>
  `https://web.archive.org/web/${ts}id_/${original}`;

/** "YYYYMMDD…" → "YYYY-MM-DD", or null. */
export function tsToIso(ts: string | null): string | null {
  if (!ts) return null;
  const m = /^(\d{4})(\d{2})(\d{2})/.exec(ts);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

export async function fetchCdx(
  domain: string,
  fetcher: Fetcher,
): Promise<{ ok: boolean; json: string | null }> {
  const res = await fetcher({
    source: "wayback-cdx",
    key: domain,
    url: cdxUrl(domain),
    ttlSeconds: CDX_TTL_SECONDS,
    kind: "third-party",
    timeoutMs: WAYBACK_TIMEOUT_MS,
  });
  return res.ok ? { ok: true, json: res.body } : { ok: false, json: null };
}

/** Fetch one archived snapshot's RAW HTML (the `id_` modifier omits the toolbar). */
export async function fetchSnapshot(
  ts: string,
  original: string,
  fetcher: Fetcher,
): Promise<{ ok: boolean; html: string | null }> {
  const res = await fetcher({
    source: "wayback-snap",
    key: `${ts}:${original}`,
    url: snapshotUrl(ts, original),
    ttlSeconds: SNAPSHOT_TTL_SECONDS,
    kind: "third-party",
    timeoutMs: WAYBACK_TIMEOUT_MS,
  });
  return res.ok ? { ok: true, html: res.body } : { ok: false, html: null };
}

/**
 * PURE: CDX JSON (array of rows, optional header) → count + first/last ts +
 * snapshots (sorted ascending by ts). Defensive; never throws.
 */
export function parseCdx(json: string): {
  count: number;
  firstTs: string | null;
  lastTs: string | null;
  snapshots: Snapshot[];
} {
  try {
    const rows = JSON.parse(json) as unknown[];
    if (!Array.isArray(rows) || rows.length === 0) {
      return { count: 0, firstTs: null, lastTs: null, snapshots: [] };
    }
    // Drop the header row if present ("timestamp","original").
    const first = rows[0];
    const dataRows = (Array.isArray(first) && first.includes("timestamp") ? rows.slice(1) : rows) as unknown[];

    const snapshots: Snapshot[] = [];
    for (const r of dataRows) {
      if (Array.isArray(r) && typeof r[0] === "string" && typeof r[1] === "string") {
        snapshots.push({ ts: r[0], original: r[1] });
      }
    }
    if (snapshots.length === 0) return { count: 0, firstTs: null, lastTs: null, snapshots: [] };

    snapshots.sort((a, b) => a.ts.localeCompare(b.ts));
    return {
      count: snapshots.length,
      firstTs: snapshots[0].ts,
      lastTs: snapshots[snapshots.length - 1].ts,
      snapshots,
    };
  } catch {
    return { count: 0, firstTs: null, lastTs: null, snapshots: [] };
  }
}

/** Pick up to MAX_SNAPSHOTS representative snapshots: first, last, evenly spaced. */
export function pickSnapshots(snapshots: Snapshot[], k = MAX_SNAPSHOTS): Snapshot[] {
  if (snapshots.length <= k) return snapshots;
  const out: Snapshot[] = [];
  const seen = new Set<number>();
  for (let i = 0; i < k; i++) {
    const idx = Math.round((i * (snapshots.length - 1)) / (k - 1));
    if (!seen.has(idx)) {
      seen.add(idx);
      out.push(snapshots[idx]);
    }
  }
  return out;
}
