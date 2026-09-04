# Testing Patterns

**Analysis Date:** 2026-09-04

## Test Framework

**Runner:**
- Vitest 4.1.9 runs TypeScript unit, integration, contract, import-boundary, SEO, type, UI-contract, evaluation, and colocated Convex tests; version and scripts are in `package.json` and configuration is in `vitest.config.ts`.
- Playwright Test 1.61.1 runs browser E2E, accessibility, authenticated, deployment-smoke, and staging-chat suites; configuration is split across `playwright.config.ts`, `playwright.authenticated.config.ts`, `playwright.deploy-smoke.config.ts`, and `playwright.chat-staging.config.ts`.
- `convex-test` 0.0.56 provides an in-memory Convex backend, with project components registered by `tests/helpers/convex-fixtures.ts` and direct colocated examples in `convex/externalRegistry.test.ts`.
- React component tests use Testing Library with jsdom selected per file by `/** @vitest-environment jsdom */`; `tests/unit/ui/modal-lifecycle.test.tsx` is the reference pattern.
- Config: `vitest.config.ts` defaults to the Node environment, includes `tests/**/*.test.ts`, `tests/**/*.test.tsx`, and `convex/**/*.test.ts`, loads three global setup files, disables globals, and disables watch mode.

**Assertion Library:**
- Use Vitest's built-in `expect` for unit/integration/contract suites and Playwright's web-first `expect` for browser suites; examples are `tests/unit/common/normalize-slug.test.ts` and `tests/e2e/developer-discovery.spec.ts`.
- Use Testing Library queries for user-observable React behavior and accessibility roles; see `tests/unit/ui/modal-lifecycle.test.tsx`.
- The standalone CLI package integrity test intentionally uses a small local `assert(condition, message)` helper because it executes as a Node script across Node versions; see `scripts/test-cli-package.mjs`.

**Run Commands:**
```bash
npm test                         # Run all Vitest suites selected by vitest.config.ts
npm run test:unit                # Run tests/unit only
npm run test:integration         # Run tests/integration plus colocated convex tests serially
npm run test:e2e                 # Run Playwright tests/e2e in compact and wide Chromium projects
npm run test:e2e:a11y            # Run accessibility browser specs with one worker
npm run test:all                 # Typecheck, Convex codegen check, test partitions, and build
npm run test:release:source      # Full source release gate and retained release evidence
npx vitest --watch               # Explicit interactive/watch mode for focused local development
# Coverage command: Not configured; no Vitest coverage provider is installed
```
All checked-in command definitions are in `package.json`; CI invokes the release partitions from `.github/workflows/kernel-release-gate.yml`.

## Test File Organization

**Location:**
- Put pure and adapter-level behavior under `tests/unit/<domain>/`, mirroring product ownership such as `tests/unit/capability-execution/`, `tests/unit/money/`, `tests/unit/routes/`, and `tests/unit/ui/`.
- Put cross-module and in-memory backend flows under `tests/integration/`, such as `tests/integration/canonical-operation-reads.test.ts` and `tests/integration/capability-operation-workpool.test.ts`.
- Colocate direct Convex-generation tests at `convex/*.test.ts` only when they naturally exercise one Convex surface with `import.meta.glob('./**/*.ts')`; examples are `convex/externalRegistry.test.ts` and `convex/securityAccountHistory.test.ts`.
- Put runtime dependency and source-policy guardrails under `tests/imports/`; `tests/imports/module-boundaries.test.ts` and `tests/imports/ts-standards.test.ts` are release gates, not ordinary unit tests.
- Put browser journeys under `tests/e2e/`, authenticated journeys under `tests/e2e/authenticated/`, accessibility checks under `tests/e2e/a11y/`, and deployed-environment probes under `tests/deploy-smoke/`.
- Keep specialized executable contracts in `tests/eval/`, `tests/seo/`, `tests/types/`, `tests/ui-contract/`, `tests/security/`, and `tests/review/`; their dedicated scripts are declared in `package.json`.
- Store reusable builders and in-memory harnesses under `tests/helpers/`; store deliberately invalid source trees/data under `tests/fixtures/`; install cross-suite platform shims under `tests/setup/`.

