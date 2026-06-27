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
  ...o,
});
const results = (signals: Signal[]): CollectorResult[] => [{ collector: "t", signals, ok: true }];
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
    const r = results([
      sig("domain_age_days", { valueNum: 30 }),
      sig("wayback_snapshot_count", { valueNum: 1, source: S("Wayback CDX", "u-cdx") }),
      sig("domain_registration_date", { valueNum: daysAgoSec(30), source: S("RDAP", "u-rdap") }),
    ]);
    const ind = computeIndicator("x.com", r, noPivot, NOW);
    expect(ind.state).toBe("blue");
    expect(ind.reasons[0].source).toEqual(S("RDAP", "u-rdap"));
  });

  it("3) two sourced concern points (pivot + missing SPF/DMARC) → RED, enumerated", () => {
    const r = results([
      sig("dns_a", { valueText: "1.2.3.4", source: S("DNS over HTTPS", "u-a") }),
      sig("domain_age_days", { valueNum: 4000 }),
      sig("domain_registration_date", { valueNum: daysAgoSec(4000), source: S("RDAP", "u-rdap") }),
    ]);
    const pivot: Derivations = {
      pivot: { text: "PIVOT (approximate)", sources: [S("RDAP", "u-rdap")], domainAgeDays: 4000, aiOnsetAgoDays: 200 },
    };
    const ind = computeIndicator("x.com", r, pivot, NOW);
    expect(ind.state).toBe("red");
    expect(ind.reasons).toHaveLength(2);
    expect(ind.reasons.every((x) => x.source != null)).toBe(true);
  });

  it("3b) ONE concern point → AMBER", () => {
    const r = results([
      sig("dns_a", { valueText: "1.2.3.4", source: S("DNS over HTTPS", "u-a") }), // resolved, no SPF/DMARC
      sig("domain_age_days", { valueNum: 4000 }),
    ]);
    const ind = computeIndicator("x.com", r, noPivot, NOW);
    expect(ind.state).toBe("amber");
    expect(ind.reasons).toHaveLength(1);
    expect(ind.reasons[0].source).not.toBeNull();
  });

  const established = (extra: Signal[] = []) =>
    results([
      sig("domain_age_days", { valueNum: 4015 }),
      sig("domain_registration_date", { valueNum: daysAgoSec(4015), source: S("RDAP", "u-rdap") }),
      sig("dns_spf", { valueText: "v=spf1 ~all", source: S("DNS over HTTPS", "u-spf") }),
      sig("dns_dmarc", { valueText: "v=DMARC1; p=reject", source: S("DNS over HTTPS", "u-dmarc") }),
      ...extra,
    ]);

  it("4) established AND clean (both feeds checked-clear) → GREEN, no disclosure", () => {
    const r = established([
      sig("phishtank_listed", { valueText: "Not listed", source: S("PhishTank", "u-pt") }),
      sig("urlhaus_listed", { valueText: "Not listed", source: S("URLhaus (abuse.ch)", "u-uh") }),
    ]);
    const ind = computeIndicator("x.com", r, noPivot, NOW);
    expect(ind.state).toBe("green");
    expect(ind.reasons.length).toBeGreaterThanOrEqual(2);
    expect(ind.reasons.every((x) => x.source != null)).toBe(true);
    expect(ind.reasons.some((x) => /not reachable/i.test(x.text))).toBe(false);
  });

  it("GREEN with a threat feed NOT checked → still green, reasons DISCLOSE the gap", () => {
    // No threat signals at all (feeds unreachable / no key).
    const ind = computeIndicator("x.com", established(), noPivot, NOW);
    expect(ind.state).toBe("green");
    const disclosure = ind.reasons.find((x) => /not reachable/i.test(x.text));
    expect(disclosure).toBeDefined();
    expect(disclosure!.source).not.toBeNull();
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
