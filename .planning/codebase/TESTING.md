# Testing Patterns

**Analysis Date:** 2026-08-02

## Test Framework

**Runner:**
- Vitest 4.1.9 runs authored `.test.ts` and `.test.tsx` files under `tests/` plus `.test.ts` files under `convex/`, as configured in `vitest.config.ts`.
- Playwright Test 1.61.1 owns browser `.spec.ts`/`.spec.tsx` files; the default browser projects and local web server are defined in `playwright.config.ts`, with deployment smoke and paid-operation variants in `playwright.deploy-smoke.config.ts` and `playwright.paid-operation.config.ts`.

**Assertion Library:**
- Use Vitest `expect`, including `toMatchObject`, `toHaveBeenCalledTimes`, `resolves`, `rejects`, and `expectTypeOf` (`tests/unit/actions/action-contract-compatibility.test.ts`, `tests/types/domain-contracts.test.ts`).
- Use Testing Library queries and `fireEvent` for React behavior (`tests/unit/ui/demand-console.test.tsx`); use Playwright role/label and URL assertions for browser behavior (`tests/e2e/thread-first.spec.ts`).

**Run Commands:**
```bash
npm test                                      # all Vitest-configured tests
npm run test:unit                             # tests/unit
npm run test:integration                       # tests/integration plus the Convex route-mandate test, no file parallelism
npx vitest --watch                            # watch mode; no package watch script is defined
npm run test:eval:coverage                    # eval-case coverage audit, not line/branch instrumentation
npm run gate:release                          # source release contract
npm run test:release                          # source contract plus hosted proof
npm run test:e2e                              # local Playwright browser suite
npm run test:e2e:a11y                         # local accessibility browser suite
```

## Test File Organization

**Location:**
- Keep unit and seam tests in `tests/unit/`, behavior-spanning source tests in `tests/integration/`, browser tests in `tests/e2e/`, and deployment checks in `tests/deploy-smoke/` (`package.json`, `playwright.deploy-smoke.config.ts`).
- Keep Convex-native runtime tests beside the backend in `convex/` (`convex/workTrees.test.ts`, `convex/externalRuns.test.ts`); use `tests/unit/convex/` for focused handler/runtime bridge tests (`tests/unit/convex/notification-outbox-runtime.test.ts`).
- Keep static contract suites in their named roots: `tests/types/`, `tests/imports/`, `tests/seo/`, and `tests/ui-contract/`; evaluation behavior is under `tests/eval/` with shared cases in `eval/answer/`.

**Naming:**
- Name Vitest files with `.test.ts` or `.test.tsx` and browser files with `.spec.ts` or `.spec.tsx`; use domain/behavior names such as `tests/unit/customer-request/v2-request-semantics.test.ts` and `tests/e2e/thread-first.spec.ts`.
- Name fixtures and helpers by the seam they support (`tests/fixtures/capability-contract-v2.ts`, `tests/helpers/convex-fixtures.ts`, `tests/helpers/openrouter-contract-server.ts`).

**Structure:**
```text
tests/
  unit/             pure modules, handlers, UI, Convex bridges, security, schemas
  integration/      route/provider/Convex journeys and cross-module persistence
  e2e/              local Playwright browser journeys and accessibility
  deploy-smoke/     deployed-release browser smoke
  types/ imports/ seo/ ui-contract/ eval/   static and evaluation contracts
  helpers/ fixtures/ setup/                   shared ports, data, and environment setup
convex/*.test.ts                                Convex-native integration/runtime tests
```

## Test Structure

**Suite Organization:**
```typescript
describe('customer Request HTTP API', () => {
  it('rejects malformed input before invoking the application', async () => {
    const submit = vi.fn()
    const response = await handleCustomerRequestPost(postJsonRequest('/api/requests', { request: '' }), { submit })
    expect(response.status).toBe(400)
    expect(submit).not.toHaveBeenCalled()
  })
})
```
This boundary-injection pattern is used in `tests/unit/server/customer-request-api.test.ts`; Convex journeys instead create an isolated `convexTest(schema, modules)` backend and call generated `api`/`internal` bindings (`tests/integration/capability-publication.test.ts`, `convex/workTrees.test.ts`).

