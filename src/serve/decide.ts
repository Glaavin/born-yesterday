/**
 * Serve-decision (mvp-spec §6 flow, §3 serve-stale-while-revalidate) — PURE, the
 * core branching. Quota gates COLLECTION, not cached views (see serveReport).
 */

export type ServeAction =
  | "serve-fresh" // cached + fresh → serve as-is (free)
  | "serve-stale-refresh" // cached + stale, quota left → serve stale now, refresh in bg
  | "serve-stale" // cached + stale, no quota → serve stale, no refresh
  | "collect" // no report, quota left → generate synchronously
  | "limit-reached"; // no report, no quota → nothing to show

export interface ServeDecision {
  action: ServeAction;
  consumesQuota: boolean;
}

export function decideServe(input: {
  existing: boolean;
  fresh: boolean;
  quotaRemaining: boolean;
}): ServeDecision {
  const { existing, fresh, quotaRemaining } = input;

  if (existing && fresh) return { action: "serve-fresh", consumesQuota: false };
  if (existing && !fresh && quotaRemaining)
    return { action: "serve-stale-refresh", consumesQuota: true };
  if (existing && !fresh && !quotaRemaining)
    return { action: "serve-stale", consumesQuota: false };
  if (!existing && quotaRemaining) return { action: "collect", consumesQuota: true };
  return { action: "limit-reached", consumesQuota: false };
}
