# Testing Patterns

**Analysis Date:** 2026-07-01

## Test Framework

**Runner:**
- Vitest 4.1.9 for unit, integration, type-contract, copy, SEO, import, UI-contract, and eval tests. Config: `vitest.config.ts`.
- Playwright 1.61.1 for browser E2E and deploy smoke tests. Configs: `playwright.config.ts` and `playwright.deploy-smoke.config.ts`.
- Promptfoo 0.120.3 for answer-gate eval checks. Config: `eval/answer/promptfooconfig.yaml`.
- React Testing Library is available for jsdom component tests, as shown in `tests/unit/observability/error-boundary-client.test.tsx`.

**Assertion Library:**
- Use Vitest `expect`, `expectTypeOf`, `describe`, `it`, `test`, lifecycle hooks, and `vi` from `vitest`.
- Use Playwright `expect` and role/label locators from `@playwright/test`.
- Use Promptfoo JavaScript assertions in `eval/answer/assertions/`.

**Run Commands:**
```bash
npm test                 # Run all Vitest tests matched by vitest.config.ts
npm run test:unit        # Run tests/unit
npm run test:integration # Run tests/integration
npm run test:types       # Run tests/types
npm run test:copy        # Run copy claim guardrails
npm run test:ui-contract # Run UI class/copy contract guardrails
npm run test:imports     # Run import boundary scans
npm run test:e2e         # Run Playwright E2E tests under tests/e2e
npm run test:a11y        # Run Playwright accessibility tests under tests/e2e/a11y
npm run test:eval        # Run answer eval coverage, report, promptfoo, and tests/eval
npm run test:all         # Run typecheck, Convex codegen check, major Vitest gates, and build
npm run test:release     # Run release gate including E2E, a11y, eval, and build
```

Watch mode: Not scripted. `vitest.config.ts` sets `watch: false`.

## Test File Organization

**Location:**
- Tests are centralized under `tests/`, not co-located with `src/`.
- Unit tests live under `tests/unit/` with domain subdirectories such as `tests/unit/inquiries/`, `tests/unit/convex/`, `tests/unit/answer-thread/`, and `tests/unit/security/`.
- Integration tests live under `tests/integration/` and call route handlers, source ports, and public APIs directly.
- Browser tests live under `tests/e2e/`; accessibility-specific browser tests live under `tests/e2e/a11y/`.
- Deploy smoke tests live under `tests/deploy-smoke/` and use `playwright.deploy-smoke.config.ts`.
- Contract and guardrail tests live under `tests/imports/`, `tests/copy/`, `tests/ui-contract/`, `tests/seo/`, and `tests/types/`.
- Fixtures for negative scan modes live under `tests/fixtures/`.
- Answer eval cases and support code live under `eval/answer/`; Vitest coverage for those cases lives in `tests/eval/answer-pipeline.test.ts`.

**Naming:**
- Vitest files use `*.test.ts` or `*.test.tsx`: `tests/unit/inquiries/inquiry-flow.test.ts`, `tests/integration/agent-tools-api.test.ts`, and `tests/types/domain-contracts.test.ts`.
- Playwright files use `*.spec.ts`: `tests/e2e/developer-discovery.spec.ts` and `tests/deploy-smoke/phase1-deploy-smoke.spec.ts`.
- Per-file jsdom Vitest tests use a file header, as in `tests/unit/observability/error-boundary-client.test.tsx`.

**Structure:**
```text
tests/
├── unit/          # 85 Vitest unit and runtime bridge tests
├── integration/   # 27 direct handler/source-port integration tests
├── e2e/           # 8 Playwright browser specs, including a11y/
├── deploy-smoke/  # 6 deployed-environment Playwright smoke specs
├── copy/          # 5 copy and claim guardrail tests
├── imports/       # 5 import/type/source boundary scan tests
├── seo/           # 6 SEO and discovery file tests
├── types/         # 3 compile-time/runtime contract tests
├── ui-contract/   # 6 visual/copy/UI contract scan tests
└── eval/          # 1 Vitest answer pipeline eval suite
```

## Test Structure

**Suite Organization:**
```typescript
import { describe, expect, it } from 'vitest'

import { handleInvokeAgentTool } from '@/routes/api.agent.tools'
import { createDefaultRegistrySourceState } from '@/modules/registry/public'
import { withRegistrySourcePortForTest } from '../helpers/source-ports'

describe('POST /api/agent/tools registry search', () => {
  it('invokes registry.search and returns the public catalog page', async () => {
    const state = createDefaultRegistrySourceState()
    await withRegistrySourcePortForTest(state, async () => {
      const response = await handleInvokeAgentTool(
        new Request('https://ae.example/api/agent/tools', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tool: 'registry.search', input: { query: 'parramatta' } }),
        }),
      )

      expect(response.status).toBe(200)
      await expect(response.json()).resolves.toMatchObject({ kind: 'ok' })
    })
  })
})
```

