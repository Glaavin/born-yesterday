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

// Stage 1 Part B found ONE constant doing three unrelated jobs, so retuning it for
// Green silently retuned pivot eligibility. Split; the survivors keep the same DRAFT
// value today, which is exactly why the coupling was invisible.
export const PIVOT_ESTABLISHED_DAYS = 365 * 3; // DRAFT: "established" precondition for the pivot
export const PIVOT_RECENT_DAYS = 365; // DRAFT: AI language added within ~1y → "recent onset"

// ---- ESTABLISHMENT (18.3 §3.4) — SPAN, not count, not registration age. ----
/**
 * How far back the archive record must reach for a domain to count as
 * established. A SPAN is a time measure; the retired capture count was a measure
 * of crawler attention (§3.4.3) — `bolt.new` is ~2 years old with 449 captures.
 *
 * DRAFT. Value chosen deliberately as the retired `ESTABLISHED_DOMAIN_DAYS`
 * value (3 years) so this story changes WHICH CLOCK we read, not HOW HIGH the
 * bar is — that keeps the verdict delta readable as one change rather than two.
 * It is NOT the owner's decade rule (§3.4.6), which states that ten years is
 * *sufficient* for establishment and says nothing about what is *necessary*.
 * Stage 3 sets the real value.
 */
export const ESTABLISHED_ARCHIVE_SPAN_DAYS = 365 * 3; // DRAFT

/**
 * RETIRED in 18.3 §3.4 — recorded here so they are not reintroduced:
 *   ESTABLISHED_DOMAIN_DAYS   Green-by-registration-age. Registration age is a
 *                             valid UPPER bound on operating history and an
 *                             invalid LOWER bound (§3.4.1). It survives only in
 *                             YOUNG_DOMAIN_DAYS, which uses it in the sound
 *                             direction.
 *   ESTABLISHED_SNAPSHOT_COUNT Green-by-capture-count. Measures crawler
 *                             attention (§3.4.3). Replaced by the span above.
 *   ESTABLISHED_CERT_DAYS     Green-by-first-certificate. Demoted to
 *                             corroborating evidence, capped (§3.4.4).
 */

// ---- Certificate Transparency: the instrument's reach (§3.4.4). ----
/**
 * Chrome required CT compliance for certificates ISSUED AFTER 30 April 2018
 * (enforced from Chrome 68, 24 July 2018). Certificates issued before that date
 * were grandfathered and never had to be logged, and voluntary logging was
 * non-uniform — so a first-cert date earlier than this is NOT A MEASUREMENT. We
 * cannot distinguish "the first certificate was 2012" from "the first *logged*
 * certificate was 2012." Not a fact about calibration; a fact about the record.
 */
export const CT_INTERPRETABLE_FROM_ISO = "2018-04-30";
const CT_INTERPRETABLE_FROM_SEC = Math.floor(Date.parse(`${CT_INTERPRETABLE_FROM_ISO}T00:00:00Z`) / 1000);
/**
 * Ceiling on any cert-derived age claim, in years. Sourced to the owner's decade
 * rule (§3.4.6) — beyond a decade further precision adds nothing — NOT a draft
 * calibration value.
 */
export const CERT_AGE_CAP_YEARS = 10;

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
/** "YYYY-MM-DD…" → epoch seconds, or null. Never throws. */
const isoSec = (iso: string | null | undefined): number | null => {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : Math.floor(ms / 1000);
};
/** Epoch seconds → "YYYY-MM-DD". */
const isoDay = (sec: number): string => new Date(sec * 1000).toISOString().slice(0, 10);

/**
 * A cert-derived age, expressed to the limit of what Certificate Transparency
 * can support (§3.4.4). After CT became mandatory the date is interpretable, so
 * we state it. Before that date it is only a LOWER BOUND — earlier certificates
 * may exist and simply never have been logged — so we say "over N years" and cap
 * N at CERT_AGE_CAP_YEARS. Capping is not rounding a known number; it is
 * declining to report a number we do not have.
 *
 * Exported because `assemble.ts` publishes the same claim in `positive[]` and
 * the cap has to hold in both places or it does not hold at all.
 */
