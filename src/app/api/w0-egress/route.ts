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
 *
 * PATH NOTE: this lived at `api/_w0` and was silently unroutable. In the App
 * Router an underscore-prefixed folder is a PRIVATE folder — opted out of
 * routing, along with everything under it — so the route returned the 404 it
 * returns when the env gate is closed, and the two are indistinguishable from
 * outside. Do not rename it back.
 */

export const dynamic = "force-dynamic";
export const revalidate = 0;
/**
 * One STEP per invocation, selected by `?step=`. The whole battery in a single
 * request is ~28 calls and well over a minute of wall-clock; the function
 * completed (the platform logged a 200) but the response never reached the
 * client. Splitting it also makes each step independently reportable and is
 * politer — nothing about the measurement needs one long-lived request.
 *
 * The BURST is the exception that must stay in one invocation: it tests a
 * rate limiter, which keys on the calling IP over time, so its calls have to
 * share one egress rather than being spread across instances.
 */
export const maxDuration = 60;

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

export async function GET(req: Request) {
  if (process.env.BY_W0_TEST !== "1") {
    return new NextResponse("Not found", { status: 404 });
  }

  const step = new URL(req.url).searchParams.get("step") ?? "";
  const out: Probe[] = [];
  const startedAt = new Date().toISOString();
  let note = "";

  switch (step) {
    // ---- 1 & 2: Wayback singles ----
    case "singles":
      out.push(await probe("1-cdx-single", 1, CDX("stripe.com")));
      await sleep(SPACING_MS);
      out.push(await probe("2-availability", 1, AVAIL("stripe.com")));
      note = out.every((p) => p.status === 429)
        ? "BOTH SINGLES REFUSED (429) — do not run step=burst"
        : "singles did not both 429 — burst is in scope";
      break;

    // ---- 3: the bisect burst ----
    // The caller must have run `singles` first and honoured its note. Fourteen
    // calls at a host that just refused twice is impolite and answers nothing —
    // a refusal is an answer, not an obstacle.
    case "burst": {
      // CHUNKED, because production CDX latency turns out to be ~13.6s per call
      // and 14 of those is ~3.5 minutes — past any function limit. `from`/`count`
      // let the sequence be walked across invocations.
      //
      // CAVEAT ON THE MEASUREMENT, stated because it bounds what the result can
      // mean: a rate limiter keys on the calling IP, and consecutive invocations
      // are not guaranteed to share an egress IP. Same region and seconds apart
      // makes it very likely, not certain. A trip observed here is real; a clean
      // run is weaker evidence than an uninterrupted burst would have been.
      //
      // The artificial 1.2s spacing is dropped inside the burst: the call's own
      // ~13.6s is already far longer, so adding to it would model a politer
      // client than the bisect finder actually is.
      const url = new URL(req.url);
      const from = Math.max(1, Number(url.searchParams.get("from") ?? 1));
      const count = Math.min(4, Math.max(1, Number(url.searchParams.get("count") ?? 3)));
      for (let i = from; i < from + count && i <= 14; i++) {
        const p = await probe("3-bisect-burst", i, CDX("wikipedia.org", 5));
        out.push(p);
        // WHERE it trips is the number that sizes W1's politeness budget.
        if (p.status !== 200) {
          note = `first non-200 at call ${i} (status ${p.status})`;
          break;
        }
      }
      if (!note) note = `calls ${from}-${from + out.length - 1} clean`;
      break;
    }

    // ---- 4: Common Crawl ----
    case "cc":
      out.push(await probe("4a-cc-latest", 1, CC(CC_INDEXES[0], "stripe.com")));
      await sleep(SPACING_MS);
      out.push(await probe("4a-cc-latest", 2, CC(CC_INDEXES[0], "masshist.org")));
      for (let i = 0; i < CC_INDEXES.length; i++) {
        await sleep(SPACING_MS);
        out.push(await probe("4b-cc-monthly", i + 1, CC(CC_INDEXES[i], "masshist.org")));
      }
      break;

    // ---- 5: registry path — direct vs middleman ----
    // Both .com deliberately: the bootstrap maps .com/.net to Verisign and .org
    // to Public Interest Registry, so a mixed pair would compare two registries
    // rather than direct-vs-middleman. Holding the registry constant is what
    // makes the audit machine's 4x finding testable.
    case "rdap":
      out.push(await probe("5a-iana-bootstrap", 1, "https://data.iana.org/rdap/dns.json"));
      for (const d of ["stripe.com", "github.com"]) {
        await sleep(SPACING_MS);
        out.push(await probe("5b-rdap-direct", 1, `https://rdap.verisign.com/com/v1/domain/${d}`, "application/rdap+json"));
        await sleep(SPACING_MS);
        out.push(await probe("5c-rdap-org", 1, `https://rdap.org/domain/${d}`, "application/rdap+json"));
      }
      break;

    default:
      return NextResponse.json(
        { test: "W0 production egress", steps: ["singles", "burst", "cc", "rdap"], usage: "?step=singles" },
        { headers: { "cache-control": "no-store, max-age=0" } },
      );
  }

  return NextResponse.json(
    { test: "W0 production egress", step, startedAt, finishedAt: new Date().toISOString(), note, probes: out },
    { headers: { "cache-control": "no-store, max-age=0" } },
  );
}
