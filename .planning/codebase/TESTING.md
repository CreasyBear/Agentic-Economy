# Testing Patterns

**Analysis Date:** 2026-07-03

## Test Framework

**Runner:**
- Vitest 4.1.9 - unit, integration, type contract, import scan, copy, SEO, UI contract, and eval tests.
  - Config: `vitest.config.ts`
  - Include: `tests/**/*.test.ts`, `tests/**/*.test.tsx`
  - Default environment: `node`
- Playwright 1.61.1 - browser E2E, accessibility, and deploy smoke tests.
  - Config: `playwright.config.ts`
  - Deploy smoke config: `playwright.deploy-smoke.config.ts`
- Promptfoo 0.120.3 - answer eval suite validation and live prompt evaluation.
  - Config: `eval/answer/promptfooconfig.yaml`

**Assertion Library:**
- Vitest `expect` for `.test.ts` and `.test.tsx` files, imported from `vitest`.
- Playwright `expect` for `.spec.ts` files, imported from `@playwright/test`.
- Testing Library React for jsdom component tests: `@testing-library/react` in `tests/unit/chat/ae-chat-route-promotion.test.tsx` and `tests/unit/observability/error-boundary-client.test.tsx`.

**Run Commands:**
```bash
npm test                         # Run all Vitest tests under tests/**/*.test.ts(x)
npm run test:unit                # Run tests/unit
npm run test:integration         # Run tests/integration
npm run test:types               # Run tests/types
npm run test:imports             # Run import boundary tests in clean scan mode
npm run test:source-mining       # Run source-mining guardrails in clean scan mode
npm run test:ts-standards        # Run TypeScript standards scan in clean scan mode
npm run test:copy                # Run copy claim guardrails in clean scan mode
npm run test:seo                 # Run SEO tests
npm run test:ui-contract         # Run UI contract tests in clean scan mode
npm run test:e2e                 # Run Playwright tests/e2e
npm run test:a11y                # Run Playwright tests/e2e/a11y
npm run test:deploy-smoke        # Run the phase 1 deploy smoke Playwright spec
npm run test:eval                # Run eval coverage, report, promptfoo eval, then tests/eval
npm run test:release             # Full release gate including typecheck, Convex codegen, tests, and build
npm run test:eval:coverage       # Custom answer eval coverage audit
```

## Test File Organization

**Location:**
- Vitest tests live under `tests/<type>/**/*.test.ts` and `tests/<type>/**/*.test.tsx`.
- Playwright tests live under `tests/e2e/**/*.spec.ts` and deploy smoke specs under `tests/deploy-smoke/*.spec.ts`.
- Shared test helpers live in `tests/helpers/`.
- Negative scanner fixtures live in `tests/fixtures/bad-*`.
- Answer eval catalog, scoring, and scripts live under `eval/answer/`.

**Naming:**
- Unit tests: `tests/unit/<domain>/<feature>.test.ts`, e.g. `tests/unit/registry/registry-fallback.test.ts`.
- Integration tests: `tests/integration/<route-or-flow>.test.ts`, e.g. `tests/integration/agent-tools-api.test.ts`.
- UI contract tests: `tests/ui-contract/<contract>.test.ts`, e.g. `tests/ui-contract/public-layout-contract.test.ts`.
- Playwright specs: `tests/e2e/<flow>.spec.ts`, e.g. `tests/e2e/public-owner-ui.spec.ts`.
- Deploy smoke specs: `tests/deploy-smoke/<phase>-<provider>-smoke.spec.ts`, e.g. `tests/deploy-smoke/phase2-resend-dispatch-smoke.spec.ts`.

