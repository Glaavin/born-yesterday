/**
 * Shared date helpers for signal parsers/collectors.
 */

/**
 * Normalize a date string to ISO, or null if it doesn't parse cleanly (we never
 * guess). NOTE: this defers to the JS `Date` parser, which is locale/engine
 * ambiguous for numeric-only formats like "01/02/2015" (MM/DD vs DD/MM). Signal
 * sources here emit ISO-8601 or month-name forms (RDAP, crt.sh, TLS, most
 * registry WHOIS), so that ambiguity isn't currently hit; revisit if a source
 * emits bare numeric dates.
 */
export function toISO(s: string): string | null {
  const d = new Date(s.trim());
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** ISO string → epoch SECONDS, or null if absent/unparseable. The "cleanly
 *  parsed" gate every collector uses to decide its ok-contract. */
export function isoToEpochSec(iso: string | null): number | null {
  if (iso == null) return null;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : Math.floor(ms / 1000);
}
