import { cacheGet, cacheSet } from "../db/queries";
import { hostAllowed } from "./ssrf";

/**
 * cached-fetch — the SINGLE outbound HTTP path every Helium signal collector
 * rides (mvp-spec §3 caching, §4 services, §6 timeouts, §10 politeness/robots).
 *
 * Content-agnostic: returns the response body as text + status; callers parse
 * JSON/HTML themselves. Bakes in the polite UA, exponential backoff, robots.txt
 * respect (live-site only), and SSRF egress protection so no collector can
 * forget them.
 *
 * Failures RETURN an error result (never throw) so one bad source can't kill a
 * report (partial-reports-OK), and failures are NEVER cached. Throwing is
 * reserved for programmer misuse (missing required option).
 *
 * Dependency-injected for testing: `createFetcher(deps)` with stubbed
 * fetchImpl/cache/sleep/now/resolveHost → unit tests run with no network/no DB.
 */

/** Polite identification for every outbound request (mvp-spec §10). */
export const USER_AGENT =
  "BornYesterdayBot/1.0 (+https://bornyesterday.tech/about-bot)";

/** Product token used to match robots.txt User-agent groups. */
const UA_TOKEN = "bornyesterdaybot";

const DEFAULT_TIMEOUT_MS = 3000;
const DEFAULT_MAX_RETRIES = 2;
const BACKOFF_BASE_MS = 250;
/** robots.txt is cached (so it isn't re-fetched per call). */
const ROBOTS_TTL_SECONDS = 60 * 60 * 24;
/** Maximum redirect hops we'll follow (each re-validated). */
const MAX_REDIRECTS = 3;
/** Default response-size cap — untrusted HTML is not buffered beyond this. */
const DEFAULT_MAX_BYTES = 5 * 1024 * 1024; // 5 MB
/** Only these URL schemes are ever fetched (defense-in-depth vs file:/gopher:/data:). */
const ALLOWED_SCHEMES = new Set(["http:", "https:"]);

/* ============================================================================
   PER-HOST POLITENESS BUDGET
   ----------------------------------------------------------------------------
   A cap on CONCURRENT in-flight calls per host, applied to every collector
   uniformly so no source story has to reimplement burst protection.

   Each budget carries its BASIS, the way the rubric constants do:
     MEASURED — W0 or production sized it
     REASONED — a judgement from adjacent evidence

   THE DEFAULT IS NO LIMIT, deliberately. DNS, RDAP and the threat feeds have
   never demonstrated a burst problem, and inventing a constraint for a source
   that has not shown one costs latency and buys nothing.

   NO RETRIES ANYWHERE NEAR THIS. W0's evidence is that a throttled Wayback call
   HANGS rather than refusing — you pay the full timeout to learn nothing — so a
   retry is a second full timeout, not a second chance.
   ========================================================================== */
export interface HostBudget {
  /** Maximum concurrent in-flight calls to this host. */
  max: number;
  basis: "MEASURED" | "REASONED";
  why: string;
}

export const HOST_BUDGETS: Readonly<Record<string, HostBudget>> = {
  "web.archive.org": {
    max: 1,
    basis: "MEASURED",
    why: "W0: the second consecutive CDX call hung for 30s with no response. Production confirmed it — call 2 succeeded 1 of 4 while call 1 succeeded 3 of 4.",
  },
  "archive.org": {
    max: 1,
    basis: "MEASURED",
    why: "Same operator and same throttle as web.archive.org; the Availability API answered in 364ms but shares the budget rather than being assumed exempt.",
  },
  "index.commoncrawl.org": {
    max: 1,
    basis: "REASONED",
    why: "W0: single lookups were 358-394ms, but the 5-call monthly walk degraded to a 502 and a 13.6s response. Sequence behaviour is the pattern Story 24 would depend on, so it gets a budget before it gets traffic — not after.",
  },
};

