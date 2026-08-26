# AE maturity execution operating system

This file governs the orchestration process around the frozen contracts in
`PLAN.md`. It does not replace the plan, its gate files, or measured evidence.

## Program outcome

Run Phases 2–9 through implementation, independent acceptance, repair and
integration until the root ledger is genuinely met. Source work continues while
time-bound or third-party evidence accumulates, but AE is never called L3 complete
until every root gate is met and no gate is abandoned.

## Phase state machine

```text
PREPARED
  -> ARCHITECTING
  -> DESIGN_ACCEPTANCE
     -> DESIGN_CHANGES_REQUIRED -> ARCHITECTING -> DESIGN_ACCEPTANCE
     -> DESIGN_ACCEPTED
  -> IMPLEMENTING
  -> INTERNALLY_VERIFIED
  -> ACCEPTANCE_REVIEW
     -> CHANGES_REQUIRED -> REPAIRING -> ACCEPTANCE_REVIEW
     -> SOURCE_ACCEPTED
     -> SOURCE_ACCEPTED_EVIDENCE_OPEN
  -> INTEGRATED
```

- `PREPARED`: predecessor source is accepted and the launch packet freezes scope,
  ownership, dependencies, counterexamples and success criteria.
- `ARCHITECTING`: for a phase with a new bounded context or consequential state
  machine, a planning-only task resolves the domain model, deep module interfaces,
  failure semantics, data/query design, implementation ownership and test
  architecture before production code changes.
- `DESIGN_ACCEPTANCE`: a fresh context-independent task attacks the architecture,
  state machines, trust boundaries, runtime proof strategy and blast-radius map.
- `DESIGN_CHANGES_REQUIRED`: a design defect returns to the architecture task. It
  may not be deferred into implementation as a hoped-for repair.
- `DESIGN_ACCEPTED`: the exact architecture ref has zero unresolved decisions and
  is the frozen input to implementation. Material design changes invalidate this
  state and require fresh design acceptance.
- `IMPLEMENTING`: one phase task owns implementation and delegates bounded leaves.
- `INTERNALLY_VERIFIED`: the implementer has checked every leaf and phase gate,
  run the exact release gate, recorded the ref, and stopped.
- `ACCEPTANCE_REVIEW`: a fresh task independently validates behavior, architecture,
  security and evidence, including an Ox Alpha adversarial pass.
- `CHANGES_REQUIRED`: a source defect, false gate, unsafe dependency or broken
  invariant blocks progression. Findings return to the implementation task.
- `SOURCE_ACCEPTED`: source and all phase-owned evidence are accepted.
- `SOURCE_ACCEPTED_EVIDENCE_OPEN`: source is accepted; named hosted, elapsed-time,
  vendor, legal or commercial evidence remains assigned to its owning later gate.
- `INTEGRATED`: the accepted ref is the measured base for its dependent phase or
  program-branch gate.

No implementation task may accept its own phase. No review task may quietly repair
the source it reviews. Review findings return to the phase task, and the repaired
ref receives another fresh acceptance task.

Phases 3 and 4, and any later phase introducing a new consequential state machine
or bounded context, require `DESIGN_ACCEPTED` before `IMPLEMENTING`. This gate is
not satisfied by a roadmap, schema sketch or implementation-looking test list.

## Task isolation and ownership

- Every phase after Phase 0 runs in a separate Codex task and worktree.
- Every acceptance attempt runs in a new, context-independent task.
- Each phase task sets one phase-only goal before repository work.
- Architecture tasks are planning-only and own only explicit context, ADR, design,
  gate and launch artifacts. They do not edit production source or tests.
- The phase driver delegates discrete leaves with non-overlapping owned paths,
  explicit outcomes and explicit stop conditions.
- Only the phase integration driver edits shared composition surfaces named in the
  frozen contract.
- Workers are told that other agents share the codebase, must preserve their edits,
  and must stop if ownership overlaps.
- A phase task stops after its exact internal handoff. It never starts a successor.

## Required implementation passes

Before implementation, the accepted architecture package must freeze the actual
runtime proof model. A gate that projects one canonical sink over many labelled
surfaces is insufficient unless it proves identical composition and effect-path
dominance for every actual registered handler. Tests may not reimplement policy in
a parallel evaluator and call that runtime coverage.

Each leaf performs the four Unlazy passes:

1. Complete implementation without production placeholders.
2. Domain-expert reread and replacement of cheap shortcuts.
3. Defect and hostile-edge-case hunt.
4. Cost-free polish.

The driver independently reruns each leaf checker and at least one raw `CHECK`,
then proves cross-leaf composition, denial/isolation behavior, the exact Node 22
release gate and a clean worktree. Targeted tests cannot substitute for phase or
release gates.

## Acceptance contract

The fresh reviewer receives only the frozen contract, exact base and candidate
refs, changed-file inventory, gate evidence, known open evidence and relevant
upstream learnings. It must:

1. reproduce all gates from a clean state;
2. inspect the diff and trust boundaries rather than trust test names;
3. attempt hostile counterexamples and semantic gate falsification;
4. run architecture, security, conformance, regression and release checks;
5. run an Ox Alpha adversarial review and independently verify its claims;
6. return exactly one verdict: `SOURCE_ACCEPTED`,
   `SOURCE_ACCEPTED_EVIDENCE_OPEN`, or `CHANGES_REQUIRED`.

`CHANGES_REQUIRED` findings include severity, exact evidence, consequence,
reproducer, expected repair and owning gate. Acceptance names the exact accepted
source ref and final evidence ref.

