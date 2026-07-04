# Coding Conventions

**Analysis Date:** 2026-07-04

## Naming Patterns

**Files:**
- Use TanStack file-route names under `src/routes/`: examples include `src/routes/api.agent.tools.ts`, `src/routes/$slug.inquiry.tsx`, `src/routes/owner.inquiries.$threadId.tsx`, `src/routes/llms[.]txt.ts`, and `src/routes/robots[.]txt.ts`.
- Keep domain code under `src/modules/<domain>/`: public seams live in `src/modules/<domain>/public.ts`, server functions in `src/modules/<domain>/<domain>.functions.ts`, action declarations in `src/modules/<domain>/<domain>.actions.ts`, and implementation details in `src/modules/<domain>/internal/*.ts`.
- Use focused internal filenames for domain concepts: `src/modules/inquiries/internal/commands.ts`, `src/modules/registry/internal/search-documents.ts`, `src/modules/answer-thread/internal/tool-runner.ts`.
- Use PascalCase `Ae*` filenames for existing AE React components, grouped by surface: `src/components/ae/inquiries/AeInquiryComposer.tsx`, `src/components/ae/chat/AeFollowUpChips.tsx`, `src/components/ae/layout/AeOperatorShell.tsx`.
- Use kebab-style or descriptive helper filenames for non-component modules: `src/lib/server/source-write-admission.ts`, `src/lib/http/security-headers.ts`, `tests/helpers/openrouter-contract-server.ts`.
- Mirror feature areas in tests: `tests/unit/inquiries/inquiry-flow.test.ts`, `tests/integration/agent-tools-api.test.ts`, `tests/ui-contract/class-scan.test.ts`, `tests/e2e/chat-discovery-inquiry-loop.spec.ts`.

**Functions:**
- Use lower camelCase with verb-led names for behavior: `submitPublicInquiryThroughSource` in `src/modules/inquiries/inquiry.functions.ts`, `handleInvokeAgentTool` in `src/routes/api.agent.tools.ts`, `searchPublicBusinessCatalog` in `src/modules/registry/internal/search.ts`.
- Prefix route handlers with `handle*Request` or `handle*`: `handleDurableListBusinessesRequest` in `src/routes/api.businesses.ts`, `handleListAgentTools` in `src/routes/api.agent.tools.ts`.
- Prefix read/write source seams with intent and source: `readCurrentOwnerInboxThroughSource`, `replyCurrentOwnerInquiryThroughSource`, and `closeCurrentOwnerInquiryThroughSource` in `src/modules/inquiries/inquiry.functions.ts`.
- Name test factories as direct constructors/builders: `sourceState`, `submitCommand`, `validInquirySubmitInput`, `createAnswerThreadTestStore`, and `startOpenRouterContractServer`.

**Variables:**
- Use lower camelCase for local values and objects: `operationSuffix`, `correlationId`, `submitLockRef`, `sentryPluginEnabled`.
- Use `const` for literal registries and closed value lists: `IndexStatusValues` in `src/modules/registry/public.ts`, `CapabilityKindValues` in `src/modules/catalog/public.ts`, `ResultKindValues` in `src/modules/common/result.ts`.
- Use uppercase only for test constants or environment-like constants: `REQUEST_URL` in `tests/integration/agent-tools-api.test.ts`, `QUERY` in `tests/e2e/chat-discovery-inquiry-loop.spec.ts`.
- Prefer conditional object spreads to preserve `exactOptionalPropertyTypes`: examples appear throughout `src/modules/registry/registry.actions.ts` and `src/modules/inquiries/inquiry.functions.ts`.

**Types:**
- Use PascalCase for exported types and discriminated unions: `PublicInquirySubmitServerResult`, `OwnerInquiryMutationServerResult`, `RegistryProjectionAttemptContract`.
- Model result values as discriminated unions using `kind`, plus `code` where useful. Shared helpers live in `src/modules/common/result.ts`.
- Use branded IDs for domain identifiers instead of plain strings at domain boundaries: `BusinessId`, `ServiceId`, `OperationKey`, and `SourceHash` in `src/modules/common/ids.ts`.
- Keep runtime literal arrays aligned with type unions using `as const`: `RegistryRepairActionValues` in `src/modules/registry/public.ts`, `InquiryThreadStatusValues` via `src/modules/inquiries/public.ts`.

## Code Style

