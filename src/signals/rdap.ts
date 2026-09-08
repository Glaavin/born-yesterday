import type { Fetcher } from "../lib/cached-fetch";

/**
 * RDAP — the primary registration source. Three-tier resolution (Story 25, W2):
 *
 *   1. DIRECT REGISTRY — resolve the authoritative registry from the IANA
 *      bootstrap file and query it directly. W0 measured this ~3–7× faster than
 *      the middleman (Verisign 14–73 ms vs rdap.org 96–235 ms), and the
 *      bootstrap is effectively free (cached for days, one file for every TLD).
 *   2. rdap.org — kept as the MIDDLE tier, not dropped: seven verified calls is
 *      thin evidence across ~1,500 TLDs of registry quirks, and the fallback
 *      costs one config entry (roadmap §5-W2).
 *   3. WHOIS port-43 — the tier below this, owned by domain-identity.ts.
 *
 * All fetches ride the EXISTING harness (kind:"third-party"): it handles
 * redirects, caching, SSRF re-validation per hop, and politeness. Fetch and
 * parse are split so parseRdap / parseBootstrap stay pure and unit-tested offline.
 */

/** 7 days — registration data is effectively static. */
const RDAP_TTL_SECONDS = 60 * 60 * 24 * 7;
/** Days — the bootstrap "changes rarely and every lookup needs it" (roadmap §5-W2). */
const BOOTSTRAP_TTL_SECONDS = 60 * 60 * 24 * 7;

export const RDAP_BOOTSTRAP_URL = "https://data.iana.org/rdap/dns.json";

export const rdapUrl = (domain: string): string =>
  `https://rdap.org/domain/${encodeURIComponent(domain)}`;

/** Which tier answered — for the production latency report; null when none did. */
export type RdapTier = "registry" | "rdap.org" | null;

const tldOf = (domain: string): string => domain.toLowerCase().split(".").pop() ?? "";

/**
 * PURE: the IANA bootstrap JSON → a TLD→registry-base map.
 *
 * Shape: `{ services: [ [ [tld, …], [rdapBaseUrl, …] ], … ] }`. A service may
 * list several base URLs (an http and an https form for the same registry); we
 * prefer https and otherwise take the first. Returns null on unparseable input
 * or a payload that is not the bootstrap shape — a fetch/shape failure is NOT
 * "no registries" (docs/conventions.md).
 */
export function parseBootstrap(json: string): Map<string, string> | null {
  try {
    const o = JSON.parse(json) as { services?: unknown };
    if (!Array.isArray(o.services)) return null;
    const map = new Map<string, string>();
    for (const svc of o.services) {
      if (!Array.isArray(svc) || !Array.isArray(svc[0]) || !Array.isArray(svc[1])) continue;
      const tlds = svc[0] as unknown[];
      const urls = (svc[1] as unknown[]).filter((u): u is string => typeof u === "string");
      if (urls.length === 0) continue;
      const base = urls.find((u) => u.startsWith("https://")) ?? urls[0];
      for (const t of tlds) {
        if (typeof t === "string" && t) map.set(t.toLowerCase(), base);
      }
    }
    return map.size > 0 ? map : null;
  } catch {
    return null;
  }
}

/** Resolve the registry base for a domain's TLD, or null if the bootstrap does
 *  not cover it (.edu and several ccTLDs — we never guess a registry). */
export function registryBaseForTld(map: Map<string, string>, domain: string): string | null {
  return map.get(tldOf(domain)) ?? null;
}

/** Join a registry base (trailing slash or not) to the `domain/<name>` path. */
export function directRdapUrl(base: string, domain: string): string {
  return `${base.replace(/\/+$/, "")}/domain/${encodeURIComponent(domain)}`;
}

/** Fetch + parse the bootstrap file (cached for days). null on failure. */
export async function fetchRdapBootstrap(fetcher: Fetcher): Promise<Map<string, string> | null> {
  const res = await fetcher({
    source: "rdap-bootstrap",
    key: "dns.json",
    url: RDAP_BOOTSTRAP_URL,
    ttlSeconds: BOOTSTRAP_TTL_SECONDS,
    kind: "third-party",
  });
  return res.ok ? parseBootstrap(res.body) : null;
}

