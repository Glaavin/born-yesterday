import { describe, it, expect, vi, afterEach } from "vitest";
import { createFetcher, USER_AGENT, type FetcherDeps, type FetchImpl } from "./cached-fetch";

// A minimal Response-like stub (status + text() + optional headers, for redirects).
const resp = (status: number, body = "", headers: Record<string, string> = {}) => ({
  status,
  text: async () => body,
  headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
});

// In-memory cache stub matching the FetcherDeps.cache shape.
function makeCache() {
  const m = new Map<string, string>();
  return {
    get: vi.fn(async (k: string) => (m.has(k) ? { payload: m.get(k)! } : null)),
    set: vi.fn(async (k: string, p: string) => void m.set(k, p)),
    _m: m,
  };
}

// Build a fetcher with sane defaults; override per test. The default resolver
// returns a PUBLIC IP so tests never touch real DNS and aren't SSRF-blocked.
function build(over: Partial<FetcherDeps> = {}) {
  const cache = over.cache ?? makeCache();
  const sleep = over.sleep ?? vi.fn(async () => {});
  const now = over.now ?? (() => 1000);
  const fetchImpl = over.fetchImpl ?? vi.fn(async () => resp(200, "BODY"));
  const resolveHost = over.resolveHost ?? vi.fn(async () => ["93.184.216.34"]);
  return {
    fetcher: createFetcher({ fetchImpl, cache, sleep, now, resolveHost }),
    fetchImpl,
    cache,
    sleep,
    now,
    resolveHost,
  };
}

const base = {
  source: "rdap",
  key: "example.com",
  url: "https://rdap.example/x",
  ttlSeconds: 60,
  kind: "third-party" as const,
};

afterEach(() => vi.useRealTimers());

