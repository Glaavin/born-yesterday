/**
 * Story 18.2 — assemble docs/calibration/corpus.json from the raw collector
 * observations in docs/calibration/observations.ndjson (RDAP + DoH cheap pass;
 * patient Wayback pass). Curation (tier / probe / provenance / Tier-1 expected
 * state) lives in SELECTION below; every `observed` value is pulled verbatim
 * from the collector output — no hand-transcription, no verdict computed.
 *
 * `pnpm tsx scripts/build-corpus.ts`
 */
import { readFileSync, writeFileSync } from "node:fs";

type Obs = {
  domain: string;
  observed_at?: string;
  age?: unknown;
  dmarc?: unknown;
  spf?: unknown;
  mx?: unknown;
  hosting?: unknown;
  wayback?: unknown;
  ai_language_onset?: unknown;
  cert_history?: unknown;
  threat_listing?: unknown;
};

const OBSERVED_AT = "2026-08-13"; // date of the collector runs (stamped, not Date.now())

/** Tier-1 keeps expected states (pre-Story-18 smoke assignments). Tier 2/3 carry none. */
type Sel = {
  domain: string | null;
  tier: 1 | 2 | 3;
  slot?: number;
  /** Sub-group within a tier (e.g. "young-age coverage") — see tier2_composition. */
  cohort?: string;
  probe: string;
  provenance: string;
  expected_state?: string;
  notes?: string;
};

const SLOT6_NOTE =
  "Boundary probe, not a clear case — the ONE Tier-1 entry that functions as a boundary rather than an anchor. " +
  "Expected state is contingent on the Story 19 pivot-recency threshold (PIVOT_RECENT_DAYS): Story 18 §3.4 makes the " +
  "classic pivot a disjunctive Red trigger, but the threshold that decides whether THIS domain trips it does not exist " +
  "yet (Story 18 §5 defers it). A lone pivot with no other findings is exactly the guard against false Reds. The file's " +
  "pre-Story-18 assignment (Amber) is left in place as the smoke-test record but is superseded as an expectation.";