**Patterns:**
- Use `describe` blocks by route, module, or contract surface. Examples: `tests/integration/agent-tools-api.test.ts`, `tests/unit/inquiries/inquiry-flow.test.ts`, and `tests/e2e/developer-discovery.spec.ts`.
- Use direct exported handler calls for API tests instead of spinning up the app. Examples: `handleInvokeAgentTool` in `tests/integration/agent-tools-api.test.ts`, `handleDurableLlmsTxtRequest` in `tests/seo/discovery-files.test.ts`, and `handleAnswerTurnRequest` in `tests/integration/answer-turn-session-auth.test.ts`.
- Use real `Request` and `Response` objects for route tests. This keeps HTTP content types, headers, body parsing, and JSON error shapes visible.
- Use domain factory functions and command objects for pure module tests. Examples: `sourceState()` and `submitCommand()` in `tests/unit/inquiries/inquiry-flow.test.ts`, plus `claimBusiness` and `publishBusinessCatalog` in `tests/seo/discovery-files.test.ts`.
- Use `if (result.kind !== 'ok') throw new Error(result.code)` after asserting a success kind when TypeScript narrowing is needed, as in `tests/unit/inquiries/inquiry-flow.test.ts`.
- Use `it.each` for catalog-driven eval cases in `tests/eval/answer-pipeline.test.ts`.

## Mocking

**Framework:** Vitest `vi`, module-level source-port setters, direct fake transports, and Playwright request contexts.

**Patterns:**
```typescript
import { afterEach, describe, expect, it, vi } from 'vitest'

const originalFetch = globalThis.fetch

describe('Autumn HTTP provider', () => {
  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.restoreAllMocks()
  })

  it('creates the customer before starting billing attach', async () => {
    globalThis.fetch = vi.fn(async () => new Response('{}')) as typeof fetch
    // exercise provider
  })
})
```

```typescript
export async function withRegistrySourcePortForTest(
  state: RegistrySourceState,
  run: () => Promise<void>,
): Promise<void> {
  const reset = setPublicRegistrySourcePortForTests({
    list: (input) => Promise.resolve(listPublicBusinessCatalog(state, input)),
    search: (input) => Promise.resolve(searchPublicBusinessCatalog(state, input)),
    detail: (input) => Promise.resolve(getPublicBusinessCatalogBySlug(state, input)),
  })

  try {
    await run()
  } finally {
    reset()
  }
}
```

**What to Mock:**
- Mock `globalThis.fetch` for external HTTP providers, as in `tests/unit/billing/autumn-provider.test.ts` and `tests/unit/server/server-seams.test.ts`.
- Mock route/source ports with `set*ForTests` helpers and always reset them. Examples: `setPublicRegistrySourcePortForTests` in `src/modules/registry/registry.functions.ts`, `setAnswerThreadPortForTests` in `src/modules/answer-thread/answer-thread.functions.ts`, and `setLlmFollowUpChipGeneratorForTests` in `src/modules/answer-thread/internal/llm-follow-up-chips.ts`.
- Mock framework modules with `vi.mock` for jsdom component boundaries. Example: `tests/unit/observability/error-boundary-client.test.tsx` mocks `@tanstack/react-router` and `@/lib/observability/sentry.client`.
- Use fake Convex transports or in-memory DB shims for server seam and runtime bridge tests. Examples: `tests/unit/server/server-seams.test.ts` and `tests/unit/convex/inquiries-runtime.test.ts`.

**What NOT to Mock:**
- Do not mock pure domain command logic when testing business behavior. Tests such as `tests/unit/inquiries/inquiry-flow.test.ts` call `src/modules/inquiries/public.ts` functions directly.
- Do not mock copy, import, UI, or type scans in `tests/imports/`, `tests/copy/`, and `tests/ui-contract/`; run `src/lib/ui/contract-scans.ts` over real source or negative fixtures.
- Do not mock Playwright accessibility and layout behavior. Tests in `tests/e2e/a11y/public-owner-a11y.spec.ts` use keyboard focus, role/label locators, and viewport sizing.
- Do not mock generated public discovery payloads when parity is under test. `tests/integration/discovery-route-parity.test.ts` compares route handlers and generated artifacts from real source state.

## Fixtures and Factories

**Test Data:**
```typescript
const state = createDefaultRegistrySourceState()
await withRegistrySourcePortForTest(state, async () => {
  const response = await handleInvokeAgentTool(new Request('https://ae.example/api/agent/tools', init))
  expect(response.status).toBe(200)
})
```

```typescript
const claim = claimBusiness(state, {
  actor: { kind: 'authenticated_owner', clerkUserId: `owner:${input.requestedSlug}`, displayName: input.businessName },
  facts: { name: input.businessName, category: 'Heat pump repair', suburb: input.suburb, stateTerritory: 'WA' },
  security: { csrf: matchingCsrf('claim') },
  operationKey: operationKey(`claim:${input.requestedSlug}`),
  correlationId: correlationId(`claim:${input.requestedSlug}`),
  now: 10_000,
})
```

