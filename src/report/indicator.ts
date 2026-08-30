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
  /**
   * ROUTING label, not a semantic one.
   *   "caveat"   transparency notes (a feed we couldn't reach, a neutral
   *              observation) — route to the report SUMMARY, never to
   *              positive[]/flagged[].
   *   "residual" Amber's generous default. NOT a finding: it says what WE could
   *              not establish, and it fires only when `concerns.length === 0`.
   *              It used to render under a "Flagged" badge and be counted in
   *              "N worth a closer look" — the same defect as Blue's reasons
   *              rendering as concerns (§6.4), one state over. It routes to the
   *              summary and is never counted.
   *   default    a positive/contributing reason.
   */
  kind?: "positive" | "caveat" | "residual";
}
export interface Indicator {
  state: IndicatorState;
  reasons: Reason[];
}

/* ============================================================================
   RUBRIC THRESHOLDS — single source of truth. Calibrated in Story 19 Stage 3.

   EVERY threshold is a NAMED constant. Stage 1 found the accumulation threshold
   living as a bare `2` inside an `if`; Stage 3's own inventory found a second
   one (the registration-note age) that Stage 3a had introduced the week before.
   A number inside a condition is a rule nobody can find.

   EVERY constant carries a BASIS, per 18.3 §5.2. The methodology page publishes
   these, and claiming a corpus calibrated a judgment call would be L-01 pointed
   at our own method — asserting more than we checked, about ourselves. It is
   also checkable: the corpus is in the repo.

     MEASURED     the data can move it; more data gives a better answer
     BOUNDED      the data constrains the value to a RANGE but cannot locate it
                  within that range. The bound is measured; the point inside it
                  is chosen. Every measured threshold sits in a gap — what
                  matters is the gap's WIDTH. More data buys a narrower
                  interval, not a better point.
     REASONED     a judgment the data informs but cannot settle
     DEFINITIONAL a choice about the product's posture, not a measurement

   ALL VALUES ARE PROVISIONAL FOR MVP. They are set to be defensible and
   documented, not optimal, and will be revised against real traffic — which
   will teach us more than another corpus pass would.
   ========================================================================== */

/**
 * BASIS: DEFINITIONAL. How much history we require before we will assess a
 * domain at all. Fitting this to a 50-domain sample would let the sample decide
 * our caution (§5.2).
 *
 * DEFENCE: six months is the point at which we would rather say "too new to
 * tell" than reach a verdict we would not stand behind.
 *
 * DECIDED BY THE OWNER, 2026-08-26 — confirmed at 180 after seeing the three-way
 * comparison, so this is a posture that was chosen rather than a draft that was
 * never revisited. It never touches Green (30 domains at 90, 180 and 365 alike);
 * it moves domains only between Blue and Amber. Tightening to 90 would have put
 * `vostride.com` — five months old, three captures — under "Some concerns" with
 * the generous-default rationale, which is insufficiency dressed as concern:
 * §6.4's Blue-relabel defect returning through a threshold instead of the CSS.
 */
export const YOUNG_DOMAIN_DAYS = 180;

/**
 * BASIS: REASONED, with a measured lower bound. Capture count is a popularity
 * proxy (§3.4.3), sound only in conjunction with `young`.
 *
 * DEFENCE: every young domain in the corpus has three captures or fewer, so the
 * boundary lies at four or above; five leaves a capture of margin. The corpus
 * cannot fix an upper bound — any value ≥ 4 produces identical verdicts across
 * all 49 — so the choice of five over forty is meaning, not measurement.
 *
 * KNOWN LIMIT (Stage 3): §5.2 rescues this constant by arguing that "a young
 * domain has had no time to accumulate captures regardless of popularity."
 * That argument is FALSIFIABLE AT THE MARGIN and the corpus does not exercise
 * it: `bolt.new` accumulated 449 daily-collapsed captures in 764 days — 0.59 a
 * day — at which rate a domain clears five captures in nine days. A hyped
 * launch would therefore miss Blue and land in Amber, which implies concern.
 * Same defect class as §3.4.3, one state over. The fix is a span test rather
 * than a count test, which is a RULE change, not a calibration outcome.
 */
