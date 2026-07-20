"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Wordmark from "./Wordmark";

/** Primary nav links. */
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
 * Masthead — the persistent top-section gradient band (nav strip + wordmark).
 * Rendered consistently on every route (before and after report delivery) as a
 * compound branding element, not the document's semantic header/heading.
 *
 * The wordmark's wrapper is the only per-route difference: on the landing it's
 * the page <h1>; on inner pages (e.g. /r/[domain], which has its own <h1>) it's
 * a home link, so branding stays visible without duplicating the <h1>.
 */
export default function Masthead() {
  const isHome = usePathname() === "/";
  const lockup = "mx-auto block w-full max-w-xl lg:max-w-wordmark";

  return (
    <header className="surface-header flex h-60 w-full flex-col pt-2">
      <Nav />
      <div className="mt-auto w-full px-6 pb-4">
        {isHome ? (
          <h1 className={lockup}>
            <Wordmark />
          </h1>
        ) : (
          <Link href="/" aria-label="Born Yesterday — home" className={lockup}>
            <Wordmark />
          </Link>
        )}
      </div>
    </header>
  );
}
