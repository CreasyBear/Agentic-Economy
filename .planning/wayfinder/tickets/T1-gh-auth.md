# T1 — Re-authenticate `gh` and mirror the map to GitHub Issues

Labels: `wayfinder:task` (HITL). Status: open, unclaimed.

## Question

The tracker of record is GitHub Issues (`docs/agents/issue-tracker.md`), but the stored `gh` token for account `CreasyBear` is invalid, so no issue can be created or read. Human checklist:

1. Run `gh auth login -h github.com` and complete the browser flow.
2. Confirm with `gh auth status` (token valid, repo scope).
3. Tell an agent session to mirror `.planning/wayfinder/MAP.md` and its tickets to GitHub Issues per the tracker doc (`wayfinder:map` label, child tickets, native blocking), then mark this local copy as the mirror, not the source.

## Resolution

(pending)
