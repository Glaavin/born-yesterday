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
      className="text-accent-gold underline hover:no-underline"
    >
      {source.label}
    </a>
  );
}

/** A single finding — data point in its flag colour AND a worded cue (§4). */
function FindingItem({ kind, finding }: { kind: "flagged" | "positive"; finding: Finding }) {
  const flagged = kind === "flagged";
  return (
    <li className="flex flex-col gap-1 py-2">
      <div className="flex items-baseline gap-2">
        <span
          className={`shrink-0 rounded border px-1.5 py-0.5 text-xs font-semibold uppercase ${
            flagged
              ? "border-flag-negative/50 text-flag-negative"
              : "border-flag-positive/50 text-flag-positive"
          }`}
        >
          {flagged ? "Flagged" : "Positive"}
        </span>
        <span className={flagged ? "text-flag-negative" : "text-flag-positive"}>{finding.text}</span>
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
      <h1 className="font-heading text-2xl font-bold text-accent-gold">{title}</h1>
      <p className="max-w-md text-ink-muted">{children}</p>
      <Link href="/" className="text-sm text-accent-gold underline hover:no-underline">
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
  const ip = clientIpFrom(h.get("x-forwarded-for"));
  const deps = buildServeDeps((fn) => after(fn)); // background refresh runs after the response

  const result = await serveReport(input, { sessionKey: sessionKey(ip) }, deps);

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

  const overview = (
    <div className="flex flex-col gap-4">
      <SkepticismPill state={report.state} />
      <p className="text-ink">{report.summary}</p>
      <p className="text-sm text-ink-muted">Last checked: {report.lastChecked}</p>
      <ul className="mt-1">
        {report.flagged[0] && <FindingItem kind="flagged" finding={report.flagged[0]} />}
        {report.positive[0] && <FindingItem kind="positive" finding={report.positive[0]} />}
      </ul>
    </div>
  );

  const signals = (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="signals-flagged">
        <h2 id="signals-flagged" className="text-sm font-semibold text-ink-muted">
          Flagged findings
        </h2>
        <ul>
          {report.flagged.length === 0 && <li className="py-2 text-ink-muted">None flagged.</li>}
          {report.flagged.map((f, i) => (
            <FindingItem key={i} kind="flagged" finding={f} />
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
      <h1 className="font-heading text-3xl font-bold text-accent-gold">
        Trust Report: {report.domain}
      </h1>

      {refreshing && (
        <p className="rounded-md border border-indicator-amber/40 bg-indicator-amber/10 px-3 py-2 text-sm text-indicator-amber">
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
          className="mt-2 inline-block text-sm text-accent-gold underline hover:no-underline"
        >
          Request a correction
        </a>
      </footer>
    </article>
  );
}
