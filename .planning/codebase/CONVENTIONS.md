# Coding Conventions

**Analysis Date:** 2026-07-17  
**Inspected revision:** `7deffac41e103ee619ce099db531fc2127ba9985`  
**last_mapped_commit:** `7deffac41e103ee619ce099db531fc2127ba9985`

## Naming Patterns

**Files:**
- Domain modules: kebab-case directories under `src/modules/<domain>/` (e.g. `customer-request`, `routing-kernel`)
- Domain seams: `<domain>.actions.ts`, `<domain>.functions.ts`, `public.ts`, `internal/*.ts`
- React components: PascalCase `.tsx` (e.g. `AeQueryPanel.tsx`, `RouteProgressBar.tsx`)
- Routes: TanStack file routes under `src/routes/` (dots for nested segments, e.g. `api.businesses.$slug.ts`)
- Tests: kebab-case with suffix — `*.test.ts` / `*.test.tsx` (Vitest), `*.spec.ts` (Playwright)
- Prefer kebab-case helpers (`search-documents.ts`, `source-write-admission.ts`); avoid inventing new `Ae*` presentation shells

**Functions:**
- camelCase for all functions (`searchPublicBusinessCatalog`, `defineAction`, `buildRegistrySearchDocumentsForCatalog`)
- No `async` prefix; async is expressed by return type
- Server/source adapters: `*Server`, `*ThroughSource` (e.g. in `<domain>.functions.ts`)
- Event handlers in UI: descriptive verbs (`onSubmit`, inline `() => undefined` in tests)

**Variables:**
- camelCase for locals and parameters
- UPPER_SNAKE_CASE for exported const arrays/enums of literals (`IndexStatusValues`, `PublicQuietAgentToolIds`)
- No underscore private prefix in TypeScript; keep helpers file-private by omitting exports

**Types:**
- PascalCase, no `I` prefix (`ActionDefinition`, `PublicBusinessCatalogApiDto`)
- Discriminated unions via `kind` string literals (`kind: 'ok' | 'error' | 'found' | 'denied'`)
- Status/result fields: const array + derived union (`export const XValues = [...] as const; export type X = (typeof XValues)[number]`)
- Branded IDs from `src/modules/common/ids.ts` (`BusinessId`, `Slug`, `brandNonEmpty`) — do not use bare strings for domain IDs at module boundaries
- Zod schemas live in module validators / function files; keep `.strict()` on action input/output objects

## Code Style

**Formatting:**
- No Prettier config; format to match surrounding files
- Single quotes for strings
- Semicolons required
- Trailing commas in multiline lists/objects
- 2-space indentation
- Prefer explicit spreads over optional-property assignment under `exactOptionalPropertyTypes` (see `tsconfig.json`)

