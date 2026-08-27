import type { Fetcher } from "../lib/cached-fetch";
import type { CollectorResult, Signal, SignalSource, SignalStatus } from "./types";
import { fetchRdap, parseRdap, rdapUrl } from "./rdap";
import { queryWhois, parseWhois, type WhoisDeps } from "./whois";
import { isoToEpochSec } from "./dates";

/**
 * Domain identity & age (mvp-spec §2A) — the FIRST signal collector and the
 * template for 11–15. RDAP primary, WHOIS fallback. Every value is sourced;
 * registrar is DISPLAY ONLY (never editorialized). Failures RETURN (null values
 * / ok:false) — they never throw. No report wiring, no UI (Story 16 assembles).
 */

export interface DomainIdentityDeps extends WhoisDeps {
  /** The cached-fetch harness (RDAP rides it as kind:"third-party"). */
  fetcher: Fetcher;
  /** Epoch MILLISECONDS, for the age derivation. */
  now?: () => number;
}

type Source = "rdap" | "whois" | null;

const SECONDS_PER_DAY = 86400;

export async function collectDomainIdentity(
  domain: string,
  deps: DomainIdentityDeps,
): Promise<CollectorResult> {
  const sources: Record<"rdap" | "whois", SignalSource> = {
    rdap: { label: "RDAP registration record", url: rdapUrl(domain) },
    whois: { label: "WHOIS", url: `https://www.whois.com/whois/${domain}` },
  };

  let regIso: string | null = null;
  let regFrom: Source = null;
  let registrar: string | null = null;
  let registrarFrom: Source = null;

  // Did each registry lookup COMPLETE? A registry that answers without a
  // creation date (common for .edu and several ccTLDs) is a checked-empty
  // FINDING; a lookup that timed out is not (Story 18.3 §1.1, §1.3).
  let rdapOk = false;
  let whoisOk = false;

  // RDAP (primary).
  try {
    const r = await fetchRdap(domain, deps.fetcher);
    if (r.ok && r.json) {
      const p = parseRdap(r.json);
      // Status from the PARSE, not the fetch (docs/conventions.md). The WHOIS
      // fallback below is gated on the VALUE, so it still runs either way.
      if (p) {
        rdapOk = true;
      }
      if (p?.registrationDate) {
        regIso = p.registrationDate;
        regFrom = "rdap";
      }
      if (p?.registrar) {
        registrar = p.registrar;
        registrarFrom = "rdap";
      }
    }
  } catch {
    // non-throwing contract — fall through to WHOIS
  }

  // WHOIS (fallback) — only if RDAP didn't supply both.
  if (!regIso || !registrar) {
    try {
      const text = await queryWhois(domain, deps);
      if (text) {
        const p = parseWhois(text);
        if (p) whoisOk = true; // parsed, not merely fetched
        if (!regIso && p?.registrationDate) {
          regIso = p.registrationDate;
          regFrom = "whois";
        }
        if (!registrar && p?.registrar) {
          registrar = p.registrar;
          registrarFrom = "whois";
        }
      }
    } catch {
      // non-throwing contract
    }
  }

  const nowSec = Math.floor((deps.now?.() ?? Date.now()) / 1000);
  // ok-contract: gate on a cleanly-PARSED date, not mere field presence. An
  // unparseable eventDate is dropped (we never assert what we can't parse).
  const regSec = isoToEpochSec(regIso);
  if (regIso != null && regSec == null) {
    regIso = null;
    regFrom = null;
  }
  const ageDays = regSec != null ? Math.floor((nowSec - regSec) / SECONDS_PER_DAY) : null;

  // At least one registry answered ⇒ the check RAN.
  const lookupStatus: SignalStatus = rdapOk || whoisOk ? "ok" : "failed";
  // Where a value was found, cite where it came from. Where the lookup ran and
  // the field simply is not published, cite the record we actually consulted.
  const consulted: SignalSource | null = rdapOk
    ? sources.rdap
    : whoisOk
      ? sources.whois
      : null;
  const srcFor = (from: Source): SignalSource | null =>
    from ? sources[from] : consulted;
  const noteFor = (from: Source): string | undefined =>
    from === "whois" ? "via WHOIS fallback" : undefined;

  const signals: Signal[] = [
    {
      key: "domain_registration_date",
      label: "Registration date",
      valueText: regIso,
      valueNum: regSec,
      source: srcFor(regFrom),
      status: lookupStatus,
      note: noteFor(regFrom),
    },
    {
      key: "domain_age_days",
      label: "Domain age (days)",
      valueText: null,
      valueNum: ageDays,
      source: srcFor(regFrom),
      status: lookupStatus,
      note: noteFor(regFrom),
    },
    {
      key: "registrar",
      label: "Registrar",
      valueText: registrar, // display only — never editorialized
      valueNum: null,
      source: srcFor(registrarFrom),
      status: lookupStatus,
      note: noteFor(registrarFrom),
    },
  ];

  const ok = regIso != null;
  return {
    collector: "domain-identity",
    signals,
    ok,
    error: ok ? undefined : "registration date not found via RDAP or WHOIS",
  };
}
