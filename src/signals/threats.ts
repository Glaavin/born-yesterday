import type { Fetcher } from "../lib/cached-fetch";
import type { CollectorResult, Signal, SignalSource } from "./types";
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

function listingSignal(
  key: string,
  label: string,
  listed: boolean | null,
  source: SignalSource,
): Signal {
  if (listed === null) {
    return { key, label, valueText: null, valueNum: null, source: null, note: "not checked" };
  }
  return {
    key,
    label,
    valueText: listed ? "Listed" : "Not listed",
    valueNum: null,
    source, // a checked result (listed or clean) is sourced
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

  // PhishTank — local table. count 0 ⇒ never ingested ⇒ not checked (null).
  let phishtankListed: boolean | null = null;
  try {
    if ((await deps.phishtankCount()) > 0) {
      phishtankListed = await deps.phishtankListed(domain);
    }
  } catch {
    phishtankListed = null; // DB hiccup ⇒ not checked
  }

  // URLhaus — harness.
  let urlhausListed: boolean | null = null;
  try {
    const r = await fetchUrlhaus(domain, deps.fetcher, deps.urlhausKey);
    if (r.ok && r.json) urlhausListed = parseUrlhaus(r.json).listed;
  } catch {
    urlhausListed = null;
  }

  const signals: Signal[] = [
    listingSignal("phishtank_listed", "PhishTank", phishtankListed, phishtankSource),
    listingSignal("urlhaus_listed", "URLhaus", urlhausListed, urlhausSource),
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
