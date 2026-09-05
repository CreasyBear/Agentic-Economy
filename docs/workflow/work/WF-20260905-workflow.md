# WF-20260905-workflow: gstack delivery chain and housekeeping

Status: complete
Owner: this Codex task
Started: 2026-09-05

## Direction and approval

Joel requested the full skill chain, tracking, documentation, registers, lessons,
papercuts, shortcomings and bounded recursive improvement. He selected gstack
office-hours and plan reviews for initial scoping and approved one direction
approval per new goal, carrying already approved direction forward.

This goal builds the skill, a versioned workflow entry point and a concrete
cleanup backlog. Large code/document moves and migration of other active tasks
are follow-up goals. No product implementation, shared AGENTS or gstack rewrite.
The concrete workflow is [the entry point](../README.md); skill instructions
and templates live beside it. Existing product and deployment authorities retain
their roles. Research used the installed gstack source contracts and
[NousResearch autoreason](https://github.com/NousResearch/autoreason).

## Acceptance and evidence

| ID | Observable result | Required environment | Evidence | Result |
|---|---|---|---|---|
| AC-1 | Skill coordinates native gstack stages with one approval and resumable state | Independent realistic scenario evaluation | Delivery fixture completed through tests/review/local commit, preserving unrelated index/work; scoping fixture retained approval | pass; external gstack stages not integration-tested |
| AC-2 | Documentation, findings and lessons have explicit owners/homes without duplicating active legacy state | Repo files and links | Entry point, native artifacts, stable backlog IDs, linked legacy ownership; local link check | pass |
| AC-3 | Improvement is bounded, preserves incumbent and cannot relax acceptance | Independent adversarial scenario evaluation | Rejected regression/missing proof/invalid ranking at exhausted budget | pass for handoff decision; no actual tournament run |
| AC-4 | Skill is explicitly callable with readable metadata | Fresh installed CLI and desktop-bundled runtime | One enabled canonical name, explicit body injection, absent automatic injection | pass |
| AC-5 | Only owned setup changes enter commit; protected skill sources and instructions remain unchanged | Hash comparison and Git review | 347 protected baseline files unchanged; goal-ID commit receipt below | valid only with corresponding commit |

## Execution and handoffs

- Starting HEAD: `987cdec5085c207eb6b9024b66ef4a20de8a3da0`.
- Extensive pre-existing dirty work; index initially empty. Baseline and protected
  hashes saved under `~/.codex/workflow-build/20260905T044804Z/`.
- Owned: new `docs/workflow/` files, new `TODOS.md`, appended Wayfinder ignore
  allowlist and derived global Codex installation. Other working changes are not owned.
- Discovery: 27 root Markdown files; 183 Markdown files under `.planning`;
  root papercut ledger 2,427 lines; separate native/legacy learning stores.
- Existing architecture checks and module boundary manifest are retained.
- The Formance package tarball in `.planning/spikes` is **tracked**: its location
  is a cleanup candidate, not proof the dependency is missing from clean clones.
- Next action: adopt the workflow on the next scoped goal; cleanup candidates
  remain open in [TODOS](../../../TODOS.md).

## Closeout

- [Validation](../validation.md) records actual checks and their limits.
- Documentation: workflow entry point, skill chain, templates, curated lessons,
  installer and six deduplicated investigation/cleanup candidates.
- Scoped housekeeping: new durable paths visible to Git; links checked; fixture
  bytecode/scratch removed; external stage substitutes labelled honestly.
- What fell short: symlink discovery changed the callable name. Actual injection
  testing caught it; a guarded derived installation fixed the mismatch.
- No automatic improvement tournament was run for this initial build; the bounded
  procedure and adverse handoff decision were tested. Real adoption is still due.
- Local commit receipt: `git log --oneline --fixed-strings --grep=WF-20260905-workflow`.
  Complete status is effective only with that commit and verified owned tree.
- No push, deployment, application test suite or live product journey is claimed.