**Naming:**
- Name Vitest files `<observable-capability>.test.ts` or `.test.tsx`, such as `tests/unit/http/problem-envelope-drift.test.ts` and `tests/unit/ui/confirm-dialog.test.tsx`.
- Name Playwright files `<journey>.spec.ts`, such as `tests/e2e/application-recovery.spec.ts` and `tests/deploy-smoke/phase1-deploy-smoke.spec.ts`.
- Name reusable test harnesses and builders by role rather than `utils`, such as `tests/integration/capability-publication-harness.ts`, `tests/helpers/convex-fixtures.ts`, and `tests/helpers/source-write-admission.ts`.

**Structure:**
```text
tests/
├── unit/<domain>/*.test.ts(x)       # One module/adapter behavior at a time
├── integration/*.test.ts            # Cross-module and Convex-backed flows
├── imports/*.test.ts                # Executable architecture/source constraints
├── e2e/**/*.spec.ts                 # Local browser journeys and accessibility
├── deploy-smoke/*.spec.ts           # Deployed-environment probes
├── eval|seo|types|ui-contract/       # Specialized release contracts
├── helpers/*.ts                     # Shared builders, fakes, and Convex harnesses
├── fixtures/**                      # Explicit valid/invalid fixture material
└── setup/*.ts                       # Global Vitest environment normalization
```
The directory categories are included by `vitest.config.ts`, Playwright configs, and the partition scripts in `package.json`.

## Test Structure

**Suite Organization:**
```typescript
import { describe, expect, it } from 'vitest'

import { normalizeSlug } from '@/modules/common/normalize-slug'

describe('normalizeSlug', () => {
  it('uses slugify transliteration and separator collapse', () => {
    expect(normalizeSlug('Café & Co.')).toBe('cafe-and-co')
  })
})
```
This is the actual minimal pattern from `tests/unit/common/normalize-slug.test.ts`.

**Patterns:**
- Organize a file around one public capability or adapter with one top-level `describe`, then write behavior statements in present-tense `it(...)` text; examples are `tests/unit/common/normalize-slug.test.ts` and `tests/unit/server/operation-invoke-api.test.ts`.
- Test the unit as a black box: pass public inputs and assert outputs, response status/headers/body, durable state, or external requests. This rule is explicit in `AGENTS.md` and exemplified by `tests/unit/server/api-request-boundary.test.ts` and `tests/unit/money/stripe-money-provider.test.ts`.
- Give each behavior one owning test so a regression produces a focused failure; avoid repeating the same assertion across nearby cases. The isolation rule is defined in `AGENTS.md`.
- Cover the happy path and at least one meaningful negative or refusal path. `RULES.MD` forbids tautological tests, and `tests/unit/server/operation-invoke-api.test.ts` checks authentication, scope, schema injection, and body identity before service invocation.
- Use `it.each` for a closed table of equivalent edge cases, as in `tests/integration/canonical-operation-reads.test.ts` and `tests/unit/money/stripe-money-provider.test.ts`.
- Prefer exact assertions for stable contracts (`toEqual`, `toBe`) and `toMatchObject`/`objectContaining` only when the omitted fields are intentionally outside the behavior under test; examples are `tests/unit/common/normalize-slug.test.ts` and `tests/e2e/developer-discovery.spec.ts`.
- Assert non-effects at consequence boundaries (`not.toHaveBeenCalled`, unchanged rows, absence of private fields), as shown in `tests/unit/server/operation-invoke-api.test.ts`, `convex/securityAccountHistory.test.ts`, and `tests/e2e/developer-discovery.spec.ts`.
- Use early narrowing assertions before variant-specific checks, as in `tests/integration/canonical-operation-reads.test.ts`: assert `kind`, return/throw if it differs, then inspect variant fields without unsafe casts.

## Mocking

**Framework:** Vitest `vi`, narrow injected fakes, Testing Library DOM events, Playwright browser fixtures, and `convex-test` in-memory services.

