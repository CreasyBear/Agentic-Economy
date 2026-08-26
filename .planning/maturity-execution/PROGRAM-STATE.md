# AE maturity program state

Derived operational snapshot. The authoritative evidence remains `PLAN.md`, the
gate files and committed acceptance reports.

Last updated: 2026-08-26 Australia/Perth

## Current critical path

| Phase | State | Exact source / task | Next transition |
|---|---|---|---|
| 0 | INTEGRATED | `50f74aa72` | Foundation predecessor retained |
| 1 | SOURCE_ACCEPTED_EVIDENCE_OPEN | accepted source `ae284871d9d5bad40245182aefd6f2050d53b556`; evidence handoff `d20d62d8255ee7a38ce7cb8f1c618b1e0393d4e0` | Phase 2 launched |
| 2 | IMPLEMENTING | task `01a039cb-a32a-7952-9c39-330b3c4ec860`; branch `codex/ae-maturity-phase-2`; current measured HEAD `787396e15b1d7c3e769b00843d3bcc8326e80d19`; base `d20d62d8255ee7a38ce7cb8f1c618b1e0393d4e0` | Freeze and verify real effect-path dominance proof, bounded repair, internal handoff, then fresh acceptance |
| 3 | ARCHITECTING | task `01a03cd1-732d-7a81-8d23-a90e5840af85`; worktree `/Users/joelchan/.codex/worktrees/25b3/Agentic-Economy`; preparation ref `d9c645794cadbff1799d1a0b7d3e31f30fa642b5` | Internally verify architecture, then fresh Ox Alpha design acceptance; implementation still waits for Phase 2 source acceptance |
| 4 | BLOCKED_BY_DEPENDENCY | waits for Phase 3 | Complete transaction kernel |
| 5 | BLOCKED_BY_DEPENDENCY | waits for Phase 2 source acceptance | Launch Lane B foundations |
| 6 | BLOCKED_BY_DEPENDENCY | waits for Phase 2; call/continuation integration also waits for Phase 4 | Launch bounded Lane C scope |
| 7 | BLOCKED_BY_DEPENDENCY | waits for branch integration | Scale/fairness/cost |
| 8 | BLOCKED_BY_DEPENDENCY | waits for branch integration | Support/lifecycle/integrity |
| 9 | BLOCKED_BY_DEPENDENCY | waits for every program branch gate | GA readiness/evidence |

## Phase 1 accepted boundary

- Verdict: `SOURCE_ACCEPTED_EVIDENCE_OPEN`
- Source: `ae284871d9d5bad40245182aefd6f2050d53b556`
- Final evidence handoff: `d20d62d8255ee7a38ce7cb8f1c618b1e0393d4e0`
- Measured result: 63/63 gates, zero `ABANDON`, fresh Node 22 source
  release passed, Ox Alpha B1/B2/B3 and regressions passed.
- Open later evidence: hosted Clerk proof, live reset-adapter proof and production
  context wiring. These do not block Phase 2 source work.
- Housekeeping: completed implementation and both acceptance tasks archived; their
  three clean worktrees removed after exact refs were proven reachable. Phase 1
  branches remain retained through Phase 2 acceptance.

## Phase 2 dispatch

- Task: `AE Maturity Phase 2 — Execution Resume`
- Task ID: `01a039cb-a32a-7952-9c39-330b3c4ec860`
- Worktree: `/Users/joelchan/.codex/worktrees/6ca7/Agentic-Economy`
- Starting ref: `d20d62d8255ee7a38ce7cb8f1c618b1e0393d4e0`
- Launch packet commit: `7c84f8df3` (must be verified as two documentation
  files before cherry-pick).
- Scope: P2-01 through P2-05 plus Phase 2 integration only.
- Acceptance: not yet started; it must be a new task after exact internal handoff.

## Open external evidence carried forward

| Evidence | Owning phase/gate | Progression impact |
|---|---|---|
| Hosted Clerk authorization proof | Later hosted security/production gate | Does not block Phase 2 source |
| Live Convex deletion/reset adapter proof | Later migration/recovery gate | Does not block Phase 2 source |
| Production Principal + Account context wiring | Phase 2 implementation and later hosted proof | Source wiring is Phase 2; hosted proof remains external |

## Next automatic actions

1. Require Phase 2 to freeze and independently challenge the effect-path dominance
   proof before another source repair.
2. Require an exact internally verified Phase 2 ref and clean handoff.
3. Create a new context-independent Phase 2 acceptance task.
4. Independently complete and accept the Phase 3 pre-code architecture package;
   no Phase 3 implementation begins before both design and Phase 2 source acceptance.
5. On `CHANGES_REQUIRED`, return findings to the owning task and commission a new
   acceptance attempt after repair.
6. On source acceptance, freeze Phase 2 learnings and launch dependency-safe Lane
   A, B and bounded C tasks in separate worktrees.
