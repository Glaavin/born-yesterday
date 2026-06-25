"use client";

import type { CSSProperties } from "react";

/**
 * Mascot — the Skepticism Indicator (design-system.md §4).
 *
 * Client Component because it will host the Rive runtime later (§4.2). Rive is
 * explicitly DEFERRED here — no animation runtime is added.
 *
 * INTERIM ART: a single inline-SVG egg placeholder shared across ALL states
 * (no BY_egg.png in the workspace). Distinct per-state art — including the 4th
 * "amber" flag — is the SVG-redraw follow-up (§4.1 note). Because every state
 * renders the same fixed-size SVG, swapping `state` causes no layout shift.
 *
 * Decorative here → aria-hidden. The verdict's meaning is carried in words by
 * the report-page status pill (a later story), never by the mascot alone.
 */
export type MascotState =
  | "idle"
  | "hatching"
  | "result-green"
  | "result-amber"
  | "result-red"
  | "result-blue"
  | "limit-reached"
  | "error";

export default function Mascot({
  state = "idle",
  className,
  style,
}: {
  state?: MascotState;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <span
      data-mascot-state={state}
      aria-hidden="true"
      className={className}
      style={style}
    >
      <svg viewBox="0 0 48 60" className="block h-auto w-full">
        {/* flag poles */}
        <g className="stroke-wordmark-blue" strokeWidth={1.4} strokeLinecap="round">
          <line x1="17" y1="16" x2="17" y2="5" />
          <line x1="24" y1="14" x2="24" y2="2" />
          <line x1="31" y1="16" x2="31" y2="7" />
        </g>
        {/* flags up (idle = calm, all flags up) */}
        <path d="M17 5 L26 8 L17 11 Z" className="fill-flag-positive" />
        <path d="M24 2 L33 5 L24 8 Z" className="fill-accent-gold" />
        <path d="M31 7 L39 10 L31 13 Z" className="fill-flag-negative" />
        {/* egg body */}
        <path
          d="M24 15 C14 15 10 29 10 39 C10 50 16 57 24 57 C32 57 38 50 38 39 C38 29 34 15 24 15 Z"
          className="fill-wordmark-cream"
        />
        {/* highlight */}
        <ellipse cx="19" cy="36" rx="3.2" ry="2.1" className="fill-input-surface" />
      </svg>
    </span>
  );
}
