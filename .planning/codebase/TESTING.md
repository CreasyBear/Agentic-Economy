# Testing Patterns

**Analysis Date:** 2026-07-03

## Test Framework

**Runner:**
- Vitest 4.1.9 for unit, integration, type-contract, copy, SEO, UI-contract, import, eval, and script tests.
- Config: `vitest.config.ts`
- Playwright 1.61.1 for browser E2E, a11y, and deployed/provider smoke.
- Config: `playwright.config.ts`, `playwright.deploy-smoke.config.ts`
- Promptfoo is part of answer eval validation through `eval/answer/promptfooconfig.yaml`.

**Assertion Library:**
- Vitest `expect`, `expectTypeOf`, `describe`, `it`, `afterEach`, `beforeEach`, and `vi`.
- Testing Library React for jsdom component tests: `@testing-library/react` in `tests/unit/chat/ae-answer-checks.test.tsx`, `tests/unit/inquiries/ae-action-result-card.test.tsx`, `tests/unit/observability/error-boundary-client.test.tsx`.
- Playwright `expect` and role/label-based locators in `tests/e2e/public-owner-ui.spec.ts`, `tests/e2e/a11y/public-owner-a11y.spec.ts`, and `tests/deploy-smoke/phase1-deploy-smoke.spec.ts`.

**Run Commands:**
```bash
npm run test              # Run all Vitest tests matched by vitest.config.ts
npm run test:unit         # Run unit tests under tests/unit
npm run test:integration  # Run integration tests under tests/integration
npm run test:e2e          # Run browser E2E tests under tests/e2e
npm run test:a11y         # Run Playwright accessibility-focused tests
npm run test:eval         # Run answer eval coverage, report, promptfoo eval, and Vitest eval tests
npm run test:all          # Typecheck, Convex codegen dry-run, unit/integration/type/import/copy/SEO/UI/build suite
npm run test:release      # Broader release gate including eval, graph freshness, E2E, a11y, and build
```

Additional focused gates from `package.json`:
```bash
npm run typecheck
npm run check:convex-codegen
npm run test:types
npm run test:imports
npm run test:source-mining
npm run test:ts-standards
npm run test:copy
npm run test:seo
npm run test:ui-contract
npm run test:graph-freshness
npm run test:deploy-smoke
npm run test:phase2-support-smoke
npm run test:provider-smoke:resend
npm run test:provider-smoke:novu
npm run test:provider-smoke:autumn-stripe
npm run test:provider-smoke:business-action-stripe
```

## Test File Organization

**Location:**
- Unit tests live under `tests/unit/<domain>/`: `tests/unit/business/claim.test.ts`, `tests/unit/registry/search-sync.test.ts`, `tests/unit/business-action/stripe-checkout-evidence.test.ts`.
- Integration tests live under `tests/integration/` and call route handlers, server seams, Convex `_handler` functions, or source-port seams directly: `tests/integration/agent-tools-api.test.ts`, `tests/integration/claim-publish.test.ts`, `tests/integration/discovery-route-parity.test.ts`.
- Type-level contract tests live under `tests/types/`: `tests/types/domain-contracts.test.ts`, `tests/types/protected-actions-contracts.test.ts`, `tests/types/business-action-contracts.test.ts`.
- Guardrail tests live under `tests/imports/`, `tests/copy/`, `tests/ui-contract/`, `tests/seo/`, and `tests/scripts/`.
- Browser E2E and a11y tests live under `tests/e2e/` and `tests/e2e/a11y/`.
- Deployed and provider smoke tests live under `tests/deploy-smoke/` and use `playwright.deploy-smoke.config.ts`.
- Shared helpers live under `tests/helpers/`; bad fixtures used to prove guardrail detection live under `tests/fixtures/`.
- Answer eval harness files live under `eval/answer/` and are tested by `tests/eval/answer-pipeline.test.ts`.

**Naming:**
- Use `*.test.ts` for Vitest Node tests and `*.test.tsx` for React component tests.
- Use a file-level `/** @vitest-environment jsdom */` pragma for jsdom component tests, as in `tests/unit/chat/ae-answer-checks.test.tsx`.
- Use `*.spec.ts` for Playwright tests: `tests/e2e/public-owner-ui.spec.ts`, `tests/deploy-smoke/phase6-business-action-stripe-smoke.spec.ts`.
- Name tests after behavior and domain, not implementation details: `registry search sync attempts`, `public owner routes`, `Phase 1 deployed readback smoke`.

