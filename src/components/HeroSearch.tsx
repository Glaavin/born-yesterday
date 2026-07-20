"use client";

import { useRef, useState } from "react";

/** Client-side "does this look like a domain/URL" check — drives the passive vs
 *  active visual state only; /search does the real normalization on submit. */
function looksLikeUrl(value: string): boolean {
  const s = value.trim();
  if (!s) return false;
  try {
    const { hostname } = new URL(s.includes("://") ? s : `https://${s}`);
    const parts = hostname.split(".");
    return (
      parts.length >= 2 &&
      parts.every((p) => p.length > 0) &&
      parts[parts.length - 1].length >= 2
    );
  } catch {
    return false;
  }
}

/**
 * HeroSearch — the landing input ("Investigator" style). Client Component for the
 * passive→active state; submits GET to /search, which normalizes and redirects.
 *
 * Passive (empty/invalid): cyan (label-teal) border + cyan submit showing ghosted
 * egg + flag icons. Active (valid URL): the border and submit lock on to
 * accent-gold and the submit reads "Check for flags". The submit keeps a fixed
 * width across states. A clear (×) button resets the input. Placeholder matches
 * the cyan search glyph and clears on input; a real <label> is kept sr-only (§9).
 */
export default function HeroSearch() {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const valid = looksLikeUrl(value);

  return (
    <form role="search" action="/search" method="get" className="w-full max-w-2xl">
      <label htmlFor="site-url" className="sr-only">
        Website to check for red flags
      </label>
      <div
        className={`flex items-stretch overflow-hidden rounded-md border transition-colors focus-within:ring-2 focus-within:ring-inset focus-within:ring-label-teal ${
          valid ? "border-accent-gold" : "border-label-teal/60"
        }`}
      >
        <div className="flex min-w-0 flex-1 items-center gap-2.5 px-4">
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
            ref={inputRef}
            id="site-url"
            name="url"
            type="text"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            required
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="What website are you curious about?"
            className="min-w-0 flex-1 bg-transparent py-3 text-base text-ink outline-none placeholder:text-label-teal"
          />
          {value && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => {
                setValue("");
                inputRef.current?.focus();
              }}
              className="shrink-0 text-ink-muted transition-colors hover:text-ink"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                className="size-5"
                aria-hidden="true"
              >
                <line x1="6" y1="6" x2="18" y2="18" />
                <line x1="18" y1="6" x2="6" y2="18" />
              </svg>
            </button>
          )}
        </div>
        <button
          type="submit"
          aria-label="Check for flags"
          className={`flex w-40 shrink-0 items-center justify-center gap-1.5 py-3 font-semibold text-surface-body-from transition-colors hover:opacity-90 ${
            valid ? "bg-accent-gold" : "bg-label-teal"
          }`}
        >
          {valid ? (
            "Check for flags"
          ) : (
            <span className="flex items-center gap-1.5 opacity-40" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="currentColor" className="size-6">
                <path d="M12 2.5c-3.6 0-6.2 5.5-6.2 10.4C5.8 17.4 8.6 21 12 21s6.2-3.6 6.2-8.1C18.2 8 15.6 2.5 12 2.5z" />
              </svg>
              <svg viewBox="0 0 24 24" fill="currentColor" className="size-6">
                <rect x="5" y="3" width="2" height="18" rx="1" />
                <path d="M8 4h10l-2.5 3.5L18 11H8z" />
              </svg>
            </span>
          )}
        </button>
      </div>
    </form>
  );
}
