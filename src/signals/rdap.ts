import type { Fetcher } from "../lib/cached-fetch";

/**
 * RDAP — the primary registration source. Rides the EXISTING harness
 * (kind:"third-party"): rdap.org redirects to the authoritative registry and the
 * harness handles the redirect + caching + politeness. Fetch and parse are split
 * so parseRdap is pure and unit-tested offline.
 */

/** 7 days — registration data is effectively static. */
const RDAP_TTL_SECONDS = 60 * 60 * 24 * 7;

export const rdapUrl = (domain: string): string =>
  `https://rdap.org/domain/${encodeURIComponent(domain)}`;

/** Fetch the raw RDAP JSON through the harness. Never throws. */
export async function fetchRdap(
  domain: string,
  fetcher: Fetcher,
): Promise<{ ok: boolean; json: string | null }> {
  const res = await fetcher({
    source: "rdap",
    key: domain,
    url: rdapUrl(domain),
    ttlSeconds: RDAP_TTL_SECONDS,
    kind: "third-party",
  });
  return res.ok ? { ok: true, json: res.body } : { ok: false, json: null };
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
 * PURE: parse RDAP JSON → registration date (ISO) + registrar name. Defensive —
 * returns nulls when fields are absent and NEVER throws on shape variance.
 */
export function parseRdap(json: string): {
  registrationDate: string | null;
  registrar: string | null;
} {
  try {
    const o = JSON.parse(json) as {
      events?: Array<{ eventAction?: string; eventDate?: string }>;
      entities?: Array<{ roles?: string[] }>;
    };

    let registrationDate: string | null = null;
    if (Array.isArray(o.events)) {
      const ev = o.events.find(
        (e) => e?.eventAction === "registration" && e?.eventDate,
      );
      if (ev?.eventDate) registrationDate = String(ev.eventDate);
    }

    let registrar: string | null = null;
    if (Array.isArray(o.entities)) {
      const reg = o.entities.find(
        (e) => Array.isArray(e?.roles) && e.roles.includes("registrar"),
      );
      if (reg) registrar = vcardFn(reg);
    }

    return { registrationDate, registrar };
  } catch {
    return { registrationDate: null, registrar: null };
  }
}
