# Coding Conventions

**Analysis Date:** 2026-07-03

## Naming Patterns

**Files:**
- Use kebab-case for route and module implementation files: `src/routes/api.agent.tools.ts`, `src/routes/privacy.remove-business.tsx`, `src/modules/protected-action/contact-follow-up.functions.ts`.
- Use TanStack Router file-route names in `src/routes/`: `$` marks params (`src/routes/$slug.tsx`, `src/routes/t.$threadId.tsx`), `[.]` escapes literal dots (`src/routes/llms[.]txt.ts`, `src/routes/robots[.]txt.ts`), and dotted segments express nested paths (`src/routes/owner.business-actions.$requestId.tsx`).
- Use module folders under `src/modules/<domain>/` with `public.ts` as the public seam, `internal/` for private implementation, `<domain>.functions.ts` for TanStack server functions, and `<domain>.actions.ts` only for action registry entries: `src/modules/registry/public.ts`, `src/modules/registry/internal/search.ts`, `src/modules/registry/registry.functions.ts`, `src/modules/registry/registry.actions.ts`.
- Use `*.schema.ts` / `internal/schema.ts` for durable schema fragments and runtime record contracts: `src/modules/answer-thread/answer-thread.schema.ts`, `src/modules/business-action/internal/schema.ts`, `src/modules/security/internal/schema.ts`.
- Use `*.test.ts` and `*.test.tsx` under `tests/` for Vitest and `*.spec.ts` under `tests/e2e` or `tests/deploy-smoke` for Playwright: `tests/unit/business/claim.test.ts`, `tests/unit/chat/ae-answer-checks.test.tsx`, `tests/e2e/public-owner-ui.spec.ts`.

**Functions:**
- Use camelCase verbs for domain functions and keep names action-oriented: `claimBusiness` in `src/modules/business/internal/claim.ts`, `buildPublicCatalogDto` in `src/modules/catalog/internal/catalog-model.ts`, `submitPublicInquiryThroughSource` in `src/modules/inquiries/inquiry.functions.ts`.
- Prefix constructor-like helpers with `create`, `build`, `read`, `validate`, `submit`, `record`, `sync`, or `retry` according to effect: `createEmptyBusinessSourceState`, `buildFirstRequestDisclosure`, `readPublicCatalogActivationRef`, `validateServiceCatalogInput`, `retryRegistryProjection`.
- Use `handle*Request` for route-handler entry points: `handleInvokeAgentTool` in `src/routes/api.agent.tools.ts`, `handleRecordOwnerActivationEvent` in `src/routes/api.observability.funnel.ts`.
- Use `*ThroughSource` for server functions that call the Convex source adapter or equivalent source seam: `readCurrentOwnerInboxThroughSource` in `src/modules/inquiries/inquiry.functions.ts`, `recordOwnerActivationThroughSource` in `src/modules/observability/funnel.source.ts`.
- Use `set*ForTests` / `with*ForTest` for injectable test seams and always return/reset them around the test body: `setPublicRegistrySourcePortForTests` in `src/modules/registry/registry.functions.ts`, `withRegistrySourcePortForTest` in `tests/helpers/source-ports.ts`.

**Variables:**
- Use lower camelCase for locals and explicit booleans: `hasQuery`, `isEmpty`, `sentryPluginEnabled`, `usesLocalE2eBypass`.
- Use `Values` suffix for literal arrays that define exact unions: `ClaimStatusValues` in `src/modules/business/public.ts`, `FirstRequestModeValues` in `src/modules/catalog/internal/catalog-model.ts`, `OperatorControlKeyValues` in `src/modules/observability/internal/literals.ts`.
- Use `Schema` suffix for Zod validators derived from value arrays: `AdminRoleSchema` in `src/modules/security/internal/validators.ts`, `IndexStatusSchema` in `src/modules/registry/internal/validators.ts`.
- Use `Input`, `Command`, `Result`, `Contract`, `Record`, `Readback`, `State`, and `Adapter` suffixes for domain shapes: `ClaimBusinessCommand`, `PublicCatalogContract`, `RegistryProjectionAttemptContract`, `OwnerInboxReadback`, `RegistryProjectionAdapter`.
- Use `operationKey`, `correlationId`, `sourceHash`, `businessId`, `serviceId`, and `ownerId` as canonical domain field names; keep them branded at module boundaries through `src/modules/common/ids.ts`.

