# Coding Conventions

**Analysis Date:** 2026-07-14

## Naming Patterns

**Files:**
- Use kebab-case for TypeScript modules and utilities: `src/modules/common/stable-hash.ts`, `src/lib/server/bounded-request-body.ts`.
- Use PascalCase for established React component files: `src/components/ae/customer-request/AeCustomerRequestWorkspace.tsx`.
- Encode TanStack file routes in filenames: `$name` is a parameter and `_operator` is a pathless layout (`src/routes/api.requests.$requestRef.ts`, `src/routes/_operator.tsx`).
- Give each domain a deliberate public seam: `public.ts`, `<domain>.actions.ts`, and `<domain>.functions.ts`; keep implementation details in `internal/` (`src/modules/inquiries/public.ts`, `src/modules/inquiries/internal/commands.ts`).
- Name Vitest files `*.test.ts` or `*.test.tsx`; name Playwright files `*.spec.ts` (`tests/unit/customer-request/customer-request-workspace.test.tsx`, `tests/e2e/thread-first.spec.ts`).

**Functions:**
- Use camelCase and an effect-revealing verb: `compileCustomerRequest`, `admitActionAttemptV2`, `recordProviderOutcomeTransaction`.
- Name React event handlers `handle*`; name hooks `use*`; suffix server functions and source adapters consistently when the owner module does so.
- Make test-only seams explicit in the name, such as `setAnswerThreadPortForTests` in `src/modules/answer-thread/public.ts`.

**Variables:**
- Use camelCase for local values and UPPER_SNAKE_CASE only for true module constants.
- Use exact domain identifiers (`requestRef`, `preparationRef`, `optionRef`) rather than generic `id` when the type is not sufficient context.
- Keep immutable domain collections `readonly`; avoid mutable aliases crossing a module seam.

**Types:**
- Use PascalCase with no `I` prefix (`CustomerRequestV2Aggregate`, `ActionAttemptV2`).
- Prefer `Readonly<{ ... }>` records and discriminated unions with literal `kind`, `state`, `status`, `reason`, or `code` fields (`src/modules/common/result.ts`).
- Use `type` for domain shapes and unions. Use generated Convex `Doc`, `Id`, and context types in Convex code rather than reproducing framework types.

## Code Style

**Formatting:**
- Use two-space indentation, single quotes, trailing commas in multiline constructs, and no semicolons. No Prettier or Biome configuration is present; match adjacent code.
- Keep routes shallow. Delegate HTTP behavior from `src/routes/api.*.ts` to an owning server or module function, as in `src/routes/api.requests.ts`.
- Do not hand-edit `src/routeTree.gen.ts` or `convex/_generated/**`.
- Keep public human copy within `PRODUCT.md`, `DESIGN.md`, and `AGENTS.md` boundaries; do not expose internal architecture vocabulary or imply booking, payment, dispatch, availability, or fulfilment.

**Linting:**
- Run `npm run lint`; it invokes Oxlint over `src`, `convex`, `tests`, `tools`, and `examples` with warnings denied.
- `.oxlintrc.json` enables the correctness category and the TypeScript/Oxc plugins. It disables the broad suspicious category and selected noisy rules, so lint is not a substitute for type and contract gates.
- Run `npm run typecheck`; `tsconfig.json` enables `strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `useUnknownInCatchVariables`, `noImplicitOverride`, and `isolatedModules`.
- Run `npm run test:ts-standards` for repository-specific prohibitions on unsafe assertions, broad `any`, non-null assertions, and weak status modeling (`tests/imports/ts-standards.test.ts`).

## Import Organization

**Order:**
1. Node built-ins and external packages.
2. Blank line, then production imports through `@/`.
3. Blank line, then relative imports owned by the same module or Convex directory.
4. Mark type-only imports with `import type` or inline `type`.

**Path Aliases:**
- Use `@/` for `src/`; `~/` also maps to `src/` in `tsconfig.json`, but `@/` is the established convention.
- Import another domain through its public seam. `tests/imports/private-imports.test.ts`, `tests/imports/route-boundary.test.ts`, and domain boundary suites enforce ownership.
- Keep module-private validators, stores, persistence commands, and adapters under the owning `internal/` directory.
- Declare shared operations in `src/modules/*/*.actions.ts` and register them explicitly in `src/modules/actions/index.ts`; do not rely on import side effects.

## Error Handling

**Patterns:**
- Model expected refusal, conflict, waiting, unsupported, proof-gap, and unknown-outcome states as typed discriminated results. Throw for malformed boundaries, missing infrastructure, and violated invariants.
- At HTTP boundaries, bound request bodies, parse defensively, validate once, and return stable public codes (`src/lib/server/bounded-request-body.ts`, `src/lib/server/customer-request-api.ts`).
- Fail closed for missing identity or authority, stale revisions, digest mismatch, ineligible supply, exceeded disclosure scope, missing evidence, and indeterminate provider outcomes.
- Bind retries to deterministic idempotency keys and digests. Exact replay returns prior evidence; changed material under the same key is a conflict.
- Catch errors at ownership boundaries. Never return raw exception messages, customer values, provider payloads, credentials, or private identifiers to public surfaces.

## Logging

**Framework:** Sentry and PostHog behind source-owned observability modules.

**Patterns:**
- Centralize capture in `src/lib/observability/` and `src/modules/observability/`; redact before telemetry.
- Use structured event names and bounded metadata. Do not scatter `console` diagnostics through domain code.
- Keep observability best-effort and non-authoritative: telemetry failure must not change the domain transition or manufacture proof.

## Comments

**When to Comment:**
- Explain trust boundaries, non-obvious invariants, compatibility constraints, and why a tempting shortcut is unsafe.
- Do not narrate straightforward control flow. Keep comments synchronized with the actual source contract.
- Use framework route/config comments only when they explain an otherwise invisible ownership or generation rule.

**JSDoc/TSDoc:**
- Use sparingly for exported contracts whose authority, surfaces, or security semantics are not obvious from the type, as in `src/modules/common/action.ts`.
- Prefer expressive domain types over prose-only constraints; encode required behavior in validators and tests.

## Function Design

**Size:** Keep public interfaces small while allowing deep implementations. Extract only cohesive owned behavior; do not split modules to satisfy line-count tools.

**Parameters:** Use one typed input object for multi-field operations. Inject clocks, fetch, stores, interpreters, and provider adapters at effect boundaries instead of reading hidden global state in pure domain functions.

**Return Values:** Return exact typed projections or discriminated results. Preserve deterministic ordering and replay identity. At Convex boundaries, declare `args` and `returns`, and return `null` rather than implicit `undefined`.

## Module Design

**Exports:**
- Named exports are standard. Reserve default exports for framework-required configuration, route, and schema objects.
- Export the smallest stable surface from `public.ts`; alias internal implementations there when necessary.
- Keep the neutral Customer Request compiler independent of provider- or vertical-specific vocabulary (`src/modules/customer-request/compiler.ts`, `src/modules/capability-contract/public.ts`).
- Registered business pages are discovery inventory, not routeable supply; supply authority remains in the exact admitted contract, offering, binding, eligibility, publication, credentials, and readiness chain.
- Before changing Convex code, read `convex/_generated/ai/guidelines.md`; use generated wrappers, validators, indexed queries, and server-derived identity.

**Barrel Files:**
- Use domain `public.ts` barrels as enforced interfaces, not convenience re-export buckets.
- Do not create repository-wide barrels. Keep route and cross-domain dependency direction visible to static import tests.

---

*Convention analysis: 2026-07-14*
