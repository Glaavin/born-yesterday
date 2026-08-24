import type { Fetcher } from "../lib/cached-fetch";
import type { CollectorResult, Signal, SignalStatus } from "./types";
import { fetchTrustpilot, parseTrustpilot, trustpilotUrl } from "./trustpilot";
import { bbbSearchUrl } from "./bbb";
import { webReviewsSearchUrl, webComplaintsSearchUrl, redditSearchUrl } from "./reputation-links";

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
  // NAMED in Story 18.3 §1.2: this collector previously collapsed "page fetched,
  // no rating shown" and "fetch failed" into the same null. They are different
  // facts — the first is a finding, the second is a gap.
  let trustpilotStatus: SignalStatus = "failed";
  try {
    const r = await fetchTrustpilot(domain, deps.fetcher);
    if (r.ok && r.html) {
      const p = parseTrustpilot(r.html);
      // Status from the PARSE, not the fetch — the comment above used to claim
      // "retrieved and parsed" while only the retrieval had been checked
      // (docs/conventions.md).
      if (p) {
        trustpilotStatus = "ok";
        if (p.rating != null || p.reviewCount != null) {
          trustpilotRating = p.rating;
          trustpilotText = formatTrustpilot(p.rating, p.reviewCount);
        }
      }
    }
  } catch {
    // best-effort: a failure is "Not found", not an error
  }

  const signals: Signal[] = [
    {
      key: "trustpilot",
      label: "Trustpilot",
      valueText: trustpilotText, // e.g. "4.2/5 (1,203 reviews)" or null ("Not found")
      valueNum: trustpilotRating,
      // A page we READ and found no rating on cites that page; a page we could
      // not reach cites nothing.
      source: trustpilotStatus === "ok" ? { label: "Trustpilot", url: trustpilotUrl(domain) } : null,
      status: trustpilotStatus,
    },
    {
      // BBB is now a LINK-OUT only (decision A) — always present, never scraped.
      key: "bbb",
      label: "BBB",
      valueText: "Check BBB for this domain",
      valueNum: null,
      source: { label: "BBB", url: bbbSearchUrl(domain) },
      status: "ok", // a constructed link-out, not a check that can fail
    },
    {
      // Link-outs are ALWAYS present (links, not scrapes). NEUTRAL terms only —
      // "reviews" / "complaints" name the content category, never a claim about
      // the company (legal register L-10; no "scam"/"fraud"/etc.).
      key: "reputation_reviews",
      label: "Web reviews",
      valueText: "Search the web for reviews",
      valueNum: null,
      source: { label: "Web search", url: webReviewsSearchUrl(domain) },
      status: "ok", // link-out
    },
    {
      key: "reputation_complaints",
      label: "Web complaints",
      valueText: "Search the web for complaints",
      valueNum: null,
      source: { label: "Web search", url: webComplaintsSearchUrl(domain) },
      status: "ok", // link-out
    },
    {
      key: "reddit_search",
      label: "Reddit",
      valueText: "Search Reddit for mentions",
      valueNum: null,
      source: { label: "Reddit", url: redditSearchUrl(domain) },
      status: "ok", // link-out
    },
  ];

  // Best-effort discovery: a missing Trustpilot/BBB page is ok:true with those
  // "Not found"; the link-outs are always present. ok stays true on misses.
  return { collector: "reputation", signals, ok: true };
}
