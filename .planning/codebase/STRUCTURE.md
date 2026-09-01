# STRUCTURE.md

**Analysis Date:** 2026-09-01

## Directory Layout (verified by glob)

```
src/
  modules/                  # domain modules — the unit of ownership
    module-boundaries.ts    # MODULE_BOUNDARY_MANIFEST (allowed deps + entry surfaces)
    common/                 # dependency-free kernel (is-record, canonical-digest, action, ids, …)
    principal-account/      # principals/accounts/ownership/memberships (public.ts only entry)
    authority/              # delegation, context, recovery (internal/convex-schema.ts)
    secrets/                # secret plane (convex.ts, runtime.ts, internal/convex-schema.ts)
    network-guard/          # SSRF guard (public.ts, server.ts)
    capability-contract/    # contract types (public.ts)
    business/  security/  capability-contract-registry/
    agent-access/           # OAuth, policy, grants (largest entry-surface list)
    money/                  # public.ts, server.ts, schema.ts, money.functions.ts, internal/
    observability/          # audit/funnel
    action-invocation/      # canonical claim/lease/release kernel (public.ts, runtime.ts, schema.ts, internal/)
    capability-supply/      # admission/publication/readiness/x402 (public.ts, server.ts, schema.ts, convex.ts, current-operation.ts, operation-schemas.ts, …, internal/)
    catalog/  registry/  market/  market-demand/
    capability-execution/   # invoke/recovery/history (index.ts, schema.ts, convex.ts, operation-invoke*.ts, invocation-worker/, internal/)
    actions/                # adapter over registry + execution (index.ts, contract.ts, strict-schema.ts, tool-contract.ts)
    discovery/  seo/  storefront/  chat/  chat-sharing/  model-gateway/  dev/
  lib/                      # cross-cutting app plumbing
    server/                 # HTTP gateway helpers (operation-invoke-api.ts, mcp-api.ts, problem.ts,
                            #   method-guard.ts, bounded-request-body.ts, agent-access-auth.ts,
                            #   convex-source.ts, rate-limit.ts, request-correlation.ts, canonical-url.ts, …)
    http/  observability/  errors.ts
  routes/                   # TanStack Start file routes (see naming below)
  components/ae/            # Ae* UI tree: supply/ console/ operator/ agent-access/ settings/
                            #   offerings/ command-panel/ market/ status/ layout/ home/ website/
                            #   operation-chat/ about/ feedback/
convex/                     # Convex functions (authoritative state)
  schema.ts  convex.config.ts  crons.ts  workloadCron.ts
  capabilityOperationInvocations.ts  capabilityOperationInvocationWorker.ts
  money*.ts  agentAccess*.ts  capabilitySupply*.ts  security*.ts  catalog*.ts  registry.ts  …
  lib/                      # Convex-side shared helpers (workloadCron/, operationInvocations/, delegationPersistence.ts, …)
  _generated/               # convex codegen output — DO NOT hand-edit
tests/
  unit/  integration/  e2e/  seo/  types/  imports/  helpers/  eval/
tools/
  ae/cli.ts  ae/commands/  ae/lib/   # `npm run ae` CLI
  dev/  release/                       # local-dev.mjs, release verification scripts
docs/adr/
```

## File-Role Conventions (verified by example)

Each module may expose only its `entrySurfaces` (from `MODULE_BOUNDARY_MANIFEST`, `src/modules/module-boundaries.ts`):

|Role|Example|Meaning|
|---|---|---|
|`public.ts`|`src/modules/money/public.ts`|The module's single import surface for other modules (types, zod schemas, pure projections)|
|`server.ts`|`src/modules/money/server.ts`, `capability-supply/server.ts`, `market/server.ts`|Server-side composition (route handlers/service factories)|
|`convex.ts`|`src/modules/capability-supply/convex.ts`, `catalog/convex.ts`, `chat-sharing/convex.ts`|Convex function definitions owned by the module|
|`schema.ts`|`src/modules/money/schema.ts`, `agent-access/schema.ts`|Module's Convex table definitions, spread into `convex/schema.ts`|
|`*.actions.ts`|`capability-execution/operation-invoke.actions.ts`, `registry/operations.actions.ts`, `registry/registry.actions.ts`|Public Convex actions (callable from HTTP gateway)|
|`*.functions.ts`|`money/money.functions.ts`, `observability/funnel.functions.ts`|Internal/query Convex functions|
|`internal/`|`money/internal/ledger.ts`, `action-invocation/internal/durable-contracts.ts`|Never imported cross-module (except enumerated test white-box exceptions)|
|`contracts.ts` / `*-contracts.ts`|`capability-execution/operation-invoke-contracts.ts`, `market/contracts.ts`|Zod schemas + typed result unions|
|Convex root files|`convex/capabilityOperationInvocations.ts`|Public/internal function roots that the gateway calls via `sourceAction('capabilityOperationInvocations:invoke')`|

## Naming Conventions (real examples)

