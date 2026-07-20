/**
 * HeroSearch — the landing input. Server Component; submits GET to /search,
 * which normalizes and redirects to /r/<domain>.
 *
 * The input and submit button are a single unified control (one bordered,
 * rounded container; the button is attached with no gap). The visible prompt
 * line is gone, but a real <label> is kept sr-only per design-system.md §9
 * (accessible name must not be placeholder-only).
 */
export default function HeroSearch() {
  return (
    <form role="search" action="/search" method="get" className="w-full max-w-lg">
      <label htmlFor="site-url" className="sr-only">
        Website to check for red flags
      </label>
      <div className="flex items-stretch overflow-hidden rounded-md border border-label-teal/40 bg-input-surface focus-within:border-accent-gold">
        <input
          id="site-url"
          name="url"
          type="text"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          required
          placeholder="What website are you curious about?"
          className="min-w-0 flex-1 bg-transparent px-4 py-3 text-base text-surface-body-from outline-none placeholder:text-surface-body-from/50"
        />
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