**Types:**
- Define exact unions from exported `as const` value arrays, not broad strings:
```typescript
export const PublicStatusValues = ['unpublished', 'published', 'suppressed'] as const
export type PublicStatus = (typeof PublicStatusValues)[number]
```
Use the same pattern in `src/modules/business/public.ts`, `src/modules/catalog/internal/catalog-model.ts`, and `src/modules/observability/internal/literals.ts`.
- Prefer discriminated result unions with `kind`, `code`, `retryable`, and `reason` over thrown control-flow errors: `ModuleResult` in `src/modules/common/result.ts`, `ClaimBusinessResult` in `src/modules/business/public.ts`, `PublicInquirySubmitServerResult` in `src/modules/inquiries/inquiry.functions.ts`.
- Use branded IDs for source-owned identifiers instead of bare strings: `BusinessId`, `ServiceId`, `OperationKey`, `CorrelationId`, and `SourceHash` in `src/modules/common/ids.ts`.
- Use `Readonly`, `readonly` arrays, and literal properties for boundary contracts where mutation is not part of the API: `ActionDefinition` in `src/modules/common/action.ts`, `RegistryProjectionReadback` in `src/modules/registry/public.ts`.

## Code Style

**Formatting:**
- Use TypeScript/TSX with 2-space indentation, single quotes, trailing commas for multiline calls/objects, no semicolons, and concise object spreads. Examples: `src/modules/registry/registry.actions.ts`, `src/routes/registry.tsx`, `tests/unit/business/claim.test.ts`.
- There is no project Prettier, ESLint, or Biome config detected. Formatting is enforced by existing source style, `npm run typecheck`, and guardrail tests in `tests/imports/ts-standards.test.ts`.
- Keep optional properties exact under `exactOptionalPropertyTypes`: add optional keys with conditional spreads instead of assigning `undefined`.
```typescript
return {
  businessId,
  ...(input.context.postcode === undefined ? {} : { postcode: input.context.postcode }),
}
```
This pattern is used in `src/modules/catalog/internal/catalog-model.ts`, `src/modules/inquiries/inquiry.functions.ts`, and `src/lib/server/convex-source.ts`.
- Use numeric separators for large test times and limits (`60_000`, `1_000`) as in `tests/unit/business/claim.test.ts` and `tests/unit/registry/search-sync.test.ts`.

**Linting:**
- No standalone linter config is detected. Treat the Vitest scan suite as the practical lint layer:
  - `tests/imports/ts-standards.test.ts` rejects `any`, double casts through `unknown`, non-null assertions, `v.any()`, broad status strings, and client-exposed source-write secrets.
  - `tests/imports/private-imports.test.ts` requires module public seams outside same-module ownership.
  - `tests/imports/route-boundary.test.ts` keeps routes from owning Convex transport, Convex schema imports, or private module internals.
  - `tests/ui-contract/class-scan.test.ts` rejects raw colors, `space-x/space-y`, `transition-all`, hardcoded z-index layers, raw overlays, generic shadows, and arbitrary visual tokens in product routes/components.
- Run `npm run test:ts-standards`, `npm run test:imports`, `npm run test:source-mining`, `npm run test:copy`, and `npm run test:ui-contract` for guardrail coverage. The aggregate command is `npm run test:all` in `package.json`.
- Convex-specific rules come from `convex/_generated/ai/guidelines.md`: include argument validators on every Convex function, prefer indexes over filters, keep actions out of direct DB access, derive auth from `ctx.auth.getUserIdentity()`, and avoid unbounded `collect()` reads.

## Import Organization

**Order:**
1. Node built-ins and external libraries first: `node:fs`, `@tanstack/react-router`, `@tanstack/react-start`, `zod`, `@astryxdesign/core/*`, `lucide-react`.
2. Absolute app imports via `@/` next: components, libs, module public seams, and shared types.
3. Relative imports last for same-module `internal/` implementation details and local helper files.

Examples:
- `src/routes/registry.tsx` imports React/TanStack/Zod/Astryx/Lucide first, then `@/components`, `@/lib`, and `@/modules`.
- `src/modules/registry/public.ts` imports cross-module public types first, then relative `./internal/*` implementations.
- `tests/seo/discovery-files.test.ts` imports Vitest, module public seams, route handlers, and local helpers.

