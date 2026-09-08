import type { Fetcher, FetchResult } from "../../../lib/cached-fetch";
import { cdxFirstUrl } from "../../../signals/wayback";
import { ccIndexUrl, CC_THRESHOLD_CRAWL } from "../../../signals/common-crawl";
import { rdapUrl } from "../../../signals/rdap";
import { dohUrl } from "../../../signals/doh";
import { crtshUrl } from "../../../signals/crtsh";

/**
 * Live-probe registry — Story 26 (W8).
 *
 * THE ONE HARD RULE: every probe here fires through the harness (`cachedFetch`),
 * so it experiences the concurrency budget, the per-host rate limiter, the SSRF
 * guard and the deadline exactly as the product does. `runProbe` is the ONLY
 * outbound path in this file and it takes a `Fetcher`; the route wires the real
 * `cachedFetch` and a test asserts that identity. There is no raw `fetch` here
 * on purpose — the 23.2 correction came from a raw-fetch probe that measured a
 * call path the product never takes.
 *
 * PROBES ARE NEVER CACHED (`ttlSeconds: 0`). A cached hit would report ~0ms and
 * describe nothing about the source's health right now, which is the only thing
 * a live probe is for. ttl:0 also means the probe path writes NOTHING (the
 * harness only ever writes the cache on a 2xx with ttl>0) — part of this
 * story's read-only guarantee.
 *
 * FIXED, BENIGN TARGET. Every domain-parameterised probe uses `example.com`
 * (IANA-reserved, universally registered and archived). The probe answers "is
 * this source reachable and answering in a sane shape", not "analyse this
 * domain" — so the target is a constant, no report is generated, and nothing
 * about a visitor's input reaches here.
 *
 * `wired` labels whether the source is on the product's hot path TODAY or is a
 * diagnostic/alternative endpoint (IANA bootstrap, a direct registry, Google
 * DoH, the Wayback Availability API). Stated in the words, not implied: the
 * panel must not let an operator read "Google DoH: 120ms" as evidence about a
 * resolver the product does not currently call.
 */

const SAMPLE_DOMAIN = "example.com";

export type Wired = "wired" | "diagnostic";

