/**
 * normalizeDomain — turn arbitrary user input into a canonical registrable host,
 * or null if it isn't a valid domain. Per mvp-spec.md §6: lowercase; strip
 * scheme, userinfo, www., path/query/fragment, port, trailing dot; then validate.
 *
 *   "HTTPS://WWW.Example.com/p?q=1" -> "example.com"
 *   "sub.example.co.uk/x"           -> "sub.example.co.uk"
 *   ""  /  "not a domain"           -> null
 *
 * ASCII hostnames only (MVP): IDN/unicode and bare IPs are rejected (return null).
 */

// Each label: 1–63 chars, alphanumeric with internal hyphens; ≥2 labels; the
// TLD is ≥2 letters (so numeric TLDs / bare IPv4 are rejected). Max 253 chars.
const DOMAIN_RE =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

export function normalizeDomain(input: unknown): string | null {
  if (typeof input !== "string") return null;

  let s = input.trim().toLowerCase();
  if (!s) return null;

  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, ""); // strip scheme://
  s = s.replace(/^\/\//, ""); // strip protocol-relative //
  s = s.replace(/^[^/@?#]*@/, ""); // strip userinfo@
  s = s.split(/[/?#]/, 1)[0]; // drop path / query / fragment
  s = s.replace(/:\d+$/, ""); // drop :port
  s = s.replace(/^www\./, ""); // drop a single leading www.
  s = s.replace(/\.+$/, ""); // drop trailing dot(s)

  return DOMAIN_RE.test(s) ? s : null;
}