export const THIN_SNAPSHOT_COUNT = 5;

// Stage 1 Part B found ONE constant doing three unrelated jobs, so retuning it for
// Green silently retuned pivot eligibility. Split; the survivors keep the same
// value today, which is exactly why the coupling was invisible.
/**
 * BASIS: REASONED (§5.2, classified post-Stage-3a). NOT calibrated in Stage 3.
 *
 * This survived the §3.4 demotion that retired `ESTABLISHED_DOMAIN_DAYS`, and
 * the reason is worth keeping next to the value: the two ask OPPOSITE questions
 * of the same field. `ESTABLISHED_DOMAIN_DAYS` used registration age as a LOWER
 * bound on operating history — "old, therefore established" — which §3.4.1
 * rules invalid. This asks whether the domain is old enough that recent AI
 * language is notable: if registration was fifteen years ago then whoever holds
 * it now, the DOMAIN predates the AI era. An UPPER-bound use, and sound.
 * Same field, same value, opposite validity.
 */
export const PIVOT_ESTABLISHED_DAYS = 365 * 3;

/**
 * BASIS: REASONED. The corpus shows WHEN companies added AI language (24 usable
 * onsets, median 2.1 years), not WHEN a pivot becomes worth flagging. Different
 * questions; the first does not imply the second (§5.2).
 *
 * DEFENCE: one year is the window inside which adding AI language is recent
 * enough to be worth remarking on for a domain that predates the AI era.
 *
 * KNOWN LIMIT (Stage 3) — THE WINDOW IS NOT THE PROBLEM. At this value the
 * pivot fires for exactly two corpus domains, `eff.org` and `bun.sh`, and both
 * are false positives: the scan matches any MENTION of AI, so a civil-liberties
 * organisation publishing about AI reads identically to a company pivoting to
 * it. No value of this constant fixes that — `eff.org`'s onset is two days old,
 * so tightening cannot exclude it, and loosening to three years pulls in eight
 * more including `cloudflare.com` and `cursor.com`. The lever is substantiation
 * (§2.4), which is unbuilt. Recorded rather than tuned around.
 *
 * OWNER RULING, 2026-08-26: leave the default as-is. The two false Ambers ship
 * knowingly, on the reasoning that no available value improves them and the
 * real fix is substantiation. Do NOT tighten this constant as a proxy for that
 * fix — tightening trades a measured false-positive rate for an unmeasured
 * false-negative one, and buys nothing in either direction.
 */
export const PIVOT_RECENT_DAYS = 365;

/**
 * BASIS: DEFINITIONAL. Minimum domain age at which the registration date is
 * worth remarking on at all.
 *
 * NAMED IN STAGE 3, and it is the defect Stage 1 already fixed once: Stage 3a
 * introduced this as a bare `365` inside an `if`, gating which reports publish
 * the registration-date observation. Smaller than accumulation's bare `2` — it
 * governs what publishes, not which verdict fires — but the same class, and
 * "smaller instance of a defect we already fixed" is exactly what comes back.
 *
 * It is deliberately its OWN constant rather than a reuse of a threshold it
 * happens to coincide with: this is a judgment about when a date is remarkable,
 * not a claim about establishment or pivot salience.
 *
 * DEFENCE: below a year the registration date says nothing the young-domain
 * rule has not already said better.
 */
export const REGISTRATION_NOTE_MIN_AGE_DAYS = 365;

