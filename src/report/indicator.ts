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

// ---- DRAFT thresholds — single source of truth; tuned in the later weights Epic.
export const YOUNG_DOMAIN_DAYS = 180; // DRAFT: < ~6 months → "young"
export const ESTABLISHED_DOMAIN_DAYS = 365 * 3; // DRAFT: > ~3 years → "established"
export const THIN_SNAPSHOT_COUNT = 5; // DRAFT: < this many archive captures → "thin"
export const ESTABLISHED_SNAPSHOT_COUNT = 50; // DRAFT: ≥ this many captures → established-by-archive
export const PIVOT_RECENT_DAYS = 365; // DRAFT: AI language added within ~1y → "recent onset"
// (A loose PIVOT_RECENT_DAYS can't cause a false Red — the pivot is only one of ≥2 points.)

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

  const reg = byKey.get("domain_registration_date");
  const ageDays = num(byKey.get("domain_age_days"));
  const snapshots = num(byKey.get("wayback_snapshot_count"));
  const hasReputation = byKey.get("trustpilot")?.valueText != null;
  const spf = byKey.get("dns_spf")?.valueText != null;
  const dmarc = byKey.get("dns_dmarc")?.valueText != null;
  const dnsResolved = byKey.get("dns_a")?.valueText != null || spf || dmarc;
  const firstCert = byKey.get("first_cert_date");
  const firstCertAgeDays =
    firstCert?.valueNum != null
      ? Math.floor((nowSec - firstCert.valueNum) / SECONDS_PER_DAY)
      : null;
  const pt = byKey.get("phishtank_listed");
  const uh = byKey.get("urlhaus_listed");

  // ---- 1) On a threat list → RED (a single authoritative sourced signal). ----
  const listings: Reason[] = [];
  if (listed(pt)) listings.push({ text: "Listed on PhishTank (public phishing feed).", source: pt!.source });
  if (listed(uh)) listings.push({ text: "Listed on URLhaus (abuse.ch malware feed).", source: uh!.source });
  if (listings.length) return { state: "red", reasons: listings };

  // ---- Discrete, sourced concern points. ----
  const candidateConcerns: Reason[] = [];
  const pivot = derivations.pivot;
  if (pivot && pivot.domainAgeDays >= ESTABLISHED_DOMAIN_DAYS && pivot.aiOnsetAgoDays <= PIVOT_RECENT_DAYS) {
    candidateConcerns.push({ text: pivot.text, source: pivot.sources[0] ?? null });
  }
  if (dnsResolved && !spf && !dmarc) {
    candidateConcerns.push({
      text: "No SPF or DMARC email-authentication records found.",
      source: { label: "DNS over HTTPS", url: `https://dns.google/query?name=_dmarc.${domain}&type=TXT` },
    });
  }
  // SYMMETRY RULE: the product's own standard is "if we can't link a source, we
  // don't make the claim." Applied consistently, an unsourced reason must neither
  // PUBLISH nor COUNT toward the verdict — otherwise the disclosed rationale could
  // be strictly shorter than the computation that produced the state. (Today every
  // concern above is structurally sourced, so this changes no current verdict; it
  // closes the path so a future reason cannot inherit it silently.)
  const concerns = candidateConcerns.filter((c) => c.source != null);

  // ---- 2) Footprint THIN → BLUE ("too new to tell"). ----
  const young = ageDays != null && ageDays < YOUNG_DOMAIN_DAYS;
  const fewSnaps = snapshots == null || snapshots < THIN_SNAPSHOT_COUNT;
  if (young && fewSnaps && !hasReputation) {
    // Each claim is limited to what its own source supports. The old single
    // sentence asserted an archive count we may never have obtained ("0 archived
    // captures" on a FAILED check) and "no major reviews found" — a claim about
    // reviews sourced to the registration record, when only Trustpilot was checked.
    const blueReasons: Reason[] = [
      {
        text: `Too little public footprint to assess yet: registered ~${humanAge(ageDays)} ago.`,
        source: reg?.source ?? null,
      },
    ];
    if (snapshots != null) {
      blueReasons.push({
        text: `${snapshots} archived capture${snapshots === 1 ? "" : "s"} on the Wayback Machine.`,
        source: byKey.get("wayback_snapshot_count")?.source ?? null,
      });
    } else {
      // Disclose the gap instead of publishing a count we do not have. A caveat
      // routes to the report summary and never alters the verdict.
      blueReasons.push({
        text: "Archive history was not available at check time, so the capture count is not established.",
        source: null,
        kind: "caveat",
      });
    }
    return { state: "blue", reasons: blueReasons };
  }

  // ---- 3) ≥ 2 provable sourced concern points → RED. ----
  if (concerns.length >= 2) return { state: "red", reasons: concerns };

  // ---- 4) ESTABLISHED and CLEAN → GREEN (positive evidence required). ----
  const establishedByAge = ageDays != null && ageDays >= ESTABLISHED_DOMAIN_DAYS;
  const establishedByArchive = snapshots != null && snapshots >= ESTABLISHED_SNAPSHOT_COUNT;
  const establishedByCert = firstCertAgeDays != null && firstCertAgeDays >= ESTABLISHED_DOMAIN_DAYS;
  const established = establishedByAge || establishedByArchive || establishedByCert;
  const clean = spf && dmarc && concerns.length === 0; // not listed (we'd have returned Red)
  if (established && clean) {
    const reasons: Reason[] = [];
    if (establishedByAge) {
      reasons.push({ text: `Established domain — registered ~${humanAge(ageDays)} ago.`, source: reg?.source ?? null });
    } else if (establishedByArchive) {
      reasons.push({
        text: `Long archive history — ${snapshots} captures on the Wayback Machine.`,
        source: byKey.get("wayback_snapshot_count")?.source ?? null,
      });
    } else if (establishedByCert) {
      reasons.push({ text: `Long-lived TLS history — first certificate ~${humanAge(firstCertAgeDays!)} ago.`, source: firstCert?.source ?? null });
    }
    reasons.push({
      text: "Email authentication configured (SPF and DMARC present).",
      source: byKey.get("dns_dmarc")?.source ?? byKey.get("dns_spf")?.source ?? null,
    });
    // Transparency over false comfort: if a threat feed was NOT checked
    // (unreachable / no key — value null, not a definitive "Listed"/"Not listed"),
    // disclose the gap rather than implying we cleared it. (1.7 trade-off: a
    // stricter "require ≥1 successful threat check for GREEN" once working feed
    // keys exist; default now = state-the-gap so GREEN stays reachable.)
    const unreachable: string[] = [];
    if (pt?.valueText == null) unreachable.push("PhishTank"); // "Listed" would have returned Red
    if (uh?.valueText == null) unreachable.push("URLhaus");
    if (unreachable.length) {
      reasons.push({
        text: `${unreachable.join(" and ")} ${unreachable.length > 1 ? "were" : "was"} not reachable at check time; not independently cleared.`,
        source: null,
        kind: "caveat", // a transparency note → the report summary, not positive[]
      });
    }
    return { state: "green", reasons };
  }

  // ---- 5) Else → AMBER ("some concerns") — the generous default. ----
  if (concerns.length) return { state: "amber", reasons: concerns };
  return {
    state: "amber",
    reasons: [
      {
        text: established
          ? "Established, but some expected signals (e.g. SPF/DMARC) are missing."
          : "Some positive signals, but not enough established history to fully vouch yet.",
        source: reg?.source ?? null,
      },
    ],
  };
}
