# Testing Patterns

**Analysis Date:** 2026-07-14

## Test Framework

**Runner:**
- Vitest 4.1.9 runs `tests/**/*.test.ts`, `tests/**/*.test.tsx`, and `convex/**/*.test.ts` under Node by default.
- Config: `vitest.config.ts`
- React tests opt into jsdom with `@vitest-environment jsdom`; Convex integration tests use `convex-test` and a normalized `import.meta.glob` module map.
- Playwright 1.61.1 runs browser journeys in compact and wide Chromium projects through `playwright.config.ts`; hosted/provider smoke tests use `playwright.deploy-smoke.config.ts`.

**Assertion Library:**
- Use Vitest `expect` for unit, integration, static-contract, and type tests.
- Use Testing Library semantic queries for React behavior and Playwright web-first assertions for browser behavior.
- Snapshot tests are not an established project pattern; assert exact domain discriminators and customer-visible outcomes instead.

**Run Commands:**
```bash
npm test                          # Run all configured Vitest suites
npm run test:unit                 # Run tests/unit
npm run test:integration          # Run tests/integration without file parallelism
npm run test:e2e                  # Run local Playwright journeys
npm run test:all                  # Type, codegen, source contracts, tests, and build
npm run test:release:source       # Clean-source release gate
npm run test:release:hosted       # Credentialed exact-deployment readback
npm run test:eval                 # Eval coverage, report, Promptfoo, and eval tests
```

## Test File Organization

**Location:**
- `tests/unit/` contains 214 domain-grouped unit/component files.
- `tests/integration/` contains 41 route, persistence, provider, and multi-module files.
- `tests/imports/`, `tests/types/`, `tests/copy/`, `tests/seo/`, and `tests/ui-contract/` contain static architecture, domain, language, discovery, and design contracts.
- `tests/e2e/` contains 10 local browser specs; `tests/deploy-smoke/` contains 5 hosted/provider specs.
- `tests/helpers/` contains reusable test ports and local contract servers; `tests/fixtures/bad-*` contains intentional violations for scanner tests.

**Naming:**
- Name Vitest files for observable behavior with `*.test.ts[x]`.
- Name Playwright files for the user journey or deployed boundary with `*.spec.ts`.
- Place tests under the owning domain: `tests/unit/customer-request/`, `tests/unit/inquiries/`, `tests/unit/observability/`.

**Structure:**
```text
tests/
  unit/<domain>/<observable-behavior>.test.ts[x]
  integration/<boundary-or-flow>.test.ts
  imports/ | types/ | copy/ | seo/ | ui-contract/ | eval/
  helpers/<in-memory-port-or-local-contract-server>.ts
  fixtures/bad-*/<intentional-source-violation>.fixture
  e2e/<customer-flow>.spec.ts
  e2e/a11y/<surface>-a11y.spec.ts
  deploy-smoke/<hosted-boundary>.spec.ts
```

## Test Structure

**Suite Organization:**
```typescript
describe('customer Request workspace', () => {
  beforeEach(() => {
    vi.stubGlobal('matchMedia', createMatchMediaStub())
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('distinguishes revising the same Request from starting a new one', async () => {
    render(<AeCustomerRequestWorkspace />)
    // Drive the public interaction, then assert the request body and projection.
  })
})
```

**Patterns:**
- Name suites after an owned unit or boundary and tests after observable behavior.
- Arrange explicit data, execute through the public seam, then assert the returned discriminator, durable evidence, customer projection, and forbidden side effects.
- Use `it.each` for behavior matrices. Use concurrent calls and durable-row inspection for replay, idempotency, atomicity, and race contracts.
- Restore globals, environments, ports, clocks, and servers in `afterEach` or `finally`.

## Mocking

**Framework:** Vitest spies/stubs, Testing Library, `convex-test`, and explicit injected ports.

**Patterns:**
```typescript
const fetchMock = vi.fn()
  .mockResolvedValueOnce(Response.json(firstProjection))
  .mockResolvedValueOnce(Response.json(secondProjection))
vi.stubGlobal('fetch', fetchMock)

expect(fetchMock).toHaveBeenNthCalledWith(
  2,
  '/api/requests/request%3Aexample/options',
  expect.objectContaining({ method: 'POST' }),
)
```