const SELECTION: Sel[] = [
  // ---- TIER 1 — smoke set (expected states retained from docs/test-domains.md) ----
  { domain: "stripe.com", tier: 1, slot: 1, probe: "Green anchor (established + clean)", provenance: "test-domains.md Slot 1 (named)", expected_state: "green" },
  { domain: "github.com", tier: 1, slot: 2, probe: "Green anchor", provenance: "test-domains.md Slot 2 (named)", expected_state: "green" },
  { domain: "wikipedia.org", tier: 1, slot: 3, probe: "Green anchor", provenance: "test-domains.md Slot 3 (named)", expected_state: "green" },
  { domain: "cloudflare.com", tier: 1, slot: 4, probe: "Green anchor", provenance: "test-domains.md Slot 4 (named)", expected_state: "green" },
  {
    domain: "masshist.org", tier: 1, slot: 5, expected_state: "amber",
    probe: "missing-DMARC — one hygiene concern on an otherwise-clean established org",
    provenance:
      "Slot 5 RESOLVED (18.2): ran org/nonprofit candidates; masshist.org observed no-DMARC + has-SPF, otherwise clean, established (~30y). Other observed no-DMARC-only established candidates kept in Tier 2: suckless.org, slackware.com, xfce.org.",
  },
  {
    domain: "sugarcrm.com", tier: 1, slot: 6, expected_state: "contingent (Story 19 PIVOT_RECENT_DAYS)",
    probe: "classic pivot — established domain + a datable AI-language onset (the guard against false Reds)",
    provenance:
      "Slot 6 RESOLVED (18.2): ran legacy-vendor candidates (sugarcrm.com, freshbooks.com, constantcontact.com). sugarcrm.com and constantcontact.com each show an AI-language onset (~2021) against a 15+yr domain; freshbooks.com showed none in sampled captures. Chose sugarcrm.com (onset 2021-04-25, term 'artificial intelligence'). Onset date is APPROXIMATE (earliest of 6 sampled captures).",
    notes: SLOT6_NOTE,
  },
  {
    domain: "bolt.new", tier: 1, slot: 7, expected_state: "amber",
    probe: "young-but-not-thin — young domain with a real footprint",
    provenance:
      "Slot 7 RESOLVED (18.2): bolt.new observed a 2.1y domain with 449 daily-collapsed Wayback captures beginning 2024-09 — too young for Green (unestablished), too much footprint for Blue (not thin).",
  },
  {
    domain: "txta.dev", tier: 1, slot: 8, expected_state: "blue",
    probe: "thin-footprint Blue — days-old, no archive, no reputation",
    provenance:
      "Slot 8 (18.2 follow-up): organic HN Show HN launch, ~1 day old at observation, no DMARC/SPF, no archive or reputation footprint — the thinnest real domain in the corpus.",
    notes:
      "The DURABLE Slot 8 answer is a METHODOLOGY, not a committed domain: when a guaranteed Blue is needed, register a fresh throwaway and run it (procedure in docs/test-domains.md). This entry is a dated observation of a real launch and WILL age out of Blue — re-source at test time rather than trusting the row.",
  },
  {
    domain: "writelikepg.com", tier: 1, slot: 9, expected_state: "blue",
    probe: "very-recent public launch (days old)",
    provenance:
      "Slot 9 RESOLVED (18.2 follow-up): organic HN Show HN launch, ~4d old at observation, email auth configured (DMARC+SPF) but no archive/reputation footprint yet — a genuine days-old real launch, the modal Born Yesterday query.",
  },
  {
    domain: null, tier: 1, slot: 10, expected_state: "red",
    probe: "live threat-feed listing → Red",
    provenance: "OPEN BY DESIGN: pull a current host from the URLhaus feed at test time (listings churn hourly). Never committed. Do not commit a URLhaus host.",
  },

  // ---- TIER 2 — boundary (no expected state) ----
  { domain: "neon.tech", tier: 2, probe: "Green/Amber edge — 3-4yr, clean, healthy archive (404 daily captures from 2022)", provenance: "candidate for the 3-4yr healthy-archive cluster; qualified by observed age + Wayback depth" },
  { domain: "val.town", tier: 2, probe: "Green/Amber edge — ~4yr, clean, moderate archive (318 captures)", provenance: "candidate for the 3-4yr cluster; qualified by observed signals" },
  { domain: "retool.com", tier: 2, probe: "§5 established-by-registration vs by-activity — domain reg ~28y, deep archive from 1999 (prior owner), product is 2017; clean", provenance: "surfaced by the cheap pass (old registration, recent product); the §5 open question made concrete" },
  { domain: "cursor.com", tier: 2, probe: "§5 same shape — domain reg ~30y, 777 captures from prior owners; product 2022. Wayback count conflates prior ownership (caveat for Story 19)", provenance: "surfaced by the cheap pass; second §5 exemplar" },
  { domain: "warp.dev", tier: 2, probe: "Green/Amber edge — 6y, clean; INTENDED thin-archive but OBSERVED healthy (660 captures from 2020). Kept as observed data, not fitted to intent", provenance: "candidate for the 5-7yr thin-archive cluster; observation did not match the intent — reported honestly" },
  { domain: "hex.tech", tier: 2, probe: "Green/Amber edge — 6.4y, clean, 369 captures from 2020", provenance: "candidate for the 5-7yr cluster; qualified by observed signals" },
  { domain: "suckless.org", tier: 2, probe: "Green/Amber edge — 8+yr (~20y), one hygiene gap (no DMARC), otherwise clean", provenance: "observed no-DMARC established domain" },
  { domain: "slackware.com", tier: 2, probe: "Green/Amber edge — 8+yr (~31y), one hygiene gap (no DMARC)", provenance: "observed no-DMARC established domain" },
  { domain: "xfce.org", tier: 2, probe: "Green/Amber edge — 8+yr (~28y), one hygiene gap (no DMARC)", provenance: "observed no-DMARC established domain" },
  { domain: "v0.dev", tier: 2, probe: "Blue/Amber edge — young (~3y) AND soft flags (no DMARC + no SPF); archive NOT thin (401 captures from 2023). The young+flags case Story 18 sends to Blue", provenance: "observed young domain carrying two hygiene flags" },
  { domain: "bun.sh", tier: 2, probe: "Blue/Amber edge — 5y, one hygiene gap (no DMARC)", provenance: "observed one-flag mid-age domain" },
  { domain: "gutenberg.org", tier: 2, probe: "accumulation edge — 2 concurrent hygiene flags (no DMARC + no SPF), established (~30y)", provenance: "observed 2-flag established domain" },
  { domain: "catb.org", tier: 2, probe: "accumulation edge — 2 concurrent hygiene flags, established (~24y)", provenance: "observed 2-flag established domain" },
  { domain: "ccc.de", tier: 2, probe: "accumulation edge — 2 concurrent hygiene flags (age unknown; .de RDAP gap)", provenance: "observed 2-flag domain; ccTLD age unavailable" },
  { domain: "perplexity.ai", tier: 2, probe: "Blue/Amber edge — ~4yr, clean, no email-auth gaps; archive not collected (not in patient set)", provenance: "candidate for the young-clean cluster" },
  { domain: "turso.tech", tier: 2, probe: "Green/Amber edge — ~3.6yr, clean; archive not collected", provenance: "candidate for the 3-4yr cluster" },
  {
    domain: "constantcontact.com", tier: 2,
    probe: "classic pivot (2nd exemplar) — established domain (Wayback from 1999) + AI-language onset ~2021-01-12 ('A.I.'); complements Slot 6 sugarcrm.com so the highest-stakes calibration case is not a single example",
    provenance: "pivot candidate scanned in 18.2; added as a second real pivot per owner",
  },

  // ---- TIER 2 — YOUNG-AGE COVERAGE cohort (18.2 follow-up) ----
  // Added as a COHORT to cover the sub-2-year range the first pass missed entirely,
  // not individually vetted the way the 17 original boundary probes were. They do
  // probe real boundaries (Blue/Amber-youth, young-Green, the sub-2y age bands), but
  // the distinction is preserved deliberately — see tier2_composition.
  // Wayback intentionally SKIPPED (young ⇒ thin by definition; snapshot_count is
  // recorded not_collected, never inferred zero). All are organic launches.
  { domain: "picklebrowser.com", tier: 2, cohort: "young-age coverage", probe: "young <3mo (~23d) organic launch, CLEAN (DMARC+SPF) — the young-Green vs Blue edge", provenance: "organic HN Show HN launch" },
  { domain: "ojcp.dev", tier: 2, cohort: "young-age coverage", probe: "young 3-12mo (~0.5y) organic launch + 2 hygiene flags (no DMARC/SPF)", provenance: "organic HN Show HN launch" },
  { domain: "lifesprites.com", tier: 2, cohort: "young-age coverage", probe: "young 3-12mo (~0.8y) organic launch, CLEAN", provenance: "organic HN Show HN launch" },
  { domain: "crewscore.ai", tier: 2, cohort: "young-age coverage", probe: "young 3-12mo (~124d) organic launch + 2 hygiene flags", provenance: "organic HN Show HN launch" },
  { domain: "vostride.com", tier: 2, cohort: "young-age coverage", probe: "young 3-12mo (~157d) organic launch, CLEAN", provenance: "organic HN Show HN launch" },
  {
    domain: "secondlibrary.com", tier: 2,
    probe:
      "Green/Amber establishment edge — the LOW end of the 2-5y band: ~2.8y with clean hygiene, so the question is purely 'is this old enough to be established?' with no hygiene confound",
    provenance:
      "Qualified on observed signals: RDAP registration 2023-10-29 (~2.8y / 1030d), DMARC and SPF both present, MX present — no hygiene gaps. That makes it the YOUNGEST CLEAN domain in the corpus's 2-5y establishment band (vs turso.tech ~3.6y, val.town ~4.1y, perplexity.ai ~4.1y, neon.tech ~4.4y), so it probes the lower boundary of where 'established' may begin — the §5 question Story 19 must answer. Archive depth NOT collected, so its establishment-by-activity is untested and this entry speaks only to the age/hygiene axis.",
  },
  { domain: "hellodeck.ai", tier: 2, cohort: "young-age coverage", probe: "12-24mo (~390d) organic launch, CLEAN — the young-Green boundary (old enough to begin establishing?)", provenance: "organic HN Show HN launch" },
  { domain: "brickroad.network", tier: 2, cohort: "young-age coverage", probe: "12-24mo (~415d) organic launch, CLEAN", provenance: "organic HN Show HN launch" },
  { domain: "talkform.org", tier: 2, cohort: "young-age coverage", probe: "12-24mo (~609d) organic launch, CLEAN", provenance: "organic HN Show HN launch" },

  // ---- TIER 3 — volume (no expected state; variety in sector / geography / age) ----
  { domain: "sae.org", tier: 3, probe: "US professional/trade association", provenance: "modal-report variety" },
  { domain: "eff.org", tier: 3, probe: "US digital-rights nonprofit", provenance: "modal-report variety" },
  { domain: "laquadrature.net", tier: 3, probe: "FR digital-rights nonprofit", provenance: "geography variety (France)" },
  { domain: "wheatsville.coop", tier: 3, probe: "US regional food co-op", provenance: "sector variety (co-op)" },
  { domain: "kexp.org", tier: 3, probe: "US regional public radio", provenance: "sector variety (cultural)" },
  { domain: "nybg.org", tier: 3, probe: "US cultural institution (botanical garden)", provenance: "sector variety" },
  { domain: "citizensadvice.org.uk", tier: 3, probe: "UK charity", provenance: "geography variety (UK)" },
  { domain: "zerodha.com", tier: 3, probe: "India fintech", provenance: "geography variety (India)" },
  { domain: "tuta.com", tier: 3, probe: "DE privacy email", provenance: "geography variety (Germany)" },
  { domain: "sonic.net", tier: 3, probe: "US regional ISP", provenance: "sector variety" },
  { domain: "gnome.org", tier: 3, probe: "international open-source project", provenance: "sector variety (OSS)" },
  { domain: "bethpagefcu.com", tier: 3, probe: "US regional credit union", provenance: "sector variety (finance)" },
  { domain: "kenyon.edu", tier: 3, probe: "US small liberal-arts college (age unknown — .edu RDAP gap)", provenance: "sector variety (education)" },
  { domain: "lwn.net", tier: 3, probe: "niche tech publication", provenance: "sector variety (media)" },
];

