import { describe, it, expect, vi } from "vitest";
import { parseRdap } from "./rdap";
import { parseWhois } from "./whois";
import { collectDomainIdentity, type DomainIdentityDeps } from "./domain-identity";
import { signalsToHistory, type Signal } from "./types";
import type { Fetcher, FetchResult } from "../lib/cached-fetch";

// ---- fixtures (real-shaped, trimmed) ----

const RDAP_COM = JSON.stringify({
  objectClassName: "domain",
  ldhName: "EXAMPLE.COM",
  events: [
    { eventAction: "registration", eventDate: "1997-09-15T04:00:00Z" },
    { eventAction: "expiration", eventDate: "2028-09-14T04:00:00Z" },
    { eventAction: "last changed", eventDate: "2023-08-14T07:01:34Z" },
  ],
  entities: [
    {
      roles: ["registrar"],
      vcardArray: [
        "vcard",
        [
          ["version", {}, "text", "4.0"],
          ["fn", {}, "text", "MarkMonitor Inc."],
        ],
      ],
    },
  ],
});

const RDAP_IO = JSON.stringify({
  objectClassName: "domain",
  events: [{ eventAction: "registration", eventDate: "2013-06-20T00:00:00Z" }],
  entities: [
    { roles: ["registrar"], vcardArray: ["vcard", [["fn", {}, "text", "Gandi SAS"]]] },
  ],
});

const RDAP_MISSING = JSON.stringify({
  events: [{ eventAction: "last changed", eventDate: "2020-01-01T00:00:00Z" }],
  entities: [{ roles: ["registrant"] }],
});

const WHOIS_COM = `Domain Name: EXAMPLE.COM
Registry Domain ID: 2336799_DOMAIN_COM-VRSN
Registrar WHOIS Server: whois.markmonitor.com
Registrar URL: http://www.markmonitor.com
Registrar: MarkMonitor Inc.
Creation Date: 1997-09-15T04:00:00Z
Registrar IANA ID: 292
`;

const WHOIS_GENERIC = `domain:       example.org
registrar:    Gandi SAS
created:      2015-01-02
source:       EXAMPLE
`;

const WHOIS_AMBIGUOUS = `This TLD has no whois server, but you can access the whois
database for it at http://example.test/
`;

// FetchResult helpers
const fetchOk = (body: string): FetchResult => ({ ok: true, status: 200, body, fromCache: false });
const fetchFail = (): FetchResult => ({ ok: false, error: "http", status: 404 });

function baseDeps(over: Partial<DomainIdentityDeps> = {}): DomainIdentityDeps {
  const m = new Map<string, string>();
  return {
    fetcher: over.fetcher ?? (vi.fn(async () => fetchOk(RDAP_COM)) as unknown as Fetcher),
    cache: over.cache ?? {
      get: vi.fn(async (k: string) => (m.has(k) ? { payload: m.get(k)! } : null)),
      set: vi.fn(async (k: string, p: string) => void m.set(k, p)),
    },
    whoisQuery: over.whoisQuery ?? vi.fn(async () => WHOIS_COM),
    now: over.now ?? (() => Date.parse("2024-01-01T00:00:00Z")),
  };
}

describe("parseRdap (pure)", () => {
  it("extracts registration date + registrar from a .com record", () => {
    expect(parseRdap(RDAP_COM)).toEqual({
      registrationDate: "1997-09-15T04:00:00Z",
      registrar: "MarkMonitor Inc.",
    });
  });

  it("handles a leaner record shape (.io)", () => {
    expect(parseRdap(RDAP_IO)).toEqual({
      registrationDate: "2013-06-20T00:00:00Z",
      registrar: "Gandi SAS",
    });
  });

  it("returns nulls when fields are absent — never guesses", () => {
    expect(parseRdap(RDAP_MISSING)).toEqual({ registrationDate: null, registrar: null });
  });

  it("does not throw on malformed JSON", () => {
    expect(parseRdap("{ not json")).toEqual({ registrationDate: null, registrar: null });
  });
});

describe("parseWhois (pure)", () => {
  it("parses a verisign-style .com response (ignoring Registrar URL/WHOIS Server lines)", () => {
    expect(parseWhois(WHOIS_COM)).toEqual({
      registrationDate: "1997-09-15T04:00:00.000Z",
      registrar: "MarkMonitor Inc.",
    });
  });

  it("parses a lowercase 'created:'/'registrar:' format", () => {
    expect(parseWhois(WHOIS_GENERIC)).toEqual({
      registrationDate: "2015-01-02T00:00:00.000Z",
      registrar: "Gandi SAS",
    });
  });

  it("returns nulls for an ambiguous response", () => {
    expect(parseWhois(WHOIS_AMBIGUOUS)).toEqual({ registrationDate: null, registrar: null });
  });
});