**Patterns:**
```typescript
const create = vi.fn().mockResolvedValue({ data: hostedCheckoutSession() })
const provider = createStripeMoneyProvider({
  config: hostedConfig,
  client: fakeClient({ create }),
})

const result = await provider.createOrRecoverCreditPayment(hostedRequest)

expect(create).toHaveBeenCalledOnce()
expect(result).toMatchObject({ kind: 'hosted_redirect' })
```
This is the external-client seam used in `tests/unit/money/stripe-money-provider.test.ts`.

**What to Mock:**
- Mock genuine external seams: Stripe client methods in `tests/unit/money/stripe-money-provider.test.ts`, model-provider HTTP using the local contract server in `tests/helpers/openrouter-contract-server.ts`, clocks/randomness in `tests/security/maturity/recovery-break-glass.test.ts`, and browser-only globals in `tests/setup/jsdom-platform.ts`.
- Inject fakes through production ports/options where provided rather than replacing modules. Authentication and invocation services are injected in `tests/unit/server/operation-invoke-api.test.ts`; Convex workers/components are registered in `tests/helpers/convex-fixtures.ts`.
- Use `vi.spyOn` or fake timers only around the specific test that owns the clock/logging seam, and restore it in `finally`, `afterEach`, or `afterAll`; reference `tests/unit/money/stripe-money-provider.test.ts`, `convex/agentAccessPrincipals.test.ts`, and `tests/setup/jsdom-platform.ts`.
- Use `vi.mock` only when the module itself is the external boundary under evaluation and injection is unavailable. The hoisted registry read mock in `tests/eval/adr009-composition-direct-control.test.ts` is a narrow existing example, not the default pattern.

**What NOT to Mock:**
- Do not mock internal collaborators merely to assert private calls. `AGENTS.md` requires behavioral tests that survive refactors and says mocking owned logic signals that a pure core or external port should be extracted.
- Do not mock Convex with ad hoc repositories. Use `convexTest(schema, modules)` or the registered-component helpers in `tests/helpers/convex-fixtures.ts` so validators, indexes, transactions, identities, schedules, and state transitions execute.
- Do not present fixture, mocked, or hand-inserted evidence as live proof. `RULES.MD` explicitly forbids proof-class inflation; live/deployed evidence belongs in `tests/deploy-smoke/` or the release-smoke tools under `tools/release/`.
- Do not mock browser semantics in E2E tests. Use role-based locators, actual navigation, request fixtures, and configured web servers from `playwright.config.ts` and `tests/e2e/developer-discovery.spec.ts`.

## Fixtures and Factories

**Test Data:**
```typescript
export function convexTestWithWorkers(
  options: ConvexTestWithWorkersOptions = {},
) {
  const backend = convexTestWithMarketComponents()
  registerWorkpool(backend)
  registerWorkpool(backend, 'stripeWebhookWorkpool')
  return backend
}
```
The shared registered-component pattern is implemented in `tests/helpers/convex-fixtures.ts`.

**Location:**
- Keep small, test-specific constants and builders in the owning test file, such as `hostedRequest`, `hostedCheckoutSession`, and `fakeClient` in `tests/unit/money/stripe-money-provider.test.ts`.
- Promote reused backend identity/catalog/publication builders to `tests/helpers/convex-fixtures.ts`, `tests/helpers/commercial-policy-fixtures.ts`, and `tests/helpers/public-business-fixture.ts`.
- Put reusable HTTP request/assertion helpers in focused files such as `tests/helpers/http.ts` and source-write helpers in `tests/helpers/source-write-admission.ts`.
- Put deliberately malformed trees used to prove scanners fail under `tests/fixtures/bad-imports/`, `tests/fixtures/bad-ts-standards/`, and `tests/fixtures/bad-ui-contract/`; select clean versus fixture mode through `tests/imports/scan-targets.ts`.
- Build temporary filesystem/package fixtures at runtime and remove them in `finally`, as demonstrated by `scripts/test-cli-package.mjs`; do not commit transient test output as a fixture.
- Keep credentials and environment values synthetic and restore any mutated `process.env` values, as in `tests/helpers/openrouter-contract-server.ts` and `tests/integration/chat-durable-messaging-share.test.ts`.

