# Testing Patterns

**Analysis Date:** 2026-06-30

## Test Framework

**Runner:**
- Vitest `4.1.9` for unit, integration, type, import/source, copy, SEO, and UI-contract tests.
- Config: `vitest.config.ts`
- Playwright `1.61.1` for E2E, a11y, and deploy-smoke tests.
- Config: `playwright.config.ts` and `playwright.deploy-smoke.config.ts`

**Assertion Library:**
- Vitest `expect`, `expectTypeOf`, `toMatchObject`, `toEqual`, `rejects`, and `resolves` in `tests/**/*.test.ts`.
- Playwright `expect` and role/label locators in `tests/**/*.spec.ts`.

**Run Commands:**
```bash
npm run test                 # Run all Vitest tests matching vitest.config.ts
npm run test:unit            # Run tests/unit
npm run test:integration     # Run tests/integration
npm run test:types           # Run tests/types
npm run test:imports         # Run import/private-route-boundary guardrails in clean mode
npm run test:copy            # Run public copy claim guardrails in clean mode
npm run test:seo             # Run SEO/AEO contract tests
npm run test:ui-contract     # Run UI class/copy contract scans in clean mode
npm run test:e2e             # Run Playwright tests/e2e with compact and wide Chromium projects
npm run test:e2e:a11y        # Run Playwright accessibility-focused specs
npm run test:deploy-smoke    # Run env-gated deployed readback smoke
npm run test:all             # Typecheck, Convex codegen check, focused suites, and build
```

## Test File Organization

**Location:**
- Unit tests live in `tests/unit/**` and mirror domain ownership: `tests/unit/business`, `tests/unit/catalog`, `tests/unit/discovery`, `tests/unit/convex`, `tests/unit/server`, and similar.
- Integration tests live in `tests/integration/**` and exercise route handlers, source-port overrides, public API DTOs, and cross-surface parity.
- Type contract tests live in `tests/types/**`.
- Import/source-mining guardrail tests live in `tests/imports/**`.
- UI class/copy contract tests live in `tests/ui-contract/**`.
- Public copy claim tests live in `tests/copy/**`.
- SEO/AEO tests live in `tests/seo/**`.
- Playwright browser tests live in `tests/e2e/**`; accessibility-specific browser tests live in `tests/e2e/a11y/**`.
- Deploy smoke tests live in `tests/deploy-smoke/**`.
- Bad-example fixtures for scanner proof live in `tests/fixtures/**`.
- Shared test helpers live in `tests/helpers/**`.

**Naming:**
- Vitest files use `*.test.ts` / `*.test.tsx`: examples include `tests/unit/business/claim.test.ts`, `tests/integration/registry-api.test.ts`, and `tests/imports/ts-standards.test.ts`.
- Playwright files use `*.spec.ts`: examples include `tests/e2e/public-owner-ui.spec.ts` and `tests/deploy-smoke/phase1-deploy-smoke.spec.ts`.
- Fixture files use `.fixture` without test suffixes, such as `tests/fixtures/bad-ui-contract/route-styles.fixture`.

**Structure:**
```text
tests/
├── unit/              # Pure domain, Convex runtime bridge, server seam tests
├── integration/       # Route handlers, source-port parity, public API/readback tests
├── types/             # expectTypeOf and @ts-expect-error contract tests
├── imports/           # Scanner tests for imports, source-mining, TS standards
├── ui-contract/       # Scanner tests for AE UI class/copy contracts
├── copy/              # Claim/copy guardrails by phase
├── seo/               # SEO, discovery file, robots/sitemap/llms contracts
├── e2e/               # Browser flows and a11y specs
├── deploy-smoke/      # Env-gated deployed route/readback checks
├── fixtures/          # Bad fixtures proving scanners fail correctly
└── helpers/           # Reusable source-port and source-write helpers
```

