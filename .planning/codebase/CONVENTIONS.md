# Coding Conventions

**Analysis Date:** 2026-07-06

## Naming Patterns

**Files:**
- Put durable product behavior under owning domains in `src/modules/<domain>/`. Use `src/modules/<domain>/public.ts` as the public seam, `src/modules/<domain>/<domain>.functions.ts` for TanStack Start server functions, `src/modules/<domain>/<domain>.actions.ts` for assistant/action contracts, and `src/modules/<domain>/internal/*` for implementation details. Current examples: `src/modules/registry/public.ts`, `src/modules/registry/registry.functions.ts`, `src/modules/registry/registry.actions.ts`, `src/modules/registry/internal/search-documents.ts`.
- Put route adapters under `src/routes/` using TanStack file-route names. API routes use dotted filenames such as `src/routes/api.agent.tools.ts`, `src/routes/api.businesses.search.ts`, `src/routes/api.notification.resend-dispatch.ts`; operator routes live under `src/routes/_operator/` with owner/admin names such as `src/routes/_operator/owner.inquiries.$threadId.tsx`.
- Use PascalCase for React component files that export React components: `src/components/ae/inquiries/AeInquiryMessage.tsx`, `src/components/astryx/RouterLink.tsx`, `src/components/astryx/RouteProgressBar.tsx`.
- Use descriptive lower-kebab filenames for pure helpers and tests: `src/modules/registry/internal/search-documents.ts`, `src/modules/security/source-write-admission.ts`, `tests/unit/registry/search-documents.test.ts`, `tests/integration/agent-tools-api.test.ts`.
- Do not add new `src/components/ui/*`, shadcn/radix/cva wrappers, handwritten CSS files, route-local palettes, or a second `Ae*` presentation system. `AGENTS.md` and `DESIGN.md` make Astryx the active component authority; existing `src/components/ae/*` files are behavioral/project adapters, not permission to invent new visual primitives.

**Functions:**
- Use lower-camel verb phrases for functions: `listActions`, `describeActionForAgent`, `sourceWriteAdmissionFromContext`, `readPublicRegistrySearchPage`, `validatePublicOwnerClaimFlowInput`.
- Use `handle*` names for route-handler seams exported from route files: `handleInvokeAgentTool` in `src/routes/api.agent.tools.ts`, `handleSearchBusinessesRequest` in `src/routes/api.businesses.search.ts`, `handleBusinessDetailRequest` in `src/routes/api.businesses.$slug.ts`.
- Use `*Server` suffixes for TanStack server-function values consumed by routes: `submitPublicInquiryServer`, `readCurrentOwnerInquiryThreadServer`, `closeCurrentOwnerInquiryServer` in `src/modules/inquiries/inquiry.functions.ts`.
- Use `create*`, `read*`, `submit*`, `resolve*`, `build*`, `validate*`, `sync*`, `retry*`, and `normalize*` for domain operations. Keep state-machine verbs in the owning module internals, for example `src/modules/inquiries/internal/commands.ts`, `src/modules/registry/internal/search.ts`, and `src/modules/business-action/public.ts`.

**Variables:**
- Use lower camelCase for locals and module constants: `sentryPluginEnabled`, `registrySearchInputSchema`, `submitParameters`, `emptyInquiryState`, `defaultOwnerId`.
- Use `*Values` readonly arrays plus indexed-access union types for closed domains: `IndexStatusValues` / `IndexStatus` in `src/modules/registry/public.ts`, `SourceWriteAdmissionScopeValues` / `SourceWriteAdmissionScope` in `src/modules/security/source-write-admission.ts`, `ResultKindValues` / `ResultKind` in `src/modules/common/result.ts`.
- Use `as const` and `satisfies` for exact literal contracts: `durableTables` and `requiredIndexes` in `tests/unit/schema/convex-schema.test.ts`, `paymentBoundaryRules` in `tests/copy/phase1-banned-copy.test.ts`.
- Use branded identifiers from `src/modules/common/ids.ts` where a domain exposes a brand, for example `OwnerId`, `BusinessId`, `ServiceId`, `OperationKey`, and `CorrelationId` in `src/modules/registry/public.ts` and `src/routes/_operator/owner.inquiries.$threadId.tsx`.

