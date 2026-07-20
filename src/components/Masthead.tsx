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

  return (
    <div className="mx-auto w-full max-w-xl px-6 pb-14 pt-4 sm:pb-20">
      <WordmarkMascot state="idle" />
    </div>
  );
}
