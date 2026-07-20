import type { Fetcher } from "../lib/cached-fetch";

/**
 * Live homepage fetch (mvp-spec §2B current status) — the user-controlled host,
 * so it rides the harness as kind:"live-site": the SSRF host-check, robots.txt
 * respect (§10), the scheme allowlist, and the size cap all apply. A
 * blocked/robots-disallowed/errored fetch ⇒ html null ("not checked"); the
 * Wayback signals still stand. Never throws.
 */

const HOMEPAGE_TTL_SECONDS = 60 * 60 * 24; // 1 day

export const homepageUrl = (domain: string): string => `https://${domain}/`;

export async function fetchHomepage(
  domain: string,
  fetcher: Fetcher,
): Promise<{ ok: boolean; html: string | null; reason?: string }> {
  const res = await fetcher({
    source: "homepage",
    key: domain,
    url: homepageUrl(domain),
    ttlSeconds: HOMEPAGE_TTL_SECONDS,
    kind: "live-site",
  });
  return res.ok ? { ok: true, html: res.body } : { ok: false, html: null, reason: res.error };
}
