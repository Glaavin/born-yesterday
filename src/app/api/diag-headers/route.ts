import { headers } from "next/headers";
import { NextResponse } from "next/server";

/**
 * TEMPORARY diagnostic. Env-gated: absent unless `BY_DIAG_HEADERS=1`. Never
 * linked, no product path touches it, removed after use.
 *
 * Why this exists: production is returning "limit-reached" for domains that
 * have never been generated, with zero rows in `search_quota` for the current
 * day. That combination is only reachable when `identified` (page.tsx) is
 * false, which the code derives from `x-forwarded-for` being absent or empty.
 * A real browser reproduced it, ruling out a curl/tooling artifact. This
 * echoes exactly what the running function sees, so the next step is
 * evidence rather than a guess.
 */
export async function GET() {
  if (process.env.BY_DIAG_HEADERS !== "1") {
    return new NextResponse("Not found", { status: 404 });
  }
  const h = await headers();
  const relevant = ["x-forwarded-for", "x-real-ip", "x-vercel-forwarded-for", "x-vercel-ip-country", "cf-connecting-ip", "forwarded"];
  const out: Record<string, string | null> = {};
  for (const k of relevant) out[k] = h.get(k);
  return NextResponse.json(
    { note: "temporary diagnostic — Story 23 verification, remove after use", headers: out },
    { headers: { "cache-control": "no-store, max-age=0" } },
  );
}
