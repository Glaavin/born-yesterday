import type { Fetcher } from "../lib/cached-fetch";
import type { CollectorResult, Signal, SignalSource } from "./types";
import { fetchRdap, parseRdap, rdapUrl } from "./rdap";
import { queryWhois, parseWhois, type WhoisDeps } from "./whois";

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

  // RDAP (primary).
  try {
    const r = await fetchRdap(domain, deps.fetcher);
    if (r.ok && r.json) {
      const p = parseRdap(r.json);
      if (p.registrationDate) {
        regIso = p.registrationDate;
        regFrom = "rdap";
      }
      if (p.registrar) {
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
        if (!regIso && p.registrationDate) {
          regIso = p.registrationDate;
          regFrom = "whois";
        }
        if (!registrar && p.registrar) {
          registrar = p.registrar;
          registrarFrom = "whois";
        }
      }
    } catch {
      // non-throwing contract
    }
  }

  const nowSec = Math.floor((deps.now?.() ?? Date.now()) / 1000);
  const regSec = regIso != null ? Math.floor(Date.parse(regIso) / 1000) : null;
  const ageDays =
    regSec != null && !Number.isNaN(regSec)
      ? Math.floor((nowSec - regSec) / SECONDS_PER_DAY)
      : null;

  const srcFor = (from: Source): SignalSource | null =>
    from ? sources[from] : null;
  const noteFor = (from: Source): string | undefined =>
    from === "whois" ? "via WHOIS fallback" : undefined;

  const signals: Signal[] = [
    {
      key: "domain_registration_date",
      label: "Registration date",
      valueText: regIso,
      valueNum: regSec != null && !Number.isNaN(regSec) ? regSec : null,
      source: srcFor(regFrom),
      note: noteFor(regFrom),
    },
    {
      key: "domain_age_days",
      label: "Domain age (days)",
      valueText: null,
      valueNum: ageDays,
      source: srcFor(regFrom),
      note: noteFor(regFrom),
    },
    {
      key: "registrar",
      label: "Registrar",
      valueText: registrar, // display only — never editorialized
      valueNum: null,
      source: srcFor(registrarFrom),
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
