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
    domain: null, tier: 1, slot: 8, expected_state: "blue",
    probe: "throwaway Blue — days-old, zero footprint",
    provenance: "OWNER-SUPPLIED, PENDING: a fresh Porkbun domain under the owner's control (test-domains.md Slot 8). Not committed here.",
  },
  {
    domain: null, tier: 1, slot: 9, expected_state: "blue",
    probe: "very-recent public launch (days old)",
    provenance:
      "UNRESOLVED (18.2): no days-old public launch qualified from the candidate pool; the youngest real registration observed is bolt.new (~2.1y). A genuine days-old Blue needs the Slot 8 throwaway or a fresh capture at test time.",
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
