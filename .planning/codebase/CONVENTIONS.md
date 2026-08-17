# Coding Conventions

**Analysis Date:** 2026-08-17

## Naming Patterns

**Files:**
- kebab-case for all TypeScript modules (`operation-invoke-contracts.ts`, `route-plan-projection.ts`)
- Domain modules live under `src/modules/<module-name>/` with hyphenated names (`capability-execution`, `answer-thread`, `customer-request`)
- Route files follow TanStack Router conventions in `src/routes/`: `api.v1.requests.$requestRef.ts`, `$slug.tsx`, `_operator/owner.status.tsx`, `robots[.]txt.ts`
- Convex backend files in `convex/` use camelCase filenames (`agentAccessPolicy.ts`, `capabilityOperationInvocationWorker.ts`)
- Suffix conventions within modules:
  - `public.ts` — module public seam (re-exports only)
  - `*.functions.ts` — Convex/server function wrappers and domain orchestration (`answer-thread.functions.ts`, `operation-execute.functions.ts`)
  - `*.actions.ts` — action/MCP/host adapters (`operation-execute.actions.ts`, `customer-request.actions.ts`)
  - `internal/` — private implementation not imported by routes or other modules
  - `*-contracts.ts` — shared DTO/result unions (`operation-invoke-contracts.ts`, `projection-contracts.ts`)
  - `convex-schema.ts` or `schema.ts` — module-owned Convex table definitions
- React components: PascalCase with `Ae` prefix in `src/components/ae/` (`AeServiceList.tsx`, `AePaidOperationCard.tsx`)
- React hooks: camelCase with `use` prefix (`use-answer-turn-lifecycle.ts`, `useErrorShake.ts`)
- Tests: `*.test.ts` / `*.test.tsx` in separate `tests/` tree (not co-located with source)
- Tools/CLI: `tools/ae/commands/invoke.ts`, `tools/release/operation-gateway-production-smoke.ts`

**Functions:**
- camelCase for all functions (`createAgentAccessGrant`, `normalizeClientError`, `buildPublicThreadProjection`)
- No `async` prefix; async is indicated by return type only
- Factory/builder helpers use `create*`, `build*`, `materialize*` prefixes
- Port installers for tests: `installAnswerThreadTestPort`, `createAnswerThreadTestStore`
- Event handlers in React: implicit via props, not `handle*` convention enforced repo-wide

**Variables:**
- camelCase for variables and parameters
- UPPER_SNAKE_CASE for true constants (`ANSWER_TURN_EXECUTION_LEASE_MS`, `SERVICE_KEY` in tests)
- No underscore prefix for private members; privacy is enforced by module boundaries and `internal/` folders
- `Readonly<>` wrappers on domain object types

**Types:**
- PascalCase for interfaces and type aliases (`AgentAccessPrincipal`, `OperationInvokeGrant`, `AnswerTurnRecord`)
- No `I` prefix on interfaces
- No TypeScript `enum`; use const tuple unions:
  ```ts
  export const ClaimStatusValues = ['draft', 'authenticated', 'published', ...] as const
  export type ClaimStatus = (typeof ClaimStatusValues)[number]
  ```
- Status/result code tuples exported alongside Zod schemas from owning module:
  ```ts
  export const operationInvokeRefusalCodeValues = ['operation_ref_invalid', ...] as const
  export const operationInvokeRefusalCodeSchema = z.enum(operationInvokeRefusalCodeValues)
  ```
- Discriminated unions use `kind` field (`kind: 'ok'`, `kind: 'refused'`, `kind: 'error'`, `kind: 'recorded'`)
- Exhaustive maps use `satisfies Record<Union, ...>` not `Partial<Record<Union, ...>>`

## Code Style

**Formatting:**
- No Prettier config detected; formatting is implicit via TypeScript strictness and oxlint
- 2-space indentation (observed consistently)
- Semicolons omitted in most files (ASI style)
- Single quotes for strings
- `type: "module"` ESM throughout (`package.json`)

**Linting:**
- oxlint via `.oxlintrc.json` — not ESLint
- Categories: `correctness: error`, `suspicious: off`
- Plugins: `typescript`, `oxc`
- Key rules: `no-debugger: error`; `no-unused-vars`, `no-underscore-dangle` off
- Ignores: `convex/_generated/**`, `tests/fixtures/**`, `vendor/**`
- Run: `npm run lint` (`oxlint src convex tests tools --deny-warnings`)
- Inline suppressions use `oxlint-disable-next-line` with justification comment (`src/components/ae/chat/use-answer-turn-lifecycle.ts`)

**TypeScript compiler posture** (from `tsconfig.json` and `.planning/ENGINEERING-STANDARDS.md`):
```text
strict: true
exactOptionalPropertyTypes: true
noUncheckedIndexedAccess: true
useUnknownInCatchVariables: true
noImplicitOverride: true
allowJs: false
```
- No explicit `any`, no `as any`, no `as unknown as`, no non-null assertions (`!`)
- No `v.any()` in Convex schema outside documented boundary adapters
- No broad `string` statuses; use const tuple unions
- Allowed casts: `as const`, `satisfies`, generated code, one documented validator-helper cast with type test
- Enforced by `npm run test:ts-standards` scanning `src/modules/**`, `convex/**`, `apps/web/**`

## Import Organization

**Order:**
1. External packages (`vitest`, `zod`, `convex/values`, `@tanstack/react-router`)
2. Blank line
3. Internal modules via `@/` alias (`@/modules/capability-execution/operation-invoke`)
4. Relative imports for test helpers, fixtures, and cross-tree references (`../../../tools/dev/fixtures/...`, `../helpers/discovery-fixture-routes`)

