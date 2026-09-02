import { NextResponse } from "next/server";

/**
 * W0 — production egress test. TEMPORARY, and env-gated: absent unless
 * `BY_W0_TEST=1`. Never linked, never cached, no product code path touches it.
 * Authority: `docs/source-method-roadmap.md` §5-W0.
 *
 * THE QUESTION. From the audit machine archive.org returns 429 in ~0.24s to
 * every call — refusal, not slowness. B12 says our own archive check fails
 * often. W0's job is not really the verdict, which is largely known; it is the
 * three numbers W1 needs: where a bisect burst trips, Common Crawl's latency
 * from Vercel, and direct-registry RDAP timing from Vercel.
 *
 * WHY THIS BYPASSES THE HARNESS, and why that is correct exactly here.
 * `cached-fetch` imposes the 8-second collection deadline. That deadline clips
 * precisely what we are measuring: a 38-second answer and a refused one both
 * collapse to "failed" through it, and the difference between slow and refused
 * is the entire finding. So this route uses RAW fetch with a ~30s timeout on the
 * same egress. The harness stays authoritative everywhere else — this is a
 * measuring instrument, not a collector, and it must not become one.
 *
 * SSRF: every host below is a fixed, hardcoded literal. There is no
 * user-controlled input anywhere in this file, so the guard has nothing to
 * guard; the allowlist IS the code.
 *
 * SHAPE: deliberately close to what W8 (source health) will need — ping a
 * source, record status and latency, report. W8 is NOT built here.
 */

export const dynamic = "force-dynamic";
export const revalidate = 0;

const TIMEOUT_MS = 30_000;
const UA = "BornYesterdayBot/1.0 (+https://bornyesterday.tech/about-bot)";
/** Politeness between calls within a sequence. */
const SPACING_MS = 1_200;

type Probe = {
  step: string;
  call: number;
  url: string;
  status: number | string;
  ms: number;
  note?: string;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function probe(step: string, call: number, url: string, accept = "*/*"): Promise<Probe> {
  const t0 = Date.now();
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { "user-agent": UA, accept },
      cache: "no-store",
    });
    // Read a little of the body: a refusal that arrives as a 200 with an error
    // page is a different fact from a clean answer, and status alone hides it.
    const body = await res.text();
    return {
      step,
      call,
      url,
      status: res.status,
      ms: Date.now() - t0,
      note: `${body.length}B${body.length ? ` · ${body.slice(0, 60).replace(/\s+/g, " ")}` : ""}`,
    };
  } catch (e) {
    return {
      step,
      call,
      url,
      status: "ERR",
      ms: Date.now() - t0,
      note: e instanceof Error ? e.message : String(e),
    };
  }
}

const CDX = (d: string, limit = 1) =>
  `https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(d)}&output=json&fl=timestamp,original&filter=statuscode:200&collapse=timestamp:8&limit=${limit}`;
const AVAIL = (d: string) => `https://archive.org/wayback/available?url=${encodeURIComponent(d)}`;
const CC = (index: string, d: string) =>
  `https://index.commoncrawl.org/${index}-index?url=${encodeURIComponent(d)}&output=json&limit=1`;

/** Monthly Common Crawl indexes — the continuity mechanism's real access pattern. */
const CC_INDEXES = ["CC-MAIN-2025-33", "CC-MAIN-2025-26", "CC-MAIN-2025-18", "CC-MAIN-2025-13", "CC-MAIN-2025-05"];

export async function GET() {
  if (process.env.BY_W0_TEST !== "1") {
    return new NextResponse("Not found", { status: 404 });
  }

  const out: Probe[] = [];
  const startedAt = new Date().toISOString();

  // ---- 1 & 2: Wayback singles ----
  out.push(await probe("1-cdx-single", 1, CDX("stripe.com")));
  await sleep(SPACING_MS);
  out.push(await probe("2-availability", 1, AVAIL("stripe.com")));
  await sleep(SPACING_MS);

  // ---- 3: the bisect burst — SKIP CONDITION FIRST ----
  // Fourteen more calls at a host that just refused twice is impolite and
  // answers nothing. A refusal is an answer, not an obstacle.
  const singlesRefused = out.slice(0, 2).every((p) => p.status === 429);
  let burstNote = "";
  if (singlesRefused) {
    burstNote = "burst skipped, singles refused (both 429)";
  } else {
    for (let i = 1; i <= 14; i++) {
      const p = await probe("3-bisect-burst", i, CDX("wikipedia.org", 5));
      out.push(p);
      // Record WHERE it trips — that number sizes W1's politeness budget.
      if (p.status !== 200) {
        burstNote = `first non-200 at call ${i} (status ${p.status})`;
        break;
      }
      await sleep(SPACING_MS);
    }
    if (!burstNote) burstNote = "14/14 clean";
  }

  // ---- 4: Common Crawl ----
  await sleep(SPACING_MS);
  out.push(await probe("4a-cc-latest", 1, CC(CC_INDEXES[0], "stripe.com")));
  await sleep(SPACING_MS);
  out.push(await probe("4a-cc-latest", 2, CC(CC_INDEXES[0], "masshist.org")));
  for (let i = 0; i < CC_INDEXES.length; i++) {
    await sleep(SPACING_MS);
    out.push(await probe("4b-cc-monthly", i + 1, CC(CC_INDEXES[i], "masshist.org")));
  }

  // ---- 5: registry path — direct vs middleman ----
  await sleep(SPACING_MS);
  out.push(await probe("5a-iana-bootstrap", 1, "https://data.iana.org/rdap/dns.json"));
  // Both .com deliberately. The bootstrap maps .com/.net to Verisign and .org to
  // Public Interest Registry, so a mixed pair would compare two different
  // registries rather than direct-vs-middleman. Keeping the registry constant is
  // what makes the 4× audit-machine finding testable.
  for (const d of ["stripe.com", "github.com"]) {
    await sleep(SPACING_MS);
    out.push(await probe("5b-rdap-direct", 1, `https://rdap.verisign.com/com/v1/domain/${d}`, "application/rdap+json"));
    await sleep(SPACING_MS);
    out.push(await probe("5c-rdap-org", 1, `https://rdap.org/domain/${d}`, "application/rdap+json"));
  }

  return NextResponse.json(
    { test: "W0 production egress", startedAt, finishedAt: new Date().toISOString(), burstNote, probes: out },
    { headers: { "cache-control": "no-store, max-age=0" } },
  );
}
