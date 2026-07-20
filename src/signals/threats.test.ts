import { describe, it, expect, vi } from "vitest";
import { parseUrlhaus } from "./urlhaus";
import { extractHost } from "./host";
import { ingestPhishtank } from "./phishtank-ingest";
import { collectThreats, type ThreatsDeps } from "./threats";
import { createFetcher, type Fetcher, type FetchResult, type FetchImpl } from "../lib/cached-fetch";

const fetchOk = (body: string): FetchResult => ({ ok: true, status: 200, body, fromCache: false });
const fetchFail = (): FetchResult => ({ ok: false, error: "network" });

const URLHAUS_LISTED = JSON.stringify({
  query_status: "ok",
  urls: [{ url: "http://evil.example/a" }, { url: "http://evil.example/b" }],
});
const URLHAUS_CLEAN = JSON.stringify({ query_status: "no_results" });
const URLHAUS_UNAUTH = JSON.stringify({ query_status: "invalid_auth_key" });

describe("parseUrlhaus (pure)", () => {
  it("listed → true + count", () => {
    expect(parseUrlhaus(URLHAUS_LISTED)).toEqual({ listed: true, count: 2 });
  });
  it("no_results → not listed", () => {
    expect(parseUrlhaus(URLHAUS_CLEAN)).toEqual({ listed: false, count: 0 });
  });
  it("unauthorized/unknown/malformed → null (not checked)", () => {
    expect(parseUrlhaus(URLHAUS_UNAUTH)).toEqual({ listed: null, count: null });
    expect(parseUrlhaus("{ not json")).toEqual({ listed: null, count: null });
  });
});

describe("extractHost (pure)", () => {
  it("pulls + lowercases the host from a URL", () => {
    expect(extractHost("http://Evil.Example.com/login.php?x=1")).toBe("evil.example.com");
    expect(extractHost("https://sub.bad-host.net:8443/p")).toBe("sub.bad-host.net");
  });
  it("handles scheme-less input and trailing dots", () => {
    expect(extractHost("PHISH.example.org/path")).toBe("phish.example.org");
    expect(extractHost("host.example.")).toBe("host.example");
  });
  it("returns null for junk", () => {
    expect(extractHost("")).toBeNull();
    expect(extractHost(null)).toBeNull();
    expect(extractHost("   ")).toBeNull();
  });
});

describe("ingestPhishtank (best-effort)", () => {
  it("extracts + normalizes + dedupes hosts from the dump and upserts", async () => {
    const dump = JSON.stringify([
      { url: "http://phish-one.example/login" },
      { url: "https://Phish-One.example/other" }, // dup host (case)
      { url: "http://phish-two.example/x" },
      { url: "not a url" }, // skipped
    ]);
    const upsert = vi.fn(async () => {});
    const deps = {
      fetcher: vi.fn(async () => fetchOk(dump)) as unknown as Fetcher,
      upsert,
      now: () => 1700000000,
    };

    const r = await ingestPhishtank(deps);

    expect(r).toEqual({ ingested: 2, skipped: false });
    expect(upsert).toHaveBeenCalledWith([
      { source: "phishtank", host: "phish-one.example", firstSeen: 1700000000 },
      { source: "phishtank", host: "phish-two.example", firstSeen: 1700000000 },
    ]);
  });

  it("skips non-fatally when the dump is unavailable", async () => {
    const upsert = vi.fn(async () => {});
    const r = await ingestPhishtank({
      fetcher: vi.fn(async () => fetchFail()) as unknown as Fetcher,
      upsert,
      now: () => 1,
    });
    expect(r.skipped).toBe(true);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("parses a >5MB dump in FULL through the harness (the maxBytes override is honored)", async () => {
    // ~6 MB JSON array — under the harness's 5 MB DEFAULT this would truncate to
    // invalid JSON and skip; the ingest's 64 MB override must let it parse whole.
    const big = "[" + Array(200_000).fill('{"url":"http://h.example/login"}').join(",") + "]";
    expect(big.length).toBeGreaterThan(5 * 1024 * 1024);

    const fetchImpl = vi.fn<FetchImpl>(async () => ({
      status: 200,
      text: async () => big,
      headers: { get: () => null },
    }));
    const harness = createFetcher({
      fetchImpl,
      cache: { get: async () => null, set: async () => {} },
      sleep: async () => {},
      now: () => 0,
      resolveHost: async () => ["93.184.216.34"],
    });
    const upsert = vi.fn(async () => {});

    const r = await ingestPhishtank({ fetcher: harness, upsert, now: () => 1 });

    expect(r.skipped).toBe(false); // full parse (truncation → JSON.parse throws → skipped)
    expect(r.ingested).toBe(1); // all entries share one host → deduped to 1
  });
});

describe("collectThreats", () => {
  const base = (over: Partial<ThreatsDeps> = {}): ThreatsDeps => ({
    fetcher: over.fetcher ?? (vi.fn(async () => fetchOk(URLHAUS_CLEAN)) as unknown as Fetcher),
    phishtankCount: over.phishtankCount ?? (async () => 0),
    phishtankListed: over.phishtankListed ?? (async () => false),
    urlhausKey: over.urlhausKey,
  });

  it("one source listed (URLhaus); PhishTank not ingested → not checked; ok:true", async () => {
    const r = await collectThreats("evil.example", base({
      fetcher: vi.fn(async () => fetchOk(URLHAUS_LISTED)) as unknown as Fetcher,
      phishtankCount: async () => 0, // never ingested
    }));

    expect(r.ok).toBe(true);
    const by = Object.fromEntries(r.signals.map((s) => [s.key, s]));
    expect(by.urlhaus_listed.valueText).toBe("Listed");
    expect(by.urlhaus_listed.source).toEqual({
      label: "URLhaus (abuse.ch)",
      url: "https://urlhaus.abuse.ch/browse.php?search=evil.example",
    });
    expect(by.phishtank_listed.valueText).toBeNull();
    expect(by.phishtank_listed.note).toBe("not checked");
    expect(by.phishtank_listed.source).toBeNull();
  });

  it("both clean (checked, not listed) → ok:true with 'Not listed' + sources", async () => {
    const r = await collectThreats("good.example", base({
      fetcher: vi.fn(async () => fetchOk(URLHAUS_CLEAN)) as unknown as Fetcher,
      phishtankCount: async () => 5000, // ingested
      phishtankListed: async () => false,
    }));

    expect(r.ok).toBe(true);
    const by = Object.fromEntries(r.signals.map((s) => [s.key, s]));
    expect(by.urlhaus_listed.valueText).toBe("Not listed");
    expect(by.phishtank_listed.valueText).toBe("Not listed");
    expect(by.phishtank_listed.source).toEqual({ label: "PhishTank", url: "https://www.phishtank.com/" });
    expect(by.phishtank_listed.note).toBeUndefined();
  });

  it("both sources unreachable → ok:false, all null, no throw", async () => {
    const r = await collectThreats("x.example", base({
      fetcher: vi.fn(async () => fetchFail()) as unknown as Fetcher, // URLhaus down
      phishtankCount: async () => 0, // never ingested
    }));

    expect(r.ok).toBe(false);
    for (const s of r.signals) {
      expect(s.valueText).toBeNull();
      expect(s.source).toBeNull();
      expect(s.note).toBe("not checked");
    }
  });
});
