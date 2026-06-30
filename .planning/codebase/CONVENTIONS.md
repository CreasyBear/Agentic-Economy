# Coding Conventions

**Analysis Date:** 2026-06-30

## Naming Patterns

**Files:**
- Use TanStack Router file-route names under `src/routes/`: examples include `src/routes/$slug.tsx`, `src/routes/$slug.inquiry.tsx`, `src/routes/api.businesses.$slug.ts`, and `src/routes/robots[.]txt.ts`.
- Keep domain modules under `src/modules/<domain>/` with a public seam in `src/modules/<domain>/public.ts`, private implementation under `src/modules/<domain>/internal/*.ts`, and server-function adapters in `src/modules/<domain>/<feature>.functions.ts`.
- Use generated Convex-facing files under `convex/*.ts` for deployed Convex functions; do not treat `convex/_generated` as an editable domain interface.
- Use PascalCase React component files in `src/components/ae/**`, such as `src/components/ae/forms/AeClaimFormSection.tsx`; shadcn source components live in kebab/lowercase files under `src/components/ui/**`, such as `src/components/ui/button.tsx`.
- Use `*.test.ts` / `*.test.tsx` for Vitest files and `*.spec.ts` for Playwright files under `tests/**`.

**Functions:**
- Use verb-first domain function names: `claimBusiness`, `publishBusinessCatalog`, `validatePublicOwnerClaimFlowInput`, `readPublicBusinessPageThroughSource`, and `createSourceWriteAdmission`.
- Use `read*ThroughSource`, `submit*ThroughSource`, and `handle*Request` names at server/route boundaries, as in `src/modules/catalog/owner-claim.functions.ts` and `src/routes/api.businesses.ts`.
- Use `createEmpty<Domain>SourceState` factory names for deterministic in-memory source state, as in `src/modules/business/public.ts` and `src/modules/catalog/public.ts`.
- Use `set*ForTests` only for test-only port overrides that return a reset function, as in `src/modules/registry/registry.functions.ts` and `src/modules/discovery/discovery.functions.ts`.

**Variables:**
- Use `const` by default. Use `let` only for module-level mutable source/test state, such as `publicOwnerRouteState` in `src/modules/catalog/internal/owner-public-flow.ts`.
- Use `*Values` const tuples for literal domains and derive union types from them:

```typescript
export const PublicStatusValues = ['unpublished', 'published', 'suppressed'] as const
export type PublicStatus = (typeof PublicStatusValues)[number]
```

- Use `*Schema` for Zod validators derived from domain tuples, such as `PublicStatusSchema` in `src/modules/business/internal/validators.ts`.
- Use `*Result`, `*Command`, `*Input`, `*Contract`, `*Readback`, and `*Record` suffixes for type roles, as in `src/modules/catalog/public.ts`.

**Types:**
- Use PascalCase for exported types and discriminated unions.
- Use branded string IDs from `src/modules/common/ids.ts` (`OwnerId`, `BusinessId`, `OperationKey`, `CorrelationId`, `SourceHash`) instead of broad strings for authority, identifiers, and source references.
- Use explicit literal result codes rather than broad status strings. Expected failure values carry `kind`, `code`, `retryable`, and a safe `reason`.
- Use `satisfies Record<Union, ...>` for exhaustive maps, as shown by `requiredFieldLabels` in `src/modules/catalog/internal/owner-public-flow.ts`.

## Code Style

