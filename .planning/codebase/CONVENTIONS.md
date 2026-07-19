# Coding Conventions

**Analysis Date:** 2026-07-19
**last_mapped_commit:** `77ec35ac`

## Naming Patterns

**Files:**
- Use kebab-case for domain directories and most implementation files: `src/modules/customer-request/`, `src/modules/capability-supply/`, and `src/modules/customer-request/route-execution/machines/open-leased-dispatch.ts`.
- Use `public.ts` as the intentional external seam for a domain. Keep implementation-only files under `internal/`; examples are `src/modules/registry/public.ts` and `src/modules/registry/internal/search.ts`.
- Name cross-surface declarations `<domain>.actions.ts` and source adapters `<domain>.functions.ts`, then register actions in `src/modules/actions/index.ts`.
- Keep Convex hosts in camelCase files under `convex/`, such as `convex/customerRequestApplication.ts`; co-located IO adapters use a `*Ports.ts` suffix.
- Name Vitest files `*.test.ts` or `*.test.tsx`, Playwright files `*.spec.ts`, and architectural source locks `*-thinness.test.ts`.

**Functions:**
- Use camelCase verb phrases: `describeActionForAgent`, `searchPublicBusinessCatalog`, and `provideCustomerRequestFacts`.
- Name implementation imports with an `Impl` suffix when re-exporting through a public seam, as in `src/modules/registry/public.ts`.
- Name dependency-injection factories `<concern>Ports(ctx)` and pure operations by the business action they perform.
- Do not introduce `use*` names outside genuine React hooks; application thinness tests under `tests/unit/customer-request/application/` enforce this separation.

**Variables:**
- Use camelCase for locals and module values.
- Use SCREAMING_SNAKE_CASE for stable shared constants, especially test constants and fixed policy values.
- Use `Values` suffixes for literal vocabularies and derive their union types: `IndexStatusValues` and `IndexStatus` in `src/modules/registry/public.ts`.
- Preserve semantic identifiers in names (`requestRef`, `routeRef`, `operationKey`) instead of generic `id` where the domain distinguishes identities.

**Types:**
- Use PascalCase type aliases. The codebase prefers `type` over `interface` for DTOs, ports, commands, results, and function contracts.
- Model expected outcomes as discriminated unions, normally on `kind`; do not use thrown exceptions for ordinary refused, missing, conflict, or proof-gap states.
- Mark public collections `readonly` and use `as const` for literal vocabularies.
- Keep Convex runtime types (`MutationCtx`, `QueryCtx`, `Doc`) out of pure modules under `src/modules/`.

## Code Style

**Formatting:**
- No Prettier configuration is present. Match the established TypeScript style: two-space indentation, single quotes, trailing commas in multiline constructs, and no semicolons.
- Keep multiline object and function arguments trailing-comma safe. Let neighboring source determine compact versus expanded JSX.
- Keep comments focused on invariants, authority, or non-obvious platform constraints rather than narrating implementation.

