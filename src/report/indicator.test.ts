import { describe, it, expect } from "vitest";
import type { CollectorResult, Signal, SignalSource } from "../signals/types";
import { derive, type Derivations } from "./derive";
import { computeIndicator, PIVOT_ESTABLISHED_DAYS, ESTABLISHED_ARCHIVE_SPAN_DAYS, RUBRIC_PATHS, type RubricPath } from "./indicator";

const NOW = Math.floor(Date.parse("2026-06-26T00:00:00Z") / 1000);
const daysAgoSec = (d: number) => NOW - d * 86400;
const S = (label: string, url: string): SignalSource => ({ label, url });
const sig = (key: string, o: Partial<Signal> = {}): Signal => ({
  key,
  label: key,
  valueText: null,
  valueNum: null,
  source: null,
  status: "ok", // tests describe COMPLETED checks unless they say otherwise
  ...o,
});
const results = (signals: Signal[]): CollectorResult[] => [{ collector: "t", signals, ok: true }];

/**
 * A full complement of COMPLETED checks (status "ok") with no values found —
 * i.e. "we looked everywhere and found nothing". Story 19 Stage 2 gates every
 * condition on the check having completed, so fixtures must now say what was
 * checked; an omitted signal means NOT CHECKED and can no longer satisfy
 * anything. Overrides replace by key.
 */
const CHECKED_KEYS = [
  "domain_registration_date", "domain_age_days", "registrar",
  "dns_spf", "dns_dmarc", "dns_a", "dns_mx", "hosting_provider",
  "wayback_snapshot_count", "wayback_first", "trustpilot", "phishtank_listed", "urlhaus_listed",
];
const checkedBaseline = (...overrides: Signal[]): CollectorResult[] => {
  const by = new Map(overrides.map((o) => [o.key, o]));
  const base = CHECKED_KEYS.filter((k) => !by.has(k)).map((k) => sig(k));
  return results([...base, ...overrides]);
};
const noPivot: Derivations = { pivot: null };

// ESTABLISHMENT IS NOW A SPAN (18.3 §3.4): how far back the archive reaches,
// not how old the registration is and not how many captures exist. The
// fixture carries a deep capture count AND an old registration precisely so
// that removing `wayback_first` proves neither of them can establish Green.
const ARCHIVED_SINCE = new Date((NOW - (ESTABLISHED_ARCHIVE_SPAN_DAYS + 400) * 86400) * 1000)
  .toISOString()
  .slice(0, 10);
const established = (extra: Signal[] = []) => {
  // `signalsByKey` is first-wins, so an extra must REPLACE the fixture's own
  // signal of the same key rather than sit behind it — otherwise a test that
  // means "now take the span away" silently asserts nothing.
  const overridden = new Set(extra.map((e) => e.key));
  const base = [
    sig("domain_age_days", { valueNum: 4015 }),
    sig("domain_registration_date", { valueNum: daysAgoSec(4015), source: S("RDAP", "u-rdap") }),
    sig("dns_spf", { valueText: "v=spf1 ~all", source: S("DNS over HTTPS", "u-spf") }),
    sig("dns_dmarc", { valueText: "v=DMARC1; p=reject", source: S("DNS over HTTPS", "u-dmarc") }),
    sig("wayback_snapshot_count", { valueNum: 900, source: S("Wayback CDX", "u-cdx") }),
    sig("wayback_first", { valueText: ARCHIVED_SINCE, source: S("Wayback CDX", "u-cdx") }),
  ].filter((b) => !overridden.has(b.key));
  return checkedBaseline(...base, ...extra);
};


describe("derive (pivot)", () => {
  it("derives an APPROXIMATE pivot when both dates exist", () => {
    const r = results([
      sig("domain_registration_date", { valueNum: daysAgoSec(4015), source: S("RDAP", "u-rdap") }),
      sig("ai_language_first_seen", { valueText: "2025-10-01", source: S("Wayback snapshot", "u-snap") }),
    ]);
    const d = derive(r, NOW);
    expect(d.pivot).not.toBeNull();
    expect(d.pivot!.domainAgeDays).toBeGreaterThan(PIVOT_ESTABLISHED_DAYS);
    expect(d.pivot!.text).toMatch(/approximate/i);
    expect(d.pivot!.sources).toHaveLength(2);
  });

  it("no pivot when the AI date is absent", () => {
    const d = derive(results([sig("domain_registration_date", { valueNum: daysAgoSec(4000) })]), NOW);
    expect(d.pivot).toBeNull();
  });
});