The repo contains 100 test/spec files under `tests/**`, totaling 21,642 lines in the scanned set.

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

    expect(result).toMatchObject({ kind: 'error', code: 'claim_unauthenticated', retryable: false })
    expect(state.businesses).toEqual([])
  })
})
```

**Patterns:**
- Arrange with explicit source state factories such as `createEmptyBusinessSourceState()` from `src/modules/business/public.ts` and `createEmptyCatalogSourceState()` from `src/modules/catalog/public.ts`.
- Use command objects with branded IDs via `brandNonEmpty()` from `src/modules/common/ids.ts`.
- Assert public shape with `toMatchObject` and exact absence with `not.toContain` / `not.toMatch`.
- Use helper factories at the bottom of test files for domain-specific fixtures, as in `tests/unit/business/claim.test.ts` and `tests/seo/discovery-files.test.ts`.
- Use `try/finally` around mutable source-port or env overrides so tests reset state, as in `tests/helpers/source-ports.ts` and `tests/unit/server/server-seams.test.ts`.

## Mocking

**Framework:** Vitest `vi` plus explicit dependency injection

**Patterns:**
```typescript
const reset = setPublicRegistrySourcePortForTests({
  list: (input) => Promise.resolve(listPublicBusinessCatalog(state, input)),
  search: (input) => Promise.resolve(searchPublicBusinessCatalog(state, input)),
  detail: (input) => Promise.resolve(getPublicBusinessCatalogBySlug(state, input)),
})

try {
  // exercise route/client behavior
} finally {
  reset()
}
```

```typescript
vi.mock('@/modules/business-action/business-action.functions', () => ({
  admitBusinessActionStripeWebhookThroughSource: vi.fn(),
}))

const mockedAdmitBusinessActionStripeWebhookThroughSource = vi.mocked(admitBusinessActionStripeWebhookThroughSource)

