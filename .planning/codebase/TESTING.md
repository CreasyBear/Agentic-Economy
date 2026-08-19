# Testing Patterns

**Analysis Date:** 2026-08-19

## Test Framework

**Runner:**
- Vitest 4.1.9 for unit, integration, import, type, SEO, UI-contract, and Convex tests.
- Config: `vitest.config.ts` (`environment: 'node'`, `globals: false`, `watch: false`, `tsconfigPaths: true`, `@` → `src`).
- Include: `tests/**/*.test.ts`, `tests/**/*.test.tsx`, `convex/**/*.test.ts`.
- Setup files: `tests/setup/web-storage.ts`, `tests/setup/no-search-gap-writes.ts`, `tests/setup/jsdom-platform.ts`, `tests/setup/http-rate-limit.ts`.
- Playwright 1.61.1 for browser E2E and deploy-smoke. Configs: `playwright.config.ts`, `playwright.paid-operation.config.ts`, `playwright.deploy-smoke.config.ts`.
- convex-test `^0.0.54` for in-memory Convex backends.

**Assertion Library:**
- Vitest `expect` / `expectTypeOf` (`vitest`). Playwright `expect` (`@playwright/test`).

**Run Commands:**
```bash
npm run typecheck                 # tsc --noEmit
npm run lint                      # oxlint src convex tests tools --deny-warnings
npm run test:conformance          # kernel/paid-operation/readiness/observability floor
npm run check:product-frontier    # structural positive frontier floor
npm run test:imports              # public-seam and retirement import scans
npm run test:release:source       # full source release gate (includes the above)
npm run test:unit                 # vitest tests/unit
npm run test:integration          # vitest tests/integration + convex (no file parallelism)
npm run test                     # vitest run (all included files)
npm run test:e2e                  # playwright tests/e2e
npm run test:all                  # typecheck + codegen + unit + integration + types + imports + ts-standards + seo + ui-contract + build
```

There is no Vitest `--watch` script. `vitest.config.ts` sets `watch: false`.

## Test File Organization

**Location:**
- Separate `tests/` tree by concern, plus colocated `convex/*.test.ts` for Convex-module seams.
- Do not add Customer Request application tests. The CR TypeScript module is deleted. Tombstone behavior is product-frontier / HTTP 410, not a CR domain suite.

**Naming:**
- `*.test.ts` / `*.test.tsx` for Vitest. `*.spec.ts` for Playwright.
- Directory name matches the domain: `tests/unit/capability-execution/`, `tests/unit/action-invocation/`, `tests/integration/`.
- jsdom UI tests start with `/** @vitest-environment jsdom */` (`tests/unit/chat/ae-query-panel.test.tsx`).

**Structure:**
```
tests/
├── unit/                  # pure + injected-port application tests
├── integration/           # convex-test / route / workpool
├── imports/               # public-seam and retirement scanners
├── types/                 # expectTypeOf domain-contract lock
├── seo/                   # public discovery / canonical URL
├── ui-contract/           # semantic token scan
├── e2e/                   # Playwright product surfaces
├── e2e/a11y/              # Playwright a11y
├── deploy-smoke/          # hosted/provider smokes (consent + env)
├── eval/                  # answer / foundry eval assertions
├── helpers/               # shared fixtures and adapters
├── setup/                 # vitest setup files
└── fixtures/              # negative scanner fixtures (*.fixture)
convex/*.test.ts           # colocated Convex seam tests
tools/dev/fixtures/        # labelled development evidence builders
```

## Test Structure

