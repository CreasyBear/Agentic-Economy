# Testing Patterns

**Analysis Date:** 2026-08-17

## Test Framework

**Runner:**
- Vitest 4.1.9
- Config: `vitest.config.ts`
- Environment default: `node` (override per-file with `@vitest-environment jsdom` pragma)
- Globals: `false` — explicit imports from `vitest` required
- Setup files: `tests/setup/web-storage.ts`, `tests/setup/no-search-gap-writes.ts`, `tests/setup/jsdom-platform.ts`, `tests/setup/http-rate-limit.ts`
- Include patterns: `tests/**/*.test.ts`, `tests/**/*.test.tsx`, `convex/**/*.test.ts`
- Path alias `@/` → `src/` mirrored in vitest config

**Assertion Library:**
- Vitest built-in `expect`
- `expectTypeOf` from `vitest` for compile-time contract tests (`tests/types/domain-contracts.test.ts`)
- `@testing-library/react` for component tests (`render`, `screen`, `cleanup`)

**Run Commands:**
```bash
npm test                                    # All vitest tests (via run-with-cleanup wrapper)
npm run test:unit                           # tests/unit only
npm run test:integration                    # tests/integration + convex (no file parallelism)
npm run test:types                          # Compile-time type contract tests
npm run test:imports                        # Boundary/import guardrail scans
npm run test:ts-standards                   # TypeScript standards scan (any, !, v.any, etc.)
npm run test:seo                            # SEO/canonical/discovery readback tests
npm run test:ui-contract                    # UI token/semantic contract scan
npm run test:eval                           # Eval coverage + promptfoo + tests/eval
npm run test:e2e                            # Playwright E2E (tests/e2e)
npm run test:conformance                    # Named conformance subset (release gate)
npm run test:release:source                 # Full release source gate (lint, typecheck, all above, build)
npm run test:release:hosted                 # Hosted readback + production smokes
npm run smoke:customer-request:development  # Development journey smoke
npm run smoke:gateway:production            # Operation gateway production smoke
npm run test:quality:gate                   # Structural eval corpus gate (CI-safe)
npm run test:quality:gate:live              # Structural + live engine harness
```

All test commands wrap execution in `node tools/dev/run-with-cleanup.mjs` which clears transient caches and kills orphaned browser processes after Playwright runs.

## Test File Organization

**Location:**
- Separate `tests/` tree — tests are NOT co-located with source
- `tests/unit/` — domain logic, components, HTTP handlers (~500+ files)
- `tests/integration/` — cross-module flows, route handlers, Convex-backed paths
- `convex/*.test.ts` — Convex function tests alongside backend code (11 files)
- `tests/imports/` — static boundary/architecture guardrails
- `tests/types/` — compile-time type contract tests
- `tests/seo/` — canonical URL, sitemap, robots, llms.txt readbacks
- `tests/ui-contract/` — semantic visual token enforcement
- `tests/eval/` — product-foundry and eval assertion tests
- `tests/e2e/` — Playwright browser tests
- `tests/deploy-smoke/` — deploy-target smokes (run via dedicated Playwright configs)
- `tests/helpers/` — shared test ports, fixtures, route handlers
- `tests/fixtures/` — bad-import/bad-ts fixture files for scan tests

**Naming:**
- `module-feature.test.ts` for unit tests (`operation-invoke.test.ts`, `route-boundary.test.ts`)
- `feature-name.test.tsx` for React component tests (`rider-services.test.tsx`)
- `*.spec.ts` for Playwright E2E (`landing-answer.spec.ts`, `thread-first.spec.ts`)
- Convex tests: `convex/agentAccessPolicy.test.ts` (camelCase matching convex file)
- Import boundary tests: descriptive guard names (`capability-contract-boundaries.test.ts`, `ts-standards.test.ts`)