/**
 * In-flight counts per host. Per-instance and best-effort: serverless memory is
 * ephemeral, so this bounds a single function instance rather than the fleet.
 * That is the right scope for the failure we measured — the burst that hurt us
 * was one report making consecutive calls, not many reports colliding.
 */
const inFlight = new Map<string, number>();

/* ============================================================================
   PER-HOST RATE LIMITER (Story 23.2) — CALLS PER MINUTE, alongside (not
   replacing) the concurrency budget above. Both constraints apply.
   ----------------------------------------------------------------------------
   THE DEFECT THIS FIXES: the concurrency budget prevents SIMULTANEOUS calls,
   which was never the constraint. Seven SEQUENTIAL calls to Common Crawl (each
   one-in-flight, satisfying the budget completely) tripped a 503 wall in
   Story 24 Q1. Both archive hosts rate-limit per minute.

   ALGORITHM: token bucket per host. Composes naturally with the concurrency
   budget — the budget gates the instantaneous slot, the bucket gates the rate.
   Refills continuously at `ratePerMin`; `burst` is the bucket capacity.

   VALUES ARE REASONED, NOT MEASURED. We have no measured limit for either host,
   only ONE observation (CC 503 at 7 sequential). Err SLOW: pre-traffic, a
   too-slow limiter costs nothing, while too-fast risks archive.org's hour-long
   firewall block (which doubles on repeat). So both are set well below the
   softest published community figure.

   FAIL FAST, NEVER WAIT — see the deadline reasoning at the call site. And
   NEVER RETRY into a 429/503 (Story 23's rule); instead a 429/503 ARMS A
   COOLDOWN so subsequent calls to that host defer rather than pile on.

   PER-INSTANCE, BEST-EFFORT — same limitation as the concurrency budget above.
   Serverless memory is ephemeral, so this bounds ONE warm instance, not the
   fleet. That is the exact scenario that tripped the 503 (one instance firing a
   sequence) and the exact scenario Story 24's verification reproduces; a
   fan-out across many cold instances is not bounded, and honestly cannot be
   without shared state we are not adding pre-traffic.
   ========================================================================== */
export interface HostRate {
  /** Sustained calls per minute. */
  ratePerMin: number;
  /** Bucket capacity — the largest instantaneous burst allowed. */
  burst: number;
  basis: "MEASURED" | "REASONED";
  why: string;
}

export const HOST_RATES: Readonly<Record<string, HostRate>> = {
  "web.archive.org": {
    ratePerMin: 15,
    burst: 3,
    basis: "REASONED",
    why: "The maintained `wayback` library dropped its default to 24/min in June 2026 to match Wayback's hard limits; we sit below that. Exceeding earns an hour-long firewall block, so err slow.",
  },
  "archive.org": {
    ratePerMin: 15,
    burst: 3,
    basis: "REASONED",
    why: "Same operator and limit as web.archive.org (Availability API shares the host).",
  },
  "index.commoncrawl.org": {
    ratePerMin: 10,
    burst: 2,
    basis: "REASONED",
    why: "Limit unpublished; one observation — 503 at 7 sequential calls (Story 24 Q1). 10/min is conservative below that single sample; NOT to be read as 'the limit is ~10'.",
  },
};

/** 429 is the escalating one (hour-block on repeat) → a long hard stop. */
const RATE_429_COOLDOWN_MS = 5 * 60 * 1000; // REASONED — err long
/** 503 is the softer 'slow down' → a short stop. */
const RATE_503_COOLDOWN_MS = 60 * 1000; // REASONED

interface Bucket {
  tokens: number;
  lastRefillMs: number;
  /** While `now < blockedUntilMs`, every call to this host defers (a 429/503 armed it). */
  blockedUntilMs: number;
}
const buckets = new Map<string, Bucket>();