beforeEach(() => {
  mockedAdmitBusinessActionStripeWebhookThroughSource.mockReset()
})
```

**What to Mock:**
- Mock boundary transport, external providers, fetch, env, and source ports. Examples: fake `fetch` in `tests/unit/server/server-seams.test.ts`, `setPublicRegistrySourcePortForTests` in `tests/integration/registry-api.test.ts`, and `vi.mock` for webhook forwarding in `tests/unit/business-action/stripe-checkout-evidence.test.ts`.
- Use fake Convex DB/query/auth contexts when testing helpers directly, as in `tests/unit/convex/authz.test.ts`.
- Use `vi.stubEnv` for module import/env failure checks and call `vi.unstubAllEnvs()`.

**What NOT to Mock:**
- Do not mock the domain operation under test. Unit tests call real public seams such as `claimBusiness`, `publishBusinessCatalog`, `regenerateDiscoveryManifest`, `recordAuthorizationCheckpoint`, and `validateAuditEvent`.
- Do not mock route redaction or public DTO builders when the test purpose is leak prevention; assert against serialized output instead.
- Do not bypass scanner logic in guardrail tests; run clean targets and bad fixtures through the same scanner functions in `src/lib/ui/contract-scans.ts`.

## Fixtures and Factories

**Test Data:**
```typescript
function validSecurity(key: string) {
  return {
    csrf: {
      csrfToken: `csrf-${key}`,
      csrfCookie: `csrf-${key}`,
      allowedOrigins: ['https://ae.example'],
    },
    rateLimit: rateLimit(key),
  }
}
```

**Location:**
- Domain fixture factories are usually local helper functions in the same test file, such as `validFacts()` in `tests/unit/business/claim.test.ts` and `createDurablePublishedDiscoveryState()` in `tests/seo/discovery-files.test.ts`.
- Reusable source-port helpers live in `tests/helpers/source-ports.ts`.
- Source-write admission helpers live in `tests/helpers/source-write-admission.ts`.
- Negative scanner fixtures live in `tests/fixtures/bad-ts-standards`, `tests/fixtures/bad-imports`, `tests/fixtures/bad-source-mining`, `tests/fixtures/bad-copy`, and `tests/fixtures/bad-ui-contract`.

## Coverage

**Requirements:** No numeric coverage threshold or coverage reporter is configured in `package.json` or `vitest.config.ts`.

**View Coverage:**
```bash
# Not detected: no configured npm coverage script.
```

**Practical Coverage Standard:**
- Use targeted suites rather than percentage coverage. `.planning/ENGINEERING-STANDARDS.md` requires typecheck, Convex codegen check, unit, integration, E2E, a11y, copy, imports, source-mining, types, TS standards, SEO, and build gates.
- For narrow domain changes, add focused unit tests in `tests/unit/<domain>/**`.
- For route/readback changes, add integration tests in `tests/integration/**` and browser tests in `tests/e2e/**` when behavior is user-visible.
- For type/status/validator changes, add or update `tests/types/**` and domain validator tests.
- For UI/copy/SEO/public-output changes, add or update `tests/ui-contract/**`, `tests/copy/**`, and `tests/seo/**`.

## Test Types

**Unit Tests:**
- Scope: pure domain state machines, validator equality, redaction, audit, operation keys, Convex auth helpers, and server seam helpers.
- Examples: `tests/unit/business/claim.test.ts`, `tests/unit/catalog/publish.test.ts`, `tests/unit/observability/audit-redaction.test.ts`, `tests/unit/convex/authz.test.ts`, and `tests/unit/server/server-seams.test.ts`.

**Integration Tests:**
- Scope: route handlers, source-port overrides, durable readbacks, public API parity, suppression behavior, and cross-surface DTO consistency.
- Examples: `tests/integration/registry-api.test.ts`, `tests/integration/discovery-route-parity.test.ts`, `tests/integration/business-action-route-readbacks.test.ts`, and `tests/integration/admin-runtime.test.ts`.

**E2E Tests:**
- Framework: Playwright.
- Scope: public owner flows, registry search, claim submission, owner/admin readbacks, developer discovery, protected action flows, keyboard focus, compact/wide layouts, and private/future-copy leak assertions.
- Examples: `tests/e2e/public-owner-ui.spec.ts`, `tests/e2e/protected-action-owner-flow.spec.ts`, and `tests/e2e/a11y/public-owner-a11y.spec.ts`.

**Type Contract Tests:**
- Use `expectTypeOf` and `@ts-expect-error` in `tests/types/domain-contracts.test.ts`, `tests/types/protected-actions-contracts.test.ts`, and `tests/types/business-action-contracts.test.ts`.

**Import/Scanner Tests:**
- `tests/imports/ts-standards.test.ts` enforces runtime TypeScript safety.
- `tests/imports/private-imports.test.ts` enforces module public seams.
- `tests/imports/route-boundary.test.ts` keeps routes as adapters.
- `tests/imports/source-mining.test.ts` and `tests/imports/backup-imports.test.ts` prevent future-surface and backup-source drift.

**Copy/SEO/UI Contract Tests:**
- `tests/copy/**` prevents unsupported capability claims and public overclaims.
- `tests/seo/**` verifies canonical metadata, robots/sitemap/llms behavior, schema safety, noindex rules, and prompt-injection handling.
- `tests/ui-contract/**` scans class names and public language contracts.

**Deploy Smoke Tests:**
- `tests/deploy-smoke/**` are env-gated Playwright API/browser checks for deployed routes, headers, storage-state auth, provider readbacks, and non-secret evidence.
- `playwright.deploy-smoke.config.ts` disables retries and uses the `deploy-smoke` project without a local web server.

## Common Patterns

**Async Testing:**
```typescript
await expect(
  callSourceMutation(sourceMutation<{ value: string }, string>('test:mutation'), { value: 'publish' }, options)
).resolves.toBe('stored')
```

**Error Testing:**
```typescript
await expect(readRequiredConvexAuthToken({ isAuthenticated: false, getToken: async () => null }))
  .rejects.toMatchObject({ code: 'missing_auth', status: 401 })
```

**Leak Testing:**
```typescript
const serialized = JSON.stringify({ registry, list, search, detail })
expect(serialized).not.toMatch(/businessId|serviceId|ownerId|clerk|sourceHash|rawContact|admin|private:evidence/i)
```

**Scanner Fixture Testing:**
```typescript
const violations = scanTypeScriptStandards(
  isFixtureMode() ? fixtureTargets('tests/fixtures/bad-ts-standards') : cleanRuntimeTargets()
)

if (isFixtureMode()) {
  expect(violations.map((violation) => violation.rule)).toEqual(expect.arrayContaining(['explicit-any']))
  return
}

expect(violations).toEqual([])
```

**Playwright Testing:**
```typescript
await page.goto('/registry')
await expect(page.getByLabel('Business, service, or place')).toBeVisible()
await page.getByRole('button', { name: /^search businesses$/i }).click()
await expect(page).toHaveURL(/q=emergency\+plumber\+parramatta/)
```

---

*Testing analysis: 2026-06-30*
