import type { Fetcher } from "../lib/cached-fetch";

/**
 * crt.sh emits naive UTC timestamps with NO timezone suffix (e.g.
 * "2014-03-01T00:00:00"); JS would parse those as LOCAL time. Pin them to UTC.
 */
const asUtcMs = (s: string): number =>
  Date.parse(/[zZ]$|[+-]\d\d:?\d\d$/.test(s) ? s : s + "Z");

/**
 * crt.sh — first-ever certificate date (the "honest age" signal, mvp-spec §2A).
 * Rides the EXISTING harness (kind:"third-party"). Fetch and parse are split so
 * parseCrtsh is pure and unit-tested offline.
 */

const CRTSH_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days
// crt.sh is the known-slow source (large CT histories); the harness's default 3s
// almost always loses to it, so this one call gets the full §6 total budget (8s)
// rather than the 3s individual default. Cached a week, so the slow path is paid
// at most once per domain per week; if it still times out we degrade gracefully
// (first_cert_date null) — TLS still gives the current cert. In Story 16 the
// report-level 8s deadline (opts.signal) caps it regardless.
const CRTSH_TIMEOUT_MS = 8000;

export const crtshUrl = (domain: string): string =>
  `https://crt.sh/?q=${encodeURIComponent(domain)}&output=json`;

/** Fetch the raw crt.sh JSON through the harness. Never throws. */
export async function fetchCrtsh(
  domain: string,
  fetcher: Fetcher,
): Promise<{ ok: boolean; json: string | null }> {
  const res = await fetcher({
    source: "crtsh",
    key: domain,
    url: crtshUrl(domain),
    ttlSeconds: CRTSH_TTL_SECONDS,
    kind: "third-party",
    timeoutMs: CRTSH_TIMEOUT_MS,
  });
  return res.ok ? { ok: true, json: res.body } : { ok: false, json: null };
}

/**
 * PURE: crt.sh JSON (array of cert entries) → earliest not_before (ISO) + count.
 * Defensive — nulls on empty/shape-variance; never throws.
 */
export function parseCrtsh(json: string): {
  firstCertDate: string | null;
  certCount: number | null;
} {
  try {
    const entries = JSON.parse(json) as Array<{ not_before?: string }>;
    if (!Array.isArray(entries) || entries.length === 0) {
      return { firstCertDate: null, certCount: null };
    }

    let earliestMs: number | null = null;
    for (const e of entries) {
      if (!e?.not_before) continue;
      const ms = asUtcMs(e.not_before);
      if (Number.isNaN(ms)) continue;
      if (earliestMs == null || ms < earliestMs) earliestMs = ms;
    }

    return {
      firstCertDate: earliestMs != null ? new Date(earliestMs).toISOString() : null,
      certCount: entries.length,
    };
  } catch {
    return { firstCertDate: null, certCount: null };
  }
}
