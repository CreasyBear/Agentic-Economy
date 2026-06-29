# Coding Conventions

**Analysis Date:** 2026-06-29

## Naming Patterns

**Files:**
- Use TanStack file-route names under `src/routes/`, including dot-delimited paths such as `src/routes/owner.inquiries.$threadId.tsx`, escaped extension routes such as `src/routes/robots[.]txt.ts`, and splat routes such as `src/routes/sign-in.$.tsx`.
- Use module-owned domain files under `src/modules/<domain>/`, with `public.ts` as the route-facing seam and `internal/*.ts` for implementation details, as in `src/modules/catalog/public.ts` and `src/modules/catalog/internal/publish.ts`.
- Use generated route output only in `src/routeTree.gen.ts`; do not manually edit this generated file.
- Use PascalCase component filenames for product components under `src/components/ae/`, such as `src/components/ae/status/AeStatusCard.tsx`.
- Use lowercase shadcn component filenames under `src/components/ui/`, such as `src/components/ui/button.tsx` and `src/components/ui/card.tsx`.
- Use `.test.ts` for Vitest tests under `tests/unit/`, `tests/integration/`, `tests/types/`, `tests/imports/`, `tests/ui-contract/`, `tests/copy/`, and `tests/seo/`.
- Use `.spec.ts` for Playwright tests under `tests/e2e/` and `tests/deploy-smoke/`.

**Functions:**
- Use camelCase for functions and start names with the operation they perform: `buildPublicCatalogDto` in `src/modules/catalog/internal/public-catalog-dto.ts`, `validateAuditEvent` in `src/modules/observability/internal/audit.ts`, and `handleDurableListBusinessesRequest` in `src/routes/api.businesses.ts`.
- Use `create*`, `read*`, `build*`, `validate*`, `handle*`, `set*ForTests`, and `reset*ForTest` prefixes for lifecycle clarity, as in `createAuthenticatedConvexClient` in `src/lib/server/convex-source.ts` and `setPublicRegistryQueryClientForTests` in `src/routes/api.businesses.ts`.
- Use PascalCase only for React components and classes, such as `AeStatusCard` in `src/components/ae/status/AeStatusCard.tsx` and `ConvexSourceError` in `src/lib/server/convex-source.ts`.

**Variables:**
- Use camelCase for local values and parameters, such as `publicRegistryQueryClientForTests` in `src/routes/api.businesses.ts`.
- Use `*Values` arrays with `as const` for literal unions, such as `FirstRequestModeValues` in `src/modules/catalog/public.ts` and `AdminRoleValues` in `src/modules/security/public.ts`.
- Use `*Schema` names for Zod validators that mirror exported literal unions, such as `FirstRequestModeSchema` in `src/modules/catalog/internal/validators.ts`.
- Use `*Result`, `*Input`, `*Command`, `*State`, and `*Contract` suffixes for domain data shapes, as in `PublishBusinessCatalogCommand` and `PublicCatalogContract` in `src/modules/catalog/public.ts`.

**Types:**
- Use PascalCase for exported types, discriminated unions, and branded IDs, such as `BusinessId`, `Slug`, and `SourceHash` in `src/modules/common/ids.ts`.
- Use branded string IDs for durable identifiers and construct them through `brandNonEmpty` from `src/modules/common/ids.ts`.
- Use exact literal unions instead of broad status strings. The guardrail in `src/lib/ui/contract-scans.ts` rejects broad `status: string`, and `tests/imports/ts-standards.test.ts` runs that check.

## Code Style

