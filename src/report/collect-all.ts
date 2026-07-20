import type { Fetcher } from "../lib/cached-fetch";
import type { CollectorResult } from "../signals/types";
import { collectDomainIdentity, type DomainIdentityDeps } from "../signals/domain-identity";
import { collectCerts, type CertsDeps } from "../signals/certs";
import { collectDns } from "../signals/dns-signals";
import { collectThreats, type ThreatsDeps } from "../signals/threats";
import { collectReputation } from "../signals/reputation";
import { collectAiPivot } from "../signals/ai-pivot";

/**
 * Collector orchestrator (Story 16 §B). Runs all six collectors in PARALLEL under
 * ONE shared 8s deadline (the budget Story 9's harness accepts via opts.signal).
 * Partial-OK: a collector that errors/times out yields ok:false + nulls and NEVER
 * kills the run. NOTE: the WHOIS (port-43) and TLS (443) socket sidecars keep
 * their own shorter per-call timeouts; the shared deadline is threaded into every
 * HARNESS (HTTP) call via the fetcher wrapper below.
 */

const DEFAULT_DEADLINE_MS = 8000;

export interface CollectAllDeps {
  fetcher: Fetcher;
  cache: DomainIdentityDeps["cache"];
  whoisQuery: DomainIdentityDeps["whoisQuery"];
  resolveHost: CertsDeps["resolveHost"];
  tlsConnect: CertsDeps["tlsConnect"];
  urlhausKey?: string;
  phishtankCount: ThreatsDeps["phishtankCount"];
  phishtankListed: ThreatsDeps["phishtankListed"];
  now?: () => number;
}

export interface CollectorSpec {
  name: string;
  run: (signal: AbortSignal) => Promise<CollectorResult>;
}

/** Wrap a fetcher so every call carries the shared report deadline (Story 9 seam). */
function withDeadline(fetcher: Fetcher, signal: AbortSignal): Fetcher {
  return (opts) => fetcher({ ...opts, signal: opts.signal ?? signal });
}

/** Build the six collector specs, each forwarding the deadline into its harness calls. */
export function buildCollectorSpecs(domain: string, deps: CollectAllDeps): CollectorSpec[] {
  const f = (s: AbortSignal) => withDeadline(deps.fetcher, s);
  return [
    {
      name: "domain-identity",
      run: (s) =>
        collectDomainIdentity(domain, {
          fetcher: f(s),
          cache: deps.cache,
          whoisQuery: deps.whoisQuery,
          now: deps.now,
          signal: s, // the WHOIS socket honors the shared deadline (Story 16.1)
        }),
    },
    {
      name: "certs",
      run: (s) =>
        collectCerts(domain, {
          fetcher: f(s),
          resolveHost: deps.resolveHost,
          tlsConnect: deps.tlsConnect,
          signal: s, // the TLS handshake honors the shared deadline (Story 16.1)
        }),
    },
    { name: "dns", run: (s) => collectDns(domain, { fetcher: f(s) }) },
    {
      name: "threats",
      run: (s) =>
        collectThreats(domain, {
          fetcher: f(s),
          urlhausKey: deps.urlhausKey,
          phishtankCount: deps.phishtankCount,
          phishtankListed: deps.phishtankListed,
        }),
    },
    { name: "reputation", run: (s) => collectReputation(domain, { fetcher: f(s) }) },
    { name: "ai-pivot", run: (s) => collectAiPivot(domain, { fetcher: f(s) }) },
  ];
}

/**
 * Run specs in parallel under one deadline. Partial-OK: a thrown/rejected
 * collector becomes a synthetic ok:false result rather than failing the batch.
 */
export async function runAllCollectors(
  specs: CollectorSpec[],
  opts: { deadlineMs?: number; signal?: AbortSignal } = {},
): Promise<CollectorResult[]> {
  const deadline = AbortSignal.timeout(opts.deadlineMs ?? DEFAULT_DEADLINE_MS);
  const signal = opts.signal ? AbortSignal.any([deadline, opts.signal]) : deadline;
  return Promise.all(
    specs.map((s) =>
      Promise.resolve()
        .then(() => s.run(signal))
        .catch(
          (e): CollectorResult => ({
            collector: s.name,
            signals: [],
            ok: false,
            error: e instanceof Error ? e.message : "collector failed",
          }),
        ),
    ),
  );
}

/** Convenience: build the specs and run them. */
export function collectAll(
  domain: string,
  deps: CollectAllDeps,
  opts?: { deadlineMs?: number; signal?: AbortSignal },
): Promise<CollectorResult[]> {
  return runAllCollectors(buildCollectorSpecs(domain, deps), opts);
}
