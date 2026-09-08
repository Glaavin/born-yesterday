import { describe, it, expect } from "vitest";
import {
  parseTlsCert,
  parseAltNames,
  isSelfSigned,
  hostMatchesPattern,
  certHostnameMismatch,
  type PeerCertLike,
} from "./tls";

const CA_SIGNED: PeerCertLike = {
  subject: { O: "Stripe, Inc.", OU: "IT", CN: "stripe.com" },
  issuer: { O: "DigiCert Inc", CN: "DigiCert TLS RSA SHA256 2020 CA1" },
  valid_from: "Mar 1 00:00:00 2024 GMT",
  valid_to: "Mar 1 23:59:59 2025 GMT",
  subjectaltname: "DNS:stripe.com, DNS:*.stripe.com",
};

describe("parseTlsCert (pure) — extended fields", () => {
  it("reads subjectCN and altNames alongside the existing fields", () => {
    expect(parseTlsCert(CA_SIGNED)).toEqual({
      issuer: "DigiCert Inc",
      validFrom: "2024-03-01T00:00:00.000Z",
      validTo: "2025-03-01T23:59:59.000Z",
      subjectO: "Stripe, Inc.",
      subjectOU: "IT",
      subjectCN: "stripe.com",
      altNames: ["stripe.com", "*.stripe.com"],
    });
  });
});

describe("parseAltNames", () => {
  it("keeps DNS names (lowercased), drops IP entries, tolerates absence", () => {
    expect(parseAltNames("DNS:A.com, DNS:*.A.com, IP Address:1.2.3.4")).toEqual(["a.com", "*.a.com"]);
    expect(parseAltNames(undefined)).toEqual([]);
    expect(parseAltNames("")).toEqual([]);
  });
});

describe("isSelfSigned", () => {
  it("true when issuer equals subject (CN + O)", () => {
    expect(isSelfSigned({ subject: { CN: "internal", O: "Acme" }, issuer: { CN: "internal", O: "Acme" } })).toBe(true);
  });
  it("false for a CA-signed cert", () => {
    expect(isSelfSigned(CA_SIGNED)).toBe(false);
  });
  it("false (not 'self-signed') when the fields we compare are absent — cannot assert", () => {
    expect(isSelfSigned({})).toBe(false);
    expect(isSelfSigned({ subject: { CN: "x" } })).toBe(false); // no issuer CN
  });
});

describe("hostMatchesPattern (RFC 6125 single leftmost wildcard)", () => {
  it("exact match, case-insensitive", () => {
    expect(hostMatchesPattern("Stripe.com", "stripe.com")).toBe(true);
    expect(hostMatchesPattern("a.com", "b.com")).toBe(false);
  });
  it("wildcard covers exactly one leftmost label", () => {
    expect(hostMatchesPattern("api.stripe.com", "*.stripe.com")).toBe(true);
    expect(hostMatchesPattern("stripe.com", "*.stripe.com")).toBe(false); // no label
    expect(hostMatchesPattern("a.b.stripe.com", "*.stripe.com")).toBe(false); // two labels
  });
});

describe("certHostnameMismatch", () => {
  it("false when a SAN matches (incl. via wildcard)", () => {
    expect(certHostnameMismatch("api.stripe.com", CA_SIGNED)).toBe(false);
    expect(certHostnameMismatch("stripe.com", CA_SIGNED)).toBe(false);
  });
  it("true when names are present but none match", () => {
    expect(certHostnameMismatch("evil.com", CA_SIGNED)).toBe(true);
  });
  it("false when the cert presents no usable names — a mismatch cannot be proven", () => {
    expect(certHostnameMismatch("x.com", { issuer: { CN: "ca" } })).toBe(false);
  });
});
