import type { Report, ReportStateKey, Finding, Source } from "../components/report-state";
import type { CollectorResult, Signal, SignalSource } from "../signals/types";
import { signalsByKey } from "./signals";
import { humanAge, type Derivations } from "./derive";
import type { Indicator, IndicatorState } from "./indicator";

/**
 * Assembly (Story 16 §E) — collector results + derivations + indicator → the
 * exact `Report` shape the view renders (src/components/report-state.ts). The
 * summary is FACTUAL (counts only, no judgment); every finding carries a source.
 * No persistence/caching/route wiring (that's Story 17).
 */

// State storage (Story 8 green|amber|red|blue) ⇄ the view's ReportStateKey —
// the mapping deferred from Story 8.
const STATE_TO_KEY: Record<IndicatorState, ReportStateKey> = {
  green: "checks-out",
  amber: "some-concerns",
  red: "red-flags",
  blue: "too-new",
};
export const KEY_TO_STATE: Record<ReportStateKey, IndicatorState> = {
  "checks-out": "green",
  "some-concerns": "amber",
  "red-flags": "red",
  "too-new": "blue",
};
export const stateToKey = (s: IndicatorState): ReportStateKey => STATE_TO_KEY[s];

const SECONDS_PER_DAY = 86400;
const fmtDate = (nowSec: number): string => new Date(nowSec * 1000).toISOString().slice(0, 10);

/** Reassuring, SOURCED facts (clean threat checks included as info — never a strong "safe"). */
function gatherPositives(byKey: Map<string, Signal>, nowSec: number): Finding[] {
  const out: Finding[] = [];
  const push = (text: string, source: SignalSource | null | undefined) => {
    if (source) out.push({ text, source });
  };

  const reg = byKey.get("domain_registration_date");
  const ageDays = byKey.get("domain_age_days")?.valueNum ?? null;
  if (ageDays != null && ageDays >= 365) push(`Registered ~${humanAge(ageDays)} ago.`, reg?.source);

  if (byKey.get("dns_spf")?.valueText != null) push("SPF email-authentication record present.", byKey.get("dns_spf")?.source);
  if (byKey.get("dns_dmarc")?.valueText != null) push("DMARC policy present.", byKey.get("dns_dmarc")?.source);

  const tp = byKey.get("trustpilot");
  if (tp?.valueText != null) push(`Trustpilot: ${tp.valueText}.`, tp.source);

  const snaps = byKey.get("wayback_snapshot_count")?.valueNum ?? null;
  if (snaps != null && snaps > 0) push(`${snaps} archived snapshots on the Wayback Machine.`, byKey.get("wayback_snapshot_count")?.source);

  const fc = byKey.get("first_cert_date");
  if (fc?.valueNum != null) push(`First TLS certificate ~${humanAge(Math.floor((nowSec - fc.valueNum) / SECONDS_PER_DAY))} ago.`, fc.source);

  const pt = byKey.get("phishtank_listed");
  const uh = byKey.get("urlhaus_listed");
  if (pt?.valueText === "Not listed") push("Not listed on PhishTank (this host).", pt.source);
  if (uh?.valueText === "Not listed") push("Not listed on URLhaus (this host).", uh.source);

  return out;
}

function dedupeSources(list: SignalSource[]): Source[] {
  const seen = new Set<string>();
  const out: Source[] = [];
  for (const s of list) {
    if (!seen.has(s.url)) {
      seen.add(s.url);
      out.push({ label: s.label, url: s.url });
    }
  }
  return out;
}

export function assembleReport(
  domain: string,
  results: CollectorResult[],
  derivations: Derivations,
  indicator: Indicator,
  nowSec: number,
): Report {
  const byKey = signalsByKey(results);

  // Caveat reasons (e.g. an unreachable feed) are transparency notes — they go to
  // the SUMMARY, never into flagged[]/positive[]. The rest are contributing reasons.
  const caveats = indicator.reasons.filter((r) => r.kind === "caveat");
  const mainReasons = indicator.reasons.filter((r) => r.kind !== "caveat");

  // Concern reasons become flagged findings (sourced); none for Green.
  const flagged: Finding[] =
    indicator.state === "green"
      ? []
      : mainReasons
          .filter((r): r is { text: string; source: SignalSource } => r.source != null)
          .map((r) => ({ text: r.text, source: r.source }));

  // Reassuring facts; for Green, the establishing reasons lead.
  const positive: Finding[] = gatherPositives(byKey, nowSec);
  if (indicator.state === "green") {
    for (let i = mainReasons.length - 1; i >= 0; i--) {
      const r = mainReasons[i];
      if (r.source) positive.unshift({ text: r.text, source: r.source });
    }
  }

  const sources = dedupeSources([
    ...results.flatMap((c) =>
      c.signals.map((s) => s.source).filter((s): s is SignalSource => s != null),
    ),
    ...(derivations.pivot?.sources ?? []),
  ]);

  // Factual summary — counts only, no judgment language.
  const signalCount = results.reduce(
    (n, c) => n + c.signals.filter((s) => s.valueText != null || s.valueNum != null).length,
    0,
  );
  const note = caveats.length ? ` Note: ${caveats.map((c) => c.text).join(" ")}` : "";
  const summary =
    `Surfaces ${signalCount} public signal${signalCount !== 1 ? "s" : ""} for ${domain}; ` +
    `${flagged.length === 0 ? "none" : flagged.length} worth a closer look.${note}`;

  return {
    domain,
    state: stateToKey(indicator.state),
    summary,
    lastChecked: fmtDate(nowSec),
    flagged,
    positive,
    sources,
  };
}