describe("collectDomainIdentity", () => {
  it("RDAP success path: sourced to RDAP, no WHOIS fallback, age derived", async () => {
    const whoisQuery = vi.fn(async () => WHOIS_COM);
    const deps = baseDeps({
      fetcher: vi.fn(async () => fetchOk(RDAP_COM)) as unknown as Fetcher,
      whoisQuery,
    });

    const r = await collectDomainIdentity("example.com", deps);

    expect(r.ok).toBe(true);
    expect(whoisQuery).not.toHaveBeenCalled(); // RDAP supplied both → no fallback

    const date = r.signals.find((s) => s.key === "domain_registration_date")!;
    expect(date.valueText).toBe("1997-09-15T04:00:00Z");
    expect(date.valueNum).toBe(Math.floor(Date.parse("1997-09-15T04:00:00Z") / 1000));
    expect(date.source).toEqual({
      label: "RDAP registration record",
      url: "https://rdap.org/domain/example.com",
    });
    expect(date.note).toBeUndefined();

    const reg = r.signals.find((s) => s.key === "registrar")!;
    expect(reg.valueText).toBe("MarkMonitor Inc.");
  });

  it("derives domain_age_days from registration to now", async () => {
    const deps = baseDeps({
      fetcher: vi.fn(async () =>
        fetchOk(
          JSON.stringify({
            events: [{ eventAction: "registration", eventDate: "2023-01-01T00:00:00Z" }],
            entities: [],
          }),
        ),
      ) as unknown as Fetcher,
      now: () => Date.parse("2024-01-01T00:00:00Z"), // exactly 365 days later
    });

    const r = await collectDomainIdentity("example.com", deps);
    const age = r.signals.find((s) => s.key === "domain_age_days")!;
    expect(age.valueNum).toBe(365);
  });

  it("falls back to WHOIS when RDAP fails, and marks the note", async () => {
    const whoisQuery = vi.fn(async () => WHOIS_COM);
    const deps = baseDeps({
      fetcher: vi.fn(async () => fetchFail()) as unknown as Fetcher, // RDAP 404 (uncovered TLD)
      whoisQuery,
    });

    const r = await collectDomainIdentity("example.com", deps);

    expect(r.ok).toBe(true);
    expect(whoisQuery).toHaveBeenCalled();

    const date = r.signals.find((s) => s.key === "domain_registration_date")!;
    expect(date.valueText).toBe("1997-09-15T04:00:00.000Z");
    expect(date.source).toEqual({ label: "WHOIS", url: "https://www.whois.com/whois/example.com" });
    expect(date.note).toBe("via WHOIS fallback");
  });

  it("both sources fail: ok:false with null values, and does NOT throw", async () => {
    const deps = baseDeps({
      fetcher: vi.fn(async () => fetchFail()) as unknown as Fetcher,
      whoisQuery: vi.fn(async () => {
        throw new Error("socket refused");
      }),
    });

    const r = await collectDomainIdentity("nope.invalidtld", deps);

    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/not found/i);
    for (const s of r.signals) {
      expect(s.valueText).toBeNull();
      expect(s.valueNum).toBeNull();
      expect(s.source).toBeNull();
    }
  });
});

describe("signalsToHistory (pure)", () => {
  it("maps key→signal_type, text/num, and drops sources + all-null signals", () => {
    const signals: Signal[] = [
      {
        key: "domain_registration_date",
        label: "Registration date",
        valueText: "1997-09-15T04:00:00Z",
        valueNum: 874296000,
        source: { label: "RDAP registration record", url: "https://rdap.org/domain/example.com" },
      },
      { key: "domain_age_days", label: "Domain age (days)", valueText: null, valueNum: 9605, source: null },
      { key: "registrar", label: "Registrar", valueText: null, valueNum: null, source: null }, // dropped
    ];

    const rows = signalsToHistory("example.com", signals, 1700000000);

    expect(rows).toEqual([
      {
        domain: "example.com",
        capturedAt: 1700000000,
        signalType: "domain_registration_date",
        valueText: "1997-09-15T04:00:00Z",
        valueNum: 874296000,
      },
      {
        domain: "example.com",
        capturedAt: 1700000000,
        signalType: "domain_age_days",
        valueText: null,
        valueNum: 9605,
      },
    ]);
  });
});
