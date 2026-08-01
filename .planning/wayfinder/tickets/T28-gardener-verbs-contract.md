# T28 — Gardener verbs replace the one-shot plan proposal

Labels: `wayfinder:task` (AFK). Map: [Framework](../MAP-framework.md). Blocked by: [T26](T26-node-contract-and-rollup-algebra.md).

## Question

Implement the incremental proposal contract: model emits only `elaborate(node)`, `study(node)`,
`propose_decision(node)` as typed proposals; kernel validates against the tree (menus, budgets,
generation fences, fog rules) and applies. Rolling-wave: elaboration only at the frontier; fog is a
first-class state. Adversarial-gate suite (hostile/replayed/cyclic) ports from the T15/T16 lineage.
Adopt-first rule applies — name libraries before hand-rolling anything beyond integration.

## Resolution

(pending)

## Named adopted libraries (adopt-first rule)

Source: [donor hunt](../../research/2026-08-01-framework-kernel-donor-hunt.md), 2026-08-01.
**No new dependency is required for this ticket** — everything is already installed.

- **ADOPTED** `ai@7.0.44` + `zod@4.4.3` — `z.discriminatedUnion('kind', [...])` over the three verbs,
  emitted via `generateText({ output: Output.object({ schema }) })` (`generateObject` is deprecated in
  the installed declarations). `src/modules/plan-proposal/internal/model-transport.ts` is the pattern
  to copy — it already validates and semantically gates.
- **ADOPTED** `@convex-dev/workflow@0.4.4` — durable decision waits via `awaitEvent`
  (`created→waiting`, `sent→consumed`); its own `generationNumber` fence
  (`getWorkflow(ctx, id, expectedGenerationNumber)`) is the pattern for ours.
- **ADOPTED** Convex OCC — serializable mutations, read-set validation, deterministic retry.
- **ADOPT (optional)** `immer` — `enablePatches()` + `produceWithPatches`/`applyPatches` if we want
  mechanical patch application beneath the typed verbs. Rejected: `fast-json-patch` (frozen 2022),
  `rfc6902` (no LICENSE file; partial in-place mutation).
- **VENDOR** Task Master AI (MIT): `expand-task.js` `expandTask(...)` is `elaborate` with an
  elaboration budget (`complexityScore`, `recommendedSubtasks`, `expansionPrompt`);
  `add-subtask.js` for validated parent/child mutation. Replace its file I/O with Convex mutations.

Pipeline: `Output.object`/Zod → Convex `v` args + Zod reparse → tree validation (verb allowlist,
target/parent/cycle/depth/op-count caps, status transitions) → one mutation comparing
`expectedGeneration`/`expectedRevision` + proposal digest → apply → journal + receipt atomically.

**Recorded adoption-search failure (legitimate hand-roll):** `study` and `propose_decision`
semantics, the fog/rolling-wave lifecycle, semantic fencing of stale model proposals (Convex OCC
fences *data* races, not *semantic* staleness), and the adversarial hostile/replayed/cyclic suite —
no OSS agent-proposal verifier exists. Nearest test donors: `rfc6902/test/json-patch-tests.ts`,
fast-json-patch prototype-pollution cases, Immer `tests/patch.js`.
