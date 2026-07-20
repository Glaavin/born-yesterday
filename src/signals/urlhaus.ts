import type { Fetcher } from "../lib/cached-fetch";

/**
 * URLhaus (abuse.ch) — is the host listed for malware URLs? POSTs to the FIXED
 * abuse.ch API host through the harness (kind:"third-party"). The auth key (if
 * abuse.ch requires one) is read from env by the caller and sent as a header —
 * never hardcoded. Fetch/parse split; parseUrlhaus is pure.
 */

const URLHAUS_TTL_SECONDS = 60 * 60 * 24; // 1 day
const URLHAUS_HOST_API = "https://urlhaus-api.abuse.ch/v1/host/";

/** Fetch the raw URLhaus host-lookup JSON through the harness. Never throws. */
export async function fetchUrlhaus(
  domain: string,
  fetcher: Fetcher,
  authKey?: string,
): Promise<{ ok: boolean; json: string | null }> {
  const headers: Record<string, string> = {
    "content-type": "application/x-www-form-urlencoded",
  };
  if (authKey) headers["auth-key"] = authKey;

  const res = await fetcher({
    source: "urlhaus",
    key: domain,
    url: URLHAUS_HOST_API,
    ttlSeconds: URLHAUS_TTL_SECONDS,
    kind: "third-party",
    method: "POST",
    headers,
    body: `host=${encodeURIComponent(domain)}`,
  });
  return res.ok ? { ok: true, json: res.body } : { ok: false, json: null };
}

/**
 * PURE: URLhaus host response → listed + count.
 *   query_status "ok" + urls[]   ⇒ listed (count)
 *   query_status "no_results"    ⇒ not listed
 *   anything else / unauthorized ⇒ null ("not checked")
 * Never throws.
 */
export function parseUrlhaus(json: string): {
  listed: boolean | null;
  count: number | null;
} {
  try {
    const o = JSON.parse(json) as { query_status?: string; urls?: unknown[] };
    if (o?.query_status === "ok") {
      return { listed: true, count: Array.isArray(o.urls) ? o.urls.length : null };
    }
    if (o?.query_status === "no_results") {
      return { listed: false, count: 0 };
    }
    return { listed: null, count: null };
  } catch {
    return { listed: null, count: null };
  }
}
