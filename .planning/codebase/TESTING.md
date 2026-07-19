# Testing Patterns

**Analysis Date:** 2026-07-19
**last_mapped_commit:** `77ec35ac`

## Test Framework

**Runner:**
- Vitest `4.1.9` is the primary runner for unit, integration, type, import-boundary, copy, SEO, UI-contract, and eval tests.
- Config: `vitest.config.ts`
- Environment: Node; globals disabled; watch disabled; aliases loaded from `tsconfig.json`.
- Included files: `tests/**/*.test.ts`, `tests/**/*.test.tsx`, and `convex/**/*.test.ts`.
- Playwright `1.61.1` runs local browser journeys through `playwright.config.ts` and hosted/deploy smoke through `playwright.deploy-smoke.config.ts`.
- Promptfoo `0.121.17` supplements the answer eval harness in `eval/answer/`.

**Assertion Library:**
- Use Vitest's `expect` for TypeScript tests.
- Use Playwright's `expect` and role/label locators for browser tests.
- React units use `@testing-library/react`; `@testing-library/jest-dom` is available for DOM assertions.

**Run Commands:**
```bash
npm test                          # All Vitest-included tests
npm run test:unit                 # 294 unit test files under tests/unit
npm run test:integration          # 41 integration files plus the Convex route-mandate test, serialized
npm run test:types                # Domain/type contract checks
npm run test:imports              # Module, route, kernel, and source-completeness boundaries
npm run test:ts-standards         # Unsafe TypeScript and source-policy scans
npm run test:copy                 # Public/assistant claim guardrails
npm run test:seo                  # Discovery and canonical metadata contracts
npm run test:ui-contract          # UI structure/style policy scans
npm run test:e2e                  # Local Playwright journeys
npm run test:a11y                 # Playwright accessibility journeys
npm run test:eval                 # Eval coverage, report, Promptfoo, and Vitest evals
npm run test:all                  # Local type/codegen/test/build gate
npm run test:release              # Source gate followed by hosted readback and smokes
```

There is no dedicated Vitest watch script because `vitest.config.ts` pins `watch: false`. Run a focused file with `npx vitest run <path>`.

## Test File Organization

**Location:**
- `tests/unit/<domain>/` mirrors source domains and contains pure behavior, component, Convex-host fake-runtime, and thinness tests.
- `tests/integration/` exercises multiple modules, HTTP handlers, `convex-test`, and provider boundaries.
- `tests/e2e/` contains local Playwright customer journeys; `tests/e2e/a11y/` contains accessibility-focused journeys.
- `tests/deploy-smoke/` targets deployed/readback behavior with a separate Playwright config.
- `tests/imports/`, `tests/copy/`, `tests/seo/`, `tests/ui-contract/`, and `tests/types/` are executable policy gates.
- `tests/eval/` validates deterministic eval contracts; the underlying case catalogs and evaluators live in `eval/answer/` and `eval/product-foundry/`.
- `tests/helpers/` owns reusable doubles and contract servers. `tests/fixtures/` contains deliberate violations for scanner self-tests.
- `convex/customerRequestRouteMandate.test.ts` is the single co-located Convex test included by the integration command.

**Naming:**
- Use `<behavior>.test.ts` or `<component>.test.tsx` for Vitest.
- Use `<journey>.spec.ts` for Playwright.
- Use `<area>-thinness.test.ts` for source-structure locks.
- Phrase `describe` around the unit/contract and `it`/`test` around observable behavior.

**Structure:**
```text
tests/
├── unit/<domain>/                 # Pure behavior, UI units, host fakes, thinness locks
├── integration/                   # Cross-module and Convex-backed flows
├── e2e/                           # Local browser journeys
│   └── a11y/                      # Accessibility journeys
├── deploy-smoke/                  # Hosted browser/readback proof
├── imports/                       # Architecture and TypeScript scans
├── copy/ seo/ ui-contract/ types/ # Specialized contract gates
├── eval/                          # Eval contract tests
├── helpers/                       # Shared doubles/servers/admission helpers
└── fixtures/                      # Deliberately bad scanner fixtures
```

## Test Structure

