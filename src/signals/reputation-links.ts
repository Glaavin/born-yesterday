/**
 * Reputation link-outs (mvp-spec §2C) — LINKS, not scrapes. We construct search
 * URLs the reader can follow; we never fetch or scrape search-engine results.
 */

/** A web search for the domain + "review scam". */
export const webReviewSearchUrl = (domain: string): string =>
  `https://www.google.com/search?q=${encodeURIComponent(`${domain} review scam`)}`;

/** A Reddit search for the domain. */
export const redditSearchUrl = (domain: string): string =>
  `https://www.reddit.com/search/?q=${encodeURIComponent(domain)}`;
