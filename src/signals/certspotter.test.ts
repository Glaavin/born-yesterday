import { describe, it, expect, vi } from "vitest";
import { parseCertspotter, fetchCertspotter, certspotterUrl } from "./certspotter";
import type { Fetcher, FetchResult } from "../lib/cached-fetch";

// Real-shaped SSLMate Cert Spotter issuances (unexpired only, trimmed). Two
// certs; the NEWEST by not_before is the current one.
const ISSUANCES = JSON.stringify([
  {
    issuer: { friendly_name: "Let's Encrypt", name: "C=US, O=Let's Encrypt, CN=R3" },
    dns_names: ["example.com"],
    not_before: "2026-05-01T00:00:00Z",
    not_after: "2026-07-30T23:59:59Z",
  },
  {
    issuer: { friendly_name: "DigiCert", name: "C=US, O=\"DigiCert, Inc.\", CN=DigiCert G2" },
    dns_names: ["*.example.com", "example.com"],
    not_before: "2026-09-08T00:00:00Z",
    not_after: "2026-12-10T23:59:59Z",
  },
]);

const fetchOk = (body: string): FetchResult => ({ ok: true, status: 200, body, fromCache: false });

describe("parseCertspotter (pure)", () => {
  it("returns the NEWEST unexpired cert's issuer + validity window", () => {
    expect(parseCertspotter(ISSUANCES)).toEqual({
      issuer: "DigiCert",
      validFrom: "2026-09-08T00:00:00Z",
      validTo: "2026-12-10T23:59:59Z",
    });
  });

  it("falls back to the O= field of the issuer DN when friendly_name is absent", () => {
    const j = JSON.stringify([
      { issuer: { name: "C=GB, O=Sectigo Limited, CN=Sectigo RSA" }, not_before: "2026-06-01T00:00:00Z", not_after: "2026-09-01T00:00:00Z" },
    ]);
    expect(parseCertspotter(j)?.issuer).toBe("Sectigo Limited");
  });

  it("an empty array is a completed check that found no unexpired cert — nulls, not null", () => {
    expect(parseCertspotter("[]")).toEqual({ issuer: null, validFrom: null, validTo: null });
  });

  it("returns null on unparseable JSON or a non-array payload (a fetch/shape failure is not 'no cert')", () => {
    expect(parseCertspotter("{ not json")).toBeNull();
    expect(parseCertspotter(JSON.stringify({ message: "rate limited" }))).toBeNull();
  });
});

describe("fetchCertspotter", () => {
  it("queries the single-hostname issuances endpoint through the harness", async () => {
    const fetcher = vi.fn(async () => fetchOk(ISSUANCES)) as unknown as Fetcher;
    const r = await fetchCertspotter("example.com", fetcher);
    expect(r.ok).toBe(true);
    expect(r.json).toBe(ISSUANCES);
    const call = (fetcher as unknown as { mock: { calls: [{ url: string; kind: string }][] } }).mock.calls[0][0];
    expect(call.url).toBe(certspotterUrl("example.com"));
    expect(call.kind).toBe("third-party");
  });

  it("a non-ok fetch yields ok:false, json null (non-throwing)", async () => {
    const fetcher = vi.fn(async () => ({ ok: false, error: "http", status: 429 })) as unknown as Fetcher;
    const r = await fetchCertspotter("example.com", fetcher);
    expect(r).toEqual({ ok: false, json: null });
  });
});
