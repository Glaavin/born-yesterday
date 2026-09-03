import type { Fetcher } from "../lib/cached-fetch";
import type { CollectorResult, Signal, SignalSource } from "./types";
import { stripToText, matchAiTerms, mostSpecific } from "./ai-keywords";
import { fetchCdx, parseCdx, tsToIso, cdxFirstUrl, THIN_PROBE_LIMIT } from "./wayback";
import { fetchHomepage, homepageUrl } from "./homepage";

/**
 * The "AI pivot" signal (mvp-spec §2B) — when AI language first appeared in the
 * site's archive vs. whether it's there now. Wayback (fixed host, harness) +
 * a LIVE homepage scan (kind:"live-site"). REGEX ONLY — no LLM. Every matched
 * signal cites its snapshot/page URL + matched phrase. Non-throwing; partial OK.
 *
 * NOTE: the headline "AI Language Age vs Domain Age" derivation is a CROSS-SIGNAL
 * calculation (needs Story 10's registration date) and is STORY 16's job — this
 * collector only produces the AI-language dates + status. No report wiring, no UI.
 */

export interface AiPivotDeps {
  fetcher: Fetcher;
}

export async function collectAiPivot(
  domain: string,
  deps: AiPivotDeps,
): Promise<CollectorResult> {
  const cdxSource: SignalSource = { label: "Wayback CDX", url: cdxFirstUrl(domain) };

  // --- Wayback CDX: TWO BOUNDED QUERIES, never the full list (B12 / W0) ---
  //
  // W0 measured the full-list fetch at 4–14 seconds from production against an
  // 8-second collection deadline. archive.org was never refusing us — we were
  // blowing our own budget, and the check had been failing since 27 August.
  //
  // `limit=5` ascending answers TWO questions in one call: the first capture,
  // and whether the count is below THIN_SNAPSHOT_COUNT. Fewer than five rows is
  // the exact count; exactly five means "at least five", which is all the
  // thinness rule ever needed.
  let cdxChecked = false;
  let firstTs: string | null = null;
  let lastTs: string | null = null;
  let rowCount: number | null = null;
  try {
    const rFirst = await fetchCdx(domain, deps.fetcher, "first");
    if (rFirst.ok && rFirst.json) {
      const p = parseCdx(rFirst.json);
      // Status from the PARSE, not the fetch: a 200 with a malformed body is a
      // failed observation, not "zero captures" (docs/conventions.md).
      if (p) {
        cdxChecked = true;
        firstTs = p.firstTs;
        rowCount = p.count;
      }
    }
    if (cdxChecked) {
      const rLast = await fetchCdx(domain, deps.fetcher, "last");
      if (rLast.ok && rLast.json) {
        const pl = parseCdx(rLast.json);
        if (pl) lastTs = pl.lastTs;
      }
    }
  } catch {
    // non-throwing — Wayback unreachable just means no archive signals
  }

  // EXACT only. `rowCount === THIN_PROBE_LIMIT` means "at least five", not five.
  const exactCount = rowCount != null && rowCount < THIN_PROBE_LIMIT ? rowCount : null;
  const thinArchive = rowCount != null ? rowCount < THIN_PROBE_LIMIT : null;

  // --- The AI-language onset scan ---
  //
  // A GUARD, NOT A COMMENT. This is the fifth place the same defect has been
  // found: `status: "ok"` with a null value asserts "we looked and there was
  // nothing", and that assertion is only true if a scan actually ran. The union
  // below makes the false version UNCONSTRUCTABLE — "ok" is reachable only from
  // `found` or `scanned`, and `scanned` cannot be built without a sample count.
  //
  // On the hot path only `not-scanned` is producible: sampling captures needs
  // the full list we deliberately no longer fetch, and W0 showed the second
  // consecutive CDX call hanging for 30s, so a per-capture fan-out is exactly
  // the burst that fails. The observation is absent from fresh reports until
  // W1's bounded sampler. It is neutral content since the §2.7 demotion.
  type Onset =
    | { kind: "found"; dateIso: string | null; term: string; url: string }
    | { kind: "scanned"; sampled: number }
    | { kind: "not-scanned"; why: string };
  const onset: Onset = { kind: "not-scanned", why: "deferred to async enrichment (W1); no capture list on the hot path" };

  // --- Live homepage current status ---
  let currentText: string | null = null; // "Mentions AI" | "Does not mention AI" | null
  let currentTerm: string | undefined;
  let liveReached = false;
  try {
    const h = await fetchHomepage(domain, deps.fetcher);
    if (h.ok && h.html != null) {
      const terms = matchAiTerms(stripToText(h.html));
      // A scan that could not run is not "does not mention AI".
      if (terms) {
        liveReached = true;
        currentText = terms.length ? "Mentions AI" : "Does not mention AI";
        currentTerm = terms.length ? mostSpecific(terms)! : undefined;
      }
    }
  } catch {
    // blocked/robots/timeout ⇒ "not checked"
  }

  /**
   * THE GUARD. `status: "ok"` on this signal asserts a scan happened and
   * concluded; with a null value it asserts "we looked and there was nothing".
   * Mapping through the union means that assertion cannot be made without a
   * shape that proves the scan ran — `ok` is reachable only from `found` or
   * `scanned`, and `scanned` carries the sample count that justifies it.
   */
  const onsetSignal = (o: Onset): Signal => {
    switch (o.kind) {
      case "found":
        return {
          key: "ai_language_first_seen",
          label: "AI language first seen",
          valueText: o.dateIso,
          valueNum: null,
          source: { label: "Wayback snapshot", url: o.url },
          status: "ok",
          note: `matched "${o.term}"`,
        };
      case "scanned":
        return {
          key: "ai_language_first_seen",
          label: "AI language first seen",
          valueText: null,
          valueNum: null,
          // A completed scan that found nothing IS a finding, cited to the
          // captures we read (§1.1) — which is why it needs a sample count.
          source: cdxSource,
          status: "ok",
          note: `no AI term in ${o.sampled} sampled captures`,
        };
      case "not-scanned":
        return {
          key: "ai_language_first_seen",
          label: "AI language first seen",
          valueText: null,
          valueNum: null,
          source: null,
          status: "not_attempted",
          note: o.why,
        };
    }
  };

  const signals: Signal[] = [
    {
      // EXACT COUNTS ONLY, and the reason is the append-only record.
      // `signal_history` never rewrites, so a floored value — literal 5s for a
      // domain with 4,000 captures — becomes a fake count indistinguishable
      // from a real one, permanently. There is no "at least 5" copy either:
      // the thinness ANSWER lives in the boolean below, and this signal stays a
      // number or stays silent.
      key: "wayback_snapshot_count",
      label: "Wayback captures",
      valueText: exactCount != null ? String(exactCount) : null,
      valueNum: exactCount,
      source: exactCount != null ? cdxSource : null,
      status: exactCount != null ? "ok" : cdxChecked ? "not_attempted" : "failed",
      note:
        exactCount == null && cdxChecked
          ? "exact count deferred to async enrichment (W1); the thinness answer is wayback_thin_archive"
          : undefined,
    },
    {
      // The thinness ANSWER, carried as a boolean rather than inferred from a
      // number we may not have. This is what the rule reads.
      key: "wayback_thin_archive",
      label: "Thin archive",
      valueText: thinArchive == null ? null : thinArchive ? "Thin" : "Not thin",
      valueNum: null,
      source: cdxChecked ? cdxSource : null,
      status: cdxChecked ? "ok" : "failed",
    },
    {
      key: "wayback_first",
      label: "First archived",
      valueText: tsToIso(firstTs),
      valueNum: null,
      source: cdxChecked ? cdxSource : null,
      status: cdxChecked ? "ok" : "failed",
    },
    {
      key: "wayback_last",
      label: "Last archived",
      valueText: tsToIso(lastTs),
      valueNum: null,
      // The last-capture call is separate and can fail on its own — W0 saw the
      // SECOND consecutive CDX call hang for 30s. Its status is its own.
      source: lastTs != null ? cdxSource : null,
      status: lastTs != null ? "ok" : "failed",
    },
    onsetSignal(onset),
    {
      key: "ai_language_current",
      label: "AI language now",
      valueText: currentText,
      valueNum: null,
      source: liveReached ? { label: "Live homepage", url: homepageUrl(domain) } : null,
      status: liveReached ? "ok" : "failed",
      note: currentText == null ? "not checked" : currentTerm ? `matched "${currentTerm}"` : undefined,
    },
  ];

  const reachable = cdxChecked || liveReached;
  return {
    collector: "ai-pivot",
    signals,
    ok: reachable,
    error: reachable ? undefined : "neither Wayback nor the live homepage was reachable",
  };
}
