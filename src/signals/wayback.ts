import type { Fetcher } from "../lib/cached-fetch";
import type { Signal, SignalSource } from "./types";

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

const CDX_BASE = (domain: string): string =>
  `https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(domain)}` +
  `&output=json&fl=timestamp,original&filter=statuscode:200&collapse=timestamp:8`;

/**
 * The FULL capture list. Retained for the offline qualifiers in `scripts/`,
 * which run patiently and off the request path.
 *
 * NOT FOR THE HOT PATH. W0 measured this at 4–14 seconds from production
 * against an 8-second collection deadline, which is the whole of B12: the
 * archive check was not being refused, it was blowing our own budget.
 */
export const cdxUrl = CDX_BASE;

/**
 * How many rows the hot path asks for. Sized to answer `count < THIN_SNAPSHOT_COUNT`
 * EXACTLY without fetching a list that may run to thousands:
 *
 *   fewer than this many rows come back ⇒ that IS the exact count
 *   exactly this many come back         ⇒ the count is ≥ this, which is all the
 *                                          thinness rule ever needed to know
 *
 * Must stay ≥ `THIN_SNAPSHOT_COUNT` in `report/indicator.ts`, which a test
 * asserts — `signals/` must not import from `report/`, so the coupling is
 * enforced rather than expressed.
 */
export const THIN_PROBE_LIMIT = 5;

/** Oldest captures, ascending — gives the FIRST capture and the thinness answer. */
export const cdxFirstUrl = (domain: string): string =>
  `${CDX_BASE(domain)}&limit=${THIN_PROBE_LIMIT}`;

/** The most recent capture only. `fastLatest` lets the server stop early. */
export const cdxLastUrl = (domain: string): string =>
  `${CDX_BASE(domain)}&fastLatest=true&limit=-1`;

export const snapshotUrl = (ts: string, original: string): string =>
  `https://web.archive.org/web/${ts}id_/${original}`;

/** "YYYYMMDD…" → "YYYY-MM-DD", or null. */
export function tsToIso(ts: string | null): string | null {
  if (!ts) return null;
  const m = /^(\d{4})(\d{2})(\d{2})/.exec(ts);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

/**
 * One bounded CDX query. `which` selects the endpoint AND the cache key — the
 * two responses are different shapes for the same domain, so they must not
 * share an entry.
 */
export async function fetchCdx(
  domain: string,
  fetcher: Fetcher,
  which: "first" | "last" | "full" = "full",
): Promise<{ ok: boolean; json: string | null }> {
  const url = which === "first" ? cdxFirstUrl(domain) : which === "last" ? cdxLastUrl(domain) : cdxUrl(domain);
  const res = await fetcher({
    source: "wayback-cdx",
    key: `${domain}:${which}`,
    url,
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
} | null {
  try {
    const rows = JSON.parse(json) as unknown[];
    if (!Array.isArray(rows)) return null; // not a CDX payload at all
    if (rows.length === 0) {
      return { count: 0, firstTs: null, lastTs: null, snapshots: [] }; // parsed: genuinely no captures
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
    return null; // unparseable — NOT "zero captures"
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

/**
 * ASYNC ENRICHMENT — the last archived capture.
 *
 * Runs AFTER the response, outside the 8-second collection deadline and under
 * the per-host politeness budget. Returns the signals to append, or an empty
 * array if it could not be obtained: a failed enrichment is invisible to the
 * reader, because the report never claimed it would be there.
 *
 * Non-throwing, like every collector. The hot path must not fail because of it.
 */
export async function enrichWaybackLast(
  domain: string,
  fetcher: Fetcher,
  source: SignalSource,
): Promise<Signal[]> {
  try {
    const r = await fetchCdx(domain, fetcher, "last");
    if (!r.ok || !r.json) return [];
    const p = parseCdx(r.json);
    // Status from the PARSE, not the fetch (docs/conventions.md).
    if (!p) return [];
    const iso = tsToIso(p.lastTs);
    if (iso == null) return [];
    return [
      {
        key: "wayback_last",
        label: "Last archived",
        valueText: iso,
        valueNum: null,
        source,
        status: "ok",
      },
    ];
  } catch {
    return [];
  }
}