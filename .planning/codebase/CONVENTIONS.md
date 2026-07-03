# Coding Conventions

**Analysis Date:** 2026-07-03

## Naming Patterns

**Files:**
- Use domain folders under `src/modules/<domain>/` with a public seam in `src/modules/<domain>/public.ts`, implementation files in `src/modules/<domain>/internal/`, server functions in `src/modules/<domain>/<domain>.functions.ts`, and action contracts in `src/modules/<domain>/<domain>.actions.ts`. Examples: `src/modules/registry/public.ts`, `src/modules/registry/internal/search.ts`, `src/modules/registry/registry.functions.ts`, `src/modules/registry/registry.actions.ts`.
- Use TanStack Router file-route names in `src/routes/`: `src/routes/api.agent.tools.ts`, `src/routes/$slug.tsx`, `src/routes/owner.inquiries.$threadId.tsx`, `src/routes/llms[.]txt.ts`.
- Use PascalCase file names for React components in `src/components/ae/**`: `src/components/ae/layout/AePublicShell.tsx`, `src/components/ae/forms/AeRegistrySearchPanel.tsx`.
- Use lowercase kebab or dotted names for domain helper files: `src/modules/answer-thread/internal/answer-turn-finalization.ts`, `src/modules/observability/funnel.capture.server.ts`.
- Use camelCase Convex files in `convex/` for source functions and stores: `convex/registry.ts`, `convex/businessActionStore.ts`, `convex/sourceWriteAdmission.ts`.

**Functions:**
- Use camelCase for functions and verb-first names for behavior: `readPublicRegistrySearchPage` in `src/modules/registry/registry.functions.ts`, `submitPublicInquiryThroughSource` in `src/modules/inquiries/inquiry.functions.ts`, `handleInvokeAgentTool` in `src/routes/api.agent.tools.ts`.
- Use `set*ForTests` for injectable seams and return a reset function: `setPublicRegistrySourcePortForTests` in `src/modules/registry/registry.functions.ts`, `setAnswerThreadPortForTests` through `tests/helpers/answer-thread-test-port.ts`.
- Use `handle*Request` names for route-level request adapters: `handleDurableSearchBusinessesRequest` in `src/routes/api.businesses.search.ts`, `handleListAgentTools` in `src/routes/api.agent.tools.ts`.
- Use React components as PascalCase functions with typed props: `AePublicShell` in `src/components/ae/layout/AePublicShell.tsx`, `AeRegistrySearchPanel` in `src/components/ae/forms/AeRegistrySearchPanel.tsx`.

**Variables:**
- Use camelCase for variables and constants scoped to implementation: `sentryPluginEnabled` in `vite.config.ts`, `publicRegistrySourcePortForTests` in `src/modules/registry/registry.functions.ts`.
- Use `...Values` readonly arrays with `as const` for literal unions: `ResultKindValues` in `src/modules/common/result.ts`, `CapabilityKindValues` exported through `src/modules/catalog/public.ts`.
- Use explicit `const` objects for registries and tables: `actions` in `src/modules/actions/index.ts`, `catalogTables` in `src/modules/catalog/internal/schema.ts`.
- Use object spread to omit optional fields instead of assigning `undefined`, matching `exactOptionalPropertyTypes` in `tsconfig.json`: see `compactContact` in `src/modules/inquiries/inquiry.functions.ts`.

**Types:**
- Use PascalCase for exported types and discriminated unions: `ActionDefinition` in `src/modules/common/action.ts`, `PublicInquirySubmitServerResult` in `src/modules/inquiries/inquiry.functions.ts`.
- Use branded IDs for domain identifiers, not plain strings at domain boundaries: `BusinessId`, `ServiceId`, `OperationKey`, and `brandNonEmpty` in `src/modules/common/ids.ts`.
- Use literal unions for status/source state fields instead of broad strings. This is enforced by `tests/imports/ts-standards.test.ts` via `scanTypeScriptStandards` in `src/lib/ui/contract-scans.ts`.
- Use `Readonly`, `readonly`, and `as const` for public contracts and fixed registries: `ActionDefinition` in `src/modules/common/action.ts`, `durableTables` in `tests/unit/schema/convex-schema.test.ts`.

## Code Style

