import { NextResponse } from "next/server";

/**
 * TEMPORARY diagnostic (Story 24 Q1). Env-gated: absent unless `BY_CC_TEST=1`.
 * Never linked, no product path touches it, removed after the measurement.
 *
 * Measures, FROM PRODUCTION EGRESS (W0 established production differs from the
 * audit machine), the cost of the ESTABLISHMENT query shape — a SINGLE index
 * lookup against one chosen crawl vintage. NOT the monthly walk, which is the
 * continuity pattern and out of this story's scope.
 *
 * Raw fetch with a 30s timeout, deliberately bypassing the 8s harness deadline
 * — the whole point is to measure true latency, which the deadline would clip.
 * Every host is a hardcoded literal; no user-controlled host anywhere.
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

const TIMEOUT_MS = 30_000;
const UA = "BornYesterdayBot/1.0 (+https://bornyesterday.tech/about-bot)";

// Fixed vintages: latest, ~1y, ~3y (near the establishment threshold), ~6y, ~8y,
// oldest weekly-format. The index endpoint shape is the pywb CDX one we parse.
const CRAWLS: Array<{ label: string; id: string }> = [
  { label: "latest~0y", id: "CC-MAIN-2026-34" },
  { label: "~1y", id: "CC-MAIN-2025-33" },
  { label: "~3y (threshold)", id: "CC-MAIN-2023-06" },
  { label: "~6y", id: "CC-MAIN-2020-40" },
  { label: "~8y", id: "CC-MAIN-2018-43" },
  { label: "oldest~13y", id: "CC-MAIN-2013-20" },
];

const ccUrl = (crawl: string, domain: string) =>
  `https://index.commoncrawl.org/${crawl}-index?url=${encodeURIComponent(domain)}&output=json&limit=1`;

async function probe(url: string): Promise<{ status: number | string; ms: number; note: string }> {
  const t0 = Date.now();
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { "user-agent": UA, accept: "*/*" }, cache: "no-store" });
    const body = await res.text();
    // A CC "not present in this crawl" is HTTP 404 with a body; a present hit is
    // 200 with an NDJSON line. Both are ANSWERS, distinct from a timeout.
    return { status: res.status, ms: Date.now() - t0, note: `${body.length}B · ${body.slice(0, 70).replace(/\s+/g, " ")}` };
  } catch (e) {
    return { status: "ERR", ms: Date.now() - t0, note: e instanceof Error ? e.message : String(e) };
  }
}

export async function GET(req: Request) {
  if (process.env.BY_CC_TEST !== "1") return new NextResponse("Not found", { status: 404 });
  const domain = new URL(req.url).searchParams.get("domain") ?? "example.com";

  const out: Array<Record<string, unknown>> = [];
  const t0 = Date.now();
  const info = await probe("https://index.commoncrawl.org/collinfo.json");
  out.push({ step: "collinfo.json", ...info });
  for (const c of CRAWLS) {
    // Sequential and SAME host — but this is a measurement of single-call cost,
    // not a burst; one call per vintage, no walk.
    const p = await probe(ccUrl(c.id, domain));
    out.push({ step: `cc:${c.label}`, crawl: c.id, present: p.status === 200, ...p });
  }
  return NextResponse.json(
    { test: "CC establishment latency", domain, totalMs: Date.now() - t0, probes: out },
    { headers: { "cache-control": "no-store, max-age=0" } },
  );
}
