import type { Fetcher } from "../lib/cached-fetch";
import type { CollectorResult, Signal, SignalSource } from "./types";
import {
  fetchTls,
  parseTlsCert,
  isSelfSigned,
  certHostnameMismatch,
  type TlsDeps,
} from "./tls";
import { fetchCertspotter, parseCertspotter, certspotterUrl } from "./certspotter";

/**
 * Certificates & TLS (mvp-spec §2A current cert + §2D org on cert).
 *
 * CERTIFICATE HISTORY WAS RETIRED IN STORY 27 (W4). crt.sh has been down for the
 * entire build (5xx → 502 → 403, re-confirmed 502 on 2026-09-08) and the only
 * free alternative (SSLMate Cert Spotter) returns UNEXPIRED certs only, so a
 * first-cert date years back is unobtainable. Rather than keep a demoted,
 * never-exercised, un-feedable signal, first-cert age was removed (see the
 * indicator tombstone and amendment §3.4.4). This collector now reports only the
 * CURRENT certificate, which feeds NO verdict.
 *
 * TWO INDEPENDENT SOURCES (Move 05, architectural half only): the live TLS
 * handshake is primary — a direct socket, SSRF-checked + IP-pinned, and strictly
 * richer (issuer, validity, subject org, self-signed, hostname match). SSLMate is
 * the FALLBACK for issuer + validity when the handshake cannot complete; it is a
 * CT-index HTTP lookup (genuinely independent transport + operator). We fall
 * back rather than race because the handshake is strictly richer, so racing
 * could hand us the poorer answer; SSLMate backstops availability, not evidence.
 */

export interface CertsDeps extends TlsDeps {
  fetcher: Fetcher;
}

export async function collectCerts(
  domain: string,
  deps: CertsDeps,
): Promise<CollectorResult> {
  const tlsSource: SignalSource = { label: "Live TLS handshake", url: `https://${domain}` };
  const sslmateSource: SignalSource = { label: "SSLMate Cert Spotter", url: certspotterUrl(domain) };

  // Current cert from the live handshake (primary, richest).
  let tlsOk = false;
  let issuer: string | null = null;
  let validFrom: string | null = null;
  let validTo: string | null = null;
  let sslO: string | null = null;
  let sslOU: string | null = null;
  let selfSigned = false;
  let hostnameMismatch = false;
  try {
    const t = await fetchTls(domain, deps);
    if (t.ok) {
      tlsOk = true;
      const c = parseTlsCert(t.cert);
      issuer = c.issuer;
      validFrom = c.validFrom;
      validTo = c.validTo;
      sslO = c.subjectO;
      sslOU = c.subjectOU;
      selfSigned = isSelfSigned(t.cert);
      hostnameMismatch = certHostnameMismatch(domain, t.cert);
    }
  } catch {
    // non-throwing contract
  }

  // SSLMate FALLBACK — only for issuer + validity, only if the handshake failed.
  // Its facts are independently sourced; the negative facts and the org field it
  // cannot supply stay tied to the handshake's status.
  let sslmateOk = false;
  if (!tlsOk) {
    try {
      const r = await fetchCertspotter(domain, deps.fetcher);
      if (r.ok && r.json) {
        const p = parseCertspotter(r.json); // status from the PARSE (docs/conventions.md)
        if (p) {
          sslmateOk = true;
          issuer = p.issuer;
          validFrom = p.validFrom;
          validTo = p.validTo;
        }
      }
    } catch {
      // non-throwing contract
    }
  }

  // Which source supplied the issuer/validity trio.
  const currentOk = tlsOk || sslmateOk;
  const currentSource: SignalSource | null = tlsOk ? tlsSource : sslmateOk ? sslmateSource : null;
  const currentStatus = currentOk ? "ok" : "failed";
  const currentNote = !tlsOk && sslmateOk ? "via SSLMate fallback (handshake unavailable)" : undefined;
  // TLS-ONLY facts (org, self-signed, hostname match): a CT index cannot supply
  // them, so they track the handshake alone.
  const tlsStatus = tlsOk ? "ok" : "failed";

  const signals: Signal[] = [
    {
      key: "tls_issuer",
      label: "Current certificate issuer",
      valueText: issuer,
      valueNum: null,
      source: currentOk ? currentSource : null,
      status: currentStatus,
      note: currentNote,
    },
    {
      key: "tls_valid_from",
      label: "Certificate valid from",
      valueText: validFrom,
      valueNum: null,
      source: currentOk ? currentSource : null,
      status: currentStatus,
      note: currentNote,
    },
    {
      key: "tls_valid_to",
      label: "Certificate expires",
      valueText: validTo,
      valueNum: null,
      source: currentOk ? currentSource : null,
      status: currentStatus,
      note: currentNote,
    },
    {
      key: "ssl_org",
      label: "Certificate organization",
      valueText: sslO, // handshake-only; a completed handshake with no O is checked-empty
      valueNum: null,
      source: tlsOk ? tlsSource : null,
      status: tlsStatus,
    },
    {
      key: "ssl_ou",
      label: "Certificate org. unit",
      valueText: sslOU,
      valueNum: null,
      source: tlsOk ? tlsSource : null,
      status: tlsStatus,
    },
    // NEGATIVE CERT FACTS (Story 27, W4) — near-objective, published as neutral
    // observations and wired to NO verdict/concern/gate (accumulation is deferred,
    // ruling #6). valueText non-null = the condition holds; null = checked, absent.
    {
      key: "tls_self_signed",
      label: "Self-signed certificate",
      valueText: tlsOk && selfSigned ? "self-signed" : null,
      valueNum: null,
      source: tlsOk ? tlsSource : null,
      status: tlsStatus,
    },
    {
      key: "tls_hostname_mismatch",
      label: "Certificate hostname mismatch",
      valueText: tlsOk && hostnameMismatch ? "mismatch" : null,
      valueNum: null,
      source: tlsOk ? tlsSource : null,
      status: tlsStatus,
    },
  ];

  return {
    collector: "certs",
    signals,
    ok: currentOk,
    error: currentOk ? undefined : "no current certificate via TLS handshake or SSLMate",
  };
}