**Suite Organization:**
```typescript
import { describe, expect, it, vi } from 'vitest'

import { handleOperationInvokePost } from '@/lib/server/operation-invoke-api'

const operationRef = `operation:v1:${'a'.repeat(64)}`
const authenticate = async (scopes: readonly string[] = ['market_operations:invoke']) => ({
  isAuthenticated: true as const,
  tokenType: 'api_key' as const,
  id: 'key:test',
  subject: 'user_test',
  scopes,
})

function service(result: Record<string, unknown>) {
  return {
    invokeOperation: vi.fn().mockResolvedValue(result),
    readInvocationStatus: vi.fn(),
    cancelInvocation: vi.fn(),
    reconcileInvocation: vi.fn(),
  }
}

function post(body: unknown, path = '/api/v1/operations/call'): Request {
  return new Request(`https://ae.example${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('operation.invoke HTTP adapter', () => {
  it('returns a canonical bearer challenge for missing authentication', async () => {
    const executor = service({ kind: 'completed' })
    const response = await handleOperationInvokePost(
      post({ operationRef, input: {}, idempotencyKey: 'key-1' }),
      {
        authenticate: async () => ({
          isAuthenticated: false,
          tokenType: null,
          id: null,
          subject: null,
          scopes: null,
        }),
        operationInvokeService: executor,
      },
    )
    expect(response.status).toBe(401)
    expect(response.headers.get('www-authenticate')).toContain('market_operations:invoke')
    expect(executor.invokeOperation).not.toHaveBeenCalled()
  })
})
```

Pattern source: `tests/unit/server/operation-invoke-api.test.ts`.

**Patterns:**
- Setup: file-level fixtures and small factory helpers (`fixture`, `runtime`, `service`, `post`). Prefer explicit objects over shared mutable state.
- Teardown: `afterEach(cleanup)` for Testing Library (`tests/unit/chat/ae-query-panel.test.tsx`). Integration workpool tests use `afterEach` with `vi`.
- Assertion: `toMatchObject` / `toEqual` on `kind` + `code`. HTTP asserts status, `application/problem+json`, and that the executor was not called on refuse paths.
- Import named Vitest functions. Do not rely on globals (`globals: false` in `vitest.config.ts`).

## Mocking

**Framework:** Vitest `vi` (`vi.fn`, `vi.mock`, `vi.hoisted`, `vi.stubGlobal`, `vi.advanceTimersByTime`). convex-test in-memory backend. Testing Library for React. Playwright for the browser.

**Patterns:**
```typescript
import type { fetch as UndiciFetch } from 'undici'
import { Response as UndiciResponse } from 'undici'
import { afterEach, describe, expect, it, vi } from 'vitest'

const providerFetch = vi.hoisted(() => vi.fn<typeof UndiciFetch>())
vi.mock('undici', async (importOriginal) => ({
  ...await importOriginal<Record<string, unknown>>(),
  fetch: providerFetch,
}))

import {
  convexTestWithWorkers,
  type ConvexFixtureBackend,
} from '../helpers/convex-fixtures'
```

Pattern source: `tests/integration/capability-operation-workpool.test.ts`.

Module-graph mock for a public seam:

```typescript
vi.mock('@/modules/registry/registry.functions', () => ({
  readPublicOfferingRegistryBusinessDetail: vi.fn(),
  readPublicOfferingRegistryPage: vi.fn(),
  readPublicOfferingRegistrySearchPage: vi.fn(),
}))
```

Pattern source: `tests/unit/action-invocation/durable-action-invocation.test.ts`.

Inject ports instead of mocking internals when the application service accepts them (`createOperationInvokeApplication` + `OperationInvokeRuntime` in `tests/unit/capability-execution/operation-invoke.test.ts`).

**What to Mock:**
- Outbound `fetch` / Undici at the workpool boundary.
- Auth and source-write admission (`tests/helpers/source-write-admission.ts`, `withSourceWrite`).
- HTTP rate-limit admission (global no-op in `tests/setup/http-rate-limit.ts`).
- Search-gap recorder (global no-op in `tests/setup/no-search-gap-writes.ts`).
- jsdom platform gaps (`ResizeObserver`, `matchMedia`, `scrollIntoView` in `tests/setup/jsdom-platform.ts`; Web Storage in `tests/setup/web-storage.ts`).
- Development durable ports and labelled evidence builders under `tools/dev/fixtures/`.

**What NOT to Mock:**
- RFC 9457 problem projection, action inventory, or product-frontier membership. Assert the real `code`.
- Hosted proof. Fixtures and synthetic identities are not production evidence (`STATE.md`).
- A live Convex deployment from unit/integration tests. Use `convexTest(schema, modules)`.
- Customer Request application flows. The module is deleted; do not revive CR harnesses as current tests.

## Fixtures and Factories

**Test Data:**
```typescript
import { buildDevelopmentPublishedOperationEvidence } from '../../../tools/dev/fixtures/capability-supply/development-published-operation-evidence'
import { createPublicOperationRef, materializePublishedOperation } from '@/modules/capability-supply/public'