export function certAgeClaim(firstCertSec: number, nowSec: number): string {
  const days = Math.max(0, Math.floor((nowSec - firstCertSec) / SECONDS_PER_DAY));
  if (firstCertSec >= CT_INTERPRETABLE_FROM_SEC) return `~${humanAge(days)}`;
  const years = Math.min(Math.max(1, Math.floor(days / 365)), CERT_AGE_CAP_YEARS);
  return `over ${years} year${years === 1 ? "" : "s"}`;
}
/** True when the cert date predates CT's mandate, i.e. is not interpretable as a start. */
export const certAgeIsFloorOnly = (firstCertSec: number): boolean =>
  firstCertSec < CT_INTERPRETABLE_FROM_SEC;

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
  //
  // ONE CHANNEL, TWO COPY DISCIPLINES (18.3, Stage 2):
  //   DISCLOSURE  — a check we could not complete. Copy describes OUR limits,
  //                 never the domain. ("… was not reachable at check time.")
  //   OBSERVATION — a check that completed and found something worth noting but
  //                 not a concern. Copy describes the finding, neutrally, and
  //                 carries its source. (e.g. no DMARC record.)
  // `kind: "caveat"` is a ROUTING label (→ report summary), not a semantic one.
  // A `subkind` field would make the distinction enforceable rather than
  // conventional; proposed, deliberately not built here.
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
  // ---- Archive SPAN (18.3 §3.4.6). `wayback_first` has been collected since
  // Helium and never consumed; the capture count it sat beside was consumed and
  // measured the wrong thing. Guarded on status: a check that did not complete
  // cannot establish a span, and "no first capture" is not "captured long ago".
  const firstArchived = byKey.get("wayback_first");
  const firstArchivedSec = checked("wayback_first") ? isoSec(firstArchived?.valueText) : null;
  const archiveSpanDays =
    firstArchivedSec != null ? Math.floor((nowSec - firstArchivedSec) / SECONDS_PER_DAY) : null;
  const longArchiveSpan =
    archiveSpanDays != null && archiveSpanDays >= ESTABLISHED_ARCHIVE_SPAN_DAYS;
  const reputationChecked = checked("trustpilot");
  const spfChecked = checked("dns_spf");
  const dmarcChecked = checked("dns_dmarc");
  const spf = byKey.get("dns_spf")?.valueText != null;
  const dmarc = byKey.get("dns_dmarc")?.valueText != null;
  const dnsResolved = byKey.get("dns_a")?.valueText != null || spf || dmarc;
  const firstCert = byKey.get("first_cert_date");
  const certChecked = checked("first_cert_date");
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
    // Copy follows the rule: since 18.3 §3.4 the load-bearing archive fact is how
    // far the record REACHES BACK, not how many captures there are, so the
    // disclosure names what we actually failed to establish.
    caveats.push({
      text: "Archive history was not available at check time, so how far this domain's record reaches back is not established.",
      source: null,
      kind: "caveat",
    });
  }
  if (!reputationChecked) {
    // DISCLOSURE. Still published — it just no longer gates a verdict.
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
  if (!spfChecked) {
    // DISCLOSURE — and load-bearing: an incomplete lookup blocks Green (§3.5),
    // so the reader is told why rather than left with an unexplained verdict.
    caveats.push({
      text: "An email-authentication lookup did not complete, so SPF is not established either way.",
      source: null,
      kind: "caveat",
    });
  }
  // DISCLOSURE — the F1 gap, stated rather than hidden (18.3 §3.4.6 / §3.4.7).
  // Archive span is a property of the DOMAIN. Operator continuity is what would
  // tie it to the current occupant, and it is deliberately not built (post-MVP),
  // so a recycled domain still inherits its predecessor's history. Fired
  // wherever a long span EXISTS, not only where it produces Green, because the
  // report publishes the long-history fact in `positive[]` at every state.
  if (longArchiveSpan) {
    caveats.push({
      text:
        "Archive history describes the domain name, not whoever runs it now — we don't yet check " +
        "whether the site has changed hands, so some of this history may belong to a previous owner.",
      source: null,
      kind: "caveat",
    });
  }
  // OBSERVATION — the registration date is DEMOTED, not deleted (18.3 §3.4.1).
  // It used to publish as a positive finding ("Registered ~30 years ago"), which
  // offered a true fact as evidence for a claim it does not support: the live
  // over-vouching defect of §3.4.5. It is still published — as a neutral, dated,
  // sourced fact, in the channel that carries no favourable framing, with the
  // inference it invites explicitly denied. Scoped to the same domains the old
  // positive finding covered (a year or more), so no report gains a note it
  // would not already have carried a claim on.
  if (ageChecked && reg?.valueNum != null && ageDays != null && ageDays >= 365) {
    caveats.push({
      text:
        `Domain registered ${isoDay(reg.valueNum)}. A registration date records when the domain name ` +
        "was first registered, not when its current operator began using it.",
      source: reg.source ?? null,
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
  //
  // Reputation was REMOVED from this conjunction (Stage 2). Trustpilot presence
  // is the weakest available evidence of footprint — most legitimate businesses
  // have no Trustpilot page, so its absence says almost nothing about whether a
  // domain is established — and it is the least reliable check we run, since
  // Trustpilot routinely blocks scrapers. Gating Blue on it made the modal
  // verdict for the modal query unreachable whenever that block occurred: a
  // correct rule turned into an outage. Blue's evidence is domain age and
  // archive depth. The check still runs and still publishes; it no longer gates.
  const young = ageChecked && ageDays != null && ageDays < YOUNG_DOMAIN_DAYS;
  const thinArchive = archiveChecked && snapshots != null && snapshots < THIN_SNAPSHOT_COUNT;
  if (young && thinArchive) {
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
  // 18.3 §3.4 found all three former routes unsound and replaced them with ONE:
  // how far back the archive record reaches. The two demoted routes are not
  // disjuncts any more — registration age establishes nothing (§3.4.1) and the
  // certificate record cannot span the window (§3.4.4).
  //
  // What is NOT built here, deliberately: CONTINUITY (captures across most of
  // the intervening years) and OPERATOR continuity. Both are post-MVP; the gap
  // they leave is disclosed in the caveat above rather than papered over. Span
  // alone is the available fix, not the correct one.
  const established = longArchiveSpan;

  // Q6 (18.3 §3.3): Green requires SPF. A MISSING DMARC no longer blocks Green —
  // finding F2 measured ~24% of established organisations without one, so the old
  // both-required gate denied Green for adoption lag rather than risk. DMARC
  // absence is disclosed as an OBSERVATION caveat below.
  //
  // A check that did NOT complete also fails this condition, per Story 18 §3.5:
  // Green requires positive evidence, and a check that produced no evidence
  // cannot contribute to a conjunction that requires it. That is not the gap
  // pushing toward concern (it raises none) — it is the gap failing to push
  // toward Green. An earlier draft of this stage had a failed lookup NOT deny
  // Green, which conflated "missing data must not create a concern" (true) with
  // "missing data must not block Green" (inverts the rule).
  const spfEstablished = spfChecked && spf;
  const clean = spfEstablished && concerns.length === 0;
  if (established && clean) {
    const reasons: Reason[] = [];
    // THE FACT, NOT THE INFERENCE (§3.4.5 / Part 4). "Archived since 2009" is
    // true of a recycled domain; "operating since 2009" is not, and we are not
    // entitled to it until operator continuity exists. The copy states what the
    // archive records and stops there.
    reasons.push({
      text:
        `Archived since ${isoDay(firstArchivedSec!).slice(0, 4)} — the Wayback Machine's record for this ` +
        `domain spans ~${humanAge(archiveSpanDays!)}.`,
      source: firstArchived?.source ?? null,
    });
    // CORROBORATING, never a route of its own (§3.4.4). Capped: a pre-2018 first
    // cert is a floor, not a start date, and the copy says which it is.
    if (certChecked && firstCert?.valueNum != null) {
      const floorOnly = certAgeIsFloorOnly(firstCert.valueNum);
      reasons.push({
        text:
          `TLS certificates logged for this domain for ${certAgeClaim(firstCert.valueNum, nowSec)}` +
          (floorOnly
            ? ` (Certificate Transparency logging only became comprehensive in ${CT_INTERPRETABLE_FROM_ISO.slice(0, 4)}, so this is a floor, not a start date).`
            : "."),
        source: firstCert.source ?? null,
      });
    }
    if (spf) {
      reasons.push({ text: "Email authentication configured (SPF present).", source: byKey.get("dns_spf")?.source ?? null });
    }
    // OBSERVATION caveat: the check completed and found no DMARC. Disclosed
    // neutrally with its source, never flagged as a concern.
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
  // The claim here is about ARCHIVED HISTORY, so it is cited to the archive —
  // citing it to RDAP was the §3.4.5 defect in its quietest form: registration
  // offered as the source for a statement about establishment. Three cases,
  // because "the record doesn't reach far enough" and "we couldn't read the
  // record" are different statements and only one of them is sourceable
  // (docs/conventions.md). The third is the case 18.3 §3.2 says should become a
  // no-verdict outcome; that story is not built, so it degrades to Amber with the
  // gap disclosed rather than to a claim we cannot cite.
  const archiveSource = firstArchived?.source ?? byKey.get("wayback_snapshot_count")?.source ?? null;
  const fallbackText = established
    ? "Established archive history, but some expected signals (e.g. SPF) are missing."
    : "Some positive signals, but the archived record doesn't reach back far enough to fully vouch yet.";
  // THIRD CASE — the archive check did not complete. There is nothing to cite,
  // and the SYMMETRY RULE says an unsourced reason neither publishes nor counts,
  // so no reason is manufactured: the "not available at check time" disclosure
  // above already states the gap, in the channel built for it. This is the shape
  // 18.3 §3.2 says should become a no-verdict outcome; until that story exists it
  // degrades to Amber-with-a-disclosure rather than to an uncitable claim.
  if (!checked("wayback_first") || archiveSource == null) return verdict("amber", []);
  return verdict("amber", [{ text: fallbackText, source: archiveSource }]);
}
