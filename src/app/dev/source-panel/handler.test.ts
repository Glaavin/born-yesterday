import { describe, it, expect, vi, afterEach } from "vitest";
import { cachedFetch, type FetchOptions, type FetchResult } from "../../../lib/cached-fetch";
import { handlePanelAction, PANEL_FETCHER, PROBE_MENU } from "./handler";
import type { SqlRunner } from "./queries";

/**
 * The panel's two load-bearing guarantees, asserted rather than assumed:
 *   1. NO PANEL CODE PATH WRITES.
 *   2. Every probe goes through the harness.
 * Plus request-boundary validation.
 */

/** A SqlRunner spy that records the exact SQL text emitted by every query. */
function runnerSpy(rows: Record<string, unknown>[] = [{ day: "2026-09-01", runs: 1 }]) {
  const statements: string[] = [];
  const run = (async (strings: TemplateStringsArray) => {
    statements.push(strings.join("?")); // reconstruct text; params are separate & parameterised
    return rows;
  }) as unknown as SqlRunner;
  return { run, statements };
}

/** Every panel action that reads history, so the write-prevention sweep covers them all. */
const HISTORY_ACTIONS: Record<string, unknown>[] = [
  { action: "success", signal: "wayback_first", days: 30 },
  { action: "status", signal: "wayback_first", days: 30 },
  { action: "timing", includeOperator: false },
  { action: "timing", includeOperator: true },
  { action: "noverdict", days: 14 },
];

const READONLY_START = /^\s*(select|with)\b/i;
const FORBIDDEN = /\b(insert|update|delete|drop|alter|truncate|create|grant|revoke|merge)\b/i;

const okFetcher = async (): Promise<FetchResult> => ({
  ok: true,
  status: 200,
  body: "[]",
  fromCache: false,
});

afterEach(() => vi.restoreAllMocks());

describe("write prevention — no panel code path can write (Story 26 W8)", () => {
  it("every history action emits ONLY read-only SQL", async () => {
    const { run, statements } = runnerSpy();
    for (const body of HISTORY_ACTIONS) {
      const res = await handlePanelAction(body, { run, fetcher: okFetcher });
      expect(res.kind).toBe("rows");
    }
    // At least one statement per action, and every one begins with SELECT/WITH
    // and contains no mutating keyword.
    expect(statements.length).toBeGreaterThanOrEqual(HISTORY_ACTIONS.length);
    for (const sql of statements) {
      expect(sql, sql).toMatch(READONLY_START);
      expect(sql, sql).not.toMatch(FORBIDDEN);
    }
  });

  it("the probe path never touches the DB runner, and never caches (ttl 0)", async () => {
    const { run, statements } = runnerSpy();
    const seen: FetchOptions[] = [];
    const fetcher = async (opts: FetchOptions): Promise<FetchResult> => {
      seen.push(opts);
      return okFetcher();
    };
    const globalFetch = vi.spyOn(globalThis, "fetch");

    const res = await handlePanelAction({ action: "probe", id: PROBE_MENU[0].id }, { run, fetcher });

    expect(res.kind).toBe("probe");
    expect(statements).toEqual([]); // no SQL at all on the probe path
    expect(seen).toHaveLength(1);
    expect(seen[0].ttlSeconds).toBe(0); // ttl 0 ⇒ the harness writes no cache row
    expect(globalFetch).not.toHaveBeenCalled(); // no raw fetch — only the injected harness
  });
});

describe("every probe goes through the harness (Story 26 W8's one hard rule)", () => {
  it("the panel's fetcher IS the cached-fetch harness instance", () => {
    expect(PANEL_FETCHER).toBe(cachedFetch);
  });
});

describe("probe result maps the harness outcome faithfully", () => {
  it("carries a refusal code (budget-exhausted) verbatim with saneShape null", async () => {
    const { run } = runnerSpy();
    const fetcher = async (): Promise<FetchResult> => ({ ok: false, error: "budget-exhausted" });
    const res = await handlePanelAction({ action: "probe", id: PROBE_MENU[0].id }, { run, fetcher });
    expect(res.kind).toBe("probe");
    if (res.kind !== "probe") return;
    expect(res.result.outcome).toBe("budget-exhausted");
    expect(res.result.saneShape).toBeNull();
  });

  it("checks response-shape sanity on a 2xx", async () => {
    const { run } = runnerSpy();
    const cc = PROBE_MENU.find((p) => p.id === "common-crawl")!;
    const fetcher = async (): Promise<FetchResult> => ({ ok: true, status: 200, body: "{}", fromCache: false });
    const res = await handlePanelAction({ action: "probe", id: cc.id }, { run, fetcher });
    if (res.kind !== "probe") throw new Error("expected probe");
    expect(res.result.saneShape).toBe(true);
    expect(res.result.status).toBe(200);
  });
});

describe("request-boundary validation — bad input is an error object, never a throw", () => {
  const { run } = runnerSpy();
  const deps = { run, fetcher: okFetcher };

  it("rejects a non-object body", async () => {
    expect((await handlePanelAction(null, deps)).kind).toBe("error");
    expect((await handlePanelAction("nope", deps)).kind).toBe("error");
  });
  it("rejects an unknown action", async () => {
    expect((await handlePanelAction({ action: "wipe" }, deps)).kind).toBe("error");
  });
  it("rejects an unknown probe id", async () => {
    expect((await handlePanelAction({ action: "probe", id: "../../etc" }, deps)).kind).toBe("error");
  });
  it("rejects a malformed signal name", async () => {
    expect((await handlePanelAction({ action: "success", signal: "a; drop table" }, deps)).kind).toBe("error");
    expect((await handlePanelAction({ action: "status", signal: "" }, deps)).kind).toBe("error");
  });
});
