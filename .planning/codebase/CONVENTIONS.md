# Coding Conventions

**Analysis Date:** 2026-07-18
**Last Mapped Commit:** `3463c1d4`

## Naming Patterns

**Files:**
- Domain modules: kebab-case directories under `src/modules/<domain>/` (e.g. `customer-request`, `capability-supply`, `notification-outbox`).
- Module seams: `public.ts` (external barrel), `<domain>.actions.ts`, `<domain>.functions.ts`, optional `runtime.ts`.
- Implementation: `internal/` for private logic; application slices use kebab-case folders (`provide-facts/`, `problem-route/`, `preparation-egress/`).
- Route-execution machines: kebab-case verbs under `src/modules/customer-request/route-execution/machines/` (`start-or-resume.ts`, `problem-report.ts`, `cancel-current.ts`).
- Convex hosts: camelCase filenames matching the domain (`convex/customerRequestRouteExecution.ts`, `convex/inquiries.ts`).
- Convex ports adapters: `*Ports.ts` factories co-located with the host (`convex/customerRequestRouteExecutionJournalPorts.ts`, `convex/inquirySourceStatePorts.ts`, `convex/inquiryNotificationPorts.ts`).
- Tests: `*.test.ts` / `*.test.tsx` (Vitest); `*.spec.ts` (Playwright e2e/deploy-smoke). Thinness locks use `*-thinness.test.ts`.

**Functions:**
- camelCase for functions and values (`provideCustomerRequestFacts`, `journalMutationPorts`, `reportProblem`).
- Ports factories: `<concern>Ports(ctx)` returning a typed ports object (`journalMutationPorts`, `problemMutationPorts`, `inquirySourceStatePorts`).
- Pure machines: verb phrases without Convex types (`startOrResume`, `leaseNextDispatch`, `reportProblem`).
- Do not export `use`-prefixed helpers from application packages (enforced by thinness tests such as `tests/unit/customer-request/application/provide-facts-thinness.test.ts`).

**Variables:**
- camelCase locals; SCREAMING_SNAKE for constants when shared (`NOW` in tests is fine for fixtures).
- Prefer `readonly` on public command/result types and const arrays of symbols under test.

**Types:**
- PascalCase for types and interfaces (`ProblemMutationPorts`, `ProvideFactsPorts`, `InquirySourceStatePorts`).
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
- Convex host export bodies for ports-wired machines: keep ≤ ~40 lines (locked by journal/problem thinness tests).
- Inquiry `submitPublicInquiry` host block: ≤ 90 lines (`tests/unit/inquiries/convex-host-thinness.test.ts`).
- Ports factory files: inquiry source/notification factories ≤ 80 lines; journal/cancel/problem ports factories ≤ 1000 lines.
- Every `machines/` TypeScript file: ≤ 1000 lines (`machines-thinness.test.ts`).

**Parameters:**
- Pure application/machine functions take explicit `ports` objects (dependency injection), never create Convex `ctx` inside pure modules.
- Prefer small typed input objects over long positional lists for commands.

**Return Values:**
- Return result unions; callers branch on `kind`.
- Hosts re-export Convex function handles; domain returns serializable result types.

## Module Design

**Exports:**
- One public seam per domain (`public.ts`). Application composition uses `src/modules/customer-request/application/public.ts`.
- Machines export through `src/modules/customer-request/route-execution/machines/index.ts`.
- Register cross-surface operations in `src/modules/actions/index.ts` via `<domain>.actions.ts`.

**Barrel Files:**
- Use `public.ts` / `index.ts` for intentional re-exports only.
- Do not create deep re-export chains that bypass private-import rules.

**Layering (prescriptive):**
| Layer | Location | May import | Must not import |
|-------|----------|------------|-----------------|
| Pure domain / machines | `src/modules/...` | other public seams, pure helpers | `convex/_generated`, `MutationCtx`, `Doc`, `ctx.db` |
| Ports types | `machines/*-ports.ts`, `internal/ledger/ports.ts` | domain types | Convex runtime, `WritePlan` |
| Ports adapters | `convex/*Ports.ts` | `_generated`, `ctx.db` | multi-step domain decisions that belong in machines |
| Convex host | `convex/<domain>.ts` | ports factories + module public | large inline DB orchestration / redefined moved helpers |
| Journal / problem-support | `route-execution/journal`, `problem-support` | pure helpers | `JournalMutationPorts` / machines |

**Thin host + ports pattern (required for deepenings):**
1. Host export wires `*Ports(ctx)` and calls `*Machine` / application function.
2. Machine/application owns decisions; calls `ports.*` for IO.
3. Ports adapter owns DB/scheduler IO only.
4. Do not invent sibling Convex hosts (`customerRequestRouteExecutionStart.ts`, `…Cancel.ts`, `…Problem.ts`) — thinness tests assert these files do not exist.
5. Do not introduce `WritePlan` / `intendedPatches` DTOs in machines or journal (forbidden by `machines-thinness` / `journal-thinness`).

**Schema:**
- Add tables in the owning module’s schema fragment (`internal/schema.ts` or `internal/convex-schema.ts`), then spread in `convex/schema.ts`.
- Index names: `by_field1_and_field2` in field order.

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

*Convention analysis: 2026-07-18 (commit `3463c1d4`)*
