import type { Fetcher } from "../lib/cached-fetch";

/**
 * DNS over HTTPS (mvp-spec §2A) — queried against Cloudflare's FIXED resolver
 * (the domain is a query parameter, never the connection host), so this rides
 * the existing harness as kind:"third-party" with no new transport and no
 * user-host connection. Fetch and parse are split; parseAnswers is pure.
 */

// DNS records change more often than the 7d signals, so a shorter TTL.
const DOH_TTL_SECONDS = 60 * 60; // 1 hour

/** DoH RR type numbers (the DoH JSON `Answer[].type` is numeric). */
const TYPE_NUM: Record<string, number> = {
  A: 1,
  NS: 2,
  CNAME: 5,
  PTR: 12,
  MX: 15,
  TXT: 16,
  AAAA: 28,
};

export const dohUrl = (name: string, type: string): string =>
  `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${encodeURIComponent(type)}`;

/** Fetch raw DoH JSON through the harness. Never throws. */
export async function fetchDoh(
  name: string,
  type: string,
  fetcher: Fetcher,
): Promise<{ ok: boolean; json: string | null }> {
  const res = await fetcher({
    source: "doh",
    key: `${name}:${type}`,
    url: dohUrl(name, type),
    ttlSeconds: DOH_TTL_SECONDS,
    kind: "third-party",
    headers: { accept: "application/dns-json" },
  });
  return res.ok ? { ok: true, json: res.body } : { ok: false, json: null };
}

/** TXT data is quoted and may be split into chunks: `"part1" "part2"` → part1part2. */
function cleanTxt(data: string): string {
  const chunks = data.match(/"([^"]*)"/g);
  if (chunks) return chunks.map((c) => c.slice(1, -1)).join("");
  return data.replace(/^"|"$/g, "");
}

/**
 * PURE: read the DoH `{ Status, Answer:[{type,data}] }` shape and return the
 * `data` values for the requested record type. []/empty on NXDOMAIN/empty/
 * malformed; never throws. (Non-TXT values are returned as-is, trimmed.)
 */
export function parseAnswers(json: string, type: string): string[] {
  try {
    const o = JSON.parse(json) as { Answer?: Array<{ type?: number; data?: unknown }> };
    if (!o || !Array.isArray(o.Answer)) return [];
    const want = TYPE_NUM[type];
    const out: string[] = [];
    for (const a of o.Answer) {
      if (want != null && a?.type !== want) continue;
      if (typeof a?.data !== "string") continue;
      out.push(type === "TXT" ? cleanTxt(a.data) : a.data.trim());
    }
    return out;
  } catch {
    return [];
  }
}
