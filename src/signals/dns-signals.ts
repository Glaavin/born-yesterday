import type { Fetcher } from "../lib/cached-fetch";
import type { CollectorResult, Signal, SignalSource, SignalStatus } from "./types";
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
// Neutral label: we query Cloudflare but link the dns.google record viewer (a
// human view of the same record), so the label shouldn't name a different operator.
const dnsSource = (name: string, type: string): SignalSource => ({
  label: "DNS over HTTPS",
  url: `https://dns.google/query?name=${encodeURIComponent(name)}&type=${type}`,
});

/**
 * One DoH lookup. Returns the answers AND whether the query completed —
 * an empty array from a completed query ("no such record") is a FINDING,
 * while an empty array from a failed query is not (Story 18.3 §1.1).
 */
const answers = async (
  name: string,
  type: string,
  fetcher: Fetcher,
): Promise<{ ok: boolean; values: string[] }> => {
  const r = await fetchDoh(name, type, fetcher);
  if (!r.ok || !r.json) return { ok: false, values: [] };
  // `ok` tracks the PARSE, not the fetch: a 200 carrying a malformed body is a
  // failed observation, not "no such record" (docs/conventions.md).
  const values = parseAnswers(r.json, type);
  return values ? { ok: true, values } : { ok: false, values: [] };
};

export async function collectDns(domain: string, deps: DnsDeps): Promise<CollectorResult> {
  const dmarcName = `_dmarc.${domain}`;

  // Independent lookups in parallel.
  const [txtQ, dmarcQ, aQ, mxQ] = await Promise.all([
    answers(domain, "TXT", deps.fetcher),
    answers(dmarcName, "TXT", deps.fetcher),
    answers(domain, "A", deps.fetcher),
    answers(domain, "MX", deps.fetcher),
  ]);

  const st = (q: { ok: boolean }): SignalStatus => (q.ok ? "ok" : "failed");
  const aIps = aQ.values;
  const spf = findSpf(txtQ.values);
  const dmarc = findDmarc(dmarcQ.values);
  // MX data is "<priority> <host>." → keep the host, drop the trailing dot.
  const mxHosts = mxQ.values
    .map((m) => m.split(/\s+/).pop()?.replace(/\.$/, "") ?? "")
    .filter(Boolean);

  // Reverse DNS on the first A IP → hosting provider (best-effort).
  let hosting: string | null = null;
  // No A record to reverse ⇒ the PTR lookup is NOT ATTEMPTED, which is distinct
  // from attempting it and finding no hostname.
  let hostingStatus: SignalStatus = "not_attempted";
  const rev = aIps.length ? reverseName(aIps[0]) : null;
  if (rev) {
    const ptrQ = await answers(rev, "PTR", deps.fetcher);
    hostingStatus = st(ptrQ);
    hosting = hostingFromPtr(ptrQ.values[0] ?? null);
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
      // A completed lookup cites the query even when no record exists —
      // "we asked, and there is none" is a sourced finding.
      source: txtQ.ok ? dnsSource(domain, "TXT") : null,
      status: st(txtQ),
    },
    {
      key: "dns_dmarc",
      label: "DMARC record",
      valueText: dmarc,
      valueNum: null,
      source: dmarcQ.ok ? dnsSource(dmarcName, "TXT") : null,
      status: st(dmarcQ),
    },
    {
      key: "dns_a",
      label: "A records",
      valueText: aIps.length ? aIps.join(", ") : null,
      valueNum: aIps.length || null,
      source: aQ.ok ? dnsSource(domain, "A") : null,
      status: st(aQ),
    },
    {
      key: "dns_mx",
      label: "MX records",
      valueText: mxHosts.length ? mxHosts.join(", ") : null,
      valueNum: null,
      source: mxQ.ok ? dnsSource(domain, "MX") : null,
      status: st(mxQ),
    },
    {
      key: "hosting_provider",
      label: "Hosting provider",
      valueText: hosting,
      valueNum: null,
      source: hostingStatus === "ok" && rev ? dnsSource(rev, "PTR") : null,
      status: hostingStatus,
    },
  ];

  return {
    collector: "dns",
    signals,
    ok: resolved,
    error: resolved ? undefined : "domain did not resolve (no DNS answers)",
  };
}
