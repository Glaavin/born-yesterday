/**
 * Reputation link-outs (mvp-spec §2C) — LINKS, not scrapes. We construct search
 * URLs the reader can follow; we never fetch or scrape search-engine results.
 *
 * Query terms are NEUTRAL: they name the CATEGORY of content a reader is looking
 * for ("reviews", "complaints") — never a characterization of the company. We
 * never append "scam", "fraud", "ripoff", "lawsuit", or any similar term
 * (legal register L-10). Born Yesterday does not supply the accusation.
 */

/** A web search for the domain + "reviews" (neutral). */
export const webReviewsSearchUrl = (domain: string): string =>
  `https://www.google.com/search?q=${encodeURIComponent(`${domain} reviews`)}`;

/** A web search for the domain + "complaints" — the content category a reader
 *  wants, not a claim about the company. */
export const webComplaintsSearchUrl = (domain: string): string =>
  `https://www.google.com/search?q=${encodeURIComponent(`${domain} complaints`)}`;

/** A Reddit search for the domain. */
export const redditSearchUrl = (domain: string): string =>
  `https://www.reddit.com/search/?q=${encodeURIComponent(domain)}`;
