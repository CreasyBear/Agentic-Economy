# Coding Conventions

**Analysis Date:** 2026-07-17
**Inspected Revision:** `3aa46069a00724679020f7f3cb338cc4ee177591`

## Naming Patterns

**Files:**
- Use kebab-case for domain implementation and test files: `src/modules/customer-request/route-mandate-admission.ts`, `tests/unit/customer-request/route-mandate-admission.test.ts`.
- Use `<module>.actions.ts` for assistant-callable operations and `<module>.functions.ts` for server functions: `src/modules/demand/demand.actions.ts`, `src/modules/demand/demand.functions.ts`.
- Use `public.ts` as the supported module boundary and `internal/` for private implementation: `src/modules/registry/public.ts`, `src/modules/registry/internal/search-documents.ts`.
- Follow TanStack file-route names in `src/routes/`; `$parameter` marks a route parameter, `[.]` escapes a literal dot, and `_operator/` groups authenticated operator routes: `src/routes/api.requests.$requestRef.ts`, `src/routes/llms[.]txt.ts`, `src/routes/_operator/owner.inquiries.tsx`.
- Use PascalCase for React component files, including the existing `Ae*` components: `src/components/ae/chat/AeQueryPanel.tsx`. Do not add or extend bespoke `Ae*` presentation primitives; new UI uses Astryx components under the constraints in `DESIGN.md` and `.agents/skills/ae-design-system/SKILL.md`.

**Functions:**
- Use camelCase verbs that state the operation: `compileCustomerRequest`, `deriveRouteStepAuthority`, `buildRegistrySearchDocumentsForCatalog` in `src/modules/customer-request/compiler.ts`, `src/modules/customer-request/route-mandate-admission.ts`, and `src/modules/registry/internal/search-documents.ts`.
- Prefix constructors/projections with `create`, `build`, `derive`, `resolve`, `read`, `list`, or `get`; prefix admission and authorization checks with `admit`, `require`, or `assert`: `src/modules/security/public.ts`.
- Name React components and route components in PascalCase: `src/components/ae/chat/AeHomeComposer.tsx`, `src/routes/index.tsx`.

**Variables:**
- Use camelCase for values and UPPER_SNAKE_CASE for stable exported constants: `DEV_SEED_BUSINESS_COUNT` in `src/modules/dev/internal/dev-seed-fixture.ts`.
- Give identifiers semantic suffixes such as `Ref`, `Id`, `Digest`, `At`, `State`, `Input`, `Result`, and `Readback`: `src/modules/registry/public.ts`.
- Use `readonly` arrays and `as const` for closed vocabularies: `IndexStatusValues` in `src/modules/registry/public.ts`.

**Types:**
- Use PascalCase nouns and suffix boundary types with `Input`, `Command`, `Result`, `Contract`, `Record`, `State`, `Snapshot`, `Readback`, or `Adapter`: `src/modules/catalog/public.ts`, `src/modules/security/public.ts`.
- Derive literal unions from exported value arrays where runtime enumeration is needed: `RegistryProjectionStatusValues` and `RegistryProjectionStatus` in `src/modules/registry/public.ts`.
- Prefer discriminated unions keyed by `kind` for state and failure outcomes: `src/modules/customer-request/`, `src/modules/security/public.ts`.

## Code Style

**Formatting:**
- No repository Prettier or Biome configuration is present. Match the live TypeScript style: two-space indentation, single quotes, no semicolons, trailing commas in multiline literals, and compact braces; examples are `vitest.config.ts` and `src/modules/common/runtime-id.ts`.
- Keep JSX readable and use parentheses for multiline returns: `src/components/ae/chat/AeQueryPanel.tsx`.
- Do not hand-edit generated files under `convex/_generated/` or `src/routeTree.gen.ts`; generated files are excluded or separately checked by `tsconfig.json` and `package.json`.

