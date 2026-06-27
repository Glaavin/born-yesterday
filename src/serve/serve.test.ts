import { describe, it, expect, vi } from "vitest";
import { isFresh, REPORT_TTL_SECONDS } from "./freshness";
import { decideServe } from "./decide";
import { sessionKey } from "./quota";
import { serveReport, type ServeDeps } from "./serve";
import { recentReports } from "./recent";
import type { Report } from "../components/report-state";
import type { ReportRow } from "../db/schema";
import type { Signal } from "../signals/types";

const NOW = 1_750_000_000;

const aReport = (domain = "x.com"): Report => ({
  domain,
  state: "some-concerns",
  summary: `Surfaces 3 public signals for ${domain}; none worth a closer look.`,
  lastChecked: "2025-06-15",
  flagged: [],
  positive: [],
  sources: [],
});

const aRow = (over: Partial<ReportRow> = {}): ReportRow => ({
  domain: "x.com",
  generatedAt: NOW - 3600,
  expiresAt: NOW + REPORT_TTL_SECONDS,
  reportJson: JSON.stringify(aReport()),
  skepticismState: "amber",
  schemaVersion: 1,
  ...over,
});

const aSignal: Signal = { key: "k", label: "k", valueText: "v", valueNum: null, source: null };

describe("isFresh", () => {
  it("is fresh until expires_at passes", () => {
    expect(isFresh({ expiresAt: NOW + 1 }, NOW)).toBe(true);
    expect(isFresh({ expiresAt: NOW }, NOW)).toBe(false);
  });
});

describe("decideServe (all five branches)", () => {
  it.each([
    [{ existing: true, fresh: true, quotaRemaining: true }, "serve-fresh", false],
    [{ existing: true, fresh: false, quotaRemaining: true }, "serve-stale-refresh", true],
    [{ existing: true, fresh: false, quotaRemaining: false }, "serve-stale", false],
    [{ existing: false, fresh: false, quotaRemaining: true }, "collect", true],
    [{ existing: false, fresh: false, quotaRemaining: false }, "limit-reached", false],
  ])("%o → %s", (input, action, consumesQuota) => {
    expect(decideServe(input)).toEqual({ action, consumesQuota });
  });
});

describe("sessionKey (§10 — no PII)", () => {
  it("hashes the IP; the raw IP never appears in the key", () => {
    const k = sessionKey("203.0.113.7", "salt");
    expect(k).toMatch(/^[0-9a-f]{64}$/);
    expect(k).not.toContain("203.0.113.7");
    expect(sessionKey("203.0.113.7", "salt")).toBe(k); // deterministic
    expect(sessionKey("203.0.113.8", "salt")).not.toBe(k); // IP-sensitive
  });
});

function makeDeps(over: Partial<ServeDeps> = {}) {
  const collect = vi.fn(async (domain: string) => ({ report: aReport(domain), signals: [aSignal] }));
  const persist = vi.fn(async () => {});
  const incrementQuota = vi.fn(async () => 1);
  const bg: Array<Promise<void>> = [];
  const deps: ServeDeps = {
    getReport: over.getReport ?? (async () => null),
    getQuota: over.getQuota ?? (async () => 0),
    incrementQuota: over.incrementQuota ?? incrementQuota,
    collect: over.collect ?? collect,
    persist: over.persist ?? persist,
    now: over.now ?? (() => NOW),
    runBackground: over.runBackground ?? ((fn) => void bg.push(fn())),
  };
  return { deps, collect, persist, incrementQuota, bg };
}

describe("serveReport", () => {
  it("invalid domain → error (no DB work)", async () => {
    const { deps, collect } = makeDeps();
    const r = await serveReport("not a domain", { sessionKey: "k" }, deps);
    expect(r.state).toBe("error");
    expect(collect).not.toHaveBeenCalled();
  });

  it("serve-fresh: cached + fresh → served, NO collect/persist/quota", async () => {
    const { deps, collect, persist, incrementQuota } = makeDeps({ getReport: async () => aRow() });
    const r = await serveReport("x.com", { sessionKey: "k" }, deps);
    expect(r).toMatchObject({ state: "served", freshness: "fresh" });
    expect(r.report?.domain).toBe("x.com");
    expect(collect).not.toHaveBeenCalled();
    expect(persist).not.toHaveBeenCalled();
    expect(incrementQuota).not.toHaveBeenCalled();
  });

  it("collect: no report + quota → collects, persists (with signals), consumes quota", async () => {
    const { deps, collect, persist, incrementQuota } = makeDeps();
    const r = await serveReport("x.com", { sessionKey: "k" }, deps);
    expect(r).toMatchObject({ state: "served", freshness: "new" });
    expect(collect).toHaveBeenCalledOnce();
    expect(persist).toHaveBeenCalledWith("x.com", expect.objectContaining({ domain: "x.com" }), [aSignal], NOW);
    expect(incrementQuota).toHaveBeenCalledOnce();
  });

  it("serve-stale-refresh: returns STALE now, refreshes in background", async () => {
    const stale = aRow({ expiresAt: NOW - 1 });
    const { deps, collect, persist, bg } = makeDeps({ getReport: async () => stale });
    const r = await serveReport("x.com", { sessionKey: "k" }, deps);

    expect(r).toMatchObject({ state: "refreshing", freshness: "stale" });
    expect(r.report?.domain).toBe("x.com"); // stale served immediately
    await Promise.all(bg); // let the background refresh run
    expect(collect).toHaveBeenCalledOnce();
    expect(persist).toHaveBeenCalledOnce();
  });

  it("limit-reached: no report + no quota → limit-reached, NO collect", async () => {
    const { deps, collect } = makeDeps({ getQuota: async () => 3 });
    const r = await serveReport("x.com", { sessionKey: "k" }, deps);
    expect(r.state).toBe("limit-reached");
    expect(r.report).toBeUndefined();
    expect(collect).not.toHaveBeenCalled();
  });
});

describe("recentReports (§7b — anonymized)", () => {
  it("returns only domain + state + generatedAt", async () => {
    const out = await recentReports(5, {
      getRecentReports: async () => [{ domain: "a.com", skepticismState: "green", generatedAt: NOW }],
    });
    expect(out).toEqual([{ domain: "a.com", state: "checks-out", generatedAt: NOW }]);
    expect(Object.keys(out[0]).sort()).toEqual(["domain", "generatedAt", "state"]);
  });
});
