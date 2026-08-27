import type { CollectorResult, SignalSource } from "../signals/types";
import { signalsByKey } from "./signals";

/**
 * Cross-signal derivations (Story 16 §C). The "AI pivot": when a registration
 * date and an archived AI-language date both exist, we can say WHEN AI language
 * first appears in the captures we sampled. The date is labelled APPROXIMATE
 * (earliest *sampled* snapshot, not provably first).
 *
 * This is an OBSERVATION, not a concern point (18.3 §2.7, owner ruling
 * 2026-08-26) — the indicator decides whether it is notable enough to publish,
 * never whether it counts against the domain. Both dates still reach the reader;
 * they are simply no longer composed into an argument. See `Pivot.text`.
 */

const SECONDS_PER_DAY = 86400;

export interface Pivot {
  /**
   * The AI-language observation, ALONE. It used to read
   *   "Domain registered ~36 years ago; AI language first appeared ... ~2 days ago"
   * and that semicolon was the argument: two dates composed into one contrastive
   * sentence is a claim about their relationship, and we built the contrast.
   *
   * That mattered beyond editing. Our position is that neutral juxtaposition is
   * fine because the READER draws the inference. Facts appearing near each other
   * is juxtaposition; facts composed into one contrastive sentence is AUTHORSHIP.
   * Having demoted the pivot from a concern precisely so we would stop drawing
   * the conclusion, the prose was still drawing it.
   *
   * So: one statement, one subject, no connective implying relationship. The
   * registration date is published separately and ONCE, by the indicator's own
   * registration observation — this sentence must not restate it.
   */
  text: string;
  /** Cites the CAPTURE that matched — the evidence for the sentence above. It
   *  was previously sourced to RDAP, which evidences the half we removed. */
  source: SignalSource | null;
  /** Both underlying sources, for the report's Sources tab. */
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
          `AI language first appears in a sampled capture from ${aiFirst.valueText} ` +
          `(approximate — earliest sampled snapshot, not provably first).`,
        source: aiFirst.source ?? null,
        sources,
        domainAgeDays,
        aiOnsetAgoDays,
      };
    }
  }
  return { pivot };
}
