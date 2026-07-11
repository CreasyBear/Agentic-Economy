# Coding Conventions

**Analysis Date:** 2026-07-11

## Naming Patterns

**Files:**
- Use kebab-case for general modules and components (`src/lib/server/bounded-request-body.ts`, `src/components/ae/answer/ae-provider-card.tsx`).
- Domain modules use a public/internal split and role suffixes: `public.ts`, `*.actions.ts`, `*.functions.ts`, `internal/schema.ts`, and `internal/commands.ts` (for example `src/modules/inquiries/`).
- TanStack file routes follow route IDs, including `$param`, `_operator`, and `-`-prefixed route-private helpers (`src/routes/$slug.inquiry.tsx`, `src/routes/_operator/owner.settings.tsx`, `src/routes/-registry-search-params.ts`).
- React components and their files are mixed by boundary: shared AE component files are generally kebab-case while route components live in route-named files; test files are descriptive kebab-case under `tests/`.

**Functions and Variables:**
- Use camelCase for functions, variables, hooks, and event handlers (`handleAnswerTurnRequest`, `readOwnerNotificationPreferencesServer`).
- Use PascalCase for React components (`OwnerSettingsRoute`) and UPPER_SNAKE_CASE for module constants (`MAX_ANSWER_TURN_BODY_BYTES`).
- Boolean names state the predicate (`replayed`, `isAbortError`, `hasNoOverflow`); factory/build/read/resolve verbs make effects explicit.
- Test-only seams are named plainly with `ForTests` or `Test` (`setAnswerThreadPortForTests`, `createAnswerThreadTestStore`).

**Types:**
- Use PascalCase type aliases without `I` prefixes (`AnswerSnapshot`, `OwnerNotificationPreferencesReadResult`).
- Prefer discriminated unions with literal `kind`, `code`, `status`, or `type` fields; derive literal unions from `as const` arrays where runtime values are also needed (`src/modules/answer/answer-synthesizer.ts`).
- Use branded identifiers and precise readonly collections at domain boundaries; broad `any`, non-null assertions, and broad status strings are rejected by `tests/imports/ts-standards.test.ts`.

## Code Style

**Formatting:**
- TypeScript/TSX uses two-space indentation, single quotes, trailing commas in multiline constructs, and normally no semicolons.
- There is no checked-in Prettier or ESLint configuration and no lint/format script in `package.json`; match surrounding source and rely on TypeScript plus source-scanning guardrails.
- Keep multiline calls and object literals readable; long signatures and expressions are wrapped by hand rather than an enforced line-length rule.

**Type Safety:**
- `tsconfig.json` enables strict mode plus `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `useUnknownInCatchVariables`, and `noImplicitOverride`.
- Validate unknown input at boundaries, commonly with Zod `safeParse`; narrow optional properties before constructing exact optional objects (`src/routes/api.answer.turn.ts`).
- Avoid unchecked casts. Narrow unions through discriminator checks and use exhaustive domain return shapes instead of exceptions for expected outcomes.
- Run `npm run typecheck`, `npm run check:convex-codegen`, and `npm run test:ts-standards` for source-level conformance.

## Import Organization

**Order:**
1. Node built-ins and external packages.
2. Blank line, then `@/` internal imports.
3. Blank line, then relative imports for nearby implementation details.

**Patterns:**
- Use `import type` or inline `type` imports for type-only dependencies.
- Use `@/*` for `src/*`; `~/*` is configured but `@/` is the dominant alias. Route-specific aliases in `tsconfig.json` normalize operator route paths.
- Domain consumers import from module public surfaces such as `@/modules/answer/public`; private and route-boundary imports are enforced by `tests/imports/private-imports.test.ts` and `tests/imports/route-boundary.test.ts`.
- Relative imports are appropriate inside a module and from tests into `tests/helpers/` or `eval/`; avoid new barrel files that bypass domain ownership.

## Error Handling

**Patterns:**
- Model expected domain failures as typed discriminated results (`kind: 'ok' | 'error'`, stable error `code`, `retryable`, and human-safe `reason`) rather than throwing (`src/modules/catalog/internal/publish.ts`).
- At HTTP boundaries, bound request bodies, catch parse failures, validate schemas, and map failures to explicit status codes and stable JSON/SSE error codes (`src/routes/api.answer.turn.ts`).
- Catch only at ownership boundaries. Abort and cancellation paths return quietly; unexpected streaming failures emit safe public errors without exposing exception details.
- Use `try/finally` when temporarily mutating environment or installing test seams; restore all prior state (`tests/eval/answer-pipeline.test.ts`).

**Security and Integrity:**
- Treat authentication, rate limiting, source-write admission, and authorization as explicit boundary checks before mutation.
- Preserve idempotency with operation keys and deterministic hashes in write paths; distinguish replay from first execution (`src/modules/catalog/internal/publish.ts`).
- Do not expose secrets or internal identifiers in public responses or copy. Dedicated source and copy scans live under `tests/unit/security/`, `tests/copy/`, and `tests/imports/`.

## Logging and Observability

**Framework:**
- There is no shared application logger convention. Production telemetry is routed through dedicated observability modules and providers (`src/modules/observability/`, Sentry, and PostHog), not scattered `console.log` calls.
- Keep public errors stable and non-sensitive; attach operational facts at server/provider boundaries rather than logging arbitrary domain internals.

## Comments and Documentation

**When to Comment:**
- Explain authority boundaries, non-obvious safety constraints, compatibility seams, or why a fallback exists; do not narrate straightforward code.
- Use TSDoc on public contracts when provenance or future substitution matters (`src/modules/answer/answer-synthesizer.ts`).
- Generated files such as `src/routeTree.gen.ts` are explicitly exempt and must not be edited; tests pin that generated-only exception.

## Function and Module Design

**Functions:**
- Prefer guard clauses, explicit return types on exported and boundary functions, and small named helpers for protocol details.
- Use a single options object for multi-field inputs and conditionally spread exact optional fields instead of passing explicit `undefined`.
- Keep pure domain logic deterministic; inject ports, stores, clocks, requests, or provider seams at boundaries when effects are required.

**Modules:**
- Prefer named exports. Default exports are reserved for framework-required configuration/schema entry points such as `vitest.config.ts` and `convex/schema.ts`.
- Expose cross-module contracts through `public.ts`; keep storage, validators, schemas, and command machinery under `internal/`.
- Compose Convex schema from module-owned table fragments in `convex/schema.ts`; do not centralize domain table definitions.
- Keep route-local UI helpers `-`-prefixed so TanStack Router excludes them from route generation.

---

*Convention analysis: 2026-07-11*
*Update when patterns change*
