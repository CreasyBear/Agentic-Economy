# Testing Patterns

**Analysis Date:** 2026-08-08

## Test Framework

**Runner:**
- Vitest 4.1.9 is the default runner, configured in `vitest.config.ts` and declared in `package.json`.
- Vitest runs with `environment: 'node'`, `globals: false`, `watch: false`, and includes `tests/**/*.test.ts`, `tests/**/*.test.tsx`, and `convex/**/*.test.ts`.
- Playwright 1.61.1 is the browser runner, declared in `package.json`; `playwright.config.ts` targets `tests/e2e/`, while `playwright.deploy-smoke.config.ts` targets `tests/deploy-smoke/`.

**Assertion Library:**
- Vitest's explicit `expect` import supplies unit/integration assertions (`toEqual`, `toMatchObject`, `toThrow`, `resolves`, `rejects`, and matcher variants); `globals: false` means tests import `describe`, `it`, `expect`, and hooks explicitly.
- React tests use `@testing-library/react` queries and events (`render`, `screen`, `fireEvent`, `waitFor`) with `jsdom` opted into per file, as in `tests/unit/catalog/owner-offering-editor.test.tsx`.
- Playwright tests use `@playwright/test` role/locator assertions, for example `tests/e2e/landing-answer.spec.ts`.

**Run Commands:**
```bash
npm test                                      # all configured Vitest tests, wrapped by tools/dev/run-with-cleanup.mjs
npm run test:unit                             # tests/unit
npm run test:integration                      # tests/integration plus convex/customerRequestRouteMandate.test.ts
npm test -- tests/unit/lib/errors.test.ts    # one Vitest file through the normal wrapper
npm run test:e2e                              # Playwright tests/e2e
npm run test:types                            # tests/types
npm run test:imports                          # import-boundary scans in tests/imports
npm run test:ts-standards                     # TypeScript standards scan
npm run test:seo                              # tests/seo
npm run test:ui-contract                      # tests/ui-contract
npm run test:eval                             # eval coverage audit, report, Promptfoo, and tests/eval
npm run test:release:source                   # codegen, lint, typecheck, static gates, unit/integration, eval report, and build
```
The integration script disables file parallelism; the release scripts compose the source gates rather than replacing the focused commands. Browser-facing scripts use the same cleanup wrapper so test-owned transient caches and headless browsers are reaped by `tools/dev/run-with-cleanup.mjs`.

## Test File Organization

**Location:**
- Unit and contract tests live under `tests/unit/`; integration tests live under `tests/integration/`; Convex function tests also live beside the host functions under `convex/`, for example `convex/workTrees.test.ts` and `tests/unit/convex/registry-runtime.test.ts`.
- Specialized suites occupy `tests/eval/`, `tests/imports/`, `tests/types/`, `tests/seo/`, `tests/ui-contract/`, `tests/harness/`, and `tests/planning/`. Browser suites are separated into `tests/e2e/` and `tests/deploy-smoke/`.
- Shared data and seams are kept in `tests/fixtures/`, `tests/helpers/`, and `tests/setup/`; source has no collocated `*.test.*` files.

**Naming:**
- Vitest files use behavior/module names ending in `.test.ts` or `.test.tsx`, such as `tests/unit/lib/errors.test.ts`, `tests/unit/customer-request/deterministic-interpreter.test.ts`, and `tests/integration/registry-api.test.ts`.
- Playwright files use `.spec.ts`, such as `tests/e2e/landing-answer.spec.ts` and `tests/deploy-smoke/customer-request-human-lifecycle-smoke.spec.ts`.
- Directory placement communicates unit versus integration; filenames do not add a separate `.unit.test` or `.integration.test` suffix.

**Structure:**
```text
tests/
  unit/             # pure modules, handlers, UI, Convex fakes
  integration/      # multi-module and route/Convex seams
  eval/             # answer/evaluation contracts
  imports/ types/ seo/ ui-contract/  # static contract gates
  e2e/ deploy-smoke/ # Playwright browser and deployment checks
  fixtures/ helpers/ setup/
convex/
  *.test.ts         # Convex host tests included by vitest.config.ts
```

## Test Structure

**Suite Organization:**
```typescript
import { describe, expect, it } from 'vitest'

import { createDeterministicCustomerRequestInterpreter } from '@/modules/customer-request/application/interpret-compile'

describe('deterministic customer request interpretation', () => {
  it('matches a capability and excludes a non-match', async () => {
    const proposal = await createDeterministicCustomerRequestInterpreter().propose({
      customerJob: 'emergency plumber near me',
      capabilities: [plumbing.descriptor, accounting.descriptor],
    })

    expect(proposal).toMatchObject({ kind: 'capability_candidates' })
  })
})
```
This mirrors `tests/unit/customer-request/deterministic-interpreter.test.ts`: nested `describe` suites, behavior-focused `it` names, local factories, explicit arrange/act/assert steps, and `toMatchObject` for stable projections. Async tests await both the operation and the assertion.

