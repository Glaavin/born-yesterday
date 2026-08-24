import type { Fetcher } from "../lib/cached-fetch";
import type { CollectorResult, Signal, SignalSource, SignalStatus } from "./types";
import { stripToText, matchAiTerms, mostSpecific } from "./ai-keywords";
import { fetchCdx, parseCdx, fetchSnapshot, pickSnapshots, snapshotUrl, tsToIso, cdxUrl } from "./wayback";
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
  const cdxSource: SignalSource = { label: "Wayback CDX", url: cdxUrl(domain) };

  // --- Wayback CDX history ---
  let count = 0;
  // Did the CDX query actually COMPLETE? Zero captures is a finding; a failed or
  // timed-out query is NOT. Conflating them let a failed call publish as "0
  // archived captures" (a false stated fact), so the two are tracked separately.
  let cdxChecked = false;
  let firstTs: string | null = null;
  let lastTs: string | null = null;
  let snapshots: { ts: string; original: string }[] = [];
  try {
    const r = await fetchCdx(domain, deps.fetcher);
    if (r.ok && r.json) {
      cdxChecked = true;
      const p = parseCdx(r.json);
      count = p.count;
      firstTs = p.firstTs;
      lastTs = p.lastTs;
      snapshots = p.snapshots;
    }
  } catch {
    // non-throwing — Wayback unreachable just means no archive signals
  }

  // --- Earliest archived AI language (scan representative snapshots, ascending) ---
  let aiFirst: { dateIso: string | null; term: string; url: string } | null = null;
  // Did every sampled capture actually load? A PARTIAL scan cannot conclude
  // "no AI language" — it can only report that the scan did not complete
  // (Story 18.3 §2.6: a partial scan never produces a conclusion).
  let scanGaps = false;
  for (const s of pickSnapshots(snapshots)) {
    try {
      const r = await fetchSnapshot(s.ts, s.original, deps.fetcher);
      if (!r.ok || r.html == null) scanGaps = true;
      if (r.ok && r.html) {
        const terms = matchAiTerms(stripToText(r.html));
        if (terms.length) {
          aiFirst = {
            dateIso: tsToIso(s.ts),
            term: mostSpecific(terms)!,
            url: snapshotUrl(s.ts, s.original),
          };
          break; // ascending order ⇒ first match is the earliest sampled match
        }
      }
    } catch {
      scanGaps = true; // skip a bad snapshot, but remember the scan is incomplete
    }
  }

  // --- Live homepage current status ---
  let currentText: string | null = null; // "Mentions AI" | "Does not mention AI" | null
  let currentTerm: string | undefined;
  let liveReached = false;
  try {
    const h = await fetchHomepage(domain, deps.fetcher);
    if (h.ok && h.html != null) {
      liveReached = true;
      const terms = matchAiTerms(stripToText(h.html));
      currentText = terms.length ? "Mentions AI" : "Does not mention AI";
      currentTerm = terms.length ? mostSpecific(terms)! : undefined;
    }
  } catch {
    // blocked/robots/timeout ⇒ "not checked"
  }

  // The onset scan's outcome, distinct from its value:
  //   not_attempted — CDX never listed the captures, so nothing was scanned
  //   ok            — a match was found, OR every sampled capture was read and
  //                   none mentioned AI (a finding)
  //   failed        — the scan was incomplete, so "no AI language" is NOT a
  //                   conclusion we are entitled to draw
  const aiOnsetStatus: SignalStatus = !cdxChecked
    ? "not_attempted"
    : aiFirst || !scanGaps
      ? "ok"
      : "failed";

  const signals: Signal[] = [
    {
      key: "wayback_snapshot_count",
      label: "Wayback captures",
      // CHECKED (even at zero) ⇒ a sourced value. NOT checked ⇒ null, and callers
      // must not substitute a number for it.
      valueText: cdxChecked ? String(count) : null,
      valueNum: cdxChecked ? count : null,
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
      source: cdxChecked ? cdxSource : null,
      status: cdxChecked ? "ok" : "failed",
    },
    {
      key: "ai_language_first_seen",
      label: "AI language first seen",
      valueText: aiFirst?.dateIso ?? null,
      valueNum: null,
      // Found ⇒ cite the capture that matched. Scanned everything and found
      // nothing ⇒ a FINDING, cited to the captures we read. Otherwise no source.
      source: aiFirst
        ? { label: "Wayback snapshot", url: aiFirst.url }
        : aiOnsetStatus === "ok"
          ? cdxSource
          : null,
      status: aiOnsetStatus,
      note: aiFirst ? `matched "${aiFirst.term}"` : undefined,
    },
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

  const reachable = snapshots.length > 0 || liveReached;
  return {
    collector: "ai-pivot",
    signals,
    ok: reachable,
    error: reachable ? undefined : "neither Wayback nor the live homepage was reachable",
  };
}
