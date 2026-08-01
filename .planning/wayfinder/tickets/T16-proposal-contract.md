# T16 — Proposal contract, candidate menus, and Phase-1 plan persistence

Labels: `wayfinder:task` (AFK). Status: closed 2026-07-31. Blocked by: [T14](T14-effect-metadata.md) (closed). Map: [Agent engine](../MAP-engine.md).

## Question

Design (decision-complete, then build) the typed proposal seam: zod contract for model outputs (`plan`, `next_action_proposal`, `clarifying_question`, `recommendation`, rationale), the kernel-side candidate-menu derivation (≤ ~7 actions per segment, filtered by effect metadata + stage), budget/stop rules per segment (turns, tokens, wall-clock), the SoftToolRequirement-style escalation (reminder → bounded escalation → forced proposal, harvested from oh-my-pi), and where Phase-1 plans persist — decide whether existing `answerTurns`/thread tables suffice or a `plans` table is needed now (workflow component stays fog). Validation lives in the kernel: schema parse, menu membership, budget, digest binding. Output: the contract shipped in source with unit tests; a one-page design note in the ticket resolution.

## Resolution

Resolved 2026-07-31. Typed proposal union (`plan_revision` / `next_action` / `clarifying_question` /
`recommendation`, each with rationale) shipped in `src/modules/plan-proposal/public.ts` with zod
contracts; kernel-side candidate menu (`buildCandidateMenu`: ≤7 actions, effect-class + stage filtered)
and per-turn protocol (plan revision + ≤`MAX_ACTIONS_PER_TURN`(4) actions + one terminal proposal;
`TURN_COST_CEILING_USD` fail-closed with per-call reserve) live in the kernel, never the model module.
Plans persist in dedicated Convex tables `enginePlans`/`enginePlanEvents`
(`src/modules/plan-proposal/internal/convex-schema.ts`, `convex/enginePlans.ts`) — Customer Request V2
discipline: revision lineage + digests + append-only events, revision fencing (`expectedRevision`),
operationKey idempotency, 15-minute expiry enforced at execution time, and reads scoped to the owning
pseudonymous session. Validation in kernel: schema parse, nonce, menu membership, input schema, DAG
acyclicity, frontier order, budgets. Tests: `tests/unit/plan-proposal/*`, `convex/enginePlans.test.ts`.
