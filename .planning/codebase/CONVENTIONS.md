# Coding Conventions

**Analysis Date:** 2026-06-30

## Naming Patterns

**Files:**
- Use TanStack file routes under `src/routes/` with route-path filenames: `src/routes/api.agent.tools.ts`, `src/routes/$slug.inquiry.tsx`, `src/routes/owner.inquiries.$threadId.tsx`, `src/routes/llms[.]txt.ts`, and `src/routes/sitemap[.]xml.ts`.
- Use module ownership directories under `src/modules/<module>/`: public seams in `src/modules/business/public.ts`, private implementation in `src/modules/business/internal/claim.ts`, server functions in `src/modules/inquiries/inquiry.functions.ts`, and action declarations in `src/modules/inquiries/inquiry.actions.ts`.
- Use `public.ts` as the module seam instead of directory barrel imports. Runtime callers should import from public seams such as `src/modules/registry/public.ts`, not private files under `src/modules/registry/internal/`.
- Use `<module>.functions.ts` for TanStack Start server functions and source ports: `src/modules/catalog/owner-claim.functions.ts`, `src/modules/registry/registry.functions.ts`, `src/modules/billing/billing.functions.ts`.
- Use `<module>.actions.ts` for AE actions and register them in `src/modules/actions/index.ts`.
- Use PascalCase `Ae*` component filenames for product-owned components: `src/components/ae/forms/AePublicSearchBar.tsx`, `src/components/ae/layout/AeOperatorShell.tsx`, `src/components/ae/chat/AeChat.tsx`.
- Use lowercase kebab-case for shared shadcn-style UI primitives: `src/components/ui/button.tsx`, `src/components/ui/input-group.tsx`, `src/components/ui/alert-dialog.tsx`.
- Treat generated files as read-only outputs: `src/routeTree.gen.ts` and `convex/_generated/*`.
- Use `*.test.ts` / `*.test.tsx` for Vitest and `*.spec.ts` for Playwright: `tests/unit/business/claim.test.ts`, `tests/integration/agent-tools-api.test.ts`, `tests/e2e/public-owner-ui.spec.ts`.
- Use `.fixture` files only for negative scanner fixtures: `tests/fixtures/bad-imports/private-import.fixture`, `tests/fixtures/bad-ui-contract/route-styles.fixture`, `tests/fixtures/bad-ts-standards/unsafe.fixture`.

**Functions:**
- Use camelCase for functions and methods: `claimBusiness` in `src/modules/business/internal/claim.ts`, `handleInvokeAgentTool` in `src/routes/api.agent.tools.ts`, `compactContact` in `src/modules/inquiries/inquiry.functions.ts`.
- Use `create*`, `read*`, `list*`, `search*`, `sync*`, `retry*`, `validate*`, and `build*` prefixes that state intent: `createEmptyBusinessSourceState` in `src/modules/business/internal/claim.ts`, `readPublicRegistrySearchPage` in `src/modules/registry/registry.functions.ts`, `buildPublicThreadProjection` in `src/modules/answer-thread/public.ts`.
- Use `*ThroughSource` names for server/source bridge functions that route UI, HTTP, and action surfaces through the same source implementation: `submitPublicInquiryThroughSource` and `readCurrentOwnerInboxThroughSource` in `src/modules/inquiries/inquiry.functions.ts`.
- Use local helper functions after exported functions in the same file unless the helper is part of the public contract: `ownerSourceError`, `normalizeOperationPart`, and `usesLocalE2eBypass` in `src/modules/inquiries/inquiry.functions.ts`.
- Use named exports. Avoid default exports for product code except framework config files such as `vite.config.ts`, `vitest.config.ts`, `playwright.config.ts`, and Convex schema/config files.

