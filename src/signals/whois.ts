/**
 * WHOIS fallback — a port-43 SOCKET sidecar (a different transport than the HTTP
 * harness). Targets are FIXED WHOIS servers (registry/IANA), never a
 * user-controlled host, so SSRF isn't applicable here. The raw response is cached
 * via external_cache directly. Fetch and parse are split: parseWhois is pure.
 *
 * Hand-rolled minimal socket lookup (no dependency): a static TLD→server map for
 * common TLDs, falling back to an IANA referral. We chose this over a library
 * (e.g. whoiser) to keep the fetch/parse split clean — the lib returns
 * pre-parsed objects, whereas we want raw text in and a pure parser.
 */

import { toISO } from "./dates";

/** 7 days — registration data is effectively static. */
const WHOIS_TTL_SECONDS = 60 * 60 * 24 * 7;
const DEFAULT_TIMEOUT_MS = 5000;
/** Cap accumulated bytes so a hostile/huge WHOIS response can't exhaust memory. */
const WHOIS_MAX_BYTES = 1 << 20; // 1 MiB

/** A minimal socket shape (what node:net's createConnection returns, and what
 *  tests fake). */
export interface WhoisSocket {
  setEncoding(enc: string): void;
  write(data: string): void;
  destroy(): void;
  on(event: string, cb: (arg?: unknown) => void): void;
}
export type WhoisConnect = (port: number, host: string) => WhoisSocket;

/** Common TLD → registry WHOIS server (avoids an IANA round-trip for these). */
const TLD_WHOIS: Record<string, string> = {
  com: "whois.verisign-grs.com",
  net: "whois.verisign-grs.com",
  org: "whois.pir.org",
  io: "whois.nic.io",
  co: "whois.nic.co",
  ai: "whois.nic.ai",
  dev: "whois.nic.google",
  app: "whois.nic.google",
};

export interface WhoisDeps {
  cache: {
    get(key: string): Promise<{ payload: string } | null>;
    set(key: string, payload: string, ttlSeconds: number): Promise<void>;
  };
  /** Raw port-43 query (host, query) → text. Injectable so tests need no socket. */
  whoisQuery: (host: string, query: string, timeoutMs: number) => Promise<string>;
  timeoutMs?: number;
}

/**
 * Default real socket implementation (node:net, lazy-imported). The connection
 * factory is injectable so the byte-cap behavior is unit-testable without a real
 * socket. Accumulation is capped at WHOIS_MAX_BYTES (destroy + return truncated).
 */
export async function socketWhois(
  host: string,
  query: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  connect?: WhoisConnect,
): Promise<string> {
  const createConnection =
    connect ?? ((await import("node:net")).createConnection as unknown as WhoisConnect);
  return new Promise<string>((resolve, reject) => {
    let data = "";
    let done = false;
    const socket = createConnection(43, host);
    const finish = (fn: () => void) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      fn();
    };
    const timer = setTimeout(() => {
      socket.destroy();
      finish(() => reject(new Error("whois: timeout")));
    }, timeoutMs);
    socket.setEncoding("utf8");
    socket.on("connect", () => socket.write(query + "\r\n"));
    socket.on("data", (d) => {
      data += String(d);
      if (data.length >= WHOIS_MAX_BYTES) {
        data = data.slice(0, WHOIS_MAX_BYTES);
        socket.destroy();
        finish(() => resolve(data)); // truncated but usable
      }
    });
    socket.on("error", (e) => finish(() => reject(e)));
    socket.on("close", () => finish(() => resolve(data)));
  });
}

const tldOf = (domain: string): string => domain.split(".").pop() ?? "";

async function resolveWhoisServer(
  domain: string,
  deps: WhoisDeps,
): Promise<string | null> {
  const tld = tldOf(domain.toLowerCase());
  if (TLD_WHOIS[tld]) return TLD_WHOIS[tld];
  try {
    const iana = await deps.whoisQuery(
      "whois.iana.org",
      tld,
      deps.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    );
    const m = iana.match(/^(?:refer|whois):\s*(\S+)\s*$/im);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

/** Query WHOIS for a domain (cached). Returns raw text, or null on failure. */
export async function queryWhois(
  domain: string,
  deps: WhoisDeps,
): Promise<string | null> {
  const cacheKey = `whois:${domain.toLowerCase()}`;
  const hit = await deps.cache.get(cacheKey);
  if (hit) return hit.payload;

  const server = await resolveWhoisServer(domain, deps);
  if (!server) return null;

  let text: string;
  try {
    text = await deps.whoisQuery(
      server,
      domain,
      deps.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    );
  } catch {
    return null;
  }
  if (text && text.trim()) await deps.cache.set(cacheKey, text, WHOIS_TTL_SECONDS);
  return text || null;
}

/**
 * PURE: parse WHOIS text → registration date (ISO) + registrar. Tolerates format
 * variance across registries; returns nulls when unsure (never guesses).
 */
export function parseWhois(text: string): {
  registrationDate: string | null;
  registrar: string | null;
} {
  if (!text) return { registrationDate: null, registrar: null };

  const dateLine = text.match(
    /^\s*(?:Creation Date|Created On|Created|Registered on|Registration Time|Registration Date|created)\s*:\s*(.+?)\s*$/im,
  );
  const registrationDate = dateLine ? toISO(dateLine[1]) : null;

  const regLine = text.match(
    /^\s*(?:Sponsoring Registrar|Registrar Name|Registrar)\s*:\s*(.+?)\s*$/im,
  );
  const registrar = regLine && regLine[1].trim() ? regLine[1].trim() : null;

  return { registrationDate, registrar };
}
