import type { CollectorResult, Signal, SignalSource } from "../signals/types";
import { signalsByKey } from "./signals";
import { humanAge, type Derivations } from "./derive";

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
const listed = (s?: Signal): boolean => s?.valueText === "Listed";

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
  const concerns: Reason[] = [];
  const pivot = derivations.pivot;
  if (pivot && pivot.domainAgeDays >= ESTABLISHED_DOMAIN_DAYS && pivot.aiOnsetAgoDays <= PIVOT_RECENT_DAYS) {
    concerns.push({ text: pivot.text, source: pivot.sources[0] ?? null });
  }
  if (dnsResolved && !spf && !dmarc) {
    concerns.push({
      text: "No SPF or DMARC email-authentication records found.",
      source: { label: "DNS over HTTPS", url: `https://dns.google/query?name=_dmarc.${domain}&type=TXT` },
    });
  }

  // ---- 2) Footprint THIN → BLUE ("too new to tell"). ----
  const young = ageDays != null && ageDays < YOUNG_DOMAIN_DAYS;
  const fewSnaps = snapshots == null || snapshots < THIN_SNAPSHOT_COUNT;
  if (young && fewSnaps && !hasReputation) {
    return {
      state: "blue",
      reasons: [
        {
          text: `Too little public footprint to assess yet: registered ~${humanAge(ageDays)} ago, ${snapshots ?? 0} archived captures, no major reviews found.`,
          source: reg?.source ?? null,
        },
      ],
    };
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
