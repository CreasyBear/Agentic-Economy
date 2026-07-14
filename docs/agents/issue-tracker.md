# Issue tracker: GitHub

Issues and PRDs for this repository live in GitHub Issues at `CreasyBear/Agentic-Economy`. Use the `gh` CLI for issue operations and infer the repository from the local `origin` remote.

## Conventions

- Create: `gh issue create --title "..." --body "..."`
- Read: `gh issue view <number> --comments`
- List: `gh issue list --state open`
- Comment: `gh issue comment <number> --body "..."`
- Label: `gh issue edit <number> --add-label "..."`
- Close: `gh issue close <number> --comment "..."`

When a skill says to publish work, create a GitHub issue. When it says to fetch a ticket, read the issue and its comments with `gh issue view`.

## Pull requests as a triage surface

**PRs as a request surface: no.** External pull requests do not enter the issue-triage state machine.

## Wayfinding

- A map is an issue labelled `wayfinder:map`.
- Child tickets use `wayfinder:research`, `wayfinder:prototype`, `wayfinder:grilling`, or `wayfinder:task`.
- Prefer native GitHub sub-issues and issue dependencies. Where unavailable, use explicit task-list and `Blocked by: #...` links.
- Claim an unblocked ticket with `gh issue edit <number> --add-assignee @me` before implementation.
