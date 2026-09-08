import { cachedFetch, type Fetcher } from "../../../lib/cached-fetch";
import { PROBES, probeById, runProbe, type ProbeResult } from "./probes";
import {
  clampDays,
  successRateByDay,
  statusDistribution,
  generationTiming,
  noVerdictCandidatesByDay,
  type Row,
  type SqlRunner,
} from "./queries";

/**
 * The panel's action dispatch — Story 26 (W8). Pure orchestration over injected
 * deps, so the route wires the real harness + DB runner and the tests wire
 * spies. Everything here READS: a probe (through the harness) or a SELECT. There
 * is no code path that writes, and a test proves it by driving every action with
 * a runner spy that rejects any non-SELECT SQL and a DB double whose writes
 * throw.
 *
 * Inputs are validated defensively — this is a request boundary. A bad body is
 * a 400-shaped error object, never a throw.
 */

export interface PanelDeps {
  run: SqlRunner;
  fetcher: Fetcher;
}

/**
 * The panel's outbound fetcher IS the harness instance — the single wiring
 * point behind the story's one hard rule. A test asserts this identity, so the
 * probe path can never quietly become a raw `fetch` that measures a call path
 * the product never takes (the 23.2 correction).
 */
export const PANEL_FETCHER: Fetcher = cachedFetch;

const SIGNAL_RE = /^[a-z0-9_]{1,64}$/;

export type PanelResult =
  | { kind: "probe"; result: ProbeResult }
  | { kind: "rows"; view: string; rows: Row[]; note?: string }
  | { kind: "error"; error: string };

function asRecord(body: unknown): Record<string, unknown> | null {
  return typeof body === "object" && body !== null ? (body as Record<string, unknown>) : null;
}

export async function handlePanelAction(body: unknown, deps: PanelDeps): Promise<PanelResult> {
  const b = asRecord(body);
  if (!b) return { kind: "error", error: "expected a JSON object" };

  const action = b.action;
  switch (action) {
    case "probe": {
      const id = typeof b.id === "string" ? b.id : "";
      const def = probeById(id);
      if (!def) return { kind: "error", error: `unknown probe id: ${id || "(missing)"}` };
      const result = await runProbe(def, deps.fetcher);
      return { kind: "probe", result };
    }

    case "success": {
      const signal = typeof b.signal === "string" ? b.signal : "";
      if (!SIGNAL_RE.test(signal)) return { kind: "error", error: "invalid signal name" };
      const rows = await successRateByDay(deps.run, signal, clampDays(b.days));
      return { kind: "rows", view: "success-by-day", rows };
    }

    case "status": {
      const signal = typeof b.signal === "string" ? b.signal : "";
      if (!SIGNAL_RE.test(signal)) return { kind: "error", error: "invalid signal name" };
      const rows = await statusDistribution(deps.run, signal, clampDays(b.days));
      return {
        kind: "rows",
        view: "status-distribution",
        rows,
        note: "Three persisted states only. rate-limited / budget-exhausted are collapsed to 'failed' before persistence — see the live probes for those.",
      };
    }

    case "timing": {
      const includeOperator = b.includeOperator === true;
      const rows = await generationTiming(deps.run, { includeOperator, days: clampDays(b.days) });
      return {
        kind: "rows",
        view: includeOperator ? "generation-timing (incl. operator)" : "generation-timing (organic only)",
        rows,
      };
    }

    case "noverdict": {
      const rows = await noVerdictCandidatesByDay(deps.run, clampDays(b.days));
      return {
        kind: "rows",
        view: "no-verdict-candidates",
        rows,
        note: "Upper bound: a day with a load-bearing check failure. Not every such day produced a no-verdict.",
      };
    }

    default:
      return { kind: "error", error: `unknown action: ${String(action)}` };
  }
}

/** The probe registry, surfaced for the client to render one button per source. */
export const PROBE_MENU = PROBES.map((p) => ({
  id: p.id,
  label: p.label,
  host: p.host,
  wired: p.wired,
  note: p.note,
}));
