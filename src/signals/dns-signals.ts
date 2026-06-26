import type { Fetcher } from "../lib/cached-fetch";
import type { CollectorResult, Signal, SignalSource } from "./types";
import { fetchDoh, parseAnswers } from "./doh";
import { findSpf, findDmarc, hostingFromPtr, reverseName } from "./dns";

/**
 * DNS hygiene signals (mvp-spec §2A): SPF, DMARC, A, MX, and current hosting
 * provider via reverse DNS — all over DoH to Cloudflare's fixed resolver (no new
 * transport, no user-host connection). ABSENCE IS INFORMATION: a resolving
 * domain with no SPF/DMARC/MX is ok:true with those null ("Not found"). Total
 * DNS failure / NXDOMAIN → ok:false + nulls; never throws.
 */

export interface DnsDeps {
  fetcher: Fetcher;
}

// Human-viewable record source for a given name/type (dns.google's query UI).
const dnsSource = (name: string, type: string): SignalSource => ({
  label: "DNS over HTTPS (Cloudflare)",
  url: `https://dns.google/query?name=${encodeURIComponent(name)}&type=${type}`,
});

const answers = async (
  name: string,
  type: string,
  fetcher: Fetcher,
): Promise<string[]> => {
  const r = await fetchDoh(name, type, fetcher);
  return r.ok && r.json ? parseAnswers(r.json, type) : [];
};

export async function collectDns(domain: string, deps: DnsDeps): Promise<CollectorResult> {
  const dmarcName = `_dmarc.${domain}`;

  // Independent lookups in parallel.
  const [txt, dmarcTxt, aIps, mxRaw] = await Promise.all([
    answers(domain, "TXT", deps.fetcher),
    answers(dmarcName, "TXT", deps.fetcher),
    answers(domain, "A", deps.fetcher),
    answers(domain, "MX", deps.fetcher),
  ]);

  const spf = findSpf(txt);
  const dmarc = findDmarc(dmarcTxt);
  // MX data is "<priority> <host>." → keep the host, drop the trailing dot.
  const mxHosts = mxRaw
    .map((m) => m.split(/\s+/).pop()?.replace(/\.$/, "") ?? "")
    .filter(Boolean);

  // Reverse DNS on the first A IP → hosting provider (best-effort).
  let hosting: string | null = null;
  const rev = aIps.length ? reverseName(aIps[0]) : null;
  if (rev) {
    const ptr = await answers(rev, "PTR", deps.fetcher);
    hosting = hostingFromPtr(ptr[0] ?? null);
  }

  // Resolved = we got DNS answers for A or any query.
  const resolved =
    aIps.length > 0 || spf != null || dmarc != null || mxHosts.length > 0;

  const signals: Signal[] = [
    {
      key: "dns_spf",
      label: "SPF record",
      valueText: spf,
      valueNum: null,
      source: spf ? dnsSource(domain, "TXT") : null,
    },
    {
      key: "dns_dmarc",
      label: "DMARC record",
      valueText: dmarc,
      valueNum: null,
      source: dmarc ? dnsSource(dmarcName, "TXT") : null,
    },
    {
      key: "dns_a",
      label: "A records",
      valueText: aIps.length ? aIps.join(", ") : null,
      valueNum: aIps.length || null,
      source: aIps.length ? dnsSource(domain, "A") : null,
    },
    {
      key: "dns_mx",
      label: "MX records",
      valueText: mxHosts.length ? mxHosts.join(", ") : null,
      valueNum: null,
      source: mxHosts.length ? dnsSource(domain, "MX") : null,
    },
    {
      key: "hosting_provider",
      label: "Hosting provider",
      valueText: hosting,
      valueNum: null,
      source: hosting && rev ? dnsSource(rev, "PTR") : null,
    },
  ];

  return {
    collector: "dns",
    signals,
    ok: resolved,
    error: resolved ? undefined : "domain did not resolve (no DNS answers)",
  };
}
