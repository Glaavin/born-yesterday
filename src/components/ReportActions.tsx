"use client";

import Link from "next/link";
import { useState } from "react";

/**
 * ReportActions — the report card footer actions (design-system.md §3 / §9).
 * Client Component. "Search again" links home; "Copy" writes a plain-text
 * rendering of the report to the clipboard (functional); "Download" is an inert
 * stub — the rich-text/file format is a later story.
 */
const BTN =
  "rounded-md border border-ink-muted/30 px-4 py-2 text-sm text-ink transition-colors hover:border-accent-gold";

export default function ReportActions({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable (e.g. insecure context) — no-op.
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Link href="/" className={BTN}>
        Search again
      </Link>

      <button type="button" onClick={copy} className={BTN} aria-live="polite">
        {copied ? "Copied!" : "Copy"}
      </button>

      {/* TODO(later story): produce the rich-text/file download. Inert stub —
          renders the button but loads/produces nothing yet; disabled + labelled
          so it reads as present-but-not-wired. */}
      <button
        type="button"
        disabled
        aria-disabled="true"
        title="Coming soon — the downloadable report format is a later story."
        className={`${BTN} cursor-not-allowed opacity-50 hover:border-ink-muted/30`}
      >
        Download (soon)
      </button>
    </div>
  );
}
