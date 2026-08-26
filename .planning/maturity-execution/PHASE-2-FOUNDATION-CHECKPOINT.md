# Phase 2 authority-foundation stop-line checkpoint

This is a preservation checkpoint, not Phase 2 internal acceptance or maturity
evidence. The root stop-line ended this task after the active foundation-node
verifier. No 298-registration migration leaf was dispatched after the stop-line.

## Exact refs

- Branch: `codex/ae-maturity-phase-2`
- Accepted Phase 1 source: `ae284871d9d5bad40245182aefd6f2050d53b556`
- Phase 1 handoff: `d20d62d8255ee7a38ce7cb8f1c618b1e0393d4e0`
- Phase 2 clean preflight: `3d97bb1a9a12916aef1ed0237f789ec03b750ffb`
- Committed authority-entry inventory base: `85486e84fb46c775c64b177f9ddd85d76146bc11`
- Foundation verdict/evidence commit: `6a56ae64794362a0f387102884112bbaffdda363`
- Preserved partial-source candidate: `a0ced993c729738ef6833b0291f4d9502f9481af`
- This handoff is evidence-only over `a0ced993c`; the final evidence commit is the
  commit containing this file.

## Completed foundation outcomes

- The deterministic inventory/classification gate remains green: 298 Convex
  registrations across 52 production files (119 public, 172 internal, seven
  HTTP; 208 ordinary, 90 Generic), with zero unresolved or duplicate identities.
  The 242 runtime-surface namespace and 39 HTTP / 14 MCP / 12 CLI edge inventories
  remain frozen. Semantic-input reconciliation changed only the two planning-file
  digests and dependent contract digests; counts, rows and surfaces did not change.
- The Start production build/dispatcher source repair passes on Node 22.22.0 with
  Vite 8.2.2: a fresh build loads the real generated handler, preserves Clerk
  middleware, rejects missing/invalid credentials, and emits
  `START_BUILT_DISPATCHER_PASS`. Genuine positive Clerk-issued identity execution
  remains assigned to hosted gate P9-01.
- The registrar foundation provides literal protected/public/narrow-system/dev
  modes and actual-reference tests. Its focused production registrar coverage is
  100% statements/branches/functions/lines (`62/62`, `2/2`, `28/28`, `62/62`).
- The exact hostile checker currently passes two files and 9/9 tests with
  `safe=6 unsafe=24 diagnostics=26`. It now requires exact diagnostic identity,
  capability and target for every listed fixture; raw-registrar diagnostics cannot
  stand in for protected-seam evidence.
- `npm run typecheck`, imports (29/29), TypeScript standards (1/1), Convex codegen
  dry-run and actual codegen, the SSRF drift test (1/1), formatting, oxlint and
  diff checks passed on the checkpoint bytes. Generated API change is limited to
  the new `lib/authorityRegistrars` module entry.
- Durable learning was deduplicated into AE-PAP-002: exact semantic diagnostics per
  hostile fixture, and a fail-closed supported-syntax grammar instead of iterative
  alias/dataflow inference.

## Truthful verifier result and open foundation gates

The fresh read-only verifier verdict is `FAIL`, independently verifying 2/6 node
outcomes (inventory/provenance and Start dispatcher). Implementation authorization
is `WITHHELD`.

- Protected `const { db } = ctx; await db.insert(...)` emits no authority-entry
  diagnostic, contrary to the documented unsupported-syntax grammar.
- Aggregate-object registrar selection (`const modes = { protectedInteractiveMutation,
  narrowSystemMutation }; const selected = modes[key]`) emits no diagnostic,
  contrary to literal category selection.
- The load-bearing ESLint rule is below the literal 100% changed-path gate:
  83.64% statements, 74.08% branches, 100% functions and 87.56% lines under the
  recorded focused Istanbul run.
- The foundation leaf is therefore 3/8 met; G3, G4, G5, G7 and G8 are unchecked.
  The Start leaf is 8/8 met. The node ledger intentionally remains only 1/6 checked;
  G2 through G6 were not checked or weakened at the stop-line.

## Remaining frozen Phase 2 scope

- No authority-entry migration across the 298 registrations / 242 runtime surfaces
  was dispatched. Every protected surface still requires its declared registrar,
  capability/target closure, actual registered-handler evidence and seven-shape
  denial/isolation proof; every exemption requires hostile runtime proof.
- Cross-surface authorization P2-02 and recovery/isolation P2-05 are not internally
  accepted. Connections, secret/JIT/provider-consequence and other preserved source
  edits remain partial checkpoint material, not accepted leaves or phase evidence.
- No cross-leaf integration close, generated 242-surface denial/isolation matrix,
  exact clean/hermetic `npm run test:release:source`, zero-ABANDON close, or final
  Phase 2 housekeeping/acceptance gate was run after this checkpoint.
- Hosted/external evidence remains separate. In particular, positive end-to-end
  Clerk session/token execution requires a development instance and remains P9-01;
  no locally forged Clerk token was introduced.