**Patterns:**
- Use `beforeEach`/`afterEach` only for state that must be reset. Examples are the global rate-limit seam in `tests/setup/http-rate-limit.ts`, environment restoration in `tests/integration/registry-api.test.ts`, and explicit React DOM cleanup in `tests/unit/chat/ae-chat-loop-context.test.tsx` and `tests/unit/catalog/owner-offering-editor.test.tsx`.
- Restore all test mutations explicitly with `vi.restoreAllMocks()`, `vi.unstubAllGlobals()`, `vi.unstubAllEnvs()`, `mockReset()`, or `mockRestore()`; current suites use these in their local `afterEach`/`finally` blocks rather than relying on an implicit global reset.
- Use type narrowing guards in tests when a result is a union; tests commonly throw a descriptive fixture error before asserting the narrowed branch.

## Mocking

**Framework:**
- Use Vitest `vi`: `vi.mock()` for module replacement, `vi.hoisted()` when a mock must be declared before imports, and `vi.mocked()` for typed access to mocked exports. Examples are `tests/unit/action-invocation/in-memory-action-invocation.test.ts` and `tests/unit/answer-thread/follow-up-chips.test.ts`.
- Prefer partial mocks with `importOriginal` when the test needs real behavior plus one controlled seam, as in `tests/unit/answer/answer-tool-dynamic-ops.test.ts`.

**Patterns:**
```typescript
vi.mock('@/lib/server/rate-limit', () => ({
  assertHttpAdmission: async () => ({ ok: true as const }),
  requestAdmissionKey: () => 'test-admission-key',
}))

const fetchMock = vi.fn(async () => Response.json({ ok: true }))
vi.stubGlobal('fetch', fetchMock)

try {
  await exerciseBoundary()
} finally {
  vi.unstubAllGlobals()
}
```
The source examples are `tests/integration/answer-turn-ui-stream.test.ts` and `tests/unit/answer-thread/follow-up-chips-client.test.ts`; provider/HTTP tests typically assert the request URL, method, headers, body, and call count on the fake rather than using a network server.

**What to Mock:**
- External HTTP/provider calls with `vi.fn`, `vi.stubGlobal('fetch', ...)`, or a contract server helper (`tests/helpers/openrouter-contract-server.ts`).
- Convex, rate-limit, registry, action, and transport seams when testing a caller in isolation; integration suites instead use `convex-test` or the real in-memory seam.
- Environment variables and clocks with `vi.stubEnv` and `vi.spyOn(Date, 'now')`; restore them in `afterEach` or `finally`.
- Browser platform gaps with the setup modules in `tests/setup/` (`web-storage.ts`, `jsdom-platform.ts`, and `resize-observer.ts`).

**What NOT to Mock:**
- Pure validators, projections, parsers, and error mappers when their contract is the subject; `tests/unit/lib/errors.test.ts` and `tests/unit/capability-supply/transport-adapters.test.ts` exercise the real implementations, including the pure amount logic in `src/modules/money/internal/exact-amount.ts`.
- The internal business logic immediately under test. Mock only its external boundary or injected port so a regression cannot pass through an all-mock test.
- Type-level contracts; test them with `tests/types/` and the strict TypeScript compiler instead of runtime fakes.

## Fixtures and Factories

**Test Data:**
```typescript
// Shared Convex fixture seam: tests/helpers/convex-fixtures.ts
const backend = convexTest(schema, convexModules)
registerWorkpool(backend)
registerRateLimiter(backend)

// Test-local factory: tests/unit/customer-request/deterministic-interpreter.test.ts
function capability(capabilityId: string, name: string, description: string, searchTerms: string[] = []) {
  // Build a typed contract/model/descriptor for the specific case.
}
```
Factories are preferred for repeated domain setup; simple one-off request bodies and expected DTOs remain inline. Convex tests use real schema/module loading when persistence is the contract (`tests/helpers/convex-fixtures.ts`, `tests/integration/answer-thread-source-write.test.ts`), while bounded fake databases are used when read/index behavior is the contract (`tests/unit/convex/registry-runtime.test.ts`).

**Location:**
- Reusable domain fixtures: `tests/fixtures/` (for example `tests/fixtures/capability-contract-v2.ts` and `tests/fixtures/source-state.ts`).
- Reusable builders, ports, contract servers, and Convex setup: `tests/helpers/`.
- Test-local factories: keep them near the suite that owns their semantics, as in `tests/unit/customer-request/deterministic-interpreter.test.ts` and `tests/integration/registry-api.test.ts`.
- Browser fixture data shared with local E2E flows: `src/lib/dev/local-e2e-business-fixtures.ts`, consumed by `tests/e2e/landing-answer.spec.ts` and related specs.