describe("computeIndicator (the locked rubric, in order)", () => {
  it("1) on a threat list → RED, sourced", () => {
    const r = results([sig("phishtank_listed", { valueText: "Listed", source: S("PhishTank", "u-pt") })]);
    const ind = computeIndicator("x.com", r, noPivot, NOW);
    expect(ind.state).toBe("red");
    expect(ind.reasons[0].source).toEqual(S("PhishTank", "u-pt"));
  });

  it("2) thin footprint → BLUE", () => {
    const r = checkedBaseline(
      sig("domain_age_days", { valueNum: 30 }),
      sig("wayback_snapshot_count", { valueNum: 1, source: S("Wayback CDX", "u-cdx") }),
      sig("domain_registration_date", { valueNum: daysAgoSec(30), source: S("RDAP", "u-rdap") }),
    );
    const ind = computeIndicator("x.com", r, noPivot, NOW);
    expect(ind.state).toBe("blue");
    expect(ind.reasons[0].source).toEqual(S("RDAP", "u-rdap"));
  });

  // ---- Hotfix regression tests: stop publishing claims the sources don't support ----

  it("an UNCHECKED archive cannot establish BLUE, and the gap is disclosed", () => {
    // Blue is a conjunction of ABSENCES; a check that did not complete cannot
    // supply one (Q4). Previously `snapshots == null` satisfied "thin".
    const r = checkedBaseline(
      sig("domain_age_days", { valueNum: 30 }),
      sig("domain_registration_date", { valueNum: daysAgoSec(30), source: S("RDAP", "u-rdap") }),
      sig("wayback_snapshot_count", { status: "failed" }),
    );
    const ind = computeIndicator("x.com", r, noPivot, NOW);

    expect(ind.state).not.toBe("blue");
    const all = ind.reasons.map((x) => x.text).join(" ");
    expect(all).not.toMatch(/0 archived captures/); // the false stated fact
    expect(all).not.toMatch(/\b0\b/); // no fabricated count of any kind
    const caveat = ind.reasons.find((x) => x.kind === "caveat");
    expect(caveat?.text).toMatch(/not available at check time/);
    // Every non-caveat reason still carries its own source.
    for (const x of ind.reasons.filter((y) => y.kind !== "caveat")) expect(x.source).not.toBeNull();
  });

  it("BLUE with a CHECKED-ZERO archive states 0 captures AS A SOURCED FACT", () => {
    const r = checkedBaseline(
      sig("domain_age_days", { valueNum: 30 }),
      sig("domain_registration_date", { valueNum: daysAgoSec(30), source: S("RDAP", "u-rdap") }),
      sig("wayback_snapshot_count", { valueNum: 0, valueText: "0", source: S("Wayback CDX", "u-cdx") }),
    );
    const ind = computeIndicator("x.com", r, noPivot, NOW);

    expect(ind.state).toBe("blue");
    const counted = ind.reasons.find((x) => /archived capture/.test(x.text));
    expect(counted?.text).toMatch(/^0 archived captures/);
    expect(counted?.source).toEqual(S("Wayback CDX", "u-cdx")); // checked ⇒ cited
    expect(ind.reasons.some((x) => x.kind === "caveat")).toBe(false);
  });

  it("BLUE never claims anything about reviews (only Trustpilot is checked, and null is ambiguous)", () => {
    const r = checkedBaseline(
      sig("domain_age_days", { valueNum: 30 }),
      sig("domain_registration_date", { valueNum: daysAgoSec(30), source: S("RDAP", "u-rdap") }),
      sig("wayback_snapshot_count", { valueNum: 1, source: S("Wayback CDX", "u-cdx") }),
    );
    const ind = computeIndicator("x.com", r, noPivot, NOW);
    expect(ind.reasons.filter((x) => x.kind !== "caveat").map((x) => x.text).join(" ")).not.toMatch(/review/i);
  });

  it("an UNSOURCED concern neither publishes NOR counts toward the verdict", () => {
    // Two concern points, but the pivot carries no source: it must not count, so
    // this is AMBER (one sourced concern), not RED (two).
    const unsourcedPivot: Derivations = {
      pivot: {
        text: "unsourced pivot",
        source: null,
        sources: [],
        domainAgeDays: PIVOT_ESTABLISHED_DAYS + 1,
        aiOnsetAgoDays: 10,
      },
    };
    const r = checkedBaseline(
      sig("dns_a", { valueText: "1.2.3.4", source: S("DNS over HTTPS", "u-a") }),
      sig("domain_age_days", { valueNum: PIVOT_ESTABLISHED_DAYS + 1 }),
      sig("domain_registration_date", {
        valueNum: daysAgoSec(PIVOT_ESTABLISHED_DAYS + 1),
        source: S("RDAP", "u-rdap"),
      }),
      sig("ai_language_first_seen", { valueText: "2025-01-01", source: S("Wayback snapshot", "u-snap") }),
    );
    const ind = computeIndicator("x.com", r, unsourcedPivot, NOW);

    expect(ind.state).toBe("amber");
    const main = ind.reasons.filter((x) => x.kind !== "caveat");
    expect(main).toHaveLength(1);
    expect(main[0].text).toMatch(/SPF or DMARC/);
    expect(main.every((x) => x.source != null)).toBe(true);
  });

  // ---- The pivot is an OBSERVATION, not a concern (18.3 §2.7, owner ruling) ----

  const firedPivot: Derivations = {
    pivot: {
      text: "PIVOT (approximate)",
      source: S("Wayback snapshot", "u-snap"),
      sources: [S("Wayback snapshot", "u-snap")],
      domainAgeDays: 4000,
      aiOnsetAgoDays: 200,
    },
  };
  const pivotSignals = (extra: Signal[] = []) =>
    established([
      sig("ai_language_first_seen", { valueText: "2025-01-01", source: S("Wayback snapshot", "u-snap") }),
      ...extra,
    ]);

  it("3) a fired pivot publishes as a SOURCED OBSERVATION and does not deny GREEN", () => {
    // Was: "two sourced concern points (pivot + missing SPF/DMARC) → RED".
    // The pivot no longer contributes a concern point, so that combination can
    // no longer be built — see the strict-unreachability test below.
    const ind = computeIndicator("x.com", pivotSignals(), firedPivot, NOW);

    expect(ind.state).toBe("green"); // the pivot no longer blocks establishment
    const observation = ind.reasons.find((x) => x.text === "PIVOT (approximate)")!;
    expect(observation).toBeDefined();
    expect(observation.kind).toBe("caveat"); // routes to the summary, not to flagged[]
    expect(observation.source).toEqual(S("Wayback snapshot", "u-snap")); // observations carry a source
    // and it is NOT presented as a contributing reason
    expect(ind.reasons.filter((x) => x.kind !== "caveat").some((x) => /PIVOT/.test(x.text))).toBe(false);
  });

  it("an UNSOURCED pivot publishes nothing — the symmetry rule survives the demotion", () => {
    const unsourced: Derivations = {
      pivot: { text: "PIVOT (approximate)", source: null, sources: [], domainAgeDays: 4000, aiOnsetAgoDays: 200 },
    };
    const ind = computeIndicator("x.com", pivotSignals(), unsourced, NOW);
    expect(ind.reasons.some((x) => /PIVOT/.test(x.text))).toBe(false);
  });

  it("accumulation is STRICTLY unreachable while the concern pool has one member", () => {
    // Not a wish — a property of the current rule set, asserted so that anyone
    // who grows the concern pool sees this test fail and re-reads §3.1. With the
    // pivot demoted, the only concern left is the SPF/DMARC point, so
    // `concerns.length` cannot reach ACCUMULATION_MIN_FINDINGS.
    const worstCase = checkedBaseline(
      sig("dns_a", { valueText: "1.2.3.4", source: S("DNS over HTTPS", "u-a") }), // resolved, no SPF, no DMARC
      sig("domain_age_days", { valueNum: 4000 }),
      sig("domain_registration_date", { valueNum: daysAgoSec(4000), source: S("RDAP", "u-rdap") }),
      sig("ai_language_first_seen", { valueText: "2025-01-01", source: S("Wayback snapshot", "u-snap") }),
    );
    const ind = computeIndicator("x.com", worstCase, firedPivot, NOW);

    expect(ind.state).not.toBe("red");
    expect(ind.reasons.filter((x) => x.kind !== "caveat")).toHaveLength(1); // the one surviving concern
    expect(ind.reasons.some((x) => /checks we completed returned findings/.test(x.text))).toBe(false);
  });

  it("3b) ONE concern point → AMBER", () => {
    const r = checkedBaseline(
      sig("dns_a", { valueText: "1.2.3.4", source: S("DNS over HTTPS", "u-a") }), // resolved, no SPF/DMARC
      sig("domain_age_days", { valueNum: 4000 }),
    );
    const ind = computeIndicator("x.com", r, noPivot, NOW);
    expect(ind.state).toBe("amber");
    const main = ind.reasons.filter((x) => x.kind !== "caveat");
    expect(main).toHaveLength(1);
    expect(main[0].source).not.toBeNull();
  });

  it("4) established AND clean (both feeds checked-clear) → GREEN, no disclosure", () => {
    const r = established([
      sig("phishtank_listed", { valueText: "Not listed", source: S("PhishTank", "u-pt") }),
      sig("urlhaus_listed", { valueText: "Not listed", source: S("URLhaus (abuse.ch)", "u-uh") }),
    ]);
    const ind = computeIndicator("x.com", r, noPivot, NOW);
    expect(ind.state).toBe("green");
    const main = ind.reasons.filter((x) => x.kind !== "caveat");
    expect(main.length).toBeGreaterThanOrEqual(2);
    expect(main.every((x) => x.source != null)).toBe(true);
    expect(ind.reasons.some((x) => /not reachable/i.test(x.text))).toBe(false);
  });

  it("GREEN with a threat feed NOT checked → still green, reasons DISCLOSE the gap as a caveat", () => {
    // Both feeds unreachable / key-gated — the checks did NOT complete.
    const ind = computeIndicator(
      "x.com",
      established([
        sig("phishtank_listed", { status: "not_attempted" }),
        sig("urlhaus_listed", { status: "failed" }),
      ]),
      noPivot,
      NOW,
    );
    expect(ind.state).toBe("green");
    const disclosure = ind.reasons.find((x) => /not reachable/i.test(x.text));
    expect(disclosure).toBeDefined();
    expect(disclosure!.kind).toBe("caveat");
    expect(disclosure!.text).toMatch(/PhishTank and URLhaus/); // names the actual feeds
  });

  // ---- 18.3 §3.4: establishment is a SPAN, operator-guarded only in the copy ----

  it("a RECYCLED-DOMAIN shape — 30y registration, deep captures, SHORT archive span — cannot reach GREEN", () => {
    // Registration age is an invalid lower bound on operating history (§3.4.1)
    // and capture count measures crawler attention (§3.4.3). With the span short,
    // neither may stand in for it.
    const recent = new Date((NOW - 200 * 86400) * 1000).toISOString().slice(0, 10);
    const ind = computeIndicator(
      "x.com",
      established([sig("wayback_first", { valueText: recent, source: S("Wayback CDX", "u-cdx") })]),
      noPivot,
      NOW,
    );
    expect(ind.state).not.toBe("green");
    expect(ind.reasons.map((r) => r.text).join(" ")).not.toMatch(/Established domain/);
  });

  it("an UNCHECKED first-capture date cannot establish GREEN (status guard, §3.2)", () => {
    const ind = computeIndicator(
      "x.com",
      established([sig("wayback_first", { status: "failed", valueText: "2001-01-01" })]),
      noPivot,
      NOW,
    );
    expect(ind.state).not.toBe("green");
  });

  it("GREEN cites the archive SPAN as a fact, never registration age as evidence", () => {
    const ind = computeIndicator("x.com", established(), noPivot, NOW);
    expect(ind.state).toBe("green");
    const main = ind.reasons.filter((x) => x.kind !== "caveat");
    expect(main[0].text).toMatch(/^Archived since \d{4}/);
    expect(main[0].source).toEqual(S("Wayback CDX", "u-cdx"));
    // the fact, not the inference (§3.4.5 / Part 4)
    const allMain = main.map((x) => x.text).join(" ");
    expect(allMain).not.toMatch(/registered/i);
    expect(allMain).not.toMatch(/operat(ed|ing) since/i);
  });

  it("a long archive span DISCLOSES that operator continuity is unchecked", () => {
    const ind = computeIndicator("x.com", established(), noPivot, NOW);
    const c = ind.reasons.find((x) => x.kind === "caveat" && /changed hands/.test(x.text));
    expect(c).toBeDefined();
    expect(c!.source).toBeNull(); // DISCLOSURE: about our limits, carries no source
  });

  it("the registration date is still PUBLISHED — as a neutral dated fact that denies the inference", () => {
    const ind = computeIndicator("x.com", established(), noPivot, NOW);
    const c = ind.reasons.find((x) => x.kind === "caveat" && /^Domain registered \d{4}-\d{2}-\d{2}\./.test(x.text));
    expect(c).toBeDefined();
    expect(c!.text).toMatch(/not when its current operator began using it/);
    expect(c!.source).toEqual(S("RDAP", "u-rdap")); // OBSERVATION caveats carry a source
  });

  it("a pre-2018 first certificate is CAPPED and labelled a floor, and corroborates only", () => {
    const ind = computeIndicator(
      "x.com",
      established([
        sig("first_cert_date", {
          valueNum: Math.floor(Date.parse("2011-06-01T00:00:00Z") / 1000),
          source: S("crt.sh", "u-crt"),
        }),
      ]),
      noPivot,
      NOW,
    );
    expect(ind.state).toBe("green");
    const cert = ind.reasons.find((x) => /TLS certificates/.test(x.text))!;
    expect(cert.text).toMatch(/over 10 years/); // capped, not "~15 years"
    expect(cert.text).toMatch(/floor, not a start date/);
    expect(cert.text).not.toMatch(/~1[0-9] years/);
  });

  it("a POST-2018 first certificate is stated precisely — the cap binds only where CT cannot reach", () => {
    const ind = computeIndicator(
      "x.com",
      established([
        sig("first_cert_date", {
          valueNum: Math.floor(Date.parse("2021-03-01T00:00:00Z") / 1000),
          source: S("crt.sh", "u-crt"),
        }),
      ]),
      noPivot,
      NOW,
    );
    const cert = ind.reasons.find((x) => /TLS certificates/.test(x.text))!;
    expect(cert.text).toMatch(/~5 years/);
    expect(cert.text).not.toMatch(/floor/);
    expect(cert.text).not.toMatch(/over \d/);
  });

  it("a certificate alone cannot establish GREEN — it is corroboration, not a route", () => {
    const ind = computeIndicator(
      "x.com",
      established([
        sig("wayback_first", { status: "failed" }),
        sig("first_cert_date", {
          valueNum: Math.floor(Date.parse("2011-06-01T00:00:00Z") / 1000),
          source: S("crt.sh", "u-crt"),
        }),
      ]),
      noPivot,
      NOW,
    );
    expect(ind.state).not.toBe("green");
  });

  it("the established-but-no-SPF residual cites the check it is talking about", () => {
    // HOTFIX regression. The sentence's operative claim is about EMAIL
    // AUTHENTICATION; it was cited to Wayback, because the source travelled with
    // the sentence rather than with the claim. It also carried a contrastive
    // "but", composing two clauses into an argument — the semicolon defect, in a
    // sentence written while fixing the semicolon.
    //
    // Reachable when: established, SPF checked and absent, DMARC present (so the
    // both-missing concern does not fire). ZERO of 49 corpus domains reach it —
    // every corpus domain lacking SPF also lacks DMARC — so the delta gate can
    // never see this.
    const r = established([
      sig("dns_spf", { valueText: null, source: S("DNS over HTTPS", "u-spf") }),
    ]);
    const ind = computeIndicator("x.com", r, noPivot, NOW);

    expect(ind.state).toBe("amber");
    const residual = ind.reasons.find((x) => x.kind === "residual")!;
    expect(residual).toBeDefined();
    // the citation evidences the claim the sentence actually makes
    expect(residual.source).toEqual(S("DNS over HTTPS", "u-spf"));
    expect(residual.source).not.toEqual(S("Wayback CDX", "u-cdx"));
    // no contrastive connective composing two clauses
    expect(residual.text).not.toMatch(/\bbut\b/i);
    expect(residual.text).not.toMatch(/\bhowever\b|\bdespite\b|;/i);
  });

  it("when the SPF check did NOT complete, the residual publishes no finding at all", () => {
    // §3.2: a check that did not complete is a DISCLOSURE about us, not a
    // finding about the domain. The "did not complete" caveat already says it,
    // and an unsourced reason cannot publish (§6.2).
    const r = established([sig("dns_spf", { status: "failed", valueText: null })]);
    const ind = computeIndicator("x.com", r, noPivot, NOW);

    expect(ind.state).toBe("amber");
    expect(ind.reasons.some((x) => x.kind === "residual")).toBe(false);
    expect(ind.reasons.some((x) => /email-authentication lookup did not complete/.test(x.text))).toBe(true);
  });

  it("a clean threat check does NOT force GREEN (not established → amber)", () => {
    const r = results([
      sig("domain_age_days", { valueNum: 200 }), // not young, but not established
      sig("wayback_snapshot_count", { valueNum: 2 }),
      sig("dns_spf", { valueText: "v=spf1 ~all", source: S("DNS over HTTPS", "u-spf") }),
      sig("dns_dmarc", { valueText: "v=DMARC1", source: S("DNS over HTTPS", "u-dmarc") }),
      sig("phishtank_listed", { valueText: "Not listed", source: S("PhishTank", "u-pt") }),
      sig("urlhaus_listed", { valueText: "Not listed", source: S("URLhaus (abuse.ch)", "u-uh") }),
    ]);
    const ind = computeIndicator("x.com", r, noPivot, NOW);
    expect(ind.state).toBe("amber");
  });
});

