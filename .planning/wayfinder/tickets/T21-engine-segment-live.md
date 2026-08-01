# T21 — Engine segment live on `/`

Labels: `wayfinder:task` (execution). Status: closed 2026-07-31. Blocked by: [T15](T15-ai-sdk-adoption-gate.md) (closed), [T16](T16-proposal-contract.md) (closed). Informed by: [T17](T17-model-tiering.md), [T18](T18-dialog-ux-prototype.md). Map: [Agent engine](../MAP-engine.md).

## Question

Wire the bounded understand → propose → compare segment into the existing turn orchestrator behind the task-shape gate: predictable asks (exact search, known-offering quote, thread refinement) stay deterministic and zero-model; open-ended goals get the model segment emitting typed proposals the kernel validates and executes against the candidate menu; clarifying questions render per T18's accepted direction; every executed step lands in the thread as evidence. Budgets and ceilings from T16/T17 enforced in the kernel. Done when the destination sentence is true on local/dev: a person lands on `/`, dialogs, and the agent builds a plan/proposal via real tool calls against sandbox + the T20 endpoint — verified live (dev server journey), eval suite green (T19), no regression to the deterministic path.

## Resolution

Resolved 2026-07-31, verified live on local dev (labelled evidence class). The turn orchestrator gates
behind `AE_ENGINE_PROPOSALS`: exact service+location asks stay on the deterministic retrieval path with
zero model requests (asserted live: `dentist near Adelaide` rendered options with zero `/api/answer/turn`
model records); vague/refinement/frozen routes unchanged; open-ended asks enter `proposalTurnPath`.
`/` hands open asks to the inline turn stream (`AeInlineAnswerTurn` reusing `AeThreadTurnStreamSection`;
sessionStorage thread continuity for follow-ups). Live journey proof (`I need my home office set up for
video calls next month`): `plan-contract` event → "Plan ready" card (goal + step "Search for home office
video setup services — Pending") → clarifying question rendered as the agent speaking → complete, no
error; plan + append-only journal persisted in `enginePlans`/`enginePlanEvents` with cost (plan_authored
costUsd ≈ 0.03) and honest outcomes. Budgets/nonce/expiry/DAG/frontier enforced kernel-side.
Hardening found live and fixed at source: role timeout 8s→25s with `TimeoutError` classified as typed
timeout; per-model fail-soft chain (DeepSeek privacy-blocked → GPT → Gemini); **flat transport schema**
(several providers reject `oneOf` — Azure literally, DeepSeek via `require_parameters`) folded back into
the typed union by the kernel; declared-property input schema (strict grammars degenerate free-form
objects to `{}`); kernel input normalization (null/stringified/placeholder fields stripped against the
action's declared keys). Model config: `deepseek/deepseek-v4-flash-0731` primary per founder directive
(currently blocked by the OpenRouter account privacy setting — HITL toggle), GPT-5.4-mini and
Gemini 3.1 Pro fallbacks. Known quality gap for the ask→plan ultraloop: clarifying-question copy is
mechanical and the model sometimes claims inability instead of running its frontier step.
