import { describe, it, expect } from "vitest";
import type { CollectorResult, Signal, SignalSource } from "../signals/types";
import { assembleReport, stateToKey, KEY_TO_STATE } from "./assemble";
import type { Indicator, RubricPath } from "./indicator";

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

/**
 * `Indicator.path` is a DIAGNOSTIC label naming which branch of the rubric
 * fired. The assembler ignores it entirely, so these fixtures supply a
 * plausible one and assert nothing about it — the coverage report that consumes
 * it is exercised in `indicator.test.ts` instead.
 */
const IND = (
  state: Indicator["state"],
  reasons: Indicator["reasons"],
  path: RubricPath = "amber-concerns",
): Indicator => ({ state, reasons, path, undecided: null });

const REPORT_KEYS = ["domain", "state", "summary", "lastChecked", "flagged", "positive", "neutral", "sources"];
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
  const ind = IND;
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
    const indicator = IND("amber", [
      { text: "No SPF or DMARC records found.", source: S("DNS over HTTPS", "u-dmarc") },
    ]);
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
    const indicator = IND(
      "green",
      [{ text: "Established domain — registered ~11 years ago.", source: S("RDAP", "u-rdap") }],
      "green-established-clean",
    );
    const report = assembleReport("example.com", results, { pivot: null }, indicator, NOW);
    expect(report.state).toBe("checks-out");
    expect(report.flagged).toEqual([]);
    expect(report.positive[0]).toEqual({ text: "Established domain — registered ~11 years ago.", source: S("RDAP", "u-rdap") });
  });

  it("a Trustpilot rating publishes in NEUTRAL, whatever the score says", () => {
    // Hotfix #64 pulled this out of positive[] because `valueText` is the
    // rating verbatim and nothing checked its direction, so "1.8/5" published
    // under a heading calling it reassuring. 19.1 gives it the channel it
    // always needed. There is still NO direction check and there must not be:
    // adopting a third party's verdict on a company is what the intake rule
    // prohibits. Both scores land in the same place — that IS the discipline.
    for (const rating of ["1.8/5 (40 reviews)", "4.6/5 (12,000 reviews)"]) {
      const withTp: CollectorResult[] = [
        ...results,
        { collector: "reputation", ok: true, signals: [
          sig("trustpilot", { valueText: rating, source: S("Trustpilot", "u-tp") }),
        ]},
      ];
      const report = assembleReport("example.com", withTp, { pivot: null }, IND("amber", []), NOW);
      expect(report.neutral?.some((f) => f.text === `Trustpilot: ${rating}.`)).toBe(true);
      expect(report.positive.some((f) => /Trustpilot/i.test(f.text))).toBe(false);
      expect(report.flagged.some((f) => /Trustpilot/i.test(f.text))).toBe(false);
      expect(report.sources.some((x) => x.url === "u-tp")).toBe(true);
    }
  });

  it("a clean threat check is NEUTRAL — the code said 'information, not a strong safe' all along", () => {
    const report = assembleReport("example.com", results, { pivot: null }, IND("amber", []), NOW);
    expect(report.neutral?.some((f) => /Not listed on PhishTank/.test(f.text))).toBe(true);
    expect(report.positive.some((f) => /Not listed/.test(f.text))).toBe(false);
  });

  it("archive span is POSITIVE on Green and NEUTRAL everywhere else — the same fact, routed by verdict", () => {
    // The one context-dependent classification, and deliberate: on Green the
    // span IS the establishing evidence; on `bolt.new` the same sentence is
    // precisely why it is NOT Green; on `secondlibrary.com` it is misleading.
    const archive: CollectorResult[] = [
      ...results,
      { collector: "ai-pivot", ok: true, signals: [
        sig("wayback_first", { valueText: "2024-09-06", source: S("Wayback CDX", "u-cdx") }),
        sig("wayback_snapshot_count", { valueNum: 449, source: S("Wayback CDX", "u-cdx") }),
      ]},
    ];
    const amber = assembleReport("x.com", archive, { pivot: null }, IND("amber", []), NOW);
    expect(amber.neutral?.some((f) => /Archived on the Wayback Machine since 2024/.test(f.text))).toBe(true);
    expect(amber.positive.some((f) => /Wayback/.test(f.text))).toBe(false);

    const green = assembleReport("x.com", archive, { pivot: null }, IND("green", [], "green-established-clean"), NOW);
    expect(green.positive.some((f) => /Archived on the Wayback Machine since 2024/.test(f.text))).toBe(true);
    expect(green.neutral?.some((f) => /Wayback/.test(f.text))).toBe(false);
  });

  it("BLUE's reasons are NEUTRAL, not flagged — they are facts we established", () => {
    // They were rendering under a "Couldn't establish" badge, which is the
    // opposite of what they are. Blue's meaning is carried by the pill and the
    // summary, never by badging its own evidence as a shortfall.
    const indicator = IND(
      "blue",
      [
        { text: "Registered ~5 months ago.", source: S("RDAP", "u-rdap") },
        { text: "3 archived captures on the Wayback Machine.", source: S("Wayback CDX", "u-cdx") },
      ],
      "blue-thin-footprint",
    );
    const report = assembleReport("x.com", results, { pivot: null }, indicator, NOW);
    expect(report.flagged).toEqual([]);
    expect(report.neutral?.map((f) => f.text)).toEqual(
      expect.arrayContaining(["Registered ~5 months ago.", "3 archived captures on the Wayback Machine."]),
    );
  });

  it("caveats split by SOURCE: observations become findings, disclosures stay in the note", () => {
    // §3.2's two disciplines finally get two homes, and the split is structural
    // rather than conventional — §6.2 already forbids publishing an unsourced
    // reason as a finding, so nothing new had to be invented to tell them apart.
    const indicator = IND("amber", [
      { text: "Domain registered 1990-10-10.", source: S("RDAP", "u-rdap"), kind: "caveat" },
      { text: "PhishTank was not reachable at check time.", source: null, kind: "caveat" },
    ]);
    const report = assembleReport("x.com", results, { pivot: null }, indicator, NOW);

    expect(report.neutral?.some((f) => /Domain registered 1990/.test(f.text))).toBe(true);
    expect(report.summary).not.toMatch(/Domain registered 1990/);
    expect(report.summary).toMatch(/PhishTank was not reachable/);
    expect(report.neutral?.some((f) => /not reachable/.test(f.text))).toBe(false);
  });

  it("the RESIDUAL is never flagged and never counted — it explains, it does not accuse", () => {
    // Same defect class as Blue rendering its reasons as concerns (§6.4), one
    // state over: Amber's generous default fires only when nothing was flagged,
    // so badging it "Flagged" and counting it as "1 worth a closer look" told
    // the reader we had found something.
    const indicator = IND(
      "amber",
      [
        {
          text: "We couldn't establish enough archived history to vouch for this domain yet.",
          source: S("Wayback CDX", "u-cdx"),
          kind: "residual",
        },
      ],
      "amber-residual-not-established",
    );
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
    const indicator = IND(
      "green",
      [
        { text: "Archived since 1996 — the Wayback Machine's record for this domain spans ~30 years (777 captures recorded).", source: S("Wayback CDX", "u-cdx") },
        { text: "Email authentication configured (SPF present).", source: S("DNS over HTTPS", "u-spf") },
      ],
      "green-established-clean",
    );
    const report = assembleReport("example.com", withArchive, { pivot: null }, indicator, NOW);

    const archiveLines = report.positive.filter((f) => /Wayback Machine/.test(f.text));
    expect(archiveLines).toHaveLength(1);
    expect(archiveLines[0].text).toMatch(/^Archived since 1996/); // the indicator's wording, not the assembler's
    const spfLines = report.positive.filter((f) => /SPF/.test(f.text));
    expect(spfLines).toHaveLength(1);
  });

  it("a GREEN caveat lands in the SUMMARY — never in positive[] or flagged[]", () => {
    const indicator = IND(
      "green",
      [
        { text: "Established domain — registered ~11 years ago.", source: S("RDAP", "u-rdap") },
        { text: "PhishTank was not reachable at check time; not independently cleared.", source: null, kind: "caveat" },
      ],
      "green-established-clean",
    );
    const report = assembleReport("example.com", results, { pivot: null }, indicator, NOW);

    const inFindings = [...report.positive, ...report.flagged].some((f) => /not reachable/i.test(f.text));
    expect(inFindings).toBe(false); // caveat is NOT a finding
    expect(report.flagged).toEqual([]);
    expect(report.positive[0]).toEqual({ text: "Established domain — registered ~11 years ago.", source: S("RDAP", "u-rdap") });
    expect(report.summary).toMatch(/Note:.*PhishTank.*not reachable/i); // it's a summary note
    expect(report.summary).not.toMatch(EDITORIAL);
  });
});

