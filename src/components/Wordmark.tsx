/**
 * Wordmark — the page <h1> (design-system.md §8.1 / §8.2). Server Component.
 *
 * The final wordmark is hand-outlined SVG art (§8.1 planned this: "outlined in
 * SVG … designer's discretion"). The three segments live as standalone assets
 * in /public and are composed here as isolated <image> elements inside a single
 * viewBox — so their baked gradients/filters stay self-contained (no shared-ID
 * collisions) while the whole lockup still scales as one unit that fills its
 * container width. The lockup is centered in the fixed 0 0 1000 210 space.
 *
 *   BORN       → /born-text.svg       (gold, baked gradient)
 *   YESTERDAY  → /yesterday-text.svg  (cyan, baked gradient)
 *   TECH       → /tech-text.svg       (blue, baked gradient)
 *
 * The egg mascot (previously seated in the YESTERDAY→TECH gap) is removed for
 * now; the gap is closed to a normal word space.
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
        {/* Each segment is stretched +10% horizontally (preserveAspectRatio=none;
            width = natural × 1.1). Extra space between BORN and YESTERDAY. Whole
            lockup (84→917) is centered in the 1000-wide viewBox. */}
        <image
          href="/born-text.svg"
          x="84"
          y="30"
          width="197"
          height="150"
          preserveAspectRatio="none"
        />
        <image
          href="/yesterday-text.svg"
          x="309"
          y="30"
          width="442"
          height="150"
          preserveAspectRatio="none"
        />
        {/* Egg mascot removed for now → normal word space before TECH. */}
        <image
          href="/tech-text.svg"
          x="784"
          y="75"
          width="133"
          height="105"
          preserveAspectRatio="none"
        />
      </svg>
    </h1>
  );
}
