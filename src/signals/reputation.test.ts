import { describe, it, expect, vi } from "vitest";
import { parseTrustpilot } from "./trustpilot";
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

describe("parseTrustpilot (pure)", () => {
  it("reads rating + reviewCount from JSON-LD", () => {
    expect(parseTrustpilot(TP_HTML)).toEqual({ rating: 4.2, reviewCount: 1203 });
  });
  it("returns nulls when there's no rating / on a block", () => {
    expect(parseTrustpilot(TP_NO_RATING)).toEqual({ rating: null, reviewCount: null });
    expect(parseTrustpilot("<html>403 Forbidden</html>")).toEqual({ rating: null, reviewCount: null });
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
  // BBB is now a link-out (decision A) — only Trustpilot is fetched.
  const tpFetcher = (tp: FetchResult): Fetcher =>
    vi.fn<Fetcher>(async (opts): Promise<FetchResult> =>
      opts.url.includes("trustpilot.com") ? tp : fetchFail(),
    );

  it("Trustpilot present → formatted + sourced; BBB is a link-out; ok:true", async () => {
    const r = await collectReputation("example.com", { fetcher: tpFetcher(fetchOk(TP_HTML)) });

    expect(r.ok).toBe(true);
    const by = Object.fromEntries(r.signals.map((s) => [s.key, s]));
    expect(by.trustpilot.valueText).toBe("4.2/5 (1,203 reviews)");
    expect(by.trustpilot.valueNum).toBe(4.2);
    expect(by.trustpilot.source).toEqual({
      label: "Trustpilot",
      url: "https://www.trustpilot.com/review/example.com",
    });
    // BBB: a link-out, never a scraped grade
    expect(by.bbb.valueText).toBe("Check BBB for this domain");
    expect(by.bbb.source?.url).toBe("https://www.bbb.org/search?find_text=example.com");
    expect(by.reputation_search.source?.url).toContain("google.com/search");
    expect(by.reddit_search.source?.url).toContain("reddit.com/search");
  });

  it("Trustpilot blocked → 'Not found'; BBB + link-outs still present; ok:true", async () => {
    const r = await collectReputation("example.com", { fetcher: tpFetcher(fetchFail()) });

    expect(r.ok).toBe(true);
    const by = Object.fromEntries(r.signals.map((s) => [s.key, s]));
    expect(by.trustpilot.valueText).toBeNull();
    expect(by.trustpilot.source).toBeNull();
    expect(by.bbb.source).not.toBeNull(); // link-out always present
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
    expect(by.bbb.valueText).toBe("Check BBB for this domain");
    expect(by.reputation_search.valueText).toBe("Search the web for reviews / scam reports");
  });
});