**Structure:**
```text
tests/
├── unit/<domain>/*.test.ts[x]          # Pure domain, component, server seam, Convex runtime fakes
├── integration/*.test.ts               # Route/server/source behavior across module boundaries
├── types/*.test.ts                     # expectTypeOf and @ts-expect-error contract tests
├── imports/*.test.ts                   # Module/route/type guardrail scanners
├── copy/*.test.ts                      # Public copy and overclaim scanners
├── ui-contract/*.test.ts               # Visual/token/language contract scanners
├── seo/*.test.ts                       # SEO/AEO/discovery route assertions
├── e2e/**/*.spec.ts                    # Local browser flows and a11y
├── deploy-smoke/*.spec.ts              # Fail-loud deployed/provider proof gates
├── scripts/*.test.ts                   # CLI/script unit tests
├── fixtures/*                          # Bad examples for scan fixture mode
└── helpers/*                           # Source ports, source-write admission, thread test seams
```

## Test Structure

**Suite Organization:**
```typescript
import { describe, expect, it } from 'vitest'

import { brandNonEmpty } from '@/modules/common/ids'
import { claimBusiness, createEmptyBusinessSourceState } from '@/modules/business/public'

describe('claimBusiness', () => {
  it('rejects anonymous claims', () => {
    const state = createEmptyBusinessSourceState()

    const result = claimBusiness(state, {
      actor: { kind: 'anonymous', anonymousBucket: 'ip:masked' },
      facts: validFacts(),
      security: validSecurity('anonymous'),
      operationKey: brandNonEmpty('op:claim:anonymous', 'OperationKey'),
      correlationId: brandNonEmpty('corr:anonymous', 'CorrelationId'),
      now: 1,
    })

    expect(result).toMatchObject({
      kind: 'error',
      code: 'claim_unauthenticated',
      retryable: false,
    })
    expect(state.businesses).toEqual([])
  })
})
```
Use this pure-domain pattern from `tests/unit/business/claim.test.ts` for state-machine logic.

**Patterns:**
- Arrange a source state or fake adapter, call the public seam, assert the result contract and source-state side effects. Examples: `tests/unit/business/claim.test.ts`, `tests/unit/registry/search-sync.test.ts`, `tests/unit/inquiries/inquiry-flow.test.ts`.
- For route/API tests, construct real `Request` objects and call exported handlers directly. Examples: `tests/integration/agent-tools-api.test.ts`, `tests/seo/discovery-files.test.ts`, `tests/unit/server/server-seams.test.ts`.
- For TanStack server functions and Convex runtime exports, reach `_handler` only in tests and wrap it with typed fake context objects. Examples: `tests/unit/convex/registry-runtime.test.ts`, `tests/integration/admin-runtime.test.ts`, `tests/integration/suppression-runtime.test.ts`.
- For React unit tests, render with Testing Library, clean up in `afterEach`, and assert accessible text/roles/links rather than snapshots. Examples: `tests/unit/chat/ae-answer-checks.test.tsx`, `tests/unit/inquiries/ae-inquiry-origin-ui.test.tsx`.
- For Playwright, use role and label locators, assert user-visible copy, URL transitions, focus movement, and private/future-surface absence. Examples: `tests/e2e/public-owner-ui.spec.ts`, `tests/e2e/a11y/public-owner-a11y.spec.ts`.

## Mocking

**Framework:** Vitest `vi`, local fake DB classes, explicit source-port injection, and Playwright request/browser contexts.

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
Use this module-mock pattern from `tests/unit/registry/registry-fallback.test.ts` only at adapter boundaries.