**Grouping:**
- Blank line between external and internal groups
- Type-only imports use `import type { ... }` separately or inline `import { type X }`
- No inline imports in function bodies (workspace rule in `AGENTS.md`)

**Path Aliases** (from `tsconfig.json`):
- `@/*` → `src/*`
- `~/*` → `src/*`
- Route-specific overrides: `@/routes/owner.*`, `@/routes/admin.*`, `@/routes/developers.discovery`
- Vitest mirrors `@/` alias in `vitest.config.ts`

## Error Handling

**Patterns:**
- Expected domain failures return discriminated result unions — never throw for business refusals:
  ```ts
  | { kind: 'refused'; code: OperationInvokeRefusalCode }
  | { kind: 'recorded'; grantRef: string; generation: number }
  ```
- Generic module results use `ModuleResult` from `src/modules/common/result.ts`:
  ```ts
  type ModuleResult<OkCode, ErrorCode, OkPayload, ErrorPayload>
  // ok(code, payload) / error(code, retryable, payload)
  ```
- Exceptions reserved for programmer faults, infrastructure failures, and test setup errors (`throw new Error('adapter_not_reached_in_preflight_test')`)
- Zod validation at boundaries: `z.strictObject`, `z.enum(StatusValues)`, runtime parse with `safeParse`/`parse`
- Convex functions validate untrusted input; authority derived inside server boundary, not from browser payload

**Error Types:**
- Refusal codes are snake_case string literals in const tuples (`authentication_required`, `grant_expired`, `environment_mismatch`)
- HTTP/API layers project domain refusals to stable outer DTOs (`operation-invoke-contracts.ts`, `operation-invoke.ts`)
- `useUnknownInCatchVariables: true` — catch variables are `unknown`, must narrow before use

## Logging

**Framework:**
- Sentry for production error tracking (`@sentry/node`, `@sentry/react` in `package.json`)
- Structured telemetry via `src/lib/observability/` (`client-error.ts`, `private-route-safety.ts`)
- No dedicated pino/winston logger; limited `console.error`/`console.warn` for operator-facing diagnostics

**Patterns:**
- `console.error` only for operator/infrastructure concerns (`customer_request_semantic_interpretation_fell_back`, missing env secrets in `src/lib/server/notification-provider.ts`)
- Client errors normalized and sanitized before telemetry (`normalizeClientError` in `src/lib/observability/client-error.ts`)
- No `console.log` in committed production paths; oxlint does not ban console but engineering standards discourage it
- Papercuts logged to `PAPERCUTS.md` via `npm run papercut -- -m <model> "message"` (`AGENTS.md`)

## Comments

**When to Comment:**
- Explain non-obvious business rules and edge cases (authority modes, retry semantics, fallback behavior)
- Document why a lint rule is suppressed (`oxlint-disable-next-line` with reason)
- Gate/eval scripts document layers and exit semantics (`eval/quality/gate.ts` header)
- Avoid restating what code already says

**JSDoc/TSDoc:**
- Sparse usage; `@vitest-environment jsdom` pragma in test file headers is the common annotation pattern
- `@ts-expect-error` in type tests to prove invalid literals fail compile (`tests/types/domain-contracts.test.ts`)
- Public API functions generally self-document via typed signatures and const tuple unions

**TODO Comments:**
- Tracked in Linear issues and `.planning/` docs rather than inline TODOs in source
- `PAPERCUTS.md` for friction logging, not feature tracking

## Function Design

**Size:**
- Complex orchestration split across `internal/` helpers and machine/port files
- State machines in dedicated files (`route-execution/machines/`, `turn-orchestrator.ts`)
- No hard line limit enforced; prefer focused functions with explicit ports/interfaces

**Parameters:**
- Options objects for 4+ parameters (`AgentAccessGrantInput`, `OperationExecuteDeps`)
- `Readonly<>` on input types for immutability
- Destructure in parameter lists where clarity helps
- Port interfaces injected for testability (`OperationInvokeRuntime`, `KeylessExecutableSourcePort`)

**Return Values:**
- Explicit discriminated unions; no implicit `undefined` returns on success paths
- Early return for guard clauses and refusal paths
- Exhaustive switch with `never` check:
  ```ts
  default: {
    const _exhaustive: never = status
    return _exhaustive
  }
  ```
  (pattern in `src/components/ae/chat/answer-turn-state.ts`, `src/modules/answer/internal/answer-navigation-policy.ts`)

## Module Design

**Exports:**
- Each module owns a `public.ts` seam — routes and other modules import only from `src/modules/<module>/public.ts` or `public.ts` re-exports
- Named exports preferred; no default exports in domain modules
- React components use named exports (`export function AeServiceList`)
- Convex schema owned per module (`internal/convex-schema.ts`), aggregated in `convex/schema.ts`

**Barrel Files:**
- `public.ts` re-exports the module's allowed surface
- `internal/` files never exported from `public.ts`
- Routes must not import `convex/schema`, provider SDKs, or module `internal/` paths (enforced by `tests/imports/route-boundary.test.ts`)
- Modules must not import routes or another module's private files (enforced by `tests/imports/private-imports.test.ts`)

**Validator/source-of-truth pattern** (from `.planning/ENGINEERING-STANDARDS.md`):
```ts
export const StatusValues = ['one', 'two'] as const
export type Status = (typeof StatusValues)[number]
export const StatusSchema = z.enum(StatusValues)
```
- Convex validators import domain validators or use approved `v.union` helper with type tests
- Banned: global `validators.ts` dumping ground

**Route/server boundary:**
- Routes import UI, generated Convex client/hooks, and `src/modules/<module>/public` only
- Every `createServerFn` with input uses `.inputValidator`
- Loader/server functions return exported module DTO/result unions

---

*Convention analysis: 2026-08-17*
*Update when patterns change*
