# T14 — Effect metadata on every registered action

Labels: `wayfinder:task` (AFK). Status: closed 2026-07-31. Map: [Agent engine](../MAP-engine.md).

## Question

Extend the registered-action contract (`src/modules/common/action.ts`) so every action declares effect metadata per the authority review (`.planning/research/2026-07-31-agent-engine-authority.md`, seam step 1): effect class (observation / comparison-quote / disclosure / commitment / payment / external state change), reversibility, recipient kind, data classifications, spend exposure, approval requirement. Vocabulary informed by oh-my-pi's descriptor metadata (effect tier, deferrable, concurrency, interruptible — `2026-07-31-eval-stack-bet.md`). Migrate all ~25 registered actions; registry tests assert every action carries metadata and read-only actions cannot declare effects. This is registry surgery within the existing contract seam — no new module, no behavior change to hosts.

## Resolution

Resolved 2026-07-31. `ActionEffectMetadata` added to the invocation contract in
`src/modules/common/action.ts` (`ActionEffectClass` union: observation / comparison_quote /
disclosure / commitment / payment / external_state_change; plus reversibility, recipientKind,
dataClasses, spendExposure, approval). All registered actions migrated in place; `describeActionForAgent`
projects `effect`. Registry tests (`tests/unit/actions/registry.test.ts`) assert every action declares
effect metadata, read-only actions are non-consequent (`spendExposure: 'none'`), and the internal
answer-thread surface exposes exactly `registry.search`, `registry.detail`, `sandbox.checkup_quote`.
Evidence: focused vitest + typecheck, 2026-07-31.