**Patterns:**
- Group related behavior with `describe` and behavior-oriented `it` names; make each test assert a user-visible result, state transition, refusal, side effect, or redaction (`tests/unit/security/admin-authority.test.ts`, `tests/eval/answer-pipeline.test.ts`).
- Use `beforeEach` for per-test environment/port setup and `afterEach` for `cleanup`, env/global restoration, and test-port reset (`tests/integration/answer-turn-empty-state.test.ts`, `tests/unit/ui/demand-console.test.tsx`).
- Prefer explicit assertions over snapshots; the current snapshot usage is narrow and localized to `tests/unit/work-tree/memo.test.tsx` with `tests/unit/work-tree/__snapshots__/memo.test.tsx.snap`.
- Assert refusal precedence and no effect, not only return values: authorization, idempotency, revision conflicts, redaction, and recovery are first-class assertions (`tests/unit/convex/notification-outbox-runtime.test.ts`, `tests/unit/action-invocation/durable-action-invocation.test.ts`).

## Mocking

**Framework:** Vitest `vi` mocks, spies, stubs, and injected ports; Testing Library supplies the browser interaction layer (`tests/unit/answer-thread/follow-up-chips.test.ts`, `tests/unit/ui/demand-console.test.tsx`).

**Patterns:**
```typescript
vi.mock('ai', async (importOriginal) => ({
  ...await importOriginal<typeof Ai>(),
  generateText: vi.fn(),
}))

afterEach(() => {
  vi.mocked(generateText).mockReset()
  vi.unstubAllEnvs()
})
```
This module-mock pattern is present in `tests/unit/answer-thread/follow-up-chips.test.ts`; boundary tests also use `vi.stubGlobal('fetch', ...)`, `vi.stubEnv(...)`, `vi.spyOn(Date, 'now')`, and `vi.unstubAllGlobals()` (`tests/integration/customer-request-v2-application-path.test.ts`, `tests/integration/customer-request-v2-entrypoint-substitution.test.ts`).

**What to Mock:**
- Mock provider/network calls, model SDK calls, clocks, environment configuration, browser-only APIs, and explicit application ports when testing a narrower boundary (`tests/helpers/openrouter-contract-server.ts`, `tests/setup/jsdom-platform.ts`, `tests/unit/server/customer-request-api.test.ts`).
- Prefer a local contract server over mocking the provider SDK when the test is about request/response wire shape; `tests/helpers/openrouter-contract-server.ts` records requests and returns schema-shaped tool/prose responses.
- Use `setAnswerThreadPortForTests` to isolate HTTP streaming tests while still reading the real wire format through `tests/helpers/answer-turn-stream.ts` (`tests/integration/answer-turn-empty-state.test.ts`).

**What NOT to Mock:**
- Do not replace the domain transition, validator, authorization, projection, or idempotency logic under test; use `convexTest` for real Convex function execution and source-owned state (`tests/integration/capability-publication.test.ts`, `convex/workTrees.test.ts`).
- Do not allow tests to write search-gap traffic to a configured deployment: `tests/setup/no-search-gap-writes.ts` installs a no-op recorder, and any intentional override must be explicit.
- Do not use live credentials or depend on a developer's configured Convex URL in deterministic suites; discovery/registry tests explicitly unset `CONVEX_URL` and `VITE_CONVEX_URL` (`tests/seo/developer-discovery.test.ts`, `tests/integration/registry-api.test.ts`).

## Fixtures and Factories

**Test Data:**
```typescript
const backend = convexTestWithWorkers({ pauseWorkpool: true })
const { businessId, owner } = await publishedBusinessOwner(backend, 'legacy-rebuild')
const admin = await ownerAdmin(backend, 'user_capability_publication_observer')
```
The reusable identity/database setup lives in `tests/helpers/convex-fixtures.ts`; `convexTestWithWorkers` registers Workpool and rate-limiter test components, while `ownerAdmin` and `publishedBusinessOwner` create source-owned identities and rows.