```typescript
export async function withRegistrySourcePortForTest(
  state: RegistrySourceState,
  run: () => Promise<void>
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
Prefer source-port injection from `tests/helpers/source-ports.ts` when exercising route/API behavior with controlled source state.

```typescript
const listHandler = (listPublicBusinessCatalog as unknown as {
  _handler: (ctx: QueryCtx, args: { cursor?: string; limit?: number }) => Promise<unknown>
})._handler
```
Use typed `_handler` extraction for Convex runtime tests, paired with local `FakeDb`/`FakeQuery` implementations as in `tests/unit/convex/registry-runtime.test.ts`.

**What to Mock:**
- External transport and provider boundaries: Convex HTTP source calls, Stripe/Autumn/Resend/Novu provider adapters, PostHog/Sentry where needed.
- Browser globals only in jsdom tests and reset them after each test: `vi.stubGlobal('fetch', ...)` in `tests/unit/chat/ae-follow-up-chips.test.tsx`, `vi.spyOn(globalThis, 'fetch')` in `tests/unit/answer/answer-tool-use-agent.test.ts`.
- Test-only source ports: registry, discovery, answer-thread ports, and catalog search ports.
- Time and env only through narrow setup/cleanup blocks. Example: `tests/unit/registry/registry-fallback.test.ts` saves and restores `process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E`.

**What NOT to Mock:**
- Do not mock pure domain functions under test. Use real state factories and assert resulting state.
- Do not mock public copy scanners or guardrail scanners when testing contracts in `tests/imports`, `tests/copy`, or `tests/ui-contract`.
- Do not replace deploy/provider smokes with env-var presence, screenshots, dashboard state, return URL arrival, or webhook arrival alone. The smoke tests under `tests/deploy-smoke/` require source-owned deployed readback IDs and fail loudly when inputs are absent.
- Do not mock route boundaries in browser E2E; use the local Playwright dev server configured in `playwright.config.ts` with `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E=true`.

## Fixtures and Factories

**Test Data:**
```typescript
function validFacts() {
  return {
    name: 'Parramatta Emergency Plumbing',
    category: 'Emergency plumbing',
    suburb: 'Parramatta',
    stateTerritory: 'NSW',
    requestedSlug: 'parramatta-emergency-plumbing',
    sourceRefs: [
      {
        label: 'Owner supplied',
        evidenceRef: 'private:evidence:1',
        sourceHash: brandNonEmpty('hash:source:1', 'SourceHash'),
      },
    ],
  }
}
```
Use local helper factories close to the tests, as in `tests/unit/business/claim.test.ts`, when the fixture is specific to one behavior.

**Location:**
- Domain source-state constructors live in module public seams: `createEmptyBusinessSourceState` in `src/modules/business/public.ts`, `createEmptyCatalogSourceState` in `src/modules/catalog/public.ts`, `createDefaultRegistrySourceState` in `src/modules/registry/public.ts`, `createDefaultDiscoverySourceState` in `src/modules/discovery/public.ts`.
- Cross-test helper fixtures live in `tests/helpers/`: `tests/helpers/source-write-admission.ts`, `tests/helpers/source-ports.ts`, `tests/helpers/answer-thread-test-port.ts`.
- Negative scan fixtures live under `tests/fixtures/bad-*` and are selected with `AE_SCAN_MODE=fixtures`.
- Eval case catalogs and broad registry seed live under `eval/answer/lib/cases.ts` and `eval/answer/lib/registry-seed.ts`.
- Browser artifacts are written under `output/playwright/`, as in `tests/e2e/public-owner-ui.spec.ts`.

## Coverage

**Requirements:** No line/branch coverage threshold is configured in `vitest.config.ts`. Coverage is enforced through behavior gates, type guards, scan fixtures, eval coverage, graph freshness, Playwright E2E/a11y, and fail-loud deployed/provider smokes.

**View Coverage:**
```bash
npm run test:eval:coverage     # Audits answer-eval case coverage and promptfoo sync
npm run test:graph-freshness   # Verifies graph artifacts are fresh for graph-relevant source changes
npm run test:release           # Broadest local release gate in package.json
```

The answer eval coverage auditor in `eval/answer/lib/coverage.ts` fails when required dimensions lack cases, cases lack timing/evidence/copy assertions, promptfoo diverges from the shared catalog, broad seed counts fall below requirements, or public projections expose private harness evidence. `tests/eval/answer-pipeline.test.ts` asserts the suite report passes the 9/10 product-score threshold.

## Test Types

**Unit Tests:**
- Scope: pure domain commands, source-state mutation, validators, projections, adapters, UI components, server seams, Convex runtime functions with fake DBs.
- Approach: instantiate in-memory source state, call module public seams or extracted `_handler`s, assert exact result contracts and state deltas.
- Examples: `tests/unit/business/claim.test.ts`, `tests/unit/catalog/publish.test.ts`, `tests/unit/observability/operation-keys.test.ts`, `tests/unit/convex/inquiries-runtime.test.ts`, `tests/unit/chat/ae-answer-checks.test.tsx`.

**Integration Tests:**
- Scope: route handlers, TanStack route loaders, source-port injection, API/agent-tool payloads, source-backed route readbacks, suppression/admin flows, answer turn orchestration.
- Approach: call exported handlers/functions with real `Request` objects and controlled ports/fake contexts; avoid browser unless layout, focus, or navigation matters.
- Examples: `tests/integration/agent-tools-api.test.ts`, `tests/integration/registry-api.test.ts`, `tests/integration/discovery-route-parity.test.ts`, `tests/integration/business-action-route-readbacks.test.ts`.

**E2E Tests:**
- Framework: Playwright.
- Scope: local user-visible flows, public/owner/admin navigation, form validation/focus, inquiry/protected-action flows, discovery, answer thread continuity, a11y keyboard/focus checks.
- Config: `playwright.config.ts` runs compact 375x812 and wide 1440x1100 Chromium projects and starts `npm run dev -- --port 3020 --strictPort --host 127.0.0.1` with local Clerk bypass.
- Examples: `tests/e2e/public-owner-ui.spec.ts`, `tests/e2e/thread-first.spec.ts`, `tests/e2e/a11y/public-owner-a11y.spec.ts`.

**Deploy/Provider Smoke Tests:**
- Framework: Playwright with `playwright.deploy-smoke.config.ts`.
- Scope: deployed route readback, real storage-state sessions, provider smoke evidence, and source-owned proof refs.
- These tests fail when required env/source inputs are missing and must not be treated as optional skips. Examples: `tests/deploy-smoke/phase1-deploy-smoke.spec.ts`, `tests/deploy-smoke/phase2-resend-dispatch-smoke.spec.ts`, `tests/deploy-smoke/phase6-business-action-stripe-smoke.spec.ts`.

**Guardrail Tests:**
- Import and boundary scans: `tests/imports/private-imports.test.ts`, `tests/imports/route-boundary.test.ts`, `tests/imports/source-mining.test.ts`.
- Type standards: `tests/imports/ts-standards.test.ts`.
- Copy and overclaim scans: `tests/copy/phase1-banned-copy.test.ts`, `tests/copy/discovery-overclaim.test.ts`, `tests/copy/phase6-business-action-claims.test.ts`.
- UI contract scans: `tests/ui-contract/class-scan.test.ts`, `tests/ui-contract/public-language-copy.test.ts`, `tests/ui-contract/public-layout-contract.test.ts`.
- SEO/AEO: `tests/seo/discovery-files.test.ts`, `tests/seo/public-business-seo.test.ts`, `tests/seo/business-action-claims.test.ts`.

## Common Patterns

**Async Testing:**
```typescript
await withRegistrySourcePortForTest(state, async () => {
  const response = await handleInvokeAgentTool(
    new Request('https://ae.example/api/agent/tools', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tool: 'registry.search',
        input: { query: 'parramatta' },
      }),
    })
  )

  expect(response.status).toBe(200)
  await expect(response.json()).resolves.toMatchObject({ kind: 'ok' })
})
```
Use this pattern from `tests/integration/agent-tools-api.test.ts` for API/route-handler behavior.

**Error Testing:**
```typescript
expect(result).toMatchObject({
  kind: 'error',
  code: 'claim_rate_limited',
  retryable: true,
})
expect(state.businesses).toHaveLength(1)
```
Assert the error contract and the absence or exact shape of side effects, as in `tests/unit/business/claim.test.ts`.

**Guardrail Fixture Mode:**
```typescript
const violations = scanTypeScriptStandards(
  isFixtureMode() ? fixtureTargets('tests/fixtures/bad-ts-standards') : cleanRuntimeTargets()
)