/**
 * Fetch the raw RDAP JSON through the harness, three-tier. Never throws.
 * Returns which tier answered so the collector/report can note the path taken.
 */
export async function fetchRdap(
  domain: string,
  fetcher: Fetcher,
): Promise<{ ok: boolean; json: string | null; tier: RdapTier }> {
  // Tier 1 — direct registry, resolved via the (cached) bootstrap.
  try {
    const bootstrap = await fetchRdapBootstrap(fetcher);
    const base = bootstrap ? registryBaseForTld(bootstrap, domain) : null;
    if (base) {
      const res = await fetcher({
        source: "rdap-registry",
        key: domain,
        url: directRdapUrl(base, domain),
        ttlSeconds: RDAP_TTL_SECONDS,
        kind: "third-party",
      });
      if (res.ok) return { ok: true, json: res.body, tier: "registry" };
    }
  } catch {
    // fall through to the middleman
  }

  // Tier 2 — rdap.org middleman (redirects to the authoritative registry).
  const res = await fetcher({
    source: "rdap",
    key: domain,
    url: rdapUrl(domain),
    ttlSeconds: RDAP_TTL_SECONDS,
    kind: "third-party",
  });
  return res.ok ? { ok: true, json: res.body, tier: "rdap.org" } : { ok: false, json: null, tier: null };
}

/** Pull the "fn" (formatted name) value out of an RDAP entity's vcardArray. */
function vcardFn(entity: unknown): string | null {
  try {
    const arr = (entity as { vcardArray?: unknown[] })?.vcardArray;
    if (!Array.isArray(arr) || !Array.isArray(arr[1])) return null;
    const fn = (arr[1] as unknown[]).find(
      (x) => Array.isArray(x) && x[0] === "fn",
    ) as unknown[] | undefined;
    return fn && typeof fn[3] === "string" ? fn[3] : null;
  } catch {
    return null;
  }
}

/**
 * PURE: parse RDAP JSON → registration date (ISO), registrar name, and the most
 * recent `transfer` event date (ISO). Defensive — returns nulls when fields are
 * absent and NEVER throws on shape variance.
 *
 * `transferDate` is the MOST RECENT of any `transfer` events (Story 25, W2). A
 * transfer means the sponsoring registrar changed; the most recent one is the
 * current operating fact. `reregistration`/`reinstantiation` are deliberately
 * NOT read — 0 of 7 registries emit them (roadmap §5-W2), so building for them
 * would model a value that never arrives. transferDate null = the check ran and
 * found no transfer event, which is NOT evidence of absence (never published as
 * such); it is distinct from an unparseable record, which returns null overall.
 */
export function parseRdap(json: string): {
  registrationDate: string | null;
  registrar: string | null;
  transferDate: string | null;
} | null {
  try {
    const o = JSON.parse(json) as {
      events?: Array<{ eventAction?: string; eventDate?: string }>;
      entities?: Array<{ roles?: string[] }>;
    };

    let registrationDate: string | null = null;
    let transferDate: string | null = null;
    if (Array.isArray(o.events)) {
      const ev = o.events.find(
        (e) => e?.eventAction === "registration" && e?.eventDate,
      );
      if (ev?.eventDate) registrationDate = String(ev.eventDate);

      for (const e of o.events) {
        if (e?.eventAction === "transfer" && e?.eventDate) {
          const d = String(e.eventDate);
          // Most recent wins. String compare is safe for ISO-8601 same-offset
          // dates; the registries tested emit UTC ("Z") dates.
          if (transferDate == null || d > transferDate) transferDate = d;
        }
      }
    }

    let registrar: string | null = null;
    if (Array.isArray(o.entities)) {
      const reg = o.entities.find(
        (e) => Array.isArray(e?.roles) && e.roles.includes("registrar"),
      );
      if (reg) registrar = vcardFn(reg);
    }

    return { registrationDate, registrar, transferDate };
  } catch {
    return null; // unparseable — NOT "no registration data"
  }
}