**Linting:**
- Run `npm run lint`; it executes `oxlint src convex tests tools examples --deny-warnings` from `package.json`.
- Treat TypeScript as a quality gate: `tsconfig.json` enables `strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `useUnknownInCatchVariables`, and `noImplicitOverride`.
- Run `npm run test:ts-standards` for source-scanned standards and `npm run test:imports` for architectural boundaries; implementations live in `tests/imports/ts-standards.test.ts` and the other files under `tests/imports/`.

## Import Organization

**Order:**
1. Import third-party runtime dependencies first: `vitest`, `react`, `@tanstack/*`, `convex/*`.
2. Import project modules through `@/` when crossing module or directory boundaries: `@/modules/customer-request/compiler` in `convex/customerRequestRouteMandate.test.ts`.
3. Import same-directory files relatively, especially Convex generated references and schema: `./_generated/api`, `./schema` in `convex/customerRequestRouteMandate.test.ts`.
4. Put `import type` declarations alongside their source group and use type-only imports when no runtime value is required: `src/modules/actions/index.ts`.

**Path Aliases:**
- Use `@/*` or `~/*` for `src/*`; both are declared in `tsconfig.json`.
- Prefer `@/` in current source. Route aliases for owner/admin/developer routes are also declared in `tsconfig.json`.
- Do not import another module's private implementation. Use its `public.ts` boundary; this is enforced by `tests/imports/private-imports.test.ts` and module-specific boundary tests under `tests/imports/`.

## Error Handling

**Patterns:**
- Return typed discriminated results for expected domain outcomes instead of throwing: `{ kind: 'refused', reason: ... }`, `{ kind: 'conflict', reason: ... }`, and `{ kind: 'unavailable', reason: ... }` are asserted throughout `tests/integration/` and `convex/customerRequestRouteMandate.test.ts`.
- Throw `Error` only for violated programmer invariants, impossible fixture states, or boundary parse failures that cannot produce a valid domain result: `convex/customerRequestRouteMandate.test.ts`, `src/routes/api.requests.ts`.
- Parse untrusted inputs at the boundary with Zod or explicit validators, and keep server-owned values out of client payloads: `src/modules/demand/demand.functions.ts`, `src/modules/catalog/internal/validators.ts`.
- For Convex functions, declare validators for every public and internal function and use generated `api`/`internal` references according to `convex/_generated/ai/guidelines.md`.

## Logging

**Framework:** Sentry, PostHog, and controlled console output.

**Patterns:**
- Use source-owned observability records for product events and readback: `src/modules/observability/`, `convex/observability.ts`.
- Use Sentry for captured runtime errors and PostHog for funnel/product telemetry through adapters in `src/modules/observability/`; avoid scattering vendor calls through domain modules.
- Reserve `console.error`, `console.warn`, or `console.log` for server/tool diagnostics and scripts; never make console output the only evidence for a durable operation. Release and development proof belongs in `tools/release/`, `tools/dev/`, or persisted readback.
- Never log secrets, credentials, full authorization headers, or sensitive customer input; redaction behavior is tested in `tests/unit/observability/audit-redaction.test.ts`.

## Comments

**When to Comment:**
- Comment architectural intent, authority boundaries, protocol constraints, or non-obvious invariants—not line-by-line mechanics. The registry contract comment in `src/modules/actions/index.ts` is the model.
- Keep public contract caveats adjacent to the action or boundary they constrain: action `summary` and `boundaries` live in `src/modules/*/<module>.actions.ts`.
- Use file-level comments for environment annotations in tests, such as `@vitest-environment jsdom` in `tests/unit/chat/home-landing-submit.test.tsx`.

**JSDoc/TSDoc:**
- Use sparingly for exported registries, public abstractions, or constraints that types cannot express: `src/modules/actions/index.ts`.
- Prefer precise types and named discriminated unions over prose documentation for routine functions: `src/modules/registry/public.ts`.

## Function Design

**Size:** Keep pure domain decisions small and extract projections, admission checks, normalization, and persistence adapters into named functions. Large workflows compose those functions in module seams such as `src/modules/customer-request/` and `convex/customerRequestV2.ts`.

**Parameters:** Use one typed object for multi-field inputs and explicit options/adapters for dependencies. Use `readonly` inputs where mutation is not intended: `SyncCatalogProjectionInput` and `SyncCatalogProjectionOptions` in `src/modules/registry/public.ts`.

**Return Values:** Return exact domain values or `kind`-discriminated unions. Preserve idempotent states such as `issued`/`replayed` and distinguish refusal, conflict, absence, and unavailable states: `convex/customerRequestRouteMandate.test.ts`.

## Module Design

**Exports:**
- Export the supported contract from `src/modules/<module>/public.ts`; keep helpers in `internal/`: `src/modules/catalog/public.ts`, `src/modules/catalog/internal/validators.ts`.
- Define assistant-callable operations with `defineAction` in `<module>.actions.ts`, include honest `summary`, `boundaries`, schema, and surfaces, then register explicitly in `src/modules/actions/index.ts`.
- Keep owner/admin/webhook writes behind authenticated route, server-function, signature, or source-write admission seams rather than adding them to external agent tools: `src/modules/actions/index.ts`.

**Barrel Files:**
- Use deliberate module boundary barrels named `public.ts`, not broad directory-wide `index.ts` barrels: `src/modules/notification-outbox/public.ts`.
- `src/modules/actions/index.ts` is the explicit central action registry and must import every action directly so bundlers cannot tree-shake registration.
- Follow project authority: `PRODUCT.md` governs claims and target/current separation; `DESIGN.md` governs UI; `AGENTS.md` governs safe assistant actions and public vocabulary.

---

*Convention analysis: 2026-07-17*
