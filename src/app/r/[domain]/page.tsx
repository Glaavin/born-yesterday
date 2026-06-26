import SkepticismPill from "@/components/SkepticismPill";
import ReportTabs from "@/components/ReportTabs";
import ReportActions from "@/components/ReportActions";
import {
  reportToText,
  type Finding,
  type Report,
  type Source,
} from "@/components/report-state";

// mock — Sprint 1.1 supplies the real report (no data layer / signal logic here).
// Default state is "some-concerns" so the view exercises BOTH flagged and
// positive highlights. Swap the `state` literal to preview the other states:
// "checks-out" | "some-concerns" | "red-flags" | "too-new".
function mockReport(domain: string): Report {
  return {
    domain,
    state: "some-concerns",
    summary:
      "Public signals are mixed: the domain is established and its certificate is clean, but its registrant was freshly masked and its marketing footprint is thin for the age it claims.",
    lastChecked: "2026-06-26", // mock
    flagged: [
      {
        text: "Registrant details were hidden behind a privacy proxy three weeks ago.",
        source: { label: "WHOIS history", url: "https://example.com/whois" },
      },
      {
        text: "No archived homepage before this year, despite an “since 2019” claim.",
        source: { label: "Wayback Machine", url: "https://web.archive.org/" },
      },
    ],
    positive: [
      {
        text: "Valid TLS certificate from a reputable authority, issued 14 months ago.",
        source: {
          label: "Certificate Transparency log",
          url: "https://crt.sh/",
        },
      },
      {
        text: "SPF and DMARC records are present and correctly configured.",
        source: { label: "DNS records", url: "https://example.com/dns" },
      },
    ],
    sources: [
      { label: "WHOIS history", url: "https://example.com/whois" },
      { label: "Wayback Machine", url: "https://web.archive.org/" },
      { label: "Certificate Transparency log", url: "https://crt.sh/" },
      { label: "DNS records (SPF / DMARC)", url: "https://example.com/dns" },
    ],
  };
}

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

/** A single finding. The data point is shown in its flag colour (§4) AND carries
 *  a worded "Flagged"/"Positive" cue, so meaning is never colour-alone. */
function FindingItem({
  kind,
  finding,
}: {
  kind: "flagged" | "positive";
  finding: Finding;
}) {
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
        <span className={flagged ? "text-flag-negative" : "text-flag-positive"}>
          {finding.text}
        </span>
      </div>
      <p className="text-sm text-ink-muted">
        Source: <SourceLink source={finding.source} />
      </p>
    </li>
  );
}

export default async function ReportPage({
  params,
}: {
  params: Promise<{ domain: string }>;
}) {
  const { domain: raw } = await params;
  const domain = decodeURIComponent(raw);
  const report = mockReport(domain);
  const correctionHref = `mailto:corrections@bornyesterday.tech?subject=${encodeURIComponent(
    `Correction request: ${domain}`,
  )}`;

  const overview = (
    <div className="flex flex-col gap-4">
      <SkepticismPill state={report.state} />
      <p className="text-ink">{report.summary}</p>
      <p className="text-sm text-ink-muted">Last checked: {report.lastChecked}</p>
      <ul className="mt-1">
        {report.flagged[0] && (
          <FindingItem kind="flagged" finding={report.flagged[0]} />
        )}
        {report.positive[0] && (
          <FindingItem kind="positive" finding={report.positive[0]} />
        )}
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
        Trust Report: {domain}
      </h1>

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
