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
 * Split the collected facts into the channels the report renders (Story 19.1).
 *
 * CLASSIFICATION IS ROUTING, NEVER A RULE. Nothing here decides whether a
 * finding fires — only where it is published. Owner rulings, 2026-08-27:
 *
 *   POSITIVE  affirmative evidence — SPF present, DMARC present, and the
 *             archive span WHEN it is the published reason for Green.
 *   NEUTRAL   a fact supporting no inference either way — the capture count,
 *             the archive span on any report that is NOT Green, certificate
 *             age, the Trustpilot rating, and a clean threat check.
 *   FLAGGED   adverse. None originate here; they come from the indicator.
 *
 * `alreadyStated` names facts the INDICATOR has already published as leading
 * establishing reasons, in better words — Green publishes those at the head of
 * `positive[]`, so without this the same fact appeared twice a few lines apart.
 * Suppression rather than string-matching on output, so the two copies cannot
 * drift into disagreeing about which is authoritative.
 */
function gatherFindings(
  byKey: Map<string, Signal>,
  nowSec: number,
  isGreen: boolean,
  alreadyStated: ReadonlySet<string> = new Set(),
): { positive: Finding[]; neutral: Finding[] } {
  const positive: Finding[] = [];
  const neutral: Finding[] = [];
  // §6.2 binds every channel alike: no source, no publish.
  const push = (into: Finding[], text: string, source: SignalSource | null | undefined) => {
    if (source) into.push({ text, source });
  };

  // REGISTRATION AGE IS NOT PUBLISHED HERE (18.3 §3.4.1 / §3.4.5). It reached
  // the reader as a neutral, sourced observation from `indicator.ts`, and now
  // routes into `neutral[]` with the other observations — the same fact, and
  // still not offered as evidence of establishment.

  if (!alreadyStated.has("spf") && byKey.get("dns_spf")?.valueText != null) {
    push(positive, "SPF email-authentication record present.", byKey.get("dns_spf")?.source);
  }
  if (byKey.get("dns_dmarc")?.valueText != null) {
    push(positive, "DMARC policy present.", byKey.get("dns_dmarc")?.source);
  }

  // TRUSTPILOT — restored to the report, in the channel it always needed.
  // Hotfix #64 removed it from `positive[]` because `valueText` is the rating
  // verbatim, so "1.8/5 (40 reviews)" published under a heading calling it
  // reassuring. There is still NO direction check and there must not be:
  // deciding 4.6 is good and 1.8 is bad means adopting a third party's verdict
  // on a company, which the intake rule prohibits and `reputation.ts` disclaims
  // ("we count and link, we don't judge"). We print the score, attach nothing,
  // and let the reader weigh it.
  const tp = byKey.get("trustpilot");
  if (tp?.valueText != null) push(neutral, `Trustpilot: ${tp.valueText}.`, tp.source);

  // ARCHIVE — the one CONTEXT-DEPENDENT classification, and deliberately so.
  // On a Green report the span IS the establishing evidence and the indicator
  // has already published it. Anywhere else the same sentence establishes
  // nothing: `bolt.new`'s "Archived since 2024" is precisely why it is NOT
  // Green, and `secondlibrary.com`'s span is actively misleading (§3.4.8).
  // Same fact, three meanings — so the channel follows the verdict. The
  // assembler already knows the state, so this stays routing.
  const snapSig = byKey.get("wayback_snapshot_count");
  const snaps = snapSig?.valueNum ?? null;
  const firstArchived = byKey.get("wayback_first");
  const firstIso = firstArchived?.status === "ok" ? (firstArchived.valueText ?? null) : null;
  if (alreadyStated.has("archive")) {
    // The indicator's establishing reason already carries span AND count.
  } else if (firstIso) {
    const since = firstIso.slice(0, 4);
    push(
      isGreen ? positive : neutral,
      snaps != null
        ? `Archived on the Wayback Machine since ${since} (${snaps} capture${snaps === 1 ? "" : "s"} recorded).`
        : `Archived on the Wayback Machine since ${since}.`,
      firstArchived?.source,
    );
  } else if (snaps != null && snaps > 0) {
    push(neutral, `${snaps} archived capture${snaps === 1 ? "" : "s"} on the Wayback Machine.`, snapSig?.source);
  }

  // CERTIFICATES — NEUTRAL. They corroborate an established span; they are
  // never a route of their own (§3.4.4), and a pre-2018 date is a floor rather
  // than a measurement, which is stated in the copy.
  const fc = byKey.get("first_cert_date");
  if (fc?.status === "ok" && fc.valueNum != null) {
    push(
      neutral,
      `TLS certificates logged for ${certAgeClaim(fc.valueNum, nowSec)}` +
        (certAgeIsFloorOnly(fc.valueNum) ? " (a floor — Certificate Transparency does not reach further back)." : "."),
      fc.source,
    );
  }

  // CLEAN THREAT CHECKS — NEUTRAL, which is what the code has said all along in
  // two places: "a clean threat check is information, NOT a strong 'safe'" and
  // "included as info". Absence from a list of KNOWN bad hosts is weak evidence
  // of safety, and this project rejects absence-as-evidence everywhere else.
  const pt = byKey.get("phishtank_listed");
  const uh = byKey.get("urlhaus_listed");
  if (pt?.valueText === THREAT_NOT_LISTED) push(neutral, "Not listed on PhishTank (this host).", pt.source);
  if (uh?.valueText === THREAT_NOT_LISTED) push(neutral, "Not listed on URLhaus (this host).", uh.source);

  return { positive, neutral };
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

  // §3.2's TWO CAVEAT DISCIPLINES FINALLY GET TWO HOMES — and the split is
  // structural rather than conventional, which is what §3.2 wanted a `subkind`
  // field for (register item A3):
  //
  //   OBSERVATION  sourced, describes the DOMAIN  → the neutral channel
  //   DISCLOSURE   unsourced, describes OUR limits → the summary note
  //
  // The symmetry rule (§6.2) already forces this: a disclosure carries no
  // source, so it cannot be published as a finding in any channel. Nothing new
  // had to be invented to tell them apart — the invariant was already load-
  // bearing, it just had nowhere to route to.
  const allCaveats = indicator.reasons.filter((r) => r.kind === "caveat");
  const caveats = allCaveats.filter((r) => r.source == null);
  const observations = allCaveats.filter((r) => r.source != null);
  // The RESIDUAL is not a finding — it states what we could not establish, and
  // it fires only when nothing was flagged. It routes to the summary, so it is
  // never badged "Flagged" and never counted in "N worth a closer look".
  const residual = indicator.reasons.find((r) => r.kind === "residual") ?? null;
  const mainReasons = indicator.reasons.filter((r) => r.kind !== "caveat" && r.kind !== "residual");

  // Concern reasons become flagged findings (sourced); none for Green.
  const flagged: Finding[] =
    indicator.state === "green" || indicator.state === "blue"
      ? []
      : mainReasons
          .filter((r): r is { text: string; source: SignalSource } => r.source != null)
          .map((r) => ({ text: r.text, source: r.source }));

  // Reassuring facts; for Green, the establishing reasons lead — and whatever
  // they already state is not restated below them.
  const isGreen = indicator.state === "green";
  const stated = new Set<string>();
  if (isGreen) {
    for (const r of mainReasons) {
      if (/^Archived since /.test(r.text)) stated.add("archive");
      if (/SPF present/.test(r.text)) stated.add("spf");
    }
  }
  const { positive, neutral } = gatherFindings(byKey, nowSec, isGreen, stated);
  if (isGreen) {
    for (let i = mainReasons.length - 1; i >= 0; i--) {
      const r = mainReasons[i];
      if (r.source) positive.unshift({ text: r.text, source: r.source });
    }
  }
  // BLUE's reasons are NEUTRAL (owner ruling). They are facts we established —
  // a registration date and a capture count — and they were rendering under a
  // "Couldn't establish" badge, which is the opposite of what they are. Blue's
  // meaning is carried by the pill and the summary, not by badging its evidence.
  if (indicator.state === "blue") {
    for (const r of mainReasons) if (r.source) neutral.push({ text: r.text, source: r.source });
  }
  // Sourced observations from the indicator (registration date, the AI-language
  // date, DMARC absent) join them.
  for (const r of observations) neutral.push({ text: r.text, source: r.source! });

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
    neutral,
    sources,
  };
}
