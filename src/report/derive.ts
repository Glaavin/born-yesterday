import type { CollectorResult, SignalSource } from "../signals/types";
import { signalsByKey } from "./signals";

/**
 * Cross-signal derivations (Story 16 §C). The "AI pivot": when a registration
 * date and an archived AI-language date both exist, state the gap factually. The
 * AI date is labelled APPROXIMATE (earliest *sampled* snapshot, not provably
 * first). Sourced to both underlying signals. This is ONE concern point for the
 * rubric; the indicator decides whether it qualifies.
 */

const SECONDS_PER_DAY = 86400;

export interface Pivot {
  text: string;
  sources: SignalSource[];
  domainAgeDays: number;
  aiOnsetAgoDays: number;
}

export interface Derivations {
  pivot: Pivot | null;
}

/** Coarse human age, e.g. "11 years", "8 months", "3 weeks". */
export function humanAge(days: number): string {
  if (days >= 365) {
    const y = Math.max(1, Math.round(days / 365));
    return `${y} year${y !== 1 ? "s" : ""}`;
  }
  if (days >= 30) {
    const m = Math.round(days / 30);
    return `${m} month${m !== 1 ? "s" : ""}`;
  }
  if (days >= 7) {
    const w = Math.round(days / 7);
    return `${w} week${w !== 1 ? "s" : ""}`;
  }
  const d = Math.max(0, days);
  return `${d} day${d !== 1 ? "s" : ""}`;
}

export function derive(results: CollectorResult[], nowSec: number): Derivations {
  const byKey = signalsByKey(results);
  const reg = byKey.get("domain_registration_date");
  const aiFirst = byKey.get("ai_language_first_seen");

  let pivot: Pivot | null = null;
  if (reg?.valueNum != null && aiFirst?.valueText) {
    const aiMs = Date.parse(aiFirst.valueText);
    if (!Number.isNaN(aiMs)) {
      const domainAgeDays = Math.floor((nowSec - reg.valueNum) / SECONDS_PER_DAY);
      const aiOnsetAgoDays = Math.floor((nowSec - Math.floor(aiMs / 1000)) / SECONDS_PER_DAY);
      const sources = [reg.source, aiFirst.source].filter(
        (s): s is SignalSource => s != null,
      );
      pivot = {
        text:
          `Domain registered ~${humanAge(domainAgeDays)} ago; AI language first appeared in ` +
          `sampled archive captures ~${humanAge(aiOnsetAgoDays)} ago (approximate — earliest ` +
          `sampled snapshot, not provably first).`,
        sources,
        domainAgeDays,
        aiOnsetAgoDays,
      };
    }
  }
  return { pivot };
}
