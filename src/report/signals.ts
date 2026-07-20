import type { CollectorResult, Signal } from "../signals/types";

/** Flatten all collector signals into a key→signal map (keys are unique across
 *  collectors; first-wins). The engine reads signals by key. */
export function signalsByKey(results: CollectorResult[]): Map<string, Signal> {
  const m = new Map<string, Signal>();
  for (const c of results) {
    for (const s of c.signals) {
      if (!m.has(s.key)) m.set(s.key, s);
    }
  }
  return m;
}
