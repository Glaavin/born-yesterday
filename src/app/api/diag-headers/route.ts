import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { sessionKey, utcDay, SEARCH_LIMIT_PER_DAY } from "../../../serve/quota";
import { getReport } from "../../../db/queries";
import { getSessionQuota } from "../../../db/queries";
import { isFresh } from "../../../serve/freshness";
import { decideServe } from "../../../serve/decide";

/**
 * TEMPORARY diagnostic. Env-gated: absent unless `BY_DIAG_HEADERS=1`.
 *
 * Extended: reproduces serveReport's DECISION inputs exactly (not the whole
 * pipeline — no collect/persist/increment side effects), for one domain via
 * ?domain=, to make the "limit-reached with zero quota rows" mismatch visible
 * rather than inferred.
 */
export async function GET(req: Request) {
  if (process.env.BY_DIAG_HEADERS !== "1") {
    return new NextResponse("Not found", { status: 404 });
  }
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  const identified = forwarded != null && forwarded.trim().length > 0;
  const ip = forwarded?.split(",")[0]?.trim() || "unknown";

  const domain = new URL(req.url).searchParams.get("domain");
  let decision: unknown = null;
  let trace: Record<string, unknown> = {};
  if (domain) {
    const nowSec = Math.floor(Date.now() / 1000);
    const day = utcDay(nowSec);
    const key = sessionKey(ip);
    const existing = await getReport(domain);
    const fresh = existing != null && isFresh(existing, nowSec);
    const used = await getSessionQuota(key, day);
    const quotaRemaining = identified !== false && used < SEARCH_LIMIT_PER_DAY;
    decision = decideServe({ existing: existing != null, fresh, quotaRemaining });
    trace = { domain, day, sessionKeyPrefix: key.slice(0, 12), existing: existing != null, fresh, used, quotaRemaining, nowSec };
  }

  return NextResponse.json(
    {
      note: "temporary diagnostic — remove after use",
      headers: { "x-forwarded-for": forwarded },
      identified,
      ip,
      decision,
      trace,
    },
    { headers: { "cache-control": "no-store, max-age=0" } },
  );
}