**Structure:**
```
tests/
  unit/           # Per-module unit tests mirroring src/modules layout
  integration/    # Cross-boundary integration tests
  imports/        # Static scan guardrails
  types/          # Type-level contract tests
  seo/            # Discovery/SEO readbacks
  ui-contract/    # UI semantic token scan
  eval/           # Eval/product-foundry assertions
  e2e/            # Playwright browser tests
  deploy-smoke/   # Production/deploy smokes
  helpers/        # Test ports, fixture builders
  fixtures/       # Bad-code fixtures for scan tests
  setup/          # Vitest global setup files
convex/
  *.test.ts       # Convex function tests (convex-test)
tools/release/    # Production smoke scripts (tsx, not vitest)
eval/             # Promptfoo configs, quality gate, braintrust evals
```

## Test Structure

**Suite Organization:**
```typescript
import { describe, expect, it, vi } from 'vitest'

import { createOperationInvokeApplication } from '@/modules/capability-execution/operation-invoke'

describe('operation invoke preflight', () => {
  it('refuses when grant environment mismatches operation runtime', async () => {
    const result = await createOperationInvokeApplication({ ... })

    expect(result).toEqual({
      kind: 'refused',
      code: 'environment_mismatch',
    })
  })
})
```

**Patterns:**
- `describe` for module/feature grouping; nested `describe` for sub-features when needed
- `it` for single behavioral assertion; multiple `expect` calls OK when testing one scenario
- Factory functions defined in test file or imported from helpers (`fixture()`, `runtime()`, `grantInput()`)
- `beforeEach`/`afterEach` for env stubbing and cleanup; `afterEach` restores mocks (`vi.unstubAllEnvs()`, `vi.restoreAllMocks()`)
- Convex tests use `afterEach` to restore `process.env` mutations
- Component tests: `afterEach(() => { cleanup(); vi.unstubAllGlobals() })`
- No `beforeAll` pattern dominant; per-test isolation preferred
- Arrange/act/assert implicit; not commented unless complex setup

## Mocking

**Framework:**
- Vitest `vi` namespace (`vi.mock`, `vi.fn`, `vi.stubEnv`, `vi.unstubAllEnvs`, `vi.mocked`)
- `convex-test` for in-memory Convex backend (`convexTest(schema, modules)`)
- Test ports replace Convex/runtime boundaries (`installAnswerThreadTestPort` in `tests/helpers/answer-thread-test-port.ts`)

**Patterns:**
```typescript
// Environment stubbing (integration tests)
beforeEach(() => {
  vi.stubEnv('AE_CANONICAL_BASE_URL', 'https://ae.example')
})
afterEach(() => {
  vi.unstubAllEnvs()
})

// Convex in-memory backend
import { convexTest } from 'convex-test'
const modules = import.meta.glob('./**/*.ts')
const backend = convexTest(schema, modules)
await expect(backend.mutation(registerGrantForServer, { grant, serviceAuth }))
  .resolves.toEqual({ kind: 'refused', code: 'authentication_required' })

// Runtime port injection (no vi.mock — inject test doubles via port interface)
function runtime(overrides: RuntimeOverrides = {}): OperationInvokeRuntime {
  return { ...base, ...overrideValues }
}

// Scan fixture mode toggle
const violations = scanRouteBoundaries(
  isFixtureMode() ? fixtureTargets('tests/fixtures/bad-imports/route-boundary.fixture') : routeTargets()
)
```

**What to Mock:**
- External environment (`process.env` via `vi.stubEnv`)
- Convex persistence layer via `convex-test` in-memory backend
- Runtime ports and adapters injected as test doubles (`OperationInvokeRuntime`, answer-thread test port)
- HTTP rate limits and web storage via global setup files (`tests/setup/`)
- Time only when deterministic behavior requires it

**What NOT to Mock:**
- Pure domain logic and validators — test directly
- Const tuple unions and Zod schemas — test parse success/failure
- Internal business logic within the module under test
- Import/boundary scans run against real `src/` and `convex/` trees (clean mode) or fixture trees (`AE_SCAN_MODE=fixtures`)