export interface ProbeRequest {
  url: string;
  kind: "third-party" | "live-site";
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

export interface ProbeDef {
  id: string;
  label: string;
  host: string;
  wired: Wired;
  note?: string;
  build: () => ProbeRequest;
  /** Cheap "does the 2xx body look like what this source returns" check. Only
   *  consulted on a 2xx; a non-2xx outcome is reported as the harness error. */
  sane: (body: string) => boolean;
}

const startsWith = (body: string, ch: string) => body.trimStart().startsWith(ch);

export const PROBES: readonly ProbeDef[] = [
  {
    id: "wayback-cdx",
    label: "Wayback CDX",
    host: "web.archive.org",
    wired: "wired",
    note: "The establishment archive-span probe (Story 19/24). Rate-budgeted host.",
    build: () => ({ url: cdxFirstUrl(SAMPLE_DOMAIN), kind: "third-party" }),
    sane: (b) => startsWith(b, "[") || b.trim() === "",
  },
  {
    id: "wayback-availability",
    label: "Wayback Availability",
    host: "archive.org",
    wired: "diagnostic",
    note: "Availability API — W0 measured it at 364ms but the product uses CDX, not this. Shares archive.org's budget.",
    build: () => ({
      url: `https://archive.org/wayback/available?url=${encodeURIComponent(SAMPLE_DOMAIN)}`,
      kind: "third-party",
    }),
    sane: (b) => b.includes("archived_snapshots"),
  },
  {
    id: "common-crawl",
    label: "Common Crawl index",
    host: "index.commoncrawl.org",
    wired: "wired",
    note: `Primary establishment instrument (Story 24), threshold crawl ${CC_THRESHOLD_CRAWL}. A 404 is a VALID answer (absent), not a failure.`,
    build: () => ({ url: ccIndexUrl(CC_THRESHOLD_CRAWL, SAMPLE_DOMAIN), kind: "third-party" }),
    sane: (b) => startsWith(b, "{") || b.trim() === "",
  },
  {
    id: "iana-bootstrap",
    label: "IANA RDAP bootstrap",
    host: "data.iana.org",
    wired: "wired",
    note: "On the hot path since Story 25 (W2): consulted (cached ~7d) to resolve the authoritative registry for tier-1 direct RDAP.",
    build: () => ({ url: "https://data.iana.org/rdap/dns.json", kind: "third-party" }),
    sane: (b) => b.includes("\"services\""),
  },
  {
    id: "direct-registry",
    label: "Direct registry (.com / Verisign)",
    host: "rdap.verisign.com",
    wired: "wired",
    note: "The PRIMARY RDAP path since Story 25 (W2): the authoritative .com endpoint, resolved via the IANA bootstrap and queried directly (rdap.org is now the fallback tier).",
    build: () => ({
      url: `https://rdap.verisign.com/com/v1/domain/${encodeURIComponent(SAMPLE_DOMAIN)}`,
      kind: "third-party",
    }),
    sane: (b) => startsWith(b, "{") && b.includes("objectClassName"),
  },
  {
    id: "rdap-org",
    label: "rdap.org",
    host: "rdap.org",
    wired: "wired",
    note: "The FALLBACK registration tier since Story 25 (W2): used when the bootstrap lacks the TLD or the direct registry fails. Redirects to the authoritative registry; the harness follows the hop.",
    build: () => ({ url: rdapUrl(SAMPLE_DOMAIN), kind: "third-party" }),
    sane: (b) => startsWith(b, "{"),
  },
  {
    id: "doh-cloudflare",
    label: "Cloudflare DoH",
    host: "cloudflare-dns.com",
    wired: "wired",
    note: "The product's DNS-over-HTTPS resolver.",
    build: () => ({
      url: dohUrl(SAMPLE_DOMAIN, "A"),
      kind: "third-party",
      headers: { accept: "application/dns-json" },
    }),
    sane: (b) => b.includes("\"Status\""),
  },
  {
    id: "doh-google",
    label: "Google DoH",
    host: "dns.google",
    wired: "diagnostic",
    note: "An alternative resolver. Not on the hot path today; probed as a fallback candidate.",
    build: () => ({
      url: `https://dns.google/resolve?name=${encodeURIComponent(SAMPLE_DOMAIN)}&type=A`,
      kind: "third-party",
    }),
    sane: (b) => b.includes("\"Status\""),
  },
  {
    id: "crtsh",
    label: "crt.sh",
    host: "crt.sh",
    wired: "wired",
    note: "Certificate-transparency lookup.",
    build: () => ({ url: crtshUrl(SAMPLE_DOMAIN), kind: "third-party" }),
    sane: (b) => startsWith(b, "["),
  },
  {
    id: "urlhaus",
    label: "URLhaus (abuse.ch)",
    host: "urlhaus-api.abuse.ch",
    wired: "wired",
    note: "The threat feed currently wired. POST host-lookup; a 'no_results' shape is the sane, expected answer for a benign host.",
    build: () => ({
      url: "https://urlhaus-api.abuse.ch/v1/host/",
      kind: "third-party",
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: `host=${encodeURIComponent(SAMPLE_DOMAIN)}`,
    }),
    sane: (b) => b.includes("\"query_status\""),
  },
];

export function probeById(id: string): ProbeDef | undefined {
  return PROBES.find((p) => p.id === id);
}

/** The harness's own error codes — the source of truth, extracted so the panel
 *  can never drift from what `cached-fetch` actually returns. */
export type FetchErrorCode = Exclude<FetchResult, { ok: true }>["error"];

export interface ProbeResult {
  id: string;
  label: string;
  host: string;
  wired: Wired;
  note?: string;
  /** The harness outcome verbatim — including `budget-exhausted` / `rate-limited`,
   *  which the historical view CANNOT show (they are not persisted; see queries.ts). */
  outcome: "ok" | FetchErrorCode;
  status?: number;
  ms: number;
  fromCache: boolean;
  /** null when not applicable (non-2xx outcome). */
  saneShape: boolean | null;
  bodyPreview?: string;
}

/**
 * Fire ONE probe through the harness and describe what came back. The `fetcher`
 * is injected; production passes `cachedFetch`. Latency is wall-clock around the
 * harness call, so it includes any budget/rate decision (both of which fail fast
 * — they never block — so a declined probe reports its refusal, not a wait).
 */
export async function runProbe(def: ProbeDef, fetcher: Fetcher): Promise<ProbeResult> {
  const req = def.build();
  const started = Date.now();
  const res = await fetcher({
    source: `panel-probe:${def.id}`,
    key: `probe:${def.id}`,
    url: req.url,
    ttlSeconds: 0, // live every click; also writes nothing
    kind: req.kind,
    method: req.method,
    headers: req.headers,
    body: req.body,
  });
  const ms = Date.now() - started;

  const base = {
    id: def.id,
    label: def.label,
    host: def.host,
    wired: def.wired,
    note: def.note,
    ms,
  };

  if (res.ok) {
    return {
      ...base,
      outcome: "ok",
      status: res.status,
      fromCache: res.fromCache,
      saneShape: def.sane(res.body),
      bodyPreview: res.body.slice(0, 160),
    };
  }
  return {
    ...base,
    outcome: res.error,
    status: res.status,
    fromCache: false,
    saneShape: null,
  };
}