## Coverage

**Requirements:** No numeric line/branch/function coverage threshold or Vitest coverage provider is configured in `package.json` or `vitest.config.ts`. Release confidence is enforced through behavior partitions, architecture guardrails, and required end-to-end/release gates in `package.json` and `.github/workflows/kernel-release-gate.yml`.

**View Coverage:**
```bash
# Not configured: package.json and vitest.config.ts define no coverage provider or script.
```
Adding a compatible Vitest coverage provider would be required before a coverage report can be generated; adding that dependency or infrastructure is outside routine feature work under `AGENTS.md`. Prefer the existing focused behavior and release commands in `package.json` unless coverage infrastructure is explicitly requested.

## Test Types

**Unit Tests:**
- Exercise pure domain decisions, schemas, projections, server adapters, React behavior, CLI behavior, and external-client adapters under `tests/unit/`.
- Keep unit tests black-box and input/output oriented; `tests/unit/common/normalize-slug.test.ts`, `tests/unit/server/api-request-boundary.test.ts`, and `tests/unit/ui/modal-lifecycle.test.tsx` are representative.
- Use per-file jsdom only for DOM behavior and leave the Vitest default as Node; configuration is in `vitest.config.ts` and the directive pattern appears in `tests/unit/ui/modal-lifecycle.test.tsx`.

**Integration Tests:**
- Exercise multiple domain modules and Convex persistence together under `tests/integration/`, with serial execution requested by `npm run test:integration` in `package.json`.
- Use `convex-test` with real schema, generated function references, registered components, identities, indexes, and transactions; see `tests/integration/canonical-operation-reads.test.ts` and `tests/integration/capability-operation-workpool.test.ts`.
- Verify parity across public search/detail/compare/call projections, fail-closed corruption behavior, worker/scheduler completion, security boundaries, and provider lifecycle state; examples live throughout `tests/integration/`.

**E2E Tests:**
- Use Playwright for local browser journeys in `tests/e2e/`, running both 375x812 and 1440x1100 Chromium projects from `playwright.config.ts`.
- Query by accessible role/name and assert user-visible behavior, navigation, keyboard focus, headers, and viewport stability; see `tests/e2e/developer-discovery.spec.ts` and `tests/e2e/a11y/engine-product-a11y.spec.ts`.
- Keep ordinary local E2E parallel, but run authenticated suites with one worker and a setup dependency from `playwright.authenticated.config.ts` because they mutate shared identity/account state.
- Skip authenticated tests only when their declared environment is unavailable; the required release command `npm run test:e2e:authenticated:required` turns missing configuration into a failure through `tests/e2e/authenticated/environment.ts`.
- Use `tests/deploy-smoke/` plus the deployment-specific Playwright configs for externally hosted smoke evidence; do not fold deployed probes into deterministic local unit suites.

**Architecture and Contract Tests:**
- Treat `tests/imports/module-boundaries.test.ts` as the executable dependency-DAG and public-surface contract. Update `src/modules/module-boundaries.ts` deliberately when adding a module entry or dependency.
- Treat `tests/imports/ts-standards.test.ts` as the runtime type/safety guardrail and `tests/ui-contract/ui-contract.test.ts` as the semantic design-token contract.
- Use dedicated partitions for type contracts (`tests/types/`), SEO/discovery (`tests/seo/`), evaluation (`tests/eval/`), security maturity (`tests/security/`), and release topology (`tests/unit/release/`, `tests/unit/deployment/`), as scripted in `package.json`.
- Treat `scripts/test-cli-package.mjs` as a distribution integration test: it packs, installs, runs the binary on Node 20 and 22, verifies the exact package file set, and cleans its temporary consumer.

## Common Patterns

**Async Testing:**
```typescript
const response = await handleOperationInvokePost(post(invokeBody()), {
  authenticate,
  operationInvokeService: executor,
})

expect(response.status).toBe(200)
expect(executor.invokeOperation).toHaveBeenCalledOnce()
```
This request/response pattern is used in `tests/unit/server/operation-invoke-api.test.ts`.