/**
 * RUBRIC-PATH COVERAGE.
 *
 * The corpus delta gate — the review artifact for four consecutive stories —
 * enters five of these nine paths, and two of Lithium's six blind-spot defects
 * lived on paths it never entered. This table covers what the corpus
 * structurally cannot, and it is EXHAUSTIVE BY CONSTRUCTION: the `Record`
 * key type is the `RubricPath` union, so adding a `return verdict(...)` without
 * adding a case here fails the type-check, not a later review.
 */
describe("rubric-path coverage", () => {
  const SPAN_SHORT = new Date((NOW - 200 * 86400) * 1000).toISOString().slice(0, 10);
  const CDX = S("Wayback CDX", "u-cdx");
  const DNS = S("DNS over HTTPS", "u-dns");

  /** Reachable path → a fixture that lands on it. Unreachable → why. */
  const PATHS: Record<RubricPath, { results: CollectorResult[]; derivations?: Derivations } | { unreachable: string }> = {
    "red-threat-listing": {
      results: checkedBaseline(sig("phishtank_listed", { valueText: "Listed", source: S("PhishTank", "u-pt") })),
    },
    "red-accumulation": {
      // NOT A GAP — a documented consequence (18.3 §3.1, §2.7). Since the pivot
      // was demoted to an observation the concern pool has ONE member, so
      // `concerns.length` cannot reach ACCUMULATION_MIN_FINDINGS = 2. The
      // companion test "accumulation is STRICTLY unreachable…" fails the moment
      // the pool grows, at which point this entry must become a fixture.
      unreachable: "concern pool has one member; see the strict-unreachability test",
    },
    "blue-thin-footprint": {
      results: checkedBaseline(
        sig("domain_age_days", { valueNum: 30 }),
        sig("domain_registration_date", { valueNum: daysAgoSec(30), source: S("RDAP", "u-rdap") }),
        sig("wayback_snapshot_count", { valueNum: 1, source: CDX }),
      ),
    },
    "green-established-clean": { results: established() },
    "amber-concerns": {
      results: checkedBaseline(
        sig("dns_a", { valueText: "1.2.3.4", source: DNS }), // resolved, no SPF, no DMARC
        sig("domain_age_days", { valueNum: 4000 }),
      ),
    },
    "amber-residual-no-spf": {
      // established; SPF checked and ABSENT; DMARC present so the both-missing
      // concern does not fire. Zero of 49 corpus domains reach this.
      results: established([sig("dns_spf", { valueText: null, source: DNS })]),
    },
    "amber-residual-not-established": {
      results: established([sig("wayback_first", { valueText: SPAN_SHORT, source: CDX })]),
    },
    "amber-no-reason-spf-unchecked": {
      results: established([sig("dns_spf", { status: "failed", valueText: null })]),
    },
    "amber-no-reason-archive-unchecked": {
      results: established([sig("wayback_first", { status: "failed" }), sig("wayback_snapshot_count", { status: "failed" })]),
    },
  };

  for (const name of RUBRIC_PATHS) {
    const f = PATHS[name];
    if ("unreachable" in f) {
      it(`${name} — declared unreachable: ${f.unreachable}`, () => {
        expect(f.unreachable.length).toBeGreaterThan(0);
      });
      continue;
    }
    it(`${name} — reached, and labelled as itself`, () => {
      const ind = computeIndicator("x.com", f.results, f.derivations ?? noPivot, NOW);
      expect(ind.path).toBe(name);
    });
  }

  it("every path is either covered by a fixture or declared unreachable", () => {
    // `Record<RubricPath, …>` already enforces this at compile time; this
    // asserts the runtime list has not drifted from the union.
    expect(Object.keys(PATHS).sort()).toEqual([...RUBRIC_PATHS].sort());
  });
});
