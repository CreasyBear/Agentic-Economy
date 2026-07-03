---
analysis_date: 2026-07-03
focus: quality
---

# Coding Conventions

**Analysis Date:** 2026-07-03

## Project Guidance Sources

- Treat `PRODUCT.md` as the public trust contract. AE publishes business-supplied service pages, compares published details, and routes to a qualified inquiry only when that path is available. Do not imply booking, payment, dispatch, guaranteed availability, autonomous execution, fake reviews, or unsupported verification.
- Treat `DESIGN.md` as the UI authority. New UI uses Astryx (`@astryxdesign/core`) with `@astryxdesign/theme-neutral`, the root providers in `src/routes/__root.tsx`, and the TanStack adapter in `src/components/astryx/RouterLink.tsx`.
- Treat `convex/_generated/ai/guidelines.md` as the Convex rulebook. Convex functions need validators, server-derived auth, indexed bounded reads, and schema composition through `convex/schema.ts`.
- Apply quality skills when their area is touched: `.agents/skills/ui-craft/SKILL.md`, `.agents/skills/shadcn/SKILL.md`, `.agents/skills/react-doctor/SKILL.md`, `.codex/skills/convex-best-practices/SKILL.md`, `.codex/skills/tanstack-start/SKILL.md`, and `.codex/skills/playwright/SKILL.md`.
- Preserve the active trust boundaries in runtime source: human public surfaces use customer-facing language; machine surfaces use `/api/businesses*`, `/api/agent/tools`, action descriptors, and public JSON contracts.

## Naming Patterns

**Files:**
- Put domain source under `src/modules/<domain>/`. Use `public.ts` for safe public contracts, `<domain>.functions.ts` for TanStack server functions/source-port adapters, `<domain>.actions.ts` for action registry entries, `testing.ts` for test-only seams, and `internal/*` for private helpers. Examples: `src/modules/registry/public.ts`, `src/modules/registry/registry.functions.ts`, `src/modules/inquiries/inquiry.actions.ts`, and `src/modules/answer-thread/testing.ts`.
- Keep TanStack route files in `src/routes` using file-route names, including dotted API/operator routes and parameter files: `src/routes/api.agent.tools.ts`, `src/routes/api.answer.turn.ts`, `src/routes/owner.inquiries.$threadId.tsx`, `src/routes/admin.business-actions.$requestId.tsx`, and `src/routes/$slug.inquiry.tsx`.
- Use PascalCase for React component files in `src/components/ae`, prefixed with `Ae` for product-owned components: `src/components/ae/chat/AeChat.tsx`, `src/components/ae/forms/AePublicSearchBar.tsx`, and `src/components/ae/layout/AePublicShell.tsx`.
- Use lower-case/kebab-ish test file names inside domain folders: `tests/unit/registry/registry-fallback.test.ts`, `tests/integration/agent-tools-api.test.ts`, `tests/e2e/thread-first.spec.ts`, and `tests/ui-contract/class-scan.test.ts`.
- Convex runtime files live directly under `convex/` with domain names such as `convex/registry.ts`, `convex/inquiries.ts`, `convex/harnessSessions.ts`, and `convex/schema.ts`. Do not hand-edit `convex/_generated/*`.
- Keep generated route output in `src/routeTree.gen.ts`; do not edit it by hand.

