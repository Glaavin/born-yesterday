import { describe, it, expect, vi } from "vitest";
import { AI_TERMS, stripToText, matchAiTerms } from "./ai-keywords";
import { parseCdx } from "./wayback";
import { collectAiPivot, type AiPivotDeps } from "./ai-pivot";
import { signalsToHistory } from "./types";
import type { Fetcher, FetchResult } from "../lib/cached-fetch";

const fetchOk = (body: string): FetchResult => ({ ok: true, status: 200, body, fromCache: false });
const fetchFail = (): FetchResult => ({ ok: false, error: "blocked" });

describe("matchAiTerms / stripToText (pure, §2B)", () => {
  it("matches every locked term", () => {
    for (const term of AI_TERMS) {
      expect(matchAiTerms(`our product uses ${term.toLowerCase()} today`)).toContain(term);
    }
  });

  it("EXCLUDES bare 'agent' / 'agents'", () => {
    expect(matchAiTerms("our agent and our agents will help you")).toEqual([]);
  });

  it("treats AI / A.I. as word-bounded (not 'rain' / 'ukraine')", () => {
    expect(matchAiTerms("rain over ukraine and a domain")).toEqual([]);
    expect(matchAiTerms("we use AI")).toContain("AI");
    expect(matchAiTerms("our A.I. platform")).toContain("A.I.");
  });

  it("matches multi-word phrases", () => {
    expect(matchAiTerms("we love machine learning models")).toContain("machine learning");
    expect(matchAiTerms("a large language model approach")).toContain("large language model");
  });

  it("stripToText drops script/style; keeps visible text", () => {
    const html =
      "<style>.ai{color:red}</style><script>var artificialIntelligence='ai';</script><p>Hello World</p>";
    expect(stripToText(html)).toBe("hello world");
    expect(matchAiTerms(stripToText(html))).toEqual([]); // the script's 'ai' is gone
    expect(matchAiTerms(stripToText("<h1>We use AI-powered tools</h1>"))).toContain("AI-powered");
  });

  it("stripToText drops an UNCLOSED script/style body (no keyword leak)", () => {
    expect(stripToText("<p>hello</p><script>const llm = useGPT();")).toBe("hello");
    expect(matchAiTerms(stripToText("<style>.x{}</style><script>var gpt = 1"))).toEqual([]);
    expect(stripToText("<script>var gpt=1</script>real text")).toBe("real text"); // closed still works
  });
});

describe("parseCdx (pure)", () => {
  const CDX = JSON.stringify([
    ["timestamp", "original"],
    ["20180601000000", "http://example.com/"],
    ["20130101000000", "http://example.com/"],
    ["20230301000000", "http://example.com/"],
  ]);

  it("counts rows + first/last ts (sorted), dropping the header", () => {
    const p = parseCdx(CDX)!;
    expect(p).not.toBeNull();
    expect(p.count).toBe(3);
    expect(p.firstTs).toBe("20130101000000");
    expect(p.lastTs).toBe("20230301000000");
    expect(p.snapshots).toHaveLength(3);
  });

  it("PARSED-but-empty returns 0 captures — a finding", () => {
    // These parsed fine and genuinely hold no captures.
    expect(parseCdx("[]")?.count).toBe(0);
    expect(parseCdx('[["timestamp","original"]]')?.count).toBe(0);
  });

  it("UNPARSEABLE returns null, never 0 captures (docs/conventions.md)", () => {
    // The old contract returned {count: 0} here, which published as
    // "0 archived captures" — a false stated fact about a check that failed.
    expect(parseCdx("{ not json")).toBeNull();
    expect(parseCdx('{"not":"an array"}')).toBeNull();
  });
});

