import { hostAllowed, type ResolveHost } from "../lib/ssrf";
import { toISO } from "./dates";

/**
 * Live TLS handshake (mvp-spec §2A current cert + §2D org on cert) — a socket to
 * <domain>:443, a USER-CONTROLLED host that does NOT go through the HTTP harness.
 * So it runs the SHARED SSRF host-check ITSELF before connecting, and (to close
 * the DNS-rebinding TOCTOU) connects to a VALIDATED resolved IP with
 * servername=<domain> for SNI/cert matching. Non-throwing. Injectable so CI
 * opens no socket.
 */

const DEFAULT_TIMEOUT_MS = 3000;

/** The subset of a TLS peer certificate we read. */
export interface PeerCertLike {
  subject?: { O?: string; OU?: string; CN?: string };
  issuer?: { O?: string; CN?: string };
  valid_from?: string;
  valid_to?: string;
}

export interface TlsConnectOpts {
  host: string; // the address we actually connect to (validated IP, pinned)
  servername: string; // SNI / cert match — the real domain
  port: number;
  timeoutMs: number;
}

export interface TlsDeps {
  resolveHost: ResolveHost;
  /** Open a TLS connection and resolve the peer certificate. Injectable. */
  tlsConnect: (opts: TlsConnectOpts) => Promise<PeerCertLike>;
  timeoutMs?: number;
}

export type TlsResult =
  | { ok: true; cert: PeerCertLike }
  | { ok: false; error: "blocked" | "timeout" | "network" };

function isTimeout(e: unknown): boolean {
  const code = (e as { code?: unknown } | null)?.code;
  return code === "ETIMEDOUT" || code === "ETIME";
}

/** Default real TLS connect (node:tls, lazy-imported). */
export async function socketTlsConnect(opts: TlsConnectOpts): Promise<PeerCertLike> {
  const tls = await import("node:tls");
  return new Promise<PeerCertLike>((resolve, reject) => {
    const socket = tls.connect(
      {
        host: opts.host,
        servername: opts.servername,
        port: opts.port,
        // We INSPECT the cert (we're reporting on it, not trusting it), so don't
        // fail the handshake on an invalid/expired/mismatched chain.
        rejectUnauthorized: false,
      },
      () => {
        const cert = socket.getPeerCertificate() as PeerCertLike;
        socket.end();
        resolve(cert);
      },
    );
    socket.setTimeout(opts.timeoutMs, () => {
      socket.destroy();
      reject(Object.assign(new Error("tls: timeout"), { code: "ETIMEDOUT" }));
    });
    socket.on("error", reject);
  });
}

/** Handshake to <domain>:443 after the SSRF check. Never throws. */
export async function fetchTls(domain: string, deps: TlsDeps): Promise<TlsResult> {
  const check = await hostAllowed(domain, deps.resolveHost);
  if (!check.allowed) return { ok: false, error: "blocked" }; // never connect

  // The ONLY valid connect target is a validated IP from the check. If there's
  // no IP to pin (a fail-open ENOTFOUND/EAI_AGAIN or an empty resolver result),
  // FAIL CLOSED — connecting by hostname would let tls.connect re-resolve and
  // reopen the rebinding TOCTOU this path exists to close. (IP-literal inputs
  // already yield ips:[literal], so direct-IP targets are unaffected.)
  const connectHost = check.ips[0];
  if (!connectHost) return { ok: false, error: "blocked" };

  try {
    const cert = await deps.tlsConnect({
      host: connectHost,
      servername: domain,
      port: 443,
      timeoutMs: deps.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    });
    return { ok: true, cert };
  } catch (e) {
    return { ok: false, error: isTimeout(e) ? "timeout" : "network" };
  }
}

/**
 * PURE: read the fields we report from a peer certificate. Defensive; nulls when
 * absent.
 */
export function parseTlsCert(cert: PeerCertLike): {
  issuer: string | null;
  validFrom: string | null;
  validTo: string | null;
  subjectO: string | null;
  subjectOU: string | null;
} {
  return {
    issuer: cert?.issuer?.O ?? cert?.issuer?.CN ?? null,
    validFrom: cert?.valid_from ? toISO(cert.valid_from) : null,
    validTo: cert?.valid_to ? toISO(cert.valid_to) : null,
    subjectO: cert?.subject?.O ?? null,
    subjectOU: cert?.subject?.OU ?? null,
  };
}