- **Route files** (TanStack Start): `api.v1.market-operations.search.ts` → `/api/v1/market-operations/search`; `operations.$operationRef.tsx` → dynamic segment; `llms[.]txt.ts` (escaped dot); page routes lowercase (`market.tsx`, `status.tsx`, `about.tsx`); underscore-private `_operator.tsx` + `_operator/`.
- **Action IDs**: dot-namespaced camelCase — `'registry.operations.search'`, `'registry.operations.detail'`, `'registry.operations.compare'`, `'registry.operations.inspectPlan'` (`src/modules/registry/operation-action-contracts.ts:89-158`); `'operation.invoke'`, `'operation.list'`, `'operation.status'`, `'operation.cancel'`, `'operation.reconcile'` with `contractVersion` strings like `'operation.invoke:v1'` (`src/modules/capability-execution/operation-invoke-entry.ts:19-60`). MCP tool names derive via `mcpToolName(action)` → `ae_registry_operations_search` etc. (`mcp-api.ts`).
- **Convex function refs**: `<file>:<function>` strings, e.g. `'capabilityOperationInvocations:invoke'`, `'…:listInvocations'`, `'…:readInvocationStatus'`, `'…:cancelInvocation'`, `'…:reconcileInvocation'` (`src/lib/server/operation-invoke-api.ts:47-53`).
- **Durable refs**: `operation-invocation:v1:<digest>` (`canonicalOperationInvocationRef`), command ids `action-invocation-claim:v1:<invocationRef>:<attemptRef>`, `action-invocation-release-fence:v1:…`; attempt refs `operation-attempt:<invocationRef>:<n>`; correlation/idempotency `cron:<kebab-handler>:<ts>` (`convex/workloadCron.ts:39-42`).
- **Tests**: mirror source path under `tests/unit/<module>/<name>.test.ts` (e.g. `tests/unit/capability-execution/operation-invoke-admit.test.ts`, `tests/unit/convex/capability-operation-worker-recover.test.ts`); plus `tests/integration/`, `tests/e2e/` (Playwright), `tests/imports/*boundaries.test.ts` (architecture gates), `tests/types/`.
- **UI components**: `Ae` prefix by domain (`AeMarketPage.tsx`, `AeOperationTable.tsx`, `AeOperatorDataTable.tsx`), colocated model files (`operation-inspector-model.ts`, `presentation.ts`).
- **Refusal codes / problem codes**: lowercase snake tokens (`operation_not_current`, `payload_too_large`); problem kinds UPPER_SNAKE google.rpc subset + `no_data`.

## Where to Add New Code

Grounded in `module-boundaries.ts` rules + existing patterns:

1. **New domain concept** → new module directory `src/modules/<name>/` with `public.ts` (+ `schema.ts` if it owns tables), then register in `MODULE_BOUNDARY_MANIFEST.modules` with explicit `entrySurfaces`/`allowedDependencies`. There are NO runtime exceptions (`temporaryRuntimeExceptions: []`) — extend `allowedDependencies` instead.
2. **Convex tables** → module `schema.ts`, spread into `convex/schema.ts` (never define tables there directly).
3. **Callable operations** → public actions in module `*.actions.ts` (Convex root or module convex entry), invoked from HTTP via `src/lib/server/convex-source.ts` `sourceAction('<file>:<fn>')`; add a route under `src/routes/api.v1.…` with the standard guard set: `methodNotAllowed` for every unsupported method, `readBoundedRequestJson` cap, rate limit, correlation wrapper, `problem()` errors (copy `src/routes/api.v1.market-operations.search.ts`).
4. **Agent-facing action** → `defineAction` contract with `id`, `schema`, `surfaces` (`http|mcp|cli`), `outputSchema`; add contract to the owning module's `*-contracts.ts`; expose via `src/modules/actions` and it becomes MCP/CLI-visible automatically.
5. **Money-adjacent logic** → `src/modules/money/internal/` for journal/ledger internals; public API via `money/public.ts`; never let higher layers import internals.
6. **UI** → `src/components/ae/<domain>/Ae*.tsx`; pages in `src/routes/`; keep presentation models colocated (`*.model.ts`, `presentation.ts`).
7. **Scheduled work** → handler in `convex/lib/workloadCron/` context model + entry in `convex/crons.ts` (`internal.workloadCron.*`); every cron admits through `WorkloadContextAdmission` (`convex/workloadCron.ts:35-45`).
8. **Every change** must respect the import-boundary gates: `npm run test:imports` runs `tests/imports/module-boundaries.test.ts` and friends; new test white-box exceptions require a manifest row with owner (`owner: 'source-tests'`).

## Generated Artifacts (never hand-edit)

- `convex/_generated/` — Convex codegen (`internal`, `api`, `server`); regenerate with `npm run generate:convex` (requires Node 22; script `node tools/dev/require-supported-node.mjs -- convex codegen`), verify with `npm run check:convex-codegen` and `npm run verify:convex-generated:anonymous`.
- `src/routeTree.gen.ts` — TanStack Router route tree generated from `src/routes/` by Vite dev/build.

## Verification Commands (package.json, verified)

`npm run ae` (CLI) · `dev` / `dev:local` · `typecheck` (tsc --noEmit) · `lint` (oxlint src convex tests tools --deny-warnings) · `generate:convex` · `test:imports` (boundary gates) · `test:conformance` · `test:release` / `gate:release` · `seed:dev` (convex run devSeed:seedDevCatalog) · `smoke:gateway:production`.
