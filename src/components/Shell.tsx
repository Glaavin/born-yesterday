import type { ReactNode } from "react";
import AdSlot from "./AdSlot";
import Masthead from "./Masthead";

/**
 * Shared page shell (Story 1.2.3): header nav band, three-column grid
 * (ad rail / max-width content / ad rail), and footer. Server Component.
 */

/** Desktop-only ad rail holding one reserved 160×600 <AdSlot> (design-system.md
 *  §5). Each rail passes a distinct slot id. */
function AdRail({ id }: { id: string }) {
  return (
    <div className="hidden items-start justify-center px-4 py-10 lg:flex">
      <AdSlot id={id} />
    </div>
  );
}

export default function Shell({ children }: { children: ReactNode }) {
  return (
    <>
      {/* One continuous gradient band: nav at top, then the landing masthead
          (wordmark) below it — the page's "title" upper section. */}
      <header className="surface-header w-full">
        <div className="mx-auto flex max-w-6xl justify-end px-4 py-4 sm:px-6">
          <nav
            aria-label="Primary"
            className="flex flex-wrap items-center justify-end gap-x-5 gap-y-1 text-sm"
          >
            <a href="#" className="text-link-coral hover:underline">
              Support Born Yesterday
            </a>
            <a href="#" className="text-link-coral hover:underline">
              Report an issue
            </a>
          </nav>
        </div>
        <Masthead />
      </header>

      <div className="grid flex-1 grid-cols-1 lg:shell-cols">
        <AdRail id="rail-left" />
        <main className="mx-auto w-full max-w-3xl px-6 py-10">{children}</main>
        <AdRail id="rail-right" />
      </div>

      <footer className="surface-header w-full">
        {/* text-ink (not ink-muted): AA on the retoned brighter header band — 5.67:1 vs 3.28:1 */}
        <div className="mx-auto max-w-6xl px-6 py-6 text-center text-sm text-ink">
          © Born Yesterday
        </div>
      </footer>
    </>
  );
}
