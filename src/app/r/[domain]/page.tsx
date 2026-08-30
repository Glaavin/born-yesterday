import { headers } from "next/headers";
import { after } from "next/server";
import Link from "next/link";
import SkepticismPill from "@/components/SkepticismPill";
import ReportTabs from "@/components/ReportTabs";
import ReportActions from "@/components/ReportActions";
import Mascot from "@/components/Mascot";
import {
  reportToText,
  type Finding,
  type Report,
  type Source,
} from "@/components/report-state";
import { serveReport } from "@/serve/serve";
import { buildServeDeps } from "@/serve/runtime";
import { sessionKey } from "@/serve/quota";

const DISCLAIMER =
  "Born Yesterday reports are assembled from public data and fixed, published rubrics. They’re informational, not legal, financial, or professional advice — and every signal links to its source. Think we got something wrong? Request a correction.";

function SourceLink({ source }: { source: Source }) {
  return (
    <a
      href={source.url}
      target="_blank"
      rel="noopener noreferrer"
      className="text-accent-primary underline hover:no-underline"
    >
      {source.label}
    </a>
  );
}

/** A single finding — data point in its flag colour AND a worded cue (§4). */
/**
 * A finding's presentation. "unestablished" is the BLUE case: the report reached
 * no assessment, so its reason is neither a concern nor a reassurance — it states
 * what WE could not determine. It therefore uses neutral copy and neutral tokens
 * (ink-muted / ink), never the flag-negative concern treatment. Presentation only:
 * the Report shape is unchanged and the reason still lives in `flagged[]`.
 */
type FindingKind = "flagged" | "positive" | "unestablished";

const FINDING_STYLES: Record<FindingKind, { label: string; badge: string; text: string }> = {
  flagged: {
    label: "Flagged",
    badge: "border-flag-negative/50 text-flag-negative",
    text: "text-flag-negative",
  },
  positive: {
    label: "Positive",
    badge: "border-flag-positive/50 text-flag-positive",
    text: "text-flag-positive",
  },
  unestablished: {
    label: "Couldn’t establish",
    badge: "border-ink-muted/50 text-ink-muted",
    text: "text-ink",
  },
};

function FindingItem({ kind, finding }: { kind: FindingKind; finding: Finding }) {
  const style = FINDING_STYLES[kind];
  return (
    <li className="flex flex-col gap-1 py-2">
      <div className="flex items-baseline gap-2">
        <span
          className={`shrink-0 rounded border px-1.5 py-0.5 text-xs font-semibold uppercase ${style.badge}`}
        >
          {style.label}
        </span>
        <span className={style.text}>{finding.text}</span>
      </div>
      <p className="text-sm text-ink-muted">
        Source: <SourceLink source={finding.source} />
      </p>
    </li>
  );
}

/** Centered status screen for the error / limit-reached states. */
function StatusScreen({
  mascot,
  title,
  children,
}: {
  mascot: "error" | "limit-reached";
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-5 py-12 text-center">
      <div className="w-24">
        <Mascot state={mascot} />
      </div>
      <h1 className="font-heading text-2xl font-bold text-accent-primary">{title}</h1>
      <p className="max-w-md text-ink-muted">{children}</p>
      <Link href="/" className="text-sm text-accent-primary underline hover:no-underline">
        Check another site
      </Link>
    </div>
  );
}

const clientIpFrom = (forwarded: string | null): string =>
  forwarded?.split(",")[0]?.trim() || "unknown";

