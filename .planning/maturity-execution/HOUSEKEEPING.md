# AE maturity housekeeping ledger

This ledger prevents task, worktree, scratch and planning sprawl. Cleanup is
recoverability-first: preserve evidence and refs, verify exact targets, then remove
only disposable state.

## Per-leaf close checklist

- [ ] Owned-file diff is exact and contains no unrelated edits.
- [ ] No scratch scripts, local logs, caches, transient coverage or secret material
  remain in owned paths.
- [ ] Durable counterexamples and measurements are committed as tests/evidence.
- [ ] No skipped/disabled tests, placeholder production behavior or leaf-only shim
  remains.
- [ ] Leaf ref/evidence is handed to the integration driver.

## Per-phase implementation close checklist

- [ ] Every child result is integrated; no useful commit is stranded.
- [ ] Shared composition belongs only to the driver.
- [ ] Exact tracked diff inventory and clean status are captured.
- [ ] Phase-local scratch directories, generated secrets, test caches and temporary
  worktrees are removed after evidence preservation.
- [ ] Learnings, papercuts and open external evidence are canonicalized.
- [ ] Exact internal handoff is committed before the task stops.

## Per-acceptance close checklist

- [ ] Review report, gates, Ox prompt/output and verdict are committed.
- [ ] Every finding has a disposition and owning repair gate.
- [ ] Review-only scratch and unofficial source edits are absent.
- [ ] Superseded acceptance tasks are archived after the passing evidence ref is
  reachable from the active lineage.

## Program-manager cleanup protocol

For each completed phase:

1. Resolve exact task IDs, worktree paths, branches and commits.
2. Verify each worktree is clean.
3. Verify required commits are reachable from the accepted handoff or a retained
   named ref.
4. Preserve acceptance reports, learning files, papercuts and external-evidence
   assignments in the active lineage.
5. Archive completed implementation, repair, review and side tasks.
6. Remove only clean, inactive worktrees with exact absolute paths.
7. Retain phase branches through downstream integration; prune later from an exact
   dry-run list, never with an unresolved glob.
8. Re-run `git worktree list`, task inventory and repository status; record what
   remains and why.

## Phase close log

| Phase | Evidence preserved | Tasks archived | Worktrees removed | Branch disposition | Result |
|---|---|---|---|---|---|
| 0 | Phase 0 ledger and commit `50f74aa72` | pending inventory | pending inventory | retain through foundation integration | OPEN |
| 1 | accepted source `ae284871d9d5bad40245182aefd6f2050d53b556`; handoff `d20d62d8255ee7a38ce7cb8f1c618b1e0393d4e0` | implementation `01a03874-128c-7aa0-b2bc-bc02a2b6193e`, superseded review `01a0390e-8b60-7cc1-863c-a2bedc223fc0`, passing review `01a03961-c8d0-7812-8b4d-1fc13f2ba589` | clean worktrees `1cf4`, `27d0`, `7cf7` removed after reachability proof | retain `agent-p1-01-principal` and `codex/phase-2-unblock` through Phase 2 acceptance | CLOSED 2026-08-26 |
| 2 | implementation active | not applicable | active worktree retained | active | ACTIVE |

## Standing exclusions

- Current workspace root.
- Any active implementation or review worktree.
- `main`, `next`, `trunk`, `develop`, or the current branch.
- Unrelated dirty files or user-owned research/scratch outside the exact completed
  task scope.
- Vault material, deployment credentials or any path whose ownership is unclear.