function fixture(runtimeEnvironment: AgentAccessPrincipal['environment'] = 'sandbox') {
  const evidence = buildDevelopmentPublishedOperationEvidence()
  const operation = runtimeEnvironment === 'sandbox'
    ? evidence.operation
    : materializePublishedOperation({
        ...evidence.sourceMaterial,
        publication: {
          ...evidence.sourceMaterial.publication,
          runtimeEnvironment,
        },
      })
  const operationRef = createPublicOperationRef({
    operationId: operation.operationId,
    publicationRef: operation.identity.publicationRef,
    publicationRevision: operation.identity.publicationRevision,
    contractRef: operation.contract.ref,
  })
  return { operation, operationRef, descriptor: materializeRuntimePublishedOperation(operation) }
}
```

Pattern source: `tests/unit/capability-execution/operation-invoke.test.ts`.

Provider-conformance tests reuse labelled BTC/USD quote fixtures from `tools/dev/fixtures/capability-supply/` (`tests/unit/capability-supply/published-operation-provider-conformance.test.ts`).

convex-test factory:

```typescript
import { convexTest } from 'convex-test'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')

const backend = convexTest(schema, modules)
await expect(backend.mutation(createWorkTree, {
  idempotencyKey: 'work-tree:unlisted',
  charterText: 'Unlisted',
  lineage: { kind: 'standalone' },
})).resolves.toMatchObject({ kind: 'refused', code: 'work_tree_tables_unlisted' })
```

Pattern source: `convex/workTrees.test.ts`. Tests that need Workpool/rate-limiter use `convexTestWithWorkers()` from `tests/helpers/convex-fixtures.ts` (`registerWorkpool`, `registerRateLimiter`, optional `pauseWorkpool`).

**Location:**
- Shared helpers: `tests/helpers/` (`convex-fixtures.ts`, `http.ts`, `source-write-admission.ts`, `x402-payment-attempt.ts`).
- Labelled development evidence: `tools/dev/fixtures/capability-supply/` and `tools/dev/fixtures/provider-operation/`.
- Negative scanner fixtures: `tests/fixtures/` (`tests/fixtures/bad-ts-standards/unsafe.fixture`). Select with `AE_SCAN_MODE=fixtures`.
- Schema inventory expectations: `tests/unit/schema/convex-schema.test.ts`.

`tests/helpers/customer-request-lineage.ts` is leftover helper surface. Do not extend it as a current CR application fixture.

## Coverage

**Requirements:** None enforced as a Vitest coverage percent. The enforced floor is the named gates, not Istanbul/c8.

**View Coverage:**
```bash
# Not applicable as a coverage reporter. Use the release/conformance gates.
npm run test:conformance
npm run check:product-frontier
npm run test:imports
npm run test:eval:coverage   # answer-eval corpus coverage, not line coverage
```

Answer eval coverage is `eval/answer/scripts/audit-coverage.ts` via `npm run test:eval:coverage`. Quality corpus structure is `npm run test:quality:gate` (`eval/quality/gate.ts`).

## Test Types

**Unit Tests:**
- Scope: one application function or adapter with injected ports. Live in `tests/unit/<domain>/`.
- HTTP adapters: build a `Request`, inject `authenticate` + service, assert status/`kind`/`code` (`tests/unit/server/operation-invoke-api.test.ts`).
- Domain policy: call the function, assert the discriminated result (`tests/unit/capability-execution/operation-invoke.test.ts`).
- UI: jsdom + Testing Library (`render`, `screen.getByRole`, `fireEvent`) in `tests/unit/chat/ae-query-panel.test.tsx`.
- Schema: `tests/unit/schema/convex-schema.test.ts` locks listed tables and indexes.
- Do not add new Customer Request application unit tests.

**Integration Tests:**
- Scope: in-memory Convex + scheduled functions + workpool. Live in `tests/integration/` and `tests/unit/convex/`.
- Seed with `internal.devSeed.seedDevCatalog`, finish scheduled work with `backend.finishAllScheduledFunctions(() => vi.advanceTimersByTime(1))`, then query (`tests/integration/capability-operation-workpool.test.ts`, `tests/integration/capability-supply-owner-funnel.test.ts`).
- Identity: `backend.withIdentity({ subject, issuer, tokenIdentifier })` via `ownerAdmin` / `publishedBusinessOwner` in `tests/helpers/convex-fixtures.ts`.
- Colocated Convex tests use `/// <reference types="vite/client" />` and `import.meta.glob` (`convex/workTrees.test.ts`).
- Run with `npm run test:integration` (`--no-file-parallelism`, 15s timeout on the release variant).

