/**
 * extractHost — pull the lowercased hostname out of a (possibly scheme-less) URL,
 * or null if it has none. Used to key the local threat table off each listed URL.
 * Keeps the full host (subdomains, IPs) — threat listings are per-host, not
 * per-registrable-domain.
 */
export function extractHost(input: unknown): string | null {
  if (typeof input !== "string" || !input.trim()) return null;
  const tryParse = (s: string): string | null => {
    try {
      const h = new URL(s).hostname.toLowerCase().replace(/\.$/, "");
      return h || null;
    } catch {
      return null;
    }
  };
  // Absolute URL first; then assume a scheme-less host[/path].
  return tryParse(input.trim()) ?? tryParse("http://" + input.trim());
}
