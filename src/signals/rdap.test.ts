import { describe, it, expect, vi } from "vitest";
import {
  parseRdap,
  parseBootstrap,
  registryBaseForTld,
  directRdapUrl,
  fetchRdap,
} from "./rdap";
import type { Fetcher, FetchResult } from "../lib/cached-fetch";

// ---- fixtures ----

// The IANA bootstrap shape (data.iana.org/rdap/dns.json), trimmed. Real entries
// carry BOTH an http and https base for some registries; https must win.
const BOOTSTRAP = JSON.stringify({
  version: "1.0",
  publication: "2026-09-01T00:00:00Z",
  services: [
    [["com", "net"], ["https://rdap.verisign.com/com/v1/"]],
    [["org"], ["http://rdap.publicinterestregistry.org/rdap/", "https://rdap.publicinterestregistry.org/rdap/"]],
    [["io"], ["https://rdap.nic.io/"]],
  ],
});

const RDAP_WITH_TRANSFER = JSON.stringify({
  events: [
    { eventAction: "registration", eventDate: "2005-04-09T00:00:00Z" },
    { eventAction: "transfer", eventDate: "2008-01-01T00:00:00Z" },
    { eventAction: "transfer", eventDate: "2010-08-19T00:00:00Z" },
    { eventAction: "last changed", eventDate: "2023-01-01T00:00:00Z" },
  ],
  entities: [{ roles: ["registrar"], vcardArray: ["vcard", [["fn", {}, "text", "Gandi SAS"]]] }],
});

const fetchOk = (body: string): FetchResult => ({ ok: true, status: 200, body, fromCache: false });
const fetchHttp = (status: number): FetchResult => ({ ok: false, error: "http", status });

describe("parseBootstrap (pure)", () => {
  it("maps every TLD in a service to its registry base, preferring https", () => {
    const m = parseBootstrap(BOOTSTRAP)!;
    expect(m.get("com")).toBe("https://rdap.verisign.com/com/v1/");
    expect(m.get("net")).toBe("https://rdap.verisign.com/com/v1/");
    expect(m.get("org")).toBe("https://rdap.publicinterestregistry.org/rdap/"); // https over http
    expect(m.get("io")).toBe("https://rdap.nic.io/");
  });

  it("returns null on unparseable JSON — not an empty map (a fetch/shape failure is not 'no registries')", () => {
    expect(parseBootstrap("{ not json")).toBeNull();
    expect(parseBootstrap(JSON.stringify({ nope: true }))).toBeNull();
  });
});

describe("registryBaseForTld (pure)", () => {
  const m = parseBootstrap(BOOTSTRAP)!;
  it("resolves by the domain's last label, case-insensitively", () => {
    expect(registryBaseForTld(m, "STRIPE.COM")).toBe("https://rdap.verisign.com/com/v1/");
    expect(registryBaseForTld(m, "example.co.uk")).toBeNull(); // uncovered TLD → null (not a guess)
    expect(registryBaseForTld(m, "eff.org")).toBe("https://rdap.publicinterestregistry.org/rdap/");
  });
});

describe("directRdapUrl (pure)", () => {
  it("joins a base (trailing slash or not) to the domain query path", () => {
    expect(directRdapUrl("https://rdap.verisign.com/com/v1/", "stripe.com")).toBe(
      "https://rdap.verisign.com/com/v1/domain/stripe.com",
    );
    expect(directRdapUrl("https://rdap.nic.io", "x.io")).toBe("https://rdap.nic.io/domain/x.io");
  });
});

describe("parseRdap (transfer)", () => {
  it("extracts the MOST RECENT transfer eventDate alongside registration", () => {
    expect(parseRdap(RDAP_WITH_TRANSFER)).toEqual({
      registrationDate: "2005-04-09T00:00:00Z",
      registrar: "Gandi SAS",
      transferDate: "2010-08-19T00:00:00Z", // latest of the two transfers
    });
  });

  it("reports transferDate null when no transfer event is emitted (checked, none) — not an error", () => {
    const noTransfer = JSON.stringify({
      events: [{ eventAction: "registration", eventDate: "2020-01-01T00:00:00Z" }],
      entities: [],
    });
    expect(parseRdap(noTransfer)).toEqual({
      registrationDate: "2020-01-01T00:00:00Z",
      registrar: null,
      transferDate: null,
    });
  });
});

