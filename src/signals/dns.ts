/**
 * Pure DNS record helpers — pick the records we care about out of TXT answers,
 * and a best-effort hosting-provider label from a reverse-DNS hostname.
 */

/** The SPF record (TXT starting "v=spf1"), or null. */
export function findSpf(txts: string[]): string | null {
  return txts.find((t) => t.toLowerCase().startsWith("v=spf1")) ?? null;
}

/** The DMARC record (TXT at _dmarc.<domain> starting "v=DMARC1"), or null. */
export function findDmarc(txts: string[]): string | null {
  return txts.find((t) => t.toLowerCase().startsWith("v=dmarc1")) ?? null;
}

// Best-effort provider labels keyed by a substring of the reverse-DNS hostname.
// Heuristic, intentionally small; order matters (first match wins).
const PROVIDER_SUFFIXES: Array<[string, string]> = [
  ["amazonaws.com", "AWS"],
  ["1e100.net", "Google"],
  ["googleusercontent.com", "Google"],
  ["cloudflare", "Cloudflare"],
  ["vercel", "Vercel"],
  ["azure", "Azure"],
  ["microsoft.com", "Microsoft"],
  ["digitalocean.com", "DigitalOcean"],
  ["akamai", "Akamai"],
  ["fastly", "Fastly"],
  ["linode", "Linode"],
  ["ovh.net", "OVH"],
  ["hetzner", "Hetzner"],
];

/**
 * Best-effort hosting provider from a PTR hostname. Returns a known label, else
 * the raw PTR host (trailing dot stripped), or null when there's no PTR.
 */
export function hostingFromPtr(ptrHostname: string | null): string | null {
  if (!ptrHostname) return null;
  const h = ptrHostname.toLowerCase().replace(/\.$/, "");
  for (const [needle, label] of PROVIDER_SUFFIXES) {
    if (h.includes(needle)) return label;
  }
  return ptrHostname.replace(/\.$/, "");
}

/** IPv4 → reverse-DNS name ("1.2.3.4" → "4.3.2.1.in-addr.arpa"); null otherwise. */
export function reverseName(ip: string): string | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (!m) return null;
  return `${m[4]}.${m[3]}.${m[2]}.${m[1]}.in-addr.arpa`;
}
