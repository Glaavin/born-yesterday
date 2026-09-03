import type { Fetcher } from "../lib/cached-fetch";
import type { CollectorResult, Signal, SignalSource } from "./types";

/**
 * Common Crawl as an establishment instrument (Story 24, roadmap §5-W1).
 *
 * WHY CC, AND WHY IT IS PRIMARY: W0 + Story 24 Stage 1.5 measured every Wayback
 * establishment endpoint (CDX, Availability, narrowed CDX) as slow AND
 * unreliable — Availability returned 200-but-empty for masshist.org, a
 * thirty-year institution. CC's single-crawl lookup answered in 231–533 ms and
 * was correct on every test domain. So CC carries the primary establishment
 * claim; Wayback races and supplies the richer span when it answers.
 *
 * THE QUERY IS A SINGLE POINT-IN-TIME PROBE, not the backward walk. Establishment
 * does not need the earliest date — it needs "present at least as far back as the
 * threshold." One index lookup against the crawl at the threshold vintage answers
 * exactly that (Stage 1 Q1). The monthly walk (continuity) is a DIFFERENT,
 * unreliable pattern and is explicitly out of scope.
 *
 * THE CLAIM IS DELIBERATELY WEAKER THAN WAYBACK'S SPAN: "present in Common
 * Crawl's <crawl> crawl" — point-in-time presence on the live web as of that
 * date, NOT "archived since <first date>." It publishes in its own words with
 * its own source; it never reuses Wayback's span sentence.
 *
 * COVERAGE ASYMMETRY (rubric basis, not a footnote): CC samples the web by
 * link-graph prominence, so CC presence is sound positive evidence of operation
 * while CC ABSENCE is weak evidence of anything — the same bias that retired
 * ESTABLISHED_SNAPSHOT_COUNT in Stage 3a, in a different shape. Hence the
 * indicator rule: CC 200 establishes; CC 404 does NOT deny (it falls through to
 * Wayback); only both-failing yields no-verdict.
 */

// The crawl nearest `now − ESTABLISHED_ARCHIVE_SPAN_DAYS` (~2.5y). Hardcoded
// rather than fetched (a collinfo lookup on the hot path is a second CC call and
// more rate-limit pressure). This is effectively a CC-specific vintage
// parameter; per Story 24 it is flagged for Stage 3 Part B calibration, and as
// wall-clock advances the vintage should be refreshed to track the threshold.
export const CC_THRESHOLD_CRAWL = "CC-MAIN-2024-10";
export const CC_THRESHOLD_LABEL = "February/March 2024"; // human form of the crawl, for the claim

const CC_TTL_SECONDS = 60 * 60 * 24 * 30; // a crawl's contents are immutable

export const ccIndexUrl = (crawl: string, domain: string): string =>
  `https://index.commoncrawl.org/${crawl}-index?url=${encodeURIComponent(domain)}&output=json&limit=1`;

/**
 * Probe one crawl for the domain. Non-throwing.
 *   present — 200 with at least one capture row
 *   absent  — 404 ("No Captures found") — a completed check that found nothing
 *   failed  — 5xx / timeout / network / a 200 whose body did not parse
 */
export async function fetchCcPresence(
  domain: string,
  fetcher: Fetcher,
  crawl: string = CC_THRESHOLD_CRAWL,
): Promise<"present" | "absent" | "failed"> {
  const res = await fetcher({
    source: "common-crawl",
    key: `${crawl}:${domain}`,
    url: ccIndexUrl(crawl, domain),
    ttlSeconds: CC_TTL_SECONDS,
    kind: "third-party",
  });
  if (res.ok) {
    // 200. A present hit is one-or-more NDJSON rows; anything else at 200 is a
    // parse we won't trust as "present".
    const line = res.body.split("\n").find((l) => l.trim().length > 0);
    if (!line) return "absent"; // 200 with empty body — treat as absent, not present
    try {
      JSON.parse(line);
      return "present";
    } catch {
      return "failed"; // a 200 that isn't the NDJSON we expect is a failed observation
    }
  }
  // The harness maps a 404 to error:"http", status:404. That is the genuine
  // "No Captures found" — absence, a real answer. Every other !ok (timeout,
  // rate-limited, 5xx, network) is a FAILED observation, never "absent".
  if (res.error === "http" && res.status === 404) return "absent";
  return "failed";
}

export interface CommonCrawlDeps {
  fetcher: Fetcher;
}

export async function collectCommonCrawl(
  domain: string,
  deps: CommonCrawlDeps,
): Promise<CollectorResult> {
  const source: SignalSource = { label: "Common Crawl", url: ccIndexUrl(CC_THRESHOLD_CRAWL, domain) };
  let presence: "present" | "absent" | "failed" = "failed";
  try {
    presence = await fetchCcPresence(domain, deps.fetcher);
  } catch {
    presence = "failed"; // non-throwing
  }

  const signal: Signal =
    presence === "present"
      ? {
          key: "cc_established",
          label: "Common Crawl presence",
          valueText: CC_THRESHOLD_LABEL,
          valueNum: null,
          source,
          status: "ok",
        }
      : presence === "absent"
        ? {
            // CHECKED, FOUND NOTHING — a real answer, but weak evidence (the
            // coverage asymmetry). It does not deny establishment; the indicator
            // routes it to Wayback. Sourced to the query we ran.
            key: "cc_established",
            label: "Common Crawl presence",
            valueText: null,
            valueNum: null,
            source,
            status: "ok",
          }
        : {
            key: "cc_established",
            label: "Common Crawl presence",
            valueText: null,
            valueNum: null,
            source: null,
            status: "failed",
          };

  return { collector: "common-crawl", signals: [signal], ok: presence !== "failed" };
}
