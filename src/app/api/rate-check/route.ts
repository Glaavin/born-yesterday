import { NextResponse } from "next/server";
import { cachedFetch } from "../../../lib/cached-fetch";

/**
 * TEMPORARY diagnostic (Story 23.2 production check). Env-gated: absent unless
 * `BY_RATE_TEST=1`. Never linked, removed after use.
 *
 * Fires the exact pattern that tripped CC's 503 at seven — but THROUGH THE
 * HARNESS (`cachedFetch`), so the new per-host rate limiter actually applies.
 * The point: confirm the limiter DECLINES the over-rate calls (`rate-limited`)
 * so Common Crawl never sees the burst, and no real 503 occurs. Raw fetch would
 * bypass the limiter and prove nothing.
 *
 * ttlSeconds:0 so every call is a real request (no cache short-circuit), and a
 * cache-busting query param so the 7 calls are distinct keys.
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

export async function GET() {
  if (process.env.BY_RATE_TEST !== "1") return new NextResponse("Not found", { status: 404 });

  const out: Array<Record<string, unknown>> = [];
  for (let i = 1; i <= 7; i++) {
    const t0 = Date.now();
    const r = await cachedFetch({
      source: "cc-ratecheck",
      key: `probe-${i}`,
      url: `https://index.commoncrawl.org/CC-MAIN-2026-34-index?url=example.com&output=json&limit=1&_=${i}`,
      ttlSeconds: 0,
      kind: "third-party",
      timeoutMs: 8000,
    });
    out.push({
      call: i,
      ms: Date.now() - t0,
      outcome: r.ok ? `ok ${r.status}` : `declined:${r.error}${r.status ? ` (${r.status})` : ""}`,
    });
  }
  const sentToHost = out.filter((o) => String(o.outcome).startsWith("ok") || String(o.outcome).includes("(")).length;
  const rateLimited = out.filter((o) => String(o.outcome) === "declined:rate-limited").length;
  const any503 = out.some((o) => String(o.outcome).includes("503"));
  return NextResponse.json(
    { test: "23.2 rate limiter — 7-call CC burst through the harness", sentToHost, rateLimited, any503, calls: out },
    { headers: { "cache-control": "no-store" } },
  );
}
