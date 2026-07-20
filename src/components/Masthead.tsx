"use client";

import { usePathname } from "next/navigation";
import Wordmark from "./Wordmark";

/** Primary nav links. Shared by both masthead variants. */
function Nav() {
  return (
    <nav
      aria-label="Primary"
      className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-end gap-x-5 gap-y-1 px-4 text-sm font-semibold sm:px-6"
    >
      <a href="#" className="text-link-coral hover:underline">
        Support Born Yesterday
      </a>
      <a href="#" className="text-link-coral hover:underline">
        Report an issue
      </a>
    </nav>
  );
}

/**
 * Masthead — the top-section gradient band (nav strip + wordmark).
 *
 * Landing ("/"): a fixed 240px band (desktop AND mobile) with the nav at top
 * and the wordmark pinned so its baseline sits 40px (pb-10) above the band's
 * bottom edge. Other routes (e.g. /r/[domain], which has its own <h1>): the band
 * collapses to just the nav strip, so there's no duplicate wordmark <h1>.
 *
 * The egg mascot is temporarily removed from the lockup (owner request); the
 * Mascot component + 8-state contract stay intact and still drive the report
 * page's verdict pill.
 */
export default function Masthead() {
  const pathname = usePathname();

  if (pathname !== "/") {
    return (
      <header className="surface-header w-full py-4">
        <Nav />
      </header>
    );
  }

  return (
    <header className="surface-header flex h-60 w-full flex-col pt-4">
      <Nav />
      <div className="mt-auto w-full px-6 pb-4">
        <Wordmark className="mx-auto w-full max-w-xl lg:max-w-wordmark" />
      </div>
    </header>
  );
}
