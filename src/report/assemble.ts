import type { Report, ReportStateKey, Finding, Source } from "../components/report-state";
import type { CollectorResult, Signal, SignalSource } from "../signals/types";
import { signalsByKey } from "./signals";
import type { Derivations } from "./derive";
import { type Indicator, type IndicatorState } from "./indicator";
import { THREAT_NOT_LISTED } from "../signals/threats";
import { isoToEpochSec } from "../signals/dates";
import { CC_THRESHOLD_ISO, CC_THRESHOLD_LABEL } from "../signals/common-crawl";

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

  // CURRENT CERTIFICATE — NEUTRAL (Story 27, W4). First-cert AGE was retired
  // (source unavailable; see the indicator tombstone), so this reports only the
  // CURRENT cert from the live handshake (or SSLMate fallback): issuer, validity,
  // and the subject organisation. Facts, no framing; they feed no verdict.
  // A period-safe terminator: cert fields like "Stripe, Inc." already end in a
  // dot, and "…Inc.." reads as a typo.
  const dot = (s: string): string => (/[.!?]$/.test(s) ? s : `${s}.`);
  const issuerSig = byKey.get("tls_issuer");
  const validToSig = byKey.get("tls_valid_to");
  const validToIso = validToSig?.status === "ok" ? validToSig.valueText : null;
  const validToSec = isoToEpochSec(validToIso);
  const expired = validToSec != null && validToSec < nowSec;
  if (issuerSig?.status === "ok" && issuerSig.valueText != null) {
    const validClause = validToIso != null && !expired ? `, valid until ${validToIso.slice(0, 10)}` : "";
    push(neutral, dot(`Current certificate issued by ${issuerSig.valueText}${validClause}`), issuerSig.source);
  }
  const orgSig = byKey.get("ssl_org");
  if (orgSig?.status === "ok" && orgSig.valueText != null) {
    push(neutral, dot(`The certificate lists the organization ${orgSig.valueText}`), orgSig.source);
  }

  // NEGATIVE CERTIFICATE FACTS — near-objective, published as neutral
  // observations and wired to NOTHING (no verdict/concern/gate). Accumulation
  // redefinition is deferred (ruling #6); these are logged as accumulation
  // CANDIDATES for that story. Copy reports the fact, never characterizes it.
  if (expired && validToIso != null) {
    push(neutral, `Certificate expired ${validToIso.slice(0, 10)}.`, validToSig?.source);
  }
  const selfSig = byKey.get("tls_self_signed");
  if (selfSig?.status === "ok" && selfSig.valueText != null) {
    push(neutral, "Certificate is self-signed.", selfSig.source);
  }
  const mismatchSig = byKey.get("tls_hostname_mismatch");
  if (mismatchSig?.status === "ok" && mismatchSig.valueText != null) {
    push(neutral, "The certificate does not list this domain among its names.", mismatchSig.source);
  }

  // CLEAN THREAT CHECKS — NEUTRAL, which is what the code has said all along in
  // two places: "a clean threat check is information, NOT a strong 'safe'" and
  // "included as info". Absence from a list of KNOWN bad hosts is weak evidence
  // of safety, and this project rejects absence-as-evidence everywhere else.
  const pt = byKey.get("phishtank_listed");
  const uh = byKey.get("urlhaus_listed");
  if (pt?.valueText === THREAT_NOT_LISTED) push(neutral, "Not listed on PhishTank (this host).", pt.source);
  if (uh?.valueText === THREAT_NOT_LISTED) push(neutral, "Not listed on URLhaus (this host).", uh.source);

  // REGISTRAR TRANSFER — a NEUTRAL dated fact (Story 25, W2). A transfer means
  // the sponsoring registrar changed; that is ALL it means. The same owner
  // moving registrars produces one, and so does a sale — we do not know which,
  // so the copy is a bare dated fact with no companion clause composing it into
  // an argument (the §6.4 semicolon lesson). It feeds no verdict. Absence is
  // never published: this fires only when a transfer date was actually found.
  const tx = byKey.get("domain_transfer_date");
  if (tx?.status === "ok" && tx.valueText != null) {
    push(neutral, `Registrar transfer recorded ${tx.valueText.slice(0, 10)}.`, tx.source);
  }

  return { positive, neutral };
}

