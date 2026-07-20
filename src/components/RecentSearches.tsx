import Link from "next/link";
import { REPORT_STATES, type ReportStateKey } from "./report-state";

/**
 * Recent-searches feed (mvp-spec §7b) — ANONYMIZED: domain + worded verdict +
 * nothing else. The verdict is shown in WORDS (never colour-alone). Server
 * Component; data comes from src/serve/recent.ts.
 */
export default function RecentSearches({
  items,
}: {
  items: Array<{ domain: string; state: ReportStateKey; generatedAt: number }>;
}) {
  if (!items.length) return null;
  return (
    <section className="w-full max-w-2xl" aria-labelledby="recent-heading">
      <h2 id="recent-heading" className="mb-2 text-center text-base text-label-teal">
        Recently checked
      </h2>
      <ul className="flex flex-col gap-1.5">
        {items.map((r) => (
          <li
            key={`${r.domain}:${r.generatedAt}`}
            className="flex items-center justify-between gap-3 rounded-md border border-ink-muted/20 px-3 py-2 text-base"
          >
            <Link href={`/r/${encodeURIComponent(r.domain)}`} className="truncate text-ink hover:text-accent-gold">
              {r.domain}
            </Link>
            <span
              className={`shrink-0 rounded border px-1.5 py-0.5 text-sm font-medium ${REPORT_STATES[r.state].pill}`}
            >
              {REPORT_STATES[r.state].label}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
