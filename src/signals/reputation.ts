import type { Fetcher } from "../lib/cached-fetch";
import type { CollectorResult, Signal } from "./types";
import { fetchTrustpilot, parseTrustpilot, trustpilotUrl } from "./trustpilot";
import { fetchBbb, parseBbb, bbbSearchUrl } from "./bbb";
import { webReviewSearchUrl, redditSearchUrl } from "./reputation-links";

/**
 * Reputation presence (mvp-spec §2C) — best-effort DISCOVERY signals: Trustpilot
 * + BBB (scraped conservatively for rating/grade + link) and link-outs (web +
 * Reddit search) as LINKS. We count and link, we don't judge. Every value
 * sourced; absence ⇒ "Not found"/null. This collector NEVER blocks and NEVER
 * throws — a blocked/odd/absent page degrades to "Not found", distinct from an
 * error. No report wiring, no UI.
 */

export interface ReputationDeps {
  fetcher: Fetcher;
}

function formatTrustpilot(rating: number | null, reviewCount: number | null): string {
  const stars = rating != null ? `${rating}/5` : null;
  const reviews = reviewCount != null ? `${reviewCount.toLocaleString("en-US")} reviews` : null;
  if (stars && reviews) return `${stars} (${reviews})`;
  return (stars ?? reviews)!; // the caller only formats when at least one is present
}

export async function collectReputation(
  domain: string,
  deps: ReputationDeps,
): Promise<CollectorResult> {
  // Trustpilot (best-effort).
  let trustpilotText: string | null = null;
  let trustpilotRating: number | null = null;
  try {
    const r = await fetchTrustpilot(domain, deps.fetcher);
    if (r.ok && r.html) {
      const p = parseTrustpilot(r.html);
      if (p.rating != null || p.reviewCount != null) {
        trustpilotRating = p.rating;
        trustpilotText = formatTrustpilot(p.rating, p.reviewCount);
      }
    }
  } catch {
    // best-effort: a failure is "Not found", not an error
  }

  // BBB (best-effort).
  let bbbGrade: string | null = null;
  let bbbProfile: string | null = null;
  try {
    const r = await fetchBbb(domain, deps.fetcher);
    if (r.ok && r.html) {
      const p = parseBbb(r.html);
      bbbGrade = p.grade;
      bbbProfile = p.profileUrl;
    }
  } catch {
    // best-effort
  }

  const signals: Signal[] = [
    {
      key: "trustpilot",
      label: "Trustpilot",
      valueText: trustpilotText, // e.g. "4.2/5 (1,203 reviews)" or null ("Not found")
      valueNum: trustpilotRating,
      source: trustpilotText ? { label: "Trustpilot", url: trustpilotUrl(domain) } : null,
    },
    {
      key: "bbb",
      label: "BBB rating",
      valueText: bbbGrade,
      valueNum: null,
      source: bbbGrade ? { label: "BBB", url: bbbProfile ?? bbbSearchUrl(domain) } : null,
    },
    {
      // Link-outs are ALWAYS present (links, not scrapes).
      key: "reputation_search",
      label: "Web reviews",
      valueText: "Search the web for reviews / scam reports",
      valueNum: null,
      source: { label: "Web search", url: webReviewSearchUrl(domain) },
    },
    {
      key: "reddit_search",
      label: "Reddit",
      valueText: "Search Reddit for mentions",
      valueNum: null,
      source: { label: "Reddit", url: redditSearchUrl(domain) },
    },
  ];

  // Best-effort discovery: a missing Trustpilot/BBB page is ok:true with those
  // "Not found"; the link-outs are always present. ok stays true on misses.
  return { collector: "reputation", signals, ok: true };
}