## Fixtures and Factories

**Test Data:**
```typescript
// Factory in test file
function grantInput(overrides: Partial<AgentAccessGrantInput> = {}): AgentAccessGrantInput {
  return {
    grantRef: 'grant:server-wrapper',
    principalId: 'clerk_api_key:key_server_wrapper',
    environment: 'sandbox',
    ...overrides,
  }
}

// Shared fixture builders in tests/helpers/
import { createDurablePublishedDiscoveryState } from '../fixtures/discovery-published-state'
import { buildDevelopmentPublishedOperationEvidence } from '../../../tools/dev/fixtures/capability-supply/development-published-operation-evidence'

// Test port store pattern (in-memory Maps replacing Convex)
export function createAnswerThreadTestStore(): AnswerThreadTestStore {
  return { threads: new Map(), turns: new Map(), reservations: new Map(), ... }
}
```

**Location:**
- Per-test factories: defined at top of test file near `describe` block
- Shared helpers: `tests/helpers/` (`answer-thread-test-port.ts`, `discovery-fixture-routes.ts`, `discovery-fixture-source-state.ts`)
- Fixture data files: `tests/fixtures/` (bad-code samples for scan tests)
- Dev evidence fixtures: `tools/dev/fixtures/` (development published operation evidence, capability supply)
- Eval corpus: `eval/quality/cases/`, `eval/product-foundry/portfolio.ts`

## Coverage

**Requirements:**
- No enforced line-coverage percentage in CI
- Release gate (`npm run test:release:source`) is the enforcement mechanism — all focused suites must pass
- Engineering standards: run narrowest check for changed transition, expand only over boundaries crossed (`.planning/ENGINEERING-STANDARDS.md`)
- Tests assert behavior, effects, authority, refusal, uncertainty, evidence, and recovery — not marketing prose

**Configuration:**
- No `coverage` block in `vitest.config.ts`; coverage not part of default test runs
- JSON reporters for release subsets: `--reporter=json --outputFile.json=output/release/unit-vitest.json`

**View Coverage:**
- Not configured as a standard workflow; use vitest `--coverage` ad hoc if needed

## Test Types

**Unit Tests** (`tests/unit/`):
- Scope: single module function, validator, projection, or component in isolation
- Mocking: inject port interfaces or stub env; avoid mocking pure logic
- Examples: `tests/unit/capability-execution/operation-invoke.test.ts`, `tests/unit/answer/merge-answer-artifact.test.ts`
- React component tests use `@vitest-environment jsdom` and `@testing-library/react`
- Speed: fast; no network or real Convex

**Integration Tests** (`tests/integration/`, `convex/*.test.ts`):
- Scope: cross-module flows, HTTP route handlers, Convex mutations with in-memory backend
- Run with `--no-file-parallelism --test-timeout=15000` for integration suite
- Examples: `tests/integration/discovery-routes.test.ts`, `tests/integration/answer-thread-source-write.test.ts`, `convex/agentAccessPolicy.test.ts`
- Mocking: real internal modules; mock only external boundaries (env, service auth tokens)

**Boundary/Import Tests** (`tests/imports/`):
- Static scans via `src/lib/ui/contract-scans.ts` — not traditional unit tests
- Enforce route boundaries, private import rules, TS standards, kernel retirement manifests
- Two modes: `AE_SCAN_MODE=clean` (scan production trees) and `AE_SCAN_MODE=fixtures` (scan bad fixture files)
- Run: `npm run test:imports`, `npm run test:ts-standards`

**Type Contract Tests** (`tests/types/`):
- Compile-time + runtime validator equality using `expectTypeOf` and `@ts-expect-error`
- Prove invalid status strings fail to compile and runtime parse
- Example: `tests/types/domain-contracts.test.ts`