**Location:**
- Put reusable typed state builders in `tests/fixtures/` (`tests/fixtures/source-state.ts`, `tests/fixtures/capability-contract-v2.ts`, `tests/fixtures/discovery-published-state.ts`).
- Put per-seam helpers in `tests/helpers/`; use local builders for scenario-specific rows and explicit operation/correlation keys (`convex/workTrees.test.ts`, `tests/unit/convex/notification-outbox-runtime.test.ts`).
- Keep intentionally invalid static-analysis inputs in `tests/fixtures/bad-*`; they are selected with `AE_SCAN_MODE=fixtures` by `tests/imports/scan-targets.ts` and ignored by ordinary lint through `.oxlintrc.json`.

## Coverage

**Requirements:** No line/branch coverage threshold or instrumentation configuration is present in `package.json` or `vitest.config.ts`; behavioral and contract gates are the enforced coverage model. `npm run test:eval:coverage` audits required answer-evaluation cases via `eval/answer/scripts/audit-coverage.ts`, not source-code percentages.

**View Coverage:**
```bash
npm run test:eval:coverage                    # view the answer-case coverage audit
npm run test:eval:report                      # write output/eval/answer-suite-report.json
```
No `--coverage` command or coverage reporter is configured; do not report a code-coverage percentage from the current suite.

## Test Types

**Unit Tests:**
- Exercise pure module transitions, schemas, DTO/projection builders, route handlers with injected ports, and simulated runtime stores under `tests/unit/` (`tests/unit/actions/action-contract-compatibility.test.ts`, `tests/unit/server/customer-request-api.test.ts`).
- Keep negative behavior explicit: invalid statuses, malformed input, cross-principal access, sensitive-content refusal, and no-side-effect guarantees are tested alongside success (`tests/types/domain-contracts.test.ts`, `tests/unit/security/admin-authority.test.ts`).

**Integration Tests:**
- Exercise module-to-Convex persistence, generated API/internal bindings, provider contracts, SSE streams, and multi-step Request journeys under `tests/integration/` and `convex/` (`tests/integration/capability-publication.test.ts`, `tests/integration/answer-turn-empty-state.test.ts`).
- Run integration files with `--no-file-parallelism` through `npm run test:integration` and `npm run test:release:integration`; use `pauseWorkpool: true` where deterministic tests must control asynchronous worker effects (`tests/helpers/convex-fixtures.ts`).

**E2E Tests:**
- Use Playwright role/label locators, URL assertions, explicit readiness waits, and public-language checks (`tests/e2e/thread-first.spec.ts`, `tests/e2e/a11y/engine-product-a11y.spec.ts`).
- The default browser config runs compact and wide Chromium projects, starts Vite on `127.0.0.1:3020`, and enables the local-only Clerk bypass through `playwright.config.ts`; paid-operation and deploy-smoke tests use separate servers/configuration.

## Common Patterns

**Async Testing:**
```typescript
await expect(readProjectedSupport(backend, businessId)).resolves.toMatchObject({
  integrated: true,
  routeable: true,
})
await expect(backend.mutation(applyWorkTree, args('outside-frontier', proposal)))
  .rejects.toThrow('work_tree_target_not_frontier')
```
Use `resolves`/`rejects`, `await` every Convex/provider operation, and drain streaming responses with the shared reader (`tests/integration/capability-publication.test.ts`, `convex/workTrees.test.ts`, `tests/helpers/answer-turn-stream.ts`).

**Error Testing:**
```typescript
expect(result).toMatchObject({ kind: 'error', code: 'notification_system_denied' })
expect(JSON.stringify(readback)).not.toContain('customer@example.test')
expect(submit).not.toHaveBeenCalled()
```
Assert typed refusal/error codes, HTTP statuses, redacted output, idempotent replay, and unchanged durable state (`tests/unit/convex/notification-outbox-runtime.test.ts`, `tests/unit/server/customer-request-api.test.ts`). For boundary faults, assert sanitized response codes and safe fallback copy instead of provider/internal details (`src/routes/api.answer.turn.ts`, `tests/integration/answer-turn-empty-state.test.ts`).

---

*Testing analysis: 2026-08-02*