**E2E Tests:**
- Playwright in `tests/e2e/`. Default config `playwright.config.ts` boots `npm run dev` on `127.0.0.1:3020` with `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E=true` unless `PLAYWRIGHT_BASE_URL` is set.
- Projects: `compact-chromium` (375×812) and `wide-chromium` (1440×1100).
- Assert roles and forbidden copy (`tests/e2e/protected-action-owner-flow.spec.ts`). Paid-operation browser surface uses `playwright.paid-operation.config.ts` / `npm run test:e2e:paid-operation`.
- A11y: `npm run test:e2e:a11y` → `tests/e2e/a11y/`.
- Local E2E and hosted smokes are env-blocked without Convex/signing keys. They are not a substitute for `test:conformance`.

**Conformance floor (`npm run test:conformance`):**
- Fixed Vitest file list in `package.json`. This is the kernel floor, not "run everything".
- Durable invocation: `tests/unit/action-invocation/durable-action-invocation.test.ts`, `dynamic-published-operation.test.ts`, `paid-operation-provider-selection.test.ts`, `x402-payment-reconciliation.test.ts`.
- Invoke / recover: `tests/unit/capability-execution/operation-invoke.test.ts`, `operation-recovery-actions.test.ts`, `tests/unit/convex/capability-operation-recovery.test.ts`, `capability-operation-worker.test.ts`, `tests/integration/capability-operation-workpool.test.ts`, `tests/unit/server/operation-invoke-api.test.ts`.
- Supply / transport: `tests/unit/capability-supply/provider-connection.test.ts`, `route-transport-runtime.test.ts`, `readiness-probe.test.ts`, `eligible-supply.test.ts`, `publication-importers.test.ts`, `provider-approval.test.ts`, `published-operation-provider-conformance.test.ts`, `provider-conformance-evidence.test.ts`, `tests/integration/capability-supply-owner-funnel.test.ts`.
- Answer / deploy / observability: `tests/unit/answer-thread/answer-harness-operation.test.ts`, `answer-turn-checkpoint.test.ts`, `answer-turn-finalization-convergence.test.ts`, `tests/integration/answer-thread-source-write.test.ts`, `tests/unit/deployment/deployment-manifest.test.ts`, `tests/unit/server/diagnostic-routes.test.ts`, `request-correlation.test.ts`, `start-observability.test.ts`.

**Product frontier (`npm run check:product-frontier`):**
- Structural verifier: `tools/release/verify-product-frontier.mjs` against `.planning/evidence/product-frontier-baseline/product-frontier-manifest.json`.
- Live identity lock: `tests/imports/product-frontier-manifest.test.ts` (required action ids, MCP tools, CLI commands, eval coverage tags, `businessServicesPolicy`).
- Customer Request is a tombstoned-unlisted family in that manifest, not an application test suite.

