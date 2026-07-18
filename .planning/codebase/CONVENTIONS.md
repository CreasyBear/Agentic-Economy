# Coding Conventions

**Analysis Date:** 2026-07-18
**Last Mapped Commit:** `9d8faa04`

## Naming Patterns

**Files:**
- Domain modules: kebab-case directories under `src/modules/<domain>/` (e.g. `customer-request`, `capability-supply`, `notification-outbox`).
- Module seams: `public.ts` (external barrel), `<domain>.actions.ts`, `<domain>.functions.ts`, optional `runtime.ts`.
- Implementation: `internal/` for private logic; application slices use kebab-case folders (`provide-facts/`, `problem-route/`, `preparation-egress/`).
- Route-execution machines: kebab-case verbs under `src/modules/customer-request/route-execution/machines/` (`start-or-resume.ts`, `problem-report.ts`, `open-leased-dispatch.ts`, `mark-accepted.ts`).
- V2 write machines: kebab-case under `src/modules/customer-request/v2-write/` (`commit-aggregate.ts`, `refresh-route-plan-generation.ts`, `record-route-plan-generation-retry.ts`).
- Evidence-load pure package: `src/modules/customer-request/route-execution/evidence-load/`.
- Convex hosts: camelCase filenames matching the domain (`convex/customerRequestRouteExecution.ts`, `convex/customerRequestV2.ts`, `convex/inquiries.ts`).
- Convex ports adapters: `*Ports.ts` factories co-located with the host (`convex/customerRequestRouteExecutionJournalPorts.ts`, `convex/customerRequestRouteExecutionDispatchPorts.ts`, `convex/customerRequestV2WritePorts.ts`, `convex/customerRequestEvidenceLoadPorts.ts`, `convex/inquirySourceStatePorts.ts`).
- Tests: `*.test.ts` / `*.test.tsx` (Vitest); `*.spec.ts` (Playwright e2e/deploy-smoke). Thinness locks use `*-thinness.test.ts`.

**Functions:**
- camelCase for functions and values (`provideCustomerRequestFacts`, `journalMutationPorts`, `dispatchLifecyclePorts`, `customerRequestV2WritePorts`, `reportProblem`).
- Ports factories: `<concern>Ports(ctx)` returning a typed ports object (`journalMutationPorts`, `problemMutationPorts`, `problemSupportReadPorts`, `dispatchLifecycleOpenPorts`, `evidenceLoadPorts`).
- Pure machines: verb phrases without Convex types (`startOrResume`, `leaseNextDispatch`, `openLeasedDispatch`, `commitAggregate`).
- Do not export `use`-prefixed helpers from application packages (enforced by thinness tests such as `tests/unit/customer-request/application/provide-facts-thinness.test.ts`).

**Variables:**
- camelCase locals; SCREAMING_SNAKE for constants when shared (`NOW` in tests is fine for fixtures).
- Prefer `readonly` on public command/result types and const arrays of symbols under test.

**Types:**
- PascalCase for types and interfaces (`ProblemMutationPorts`, `DispatchLifecyclePorts`, `CustomerRequestV2WritePorts`, `ProvideFactsPorts`, `EvidenceLoadPorts`).
- Discriminated unions with `kind` (or equivalent) for results; exhaust with `const exhaustive: never = …` / `const _exhaustive: never = …` in `default` (see `src/modules/customer-request/application/preparation-egress/project.ts`, `src/modules/customer-request/application/route-plan-projection/project-run.ts`).
- Prefer `type` aliases for ports and command/result shapes; keep Convex `Doc` / `MutationCtx` out of pure modules.

## Code Style

**Formatting:**
- No Prettier config detected; rely on editor defaults plus TypeScript/`oxlint`.
- Prefer single quotes and no semicolons in existing TS (match neighboring files).
- Keep imports at the top of the module — no inline imports in function bodies (workspace rule).