**Functions:**
- Use `camelCase` verbs for helpers and domain operations: `readPublicRegistrySearchPage` in `src/modules/registry/registry.functions.ts`, `handleInvokeAgentTool` in `src/routes/api.agent.tools.ts`, `buildHarnessToolContracts` in `src/modules/harness/tool-contract.ts`, and `brandNonEmpty` in `src/modules/common/ids.ts`.
- Export route handlers as `handle*` functions when tests need to call them directly, for example `handleDurableSearchBusinessesRequest` in `src/routes/api.businesses.search.ts` and `handleAnswerTurnRequest` in `src/routes/api.answer.turn.ts`.
- Use `set*ForTests` for injectable ports and return reset callbacks, as in `setPublicRegistrySourcePortForTests` in `src/modules/registry/registry.functions.ts`, `setAnswerThreadPortForTests` in `src/modules/answer-thread/answer-thread.functions.ts`, and `setAnswerToolUseAgentForTests` in `src/modules/answer/internal/answer-tool-use-agent.ts`.
- Use `build*`, `read*`, `validate*`, `project*`, `resolve*`, `submit*`, `record*`, and `append*` according to behavior. Examples: `validatePublicInquiryFormInput` in `src/modules/inquiries/route-readbacks.ts`, `projectPrivateToolEvidenceForPublic` in `src/modules/harness/evidence-envelope.ts`, and `appendHarnessSessionEntry` in `convex/harnessSessions.ts`.
- Use Convex object syntax with `args`, `returns`, and `handler` for `queryGeneric`, `mutationGeneric`, and internal functions. Examples: `convex/registry.ts`, `convex/inquiries.ts`, and `convex/harnessSessions.ts`.

**Variables:**
- Use `const` by default. Use `let` only for mutable state such as test ports, counters, or loop-local accumulators; examples include `publicRegistrySourcePortForTests` in `src/modules/registry/registry.functions.ts` and `fallbackThreadRecordsSnapshot` in `src/components/ae/chat/AeChat.tsx`.
- Export literal value arrays with `as const` and derive union types from them: `SourceWriteAdmissionScopeValues` in `src/modules/security/source-write-admission.ts`, `AnswerTurnStatusValues` in `src/modules/answer-thread/answer-thread.schema.ts`, and `HarnessToolStatusValues` in `src/modules/harness/harness.schema.ts`.
- Name booleans with `is*`, `has*`, `uses*`, or state language. Examples: `isJsonContentType` in `src/routes/api.agent.tools.ts`, `usesClerkBypass` in `src/routes/__root.tsx`, and `hasMore` in `src/modules/registry/internal/search.ts`.
- Keep factories close to tests unless shared. Examples: `toolResult` in `tests/unit/harness/evidence-envelope.test.ts` and `buildProjection` in `tests/unit/chat/ae-chat-route-promotion.test.tsx`.

**Types:**
- Use PascalCase type aliases for domain contracts: `ActionDefinition` in `src/modules/common/action.ts`, `PublicBusinessCatalogApiDto` in `src/modules/registry/public.ts`, `HarnessRunReport` in `src/modules/harness/harness.schema.ts`, and `PublicThreadProjection` in `src/modules/answer-thread/answer-thread.schema.ts`.
- Use branded IDs from `src/modules/common/ids.ts` when a module already exposes identity brands. Use `brandNonEmpty` at runtime seams when turning a string into a branded ID.
- Use discriminated unions with exact literal `kind`, `code`, `status`, or `reason` values instead of broad strings. `tests/imports/ts-standards.test.ts` rejects broad runtime type holes.
- Avoid explicit `any`, non-null assertions, double casts through `unknown`, `v.any()`, broad `status: string`, and `Promise<unknown>` Convex return shapes. The scanner rules live in `src/lib/ui/contract-scans.ts`.
- Use Convex generated `Id`, `Doc`, `QueryCtx`, `MutationCtx`, and `ActionCtx` types from `convex/_generated/*` when writing typed Convex helpers, per `convex/_generated/ai/guidelines.md`.

## Code Style

