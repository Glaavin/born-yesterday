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
      {/* Top-section gradient band (nav + wordmark on the landing; nav-only
          elsewhere). Owns its own <header>. */}
      <Masthead />

      <div className="grid flex-1 grid-cols-1 lg:shell-cols">
        <AdRail id="rail-left" />
        <main className="mx-auto w-full max-w-3xl px-6 py-10">{children}</main>
        <AdRail id="rail-right" />
      </div>

      {/* Transparent: the body gradient runs straight through so the page bg
          stays continuous to the bottom. text-ink stays AA over the gradient's
          dark bottom stop (#1a3942 → 10.73:1). */}
      <footer className="w-full">
        <div className="mx-auto max-w-6xl px-6 py-6 text-center text-sm text-ink">
          © Born Yesterday
        </div>
      </footer>
    </>
  );
}
