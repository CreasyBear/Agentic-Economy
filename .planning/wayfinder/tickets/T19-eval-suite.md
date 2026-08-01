# T19 — Eval suite: scripted asks with pass^k, latency, and cost in CI

Labels: `wayfinder:task` (AFK). Status: closed 2026-07-31 (production-seam mock mode; real-model run and pass^k table remain open follow-ups). Blocked by: [T16](T16-proposal-contract.md) (closed). Map: [Agent engine](../MAP-engine.md).

## Question

Extend the existing eval harness (`tests/eval/`, OpenRouter contract server) into an engine eval suite: ~20 scripted asks over seeded supply (clear asks, vague asks, no-supply asks, refinements, adversarial proposals) scoring pass^k (k≥4), action count per task, latency, and cost per turn, runnable in CI with mock model contracts and locally against a real model. Gate rule from the verdict: a model segment that cannot beat the deterministic path on its slice does not ship. This is the discipline every literature source agreed on — build it before T21 lands, not after.

## Resolution

Resolved 2026-07-31. `eval/engine/` runs 20 scripted asks (6 clear / 6 plan / 3 vague / 2 no-supply /
3 adversarial) through production seams: real `streamAnswerTurn`, registry action runner, proposal
kernel, and a Convex-shaped plan/event store port, with a local OpenRouter-compatible transport and
labelled sandbox supply. Scores are replayed from persisted `enginePlanEvents`, not fixtures: clear
cases assert zero observed model calls, no-supply cases assert the persisted typed
`failureReason: no_supply`, plan cases replay metrics/protocol/budgets, adversarial cases assert kernel
refusal reasons. Report (`output/eval/engine-suite-report.json`, `engine-eval-suite-report:v1`) carries
status/planId/revisionCount/modelCalls/costUsd/wallMs/evidence labels and observed p95 role latency.
CI entry: `npm run test:eval:engine` (green 20/20, modelCalls 29, p95 proposal latency ~4ms).
Follow-ups deliberately open: pass^k (k≥4) repetition table and a real-model local run attached here.
