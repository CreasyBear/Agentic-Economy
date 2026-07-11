# Testing Patterns

**Analysis Date:** 2026-07-11

## Test Framework

**Runners:**
- Vitest 4.1.9 runs TypeScript/TSX unit, integration, contract, type, copy, SEO, import-boundary, and evaluation tests. `vitest.config.ts` uses the Node environment, explicit imports (`globals: false`), no watch, and includes `tests/**/*.test.ts(x)`.
- Playwright 1.61.1 runs browser E2E and accessibility specs from `tests/e2e/`; `playwright.deploy-smoke.config.ts` runs separately against deployed/provider surfaces.
- Promptfoo drives the answer-quality model evaluation configured under `eval/answer/`, with Vitest tests pinning catalog coverage and report semantics.
- React component tests use Testing Library with jsdom selected per test file where needed.

**Assertions:**
- Use Vitest's built-in `expect`, including exact `toEqual`, identity `toBe`, subset/matcher helpers, `toThrow`, and async `rejects`.
- Use Playwright's retrying web-first assertions (`await expect(locator).toBeVisible()`, `toHaveURL`, `toBeEnabled`) and role/label selectors.
- Prefer explicit behavioral assertions; no snapshot tests were found.

**Run Commands:**
```bash
npm test                                      # All Vitest .test.ts/.test.tsx files
npm run test:unit                            # Unit suite
npm run test:integration                     # Integration suite
npm run test:types                           # Compile-time/domain contract tests
npm run test:imports                         # Clean-tree import boundary guardrails
npm run test:ts-standards                    # TypeScript source standards scan
npm run test:copy                            # Public-copy boundaries
npm run test:seo                             # SEO/discovery contracts
npm run test:ui-contract                     # Design-token/source contract scan
npm run test:eval                            # Eval coverage, report, Promptfoo, Vitest evals
npm run test:e2e                             # Playwright product flows
npm run test:a11y                            # Playwright accessibility flows
npm run test:all                             # Broad local source gate, excluding E2E/eval
npm run test:release                         # Full release gate through build
npx vitest run tests/unit/common/runtime-id.test.ts  # Single Vitest file
npx playwright test tests/e2e/thread-first.spec.ts   # Single browser spec
```

## Test File Organization

**Location and Naming:**
- Tests are centralized under `tests/`, grouped by proof type rather than collocated with source.
- Vitest files use `*.test.ts` or `*.test.tsx`; Playwright files use `*.spec.ts`.
- Unit tests mirror domain/surface ownership under `tests/unit/<domain>/`; integration tests are flat under `tests/integration/` and name the boundary or flow.
- Cross-cutting executable guardrails live in `tests/imports/`, `tests/copy/`, `tests/seo/`, `tests/types/`, and `tests/ui-contract/`.
- Shared infrastructure is in `tests/helpers/`; deliberately invalid scanner inputs are isolated under `tests/fixtures/bad-*`.

**Structure:**
```text
tests/
  unit/<domain>/<behavior>.test.ts[x]
  integration/<boundary-or-flow>.test.ts
  eval/answer-pipeline.test.ts
  imports/<source-rule>.test.ts
  copy/ | seo/ | types/ | ui-contract/
  helpers/<test-port-or-server>.ts
  fixtures/bad-*/<violation>.fixture
  e2e/<user-flow>.spec.ts
  e2e/a11y/<surface>-a11y.spec.ts
  deploy-smoke/<hosted-boundary>-smoke.spec.ts
```

## Test Structure

**Suite Organization:**
```typescript
import { afterEach, describe, expect, it } from 'vitest'

describe('POST /api/answer/turn session auth', () => {
  afterEach(() => {
    setAnswerThreadPortForTests(undefined)
    resetAnswerTurnGuardForTests()
  })

  it('rejects follow-up writes from a different session', async () => {
    const response = await handleAnswerTurnRequest(request)
    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: 'thread_forbidden' })
  })
})
```

**Patterns:**
- Describe the unit or boundary in `describe`; phrase `it` names as observable behavior. Small test files may use top-level tests, while scenario matrices use `it.each`.
- Arrange inline with clear domain values, invoke the public behavior, then assert exact output and relevant side effects. Comments are used when a proof intentionally stops at a boundary.
- Restore injected ports, globals, timers, servers, and environment in `afterEach` or `finally`; tests must be order-independent unless a Playwright suite explicitly configures serial flow.
- Test stable codes, statuses, persisted records, public DTOs, and user-visible language rather than private implementation steps.

## Mocking and Test Seams

**Framework and Patterns:**
- Vitest `vi.fn`, `vi.spyOn`, `vi.mock`, and `vi.stubGlobal` are used where a true external boundary must be replaced; restore them after each test.
- Prefer explicit dependency seams over broad module mocks: in-memory stores/ports (`tests/helpers/answer-thread-test-port.ts`), injected module testing exports, deterministic clocks, and local HTTP contract servers (`tests/helpers/openrouter-contract-server.ts`).
- React tests render real components and query with Testing Library `screen`; mock router/browser primitives only when the browser contract is not the subject.
- Playwright uses the real Vite server and browser. Local E2E disables Clerk through `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E`; hosted smoke tests require explicit target/auth/provider environment.