function loadObs(): Map<string, Obs> {
  const lines = readFileSync("docs/calibration/observations.ndjson", "utf8").trim().split("\n");
  const m = new Map<string, Obs>();
  for (const l of lines) {
    const o = JSON.parse(l) as Obs;
    m.set(o.domain, o);
  }
  return m;
}

function observedBlock(o: Obs | undefined) {
  if (!o) return null;
  return {
    domain_age: o.age,
    dmarc: o.dmarc,
    spf: o.spf,
    mx: o.mx,
    hosting: o.hosting,
    wayback: o.wayback ?? { status: "not_collected", reason: "not in patient Wayback set" },
    ai_language_onset: o.ai_language_onset ?? { status: "not_collected", reason: "AI-onset scan run only for pivot candidates" },
    cert_history: o.cert_history ?? { status: "not_collected", reason: "crt.sh returning 5xx during 18.2; skipped by design" },
    threat_listing: o.threat_listing ?? { status: "not_collected", reason: "not queried during corpus build" },
  };
}

function main() {
  const obs = loadObs();
  const entries = SELECTION.map((s) => {
    const o = s.domain ? obs.get(s.domain) : undefined;
    const entry: Record<string, unknown> = {
      domain: s.domain,
      tier: s.tier,
      ...(s.slot ? { slot: s.slot } : {}),
      ...(s.cohort ? { cohort: s.cohort } : {}),
      probe: s.probe,
      provenance: s.provenance,
      observed_at: o ? o.observed_at ?? OBSERVED_AT : null,
      observed: observedBlock(o),
    };
    if (s.expected_state) entry.expected_state = s.expected_state; // Tier 1 only
    if (s.notes) entry.notes = s.notes;
    return entry;
  });

  // sanity: every non-open Tier-1/2/3 domain must have observations
  const missing = SELECTION.filter((s) => s.domain && !obs.get(s.domain)).map((s) => s.domain);

  const doc = {
    document: "docs/calibration/corpus.json",
    purpose:
      "Calibration corpus for Story 19 indicator-threshold tuning (and the later Profile-Section capture spike). Raw observed signals only — NO indicator was run and NO verdict/state is recorded, except Tier 1 which retains the pre-Story-18 smoke-test expected states from docs/test-domains.md.",
    generated_by: "scripts/build-corpus.ts from docs/calibration/observations.ndjson",
    story: "18.2",
    observed_window: OBSERVED_AT,
    collection_notes: {
      collectors_used: "domain-identity (RDAP/WHOIS) + DNS (DoH) for all; patient Wayback (CDX + sampled AI-onset) for a targeted subset",
      not_collected: {
        cert_history: "crt.sh returned 5xx (502/503) throughout the run — a source outage, not a per-domain finding. Backfill in Story 19 when crt.sh recovers.",
        threat_listing: "not queried; these are legitimate domains and asserting 'not listed' without a check would be an unsourced claim. Slot 10 pulls a live URLhaus host at test time.",
        wayback: "collected only for the archive-depth cluster + pivot candidates (~11 domains); ~38s/request from this environment made a full-corpus pass impractical.",
      },
      honesty: "Every signal carries an explicit status. A null/absent value under status:collected is an observed negative (e.g. SPF/DMARC absent); status:not_collected is an explicit gap, never an implied finding.",
    },
    tier2_composition: {
      note:
        "Tier 2 has two groups, and the distinction is deliberate. The ORIGINAL boundary probes were each selected and vetted individually — chosen because that specific domain's outcome is uncertain at a named boundary. The 'young-age coverage' cohort (cohort: \"young-age coverage\") was added as a GROUP in the 18.2 follow-up to cover the sub-2-year range the first pass missed entirely; those entries do probe real boundaries (Blue/Amber-youth, young-Green, the sub-2y age bands), but they were sourced as a block rather than vetted one at a time. Story 19 should weight the individually-vetted probes accordingly.",
      individually_vetted: "entries with no `cohort` field",
      added_as_cohort: "entries with cohort: \"young-age coverage\"",
    },
    findings: [
      {
        id: "F1-archive-continuity",
        title: "Registration age poorly separates establishment; archive CONTINUITY is the real discriminator",
        for: "Story 19 — Green's positive-establishment conjunction (§5)",
        finding:
          "Registration age is a weak proxy for 'established.' Young products routinely sit on OLD domains bought on the aftermarket: retool.com (~28y domain, deep Wayback from 1999, product 2017) and cursor.com (~30y domain, 777 captures from PRIOR OWNERS, product 2022) are ancient domains whose deep archives belong to previous owners. An age-driven rubric would read these as long-established when the current operator is recent — a real failure mode for the indicator.",
        recommendation:
          "Green's positive-establishment condition should consider an archive-CONTINUITY test (continuous archive activity / content lineage under the CURRENT operator) rather than leaning on registration date or raw Wayback count. Wayback snapshot COUNT conflates prior ownership and must not stand alone as an establishment signal.",
        corpus_domains_exhibiting: ["retool.com", "cursor.com"],
        also_relevant:
          "The same pattern recurs whenever an old aftermarket domain is re-used by a new operator: a long registration and a deep Wayback history that predate the current site.",
      },
      {
        id: "F2-hygiene-rarity",
        title:
          "A lone email-auth gap is a candidate for NOT being a standalone concern at all; and accumulation-Red cannot fire on hygiene alone",
        for:
          "Story 19 — (a) the mvp-spec draft rule 'missing SPF/DMARC → +1 concern point', (b) the accumulation trigger threshold + denominator (§3.4/§5)",
        finding:
          "Missing email auth is COMMON among reputable, established organizations: ~24% of the corpus lacks DMARC and ~11% lacks SPF, including long-established institutions with no other findings (e.g. multi-decade nonprofits and OSS projects). A rule that scores a lone missing SPF/DMARC as a concern point therefore measures EMAIL-AUTH ADOPTION LAG, not risk — it would flag a large slice of ordinary, legitimate organizations. Separately, 3+ concurrent hygiene gaps did not occur AT ALL among established domains (maximum observed = 2), and flag-stacking correlates with YOUTH (young/placeholder sites) rather than with established bad actors.",
        recommendation:
          "(a) Story 19 must TEST whether a lone email-auth gap belongs in the rubric at all, rather than assuming the draft 'missing SPF/DMARC → +1 concern' rule survives. On this evidence it is a candidate for being REMOVED as a standalone concern and treated as meaningful only in combination with non-hygiene signals. (b) Because 3+ hygiene gaps do not occur in established domains and stacking tracks youth, the accumulation-Red trigger CANNOT fire on hygiene alone: its threshold must require non-hygiene signals to be meaningful, or it will either never fire on an established domain or fire only on young sites that Story 18 §3.3 already routes to Blue. Calibrate the threshold against synthetic-accumulation.json and re-validate on real domains as they appear.",
        corpus_domains_exhibiting: ["gutenberg.org", "catb.org", "ccc.de", "v0.dev"],
        established_domains_lacking_dmarc_with_no_other_findings: [
          "masshist.org",
          "suckless.org",
          "slackware.com",
          "xfce.org",
        ],
      },
      {
        id: "F3-age-skew",
        title: "The reachable universe of 'known' domains skews old; young data needed deliberate sourcing",
        for: "Story 19 — Blue thresholds and domain-age bands",
        finding:
          "Findable-by-reputation correlates with established. The first corpus pass (reputable + varied) produced ZERO sub-2-year registrations (median ~25y). Sub-2-year coverage required deliberate sourcing: organic HN Show HN launches qualified by RDAP age, plus one owner-controlled placeholder at Slot 8 (parked; thin by construction). Provenance labels the two so calibration does not conflate a parked placeholder with an organic launch.",
        recommendation:
          "Read Blue and young-age-band thresholds as calibrated against a deliberately-sourced young set (not an organic sample). Weight the organic HN launches over the single owner placeholder (Slot 8) when tuning the young-Green / Blue boundary.",
      },
    ],
    counts: {
      total: entries.length,
      tier1: entries.filter((e) => e.tier === 1).length,
      tier2: entries.filter((e) => e.tier === 2).length,
      tier3: entries.filter((e) => e.tier === 3).length,
      open_slots: entries.filter((e) => e.tier === 1 && e.domain === null).length,
    },
    entries,
  };

  writeFileSync("docs/calibration/corpus.json", JSON.stringify(doc, null, 2) + "\n");
  console.log(`corpus.json: ${entries.length} entries (T1=${doc.counts.tier1} T2=${doc.counts.tier2} T3=${doc.counts.tier3}, open=${doc.counts.open_slots})`);
  if (missing.length) console.error("⚠ selected domains missing observations:", missing.join(", "));
}

main();
