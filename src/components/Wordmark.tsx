/**
 * Wordmark — the page <h1> (design-system.md §8.1 / §8.2). Server Component.
 *
 * Inline SVG with three token-colored segments:
 *   BORN       → --color-wordmark-cream
 *   YESTERDAY  → --color-wordmark-cyan gradient (from/to token stops)
 *   .TECH      → --color-wordmark-blue   (the "." is the mascot egg, overlaid)
 *
 * The accessible name "BornYesterday.tech" is exposed via role="img" + <title>
 * + aria-label. This is the ONLY <h1> on the page.
 *
 * INTERIM TYPEFACE: §8.1 specifies the final wordmark is hand-outlined SVG in a
 * heavy rounded sans (a later design pass). Until then this renders live SVG text
 * in a heavy system fallback — no new web font is loaded. `textLength` pins each
 * segment's width so the egg's gap lands deterministically regardless of font.
 */
const HEAVY_FALLBACK =
  '"Arial Black", "Helvetica Neue", Helvetica, Arial, sans-serif';

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
        <defs>
          <linearGradient id="by-wordmark-cyan" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" style={{ stopColor: "var(--color-wordmark-cyan-from)" }} />
            <stop offset="1" style={{ stopColor: "var(--color-wordmark-cyan-to)" }} />
          </linearGradient>
        </defs>

        {/* BORN + YESTERDAY — width pinned so the egg gap is deterministic */}
        <text
          x="15"
          y="162"
          textLength="600"
          lengthAdjust="spacingAndGlyphs"
          fontSize="175"
          fontWeight={900}
          style={{ fontFamily: HEAVY_FALLBACK }}
        >
          <tspan className="fill-wordmark-cream">BORN</tspan>
          <tspan fill="url(#by-wordmark-cyan)">YESTERDAY</tspan>
        </text>

        {/* TECH (the leading "." is the overlaid mascot egg) */}
        <text
          x="715"
          y="162"
          textLength="270"
          lengthAdjust="spacingAndGlyphs"
          fontSize="175"
          fontWeight={900}
          className="fill-wordmark-blue"
          style={{ fontFamily: HEAVY_FALLBACK }}
        >
          TECH
        </text>
      </svg>
    </h1>
  );
}