**Location:**
- Shared helper ports live in `tests/helpers/source-ports.ts`, `tests/helpers/answer-thread-test-port.ts`, and `tests/helpers/source-write-admission.ts`.
- Negative fixtures for scanner tests live under `tests/fixtures/bad-copy/`, `tests/fixtures/bad-imports/`, `tests/fixtures/bad-source-mining/`, `tests/fixtures/bad-ts-standards/`, and `tests/fixtures/bad-ui-contract/`.
- Source scan target definitions live in `tests/imports/scan-targets.ts`.
- Answer eval case catalogs live in `eval/answer/lib/cases.ts`, with coverage auditing in `eval/answer/lib/coverage.ts` and broad registry seed data in `eval/answer/lib/registry-seed.ts`.
- Deploy smoke helpers live in `tests/deploy-smoke/vercel-bypass.ts`.

## Coverage

**Requirements:** Statement/branch coverage thresholds are not configured in `vitest.config.ts` or `package.json`.

**View Coverage:**
```bash
npm run test:eval:coverage # Custom answer-eval coverage audit, not Istanbul/V8 source coverage
```

- Answer eval coverage is mandatory for answer behavior. `tests/eval/answer-pipeline.test.ts` asserts unique case IDs, required coverage tags, promptfoo sync, passing score thresholds, timing budgets, and broad seed size.
- Contract coverage is enforced by guardrail suites: `tests/imports/`, `tests/copy/`, `tests/ui-contract/`, `tests/seo/`, and `tests/types/`.
- CI runs typecheck, Convex codegen, unit/integration, copy/UI/import scans, answer eval, and build in `.github/workflows/eval-gate.yml`.

## Test Types

**Unit Tests:**
- Scope pure domain commands, source-state transitions, validators, presentation mapping, provider adapters, and server seams. Examples: `tests/unit/inquiries/inquiry-flow.test.ts`, `tests/unit/ui-status-presentation.test.ts`, `tests/unit/billing/autumn-provider.test.ts`, and `tests/unit/server/server-seams.test.ts`.
- Convex runtime bridge tests live under `tests/unit/convex/` and extract `_handler` from Convex functions with typed in-memory DB shims, as in `tests/unit/convex/inquiries-runtime.test.ts`.
- Type contract tests use `expectTypeOf` and `@ts-expect-error` in `tests/types/domain-contracts.test.ts`.

**Integration Tests:**
- Scope route handlers, direct `Request`/`Response` behavior, source-port state, session auth, route parity, API boundaries, and answer turn flows. Examples: `tests/integration/agent-tools-api.test.ts`, `tests/integration/answer-turn-session-auth.test.ts`, `tests/integration/discovery-route-parity.test.ts`, and `tests/integration/registry-api.test.ts`.
- Integration tests should use helper wrappers such as `withRegistrySourcePortForTest` and `withDiscoverySourcePortForTest` from `tests/helpers/source-ports.ts`.

**E2E Tests:**
- Playwright E2E tests live in `tests/e2e/` and run against the Vite dev server configured in `playwright.config.ts`.
- E2E projects cover compact and wide Chromium viewports: `compact-chromium` at 375x812 and `wide-chromium` at 1440x1100.
- Accessibility tests under `tests/e2e/a11y/` cover skip links, labels, keyboard submit paths, focus management, and horizontal overflow.
- Deploy smoke tests under `tests/deploy-smoke/` use `playwright.deploy-smoke.config.ts`, deployed URLs, Vercel bypass helpers, and storage states.

## Common Patterns

**Async Testing:**
```typescript
await expect(
  readRequiredConvexAuthToken({ isAuthenticated: false, getToken: async () => null }),
).rejects.toMatchObject({ code: 'missing_auth', status: 401 })
```

```typescript
const response = await handleInvokeAgentTool(new Request('https://ae.example/api/agent/tools', init))
expect(response.status).toBe(400)
await expect(response.json()).resolves.toMatchObject({
  kind: 'error',
  code: 'agent_tools_invalid_input',
})
```

**Error Testing:**
```typescript
expect(() => readRequiredConvexUrl({})).toThrow(ConvexSourceError)
expect(() => readRequiredConvexUrl({})).toThrow(
  expect.objectContaining({ code: 'missing_convex_url', status: 500 }),
)
```

**Playwright Testing:**
```typescript
await page.goto('/developers/discovery')
await expect(page.getByRole('heading', { name: /read-only public catalog files/i })).toBeVisible()
const bodyText = await page.locator('body').innerText()
expect(bodyText).not.toMatch(/MCP|OpenAPI|callable endpoint.*live/i)
```

**Contract Scan Testing:**
```typescript
const violations = scanTypeScriptStandards(
  isFixtureMode() ? fixtureTargets('tests/fixtures/bad-ts-standards') : cleanRuntimeTargets(),
)
expect(violations).toEqual([])
```

**Convex Testing:**
- Read `convex/_generated/ai/guidelines.md` before changing Convex tests or functions.
- Existing Convex tests use Vitest in `tests/unit/convex/` with typed in-memory DB shims and handler extraction from `convex/*.ts`.
- The generated Convex guidance in `convex/_generated/ai/guidelines.md` specifies `convex-test`, `vitest`, `@edge-runtime/vm`, and `environment: "edge-runtime"` for Convex function tests; the current project config in `vitest.config.ts` uses `environment: 'node'` and does not include `convex-test`.

---

*Testing analysis: 2026-07-01*
