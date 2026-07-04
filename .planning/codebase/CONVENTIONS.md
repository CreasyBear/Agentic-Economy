# Coding Conventions

**Analysis Date:** 2026-07-04

## Naming Patterns

**Files:**
- Use domain folders under `src/modules/<domain>/`; keep exported seams in `src/modules/<domain>/public.ts`, HTTP/TanStack server functions in `src/modules/<domain>/<domain>.functions.ts`, assistant/action contracts in `src/modules/<domain>/<domain>.actions.ts`, and private implementation in `src/modules/<domain>/internal/*`.
- Use TanStack file-route names in `src/routes/`, including dotted API names and dynamic segments: `src/routes/api.agent.tools.ts`, `src/routes/api.businesses.$slug.ts`, `src/routes/$slug.inquiry.tsx`, `src/routes/owner.inquiries.$threadId.tsx`.
- Use PascalCase component files for React components in `src/components/ae/*` and `src/components/astryx/*`, for example `src/components/ae/chat/AeFollowUpChips.tsx` and `src/components/astryx/RouterLink.tsx`.
- Use lower-kebab or descriptive domain filenames for pure modules and tests: `src/modules/registry/internal/search-documents.ts`, `src/modules/security/source-write-admission.ts`, `tests/unit/registry/search-documents.test.ts`.
- Do not add new `src/components/ui/*` wrappers, shadcn/radix/cva presentation components, handwritten CSS files, font packages, or new `Ae*` presentation systems. Use Astryx first per `DESIGN.md`, and put swizzled Astryx code in `src/components/astryx/`.

**Functions:**
- Use lower camelCase verb phrases for functions: `listActions`, `describeActionForAgent`, `readPublicRegistrySearchPage`, `sourceWriteAdmissionFromRequest`, `validatePublicInquiryFormInput`.
- Use `handle*Request` / `handle*` for route-handler entry points exported from `src/routes/*`, for example `handleInvokeAgentTool` in `src/routes/api.agent.tools.ts` and `handleBusinessDetailRequest` in `src/routes/api.businesses.$slug.ts`.
- Use `*Server` suffix for TanStack server function values: `submitPublicInquiryServer` in `src/modules/inquiries/inquiry.functions.ts`.
- Use `create*`, `read*`, `submit*`, `resolve*`, `build*`, `validate*`, and `normalize*` consistently for pure domain operations in `src/modules/*/internal/*`.

**Variables:**
- Use lower camelCase for locals and module constants: `sentryPluginEnabled`, `registrySearchInputSchema`, `submitParameters`, `emptyInquiryFormInput`.
- Use `*Values` readonly arrays plus indexed-access union types for closed domains: `IndexStatusValues` / `IndexStatus` in `src/modules/registry/public.ts`, `ResultKindValues` / `ResultKind` in `src/modules/common/result.ts`.
- Use `as const` and `satisfies` to keep literal contracts exact: `cspModes` in `src/lib/http/security-headers.ts`, `staticSecurityHeaders` in `tests/unit/http/security-headers.test.ts`.
- Use branded IDs from `src/modules/common/ids.ts` instead of plain strings where the domain exposes a brand: examples appear in `tests/integration/discovery-routes.test.ts`.

**Types:**
- Use PascalCase for exported types and discriminated-union contracts: `ActionDefinition`, `PublicInquirySubmitServerResult`, `PublicBusinessCatalogDetailResult`, `RegistryProjectionAttemptContract`.
- Prefer exact discriminated unions with `kind`, `code`, `status`, or named literal values over broad strings. This is enforced by `scanTypeScriptStandards` in `src/lib/ui/contract-scans.ts` and `tests/imports/ts-standards.test.ts`.
- Keep Zod schemas aligned with exported type contracts. Type-contract tests use `expectTypeOf` in `tests/types/domain-contracts.test.ts`.

## Code Style

