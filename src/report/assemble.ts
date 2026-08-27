import type { Report, ReportStateKey, Finding, Source } from "../components/report-state";
import type { CollectorResult, Signal, SignalSource } from "../signals/types";
import { signalsByKey } from "./signals";
import type { Derivations } from "./derive";
import { certAgeClaim, certAgeIsFloorOnly, type Indicator, type IndicatorState } from "./indicator";
import { THREAT_NOT_LISTED } from "../signals/threats";

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

const fmtDate = (nowSec: number): string => new Date(nowSec * 1000).toISOString().slice(0, 10);

/**
 * Reassuring, SOURCED facts (clean threat checks included as info — never a
 * strong "safe").
 *
 * `alreadyStated` names facts the INDICATOR has already published as leading
 * establishing reasons, in better words. Green publishes its establishing
 * reasons at the head of `positive[]`, so without this the same fact appeared
 * twice a few lines apart — "Archived since 1996 — … spans ~30 years" followed
 * by "Archived on the Wayback Machine since 1996 (6687 captures recorded)".
 * Suppression rather than string-matching, so the two copies cannot drift into
 * disagreeing about which is authoritative.
 */
function gatherPositives(
  byKey: Map<string, Signal>,
  nowSec: number,
  alreadyStated: ReadonlySet<string> = new Set(),
): Finding[] {
  const out: Finding[] = [];
  const push = (text: string, source: SignalSource | null | undefined) => {
    if (source) out.push({ text, source });
  };

  // REGISTRATION AGE IS NOT PUBLISHED HERE ANY MORE (18.3 §3.4.1 / §3.4.5).
  // `Registered ~${humanAge(ageDays)} ago.` sat in this list, under a "Positive"
  // badge, and that framing is the claim: it offered registration age as
  // evidence of establishment. Registration age is a valid UPPER bound on
  // operating history and an invalid LOWER bound, so for a recycled domain the
  // fact was true and the implication false. The date is still published — as a
  // neutral sourced observation in the summary, emitted by `indicator.ts` — so
  // the reader loses no fact, only an inference we were not entitled to.

  if (!alreadyStated.has("spf") && byKey.get("dns_spf")?.valueText != null) push("SPF email-authentication record present.", byKey.get("dns_spf")?.source);
  if (byKey.get("dns_dmarc")?.valueText != null) push("DMARC policy present.", byKey.get("dns_dmarc")?.source);

  const tp = byKey.get("trustpilot");
  if (tp?.valueText != null) push(`Trustpilot: ${tp.valueText}.`, tp.source);

  // SPAN LEADS, COUNT FOLLOWS AS CONTEXT (§3.4.3). The count on its own measures
  // crawler attention — `bolt.new` is ~2 years old with 449 captures — so
  // publishing it as the headline reassurance rewarded popularity. The span is
  // the time measure; the count is disclosed beside it, not in place of it. Both
  // are facts about the DOMAIN: the operator-continuity gap they leave is
  // disclosed as a caveat by `indicator.ts`.
  const snapSig = byKey.get("wayback_snapshot_count");
  const snaps = snapSig?.valueNum ?? null;
  const firstArchived = byKey.get("wayback_first");
  const firstIso =
    firstArchived?.status === "ok" ? (firstArchived.valueText ?? null) : null;
  if (alreadyStated.has("archive")) {
    // The indicator's establishing reason already carries span AND count.
  } else if (firstIso) {
    const since = firstIso.slice(0, 4);
    push(
      snaps != null
        ? `Archived on the Wayback Machine since ${since} (${snaps} capture${snaps === 1 ? "" : "s"} recorded).`
        : `Archived on the Wayback Machine since ${since}.`,
      firstArchived?.source,
    );
  } else if (snaps != null && snaps > 0) {
    push(`${snaps} archived capture${snaps === 1 ? "" : "s"} on the Wayback Machine.`, snapSig?.source);
  }

  // CAPPED (§3.4.4). A pre-2018 first-cert date is not a measurement — CT
  // logging was voluntary and non-uniform before then, so we cannot tell "first
  // certificate" from "first LOGGED certificate". Stated as a floor, and labelled
  // as one. Same helper as the indicator's corroborating reason: the cap has to
  // hold in both places or it does not hold at all.
  const fc = byKey.get("first_cert_date");
  if (fc?.status === "ok" && fc.valueNum != null) {
    push(
      `TLS certificates logged for ${certAgeClaim(fc.valueNum, nowSec)}` +
        (certAgeIsFloorOnly(fc.valueNum) ? " (a floor — Certificate Transparency does not reach further back)." : "."),
      fc.source,
    );
  }

  const pt = byKey.get("phishtank_listed");
  const uh = byKey.get("urlhaus_listed");
  if (pt?.valueText === THREAT_NOT_LISTED) push("Not listed on PhishTank (this host).", pt.source);
  if (uh?.valueText === THREAT_NOT_LISTED) push("Not listed on URLhaus (this host).", uh.source);

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
  // The RESIDUAL is not a finding — it states what we could not establish, and
  // it fires only when nothing was flagged. It routes to the summary, so it is
  // never badged "Flagged" and never counted in "N worth a closer look".
  const residual = indicator.reasons.find((r) => r.kind === "residual") ?? null;
  const mainReasons = indicator.reasons.filter((r) => r.kind !== "caveat" && r.kind !== "residual");

  // Concern reasons become flagged findings (sourced); none for Green.
  const flagged: Finding[] =
    indicator.state === "green"
      ? []
      : mainReasons
          .filter((r): r is { text: string; source: SignalSource } => r.source != null)
          .map((r) => ({ text: r.text, source: r.source }));

  // Reassuring facts; for Green, the establishing reasons lead — and whatever
  // they already state is not restated below them.
  const stated = new Set<string>();
  if (indicator.state === "green") {
    for (const r of mainReasons) {
      if (/^Archived since /.test(r.text)) stated.add("archive");
      if (/SPF present/.test(r.text)) stated.add("spf");
    }
  }
  const positive: Finding[] = gatherPositives(byKey, nowSec, stated);
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
  // BLUE reached no assessment, so its reasons are NOT "worth a closer look" —
  // that phrasing would present insufficiency as concern (the state's own meaning
  // is "too new to tell"). Counting them would compound it.
  const tally =
    indicator.state === "blue"
      ? "not enough to assess yet"
      : residual
        ? "nothing flagged"
        : `${flagged.length === 0 ? "none" : flagged.length} worth a closer look`;
  // The residual follows the tally as its own sentence rather than being counted
  // as a finding: "nothing flagged" is the count, and this is why the verdict is
  // still not Green.
  const because = residual ? ` ${residual.text}` : "";
  const summary =
    `Surfaces ${signalCount} public signal${signalCount !== 1 ? "s" : ""} for ${domain}; ` +
    `${tally}.${because}${note}`;

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
