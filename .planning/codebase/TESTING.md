# Testing Patterns

**Analysis Date:** 2026-07-17
**Inspected Revision:** `3aa46069a00724679020f7f3cb338cc4ee177591`

## Test Framework

**Runner:**
- Vitest 4.1.9 for unit, integration, type, import-boundary, copy, SEO, UI-contract, and evaluation tests.
- Config: `vitest.config.ts`; Node is the default environment, globals are disabled, watch is disabled, and included files are `tests/**/*.test.ts`, `tests/**/*.test.tsx`, and `convex/**/*.test.ts`.
- Playwright 1.61.1 for browser journeys, accessibility, and deploy/provider smoke tests.
- Config: `playwright.config.ts` for local E2E and `playwright.deploy-smoke.config.ts` for hosted smoke tests.

**Assertion Library:**
- Vitest `expect` for TypeScript tests; import `describe`, `it`/`test`, hooks, `expect`, and `vi` explicitly from `vitest`.
- Playwright `expect` for browser-visible behavior and request/response interception: `tests/e2e/customer-request-decision-experience.spec.ts`.
- Testing Library for React behavior in jsdom: `tests/unit/chat/home-landing-submit.test.tsx`.
- `convex-test` for in-memory Convex functions and durable state: `convex/customerRequestRouteMandate.test.ts`.

**Run Commands:**
```bash
npm test                         # Run all Vitest files included by vitest.config.ts
npm run test:unit                # Run tests/unit
npm run test:integration         # Run tests/integration plus the Convex mandate suite serially
npm run test:e2e                 # Run Playwright tests/e2e against local or configured base URL
npm run test:all                 # Typecheck, Convex codegen check, scoped suites, boundaries, copy, SEO, UI contract, build
npm run test:release:source      # Full source release gate including lint, routing edge, retirement, tests, build
npm run test:release:hosted      # Hosted readback and Customer Request smoke journeys
npm run test -- --watch          # Optional local Vitest watch mode; repository config defaults watch to false
```

## Test File Organization

**Location:**
- Keep tests in the dedicated `tests/` tree by proof class: `tests/unit/`, `tests/integration/`, `tests/e2e/`, `tests/deploy-smoke/`, `tests/imports/`, `tests/copy/`, `tests/seo/`, `tests/types/`, `tests/ui-contract/`, and `tests/eval/`.
- Mirror the source domain under unit tests: `src/modules/customer-request/` maps to `tests/unit/customer-request/`; `src/modules/observability/` maps to `tests/unit/observability/`.
- Co-locate a Convex integration test only when it needs Convex module discovery via `import.meta.glob`: `convex/customerRequestRouteMandate.test.ts`.

**Naming:**
- Use `*.test.ts` or `*.test.tsx` for Vitest; use `*.spec.ts` for Playwright: `tests/unit/common/runtime-id.test.ts`, `tests/e2e/thread-first.spec.ts`.
- Name tests after observable behavior, not the implementation method: `it('starts exactly one canonical Request when submit is rapidly activated twice', ...)` in `tests/unit/chat/home-landing-submit.test.tsx`.
- Give release smoke files the surface or provider they prove: `tests/deploy-smoke/customer-request-human-lifecycle-smoke.spec.ts`.

**Structure:**
```text
tests/
├── unit/<module>/<behavior>.test.ts[x]
├── integration/<cross-boundary-behavior>.test.ts
├── e2e/<customer-journey>.spec.ts
├── deploy-smoke/<hosted-proof>.spec.ts
├── imports/<architecture-rule>.test.ts
├── copy/<claim-rule>.test.ts
├── seo/<surface>.test.ts
├── types/<contract>.test.ts
└── ui-contract/<design-contract>.test.ts
```

## Test Structure

**Suite Organization:**
```typescript
import { describe, expect, it } from 'vitest'
import { compileCustomerRequest } from '@/modules/customer-request/compiler'

describe('Customer Request compiler', () => {
  it('returns an exact clarification when a required fact is absent', () => {
    const result = compileCustomerRequest({ request: 'Find a nearby business' })
    expect(result).toMatchObject({ kind: 'needs_information' })
  })
})
```

**Patterns:**
- Arrange inline with explicit literals or local factory helpers, invoke one public seam, then assert the externally meaningful result: `tests/unit/customer-request/compile-request.test.ts`.
- Use `beforeEach`/`afterEach` only for shared environment setup and deterministic cleanup. Restore mocks with `vi.restoreAllMocks()`, unstub globals, and call Testing Library `cleanup()`: `convex/customerRequestRouteMandate.test.ts`, `tests/unit/chat/home-landing-submit.test.tsx`.
- Assert exact outputs with `toEqual` when the complete contract matters; use `toMatchObject` for stable contract fields when timestamps, generated references, or unrelated fields vary.
- Verify refusal, conflict, replay/idempotency, recovery, and cancellation paths alongside success: `convex/customerRequestRouteMandate.test.ts`, `tests/unit/customer-request/kernel-recovery.test.ts`.
- Test through supported seams. Use module `public.ts`, route handlers, HTTP surfaces, rendered UI, or Convex generated function references; do not reach into private helpers merely to increase coverage.

## Mocking

**Framework:** Vitest `vi`, Playwright routing, Testing Library, and dependency injection.

**Patterns:**
```typescript
const routeState = vi.hoisted(() => ({ navigate: vi.fn(async () => undefined) }))

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => routeState.navigate,
}))

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})
```

