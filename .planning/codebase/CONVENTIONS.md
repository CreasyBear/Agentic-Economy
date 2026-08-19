# Coding Conventions

**Analysis Date:** 2026-08-19

## Naming Patterns

**Files:**
- Domain modules under `src/modules/<name>/` use kebab-case files: `route-transport-runtime.ts`, `operation-invoke-contracts.ts`, `source-write-admission.ts`.
- Convex host files under `convex/` use camelCase: `capabilitySupply.ts`, `capabilityOperationInvocations.ts`, `marketDispatchWorkpool.ts`, `authz.ts`.
- Product UI components use `Ae` + PascalCase in `src/components/ae/`: `AeQueryPanel.tsx`, `AePaidOperationCard.tsx`, `AeGenerativeAnswer.tsx`.
- Hooks and client state beside those components stay kebab-case: `use-answer-turn-lifecycle.ts`, `answer-turn-state.ts`.
- Tests mirror the domain, not the Convex filename: `tests/unit/capability-execution/operation-invoke.test.ts`, `tests/unit/convex/capability-operation-worker.test.ts`.
- Colocated Convex tests exist as `convex/*.test.ts` (`convex/workTrees.test.ts`, `convex/studies.test.ts`) when the seam is the Convex module itself.

**Functions:**
- Use camelCase. Prefix by role: `create*` factories (`createPublicOperationRef` in `src/modules/capability-supply/public.ts`), `build*` projections (`buildProblem` in `src/lib/errors.ts`), `handle*` HTTP adapters (`handleOperationInvokePost` in `src/lib/server/operation-invoke-api.ts`), `scan*` guardrails (`scanTypeScriptStandards` in `src/lib/ui/contract-scans.ts`), `require*` / `resolve*` auth (`requireAdminAuthority` via `convex/authz.ts`).
- Convex registered functions keep the file-based API name (`api.example.f`). Do not invent a second public name.

**Variables:**
- camelCase. Prefer `const` and `Readonly<>` for inputs and views.
- Discriminated-result locals stay `kind`-first: `admitted`, `refused`, `seeded`, `observed`.
- Prefix unused binding with `_` (`_ignoredPayload` in `convex/authz.ts`, `_exhaustive` in switch defaults).

**Types:**
- PascalCase. Domain IDs are branded in `src/modules/common/ids.ts` (`OwnerId`, `BusinessId`, `OperationKey`, `CorrelationId`) via `Brand<Value, Name>`.
- Public operation refs are branded strings in `src/modules/capability-supply/public.ts` (`PublicOperationRef`).
- Discriminated unions use `kind` (and sometimes `code`) as the tag: `PaymentLaneAdmission` in `src/modules/capability-supply/internal/x402-invocation-policy.ts`.
- Literal unions come from `as const` value arrays (`PROBLEM_KINDS` in `src/lib/errors.ts`, `*Values` in `src/modules/observability/public.ts`). Do not type status/result/source-state fields as bare `string`.
- Use `Id<'tableName'>` and `Doc<'tableName'>` from `convex/_generated/dataModel` for Convex documents. Never take a caller-supplied `userId` for authorization.

## Code Style