// ---- Story 25 (W2) ---------------------------------------------------------

const epoch = (iso: string): number => Math.floor(Date.parse(iso) / 1000);

describe("registrar transfer — a neutral dated fact (Story 25, W2)", () => {
  const withTransfer = (o: Partial<Signal>): CollectorResult[] => [
    { collector: "domain-identity", ok: true, signals: [sig("domain_transfer_date", o)] },
  ];

  it("publishes the transfer date as a bare dated fact in NEUTRAL — no connective, no companion clause", () => {
    const report = assembleReport(
      "eff.org",
      withTransfer({ valueText: "2010-08-19T00:00:00Z", valueNum: epoch("2010-08-19T00:00:00Z"), source: S("RDAP registration record", "u-rdap") }),
      { pivot: null },
      IND("amber", []),
      NOW,
    );
    expect(report.neutral?.some((f) => f.text === "Registrar transfer recorded 2010-08-19.")).toBe(true);
    // never a positive, never a flag — it feeds no verdict, neutral channel only.
    expect(report.positive.some((f) => /transfer/i.test(f.text))).toBe(false);
    expect(report.flagged.some((f) => /transfer/i.test(f.text))).toBe(false);
  });

  it("no transfer event → NOTHING is published (absence is never rendered as absence)", () => {
    const report = assembleReport(
      "example.com",
      withTransfer({ valueText: null, status: "ok", source: S("RDAP registration record", "u-rdap") }),
      { pivot: null },
      IND("amber", []),
      NOW,
    );
    expect(report.neutral?.some((f) => /transfer/i.test(f.text))).toBe(false);
  });

  it("a failed RDAP lookup does not publish a transfer line", () => {
    const report = assembleReport(
      "example.com",
      withTransfer({ valueText: null, status: "failed", source: null }),
      { pivot: null },
      IND("amber", []),
      NOW,
    );
    expect(report.neutral?.some((f) => /transfer/i.test(f.text))).toBe(false);
  });
});

