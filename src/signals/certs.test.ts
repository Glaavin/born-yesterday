import { describe, it, expect, vi } from "vitest";
import { parseCrtsh } from "./crtsh";
import { parseTlsCert, fetchTls, type PeerCertLike, type TlsDeps } from "./tls";
import { collectCerts, type CertsDeps } from "./certs";
import type { Fetcher, FetchResult } from "../lib/cached-fetch";

const fetchOk = (body: string): FetchResult => ({ ok: true, status: 200, body, fromCache: false });
const fetchFail = (): FetchResult => ({ ok: false, error: "http", status: 404 });

const CRTSH = JSON.stringify([
  { not_before: "2016-08-01T00:00:00", not_after: "2017-08-01T00:00:00" },
  { not_before: "2014-03-01T00:00:00", not_after: "2015-03-01T00:00:00" }, // earliest
  { not_before: "2020-01-01T00:00:00", not_after: "2021-01-01T00:00:00" },
]);

const CERT: PeerCertLike = {
  subject: { O: "Stripe, Inc.", OU: "IT", CN: "stripe.com" },
  issuer: { O: "DigiCert Inc", CN: "DigiCert TLS RSA SHA256 2020 CA1" },
  valid_from: "Mar 1 00:00:00 2024 GMT",
  valid_to: "Mar 1 23:59:59 2025 GMT",
};

describe("parseCrtsh (pure)", () => {
  it("returns the earliest not_before + count", () => {
    expect(parseCrtsh(CRTSH)).toEqual({
      firstCertDate: "2014-03-01T00:00:00.000Z",
      certCount: 3,
    });
  });

  it("returns nulls for an empty array", () => {
    expect(parseCrtsh("[]")).toEqual({ firstCertDate: null, certCount: null });
  });

  it("does not throw on malformed JSON", () => {
    expect(parseCrtsh("{ not json")).toEqual({ firstCertDate: null, certCount: null });
  });
});

describe("parseTlsCert (pure)", () => {
  it("reads issuer, validity, and subject org/OU", () => {
    expect(parseTlsCert(CERT)).toEqual({
      issuer: "DigiCert Inc",
      validFrom: "2024-03-01T00:00:00.000Z",
      validTo: "2025-03-01T23:59:59.000Z",
      subjectO: "Stripe, Inc.",
      subjectOU: "IT",
    });
  });

  it("returns nulls for an empty cert", () => {
    expect(parseTlsCert({})).toEqual({
      issuer: null,
      validFrom: null,
      validTo: null,
      subjectO: null,
      subjectOU: null,
    });
  });
});

describe("fetchTls (host-check before connect)", () => {
  it("BLOCKS an internal-resolving domain and never connects", async () => {
    const tlsConnect = vi.fn(async () => CERT);
    const deps: TlsDeps = { resolveHost: async () => ["10.0.0.5"], tlsConnect };

    const r = await fetchTls("evil.test", deps);

    expect(r).toEqual({ ok: false, error: "blocked" });
    expect(tlsConnect).not.toHaveBeenCalled();
  });

  it("FAILS CLOSED when allowed but no validated IP to pin (never connects by hostname)", async () => {
    const tlsConnect = vi.fn(async () => CERT);
    // resolver returns no addresses → hostAllowed = { allowed:true, ips:[] }
    const deps: TlsDeps = { resolveHost: async () => [], tlsConnect };

    const r = await fetchTls("example.com", deps);

    expect(r).toEqual({ ok: false, error: "blocked" });
    expect(tlsConnect).not.toHaveBeenCalled();
  });

  it("FAILS CLOSED on a fail-open ENOTFOUND (no IP to pin)", async () => {
    const tlsConnect = vi.fn(async () => CERT);
    const deps: TlsDeps = {
      resolveHost: async () => {
        throw Object.assign(new Error("nope"), { code: "ENOTFOUND" });
      },
      tlsConnect,
    };

    expect(await fetchTls("ghost.test", deps)).toEqual({ ok: false, error: "blocked" });
    expect(tlsConnect).not.toHaveBeenCalled();
  });

  it("connects to the VALIDATED resolved IP with servername=domain (IP-pinning)", async () => {
    const tlsConnect = vi.fn(async () => CERT);
    const deps: TlsDeps = { resolveHost: async () => ["93.184.216.34"], tlsConnect };

    const r = await fetchTls("example.com", deps);

    expect(r.ok).toBe(true);
    expect(tlsConnect).toHaveBeenCalledWith(
      expect.objectContaining({ host: "93.184.216.34", servername: "example.com", port: 443 }),
    );
  });

  it("maps a timeout vs a network error", async () => {
    const timeoutDeps: TlsDeps = {
      resolveHost: async () => ["93.184.216.34"],
      tlsConnect: async () => {
        throw Object.assign(new Error("t"), { code: "ETIMEDOUT" });
      },
    };
    expect(await fetchTls("example.com", timeoutDeps)).toEqual({ ok: false, error: "timeout" });

    const netDeps: TlsDeps = {
      resolveHost: async () => ["93.184.216.34"],
      tlsConnect: async () => {
        throw new Error("ECONNREFUSED");
      },
    };
    expect(await fetchTls("example.com", netDeps)).toEqual({ ok: false, error: "network" });
  });
});

describe("collectCerts", () => {
  const baseDeps = (over: Partial<CertsDeps> = {}): CertsDeps => ({
    fetcher: over.fetcher ?? (vi.fn(async () => fetchOk(CRTSH)) as unknown as Fetcher),
    resolveHost: over.resolveHost ?? (async () => ["93.184.216.34"]),
    tlsConnect: over.tlsConnect ?? (async () => CERT),
  });

  it("assembles sourced signals from crt.sh + TLS; ok on first_cert_date", async () => {
    const r = await collectCerts("stripe.com", baseDeps());

    expect(r.ok).toBe(true);

    const first = r.signals.find((s) => s.key === "first_cert_date")!;
    expect(first.valueText).toBe("2014-03-01T00:00:00.000Z");
    expect(first.valueNum).toBe(Math.floor(Date.parse("2014-03-01T00:00:00.000Z") / 1000));
    expect(first.source).toEqual({
      label: "crt.sh certificate transparency",
      url: "https://crt.sh/?q=stripe.com&output=json",
    });

    const issuer = r.signals.find((s) => s.key === "tls_issuer")!;
    expect(issuer.valueText).toBe("DigiCert Inc");
    expect(issuer.source).toEqual({ label: "Live TLS handshake", url: "https://stripe.com" });

    expect(r.signals.find((s) => s.key === "ssl_org")!.valueText).toBe("Stripe, Inc.");
  });

  it("both sources fail → ok:false with null values, no throw", async () => {
    const r = await collectCerts("nope.test", {
      fetcher: vi.fn(async () => fetchFail()) as unknown as Fetcher,
      resolveHost: async () => ["10.0.0.1"], // TLS blocked
      tlsConnect: vi.fn(async () => CERT),
    });

    expect(r.ok).toBe(false);
    for (const s of r.signals) {
      expect(s.valueText).toBeNull();
      expect(s.valueNum).toBeNull();
      expect(s.source).toBeNull();
    }
  });
});