**Formatting:**
- No Prettier, ESLint, or Biome config is detected in the repository root. Formatting is maintained by TypeScript style and executable guardrail tests referenced from `package.json`.
- Runtime and test TypeScript generally use no semicolons, single quotes, trailing commas in multiline objects, and blank lines between import groups, as shown in `src/modules/catalog/public.ts` and `tests/unit/catalog/public-catalog-dto.test.ts`.
- shadcn-generated UI primitives in `src/components/ui/button.tsx` and `src/components/ui/card.tsx` use double quotes; keep local edits consistent with each file rather than rewriting generated style.
- Keep strict TypeScript enabled through `tsconfig.json`: `strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `useUnknownInCatchVariables`, `noImplicitOverride`, and `isolatedModules`.
- Use `readonly` arrays and immutable contracts for public data, as in `PublicCatalogContract` in `src/modules/catalog/public.ts`.
- Use `satisfies` to keep configuration and mapping tables exact, as in `tailwind.config.ts`, `src/modules/observability/internal/operator-controls.ts`, and `src/components/ae/status/AeStatusBadge.tsx`.

**Linting:**
- No conventional lint script is present in `package.json`; use `npm run typecheck` plus custom scan tests as the practical quality gate.
- Run `npm run test:imports` to enforce public seams and route boundaries through `tests/imports/private-imports.test.ts`, `tests/imports/route-boundary.test.ts`, and `tests/imports/backup-imports.test.ts`.
- Run `npm run test:ts-standards` to enforce no explicit `any`, no double `unknown` casts, no non-null assertions, no `v.any()`, and exact Convex return contracts through `tests/imports/ts-standards.test.ts`.
- Run `npm run test:ui-contract` to enforce route and AE component class constraints from `tests/ui-contract/class-scan.test.ts`.
- Run `npm run test:copy` to enforce public copy and phase-claim constraints from `tests/copy/claims-register.test.ts`.
- `src/routeTree.gen.ts` is the only generated file with `/* eslint-disable */`, `// @ts-nocheck`, and generated-file comments.

**Skill-Defined Project Rules:**
- For shadcn UI work, follow `.agents/skills/shadcn/SKILL.md`: compose existing components from `src/components/ui/`, use semantic tokens, use `gap-*` instead of `space-*`, use `cn()` from `src/lib/utils.ts`, and use `data-icon` on lucide icons inside buttons as in `src/components/ae/status/AeStatusCard.tsx`.
- For Convex work, follow `.codex/skills/convex-best-practices/SKILL.md` and `.codex/skills/convex-functions/SKILL.md`: define function `args`, define exact `returns`, use indexed queries, and keep schema validators explicit as in `convex/catalog.ts` and `src/modules/catalog/internal/schema.ts`.
- For TanStack route work, follow `.codex/skills/tanstack-router/SKILL.md` and `.codex/skills/tanstack-start/SKILL.md`: keep file-based routes in `src/routes/`, use `createFileRoute`, validate server function input with schemas, and keep server-only code behind route/server seams as in `src/modules/catalog/owner-claim.functions.ts`.
- For Clerk with TanStack Start, follow `.codex/skills/clerk-tanstack-patterns/SKILL.md`: use `clerkMiddleware()` in `src/start.ts`, keep `auth()` imports server-side, and protect server Convex calls through server-side auth seams such as `src/lib/server/convex-source.ts`.

## Import Organization

**Order:**
1. Node built-ins and framework/package imports first, as in `tests/copy/claims-register.test.ts` and `src/routes/api.businesses.ts`.
2. External package type imports are kept near their package imports, using `import type` when values are not needed, as in `src/lib/server/convex-source.ts`.
3. Application alias imports from `@/` follow external imports, as in `src/routes/privacy.remove-business.tsx`.
4. Relative imports are used within a module or Convex runtime boundary, such as `./internal/publish` in `src/modules/catalog/public.ts` and `../src/modules/catalog/public` in `convex/catalog.ts`.
5. Test helper imports follow the system under test, such as `./scan-targets` in `tests/imports/source-mining.test.ts`.

**Path Aliases:**
- Use `@/*` for `src/*` imports according to `tsconfig.json`.
- `~/*` also maps to `src/*` in `tsconfig.json`, but observed code uses `@/` consistently.
- shadcn aliases in `components.json` map `@/components`, `@/components/ui`, `@/lib`, and `@/lib/utils`.
- Convex files under `convex/` use relative imports back into `src/`, such as `../src/modules/common/stable-hash` in `convex/catalog.ts`.

## Error Handling

