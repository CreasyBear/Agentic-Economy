# T37 — Delivery pipeline + multi-agent repo protocol

Labels: `wayfinder:task` (AFK build + HITL for gh/CI credentials). Map: [Framework](../MAP-framework.md).

## Question

Program hygiene, found derelict (847 uncommitted files, last commit 3 days old, direct-on-main,
13 stashes): (1) commit/branch protocol for multi-agent development — checkpoint cadence, what a
commit must contain (green focused tests), branch-per-effort vs main+tags, review gate; (2) restore
`gh` auth (old-map T1) and mirror maps to Issues or explicitly re-affirm local-markdown tracker;
(3) CI: typecheck + focused suites + eval smoke gating, baseline-error ratchet (fix or freeze
`convex-source.ts:96`); (4) environments: staging Convex deployment, secrets management/rotation,
deploy runbook. Adopt-first: GitHub Actions standard patterns, no bespoke runners.

## Preparation (2026-08-01)

Implementation plan: [T37-delivery-pipeline-PLAN.md](../plans/T37-delivery-pipeline-PLAN.md),
prepared by six parallel read-only scouts (`history://ExamplesDecision`, `history://RepoProtocol`,
`history://CiGapAudit`, `history://BaselineRatchet`, `history://GhAuthAndTracker`,
`history://EnvSecretsRunbook`) against baseline `6f064fb1`.

Already executed ahead of the plan (commit `6f064fb1`): the deleted routing examples are retired per
founder ruling, their 6 stale suites and 3 script/config references removed, 2 replacement tests
added against live source, and the CI/records/skills collateral that an unreviewed sweep had deleted
is restored. That cleared 9 of 9 `tsc` errors, 3 of 7 unit failures, and 5 integration files.

**Blocked on two founder decisions**, both stated in the plan:
- **D1** — local `main` and `origin/main` are an unreconciled fork (169/30, no patch-equivalence).
  Declare `337f01cc` canonical and archive origin's Phase 5 line, or salvage first?
- **D2** — tracker of record: re-affirm local markdown, or mirror 43 tickets to Issues?

And on **D3**, a founder action: `gh` has no retrievable credential anywhere (no env var, no
`hosts.yml` token, no keychain entry), so restoring it is a fresh login, not a repair.

**Incident raised during preparation:** a scout's broad grep rendered `.env.local` values in tool
output. All 54 keys must be rotated — Stripe and Resend first.

## Resolution

(pending — gated on D1, D2, D3)
