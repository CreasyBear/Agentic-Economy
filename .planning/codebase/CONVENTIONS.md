# CONVENTIONS.md

**Analysis Date:** 2026-09-01

## Language & Compiler Strictness (tsconfig.json)

`tsconfig.json` is aggressively strict — these flags are load-bearing contract, not decoration:

|Flag|Value|Consequence|
|---|---|---|
|`strict`|`true`|Base strictness|
|`exactOptionalPropertyTypes`|`true`|Optional props cannot receive explicit `undefined` — see handling pattern below|
|`noUncheckedIndexedAccess`|`true`|Every index access is `T \| undefined`|
|`useUnknownInCatchVariables`|`true`|`catch (e)` gives `unknown`, never `any`|
|`noImplicitOverride`|`true`|Class overrides must say `override`|
|`forceConsistentCasingInFileNames`|`true`||
|`isolatedModules` / `noEmit`|`true`|Type-check only; Vite/esbuild builds|
|`allowJs`|`false`|TS only|
|`moduleResolution`|`"Bundler"`||
|`jsx`|`"react-jsx"`||
|`target`/`lib`|`ES2022` / DOM + `ES2024`||
|`types`|`["vite/client", "node"]`||

Path aliases (tsconfig.json `paths`): `@/*` and `~/*` → `./src/*`, plus route-specific aliases (`@/routes/owner.*` → `./src/routes/_operator/owner.*`, `@/routes/admin.*`, `@/routes/developers.discovery`). `vitest.config.ts` re-maps `@` → `./src` for the same reason. `convex/_generated` is excluded; `src/routeTree.gen.ts` is generated (oxlint-ignored).

## Linting (oxlint.config.ts)

`npm run lint` = `oxlint src convex tests tools --deny-warnings`. Config extends `@nkzw/oxlint-config` with:
- `categories: { correctness: 'error', suspicious: 'off' }` — correctness is the gate; style migrations are isolated, not "permanent release-gate noise" (comment in oxlint.config.ts).
- `no-console: ['error', { allow: ['error', 'info', 'warn'] }]`; `no-debugger`, `no-unused-vars` errors.
- Deliberately off: `perfectionist/sort-*` family, `prefer-const`, `curly`, many `unicorn/prefer-*`, `react/set-state-in-effect`, `react/incompatible-library`.
- Overrides: `tests/**` and `tools/**` allow `any` and `console`. Per-file `complexity` caps of 10/20/30 (variant classic) on hot files — e.g. max 10 on `convex/lib/operationInvocations/**`, `src/modules/money/internal/ledger.ts`, max 20 on `src/modules/money/internal/payout-policy.ts`, max 30 on `convex/moneyChargeBrokered.ts`.
- Ignores: `convex/_generated/**`, `src/routeTree.gen.ts`, `tests/fixtures/**`, `vendor/**`.

`.aislop/config.yml` only sets `telemetry.enabled: false` (aislop is a devDependency used elsewhere for AI-slop scanning).

## RULES.MD (binding)

Key prohibitions that shape code review: no **gate self-weakening**, no **proof-class inflation** (fixtures/mocks are never live proof), no **golden regeneration reflex** (golden changes need a `GOLDEN-CHANGE` commit note), no `todo!()`/`unimplemented!()` scaffolds in committed code, no **tautological tests** (every feature must pre-specify ≥1 negative case a naive implementation would fail), no **demo-path hardcoding**. "Refusal is not delivery" — a correctly typed refusal earns at most partial credit; the positive capability must be implemented, tested, verified. Process artifacts only exist as hard gates for named features.

## Module System (`src/modules/module-boundaries.ts`)

27 declared modules, each a `ModuleDeclaration { name, entrySurfaces, allowedDependencies }` in `MODULE_BOUNDARY_MANIFEST`. Target DAG (comment at top of file):

```
adapters/actions -> registry | capability-execution | capability-supply
registry -> catalog | capability-supply
capability-execution -> capability-supply | action-invocation | money | agent-access
capability-supply -> capability-contract | business | security
action-invocation -> money | capability-contract
all lower layers -> dependency-free common (and guarded I/O -> network-guard)
```