**Formatting:**
- Formatter config is not detected: no `.prettierrc`, `prettier.config.*`, `eslint.config.*`, `.eslintrc*`, or `biome.json` exists in the repo root.
- Follow the dominant TypeScript style in `src/modules/common/action.ts` and `src/modules/registry/registry.actions.ts`: 2-space indentation, single quotes, no semicolons, trailing commas in multiline calls and object literals.
- Use TypeScript strictness as the primary style gate. `tsconfig.json` enables `strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `useUnknownInCatchVariables`, `noImplicitOverride`, and `isolatedModules`.
- Use `npm run typecheck` from `package.json` before broad changes. Use `npm run check:convex-codegen` when Convex definitions or schema-adjacent files change.

**Linting:**
- ESLint/Biome linting is not detected. Quality rules are encoded as Vitest scanners in `tests/imports/*.test.ts`, `tests/ui-contract/*.test.ts`, and `tests/copy/*.test.ts`.
- Do not use explicit `any`, double casts through `unknown`, non-null assertions, `v.any()`, broad `status: string`, hard-coded CSRF literals, or client-exposed source write secrets. These are rejected by `tests/imports/ts-standards.test.ts`.
- Do not import module internals across route or sibling-module boundaries. `tests/imports/private-imports.test.ts` rejects imports into `src/modules/**/internal/**` from non-owned code.
- Keep routes as adapters over module seams. `tests/imports/route-boundary.test.ts` rejects route-owned Convex transport imports and route imports of module internals.
- Keep UI visual classes within the Astryx-era contract. `tests/ui-contract/class-scan.test.ts` rejects raw colors, `space-*` utilities, `transition-all`, and arbitrary visual tokens in `src/routes` and `src/components/ae`.

## Import Organization

**Order:**
1. Node or package imports first, with type imports grouped where practical: `createHmac` in `tests/unit/business-action/stripe-checkout-evidence.test.ts`, `createFileRoute` in `src/routes/api.agent.tools.ts`.
2. Blank line, then app alias imports from `@/` or `~/`: `@/modules/actions`, `@/modules/registry/registry.functions`, `@/components/ae/layout/AePublicShell`.
3. Blank line, then relative imports for local siblings and test helpers: `./api.businesses` in `src/routes/api.agent.tools.ts`, `../helpers/source-ports` in `tests/integration/agent-tools-api.test.ts`.

**Path Aliases:**
- `@/*` maps to `./src/*` in `tsconfig.json`.
- `~/*` maps to `./src/*` in `tsconfig.json`.
- Prefer `@/` imports for app code. Use relative imports inside `convex/` when importing generated Convex refs or shared source modules, as in `convex/schema.ts`.

**Boundaries:**
- Import domain behavior from `src/modules/<domain>/public.ts` or approved `<domain>.functions.ts`/`<domain>.actions.ts` seams. Example: `src/routes/api.businesses.search.ts` imports `registrySearchAction` and `legacyPublicRegistrySearch`, not registry internals.
- Add assistant-exposed operations in `src/modules/*/<module>.actions.ts` and register them explicitly in `src/modules/actions/index.ts`. Do not rely on side-effect imports for registration.
- Convex schema composition is centralized in `convex/schema.ts`, which imports table fragments such as `src/modules/catalog/internal/schema.ts` and `src/modules/security/internal/schema.ts`.

## Error Handling

**Patterns:**
- Return discriminated result objects for domain and server-flow errors. Use `kind`, `code`, and `retryable` rather than throwing through public APIs. Examples: `ServerErrorResult` in `src/modules/inquiries/inquiry.functions.ts`, `ModuleResult` in `src/modules/common/result.ts`.
- Use Zod parsing at HTTP/action/server-function boundaries before calling domain code. Examples: `publicInquirySubmitSchema` in `src/modules/inquiries/inquiry.functions.ts`, action schemas in `src/modules/registry/registry.actions.ts`.
- Map infrastructure exceptions into boundary-safe errors. `inquirySourceError` and `ownerSourceError` in `src/modules/inquiries/inquiry.functions.ts` translate `SourceWriteAdmissionError` and `ConvexSourceError` into typed results.
- Route handlers return structured JSON errors with stable codes. `jsonError` in `src/routes/api.agent.tools.ts` returns `{ kind: 'error', code, retryable: false, reason }`.
- Throw only for programming invariants or impossible states: duplicate action IDs in `src/modules/actions/index.ts`, empty branded IDs in `src/modules/common/ids.ts`, and impossible test branches in `tests/unit/business-action/stripe-checkout-evidence.test.ts`.
- For AE product boundaries, public and assistant-facing behavior must not imply booking, charging, dispatch, auto-fulfilment, availability, quotes, or job acceptance. Boundary copy is codified in `src/modules/registry/registry.actions.ts`, `src/modules/inquiries/inquiry.actions.ts`, and copy tests under `tests/copy/`.

## Logging

**Framework:** Sentry, PostHog/funnel events, source-owned audit records, and limited console usage.

**Patterns:**
- Use observability helpers instead of ad hoc console logging in runtime app code. Server exception capture lives in `src/lib/observability/sentry.server.ts`; client/server config lives in `src/lib/observability/config.ts`.
- Redact or suppress sensitive payloads before telemetry. `scrubSensitiveEvent` in `src/lib/observability/sentry.server.ts` drops events with sensitive query keys, and `src/modules/observability/internal/redaction.ts` redacts sensitive payload keys.
- Record product events through funnel/observability modules such as `src/modules/observability/funnel.functions.ts` and `src/lib/observability/funnel-client.ts`.
- Persist consequential source changes as audit/operation records through module-owned source state. Examples: `convex/inquiries.ts`, `convex/protectedActionStore.ts`, and `src/modules/common/audit-events.ts`.
- Console output is reserved for scripts/tests such as `tests/scripts/assert-graph-fresh.ts`; avoid adding console calls in `src/**` or `convex/**` runtime paths.

## Comments

**When to Comment:**
- Add short orienting comments for cross-surface contracts, product boundaries, and non-obvious adapters. Examples: `src/modules/common/action.ts`, `src/modules/actions/index.ts`, and `src/routes/api.agent.tools.ts`.
- Do not narrate simple assignments or obvious control flow. Let typed names and result contracts carry ordinary intent.
- In public/assistant-facing contracts, comments and summary strings must be boundary-honest: AE reads, compares, summarizes, routes, and can submit qualified inquiries when published; it does not book, charge, dispatch, or auto-fulfil.

**JSDoc/TSDoc:**
- Use JSDoc for exported contracts that fan out across surfaces, especially actions and route contracts. `src/modules/common/action.ts` documents the action contract and registration rules.
- Use test file comments only for environment or scoped rationale. `tests/unit/chat/ae-chat-route-promotion.test.tsx` and `tests/unit/observability/error-boundary-client.test.tsx` use `@vitest-environment jsdom`.

## Function Design

**Size:** Keep route handlers thin and move domain logic into module functions. `src/routes/api.agent.tools.ts` adapts `Request` to action execution; `src/modules/harness/public.ts` and `src/modules/actions/index.ts` own tool/action behavior.

**Parameters:** Use a single typed parameter object for commands and side-effecting operations. Examples: `submitInquiryLocal` call args in `src/modules/inquiries/inquiry.functions.ts`, `createStripeCheckoutSessionEvidence` args in `tests/unit/business-action/stripe-checkout-evidence.test.ts`.

**Return Values:** Prefer exact discriminated unions and readonly public DTOs. Public results use stable `kind`/`code` values in `src/modules/registry/public.ts`, `src/modules/inquiries/public.ts`, and `src/modules/common/result.ts`.

**State and Injection:**
- Keep test seams explicit and resettable: `setPublicRegistrySourcePortForTests` in `src/modules/registry/registry.functions.ts`, `setCatalogSearchBackendForTests` in the same file, `installAnswerThreadTestPort` in `tests/helpers/answer-thread-test-port.ts`.
- Derive authority server-side. `convex/authz.ts` derives business actors from Convex Clerk identity and ignores browser-supplied authority payloads.
- Read environment values through small trimming helpers and fail closed for secrets. Examples: `readRequiredSourceWriteSecret` in `src/lib/server/source-write-admission.ts`, `readObservabilityServerConfig` in `src/lib/observability/config.ts`.

## Module Design

**Exports:** Use `public.ts` files as the approved barrel/seam for each domain. `src/modules/catalog/public.ts` re-exports selected internals and route-safe public contracts; sibling modules and routes should import through this seam.

**Barrel Files:** Use barrels for intentional public boundaries only. Avoid broad `index.ts` barrels except for central registries such as `src/modules/actions/index.ts`.

**Internal Modules:** Keep implementation details under `src/modules/<domain>/internal/`. Cross-domain imports into another domain's `internal/` directory are rejected by `tests/imports/private-imports.test.ts`.

**Server Functions:** Put TanStack server functions and source-port bridges in `*.functions.ts`. Examples: `src/modules/inquiries/inquiry.functions.ts`, `src/modules/registry/registry.functions.ts`, `src/modules/billing/billing.functions.ts`.

**Actions:** Declare cross-surface operations with `defineAction` in `*.actions.ts`, include `summary`, `boundaries`, Zod `schema`, `outputSchema`, `parameters`, `readOnly`, and `surfaces`, then register in `src/modules/actions/index.ts`.

**Convex:** Follow the local Convex guideline file `convex/_generated/ai/guidelines.md`: define validators for all function args, keep sensitive functions internal, derive auth from `ctx.auth`, prefer indexed bounded reads, and keep actions separate from query/mutation files when Node APIs are needed. Current code composes schema in `convex/schema.ts` and tests schema/index contracts in `tests/unit/schema/convex-schema.test.ts`.

**UI:** Use Astryx primitives first for UI under `src/components/ae/**` and routes under `src/routes/**`. `src/components/ae/layout/AePublicShell.tsx` and `src/components/ae/listing/AeProviderListingPage.tsx` show the expected Astryx-era component usage. Tailwind utilities are layout glue; avoid bespoke visual drift flagged by `tests/ui-contract/class-scan.test.ts`.

---

*Convention analysis: 2026-07-03*
