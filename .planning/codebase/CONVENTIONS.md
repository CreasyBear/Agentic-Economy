# Coding Conventions

**Analysis Date:** 2026-06-29

## Naming Patterns

**Files:**
- Use TanStack file-route names under `src/routes/`, including dot-delimited paths such as `src/routes/owner.inquiries.$threadId.tsx`, escaped extension routes such as `src/routes/robots[.]txt.ts`, and splat routes such as `src/routes/sign-in.$.tsx`.
- Keep future-phase route prototypes parked under `src/future-phases/<phase-slug>/routes/` until their owning phase explicitly mounts them. Phase 5 owner billing surfaces currently live under `src/future-phases/05-paid-activation-money-rails/routes/` and use `createParkedFileRoute` from `src/future-phases/route-helpers.ts`.
- Use module-owned domain files under `src/modules/<domain>/`, with `public.ts` as the route-facing seam and `internal/*.ts` for implementation details. Examples: `src/modules/billing/public.ts`, `src/modules/billing/internal/operations.ts`, and `src/modules/catalog/internal/publish.ts`.
- Use generated route output only in `src/routeTree.gen.ts`; do not manually edit this generated file.
- Use PascalCase component filenames for AE product components under `src/components/ae/`, such as `src/components/ae/status/AeStatusCard.tsx`.
- Use lowercase shadcn component filenames under `src/components/ui/`, such as `src/components/ui/button.tsx` and `src/components/ui/card.tsx`.
- Use `.test.ts` for Vitest tests under `tests/unit/`, `tests/integration/`, `tests/types/`, `tests/imports/`, `tests/ui-contract/`, `tests/copy/`, and `tests/seo/`.
- Use `.spec.ts` for Playwright tests under `tests/e2e/` and `tests/deploy-smoke/`.

**Functions:**
- Use camelCase for functions and start names with the operation they perform: `startPaidActivation` in `src/modules/billing/public.ts`, `validateAuditEvent` in `src/modules/observability/internal/audit.ts`, and `handleDurableListBusinessesRequest` in `src/routes/api.businesses.ts`.
- Use `create*`, `read*`, `build*`, `validate*`, `handle*`, `scan*`, `set*ForTests`, and `reset*ForTest` prefixes for lifecycle clarity. Examples: `createAuthenticatedConvexClient` in `src/lib/server/convex-source.ts` and `scanCopyClaims` in `src/lib/ui/contract-scans.ts`.
- Use PascalCase only for React components and classes, such as `OwnerBillingStatePanel` in `src/future-phases/05-paid-activation-money-rails/routes/owner.billing.tsx` and `BillingProviderError` in `src/lib/server/billing-provider.ts`.

**Variables:**
- Use camelCase for local values and parameters, such as `emptyBillingSourceState` in `src/future-phases/05-paid-activation-money-rails/routes/owner.billing.tsx`.
- Use `*Values` arrays with `as const` for literal unions, such as `BillingProviderValues` and `BillingOperationStatusValues` in `src/modules/billing/internal/schema.ts`.
- Use `*Schema` names for Zod validators that mirror exported literal unions, such as `FirstRequestModeSchema` in `src/modules/catalog/internal/validators.ts`.
- Use `*Result`, `*Input`, `*Command`, `*State`, `*Projection`, and `*Contract` suffixes for domain data shapes, as in `StartPaidActivationCommand`, `BillingSourceState`, and `PublicPaidActivationProjection` from `src/modules/billing/public.ts`.

**Types:**
- Use PascalCase for exported types, discriminated unions, and branded IDs, such as `BillingOperationId`, `BillingReceiptId`, and `SourceHash` in `src/modules/common/ids.ts`.
- Use branded string IDs for durable identifiers and construct them through `brandNonEmpty` from `src/modules/common/ids.ts`.
- Use exact literal unions instead of broad status strings. The scanner in `src/lib/ui/contract-scans.ts` rejects broad `status: string`, and `tests/imports/ts-standards.test.ts` runs that check.
- Use `ModuleResult`, `ok`, and `error` from `src/modules/common/result.ts` for expected domain outcomes. Exceptions are for programmer or infrastructure faults.