**Linting:**
- Oxlint via `.oxlintrc.json`; run `npm run lint` (`oxlint src convex tests tools examples --deny-warnings`)
- TypeScript: `strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `useUnknownInCatchVariables`, `noImplicitOverride`
- Executable TS standards scan: `npm run test:ts-standards` — rejects `any`, `as unknown as`, non-null assertions (`!`), `v.any()` outside documented boundaries, broad `status: string`, hard-coded CSRF literals, `VITE_AE_SOURCE_WRITE_SECRET`

**Typecheck:**
- `npm run typecheck` (`tsc --noEmit`) before yielding TypeScript changes

## Import Organization

**Order:**
1. External packages (`vitest`, `react`, `zod`, `convex-test`, `@playwright/test`)
2. Path-aliased internals (`@/modules/...`, `@/lib/...`, `@/components/...`, `@/routes/...`)
3. Relative imports (`./internal/...`, `../../convex/...`)
4. Prefer `import type { ... }` for type-only imports

**Grouping:**
- Blank line between external and internal groups
- Keep imports at file top — no inline imports in function bodies (except documented lazy client loaders such as PostHog/Sentry)

**Path Aliases:**
- `@/*` and `~/*` → `src/*` (`tsconfig.json`)
- Operator route aliases: `@/routes/owner.*`, `@/routes/admin.*`, `@/routes/developers.discovery`
- Cross-module imports must use `src/modules/<domain>/public.ts` (or `<domain>.functions.ts` / actions) — never another module's `internal/`
- Routes must not import `modules/*/internal/*` (`tests/imports/route-boundary.test.ts`, `tests/imports/private-imports.test.ts`)

## Error Handling

**Patterns:**
- Domain outcomes: discriminated results via `src/modules/common/result.ts` (`ok` / `error` with `kind`, `code`, `retryable`) or module-specific `kind` unions (`found` / `not_found`, `denied`)
- Invariants and adapter failures: `throw new Error('...', { cause })` at boundaries
- Catch variables are `unknown`; narrow before use
- Do not use non-null assertions; use explicit undefined checks and throw, or early return

**Error Types:**
- Prefer typed `code` strings over free-form messages for expected failures
- Redact user-visible error text (`redactedMessage` / `redactedError` patterns on public paths)
- Source writes go through `SourceWriteAdmission` — never hard-code CSRF tokens or expose write secrets with a `VITE_` prefix

## Logging

**Framework:**
- Product telemetry: Sentry (`src/lib/observability/sentry.client.ts`, `sentry.server.ts`) and PostHog (`posthog.client.ts`, `posthog.server.ts`)
- Funnel/product events via observability module seams — not ad-hoc `console.log` in product paths
- `console.warn` appears only at operational hold points (e.g. notification dispatch); do not add new console logging as the default

**Patterns:**
- Capture exceptions at error boundaries (`AeObservabilityErrorBoundary`, `Sentry.captureException`)
- Sanitize telemetry payloads before send
- Never log secrets, raw contact fields, or source-write keys

## Comments

**When to Comment:**
- Explain boundary honesty, trust axis, and refusal rules on actions (`summary` / `boundaries` are part of the contract)
- Document documented exceptions (e.g. allowed `v.any()` JSON boundaries in contract scans)
- Prefer why over what; avoid narrating obvious control flow

**JSDoc/TSDoc:**
- Module-level and public-API blocks on action contracts (`src/modules/common/action.ts`) and public barrels
- Not required on every private helper

**TODO Comments:**
- Rare; prefer a tracked issue or phase plan over long-lived TODOs in source

## Function Design

**Size:**
- Keep handlers thin; put domain logic in `internal/` and call through `public.ts` / `*ThroughSource`
- One abstraction level per function; extract factories in tests rather than deepening production helpers

**Parameters:**
- Prefer options objects for multi-field inputs
- Under `exactOptionalPropertyTypes`, omit absent fields with conditional spreads:
  `...(value === undefined ? {} : { value })`

**Return Values:**
- Explicit returns; early guard clauses for missing state
- Exhaustive switches: assign `const _exhaustive: never = discriminant` in `default` (see `src/lib/ui/status-presentation.ts`, `src/lib/operator/navigation.ts`)

## Module Design

**Exports:**
- Named exports preferred
- `public.ts` re-exports clean names; import internals as `*Impl` then `export const x = xImpl`
- Register actions explicitly in `src/modules/actions/index.ts` — side-effect-only imports do not register under production bundling

**Barrel Files:**
- `public.ts` is the cross-module seam; `internal/` is private to the module
- Actions: `defineAction` in `<domain>.actions.ts`; schemas/runners from `<domain>.functions.ts` only
- UI: prefer `@astryxdesign/core` + `@astryxdesign/theme-neutral`; Tailwind for layout; tokens in `src/styles/tokens.css`
- Do not extend bespoke `Ae*` presentation systems for new visuals — re-skin onto Astryx when touching UI

**Public copy:**
- Boundary-honest nouns/verbs; no booking/payment/dispatch overclaims
- No internal vocabulary on human surfaces (`source-owned`, `readback`, `MCP`, `capability`, etc.) — enforce via `npm run test:copy`

---

*Convention analysis: 2026-07-17*  
*Update when patterns change*