**Path Aliases:**
- Use `@/*` for app imports in runtime and tests. The alias is configured in `tsconfig.json` and `convex/tsconfig.json`.
- `~/*` also maps to `src/*` in `tsconfig.json`, but current source convention favors `@/*`.
- Do not import `src/modules/<domain>/internal/*` from routes or sibling modules. Use `src/modules/<domain>/public.ts`, `src/modules/<domain>/<domain>.functions.ts`, or domain action files.
- Convex runtime files under `convex/` use relative imports into generated Convex APIs and selected source modules: `convex/catalog.ts`, `convex/registry.ts`, `convex/source_state.ts`.

## Error Handling

**Patterns:**
- Domain functions return discriminated unions for expected failures. Use `{ kind: 'error', code, retryable, reason }` rather than throwing for validation, authorization, idempotency, support-gate, or source-write failures. Examples: `claimBusiness` in `src/modules/business/internal/claim.ts`, `publishBusinessCatalog` in `src/modules/catalog/internal/publish.ts`, `submitInquiry` in `src/modules/inquiries/internal/commands.ts`.
- Throw only for invariant violations, impossible internal state, fail-loud configuration, or test setup. Examples: `brandNonEmpty` in `src/modules/common/ids.ts`, production Clerk bypass guard in `src/routes/__root.tsx`, deploy-smoke env validation in `tests/deploy-smoke/phase1-deploy-smoke.spec.ts`.
- Route handlers parse input, map validation failures to JSON error responses, and preserve no-store/JSON headers where applicable. Examples: `src/routes/api.agent.tools.ts`, `src/routes/api.observability.funnel.ts`, `src/routes/api.business-actions.stripe-webhook.ts`.
- Server seams catch source/client/provider errors and convert them to typed server results. Examples: `inquirySourceError` / `ownerSourceError` patterns in `src/modules/inquiries/inquiry.functions.ts`, `ConvexSourceError` in `src/lib/server/convex-source.ts`, `SourceWriteAdmissionError` in `src/lib/server/source-write-admission.ts`.
- Preserve AE boundaries in every error surface: do not leak raw provider payloads, private contact text, source hashes on public pages, secrets, or internal architecture vocabulary. Copy scans in `tests/copy/phase1-banned-copy.test.ts` and UI/browser assertions in `tests/e2e/public-owner-ui.spec.ts` enforce this.

## Logging

**Framework:** Sentry/PostHog plus limited `console` in CLI scripts.

**Patterns:**
- Client errors go through `src/lib/observability/sentry.client.ts`; server errors go through `src/lib/observability/sentry.server.ts`. Both scrub request URLs containing query keys like `token`, `secret`, `password`, `email`, or `phone`.
- Server request middleware in `src/start.ts` wraps requests in a Sentry isolation scope, tags `ae.path`, captures thrown errors, and flushes PostHog without blocking response cleanup.
- Client funnel events use `emitFunnelEvent` in `src/lib/observability/funnel-client.ts`, send browser analytics via `src/lib/observability/capture-client-events.ts`, and sync source events through `/api/observability/funnel`.
- Do not add ad hoc runtime `console.log`. Console output is confined to CLI/test utilities such as `tests/scripts/assert-graph-fresh.ts` and eval scripts in `eval/answer/scripts/`.
- Background/analytics failures that must not block user flows are swallowed with a narrow comment explaining the boundary, as in `src/lib/observability/funnel-client.ts`.

## Comments

**When to Comment:**
- Use comments to explain contracts, boundaries, source-of-truth decisions, and non-obvious integration constraints. Examples: action registry comments in `src/modules/actions/index.ts`, quiet agent door comments in `src/routes/api.agent.tools.ts`, Astryx SSR bundling comment in `vite.config.ts`.
- Keep comments sparse inside straightforward domain logic. Domain function names and typed unions should carry most intent.
- Add comments before unusual safety choices, such as the string-split public secret-name guard in `src/lib/server/source-write-admission.ts`.