if (isFixtureMode()) {
  expect(violations.map((violation) => violation.rule)).toEqual(
    expect.arrayContaining(['explicit-any', 'non-null-assertion'])
  )
  return
}

expect(violations).toEqual([])
```
Use clean mode and fixture mode together so the scanner proves both runtime compliance and bad-example detection. Examples: `tests/imports/ts-standards.test.ts`, `tests/copy/phase1-banned-copy.test.ts`, `tests/ui-contract/class-scan.test.ts`.

**Playwright Testing:**
```typescript
await page.goto('/claim')
await page.getByLabel('Business name').fill('Northside Solar')
await page.getByRole('button', { name: /publish service page/i }).click()
await expect(page.getByLabel('Service category')).toBeFocused()
await expect(page.getByText('Service category is required.')).toBeVisible()
```
Use roles, labels, headings, URL assertions, and focus checks. Avoid brittle CSS selectors except when checking structural overflow or explicit ids such as `#astryx-app-shell-main`.

**A11y Testing:**
```typescript
await page.keyboard.press('Tab')
await expect(page.getByTestId('skip-to-content')).toBeFocused()
await page.keyboard.press('Enter')
await expect(page.locator('#astryx-app-shell-main')).toBeFocused()
```
Use keyboard navigation, persistent labels, `aria-invalid`, disabled states, no-horizontal-overflow checks, and visible focus assertions as in `tests/e2e/a11y/public-owner-a11y.spec.ts`.

**Convex Runtime Testing:**
- Use local fake DBs to assert indexed reads, bounded `take()`, and no broad table scans. `tests/unit/convex/registry-runtime.test.ts` traces reads and asserts `unscopedCollects(db.reads)` is empty.
- Keep tests aligned with `convex/_generated/ai/guidelines.md`: validators on Convex functions, indexes named for fields, bounded collections, server-derived auth, and no direct DB access in actions.
- The repo does not use `convex-test` despite the generated Convex guideline recommending it; current Convex tests use `_handler` extraction plus typed fake contexts.

**Type Contract Testing:**
```typescript
expectTypeOf<z.infer<typeof PublicStatusSchema>>().toEqualTypeOf<PublicStatus>()

// @ts-expect-error broad live state is not a valid public status
const invalidPublicStatus: PublicStatus = 'live'
void invalidPublicStatus
```
Use `expectTypeOf` and `@ts-expect-error` together to protect exact unions, as in `tests/types/domain-contracts.test.ts`.

---

*Testing analysis: 2026-07-03*
