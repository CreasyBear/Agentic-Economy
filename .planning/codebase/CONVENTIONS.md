# Coding Conventions

**Analysis Date:** 2026-07-02

## Naming Patterns

**Files:**
- Use domain modules under `src/modules/<domain>/` with public seams in `public.ts`, server/source adapters in `<domain>.functions.ts`, action declarations in `<domain>.actions.ts`, and private implementation under `internal/*.ts`; examples: `src/modules/registry/public.ts`, `src/modules/registry/registry.functions.ts`, `src/modules/registry/registry.actions.ts`, `src/modules/registry/internal/search.ts`.
- Use TanStack file routes in `src/routes/` with literal route names encoded in filenames; examples: `src/routes/registry.tsx`, `src/routes/api.agent.tools.ts`, `src/routes/$slug.inquiry.tsx`, `src/routes/llms[.]txt.ts`.
- Use `Ae` PascalCase for product-owned React components in `src/components/ae/`; examples: `src/components/ae/registry/AeRegistryCard.tsx`, `src/components/ae/chat/AeChat.tsx`, `src/components/ae/layout/AeOperatorShell.tsx`.
- Use lowercase utility component filenames in `src/components/ui/` for shadcn/radix primitives; examples: `src/components/ui/button.tsx`, `src/components/ui/field.tsx`, `src/components/ui/dialog.tsx`.
- Use test names that mirror the behavior or boundary under test in `tests/<type>/<area>/*.test.ts` and browser specs in `tests/e2e/**/*.spec.ts`; examples: `tests/unit/registry/registry-fallback.test.ts`, `tests/integration/agent-tools-api.test.ts`, `tests/e2e/public-owner-ui.spec.ts`.

**Functions:**
- Use camelCase verb phrases for functions and handlers; examples: `readPublicRegistrySearchPage` in `src/modules/registry/registry.functions.ts`, `handleInvokeAgentTool` in `src/routes/api.agent.tools.ts`, `validateAuditEvent` in `src/modules/observability/internal/audit.ts`.
- Use `set...ForTests` for test injection seams that return reset functions; examples: `setPublicRegistrySourcePortForTests` in `src/modules/registry/registry.functions.ts`, `setAnswerThreadPortForTests` in `src/modules/answer-thread/answer-thread.functions.ts`.
- Use `with...ForTest` helper wrappers around test seams so resets happen in `finally`; examples: `withRegistrySourcePortForTest` and `withDiscoverySourcePortForTest` in `tests/helpers/source-ports.ts`.
- Use `handle...Request` for route/API request adapters; examples: `handleDurableListBusinessesRequest` in `src/routes/api.businesses.ts`, `handleListAgentTools` in `src/routes/api.agent.tools.ts`.

**Variables:**
- Use camelCase for local values and exact domain names for discriminants; examples: `sourceWriteRequest` in `src/modules/common/action.ts`, `catalogSearchBackendForTests` in `src/modules/registry/registry.functions.ts`.
- Use `Values` suffix for exported literal arrays and derive union types from them; examples: `ResultKindValues` in `src/modules/common/result.ts`, `CapabilityKindValues` in `src/modules/catalog/public.ts`, `AuditEventTypeValues` in `src/modules/observability/public.ts`.
- Use `Schema` suffix for Zod validators and lower camelCase for local schemas; examples: `ClaimStatusSchema` in `src/modules/business/internal/validators.ts`, `registrySearchInputSchema` in `src/modules/registry/registry.actions.ts`.
- Use conditional object spreads for optional properties to satisfy `exactOptionalPropertyTypes`; examples: `src/routes/api.businesses.ts`, `src/modules/registry/registry.functions.ts`, `src/lib/observability/sentry.server.ts`.

**Types:**
- Use PascalCase for exported type aliases and domain contracts; examples: `ActionDefinition` in `src/modules/common/action.ts`, `PublicRegistrySourcePort` in `src/modules/registry/registry.functions.ts`, `AuditEventInput` in `src/modules/observability/internal/audit.ts`.
- Prefer discriminated unions over broad strings for states and results; examples: `ActionResult` in `src/modules/common/action.ts`, `ModuleResult` in `src/modules/common/result.ts`, `AnswerGateResult` in `src/modules/answer/internal/answer-gate.ts`.
- Use `Readonly`, `readonly`, and `as const` for contracts and literal catalogs; examples: `searchParameters` in `src/modules/registry/registry.actions.ts`, `durableTables` in `tests/unit/schema/convex-schema.test.ts`.
- Avoid explicit `any`, broad status strings, non-null assertions, `v.any()`, and double casts in runtime code; `tests/imports/ts-standards.test.ts` enforces this through `scanTypeScriptStandards` in `src/lib/ui/contract-scans.ts`.

