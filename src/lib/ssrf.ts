/**
 * Shared SSRF host validation (mvp-spec §10). A user-submitted domain must NEVER
 * cause a connection to a private/internal/link-local/loopback/cloud-metadata
 * address. Extracted from the cached-fetch harness so the live-TLS collector
 * (which opens its own socket to <domain>:443) reuses the EXACT same gate.
 *
 * Pure IP helpers + an async `hostAllowed(hostname, resolveHost)` that takes the
 * resolver as a parameter (reusable + testable with no network).
 */

export function parseIPv4(s: string): number[] | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(s);
  if (!m) return null;
  const o = m.slice(1, 5).map(Number);
  return o.some((n) => n > 255) ? null : o;
}

/** Expand any IPv6 textual form (incl. embedded IPv4) to 16 bytes, or null. */
export function ipv6ToBytes(input: string): number[] | null {
  let addr = input.split("%")[0]; // drop zone id
  const dot = addr.lastIndexOf(".");
  if (dot !== -1) {
    // embedded IPv4 tail, e.g. ::ffff:127.0.0.1
    const colon = addr.lastIndexOf(":");
    if (colon === -1) return null;
    const v4 = parseIPv4(addr.slice(colon + 1));
    if (!v4) return null;
    const hex =
      ((v4[0] << 8) | v4[1]).toString(16) + ":" + ((v4[2] << 8) | v4[3]).toString(16);
    addr = addr.slice(0, colon + 1) + hex;
  }
  const halves = addr.split("::");
  if (halves.length > 2) return null;
  const toGroups = (s: string) => (s === "" ? [] : s.split(":"));
  let groups: string[];
  if (halves.length === 2) {
    const head = toGroups(halves[0]);
    const tail = toGroups(halves[1]);
    const missing = 8 - head.length - tail.length;
    if (missing < 1) return null;
    groups = [...head, ...Array(missing).fill("0"), ...tail];
  } else {
    groups = toGroups(addr);
  }
  if (groups.length !== 8) return null;
  const bytes: number[] = [];
  for (const g of groups) {
    if (!/^[0-9a-fA-F]{1,4}$/.test(g)) return null;
    const v = parseInt(g, 16);
    bytes.push((v >> 8) & 0xff, v & 0xff);
  }
  return bytes;
}

export function isBlockedIPv4(o: number[]): boolean {
  const [a, b] = o;
  return (
    a === 127 || // loopback
    a === 10 || // private
    (a === 172 && b >= 16 && b <= 31) || // private
    (a === 192 && b === 168) || // private
    (a === 169 && b === 254) || // link-local (incl. 169.254.169.254 metadata)
    (a === 100 && b >= 64 && b <= 127) || // CGNAT
    a === 0 // "this" network / unspecified
  );
}

export function isBlockedIPv6(b: number[]): boolean {
  if (b.every((x) => x === 0)) return true; // :: unspecified
  if (b.slice(0, 15).every((x) => x === 0) && b[15] === 1) return true; // ::1 loopback
  if ((b[0] & 0xfe) === 0xfc) return true; // fc00::/7 unique-local
  if (b[0] === 0xfe && (b[1] & 0xc0) === 0x80) return true; // fe80::/10 link-local
  if (b.slice(0, 10).every((x) => x === 0) && b[10] === 0xff && b[11] === 0xff) {
    return isBlockedIPv4([b[12], b[13], b[14], b[15]]); // ::ffff:a.b.c.d
  }
  return false;
}

/** true = blocked, false = allowed, null = not an IP literal (a hostname). */
export function ipIsBlocked(ip: string): boolean | null {
  const v4 = parseIPv4(ip);
  if (v4) return isBlockedIPv4(v4);
  if (ip.includes(":")) {
    const b = ipv6ToBytes(ip);
    return b ? isBlockedIPv6(b) : true; // unparseable literal → treat as blocked
  }
  return null; // not an IP literal
}

export type ResolveHost = (host: string) => Promise<string[]>;

/** Result of a host check. `ips` are the VALIDATED resolved addresses (so a
 *  caller can connect-by-IP to close the DNS-rebinding TOCTOU). */
export interface HostCheck {
  allowed: boolean;
  ips: string[];
}

// A resolver throwing one of these means the host genuinely doesn't resolve —
// the connection would fail as a network error anyway, so we fail OPEN. ANY
// other error (e.g. node:dns import failure on a non-Node runtime) is a
// resolver-unavailable condition and we fail CLOSED (block).
const HOST_NOT_FOUND_CODES = new Set(["ENOTFOUND", "ENODATA", "EAI_AGAIN", "EAI_NONAME"]);

function isHostNotFound(e: unknown): boolean {
  const code = (e as { code?: unknown } | null)?.code;
  return typeof code === "string" && HOST_NOT_FOUND_CODES.has(code);
}

/**
 * Validate a host for egress. IP literals are checked directly; hostnames are
 * resolved via `resolveHost` and rejected if ANY resolved address is in a
 * blocked range. Returns the validated IP(s) for optional connect-by-IP pinning.
 */
export async function hostAllowed(
  hostname: string,
  resolveHost: ResolveHost,
): Promise<HostCheck> {
  let h = hostname;
  if (h.startsWith("[") && h.endsWith("]")) h = h.slice(1, -1); // URL.hostname brackets IPv6

  const literal = ipIsBlocked(h);
  if (literal !== null) return literal ? { allowed: false, ips: [] } : { allowed: true, ips: [h] };

  let ips: string[];
  try {
    ips = await resolveHost(h);
  } catch (e) {
    return isHostNotFound(e) ? { allowed: true, ips: [] } : { allowed: false, ips: [] };
  }
  if (!ips || ips.length === 0) return { allowed: true, ips: [] };

  for (const ip of ips) {
    const blocked = ipIsBlocked(ip);
    if (blocked === null || blocked) return { allowed: false, ips: [] }; // non-IP or blocked → reject
  }
  return { allowed: true, ips };
}