**Linting:**
- Run `npm run lint`; `package.json` invokes `oxlint src convex tests tools examples --deny-warnings`.
- `.oxlintrc.json` enables `correctness` errors with TypeScript and Oxc plugins, ignores generated Convex output and deliberate bad fixtures, and explicitly disables a small set of noisy rules.
- Treat `tsconfig.json` as a quality gate: `strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `useUnknownInCatchVariables`, and `noImplicitOverride` are enabled.
- Run `npm run test:ts-standards`; `tests/imports/ts-standards.test.ts` scans live source for unsafe TypeScript patterns that lint alone does not govern.

## Import Organization

**Order:**
1. Node built-ins such as `node:fs`.
2. Third-party runtime and test packages.
3. `@/` or `~/` imports from `src/`.
4. Relative imports inside the same module/package.
5. Use `import type` wherever the import is type-only.

Blank lines separate major import groups. Existing files sometimes interleave a related value import and its type import; preserve local grouping instead of performing style-only churn.

**Path Aliases:**
- `@/*` and `~/*` both resolve to `src/*` in `tsconfig.json`.
- Operator route aliases in `tsconfig.json` remap owner, admin, and developer-discovery paths.
- Vitest resolves these aliases through `tsconfigPaths: true` in `vitest.config.ts`.

**Boundary Rules:**
- Import another domain through `src/modules/<domain>/public.ts`; do not reach into a sibling domain's `internal/` directory.
- Routes and Convex hosts consume module public seams. Pure domain code must not import `convex/_generated`, `convex/server`, or access `ctx.db`.
- `tests/imports/private-imports.test.ts`, `tests/imports/route-boundary.test.ts`, and the domain-specific boundary tests under `tests/imports/` are executable architecture policy.
- Register operations explicitly in `src/modules/actions/index.ts`; do not rely on module-evaluation side effects.

## Error Handling

**Patterns:**
- Return typed discriminated unions for expected domain outcomes. Callers must branch on `kind` and preserve specific refusal/error codes.
- Throw only for broken invariants, impossible setup, or programmer errors, as demonstrated by precondition checks in `tests/integration/registry-api.test.ts`.
- Validate external inputs at boundaries with Zod schemas in actions and Convex validators in Convex hosts.
- Use exhaustive union handling with a `never` assignment when switching over a closed vocabulary.
- Use `try`/`finally` when a test or runtime adapter temporarily changes process state, globals, servers, or injected backends.
- Do not expose raw provider, database, or sensitive payload errors. Return redacted codes/messages and persist structured evidence through the observability module.

## Logging

**Framework:** Structured product telemetry uses Sentry and PostHog; durable business evidence uses `src/modules/observability/`. Console logging is not the default domain pattern.

**Patterns:**
- Record business-significant actions as structured audit/funnel/receipt records, not free-form console strings.
- Redact private inquiry content, credentials, and provider payloads before persistence or logging.
- Use `console` only at CLI/script boundaries or where a runtime integration explicitly owns operational logging.

## Comments

**When to Comment:**
- Explain trust boundaries, why a registration is explicit, why a runtime choice is constrained, or why an apparently simpler implementation is unsafe.
- Keep public action intent in the action's `summary` and `boundaries` fields rather than duplicating it in scattered comments.
- Avoid stale phase-history comments and TODOs as substitutes for typed states or tests.

**JSDoc/TSDoc:**
- Use sparingly for exported contracts whose invariants are not evident from types. `src/modules/common/action.ts` is the representative pattern.
- Prefer types and boundary-honest names over extensive API prose.

## Function Design

**Size:** Keep pure decisions small enough to test directly. Convex hosts should be thin validator/auth/wiring shells; source-structure limits are enforced by `*-thinness.test.ts` suites under `tests/unit/customer-request/`, `tests/unit/capability-supply/`, `tests/unit/inquiries/`, and `tests/unit/notification-outbox/`.

**Parameters:** Prefer a typed input object plus a typed ports object over long positional argument lists. Inject clocks, network calls, persistence, and schedulers through ports or explicit options.

**Return Values:** Return serializable, readonly result shapes with specific `kind` and `code` values. Do not return deferred patch plans for a host to interpret; ports perform semantic IO inside the owning transaction.

## Module Design

**Exports:**
- Export a narrow domain API from `public.ts`; alias private implementations with `Impl` when the public seam intentionally renames them.
- Put pure decisions in `src/modules/`; keep database/scheduler IO in Convex hosts and `convex/*Ports.ts`.
- Declare actions once in `<domain>.actions.ts`, call shared source functions, and register them in `src/modules/actions/index.ts`.
- Keep validators on the external/Convex boundary and domain-specific state machines independent of Convex runtime types.

**Barrel Files:**
- Use `public.ts` for external module APIs and `index.ts` for a deliberately cohesive internal family.
- Do not create barrels that bypass `internal/` privacy or produce deep re-export chains.

**Prescriptive Layering:**

| Layer | Location | Use | Avoid |
|---|---|---|---|
| Pure domain | `src/modules/<domain>/` | Types, decisions, state machines, ports contracts | Convex runtime and direct IO |
| Private implementation | `src/modules/<domain>/internal/` | Same-domain details | Cross-domain imports |
| Source adapters/actions | `src/modules/<domain>/*.functions.ts`, `*.actions.ts` | Bind shared operations to surfaces | Duplicate business logic |
| Convex host/adapters | `convex/*.ts`, `convex/*Ports.ts` | Validators, auth, DB, scheduler | Large inline decision engines |
| Routes/UI | `src/routes/`, `src/components/` | Projection and interaction | Private module imports |

**Project-Specific Constraints:**
- Use Astryx components first for UI and Tailwind only as layout glue; `DESIGN.md` and `.agents/skills/ae-design-system/SKILL.md` govern presentation work.
- Keep public and assistant-visible copy within the evidenced safe contract. Run `npm run test:copy` for changes to action summaries, boundaries, public routes, or assistant output.
- When changing Convex code, read `convex/_generated/ai/guidelines.md` first.
- Add or update an architectural thinness test when moving a host decision into a machine/ports seam; pair that static lock with behavior tests.

---

*Convention analysis: 2026-07-19*
