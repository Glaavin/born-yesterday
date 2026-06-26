/**
 * HeroSearch — the landing input (design-system.md §9: a real <label>, not
 * placeholder-only). Server Component; UI only — search submission is wired in
 * a later story. Input microcopy is playful chrome (§2), findings stay factual.
 */
export default function HeroSearch() {
  return (
    <div role="search" className="w-full max-w-lg">
      <label
        htmlFor="site-url"
        className="mb-2 block text-center text-sm text-label-teal"
      >
        Paste a URL &mdash; we&rsquo;ll go digging through the shell.
      </label>
      <input
        id="site-url"
        name="url"
        type="text"
        inputMode="url"
        autoComplete="off"
        spellCheck={false}
        className="w-full rounded-md border border-label-teal/40 bg-input-surface px-4 py-3 text-base text-surface-body-from outline-none focus:border-accent-gold"
      />
    </div>
  );
}
