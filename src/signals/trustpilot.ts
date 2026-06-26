import type { Fetcher } from "../lib/cached-fetch";

/**
 * Trustpilot (mvp-spec §2C) — rating + review count from the public review page
 * (fixed host, domain as a path segment → no user-host connection). Rides the
 * harness. Fetch/parse split; parseTrustpilot is pure and PREFERS the embedded
 * schema.org JSON-LD over fragile visible-text scraping. Best-effort: null on
 * absent/blocked(403)/parse-fail; never throws.
 */

const TRUSTPILOT_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

export const trustpilotUrl = (domain: string): string =>
  `https://www.trustpilot.com/review/${encodeURIComponent(domain)}`;

export async function fetchTrustpilot(
  domain: string,
  fetcher: Fetcher,
): Promise<{ ok: boolean; html: string | null }> {
  const res = await fetcher({
    source: "trustpilot",
    key: domain,
    url: trustpilotUrl(domain),
    ttlSeconds: TRUSTPILOT_TTL_SECONDS,
    kind: "third-party",
  });
  return res.ok ? { ok: true, html: res.body } : { ok: false, html: null };
}

/** Parse every <script type="application/ld+json"> block (tolerantly). */
function extractJsonLd(html: string): unknown[] {
  const out: unknown[] = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    try {
      out.push(JSON.parse(m[1].trim()));
    } catch {
      // skip a malformed block
    }
  }
  return out;
}

function* walk(node: unknown): Generator<Record<string, unknown>> {
  if (Array.isArray(node)) {
    for (const n of node) yield* walk(n);
  } else if (node && typeof node === "object") {
    const obj = node as Record<string, unknown>;
    yield obj;
    for (const k of Object.keys(obj)) yield* walk(obj[k]);
  }
}

function findAggregateRating(root: unknown): Record<string, unknown> | null {
  for (const node of walk(root)) {
    const agg = node.aggregateRating;
    if (agg && typeof agg === "object") return agg as Record<string, unknown>;
    if (node["@type"] === "AggregateRating") return node;
  }
  return null;
}

const numOrNull = (v: unknown): number | null => {
  if (v == null) return null;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
};
const intOrNull = (v: unknown): number | null => {
  const n = numOrNull(v);
  return n == null ? null : Math.trunc(n);
};

/** PURE: Trustpilot HTML → { rating, reviewCount }. Prefers JSON-LD. Never throws. */
export function parseTrustpilot(html: string): {
  rating: number | null;
  reviewCount: number | null;
} {
  try {
    for (const block of extractJsonLd(html)) {
      const agg = findAggregateRating(block);
      if (agg) {
        const rating = numOrNull(agg.ratingValue);
        const reviewCount = intOrNull(agg.reviewCount ?? agg.ratingCount);
        if (rating != null || reviewCount != null) return { rating, reviewCount };
      }
    }
    return { rating: null, reviewCount: null };
  } catch {
    return { rating: null, reviewCount: null };
  }
}