// ---- ESTABLISHMENT (18.3 §3.4) — SPAN, not count, not registration age. ----
/**
 * How far back the archive record must reach for a domain to count as
 * established. A SPAN is a time measure; the retired capture count was a measure
 * of crawler attention (§3.4.3) — `bolt.new` is ~2 years old with 449 captures.
 *
 * BASIS: BOUNDED (§5.2). Taken from `wayback_first`, which the corpus carries
 * for all 42 domains whose Wayback check completed — but the corpus fixes the
 * INTERVAL and not the point, which is what BOUNDED names and why "Measured"
 * would have overclaimed on a label the methodology page publishes.
 *
 * This is a NECESSITY claim — how little span is too little to establish
 * anything — and is NOT the decade rule, which is a SUFFICIENCY claim about
 * when further span stops adding anything (§3.4.6). Setting one says nothing
 * about the other.
 *
 * WHAT THE DISTRIBUTION SHOWS. Sorted, the corpus has one real gap in the
 * informative range: `bolt.new` at 717 days, then nothing until `v0.dev` at
 * 1075 — a 358-day void. Every value in [718, 1075] produces IDENTICAL output
 * across all 49 domains, so **the corpus measures the interval and cannot
 * discriminate the point inside it.** 913 sits mid-gap: 196 days clear of the
 * highest non-establishing domain, 162 clear of the lowest establishing one.
 *
 * Note the interval ENDS at 1075, not at the old 1095: `v0.dev` is established
 * at 913 and was not at 1095. Its VERDICT does not move — it is Amber either
 * way, on a concern (no SPF or DMARC) rather than on establishment — but its
 * published caveats do. A delta that reported only state changes would have
 * shown nothing here.
 *
 * DEFENCE: two and a half years, placed at the centre of the only real gap the
 * corpus shows, so the nearest domain on either side is ~half a year away.
 *
 * The retired draft was 1095 — deliberately the old `ESTABLISHED_DOMAIN_DAYS`
 * value, so Stage 3a's delta was attributable to the measure rather than the
 * threshold. It also sat 20 days from `v0.dev`, which is the worst place to
 * leave a threshold: fragile to a fortnight of archiving.
 *
 * CANNOT BE READ ABOVE ~6 YEARS. The corpus holds nothing between `hex.tech`
 * (6.0y) and `secondlibrary.com` (12.7y, and a re-registration — §3.4.8). That
 * void is corpus construction, not population structure, and no threshold in it
 * would be measured.
 */
export const ESTABLISHED_ARCHIVE_SPAN_DAYS = 913; // ~2.5 years

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
// BASIS: none — this is a FACT ABOUT THE INSTRUMENT, not a threshold. Stage 3
// sets no certificate constant, and the certificate gap persists: zero of 49
// corpus domains carry certificate data (§5.3), so nothing here has ever run
// against a real certificate. crt.sh re-checked 2026-08-26: still HTTP 502.
export const CT_INTERPRETABLE_FROM_ISO = "2018-04-30";
const CT_INTERPRETABLE_FROM_SEC = Math.floor(Date.parse(`${CT_INTERPRETABLE_FROM_ISO}T00:00:00Z`) / 1000);
/**
 * Ceiling on any cert-derived age claim, in years. Sourced to the owner's decade
 * rule (§3.4.6) — beyond a decade further precision adds nothing — NOT a draft
 * calibration value.
 */
// BASIS: none — the owner's decade rule (§3.4.6), not a calibration output.
export const CERT_AGE_CAP_YEARS = 10;

// ---- Q3: accumulation as a RATIO of findings to COMPLETED observations. ----
// All three are REASONED, SYNTHETIC-ONLY (§5.2): the corpus contains zero real
// triggering cases — its maximum is ONE concern on any domain — so these are set
// against the Story 18.2 synthetic fixtures, whose ratios run 0.25 to 0.58.
// They must be re-validated the first time a real accumulation case appears.
/**
 * BASIS: REASONED, synthetic-only.
 *
 * DEFENCE: a tenth keeps the trigger DEGRADATION-INVARIANT. The corpus's real
 * denominators are 8, 9, 11 and 12 completed checks; two findings clear a tenth
 * at every one of them, so a report that lost checks reaches the same verdict as
 * a complete one. Above 2/12 = 0.167 that stops being true — two findings would
 * fire at 8 checks and not at 12, making the verdict depend on how many lookups
 * happened to succeed, which is §1.3's determinism problem returning through the
 * denominator. A tenth sits below that boundary with headroom for the signal set
 * to grow to twenty checks before the ratio starts binding.
 *
 * The ratio is therefore INERT TODAY and deliberately so: with a two-member
 * concern pool `ACCUMULATION_MIN_FINDINGS` carries the rule, and the ratio is
 * what stops a fixed count silently loosening as signals are added (§3.1).
 */
export const ACCUMULATION_RATIO = 0.1;
/**
 * BASIS: REASONED, synthetic-only — corroborated by the corpus.
 *
 * DEFENCE: eight is the smallest denominator the corpus actually produces, and
 * the one the degraded fixture models; below it there are too few observations
 * for a proportion to mean anything.
 */