## Source and external evidence

Source progression is blocked only by a source defect, false gate, unsafe missing
dependency or invariant failure. Lack of hosted credentials, vendor access,
elapsed soak time, customer counts, legal approval or commercial volume is tracked
as open evidence against its owning operational/GA gate. This distinction never
weakens the root completion contract.

Every open item records:

- evidence required and why source tests cannot replace it;
- owner and owning phase/root gate;
- earliest collection point and expiry/freshness rule;
- exact source/deployed revision to which it applies;
- whether it blocks phase source progression, branch integration, or L3 only.

## Dependency scheduler

```text
Phase 2 accepted
  +-> Lane A: Phase 3 -> Phase 4
  +-> Lane B: Phase 5 foundations
  +-> Lane C: Phase 6 resolve/contracts/connectors

Phase 4 accepted -> Phase 6 call/continuation integration
Phase 4/5/6 branch integration -> Phase 7 and Phase 8
All branch gates accepted -> Phase 9
Phase 9 + all external evidence -> root adversarial close
```

Parallel lanes may not share an unassigned composition file. The later integrating
lane rebases or merges accepted predecessor refs before composition and reruns its
full phase gate.

## Monitoring and intervention

The program manager monitors active tasks and intervenes when:

- a task asks a basic question already frozen by the contract;
- a task starts planning, roadmap creation or a successor phase;
- ownership overlaps or a worker edits shared composition;
- a gate is marked met without captured evidence;
- a release check depends on ignored/local artifacts;
- external access is being mistaken for a source blocker;
- a task is idle or repeatedly failing without a bounded diagnostic path;
- numeric claims are copied instead of remeasured;
- a papercut repeats without repair or assigned ownership.

Routine progress is not micromanaged. Intervention repairs a violated contract or
dependency, then lets the phase driver resume.

## Continuous learning loop

After every internal handoff and every acceptance attempt:

1. extract decisions, patterns, surprises, failed approaches and predictions;
2. classify papercuts as product, code, evidence, tool or process;
3. repair safe in-scope issues immediately;
4. assign deferred issues to an owner and owning gate;
5. convert repeated failures into launch-packet counterexamples or mechanical
   checks;
6. feed accepted learnings into every dependent phase prompt;
7. preserve historical failed reviews rather than rewriting them away.

The authoritative completion record remains `PLAN.md` plus checked gate files.
`PROGRAM-STATE.md` is a derived operating snapshot and must be updated from exact
refs and task results, never from memory.

## Mandatory housekeeping close

Housekeeping is part of completion at every level. A worker, task or phase with
unreconciled scratch state is not closed.

### Leaf close

- Remove temporary fixtures, generated probes, logs, coverage output and scratch
  scripts unless they are intentional checked evidence.
- Delete no shared artifact and never clean another worker's owned paths.
- Ensure owned production files contain no placeholder, disabled test or obsolete
  compatibility shim introduced only for the leaf.
- Record reusable evidence under the phase evidence directory; do not leave it in
  `/tmp`, an ignored build directory or chat-only output.
- Report the exact owned-file diff and clean status to the driver.

### Phase implementation close

- Reconcile all subagent branches/commits into the phase ref and prove no leaf work
  remains stranded.
- Remove phase-local scratch, transient coverage, test caches, generated secrets,
  one-off clones and abandoned worktrees after their useful evidence is preserved.
- Classify every new file as source, test, contract, evidence, learning or papercut;
  remove anything with no durable purpose.
- Remeasure the tracked changed-file inventory and confirm no unrelated user work
  was absorbed.
- Preserve the exact ref, handoff, learnings and open-evidence ledger before the
  implementation task becomes idle.

### Acceptance close

- Preserve the review report, gate transcript, Ox prompt/output, finding
  dispositions and verdict as committed evidence.
- Remove review-only scratch and generated local state.
- If changes are required, keep only the exact reproducer/evidence needed by the
  repair task; the reviewer does not retain an unofficial source fork.
- After a superseding acceptance passes, archive failed/superseded review tasks.

### Program-manager close

- Archive completed implementation, repair, review and side tasks after their
  durable evidence and exact refs are reachable from the active program lineage.
- Remove their clean worktrees only after verifying that no uncommitted files
  exist and all required commits are reachable. Preserve refs until branch-level
  integration has passed; prune branches only in a later explicit dry run.
- Retire duplicate launch packets and scratch notes by folding unique decisions,
  papercuts and evidence into canonical program artifacts first.
- Review `.planning/phases/` milestone archives with the GSD cleanup workflow only
  when an actual completed GSD milestone and archived roadmap exist. The frozen
  maturity tree is not manufactured into GSD milestone structure merely to make a
  cleanup tool run.
- Update `PROGRAM-STATE.md` after task archival/worktree removal so the snapshot
  never points at disposable scratch as its only evidence location.

The concrete checklist is `HOUSEKEEPING.md`. Destructive cleanup always resolves
exact targets and checks clean/reachable state first; active worktrees, the current
workspace, protected branches and unrelated user files are never cleanup targets.

## Exact phase handoff schema

Every internal and acceptance handoff reports:

- phase, verdict/state and task identity;
- base, candidate, evidence and accepted source refs;
- branch and clean-worktree result;
- changed-file count and exact inventory location;
- leaf, phase and release gate measurements;
- hostile counterexamples attempted and outcomes;
- coverage for critical paths;
- Ox result and independent disposition of every finding;
- open external evidence with owning gates;
- papercuts/learning artifact paths;
- explicit statement that the successor has not been started.
