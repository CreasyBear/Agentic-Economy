# Testing Patterns

**Analysis Date:** 2026-07-04

## Test Framework

**Runner:**
- Vitest 4.1.9 for unit, integration, type-contract, copy, import, SEO, UI-contract, eval, script, spike, and dev-smoke tests.
- Playwright 1.61.1 for browser E2E, accessibility checks, and deploy-smoke checks.
- Config: `vitest.config.ts`, `playwright.config.ts`, `playwright.deploy-smoke.config.ts`.

**Assertion Library:**
- Vitest `expect`, `expectTypeOf`, `describe`, `it`, `test`, lifecycle hooks, and `vi` mocks.
- Playwright `expect` and role/label locators from `@playwright/test`.
- React Testing Library `render`, `screen`, `fireEvent`, `cleanup`, and `waitFor` for component tests with per-file jsdom pragmas.

**Run Commands:**
```bash
npm test                       # Run all Vitest tests matched by vitest.config.ts
npm run test:unit              # Run tests/unit
npm run test:integration       # Run tests/integration
npm run test:types             # Run tests/types
npm run test:imports           # Run import boundary guardrails in clean mode
npm run test:copy              # Run public/assistant copy guardrails in clean mode
npm run test:ui-contract       # Run UI class/copy contract tests in clean mode
npm run test:seo               # Run tests/seo
npm run test:e2e               # Run Playwright tests/e2e
npm run test:a11y              # Run Playwright tests/e2e/a11y
npm run test:all               # Typecheck, Convex codegen check, major Vitest suites, and build
npm run test:release           # Release gate with typecheck, Convex codegen, eval, graph freshness, E2E, a11y, and build
```

## Test File Organization

**Location:**
- Unit tests live under `tests/unit/<domain>/*`, mirroring source domains such as `tests/unit/registry/search-documents.test.ts`, `tests/unit/inquiries/inquiry-flow.test.ts`, `tests/unit/convex/registry-runtime.test.ts`.
- Integration tests live under `tests/integration/*` and call route handlers, server seams, and cross-module flows directly, for example `tests/integration/agent-tools-api.test.ts` and `tests/integration/discovery-routes.test.ts`.
- Browser tests live under `tests/e2e/*` and `tests/e2e/a11y/*`.
- Deploy smoke tests live under `tests/deploy-smoke/*.spec.ts` and use `playwright.deploy-smoke.config.ts`.
- Guardrail suites live under `tests/imports`, `tests/copy`, `tests/ui-contract`, `tests/types`, `tests/seo`, and `tests/eval`.
- Test helpers live under `tests/helpers/*`; negative fixtures live under `tests/fixtures/bad-*`.

**Naming:**
- Vitest files use `*.test.ts` or `*.test.tsx`.
- Playwright files use `*.spec.ts`.
- Spike tests use `*.spike.test.ts`, for example `tests/spike/handshake-convex-runtime.spike.test.ts`.
- Component tests that need DOM include `/** @vitest-environment jsdom */` at the top of the test file, for example `tests/unit/chat/ae-follow-up-chips.test.tsx`.

**Structure:**
```text
tests/
├── unit/<domain>/*.test.ts(x)       # Pure functions, components, Convex runtime shims
├── integration/*.test.ts            # Route/server/domain integration
├── e2e/*.spec.ts                    # Playwright browser flows
├── e2e/a11y/*.spec.ts               # Keyboard, focus, layout, a11y checks
├── deploy-smoke/*.spec.ts           # Deployed/provider smoke tests
├── imports/*.test.ts                # Boundary and TypeScript standard scans
├── copy/*.test.ts                   # Boundary-honest copy scans
├── ui-contract/*.test.ts            # UI styling/copy contract scans
├── types/*.test.ts                  # Runtime/schema/type alignment
├── seo/*.test.ts                    # SEO/AEO and public JSON-LD safety
├── eval/*.test.ts                   # Answer pipeline/eval graph checks
├── helpers/*.ts                     # Reusable test helpers
└── fixtures/bad-*                   # Negative fixture inputs for scan modes
```

## Test Structure

**Suite Organization:**
```typescript
import { describe, expect, it } from 'vitest'

import {
  buildRegistrySearchDocumentsForCatalog,
  documentMatchesRegistryQuery,
} from '@/modules/registry/internal/search-documents'

describe('registry search documents', () => {
  it('keeps local location matching literal', () => {
    const [document] = buildRegistrySearchDocumentsForCatalog(catalog())
    if (document === undefined) {
      throw new Error('expected search document')
    }

    expect(documentMatchesRegistryQuery(document, { query: 'Emergency plumber Parramatta' })).toBe(true)
    expect(documentMatchesRegistryQuery(document, { query: 'Emergency plumber Brunswick' })).toBe(false)
  })
})
```