**Formatting:**
- Formatting is convention-driven; no repo-owned `.prettierrc`, `prettier.config.*`, `eslint.config.*`, `.eslintrc*`, or `biome.json` is detected at the repo root.
- Use TypeScript with strict compiler settings from `tsconfig.json`: `strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `useUnknownInCatchVariables`, `noImplicitOverride`, `isolatedModules`, and `noEmit`.
- Match the observed source style: 2-space indentation, single quotes, no semicolons, trailing commas in multiline calls/objects, and blank lines between import groups.
- Keep object-spread conditionals for optional fields instead of writing `undefined` into exact optional properties, as in `src/modules/registry/registry.actions.ts` and `src/routes/api.agent.tools.ts`.
- Avoid explicit `any`, non-null assertions, double casts through `unknown`, `v.any()`, broad `status: string`, hard-coded CSRF literals, and client-exposed source-write secret names. These rules are enforced in `src/lib/ui/contract-scans.ts` and `tests/imports/ts-standards.test.ts`.

**Linting:**
- Traditional linting is not detected. Use `npm run typecheck` for TypeScript checks and the Vitest guardrail suites as lint-like enforcement.
- Import boundaries are enforced by `tests/imports/private-imports.test.ts`, `tests/imports/route-boundary.test.ts`, `tests/imports/source-mining.test.ts`, `tests/imports/backup-imports.test.ts`, and `tests/imports/ts-standards.test.ts`.
- UI class drift is enforced by `tests/ui-contract/class-scan.test.ts`; public copy and capability overclaims are enforced by `tests/copy/*`.

## Import Organization

**Order:**
1. Node built-ins or external packages, for example `node:http`, `vitest`, `@tanstack/react-router`, `@astryxdesign/core/*`, `convex/*`, `zod`.
2. Internal `@/` imports from public seams, server seams, components, hooks, and libraries, for example `@/modules/actions`, `@/modules/registry/public`, `@/components/ae/feedback/AeEmptyState`.
3. Relative imports for same-package helpers and route-local utilities, for example `./internal/search`, `./api.businesses`, `../styles/globals.css?url`.

**Path Aliases:**
- `tsconfig.json` defines `@/*` and `~/*` to `./src/*`; use `@/` in source and tests.
- Do not import `src/modules/<domain>/internal/*` across module or route boundaries. Use `src/modules/<domain>/public.ts`, `src/modules/<domain>/server.ts`, or `<domain>.functions.ts` seams. The allowed internal-import exceptions are module `public.ts` files and Convex schema composition in `convex/schema.ts`.
- Routes should stay adapters over module seams. Do not import Convex schema or Convex transport directly from `src/routes/*`; `tests/imports/route-boundary.test.ts` guards this.

## Error Handling

**Patterns:**
- Domain operations return discriminated result unions rather than throwing for expected states. Shared helpers live in `src/modules/common/result.ts`, with shapes like `{ kind: 'ok', code, ...payload }` and `{ kind: 'error', code, retryable, ...payload }`.
- HTTP route handlers return JSON error objects with stable codes and statuses, as in `jsonError` in `src/routes/api.agent.tools.ts`.
- Use Zod `.parse` for trusted server-function validators and `.safeParse` for request-body validation where the route must return a structured 400, as in `src/routes/api.agent.tools.ts`.
- Throw `Error` for programmer/configuration failures and impossible test-fixture states, for example `requiredEnv` in `convex/auth.config.ts` and explicit fixture assertions in `tests/integration/discovery-routes.test.ts`.
- Keep AE boundaries explicit in all assistant/action errors and summaries: AE may read, compare, summarize, and route qualified inquiries; it does not book, charge, dispatch, guarantee availability, or auto-fulfil. Action definitions in `src/modules/registry/registry.actions.ts` and `src/modules/inquiries/inquiry.actions.ts` show the required `summary` and `boundaries` pattern.

## Logging

**Framework:** console plus observability wrappers

**Patterns:**
- Use `console` sparingly in runtime code; Convex guidance permits it for action examples, but domain code mostly returns structured readbacks instead of logging.
- Browser/server observability is centralized under `src/lib/observability/*` and `src/modules/observability/*`. Add funnel, audit, operation-key, Sentry, or PostHog behavior through those files instead of route-local logging.
- Redact private payloads and raw provider details before logging or returning readbacks. Tests such as `tests/unit/observability/audit-redaction.test.ts`, `tests/unit/observability/vendor-integrations.test.ts`, and `tests/unit/convex/notification-outbox-runtime.test.ts` guard this posture.

## Comments

**When to Comment:**
- Use module-level comments for architectural contracts that future edits must preserve, as in `src/modules/common/action.ts`, `src/modules/actions/index.ts`, `src/components/astryx/RouterLink.tsx`, and `src/styles/globals.css`.
- Use short comments for non-obvious runtime constraints, such as the Astryx SSR bundling note in `vite.config.ts` and the source-write admission comments in `src/modules/common/action.ts`.
- Avoid comments that restate obvious assignments or control flow.

**JSDoc/TSDoc:**
- Use TSDoc-style block comments for public contracts and adapters, especially action contracts and central registries: `src/modules/common/action.ts`, `src/modules/actions/index.ts`.
- Public functions do not require JSDoc when their names and types are self-explanatory; prefer precise type names and result unions.

## Function Design

**Size:** Keep route handlers and pure helpers focused; extract state-machine logic into module internals.
- Routes in `src/routes/*` should validate request/search input, call module seams, and render/return the result.
- Domain rules belong in `src/modules/<domain>/internal/*`, for example `src/modules/inquiries/internal/commands.ts` and `src/modules/registry/internal/search.ts`.
- Large state machines can stay in a single internal file when helpers are private and tests cover the behavior; do not move logic into routes to make files smaller.

**Parameters:** Use named object parameters for multi-field commands and options.
- Examples: `submitPublicInquiryThroughSource(data, context)` in `src/modules/inquiries/inquiry.functions.ts`, `sourceWriteAdmissionFromRequest({ request, scope, operationKey, correlationId })` in `src/lib/server/source-write-admission.ts`.
- Pass dependencies through options for testability instead of mutating globals, for example DNS/fetch options in `src/modules/storefront/internal/import-draft.ts` as tested by `tests/unit/storefront/import-draft.test.ts`.

**Return Values:** Use exact contracts.
- Use discriminated unions for domain outcomes and errors.
- Use `readonly` arrays/objects for public data contracts where mutation is not intended.
- Use public DTO/readback types for route and assistant payloads: `PublicBusinessCatalogApiDto`, `PublicInquiryRouteReadback`, `AgentToolDescriptor`.

## Module Design

**Exports:** Public seams are explicit.
- Re-export domain operations and types from `src/modules/<domain>/public.ts`; do not rely on side-effect registration.
- Register assistant/action operations explicitly in `src/modules/actions/index.ts`. New action-backed operations belong in `src/modules/*/<module>.actions.ts` and must include `summary`, `boundaries`, `schema`, `parameters`, `readOnly`, `surfaces`, `outputSchema`, and `run`.
- Convex schema composition happens in `convex/schema.ts`, importing table definitions from module internal schema files such as `src/modules/registry/internal/schema.ts`.

**Barrel Files:** Use constrained domain barrels, not global barrels.
- `src/modules/actions/index.ts` is the action registry and action barrel.
- `src/modules/<domain>/public.ts` files are domain public barrels.
- Avoid broad cross-domain barrels that hide ownership boundaries.

**UI Conventions:**
- `DESIGN.md` is the visual authority and `.ui-craft/brief.md` / `.ui-craft/tokens.md` record project UI constraints.
- Use Astryx components from `@astryxdesign/core` with `@astryxdesign/theme-neutral`; providers are wired in `src/routes/__root.tsx`.
- Use Tailwind 4 as layout glue only: spacing, grid/flex, responsive constraints, and viewport behavior. Do not use raw color utilities, arbitrary visual tokens, `transition-all`, route-local shadows, hard-coded z-index layers, or `space-x/space-y`; `tests/ui-contract/class-scan.test.ts` guards these rules for `src/routes` and `src/components/ae`.
- Keep public human copy free of internal architecture terms and epistemic labels. `KNOWN`, `UNKNOWN`, `UNAVAILABLE`, and `NEXT_STEP` belong only in JSON/API/agent payload and owner/admin contexts named in `AGENTS.md`.

**Convex Conventions:**
- Read `convex/_generated/ai/guidelines.md` before editing Convex code.
- Always include validators for Convex functions and exact `returns` validators where functions return public contracts, as in `convex/registry.ts`.
- Use `queryGeneric`/Convex function decorators with validators; never register functions through `api` or `internal` objects.
- Use indexes and bounded reads (`take`, pagination, `unique`) instead of unbounded scans; `tests/unit/convex/registry-runtime.test.ts` asserts bounded registry reads.
- Keep Node runtime actions separated with `"use node"` only when Node built-ins are needed, and never mix Node actions with queries/mutations in one Convex file.

---

*Convention analysis: 2026-07-04*