describe("collectAiPivot", () => {
  const CDX = JSON.stringify([
    ["timestamp", "original"],
    ["20130101000000", "http://example.com/"],
    ["20180601000000", "http://example.com/"],
    ["20230301000000", "http://example.com/"],
  ]);
  const SNAP: Record<string, string> = {
    "20130101000000": "<html><body>Welcome to our online store</body></html>",
    "20180601000000": "<html><body>We use machine learning to help</body></html>",
    "20230301000000": "<html><body>AI-powered everything now</body></html>",
  };
  const HOME = "<html><body>Now fully AI-driven</body></html>";

  const aiFetcher = (over: { cdx?: FetchResult; home?: FetchResult } = {}): Fetcher =>
    vi.fn<Fetcher>(async (o): Promise<FetchResult> => {
      if (o.url.includes("/cdx/search/")) return over.cdx ?? fetchOk(CDX);
      if (o.url.includes("id_/")) {
        const hit = Object.entries(SNAP).find(([ts]) => o.url.includes(ts));
        return hit ? fetchOk(hit[1]) : fetchFail();
      }
      return over.home ?? fetchOk(HOME); // homepage
    });

  it("HTTP 200 with a MALFORMED CDX body is 'failed', never '0 captures'", async () => {
    // The sweep's headline case: status used to come from the FETCH, so a 200
    // carrying junk published as a checked "0 archived captures".
    const r = await collectAiPivot("x.com", { fetcher: aiFetcher({ cdx: fetchOk("{ not json") }) });
    const snaps = r.signals.find((s) => s.key === "wayback_snapshot_count")!;
    expect(snaps.status).toBe("failed");
    expect(snaps.valueNum).toBeNull();
    expect(snaps.valueText).toBeNull();
    expect(snaps.source).toBeNull();
  });

  it("reports counts, the EARLIEST archived AI date (cited), and current status", async () => {
    const deps: AiPivotDeps = { fetcher: aiFetcher() };
    const r = await collectAiPivot("example.com", deps);

    expect(r.ok).toBe(true);
    const by = Object.fromEntries(r.signals.map((s) => [s.key, s]));
    // Three rows is fewer than THIN_PROBE_LIMIT, so the count is EXACT and publishes.
    expect(by.wayback_snapshot_count.valueNum).toBe(3);
    expect(by.wayback_snapshot_count.status).toBe("ok");
    expect(by.wayback_thin_archive.valueText).toBe("Thin");
    expect(by.wayback_first.valueText).toBe("2013-01-01");
    expect(by.wayback_last.valueText).toBe("2023-03-01");
    expect(by.ai_language_current.valueText).toBe("Mentions AI");
    expect(by.ai_language_current.note).toBe('matched "AI-driven"');
  });

  it("the AI-onset scan is NOT ATTEMPTED on the hot path, and cannot claim it looked", async () => {
    // B12: sampling captures needs the full list we no longer fetch, and W0 saw
    // the SECOND consecutive CDX call hang for 30s — a per-capture fan-out is
    // exactly the burst that fails. Deferred to W1's bounded sampler.
    //
    // The point of this test is the FIFTH instance of the convention: an
    // unscanned onset must never present as "we looked and found nothing".
    const r = await collectAiPivot("example.com", { fetcher: aiFetcher() });
    const onset = r.signals.find((s) => s.key === "ai_language_first_seen")!;

    expect(onset.status).toBe("not_attempted");
    expect(onset.valueText).toBeNull();
    // No source: a claim we did not make cites nothing (§6.2).
    expect(onset.source).toBeNull();
    expect(onset.note).toMatch(/deferred to async enrichment/);
  });

  it("a deep archive publishes NO count — a floor would be a permanent fake", async () => {
    // signal_history is append-only. A floored valueNum writes literal 5s for a
    // domain with thousands of captures, indistinguishable from a real count,
    // forever. The thinness ANSWER travels as a boolean instead.
    const deep = Array.from({ length: 9 }, (_, i) => [`20${10 + i}0101000000`, "http://example.com/"]);
    const r = await collectAiPivot("example.com", {
      fetcher: aiFetcher({ cdx: { ok: true, status: 200, fromCache: false, body: JSON.stringify([["timestamp", "original"], ...deep]) } }),
    });
    const by = Object.fromEntries(r.signals.map((s) => [s.key, s]));

    expect(by.wayback_snapshot_count.valueNum).toBeNull();
    expect(by.wayback_snapshot_count.valueText).toBeNull();
    expect(by.wayback_snapshot_count.status).toBe("not_attempted");
    expect(by.wayback_snapshot_count.source).toBeNull();
    // The rule still gets its answer.
    expect(by.wayback_thin_archive.status).toBe("ok");
    expect(by.wayback_thin_archive.valueText).toBe("Not thin");
  });

  it("no floored count can reach the append-only record", () => {
    // The decisive reason for the boolean. `signal_history` never rewrites, so
    // a floored valueNum would be a fake count sitting beside real ones forever,
    // with nothing in the row to tell them apart. This asserts the shape at the
    // writer, not just at the collector.
    const deep = Array.from({ length: 9 }, (_, i) => [`20${10 + i}0101000000`, "http://example.com/"]);
    return collectAiPivot("example.com", {
      fetcher: aiFetcher({ cdx: { ok: true, status: 200, fromCache: false, body: JSON.stringify([["timestamp", "original"], ...deep]) } }),
    }).then((r) => {
      const rows = signalsToHistory("example.com", r.signals, 1_700_000_000);
      const count = rows.find((x) => x.signalType === "wayback_snapshot_count")!;
      expect(count.valueNum).toBeNull();
      expect(count.valueText).toBeNull();
      expect(count.status).toBe("not_attempted");
      // and the boolean IS recorded — additive, no migration needed
      const thin = rows.find((x) => x.signalType === "wayback_thin_archive")!;
      expect(thin).toBeDefined();
      expect(thin.valueText).toBe("Not thin");
      expect(thin.status).toBe("ok");
    });
  });

  it("partial: Wayback ok but live homepage blocked → current 'not checked', still ok:true", async () => {
    const deps: AiPivotDeps = { fetcher: aiFetcher({ home: { ok: false, error: "robots-disallowed" } }) };
    const r = await collectAiPivot("example.com", deps);

    expect(r.ok).toBe(true);
    const current = r.signals.find((s) => s.key === "ai_language_current")!;
    expect(current.valueText).toBeNull();
    expect(current.note).toBe("not checked");
  });

  it("everything unreachable → ok:false, no throw", async () => {
    const deps: AiPivotDeps = {
      fetcher: vi.fn<Fetcher>(async () => {
        throw new Error("network boom");
      }),
    };
    const r = await collectAiPivot("example.com", deps);
    expect(r.ok).toBe(false);
    expect(r.signals.find((s) => s.key === "wayback_snapshot_count")!.valueNum).toBeNull();
  });
});
