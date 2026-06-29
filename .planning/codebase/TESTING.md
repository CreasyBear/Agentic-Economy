# Testing Patterns

**Analysis Date:** 2026-06-29

## Test Framework

**Runner:**
- Vitest 4.1.9 for `.test.ts` and `.test.tsx` files under `tests/`, configured in `vitest.config.ts`.
- Playwright 1.61.1 for `.spec.ts` browser and deploy-smoke files under `tests/e2e/` and `tests/deploy-smoke/`, configured in `playwright.config.ts` and `playwright.deploy-smoke.config.ts`.
- TypeScript 6.0.3 typechecking is a required quality gate through `npm run typecheck` in `package.json`.

**Assertion Library:**
- Use Vitest `expect`, `expectTypeOf`, `describe`, and `it`, as in `tests/types/domain-contracts.test.ts`.
- Use Playwright `expect` and role/label locators, as in `tests/e2e/public-owner-ui.spec.ts`.

**Run Commands:**
```bash
npm run test                     # Run all Vitest .test.ts/.test.tsx files
npm run test:unit                # Run tests/unit
npm run test:integration         # Run tests/integration
npm run test:types               # Run tests/types
npm run test:imports             # Run import and route-boundary guardrails in clean mode
npm run test:imports:fixtures    # Run import guardrails against bad fixtures
npm run test:ts-standards        # Run runtime TypeScript standards scan
npm run test:copy                # Run public/phase copy guardrails
npm run test:ui-contract         # Run UI class/status contract guardrails
npm run test:seo                 # Run SEO and discovery file tests
npm run test:e2e                 # Run Playwright E2E tests/e2e
npm run test:e2e:a11y            # Run Playwright accessibility subset
npm run test:deploy-smoke        # Run deployed Phase 1 smoke test
npm run test:all                 # Run typecheck, Convex dry-run codegen, Vitest suites, scans, and build
```

## Test File Organization

**Location:**
- Unit tests live in `tests/unit/` and domain subdirectories such as `tests/unit/catalog/`, `tests/unit/security/`, `tests/unit/convex/`, and `tests/unit/server/`.
- Integration tests live in `tests/integration/` and exercise route handlers plus public seams, such as `tests/integration/registry-api.test.ts`.
- Type contract tests live in `tests/types/`, such as `tests/types/domain-contracts.test.ts`.
- Source guardrail tests live in `tests/imports/`, backed by scanners in `src/lib/ui/contract-scans.ts`.
- UI contract tests live in `tests/ui-contract/` and scan `src/routes/` plus `src/components/ae/`.
- Copy and phase-claim tests live in `tests/copy/`.
- SEO and discovery-output tests live in `tests/seo/`.
- Browser E2E tests live in `tests/e2e/` with accessibility tests in `tests/e2e/a11y/`.
- Deploy smoke tests live in `tests/deploy-smoke/` and use `playwright.deploy-smoke.config.ts`.
- Negative scan fixtures live in `tests/fixtures/`.

**Naming:**
- Use `*.test.ts` for Vitest tests, such as `tests/unit/catalog/publish.test.ts`.
- Use `*.spec.ts` for Playwright tests, such as `tests/e2e/public-owner-ui.spec.ts` and `tests/deploy-smoke/phase1-deploy-smoke.spec.ts`.
- Use `*.fixture` for intentional bad scan inputs under `tests/fixtures/`.

**Structure:**
```text
tests/
├── unit/             # Pure domain, Convex runtime adapters, server seams
├── integration/      # Route handlers plus durable public readbacks
├── types/            # expectTypeOf and @ts-expect-error contracts
├── imports/          # Architecture and TypeScript source scans
├── ui-contract/      # UI class and status presentation scans
├── copy/             # Public copy and phase-claim scans
├── seo/              # SEO, robots, sitemap, llms, UCP tests
├── e2e/              # Local Playwright browser flows
├── deploy-smoke/     # Remote/deployed Playwright smoke checks
└── fixtures/         # Negative scan fixtures
```

## Test Structure

