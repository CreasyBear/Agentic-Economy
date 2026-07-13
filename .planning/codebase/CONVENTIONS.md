# Coding Conventions

**Analysis Date:** 2026-07-13

## Naming Patterns

**Files:**
- Use kebab-case for general modules and utilities (`src/lib/server/bounded-request-body.ts`, `src/modules/common/stable-hash.ts`).
- Domain modules use role suffixes and explicit surfaces: `public.ts`, `*.actions.ts`, `*.functions.ts`, plus `internal/` for owned implementation (`src/modules/inquiries/inquiry.actions.ts`, `src/modules/catalog/internal/publish.ts`).
- TanStack file routes encode route IDs and parameters; `_operator` is a layout segment and `$name` is a parameter (`src/routes/_operator/owner.settings.tsx`, `src/routes/api.requests.$requestRef.facts.ts`).
- React component files are mixed by established boundary: many legacy/shared AE components use PascalCase (`src/components/ae/chat/AeChat.tsx`), while module and primitive files are commonly kebab-case. Match the containing directory rather than renaming broadly.
- Tests are descriptive kebab-case. Vitest uses `*.test.ts[x]`; Playwright uses `*.spec.ts` (`tests/unit/capability-supply/capability-supply-contract.test.ts`, `tests/e2e/landing-answer.spec.ts`).

**Functions and Variables:**
- Use camelCase for functions, variables, hooks, and handlers (`compileCustomerRequest`, `handleCustomerRequestPost`).
- Use PascalCase for React components and UPPER_SNAKE_CASE for true module constants.
- Name booleans as predicates and effects with specific verbs such as `read`, `resolve`, `validate`, `register`, `record`, `publish`, or `prepare`.
- Test seams carry an explicit `ForTests` or `Test` marker (`setAnswerThreadPortForTests`, `createAnswerThreadTestStore`).

**Types:**
- Use PascalCase type aliases and interfaces without `I` prefixes (`CapabilityOfferingRegistration`, `CustomerRequestProjection`).
- Prefer readonly object types and discriminated unions with literal `kind`, `status`, `reason`, or `code` fields.
- Derive runtime-backed unions from `as const` data or validators rather than duplicating loose strings.
- Use branded/domain identifiers and exact records at boundaries. `tests/imports/ts-standards.test.ts` rejects broad `any`, unsafe assertions, non-null assertions, and overly broad domain status fields.

## Code Style

**Formatting:**
- TypeScript and TSX consistently use two-space indentation, single quotes, trailing commas in multiline constructs, and no semicolons.
- No Prettier or ESLint configuration is checked in. Formatting is maintained by matching surrounding code; no hard line-length rule is configured.
- Generated output such as `convex/_generated/**` and `src/routeTree.gen.ts` is tool-owned and must not be hand-edited.