**Patterns:**
- Prefer behavior names in `describe` and `it` blocks: `describe('GET /api/agent/tools')`, `it('refuses unsigned inquiry.submit with signature step-up instead of failing open to a write')`.
- Build realistic fixtures with local helper functions at the bottom of the test file, as in `catalog()` and `service()` in `tests/unit/registry/search-documents.test.ts`.
- Throw explicit `Error` for impossible fixture setup before assertions; do not let `undefined` flow into test assertions.
- For route integration, call exported route handlers with real `Request` objects and assert `Response` status, headers, and JSON body, as in `tests/integration/agent-tools-api.test.ts`.
- For Playwright, prefer role/label/test-id locators over brittle selectors, as in `tests/e2e/public-owner-ui.spec.ts` and `tests/e2e/a11y/public-owner-a11y.spec.ts`.

## Mocking

**Framework:** Vitest `vi` and Playwright built-ins

**Patterns:**
```typescript
import { describe, expect, it, vi } from 'vitest'

const dnsLookupMock = vi.hoisted(() =>
  vi.fn(async () => [{ address: '93.184.216.34', family: 4 }])
)

vi.mock('node:dns/promises', () => ({
  lookup: dnsLookupMock,
}))
```

```typescript
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function stubDeterministicChips() {
  vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ llmChipsEnabled: false })))
}
```

**What to Mock:**
- Mock network and DNS boundaries with injected dependencies or `vi.mock`, as in `tests/unit/storefront/import-draft.test.ts` and `tests/unit/capabilities/check-engine.test.ts`.
- Stub environment variables with `vi.stubEnv` / `vi.unstubAllEnvs`, as in `tests/integration/discovery-routes.test.ts`.
- Stub global `fetch` in component or answer-flow tests only when the test is about UI behavior rather than transport, as in `tests/unit/chat/ae-follow-up-chips.test.tsx`.
- Mock route/UI dependencies for isolated component-route promotion tests, as in `tests/unit/chat/ae-chat-route-promotion.test.tsx`.

**What NOT to Mock:**
- Do not mock domain state machines when testing their contracts; use real functions from `src/modules/*/public.ts` or internals under test.
- Do not mock route handlers in integration tests; call exported `handle*` functions and inspect real responses.
- Do not mock public copy boundaries. Scan real files through `src/lib/ui/contract-scans.ts` in clean mode and use `tests/fixtures/bad-*` only for negative fixture mode.
- Do not imply production provider proof in tests unless the deploy-smoke or provider-specific test actually exercises it.

## Fixtures and Factories

**Test Data:**
```typescript
function sourceWriteAdmission(
  scope: SourceWriteAdmissionScope,
  operationKey: string,
  correlationId: string = operationKey,
): SourceWriteAdmission {
  installTestSourceWriteSecret()

  return createSourceWriteAdmission({
    scope,
    operationKey,
    correlationId,
    request: {
      method: 'POST',
      origin: 'https://ae.example',
      pathname: '/__test/source-write',
      bodyDigest: sourceWriteBodyDigest(undefined),
    },
  })
}
```

```typescript
function createDurablePublishedDiscoveryState(input: {
  businessName: string
  requestedSlug: string
  serviceName: string
  serviceQuery: string
  suburb: string
}): DiscoverySourceState {
  const state = emptyDiscoverySourceState()
  const claim = claimBusiness(state, { /* domain-shaped fixture command */ })
  if (claim.kind === 'error') {
    throw new Error(`Expected durable claim fixture to publish: ${claim.reason}`)
  }
  return state
}
```

**Location:**
- Shared admission helpers: `tests/helpers/source-write-admission.ts`.
- Answer-thread helper port: `tests/helpers/answer-thread-test-port.ts`.
- OpenRouter contract server helper: `tests/helpers/openrouter-contract-server.ts`.
- Negative scan fixtures: `tests/fixtures/bad-copy`, `tests/fixtures/bad-imports`, `tests/fixtures/bad-source-mining`, `tests/fixtures/bad-ts-standards`, `tests/fixtures/bad-ui-contract`.
- File-local factories are common for domain-shaped records: `tests/unit/registry/search-documents.test.ts`, `tests/integration/discovery-routes.test.ts`, `tests/unit/chat/ae-follow-up-chips.test.tsx`.

## Coverage

**Requirements:** No global Vitest line/branch threshold is detected.
- Release confidence is command-composed through `package.json` scripts, especially `test:all` and `test:release`.
- Answer eval coverage has a bespoke audit command: `npm run test:eval:coverage`, implemented by `eval/answer/scripts/audit-coverage.ts`.
- Graph freshness has a bespoke command: `npm run test:graph-freshness`, implemented by `tests/scripts/assert-graph-fresh.ts`.
- Guardrail coverage depends on clean scans plus fixture scans. For import/copy/UI standards, run both the normal command and the `:fixtures` variant when changing scanner rules.