**Linting:**
- Tool: `oxlint` via `npm run lint` (`oxlint src convex tests tools examples --deny-warnings`).
- Config: `.oxlintrc.json` — `correctness` as error; `suspicious` off; plugins `typescript` + `oxc`.
- Ignores: `convex/_generated/**`, `tests/fixtures/**`, `vendor/**`.
- TypeScript strictness is the stronger gate: `strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `useUnknownInCatchVariables`, `noImplicitOverride` in `tsconfig.json`.

**TypeScript standards (enforced by tests):**
- Run `npm run test:ts-standards` — `tests/imports/ts-standards.test.ts` scans for `explicit-any`, `non-null-assertion`, `convex-any-validator`, `broad-status-string`, `hard-coded-source-csrf`, `client-exposed-source-write-secret` via `scanTypeScriptStandards` in `@/lib/ui/contract-scans`.
- Prefer typed results over `any`; avoid non-null assertions (`!`).

## Import Organization

**Order (observed):**
1. Node built-ins (`node:fs`, `node:path`) when needed.
2. External packages (`vitest`, `convex/server`, `zod`, `@astryxdesign/*`).
3. Path-alias imports from `@/…` (and `~/…` as alias for `src/*`).
4. Relative imports within the same package (`./`, `../`).
5. `import type` for type-only dependencies.

**Path Aliases:**
- `@/*` → `./src/*`
- `~/*` → `./src/*`
- Special route remaps for operator surfaces in `tsconfig.json` (`@/routes/owner.*`, etc.).

**Module boundaries (mandatory):**
- Outside a module, import only `src/modules/<domain>/public.ts` (or documented public sub-barrels such as `application/public.ts`).
- Never import `src/modules/<domain>/internal/*` from routes, Convex hosts, or sibling modules — `tests/imports/private-imports.test.ts` enforces `module-private-import`.
- Convex hosts may import module public seams and co-located `*Ports.ts` files; pure domain code must not import `convex/_generated` or `convex/server`.
- Application callers must not import V2 write machines or construct `customerRequestV2WritePorts` — they continue to `ctx.runMutation(internal.customerRequestV2.*)` (ADR-014).

**Public barrel pattern:**
```typescript
// src/modules/<domain>/public.ts
import { submitInquiry as submitInquiryImpl } from './internal/commands'
export const submitInquiry = submitInquiryImpl
export type { SubmitInquiryCommand, SubmitInquiryResult } from './internal/commands'
```

## Error Handling

**Patterns:**
- Domain results as discriminated unions (`kind: 'ok' | 'refused' | 'conflict' | …`), not thrown exceptions for expected control flow.
- Convex actions/mutations: validate args with Convex `v.*` validators at the host; refuse overclaims in action `boundaries` (see `src/modules/common/action.ts` / `<domain>.actions.ts`).
- Exhaustive switches over unions — assign to `never` in `default` so new variants fail compile-time.

**Do not:**
- Swallow failures with empty `catch` without a typed refuse/error path.
- Leak Convex `Doc` shapes or raw DB errors through public module seams.

## Logging

**Framework:** Product observability uses Sentry (`@sentry/node`, `@sentry/react`) and PostHog (`posthog-js` / `posthog-node`). Unit/domain code generally does not `console.log`.

**Patterns:**
- Prefer structured audit/event helpers under `src/modules/observability/` for business actions.
- Redact sensitive fields before any log or notification payload (inquiry notification path uses redacted payload JSON).

## Comments

**When to Comment:**
- Module/public barrels may carry a short contract note (e.g. `src/modules/customer-request/application/public.ts` documents Convex vs application split and ADR references).
- Prefer self-explanatory names over narrating what the next line does.
- Document authority/boundary intent on actions (`summary`, `boundaries`), not inline TODOs for product claims.

**JSDoc/TSDoc:**
- Sparse; use when a public export’s invariants are not obvious from the type alone.

## Function Design

**Size:**
- Convex host export bodies for ports-wired machines: keep ≤ ~40 lines (locked by journal / problem / dispatch / v2-write thinness tests).
- Inquiry `submitPublicInquiry` host block: ≤ 90 lines (`tests/unit/inquiries/convex-host-thinness.test.ts`).
- Provide-facts action body: ≤ 30 lines; refine / authorize-preparation: ≤ 35 lines.
- Support-read query (`exportProblemForSupport`): ≤ 50 lines.
- Evidence export query (`exportCustomerEvidence`): ≤ 120 lines.
- Ports factory files: inquiry source/notification and evidence-load factories ≤ 80 lines; route-execution journal/cancel/dispatch/problem and V2 write ports factories ≤ **1000** lines (campaign ~1k ceiling).
- Every `machines/` TypeScript file and every `v2-write/` file: ≤ 1000 lines.

**Parameters:**
- Pure application/machine functions take explicit `ports` objects (dependency injection), never create Convex `ctx` inside pure modules.
- Prefer small typed input objects over long positional lists for commands.

**Return Values:**
- Return result unions; callers branch on `kind`.
- Hosts re-export Convex function handles; domain returns serializable result types.
- Ports expose **semantic, immediately executed** operations — never return a deferred `WritePlan` / `intendedPatches` for the host to apply (ADR-011–014).

## Module Design

**Exports:**
- One public seam per domain (`public.ts`). Application composition uses `src/modules/customer-request/application/public.ts`.
- Machines export through `src/modules/customer-request/route-execution/machines/index.ts`.
- V2 write machines export through `src/modules/customer-request/v2-write/index.ts` (imported by `convex/customerRequestV2.ts` only).
- Register cross-surface operations in `src/modules/actions/index.ts` via `<domain>.actions.ts`.

**Barrel Files:**
- Use `public.ts` / `index.ts` for intentional re-exports only.
- Do not create deep re-export chains that bypass private-import rules.

**Layering (prescriptive):**
| Layer | Location | May import | Must not import |
|-------|----------|------------|-----------------|
| Pure domain / machines | `src/modules/...` | other public seams, pure helpers | `convex/_generated`, `MutationCtx`, `Doc`, `ctx.db`, `WritePlan` |
| Ports types | `machines/*-ports.ts`, `v2-write/ports.ts`, `internal/ledger/ports.ts` | domain types | Convex runtime, `WritePlan` |
| Ports adapters | `convex/*Ports.ts` | `_generated`, `ctx.db` | multi-step domain decisions that belong in machines |
| Convex host | `convex/<domain>.ts` | ports factories + module public | large inline DB orchestration / redefined moved helpers |
| Journal / problem-support / evidence-load | `route-execution/journal`, `problem-support`, `evidence-load` | pure helpers | mutation port types / machines (journal); machines / `ProblemMutationPorts` / `ProblemSupportReadPorts` (problem-support) |

## Locked deepen practices (Waves 38–42 / ADR-011–014)

These are **hard bans**, not style preferences. Thinness suites enforce them.

1. **No `WritePlan` / `intendedPatches` in journal, machines, or v2-write**
   - Forbidden tokens: `WritePlan`, `writePlan`, `intendedPatches`, and patch-array apply DTOs in pure packages and ports adapters for those families.
   - Ports call semantic commits (`persistSucceededAttempt`, `commitMarkDispatched`, `commitAggregate` IO helpers) that run immediately inside the same `MutationCtx` transaction.

2. **No Convex sibling chops**
   - Do not invent mutation-host siblings such as `convex/customerRequestRouteExecutionStart.ts`, `…Cancel.ts`, `…Problem.ts`, `…Dispatch.ts`, `…Recover.ts`, `…Mark.ts`, `customerRequestV2Commit.ts`, `customerRequestV2Refresh.ts`, `customerRequestV2Write.ts`.
   - Allowed Convex growth: thin `*Ports.ts` adapters beside the existing host register. Host export identities stay on the original file.

3. **Ports adapter ceiling ~1k lines**
   - Journal / Cancel / Dispatch / Problem / V2 write adapters: `<= 1000` lines.
   - Evidence-load and inquiry source/notification factories: tighter (`<= 80`).
   - If an adapter approaches 1k mid-wave, split **within the same family ADR** (e.g. read helpers under the same ports concern) — do not open an unrelated deepen or grow a foreign ports file.

4. **Validators stay in Convex forever**
   - All `v.*` argument/return validators for deepened exports remain on the host (`convex/customerRequestRouteExecution.ts`, `convex/customerRequestV2.ts`, etc.).
   - Host-local parse helpers that feed validators (`parseBoundedJson`, `exportedStepState`) may remain host-side.
   - Do not relocate validators into `src/modules`.

5. **Family isolation**
   - Do not grow Journal/Cancel/Problem ports to absorb Dispatch lifecycle or V2 write commits.
   - Do not grow route-execution ports to absorb `commitAggregate` / V2 graph validation.
   - Problem support-read ports live on the Problem ports adapter (`problemSupportReadPorts`), not Journal/Cancel/Dispatch.

**Thin host + ports pattern (required for deepenings):**
1. Host export keeps validators; wires `*Ports(ctx)` and calls `*Machine` / application function.
2. Machine/application owns decisions; calls `ports.*` for IO.
3. Ports adapter owns DB/scheduler IO only.
4. Add/extend `*-thinness.test.ts` locking the above.
5. Application / HTTP callers keep calling the same Convex export paths.

**Schema:**
- Add tables in the owning module’s schema fragment (`internal/schema.ts` or `internal/convex-schema.ts`), then spread in `convex/schema.ts` (`ae-convex-guardrails`).
- Index names: `by_field1_and_field2` in field order.
- Never store unbounded arrays in a document — give high-churn children their own table.

**UI:**
- Prefer Astryx (`@astryxdesign/core`, `@astryxdesign/theme-neutral`); Tailwind 4 for layout glue only.
- Do not extend bespoke `Ae*` presentation components or resurrect Daylight brand assets (`DESIGN.md` / `ae-design-system` skill).

**Copy / claims:**
- Public and assistant-visible copy must stay boundary-honest — no booking/charge/dispatch overclaims (`ae-public-copy-guardrails`, `npm run test:copy`).

## Exhaustive Unions

When switching on a discriminated union or enum, always handle every variant and end with:

```typescript
default: {
  const exhaustive: never = value
  return exhaustive
}
```

New variants must fail TypeScript until handled.

---

*Convention analysis: 2026-07-18 (commit `9d8faa04`)*