**SEO/Discovery Tests** (`tests/seo/`):
- Canonical URL resolution, sitemap, robots.txt, llms.txt, UCP manifest readbacks
- Example: `tests/seo/canonical-base-url.test.ts`

**UI Contract Tests** (`tests/ui-contract/`):
- Scan `src/components/ae` and `src/routes` for semantic visual token compliance
- Example: `tests/ui-contract/ui-contract.test.ts`

**Eval Tests** (`tests/eval/`, `eval/`):
- Product-foundry portfolio assertions, action-bundle evals
- Promptfoo config: `eval/answer/promptfooconfig.yaml`
- Quality gate: `eval/quality/gate.ts` (structural L0 + optional live L1)
- Braintrust: `eval/braintrust/answer.eval.ts`
- Run: `npm run test:eval`, `npm run test:quality:gate`

**E2E Tests** (Playwright):
- Framework: `@playwright/test` 1.61.1
- Configs: `playwright.config.ts` (default `tests/e2e`), `playwright.deploy-smoke.config.ts`, `playwright.paid-operation.config.ts`
- Projects: `compact-chromium` (375×812), `wide-chromium` (1440×1100)
- Auto-starts dev server on port 3020 unless `PLAYWRIGHT_BASE_URL` set
- Examples: `tests/e2e/landing-answer.spec.ts`, `tests/e2e/thread-first.spec.ts`, `tests/e2e/a11y/`
- A11y: `tests/e2e/a11y/engine-product-a11y.spec.ts`

**Release Smokes** (not vitest):
- Development smokes: `tools/dev/customer-request-development-smoke.ts`, `tools/dev/work-tree-development-smoke.ts`
- Production smokes: `tools/release/customer-request-production-smoke.ts`, `tools/release/operation-gateway-production-smoke.ts`
- Deploy smokes: `tests/deploy-smoke/customer-request-human-lifecycle-smoke.spec.ts`
- Credential verification: `tools/release/verify-customer-request-release-credential.ts`

**Conformance Suite** (`npm run test:conformance`):
- Named list of ~25 critical path tests spanning action-invocation, capability-supply, customer-request, answer-thread, deployment, server diagnostics
- Subset gate within `test:release:source`

## Common Patterns

**Async Testing:**
```typescript
it('requires the server token and exact grant principal binding', async () => {
  const backend = convexTest(schema, modules)
  await expect(backend.mutation(registerGrantForServer, { grant, serviceAuth }))
    .resolves.toEqual({ kind: 'refused', code: 'authentication_required' })
})
```

**Error Testing:**
```typescript
// Sync throw (programmer fault paths)
it('throws when adapter not reached', () => {
  expect(() => parse(null)).toThrow('Cannot parse null')
})

// Discriminated refusal (domain failures — preferred)
expect(result).toEqual({ kind: 'refused', code: 'environment_mismatch' })

// Scan violations empty in clean mode
expect(violations).toEqual([])

// Type-level rejection
// @ts-expect-error broad live state is not a valid public status
const invalidPublicStatus: PublicStatus = 'live'
```

**Component Testing:**
```typescript
/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

it('uses plain-language copy', () => {
  render(<AeServiceRow service={serviceWithNoQuotePath} />)
  expect(screen.getByText('Dental check-up · Adelaide, SA')).toBeTruthy()
})
```

**Snapshot Testing:**
- Not used; prefer explicit `toEqual`/`toMatchObject` assertions
- JSON leakage checks use regex negative matches (`expect(JSON.stringify(body)).not.toMatch(/ownerId|clerk|admin/)`)

**Convex Test Pattern:**
```typescript
/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { makeFunctionReference } from 'convex/server'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')
const fn = makeFunctionReference<'mutation', Args, Result>('module:functionName')

const backend = convexTest(schema, modules)
await backend.mutation(fn, args)
```

---

*Testing analysis: 2026-08-17*
*Update when test patterns change*