**View Coverage:**
```bash
npm run test:eval:coverage       # Answer eval case/turn/thread coverage audit
npm run test:graph-freshness     # Planning graph freshness assertion
npm run test:copy:fixtures       # Proves copy scanner catches negative fixtures
npm run test:imports:fixtures    # Proves import scanner catches negative fixtures
npm run test:ui-contract:fixtures # Proves UI scanner catches negative fixtures
```

## Test Types

**Unit Tests:**
- Scope pure domain behavior, state machines, React components, observability helpers, source-write admission, Convex runtime shims, and schema/type contracts.
- Examples: `tests/unit/inquiries/inquiry-flow.test.ts`, `tests/unit/registry/search-documents.test.ts`, `tests/unit/http/security-headers.test.ts`, `tests/unit/chat/ae-provider-card.test.tsx`, `tests/unit/convex/registry-runtime.test.ts`.

**Integration Tests:**
- Scope route handlers, server seams, answer turns, public registry/discovery parity, source admission, and cross-module contract behavior without a browser.
- Examples: `tests/integration/agent-tools-api.test.ts`, `tests/integration/registry-api.test.ts`, `tests/integration/discovery-routes.test.ts`, `tests/integration/answer-turn-session-auth.test.ts`.

**E2E Tests:**
- Playwright covers public/owner/admin user flows, inquiry flows, chat discovery loops, developer discovery, protected-action owner flow, and responsive compact/wide projects.
- Config `playwright.config.ts` runs `compact-chromium` at 375x812 and `wide-chromium` at 1440x1100 against a local dev server on port 3020.
- Accessibility tests in `tests/e2e/a11y/*` assert keyboard focus, labels, error states, no horizontal overflow, and route-specific a11y behavior.

**Guardrail Tests:**
- `tests/copy/*` prevents public and assistant-visible overclaims, internal vocabulary, unsupported booking/payment/dispatch/autonomy claims, and improper "verified" language.
- `tests/imports/*` prevents private module imports, route-owned Convex transport, future-provider imports, backup imports, and broad TypeScript holes.
- `tests/ui-contract/*` keeps public UI copy and visual utility usage aligned with `DESIGN.md`.
- `tests/types/*` keeps runtime values, Zod schemas, and TypeScript unions aligned.
- `tests/seo/*` keeps public SEO/AEO payloads free of private IDs, ratings/offers/payment claims, and unsupported machine-surface claims.

## Common Patterns

**Async Testing:**
```typescript
const response = await handleInvokeAgentTool(
  new Request('https://ae.example/api/agent/tools', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tool: 'does-not-exist', input: {} }),
  })
)

expect(response.status).toBe(404)
await expect(response.json()).resolves.toMatchObject({
  code: 'agent_tools_unknown_tool',
})
```

**Error Testing:**
```typescript
const generated = regenerateDiscoveryManifest(state, { slug }, { canonicalBaseUrl: 'https://ae.example', now: 0 })

if (generated.kind !== 'ok') {
  throw new Error(`Expected non-default source manifest to generate: ${generated.reason}`)
}

expect(JSON.stringify(generated.manifest)).not.toMatch(
  /rawContact|ownerId|clerk|private:evidence|callable":true|paymentRequired":true/
)
```

**React Component Testing:**
```typescript
/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})
```

**Playwright Testing:**
```typescript
test('claim form preserves input and focuses the first validation error', async ({ page }) => {
  await page.goto('/claim')
  await page.getByLabel('Business name').fill('Northside Solar')
  await page.getByRole('button', { name: /publish service page/i }).click()

  await expect(page.getByLabel('Business name')).toHaveValue('Northside Solar')
  await expect(page.getByLabel('Service category')).toBeFocused()
  await expect(page.getByText('Service category is required.')).toBeVisible()
})
```

**Convex Testing:**
- Current Convex tests often call generated Convex function handlers through `_handler` casts and fake DB/read traces, as in `tests/unit/convex/registry-runtime.test.ts`.
- Convex AI guidance in `convex/_generated/ai/guidelines.md` prescribes `convex-test` with Vitest and `@edge-runtime/vm` for Convex functions, with test files inside `convex/`; those packages/config are not detected in `package.json` or `vitest.config.ts`.
- When adding Convex tests, either follow the existing fake-runtime pattern in `tests/unit/convex/*` for local contract checks or intentionally add the managed `convex-test` setup from `convex/_generated/ai/guidelines.md`.

**Boundary-Honest Testing:**
- Any new assistant action, public copy, answer copy, SEO payload, or machine-readable descriptor must test that AE does not claim booking, payment, dispatch, live availability, autonomous fulfillment, unsupported callable behavior, or unqualified verification.
- Use `tests/unit/actions/agent-tools-surface.test.ts`, `tests/integration/agent-tools-api.test.ts`, `tests/copy/phase1-banned-copy.test.ts`, and `tests/seo/public-business-seo.test.ts` as reference patterns.

---

*Testing analysis: 2026-07-04*
