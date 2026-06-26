import { describe, it, expect } from "vitest";
import { normalizeDomain } from "./domain";

describe("normalizeDomain", () => {
  it("normalizes the spec's worked examples", () => {
    expect(normalizeDomain("HTTPS://WWW.Example.com/p?q=1")).toBe("example.com");
    expect(normalizeDomain("sub.example.co.uk/x")).toBe("sub.example.co.uk");
    expect(normalizeDomain("")).toBeNull();
    expect(normalizeDomain("not a domain")).toBeNull();
  });

  it("lowercases", () => {
    expect(normalizeDomain("EXAMPLE.COM")).toBe("example.com");
    expect(normalizeDomain("Example.Com")).toBe("example.com");
  });

  it("strips the scheme", () => {
    expect(normalizeDomain("http://example.com")).toBe("example.com");
    expect(normalizeDomain("https://example.com")).toBe("example.com");
    expect(normalizeDomain("ftp://files.example.org")).toBe("files.example.org");
    expect(normalizeDomain("//example.com")).toBe("example.com"); // protocol-relative
  });

  it("strips a single leading www.", () => {
    expect(normalizeDomain("www.example.com")).toBe("example.com");
    expect(normalizeDomain("https://www.example.com")).toBe("example.com");
    // only the leading www. label is removed; deeper labels are preserved
    expect(normalizeDomain("www.www.example.com")).toBe("www.example.com");
  });

  it("strips path, query and fragment", () => {
    expect(normalizeDomain("example.com/path/to/page")).toBe("example.com");
    expect(normalizeDomain("example.com?q=1")).toBe("example.com");
    expect(normalizeDomain("example.com#section")).toBe("example.com");
    expect(normalizeDomain("example.com/a?b#c")).toBe("example.com");
  });

  it("strips the port", () => {
    expect(normalizeDomain("example.com:8080")).toBe("example.com");
    expect(normalizeDomain("http://example.com:3000/x")).toBe("example.com");
  });

  it("strips userinfo", () => {
    expect(normalizeDomain("user@example.com")).toBe("example.com");
    expect(normalizeDomain("https://user:pass@example.com/x")).toBe("example.com");
  });

  it("strips trailing dots and surrounding whitespace", () => {
    expect(normalizeDomain("example.com.")).toBe("example.com");
    expect(normalizeDomain("  example.com  ")).toBe("example.com");
    expect(normalizeDomain("www.example.com.")).toBe("example.com");
  });

  it("preserves multi-level subdomains and ccTLDs", () => {
    expect(normalizeDomain("sub.example.co.uk")).toBe("sub.example.co.uk");
    expect(normalizeDomain("a.b.c.example.io")).toBe("a.b.c.example.io");
  });

  it("accepts hyphens and digits in labels", () => {
    expect(normalizeDomain("my-app-123.example.com")).toBe("my-app-123.example.com");
    expect(normalizeDomain("xn--80ak6aa92e.com")).toBe("xn--80ak6aa92e.com"); // punycode
  });

  it("rejects invalid input", () => {
    expect(normalizeDomain("not a domain")).toBeNull(); // space
    expect(normalizeDomain("localhost")).toBeNull(); // no dot
    expect(normalizeDomain("a.b")).toBeNull(); // 1-char TLD
    expect(normalizeDomain("example.123")).toBeNull(); // numeric TLD
    expect(normalizeDomain("192.168.0.1")).toBeNull(); // bare IPv4
    expect(normalizeDomain("-bad.com")).toBeNull(); // leading hyphen
    expect(normalizeDomain("bad-.com")).toBeNull(); // trailing hyphen
    expect(normalizeDomain("exämple.com")).toBeNull(); // non-ASCII / IDN
    expect(normalizeDomain("example..com")).toBeNull(); // empty label
    expect(normalizeDomain(".")).toBeNull();
    expect(normalizeDomain("   ")).toBeNull();
  });

  it("returns null for non-string input", () => {
    expect(normalizeDomain(null)).toBeNull();
    expect(normalizeDomain(undefined)).toBeNull();
    expect(normalizeDomain(42)).toBeNull();
    expect(normalizeDomain({})).toBeNull();
  });
});