## Code Style

**Formatting:**
- Formatter config: Not detected. No `.prettierrc`, `prettier.config.*`, `eslint.config.*`, `.eslintrc*`, or `biome.json` is present at the repo root.
- Use the surrounding file's style. Product source generally uses no semicolons, two-space indentation, single quotes, trailing commas in multiline calls and object literals, and blank lines between import groups; examples: `src/modules/registry/registry.actions.ts`, `src/routes/registry.tsx`, `convex/registry.ts`.
- Keep generated or vendor-derived UI primitive style when editing `src/components/ui/`; existing files such as `src/components/ui/button.tsx` and `src/lib/utils.ts` use double quotes and class-variance-authority/shadcn conventions.
- TypeScript strictness is part of style: `tsconfig.json` enables `strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `useUnknownInCatchVariables`, and `noImplicitOverride`.
- Do not edit generated route or Convex artifacts directly; `src/routeTree.gen.ts` and `convex/_generated/*` are generated.

**Linting:**
- Dedicated lint command: Not detected in `package.json`.
- Static convention gates live in Vitest suites rather than ESLint: `tests/imports/private-imports.test.ts`, `tests/imports/route-boundary.test.ts`, `tests/imports/source-mining.test.ts`, `tests/imports/ts-standards.test.ts`, `tests/copy/phase1-banned-copy.test.ts`, `tests/ui-contract/class-scan.test.ts`.
- Convex project guidance in `convex/_generated/ai/guidelines.md` requires validators on every Convex function and exact return validators. The local `convex-best-practices` skill also recommends `@convex-dev/eslint-plugin`, but that package is not present in `package.json`; enforce Convex conventions with `npm run check:convex-codegen`, `npm run typecheck`, and the existing test gates.
- Public copy and UI style constraints are executable rules in `src/lib/ui/contract-scans.ts`; use those scanners instead of relying on visual review alone.

## Import Organization

**Order:**
1. Node built-ins and external packages first; examples: `node:fs`, `@tanstack/react-router`, `zod`, `vitest`.
2. Blank line, then app aliases from `@/*` or `~/*`; examples: `@/modules/actions`, `@/components/ui/button`, `@/lib/ui/contract-scans`.
3. Blank line, then local relative imports for same-module internals; examples: `./internal/search-documents` in `src/modules/registry/registry.functions.ts`, `../helpers/source-ports` in `tests/integration/agent-tools-api.test.ts`.

**Path Aliases:**
- `@/*` and `~/*` map to `src/*` in `tsconfig.json`; prefer `@/*` in app and tests.
- Convex files import generated APIs relatively from `./_generated/*` and may import module contracts from `../src/modules/*`; examples: `convex/schema.ts`, `convex/inquiries.ts`, `convex/authz.ts`.
- Routes must use module public seams and server/source adapters, not internal module files or direct Convex transport. The guardrail is `scanRouteBoundaries` in `src/lib/ui/contract-scans.ts`, exercised by `tests/imports/route-boundary.test.ts`.
- Cross-module runtime imports must go through `public.ts`, `*.functions.ts`, or `*.actions.ts`; `tests/imports/private-imports.test.ts` rejects private module imports outside allowed public seam composition.
- Unit tests may import internals directly when testing a narrow implementation contract; examples: `tests/unit/registry/catalog-search-port.test.ts`, `tests/unit/observability/audit-redaction.test.ts`, `tests/unit/answer/answer-tool-use-agent.test.ts`.

## Error Handling

**Patterns:**
- Use explicit result objects for expected domain failures. Results use `kind`, `code`, `reason`, and `retryable` rather than exceptions; examples: `src/modules/common/result.ts`, `src/routes/api.agent.tools.ts`, `src/modules/inquiries/inquiry.actions.ts`.
- Use Zod for route/action input validation and translate validation failures into structured responses; examples: `registrySearchInputSchema` in `src/modules/registry/registry.actions.ts`, `issueText` in `src/routes/api.agent.tools.ts`, `registrySearchParamsSchema` in `src/routes/registry.tsx`.
- Throw `Error` for invariants, missing configuration, impossible states, and test fixture failures; examples: `usesClerkBypass` in `src/routes/__root.tsx`, `readSmokeConfig` in `tests/deploy-smoke/phase1-deploy-smoke.spec.ts`, `validateAuditEvent` callers in `src/modules/billing/internal/operations.ts`.
- Preserve AE trust boundaries in errors and copy: do not imply booking, payment, dispatch, autonomous fulfillment, or unsupported verification. This is encoded in `AGENTS.md`, `src/modules/common/action.ts`, `src/modules/answer/internal/answer-gate.ts`, and copy tests under `tests/copy/`.
- Convex functions use exact `args` and `returns` validators with `v.union` result contracts. Current runtime code generally returns structured error unions instead of throwing user-facing Convex errors; examples: `convex/business.ts`, `convex/catalog.ts`, `convex/inquiries.ts`.
- Catch blocks should either return a safe fallback/result or rethrow a sanitized invariant error. Examples: registry fallback in `src/modules/registry/registry.functions.ts`, request parsing in `src/routes/api.agent.tools.ts`, source readback tests in `tests/unit/server/source-readback-truth.test.ts`.

## Logging

**Framework:** Sentry/PostHog/audit records, with console limited to CLI/eval scripts and tests.

**Patterns:**
- Use Sentry helpers for exception capture and request scrubbing; examples: `captureClientException` in `src/lib/observability/sentry.client.ts`, `captureServerException` in `src/lib/observability/sentry.server.ts`.
- Use PostHog helpers for funnel/product events; examples: `captureServerFunnelEvent` and `captureServerEvent` in `src/lib/observability/posthog.server.ts`, client capture in `src/lib/observability/capture-client-events.ts`.
- Use domain audit records for durable product events; examples: `validateAuditEvent` in `src/modules/observability/internal/audit.ts`, audit-related tests in `tests/unit/observability/audit-redaction.test.ts`.
- Use `console.log`/`console.error` in operator scripts, not runtime UI paths; example: `eval/answer/scripts/run-suite.ts`.
- Tests that expect noisy React or browser errors should spy and restore console functions; example: `tests/unit/observability/error-boundary-client.test.tsx`.

## Comments

**When to Comment:**
- Comment trust boundaries, registration contracts, and non-obvious safety decisions. Examples: the action contract block in `src/modules/common/action.ts`, the quiet agent door comment in `src/routes/api.agent.tools.ts`, the answer evidence comment in `tests/unit/answer/answer-tool-use-agent.test.ts`.
- Prefer comments that explain why a boundary exists over comments that restate the code.
- Do not put internal architecture vocabulary in public human copy. `AGENTS.md` and `tests/copy/phase1-banned-copy.test.ts` define the banned vocabulary and overclaim categories.

**JSDoc/TSDoc:**
- JSDoc is used selectively for important contracts rather than every function; examples: `AgentToolDescriptor` in `src/modules/common/action.ts`, comments on action definitions in `src/modules/registry/registry.actions.ts` and `src/modules/inquiries/inquiry.actions.ts`.
- Public exported types should be self-describing through names and exact literal unions; add JSDoc only when the trust boundary or surface fan-out is not obvious.

## Function Design

**Size:** Keep functions narrow where possible, but domain command files can be large. Put complex domain workflows in `src/modules/*/internal/*` and keep routes as adapters; examples: `src/modules/inquiries/internal/commands.ts`, `src/modules/protected-action/internal/contact-follow-up.ts`, `src/routes/api.businesses.ts`.

**Parameters:** Use single input objects for multi-field operations and typed options objects for optional behavior; examples: `readPublicRegistrySearchPage(input, options)` in `src/modules/registry/registry.functions.ts`, `loadRegistryRouteReadback(deps)` in `src/routes/registry.tsx`, `validateAuditEvent(input)` in `src/modules/observability/internal/audit.ts`.

**Return Values:** Return exact discriminated unions or DTO contracts for public/module surfaces; examples: `PublicBusinessCatalogApiPage` in `src/modules/registry/public.ts`, `PublicInquirySubmitServerResult` in `src/modules/inquiries/inquiry.functions.ts`, `AnswerGateResult` in `src/modules/answer/internal/answer-gate.ts`.

## Module Design

**Exports:** Public module APIs are gathered in `public.ts` and action definitions are gathered in `*.actions.ts`. Add new assistant/human operations as actions and register them in `src/modules/actions/index.ts`.

**Barrel Files:** Use domain barrels intentionally. `src/modules/actions/index.ts` is the central action registry; `src/modules/answer/public.ts`, `src/modules/registry/public.ts`, and `src/modules/inquiries/public.ts` expose domain seams while hiding `internal/*` implementation details.

**Route Adapters:** Keep `src/routes/*` thin: parse request/search params, call module seams, and return UI or `Response`. Examples: `src/routes/api.businesses.ts`, `src/routes/api.agent.tools.ts`, `src/routes/registry.tsx`.

**Convex Design:** Read `convex/_generated/ai/guidelines.md` before editing Convex code. Convex functions live in `convex/*.ts`, compose table schemas from module-owned schema files through `convex/schema.ts`, use validators for all `args` and `returns`, prefer indexes over filters, and keep Node-only action code separate from queries/mutations.

---

*Convention analysis: 2026-07-02*