describe("the Reincarnation Check — publish the pair, never suppress the span (Story 25, W2)", () => {
  // secondlibrary.com's shape: registered 2023, archived 2014, and GREEN in the
  // corpus model — the §3.4.8 over-vouching case the check exists to surface.
  const reincarnationSignals: CollectorResult[] = [
    { collector: "domain-identity", ok: true, signals: [
      sig("domain_registration_date", { valueText: "2023-10-29T07:22:28Z", valueNum: epoch("2023-10-29T07:22:28Z"), source: S("RDAP registration record", "u-rdap") }),
    ]},
    { collector: "ai-pivot", ok: true, signals: [
      sig("wayback_first", { valueText: "2014-01-03", source: S("Wayback CDX", "u-cdx") }),
    ]},
  ];
  // On Green the registration date reaches neutral as the indicator's demoted
  // observation, and the archive span is the establishing reason (→ positive).
  const greenInd = IND(
    "green",
    [
      { text: "Archived since 2014 — the Wayback Machine's record for this domain spans ~13 years (2 captures recorded).", source: S("Wayback CDX", "u-cdx") },
      { text: "Domain registered 2023-10-29. A registration date records when the domain name was first registered, not when its current operator began using it.", source: S("RDAP registration record", "u-rdap"), kind: "caveat" },
    ],
    "green-established-clean",
  );

  it("fires on a Green report: adds the archive half to NEUTRAL, reusing the registration date already there", () => {
    const report = assembleReport("secondlibrary.com", reincarnationSignals, { pivot: null }, greenInd, NOW);
    // The pair, as two independent neutral statements — no connective between them.
    expect(report.neutral?.some((f) => /^Domain registered 2023-10-29/.test(f.text))).toBe(true);
    expect(report.neutral?.some((f) => f.text === "Archived pages exist from 2014.")).toBe(true);
    // The span is NOT suppressed — it remains Green's establishing evidence.
    expect(report.positive.some((f) => /^Archived since 2014/.test(f.text))).toBe(true);
    // No editorial framing, no "despite/however/but".
    expect(report.neutral?.some((f) => /\b(despite|however|but)\b/i.test(f.text))).toBe(false);
    // The registration date is not printed twice in neutral.
    expect(report.neutral?.filter((f) => /registered 2023/i.test(f.text)).length).toBe(1);
  });

  it("supplies BOTH halves when neither is already in neutral (Green report, age < the note threshold)", () => {
    const recent: CollectorResult[] = [
      { collector: "domain-identity", ok: true, signals: [
        sig("domain_registration_date", { valueText: "2026-01-01T00:00:00Z", valueNum: epoch("2026-01-01T00:00:00Z"), source: S("RDAP registration record", "u-rdap") }),
      ]},
      { collector: "ai-pivot", ok: true, signals: [
        sig("wayback_first", { valueText: "2014-01-03", source: S("Wayback CDX", "u-cdx") }),
      ]},
    ];
    // Green: the archive span is the establishing reason (→ positive[], stated),
    // so it is NOT in neutral; and there is no registration caveat (age < the
    // note threshold). Neither half is present, so the check supplies both.
    const green = IND(
      "green",
      [{ text: "Archived since 2014 — the Wayback Machine's record for this domain spans ~13 years.", source: S("Wayback CDX", "u-cdx") }],
      "green-established-clean",
    );
    const report = assembleReport("x.com", recent, { pivot: null }, green, NOW);
    expect(report.neutral?.some((f) => f.text === "Registered 2026.")).toBe(true);
    expect(report.neutral?.some((f) => f.text === "Archived pages exist from 2014.")).toBe(true);
  });

  it("does not restate the archive fact when it is already in neutral (non-Green): the existing line completes the pair", () => {
    const recent: CollectorResult[] = [
      { collector: "domain-identity", ok: true, signals: [
        sig("domain_registration_date", { valueText: "2026-01-01T00:00:00Z", valueNum: epoch("2026-01-01T00:00:00Z"), source: S("RDAP registration record", "u-rdap") }),
      ]},
      { collector: "ai-pivot", ok: true, signals: [
        sig("wayback_first", { valueText: "2014-01-03", source: S("Wayback CDX", "u-cdx") }),
      ]},
    ];
    // Amber: gatherFindings already puts "Archived on the Wayback Machine since
    // 2014" in neutral, so the check supplies only the missing registration half.
    const report = assembleReport("x.com", recent, { pivot: null }, IND("amber", []), NOW);
    expect(report.neutral?.some((f) => f.text === "Registered 2026.")).toBe(true);
    const archiveLines = report.neutral?.filter((f) => /2014/.test(f.text) && /archived/i.test(f.text)) ?? [];
    expect(archiveLines).toHaveLength(1); // the existing line, not a duplicate
  });

  it("does NOT fire when the archive does not precede registration", () => {
    const notReincarnation: CollectorResult[] = [
      { collector: "domain-identity", ok: true, signals: [
        sig("domain_registration_date", { valueText: "2015-01-01T00:00:00Z", valueNum: epoch("2015-01-01T00:00:00Z"), source: S("RDAP registration record", "u-rdap") }),
      ]},
      { collector: "ai-pivot", ok: true, signals: [
        sig("wayback_first", { valueText: "2020-01-01", source: S("Wayback CDX", "u-cdx") }),
      ]},
    ];
    const report = assembleReport("x.com", notReincarnation, { pivot: null }, IND("amber", []), NOW);
    expect(report.neutral?.some((f) => /pages exist from/i.test(f.text))).toBe(false);
  });

  it("does NOT fire when either date's check did not complete (status guard)", () => {
    const regFailed: CollectorResult[] = [
      { collector: "domain-identity", ok: false, signals: [
        sig("domain_registration_date", { valueText: null, valueNum: null, status: "failed", source: null }),
      ]},
      { collector: "ai-pivot", ok: true, signals: [
        sig("wayback_first", { valueText: "2014-01-03", source: S("Wayback CDX", "u-cdx") }),
      ]},
    ];
    const report = assembleReport("x.com", regFailed, { pivot: null }, IND("amber", []), NOW);
    expect(report.neutral?.some((f) => /pages exist from/i.test(f.text))).toBe(false);
  });

  it("uses Common Crawl's own wording when CC is the archive instrument (no Wayback date)", () => {
    // Registered after the CC threshold crawl, present in it → CC predates
    // registration. CC never borrows Wayback's span sentence (Story 24's rule).
    const ccOnly: CollectorResult[] = [
      { collector: "domain-identity", ok: true, signals: [
        sig("domain_registration_date", { valueText: "2024-06-01T00:00:00Z", valueNum: epoch("2024-06-01T00:00:00Z"), source: S("RDAP registration record", "u-rdap") }),
      ]},
      { collector: "ai-pivot", ok: true, signals: [
        sig("wayback_first", { valueText: null, status: "failed", source: null }),
      ]},
      { collector: "common-crawl", ok: true, signals: [
        sig("cc_established", { valueText: "February/March 2024", source: S("Common Crawl", "u-cc") }),
      ]},
    ];
    const report = assembleReport("x.com", ccOnly, { pivot: null }, IND("amber", []), NOW);
    expect(report.neutral?.some((f) => f.text === "Present in Common Crawl’s February/March 2024 crawl.")).toBe(true);
    expect(report.neutral?.some((f) => /pages exist from/i.test(f.text))).toBe(false); // not Wayback's sentence
  });

  it("picks the EARLIEST archive presence that precedes registration, across instruments", () => {
    // Wayback's earliest capture is AFTER registration, but CC's point-in-time
    // presence precedes it — so the check must fire via CC, not miss because
    // Wayback happened to be checked first.
    const mixed: CollectorResult[] = [
      { collector: "domain-identity", ok: true, signals: [
        sig("domain_registration_date", { valueText: "2024-06-01T00:00:00Z", valueNum: epoch("2024-06-01T00:00:00Z"), source: S("RDAP registration record", "u-rdap") }),
      ]},
      { collector: "ai-pivot", ok: true, signals: [
        sig("wayback_first", { valueText: "2024-07-15", source: S("Wayback CDX", "u-cdx") }), // AFTER registration
      ]},
      { collector: "common-crawl", ok: true, signals: [
        sig("cc_established", { valueText: "February/March 2024", source: S("Common Crawl", "u-cc") }), // BEFORE
      ]},
    ];
    const report = assembleReport("x.com", mixed, { pivot: null }, IND("amber", []), NOW);
    expect(report.neutral?.some((f) => f.text === "Present in Common Crawl’s February/March 2024 crawl.")).toBe(true);
  });
});