**Patterns:**
- Prefer discriminated result objects for domain behavior: `{ kind: 'ok', code: ... }` and `{ kind: 'error', code: ..., retryable, reason }` from `src/modules/common/result.ts` and domain-specific unions in `src/modules/catalog/public.ts`.
- Return typed denial/readback states instead of throwing for expected business outcomes, such as `catalog_publish_wrong_owner` in `src/modules/catalog/internal/publish.ts` and `missing_membership` in `src/modules/security/public.ts`.
- Throw typed error classes for infrastructure misconfiguration and server-only provider failures, such as `ConvexSourceError` in `src/lib/server/convex-source.ts`, `NotificationProviderError` in `src/lib/server/notification-provider.ts`, and `BillingProviderError` in `src/lib/server/billing-provider.ts`.
- Use `try`/`catch` to fail closed to public-safe readbacks where route data can be unavailable, as in `readOwnerStatusThroughSource` in `src/modules/catalog/owner-claim.functions.ts`.
- Redact sensitive payload fields before storing or returning observability data using `redactPayload` in `src/modules/observability/internal/redaction.ts`.
- Convex functions in `convex/catalog.ts` and `convex/discovery.ts` expose exact `returns` validators and return validated unions rather than leaking raw thrown errors for user-facing states.

## Logging

**Framework:** No runtime logging framework is detected.

**Patterns:**
- Avoid `console.*` in runtime code; no durable application logging API is present in `src/` or `convex/`.
- Record durable operational facts as typed audit, operation, projection, discovery, notification, and admin readback rows through `src/modules/observability/public.ts`, `src/modules/observability/internal/audit.ts`, and `src/modules/observability/internal/operation-keys.ts`.
- Use redacted operator readbacks rather than raw logs for diagnostics, as in `src/components/ae/readback/AeAdminReadbackPanel.tsx` and `src/routes/admin.audit-events.tsx`.

## Comments

**When to Comment:**
- Keep comments sparse and prefer explicit types, literal unions, and named helpers over explanatory comments, as in `src/modules/catalog/internal/publish.ts`.
- Generated comments are acceptable in generated files only, especially `src/routeTree.gen.ts`.
- Use `@ts-expect-error` only in type-contract tests that prove invalid domain states fail type checking, such as `tests/types/domain-contracts.test.ts` and `tests/types/protected-actions-contracts.test.ts`.

**JSDoc/TSDoc:**
- JSDoc/TSDoc is not a dominant convention in `src/`, `convex/`, or `tests/`.
- Prefer exported type names and explicit object contracts over prose documentation for public module seams such as `src/modules/catalog/public.ts`.

## Function Design

**Size:** Keep new functions small and pure where possible, following helpers such as `optionalParam`, `numericParam`, and `jsonResponse` in `src/routes/api.businesses.ts`. Large orchestration files exist, such as `src/modules/protected-action/internal/contact-follow-up.ts` and `convex/inquiries.ts`, so new work should add focused helpers rather than extending large inline blocks.

**Parameters:** Prefer single object parameters for commands and state transitions, such as `PublishBusinessCatalogCommand` in `src/modules/catalog/public.ts` and `AuditEventInput` in `src/modules/observability/internal/audit.ts`.

**Return Values:** Prefer exact discriminated unions and literal codes, such as `BuildPublicCatalogResult` in `src/modules/catalog/public.ts`, `ConvexSourceErrorCode` in `src/lib/server/convex-source.ts`, and `PublicBusinessCatalogDetailResult` in `src/modules/registry/public.ts`.

## Module Design

**Exports:** Use `src/modules/<domain>/public.ts` as the public seam for routes and sibling modules. The allowed pattern is visible in `src/modules/catalog/public.ts`, which imports implementation from `src/modules/catalog/internal/*` and re-exports route-safe contracts and functions.

**Barrel Files:** Avoid broad cross-repository barrels. `public.ts` files are domain seams, not catch-all barrels. The scan in `src/lib/ui/contract-scans.ts` rejects imports from `modules/<domain>/internal/*` across module and route boundaries, with explicit exceptions for `src/modules/<domain>/public.ts` and `convex/schema.ts`.

**UI Modules:** Product components live in `src/components/ae/` and compose primitives from `src/components/ui/`. Use semantic UI primitives such as `Button`, `Card`, `Badge`, `Alert`, `Field`, and `Spinner` rather than route-local custom markup.

**Server Modules:** Server-only provider and Convex access lives under `src/lib/server/` and server function files such as `src/modules/catalog/owner-claim.functions.ts`; keep secrets and `auth()` calls out of browser components.

---

*Convention analysis: 2026-06-29*
