# TODOS

Actionable findings for new Wayfinder work. Preserve existing IDs and link
original evidence. These setup findings are investigation/cleanup candidates,
not authorization for repository-wide changes. Existing active package plans
and audit closeouts retain ownership until explicitly adopted.

## Documentation

### WF-20260905-workflow-01 — Establish document ownership before moving the sprawl

**What:** Classify root and planning documents as active authority, active work,
reference evidence, generated output or superseded history; then propose moves.
**Why:** Similar planning/research records occupy several homes, making the
current decision and next action difficult to find.
**Context:** On 2026-09-05 the root had 27 Markdown files and `.planning` contained
183. The existing PRODUCT/CONTEXT authority chain is clear and must be preserved.
File counts do not establish which files are obsolete.
**Effort:** M
**Priority:** P2
**Kind:** documentation debt
**Status:** closed for the adopted closeout scope — 2026-09-08
**Owner:** [closeout program](docs/workflow/work/WF-20260908-closeout.md)
**Evidence:** [workflow discovery](docs/workflow/work/WF-20260905-workflow.md),
[structure map](.planning/codebase/STRUCTURE.md).
**Close when:** Every proposed move has an owner/authority classification and
reference inventory; approved moves preserve active work and repair links.

### WF-20260905-workflow-02 — Make adopted evidence available in a clean checkout

**What:** Promote necessary non-sensitive acceptance evidence out of ignored-only
storage when adopting an active goal.
**Why:** A committed completion claim must not depend solely on local planning files.
**Context:** Root ignore rules exclude much of `docs`, `.planning`, and
`PAPERCUTS.md`; some legacy files remain tracked exceptions. Audit each needed
artifact with Git rather than assuming all files under an ignored directory
are missing from version control.
**Effort:** M
**Priority:** P2
**Kind:** evidence debt
**Status:** closed for the adopted closeout scope — 2026-09-08
**Owner:** [closeout program](docs/workflow/work/WF-20260908-closeout.md)
**Evidence:** [.gitignore](.gitignore), [record policy](docs/workflow/README.md).
**Close when:** An adopted goal's acceptance can be reviewed from a clean checkout
and durable permitted evidence links without copying secrets or entire old ledgers.

## Workflow

### WF-20260905-workflow-03 — Triage historical papercuts without cloning their ledger

**What:** Revalidate relevant historical findings, retaining IDs and one current owner.
**Why:** The old append-only ledger repeats friction and can obscure unresolved work.
**Context:** `PAPERCUTS.md` is 2,427 lines and warns that its historic logger does
not deduplicate. The September audit has meaningful source-versus-live closeouts;
preserve those distinctions and do not copy all 44 findings as currently open.
**Effort:** M
**Priority:** P2
**Kind:** process debt
**Status:** open
**Owner:** unassigned
**Evidence:** `PAPERCUTS.md` (local historical evidence),
`.planning/audits/product-papercut-register-2026-09-03.md` (local historical evidence).
**Close when:** Relevant active findings have one canonical status, historical
provenance, a next action and appropriate proof; superseded entries remain traceable.

### WF-20260905-workflow-04 — Reconcile desktop skill exposure with runtime inventory

**What:** Reproduce whether fresh desktop tasks respect disabled skill entries.
**Why:** Configuration/catalogue probes alone do not prove the actual task sees
the intended automatic skill set.
**Context:** The earlier cleanup's native inventory checks passed, while this
task's supplied catalogue still included disabled GSD entries and duplicates.
Distinguish a stale task catalogue from a persistent discovery defect before fixing.
**Effort:** S
**Priority:** P2
**Kind:** harness papercut
**Status:** open
**Owner:** unassigned
**Evidence:** Local cleanup receipts at
`~/.codex/skill-cleanup/20260905T041516Z/`; this task's supplied catalogue.
**Close when:** A reloaded desktop/new-task observation agrees with intended
enabled and implicit-invocation policy, or the remaining platform defect is isolated.

### WF-20260905-workflow-07 — Distinguish an unavailable pre-commit scan from regressions

**What:** Correct or configure the existing React pre-commit wrapper's handling
of an unavailable scan without absorbing another task's configuration edits.
**Why:** It labels inability to scan as “staged regressions” while still allowing
the commit, obscuring what was actually checked.
**Context:** During the workflow-only commit, React Doctor refused to scan because
pre-existing `package.json` differed between index and worktree. The hook printed
a regression message and exited successfully. No React files were in the commit.
**Effort:** S
**Priority:** P2
**Kind:** tooling papercut
**Status:** open
**Owner:** unassigned
**Evidence:** [setup validation](docs/workflow/validation.md), local `.git/hooks/pre-commit`,
and commit `95564302c` output retained by this task.
**Close when:** In the approved hook policy, no-relevant-files, scan-unavailable,
actual failure and pass are accurately distinguished; unrelated staged/unstaged
work remains untouched and the hook's blocking behavior is explicit.

## Architecture

### WF-20260905-workflow-05 — Review responsibility hotspots before splitting files

**What:** Inspect frequently changed large files for mixed responsibilities and
propose the smallest ownership correction supported by source/caller evidence.
**Why:** Clear boundaries matter more than accumulating helpers or enforcing a
cosmetic maximum file length.
**Context:** Discovery found `src/lib/server/agent-access-oauth-api.ts` at 1,601
lines, `convex/agentAccessOAuth.ts` at 1,910 and
`src/modules/capability-supply/supply-actions.ts` at 1,374. These are candidates,
not verified code-quality defects. Exclude generated route trees from this metric.
**Effort:** M
**Priority:** P2
**Kind:** architecture investigation
**Status:** open
**Owner:** unassigned
**Evidence:** [module boundary manifest](src/modules/module-boundaries.ts),
[existing boundary checks](tests/imports/module-boundaries.test.ts).
**Close when:** A source-grounded ownership review either justifies bounded
refactoring with behavior/boundary checks or records why current placement is sound.

### WF-20260905-workflow-06 — Move the production dependency out of a spike when scoped

**What:** Evaluate a maintained canonical home for the Formance SDK tarball.
**Why:** A production dependency stored under a planning spike blurs lifecycle
ownership and risks accidental removal during future planning cleanup.
**Context:** `package.json` references
`vendor/formance-formance-sdk-7.0.0.tgz` after the approved closeout relocation.
The tarball is tracked; no missing-dependency failure was established here.
**Effort:** S
**Priority:** P2
**Kind:** repository hygiene
**Status:** closed for the adopted closeout scope — 2026-09-08
**Owner:** [closeout program](docs/workflow/work/WF-20260908-closeout.md)
**Evidence:** [package.json](package.json), the tracked tarball and lockfile.
**Close when:** An approved relocation or packaging decision preserves the exact
dependency, updates its references/lockfile and passes a clean-install check.

## Completed

The closeout program resolved workflow-01 (bounded document ownership), workflow-02
(adopted source acceptance evidence and recovery inventory), and workflow-06
(exact SDK relocation). Original IDs and evidence remain above.

Workflow-03 remains open: historical papercut triage was not expanded into this
housekeeping task. Workflow-04, workflow-05 and workflow-07 retain their separate
harness, architecture and hook-policy scope.

The local-only papercut references above are preserved in
`historical-papercut-references.tar.gz`; see [recovery availability](docs/workflow/work/WF-20260908-closeout.md).
They remain historical evidence, not newly adopted open findings.
