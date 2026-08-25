import { describe, it, expect } from "vitest";
import type { CollectorResult, Signal, SignalSource } from "../signals/types";
import { derive, type Derivations } from "./derive";
import { computeIndicator, ESTABLISHED_DOMAIN_DAYS } from "./indicator";

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
  "wayback_snapshot_count", "trustpilot", "phishtank_listed", "urlhaus_listed",
];
const checkedBaseline = (...overrides: Signal[]): CollectorResult[] => {
  const by = new Map(overrides.map((o) => [o.key, o]));
  const base = CHECKED_KEYS.filter((k) => !by.has(k)).map((k) => sig(k));
  return results([...base, ...overrides]);
};
const noPivot: Derivations = { pivot: null };

describe("derive (pivot)", () => {
  it("derives an APPROXIMATE pivot when both dates exist", () => {
    const r = results([
      sig("domain_registration_date", { valueNum: daysAgoSec(4015), source: S("RDAP", "u-rdap") }),
      sig("ai_language_first_seen", { valueText: "2025-10-01", source: S("Wayback snapshot", "u-snap") }),
    ]);
    const d = derive(r, NOW);
    expect(d.pivot).not.toBeNull();
    expect(d.pivot!.domainAgeDays).toBeGreaterThan(ESTABLISHED_DOMAIN_DAYS);
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
        sources: [],
        domainAgeDays: ESTABLISHED_DOMAIN_DAYS + 1,
        aiOnsetAgoDays: 10,
      },
    };
    const r = checkedBaseline(
      sig("dns_a", { valueText: "1.2.3.4", source: S("DNS over HTTPS", "u-a") }),
      sig("domain_age_days", { valueNum: ESTABLISHED_DOMAIN_DAYS + 1 }),
      sig("domain_registration_date", {
        valueNum: daysAgoSec(ESTABLISHED_DOMAIN_DAYS + 1),
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

  it("3) two sourced concern points (pivot + missing SPF/DMARC) → RED, enumerated", () => {
    const r = checkedBaseline(
      sig("dns_a", { valueText: "1.2.3.4", source: S("DNS over HTTPS", "u-a") }),
      sig("domain_age_days", { valueNum: 4000 }),
      sig("domain_registration_date", { valueNum: daysAgoSec(4000), source: S("RDAP", "u-rdap") }),
      sig("ai_language_first_seen", { valueText: "2025-01-01", source: S("Wayback snapshot", "u-snap") }),
    );
    const pivot: Derivations = {
      pivot: { text: "PIVOT (approximate)", sources: [S("RDAP", "u-rdap")], domainAgeDays: 4000, aiOnsetAgoDays: 200 },
    };
    const ind = computeIndicator("x.com", r, pivot, NOW);
    expect(ind.state).toBe("red");
    // Two sourced concerns, plus the accumulation sentence stating the ratio.
    const main = ind.reasons.filter((x) => x.kind !== "caveat");
    expect(main).toHaveLength(2);
    expect(main.every((x) => x.source != null)).toBe(true);
    expect(ind.reasons.some((x) => /checks we completed returned findings/.test(x.text))).toBe(true);
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

  const established = (extra: Signal[] = []) =>
    checkedBaseline(
      sig("domain_age_days", { valueNum: 4015 }),
      sig("domain_registration_date", { valueNum: daysAgoSec(4015), source: S("RDAP", "u-rdap") }),
      sig("dns_spf", { valueText: "v=spf1 ~all", source: S("DNS over HTTPS", "u-spf") }),
      sig("dns_dmarc", { valueText: "v=DMARC1; p=reject", source: S("DNS over HTTPS", "u-dmarc") }),
      sig("wayback_snapshot_count", { valueNum: 900, source: S("Wayback CDX", "u-cdx") }),
      ...extra,
    );

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
