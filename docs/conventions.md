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