**Variables:**
- Use camelCase for locals and arguments: `operationSuffix`, `operationKey`, `correlationId`, and `sourceWriteRequest` in `src/modules/inquiries/inquiry.functions.ts` and `src/routes/api.agent.tools.ts`.
- Use SCREAMING_SNAKE_CASE only for process-level constants when the value behaves like an environment selector or fixed test input, such as `QUERY` in `tests/eval/answer-pipeline.test.ts`.
- Use descriptive result variable names (`result`, `detail`, `delivery`, `tombstones`) and immediately narrow discriminated unions by `kind`, as in `readCurrentOwnerInquiryThreadThroughSource` in `src/modules/inquiries/inquiry.functions.ts`.
- Prefer `readonly` arrays and `as const` tuples for stable values: `ClaimStatusValues` in `src/modules/business/public.ts`, `ActionSurface` values in `src/modules/common/action.ts`, and `cleanUiTargets` in `tests/ui-contract/class-scan.test.ts`.

**Types:**
- Use PascalCase for exported types and suffix result unions with `Result`: `ClaimBusinessResult` in `src/modules/business/public.ts`, `OwnerInquiryMutationServerResult` in `src/modules/inquiries/inquiry.functions.ts`.
- Define status/source-state values as const tuples plus derived union types: `ClaimStatusValues` / `ClaimStatus` in `src/modules/business/public.ts`, `IndexStatusValues` / `IndexStatus` in `src/modules/registry/public.ts`.
- Define Zod validators from the owning public tuple in `internal/validators.ts`: `ClaimStatusSchema` in `src/modules/business/internal/validators.ts`, `IndexStatusSchema` in `src/modules/registry/internal/validators.ts`.
- Use branded ID types from `src/modules/common/ids.ts` for durable identifiers: `BusinessId`, `ServiceId`, `OperationKey`, `CorrelationId`, `SourceHash`.
- Use discriminated result unions with `kind`, `code`, `retryable`, and payload fields. Shared helpers live in `src/modules/common/result.ts`.

## Code Style

**Formatting:**
- No Prettier, ESLint, or Biome config is detected in the repo root. Formatting is enforced by TypeScript plus scanner tests, not a formatter config.
- Product-owned TypeScript and tests use 2-space indentation, single quotes, trailing commas in multiline calls, and no semicolons: `src/modules/business/internal/claim.ts`, `src/routes/api.agent.tools.ts`, `tests/unit/business/claim.test.ts`.
- Preserve upstream style in generated/vendor-style component primitives under `src/components/ui/`, where files such as `src/components/ui/button.tsx` use shadcn conventions and double quotes.
- Keep public copy free of em dashes and en dashes. `tests/ui-contract/public-language-copy.test.ts` and `tests/e2e/public-owner-ui.spec.ts` enforce this on human surfaces.
- UI classes for product-owned routes/components must use semantic tokens and stable utilities. `tests/ui-contract/class-scan.test.ts` rejects raw colors, `space-x` / `space-y`, `transition-all`, and arbitrary visual tokens outside `src/components/ui`.

