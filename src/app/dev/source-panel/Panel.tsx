"use client";

// LAUNCH-GATED DIAGNOSTIC — Story 26 (W8). Remove with the rest of
// src/app/dev/source-panel/ before public launch (docs/ops-tasks.md).
import { useState } from "react";
import { PANEL_HEADER } from "./constants";

export interface ProbeMenuItem {
  id: string;
  label: string;
  host: string;
  wired: "wired" | "diagnostic";
  note?: string;
}

export interface HostLimit {
  host: string;
  budgetMax: number | null;
  budgetBasis: string | null;
  ratePerMin: number | null;
  burst: number | null;
  rateBasis: string | null;
}

type Json = Record<string, unknown>;

/**
 * Inert until the operator types the key in. The key lives in component state
 * only — never a URL, never persisted — and is attached to each request as the
 * `x-by-operator` header. Every button below fires ONE deliberate call; nothing
 * runs on a timer or on mount, because the sources rate-limit and the panel must
 * not become the thing that trips them.
 */
export default function Panel({
  probes,
  limits,
}: {
  probes: ProbeMenuItem[];
  limits: HostLimit[];
}) {
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [probeRows, setProbeRows] = useState<Json[]>([]);
  const [history, setHistory] = useState<{ view: string; rows: Json[]; note?: string } | null>(null);
  const [signal, setSignal] = useState("wayback_first");
  const [days, setDays] = useState(30);
  const [includeOperator, setIncludeOperator] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function call(payload: Json): Promise<Json | null> {
    setErr(null);
    if (!key) {
      setErr("Enter the operator key first.");
      return null;
    }
    const res = await fetch("/dev/source-panel/api", {
      method: "POST",
      headers: { "content-type": "application/json", [PANEL_HEADER]: key },
      body: JSON.stringify(payload),
    });
    if (res.status === 404) {
      setErr("404 — key rejected or panel not enabled here. (Fails closed by design.)");
      return null;
    }
    const json = (await res.json()) as Json;
    if (json.kind === "error") {
      setErr(String(json.error));
      return null;
    }
    return json;
  }

  async function fireProbe(id: string) {
    setBusy(id);
    const json = await call({ action: "probe", id });
    setBusy(null);
    if (json && json.kind === "probe") {
      setProbeRows((prev) => [json.result as Json, ...prev].slice(0, 40));
    }
  }

  async function loadHistory(action: string, extra: Json = {}) {
    setBusy(action);
    const json = await call({ action, days, ...extra });
    setBusy(null);
    if (json && json.kind === "rows") {
      setHistory({ view: String(json.view), rows: (json.rows as Json[]) ?? [], note: json.note as string | undefined });
    }
  }

  return (
    <main className="wrap">
      <style>{PANEL_CSS}</style>

      <header>
        <h1>Source panel</h1>
        <p className="muted">
          Read-only diagnostic · launch-gated · every probe goes through the harness ·
          no automatic calls
        </p>
        <label className="keyrow">
          <span>Operator key</span>
          <input
            type="password"
            autoComplete="off"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="BY_OPERATOR_KEY"
          />
        </label>
        {err && <p className="err">{err}</p>}
      </header>

      <section>
        <h2>A · Live source status</h2>
        <p className="muted">One click = one probe through <code>cachedFetch</code>. Never automatic.</p>
        <div className="btns">
          {probes.map((p) => (
            <button key={p.id} disabled={busy !== null} onClick={() => fireProbe(p.id)} title={p.note}>
              {p.label}
              <span className={p.wired === "wired" ? "tag wired" : "tag diag"}>{p.wired}</span>
            </button>
          ))}
        </div>
        {probeRows.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>source</th><th>host</th><th>outcome</th><th>status</th>
                <th>ms</th><th>sane</th><th>cache</th><th>wired</th>
              </tr>
            </thead>
            <tbody>
              {probeRows.map((r, i) => (
                <tr key={i} className={r.outcome === "ok" ? "" : "row-bad"}>
                  <td>{String(r.label)}</td>
                  <td className="mono">{String(r.host)}</td>
                  <td className="mono">{String(r.outcome)}</td>
                  <td className="mono">{r.status == null ? "—" : String(r.status)}</td>
                  <td className="mono">{String(r.ms)}</td>
                  <td>{r.saneShape == null ? "—" : r.saneShape ? "✓" : "✗"}</td>
                  <td>{r.fromCache ? "hit" : "live"}</td>
                  <td>{String(r.wired)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section>
        <h2>Configured per-host limits</h2>
        <p className="muted">
          The ceilings, read off the harness constants. Live token counts / cooldowns are
          not exposed by <code>cached-fetch</code>; a live refusal shows up as a{" "}
          <code>rate-limited</code> / <code>budget-exhausted</code> probe outcome above.
        </p>
        <table>
          <thead>
            <tr><th>host</th><th>concurrency max</th><th>rate/min</th><th>burst</th><th>basis</th></tr>
          </thead>
          <tbody>
            {limits.map((l) => (
              <tr key={l.host}>
                <td className="mono">{l.host}</td>
                <td className="mono">{l.budgetMax ?? "—"}</td>
                <td className="mono">{l.ratePerMin ?? "—"}</td>
                <td className="mono">{l.burst ?? "—"}</td>
                <td>{l.rateBasis ?? l.budgetBasis ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2>B · Historical view</h2>
        <div className="controls">
          <label>
            signal
            <input value={signal} onChange={(e) => setSignal(e.target.value)} placeholder="wayback_first" />
          </label>
          <label>
            days
            <input
              type="number"
              min={1}
              max={120}
              value={days}
              onChange={(e) => setDays(Number(e.target.value) || 30)}
            />
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={includeOperator}
              onChange={(e) => setIncludeOperator(e.target.checked)}
            />
            include operator-tagged
          </label>
        </div>
        <div className="btns">
          <button disabled={busy !== null} onClick={() => loadHistory("success", { signal })}>
            success rate / day
          </button>
          <button disabled={busy !== null} onClick={() => loadHistory("status", { signal })}>
            status distribution
          </button>
          <button disabled={busy !== null} onClick={() => loadHistory("timing", { includeOperator })}>
            generation timing
          </button>
          <button disabled={busy !== null} onClick={() => loadHistory("noverdict")}>
            no-verdict rate
          </button>
          <button disabled={busy !== null} onClick={() => loadHistory("noverdict-causes")}>
            no-verdict causes
          </button>
        </div>
        {history && (
          <>
            <p className="view">{history.view}</p>
            {history.note && <p className="muted">{history.note}</p>}
            {history.rows.length === 0 ? (
              <p className="muted">no rows</p>
            ) : (
              <table>
                <thead>
                  <tr>{Object.keys(history.rows[0]).map((k) => <th key={k}>{k}</th>)}</tr>
                </thead>
                <tbody>
                  {history.rows.map((r, i) => (
                    <tr key={i}>
                      {Object.keys(history.rows[0]).map((k) => (
                        <td key={k} className="mono">{String(r[k])}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </section>
    </main>
  );
}

const PANEL_CSS = `
  .wrap { max-width: 960px; margin: 0 auto; padding: 24px; font: 14px/1.5 ui-sans-serif, system-ui, sans-serif; color: #1a1a1a; }
  .wrap h1 { font-size: 20px; margin: 0 0 4px; }
  .wrap h2 { font-size: 15px; margin: 28px 0 8px; border-bottom: 1px solid #e2e2e2; padding-bottom: 4px; }
  .wrap .muted { color: #6b6b6b; font-size: 12px; margin: 4px 0; }
  .wrap code { background: #f2f2f2; padding: 1px 4px; border-radius: 3px; font-size: 12px; }
  .wrap .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; }
  .keyrow { display: flex; align-items: center; gap: 8px; margin-top: 12px; }
  .keyrow input { flex: 1; padding: 6px 8px; border: 1px solid #ccc; border-radius: 4px; font: inherit; }
  .err { color: #b00020; font-size: 13px; margin: 8px 0; }
  .btns { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0; }
  .btns button { display: inline-flex; align-items: center; gap: 6px; padding: 6px 10px; border: 1px solid #ccc; border-radius: 4px; background: #fafafa; cursor: pointer; font: inherit; }
  .btns button:hover:not(:disabled) { background: #f0f0f0; }
  .btns button:disabled { opacity: 0.5; cursor: default; }
  .tag { font-size: 10px; text-transform: uppercase; padding: 1px 4px; border-radius: 3px; }
  .tag.wired { background: #e6f4ea; color: #1e6b34; }
  .tag.diag { background: #fdf0e3; color: #8a5200; }
  table { border-collapse: collapse; width: 100%; margin: 10px 0; }
  th, td { text-align: left; padding: 4px 8px; border-bottom: 1px solid #ededed; font-size: 12px; }
  th { color: #555; font-weight: 600; }
  .row-bad td { background: #fdecec; }
  .controls { display: flex; flex-wrap: wrap; gap: 16px; align-items: center; margin: 8px 0; }
  .controls label { display: flex; flex-direction: column; gap: 2px; font-size: 12px; color: #555; }
  .controls .check { flex-direction: row; align-items: center; gap: 6px; }
  .controls input { padding: 4px 6px; border: 1px solid #ccc; border-radius: 4px; font: inherit; }
  .view { font-family: ui-monospace, monospace; font-size: 13px; margin: 10px 0 2px; font-weight: 600; }
`;