- The post-Phase-2 canonical operator-console/product-operability rebaseline remains
  AE-PAP-024 in root history `22f4930ec`; it was not cherry-picked and no UI scope
  was added here.
- The child goal display remains stale per AE-PAP-015. This task does not claim the
  child goal ledger is healthy and does not mark the original Phase 2 objective
  complete; the root manager owns goal-state disposition and fresh rebaseline.

## Preserved changed-file inventory from `85486e84f`

Planning/evidence/contracts:

- `.planning/maturity-execution/PHASE-2-AUTHORITY-ENTRY-MIGRATION.md`
- `.planning/maturity-execution/PHASE-2-AUTHORITY-FOUNDATION-VERIFICATION.md`
- `.planning/maturity-execution/PHASE-2-FOUNDATION-CHECKPOINT.md`
- `.planning/maturity-execution/PHASE-2-LEARNINGS.md`
- `.planning/maturity-execution/PHASE-2-RUNTIME-DOMINANCE-DESIGN.md`
- `.planning/maturity-execution/PHASE-2-START-BUILT-DISPATCHER-EVIDENCE.md`
- `.planning/maturity-execution/PROGRAM-PAPERCUTS.md`
- `.planning/maturity-execution/contracts/phase-2-convex-registration-classifications.json`
- `.planning/maturity-execution/contracts/phase-2-convex-registration-migration.json`
- `.planning/maturity-execution/gates/node-P2-authority-foundation.md`
- `.planning/maturity-execution/gates/repair-P2-authority-entry-foundation.md`
- `.planning/maturity-execution/gates/repair-P2-authority-entry-start-bundle.md`

Foundation/config/generated/test/tooling:

- `convex/lib/authorityRegistrars.ts`
- `convex/_generated/api.d.ts`
- `eslint.config.mjs`
- `package.json`, `package-lock.json`, `tsconfig.json`
- all 30 files under `tests/fixtures/phase-2-authority-entry-foundation/`
- `tests/maturity/phase-2-authority-entry-eslint.test.ts`
- `tests/maturity/phase-2-authority-entry-foundation.test.ts`
- `tests/maturity/phase-2-start-built-dispatcher.test.ts`
- `tools/eslint-rules/phase-2-authority-entry.mjs`
- `tools/eslint-rules/phase-2-authority-entry.d.mts`
- `tools/eslint-rules/run-phase-2-authority-entry.mjs`
- `tools/eslint-rules/run-phase-2-authority-entry.d.mts`
- `tools/maturity/phase-2-start-built-dispatcher.mjs`

Preserved partial source, committed without an acceptance claim:

- `convex/agentAccessPrincipals.ts`
- `convex/capabilityOperationInvocations.ts`
- `convex/capabilityProviderConsequenceJournal.ts`
- `convex/catalogOfferingMutations.ts`
- `convex/chatGenerate.ts`
- `convex/interactiveAuthority.ts`
- `convex/lib/canonicalAgentAuthority.ts`
- `convex/providerConsequenceHttp.ts`
- `convex/recoveryBreakGlass.ts`
- `convex/secretLifecycleHttp.ts`
- `convex/workloadCron.ts`
- `src/modules/capability-execution/invocation-worker/jitProviderConsequence.ts`
- `src/modules/capability-execution/invocation-worker/providerConsequenceBridge.ts`
- `src/modules/secrets/infisical-cloud.ts`
- `src/modules/secrets/vercel-oidc.ts`
- `src/routes/api.internal.provider-consequence.ts`
- `src/routes/api.internal.secret-lifecycle.ts`

The preservation commit's staged React Doctor hook reported six warnings (one bug
hypothesis and five performance hypotheses, score 89/100). They were not repaired
or suppressed under the stop-line and remain fresh-review input, not established
defects or green evidence.

## Housekeeping and retained evidence

- The generated `.vercel/` build directory is regenerable scratch and is removed
  before this handoff closes.
- Ignored `output/` is retained because it contains the Phase 2 leaf/driver coverage,
  verifier and release-result artifacts used by the preserved evidence ledger. It
  is not source and must be freshness-reviewed before reuse.
- Detached worktree `/private/tmp/ae-p2-tanstack-probe.9fsKdm` at
  `787396e15b1d7c3e769b00843d3bcc8326e80d19` is retained solely as the exact pre-fix
  Start/Rolldown regression artifact. Remove it with reviewed `git worktree remove`
  only after a fresh assessor decides the committed evidence is sufficient.
- Other root-owned worktrees are outside this task and were not modified or removed.
- Final tracked worktree status must be clean on `codex/ae-maturity-phase-2`.

## Required next action

Create a fresh assessment/rebaseline task. It must start from the exact candidate
and evidence refs above, preserve every unchecked gate and partial source edit,
decide whether the structural rule remains viable under the supported-syntax and
100% coverage requirements, and only then decide whether any migration work should
resume. It must not infer Phase 2 maturity from this checkpoint.
