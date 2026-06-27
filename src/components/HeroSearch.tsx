/**
 * HeroSearch — the landing input (design-system.md §9: a real <label>, not
 * placeholder-only). Server Component; submits GET to /search, which normalizes
 * and redirects to /r/<domain>. Input microcopy is playful chrome (§2).
 */
export default function HeroSearch() {
  return (
    <form role="search" action="/search" method="get" className="w-full max-w-lg">
      <label
        htmlFor="site-url"
        className="mb-2 block text-center text-sm text-label-teal"
      >
        Paste a URL &mdash; we&rsquo;ll go digging through the shell.
      </label>
      <div className="flex gap-2">
        <input
          id="site-url"
          name="url"
          type="text"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          required
          className="min-w-0 flex-1 rounded-md border border-label-teal/40 bg-input-surface px-4 py-3 text-base text-surface-body-from outline-none focus:border-accent-gold"
        />
        <button
          type="submit"
          className="shrink-0 rounded-md bg-accent-gold px-5 py-3 font-semibold text-surface-body-from transition-opacity hover:opacity-90"
        >
          Check
        </button>
      </div>
    </form>
  );
}
