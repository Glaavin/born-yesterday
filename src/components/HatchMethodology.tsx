"use client";

import { useState } from "react";
import MethodologyCard from "./MethodologyCard";

/**
 * HatchMethodology — the "Something's hatching!" counter line with an inline
 * disclosure at the end ("View Our Report Methodology") that expands the
 * MethodologyCard for reading. Collapsed by default; the methodology detail
 * sits directly below the counter. Client Component (owns the open/closed
 * state); the real count is computed server-side and passed in as a prop.
 */
export default function HatchMethodology({ count }: { count: number }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex w-full flex-col items-center gap-8">
      <p className="text-center text-base text-ink">
        Something&rsquo;s hatching!{" "}
        <span className="font-semibold text-accent-gold">
          {count.toLocaleString()}
        </span>{" "}
        reports hatched so far.{" "}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls="methodology-panel"
          className="font-semibold text-accent-gold underline hover:no-underline"
        >
          View Our Report Methodology
        </button>
      </p>
      {/* Rendered always (toggled via `hidden`) so the button's aria-controls
          target exists even while collapsed; `hidden` keeps it out of layout,
          tab order, and the a11y tree until expanded. */}
      <MethodologyCard id="methodology-panel" hidden={!open} />
    </div>
  );
}