**Linting and Type Safety:**
- Oxlint 1.73 is configured in `.oxlintrc.json`; correctness rules are errors, selected noisy rules are disabled, and generated/vendor/negative-fixture paths are ignored.
- Run `npm run lint`; it scans `src`, `convex`, `tests`, `tools`, and `examples` with `--deny-warnings`.
- `tsconfig.json` enables `strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `useUnknownInCatchVariables`, `noImplicitOverride`, and `isolatedModules`.
- Validate untrusted data at boundaries, commonly with Zod or explicit Convex validators. Narrow optional values before constructing exact-optional objects.
- Run `npm run typecheck`, `npm run check:convex-codegen`, and `npm run test:ts-standards` for complementary compiler, generated-contract, and source-standard proof.

## Import Organization

**Order:**
1. Node built-ins and external packages.
2. Blank line, then internal `@/` imports.
3. Blank line, then relative imports for same-module or Convex-owned files.

**Patterns:**
- Use `import type` or inline `type` modifiers for type-only imports.
- `@/*` and `~/*` both resolve to `src/*`, but `@/` is the dominant alias. Additional aliases in `tsconfig.json` preserve operator-route import IDs.
- Cross-domain consumers should import module-owned public surfaces instead of private internals. `tests/imports/private-imports.test.ts`, `tests/imports/route-boundary.test.ts`, and domain-specific boundary tests enforce this.
- Relative imports are normal within `convex/`, within one module, and from tests into nearby helpers/fixtures. Avoid barrels that erase ownership boundaries.

## Error Handling

**Expected Failures:**
- Model expected domain refusal and unavailability as typed discriminated results, not exceptions (`kind: 'refused'`, stable `reason`, retryability or evidence where relevant).
- Validate before persistence and fail closed on authorization, contract integrity, stale hashes, suppressed businesses, missing evidence, or invalid provider material (`src/modules/capability-supply/public.ts`, `convex/capabilitySupply.ts`).
- Preserve idempotency with operation keys and deterministic digests; exact replay returns the prior result while changed retry material is a conflict.

**Boundary Failures:**
- At HTTP boundaries, bound body sizes, parse defensively, validate schemas, and map failures to explicit statuses and stable public error codes (`src/lib/server/customer-request-api.ts`).
- Catch errors at ownership boundaries. Abort/cancellation may return quietly; unexpected failures must not expose exception details, credentials, protected values, or internal identifiers.
- Use `try/finally`, `afterEach`, or explicit restoration whenever environment, globals, clocks, ports, or mocks are temporarily replaced.

## Logging and Observability

**Framework:**
- No single application logger is established. Sentry and PostHog integrations are centralized under `src/modules/observability/`; selected server/provider boundaries use console methods when the console output itself is the operational interface.
- Prefer structured, redacted operational facts. Audit payloads and error telemetry must exclude secrets and customer-protected values (`src/modules/observability/internal/redaction.ts`).
- Do not scatter diagnostic `console.log` calls through domain logic; Oxlint blocks `debugger`, while tests explicitly spy on console only where CLI/provider behavior is under test.

## Comments and Documentation

**When to Comment:**
- Explain authority boundaries, security invariants, protocol compatibility, generated ownership, or a non-obvious fallback; do not narrate straightforward statements.
- Use TSDoc where a public contract, provenance rule, or substitutable port needs durable explanation. Most internal functions rely on precise types and names instead of boilerplate docs.
- Keep TODOs actionable and preferably tied to an issue or planning artifact; do not use comments to normalize known unsafe behavior.

## Function Design

**Inputs and Returns:**
- Prefer one typed options/input object for multi-field operations and explicit return types on exported or boundary functions.
- Use guard clauses and exhaustive discriminator checks. Pure domain functions should remain deterministic; inject clocks, fetch implementations, stores, and provider adapters at effect boundaries.
- Conditionally spread optional fields instead of assigning explicit `undefined` where `exactOptionalPropertyTypes` applies.

**Convex Functions:**
- Follow `convex/_generated/ai/guidelines.md`: declare `args` and `returns` validators, use the generated `query`/`mutation`/`action` wrappers, and type contexts with generated `QueryCtx`, `MutationCtx`, or `ActionCtx` rather than `any`.
- Derive authorization identity with `ctx.auth.getUserIdentity()` and use `identity.tokenIdentifier` for stable auth-linked ownership; never accept a caller-supplied user ID as authorization authority.
- Use indexed queries rather than filter scans, keep internal-only operations internal, and compose domain table fragments in `convex/schema.ts`.

## Module Design

**Exports and Ownership:**
- Prefer named exports. Default exports are mainly framework-required configuration, schema, route, or cron objects (`vitest.config.ts`, `convex/schema.ts`).
- Operations intended for shared surfaces are actions in `src/modules/*/*.actions.ts` and register through `src/modules/actions/index.ts`.
- Expose cross-module contracts through `public.ts`; keep schemas, validators, storage commands, and adapters under the owning module or `internal/` directory.
- Keep capability contract, commercial offering, transport binding, credential, and eligibility authority separate; do not collapse distinct identities into a convenience DTO (`src/modules/capability-supply/public.ts`).
- Preserve the product boundary in code and copy: public/assistant behavior may read, compare, summarize, route, and submit a qualified inquiry, but must not imply booking, payment, dispatch, or autonomous fulfilment (`AGENTS.md`).

---

*Convention analysis: 2026-07-13*
*Update when patterns change*