**Structure:**
```text
tests/
├── unit/             # Pure domain, component, source-state, Convex bridge tests
├── integration/      # Route handlers, HTTP-shaped Request/Response flows
├── e2e/              # Playwright local-browser flows
├── e2e/a11y/         # Keyboard, focus, viewport, and overflow checks
├── deploy-smoke/     # Deployed-environment smoke specs
├── imports/          # Source boundary and TypeScript standards scanners
├── ui-contract/      # UI copy/layout/class contract scans
├── copy/             # Product claim and boundary copy guardrails
├── seo/              # Metadata, JSON-LD, public crawl posture
├── types/            # Runtime/type contract parity checks
├── eval/             # Vitest assertions over answer eval suites
├── helpers/          # Source ports and admission helpers
└── fixtures/         # Negative fixtures for scanner fixture mode
```

## Test Structure

**Suite Organization:**
```typescript
import { describe, expect, it } from 'vitest'

import { handleInvokeAgentTool } from '@/routes/api.agent.tools'

describe('POST /api/agent/tools registry detail', () => {
  it('returns a not_found result for an unknown slug without erroring', async () => {
    const response = await handleInvokeAgentTool(
      new Request('https://ae.example/api/agent/tools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tool: 'registry.detail',
          input: { slug: 'no-such-business' },
        }),
      }),
    )

    expect(response.status).toBe(200)
    const body = (await response.json()) as { kind: string; code?: string }
    expect(body.kind).toBe('not_found')
  })
})
```

This pattern is used in `tests/integration/agent-tools-api.test.ts`.

**Patterns:**
- Group by public behavior, route, or domain contract using `describe`.
- Name tests in behavior terms: `keeps the registry literal: a misspelled suburb does not auto-correct` in `tests/integration/agent-tools-api.test.ts`.
- Use HTTP-shaped `new Request(...)` objects for route handler tests under `tests/integration/`.
- Assert stable result contracts with `toEqual`, `toMatchObject`, and `expect.objectContaining` rather than brittle full payloads when fields outside the contract can change.
- Add negative assertions for boundary honesty and privacy leakage. Examples: `tests/unit/actions/registry.test.ts`, `tests/e2e/public-owner-ui.spec.ts`, `tests/copy/phase1-banned-copy.test.ts`.
- For scanner tests, run clean mode by default and fixture mode with `AE_SCAN_MODE=fixtures`. See `tests/imports/ts-standards.test.ts` and `tests/ui-contract/class-scan.test.ts`.

**Playwright Pattern:**
```typescript
import { expect, test, type Page } from '@playwright/test'

test.describe('public owner routes', () => {
  test('registry search lists Sam and renders truthful no-results and pagination states', async ({ page }) => {
    await page.goto('/registry')

    await expect(page.getByRole('heading', { name: /find local service details/i })).toBeVisible()
    await expect(page.getByLabel('Business, service, or place')).toBeVisible()
    await expect(page.getByText('Needs confirmation', { exact: true })).toBeVisible()
  })
})
```

This pattern is used in `tests/e2e/public-owner-ui.spec.ts` and `tests/e2e/thread-first.spec.ts`.

## Mocking

**Framework:** Vitest `vi` plus explicit source-port injection.

**Patterns:**
```typescript
vi.mock('@/lib/server/convex-source', () => ({
  callPublicSourceQuery: vi.fn(async () => {
    throw new Error('convex unavailable')
  }),
  sourceQuery: (name: string) => name,
}))

afterEach(() => {
  vi.clearAllMocks()
  setCatalogSearchBackendForTests(undefined)
  setCatalogSearchPortForTests(undefined)
})
```

This module mock pattern is used in `tests/unit/registry/registry-fallback.test.ts`.

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

This seam-injection pattern lives in `tests/helpers/source-ports.ts`.

**What to Mock:**
- Source ports and transport seams, not core domain behavior. Use `setPublicRegistrySourcePortForTests` in `src/modules/registry/registry.functions.ts` and helpers in `tests/helpers/source-ports.ts`.
- External network/provider calls such as `fetch`, Stripe webhook admission, Sentry, and router navigation. Examples: `tests/unit/billing/autumn-provider.test.ts`, `tests/unit/business-action/stripe-checkout-evidence.test.ts`, `tests/unit/observability/error-boundary-client.test.tsx`, `tests/unit/chat/ae-chat-route-promotion.test.tsx`.
- Environment variables with `vi.stubEnv`/`vi.unstubAllEnvs` when testing config failure modes, as in `tests/unit/convex/authz.test.ts`.
- Complex React children/components when the unit under test is route state or shell behavior, using `vi.mock` and `vi.hoisted` as in `tests/unit/chat/ae-chat-route-promotion.test.tsx`.

