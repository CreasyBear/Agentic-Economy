# T15 — Adopt AI SDK v7 + OpenRouter provider v3 behind the adversarial gate

Labels: `wayfinder:task` (AFK). Status: closed 2026-07-31. Map: [Agent engine](../MAP-engine.md).

## Question

Add `ai` (v7) + `@openrouter/ai-sdk-provider` (v3) as the model transport/typed-output seam ONLY (no ToolLoopAgent, no tools argument, no AI SDK UI streams — `2026-07-31-eval-stack-bet.md`). Wrap in a thin module-owned client beside the existing hand-rolled OpenRouter client. **Gate: the falsifiable pre-commit check must pass first** — a hostile mock model emits a schema-valid disclosure/write proposal with a stale/mutated digest, then replays it; the kernel must refuse before dispatch (zero provider/action/effect calls), reject the duplicate idempotently, and the deterministic refinement path must stay zero-model. If the check cannot pass cheaply, fall back to extending the hand-rolled client (option B) and record that here. Contract-test the new seam against a JSON-schema response fixture like the existing OpenRouter contract server.

## Resolution

Resolved 2026-07-31, option A. `ai` v7 + `@openrouter/ai-sdk-provider` v3 adopted as the typed-output
transport seam only, wrapped in `src/modules/plan-proposal/internal/model-transport.ts`
(`requestProposalModel`: generateText + zod schema output, typed `timeout` / `invalid_response` /
`provider_error` failures, mandatory provider cost metadata — missing cost fails the budget closed).
No ToolLoopAgent, no tools argument, no AI SDK UI streams. Adversarial gate passes: hostile
schema-valid proposals with non-menu actions, cyclic DAGs, and replayed nonces are refused by
`validateProposalAgainstKernel` before any dispatch (typed reasons `proposal_action_not_in_menu`,
`proposal_plan_cyclic`, `proposal_nonce_mismatch`), duplicates are idempotently rejected, and the
deterministic refinement path stays zero-model (asserted in `tests/unit/answer-thread/proposal-turn.test.ts`
and the engine eval clear cases). Contract tests: `tests/unit/plan-proposal/model-transport.test.ts`,
`proposal-contract.test.ts`.