describe("cached-fetch harness", () => {
  it("fetches once then serves from cache (fromCache + no second fetch)", async () => {
    const { fetcher, fetchImpl, cache } = build({
      fetchImpl: vi.fn(async () => resp(200, "BODY")),
    });

    const r1 = await fetcher(base);
    expect(r1).toEqual({ ok: true, status: 200, body: "BODY", fromCache: false });
    expect(cache.set).toHaveBeenCalledWith("rdap:example.com", "BODY", 60);

    const r2 = await fetcher(base);
    expect(r2).toEqual({ ok: true, status: 200, body: "BODY", fromCache: true });
    expect(fetchImpl).toHaveBeenCalledTimes(1); // not fetched again
  });

  it("ttlSeconds = 0 bypasses the cache (always fetches, never stores)", async () => {
    const { fetcher, fetchImpl, cache } = build({
      fetchImpl: vi.fn(async () => resp(200, "X")),
    });

    await fetcher({ ...base, ttlSeconds: 0 });
    await fetcher({ ...base, ttlSeconds: 0 });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(cache.get).not.toHaveBeenCalled();
    expect(cache.set).not.toHaveBeenCalled();
  });

  it("sends the polite UA on every request", async () => {
    const fetchImpl = vi.fn<FetchImpl>(async () => resp(200, "X"));
    const { fetcher } = build({ fetchImpl });
    await fetcher({ ...base, ttlSeconds: 0 });
    expect(fetchImpl.mock.calls[0][1]?.headers?.["user-agent"]).toBe(USER_AGENT);
  });

  it("times out: a never-resolving fetch aborts at timeoutMs → timeout, nothing cached", async () => {
    vi.useFakeTimers();
    const { fetcher, cache } = build({ fetchImpl: vi.fn<FetchImpl>(() => new Promise(() => {})) });

    const p = fetcher({ ...base, timeoutMs: 3000 });
    await vi.advanceTimersByTimeAsync(3000);
    const r = await p;

    expect(r).toEqual({ ok: false, error: "timeout" });
    expect(cache.set).not.toHaveBeenCalled();
  });

  it("honors an already-aborted external signal (deadline) without fetching", async () => {
    const ac = new AbortController();
    ac.abort();
    const fetchImpl = vi.fn<FetchImpl>(() => new Promise(() => {}));
    const { fetcher } = build({ fetchImpl });

    const r = await fetcher({ ...base, signal: ac.signal });

    expect(r).toEqual({ ok: false, error: "timeout" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("retries 429 then succeeds (backoff via injected sleep)", async () => {
    const fetchImpl = vi
      .fn<FetchImpl>()
      .mockResolvedValueOnce(resp(429))
      .mockResolvedValueOnce(resp(200, "OK"));
    const sleep = vi.fn(async () => {});
    const { fetcher, cache } = build({ fetchImpl, sleep });

    const r = await fetcher(base);

    expect(r).toEqual({ ok: true, status: 200, body: "OK", fromCache: false });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1); // one backoff between the two attempts
    expect(cache.set).toHaveBeenCalledWith("rdap:example.com", "OK", 60);
  });

  it("gives up on persistent 500 after maxRetries → http error, not cached", async () => {
    const fetchImpl = vi.fn<FetchImpl>(async () => resp(500));
    const sleep = vi.fn(async () => {});
    const { fetcher, cache } = build({ fetchImpl, sleep });

    const r = await fetcher({ ...base, maxRetries: 2 });

    expect(r).toEqual({ ok: false, error: "http", status: 500 });
    expect(fetchImpl).toHaveBeenCalledTimes(3); // initial + 2 retries
    expect(cache.set).not.toHaveBeenCalled();
  });

  it("returns a network error result (does not throw) and does not cache it", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("connection refused");
    });
    const { fetcher, cache } = build({ fetchImpl });

    const r = await fetcher({ ...base, maxRetries: 0 });

    expect(r).toEqual({ ok: false, error: "network" });
    expect(cache.set).not.toHaveBeenCalled();
  });

  it("live-site: robots Disallow blocks the target (target URL never fetched)", async () => {
    const fetchImpl = vi.fn(async (url: string) =>
      url.endsWith("/robots.txt")
        ? resp(200, "User-agent: *\nDisallow: /")
        : resp(200, "PAGE"),
    );
    const { fetcher } = build({ fetchImpl });

    const r = await fetcher({
      source: "live",
      key: "example.com",
      url: "https://example.com/",
      ttlSeconds: 0,
      kind: "live-site",
    });

    expect(r).toEqual({ ok: false, error: "robots-disallowed" });
    expect(fetchImpl).toHaveBeenCalledTimes(1); // only robots.txt
    expect(fetchImpl).toHaveBeenCalledWith("https://example.com/robots.txt", expect.anything());
  });

  it("live-site: robots allowing the path lets the fetch proceed", async () => {
    const fetchImpl = vi.fn(async (url: string) =>
      url.endsWith("/robots.txt")
        ? resp(200, "User-agent: *\nDisallow: /private")
        : resp(200, "PAGE"),
    );
    const { fetcher } = build({ fetchImpl });

    const r = await fetcher({
      source: "live",
      key: "example.com",
      url: "https://example.com/",
      ttlSeconds: 0,
      kind: "live-site",
    });

    expect(r).toEqual({ ok: true, status: 200, body: "PAGE", fromCache: false });
  });

  it("third-party ignores robots entirely (fetched even when robots would disallow)", async () => {
    const fetchImpl = vi.fn(async (url: string) =>
      url.endsWith("/robots.txt")
        ? resp(200, "User-agent: *\nDisallow: /")
        : resp(200, "DATA"),
    );
    const { fetcher } = build({ fetchImpl });

    const r = await fetcher({
      source: "tp",
      key: "k",
      url: "https://example.com/api",
      ttlSeconds: 0,
      kind: "third-party",
    });

    expect(r).toEqual({ ok: true, status: 200, body: "DATA", fromCache: false });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith("https://example.com/api", expect.anything());
  });

  it("applies a per-host minimum interval (politeness spacing)", async () => {
    let clock = 1000;
    const now = vi.fn(() => clock);
    const sleep = vi.fn(async (ms: number) => void (clock += ms));
    const fetchImpl = vi.fn(async () => resp(200, "X"));
    const { fetcher } = build({ fetchImpl, sleep, now });

    await fetcher({ ...base, ttlSeconds: 0, url: "https://h/a", minHostIntervalMs: 500 });
    await fetcher({ ...base, ttlSeconds: 0, url: "https://h/b", minHostIntervalMs: 500 });

    expect(sleep).toHaveBeenCalledWith(500); // second call waited out the interval
  });

  it("throws on programmer misuse (missing required option)", async () => {
    const { fetcher } = build();
    // @ts-expect-error — intentionally missing url
    await expect(fetcher({ source: "s", key: "k", ttlSeconds: 0, kind: "third-party" })).rejects.toThrow(
      /required/,
    );
  });

  // ---- SSRF egress hardening (Story 9.1) ----

  it.each([
    ["loopback", "127.0.0.1"],
    ["cloud metadata", "169.254.169.254"],
    ["private 10.x", "10.1.2.3"],
    ["private 192.168.x", "192.168.1.1"],
  ])("blocks a live-site host that resolves to %s (target never fetched)", async (_label, ip) => {
    const fetchImpl = vi.fn<FetchImpl>(async () => resp(200, "SECRET"));
    const resolveHost = vi.fn(async () => [ip]);
    const { fetcher, cache } = build({ fetchImpl, resolveHost });

    const r = await fetcher({
      source: "live",
      key: "evil.example",
      url: "https://evil.example/",
      ttlSeconds: 0,
      kind: "live-site",
    });

    expect(r).toEqual({ ok: false, error: "blocked" });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(cache.set).not.toHaveBeenCalled();
  });

  it("blocks an IP-literal target without any DNS resolution", async () => {
    const fetchImpl = vi.fn<FetchImpl>(async () => resp(200, "X"));
    const resolveHost = vi.fn(async () => ["93.184.216.34"]);
    const { fetcher } = build({ fetchImpl, resolveHost });

    const r = await fetcher({
      source: "tp",
      key: "k",
      url: "http://169.254.169.254/latest/meta-data/",
      ttlSeconds: 0,
      kind: "third-party",
    });

    expect(r).toEqual({ ok: false, error: "blocked" });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(resolveHost).not.toHaveBeenCalled(); // it's a literal — no resolve needed
  });

  it("blocks a redirect to an internal host; the post-redirect host is re-validated", async () => {
    // hop 0 (public) → 302 to the metadata IP; hop 1 must be blocked before fetching.
    const fetchImpl = vi.fn<FetchImpl>(async (url) => {
      if (url === "https://api.example/")
        return resp(302, "", { location: "http://169.254.169.254/" });
      return resp(200, "SHOULD-NOT-HAPPEN");
    });
    const resolveHost = vi.fn(async () => ["93.184.216.34"]); // api.example is public
    const { fetcher, cache } = build({ fetchImpl, resolveHost });

    const r = await fetcher({
      source: "tp",
      key: "api.example",
      url: "https://api.example/",
      ttlSeconds: 60,
      kind: "third-party",
    });

    expect(r).toEqual({ ok: false, error: "blocked" });
    expect(fetchImpl).toHaveBeenCalledTimes(1); // only hop 0; the internal hop was never fetched
    expect(cache.set).not.toHaveBeenCalled();
  });

  it("follows a redirect to a public host and re-checks robots (live-site)", async () => {
    const fetchImpl = vi.fn<FetchImpl>(async (url) => {
      switch (url) {
        case "https://a.example/robots.txt":
          return resp(200, "User-agent: *\nAllow: /");
        case "https://a.example/":
          return resp(301, "", { location: "https://b.example/" });
        case "https://b.example/robots.txt":
          return resp(200, "User-agent: *\nAllow: /");
        case "https://b.example/":
          return resp(200, "FINAL");
        default:
          return resp(500, "unexpected " + url);
      }
    });
    const resolveHost = vi.fn(async () => ["93.184.216.34"]); // both public
    const { fetcher } = build({ fetchImpl, resolveHost });

    const r = await fetcher({
      source: "live",
      key: "a.example",
      url: "https://a.example/",
      ttlSeconds: 0,
      kind: "live-site",
    });

    expect(r).toEqual({ ok: true, status: 200, body: "FINAL", fromCache: false });
    // robots re-checked at the redirect target:
    expect(fetchImpl).toHaveBeenCalledWith("https://b.example/robots.txt", expect.anything());
  });

  it("returns a network error (does not throw) for a malformed/relative URL", async () => {
    const fetchImpl = vi.fn<FetchImpl>(async () => resp(200, "X"));
    const { fetcher } = build({ fetchImpl });

    const r = await fetcher({
      source: "s",
      key: "k",
      url: "/not-absolute",
      ttlSeconds: 0,
      kind: "third-party",
    });

    expect(r).toEqual({ ok: false, error: "network" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("does not let an empty User-agent robots group override '*'", async () => {
    const fetchImpl = vi.fn<FetchImpl>(async (url) => {
      if (url.endsWith("/robots.txt"))
        // empty-UA group disallows all; '*' group allows the path
        return resp(200, "User-agent:\nDisallow: /\n\nUser-agent: *\nDisallow: /private");
      return resp(200, "PAGE");
    });
    const { fetcher } = build({ fetchImpl });

    const r = await fetcher({
      source: "live",
      key: "example.com",
      url: "https://example.com/",
      ttlSeconds: 0,
      kind: "live-site",
    });

    expect(r).toEqual({ ok: true, status: 200, body: "PAGE", fromCache: false });
  });
});
