"use client";

import { useState } from "react";

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
 * Passive (empty/invalid): cyan (label-teal) border + cyan submit showing an egg
 * icon. Active (valid URL): the border and submit lock on to accent-gold and the
 * submit reads "Check for flags". Placeholder matches the cyan search glyph and
 * clears on input. A real <label> is kept sr-only per design-system.md §9.
 */
export default function HeroSearch() {
  const [value, setValue] = useState("");
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
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="What website are you curious about?"
            className="min-w-0 flex-1 bg-transparent py-3 pr-2 text-base text-ink outline-none placeholder:text-label-teal"
          />
        </div>
        <button
          type="submit"
          aria-label="Check for flags"
          className={`flex shrink-0 items-center justify-center px-5 py-3 font-semibold text-surface-body-from transition-colors hover:opacity-90 ${
            valid ? "bg-accent-gold" : "bg-label-teal"
          }`}
        >
          {valid ? (
            "Check for flags"
          ) : (
            <svg
              viewBox="0 0 24 24"
              fill="currentColor"
              className="size-5"
              aria-hidden="true"
            >
              <path d="M12 2.5c-3.6 0-6.2 5.5-6.2 10.4C5.8 17.4 8.6 21 12 21s6.2-3.6 6.2-8.1C18.2 8 15.6 2.5 12 2.5z" />
            </svg>
          )}
        </button>
      </div>
    </form>
  );
}