**Types:**
- Use PascalCase for exported types and contract records: `ActionDefinition`, `AgentToolDescriptor`, `PublicInquirySubmitServerResult`, `RegistryProjectionAttemptContract`, `PublicOwnerStatusRouteReadbackResult`.
- Prefer exact discriminated unions with `kind`, `code`, `status`, or literal value arrays over broad strings. Examples: `ModuleResult` in `src/modules/common/result.ts`, `SyncCatalogProjectionResult` in `src/modules/registry/public.ts`, `PublicOwnerStatusRouteReadbackResult` in `src/modules/catalog/public.ts`.
- Keep Zod schemas, Convex validators, and TypeScript unions aligned. `tests/types/domain-contracts.test.ts` uses `expectTypeOf` against validators such as `ClaimStatusSchema`, `IndexStatusSchema`, and `OperatorControlKeySchema`; `tests/unit/schema/convex-schema.test.ts` checks table/index contracts.

## Code Style

**Formatting:**
- Formatting is convention-driven. No repo-owned `.prettierrc`, `prettier.config.*`, `eslint.config.*`, `.eslintrc*`, or `biome.json` is detected at the repo root.
- Follow TypeScript strictness from `tsconfig.json`: `strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `useUnknownInCatchVariables`, `noImplicitOverride`, `isolatedModules`, `allowJs: false`, and `noEmit`.
- Match observed source style: 2-space indentation, single quotes, no semicolons, trailing commas in multiline calls/objects/arrays, blank lines between import groups, and compact guard clauses.
- With `exactOptionalPropertyTypes`, omit absent fields instead of writing `undefined`. Use conditional object spreads such as `...(data.cursor === undefined ? {} : { cursor: data.cursor.trim() })`, as in `src/modules/registry/registry.actions.ts` and `src/routes/api.agent.tools.ts`.
- Runtime TypeScript must not use explicit `any`, non-null assertions, double casts through `unknown`, `v.any()`, broad `status: string` result fields, hard-coded source-CSRF strings, or `VITE_AE_SOURCE_WRITE_SECRET`. `scanTypeScriptStandards` in `src/lib/ui/contract-scans.ts` and `tests/imports/ts-standards.test.ts` enforce those rules.

**Linting:**
- Traditional linting is not configured. Use `npm run typecheck` plus guardrail tests as lint-like enforcement.
- Import/runtime boundaries are enforced through `tests/imports/backup-imports.test.ts`, `tests/imports/private-imports.test.ts`, `tests/imports/route-boundary.test.ts`, `tests/imports/source-mining.test.ts`, and `tests/imports/ts-standards.test.ts`.
- Public copy and assistant-descriptor language are enforced through `tests/copy/phase1-banned-copy.test.ts`, `tests/copy/claims-register.test.ts`, `tests/copy/pm05-trust-language-gate.test.ts`, `tests/copy/scope3-handshake-banned-copy.test.ts`, and Phase-specific copy tests under `tests/copy/*`.

## Import Organization

**Order:**
1. Node built-ins and external packages: `node:http`, `node:fs`, `@tanstack/react-router`, `@tanstack/react-start`, `@astryxdesign/core/*`, `convex/*`, `zod`, `vitest`.
2. Internal `@/` imports from public seams, server seams, components, hooks, and libraries: `@/modules/actions`, `@/modules/registry/public`, `@/modules/security/source-write-admission`, `@/components/ae/layout/AeOperatorShell`.
3. Relative imports for same-route helpers, same-module internals, route-local adapters, and styles: `./internal/search`, `./api.businesses`, `../styles/globals.css?url`.

**Path Aliases:**
- `tsconfig.json` maps `@/*` and `~/*` to `./src/*`; prefer `@/` in source and tests. It also maps route aliases for operator routes: `@/routes/owner.*`, `@/routes/admin.*`, and `@/routes/developers.discovery`.
- Do not import `src/modules/<domain>/internal/*` across route or sibling-module boundaries. Use `src/modules/<domain>/public.ts`, `src/modules/<domain>/server.ts`, or `<domain>.functions.ts` seams. The guarded exceptions are same-module `public.ts` files and Convex schema composition in `convex/schema.ts`.
- Routes are adapters over module seams. `tests/imports/route-boundary.test.ts` rejects route imports of Convex schema, Convex transport, module internals, clearance implementation files, and provider SDKs.
- Runtime source must not import `.planning` or `Agentic-Economy-Backup`, and Handshake kernel imports are quarantined. `tests/imports/backup-imports.test.ts` and `tests/imports/source-mining.test.ts` enforce these boundaries.

## Error Handling

**Patterns:**
- Domain functions return discriminated unions for expected outcomes rather than throwing. Shared result helpers in `src/modules/common/result.ts` use `{ kind: 'ok', code, ...payload }` and `{ kind: 'error', code, retryable, ...payload }`.
- Route handlers return stable JSON errors with explicit status codes. `jsonError` in `src/routes/api.agent.tools.ts` returns `{ kind: 'error', code, retryable: false, reason }`.
- Use Zod `.safeParse` at untrusted request boundaries where the route must return a structured 400, as in `handleInvokeAgentTool` in `src/routes/api.agent.tools.ts`. Use schema `.parse` where the caller is already a trusted server seam and fail-fast is appropriate.
- Throw `Error` for programmer/configuration failures and impossible fixture states: `SourceWriteAdmissionError` in `src/modules/security/source-write-admission.ts`, `requiredEnv`-style Convex configuration checks, and explicit fixture guards in `tests/unit/registry/search-documents.test.ts`.
- Fail closed at authority boundaries. Signed agent identity is attribution/quota/audit only; it is not write authority without per-tool admission. `src/routes/api.agent.tools.ts` requires signature step-up and write admission before `inquiry.submit` can write.

## Logging

**Framework:** `console` plus AE observability wrappers.

**Patterns:**
- Use route/domain readbacks and result codes instead of route-local logging for expected states.
- Put funnel, audit, Sentry, PostHog, supplier-action, operator-control, and redaction behavior under `src/lib/observability/*` and `src/modules/observability/*`.
- Redact provider payloads, private evidence, raw contacts, secrets, and customer messages before logs/readbacks. Reference tests: `tests/unit/observability/audit-redaction.test.ts`, `tests/unit/observability/vendor-integrations.test.ts`, `tests/unit/observability/operator-controls.test.ts`, `tests/unit/convex/notification-outbox-runtime.test.ts`.
- UI feedback goes through `src/lib/ui/toast.ts` and the app-level toaster in `src/routes/__root.tsx`; do not scatter one-off notification implementations across routes.

## Comments

**When to Comment:**
- Comment architectural contracts, authority constraints, and bundling/runtime gotchas. Good examples are `src/modules/common/action.ts`, `src/modules/actions/index.ts`, `src/components/astryx/RouterLink.tsx`, `src/styles/globals.css`, and the Astryx SSR note in `vite.config.ts`.
- Comments should explain why the code must be shaped a certain way: source-write admission body caps in `src/routes/api.agent.tools.ts`, route/client mirror constraints in `src/routes/__root.tsx`, or source-owned proof requirements in deploy-smoke tests.
- Do not comment obvious assignments, restate branch conditions, or leave commented-out code.

**JSDoc/TSDoc:**
- Use TSDoc-style blocks for public contracts and high-leverage adapters: `ActionDefinition` and action registration in `src/modules/common/action.ts`, the central registry in `src/modules/actions/index.ts`, route-link semantics in `src/components/astryx/RouterLink.tsx`.
- Public functions with precise names and exact types do not need decorative JSDoc. Prefer exact contracts over prose.

## Function Design

**Size:** Keep routes thin and domain logic source-owned.
- Routes in `src/routes/*` should parse/validate request or search input, call module seams, and render/return readbacks. Do not move domain rules into routes to shorten a module file.
- Domain state machines belong under `src/modules/<domain>/internal/*` or the domain public seam when the public contract is the state machine itself. Examples: `src/modules/inquiries/internal/commands.ts`, `src/modules/registry/internal/search.ts`, `src/modules/business-action/public.ts`.
- Large domain files are acceptable when they keep one cohesive state machine with strong tests. Split by ownership, not by arbitrary line count.

**Parameters:** Use named object parameters for multi-field commands and options.
- Examples: `sourceWriteAdmissionFromRequest({ request, scope, operationKey, correlationId })` in `src/lib/server/source-write-admission.ts`, `createSourceWriteAdmission({ scope, operationKey, correlationId, request })` in `src/modules/security/source-write-admission.ts`, and registry action calls in `src/modules/registry/registry.actions.ts`.
- Pass dependencies through options/test ports rather than mutating globals. Examples: network/DNS options in `src/modules/storefront/internal/import-draft.ts`, answer-thread test port wiring in `tests/helpers/answer-thread-test-port.ts`, and local OpenRouter contract server setup in `tests/helpers/openrouter-contract-server.ts`.
- If tests mutate `process.env`, restore values in `finally`. See `tests/integration/agent-tools-api.test.ts` and `tests/eval/answer-pipeline.test.ts`.

**Return Values:** Use exact contracts.
- Return discriminated unions and typed readbacks for domain, route, and assistant payloads.
- Use `readonly` arrays/objects for public contracts where mutation is not intended.
- Public DTO/readback names should describe ownership and surface: `PublicBusinessCatalogApiDto`, `PublicInquiryRouteReadback`, `AgentToolDescriptor`, `RegistryProjectionReadback`, `OwnerInquiryThreadRouteReadback`.

## Module Design

**Exports:** Public seams are explicit.
- Re-export domain-owned operations and types from `src/modules/<domain>/public.ts`. Same-module `public.ts` files may import their own internals; routes and sibling modules may not.
- Register assistant/action operations in `src/modules/actions/index.ts`. New action-backed operations belong in `src/modules/*/<module>.actions.ts` and must include `id`, `name`, boundary-honest `summary`, `boundaries`, strict Zod `schema`, `parameters`, `readOnly`, `surfaces`, `outputSchema`, and `run`.
- Keep Convex schema composition in `convex/schema.ts` with fragments owned by module internals such as `src/modules/registry/internal/schema.ts` and `src/modules/inquiries/internal/convex-schema.ts`.

**Barrel Files:** Use constrained domain barrels, not global barrels.
- `src/modules/actions/index.ts` is both an action registry and the action-contract barrel.
- `src/modules/<domain>/public.ts` files are domain public barrels.
- Avoid broad cross-domain barrels that hide ownership or allow private internals to leak.

## Validation and Authority Conventions

**Input Validation:**
- Validate every untrusted request body/search input before calling source seams. Use Zod `.strict()` on action schemas such as `registrySearchInputSchema` in `src/modules/registry/registry.actions.ts` and `agentToolInquirySubmitSchema` in `src/modules/inquiries/inquiry.actions.ts`.
- Bound request bodies at the route boundary. `src/routes/api.agent.tools.ts` uses `MAX_AGENT_TOOL_BODY_BYTES` and `readBoundedRequestText` from `src/lib/server/bounded-request-body.ts` before parsing JSON.
- Keep Convex validators exact. `convex/_generated/ai/guidelines.md` requires argument validators for every Convex function and exact schema definitions in `convex/schema.ts`; `tests/unit/schema/convex-schema.test.ts` guards table/index shape.

**Source-Owned Authority:**
- Browser input never supplies authority fields such as `actor`, `ownerId`, `adminId`, `claimedByOwnerId`, source evidence refs, provider event IDs, money fields, or receipt status. Authority comes from Clerk/Convex identity, source-owned rows, source-write admission, provider signature verification, or operator-controlled source state.
- All writes that cross public/assistant/server boundaries require source-write admission. The core implementation is `src/modules/security/source-write-admission.ts`; server adapters live in `src/lib/server/source-write-admission.ts`; tests use `tests/helpers/source-write-admission.ts`.
- Source-write secrets are server-only. `src/modules/security/source-write-admission.ts` rejects `VITE_`-prefixed source-write secrets and reuse of provider secrets such as `STRIPE_SECRET_KEY` or `AUTUMN_SECRET_KEY`.
- Web Bot Auth identity proves the caller identity only. `src/routes/api.agent.tools.ts` records identity for audit, then requires tool-specific write admission before writes. Do not treat signatures as permission.
- Provider proof must be reconstructed from source-owned records and redacted readbacks. Deploy-smoke tests such as `tests/deploy-smoke/phase6-business-action-stripe-smoke.spec.ts` explicitly reject dashboards, screenshots, env-var presence, return URL arrival, or webhook arrival alone as proof.

## UI and Copy Conventions

**UI System:**
- `DESIGN.md` is the visual/UI authority. `src/routes/__root.tsx` wires `Theme`, `LinkProvider`, and `LayerProvider` from Astryx once at the root.
- Use Astryx components from `@astryxdesign/core` and `@astryxdesign/theme-neutral` first. Put TanStack/Astryx adapters under `src/components/astryx/`, for example `src/components/astryx/RouterLink.tsx`.
- Tailwind 4 is layout glue only. `src/styles/globals.css` owns the CSS layer cascade and AE token overrides; do not add route-local CSS files or raw palette systems.
- Public UI must use semantic roles/tokens (`text-primary`, `text-secondary`, `bg-body`, `bg-surface`, `bg-card`, `border-border`, `shadow-sm`) rather than raw color utilities, arbitrary values, or one-off visual systems. `.ui-craft/tokens.md` records the token spine.

**No-Overclaim Copy:**
- AE may say it reads, compares, summarizes, routes to the next step, and sends a qualified inquiry when a listing publishes that capability. It must not imply booking, payment, dispatch, live availability, marketplace liquidity, autonomous fulfillment, wallet/credits, settlement, generic API marketplace, production autonomous payment support, or public readiness without evidence. `AGENTS.md`, `.planning/PROJECT.md`, and `.planning/STATE.md` define this contract.
- Keep internal vocabulary off public human surfaces and assistant-visible descriptors: `source-owned`, `readback`, `manifest`, `capability`, `gateway`, `operator`, `MCP`, `OpenAPI`, `callable`, `agent-native`, `DTO`, `fixture`, and unqualified `verified`.
- Use `Verified` only when paired with a named standard and evidence row/record. Otherwise use concrete words such as `published`, `claimed`, `checked`, `last checked`, `business supplied`, or `needs confirmation`.
- `KNOWN`, `UNKNOWN`, `UNAVAILABLE`, and `NEXT_STEP` belong only in JSON/API/agent payloads, `llms.txt`, and owner/admin contexts named in `AGENTS.md`; they do not appear as public human labels.
- Copy guardrails live in `src/lib/ui/contract-scans.ts`, `tests/copy/*`, and `tests/seo/*`. When changing public/assistant copy, update tests before treating copy as safe.

## Documentation Conventions

**Authority Documents:**
- `AGENTS.md` defines assistant/action boundaries and public-copy prohibitions.
- `DESIGN.md` defines the UI system, voice, motion, tokens, and public-surface rules.
- `.planning/PROJECT.md` defines engineering/product invariants and module ownership.
- `.planning/STATE.md` records active gates and proof blockers.
- Convex changes must follow `convex/_generated/ai/guidelines.md` before editing Convex functions/schema.

**How to Document:**
- Document why a boundary exists, what owns it, and which tests enforce it. Prefer file paths and executable references over broad narrative.
- Do not turn planning files into runtime authority. `tests/imports/backup-imports.test.ts` rejects planning runtime imports.
- Public-facing docs/copy must obey the same no-overclaim rules as source. If a claim depends on deployed/provider evidence, name the source-owned readback requirement and keep the public claim unavailable until the proof exists.

## Convex Conventions

- Read `convex/_generated/ai/guidelines.md` before editing Convex code.
- Always include argument validators for Convex functions and exact `returns` validators for public contracts. Use `v.null()` rather than `undefined` for Convex values.
- Define schema in `convex/schema.ts`; keep module-owned fragments under `src/modules/*/internal/*schema.ts`.
- Use indexes, `take`, pagination, `first`, or `unique` for bounded reads. `tests/unit/convex/registry-runtime.test.ts` asserts registry reads avoid unscoped table loads.
- Separate Node runtime actions with `"use node"` only when Node APIs are required. Do not import Node built-ins into Convex-reachable shared modules unless the file is intentionally Node-only.

---

*Convention analysis: 2026-07-06*