**Linting:**
- Not detected: repo-root `eslint.config.*`, `.eslintrc*`, `.prettierrc*`, `prettier.config.*`, and `biome.json`.
- Use `npm run typecheck` with `tsconfig.json` strict settings: `strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `useUnknownInCatchVariables`, `noImplicitOverride`, and `allowJs: false`.
- Use scanner tests as lint gates: `tests/imports/ts-standards.test.ts`, `tests/imports/private-imports.test.ts`, `tests/imports/route-boundary.test.ts`, `tests/imports/source-mining.test.ts`, `tests/copy/phase1-banned-copy.test.ts`, and `tests/ui-contract/class-scan.test.ts`.
- Do not introduce explicit `any`, `as any`, `as unknown as`, non-null assertions, `v.any()`, broad `status: string`, inexact Convex returns, hard-coded source CSRF literals, or client-exposed source-write secrets. These rules are encoded in `src/lib/ui/contract-scans.ts` and `.planning/ENGINEERING-STANDARDS.md`.

## Import Organization

**Order:**
1. Node, React, framework, and third-party imports: `node:fs`, `react`, `@tanstack/react-router`, `@tanstack/react-start`, `vitest`, `lucide-react`, `zod`.
2. Internal alias imports from `@/components`, `@/lib`, and `@/modules`.
3. Relative imports inside the same module or route group, such as `./internal/claim` from `src/modules/business/public.ts` or `./api.businesses` from `src/routes/api.agent.tools.ts`.

**Path Aliases:**
- Use `@/*` and `~/*` for `src/*` imports as configured in `tsconfig.json`.
- Prefer `@/modules/<module>/public` or `@/modules/<module>/<module>.functions` over deep private imports.
- Routes must stay adapter-only and must not import `convex/schema`, Convex transport, provider SDKs, or module `internal` files. `tests/imports/route-boundary.test.ts` enforces this.
- Runtime modules must not import sibling module internals. `tests/imports/private-imports.test.ts` enforces public seams across module boundaries. Tests may import internal validators when they are explicitly validating type/schema equivalence, as in `tests/types/domain-contracts.test.ts`.

## Error Handling

**Patterns:**
- Expected domain failures return discriminated result unions instead of throwing. Use `ModuleResult` and helpers from `src/modules/common/result.ts`.
- Result objects include a stable `kind`, machine-readable `code`, `retryable`, and human-safe `reason` when an error can cross a route or API boundary.
- Server/source bridge functions catch infrastructure and admission failures and map them to result objects. `inquirySourceError` and `ownerSourceError` in `src/modules/inquiries/inquiry.functions.ts` map `SourceWriteAdmissionError` and `ConvexSourceError`.
- Route handlers validate content type and JSON shape before invoking actions. `src/routes/api.agent.tools.ts` returns `jsonError` for invalid content type, malformed JSON, unknown tools, non-exposed actions, and Zod schema failures.
- Use Zod validators at TanStack Start server-function boundaries: `publicInquirySubmitSchema`, `ownerThreadSchema`, and `ownerReplySchema` in `src/modules/inquiries/inquiry.functions.ts`; `publishOfferSchema` and related schemas in `src/modules/billing/billing.functions.ts`.
- Throw only for programmer/invariant failures or test assertions, such as `brandNonEmpty` in `src/modules/common/ids.ts` and explicit `throw new Error('expected complete event')` guards in tests.

## Logging

**Framework:** Not detected

**Patterns:**
- No runtime `console.*` logging convention is detected in `src/` or `convex/`.
- Use typed observability/readback state instead of ad hoc logs: `src/modules/observability/public.ts`, `src/modules/observability/internal/audit.ts`, `src/modules/observability/internal/funnel.ts`, and `src/modules/observability/internal/operation-keys.ts`.
- Use audit events, operation keys, redacted payloads, and operator readbacks for consequential actions. The engineering standard is documented in `.planning/ENGINEERING-STANDARDS.md`.
- Tests assert redaction and readback contracts in `tests/unit/observability/audit-redaction.test.ts`, `tests/unit/observability/operation-keys.test.ts`, and `tests/unit/observability/operator-controls.test.ts`.

## Comments

**When to Comment:**
- Add comments for architectural contracts and non-obvious boundaries, not for line-by-line narration.
- Good comment targets include cross-surface contracts (`src/modules/common/action.ts`), action registration constraints (`src/modules/actions/index.ts`), and quiet machine-surface boundaries (`src/routes/api.agent.tools.ts`).
- Scanner rule messages in `src/lib/ui/contract-scans.ts` should explain the rule and the exact violation.

**JSDoc/TSDoc:**
- Use TSDoc-style block comments for exported contracts with cross-module meaning: `ActionContext`, `AgentToolDescriptor`, and `describeActionForAgent` in `src/modules/common/action.ts`.
- Avoid large comments in pure domain functions where names and result unions already describe behavior.

## Function Design

**Size:** Keep exported functions focused on one boundary or domain operation.
- Domain functions accept explicit state and a command object, mutate the provided source state when appropriate, and return a typed result: `claimBusiness(state, command)` in `src/modules/business/internal/claim.ts`.
- Server functions should validate input, delegate to a `*ThroughSource` function, and keep route/UI-specific work out of the domain function: `submitPublicInquiryServer` and `submitPublicInquiryThroughSource` in `src/modules/inquiries/inquiry.functions.ts`.
- Route handlers should be thin adapters over module functions and response helpers: `handleListAgentTools` and `handleInvokeAgentTool` in `src/routes/api.agent.tools.ts`.

**Parameters:** Prefer one command object for domain mutations and one options object for builders.
- Commands carry actor/security/idempotency/time fields explicitly: `ClaimBusinessCommand` in `src/modules/business/public.ts`.
- Branded identifiers should be created through `brandNonEmpty` near the boundary where raw strings become durable IDs.
- Use optional-property compaction instead of writing `undefined` into records when `exactOptionalPropertyTypes` applies, as in `compactContact` and `compactOperatorFilter` in `src/modules/inquiries/inquiry.functions.ts`.

**Return Values:** Return exact discriminated objects.
- Domain results use `kind: 'ok' | 'error'` and exact `code` unions: `ClaimBusinessResult` in `src/modules/business/public.ts`.
- Route/API helpers return `Response` objects with explicit HTTP status and safe JSON bodies: `jsonError` in `src/routes/api.agent.tools.ts`.
- Source-port test seams return reset functions that must be called in `finally`: `setPublicRegistrySourcePortForTests` via `tests/helpers/source-ports.ts` and `setAnswerThreadPortForTests` via `tests/helpers/answer-thread-test-port.ts`.

## Module Design

**Exports:** Use module public seams and explicit registration.
- Export public domain types, const tuple values, and approved functions from `src/modules/<module>/public.ts`.
- Keep implementation in `src/modules/<module>/internal/*` and import it only through the owning module's public seam.
- Export TanStack server functions and source-port setters from `<module>.functions.ts` only when routes/tests need them.
- Define AE operations with `defineAction` in `<module>.actions.ts`, then import them into `src/modules/actions/index.ts`.
- Do not rely on module-evaluation side effects for action registration. `src/modules/actions/index.ts` uses an explicit `actions` array.

**Barrel Files:**
- The only broad central barrel is `src/modules/actions/index.ts`, which re-exports action infrastructure and registers action definitions.
- Module public seams (`src/modules/business/public.ts`, `src/modules/registry/public.ts`, `src/modules/observability/public.ts`) are intentional, ownership-specific barrels.
- Avoid new generic barrels that hide module ownership or make private imports easy.

## Skill-Defined Constraints

- TanStack Start rules from `.codex/skills/tanstack-start/SKILL.md` apply to server functions: use `createServerFn`, validate inputs, choose explicit HTTP methods, keep secrets server-side, and separate server/client concerns.
- TanStack Router rules from `.codex/skills/tanstack-router/SKILL.md` apply to routes: use file-based routing, typed route files, validated search params where route state is accepted, and route adapters over module seams.
- Convex rules from `.codex/skills/convex-best-practices/SKILL.md`, `.codex/skills/convex-functions/SKILL.md`, and `.codex/skills/convex-schema-validator/SKILL.md` apply to `convex/`: define `args` and `returns`, use indexes instead of filters for query paths, keep functions organized by domain, use internal functions for sensitive logic, and treat `convex/_generated/*` as generated output.
- Project product boundaries from `AGENTS.md` and `DESIGN.md` apply to code and copy: AE does not book, charge, dispatch, or auto-fulfil; public human surfaces must not expose internal architecture words such as `MCP`, `OpenAPI`, `callable`, `DTO`, or `source-owned`.

---

*Convention analysis: 2026-06-30*
