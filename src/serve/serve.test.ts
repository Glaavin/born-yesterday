import { describe, it, expect, vi } from "vitest";
import { isFresh, REPORT_TTL_SECONDS } from "./freshness";
import { decideServe } from "./decide";
import { sessionKey } from "./quota";
import { META_GENERATION_MS, META_OPERATOR_RUN } from "./meta-signals";
import { serveReport, SEARCH_LIMIT_PER_DAY, type ServeDeps } from "./serve";
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

const aSignal: Signal = { key: "k", label: "k", valueText: "v", valueNum: null, source: null, status: "ok" };

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

  it("fails CLOSED in production when SERVER_SALT is unset — names the var (Tier 1 · 1a)", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SERVER_SALT", "");
    try {
      expect(() => sessionKey("203.0.113.7")).toThrow(/SERVER_SALT/);
      // An explicit salt still works — the guard only blocks the public fallback.
      expect(sessionKey("203.0.113.7", "real-salt")).toMatch(/^[0-9a-f]{64}$/);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("uses the dev fallback outside production (no throw)", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("SERVER_SALT", "");
    try {
      expect(sessionKey("203.0.113.7")).toMatch(/^[0-9a-f]{64}$/);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

function makeDeps(over: Partial<ServeDeps> = {}) {
  const collect = vi.fn(async (domain: string) => ({ report: aReport(domain), signals: [aSignal] }));
  const persist = vi.fn<(d: string, r: unknown, s: unknown, n: number) => Promise<void>>(async () => {});
  const persistAttempt = vi.fn(async () => {});
  const enrich = vi.fn(async () => {});
  const incrementQuota = vi.fn(async () => 1);
  const bg: Array<Promise<void>> = [];
  const deps: ServeDeps = {
    getReport: over.getReport ?? (async () => null),
    getQuota: over.getQuota ?? (async () => 0),
    incrementQuota: over.incrementQuota ?? incrementQuota,
    collect: over.collect ?? collect,
    persist: over.persist ?? persist,
    persistAttempt: over.persistAttempt ?? persistAttempt,
    enrich: over.enrich ?? enrich,
    now: over.now ?? (() => NOW),
    runBackground: over.runBackground ?? ((fn) => void bg.push(fn())),
  };
  return { deps, collect, persist, persistAttempt, enrich, incrementQuota, bg };
}

describe("serveReport", () => {
  it("invalid domain → error (no DB work)", async () => {
    const { deps, collect } = makeDeps();
    const r = await serveReport("not a domain", { sessionKey: "k" }, deps);
    expect(r.state).toBe("error");
    expect(collect).not.toHaveBeenCalled();
  });

  it("the hot path completes even when enrichment THROWS", async () => {
    // "Must not fail the hot path" is exactly the kind of promise that quietly
    // stops being true, so it is asserted rather than commented. Enrichment runs
    // on the SAME post-render mechanism as the stale-refresh — one background
    // path, not two — and the reader must never learn that it failed.
    const boom = vi.fn(async () => {
      throw new Error("enrichment exploded");
    });
    const { deps, bg, persist } = makeDeps({ enrich: boom });
    const r = await serveReport("x.com", { sessionKey: "k" }, deps);

    expect(r.state).toBe("served");
    expect(r.report?.domain).toBe("x.com");
    expect(persist).toHaveBeenCalled();
    // The background task settles without rejecting — an unhandled rejection
    // here would take the function down after the response had gone out.
    await expect(Promise.all(bg)).resolves.toBeDefined();
    expect(boom).toHaveBeenCalled();
  });

  it("OPERATOR BYPASS: a request with operator=true collects even when quota is spent", async () => {
    // Verification must not compete with the daily limit. Bypass forces the
    // collect through; it does NOT increment quota (no daily check burned); and
    // the generation is tagged meta_operator_run so it is not read as organic.
    const { deps, collect, persist, incrementQuota } = makeDeps({
      getQuota: async () => SEARCH_LIMIT_PER_DAY, // fully spent
    });
    const r = await serveReport("x.com", { sessionKey: "k", operator: true }, deps);

    expect(r.state).toBe("served");
    expect(collect).toHaveBeenCalled();
    expect(incrementQuota).not.toHaveBeenCalled();
    const persistedSignals = persist.mock.calls[0]![2] as Array<{ key: string }>;
    expect(persistedSignals.some((s) => s.key === META_OPERATOR_RUN)).toBe(true);
  });

  it("with quota spent and NO bypass, behaviour is unchanged — limit-reached, byte-identical", async () => {
    // The whole point of the gate is that it changes nothing when off.
    const { deps, collect, incrementQuota } = makeDeps({ getQuota: async () => SEARCH_LIMIT_PER_DAY });
    const r = await serveReport("x.com", { sessionKey: "k" }, deps);

    expect(r.state).toBe("limit-reached");
    expect(collect).not.toHaveBeenCalled();
    expect(incrementQuota).not.toHaveBeenCalled();
  });

  it("an ORGANIC generation is not tagged operator", async () => {
    const { deps, persist } = makeDeps();
    await serveReport("x.com", { sessionKey: "k" }, deps);
    const persistedSignals = persist.mock.calls[0]![2] as Array<{ key: string }>;
    expect(persistedSignals.some((s) => s.key === META_OPERATOR_RUN)).toBe(false);
  });

  it("a timing row rides the history write but never reaches the served report", async () => {
    // Story 23.1 Part 1, constraint 3 — asserted on the ASSEMBLED OUTPUT, not
    // just the type. The mock collect returns a real report plus a timing signal
    // in the signal list, exactly as realCollect does; the served report must
    // not reference it anywhere, while persist still writes it.
    const timingCollect = vi.fn(async (domain: string) => ({
      report: aReport(domain),
      signals: [aSignal, { key: META_GENERATION_MS, label: "t", valueText: null, valueNum: 1234, source: null, status: "ok" as const }],
      undecided: null,
    }));
    const { deps, persist } = makeDeps({ collect: timingCollect });
    const r = await serveReport("x.com", { sessionKey: "k" }, deps);

    const json = JSON.stringify(r.report);
    expect(json).not.toContain(META_GENERATION_MS);
    expect(json).not.toContain("1234");
    // but it WAS written to history
    const persistedSignals = persist.mock.calls[0]![2] as Array<{ key: string }>;
    expect(persistedSignals.some((s) => s.key === META_GENERATION_MS)).toBe(true);
  });

  it("enrichment runs AFTER the response, on the existing post-render path", async () => {
    const { deps, enrich, bg } = makeDeps();
    await serveReport("x.com", { sessionKey: "k" }, deps);
    // Queued on runBackground rather than awaited inline: the reader did not
    // wait for it.
    expect(bg.length).toBe(1);
    await Promise.all(bg);
    expect(enrich).toHaveBeenCalledWith("x.com", NOW);
  });

  it("NO VERDICT: no report row is written, and the attempt still is", async () => {
    // `reports` caches VERDICTS and there is not one. A seven-day TTL would
    // freeze a transient failure for a week — the B11 scenario — and
    // `schema_version` is written but never read (A2), so there is no
    // invalidation to lean on. Not writing is the only reliable answer.
    const undecidedCollect = vi.fn(async (domain: string) => ({
      report: aReport(domain),
      signals: [aSignal],
      undecided: [{ blocked: "green" as const, unknown: ["wayback_first"] }],
    }));
    const { deps, persist, persistAttempt } = makeDeps({ collect: undecidedCollect });
    const r = await serveReport("x.com", { sessionKey: "k" }, deps);

    expect(r.state).toBe("no-verdict");
    expect(r.report).toBeUndefined();
    expect(persist).not.toHaveBeenCalled();
    // History IS recorded — "we attempted these checks and they failed" is what
    // the append-only record is for, and it is the only trace this leaves.
    expect(persistAttempt).toHaveBeenCalledWith("x.com", [aSignal], NOW);
  });

  it("NO VERDICT: the visitor is not charged a daily check", async () => {
    // Tier 1 (#76) established that a failed report charges no quota. This is
    // the same category one path over: they asked for a report and did not get
    // one. Charging would repeat the defect Tier 1 just fixed.
    const undecidedCollect = vi.fn(async (domain: string) => ({
      report: aReport(domain),
      signals: [aSignal],
      undecided: [{ blocked: "green" as const, unknown: ["dns_spf"] }],
    }));
    const { deps, incrementQuota } = makeDeps({ collect: undecidedCollect });
    await serveReport("x.com", { sessionKey: "k" }, deps);
    expect(incrementQuota).not.toHaveBeenCalled();
  });

  it("NO VERDICT names which states were unknowable, for the copy and the instrumentation", async () => {
    const undecidedCollect = vi.fn(async (domain: string) => ({
      report: aReport(domain),
      signals: [aSignal],
      undecided: [{ blocked: "blue" as const, unknown: ["domain_age_days"] }],
    }));
    const { deps } = makeDeps({ collect: undecidedCollect });
    const r = await serveReport("x.com", { sessionKey: "k" }, deps);
    expect(r.undecided).toEqual([{ blocked: "blue", unknown: ["domain_age_days"] }]);
  });

  it("a report cached BEFORE the neutral channel existed still serves — normalised on the way in", () => {
    // `reports.schema_version` is written and never read (docs/open-items.md
    // A2), so nothing regenerates an old shape. Normalising in `parseReport` —
    // the one place a stored report re-enters the app — means a missing field
    // is handled once, where the old shape actually arrives, rather than by
    // every consumer remembering to.
    const legacy = JSON.parse(JSON.stringify(aReport()));
    delete legacy.neutral;
    expect("neutral" in legacy).toBe(false);
    return (async () => {
      const { deps } = makeDeps({ getReport: async () => aRow({ reportJson: JSON.stringify(legacy) }) });
      const out = await serveReport("example.com", { sessionKey: "s" }, deps);
      expect(out.state).toBe("served");
      expect(out.report!.neutral).toEqual([]);
    })();
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

  it("collect failure → error state, quota NOT charged (Tier 1 · 1b)", async () => {
    const { deps, incrementQuota } = makeDeps({
      collect: vi.fn(async () => {
        throw new Error("all sources timed out");
      }),
    });
    const r = await serveReport("x.com", { sessionKey: "k" }, deps);
    expect(r).toMatchObject({ state: "error", freshness: "none" });
    expect(r.report).toBeUndefined();
    expect(incrementQuota).not.toHaveBeenCalled(); // no allowance burned on failure
  });

  it("persist failure → error state, quota NOT charged (Tier 1 · 1b)", async () => {
    const { deps, incrementQuota } = makeDeps({
      persist: vi.fn(async () => {
        throw new Error("db write failed");
      }),
    });
    const r = await serveReport("x.com", { sessionKey: "k" }, deps);
    expect(r).toMatchObject({ state: "error", freshness: "none" });
    expect(incrementQuota).not.toHaveBeenCalled();
  });

  it("unidentified caller: still served a cached fresh report (Tier 1 · 1c)", async () => {
    const { deps, collect, incrementQuota } = makeDeps({ getReport: async () => aRow() });
    const r = await serveReport("x.com", { sessionKey: "unknown", identified: false }, deps);
    expect(r).toMatchObject({ state: "served", freshness: "fresh" });
    expect(collect).not.toHaveBeenCalled();
    expect(incrementQuota).not.toHaveBeenCalled();
  });

  it("unidentified caller: cannot collect an uncached domain → limit-reached (Tier 1 · 1c)", async () => {
    // getQuota reports 0 used, but an unidentified caller has no collection quota.
    const { deps, collect, incrementQuota } = makeDeps({ getQuota: async () => 0 });
    const r = await serveReport("x.com", { sessionKey: "unknown", identified: false }, deps);
    expect(r.state).toBe("limit-reached");
    expect(collect).not.toHaveBeenCalled();
    expect(incrementQuota).not.toHaveBeenCalled();
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
