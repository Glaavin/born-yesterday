import type { Fetcher } from "../lib/cached-fetch";
import type { CollectorResult, Signal, SignalSource, SignalStatus } from "./types";
import { fetchUrlhaus, parseUrlhaus } from "./urlhaus";

/**
 * Threat-list lookups (mvp-spec §2C) — binary red-flag signals. URLhaus rides the
 * harness; PhishTank is a local-table lookup (after `pnpm threat:ingest`). Both
 * keys are OPTIONAL: an unreachable/unauthorized source degrades to
 * valueText:null + note:"not checked" — it never blocks the report and never
 * throws. Clean (checked, not listed) is information. No report wiring, no UI.
 */

export interface ThreatsDeps {
  fetcher: Fetcher;
  urlhausKey?: string;
  /** Count of locally-ingested PhishTank rows (0 ⇒ never ingested ⇒ "not checked"). */
  phishtankCount: () => Promise<number>;
  /** Is this host present in the local PhishTank table? */
  phishtankListed: (host: string) => Promise<boolean>;
}

/**
 * The threat-listing value vocabulary. The RED trigger compares against these, so
 * they are constants rather than inline strings — a renamed label would otherwise
 * silently stop Red from firing. `null` (absent) means NOT CHECKED, which is
 * distinct from THREAT_NOT_LISTED (checked, clean).
 */
export const THREAT_LISTED = "Listed";
export const THREAT_NOT_LISTED = "Not listed";

function listingSignal(
  key: string,
  label: string,
  listed: boolean | null,
  source: SignalSource,
  /** Why there is no verdict: the feed was unreachable ("failed") or we never
   *  queried it — no key, never ingested ("not_attempted"). */
  unavailable: SignalStatus = "failed",
): Signal {
  if (listed === null) {
    return {
      key,
      label,
      valueText: null,
      valueNum: null,
      source: null,
      status: unavailable,
      note: "not checked",
    };
  }
  return {
    key,
    label,
    valueText: listed ? THREAT_LISTED : THREAT_NOT_LISTED,
    valueNum: null,
    source, // a checked result (listed or clean) is sourced
    status: "ok",
  };
}

export async function collectThreats(
  domain: string,
  deps: ThreatsDeps,
): Promise<CollectorResult> {
  const phishtankSource: SignalSource = { label: "PhishTank", url: "https://www.phishtank.com/" };
  const urlhausSource: SignalSource = {
    label: "URLhaus (abuse.ch)",
    url: `https://urlhaus.abuse.ch/browse.php?search=${encodeURIComponent(domain)}`,
  };

  // PhishTank — local table. count 0 ⇒ never ingested ⇒ we never ran the check.
  let phishtankListed: boolean | null = null;
  let phishtankUnavailable: SignalStatus = "not_attempted";
  try {
    if ((await deps.phishtankCount()) > 0) {
      phishtankListed = await deps.phishtankListed(domain);
    }
  } catch {
    phishtankListed = null;
    phishtankUnavailable = "failed"; // DB hiccup ⇒ attempted, did not complete
  }

  // URLhaus — harness.
  let urlhausListed: boolean | null = null;
  // A response we could not turn into a verdict (e.g. invalid_auth_key) means the
  // check never really ran; a transport failure means it was attempted and failed.
  let urlhausUnavailable: SignalStatus = "failed";
  try {
    const r = await fetchUrlhaus(domain, deps.fetcher, deps.urlhausKey);
    if (r.ok && r.json) {
      urlhausListed = parseUrlhaus(r.json).listed;
      if (urlhausListed === null) urlhausUnavailable = "not_attempted";
    }
  } catch {
    urlhausListed = null;
  }

  const signals: Signal[] = [
    listingSignal("phishtank_listed", "PhishTank", phishtankListed, phishtankSource, phishtankUnavailable),
    listingSignal("urlhaus_listed", "URLhaus", urlhausListed, urlhausSource, urlhausUnavailable),
  ];

  // ok = at least one source was actually checked (not both null).
  const checkedAny = phishtankListed !== null || urlhausListed !== null;
  return {
    collector: "threats",
    signals,
    ok: checkedAny,
    error: checkedAny ? undefined : "no threat source could be checked",
  };
}
