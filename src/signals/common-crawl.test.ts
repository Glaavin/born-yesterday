import { describe, it, expect, vi } from "vitest";
import { fetchCcPresence, collectCommonCrawl, ccIndexUrl, CC_THRESHOLD_CRAWL } from "./common-crawl";
import type { Fetcher, FetchResult } from "../lib/cached-fetch";

const fetcherReturning = (r: FetchResult): Fetcher => vi.fn(async () => r);

describe("Common Crawl establishment (Story 24)", () => {
  it("200 with an NDJSON row → present", async () => {
    const f = fetcherReturning({ ok: true, status: 200, body: '{"url":"x","timestamp":"20240301"}', fromCache: false });
    expect(await fetchCcPresence("x.com", f)).toBe("present");
  });

  it("404 → absent (the genuine 'No Captures found', a real answer)", async () => {
    const f = fetcherReturning({ ok: false, error: "http", status: 404 });
    expect(await fetchCcPresence("x.com", f)).toBe("absent");
  });

  it("a 5xx → failed, never 'absent' (observation-failure convention)", async () => {
    const f = fetcherReturning({ ok: false, error: "http", status: 503 });
    expect(await fetchCcPresence("x.com", f)).toBe("failed");
  });

  it("a timeout → failed", async () => {
    expect(await fetchCcPresence("x.com", fetcherReturning({ ok: false, error: "timeout" }))).toBe("failed");
  });

  it("rate-limited → failed, not absent", async () => {
    expect(await fetchCcPresence("x.com", fetcherReturning({ ok: false, error: "rate-limited" }))).toBe("failed");
  });

  it("a 200 whose body is not the expected NDJSON → failed, not present", async () => {
    const f = fetcherReturning({ ok: true, status: 200, body: "<html>oops</html>", fromCache: false });
    expect(await fetchCcPresence("x.com", f)).toBe("failed");
  });

  it("collector: present → cc_established ok with the crawl label and a source", async () => {
    const f = fetcherReturning({ ok: true, status: 200, body: '{"url":"x"}', fromCache: false });
    const r = await collectCommonCrawl("x.com", { fetcher: f });
    const s = r.signals[0];
    expect(s.key).toBe("cc_established");
    expect(s.status).toBe("ok");
    expect(s.valueText).not.toBeNull();
    expect(s.source?.url).toBe(ccIndexUrl(CC_THRESHOLD_CRAWL, "x.com"));
  });

  it("collector: absent → cc_established ok, valueText null, still SOURCED (we did check)", async () => {
    const r = await collectCommonCrawl("x.com", { fetcher: fetcherReturning({ ok: false, error: "http", status: 404 }) });
    const s = r.signals[0];
    expect(s.status).toBe("ok");
    expect(s.valueText).toBeNull();
    expect(s.source).not.toBeNull();
  });

  it("collector: failed → cc_established failed, no source", async () => {
    const r = await collectCommonCrawl("x.com", { fetcher: fetcherReturning({ ok: false, error: "timeout" }) });
    const s = r.signals[0];
    expect(s.status).toBe("failed");
    expect(s.source).toBeNull();
  });
});