export default async function ReportPage({
  params,
}: {
  params: Promise<{ domain: string }>;
}) {
  const { domain: raw } = await params;
  const input = decodeURIComponent(raw);

  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  // Without a trusted client IP we cannot identify the caller. Such a request may
  // still view cached reports, but must not trigger a new collection — see
  // RequestMeta.identified (Tier 1 · 1c).
  const identified = forwarded != null && forwarded.trim().length > 0;
  const ip = clientIpFrom(forwarded);
  const deps = buildServeDeps((fn) => after(fn)); // background refresh runs after the response

  const result = await serveReport(input, { sessionKey: sessionKey(ip), identified }, deps);

  if (result.state === "error") {
    return (
      <StatusScreen mascot="error" title="That doesn’t look like a site we can check">
        Enter a domain like <span className="text-ink">stripe.com</span> — no “http://”, no path
        needed.
      </StatusScreen>
    );
  }

  if (result.state === "limit-reached" || !result.report) {
    return (
      <StatusScreen mascot="limit-reached" title="You’ve used today’s free checks">
        Born Yesterday allows a few new reports per day. Already-generated reports stay viewable — try
        again tomorrow, or open a report someone else has already hatched.
      </StatusScreen>
    );
  }

  const report: Report = result.report;
  const refreshing = result.state !== "served";
  const correctionHref = `mailto:corrections@bornyesterday.tech?subject=${encodeURIComponent(
    `Correction request: ${report.domain}`,
  )}`;

  // BLUE means "we could not establish enough to assess" — insufficiency, not
  // suspicion. Its reasons must not be presented as concerns.
  const inconclusive = report.state === "too-new";
  const reasonKind: FindingKind = inconclusive ? "unestablished" : "flagged";

  const overview = (
    <div className="flex flex-col gap-4">
      <SkepticismPill state={report.state} />
      <p className="text-ink">{report.summary}</p>
      <p className="text-sm text-ink-muted">Last checked: {report.lastChecked}</p>
      <ul className="mt-1">
        {report.flagged[0] && <FindingItem kind={reasonKind} finding={report.flagged[0]} />}
        {report.positive[0] && <FindingItem kind="positive" finding={report.positive[0]} />}
      </ul>
    </div>
  );

  const signals = (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="signals-flagged">
        <h2 id="signals-flagged" className="text-sm font-semibold text-ink-muted">
          {inconclusive ? "What we couldn’t establish" : "Flagged findings"}
        </h2>
        <ul>
          {report.flagged.length === 0 && (
            <li className="py-2 text-ink-muted">{inconclusive ? "Nothing recorded." : "None flagged."}</li>
          )}
          {report.flagged.map((f, i) => (
            <FindingItem key={i} kind={reasonKind} finding={f} />
          ))}
        </ul>
      </section>
      <section aria-labelledby="signals-positive">
        <h2 id="signals-positive" className="text-sm font-semibold text-ink-muted">
          Positive findings
        </h2>
        <ul>
          {report.positive.length === 0 && <li className="py-2 text-ink-muted">None recorded.</li>}
          {report.positive.map((f, i) => (
            <FindingItem key={i} kind="positive" finding={f} />
          ))}
        </ul>
      </section>
    </div>
  );

  const sources = (
    <ul className="flex flex-col gap-2 text-ink">
      {report.sources.map((s, i) => (
        <li key={i} className="list-disc list-inside">
          <SourceLink source={s} />
        </li>
      ))}
    </ul>
  );

  return (
    <article className="flex flex-col gap-6 py-4">
      <h1 className="font-heading text-3xl font-bold text-accent-primary">
        Trust Report: {report.domain}
      </h1>

      {refreshing && (
        <p className="rounded-md border border-indicator-concerns/40 bg-indicator-concerns/10 px-3 py-2 text-sm text-indicator-concerns">
          Showing the last cached report — a fresh check is running in the background.
        </p>
      )}

      <ReportTabs
        tabs={[
          { id: "overview", label: "Overview", panel: overview },
          { id: "signals", label: "Signals", panel: signals },
          { id: "sources", label: "Sources", panel: sources },
        ]}
      />

      <ReportActions text={reportToText(report)} />

      <footer className="mt-2 border-t border-ink-muted/20 pt-4">
        <p className="text-sm text-ink-muted">{DISCLAIMER}</p>
        <a
          href={correctionHref}
          className="mt-2 inline-block text-sm text-accent-primary underline hover:no-underline"
        >
          Request a correction
        </a>
      </footer>
    </article>
  );
}
