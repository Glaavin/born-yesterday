/**
 * Wordmark — the page <h1> (design-system.md §8.1 / §8.2). Server Component.
 *
 * The final wordmark is hand-outlined SVG art (§8.1 planned this: "outlined in
 * SVG … designer's discretion"). The three segments live as standalone assets
 * in /public and are composed here as isolated <image> elements inside a single
 * viewBox — so their baked gradients/filters stay self-contained (no shared-ID
 * collisions) while the whole lockup still scales as one unit that fills its
 * container width. That fixed 0 0 1000 210 coordinate space is what keeps the
 * WordmarkMascot egg seated in the "." gap between YESTERDAY and TECH.
 *
 *   BORN       → /born-text.svg       (gold, baked gradient)
 *   YESTERDAY  → /yesterday-text.svg  (cyan, baked gradient)
 *   .TECH      → /tech-text.svg       (blue, baked gradient; "." is the egg)
 *
 * The accessible name "BornYesterday.tech" is exposed via role="img" + <title>
 * + aria-label. This is the ONLY <h1> on the page.
 */
export default function Wordmark({ className }: { className?: string }) {
  return (
    <h1 className={className}>
      <svg
        viewBox="0 0 1000 210"
        role="img"
        aria-label="BornYesterday.tech"
        className="block h-auto w-full"
      >
        <title>BornYesterday.tech</title>
        {/* BORN + YESTERDAY share a cap-height; set tight so they read joined. */}
        <image href="/born-text.svg" x="15" y="30" width="179" height="150" />
        <image
          href="/yesterday-text.svg"
          x="190"
          y="30"
          width="402"
          height="150"
        />
        {/* Gap 592→720 is left for the egg (the "."). TECH ~0.7x, baseline-aligned. */}
        <image href="/tech-text.svg" x="720" y="75" width="121" height="105" />
      </svg>
    </h1>
  );
}