**Suite Organization:**
```typescript
import { describe, expect, it } from 'vitest'

import { operationUnderTest } from '@/modules/example/public'

describe('example operation', () => {
  it('returns a typed refusal when authority is missing', async () => {
    const result = await operationUnderTest(input, ports)

    expect(result).toMatchObject({
      kind: 'refused',
      code: 'authority_required',
    })
  })
})
```

**Patterns:**
- Import the behavior through its public module seam. Deep imports are appropriate only when the test intentionally owns that same internal package or is enforcing its structure.
- Assert semantic results and refusal codes, not implementation call order, unless port invocation is itself the contract.
- Cover success, refusal/error, replay/idempotency, boundary values, redaction, and recovery for write paths.
- Use `it.each` for a shared case catalog, as in `tests/eval/answer-pipeline.test.ts`.
- Use `expect.objectContaining`, `toMatchObject`, and targeted exact assertions to keep tests strict about the contract without binding unrelated fields.
- For source-policy tests, read live files and assert forbidden imports/tokens, required wiring, or line limits. Keep behavior coverage alongside these static locks.

**Setup and Teardown:**
- Use `beforeEach`/`afterEach` for repeatable environment or fake-runtime setup.
- Save original environment values and restore them in `afterEach` or `finally`; `tests/unit/convex/inquiries-runtime.test.ts` is the representative pattern.
- Always restore injected source backends, global `fetch`, spies, temporary servers, and fake timers.
- Avoid reliance on suite ordering or persistent process state.

## Mocking

**Framework:** Vitest `vi`; Playwright `page.route` for browser network control.

**Patterns:**
```typescript
const providerFetch = vi.hoisted(() => vi.fn<typeof import('undici').fetch>())

vi.mock('undici', async (importOriginal) => ({
  ...await importOriginal<typeof import('undici')>(),
  fetch: providerFetch,
}))
```

Use `vi.fn` for ports/fetch implementations, `vi.spyOn` for narrow replaceable collaborators, `vi.stubGlobal` for browser/runtime globals, and `page.route` to provide deterministic browser API states.

**What to Mock:**
- External networks, provider SDK edges, DNS, time, random identifiers, auth identities, and source-write admission.
- Typed ports when unit-testing a pure machine or application operation.
- Browser APIs absent from jsdom, such as `ResizeObserver`, only in the component suite that requires them.
- Convex DB behavior with a purpose-built in-memory fake when validating host bridge logic.

**What NOT to Mock:**
- The public operation under test or its result schema.
- Private collaborators merely to make implementation-aware assertions.
- Convex persistence when the integration claim requires `convex-test`.
- Source scanners; feed them live targets and deliberate fixtures instead.
- Hosted behavior with local imports or direct database calls. Hosted proof must use the intended public surface.

## Fixtures and Factories

**Test Data:**
```typescript
const input = {
  requestRef: 'request:test',
  revision: 1,
  routeRef: 'route:test',
} as const
```

- Prefer small inline typed builders/factories next to the suite when data is domain-specific.
- Use shared fixtures only when multiple suites must prove continuity across surfaces.
- Keep fake credentials and identifiers visibly test-only; never read `.env` files in tests or documentation.
- Scanner fixtures under `tests/fixtures/bad-*` intentionally violate rules and run through `AE_SCAN_MODE=fixtures`.

**Location:**
- General helpers: `tests/helpers/source-write-admission.ts`, `tests/helpers/openrouter-contract-server.ts`, and `tests/helpers/answer-thread-test-port.ts`.
- Local browser catalog data: `src/lib/dev/local-e2e-business-fixtures.ts`.
- Eval cases: `eval/answer/lib/cases.ts` and `eval/product-foundry/`.
- Domain-specific factories: keep within the owning test file until reuse is demonstrated.

## Coverage

**Requirements:** No line/branch/function coverage threshold or coverage provider is configured in `vitest.config.ts`. Quality is enforced by layered behavioral and contract gates, not a numeric code-coverage target.

The answer eval system has a separate semantic coverage auditor in `eval/answer/lib/coverage.ts`; `npm run test:eval:coverage` verifies required case tags, assertions, and broad seed size. Do not describe this as source-code coverage.