## Coverage

**Requirements:**
- No repository-wide line, branch, or statement coverage percentage is enforced: `vitest.config.ts` has no coverage configuration and `package.json` defines no `test:coverage` script.
- Coverage is contract-oriented. The answer evaluation suite requires case IDs, turn/thread coverage, tags, promptfoo synchronization, and a broad seeded-business count through `eval/answer/lib/coverage.ts`; `tests/eval/answer-pipeline.test.ts` asserts the audit has no issues.
- Static release gates also count as required coverage of architectural boundaries: `tests/imports/`, `tests/types/`, `tests/seo/`, `tests/ui-contract/`, and `tests/imports/ts-standards.test.ts` fail on forbidden imports, type holes, or contract drift.

**Configuration:**
- `vitest.config.ts` provides test inclusion and setup only; it does not configure a coverage provider, threshold, or exclusion list.
- `npm run test:eval:coverage` runs `eval/answer/scripts/audit-coverage.ts`; `npm run test:eval:report` writes the evaluated answer report to `output/eval/answer-suite-report.json`.

**View Coverage:**
```bash
npm run test:eval:coverage                 # contract/eval coverage audit, not line coverage
npm run test:eval:report                   # answer-suite report JSON
# No repository-supported npm run test:coverage command is currently defined.
```

## Test Types

**Unit Tests:**
- Exercise one pure module, validator, action, handler, or UI component with injected seams or fakes; representative suites are `tests/unit/lib/errors.test.ts`, `tests/unit/capability-execution/operation-execute.test.ts`, and `tests/unit/catalog/owner-offering-editor.test.tsx`.
- Mock network, Convex, clocks, environment, and browser APIs; keep real domain transformations and public contracts under assertion.

**Integration Tests:**
- Exercise multiple modules, route handlers, persistence, or durable source seams. `tests/integration/registry-api.test.ts` calls registry and HTTP handlers together; `tests/integration/answer-thread-source-write.test.ts` runs `convex-test` against `convex/schema.ts` and loaded Convex modules.
- Prefer real internal modules and a local Convex backend; mock only external provider/auth boundaries. The standard integration command uses `--no-file-parallelism` to protect shared state.

**E2E Tests:**
- Playwright drives complete browser flows in `tests/e2e/` using compact (375×812) and wide (1440×1100) projects from `playwright.config.ts`; local runs start Vite at `127.0.0.1:3020` with the local auth bypass env.
- Deployment smoke flows in `tests/deploy-smoke/` use `playwright.deploy-smoke.config.ts`, longer timeouts, and explicit deployed credentials/evidence; they are not substitutes for local unit or integration tests.
- Evaluation and static suites are additional test types: `tests/eval/` validates answer behavior, while `tests/imports/`, `tests/types/`, `tests/seo/`, and `tests/ui-contract/` enforce source contracts.

## Common Patterns

**Async Testing:**
```typescript
it('rejects an unavailable provider with its stable code', async () => {
  await expect(callProvider()).rejects.toThrow('provider_unavailable')
})

const response = await handleRequest(new Request('https://ae.example/api'))
await expect(response.json()).resolves.toMatchObject({ kind: 'ok' })
```
This follows `tests/unit/customer-request/deterministic-interpreter.test.ts`, `tests/unit/server/method-guard.test.ts`, and the route tests under `tests/integration/`.

**Error Testing:**
```typescript
it('returns a typed HTTP problem', async () => {
  const response = unsupportedMethodResponse('PROPFIND')
  expect(response?.status).toBe(405)
  await expect(response?.json()).resolves.toMatchObject({
    status: 405,
    kind: 'METHOD_NOT_ALLOWED',
    code: 'method_not_allowed',
  })
})
```
Prefer asserting status, headers, discriminator, stable code, and redaction rather than matching incidental prose; `tests/unit/server/method-guard.test.ts` and `tests/unit/lib/errors.test.ts` demonstrate this.

**Snapshot Testing:**
- Snapshots are selective, not the default: `tests/unit/work-tree/memo.test.tsx` uses `toMatchSnapshot()` with the checked-in `tests/unit/work-tree/__snapshots__/memo.test.tsx.snap`.
- Keep explicit semantic assertions alongside a snapshot; most suites use `toEqual`, `toMatchObject`, DOM queries, or serialized-contract checks so failures identify the violated behavior.

---

*Testing analysis: 2026-08-08*
*Update when test patterns change*
