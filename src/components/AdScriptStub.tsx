"use client";

import { useEffect, useRef } from "react";

/**
 * AdScriptStub — the gated injection point for the eventual ad-network script
 * (design-system.md §5). Client Component, but INERT in this story: no real
 * network, no script src, no third-party call.
 *
 * It scaffolds the intended lazy-load behaviour (load on viewport intersection,
 * §5) but the injection itself is stubbed out — nothing is ever loaded. It
 * renders nothing visible and only fills the already-reserved box.
 *
 * NEVER-list safe: the element is absolutely positioned WITHIN its reserved
 * AdSlot box (inset-0) — it does not escape, overlay the page, or go sticky.
 */
export default function AdScriptStub({
  id,
  size,
}: {
  id: string;
  size: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;

    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          // TODO(prod): inject the ad-network script for `id` / `size` here.
          // Intentionally INERT in this story — no script is loaded, no network
          // request is made. Disconnect so this fires at most once.
          io.disconnect();
        }
      }
    });

    io.observe(el);
    return () => io.disconnect();
  }, [id, size]);

  return <div ref={ref} aria-hidden="true" className="absolute inset-0" />;
}