**Formatting:**
- No root `eslint.config.*`, `.eslintrc*`, `.prettierrc*`, `prettier.config.*`, or `biome.json` is present. Preserve nearby style and avoid formatter-only churn.
- Use TypeScript ESM with single quotes, no semicolons, two-space indentation, trailing commas in multiline literals/calls, and `type` imports when only types are needed. Examples: `src/routes/api.agent.tools.ts`, `src/routes/__root.tsx`, and `src/modules/registry/public.ts`.
- Use conditional object spreads to omit optional fields rather than assigning `undefined`; `tsconfig.json` enables `exactOptionalPropertyTypes`. Examples: `src/routes/$slug.tsx`, `src/routes/api.answer.turn.ts`, and `src/modules/common/action.ts`.
- Prefer `satisfies` for object-literal type checks when it preserves literal precision, as in `emptyInquiryFormInput` in `src/routes/$slug.inquiry.tsx`.
- Keep imports readable: external packages first, blank line, app imports, then relative local imports. Preserve local grouping when a nearby file intentionally orders imports differently.
- Keep UI class strings layout-oriented. Tailwind is glue for spacing/grid/visibility; Astryx and tokens own visual styling.

**Linting:**
- Static enforcement is currently TypeScript strictness plus guardrail tests rather than a general ESLint/Prettier/Biome pipeline.
- `tsconfig.json` enables `strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `useUnknownInCatchVariables`, `noImplicitOverride`, `isolatedModules`, `moduleResolution: "Bundler"`, and `allowJs: false`.
- `doctor.config.ts` keeps React Doctor supply-chain posture visible and downgrades the intentional PostHog dependency finding to a warning.
- `tests/imports/ts-standards.test.ts` scans runtime source for type holes, `v.any()`, inexact Convex returns, hard-coded source-write literals, and client-exposed source-write secret names.
- `tests/imports/private-imports.test.ts` and `tests/imports/route-boundary.test.ts` enforce module-private and route/Convex boundaries.
- `tests/ui-contract/class-scan.test.ts`, `tests/ui-contract/public-language-copy.test.ts`, and `tests/copy/phase1-banned-copy.test.ts` enforce UI, public vocabulary, and trust-copy constraints.

## Import Organization

**Order:**
1. Node built-ins with `node:` prefixes, then external packages such as `@tanstack/react-router`, `@tanstack/react-start`, `@astryxdesign/core/*`, `zod`, `convex/*`, `lucide-react`, `@testing-library/react`, and `vitest`.
2. App imports through `@/`, usually module public seams, route-safe functions, UI components, hooks, or server helpers.
3. Relative imports for sibling route helpers and same-module internals.
4. Type-only imports should use `import type` when they do not carry runtime values.

**Path Aliases:**
- Prefer `@/*` for imports from `src/*`. It is used throughout routes, tests, and eval code, including `src/routes/api.agent.tools.ts`, `tests/integration/agent-tools-api.test.ts`, and `eval/answer/lib/evaluators.ts`.
- `~/*` is configured in `tsconfig.json` but is not the active style; use `@/*` for new code unless a nearby file already uses `~/*`.
- Convex files import source validators/contracts with relative paths such as `../src/modules/registry/internal/schema` because Convex is outside `src/`. Keep those imports limited to schema/function seams.

**Import constraints:**
- Routes in `src/routes` must be adapters over module seams. Do not import `convex/schema`, `convex/browser`, or `convex/server` from route files; use `src/lib/server/convex-source.ts` and module `*.functions.ts` instead.
- Routes and sibling modules must not import `src/modules/*/internal/*`; use `src/modules/<domain>/public.ts`, `<domain>.functions.ts`, or `<domain>.actions.ts`.
- `src/modules/<domain>/public.ts` may import and re-export from its own `./internal/*` files; it is the domain boundary.
- `convex/schema.ts` composes domain table definitions from module-owned internal schema files; keep durable schema composition centralized there.
- Do not import `.planning/*`, backup repo paths, or unowned future-phase runtime symbols into active runtime source. `tests/imports/source-mining.test.ts` and `tests/imports/backup-imports.test.ts` guard this.

## Error Handling

**Patterns:**
- Represent expected business states as exact discriminated unions, not thrown exceptions. Examples: `PublicBusinessCatalogDetailResult` in `src/modules/registry/public.ts`, `PublicInquirySubmitServerResult` in `src/modules/inquiries/inquiry.functions.ts`, and `SourceWriteAdmissionVerification` in `src/modules/security/source-write-admission.ts`.
- Return stable JSON error codes from API handlers. Examples: `jsonError('agent_tools_invalid_body', ...)` in `src/routes/api.agent.tools.ts` and `jsonError('rate_limited', 429, retryAfter)` in `src/routes/api.answer.turn.ts`.
- Validate request boundaries with Zod before domain execution. Examples: `registrySearchAction.schema` in `src/routes/api.businesses.search.ts`, `answerTurnRequestSchema` in `src/routes/api.answer.turn.ts`, and `publicInquirySubmitSchema` in `src/modules/inquiries/inquiry.functions.ts`.
- Use `safeParse` when a route needs to return a controlled response and `.parse` where an invalid programmer/config input should fail loudly. `src/routes/api.answer.turn.ts` uses `safeParse`; `src/routes/api.businesses.ts` uses action schema parsing for query params.
- Throw `Error` only for impossible invariants, route-local consistency bugs, or misconfiguration. Examples: duplicate action IDs in `src/modules/actions/index.ts`, empty branded IDs in `src/modules/common/ids.ts`, and missing Convex URL/auth in `src/lib/server/convex-source.ts`.
- Treat source-write failures as typed outcomes. `src/modules/security/source-write-admission.ts` returns reasons such as `missing_source_write_admission`, `source_write_scope_mismatch`, and `invalid_source_write_signature`.
- Convex functions should derive auth server-side, return exact validators, use `withIndex`/`withSearchIndex`, and keep reads bounded with `.take()`, `.paginate()`, or `.unique()` when possible. See `convex/registry.ts`, `convex/security.ts`, and `convex/harnessSessions.ts`.

## Logging

**Framework:** `console`, Sentry, PostHog, route-level timing sinks, and source-owned observability modules.

**Patterns:**
- Prefer source-owned observability helpers over ad hoc logs. Relevant files include `src/modules/observability/funnel.source.ts`, `src/modules/observability/public.ts`, `src/lib/observability/capture-client-events.ts`, and `src/lib/observability/sentry.client.ts`.
- Client product events should go through `captureClientProductEventOnClient`, as in `src/components/ae/chat/AeChat.tsx`.
- Server/source events should preserve public/private data boundaries. Tests such as `tests/unit/harness/evidence-envelope.test.ts`, `tests/unit/inquiries/inquiry-flow.test.ts`, and `tests/integration/answer-tool-calls.test.ts` assert private evidence and raw contact details do not leak.
- Timing sinks should be explicit and named. `readPublicRegistrySearchPage` in `src/modules/registry/registry.functions.ts` records `registry.search.*` timing names through `ActionTimingSink`.
- Sentry and PostHog vendor SDKs belong in observability integration files, not scattered through UI components.

## Comments

**When to Comment:**
- Comment cross-surface contracts, trust boundaries, and tree-shaking-sensitive registries. Examples: `src/modules/common/action.ts`, `src/modules/actions/index.ts`, `src/routes/api.agent.tools.ts`, and `src/styles/globals.css`.
- Use comments to explain public/private evidence handling only where types and names are not enough, as in `src/modules/harness/evidence-envelope.ts` and `src/modules/answer-thread/answer-thread.schema.ts`.
- Do not use comments to excuse unsafe public copy or unsupported behavior. Add/update guardrail tests in `tests/copy`, `tests/ui-contract`, or `tests/integration` instead.

**JSDoc/TSDoc:**
- Use block comments for exported architectural seams and action contracts, for example the action contract in `src/modules/common/action.ts`, registry action boundaries in `src/modules/registry/registry.actions.ts`, and the quiet agent route in `src/routes/api.agent.tools.ts`.
- Do not add boilerplate JSDoc to every helper; the repo style reserves it for public contracts, unusual boundaries, and high-risk behaviors.

## Function Design

**Size:** Keep pure domain functions focused on one transition, projection, or validation rule. Larger adapter files are acceptable when they own a complete route/source seam, but shared logic belongs in `src/modules/<domain>/public.ts` or `src/modules/<domain>/internal/*`.

**Parameters:** Prefer single object parameters for domain commands, source reads/writes, route readbacks, and operations carrying IDs, authority, `now`, operation keys, correlation IDs, source-write admission, or timing context. Examples include `createSourceWriteAdmission` in `src/modules/security/source-write-admission.ts`, `readPublicRegistrySearchPage` in `src/modules/registry/registry.functions.ts`, and `streamAnswerTurn` usage in `src/routes/api.answer.turn.ts`.

**Return Values:** Return exact DTOs and discriminated unions. Use `null` only when absence is a real data value, and keep Convex return values serializable. Do not return raw Convex rows or private evidence from public projections.

**Async:** Keep async at route, storage, network, model, source-port, and test-port boundaries. Keep pure projection/state-transition helpers synchronous when practical.

**State injection:** Expose `set*ForTests` functions for mutable ports and reset them in `finally` blocks or `afterEach`. Examples: `tests/helpers/source-ports.ts`, `tests/helpers/answer-thread-test-port.ts`, and `tests/unit/harness/run-viewer-functions.test.ts`.

## Module Design

**Exports:** Export safe domain contracts from `src/modules/<domain>/public.ts`; export TanStack/server/source adapters from `*.functions.ts`; export action descriptors from `*.actions.ts`; export test-only seams from `testing.ts` when multiple tests need internal adapters.

**Barrel Files:** Use deliberate barrels only for public seams and registries. Examples: `src/modules/actions/index.ts`, `src/modules/harness/public.ts`, and `src/modules/answer-thread/public.ts`. Do not add broad catch-all barrels that hide ownership or cross internal boundaries.

**Actions:** Add agent/HTTP actions in `src/modules/<domain>/<domain>.actions.ts`, define them with `defineAction`, and register them explicitly in `src/modules/actions/index.ts`. Each action needs `id`, `name`, `summary`, `boundaries`, Zod `schema`, Zod `outputSchema`, `parameters`, `readOnly`, `surfaces`, and `run`. Current examples are `registry.search`, `registry.detail`, `registry.list`, and `inquiry.submit`.

**Routes:** Keep TanStack routes thin. Use `createFileRoute`, `validateSearch` for URL state, `loader`/`loaderDeps` for server data, `head` for metadata, `pendingComponent`/`errorComponent` when relevant, and exported handler helpers for API tests. Examples: `src/routes/index.tsx`, `src/routes/$slug.tsx`, `src/routes/api.businesses.search.ts`, and `src/routes/api.agent.tools.ts`.

**Operator routes:** Spread `operatorRouteOptions` from `src/lib/operator/route-options.ts` into `/owner/*`, `/admin/*`, and `/developers/*` routes so `beforeLoad`, pending, and error chrome stay consistent.

**Components:** Use Astryx primitives first (`Button`, `Card`, `FormLayout`, `TextInput`, `Layout`, `Grid`, `Stack`, `Badge`, `Token`) and product-owned `Ae*` components for AE behavior. Keep real form controls, explicit labels, `aria-*`, keyboard behavior, and route-specific IDs. Examples: `src/routes/$slug.inquiry.tsx`, `src/components/ae/chat/AeAnswerPromptInput.tsx`, and `src/components/ae/forms/AePublicSearchBar.tsx`.

**Convex:** Compose schemas in `convex/schema.ts`, use table definitions from module-owned internal schema files, define functions with validators and exact returns, and keep Node-only actions separate from queries/mutations if Node APIs are required. Do not use `ctx.db` from Convex actions.

**Generated files:** Do not manually edit `src/routeTree.gen.ts` or `convex/_generated/*`. Regenerate them through the project toolchain when their sources change.

## Validators And Boundary Contracts

- Use Zod for HTTP/server/action input and output schemas. Examples: `registrySearchInputSchema` and `registryDetailOutputSchema` in `src/modules/registry/registry.actions.ts`, `publicInquirySubmitSchema` in `src/modules/inquiries/inquiry.functions.ts`, and `answerTurnRequestSchema` in `src/modules/answer-thread/answer-thread.schema.ts`.
- Use Convex `v.*` validators for durable schema and functions. Examples: `convex/schema.ts`, `convex/registry.ts`, `convex/business.ts`, and `convex/harnessSessions.ts`.
- Derive runtime union validators from literal arrays where possible. Examples: `src/modules/registry/internal/validators.ts`, `src/modules/catalog/internal/validators.ts`, and `src/modules/observability/internal/validators.ts`.
- Keep source-write admission signed, scoped, operation-bound, correlation-bound, route-bound, and stale-checked through `src/modules/security/source-write-admission.ts` and `src/lib/server/source-write-admission.ts`.
- Action descriptors must be strict enough for harness execution. `src/routes/api.agent.tools.ts` refuses tools when `describeHarnessToolExecutionValidation` reports strict input/output schema violations.

## AE Trust And Copy Guardrails

**Public contract:**
- AE can read, compare, summarize, show published facts, and route to a qualified inquiry when a listing publishes that path.
- AE does not book, charge, dispatch, guarantee a quote, guarantee availability, or autonomously fulfill work.
- Use `verified` only when a named verification standard exists and the listing meets it. Prefer checked/supplied/published/needs-confirmation language.

**Human public copy:**
- Keep internal architecture terms out of human-facing routes/components. `PRODUCT.md`, `DESIGN.md`, and `src/lib/ui/contract-scans.ts` ban terms such as `source-owned`, `readback`, `manifest`, `gateway`, `operator`, `MCP`, `OpenAPI`, `callable`, `autonomous`, `agent-native`, `DTO`, `fixture`, and `KNOWN/UNKNOWN/UNAVAILABLE/NEXT_STEP` on public surfaces.
- Use customer-facing labels such as "What to do now" instead of "Next step" on human public surfaces. `scanPublicLanguage` in `src/lib/ui/contract-scans.ts` enforces this.
- Keep future/payment/platform claims negative or confined to owning runtime/planning contexts. `scanCopyClaims` in `src/lib/ui/contract-scans.ts` contains phase-specific rules for inquiries, discovery, protected actions, paid activation, and business-action receipts.

**Copy tests:**
- `tests/copy/phase1-banned-copy.test.ts` scans routes, AE components, modules, SEO/discovery outputs, generated files, and public assets.
- `tests/copy/discovery-overclaim.test.ts`, `tests/copy/phase4-protected-action-claims.test.ts`, `tests/copy/phase6-business-action-claims.test.ts`, and `tests/seo/business-action-claims.test.ts` constrain phase-owned claims.
- `tests/ui-contract/public-language-copy.test.ts` scans public human surfaces for internal/mechanism/money-rail/generic registry language.

## UI Styling Conventions

**Design source:** `DESIGN.md` is authoritative. `src/routes/__root.tsx` wires Astryx `Theme`, `LinkProvider`, and `LayerProvider`; `src/styles/globals.css` owns the CSS layer cascade; `src/styles/tokens.css` is a legacy token shim for surfaces still migrating.

**Tokens:**
- Use Astryx theme-neutral tokens and component props first.
- Use Tailwind 4 utilities for layout glue: grid/flex, gap, spacing, responsive breakpoints, visibility, and max-width.
- Use semantic classes such as `text-primary`, `text-secondary`, `bg-surface`, `bg-card`, `border-border`, `rounded-md`, and `shadow-sm` where Tailwind glue is needed.
- Do not use raw hex/OKLCH/RGB/HSL literals, generic Tailwind color utilities, `space-x`/`space-y`, `transition-all`, hardcoded high `z-*`, raw black overlays, generic shadow utilities, or arbitrary visual tokens in product-owned routes/components. `tests/ui-contract/class-scan.test.ts` enforces this.

**Components:**
- Use Astryx docs/templates before composing a route-local alternative. If a component gap is real, compose Astryx primitives first; if that fails, own an ejected Astryx source under `src/components/astryx/`.
- Do not add new shadcn/Radix/CVA primitives to `src/components/ui/*`; that directory is legacy compatibility only.
- Keep `LinkProvider`-compatible navigation for Astryx link/button components on TanStack Router routes.
- Public chat input must remain a real textarea with `role="searchbox"`, `name="q"`, and accessible name "What do you need done?" as implemented in `src/components/ae/chat/AeAnswerPromptInput.tsx`.

## Harness, Answer, Eval, And Graph Conventions

- Harness primitives live under `src/modules/harness/*`; import from `src/modules/harness/public.ts` outside the harness module.
- Convert AE actions to harness tool contracts with `actionToHarnessToolContract` and `buildHarnessToolContracts` in `src/modules/harness/tool-contract.ts`; do not duplicate quiet-agent or answer-model descriptors by hand.
- Keep quiet agent exposure exact. `PublicQuietAgentToolIds` in `src/modules/harness/tool-contract.ts` exposes `registry.search`, `registry.detail`, and `inquiry.submit`; `src/routes/api.agent.tools.ts` filters through `filterQuietAgentToolContracts`.
- Keep raw tool evidence private. Use `createPrivateToolEvidence`, `projectPrivateToolEvidenceForPublic`, `projectPrivateToolEvidenceForReplay`, and `projectPrivateToolEvidenceForCompaction` from `src/modules/harness/evidence-envelope.ts`.
- Public thread projections must expose sanitized counts/status only. `tests/unit/harness/evidence-envelope.test.ts`, `tests/unit/answer-thread/public-projection.test.ts`, and `tests/integration/answer-tool-calls.test.ts` protect this.
- Answer-thread public contracts live in `src/modules/answer-thread/public.ts`; test-only seams live in `src/modules/answer-thread/testing.ts`; internal orchestration lives under `src/modules/answer-thread/internal/*`.
- Answer eval cases live in `eval/answer/lib/cases.ts`; promptfoo config lives in `eval/answer/promptfooconfig.yaml`; coverage rules live in `eval/answer/lib/coverage.ts`.
- Keep graph artifacts fresh when changing watched runtime/eval/schema/projection paths; the watcher is `tests/scripts/assert-graph-fresh.ts` and the test entry is `tests/eval/graph-freshness.test.ts`.

## Guardrail Command Inventory

- `npm run typecheck`: TypeScript strict check.
- `npm run check:convex-codegen`: Convex dry-run codegen after Convex schema/function changes.
- `npm run test:imports`: import/private/route-boundary scans.
- `npm run test:source-mining`: backup/future-surface/source-mining scans.
- `npm run test:ts-standards`: broad TypeScript standards scans.
- `npm run test:copy`: public copy and overclaim scans.
- `npm run test:seo`: SEO and public discovery guardrails.
- `npm run test:ui-contract`: UI token, class, layout, status, and public-language contracts.
- `npm run test:eval`: answer eval coverage/report/promptfoo/Vitest eval chain.
- `npm run test:graph-freshness`: graph report freshness gate.
- `npm run test:e2e`: local browser flows under `tests/e2e`.
- `npm run test:a11y`: accessibility browser flows under `tests/e2e/a11y`.
- `npm run test:all`: main non-E2E release-quality suite plus build.
- `npm run test:release`: full release gate including eval, graph freshness, E2E, a11y, and build.

---

*Convention analysis: 2026-07-03*