**Suite Organization:**
```typescript
import { describe, expect, it } from 'vitest'

import { assertCsrf, rateLimitClaim } from '@/modules/security/public'

describe('CSRF and rate limit controls', () => {
  it('accepts matching CSRF token/cookie and same-site origin', () => {
    expect(
      assertCsrf({
        csrfToken: 'token',
        csrfCookie: 'token',
        allowedOrigins: ['https://ae.example'],
      })
    ).toEqual({ kind: 'accepted', mode: 'csrf_token' })
  })
})
```

**Patterns:**
- Keep unit tests focused on public module seams such as `src/modules/catalog/public.ts`, `src/modules/security/public.ts`, and `src/modules/observability/public.ts`.
- Use in-memory source-state factories such as `createEmptyBusinessSourceState` from `src/modules/business/public.ts`, `createEmptyCatalogSourceState` from `src/modules/catalog/public.ts`, and `createDefaultRegistrySourceState` from `src/modules/registry/public.ts`.
- Use `brandNonEmpty` from `src/modules/common/ids.ts` for branded IDs in tests, as in `tests/unit/catalog/public-catalog-dto.test.ts`.
- Assert whole result shapes with `toEqual` or `toMatchObject`, and assert absence of private data with `JSON.stringify(...).not.toContain(...)` or `.not.toMatch(...)`, as in `tests/integration/registry-api.test.ts`.
- Use `try`/`finally` around test injection setters so global test seams reset reliably, as in `tests/seo/discovery-files.test.ts`.
- Avoid `.only` and `.skip`; no focused or skipped tests are present under `tests/`.

## Mocking

**Framework:** Hand-rolled fakes and dependency injection are preferred; Vitest `vi` is used narrowly.

**Patterns:**
```typescript
const reset = setPublicRegistryQueryClientForTests({
  list: (input) => Promise.resolve(listPublicBusinessCatalog(state, input)),
  search: (input) => Promise.resolve(searchPublicBusinessCatalog(state, input)),
  detail: (input) => Promise.resolve(getPublicBusinessCatalogBySlug(state, input)),
})

try {
  const response = await handleDurableListBusinessesRequest(new Request('https://ae.example/api/businesses'))
  expect(await response.json()).toMatchObject({ kind: 'ok' })
} finally {
  reset()
}
```

**What to Mock:**
- Mock external query clients through test-only setters such as `setPublicRegistryQueryClientForTests` in `src/routes/api.businesses.ts` and `setPublicDiscoveryQueryClientForTests` in `src/modules/discovery/public.ts`.
- Mock network behavior by passing a `fetch` callback into server seams, as in `tests/unit/server/server-seams.test.ts` for `callSourceMutation`.
- Mock Convex auth/runtime boundaries with small fake DB/context classes, as in `tests/unit/convex/authz.test.ts`.
- Use `vi.stubEnv` only for environment behavior that is itself under test, as in `tests/unit/convex/authz.test.ts`.
- Use Playwright `request.newContext({ storageState })` for deployed authenticated smoke flows in `tests/deploy-smoke/phase1-deploy-smoke.spec.ts`.

**What NOT to Mock:**
- Do not mock the domain function being tested; call public seams such as `publishBusinessCatalog` in `src/modules/catalog/public.ts` directly from tests like `tests/unit/catalog/publish.test.ts`.
- Do not mock route handlers when integration tests can call exported handlers directly, such as `handleDurableListBusinessesRequest` in `src/routes/api.businesses.ts`.
- Do not bypass private-data assertions; tests should prove output omits fields such as owner IDs, source hashes, raw contact values, and provider payloads, as in `tests/seo/discovery-files.test.ts`.

## Fixtures and Factories

**Test Data:**
```typescript
const state = createEmptyBusinessSourceState()
const businessId = brandNonEmpty('business:parramatta', 'BusinessId')

expect(
  publishBusinessCatalog({
    ...state,
    ...createEmptyCatalogSourceState(),
  }, command)
).toMatchObject({ kind: 'ok' })
```