**Formatting:**
- No root Prettier config is detected: `.prettierrc*` is not present.
- Source/domain files use semicolon-free TypeScript and single quotes, for example `src/modules/common/result.ts` and `src/modules/business/public.ts`.
- shadcn-owned UI source under `src/components/ui/**` preserves upstream style with double quotes in files like `src/components/ui/button.tsx` and `src/lib/utils.ts`.
- TypeScript is strict. Follow `tsconfig.json`: `strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `useUnknownInCatchVariables`, `noImplicitOverride`, `isolatedModules`, and `allowJs: false`.
- Avoid optional properties with `undefined` values under `exactOptionalPropertyTypes`; use conditional object spreads like `...(input.ownerMessage.trim().length === 0 ? {} : { ownerMessage: input.ownerMessage })` in `src/modules/catalog/owner-claim.functions.ts`.

**Linting:**
- No root ESLint or Biome config is detected: `eslint.config.*`, `.eslintrc*`, and `biome.json` are not present.
- Custom scanner tests are the enforceable lint layer. Use `src/lib/ui/contract-scans.ts` plus `tests/imports/*.test.ts`, `tests/ui-contract/class-scan.test.ts`, and `tests/copy/*.test.ts`.
- The TypeScript scan rejects explicit `any`, `as any`, `as unknown as`, non-null assertions, `v.any()`, broad `status: string`, inexact Convex returns, hard-coded CSRF literals, and client-exposed source-write secrets.
- The route/import scans reject runtime `.planning` imports, backup path imports, route-owned Convex transport, route imports from `convex/schema`, and route/module imports from sibling module `internal` files.
- The UI scan rejects raw colors, `space-x-*` / `space-y-*`, `transition-all`, arbitrary visual tokens like `rounded-[...]`, and route-local scroll listeners in `src/routes/**` and `src/components/ae/**`.

## Import Organization

**Order:**
1. External packages first: React, TanStack, Clerk, Convex, Node built-ins, Vitest, Playwright.
2. Blank line.
3. Internal aliases from `@/` or relative module imports.
4. Type-only imports use `import type` or inline `type`, as in `src/routes/claim.tsx`, `src/modules/catalog/public.ts`, and `tests/unit/convex/authz.test.ts`.

**Path Aliases:**
- `@/*` and `~/*` both map to `src/*` in `tsconfig.json`.
- Prefer `@/` inside `src/**` and `tests/**`; Convex runtime files under `convex/**` commonly use relative imports such as `../src/modules/common/ids`.
- `components.json` defines shadcn aliases: `@/components`, `@/components/ui`, `@/lib`, and `@/lib/utils`.

**Boundary Rules:**
- Routes in `src/routes/**` import UI components, module public seams, and server-function seams. Do not import `src/modules/<domain>/internal/**`, provider SDKs, or Convex schema from routes.
- Domain modules import other domains through their `public.ts` seams. `convex/schema.ts` is the allowed composition point for importing module internal schema files.
- Generated `src/routeTree.gen.ts` is excluded from scanner/linter expectations and should not be manually edited.

## Error Handling

**Patterns:**
- Expected domain failures return discriminated result unions. Shared helpers live in `src/modules/common/result.ts`:

```typescript
export type ModuleResult<OkCode extends string, ErrorCode extends string, OkPayload extends object, ErrorPayload extends object> =
  OkResult<OkCode, OkPayload> | ErrorResult<ErrorCode, ErrorPayload>
```

- Use `ok(code, payload)` and `error(code, retryable, payload)` in domain operations such as `src/modules/billing/internal/operations.ts`, `src/modules/inquiries/internal/commands.ts`, and `src/modules/business-action/internal/business-action.ts`.
- Throw only for programmer or infrastructure faults: missing required env, invalid audit event construction, invalid provider readback, or impossible test fixtures. Examples: `src/lib/server/convex-source.ts`, `src/lib/server/source-write-admission.ts`, and `src/modules/security/source-write-admission.ts`.
- Server-function adapters catch infrastructure errors and return safe route result unions. `ownerClaimSourceWriteError` in `src/modules/catalog/owner-claim.functions.ts` maps `SourceWriteAdmissionError` to `claim_flow_claim_rejected`.
- Public DTO builders redact private fields before route responses. Examples: `redactCatalogSourceHashes` in `src/modules/catalog/owner-claim.functions.ts` and public contracts in `src/modules/catalog/public.ts`.

## Logging

**Framework:** console/audit contracts

**Patterns:**
- Runtime `console.*` logging is not a visible convention in `src/**` or `convex/**`.
- Consequential operations record typed audit, operation, funnel, support, and readback records instead of ad hoc logs. Use `src/modules/observability/public.ts`, `src/modules/observability/internal/audit.ts`, and domain-specific audit construction in files like `src/modules/catalog/internal/publish.ts`.
- Tests assert redacted outputs and absence of private strings with `JSON.stringify(...).not.toMatch(...)`, as in `tests/integration/registry-api.test.ts`, `tests/seo/discovery-files.test.ts`, and `tests/e2e/public-owner-ui.spec.ts`.

## Comments

**When to Comment:**
- Keep comments sparse in runtime code. The codebase favors explicit names, result codes, and type contracts over explanatory comments.
- Preserve generated-file comments in `src/routeTree.gen.ts`.
- Add comments only when they explain scanner exceptions, generated boundaries, source-owned seams, or security-sensitive non-obvious behavior.

**JSDoc/TSDoc:**
- JSDoc/TSDoc is not a dominant pattern in `src/**`, `convex/**`, or `tests/**`.
- Prefer exported type names and discriminated result codes over doc-comment-heavy APIs.

## Function Design

**Size:** Keep route components and server adapters thin. Domain operation files can be larger when they hold a full state machine, but the public surface remains narrow through `public.ts`.

**Parameters:** Use command/input objects for domain mutations and server calls. Examples include `ClaimBusinessCommand` in `src/modules/business/public.ts`, `PublishBusinessCatalogCommand` in `src/modules/catalog/public.ts`, and source-write admission inputs in `src/modules/security/source-write-admission.ts`.

**Return Values:** Return discriminated unions for user/domain outcomes:

```typescript
type PublicOwnerClaimValidationResult =
  | { kind: 'valid'; input: PublicOwnerClaimFlowInput }
  | { kind: 'invalid'; errors: readonly PublicOwnerClaimValidationError[] }
```

**State:** Keep source state explicit and source-owned. In-memory states are arrays grouped into domain source-state types, such as `BusinessSourceState` in `src/modules/business/public.ts` and `CatalogSourceState` in `src/modules/catalog/public.ts`.

**Server Functions:** Use `createServerFn({ method: 'POST' })` for mutations and `.validator((data) => schema.parse(data))` for inputs, as in `src/modules/catalog/owner-claim.functions.ts`, `src/modules/inquiries/inquiry.functions.ts`, and `src/modules/business-action/business-action.functions.ts`.

## Module Design

**Exports:** Each domain module should export public contracts, values, result types, and wrapper functions from `src/modules/<domain>/public.ts`. Implementation imports should point at `./internal/*` from the owning public seam only.

**Barrel Files:** There are no generic `index.ts` barrel files in `src/modules/**`. Use explicit `public.ts` seams rather than broad barrels.

**Validators:** Domain tuple values live with the public contract; Zod validators live in `src/modules/<domain>/internal/validators.ts`; Convex validators/schema live in `src/modules/<domain>/internal/schema.ts` or a domain-specific `convex-schema.ts`.

**Convex:** Convex schemas use `literalUnion` from `src/modules/common/convex-literals.ts` rather than `v.any()` or broad strings. Convex functions validate args and derive actors/admin authority server-side in `convex/authz.ts` and domain Convex files.

**UI Components:** Use shadcn UI primitives from `src/components/ui/**`, compose AE components under `src/components/ae/**`, and use `cn()` from `src/lib/utils.ts` for class composition. Public/product-owned UI should use semantic tokens from `src/styles/tokens.css` and component classes from `src/styles/globals.css`.

**Skill-Defined Constraints:**
- TanStack Start and Router rules from `.codex/skills/tanstack-start/SKILL.md` and `.codex/skills/tanstack-router/SKILL.md` match the repo pattern: routes are adapters, server functions validate input, and route protections belong in router/server layers.
- Convex rules from `.codex/skills/convex-best-practices/SKILL.md` and `.codex/skills/convex-functions/SKILL.md` match the repo pattern: validators on functions, schema as truth, indexed queries, explicit returns, and source-owned auth.
- Clerk/TanStack rules from `.codex/skills/clerk-tanstack-patterns/SKILL.md` match `src/start.ts` and `src/routes/__root.tsx`: Clerk middleware/provider are present unless `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E` is enabled for deterministic local E2E.
- shadcn/UI Craft rules from `.agents/skills/shadcn/SKILL.md` and `.agents/skills/ui-craft/SKILL.md` are enforced by `components.json`, `src/components/ui/**`, `src/styles/globals.css`, and `tests/ui-contract/class-scan.test.ts`.

---

*Convention analysis: 2026-06-30*
