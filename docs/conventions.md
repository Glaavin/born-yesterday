# Project conventions

## Work tracking — Epics + continuous stories
Epics are named after the periodic table in order (Hydrogen → Helium → Lithium → …); variable length;
milestone- or category-based, not time-boxed. Stories use one continuous counter across the whole
project that never resets.
Format: `Story <n> — <Element> Epic (<step> of <total>)` — <step> of <total> is the position within
the current Epic. Small batch/follow-up work gets a decimal (e.g. 6.1) that hangs off the nearest
integer, does not advance the integer counter, and borrows its anchor's step. Planned step → integer;
unplanned insertion/follow-up → decimal.

## Build log
Each story commits a build-log entry `docs/build-log/story-<n>.md` (decimals `story-<n>.<m>.md`) in
its PR, recording the outcome in the repo. It is the builder's self-report; the PM verifies against
the source on main. Template in docs/build-log/README.md.

## Secrets
Connection strings and other secrets live only in local .env.local (gitignored) and the host's env
store — never in the repo. .env.example documents required variable NAMES with no values.

## Observation failure is not absence

Any code path that can fail to observe something must represent that failure distinctly
from observing nothing. A fetch error, timeout, or parse failure must never collapse into
the same value as a completed check that found nothing.

**Carve-out:** where an external standard defines the meaning of absence (e.g. a missing
`robots.txt` permits crawling), applying that standard is not a collapse. Cite the standard
at the call site so the exemption is auditable.

This defect has been found at four layers — the indicator, `signal_history`, per-capture
fetch, and signal parsers. It recurs because it looks correct locally. Check for it whenever
adding a collector, a parser, or any code that reads an external source.

### What it looks like in practice
- Collectors carry `Signal.status` (`"ok" | "failed" | "not_attempted"`) alongside the value.
  `status: "ok"` with a null value means **checked, found nothing** — a finding, and it
  carries a source (the query that was run).
- Parsers return `null` for an **unparseable payload**, distinct from a parsed result whose
  fields are null because the data was genuinely absent.
- A collector derives a signal's status from **parse** success, not fetch success. HTTP 200
  with a malformed body is a failed observation, not an empty one.
