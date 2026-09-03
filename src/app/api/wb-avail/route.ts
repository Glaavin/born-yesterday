import { NextResponse } from "next/server";

/**
 * TEMPORARY diagnostic (Story 24 Stage 1.5). Env-gated: absent unless
 * `BY_WB_TEST=1`. Never linked, removed after use. Raw fetch, 30s timeout,
 * hardcoded hosts. Measures from PRODUCTION egress.
 *
 * Tests whether the Wayback ecosystem can carry establishment at CC-comparable
 * latency, which would keep Wayback primary with the richer "archived since"
 * span. Three steps (?step=):
 *   avail  — Availability API, ONE call per domain. Queried with a 1996
 *            timestamp: the API returns the snapshot CLOSEST to it, which for a
 *            past date is the EARLIEST capture — so one call yields the span
 *            start, and earliest ≤ threshold IS the establishment test.
 *   cdx    — one PLAIN CDX call (for the self-throttle test: call, wait 60s
 *            from the caller, call again).
 *   narrow — one CDX call narrowed by &from/&to (the IA timeout guidance).
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

const TIMEOUT_MS = 30_000;
const UA = "BornYesterdayBot/1.0 (+https://bornyesterday.tech/about-bot)";
const THRESHOLD_TS = "20240305"; // now − ESTABLISHED_ARCHIVE_SPAN_DAYS (913d)

// Mixed vintages; the first four match the Q1 CC probe for direct comparison.
const DOMAINS = [
  "masshist.org", "ghost.org", "secondlibrary.com", "picklebrowser.com",
  "stripe.com", "cloudflare.com", "suckless.org", "kexp.org", "neon.tech", "bolt.new",
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function get(url: string): Promise<{ status: number | string; ms: number; body: string }> {
  const t0 = Date.now();
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { "user-agent": UA, accept: "*/*" }, cache: "no-store" });
    const body = await res.text();
    return { status: res.status, ms: Date.now() - t0, body };
  } catch (e) {
    return { status: "ERR", ms: Date.now() - t0, body: e instanceof Error ? e.message : String(e) };
  }
}

/** Parse the Availability "closest" snapshot timestamp (YYYYMMDD…) if present. */
function closestTs(body: string): string | null {
  try {
    const j = JSON.parse(body);
    return j?.archived_snapshots?.closest?.timestamp ?? null;
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  if (process.env.BY_WB_TEST !== "1") return new NextResponse("Not found", { status: 404 });
  const u = new URL(req.url);
  const step = u.searchParams.get("step") ?? "avail";
  const domain = u.searchParams.get("domain") ?? "example.com";
  const t0 = Date.now();

  if (step === "cdx") {
    const r = await get(`https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(domain)}&output=json&fl=timestamp&filter=statuscode:200&collapse=timestamp:8&limit=1`);
    return NextResponse.json({ step, domain, status: r.status, ms: r.ms, body: r.body.slice(0, 120) }, { headers: { "cache-control": "no-store" } });
  }

  if (step === "narrow") {
    const r = await get(`https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(domain)}&output=json&fl=timestamp&filter=statuscode:200&collapse=timestamp:8&from=1996&to=${THRESHOLD_TS}&limit=1`);
    return NextResponse.json({ step, domain, status: r.status, ms: r.ms, body: r.body.slice(0, 120) }, { headers: { "cache-control": "no-store" } });
  }

  // step === "avail": batch all domains, one call each, spaced to respect limits.
  const out: Array<Record<string, unknown>> = [];
  for (const d of DOMAINS) {
    const r = await get(`https://archive.org/wayback/available?url=${encodeURIComponent(d)}&timestamp=19960101`);
    const ts = typeof r.status === "number" && r.status === 200 ? closestTs(r.body) : null;
    const earliestDay = ts ? `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}` : null;
    // Establishment via Availability: earliest capture at or before the threshold.
    const establishes = ts != null ? ts.slice(0, 8) <= THRESHOLD_TS : null;
    out.push({ domain: d, status: r.status, ms: r.ms, earliest: earliestDay, establishes, note: r.body.slice(0, 60) });
    await sleep(2500);
  }
  return NextResponse.json({ step, thresholdTs: THRESHOLD_TS, totalMs: Date.now() - t0, results: out }, { headers: { "cache-control": "no-store" } });
}