**View Coverage:**
```bash
npm run test:eval:coverage        # Semantic eval-case coverage only
```

To add source-code coverage, first configure a Vitest coverage provider and explicit thresholds; no supported repository command currently exists.

## Test Types

**Unit Tests:**
- 294 files under `tests/unit/`.
- Exercise pure domain operations, schemas, projections, components, fake Convex hosts, security primitives, and source thinness.
- Use direct ports/fakes for speed and deterministic boundary cases.

**Integration Tests:**
- 41 files under `tests/integration/`, plus `convex/customerRequestRouteMandate.test.ts`.
- Use `convex-test` with `import.meta.glob` for real schema/function execution where persistence matters.
- Exercise cross-module API routes, registration/publication, Request lifecycle, provider adapters, security, and source parity.
- The package command disables file parallelism because these flows share heavier runtime/global resources.

**E2E Tests:**
- 11 Playwright files under `tests/e2e/`, including two accessibility specs.
- `playwright.config.ts` runs compact and wide Chromium projects, starts a strict local Vite server when `PLAYWRIGHT_BASE_URL` is absent, retries only in CI, and captures trace on first retry.
- Prefer accessible role/label locators and customer-visible language; stub only the API state needed to isolate the journey.

**Deploy Smoke Tests:**
- Six `tests/deploy-smoke/*.spec.ts` files verify selected hosted human/provider flows.
- `playwright.deploy-smoke.config.ts` is serial, has no retries, and retains traces on failure.
- Deployment smoke establishes intended-surface readback only for the exact environment/revision tested.

**Static Contract Tests:**
- Import/private-boundary tests under `tests/imports/`.
- TypeScript source standards via `tests/imports/ts-standards.test.ts`.
- Copy/claims tests under `tests/copy/`.
- Discovery/SEO tests under `tests/seo/`.
- UI policy under `tests/ui-contract/ui-contract.test.ts`.
- Thinness tests throughout `tests/unit/**/**-thinness.test.ts`.

**Evaluation Tests:**
- `tests/eval/answer-pipeline.test.ts` validates case uniqueness, semantic coverage, score thresholds, user outcomes, and Promptfoo catalog parity.
- `test:eval` generates a report, runs Promptfoo without cache, and then runs Vitest eval tests.

## Common Patterns

**Async Testing:**
```typescript
it('persists through the real Convex test backend', async () => {
  const backend = convexTest(schema, modules)
  const result = await backend.mutation(api.example.submit, input)

  expect(result.kind).toBe('ok')
})
```

Await every async operation. For network contract servers and temporary backends, close/restore them in `finally`.

**Error Testing:**
```typescript
const result = await operationUnderTest(invalidInput, ports)

expect(result).toEqual({
  kind: 'refused',
  code: 'input_not_admitted',
})
```

Use `toThrow` only for invariants and programmer/setup errors. Expected product failures should assert the full typed refusal/error posture.

**Browser Testing:**
```typescript
await page.goto('/engine')
await page.getByLabel('What are you looking for?').fill('Choose the lowest maximum cost')
await page.getByRole('button', { name: 'Start my Request' }).click()
await expect(page.getByText(/Nothing has been selected, booked, or purchased/)).toBeVisible()
```

Test what a customer or external caller can observe. Do not use internal IDs or privileged reads as a substitute for a public journey.

## Change-to-Gate Guide

| Change | Minimum focused proof |
|---|---|
| Pure domain behavior | Owning `tests/unit/<domain>/` file |
| Convex schema/host/persistence | Focused unit plus owning `tests/integration/`; run `npm run check:convex-codegen` |
| Module or route boundary | `npm run test:imports` and `npm run test:ts-standards` |
| Public/assistant copy | `npm run test:copy`; add SEO/UI contract gates when relevant |
| React interaction | Component unit plus focused Playwright journey |
| Customer Request lifecycle | Focused unit/integration, then intended-surface e2e or smoke |
| Eval behavior | `npm run test:eval:coverage`, focused `tests/eval/`, then full `npm run test:eval` |
| Release claim | `npm run test:release`; report source and hosted evidence separately |

---

*Testing analysis: 2026-07-19*
