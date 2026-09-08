import { describe, it, expect, vi } from "vitest";
import { parseCrtsh } from "./crtsh";
import {
  fetchTls,
  socketTlsConnect,
  type PeerCertLike,
  type TlsDeps,
  type TlsConnectFactory,
} from "./tls";
import { collectCerts, type CertsDeps } from "./certs";
import { certspotterUrl } from "./certspotter";
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
  subjectaltname: "DNS:stripe.com, DNS:*.stripe.com",
};

// SSLMate issuances (unexpired) for the fallback path.
const SSLMATE = JSON.stringify([
  { issuer: { friendly_name: "Let's Encrypt" }, not_before: "2026-06-01T00:00:00Z", not_after: "2026-08-30T00:00:00Z" },
]);

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

  it("returns null on malformed JSON — unparseable is not 'no certificates found'", () => {
    expect(parseCrtsh("{ not json")).toBeNull();
  });
});

// parseTlsCert's own unit coverage (incl. the extended fields) lives in tls.test.ts.

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

describe("collectCerts (Story 27 W4 — current cert only; history retired)", () => {
  const baseDeps = (over: Partial<CertsDeps> = {}): CertsDeps => ({
    fetcher: over.fetcher ?? (vi.fn(async () => fetchOk(SSLMATE)) as unknown as Fetcher),
    resolveHost: over.resolveHost ?? (async () => ["93.184.216.34"]),
    tlsConnect: over.tlsConnect ?? (async () => CERT),
  });

  it("no longer emits certificate-HISTORY signals (first_cert_date / cert_count are retired)", async () => {
    const r = await collectCerts("stripe.com", baseDeps());
    expect(r.signals.find((s) => s.key === "first_cert_date")).toBeUndefined();
    expect(r.signals.find((s) => s.key === "cert_count")).toBeUndefined();
  });

  it("handshake success: current-cert facts sourced to the TLS handshake; ok true; SSLMate not called", async () => {
    const fetcher = vi.fn(async () => fetchOk(SSLMATE)) as unknown as Fetcher;
    const r = await collectCerts("stripe.com", baseDeps({ fetcher }));

    expect(r.ok).toBe(true);
    expect(fetcher).not.toHaveBeenCalled(); // handshake sufficed → no fallback

    const issuer = r.signals.find((s) => s.key === "tls_issuer")!;
    expect(issuer.valueText).toBe("DigiCert Inc");
    expect(issuer.source).toEqual({ label: "Live TLS handshake", url: "https://stripe.com" });
    expect(r.signals.find((s) => s.key === "tls_valid_from")!.valueText).toBe("2024-03-01T00:00:00.000Z");
    expect(r.signals.find((s) => s.key === "tls_valid_to")!.valueText).toBe("2025-03-01T23:59:59.000Z");
    expect(r.signals.find((s) => s.key === "ssl_org")!.valueText).toBe("Stripe, Inc.");
    // clean cert on a matching host → negative facts are checked-empty, never asserted
    expect(r.signals.find((s) => s.key === "tls_self_signed")!.valueText).toBeNull();
    expect(r.signals.find((s) => s.key === "tls_self_signed")!.status).toBe("ok");
    expect(r.signals.find((s) => s.key === "tls_hostname_mismatch")!.valueText).toBeNull();
  });

  it("handshake FAILS → SSLMate fallback supplies issuer + validity, org stays null, note set", async () => {
    const fetcher = vi.fn(async () => fetchOk(SSLMATE)) as unknown as Fetcher;
    const r = await collectCerts("example.com", {
      fetcher,
      resolveHost: async () => ["10.0.0.1"], // TLS blocked → handshake fails
      tlsConnect: vi.fn(async () => CERT),
    });

    expect(r.ok).toBe(true);
    expect(fetcher).toHaveBeenCalled(); // fell back
    const issuer = r.signals.find((s) => s.key === "tls_issuer")!;
    expect(issuer.valueText).toBe("Let's Encrypt");
    expect(issuer.source).toEqual({ label: "SSLMate Cert Spotter", url: certspotterUrl("example.com") });
    expect(issuer.note).toMatch(/SSLMate fallback/);
    // a CT index cannot supply the subject org, and the negative facts need the handshake
    expect(r.signals.find((s) => s.key === "ssl_org")!.valueText).toBeNull();
    expect(r.signals.find((s) => s.key === "ssl_org")!.status).toBe("failed");
    expect(r.signals.find((s) => s.key === "tls_self_signed")!.status).toBe("failed");
  });

  it("publishes a self-signed cert as a negative fact", async () => {
    const selfCert: PeerCertLike = {
      subject: { CN: "internal.local", O: "Acme" },
      issuer: { CN: "internal.local", O: "Acme" },
      valid_from: "Jan 1 00:00:00 2026 GMT",
      valid_to: "Jan 1 00:00:00 2027 GMT",
      subjectaltname: "DNS:internal.local",
    };
    const r = await collectCerts("internal.local", baseDeps({ tlsConnect: async () => selfCert }));
    expect(r.signals.find((s) => s.key === "tls_self_signed")!.valueText).toBe("self-signed");
  });

  it("publishes a hostname mismatch as a negative fact", async () => {
    // CERT lists stripe.com only; querying a different host → mismatch.
    const r = await collectCerts("not-stripe.com", baseDeps());
    expect(r.signals.find((s) => s.key === "tls_hostname_mismatch")!.valueText).toBe("mismatch");
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

describe("socketTlsConnect shared-deadline abort (Story 16.1)", () => {
  function makeFakeTlsSocket() {
    const handlers: Record<string, Array<(arg?: unknown) => void>> = {};
    return {
      destroyed: false,
      ended: false,
      getPeerCertificate(): PeerCertLike {
        return { subject: { O: "X" } };
      },
      setTimeout() {
        /* store nothing — the per-call timeout must NOT fire in these tests */
      },
      on(ev: string, cb: (arg?: unknown) => void) {
        (handlers[ev] ||= []).push(cb);
      },
      end() {
        this.ended = true;
      },
      destroy() {
        this.destroyed = true;
      },
    };
  }

  it("aborts PROMPTLY on the signal — destroys the socket, never waits the timeout", async () => {
    const fake = makeFakeTlsSocket();
    const connect: TlsConnectFactory = () => fake;
    const ac = new AbortController();

    const p = socketTlsConnect(
      { host: "1.2.3.4", servername: "x.com", port: 443, timeoutMs: 60_000, signal: ac.signal },
      connect,
    );
    ac.abort();

    await expect(p).rejects.toMatchObject({ code: "ETIMEDOUT" });
    expect(fake.destroyed).toBe(true);
  });

  it("a normal handshake still resolves the cert", async () => {
    const fake = makeFakeTlsSocket();
    let onSecure: () => void = () => {};
    const connect: TlsConnectFactory = (_opts, cb) => {
      onSecure = cb;
      return fake;
    };

    const p = socketTlsConnect({ host: "1.2.3.4", servername: "x.com", port: 443, timeoutMs: 3000 }, connect);
    onSecure(); // simulate secureConnect

    expect(await p).toEqual({ subject: { O: "X" } });
    expect(fake.ended).toBe(true);
  });

  it("fetchTls short-circuits on an already-aborted deadline (no connect)", async () => {
    const ac = new AbortController();
    ac.abort();
    const tlsConnect = vi.fn(async () => CERT);
    const deps: TlsDeps = { resolveHost: async () => ["93.184.216.34"], tlsConnect, signal: ac.signal };

    const r = await fetchTls("example.com", deps);

    expect(r).toEqual({ ok: false, error: "timeout" });
    expect(tlsConnect).not.toHaveBeenCalled();
  });
});
