import { describe, it, expect, vi } from "vitest";
import { parseAnswers } from "./doh";
import { findSpf, findDmarc, hostingFromPtr, reverseName } from "./dns";
import { collectDns, type DnsDeps } from "./dns-signals";
import type { Fetcher, FetchResult } from "../lib/cached-fetch";

// DoH JSON fixtures.
const doh = (answer: Array<{ type: number; data: string }>, status = 0) =>
  JSON.stringify({ Status: status, Answer: answer });

const TXT_SPF = doh([
  { type: 16, data: '"v=spf1 include:_spf.google.com ~all"' },
  { type: 16, data: '"google-site-verification=abc"' },
]);
const TXT_DMARC = doh([{ type: 16, data: '"v=DMARC1; p=reject; rua=mailto:d@x.com"' }]);
const TXT_CHUNKED = doh([{ type: 16, data: '"v=DKIM1; k=rsa; " "p=MIGfMA0join"' }]);
const A = doh([
  { type: 1, data: "93.184.216.34" },
  { type: 1, data: "93.184.216.35" },
]);
const MX = doh([
  { type: 15, data: "10 aspmx.l.google.com." },
  { type: 15, data: "20 alt1.aspmx.l.google.com." },
]);
const PTR_AWS = doh([{ type: 12, data: "ec2-1-2-3-4.compute-1.amazonaws.com." }]);
const NXDOMAIN = JSON.stringify({ Status: 3 });

describe("parseAnswers (pure)", () => {
  it("dequotes a TXT record", () => {
    expect(parseAnswers(TXT_SPF, "TXT")).toEqual([
      "v=spf1 include:_spf.google.com ~all",
      "google-site-verification=abc",
    ]);
  });
  it("concatenates chunked TXT", () => {
    expect(parseAnswers(TXT_CHUNKED, "TXT")).toEqual(["v=DKIM1; k=rsa; p=MIGfMA0join"]);
  });
  it("reads A / MX / PTR data", () => {
    expect(parseAnswers(A, "A")).toEqual(["93.184.216.34", "93.184.216.35"]);
    expect(parseAnswers(MX, "MX")).toEqual(["10 aspmx.l.google.com.", "20 alt1.aspmx.l.google.com."]);
    expect(parseAnswers(PTR_AWS, "PTR")).toEqual(["ec2-1-2-3-4.compute-1.amazonaws.com."]);
  });
  it("filters by requested type", () => {
    expect(parseAnswers(TXT_SPF, "A")).toEqual([]); // TXT answers, asked for A
  });
  it("returns [] for NXDOMAIN / empty / malformed", () => {
    expect(parseAnswers(NXDOMAIN, "A")).toEqual([]);
    expect(parseAnswers(doh([]), "A")).toEqual([]);
    expect(parseAnswers("{ not json", "A")).toEqual([]);
  });
});

describe("record helpers (pure)", () => {
  it("findSpf / findDmarc present and absent", () => {
    expect(findSpf(["v=spf1 ~all", "other"])).toBe("v=spf1 ~all");
    expect(findSpf(["no spf here"])).toBeNull();
    expect(findDmarc(["v=DMARC1; p=none"])).toBe("v=DMARC1; p=none");
    expect(findDmarc(["v=spf1 ~all"])).toBeNull();
  });
  it("hostingFromPtr maps known suffixes, falls back to raw, and handles no-PTR", () => {
    expect(hostingFromPtr("ec2-1-2-3-4.compute-1.amazonaws.com.")).toBe("AWS");
    expect(hostingFromPtr("any-in-2678.1e100.net.")).toBe("Google");
    expect(hostingFromPtr("host.cloudflare.com.")).toBe("Cloudflare");
    expect(hostingFromPtr("mail.someregistrar.example.")).toBe("mail.someregistrar.example");
    expect(hostingFromPtr(null)).toBeNull();
  });
  it("reverseName builds the in-addr.arpa name", () => {
    expect(reverseName("93.184.216.34")).toBe("34.216.184.93.in-addr.arpa");
    expect(reverseName("not-an-ip")).toBeNull();
  });
});

describe("collectDns", () => {
  // Route DoH responses by the collector's cache key `${name}:${type}`.
  const makeFetcher = (map: Record<string, string>): Fetcher =>
    vi.fn<Fetcher>(async (opts): Promise<FetchResult> => {
      const body = map[opts.key] ?? NXDOMAIN;
      return { ok: true, status: 200, body, fromCache: false };
    });

  it("emits all five signals when SPF/DMARC/A/MX/PTR are present", async () => {
    const deps: DnsDeps = {
      fetcher: makeFetcher({
        "example.com:TXT": TXT_SPF,
        "_dmarc.example.com:TXT": TXT_DMARC,
        "example.com:A": A,
        "example.com:MX": MX,
        "34.216.184.93.in-addr.arpa:PTR": PTR_AWS,
      }),
    };

    const r = await collectDns("example.com", deps);
    expect(r.ok).toBe(true);

    const by = Object.fromEntries(r.signals.map((s) => [s.key, s]));
    expect(by.dns_spf.valueText).toBe("v=spf1 include:_spf.google.com ~all");
    expect(by.dns_spf.source).toEqual({
      label: "DNS over HTTPS",
      url: "https://dns.google/query?name=example.com&type=TXT",
    });
    expect(by.dns_dmarc.valueText).toBe("v=DMARC1; p=reject; rua=mailto:d@x.com");
    expect(by.dns_a.valueText).toBe("93.184.216.34, 93.184.216.35");
    expect(by.dns_a.valueNum).toBe(2);
    expect(by.dns_mx.valueText).toBe("aspmx.l.google.com, alt1.aspmx.l.google.com");
    expect(by.hosting_provider.valueText).toBe("AWS");
  });

  it("a resolving domain with no SPF/DMARC is ok:true with those null (absence is info)", async () => {
    const deps: DnsDeps = {
      fetcher: makeFetcher({
        "example.com:A": A, // resolves
        // no TXT / _dmarc / MX entries → empty
      }),
    };

    const r = await collectDns("example.com", deps);
    expect(r.ok).toBe(true);
    const by = Object.fromEntries(r.signals.map((s) => [s.key, s]));
    expect(by.dns_spf.valueText).toBeNull();
    expect(by.dns_dmarc.valueText).toBeNull();
    expect(by.dns_a.valueNum).toBe(2);
  });

  it("NXDOMAIN → ok:false with all-null values, no throw", async () => {
    const deps: DnsDeps = { fetcher: makeFetcher({}) }; // everything NXDOMAIN

    const r = await collectDns("nope.invalid", deps);
    expect(r.ok).toBe(false);
    for (const s of r.signals) {
      expect(s.valueText).toBeNull();
      expect(s.source).toBeNull();
    }
  });
});