**What NOT to Mock:**
- Do not mock the public contract being tested. `tests/integration/agent-tools-api.test.ts` invokes `handleInvokeAgentTool` directly and only injects source data through the registry source port.
- Do not mock scanners when testing guardrails. `tests/imports/private-imports.test.ts`, `tests/imports/route-boundary.test.ts`, and `tests/ui-contract/class-scan.test.ts` run actual scanner functions from `src/lib/ui/contract-scans.ts`.
- Do not mock domain pure functions when source-state behavior is the subject. Tests such as `tests/unit/catalog/publish.test.ts` and `tests/unit/harness/run-collector.test.ts` operate on real source-state functions.

## Fixtures and Factories

**Test Data:**
```typescript
function businessDto(
  overrides: Partial<PublicBusinessCatalogApiDto> = {},
): PublicBusinessCatalogApiDto {
  return {
    slug: 'parramatta-emergency-plumbing',
    name: 'Parramatta Emergency Plumbing',
    category: 'Emergency plumbing',
    suburb: 'Parramatta',
    stateTerritory: 'NSW',
    publicUrl: '/parramatta-emergency-plumbing',
    trustTier: 'claimed',
    publicStatus: 'published',
    indexStatus: 'indexed',
    discoveryStatus: 'available',
    schemaVersion: 'public-business-catalog-api:v1',
    updatedAt: 1_000,
    photos: [],
    services: [serviceDto()],
    ...overrides,
  }
}
```

This local factory style is used in `tests/unit/registry/registry-fallback.test.ts`.

**Location:**
- Shared helpers: `tests/helpers/source-ports.ts`, `tests/helpers/source-write-admission.ts`, `tests/helpers/answer-thread-test-port.ts`.
- Negative scanner fixtures: `tests/fixtures/bad-imports/`, `tests/fixtures/bad-copy/`, `tests/fixtures/bad-ts-standards/`, `tests/fixtures/bad-ui-contract/`, `tests/fixtures/bad-source-mining/`.
- Source-state builders in production modules are reused in tests: `createDefaultRegistrySourceState` from `src/modules/registry/public.ts`, `createEmptyBusinessActionSourceState` from `src/modules/business-action/public.ts`, `createEmptyInquirySourceState` from `src/modules/inquiries/public.ts`.
- Answer eval cases and coverage requirements live in `eval/answer/lib/cases.ts` and `eval/answer/lib/coverage.ts`.

## Coverage

**Requirements:** No generic line/branch coverage target is enforced by Vitest config. Coverage is contract-driven.

**View Coverage:**
```bash
npm run test:eval:coverage       # Audit answer eval coverage tags and promptfoo catalog coverage
npm run test:eval:report         # Generate output/eval/answer-suite-report.json
npm run test:graph-freshness     # Verify graph/eval freshness constraints
```

**Contract Coverage Gates:**
- `eval/answer/lib/coverage.ts` requires eval cases to declare coverage tags, expected timing names, timing budgets, public-copy safety, tool-query evidence, and harness assertions.
- `tests/eval/answer-pipeline.test.ts` asserts eval case IDs are unique, required coverage exists, promptfoo config stays in sync, and suite scores clear thresholds.
- `tests/unit/schema/convex-schema.test.ts` asserts every source-owned durable table and required index remains present in `convex/schema.ts`.
- `tests/imports/*.test.ts` and `tests/ui-contract/*.test.ts` act as lint/architecture coverage for import boundaries, TS standards, source-mining, public language, and UI layout.

## Test Types