**Location:**
- Domain state factories live with public seams, such as `createEmptyBusinessSourceState` in `src/modules/business/public.ts`, `createEmptyCatalogSourceState` in `src/modules/catalog/public.ts`, and `createDefaultDiscoverySourceState` in `src/modules/discovery/public.ts`.
- Test-local helper functions are placed at the bottom of each test file, as in `tests/integration/claim-publish.test.ts` and `tests/seo/discovery-files.test.ts`.
- Negative scan fixtures live under `tests/fixtures/bad-imports/`, `tests/fixtures/bad-source-mining/`, `tests/fixtures/bad-copy/`, `tests/fixtures/bad-ui-contract/`, and `tests/fixtures/bad-ts-standards/`.

## Coverage

**Requirements:** No coverage threshold or coverage script is detected in `package.json` or `vitest.config.ts`.

**View Coverage:**
```bash
Not configured
```

## Test Types

**Unit Tests:**
- Use `tests/unit/` for pure domain behavior, source-state transitions, Convex runtime adapters, and server-provider seams.
- Use public module APIs where possible, such as `tests/unit/business/claim.test.ts`, `tests/unit/catalog/publish.test.ts`, and `tests/unit/notification-outbox/readback.test.ts`.
- Use direct Convex function tests for runtime bridges under `tests/unit/convex/`, such as `tests/unit/convex/phase1-runtime.test.ts`.

**Integration Tests:**
- Use `tests/integration/` for route handler parity, API readbacks, durable flow behavior, suppression behavior, and cross-surface consistency.
- Call exported route handlers directly with `new Request(...)`, as in `tests/integration/registry-api.test.ts`, `tests/integration/discovery-routes.test.ts`, and `tests/integration/discovery-route-parity.test.ts`.

**Type Contract Tests:**
- Use `tests/types/` for `expectTypeOf`, runtime validator parity, and intentional `@ts-expect-error` invalid-state checks.
- Keep validators and exported literal unions in sync, as in `tests/types/domain-contracts.test.ts`.

**Guardrail Scan Tests:**
- Use `tests/imports/` for import boundaries, source-mining constraints, route boundaries, and TypeScript standards.
- Use `tests/imports/scan-targets.ts` for clean runtime targets and fixture-mode targets controlled by `AE_SCAN_MODE`.
- Use `tests/ui-contract/` for route/component class scans and status presentation contracts.
- Use `tests/copy/` for public copy, phase ownership, and future-capability overclaim tests.

**SEO Tests:**
- Use `tests/seo/` for robots, sitemap, llms, UCP, JSON-LD, noindex, headers, and crawler-safe readbacks.

**E2E Tests:**
- Use Playwright tests under `tests/e2e/` for local browser flows, keyboard/accessibility assertions, and public owner journeys.
- `playwright.config.ts` runs compact and wide Chromium projects and starts `npm run dev` against `http://127.0.0.1:3000`.

**Deploy Smoke Tests:**
- Use `tests/deploy-smoke/` with `playwright.deploy-smoke.config.ts` for deployed-route, provider, and support-record smoke checks.
- Deploy smoke tests validate required environment-derived URLs, storage states, HTTPS-only targets, headers, private-data absence, and provider readbacks.

## Common Patterns

**Async Testing:**
```typescript
await withDiscoveryQueryClient(state, async () => {
  const response = await handleDurableLlmsTxtRequest(new Request('https://ae.example/llms.txt'))
  expect(response.headers.get('Cache-Control')).toBe('no-store')
})
```

**Error Testing:**
```typescript
await expect(
  readRequiredConvexAuthToken({ isAuthenticated: false, getToken: async () => null })
).rejects.toMatchObject({ code: 'missing_auth', status: 401 })
```

**Playwright Testing:**
```typescript
await page.goto('/claim')
await page.getByLabel('Business name').fill('Northside Solar')
await page.getByRole('button', { name: /publish service page/i }).click()
await expect(page.getByLabel('Service category')).toBeFocused()
```

**Scan Testing:**
```typescript
const violations = scanUiContract(
  isFixtureMode() ? fixtureTargets('tests/fixtures/bad-ui-contract') : cleanUiTargets
)

expect(isFixtureMode() ? violations.length > 0 : violations.length === 0).toBe(true)
```

---

*Testing analysis: 2026-06-29*