export const ACCUMULATION_MIN_CHECKS = 8;
/**
 * BASIS: REASONED — arguably definitional; two is what the word means.
 *
 * DEFENCE: "accumulation" means more than one thing, so the numerator needs its
 * own floor. A pure ratio cannot express plurality: any threshold low enough for
 * 2 findings at a realistic denominator (2/20 = 0.10) is also low enough for ONE
 * at a smaller one (1/10 = 0.10) — measured, not hypothesised, at ratio 0.1
 * alone seven corpus domains went Red on a single concern.
 */
export const ACCUMULATION_MIN_FINDINGS = 2;
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
  if (ageChecked && reg?.valueNum != null && ageDays != null && ageDays >= REGISTRATION_NOTE_MIN_AGE_DAYS) {
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

  // ---- The AI pivot: an OBSERVATION, not a concern (owner ruling, 2026-08-26).
  //
  // RULE CHANGE, 18.3 §2.7. The pivot no longer contributes a concern point, no
  // longer denies Green, and no longer publishes under an adverse heading. It is
  // still collected in full and still published — the dates, the language change
  // and the Wayback links all reach the reader. What stops is US ATTACHING A
  // CONCLUSION. That is the disclosed-facts posture: hand over the facts, let the
  // reader infer.
  //
  // WHY, and the durable argument is NOT the precision number. Corpus tier 1
  // slot 6 — `sugarcrm.com` — was hand-picked as THE classic pivot exemplar:
  // established domain, datable AI onset. Its onset is 1,945 days. It does not
  // fire at 365 or at 1095, and making it fire needs a ~5.3-year window that
  // flags ~14 of 49 domains — at which point SugarCRM, a twenty-year-old CRM
  // that added AI features in 2021, is arguably a false positive too. THE
  // CORPUS'S OWN DESIGNATED POSITIVE EXAMPLE IS AMBIGUOUS AT EVERY THRESHOLD.
  // That is a statement about the instrument and does not rest on n=2.
  //
  // The underlying problem: this signal cannot separate "added AI features" —
  // which nearly every software company did — from "pivoted to AI," a company
  // repositioning around a capability it did not have. In Wayback text those are
  // identical. Substantiation (§2.4) is what distinguishes them.
  //
  // NOT EVIDENCE, and do not re-derive it: "no true positive at any window."
  // The corpus contains no true positives BY CONSTRUCTION — the Story 18.2 brief
  // forbade adverse pre-labelling of real companies and forbade committing a
  // URLhaus host. That absence measures our sampling rule, not this signal's
  // recall.
  //
  // CONSISTENCY. In the same week we removed a rationale that was true-but-
  // wrong-in-implication when it FLATTERED a company (`cursor.com`'s "registered
  // ~30 years ago", §3.4.5). This is the same shape pointed the other way: a true
  // fact, a wrong implication, published as our sole reason, about named real
  // organisations. Removing it in one direction and keeping it in the other is
  // not a defensible position.
  //
  // WHAT REVERSES THIS: SUBSTANTIATION SHIPPING (§2.4). NOT a better window
  // value. Tightening reduces false positives by firing less, which looks like
  // improvement and is the signal doing less. `PIVOT_RECENT_DAYS` stays at 365
  // and stays REASONED; do not retune it while it drives no verdict — a value
  // tuned against no active use will look calibrated and will not be.
  //
  // THE COST, accepted explicitly rather than slid into: this is a TEMPORARY
  // DISABLEMENT OF THE PRODUCT'S HEADLINE FEATURE. It is a real narrowing of
  // what Born Yesterday currently does, and we cannot measure what we lose
  // because we have no true positives to lose. If substantiation slips, we ship
  // without the differentiator.
  const candidateConcerns: Reason[] = [];
  const pivot = derivations.pivot;
  // Gated on the AI-language check having completed: an unperformed scan must not
  // supply an observation either — it would be reporting a date we never read.
  if (
    pivot &&
    checked("ai_language_first_seen") &&
    pivot.domainAgeDays >= PIVOT_ESTABLISHED_DAYS &&
    pivot.aiOnsetAgoDays <= PIVOT_RECENT_DAYS
  ) {
    // OBSERVATION caveat (§3.2): the check completed and found something worth
    // noting that is not a concern. It describes the DOMAIN, so it must carry a
    // source — the §6.2 symmetry rule applies to observations exactly as it did
    // when this was a concern. An unsourced pivot publishes nothing, as before.
    // Cites the CAPTURE that matched. This used to take `sources[0]` — RDAP —
    // which evidenced the registration half of a sentence that no longer exists.
    if (pivot.source) {
      caveats.push({ text: pivot.text, source: pivot.source, kind: "caveat" });
    }
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
  // SYMMETRY RULE: an unsourced reason neither publishes NOR counts (18.3 §6.2).
  //
  // NOTE THE CONSEQUENCE OF THE PIVOT RULING ABOVE: the concern pool now has
  // exactly ONE member, so `concerns.length` can never reach
  // ACCUMULATION_MIN_FINDINGS. Accumulation is not "near-unreachable" any more
  // (§3.1) — it is STRICTLY unreachable until the pool grows. The rule and its
  // constants are retained deliberately: they are correct, they are calibrated,
  // and the Profile Section brief contemplates a dozen new scans. The
  // methodology page must state this plainly rather than describe a Red route
  // nobody can reach.
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
    // Carries the capture COUNT as trailing context so the assembler does not
    // have to publish a second, near-identical archive line beside this one
    // (§3.4.3: span leads, count follows). Span first, always — the count on its
    // own measures crawler attention.
    reasons.push({
      text:
        `Archived since ${isoDay(firstArchivedSec!).slice(0, 4)} — the Wayback Machine's record for this ` +
        `domain spans ~${humanAge(archiveSpanDays!)}` +
        (snapshots != null ? ` (${snapshots} capture${snapshots === 1 ? "" : "s"} recorded)` : "") +
        `.`,
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
  // ---- The residual. Reached only when NOTHING was flagged, so it says why the
  // domain fell short of Green rather than what is wrong with it.
  //
  // EACH SENTENCE IS CITED TO EVIDENCE FOR THE CLAIM IT MAKES, not to whatever
  // was nearby. The `established` branch previously read "Archived history is
  // established, but we couldn't confirm the email-authentication records we
  // look for" and cited WAYBACK — which evidences the clause that is not the
  // point of the sentence. The citation had travelled with the sentence rather
  // than with the claim, and the contrastive "but" composed two clauses into an
  // argument: the semicolon defect, written while fixing the semicolon.
  if (established) {
    // Established and not Green with no concerns ⟹ SPF is the reason (Q6/§3.5).
    // Two genuinely different situations hide here, and they need different
    // channels (§3.2):
    const spfSig = byKey.get("dns_spf");
    if (spfChecked && spfSig?.source) {
      // CHECKED AND ABSENT — a confirmed empty state is a FINDING (§1.1), it
      // describes the domain, and it cites the query we actually ran.
      return verdict("amber", [
        { text: "No SPF email-authentication record was found.", source: spfSig.source, kind: "residual" },
      ]);
    }
    // NOT CHECKED — a DISCLOSURE about our limits, not a finding about the
    // domain. The "email-authentication lookup did not complete" caveat above
    // already states it, in the channel built for it, and the symmetry rule
    // (§6.2) forbids manufacturing an unsourced reason to sit beside it.
    return verdict("amber", []);
  }
  // NOT ESTABLISHED. The claim is about archived history, so it cites the
  // archive. Where the archive check did not complete there is nothing to cite:
  // the "not available at check time" disclosure carries it instead. That is the
  // shape §3.2 says should become a no-verdict outcome; until that story exists
  // it degrades to Amber-with-a-disclosure rather than to an uncitable claim.
  const archiveSource = firstArchived?.source ?? byKey.get("wayback_snapshot_count")?.source ?? null;
  if (!checked("wayback_first") || archiveSource == null) return verdict("amber", []);
  return verdict("amber", [
    {
      text: "We couldn't establish enough archived history to vouch for this domain yet.",
      source: archiveSource,
      kind: "residual",
    },
  ]);
}
