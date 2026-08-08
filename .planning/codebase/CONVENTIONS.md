# Coding Conventions

**Analysis Date:** 2026-08-08

## Naming Patterns

**Files:**
- Use kebab-case for application modules and helpers, with role suffixes such as `*.actions.ts`, `*.functions.ts`, `public.ts`, and `internal/`; examples include `src/modules/capability-execution/operation-execute.actions.ts` and `src/modules/customer-request/customer-request.functions.ts`.
- Use PascalCase filenames for React components, for example `src/components/ae/action-invocation/AePaidOperationCard.tsx`.
- TanStack file routes use dot-separated route segments and `$` parameters, for example `src/routes/api.v1.requests.$requestRef.messages.ts` and `src/routes/t.$threadId.tsx`; generated route output is `src/routeTree.gen.ts`.
- Keep Vitest tests in the separate `tests/` tree as `*.test.ts` or `*.test.tsx`; browser tests use `*.spec.ts` under `tests/e2e/` or `tests/deploy-smoke/`. There are no collocated `src/**/*.test.*` files in the current tree.

**Functions:**
- Use camelCase and named verbs that expose the operation (`create*`, `read*`, `project*`, `parse*`, `validate*`, `handle*`), as in `src/lib/server/convex-source.ts`, `src/modules/money/internal/exact-amount.ts`, and `src/routes/api.businesses.ts`.
- Async functions have no special name prefix. HTTP handlers conventionally use `handle...Request` or `handle...Post`, while pure transforms use `project...` or `parse...`.

**Variables:**
- Use camelCase for variables, parameters, and local functions; use `UPPER_SNAKE_CASE` for module constants such as `LIST_QUERY_PARAMS` in `src/routes/api.businesses.ts` and `SEARCH_STOP_WORDS` in `convex/registry.ts`.
- Prefer `const`; mutable state is local and explicit (for example, the `initialized` flag in `src/lib/observability/sentry.server.ts`).

**Types:**
- Use PascalCase type names without an `I` prefix. Public records and option objects commonly use `Readonly<{ ... }>`; see `src/modules/common/action.ts` and `src/modules/money/internal/exact-amount.ts`.
- Model finite outcomes as discriminated unions, usually keyed by `kind` or `status`, and validate the same discriminator at boundaries with Zod or Convex validators; see `src/modules/capability-execution/operation-execute.actions.ts` and `convex/registry.ts`.
- Use branded string types with `unique symbol` declarations when an identifier must not be confused with another string, as in `src/modules/capability-supply/public.ts`.

## Code Style