**Unit Tests:**
- Scope: pure domain functions, source-state transitions, source adapters, schema exports, config helpers, React components under jsdom.
- Location: `tests/unit/**`.
- Approach: direct function calls, in-memory source states, local factories, fake DB/query classes for Convex runtime bridge tests.
- Examples: `tests/unit/catalog/publish.test.ts`, `tests/unit/convex/registry-runtime.test.ts`, `tests/unit/chat/ae-chat-route-promotion.test.tsx`.

**Integration Tests:**
- Scope: route handlers, action/tool APIs, durable route parity, session behavior, source-port flow.
- Location: `tests/integration/**`.
- Approach: construct `Request` objects against handler functions and assert `Response` status/body contracts.
- Examples: `tests/integration/agent-tools-api.test.ts`, `tests/integration/registry-api.test.ts`, `tests/integration/answer-turn-session-auth.test.ts`.

**E2E Tests:**
- Framework: Playwright.
- Scope: public owner routes, inquiry flow, thread-first answer flow, developer discovery, protected action owner flow.
- Location: `tests/e2e/**`.
- Approach: role/label/text assertions, URL assertions, keyboard/focus checks, compact and wide Chromium projects from `playwright.config.ts`.
- Examples: `tests/e2e/public-owner-ui.spec.ts`, `tests/e2e/thread-first.spec.ts`, `tests/e2e/a11y/public-owner-a11y.spec.ts`.

**Deploy Smoke Tests:**
- Framework: Playwright with `playwright.deploy-smoke.config.ts`.
- Location: `tests/deploy-smoke/**`.
- Purpose: deployed-route and provider smoke validation with retained traces on failure.

**Copy and Public Contract Tests:**
- Scope: AE boundary language, unsupported claims, internal vocabulary leakage, public copy posture.
- Location: `tests/copy/**`, `tests/ui-contract/public-language-copy.test.ts`, `tests/seo/**`.
- Product rule: public and assistant-facing copy must not imply booking, charging, dispatch, auto-fulfilment, guaranteed response, availability, quote, or job acceptance outside a human reply.

**Convex Tests:**
- Current pattern: in-memory fake DB/query classes and handler extraction from exported Convex functions, not `convex-test`.
- Location: `tests/unit/convex/**` and `tests/unit/schema/convex-schema.test.ts`.
- Follow `convex/_generated/ai/guidelines.md` before adding Convex implementation tests. `convex-test` is not listed in `package.json`.

## Common Patterns

**Async Testing:**
```typescript
const response = await handleInvokeAgentTool(new Request('https://ae.example/api/agent/tools', init))

expect(response.status).toBe(400)
await expect(response.json()).resolves.toMatchObject({
  kind: 'error',
  code: 'agent_tools_invalid_input',
  retryable: false,
})
```

Used in `tests/integration/agent-tools-api.test.ts`.

**Error Testing:**
```typescript
await expect(import('../../../convex/auth.config')).rejects.toThrow(
  'CLERK_JWT_ISSUER_DOMAIN is required for Convex auth configuration',
)
```

Used in `tests/unit/convex/authz.test.ts`.

**React Testing:**
```typescript
/**
 * @vitest-environment jsdom
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})
```

Use this pattern for component tests under `tests/unit/**/*.test.tsx`.

**Playwright Accessibility Testing:**
```typescript
await page.keyboard.press('Tab')
await expect(page.getByTestId('skip-to-content')).toBeFocused()
await page.keyboard.press('Enter')
await expect(page.locator('#astryx-app-shell-main')).toBeFocused()
```

Used in `tests/e2e/a11y/public-owner-a11y.spec.ts`.

**Convex Runtime Bridge Testing:**
```typescript
const handler = (listPublicBusinessCatalog as unknown as {
  _handler: (ctx: QueryCtx, args: { cursor?: string; limit?: number }) => Promise<unknown>
})._handler

const db = new FakeDb()
seedCatalogs(db, 12)
const page = await handler({ db }, { limit: 2 })
```

Used in `tests/unit/convex/registry-runtime.test.ts`.

---

*Testing analysis: 2026-07-03*
