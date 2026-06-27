import { describe, it, expect } from "vitest";
import type { CollectorResult, Signal, SignalSource } from "../signals/types";
import { assembleReport, stateToKey, KEY_TO_STATE } from "./assemble";
import type { Indicator } from "./indicator";

const NOW = Math.floor(Date.parse("2026-06-26T00:00:00Z") / 1000);
const S = (label: string, url: string): SignalSource => ({ label, url });
const sig = (key: string, o: Partial<Signal> = {}): Signal => ({
  key,
  label: key,
  valueText: null,
  valueNum: null,
  source: null,
  ...o,
});

const REPORT_KEYS = ["domain", "state", "summary", "lastChecked", "flagged", "positive", "sources"];
const EDITORIAL = /\b(scam|fraud|legit|safe|trust(?:worthy)?|suspicious|fake|sketchy|dangerous)\b/i;

describe("state ⇄ ReportStateKey mapping", () => {
  it("maps both directions", () => {
    expect(stateToKey("green")).toBe("checks-out");
    expect(stateToKey("amber")).toBe("some-concerns");
    expect(stateToKey("red")).toBe("red-flags");
    expect(stateToKey("blue")).toBe("too-new");
    expect(KEY_TO_STATE["red-flags"]).toBe("red");
  });
});

describe("assembleReport", () => {
  const results: CollectorResult[] = [
    {
      collector: "dns",
      ok: true,
      signals: [
        sig("dns_spf", { valueText: "v=spf1 ~all", source: S("DNS over HTTPS", "u-spf") }),
        sig("dns_dmarc", { valueText: "v=DMARC1", source: S("DNS over HTTPS", "u-spf") }), // dup url → dedupe
      ],
    },
    {
      collector: "threats",
      ok: true,
      signals: [sig("phishtank_listed", { valueText: "Not listed", source: S("PhishTank", "u-pt") })],
    },
  ];

  it("produces the EXACT Report shape with the mapped state + factual summary", () => {
    const indicator: Indicator = {
      state: "amber",
      reasons: [{ text: "No SPF or DMARC records found.", source: S("DNS over HTTPS", "u-dmarc") }],
    };
    const report = assembleReport("example.com", results, { pivot: null }, indicator, NOW);

    expect(Object.keys(report).sort()).toEqual([...REPORT_KEYS].sort());
    expect(report.domain).toBe("example.com");
    expect(report.state).toBe("some-concerns"); // amber → some-concerns
    expect(report.lastChecked).toBe("2026-06-26");
    expect(report.summary).not.toMatch(EDITORIAL); // factual only
    // flagged = the concern reason (sourced)
    expect(report.flagged).toEqual([{ text: "No SPF or DMARC records found.", source: S("DNS over HTTPS", "u-dmarc") }]);
    // positive: reassuring sourced facts (SPF/DMARC present, not listed)
    expect(report.positive.length).toBeGreaterThan(0);
    expect(report.positive.every((f) => f.source && f.text)).toBe(true);
    // sources deduped by url (the two DNS signals share u-spf)
    expect(report.sources.map((s) => s.url)).toEqual(["u-spf", "u-pt"]);
  });

  it("green → no flagged; establishing reasons lead the positives", () => {
    const indicator: Indicator = {
      state: "green",
      reasons: [{ text: "Established domain — registered ~11 years ago.", source: S("RDAP", "u-rdap") }],
    };
    const report = assembleReport("example.com", results, { pivot: null }, indicator, NOW);
    expect(report.state).toBe("checks-out");
    expect(report.flagged).toEqual([]);
    expect(report.positive[0]).toEqual({ text: "Established domain — registered ~11 years ago.", source: S("RDAP", "u-rdap") });
  });

  it("a GREEN caveat lands in the SUMMARY — never in positive[] or flagged[]", () => {
    const indicator: Indicator = {
      state: "green",
      reasons: [
        { text: "Established domain — registered ~11 years ago.", source: S("RDAP", "u-rdap") },
        { text: "PhishTank was not reachable at check time; not independently cleared.", source: null, kind: "caveat" },
      ],
    };
    const report = assembleReport("example.com", results, { pivot: null }, indicator, NOW);

    const inFindings = [...report.positive, ...report.flagged].some((f) => /not reachable/i.test(f.text));
    expect(inFindings).toBe(false); // caveat is NOT a finding
    expect(report.flagged).toEqual([]);
    expect(report.positive[0]).toEqual({ text: "Established domain — registered ~11 years ago.", source: S("RDAP", "u-rdap") });
    expect(report.summary).toMatch(/Note:.*PhishTank.*not reachable/i); // it's a summary note
    expect(report.summary).not.toMatch(EDITORIAL);
  });
});