## Code Style

**Formatting:**
- No Prettier, ESLint, or Biome config is detected in the repository root. Formatting is maintained by TypeScript style and executable guardrail tests referenced from `package.json`.
- Runtime and test TypeScript generally use no semicolons, single quotes, trailing commas in multiline objects, and blank lines between import groups, as shown in `src/modules/billing/internal/operations.ts` and `tests/unit/billing/rail.test.ts`.
- shadcn-generated UI primitives in `src/components/ui/button.tsx` and `src/components/ui/card.tsx` may use generated style; keep local edits consistent with each file rather than rewriting generated output.
- Keep strict TypeScript enabled through `tsconfig.json`: `strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `useUnknownInCatchVariables`, `noImplicitOverride`, `allowJs: false`, and `isolatedModules`.
- Use `readonly` arrays and immutable contracts for public data, as in `BillingSourceState` and projection types exported from `src/modules/billing/public.ts`.
- Use `satisfies` for exact configuration and maps, as in `tailwind.config.ts`, `tests/unit/schema/convex-schema.test.ts`, and `tests/unit/billing/owner-routes.test.ts`.

**Linting:**
- No conventional lint script is present in `package.json`; use `npm run typecheck` plus custom scan tests as the practical quality gate.
- Run `npm run test:imports` to enforce public seams and route boundaries through `tests/imports/private-imports.test.ts`, `tests/imports/route-boundary.test.ts`, and `tests/imports/backup-imports.test.ts`.
- Run `npm run test:source-mining` to reject backup coupling, unsupported future-surface symbols, active future route registrations, and Phase 5 money/protocol drift through `tests/imports/source-mining.test.ts`.
- Run `npm run test:ts-standards` to enforce no explicit `any`, no double `unknown` casts, no non-null assertions, no `v.any()`, no broad status strings, no inexact Convex returns, and no client-exposed source-write secrets through `tests/imports/ts-standards.test.ts`.
- Run `npm run test:copy` to enforce public copy and phase-claim constraints from `tests/copy/phase1-banned-copy.test.ts` and `tests/copy/claims-register.test.ts`.
- Run `npm run test:ui-contract` to enforce route and AE component class constraints from `tests/ui-contract/class-scan.test.ts` plus status-copy contracts.
- `src/routeTree.gen.ts` and `convex/_generated/` are generated outputs and should not become hand-written domain interfaces.

**Skill-Defined Project Rules:**
- For Convex work, follow `.codex/skills/convex-best-practices/SKILL.md` and `.codex/skills/convex-functions/SKILL.md`: use object-style functions, define `args`, define exact `returns`, use indexed queries, and keep schema validators explicit.
- For Convex schemas, follow `.codex/skills/convex-schema-validator/SKILL.md`: define table validators in domain-owned schema files such as `src/modules/billing/internal/schema.ts`, use descriptive index names, and run codegen after schema changes.
- For shadcn UI work, follow `.agents/skills/shadcn/SKILL.md` and `components.json`: compose existing components from `src/components/ui/`, use semantic tokens, use `gap-*` instead of `space-*`, use `cn()` from `src/lib/utils.ts`, and use lucide icons where appropriate.
- For TanStack routes/server functions, keep routes as adapters over module public seams. Active routes belong in `src/routes/`; future routes belong under `src/future-phases/` until mounted.
- For Clerk/TanStack auth, keep `auth()` and secret/session reads server-side behind seams such as `src/lib/server/convex-source.ts`.

## Import Organization

**Order:**
1. Node built-ins and framework/package imports first, as in `tests/copy/claims-register.test.ts` and `src/routes/api.businesses.ts`.
2. External package type imports are kept near their package imports, using `import type` when values are not needed.
3. Application alias imports from `@/` follow external imports, as in `src/future-phases/05-paid-activation-money-rails/routes/owner.billing.tsx`.
4. Relative imports are used within a module or Convex runtime boundary, such as `./internal/operations` in `src/modules/billing/public.ts`.
5. Test helper imports follow the system under test, such as `./scan-targets` in `tests/imports/source-mining.test.ts`.

**Path Aliases:**
- Use `@/*` for `src/*` imports according to `tsconfig.json`.
- `~/*` also maps to `src/*` in `tsconfig.json`, but observed code uses `@/` consistently.
- shadcn aliases in `components.json` map `@/components`, `@/components/ui`, `@/lib`, and `@/lib/utils`.
- Convex files under `convex/` use relative imports back into `src/`, such as `../src/modules/common/stable-hash` in `convex/catalog.ts`.

**Import Boundaries:**
- Routes may import UI components, server helpers intended for routes, generated route utilities, and `src/modules/<domain>/public.ts` seams.
- Routes must not import provider SDKs, `convex/schema.ts`, Convex runtime internals, module private files under `src/modules/<domain>/internal/`, or planning files. `scanRouteBoundaries` in `src/lib/ui/contract-scans.ts` enforces this for `src/routes/`.
- Sibling modules must not import another module's `internal/*` files; use the target module's `public.ts` seam. `scanPrivateImports` enforces this and allows only module-local `public.ts` files to gather their own internals.
- `convex/schema.ts` may compose approved module schema fragments from internal schema files, matching the exception in `src/lib/ui/contract-scans.ts`.
- Runtime code must not import `.planning` or backup paths. `scanBackupImports` and `scanSourceMining` enforce this.
- Phase 5 billing code should flow through `src/modules/billing/public.ts`, `src/modules/billing/server.ts`, and `src/lib/server/billing-provider.ts`; route code should not own Autumn/Stripe transport plumbing directly.

## Copy, Source, and UI Scan Conventions

**Copy/Payment Claims:**
- Use `scanCopyClaims` from `src/lib/ui/contract-scans.ts` for public and phase-owned copy. Public copy cannot imply live booking, payment, callable agent action, marketplace, protected action, or paid activation before its proof exists.
- Phase-owned planning/test context is explicit. Phase 5 wording is allowed in `.planning/phases/05-paid-activation-money-rails/` and tests only when it is selected-rail or explicitly negative.
- For Phase 5, positive public claims for Autumn+Stripe paid activation require source-owned route/readback/funnel/support evidence. Wallets, credits, balances, custody, x402, Connect, direct Stripe subscription authority, marketplace payout, split payout, settlement, and `paymentRequired: true` stay negative-only unless a later decision record and implementation approve them.
- Do not use env vars, provider screenshots, provider dashboards, return URL arrival, or webhook arrival as proof of paid state. Provider proof must become source-owned readback, receipt, reconciliation, or smoke evidence.

**Source Mining:**
- Runtime cannot reference backup paths such as `Agentic-Economy-Backup`; source-mined behavior must cite ledger context through `.planning/source-mining/phase-1-ledger.md` and fresh seams/tests.
- Future-surface symbols such as `wallet`, `credits`, `billing`, `stripe`, `x402`, `payment_handlers`, `protectedActions`, `proposeAction`, and `actionGateway` are allowed only in source-owned phase seams listed by `isAllowedSourceOwnedFutureSurface` in `src/lib/ui/contract-scans.ts`.
- Future Phase 4/5 route registrations must stay out of active `src/routes/` until their owning phase. Parked files under `src/future-phases/05-paid-activation-money-rails/routes/` are not active app routes.

**UI Contracts:**
- Product-owned routes and AE components must use semantic tokens; `scanUiContract` rejects raw colors, `space-x`/`space-y`, `transition-all`, route-local scroll listeners, and arbitrary visual token drift in `src/routes/` and `src/components/ae/`.
- Use shared AE surfaces such as `AePublicShell`, `AeAdminShell`, `AePageHeader`, `AeStatusBadge`, `AeStatusCard`, `AeEmptyState`, and `AeAdminReadbackPanel` before adding route-local UI.
- Billing and payment UI must be text-first. Color is secondary, and provider enum/status values must be mapped through human-readable status presentation in `src/lib/ui/status-presentation.ts`.

## Error Handling

**Patterns:**
- Prefer discriminated result objects for domain behavior: `{ kind: 'ok', code: ... }` and `{ kind: 'error', code: ..., retryable, reason }` from `src/modules/common/result.ts` and domain-specific unions in `src/modules/billing/internal/operations.ts`.
- Return typed denial/readback states instead of throwing for expected business outcomes, such as `billing_owner_denied`, `billing_client_field_rejected`, and `billing_operation_conflict` in `src/modules/billing/internal/operations.ts`.
- Throw typed error classes for infrastructure misconfiguration and server-only provider failures, such as `ConvexSourceError` in `src/lib/server/convex-source.ts`, `NotificationProviderError` in `src/lib/server/notification-provider.ts`, and `BillingProviderError` in `src/lib/server/billing-provider.ts`.
- Redact sensitive payload fields before storing or returning observability/provider data. Billing provider events use `payloadHash`, `redactedPayloadJson`, and provider-safe refs in `src/modules/billing/internal/schema.ts`.
- Convex functions expose exact `returns` validators and return validated unions rather than leaking raw thrown errors for user-facing states.

## Logging

**Framework:** No runtime logging framework is detected.

**Patterns:**
- Avoid `console.*` in runtime code; no durable application logging API is present in `src/` or `convex/`.
- Record durable operational facts as typed audit, operation, projection, discovery, notification, billing, and admin readback rows through modules such as `src/modules/observability/public.ts`, `src/modules/billing/public.ts`, and `src/modules/notification-outbox/public.ts`.
- Use redacted operator readbacks rather than raw logs for diagnostics, as in `src/components/ae/readback/AeAdminReadbackPanel.tsx` and the billing readback/projection types in `src/modules/billing/public.ts`.

## Comments

**When to Comment:**
- Keep comments sparse and prefer explicit types, literal unions, and named helpers over explanatory comments.
- Generated comments are acceptable in generated files only, especially `src/routeTree.gen.ts`.
- Use `@ts-expect-error` only in type-contract tests that prove invalid domain states fail type checking, such as `tests/types/domain-contracts.test.ts` and `tests/types/protected-actions-contracts.test.ts`.

**JSDoc/TSDoc:**
- JSDoc/TSDoc is not a dominant convention in `src/`, `convex/`, or `tests/`.
- Prefer exported type names and explicit object contracts over prose documentation for public module seams such as `src/modules/billing/public.ts`.

## Function Design

**Size:** Keep new functions small and pure where possible. Large orchestration files exist, such as `src/modules/billing/internal/operations.ts` and `convex/inquiries.ts`, so new work should add focused helpers rather than extending large inline blocks.

**Parameters:** Prefer single object parameters for commands and state transitions, such as `StartPaidActivationCommand`, `BillingProviderEventCommand`, and `RecordBillingEvidenceCommand` in `src/modules/billing/internal/operations.ts`.

**Return Values:** Prefer exact discriminated unions and literal codes, such as `StartPaidActivationResult` in `src/modules/billing/public.ts`, `ConvexSourceErrorCode` in `src/lib/server/convex-source.ts`, and `PublicBusinessCatalogDetailResult` in `src/modules/registry/public.ts`.

## Module Design

**Exports:** Use `src/modules/<domain>/public.ts` as the public seam for routes and sibling modules. The allowed pattern is visible in `src/modules/billing/public.ts`, which imports implementation from `src/modules/billing/internal/*` and re-exports route-safe contracts and functions.

**Barrel Files:** Avoid broad cross-repository barrels. `public.ts` files are domain seams, not catch-all barrels. The scan in `src/lib/ui/contract-scans.ts` rejects imports from `modules/<domain>/internal/*` across module and route boundaries.

**Convex Codegen:** Treat `convex/_generated/` as read-only generated output and run `npm run check:convex-codegen` after any Convex schema/function change. Generated Convex API files must not become domain source-of-truth.

**Phase 5 Billing:** Keep Autumn+Stripe behavior inside `src/modules/billing/`, `src/lib/server/billing-provider.ts`, and future/active billing routes. Core business/catalog/registry/discovery state must not gain rail-specific fields unless the Phase 5 money decision record and scans allow exact public paid-state facts.

---

*Convention analysis: 2026-06-29*
