import type { ReactNode } from "react";

/**
 * Shared page shell (Story 1.2.3): header nav band, three-column grid
 * (ad rail / max-width content / ad rail), and footer. Server Component.
 * No wordmark, mascot, ads, or page content — rails are reserved placeholders
 * (the real <AdSlot> arrives in 1.2.4).
 */

/** Reserved 160×600 IAB skyscraper slot (design-system.md §5). The fixed size
 *  is held with standard Tailwind scale utilities (w-40 = 160px, h-150 = 600px)
 *  so ad load causes no layout shift. Empty/decorative until 1.2.4. */
function AdRail() {
  return (
    <div className="hidden items-start justify-center px-4 py-10 lg:flex">
      <div
        aria-hidden="true"
        className="h-150 w-40 rounded-md border border-dashed border-label-teal/25"
      />
    </div>
  );
}

export default function Shell({ children }: { children: ReactNode }) {
  return (
    <>
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
      </header>

      <div className="grid flex-1 grid-cols-1 lg:shell-cols">
        <AdRail />
        <main className="mx-auto w-full max-w-3xl px-6 py-10">{children}</main>
        <AdRail />
      </div>

      <footer className="surface-header w-full">
        <div className="mx-auto max-w-6xl px-6 py-6 text-center text-sm text-label-teal">
          © Born Yesterday
        </div>
      </footer>
    </>
  );
}
