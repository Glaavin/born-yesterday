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
    pill: "text-indicator-green border-indicator-green/50 bg-indicator-green/10",
  },
  "some-concerns": {
    label: "Some concerns",
    mascot: "result-amber",
    pill: "text-indicator-amber border-indicator-amber/50 bg-indicator-amber/10",
  },
  "red-flags": {
    label: "Red flags found",
    mascot: "result-red",
    pill: "text-indicator-red border-indicator-red/50 bg-indicator-red/10",
  },
  "too-new": {
    label: "Too new to tell",
    mascot: "result-blue",
    pill: "text-indicator-blue border-indicator-blue/50 bg-indicator-blue/10",
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
    "Sources:",
    ...r.sources.map((s) => `- ${s.label}: ${s.url}`),
  ].join("\n");
}