**Formatting:**
- No repo Prettier or Biome config. Match neighboring files: 2-space indent, semicolons, single quotes in current `src/` and `tests/` modules.
- `src/lib/ui/contract-scans.ts` still uses double quotes; do not restyle it while adding a rule.
- TypeScript is the only runtime language. `tsconfig.json` is `strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `useUnknownInCatchVariables`, `noImplicitOverride`.

**Linting:**
- Oxlint via `.oxlintrc.json`. Run `npm run lint` (`oxlint src convex tests tools --deny-warnings`).
- Categories: `correctness` error; `suspicious` off. Plugins: `typescript`, `oxc`.
- Enforced holes: `no-debugger` error. Unused-vars and underscore-dangle are off because `_` unused bindings are the convention.
- Ignore generated and fixture trees: `convex/_generated/**`, `tests/fixtures/**`, `vendor/**`.
- TypeScript standards are a second lint, not Oxlint: `npm run test:ts-standards` scans `src/` and `convex/` through `scanTypeScriptStandards` in `src/lib/ui/contract-scans.ts`. Reject `explicit-any`, `unknown-double-cast` (`as unknown as`), `non-null-assertion`, `convex-any-validator` (`v.any()` except documented JSON boundaries), `broad-status-string`, `inexact-convex-return`, `hard-coded-source-csrf`, `client-exposed-source-write-secret`.
- UI product surfaces must pass `npm run test:ui-contract` (`scanUiContract`): semantic tokens only in `src/components/ae` and `src/routes`.

**Exhaustive switch (required):**
- Every `switch` over a discriminated union or enum must have a `default` that assigns `const _exhaustive: never = …` and returns or throws that value. New variants must fail typecheck until handled.
- Canonical example in `src/modules/capability-supply/internal/x402-invocation-policy.ts`:

```typescript
switch (input.rail) {
  case 'ae_internal':
    return { kind: 'admitted', lane: 'brokered' }
  case 'provider_direct_x402':
    return input.environment === 'production'
      ? { kind: 'refused', lane: 'provider_direct_x402', code: 'payment_lane_not_brokered' }
      : { kind: 'admitted', lane: 'provider_direct_x402' }
  default: {
    const _exhaustive: never = input.rail
    return _exhaustive
  }
}
```

- Repeat this in UI reducers (`src/components/ae/chat/answer-turn-state.ts`) and transport reason handling (`src/modules/capability-supply/route-transport-runtime.ts`). Do not use a silent `default` or a string fallback.

**No inline imports (required):**
- Place every `import` at the top of the module. Do not `await import()` or `import()` inside functions, type annotations, or interface fields unless a documented circular-dependency exception exists.
- `vi.mock` factories may call `importOriginal` (Vitest module graph). That is a test-harness exception, not a product-code exception. See `tests/integration/capability-operation-workpool.test.ts`.

## Import Organization

**Order:**
1. External packages (`convex/server`, `vitest`, `zod`, `@modelcontextprotocol/sdk/...`).
2. `@/` path aliases into `src/` (`@/lib/errors`, `@/modules/money/public`).
3. Relative in-module imports (`./internal/...`, `../route-transport-runtime`).
4. Type-only imports use `import type` and may sit with their group.

**Path Aliases:**
- `@/*` and `~/*` both map to `src/*` in `tsconfig.json`. Prefer `@/`.
- Owner/admin route aliases exist: `@/routes/owner.*` → `src/routes/_operator/owner.*`, `@/routes/admin.*` → `src/routes/_operator/admin.*`.
- Vitest repeats the `@` alias in `vitest.config.ts`. Keep it when a test imports `tools/ae/lib/*`.
- Convex files import domain code with relative paths into `src/` (`../src/modules/security/public` from `convex/authz.ts`). Do not introduce a second Convex alias.

**Public seams:**
- Sibling modules and routes import `src/modules/<name>/public.ts` (or the narrow `convex.ts` host seam). Do not import `src/modules/<name>/internal/...` across a module or route boundary.
- Enforced by `scanPrivateImports` / `scanRouteBoundaries` in `src/lib/ui/contract-scans.ts` and `npm run test:imports`.
- Allowed exceptions: `convex/schema.ts` may compose `src/modules/*/internal/schema` or `internal/convex-schema`; a module's own `public.ts` / `convex.ts` may re-export from `./internal/`.
- Money and protocol SDKs (`@x402/*`, `viem`, `@modelcontextprotocol/sdk`) stay in reviewed transport files listed in `isReviewedTransportSdkImport` in `src/lib/ui/contract-scans.ts`. Do not import them from routes or new modules.
- Runtime source cannot import `.planning/` or the backup repo (`scanBackupImports`).

## Error Handling

**Patterns:**
- Domain and Convex commands return a discriminated result. Refuse with `{ kind: 'refused', code: 'snake_case_token' }` rather than throwing for expected policy failures (`src/modules/action-invocation/resolution-control.ts`, `convex/workTrees.ts`).
- HTTP and CLI project that result through the single RFC 9457 model in `src/lib/errors.ts`. Build the wire object with `buildProblem` and the Response with `problem()` in `src/lib/server/problem.ts` (`Content-Type: application/problem+json`, `Cache-Control: no-store`).
- Use `PROBLEM_KINDS` / `GATEWAY_PROBLEM_CODES` from `src/lib/errors.ts`. Do not invent a second envelope.
- Quarantined family HTTP/MCP doors (except `inquiry.readCustomerRecord`) return 410 `quarantine_surface_retired` via `src/modules/product-frontier/quarantine-write-admission.ts`. Server-fn writes freeze as 403 `quarantine_writes_frozen`. Never 410 `/api/v1/operations/call`.
- Customer Request TypeScript module is deleted. Tombstone adapters use `retiredCustomerRequestResponse` in `src/lib/server/customer-request-gone.ts`. Do not add new CR application code.
- Throw `Error` only for programmer-invariant violations (empty branded id in `src/modules/common/ids.ts`, missing generated API in a test). Treat `await req.json()` as `unknown` and return 400 on failed validation (`convex/_generated/ai/guidelines.md`).
- Authorization: derive identity from `ctx.auth.getUserIdentity()` / `identity.tokenIdentifier`. Never accept a caller `userId` for auth (`convex/authz.ts`).

## Logging

**Framework:** Sentry (`src/lib/observability/sentry.client.ts`) and PostHog (`src/lib/observability/posthog.server.ts`). Product `console.*` is rare and operator-facing.

**Patterns:**
- Capture exceptions through Sentry after sanitization (`Sentry.captureException(sanitizeTelemetryError(error))` in `src/lib/observability/sentry.client.ts`).
- Record funnel/audit events through `src/modules/observability/public.ts` (`applyFunnelEvent`, `validateAuditEvent`). Do not write search-gap rows from tests; `tests/setup/no-search-gap-writes.ts` installs a no-op recorder.
- Disable telemetry with `VITE_AE_DISABLE_OBSERVABILITY` / `AE_DISABLE_OBSERVABILITY` (`src/lib/observability/config.ts`). Do not log secrets, raw provider payloads, or source-write keys.
- `console.error` / `console.warn` appear only at operator seams such as `src/lib/server/notification-provider.ts` and `src/routes/api.notification.novu-dispatch.ts`.
- Log papercuts to `PAPERCUTS.md` via `npm run papercut -- -m <model> "message"` (`AGENTS.md`). That is process telemetry, not product logging.

## Comments

**When to Comment:**
- Explain a non-obvious invariant or evidence class (brokered vs provider-direct x402 in `src/modules/capability-supply/internal/x402-invocation-policy.ts`; why search-gap writes are stubbed in `tests/setup/no-search-gap-writes.ts`).
- Do not narrate what the next line does. Do not write temporal "formerly / we used to" comments.

**JSDoc/TSDoc:**
- Public error and HTTP helpers carry TSDoc (`src/lib/errors.ts`, `src/lib/server/problem.ts`).
- Action descriptors and MCP tool copy live as `description` strings on the action (`src/modules/work-tree/work-tree.actions.ts`), not as duplicate comments.
- Use `{@link Name}` when pointing at a sibling export.

## Function Design

**Size:**
- Keep a function on one decision: admit, project, persist, or adapt. Split Convex Node actions into their own `"use node";` file; never export queries/mutations from that file (`convex/_generated/ai/guidelines.md`).
- HTTP adapters stay thin over an application service (`handleOperationInvokePost` in `src/lib/server/operation-invoke-api.ts`).

**Parameters:**
- Prefer one `Readonly<{ ... }>` input object over a long positional list (`createPublicOperationRef`, `paymentLaneAdmission`).
- Convex functions always declare `args` validators (`v.object`, `v.id`, composed `.pick` / `.omit` / `.extend`). Use `paginationOptsValidator` unchanged for paginated queries.
- Do not pass `userId` in. Read identity from `ctx.auth`.

**Return Values:**
- Return a discriminated union (`kind: 'admitted' | 'refused' | 'completed' | 'seeded' | 'observed'`). Include a stable `code` on refuse paths.
- Convex paginated queries return `paginationResultValidator(itemValidator)`. Do not hand-roll `{ page, isDone, continueCursor }`.
- Use `null` in Convex values, not `undefined`. Brand minted identifiers with `brandNonEmpty` in `src/modules/common/ids.ts`.

## Module Design

**Exports:**
- Each domain module exposes `src/modules/<name>/public.ts`. Re-export types and functions from there. Convex hosts that must stay Node-free use `src/modules/<name>/convex.ts`.
- Keep internals under `src/modules/<name>/internal/`. Cross-module callers go through the public seam.
- Action inventories live in `src/modules/actions` and per-module `*.actions.ts` (`src/modules/registry/registry.actions.ts`). MCP, CLI, and HTTP are adapters over those actions.

**Barrel Files:**
- `public.ts` is the barrel. `src/modules/capability-execution/index.ts` is an extra compatibility barrel for that module only. Do not add new catch-all `index.ts` barrels that re-export internals.
- `src/components/ae/*.exports.ts` exist for UI public surfaces (`AeOwnerOfferings.exports.ts`). Prefer those over reaching into implementation files from routes.

**Convex:**
- Schema lives in `convex/schema.ts`. Index names include every field: `by_field1_and_field2`.
- Public functions: `query` / `mutation` / `action`. Anything only the app calls: `internalQuery` / `internalMutation` / `internalAction`.
- Always include argument validators. Use `ctx.runQuery` / `ctx.runMutation` / `ctx.runAction` with `FunctionReference`s from `api` / `internal`.
- Prefer `.withIndex()` and `.take()` / pagination over `.collect()`. Do not read `Date.now()` inside queries.
- Workpool for durable invocation: `convex/marketDispatchWorkpool.ts` and `@convex-dev/workpool`. Rate limits: `@convex-dev/rate-limiter` via `convex/rateLimit.ts`. Do not hand-roll counters.
- Read `convex/_generated/ai/guidelines.md` before editing Convex code.

---

*Convention analysis: 2026-08-19*