/** Consume one token, or return false to defer. Never blocks. */
function takeRate(host: string, nowMs: number): boolean {
  const cfg = HOST_RATES[host];
  if (!cfg) return true; // unconfigured host → no rate limit imposed
  const b = buckets.get(host) ?? { tokens: cfg.burst, lastRefillMs: nowMs, blockedUntilMs: 0 };
  if (nowMs < b.blockedUntilMs) {
    buckets.set(host, b);
    return false; // in a 429/503 cooldown
  }
  const refill = ((nowMs - b.lastRefillMs) / 60_000) * cfg.ratePerMin;
  b.tokens = Math.min(cfg.burst, b.tokens + refill);
  b.lastRefillMs = nowMs;
  if (b.tokens < 1) {
    buckets.set(host, b);
    return false;
  }
  b.tokens -= 1;
  buckets.set(host, b);
  return true;
}

/**
 * A 429/503 from the host feeds back: arm a cooldown so we slow down rather than
 * continue at the configured rate. NOT a retry — the response is still returned
 * to the caller as-is; this only governs FUTURE calls to the host.
 */
function armRateCooldown(host: string, status: number, nowMs: number): void {
  const cfg = HOST_RATES[host];
  if (!cfg) return;
  const b = buckets.get(host) ?? { tokens: cfg.burst, lastRefillMs: nowMs, blockedUntilMs: 0 };
  const cooldown = status === 429 ? RATE_429_COOLDOWN_MS : RATE_503_COOLDOWN_MS;
  b.blockedUntilMs = Math.max(b.blockedUntilMs, nowMs + cooldown);
  b.tokens = 0;
  buckets.set(host, b);
}

function takeBudget(host: string): boolean {
  const budget = HOST_BUDGETS[host];
  if (!budget) return true; // no limit declared → no limit imposed
  const n = inFlight.get(host) ?? 0;
  if (n >= budget.max) return false;
  inFlight.set(host, n + 1);
  return true;
}

function releaseBudget(host: string): void {
  if (!HOST_BUDGETS[host]) return;
  const n = inFlight.get(host) ?? 0;
  if (n <= 1) inFlight.delete(host);
  else inFlight.set(host, n - 1);
}

/** Test-only: reset the in-flight table AND the rate buckets between cases. */
export function __resetBudgets(): void {
  inFlight.clear();
  buckets.clear();
}

function concatChunks(parts: Uint8Array[]): Uint8Array {
  let len = 0;
  for (const p of parts) len += p.byteLength;
  const out = new Uint8Array(len);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.byteLength;
  }
  return out;
}

/**
 * Read a response body, stopping at maxBytes. Uses the byte stream when present
 * (real fetch) so we never buffer unbounded untrusted HTML — cancelling the
 * reader on overflow closes the connection. Stubs without a stream fall back to
 * text() and truncate (char-approximate).
 */
async function readBodyCapped(
  res: FetchLikeResponse,
  maxBytes: number,
): Promise<{ text: string; truncated: boolean }> {
  const stream = res.body;
  if (stream && typeof stream.getReader === "function") {
    const reader = stream.getReader();
    const parts: Uint8Array[] = [];
    let total = 0;
    let truncated = false;
    // A mid-stream read error is NOT swallowed: it propagates so the caller can
    // surface a network failure rather than mis-scanning a partial body as
    // complete (Story 15.1).
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      const remaining = maxBytes - total;
      if (value.byteLength >= remaining) {
        parts.push(value.subarray(0, Math.max(0, remaining)));
        truncated = true;
        await reader.cancel().catch(() => {});
        break;
      }
      parts.push(value);
      total += value.byteLength;
    }
    return { text: new TextDecoder().decode(concatChunks(parts)), truncated };
  }
  const full = await res.text();
  return full.length > maxBytes
    ? { text: full.slice(0, maxBytes), truncated: true }
    : { text: full, truncated: false };
}