**Import / standards gates (`npm run test:imports`, `npm run test:ts-standards`):**
- Current import tests: `tests/imports/backup-imports.test.ts`, `private-imports.test.ts`, `route-boundary.test.ts`, `routing-authority-retirement.test.ts`, `capability-contract-boundaries.test.ts`, `capability-contract-registry-boundaries.test.ts`, `capability-supply-boundaries.test.ts`, `kernel-retirement-manifest.test.ts`, `legacy-engine-retirement.test.ts`, `action-invocation-host-boundaries.test.ts`, `paid-operation-development-surface-exclusion.test.ts`, `product-frontier-manifest.test.ts`, `development-evidence-boundary.test.ts`.
- Clean mode is `AE_SCAN_MODE=clean` (default for the gate). Fixture mode is `AE_SCAN_MODE=fixtures`.
- Targets: `src` + `convex` via `tests/imports/scan-targets.ts`.

**Type / SEO / UI:**
- `tests/types/domain-contracts.test.ts` locks Zod schemas to exported unions with `expectTypeOf`.
- `tests/seo/*.test.ts` for public discovery and canonical URLs.
- `tests/ui-contract/ui-contract.test.ts` scans `src/components/ae` and `src/routes`.

**Release source gate (`npm run test:release:source`):**
- Order: production deployment-manifest verify → `test:conformance` → Convex codegen dry-run → lint → typecheck → kernel-retirement → product-frontier → unit → integration → types → imports → ts-standards → seo → ui-contract → eval report → `vite build`.
- Hosted scripts under `test:release:hosted` / `smoke:customer-request:*` are not current CR application tests. Do not treat them as the pattern for new work.

## Common Patterns

**Async Testing:**
```typescript
const backend = convexTestWithWorkers()
const seeded = await backend.mutation(internal.devSeed.seedDevCatalog, {})
if (seeded.kind !== 'seeded') throw new Error(`curated seed unavailable: ${seeded.kind}`)
await backend.finishAllScheduledFunctions(() => vi.advanceTimersByTime(1))
const executable = await backend.query(api.capabilitySupplyOperations.listKeylessExecutable, {})
expect(qualification).toMatchObject({ status: 'eligible', reasons: [] })
```

Pattern source: `tests/integration/capability-operation-workpool.test.ts`.

Playwright retry wrapper for flaky owner UI:

```typescript
await expect(async () => {
  await page.getByRole('button', { name: /reject contact follow-up/i }).click()
  await expect(page.getByText(/reject reason is required/i)).toBeVisible({ timeout: 5_000 })
}).toPass({ timeout: 30_000 })
```

Pattern source: `tests/e2e/protected-action-owner-flow.spec.ts`.

**Error Testing:**
```typescript
await expect(backend.mutation(createWorkTree, {
  idempotencyKey: 'work-tree:unlisted',
  charterText: 'Unlisted',
  lineage: { kind: 'standalone' },
})).resolves.toMatchObject({ kind: 'refused', code: 'work_tree_tables_unlisted' })
```

HTTP 410 quarantine writes:

```typescript
export async function expectQuarantineWriteFrozen(response: Response, actionId?: string) {
  expect(response.status).toBe(410)
  expect(response.headers.get('content-type')).toBe('application/problem+json')
  const body = await response.json() as Record<string, unknown>
  expect(body).toMatchObject({
    type: 'about:blank',
    status: 410,
    kind: 'NOT_FOUND',
    code: 'quarantine_surface_retired',
    retryable: false,
    ...(actionId === undefined ? {} : { instance: actionId }),
  })
  return body
}
```

Pattern sources: `convex/workTrees.test.ts`, `tests/helpers/http.ts`. Assert `kind` + `code`. Do not `rejects.toThrow` for expected policy refusals.

**HTTP helper for JSON posts:**
```typescript
export function postJsonRequest(path: string, body: unknown): Request {
  return new Request(`https://ae.test${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}
```

Pattern source: `tests/helpers/http.ts`.

---

*Testing analysis: 2026-08-19*