**What to Mock:**
- Network/provider APIs, runtime persistence ports, browser-only APIs in Node/jsdom, time where expiry matters, and environment-controlled adapters.
- Keep schemas, pure domain commands, DTO builders, reducers, and validation logic real.

## Fixtures and Factories

**Test Data:**
- Define compact factory functions near usage with `Partial<T>` overrides for domain/UI objects, as in `tests/unit/chat/ae-provider-card.test.tsx`.
- Use shared in-memory stores and install helpers for multi-test runtime behavior (`tests/helpers/answer-thread-test-port.ts`).
- Evaluation cases and broad registry seeds are centralized under `eval/answer/lib/cases.ts` and `eval/answer/lib/registry-seed.ts`; tests audit uniqueness and minimum breadth.
- Scanner fixtures are intentionally invalid and selected via `AE_SCAN_MODE=fixtures`; clean-mode tests must scan live source and return zero violations.
- Avoid opaque fixture snapshots. Make identifiers, timestamps, sessions, slugs, and expected records explicit in the test.

## Coverage and Quality Gates

**Coverage:**
- No conventional line/branch percentage threshold or Vitest coverage reporter is configured in `vitest.config.ts` or `package.json`.
- Coverage is risk- and contract-based: 168 unit files plus integration, browser, schema, security, boundary, copy, SEO, UI, and AI-evaluation suites cover distinct proof classes.
- Answer evaluations enforce case-catalog coverage, minimum seeded business breadth, score thresholds, outcome fields, and report completeness in `tests/eval/answer-pipeline.test.ts` and `eval/answer/lib/coverage.ts`.

**Gate Composition:**
- `npm run test:all` combines typecheck, Convex codegen, unit, integration, types, imports, TS standards, copy, SEO, UI contract, and build.
- `npm run test:release` adds AI evaluation, Playwright E2E, and accessibility to the source/build gates.
- `.github/workflows/eval-gate.yml` runs unit and integration tests before the evaluation-specific job; hosted/provider smoke scripts remain distinct because they need external deployment credentials and endpoints.
- Do not claim hosted behavior from local tests. Use the matching `test:deploy-smoke:*` or `test:provider-smoke:*` command for deployed readback proof.

## Test Types

**Unit:**
- Exercise deterministic domain logic, validators, reducers, security rules, render behavior, and Convex wrapper/runtime contracts under `tests/unit/`.
- Many “unit” runtime tests intentionally use realistic in-memory state rather than mocking each collaborator.

**Integration:**
- Exercise route handlers, runtime ports, auth/session boundaries, persistence flows, discovery parity, routing protocol adapters, and multi-module behavior under `tests/integration/`.
- External providers are replaced by local contract servers or explicit test ports while internal modules remain real.

**Contract and Static Guardrail:**
- `tests/imports/` scans repository source for forbidden imports, backups, route-boundary leaks, and unsafe TypeScript constructs.
- `tests/types/domain-contracts.test.ts` pins type/domain contracts; copy, SEO, UI-contract, and security suites pin product claims and source ownership.
- Fixture-mode scripts prove scanners detect known-bad examples, not merely return empty results.

**E2E and Accessibility:**
- Playwright runs compact (375x812) and wide (1440x1100) Chromium projects in parallel, with screenshots on failure and traces on first retry (`playwright.config.ts`).
- Query by accessible role/name and assert user outcomes, URLs, responsive behavior, focus, enabled state, and prohibited public language.
- Use serial mode only when a flow deliberately depends on prior browser session state (`tests/e2e/thread-first.spec.ts`).

**Deploy/Provider Smoke:**
- `tests/deploy-smoke/` verifies narrow hosted public, inquiry-support, Resend, and Novu boundaries with a non-local Playwright config.
- These are not included in the default local Vitest suite and must be run with the exact environment required by the target deployment.

## Common Patterns

**Async and Errors:**
```typescript
const response = await handleAnswerTurnRequest(request)
expect(response.status).toBe(403)
expect(await response.json()).toEqual({ error: 'thread_forbidden' })

await expect(operation()).rejects.toThrow('expected boundary error')
```

**Browser:**
```typescript
await page.goto('/t/thread-a11y-missing')
await expect(page.getByRole('log', { name: /chat transcript/i })).toBeVisible()
await expect(page.getByRole('button', { name: /^send$/i })).toBeDisabled()
```

**Snapshots:**
- Not used. Prefer exact objects, explicit strings/codes, semantic DOM queries, and contract scan results.

---

*Testing analysis: 2026-07-11*
*Update when test patterns change*