- `common` is dependency-free (27 entry surfaces incl. `ids.ts`, `canonical-digest.ts`, `bounded-json.ts`).
- Every cross-module import must go through a **declared entry surface** (e.g. `money` exposes `public.ts`, `schema.ts`, `server.ts`, `money.functions.ts`). Deep `internal/**` imports are forbidden at runtime.
- Deviations are explicit objects: `RuntimeBoundaryException` (with owner + removalTask T3–T7) and `TestBoundaryException` (currently ~60 entries, owner `source-tests`) — every exception must be *used* or the boundary scan fails.
- Enforced by `tests/imports/module-boundaries.test.ts` (asserts `moduleCount === 27`, no cycles, no violations) via scanners in `src/lib/ui/contract-scans.ts`.

## Module File-Role Conventions

Real examples from `src/modules/money/` and `src/modules/capability-supply/`:

|File|Role|Example|
|---|---|---|
|`public.ts`|The module's typed public seam: schemas, types, pure logic, re-exports from `internal/`|`src/modules/money/public.ts` re-exports `exactAmountSchema`, `pricingConfigSchema` etc. from `./internal/exact-amount` and `./internal/pricing-contract`; defines `MoneyRefusal`, `ChargeAuthorizationResult`|
|`server.ts`|Server-side surface: Convex source actions, Stripe webhook handling, HTTP adapters|`src/modules/money/server.ts` imports `@/lib/server/convex-source`, `@/lib/server/stripe-money-provider`, `./internal/stripe-webhook`|
|`schema.ts`|Convex table definitions consumed by `convex/schema.ts`|`business`, `security`, `capability-supply` each declare `schema.ts` in entrySurfaces|
|`convex.ts`|Convex function registration surface|`capability-supply` declares `convex.ts`; `discovery` declares `convex.ts` + `discovery.functions.ts`|
|`*.functions.ts` / `*.actions.ts`|Convex function / action definitions (registered via httpActions/actions)|`money/money.functions.ts`, `registry/registry.actions.ts`|
|`internal/**`|Private implementation; importable only via the manifest's declared entries|`src/modules/capability-supply/internal/graph/qualify-candidate.ts` is only reachable via a test exception|

## Error Handling Convention

**Single canonical model** in `src/lib/errors.ts`, anchored to RFC 9457 + `google.rpc.Code`:

- `PROBLEM_KINDS` = `INVALID_ARGUMENT | FAILED_PRECONDITION | UNAUTHENTICATED | PERMISSION_DENIED | NOT_FOUND | ALREADY_EXISTS | METHOD_NOT_ALLOWED | PAYLOAD_TOO_LARGE | UNSUPPORTED_MEDIA_TYPE | RESOURCE_EXHAUSTED | UNAVAILABLE | INTERNAL | UNKNOWN | no_data` (`no_data` maps to HTTP 200 by design — it's an ok-outcome, not an error).
- `buildProblem(input: ProblemInput): ProblemDetails` — pure projection; spreads `extras` FIRST so reserved keys (`type/title/status/kind/code`) always win; emits optional fields only when defined (see exactOptionalPropertyTypes pattern below).
- `GATEWAY_PROBLEM_CODES` (~40 stable machine tokens like `operation_not_found`, `budget_exceeded`, `outcome_unknown`) mapped to kinds via `GATEWAY_CODE_KIND`; `gatewayFailureToProblem` projects untrusted runtime failures onto stable taxonomy.
- `remoteProblemToProblem` deliberately never copies remote `title`/`detail` — "arbitrary backend prose… never copied" (src/lib/errors.ts:226-234). Only stable `code` (validated by `isStableProblemCode` regex `^[a-z][a-z0-9_:-]{0,95}$`), canonical `kind`, and `retryable` cross boundaries.

**HTTP surface**: `src/lib/server/problem.ts` — `problem(input, headers?): Response` builds `application/problem+json` with `Cache-Control: no-store` (both reserved, non-overridable) and injects the correlation ID header from `currentRequestCorrelationId()`.

**Typed result unions vs throwing (verified real example)**: domain seams return discriminated unions, not exceptions. `src/modules/money/public.ts:276-311`:

```ts
export type MoneyRefusal = Readonly<{
  kind: "refused";
  code: MoneyRefusalCode;        // 'billing_identity_missing' | 'price_unavailable' | ...
  retryable: boolean;
  correlationRef?: string;
  nextAction?: "credit_topup_required";
}>;
export type ChargeAuthorizationResult = MoneyAcceptedInvocationCharge | MoneyRefusal;
```

`isMoneyRefusal(value: unknown): value is MoneyRefusal` is the guard. Zod action outputs follow the same shape — `supplyStatusResultSchema` is `z.union([strictObject({kind:'available',...}), strictObject({kind:'not_found'}), strictObject({kind:'error', code: z.enum([...])})])` (src/modules/capability-supply/supply-actions.ts:115-126). Throwing is reserved for genuinely exceptional transport failures (e.g. `throw new Error('catalog_search_unavailable')` in src/components/ae/command-panel/market-operations-client.ts:36).

## Naming Conventions

- **Directories & files**: kebab-case — `src/modules/capability-execution/invocation-worker/`, `src/lib/server/source-write-admission.ts`. Components: PascalCase — `src/components/ae/AeOwnerOfferings.tsx`, `AeOperatorShell.tsx` (prefix `Ae` for product components).
- **Action IDs**: dot-delimited lowercase, `<module>.<noun>[.<verb>]` — real values from `src/modules/registry/registry.actions.ts` / `operation-action-contracts.ts`: `'registry.list'`, `'registry.search'`, `'registry.services_detail'`, `'registry.operations.search'`, `'registry.operations.inspectPlan'` (camelCase in the final segment is accepted: `inspectPlan`).
- **Module name**: matches directory exactly (ModuleName union in module-boundaries.ts).
- **Contract objects**: `defineAction({ id, name, summary, schema, surfaces })` (registry.actions.ts:55-58).

## Import Style

- `@/` alias everywhere (source, convex modules, tests, tools). `~/*` exists as a second alias to the same root but `@/` is what the codebase actually uses (see imports in money/public.ts, server.ts, tests).
- Routes import only module public seams (enforced by `scanRouteBoundaries` — routes must not import `convex/schema` or own convex transport: `route-convex-schema-import`, `route-owned-convex-transport` rules in tests/imports/route-boundary.test.ts).
- Cross-module: only declared entry surfaces (enforced by `scanPrivateImports` → `module-private-import` rule).

## Zod Convention: `strictObject` by Default

Zod 4 (`zod: 4.4.3` in package.json). Schemas use `z.strictObject` pervasively, composed with `z.discriminatedUnion('kind', [...])` for result unions. Real examples from `src/modules/capability-supply/operation-schemas.ts`:

```ts
export const publicOperationPriceSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('fixed'), amount: exactAmountSchema.describe('...') }),
  z.strictObject({ kind: z.literal('range'), minimum: exactAmountSchema, maximum: exactAmountSchema }),
  z.strictObject({ kind: z.literal('on_request') }),
])
export const supplyStatusInputSchema = z.strictObject({
  businessId: z.string().trim().min(1),
  offeringRef: z.string().trim().min(1).optional(),
})
```

Also `operation-schemas.ts:83` provenance, `public.ts:529` `contractRefSchema` (`contractDigest: z.string().regex(/^sha256:[0-9a-f]{64}$/)`), `internal/route-transport-observation.ts:82-110` (settlement evidence union with `.exactOptional()`). `z.infer<typeof schema>` for the TS side (`export type SupplyStatusResult = z.infer<typeof supplyStatusResultSchema>`).

## exactOptionalPropertyTypes Handling Pattern

Because `exactOptionalPropertyTypes: true`, spreading an optional value directly would put `undefined` into the type. The pervasive idiom is conditional spread: `...(x === undefined ? {} : { x })`. Verified in 207+ files, e.g.:

- src/modules/capability-supply/supply-actions.ts:87-88 — `observedAt: z.number().optional()` fields built as `{ outcome, ...(observedAt === undefined ? {} : { observedAt, validUntil }) }`
- src/components/ae/console/AeAgentOperatorConsole.tsx:158-159 — props: `{...(approvalsError === undefined ? {} : { error: approvalsError })}`
- src/lib/errors.ts:204-206 — buildProblem itself: `...(detail === undefined ? {} : { detail })`
- Read-only data types use `Readonly<{...}>` with `?:` fields; mutation of state objects uses spread-and-override, never direct property assignment of possibly-undefined values.
