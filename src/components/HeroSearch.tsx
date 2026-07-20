/**
 * HeroSearch — the landing input. Server Component; submits GET to /search,
 * which normalizes and redirects to /r/<domain>.
 *
 * Style: "Investigator" — a dark, in-theme field (transparent over the page)
 * with a cyan (label-teal) hairline that "locks on" to accent-gold on focus, a
 * leading cyan search glyph, and light ink text. The gold submit stays attached
 * as one unified control. A real <label> is kept sr-only per design-system.md §9
 * (accessible name must not be placeholder-only).
 */
export default function HeroSearch() {
  return (
    <form role="search" action="/search" method="get" className="w-full max-w-lg">
      <label htmlFor="site-url" className="sr-only">
        Website to check for red flags
      </label>
      <div className="flex items-stretch overflow-hidden rounded-md border border-label-teal/60 transition-colors focus-within:border-accent-gold">
        <div className="flex min-w-0 flex-1 items-center gap-2.5 pl-4">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            className="size-5 shrink-0 text-label-teal"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="7" />
            <line x1="21" y1="21" x2="16.5" y2="16.5" />
          </svg>
          <input
            id="site-url"
            name="url"
            type="text"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            required
            placeholder="What website are you curious about?"
            className="min-w-0 flex-1 bg-transparent py-3 pr-2 text-base text-ink outline-none placeholder:text-ink-muted"
          />
        </div>
        <button
          type="submit"
          className="shrink-0 bg-accent-gold px-5 py-3 font-semibold text-surface-body-from transition-opacity hover:opacity-90"
        >
          Check for flags
        </button>
      </div>
    </form>
  );
}