export type FetchResult =
  | { ok: true; status: number; body: string; fromCache: boolean; truncated?: boolean }
  | {
      ok: false;
      /**
       * `budget-exhausted` is WE CHOSE NOT TO CALL. It is deliberately distinct
       * from `timeout`, which is we called and nothing came back — the
       * observation-failure convention applies to our own refusals too, and a
       * caller that cannot tell them apart cannot report honestly.
       */
      /**
       * `rate-limited` is WE DEFERRED TO STAY UNDER A PER-MINUTE LIMIT (Story
       * 23.2). A THIRD distinct outcome alongside `budget-exhausted` (we chose
       * not to make a concurrent call) and `timeout` (we called and nothing came
       * back). The observation-failure convention forbids collapsing them.
       */
      error: "timeout" | "http" | "network" | "robots-disallowed" | "blocked" | "budget-exhausted" | "rate-limited";
      status?: number;
    };

export interface FetchOptions {
  /** Logical source name (e.g. "rdap", "crtsh"); part of the cache key. */
  source: string;
  /** Per-source identity (e.g. the domain); part of the cache key. */
  key: string;
  /** Absolute URL to fetch. */
  url: string;
  /** Cache TTL in seconds. 0 = do NOT cache (always fetch). */
  ttlSeconds: number;
  /** 'third-party' (Wayback/crt.sh/DoH/threat lists) skips robots; 'live-site' honors it. */
  kind: "third-party" | "live-site";
  method?: string;
  headers?: Record<string, string>;
  /** Request body (e.g. a form-encoded POST). */
  body?: string;
  /** Report-level deadline (Story 16's 8s budget). Aborts the call if it fires. */
  signal?: AbortSignal;
  /** Per-call abort, default 3000ms. */
  timeoutMs?: number;
  /** Retries on 429/5xx, default 2. */
  maxRetries?: number;
  /** Best-effort per-host minimum spacing (politeness). */
  minHostIntervalMs?: number;
  /** Max response bytes to read before stopping (default 5 MB). Untrusted HTML. */
  maxBytes?: number;
}

/** A minimal Response shape — real `fetch` Response satisfies it structurally. */
interface FetchLikeResponse {
  status: number;
  text(): Promise<string>;
  /** Optional byte stream (real fetch has it); enables the size cap without
   *  buffering. Stubs without it fall back to text() + truncate. */
  body?: ReadableStream<Uint8Array> | null;
  headers?: { get(name: string): string | null };
}

export type FetchImpl = (
  url: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
    redirect?: "manual" | "follow" | "error";
  },
) => Promise<FetchLikeResponse>;

export interface FetcherDeps {
  fetchImpl: FetchImpl;
  cache: {
    get(key: string): Promise<{ payload: string } | null>;
    set(key: string, payload: string, ttlSeconds: number): Promise<void>;
  };
  /** Used for backoff waits (injected so tests don't really sleep). */
  sleep: (ms: number) => Promise<void>;
  /** Monotonic-ish clock in MILLISECONDS, for the per-host interval map. */
  now: () => number;
  /** Resolve a hostname to its IP strings (injected so SSRF checks need no network). */
  resolveHost: (host: string) => Promise<string[]>;
}

export type Fetcher = (opts: FetchOptions) => Promise<FetchResult>;

// ---- small helpers ---------------------------------------------------------

const normalizeKey = (source: string, key: string): string =>
  `${source}:${key}`.trim().toLowerCase();

const backoffMs = (attempt: number): number =>
  BACKOFF_BASE_MS * 2 ** attempt + Math.floor(Math.random() * BACKOFF_BASE_MS);

function isAbortError(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "name" in e &&
    ((e as { name: unknown }).name === "AbortError" ||
      (e as { name: unknown }).name === "TimeoutError")
  );
}

function anySignal(signals: AbortSignal[]): AbortSignal {
  const native = (AbortSignal as { any?: (s: AbortSignal[]) => AbortSignal }).any;
  if (typeof native === "function") return native(signals);
  const ctrl = new AbortController();
  for (const s of signals) {
    if (s.aborted) {
      ctrl.abort();
      break;
    }
    s.addEventListener("abort", () => ctrl.abort(), { once: true });
  }
  return ctrl.signal;
}

