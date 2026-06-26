/**
 * MethodologyCard — the factual "how it works" panel (design-system.md §2).
 * Deterministic + sourced; NO reference to AI, no "vibe check". Server Component.
 * The card border uses --accent-gold (§8.2 "card border").
 */
export default function MethodologyCard() {
  return (
    <section
      aria-label="How Born Yesterday works"
      className="w-full max-w-2xl rounded-lg border border-accent-gold/40 p-6"
    >
      <p className="text-label-teal">
        Born Yesterday checks are built entirely from public data and fixed,
        published rubrics &mdash; no black box, no guesswork. Every signal we
        raise links back to the source it came from.
      </p>
      <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-label-teal sm:columns-2">
        <li>What a report covers</li>
        <li>Sources of data</li>
        <li>
          <a href="#" className="text-accent-gold underline hover:no-underline">
            The scoring rubric
          </a>
        </li>
        <li>How to read a result</li>
      </ul>
    </section>
  );
}
