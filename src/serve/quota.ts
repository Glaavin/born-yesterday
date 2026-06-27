import { createHash } from "node:crypto";

/**
 * Quota + session identity (mvp-spec §7a, §10). NO PII: we hash the client IP
 * with a server salt and store/look up ONLY the hash — the raw IP is never
 * persisted. PURE helpers.
 */

export const SEARCH_LIMIT_PER_DAY = 3; // §7a: 3 reports/day per session

// Documented fallback so the hash is stable without an env salt; override in
// production with SERVER_SALT (kept out of the repo).
const FALLBACK_SALT = "born-yesterday/serve/v1";

/** sha256(ip + salt) — the only thing stored for quota. The raw IP never leaks. */
export function sessionKey(clientIp: string, salt: string = process.env.SERVER_SALT || FALLBACK_SALT): string {
  return createHash("sha256").update(`${clientIp}|${salt}`).digest("hex");
}

/** UTC calendar day ("YYYY-MM-DD") for the quota row key. */
export function utcDay(nowSec: number): string {
  return new Date(nowSec * 1000).toISOString().slice(0, 10);
}
