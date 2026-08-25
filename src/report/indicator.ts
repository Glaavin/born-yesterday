import type { CollectorResult, Signal, SignalSource } from "../signals/types";
import { signalsByKey } from "./signals";
import { humanAge, type Derivations } from "./derive";
import { THREAT_LISTED } from "../signals/threats";

/**
 * Draft four-state Skepticism Indicator (mvp-spec §2E) — a PUBLISHABLE rubric:
 * every verdict lists its contributing, SOURCED reasons. Evaluated IN ORDER.
 * Red bar is high (a listing, or ≥2 sourced concern points); Amber is the
 * generous default. A clean threat check is information, NOT a strong "safe" and
 * never makes Green by itself.
 *
 * State is stored as green|amber|red|blue (Story 8 schema); the view's
 * ReportStateKey mapping lives in assemble.ts.
 */

export type IndicatorState = "green" | "amber" | "red" | "blue";
export interface Reason {
  text: string;
  source: SignalSource | null;
  /** "caveat" reasons are transparency notes (e.g. a feed we couldn't reach) —
   *  they route to the report SUMMARY, never to positive[]/flagged[]. Default =
   *  positive/contributing. */
  kind?: "positive" | "caveat";
}
export interface Indicator {
  state: IndicatorState;
  reasons: Reason[];
}

// ---- DRAFT thresholds — single source of truth; calibrated in Story 19 Stage 3.
// Every one is a NAMED constant: Stage 1 found the accumulation threshold living
// as a bare `2` inside an `if`.
export const YOUNG_DOMAIN_DAYS = 180; // DRAFT: < ~6 months → "young"
export const THIN_SNAPSHOT_COUNT = 5; // DRAFT: < this many archive captures → "thin"
export const ESTABLISHED_SNAPSHOT_COUNT = 50; // DRAFT: ≥ this many captures → established-by-archive

// Stage 1 Part B found ONE constant doing three unrelated jobs, so retuning it for
// Green silently retuned pivot eligibility. Split; all three share the same DRAFT
// value today, which is exactly why the coupling was invisible.
export const ESTABLISHED_DOMAIN_DAYS = 365 * 3; // DRAFT: Green-by-registration-age
export const ESTABLISHED_CERT_DAYS = 365 * 3; // DRAFT: Green-by-first-certificate age
export const PIVOT_ESTABLISHED_DAYS = 365 * 3; // DRAFT: "established" precondition for the pivot
export const PIVOT_RECENT_DAYS = 365; // DRAFT: AI language added within ~1y → "recent onset"

// ---- Q3: accumulation as a RATIO of findings to COMPLETED observations. ----
// DRAFT value chosen ONLY to reproduce the retired `concerns.length >= 2` rule at
// realistic denominators (2/13 = 0.154, 2/20 = 0.10), so this stage does not change
// accumulation outcomes. It is NOT a considered value for "several concerns" — 10%
// of completed checks returning findings is a low bar. Stage 3 sets the real one.
export const ACCUMULATION_RATIO = 0.1; // DRAFT — behaviour-preserving, not calibrated
export const ACCUMULATION_MIN_CHECKS = 8; // DRAFT: floor — too few observations cannot reach Red
/**
 * DRAFT floor on the NUMERATOR, and an amendment defect worth recording: a pure
 * ratio cannot express "several findings" while the concern pool has two members.
 * Any threshold low enough for 2 findings to fire at a realistic denominator
 * (2/20 = 0.10) is also low enough for ONE finding to fire at a smaller one
 * (1/10 = 0.10) — measured, not hypothesised: at ratio 0.1 alone, seven corpus
 * domains went Red on a single concern. "Accumulation" means more than one
 * finding by definition, so the count needs its own floor alongside the ratio.
 */
export const ACCUMULATION_MIN_FINDINGS = 2; // DRAFT
/**
 * Link-outs are NOT checks. The four constant reputation links are emitted on
 * every report regardless of findings, so they inflate any naive count (Stage 1
 * item 14 — which is why the "Surfaces N public signals" figure is not a valid
 * denominator). The definitional line: a check is something that could have come
 * back either way.
 */
export const LINK_OUT_KEYS: readonly string[] = [
  "bbb",
  "reputation_reviews",
  "reputation_complaints",
  "reddit_search",
];

const SECONDS_PER_DAY = 86400;
const num = (s?: Signal): number | null => s?.valueNum ?? null;
const listed = (s?: Signal): boolean => s?.valueText === THREAT_LISTED;

