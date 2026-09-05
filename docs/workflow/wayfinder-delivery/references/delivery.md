# Delivery and handoffs

## Select existing capabilities

| Need | Route | Handoff evidence |
|---|---|---|
| Clarify problem, demand, alternatives | gstack `office-hours` | Native design record and unresolved premises |
| Diagnose a reproduced defect | gstack `investigate` | Reproduction, cause, regression criterion |
| Set product scope and challenge direction | gstack `plan-ceo-review` | Selected scope and explicit deferrals |
| Set architecture and execution plan | gstack `plan-eng-review` | Existing/platform capabilities, ownership, sequencing, test and failure plan |
| Choose visual/product experience | `plan-design-review`; `design-consultation` if needed | Full relevant journey and design decisions |
| Developer-facing product/client/API | `plan-devex-review` | First use, installation, credentials, failure and recovery in actual supported clients |
| Unfamiliar codebase | `gsd-map-codebase` when mapping is justified | Existing or refreshed maps; verify relevant source rather than treating maps as authority |
| Implementation | Native Codex plus installed stack guidance | Code and observable behavior against the accepted plan |
| Live evaluation | `qa` for authorized fixes, `qa-only` for read-only report; `ios-qa` for iOS | Reproducible journey evidence tied to build and environment |
| Code review | gstack `review` | Findings with paths, impact and evidence |
| Extra risk | Applicable security, design, devex, performance or platform review | Evidence for the risk actually introduced |
| Documentation | Scoped factual sync; `document-release` in its supported release/branch context | Touched docs match actual behavior and release state |
| Lessons | Curated repo lesson; `learn` for its native learning cache when useful | Evidence, applicability and status rather than confidence alone |
| Trend analysis | `retro` when there is comparable history | Same-window observations and actionable experiments |
| PR/release requested | `ship`, then separately authorized landing/deployment | Actual release receipts and live proof |

Resolve installed paths from the available catalogue and filesystem. In Joel's
setup gstack skills are `~/.codex/skills/gstack-<name>/SKILL.md`; use that version
when another collection has the same name. Preserve their sources and templates.
If a selected skill is unavailable, identify it and perform a clearly labelled
manual equivalent only when its missing capability is not essential. Otherwise
record the blocker. Never install or upgrade tools incidentally to start a stage.

Do not load every row. Office-hours establishes the problem; a plan review should
not relitigate an approved direction without contrary evidence. Do not use
`autoplan` as a universal gate: it expands into several reviews. Use it only when
that set is wanted and fits the goal's budget. A stage's internal subagents must
be awaited; a failed reviewer is missing review, not a passing verdict.

## Anchor the plan in the real destination

For a product/platform decision, compare the native/existing path with the
proposed build. Inspect actual pinned versions, official contracts and target
clients. A general protocol capability does not establish each client's support.
Resolve the uncertainty that could reverse the choice through the cheapest
authorized research or experiment before planning the complete implementation.

Trace entry → prerequisites → consequential handoff → useful result → relevant
failure/cancellation/recovery. Enumerate only the dependencies needed to complete
that bounded journey. Each acceptance criterion names an observable result and
required environment. Do not reduce the promised outcome to match available tests.

The work record links the selected native design/plan and its revision or digest.
Use a small decision/evidence section in that record if no larger plan is needed.
Office-hours private copies are snapshots. Update the selected repo plan when
decisions change; never let two documents both claim to be the active plan.

## Implement, evaluate, review

Before changes, capture branch, HEAD, dirty/staged paths and ownership. If sharing
a dirty file, identify owned hunks; if that cannot be done reliably, isolate the
work or stop the colliding edit. Do not assume everything after the starting HEAD
belongs to this goal. Check again before review and commit.

Use existing module entry points, domain owners, naming conventions and tests.
Every new production file needs a clear responsibility and an existing owning
area. Keep transport code at the transport boundary. Investigate a mixed-responsibility
file before proposing a split; arbitrary line-count limits and cosmetic renames
do not establish better architecture. Dependency/import/route changes require the
relevant existing boundary checks and caller/link verification.

The acceptance matrix is the evaluation contract. Record test/probe, result,
revision, environment and limitations. Wait for background work before asserting
results. Preserve raw failures sufficiently to diagnose them, with secrets removed.
Do not waive missing live or client proof by increasing model review scores.

Review after the implementation is exercisable. Use gstack `review` scoped to
owned changes and relevant specialist review. If the native review would include
unrelated branch changes, supply an isolated reviewable patch/workspace or label
the manual scoped review honestly. Every reviewer concern gets evidence and a
disposition; unsubstantiated criticism does not mandate code churn.

Fix acceptance failures and introduced regressions within scope, then rerun the
affected evidence. Two unchanged failing attempts trigger fresh diagnosis, not
unlimited retries. A real blocker retains the next action and evidence required
to resume. A scoped goal is not cancelled merely because live proof is unavailable.

## Commit boundary

Local commit is the default endpoint for an implementation invocation. It does
not authorize push, version bumps, PR publication, landing or deployment. Carry
any separately granted release authorization forward without asking again.

Inspect the staged diff against owned paths/hunks immediately before commit.
Preserve unrelated staged work; use an isolated index when needed and understood,
or report the collision. Never include unrelated changes just to get a clean tree.
Include the goal ID in the commit message. Verify the resulting tree and that
unrelated staged/working content survived. A hook failure or missing commit keeps
the goal open; don't claim completion or bypass substantive checks to finish.

The final record and owned changes can be committed together. Resolve the commit
receipt from Git history by goal ID instead of trying to embed a commit's own
hash inside itself. A record marked complete is valid only when its required
evidence and corresponding commit actually exist. If committing fails, correct
the working record to reflect the unresolved step.
