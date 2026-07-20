# Build log

One file per story (`story-<n>.md`; small follow-ups use a decimal, `story-<n>.<m>.md`),
committed in that story's PR, so the PM can read each story's outcome directly from the repo.
It is CC's self-report; the PM still verifies against the actual source on `main`.

> Older Hydrogen-era entries used the `<phase>.<sprint>.<story>.md` scheme (e.g. `1.2.7.md`).
> From the Helium Epic onward the filename follows the continuous story counter (`story-8.md`).

## Template

```
# Build log — Story <id>: <title>
- PR: #<n>   - Branch: <branch>   - Status: opened (CI green) | merged   - Date (UTC):

## Files changed
- <path> — (new|edited) one-line purpose

## Acceptance criteria
- [x] <criterion> — met (evidence: file:line / note)
- [~] <criterion> — partial (why)
- [ ] <criterion> — not met (why)

## Decisions & deviations
- <what differed from the prompt, and why>

## Follow-ups / tech debt
- <anything deferred>

## Gates
- install | lint | typecheck | build: pass/fail
```