```typescript
await page.route('**/api/requests', async (route) => {
  await route.fulfill({ json: preview })
})
```

**What to Mock:**
- Mock browser globals and network boundaries when testing UI state: `vi.stubGlobal('fetch', ...)` in `tests/unit/chat/home-landing-submit.test.tsx`.
- Mock TanStack router adapters only to render and observe route components in isolation: `tests/unit/chat/home-landing-submit.test.tsx`.
- Intercept HTTP at the browser boundary when the Playwright test is about customer presentation rather than backend integration: `tests/e2e/customer-request-decision-experience.spec.ts`.
- Spy on `Date.now` or inject adapters to make identifiers, timestamps, provider responses, and retries deterministic: `convex/customerRequestRouteMandate.test.ts`.

**What NOT to Mock:**
- Do not mock the domain function under test or its pure decision logic. Exercise public module boundaries directly: `tests/unit/customer-request/route-mandate-admission.test.ts`.
- Do not replace Convex persistence when testing durable lifecycle semantics; use `convex-test`, schema, generated references, and real mutations/queries: `convex/customerRequestRouteMandate.test.ts`.
- Do not treat mocked UI journeys as hosted proof. Hosted claims require `tests/deploy-smoke/`, `tools/release/`, exact deployment/revision readback, and the intended public surface.

## Fixtures and Factories

**Test Data:**
```typescript
const identity = {
  subject: 'customer-route-mandate',
  issuer: 'https://identity.test',
  tokenIdentifier: 'https://identity.test|customer-route-mandate',
}

const backend = convexTest(schema, modules)
const customer = backend.withIdentity(identity)
```

**Location:**
- Keep small scenario fixtures and builders in the test file when used by one suite: `tests/e2e/customer-request-decision-experience.spec.ts`.
- Put shared source-owned sandbox and development supply in modules, not duplicated test-only state machines: `src/modules/sandbox-supply/public.ts`, `src/modules/dev/internal/dev-seed-fixture.ts`.
- Keep static discovery fixtures under the source-owned discovery seam and test their parity: `tests/integration/discovery-route-parity.test.ts`, `tests/unit/discovery/developer-discovery-parity.test.ts`.
- Use explicit values that independently specify expected behavior; do not recompute expected values with the production algorithm.

## Coverage

**Requirements:** No numeric line/branch coverage threshold or coverage script is configured in `vitest.config.ts` or `package.json`. Quality is enforced by named source, boundary, copy, UI, build, and hosted gates.

**View Coverage:**
```bash
npx vitest run --coverage             # Requires a compatible Vitest coverage provider; none is configured in package.json
npm run test:release:source           # Canonical broad source gate
npm run test:release                  # Source gate plus hosted proof gates
```

## Test Types

**Unit Tests:**
- Test pure domain decisions, projections, UI behavior, adapters, and state reducers through public seams under `tests/unit/`.
- Use jsdom per file with `/** @vitest-environment jsdom */` for React tests: `tests/unit/chat/home-landing-submit.test.tsx`.
- Preserve domain vocabulary and exact authority states in test names: `tests/unit/customer-request/route-mandate.test.ts`.

**Integration Tests:**
- Test routes, module composition, provider adapters, source persistence, action registration, and cross-surface parity under `tests/integration/`.
- Run the Convex mandate lifecycle serially with integration tests because it exercises durable transactions: the `test:integration` script in `package.json` uses `--no-file-parallelism`.
- Treat architecture as executable policy through `tests/imports/`; run `npm run test:imports` and `npm run test:ts-standards` after module-boundary changes.

**E2E Tests:**
- Use Playwright projects at compact 375x812 and wide 1440x1100 viewports from `playwright.config.ts`.
- Assert human-visible language, control, recovery, and request payloads with role/label locators: `tests/e2e/customer-request-decision-experience.spec.ts`.
- Use `tests/e2e/a11y/` for accessibility journeys and `tests/deploy-smoke/` for hosted/provider evidence. Local E2E starts Vite at `http://127.0.0.1:3020`; an explicit `PLAYWRIGHT_BASE_URL` targets an external deployment.
- Keep proof classes separate: a mocked Playwright response proves UI behavior, local full-stack E2E proves local reachability, and deploy smoke/readback proves only the named hosted revision and surface.

## Common Patterns

**Async Testing:**
```typescript
await expect(customer.mutation(
  internal.customerRequestStandingRoutePolicy.issue,
  command,
)).resolves.toMatchObject({ kind: 'issued' })

fireEvent.click(screen.getByRole('button', { name: 'Start my Request' }))
await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
```

**Error Testing:**
```typescript
await expect(customer.mutation(internal.customerRequestStandingRoutePolicy.issue, {
  ...command,
  expectedGenerationRef: 'route-generation:changed',
})).resolves.toEqual({ kind: 'conflict', reason: 'command_changed' })
```

- Prefer exact typed refusal/conflict assertions over generic `rejects.toThrow` for expected domain failures: `convex/customerRequestRouteMandate.test.ts`.
- Use thrown-error assertions only where the public contract is genuinely exceptional rather than an admitted business outcome.
- After adding an assistant-callable action, test its action contract and registry presence in `tests/unit/actions/` and the relevant route/integration seam; run copy and import gates because boundaries and summaries are product contracts.
- After Convex changes, read `convex/_generated/ai/guidelines.md`, test validators/auth/persistence through generated references, run `npm run check:convex-codegen`, and include the relevant integration suite.

---

*Testing analysis: 2026-07-17*
