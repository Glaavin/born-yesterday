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
  status: "ok", // tests describe COMPLETED checks unless they say otherwise
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

describe("summary phrasing by state (insufficiency is not concern)", () => {
  const ind = (state: Indicator["state"], reasons: Indicator["reasons"]): Indicator => ({ state, reasons });
  const oneSourced = [{ text: "a reason", source: S("RDAP", "u-rdap") }];

  it("BLUE is never described as 'worth a closer look' and carries no tally", () => {
    const r = assembleReport("x.com", [], { pivot: null }, ind("blue", oneSourced), NOW);
    expect(r.state).toBe("too-new");
    expect(r.summary).toMatch(/not enough to assess yet/);
    expect(r.summary).not.toMatch(/worth a closer look/);
    expect(r.summary).not.toMatch(/\b1\b/); // the reason is not counted as a concern
  });

  it("AMBER and RED keep the concern tally", () => {
    for (const st of ["amber", "red"] as const) {
      const r = assembleReport("x.com", [], { pivot: null }, ind(st, oneSourced), NOW);
      expect(r.summary).toMatch(/1 worth a closer look/);
    }
  });

  it("GREEN still reads 'none worth a closer look'", () => {
    const r = assembleReport("x.com", [], { pivot: null }, ind("green", oneSourced), NOW);
    expect(r.summary).toMatch(/none worth a closer look/);
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

  it("the RESIDUAL is never flagged and never counted — it explains, it does not accuse", () => {
    // Same defect class as Blue rendering its reasons as concerns (§6.4), one
    // state over: Amber's generous default fires only when nothing was flagged,
    // so badging it "Flagged" and counting it as "1 worth a closer look" told
    // the reader we had found something.
    const indicator: Indicator = {
      state: "amber",
      reasons: [
        {
          text: "We couldn't establish enough archived history to vouch for this domain yet.",
          source: S("Wayback CDX", "u-cdx"),
          kind: "residual",
        },
      ],
    };
    const report = assembleReport("example.com", results, { pivot: null }, indicator, NOW);

    expect(report.flagged).toEqual([]); // not a finding
    expect(report.summary).toMatch(/nothing flagged/);
    expect(report.summary).not.toMatch(/worth a closer look/); // not counted
    expect(report.summary).toMatch(/couldn.t establish enough archived history/); // still explained
    expect(report.summary).not.toMatch(EDITORIAL);
    // copy discipline: about US, not about what the company lacks
    expect(report.summary).toMatch(/\bwe\b/i);
  });

  it("GREEN does not state the same fact twice — the establishing reason wins", () => {
    const withArchive: CollectorResult[] = [
      ...results,
      {
        collector: "ai-pivot",
        ok: true,
        signals: [
          sig("wayback_first", { valueText: "1996-11-01", source: S("Wayback CDX", "u-cdx") }),
          sig("wayback_snapshot_count", { valueNum: 777, source: S("Wayback CDX", "u-cdx") }),
        ],
      },
    ];
    const indicator: Indicator = {
      state: "green",
      reasons: [
        { text: "Archived since 1996 — the Wayback Machine's record for this domain spans ~30 years (777 captures recorded).", source: S("Wayback CDX", "u-cdx") },
        { text: "Email authentication configured (SPF present).", source: S("DNS over HTTPS", "u-spf") },
      ],
    };
    const report = assembleReport("example.com", withArchive, { pivot: null }, indicator, NOW);

    const archiveLines = report.positive.filter((f) => /Wayback Machine/.test(f.text));
    expect(archiveLines).toHaveLength(1);
    expect(archiveLines[0].text).toMatch(/^Archived since 1996/); // the indicator's wording, not the assembler's
    const spfLines = report.positive.filter((f) => /SPF/.test(f.text));
    expect(spfLines).toHaveLength(1);
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
