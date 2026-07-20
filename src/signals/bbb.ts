/**
 * BBB (mvp-spec §2C) — a LINK-OUT only. Reputation decision A (Story 16): we
 * dropped the scraped letter grade / first-match profile (it carried a
 * misattribution risk and was usually JS-rendered anyway) and now just link the
 * reader to the BBB search for the domain. No fetch, no scrape.
 */
export const bbbSearchUrl = (domain: string): string =>
  `https://www.bbb.org/search?find_text=${encodeURIComponent(domain)}`;