**JSDoc/TSDoc:**
- Use short block comments for public module abstractions and route-level contracts: `src/modules/common/action.ts`, `src/modules/registry/registry.actions.ts`, `src/routes/api.agent.tools.ts`.
- Use file-level CSS comments for style cascade and token ownership: `src/styles/globals.css`.
- Do not use JSDoc as a substitute for exact TypeScript contracts; export real types from module public seams.

## Function Design

**Size:** Keep pure domain functions focused around one command/readback. Larger server seam files are acceptable when they group related transport adapters, but new domain rules should stay in `internal/` domain files and be surfaced through `public.ts`. Examples: `src/modules/inquiries/internal/commands.ts` owns inquiry state transitions while `src/modules/inquiries/inquiry.functions.ts` owns server/source transport.

**Parameters:** Prefer one typed command/input object for functions with more than two values. Include `state`, `actor`/`authority`, `security`, `operationKey`, `correlationId`, and `now` explicitly when a function mutates source-owned state. Examples: `ClaimBusinessCommand` in `src/modules/business/public.ts`, `PublishBusinessCatalogCommand` in `src/modules/catalog/internal/catalog-model.ts`, `SetOperatorControlCommand` in `src/modules/observability/public.ts`.

**Return Values:** Return exact discriminated unions. Include stable `code` values for every branch and `retryable` on error results. For public APIs, return DTO subsets rather than raw records; examples include `PublicBusinessCatalogApiDto` in `src/modules/registry/public.ts` and route DTO builders in `src/modules/catalog/public.ts`.

**Validation:** Use Zod for route/server/action input schemas (`src/modules/inquiries/inquiry.functions.ts`, `src/modules/registry/registry.actions.ts`) and Convex validators for Convex args/schema (`convex/schema.ts`, `src/modules/*/internal/schema.ts`). Keep Zod validators synchronized with domain value arrays through tests like `tests/types/domain-contracts.test.ts`.

**Async:** Async functions should return promises of typed results and catch only at the boundary layer. Pure domain modules remain synchronous where possible (`src/modules/business/internal/claim.ts`, `src/modules/catalog/internal/catalog-model.ts`).

## Module Design

**Exports:** Use `src/modules/<domain>/public.ts` as the only cross-module/public export seam for domain behavior and contracts. It should re-export selected internal implementations with `Impl` aliases internally and exported stable names externally, as in `src/modules/catalog/public.ts`, `src/modules/inquiries/public.ts`, and `src/modules/observability/public.ts`.

**Barrel Files:** Use barrels sparingly and deliberately:
- `src/modules/actions/index.ts` is the explicit action registry and action API barrel.
- `src/modules/<domain>/public.ts` is a domain seam, not a convenience dumping ground.
- Avoid new broad barrels that hide ownership or let routes import private internals.

**Actions:** New assistant/human operation contracts go in `src/modules/*/<module>.actions.ts` and must be imported into `src/modules/actions/index.ts`. Each action needs a boundary-honest `summary`, explicit `boundaries`, strict `schema`, strict `outputSchema`, `readOnly`, `surfaces`, and one source implementation. Existing examples: `src/modules/registry/registry.actions.ts`, `src/modules/inquiries/inquiry.actions.ts`.

**Routes:** Keep routes thin. Routes validate URL/search/input, call module server functions/public seams, and render/return the result. They do not import Convex schema, own Convex transport, or reach into module `internal/`. The guardrail is `tests/imports/route-boundary.test.ts`.

**Convex:** Keep Convex runtime files domain-oriented under `convex/` and use module-owned schema fragments under `src/modules/*/internal/schema.ts` composed by `convex/schema.ts`. Follow `convex/_generated/ai/guidelines.md`: validators on every function, indexed queries, bounded reads, `internal*` for sensitive functions, and server-derived auth.

**UI:** Use Astryx primitives and templates first. `src/routes/__root.tsx` wires `Theme`, `LinkProvider`, and `LayerProvider`; `src/components/astryx/RouterLink.tsx` adapts Astryx links. Tailwind classes are layout glue only. New code should not add bespoke `Ae*` presentation components, shadcn/radix/cva wrappers, extra CSS files, font packages, raw colors, blobs, glassmorphism, or gradient CTAs. Existing `src/components/ae/*` components are current surfaces but should compose Astryx rather than expanding a parallel design system.

---

*Convention analysis: 2026-07-03*