/**
 * The Reincarnation Check (Story 25, W2 · roadmap §5-W2 · amendment §3.4.8).
 *
 * Where the archive genuinely predates registration, publish the dated PAIR as
 * two independent neutral statements — "Registered 2023." / "Archived pages
 * exist from 2014." — no connective, each sourced. The reader draws the
 * recycled-domain inference; we assert nothing. This is the owner's approved
 * resolution of the E2 debate (ruling 18.3.27): it publishes a fact rather than
 * suppressing Green, which the declined registration-date clamp would have done.
 * So the span is NOT suppressed — on Green it stays the establishing evidence in
 * positive[]; this only ADDS the neutral pair.
 *
 * DEDUP, not restatement: the registration date already reaches neutral as the
 * indicator's demoted observation on domains a year or older, and on a non-Green
 * report the archive line is already in neutral too. Each half is added only
 * when it is not already present (the same `alreadyStated` discipline the copy
 * pass established), so nothing prints twice — while a recently re-registered
 * domain, which carries neither line yet, still gets the full pair.
 *
 * STRICT precedence and status guards (§3.4.8 / the observation-failure
 * convention): both dates must be `status: "ok"`; a missing registration date is
 * NOT "registered later." Wayback supplies the earliest date when it has one;
 * otherwise Common Crawl's point-in-time presence does, in CC's OWN wording —
 * never Wayback's span sentence (Story 24's rule). No editorial framing.
 */
function appendReincarnationPair(neutral: Finding[], byKey: Map<string, Signal>): void {
  const reg = byKey.get("domain_registration_date");
  const regSec = reg?.status === "ok" ? reg.valueNum : null;
  const regSource = reg?.source ?? null;
  if (regSec == null || regSource == null || reg?.valueText == null) return;

  // Each instrument that can date archive presence, in its OWN wording. Wayback
  // gives a real earliest-capture date; Common Crawl gives a point-in-time
  // presence used as a LOWER bound (CC_THRESHOLD_ISO). Story 24's rule: CC never
  // borrows Wayback's span sentence.
  const candidates: { sec: number; text: string; source: SignalSource }[] = [];
  const wf = byKey.get("wayback_first");
  const wfSec = wf?.status === "ok" && wf.valueText ? isoToEpochSec(wf.valueText) : null;
  if (wfSec != null && wf?.valueText && wf.source) {
    candidates.push({ sec: wfSec, text: `Archived pages exist from ${wf.valueText.slice(0, 4)}.`, source: wf.source });
  }
  const cc = byKey.get("cc_established");
  const ccSec = isoToEpochSec(CC_THRESHOLD_ISO);
  if (cc?.status === "ok" && cc.valueText != null && cc.source && ccSec != null) {
    candidates.push({ sec: ccSec, text: `Present in Common Crawl’s ${CC_THRESHOLD_LABEL} crawl.`, source: cc.source });
  }

  // The one predicate: an archive presence that genuinely precedes registration.
  // Take the EARLIEST such presence — the strongest evidence and the clearest
  // date — so the instrument with the better date wins rather than a fixed order.
  const chosen = candidates.filter((c) => c.sec < regSec).sort((a, b) => a.sec - b.sec)[0];
  if (!chosen) return;
  const archiveText = chosen.text;
  const archiveSource = chosen.source;

  // Registration half — reuse the indicator's observation when it is already in
  // neutral; otherwise supply the bare dated statement.
  if (!neutral.some((f) => /^Domain registered /.test(f.text))) {
    neutral.push({ text: `Registered ${reg.valueText.slice(0, 4)}.`, source: regSource });
  }
  // Archive half — reuse an archive line already in neutral (the non-Green case),
  // matched by the SAME instrument (source), not by shape. Matching any
  // archive-looking line would wrongly suppress a Common-Crawl precedence fact
  // when an unrelated, post-registration Wayback line happens to be present. On
  // Green the archive fact lives in positive[], so nothing here matches and the
  // pair's archive half is added to the neutral channel.
  const archiveAlready = neutral.some(
    (f) => f.source.url === archiveSource.url && /archiv|crawl/i.test(f.text),
  );
  if (!archiveAlready) neutral.push({ text: archiveText, source: archiveSource });
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

  // The Reincarnation pair (Story 25, W2) runs LAST, so it can reuse whatever
  // registration/archive lines are already in neutral rather than duplicating
  // them. Additive: it only ever pushes, never removes or rewrites.
  appendReincarnationPair(neutral, byKey);

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
