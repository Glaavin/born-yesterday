import { describe, it, expect, vi } from "vitest";
import { AI_TERMS, stripToText, matchAiTerms } from "./ai-keywords";
import { parseCdx } from "./wayback";
import { collectAiPivot, type AiPivotDeps } from "./ai-pivot";
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
    const p = parseCdx(CDX);
    expect(p.count).toBe(3);
    expect(p.firstTs).toBe("20130101000000");
    expect(p.lastTs).toBe("20230301000000");
    expect(p.snapshots).toHaveLength(3);
  });

  it("returns empty on empty / header-only / malformed", () => {
    expect(parseCdx("[]").count).toBe(0);
    expect(parseCdx('[["timestamp","original"]]').count).toBe(0);
    expect(parseCdx("{ not json").count).toBe(0);
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

  it("reports counts, the EARLIEST archived AI date (cited), and current status", async () => {
    const deps: AiPivotDeps = { fetcher: aiFetcher() };
    const r = await collectAiPivot("example.com", deps);

    expect(r.ok).toBe(true);
    const by = Object.fromEntries(r.signals.map((s) => [s.key, s]));
    expect(by.wayback_snapshot_count.valueNum).toBe(3);
    expect(by.wayback_first.valueText).toBe("2013-01-01");
    expect(by.wayback_last.valueText).toBe("2023-03-01");
    // earliest sampled snapshot with AI language is 2018 (machine learning), not 2023
    expect(by.ai_language_first_seen.valueText).toBe("2018-06-01");
    expect(by.ai_language_first_seen.note).toBe('matched "machine learning"');
    expect(by.ai_language_first_seen.source?.url).toContain("20180601000000id_/");
    expect(by.ai_language_current.valueText).toBe("Mentions AI");
    expect(by.ai_language_current.note).toBe('matched "AI-driven"');
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
