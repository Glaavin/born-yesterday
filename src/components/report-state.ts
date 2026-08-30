import type { MascotState } from "./Mascot";

/**
 * Report view shared types + the state→verdict mapping (design-system.md §4).
 * The four result states each map to: a verdict LABEL (the pill carries meaning
 * in words, never colour alone), an --indicator-* token, and a mascot state.
 * The `pill` class strings are literal so Tailwind generates the utilities.
 */
export type ReportStateKey =
  | "checks-out"
  | "some-concerns"
  | "red-flags"
  | "too-new";

export const REPORT_STATES: Record<
  ReportStateKey,
  { label: string; mascot: MascotState; pill: string }
> = {
  "checks-out": {
    label: "Checks out",
    mascot: "result-green",
    pill: "text-indicator-checks-out border-indicator-checks-out/50 bg-indicator-checks-out/10",
  },
  "some-concerns": {
    label: "Some concerns",
    mascot: "result-amber",
    pill: "text-indicator-concerns border-indicator-concerns/50 bg-indicator-concerns/10",
  },
  "red-flags": {
    label: "Red flags found",
    mascot: "result-red",
    pill: "text-indicator-red-flags border-indicator-red-flags/50 bg-indicator-red-flags/10",
  },
  "too-new": {
    label: "Too new to tell",
    mascot: "result-blue",
    pill: "text-indicator-too-new border-indicator-too-new/50 bg-indicator-too-new/10",
  },
};

export type Source = { label: string; url: string };
export type Finding = { text: string; source: Source };
export type Report = {
  domain: string;
  state: ReportStateKey;
  summary: string;
  lastChecked: string;
  flagged: Finding[];
  positive: Finding[];
  /**
   * Facts that support no inference in either direction (Story 19.1).
   *
   * Without this channel a fact that was neither concerning nor reassuring had
   * to land in `positive[]`, so the "Positive findings" heading asserted
   * favourability over it. The sharpest case: a capture count under a Positive
   * badge told the reader that being crawled a lot is reassuring, which §3.4.3
   * explicitly denies — §3.4.5's defect surviving in the LAYOUT after it had
   * been removed from the prose. A heading cannot be worded out of asserting
   * something; it needs somewhere else to put the fact.
   *
   * OPTIONAL ON READ, ALWAYS WRITTEN. Reports cached before this existed have
   * no such field, and `reports.schema_version` is written but never read, so
   * nothing regenerates them. `serve.ts` normalises on the way in.
   */
  neutral?: Finding[];
  sources: Source[];
};

/** Plain-text rendering used by the Copy action. */
export function reportToText(r: Report): string {
  const line = (f: Finding) =>
    `- ${f.text} (source: ${f.source.label} — ${f.source.url})`;
  return [
    `Trust Report: ${r.domain}`,
    `${REPORT_STATES[r.state].label} — ${r.summary}`,
    `Last checked: ${r.lastChecked}`,
    "",
    "Flagged:",
    ...r.flagged.map(line),
    "",
    "Positive:",
    ...r.positive.map(line),
    "",
    "What we found:",
    ...(r.neutral ?? []).map(line),
    "",
    "Sources:",
    ...r.sources.map((s) => `- ${s.label}: ${s.url}`),
  ].join("\n");
}