function onAbort(signal: AbortSignal): Promise<void> {
  return new Promise<void>((resolve) => {
    if (signal.aborted) return resolve();
    signal.addEventListener("abort", () => resolve(), { once: true });
  });
}

// ---- robots.txt (minimal, live-site only) ----------------------------------

function selectRules(
  txt: string,
  uaToken: string,
): Array<{ type: "allow" | "disallow"; path: string }> {
  type Group = { agents: string[]; rules: Array<{ type: "allow" | "disallow"; path: string }> };
  const groups: Group[] = [];
  let cur: Group | null = null;
  let expectingAgent = false;

  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) continue;
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const field = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();

    if (field === "user-agent") {
      if (!cur || !expectingAgent) {
        cur = { agents: [], rules: [] };
        groups.push(cur);
      }
      cur.agents.push(value.toLowerCase());
      expectingAgent = true;
    } else if (field === "allow" || field === "disallow") {
      if (!cur) {
        cur = { agents: ["*"], rules: [] };
        groups.push(cur);
      }
      expectingAgent = false;
      cur.rules.push({ type: field, path: value });
    }
  }

  let specific: Group | null = null;
  let star: Group | null = null;
  for (const g of groups) {
    for (const a of g.agents) {
      if (a === "*") star ??= g;
      // `a &&` so an EMPTY User-agent token can't match our bot as a specific
      // group (uaToken.includes("") is always true) and shadow the "*" group.
      else if (a && uaToken.includes(a)) specific ??= g;
    }
  }
  return (specific ?? star)?.rules ?? [];
}

/** Longest-match Allow/Disallow. NOTE: simple prefix match — no `*`/`$` wildcards. */
function isPathAllowed(robotsTxt: string, path: string, uaToken: string): boolean {
  const rules = selectRules(robotsTxt, uaToken);
  let best: { len: number; type: "allow" | "disallow" } | null = null;
  for (const r of rules) {
    if (r.path === "") continue; // empty Disallow = allow all (lowest precedence)
    if (path.startsWith(r.path) && (!best || r.path.length > best.len)) {
      best = { len: r.path.length, type: r.type };
    }
  }
  return best ? best.type === "allow" : true;
}

// ---- the harness -----------------------------------------------------------

