import { describe, it, expect, vi } from "vitest";
import { ipIsBlocked, hostAllowed } from "./ssrf";

const err = (code: string) => Object.assign(new Error(code), { code });

describe("ipIsBlocked", () => {
  it.each([
    ["127.0.0.1", true],
    ["10.0.0.1", true],
    ["172.16.5.5", true],
    ["192.168.1.1", true],
    ["169.254.169.254", true], // cloud metadata
    ["100.64.0.1", true], // CGNAT
    ["0.0.0.0", true],
    ["8.8.8.8", false],
    ["1.1.1.1", false],
    ["::1", true],
    ["fe80::1", true],
    ["fc00::1", true],
    ["::ffff:127.0.0.1", true], // IPv4-mapped loopback
    ["2606:4700:4700::1111", false], // public v6
  ])("classifies %s", (ip, blocked) => {
    expect(ipIsBlocked(ip)).toBe(blocked);
  });

  it("returns null for a non-IP hostname", () => {
    expect(ipIsBlocked("example.com")).toBeNull();
  });
});

describe("hostAllowed", () => {
  it("blocks an internal IP literal without resolving", async () => {
    const resolve = vi.fn(async () => ["8.8.8.8"]);
    const r = await hostAllowed("169.254.169.254", resolve);
    expect(r.allowed).toBe(false);
    expect(resolve).not.toHaveBeenCalled();
  });

  it("allows a public IP literal and pins it", async () => {
    const r = await hostAllowed("8.8.8.8", vi.fn(async () => []));
    expect(r).toEqual({ allowed: true, ips: ["8.8.8.8"] });
  });

  it("blocks a hostname that resolves to an internal address", async () => {
    const r = await hostAllowed("evil.test", async () => ["10.0.0.5"]);
    expect(r.allowed).toBe(false);
  });

  it("allows a hostname resolving to a public address and returns the IPs", async () => {
    const r = await hostAllowed("ok.test", async () => ["93.184.216.34"]);
    expect(r).toEqual({ allowed: true, ips: ["93.184.216.34"] });
  });

  it("fails OPEN on a genuine host-not-found (ENOTFOUND)", async () => {
    const r = await hostAllowed("nope.test", async () => {
      throw err("ENOTFOUND");
    });
    expect(r).toEqual({ allowed: true, ips: [] });
  });

  it("fails CLOSED when the resolver is unavailable (non-lookup error)", async () => {
    const r = await hostAllowed("x.test", async () => {
      throw err("ERR_MODULE_NOT_FOUND"); // e.g. node:dns import failure on edge
    });
    expect(r.allowed).toBe(false);
  });

  it("fails CLOSED on an unexpected error with no code", async () => {
    const r = await hostAllowed("x.test", async () => {
      throw new Error("boom");
    });
    expect(r.allowed).toBe(false);
  });
});