**What to Mock:**
- Mock network/provider boundaries, clocks, randomness, and explicit ports when the behavior under test is the caller's policy or projection.
- Use local contract servers such as `tests/helpers/openrouter-contract-server.ts` when request/response protocol shape matters.
- Stub browser APIs in jsdom only when the component owns the response to those APIs.

**What NOT to Mock:**
- Do not mock the function or module whose contract is under test.
- Do not mock Convex internals for persistence semantics; use `convexTest(schema, modules)` with real validators, indexes, identities, and registered functions.
- Do not treat a mocked component test as proof of HTTP routing, Clerk auth, Convex deployment, registered supply, or provider fulfilment.

## Fixtures and Factories

**Test Data:**
```typescript
const identity = {
  subject: 'customer-v2',
  issuer: 'https://identity.test',
}

const backend = convexTest(schema, modules)
const customer = backend.withIdentity(identity)
```

**Location:**
- Put reusable ports and servers in `tests/helpers/`.
- Put deliberate static-scan violations in `tests/fixtures/bad-*` and run scanners in fixture mode.
- Use module-owned sandbox supply documents from `src/modules/sandbox-supply/public.ts` rather than duplicating capability contracts in tests.
- Keep local E2E seed material in `src/lib/dev/local-e2e-business-fixtures.ts`; never present sandbox data as production supply evidence.

## Coverage

**Requirements:** No global line or branch threshold is enforced in `vitest.config.ts`. Coverage is contract- and risk-driven. `npm run test:eval:coverage` audits answer-evaluation scenario coverage, not general source coverage.

**View Coverage:**
```bash
npm run test:eval:coverage        # Audit answer-evaluation case coverage
```

## Test Types

**Unit Tests:**
- Exercise pure domain transitions, schemas, projection logic, action descriptors, adapters, and React behavior under controlled boundaries (`tests/unit/`).
- For refusals, assert both the typed reason and absence of writes, egress, disclosure, or provider invocation.

**Integration Tests:**
- Cross real module seams, HTTP handlers, Convex validators/persistence, provider adapters, and registered supply (`tests/integration/`).
- Use `--no-file-parallelism` through `npm run test:integration` because shared test processes and ports can otherwise collide.
- Static integration gates in `tests/imports/` enforce public seams, authority retirement, source completeness, and TypeScript standards.

**E2E Tests:**
- Playwright drives real Vite surfaces using accessible roles and labels (`tests/e2e/`).
- `playwright.config.ts` sets `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E=true`; local browser success does not prove production Clerk/Convex authentication.
- Deploy-smoke specs target explicit hosted boundaries and require their own configuration. Exact hosted readback proves only the observed deployment, identity, request, and registered supply.

## Common Patterns

**Async Testing:**
```typescript
await expect(customer.action(api.customerRequestApplication.resume, {
  requestRef: 'request:v2:application',
})).resolves.toMatchObject({
  kind: 'request',
  state: 'needs_information',
})
```
- Await the state transition and assert its exact projection. In UI tests, use `findByRole`, `waitFor`, and user-visible labels rather than arbitrary sleeps.
- For streams and retries, assert cancellation, late-result rejection, replay identity, and which callback or thread generation receives the result.

**Error Testing:**
```typescript
const result = await invokeWithInvalidAuthority()
expect(result).toMatchObject({
  kind: 'error',
  retryable: false,
})
expect(providerCall).not.toHaveBeenCalled()
```
- Prefer typed refusal assertions over generic rejection assertions when failure is an expected domain state.
- Test malformed input and invariant failures with `toThrow` or rejected promises only at boundaries that deliberately throw.

**Required Verification Ladder:**
- Run the narrow changed-file test first, then the owning domain suite.
- Run `npm run lint`, `npm run typecheck`, and `git diff --check` for all source changes.
- Run `npm run check:convex-codegen` and the applicable Convex tests for Convex changes.
- Run `npm run test:imports` for ownership/public-surface changes, `npm run test:copy` for public or assistant copy, `npm run test:seo` for discovery, and `npm run test:ui-contract` for UI/design changes.
- Use local browser, clean-checkout, hosted readback, and cold external-agent evidence as distinct proof rungs. Never promote an internal object, passing unit test, generated map, or sandbox run into a production/customer-reachability claim.

---

*Testing analysis: 2026-07-14*