export function createFetcher(deps: Partial<FetcherDeps> = {}): Fetcher {
  const fetchImpl: FetchImpl =
    deps.fetchImpl ??
    ((url, init) => fetch(url, init as RequestInit) as Promise<FetchLikeResponse>);
  const cache = deps.cache ?? { get: cacheGet, set: cacheSet };
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const now = deps.now ?? (() => Date.now());
  const resolveHost =
    deps.resolveHost ??
    (async (host: string) => {
      const { lookup } = await import("node:dns/promises");
      const addrs = await lookup(host, { all: true });
      return addrs.map((a) => a.address);
    });

  // Best-effort, per-instance (serverless memory is ephemeral — fine alongside backoff).
  const lastHit = new Map<string, number>();

  async function attempt(
    url: string,
    init: { method: string; headers: Record<string, string>; redirect: "manual"; body?: string },
    timeoutMs: number,
    external?: AbortSignal,
  ): Promise<
    { kind: "response"; res: FetchLikeResponse } | { kind: "timeout" } | { kind: "network" }
  > {
    if (external?.aborted) return { kind: "timeout" };

    const ctrl = new AbortController();
    const combined = anySignal(external ? [ctrl.signal, external] : [ctrl.signal]);
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const fetchP = Promise.resolve(fetchImpl(url, { ...init, signal: combined })).then(
        (res) => ({ kind: "response", res }) as const,
        (e) => ({ kind: "error", e }) as const,
      );
      const abortP = onAbort(combined).then(() => ({ kind: "abort" }) as const);
      const winner = await Promise.race([fetchP, abortP]);

      if (winner.kind === "abort") return { kind: "timeout" };
      if (winner.kind === "error")
        return isAbortError(winner.e) ? { kind: "timeout" } : { kind: "network" };
      return { kind: "response", res: winner.res };
    } finally {
      clearTimeout(timer);
    }
  }

  async function doFetch(opts: FetchOptions): Promise<FetchResult> {
    // Programmer misuse → throw (not a runtime fetch failure).
    if (!opts.source || !opts.key || !opts.url) {
      throw new Error("cachedFetch: `source`, `key`, and `url` are required.");
    }
    if (opts.kind !== "third-party" && opts.kind !== "live-site") {
      throw new Error(`cachedFetch: invalid kind "${opts.kind}".`);
    }
    if (opts.ttlSeconds < 0) {
      throw new Error("cachedFetch: ttlSeconds must be >= 0.");
    }

    // Malformed/relative URL → network error (uphold the non-throwing contract).
    let parsed: URL;
    try {
      parsed = new URL(opts.url);
    } catch {
      return { ok: false, error: "network" };
    }

    const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const maxRetries = opts.maxRetries ?? DEFAULT_MAX_RETRIES;
    const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;
    const cacheKey = normalizeKey(opts.source, opts.key);

    // 1) Cache hit (only when caching is on). We only ever cache 2xx bodies, so
    //    a hit implies success — report status 200.
    if (opts.ttlSeconds > 0) {
      const hit = await cache.get(cacheKey);
      if (hit) return { ok: true, status: 200, body: hit.payload, fromCache: true };
    }

    // 2) POLITENESS BUDGET. Taken AFTER the cache check — a cache hit makes no
    //    call and must not consume a token — and released in `finally` below so
    //    a throw cannot leak one. Fails fast rather than queueing: a queued call
    //    would still be waiting when the 8s page deadline fires, which converts
    //    "we chose not to call" into "we called and it did not answer" — the
    //    exact conflation this error code exists to prevent.
    if (!takeBudget(parsed.hostname)) {
      return { ok: false, error: "budget-exhausted" };
    }
    try {
      // 3) RATE LIMIT (Story 23.2). Checked here, INSIDE the budget try so the
      //    concurrency slot is released on defer, and only once we are actually
      //    about to call (a rate-limited call must not have spent a token it
      //    could not use).
      //
      //    WAITING DOES NOT COUNT AGAINST THE 8s DEADLINE — because we never
      //    wait. If no token is available we return `rate-limited` immediately,
      //    exactly as the concurrency budget fails fast, and for the same
      //    reason: a call that blocked for a token and then ran would still be
      //    in flight when the deadline fired and would surface as a `timeout` —
      //    the precise conflation requirement 4 forbids. Pacing across a burst
      //    is achieved by DECLINING the over-rate call (the host never sees it,
      //    so the 503/firewall-block never triggers), not by holding it.
      if (!takeRate(parsed.hostname, now())) {
        return { ok: false, error: "rate-limited" };
      }
      return await withBudget();
    } finally {
      releaseBudget(parsed.hostname);
    }

    async function withBudget(): Promise<FetchResult> {
    const init = {
      method: opts.method ?? "GET",
      headers: { ...opts.headers, "user-agent": USER_AGENT },
      redirect: "manual" as const, // we follow manually so each hop is re-validated
      ...(opts.body != null ? { body: opts.body } : {}),
    };

    // robots.txt for one URL (live-site only); fetched through the harness (cached).
    async function robotsAllows(u: URL): Promise<boolean> {
      const robots = await doFetch({
        source: "robots",
        key: u.host,
        url: `${u.origin}/robots.txt`,
        ttlSeconds: ROBOTS_TTL_SECONDS,
        kind: "third-party", // avoids recursion + robots-on-robots
        timeoutMs,
        signal: opts.signal,
      });
      if (!robots.ok) return true; // missing/unfetchable robots → allowed (standard)
      return isPathAllowed(robots.body, u.pathname || "/", UA_TOKEN);
    }

    type Follow =
      | { kind: "response"; res: FetchLikeResponse }
      | { kind: "timeout" }
      | { kind: "network" }
      | { kind: "blocked" }
      | { kind: "robots" }
      | { kind: "too-many"; status: number };

    // Follow redirects manually, re-validating SSRF (every hop) and robots
    // (live-site, every hop) before each request. Never follow to an
    // unvalidated host.
    async function follow(startUrl: string): Promise<Follow> {
      let url = startUrl;
      for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
        let u: URL;
        try {
          u = new URL(url);
        } catch {
          return { kind: "network" };
        }
        // Scheme allowlist — http/https only (initial URL AND every redirect hop).
        if (!ALLOWED_SCHEMES.has(u.protocol)) return { kind: "blocked" };
        if (!(await hostAllowed(u.hostname, resolveHost)).allowed) return { kind: "blocked" };
        if (opts.kind === "live-site" && !(await robotsAllows(u))) return { kind: "robots" };

        const outcome = await attempt(url, init, timeoutMs, opts.signal);
        if (outcome.kind !== "response") return outcome;

        const status = outcome.res.status;
        if (status >= 300 && status < 400) {
          const loc = outcome.res.headers?.get("location") ?? null;
          if (!loc) return { kind: "response", res: outcome.res };
          if (hop === MAX_REDIRECTS) return { kind: "too-many", status };
          try {
            url = new URL(loc, url).toString();
          } catch {
            return { kind: "network" };
          }
          continue;
        }
        return { kind: "response", res: outcome.res };
      }
      return { kind: "too-many", status: 0 }; // loop always returns earlier
    }

    let lastStatus: number | undefined;
    for (let n = 0; n <= maxRetries; n++) {
      if (n > 0) await sleep(backoffMs(n - 1)); // exponential backoff before a retry

      // Best-effort per-host spacing (on the original host).
      if (opts.minHostIntervalMs && opts.minHostIntervalMs > 0) {
        const last = lastHit.get(parsed.host);
        if (last != null) {
          const elapsed = now() - last;
          if (elapsed < opts.minHostIntervalMs) await sleep(opts.minHostIntervalMs - elapsed);
        }
        lastHit.set(parsed.host, now());
      }

      const out = await follow(opts.url);
      if (out.kind === "blocked") return { ok: false, error: "blocked" }; // not cached
      if (out.kind === "robots") return { ok: false, error: "robots-disallowed" };
      if (out.kind === "timeout") return { ok: false, error: "timeout" }; // not cached
      if (out.kind === "network") return { ok: false, error: "network" }; // not cached
      if (out.kind === "too-many") return { ok: false, error: "http", status: out.status };

      const status = out.res.status;
      // Story 23.2: a 429/503 from a RATE-CONFIGURED host is the host telling us
      // to slow down. Arm its cooldown and DO NOT retry into it — retrying past
      // a 429 is exactly what earns archive.org's escalating firewall block. The
      // response is still returned as-is below; only future calls are governed.
      if ((status === 429 || status === 503) && HOST_RATES[parsed.hostname]) {
        armRateCooldown(parsed.hostname, status, now());
        return { ok: false, error: "http", status };
      }
      const retryable = status === 429 || status >= 500;
      if (retryable && n < maxRetries) {
        lastStatus = status;
        continue;
      }
      if (status >= 200 && status < 300) {
        let read: { text: string; truncated: boolean };
        try {
          read = await readBodyCapped(out.res, maxBytes);
        } catch {
          return { ok: false, error: "network" }; // partial/dropped read — don't cache or mis-scan
        }
        const { text: body, truncated } = read;
        if (opts.ttlSeconds > 0) await cache.set(cacheKey, body, opts.ttlSeconds);
        return { ok: true, status, body, fromCache: false, ...(truncated ? { truncated: true } : {}) };
      }
      return { ok: false, error: "http", status }; // never cached
    }

    return { ok: false, error: "http", status: lastStatus }; // retries exhausted on 429/5xx
    }
  }

  return doFetch;
}

/** Default instance wired to real deps (global fetch, the DB cache, real sleep/clock/DNS). */
export const cachedFetch: Fetcher = createFetcher();
