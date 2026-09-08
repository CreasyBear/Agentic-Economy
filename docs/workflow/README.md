# Wayfinder: how work gets finished

Start with `$wayfinder-delivery <issue or goal>`. Resume with the same work-record
path. Ask for `status`, `tidy`, or `evolve` when that is the work wanted.

This is the entry point for new delivery work. It connects the existing gstack
skills and keeps their outputs traceable. It does not replace the product
charter, architecture, deployment procedures, or existing active package plans.

## The chain

| Stage | Skill or action | What must survive the handoff |
|---|---|---|
| Understand | `office-hours`; `investigate` for an observed defect | The actual problem, evidence, credible alternatives, product and platform fit |
| Plan | `plan-ceo-review`, `plan-eng-review`; design/devex reviews when relevant | One selected plan, a complete bounded user journey, affected areas, observable acceptance criteria |
| Agree | Joel approves the resulting direction once | The approval and exact plan revision; already approved direction carries forward |
| Implement | Native Codex execution with relevant stack guidance | Owned changes and progress against the accepted criteria |
| Evaluate | Focused tests; `qa`/`qa-only`, real client or operator checks as relevant | Evidence for each criterion, with revision and environment |
| Review and fix | Inspect owned diff; separate review when requested or warranted by risk | Supported findings resolved; affected checks rerun after fixes |
| Close | Update affected docs, scoped housekeeping, local commit | Outcome, relevant checks and remaining risk; no separate closeout certificate |
| Improve, when requested | Bounded `evolve` supported by a real failure | A tested workflow change; retaining the existing workflow is valid |

Select reviews for the decisions they can change. A clear, approved repair resumes
at the needed stage. A novel product or platform choice needs scoping. Do not run
all reviews on every task. `ship` is a separate extension when a PR/release is
requested: its versioning, push and PR behavior exceeds a local-commit endpoint.

## Where things live

| Record | Canonical home | Rule |
|---|---|---|
| Product and language | [PRODUCT.md](../../PRODUCT.md), [CONTEXT.md](../../CONTEXT.md) | Historical plans and lessons cannot override these |
| Work, approval, acceptance and evidence | Existing issue/queue; `docs/workflow/work/<goal-id>.md` only when a resumable home is missing | One current status home; link plans/findings rather than copying them; routine work can close in the response |
| Design and selected plan | `docs/designs/<topic>.md`, or an existing accepted plan | Keep the existing plan; no parallel Wayfinder specification |
| Actionable findings, papercuts, debt and cleanup | [TODOS.md](../../TODOS.md) | Stable IDs; one current status per finding; link original evidence |
| Durable architectural decisions | [docs/adr](../adr/) | ADR only for a consequential lasting decision; routine choices stay in the work record |
| Deployment facts | [deployment registry](../operations/deployment-registry.yaml) and [maturity](../operations/deployment-maturity.md) | Update actual operational records, not a second inventory |
| Reusable lessons | [lessons.md](lessons.md) | Curated, evidence-linked guidance; supersede stale lessons explicitly |
| Workflow improvement experiments | `docs/workflow/experiments/<goal-id>-<topic>.md` | Hypothesis, fixed checks, candidates, results and promotion/rollback |
| Skill source | [wayfinder-delivery/SKILL.md](wayfinder-delivery/SKILL.md) | Versioned authority; the global installed copy is derived |

gstack's private design copies, learning cache and review logs remain its native
outputs. Link useful receipts; treat private copies as snapshots, not a second
editable plan. A repository decision changed later must supersede or refresh its
old references. No private cache is required to understand a committed decision.

New work records use a stable, descriptive ID, for example
`WF-20260905-native-connection`. Findings use `<goal-id>-01` or retain their
existing ID such as `AE-PC-011`. No globally incremented counter or task database.
Search existing IDs before creating records. Use lowercase kebab-case for new
document filenames, with the stable `WF-` record prefix as an exception; preserve
established root conventions and route filenames.

## Existing sprawl: adoption without another migration mess

Existing active package and Wayfinder plans continue in place. Adopt them by
reference when resuming that work. The root [historical papercut ledger](../../PAPERCUTS.md),
[September product audit](../../.planning/audits/product-papercut-register-2026-09-03.md),
and [older lessons](../../.superstack/learnings.md) are evidence to consult, not
inventories to copy wholesale. Revalidate an old finding before promoting it to
TODOS; keep its ID and provenance. If an old active record retains ownership,
link to it without creating another status. On explicit adoption, mark the old
record as handed off to the canonical entry. Other ongoing tasks are not migrated
by this setup.

These legacy local links may be unavailable in a clean checkout. That is an
explicit migration debt, not acceptable storage for new acceptance evidence.
New durable documents and non-sensitive evidence must be tracked or linked to a
durable accessible artifact. Never commit raw credentials, personal transcripts,
payment data or secret-bearing snapshots as evidence.

Housekeeping happens within the change: correct touched documentation and links,
use established module owners and names, remove only owned scratch/dead code,
and capture unrelated problems for a separate goal. Broad renames and historical
archival require an inventoried migration with references and imports repaired.
Counts and file size identify investigation candidates; they do not prove defects.

## Validation and improvement

The [delivery guide](wayfinder-delivery/references/delivery.md) defines handoffs
and completion. The [record guide](wayfinder-delivery/references/records.md)
defines documentation and finding closeout. The [evolution guide](wayfinder-delivery/references/evolution.md)
defines a bounded experiment, including independent comparison and no-change wins.

Use existing tests for actual behavior. In this repo, module ownership is declared
in `src/modules/module-boundaries.ts`; `tests/imports` exercises architectural
boundaries. Read `package.json` before choosing the appropriate focused checks.
Do not run the complete release suite merely to validate workflow Markdown.

Routine closeout reports the outcome, checks and remaining risk. Retrospectives,
lessons and improvement experiments are not mandatory stages. Record a lesson
only when useful; run an experiment when requested for a demonstrated defect.
Report headings, confidence scores and receipt presence are not correctness gates.
A check that passes only by weakening the requirement is a failed experiment.
Changes to product direction, gstack internals or shared policy remain separate goals.

## Current work and installation

- [Rationalise vocabulary across the platform](work/WF-20260905-vocabulary.md)
- [Package 7: pre-launch trust and account lifecycle](work/WF-20260905-package-7.md)
- [Build and validate this workflow](work/WF-20260905-workflow.md)
- [Validation and known limits](validation.md)
- [Cleanup candidates](../../TODOS.md)

Codex installation: `~/.codex/skills/wayfinder-delivery` is an explicit-only copy
of `docs/workflow/wayfinder-delivery`. Run `python3 docs/workflow/install-skill.py`
after source changes; add `--check` to verify without writing. The installer
records source/digests and refuses to overwrite a locally edited or unmanaged
installation. Do not edit the derived copy. Other repositories use their own
instructions and record locations. The existing planning-only `wayfinder` and
all gstack sources remain separate and unchanged.

An initial symlink trial caused both Codex runtimes to namespace the entry as
`agentic-economy:wayfinder-delivery`; the short invocation did not inject it.
The derived installation preserves the intended `$wayfinder-delivery` command.

To disable, move only the installed folder outside skill discovery. To roll back
a skill change, restore the affected source files from the recorded version,
preserving later edits, and rerun the guarded installer.
To remove this setup entirely, remove only its owned files and the marked
Wayfinder discovery block in `.gitignore`; preserve all work records created
since installation. Setup evidence and the original ignore file are retained at
`~/.codex/workflow-build/20260905T044804Z/` outside discovery.
