"use client";

import { usePathname } from "next/navigation";
import WordmarkMascot from "./WordmarkMascot";

/**
 * Masthead — the wordmark lockup that lives inside the header's gradient band,
 * turning the top of the page into a tall "title" section above the dark body
 * (design-system.md §4.2 mockup: the title sits in the blue gradient space).
 *
 * Landing-only: rendered inside <Shell>'s shared header, but the wordmark <h1>
 * belongs to the home page. On other routes (e.g. /r/[domain], which has its
 * own <h1>) this renders nothing, leaving just the nav band — so no duplicate
 * <h1> and no second mascot.
 */
export default function Masthead() {
  const pathname = usePathname();
  if (pathname !== "/") return null;

  // Desktop: fixed 240px-tall band (lg:h-60) with the wordmark centered.
  // Mobile: height follows content with vertical padding.
  return (
    <div className="mx-auto flex w-full max-w-2xl items-center justify-center px-6 py-12 lg:h-60 lg:py-0">
      <WordmarkMascot state="idle" />
    </div>
  );
}
