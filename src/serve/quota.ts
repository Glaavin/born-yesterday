import { createHash } from "node:crypto";

/**
 * Quota + session identity (mvp-spec §7a, §10). NO PII: we hash the client IP
 * with a server salt and store/look up ONLY the hash — the raw IP is never
 * persisted. PURE helpers.
 */

export const SEARCH_LIMIT_PER_DAY = 3; // §7a: 3 reports/day per session

// Dev-only fallback so the hash is stable without an env salt. It is a COMMITTED
// public constant, so a salted hash made with it is reversible to the raw IP by
// brute-forcing the IPv4 space — it must NEVER be used in production. `resolveSalt`
// fails closed instead of silently falling back there (Tier 1 · 1a).
const FALLBACK_SALT = "born-yesterday/serve/v1";

/** The salt to hash with. Requires SERVER_SALT in production; refuses the public
 *  dev fallback there rather than degrade the "raw IP never leaks" guarantee. */
function resolveSalt(): string {
  const s = process.env.SERVER_SALT;
  if (s) return s;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "SERVER_SALT is not set. Refusing to hash client IPs with the committed public " +
        "fallback in production — the resulting session keys would be reversible to raw " +
        "IPs. Set SERVER_SALT to a private, non-committed value before serving traffic.",
    );
  }
  return FALLBACK_SALT;
}

/** sha256(ip + salt) — the only thing stored for quota. The raw IP never leaks. */
export function sessionKey(clientIp: string, salt: string = resolveSalt()): string {
  return createHash("sha256").update(`${clientIp}|${salt}`).digest("hex");
}

/** UTC calendar day ("YYYY-MM-DD") for the quota row key. */
export function utcDay(nowSec: number): string {
  return new Date(nowSec * 1000).toISOString().slice(0, 10);
}