describe("fetchRdap — three-tier chain (direct registry, then rdap.org)", () => {
  it("tier 1: resolves the registry via the bootstrap and queries it directly", async () => {
    const calls: string[] = [];
    const fetcher = vi.fn(async (o: { url: string }) => {
      calls.push(o.url);
      if (o.url.includes("data.iana.org")) return fetchOk(BOOTSTRAP);
      if (o.url.startsWith("https://rdap.verisign.com/")) return fetchOk(RDAP_WITH_TRANSFER);
      return fetchHttp(404);
    }) as unknown as Fetcher;

    const r = await fetchRdap("stripe.com", fetcher);
    expect(r.ok).toBe(true);
    expect(r.tier).toBe("registry");
    expect(calls).toContain("https://data.iana.org/rdap/dns.json");
    expect(calls).toContain("https://rdap.verisign.com/com/v1/domain/stripe.com");
    // rdap.org is NOT called when the registry answers.
    expect(calls.some((u) => u.includes("rdap.org"))).toBe(false);
  });

  it("tier 2: falls back to rdap.org when the TLD is not in the bootstrap", async () => {
    const calls: string[] = [];
    const fetcher = vi.fn(async (o: { url: string }) => {
      calls.push(o.url);
      if (o.url.includes("data.iana.org")) return fetchOk(BOOTSTRAP);
      if (o.url.includes("rdap.org")) return fetchOk(RDAP_WITH_TRANSFER);
      return fetchHttp(404);
    }) as unknown as Fetcher;

    const r = await fetchRdap("example.edu", fetcher); // .edu absent from bootstrap fixture
    expect(r.ok).toBe(true);
    expect(r.tier).toBe("rdap.org");
    expect(calls).toContain("https://rdap.org/domain/example.edu");
  });

  it("tier 2: falls back to rdap.org when the direct registry query fails", async () => {
    const calls: string[] = [];
    const fetcher = vi.fn(async (o: { url: string }) => {
      calls.push(o.url);
      if (o.url.includes("data.iana.org")) return fetchOk(BOOTSTRAP);
      if (o.url.startsWith("https://rdap.verisign.com/")) return fetchHttp(500); // registry down
      if (o.url.includes("rdap.org")) return fetchOk(RDAP_WITH_TRANSFER);
      return fetchHttp(404);
    }) as unknown as Fetcher;

    const r = await fetchRdap("stripe.com", fetcher);
    expect(r.ok).toBe(true);
    expect(r.tier).toBe("rdap.org");
    expect(calls).toContain("https://rdap.verisign.com/com/v1/domain/stripe.com");
    expect(calls).toContain("https://rdap.org/domain/stripe.com");
  });

  it("falls back to rdap.org when the bootstrap file itself is unreachable", async () => {
    const calls: string[] = [];
    const fetcher = vi.fn(async (o: { url: string }) => {
      calls.push(o.url);
      if (o.url.includes("data.iana.org")) return fetchHttp(503);
      if (o.url.includes("rdap.org")) return fetchOk(RDAP_WITH_TRANSFER);
      return fetchHttp(404);
    }) as unknown as Fetcher;

    const r = await fetchRdap("stripe.com", fetcher);
    expect(r.ok).toBe(true);
    expect(r.tier).toBe("rdap.org");
  });

  it("both tiers fail → ok:false, tier null, json null (non-throwing)", async () => {
    const fetcher = vi.fn(async () => fetchHttp(404)) as unknown as Fetcher;
    const r = await fetchRdap("nope.invalidtld", fetcher);
    expect(r.ok).toBe(false);
    expect(r.tier).toBeNull();
    expect(r.json).toBeNull();
  });
});
