import type { Fetcher } from "../lib/cached-fetch";

/**
 * SSLMate Cert Spotter — the SECOND, independent source for CURRENT-certificate
 * facts (Story 27, W4 · Move 05 architectural half). It indexes 40+ CT logs, is
 * free (100 single-hostname queries/hour, no key, no card), and returns
 * UNEXPIRED certificates only. Verified live 2026-09-08: for 31-year-old
 * stripe.com the earliest issuance it returns is ~4 months old — so it CANNOT
 * supply certificate history (that was crt.sh's job, and crt.sh is down). It is
 * used here purely for availability redundancy on the current-cert facts, which
 * feed NO verdict; Move 05's evidentiary half does not apply.
 *
 * Rides the existing harness (kind:"third-party"). Fetch and parse are split so
 * parseCertspotter stays pure and unit-tested offline.
 */

/** 1 day — the current cert is stable within a day; a fresh handshake leads anyway. */
const CERTSPOTTER_TTL_SECONDS = 60 * 60 * 24;

export const certspotterUrl = (domain: string): string =>
  `https://api.certspotter.com/v1/issuances?domain=${encodeURIComponent(domain)}` +
  `&include_subdomains=false&expand=issuer&expand=dns_names&expand=not_before&expand=not_after`;

/** Fetch the raw issuances JSON through the harness. Never throws. */
export async function fetchCertspotter(
  domain: string,
  fetcher: Fetcher,
): Promise<{ ok: boolean; json: string | null }> {
  const res = await fetcher({
    source: "certspotter",
    key: domain,
    url: certspotterUrl(domain),
    ttlSeconds: CERTSPOTTER_TTL_SECONDS,
    kind: "third-party",
  });
  return res.ok ? { ok: true, json: res.body } : { ok: false, json: null };
}

/** Pull the organisation (O=) out of an issuer DN string, if present. */
function orgFromDn(dn: string | undefined): string | null {
  if (!dn) return null;
  // O= value, optionally quoted (DigiCert quotes "DigiCert, Inc.").
  const m = /(?:^|,)\s*O=("([^"]*)"|[^,]*)/.exec(dn);
  if (!m) return null;
  const v = (m[2] ?? m[1] ?? "").trim();
  return v.length ? v : null;
}

/**
 * PURE: SSLMate issuances JSON → the CURRENT cert's issuer + validity window,
 * taken from the newest unexpired issuance (max not_before). Defensive:
 *   - unparseable / non-array  → null  (a fetch/shape failure is NOT "no cert")
 *   - empty array              → { nulls } (checked, found no unexpired cert)
 * issuer prefers the friendly_name, else the O= of the issuer DN.
 */
export function parseCertspotter(json: string): {
  issuer: string | null;
  validFrom: string | null;
  validTo: string | null;
} | null {
  try {
    const arr = JSON.parse(json) as unknown;
    if (!Array.isArray(arr)) return null;
    if (arr.length === 0) return { issuer: null, validFrom: null, validTo: null };

    type Iss = { issuer?: { friendly_name?: string; name?: string }; not_before?: string; not_after?: string };
    const rows = arr as Iss[];
    let current: Iss | null = null;
    for (const r of rows) {
      if (typeof r?.not_before !== "string") continue;
      if (current == null || r.not_before > (current.not_before ?? "")) current = r;
    }
    if (current == null) return { issuer: null, validFrom: null, validTo: null };

    const issuer = current.issuer?.friendly_name?.trim() || orgFromDn(current.issuer?.name);
    return {
      issuer: issuer && issuer.length ? issuer : null,
      validFrom: current.not_before ?? null,
      validTo: current.not_after ?? null,
    };
  } catch {
    return null;
  }
}
