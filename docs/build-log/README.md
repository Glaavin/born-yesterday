# Build log

One file per story (`<phase>.<sprint>.<story>.md`), committed in that story's PR, so the PM
can read each story's outcome directly from the repo. It is CC's self-report; the PM still
verifies against the actual source on `main`.

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