**Formatting:**
- The dominant application TypeScript/TSX style is two-space indentation, single-quoted strings, no semicolons, trailing commas in multiline literals/calls, and braces on the same line; examples are `src/lib/errors.ts` and `src/components/ae/action-invocation/AePaidOperationCard.tsx`.
- No repository Prettier configuration is present. Do not use the semicolon/double-quote style in the retained donor component `src/components/ai-elements/code-block.tsx` as the baseline for new application code.
- TypeScript is strict and uses `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `useUnknownInCatchVariables`, and `noImplicitOverride` in `tsconfig.json`.

**Linting:**
- Use Oxlint with the TypeScript and Oxc plugins, configured in `.oxlintrc.json`; correctness violations are errors, generated Convex code, fixtures, and `vendor/` are ignored.
- The repository lint command is `npm run lint`, defined in `package.json`; do not add an ESLint-specific convention beside the existing Oxlint gate.

## Import Organization

**Order:**
1. External package imports.
2. Internal `@/` alias imports, with `import type` used for type-only dependencies.
3. Relative imports for same-module or adjacent implementation details.
4. Generated Convex imports and relative host-adapter imports stay near the boundary in `convex/*.ts`.

**Grouping:**
- Separate meaningful import groups with blank lines. Keep related value and type imports together when they come from one module; representative examples are `src/modules/capability-supply/public.ts`, `src/routes/api.businesses.ts`, and `convex/registry.ts`.
- Do not assume alphabetical ordering: current files prioritize external/internal/relative boundaries and semantic proximity rather than a repository-wide alphabetizer.

**Path Aliases:**
- Use `@/*` for `src/*`; `~/*` is also configured but current production imports overwhelmingly use `@/`. Route-specific `@/routes/owner.*`, `@/routes/admin.*`, and `@/routes/developers.discovery` mappings are defined in `tsconfig.json`.
- Vitest mirrors the `@` mapping to `src/` in `vitest.config.ts`, including tests that import `tools/ae` modules through the same alias.

## Error Handling

**Patterns:**
- Return expected domain outcomes as tagged results or `undefined` instead of throwing: `src/modules/capability-execution/operation-execute.actions.ts` defines `ok`/`refused`/`error`, while `src/modules/money/internal/exact-amount.ts` returns `undefined` for invalid amounts.
- Throw for unavailable configuration, invalid runtime dependencies, or violated host invariants; `src/lib/server/convex-source.ts` uses the typed `ConvexSourceError` for missing auth/deployment configuration.
- Catch at external or framework boundaries, preserve stable machine codes, and map to the canonical HTTP problem response. `src/lib/errors.ts` owns the RFC 9457 model, `src/lib/server/problem.ts` emits `application/problem+json`, and `src/routes/api.businesses.ts` uses `safeParse` plus `problem(...)` for query failures.

**Error Types:**
- Prefer stable `kind`/`code`/`reason` fields for expected refusals and errors; do not expose raw provider or exception messages in public envelopes. `src/modules/capability-execution/operation-execute.actions.ts` and `tests/unit/lib/errors.test.ts` exercise this contract.
- Use `try/catch/finally` around network, provider, and observability boundaries. Deliberate cleanup-only suppression is explicit (for example, `flushPostHogServer().catch(() => undefined)` in `src/start.ts`).

## Logging

**Framework:**
- There is no application-wide pino/winston logger in `package.json`; operational logging uses `console.error`/`console.warn` at boundaries plus Sentry and PostHog integrations in `src/lib/observability/sentry.server.ts`, `src/lib/observability/sentry.client.ts`, and `src/start.ts`.

**Patterns:**
- Log machine-readable event names and redacted context, not raw credentials or provider payloads. `src/modules/customer-request/application/interpret-compile/interpreter.ts` logs an exhausted provider 4xx fallback but keeps routine model degradation silent; `src/lib/server/notification-provider.ts` logs the missing secret name while its wire detail remains parameter-free.
- Capture unhandled server exceptions in Sentry with a route tag and rethrow them through the request middleware in `src/start.ts`; keep pure projection/validation helpers free of logging.

## Comments

**When to Comment:**
- Explain why, invariant, safety boundary, or fallback behavior rather than restating the next statement. Examples include the unsupported-query rationale in `src/routes/api.businesses.ts`, the middleware ordering explanation in `src/start.ts`, and the credential-free probe rules in `src/modules/capability-supply/internal/readiness-probe.ts`.
- Use comments to record a non-obvious compatibility seam or intentional exception; `src/lib/server/convex-source.ts` marks a test-required transport seam with `ponytail: intentional seam`.

**JSDoc/TSDoc:**
- Document exported contracts and public projections with `/** ... */`, including the RFC model in `src/lib/errors.ts`, the action contract in `src/modules/common/action.ts`, and customer-facing component semantics in `src/components/ae/action-invocation/AePaidOperationCard.tsx`.
- Internal helpers generally rely on self-explanatory signatures; add documentation when the helper encodes a business rule, wire contract, or security constraint.

**TODO Comments:**
- No `TODO`, `FIXME`, or `HACK` markers were found in the current `src/`, `convex/`, `tools/`, or `tests/` scan. Keep unfinished work out of comments; express a real contract in code or in the tracked planning artifacts.

## Function Design

**Size:**
- Keep new functions single-purpose and extract normalization, validation, projection, and formatting helpers; current examples include the small helpers in `src/modules/money/internal/exact-amount.ts` and the route query helpers in `src/routes/api.businesses.ts`.
- There is no numeric line-limit rule in the repository. Larger orchestration functions are acceptable at adapter boundaries when they preserve the sequencing contract, as in `src/start.ts` and `src/modules/customer-request/application/interpret-compile/interpreter.ts`.

**Parameters:**
- Prefer one typed options object for multi-field operations and mark immutable inputs `Readonly`; see `src/lib/server/convex-source.ts` and `src/modules/common/action.ts`.
- Keep boundary inputs explicitly typed and schema-validated rather than accepting broad `any`; `tsconfig.json` strictness and `tests/imports/ts-standards.test.ts` enforce this direction.

**Return Values:**
- Use explicit return types on exported boundary functions and route handlers; return early for invalid input, unavailable state, or refusal branches.
- Preserve discriminated result identity and evidence fields through projections; do not turn an expected refusal into a thrown generic error. See `src/lib/errors.ts` and `src/modules/capability-execution/operation-execute.actions.ts`.

## Module Design

**Exports:**
- Prefer named exports for application modules and React components; public module contracts are gathered through `public.ts`, for example `src/modules/capability-supply/public.ts` and `src/modules/registry/public.ts`.
- Default exports are reserved mainly for framework registrations/configuration such as `convex/schema.ts`, `convex/http.ts`, `convex/crons.ts`, and `vite.config.ts`.

**Barrel Files:**
- Treat each module's `public.ts` as the import boundary and keep implementation helpers under `internal/`; `src/modules/capability-supply/public.ts` re-exports public types/functions while `src/modules/capability-supply/internal/` remains implementation detail.
- Convex host files should adapt and call module exports rather than duplicate domain rules; `convex/registry.ts` imports registry/catalog/money projections from `src/modules/` and exposes typed query handlers. Import-boundary checks live in `tests/imports/`.

---

*Convention analysis: 2026-08-08*
*Update when patterns change*
