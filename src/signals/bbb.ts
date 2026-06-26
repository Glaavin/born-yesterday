import type { Fetcher } from "../lib/cached-fetch";

/**
 * BBB (mvp-spec §2C) — letter grade + profile link from the public BBB search
 * (fixed bbb.org host, domain as a query value → no user-host connection). Rides
 * the harness. Fetch/parse split; parseBbb is pure and conservative — null on a
 * miss/block rather than a guess. Never throws.
 */

const BBB_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

export const bbbSearchUrl = (domain: string): string =>
  `https://www.bbb.org/search?find_text=${encodeURIComponent(domain)}`;

export async function fetchBbb(
  domain: string,
  fetcher: Fetcher,
): Promise<{ ok: boolean; html: string | null }> {
  const res = await fetcher({
    source: "bbb",
    key: domain,
    url: bbbSearchUrl(domain),
    ttlSeconds: BBB_TTL_SECONDS,
    kind: "third-party",
  });
  return res.ok ? { ok: true, html: res.body } : { ok: false, html: null };
}

/**
 * PURE: BBB HTML → { grade, profileUrl }. Best-effort — a BBB letter grade
 * (A+…F) and the first profile link if present; nulls otherwise. Never throws.
 */
export function parseBbb(html: string): {
  grade: string | null;
  profileUrl: string | null;
} {
  try {
    const link = html.match(/https?:\/\/www\.bbb\.org\/[^\s"'<>]*\/profile\/[^\s"'<>]+/i);
    const profileUrl = link ? link[0] : null;

    // Prefer a structured "rating":"A+"; fall back to "BBB Rating: A+" text.
    const jsonGrade = html.match(/"rating"\s*:\s*"(A\+|A|A-|B\+|B|B-|C\+|C|C-|D\+|D|D-|F)"/);
    const textGrade = html.match(/BBB\s+Rating[:\s]+(A\+|A|A-|B\+|B|B-|C\+|C|C-|D\+|D|D-|F)\b/i);
    const grade = jsonGrade?.[1] ?? textGrade?.[1] ?? null;

    return { grade, profileUrl };
  } catch {
    return { grade: null, profileUrl: null };
  }
}