**Formatting:**
- Tool used: Not detected. There is no ESLint, Prettier, Biome, or EditorConfig file in the repository.
- Key settings: TypeScript strictness is the main style gate via `tsconfig.json`: `strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `useUnknownInCatchVariables`, `noImplicitOverride`, `isolatedModules`, and `noEmit`.
- Follow the dominant source style: single quotes, no semicolons, two-space indentation, trailing commas in multi-line calls/objects, and blank lines between import groups.
- Keep line wrapping readable. Large zod/Convex validators in `src/modules/registry/registry.actions.ts` and `convex/inquiries.ts` use multi-line object literals and `v.union` / `z.discriminatedUnion` blocks.
- For class names, compose with `cn` from `src/lib/utils.ts` when merging conditional Tailwind/Astryx classes, as in `src/components/ae/inquiries/AeInquiryComposer.tsx`.

**Linting:**
- Tool used: Not detected as a standalone linter.
- Key rules: Guardrail tests enforce many lint-like rules from `src/lib/ui/contract-scans.ts`:
  - No explicit `any`, broad status strings, non-null assertions, `v.any()`, double casts, or client-exposed source-write secrets via `tests/imports/ts-standards.test.ts`.
  - No route-owned Convex transport, route Convex schema imports, or route private-module imports via `tests/imports/route-boundary.test.ts`.
  - No cross-module imports from `internal/` except from a module's own `public.ts`, and no runtime imports from `.planning`, backup repos, or quarantined protocol packages via `tests/imports/private-imports.test.ts` and `tests/imports/backup-imports.test.ts`.
  - No raw visual tokens, `space-x` / `space-y`, broad `transition-all`, hard-coded high z-indexes, raw black overlays, generic Tailwind shadows, or arbitrary visual token classes in product routes/components via `tests/ui-contract/class-scan.test.ts`.

## Import Organization

**Order:**
1. External packages and Node built-ins, with type imports adjacent where useful: `@tanstack/react-router`, `@tanstack/react-start`, `react`, `zod`, `node:http`.
2. UI package imports and shared components: Astryx imports such as `@astryxdesign/core/Button`, Lucide icons, then AE components.
3. Internal aliases from `@/`, then local relative imports from `./internal/*` or `../src/*`.

**Path Aliases:**
- Use `@/*` for `src/*` from application and test code, configured in `tsconfig.json`, `vite.config.ts`, and `vitest.config.ts`.
- `~/*` also maps to `src/*` in `tsconfig.json`, but observed runtime code uses `@/*`; prefer `@/*` for new code.
- Convex files under `convex/` often import app modules with relative paths such as `../src/modules/inquiries/public` because the Convex tsconfig base is the repository root.

## Error Handling

**Patterns:**
- Return typed discriminated results for expected domain failures. `src/modules/common/result.ts` defines `ok`, `error`, and `ModuleResult`, and domain modules use codes such as `inquiry_invalid_input`, `inquiry_rate_limited`, and `business_not_found`.
- Use `try/catch` at route/server boundaries to translate source errors into safe result shapes. `src/modules/inquiries/inquiry.functions.ts` catches source errors and returns `ServerErrorResult` values instead of leaking exceptions.
- Throw only for invariant failures or unsafe configuration states. Examples: duplicate action IDs in `src/modules/actions/index.ts`, impossible default registry build failures in `src/modules/registry/internal/search.ts`, and production Clerk bypass in `src/routes/__root.tsx`.
- Route JSON errors should use small helper functions that include stable codes and HTTP status. `src/routes/api.agent.tools.ts` returns `jsonError(code, reason, status)` for invalid content type, invalid body, unknown tool, policy refusal, invalid output, and run failure.
- Public assistant/action boundaries must remain explicit. Action definitions in `src/modules/registry/registry.actions.ts` and `src/modules/inquiries/inquiry.actions.ts` include `summary`, `boundaries`, `readOnly`, `surfaces`, zod `schema`, and zod `outputSchema`.
- Keep AE's trust contract intact in copy and tool descriptions: AE reads, compares, summarizes, routes to a next step, and may submit qualified inquiries; it does not book, charge, dispatch, or auto-fulfil. This is enforced by `AGENTS.md`, `PRODUCT.md`, and copy tests under `tests/copy/`.

## Logging

**Framework:** Sentry/PostHog plus limited `console`

**Patterns:**
- Sentry server initialization and sensitive URL filtering live in `src/lib/observability/sentry.server.ts`; use `captureServerException(error, context)` for server exception capture when observability is enabled.
- Client/server observability configuration is parsed through `src/lib/observability/config.ts` and tested in `tests/unit/observability/vendor-integrations.test.ts`; do not read telemetry env vars ad hoc in feature code when helpers exist.
- Funnel and audit events are domain records, not free-form logs. Use observability module seams such as `src/modules/observability/public.ts`, and keep private payloads redacted or hashed.
- Convex action examples in `convex/_generated/ai/guidelines.md` allow `console.log`, but production AE modules generally prefer typed audit/funnel records over console logging.

## Comments

**When to Comment:**
- Use docblocks for architectural contracts and safety boundaries. Good examples: `src/modules/common/action.ts`, `src/modules/actions/index.ts`, and `src/routes/api.agent.tools.ts`.
- Use comments to explain platform constraints that are not obvious from code, such as the Astryx SSR bundling note in `vite.config.ts` and the Vercel Node runtime note in `vite.config.ts`.
- Avoid comments that repeat implementation. Domain functions in `src/modules/inquiries/internal/commands.ts` and `src/modules/registry/internal/search.ts` rely on descriptive names and result codes for most logic.

**JSDoc/TSDoc:**
- Use JSDoc for exported contracts that other surfaces consume, especially action descriptors and public seams. `src/modules/common/action.ts` documents how one declaration fans out to React UI, HTTP API, agent JSON, and agent-tools surfaces.
- Use inline `type` exports and literal union names instead of broad prose when documenting domain values; pair with tests like `tests/types/domain-contracts.test.ts`.

## Function Design

**Size:** Keep pure domain functions focused around one command/readback. Larger orchestration functions are acceptable at source boundaries when they sequence validation, source admission, source mutation/query, and result translation, as in `submitPublicInquiryThroughSource` in `src/modules/inquiries/inquiry.functions.ts`.

**Parameters:** Prefer object parameters for public functions and command objects for domain writes:

```typescript
export type SubmitInquiryCommand = {
  target: InquiryTargetRef
  body: string
  contact: PublicInquiryContactInput
  operationKey: OperationKey
  correlationId: CorrelationId
  now: number
}
```

Use optional dependency objects for adapters, env maps, and timing sinks instead of hard-coded globals: examples include `SyncCatalogProjectionOptions` in `src/modules/registry/public.ts`, `sourceWriteAdmissionFromContext` in `src/lib/server/source-write-admission.ts`, and `ActionTimingSink` in `src/modules/common/action.ts`.

**Return Values:** Prefer exact object results over booleans or exceptions:

```typescript
export type PublicBusinessCatalogDetailResult =
  | { kind: 'found'; schemaVersion: typeof apiSchemaVersion; business: PublicBusinessCatalogApiDto }
  | { kind: 'not_found'; code: 'business_not_found'; reason: string }
```

Use `readonly` arrays and `Readonly<...>` when returning public descriptors or immutable contracts, as in `ActionDefinition` and `AgentToolDescriptor` in `src/modules/common/action.ts`.

## Module Design

**Exports:** Use `public.ts` as the module seam. A module's `public.ts` may import from its own `internal/` folder and re-export stable types/functions, as in `src/modules/catalog/public.ts` and `src/modules/registry/public.ts`.

**Barrel Files:** Use intentional registry/barrel files only for public seams and central registries. `src/modules/actions/index.ts` explicitly imports action constants and builds the action list; do not rely on side-effect registration because bundlers can tree-shake it.

**UI Modules:** Follow `DESIGN.md`: use Astryx (`@astryxdesign/core` and `@astryxdesign/theme-neutral`) first, Tailwind 4 only as layout glue, and keep new presentation out of bespoke `Ae*` systems. Existing `src/components/ae/*` components may remain while being re-skinned, but do not add new parallel shadcn/radix/cva wrappers or new CSS files under `src/styles/`.

**Convex Modules:** Read `convex/_generated/ai/guidelines.md` before changing `convex/*`. Convex functions must include argument validators, exact `returns` validators, proper public/internal registration, and indexed bounded reads. Schema composition happens through `convex/schema.ts`, which imports module-owned table definitions from files such as `src/modules/inquiries/internal/convex-schema.ts`.

**Route Modules:** Routes are adapters over public seams and server functions. Keep data access in module functions like `src/modules/registry/registry.functions.ts`, not in route files. `tests/imports/route-boundary.test.ts` enforces this.

---

*Convention analysis: 2026-07-04*
