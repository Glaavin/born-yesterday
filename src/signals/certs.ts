import type { Fetcher } from "../lib/cached-fetch";
import type { CollectorResult, Signal, SignalSource } from "./types";
import { isoToEpochSec } from "./dates";
import { fetchCrtsh, parseCrtsh, crtshUrl } from "./crtsh";
import { fetchTls, parseTlsCert, type TlsDeps } from "./tls";

/**
 * Certificates & TLS (mvp-spec §2A current cert + §2D org on cert). crt.sh
 * first-cert date (rides the harness) + a live TLS handshake (the user-host
 * socket, SSRF-checked before connect). Every value sourced; ok gates on the
 * cleanly-parsed primary (first_cert_date). Failures RETURN — never throw.
 */

export interface CertsDeps extends TlsDeps {
  fetcher: Fetcher;
}

export async function collectCerts(
  domain: string,
  deps: CertsDeps,
): Promise<CollectorResult> {
  const crtsh: SignalSource = { label: "crt.sh certificate transparency", url: crtshUrl(domain) };
  const tls: SignalSource = { label: "Live TLS handshake", url: `https://${domain}` };

  // crt.sh — first-ever cert.
  let firstCertIso: string | null = null;
  let certCount: number | null = null;
  try {
    const r = await fetchCrtsh(domain, deps.fetcher);
    if (r.ok && r.json) {
      const p = parseCrtsh(r.json);
      firstCertIso = p.firstCertDate;
      certCount = p.certCount;
    }
  } catch {
    // non-throwing contract
  }

  // Live TLS handshake — current cert (SSRF-checked + IP-pinned inside fetchTls).
  let issuer: string | null = null;
  let validTo: string | null = null;
  let sslO: string | null = null;
  let sslOU: string | null = null;
  try {
    const t = await fetchTls(domain, deps);
    if (t.ok) {
      const c = parseTlsCert(t.cert);
      issuer = c.issuer;
      validTo = c.validTo;
      sslO = c.subjectO;
      sslOU = c.subjectOU;
    }
  } catch {
    // non-throwing contract
  }

  // ok-contract: gate on a cleanly-parsed primary value, not mere presence.
  let firstCertSec = isoToEpochSec(firstCertIso);
  if (firstCertIso != null && firstCertSec == null) firstCertIso = null; // unparseable → don't assert
  firstCertSec = isoToEpochSec(firstCertIso);

  const signals: Signal[] = [
    {
      key: "first_cert_date",
      label: "First certificate seen",
      valueText: firstCertIso,
      valueNum: firstCertSec,
      source: firstCertIso ? crtsh : null,
    },
    {
      key: "cert_count",
      label: "Certificates on record",
      valueText: null,
      valueNum: certCount,
      source: certCount != null ? crtsh : null,
    },
    {
      key: "tls_issuer",
      label: "Current certificate issuer",
      valueText: issuer,
      valueNum: null,
      source: issuer ? tls : null,
    },
    {
      key: "tls_valid_to",
      label: "Certificate expires",
      valueText: validTo,
      valueNum: null,
      source: validTo ? tls : null,
    },
    {
      key: "ssl_org",
      label: "Certificate organization",
      valueText: sslO,
      valueNum: null,
      source: sslO ? tls : null,
    },
    {
      key: "ssl_ou",
      label: "Certificate org. unit",
      valueText: sslOU,
      valueNum: null,
      source: sslOU ? tls : null,
    },
  ];

  const ok = firstCertIso != null;
  return {
    collector: "certs",
    signals,
    ok,
    error: ok ? undefined : "first certificate date not found via crt.sh",
  };
}