export function computeIndicator(
  domain: string,
  results: CollectorResult[],
  derivations: Derivations,
  nowSec: number,
): Indicator {
  const byKey = signalsByKey(results);

  // ---- Q4 CORE RULE (18.3): a failed or not_attempted check cannot SATISFY any
  // condition. `checked(key)` is the gate — every condition that asserts
  // something about the domain must pass through it, or it is asserting on the
  // basis of a check that never completed. ----
  const checked = (key: string): boolean => byKey.get(key)?.status === "ok";

  // Caveats are collected here and appended at whichever state fires. Building
  // them SEPARATELY from the branch logic is what makes "caveats never alter the
  // verdict" (Story 18 §3.5) structural rather than a promise.
  const caveats: Reason[] = [];
  const verdict = (state: IndicatorState, reasons: Reason[]): Indicator => ({
    state,
    reasons: [...reasons, ...caveats],
  });

  const reg = byKey.get("domain_registration_date");
  const ageDays = num(byKey.get("domain_age_days"));
  const ageChecked = checked("domain_age_days");
  const snapshots = num(byKey.get("wayback_snapshot_count"));
  const archiveChecked = checked("wayback_snapshot_count");
  const reputationChecked = checked("trustpilot");
  const hasReputation = byKey.get("trustpilot")?.valueText != null;
  const spfChecked = checked("dns_spf");
  const dmarcChecked = checked("dns_dmarc");
  const spf = byKey.get("dns_spf")?.valueText != null;
  const dmarc = byKey.get("dns_dmarc")?.valueText != null;
  const dnsResolved = byKey.get("dns_a")?.valueText != null || spf || dmarc;
  const firstCert = byKey.get("first_cert_date");
  const certChecked = checked("first_cert_date");
  const firstCertAgeDays =
    certChecked && firstCert?.valueNum != null
      ? Math.floor((nowSec - firstCert.valueNum) / SECONDS_PER_DAY)
      : null;
  const pt = byKey.get("phishtank_listed");
  const uh = byKey.get("urlhaus_listed");
  const dnsSource = (name: string) => ({
    label: "DNS over HTTPS",
    url: `https://dns.google/query?name=${name}&type=TXT`,
  });

  // ---- Gap disclosures (Part 2: emitted on EVERY state, not just Green). ----
  const unreachableFeeds: string[] = [];
  if (!checked("phishtank_listed")) unreachableFeeds.push("PhishTank");
  if (!checked("urlhaus_listed")) unreachableFeeds.push("URLhaus");
  if (unreachableFeeds.length) {
    caveats.push({
      text: `${unreachableFeeds.join(" and ")} ${unreachableFeeds.length > 1 ? "were" : "was"} not reachable at check time; not independently cleared.`,
      source: null,
      kind: "caveat",
    });
  }
  if (!archiveChecked) {
    caveats.push({
      text: "Archive history was not available at check time, so the capture count is not established.",
      source: null,
      kind: "caveat",
    });
  }
  if (!reputationChecked) {
    caveats.push({
      text: "Public review presence was not checked, so it is not established either way.",
      source: null,
      kind: "caveat",
    });
  }
  if (!ageChecked) {
    caveats.push({
      text: "A registration lookup did not complete, so the domain's age is not established.",
      source: null,
      kind: "caveat",
    });
  }

  // ---- 1) On a threat list → RED (a single authoritative sourced signal). ----
  const listings: Reason[] = [];
  if (listed(pt)) listings.push({ text: "Listed on PhishTank (public phishing feed).", source: pt!.source });
  if (listed(uh)) listings.push({ text: "Listed on URLhaus (abuse.ch malware feed).", source: uh!.source });
  if (listings.length) return verdict("red", listings);

  // ---- Discrete, sourced concern points. ----
  const candidateConcerns: Reason[] = [];
  const pivot = derivations.pivot;
  // Gated on the AI-language check having completed: an unperformed scan must not
  // supply a concern point.
  if (
    pivot &&
    checked("ai_language_first_seen") &&
    pivot.domainAgeDays >= PIVOT_ESTABLISHED_DAYS &&
    pivot.aiOnsetAgoDays <= PIVOT_RECENT_DAYS
  ) {
    candidateConcerns.push({ text: pivot.text, source: pivot.sources[0] ?? null });
  }
  // Q4 GUARD: previously `dnsResolved && !spf && !dmarc`, which fired when the TXT
  // lookups FAILED (null reads as "absent") as long as the A lookup had answered.
  // Both records must have been genuinely checked to assert that neither exists.
  if (dnsResolved && spfChecked && dmarcChecked && !spf && !dmarc) {
    candidateConcerns.push({
      text: "No SPF or DMARC email-authentication records found.",
      source: dnsSource(`_dmarc.${domain}`),
    });
  }
  // SYMMETRY RULE: an unsourced reason neither publishes NOR counts (18.3 §7.2).
  const concerns = candidateConcerns.filter((c) => c.source != null);

  // ---- 2) Footprint THIN → BLUE ("too new to tell"). ----
  // Blue is a CONJUNCTION OF ABSENCES (Story 18 §3.1), so each absence must have
  // been established. A check that did not complete cannot supply one.
  const young = ageChecked && ageDays != null && ageDays < YOUNG_DOMAIN_DAYS;
  const thinArchive = archiveChecked && snapshots != null && snapshots < THIN_SNAPSHOT_COUNT;
  const noReputation = reputationChecked && !hasReputation;
  if (young && thinArchive && noReputation) {
    const blueReasons: Reason[] = [
      {
        text: `Too little public footprint to assess yet: registered ~${humanAge(ageDays!)} ago.`,
        source: reg?.source ?? null,
      },
      {
        text: `${snapshots} archived capture${snapshots === 1 ? "" : "s"} on the Wayback Machine.`,
        source: byKey.get("wayback_snapshot_count")?.source ?? null,
      },
    ];
    return verdict("blue", blueReasons);
  }

  // ---- 3) ACCUMULATION → RED (Q3: a RATIO over completed observations). ----
  // Denominator = signals whose check COMPLETED, excluding link-outs. Built from
  // status, never from the "Surfaces N public signals" figure.
  const completedChecks = results
    .flatMap((c) => c.signals)
    .filter((sg) => sg.status === "ok" && !LINK_OUT_KEYS.includes(sg.key)).length;
  const accumulationRatio = completedChecks > 0 ? concerns.length / completedChecks : 0;
  // NOTE: accumulation is near-unreachable today — the concern pool has two
  // members and the pivot is being conditioned on substantiation in a later
  // story. Expected and documented (18.3 §3.1), not a bug.
  if (
    concerns.length >= ACCUMULATION_MIN_FINDINGS &&
    completedChecks >= ACCUMULATION_MIN_CHECKS &&
    accumulationRatio >= ACCUMULATION_RATIO
  ) {
    return verdict("red", [
      ...concerns,
      {
        text: `${concerns.length} of the ${completedChecks} checks we completed returned findings. Each is listed above with its source.`,
        source: null,
        kind: "caveat",
      },
    ]);
  }

  // ---- 4) ESTABLISHED and CLEAN → GREEN (positive evidence required). ----
  const establishedByAge = ageChecked && ageDays != null && ageDays >= ESTABLISHED_DOMAIN_DAYS;
  const establishedByArchive = archiveChecked && snapshots != null && snapshots >= ESTABLISHED_SNAPSHOT_COUNT;
  const establishedByCert = firstCertAgeDays != null && firstCertAgeDays >= ESTABLISHED_CERT_DAYS;
  const established = establishedByAge || establishedByArchive || establishedByCert;

  // Q6 (18.3 §3.3): Green requires SPF. A MISSING DMARC no longer blocks Green —
  // finding F2 measured ~24% of established organisations without one, so the old
  // both-required gate denied Green for adoption lag rather than risk. DMARC
  // absence is disclosed as a caveat below.
  // The gate is reachable only when the check COMPLETED: a parse failure or
  // timeout must not deny Green (18.3 §3.2).
  const emailAuthDeniesGreen = spfChecked && !spf;
  const clean = !emailAuthDeniesGreen && concerns.length === 0;
  if (established && clean) {
    const reasons: Reason[] = [];
    if (establishedByAge) {
      reasons.push({ text: `Established domain — registered ~${humanAge(ageDays!)} ago.`, source: reg?.source ?? null });
    } else if (establishedByArchive) {
      reasons.push({
        text: `Long archive history — ${snapshots} captures on the Wayback Machine.`,
        source: byKey.get("wayback_snapshot_count")?.source ?? null,
      });
    } else if (establishedByCert) {
      reasons.push({ text: `Long-lived TLS history — first certificate ~${humanAge(firstCertAgeDays!)} ago.`, source: firstCert?.source ?? null });
    }
    if (spf) {
      reasons.push({ text: "Email authentication configured (SPF present).", source: byKey.get("dns_spf")?.source ?? null });
    }
    // Disclosed, not flagged: a completed check that found no DMARC.
    if (dmarcChecked && !dmarc) {
      caveats.push({
        text: `No DMARC record was found at _dmarc.${domain}.`,
        source: dnsSource(`_dmarc.${domain}`),
        kind: "caveat",
      });
    }
    return verdict("green", reasons);
  }

  // ---- 5) Else → AMBER ("some concerns") — the generous default. ----
  if (dmarcChecked && !dmarc) {
    caveats.push({
      text: `No DMARC record was found at _dmarc.${domain}.`,
      source: dnsSource(`_dmarc.${domain}`),
      kind: "caveat",
    });
  }
  if (concerns.length) return verdict("amber", concerns);
  return verdict("amber", [
    {
      text: established
        ? "Established, but some expected signals (e.g. SPF) are missing."
        : "Some positive signals, but not enough established history to fully vouch yet.",
      source: reg?.source ?? null,
    },
  ]);
}