- Await every async effect before asserting. Use direct `await`, `await expect(promise).resolves`, Testing Library `waitFor`, or Playwright's auto-waiting expectations; examples are `tests/unit/server/operation-invoke-api.test.ts`, `tests/unit/ui/modal-lifecycle.test.tsx`, and `tests/e2e/developer-discovery.spec.ts`.
- Drain scheduled Convex work explicitly with `backend.finishAllScheduledFunctions(...)` and controlled timers, as in `tests/integration/capability-operation-workpool.test.ts` and `tests/integration/capability-provider-offboarding.test.ts`.
- Pause registered workpools when the test owns an intermediate queued state, using `convexTestWithWorkers({ pauseWorkpool: true })` from `tests/helpers/convex-fixtures.ts`.
- Expose and await completion for background production work; `AGENTS.md` forbids fire-and-forget work that races assertions and requires structured ownership/joinability.
- Use fake timers only for deterministic clock/schedule behavior and always restore real timers; reference `convex/agentAccessPrincipals.test.ts` and `tests/unit/convex/interactive-credential-lifecycle.test.ts`.

**Error Testing:**
```typescript
await expect(
  backend.query(api.securityAccountHistory.listCurrentOwnerAgentSecurityHistory, input),
).rejects.toThrow('agent_history_not_found')

expect(executor.invokeOperation).not.toHaveBeenCalled()
```
The rejection-plus-no-effect pattern is used in `convex/securityAccountHistory.test.ts` and `tests/unit/server/operation-invoke-api.test.ts`.

- For expected domain refusals, assert the returned `kind`, stable `code`, retryability, and absence of forbidden side effects; see `tests/unit/money/stripe-money-provider.test.ts`.
- For invariant failures, use `rejects.toThrow` with the stable token or a narrowly scoped regex; see `convex/externalRegistry.test.ts` and `convex/agentAccessOAuth.test.ts`.
- For HTTP errors, assert status, `application/problem+json`, stable code/kind, security headers where relevant, and that HTML/provider prose is absent; see `tests/unit/server/api-request-boundary.test.ts` and `tests/unit/http/problem-envelope-drift.test.ts`.
- For corrupt or stale persisted material, mutate only the relevant state, then assert the public read fails closed and does not expose stale output; see `tests/integration/canonical-operation-reads.test.ts`.

**Isolation and Cleanup:**
- Create a fresh in-memory Convex backend per independent behavior unless a test explicitly verifies replay/state progression; examples are `convex/externalRegistry.test.ts` and `tests/integration/canonical-operation-reads.test.ts`.
- Restore spies, fake timers, environment variables, DOM globals, HTTP servers, and Testing Library mounts in `afterEach`, `afterAll`, `finally`, or returned cleanup closures; reference `tests/setup/jsdom-platform.ts`, `tests/helpers/openrouter-contract-server.ts`, and `tests/unit/ui/modal-lifecycle.test.tsx`.
- Run checked-in test commands through `tools/dev/run-with-cleanup.mjs`, as wired in `package.json`, so leaked test browsers and transient caches are handled without touching protected interactive browser profiles.

**Release Discipline:**
- Run the narrowest existing suite that proves the changed behavior first, then the relevant partition from `package.json`; this requirement is explicit in `AGENTS.md`.
- Extend the most relevant existing test before adding a new file, and add tests only for changed user-observable behavior or a named regression risk; `AGENTS.md` defines this minimum-sufficient scope.
- Never weaken a gate, regenerate expected output to match broken behavior, hard-code demo success, or relabel fixtures as live evidence. These forbidden reward-hacking patterns are defined in `RULES.MD`.
- Keep `test.only` out of CI; Playwright enforces this through `forbidOnly: Boolean(process.env.CI)` in `playwright.config.ts` and deployment-smoke configs.
- Use `npm run test:release:source` for the source release gate and `npm run test:release:authenticated` for required authenticated browser evidence; CI orchestration lives in `.github/workflows/kernel-release-gate.yml`.

---

*Testing analysis: 2026-09-04*
