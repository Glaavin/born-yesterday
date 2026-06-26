import { describe, it, expect, vi } from "vitest";
import { parseTrustpilot } from "./trustpilot";
import { parseBbb } from "./bbb";
import { webReviewSearchUrl, redditSearchUrl } from "./reputation-links";
import { collectReputation, type ReputationDeps } from "./reputation";
import type { Fetcher, FetchResult } from "../lib/cached-fetch";

const fetchOk = (body: string): FetchResult => ({ ok: true, status: 200, body, fromCache: false });
const fetchFail = (): FetchResult => ({ ok: false, error: "http", status: 403 });

const TP_HTML = `<html><head>
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"Organization","name":"Example",
 "aggregateRating":{"@type":"AggregateRating","ratingValue":"4.2","reviewCount":"1203"}}
</script></head><body>Example reviews</body></html>`;

const TP_NO_RATING = `<html><head><title>Example</title></head><body>No reviews yet</body></html>`;

const BBB_HTML = `<html><body>
<a href="https://www.bbb.org/us/ca/example/profile/software/example-app-1234-90012345">Example, Inc.</a>
<span data-x='{"rating":"A+"}'>BBB Rating: A+</span>
</body></html>`;

const BBB_NONE = `<html><body>No results found for that search.</body></html>`;

describe("parseTrustpilot (pure)", () => {
  it("reads rating + reviewCount from JSON-LD", () => {
    expect(parseTrustpilot(TP_HTML)).toEqual({ rating: 4.2, reviewCount: 1203 });
  });
  it("returns nulls when there's no rating / on a block", () => {
    expect(parseTrustpilot(TP_NO_RATING)).toEqual({ rating: null, reviewCount: null });
    expect(parseTrustpilot("<html>403 Forbidden</html>")).toEqual({ rating: null, reviewCount: null });
  });
});

describe("parseBbb (pure)", () => {
  it("extracts the grade + profile link", () => {
    expect(parseBbb(BBB_HTML)).toEqual({
      grade: "A+",
      profileUrl: "https://www.bbb.org/us/ca/example/profile/software/example-app-1234-90012345",
    });
  });
  it("returns nulls when absent", () => {
    expect(parseBbb(BBB_NONE)).toEqual({ grade: null, profileUrl: null });
  });
});

describe("reputation link-outs (pure)", () => {
  it("constructs encoded search URLs", () => {
    expect(webReviewSearchUrl("ex-ample.com")).toBe(
      "https://www.google.com/search?q=ex-ample.com%20review%20scam",
    );
    expect(redditSearchUrl("ex-ample.com")).toBe("https://www.reddit.com/search/?q=ex-ample.com");
  });
});

describe("collectReputation", () => {
  const routed = (over: Record<string, FetchResult>): Fetcher =>
    vi.fn<Fetcher>(async (opts): Promise<FetchResult> => {
      if (opts.url.includes("trustpilot.com")) return over.tp ?? fetchFail();
      if (opts.url.includes("bbb.org")) return over.bbb ?? fetchFail();
      return fetchFail();
    });

  it("both present → formatted + sourced; link-outs always present; ok:true", async () => {
    const deps: ReputationDeps = { fetcher: routed({ tp: fetchOk(TP_HTML), bbb: fetchOk(BBB_HTML) }) };
    const r = await collectReputation("example.com", deps);

    expect(r.ok).toBe(true);
    const by = Object.fromEntries(r.signals.map((s) => [s.key, s]));
    expect(by.trustpilot.valueText).toBe("4.2/5 (1,203 reviews)");
    expect(by.trustpilot.valueNum).toBe(4.2);
    expect(by.trustpilot.source).toEqual({
      label: "Trustpilot",
      url: "https://www.trustpilot.com/review/example.com",
    });
    expect(by.bbb.valueText).toBe("A+");
    expect(by.bbb.source?.url).toContain("/profile/");
    expect(by.reputation_search.source?.url).toContain("google.com/search");
    expect(by.reddit_search.source?.url).toContain("reddit.com/search");
  });

  it("Trustpilot/BBB absent or blocked → those 'Not found'; link-outs present; ok:true", async () => {
    const deps: ReputationDeps = { fetcher: routed({ tp: fetchFail(), bbb: fetchFail() }) };
    const r = await collectReputation("example.com", deps);

    expect(r.ok).toBe(true);
    const by = Object.fromEntries(r.signals.map((s) => [s.key, s]));
    expect(by.trustpilot.valueText).toBeNull();
    expect(by.trustpilot.source).toBeNull();
    expect(by.bbb.valueText).toBeNull();
    // link-outs still present + sourced
    expect(by.reputation_search.source).not.toBeNull();
    expect(by.reddit_search.source).not.toBeNull();
  });

  it("a throwing fetch degrades to 'Not found' without throwing; ok:true", async () => {
    const deps: ReputationDeps = {
      fetcher: vi.fn<Fetcher>(async () => {
        throw new Error("network boom");
      }),
    };
    const r = await collectReputation("example.com", deps);

    expect(r.ok).toBe(true);
    const by = Object.fromEntries(r.signals.map((s) => [s.key, s]));
    expect(by.trustpilot.valueText).toBeNull();
    expect(by.bbb.valueText).toBeNull();
    expect(by.reputation_search.valueText).toBe("Search the web for reviews / scam reports");
  });
});
