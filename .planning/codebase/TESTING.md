# Testing Patterns

**Analysis Date:** 2026-08-15

## Test Framework

**Runner:**
- Vitest 4.1.9 for unit, integration, import-boundary, type, SEO, UI-contract, eval, and Convex tests; version and scripts are declared in `package.json`.
- Playwright 1.61.1 for browser E2E, accessibility, paid-operation, and deployed production smoke tests; configuration is in `playwright.config.ts` and specialized `playwright.*.config.ts` files.
- `convex-test` 0.0.54 with Vitest for in-memory Convex function execution; shared module loading and component registration live in `tests/helpers/convex-fixtures.ts`.
- Config: `vitest.config.ts`
- Browser config: `playwright.config.ts`

**Assertion Library:**
- Vitest's built-in `expect` for TypeScript tests, imported explicitly because `globals: false` in `vitest.config.ts`.
- Playwright's web-first `expect` for browser tests, as in `tests/e2e/landing-answer.spec.ts`.
- Testing Library queries and events for React components via `@testing-library/react`, as in `tests/unit/chat/ae-thread-transcript.test.tsx`.

**Run Commands:**
```bash
npm test                         # Run every Vitest test selected by vitest.config.ts
npm run test:unit                # Run tests/unit
npm run test:integration         # Run tests/integration and convex tests serially
npm run test:e2e                 # Run Playwright tests/e2e
npm run test:e2e:a11y            # Run Playwright accessibility scenarios
npm run test:types               # Run executable type-contract tests
npm run test:imports             # Run architecture/import guardrails in clean-tree mode
npm run test:ts-standards        # Run TypeScript source-standard scans
npm run test:seo                 # Run tests/seo
npm run test:ui-contract         # Run UI contract scans
npm run test:eval                # Run answer coverage, deterministic reports, Promptfoo, and eval tests
npm run test:all                 # Typecheck, codegen check, suites, and production build
npm run test:release:source      # Full source release gate with evidence artifacts
```
- The commands and their exact composition are defined in `package.json`; most use `tools/dev/run-with-cleanup.mjs` to prevent leaked child processes.
- Vitest watch mode is intentionally disabled by `watch: false` in `vitest.config.ts`; invoke `npx vitest` explicitly for an interactive local session if needed.
- There is no conventional line/branch coverage command in `package.json`; `npm run test:eval:coverage` audits required semantic answer-eval cases through `eval/answer/scripts/audit-coverage.ts`.

## Test File Organization

**Location:**
- Keep most tests separate from production code under `tests/`, grouped by intent: `tests/unit/`, `tests/integration/`, `tests/e2e/`, `tests/deploy-smoke/`, `tests/imports/`, `tests/types/`, `tests/seo/`, `tests/ui-contract/`, `tests/eval/`, `tests/helpers/`, and `tests/setup/`.
- Keep direct Convex tests next to Convex functions when they use `import.meta.glob('./**/*.ts')`; examples include `convex/externalRuns.test.ts` and `convex/studies.test.ts`.
- Keep reusable deterministic builders and adapters in `tests/helpers/`, including `tests/helpers/convex-fixtures.ts`, `tests/helpers/discovery-fixture-routes.ts`, and `tests/helpers/openrouter-contract-server.ts`.
- Keep global isolation shims in `tests/setup/`; `vitest.config.ts` installs web storage, no-search-gap writes, JSDOM platform behavior, and HTTP rate-limit setup for every Vitest file.
- Keep hostile or intentionally invalid source samples under `tests/fixtures/`; import scanners switch between clean runtime targets and fixture targets via `tests/imports/scan-targets.ts`.

**Naming:**
- Use `<behavior>.test.ts` or `<behavior>.test.tsx` for Vitest files, such as `tests/unit/answer/operation-result-presentation.test.ts` and `tests/integration/money-external-spend.test.ts`.
- Use `<flow>.spec.ts` for Playwright, such as `tests/e2e/landing-answer.spec.ts` and `tests/deploy-smoke/customer-request-human-lifecycle-smoke.spec.ts`.
- Name integration tests after the cross-module or persistence contract, not an implementation file: `tests/integration/answer-thread-source-write.test.ts` and `tests/integration/supplier-money-readback.test.ts`.
- Name guardrail tests after the prohibited dependency or source rule: `tests/imports/private-imports.test.ts`, `tests/imports/route-boundary.test.ts`, and `tests/imports/ts-standards.test.ts`.

**Structure:**
```text
tests/
├── unit/<domain>/<behavior>.test.ts[x]     # Pure logic, adapters, routes, React
├── integration/<cross-boundary>.test.ts    # Convex persistence and module flows
├── e2e/<journey>.spec.ts                   # Local browser journeys
│   └── a11y/<surface>.spec.ts              # Keyboard, focus, reflow contracts
├── deploy-smoke/<production-flow>.spec.ts  # Opt-in hosted verification
├── imports/<boundary>.test.ts              # Executable architecture rules
├── types/<contract>.test.ts                # Compile-time/API shape contracts
├── seo/<surface>.test.ts                    # Discovery and public metadata
├── ui-contract/<contract>.test.ts           # Source-level UI invariants
├── eval/<quality-contract>.test.ts          # Semantic/evaluation gates
├── helpers/<fixture-or-adapter>.ts          # Shared deterministic test support
├── setup/<global-isolation>.ts              # Vitest setup files
└── fixtures/<invalid-or-frozen-input>/      # Scanner and parser fixture data

convex/
└── <feature>.test.ts                        # Co-located convex-test suites
```
- The active Vitest include globs are `tests/**/*.test.ts`, `tests/**/*.test.tsx`, and `convex/**/*.test.ts` in `vitest.config.ts`; Playwright owns `.spec.ts` files independently.

## Test Structure

**Suite Organization:**
```typescript
// Pattern from tests/integration/money-external-spend.test.ts
const reserve = anyApi.moneyLedger?.reserveExternalInvocationSpend
if (reserve === undefined) throw new Error('external spend mutations missing')

async function seeded() {
  const backend = convexTest(schema, modules)
  await backend.run(async (ctx) => {
    // Insert the smallest authoritative starting state.
  })
  return backend
}

describe('provider-direct external spend reservations', () => {
  it('rejects identity conflicts and consumes budget once', async () => {
    const backend = await seeded()
    const first = await backend.mutation(reserve, baseIdentity)
    expect(first).toMatchObject({ kind: 'accepted', status: 'reserved' })
  })
})
```
- Group by externally meaningful behavior using `describe`, then write `it` names as complete behavioral claims. Representative suites are `tests/unit/answer/operation-result-presentation.test.ts` and `convex/externalRuns.test.ts`.
- Fail fixture construction immediately at module scope when a required API or seed object is absent. This keeps later assertions focused; examples are the operation-ref guard in `tests/unit/answer/operation-result-presentation.test.ts` and API guards in `tests/integration/money-external-spend.test.ts`.
- Keep test-specific builders below or above the suite depending on reuse, and type-check them with `satisfies`, `as const`, or domain types. `tests/unit/chat/ae-thread-transcript.test.tsx` defines `provider`, projection builders, and operation candidates.
- Prefer one logical behavior per `it`, but combine sequential assertions when the contract is a state machine or idempotency lifecycle. `tests/integration/money-external-spend.test.ts` intentionally verifies reserve, conflict, finalize, reverse, and budget state in one lifecycle.

**Patterns:**
- Setup pattern: create fresh state per test. Use `convexTest(schema, modules)` for an isolated in-memory backend and seed only the rows required by the scenario, as in `tests/integration/money-external-spend.test.ts`.
- Setup pattern: for React components requiring routing, create a memory router wrapper rather than mocking link behavior. `tests/unit/chat/ae-thread-transcript.test.tsx` wraps renders in `RouterContextProvider`.
- Teardown pattern: restore every modified global, mock, timer, DOM tree, and environment variable in `afterEach`. Examples are `cleanup()` and `vi.unstubAllGlobals()` in `tests/unit/chat/ae-thread-transcript.test.tsx` and environment cleanup in `convex/externalRuns.test.ts`.
- Assertion pattern: use `toEqual` for exact stable contracts, `toMatchObject` for intentionally partial public/result contracts, and negative serialization checks for redaction. `tests/unit/answer/operation-result-presentation.test.ts` uses all three.
- Assertion pattern: test both authorization success and negative identities. `convex/externalRuns.test.ts` covers anonymous, non-admin, revoked, suspended, and active-admin readbacks.
- Assertion pattern: verify durable state directly through `backend.run` after exercising a public function. `tests/integration/money-external-spend.test.ts` queries ledger and payment-attempt rows after mutations.
- Assertion pattern: use role/name queries for user-facing UI behavior. `tests/unit/chat/ae-thread-transcript.test.tsx` and `tests/e2e/landing-answer.spec.ts` avoid implementation selectors for primary interactions.

## Mocking

**Framework:** Vitest mocks/spies/stubs for module and process boundaries; in-memory Convex and explicit adapters for database behavior; Playwright route/server fixtures for browser boundaries.

**Patterns:**
```typescript
// Pattern from tests/unit/chat/ae-thread-transcript.test.tsx
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

it('previews the exact payload before copying it', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined)
  vi.stubGlobal('navigator', { clipboard: { writeText } })
  // Render, interact through accessible controls, then assert the boundary call.
  await waitFor(() => expect(writeText).toHaveBeenCalledOnce())
})
```
- Use `vi.mock` at module scope for framework/server modules whose imports must be replaced before the subject loads. `tests/unit/work-tree/human-root.functions.test.ts` mocks TanStack server functions, Clerk auth, and source adapters.
- Use `vi.hoisted` when mock state must exist before hoisted `vi.mock` factories; `tests/unit/ui/demand-console.test.tsx` uses this for Stripe state.
- Use `vi.stubGlobal` for browser/network capabilities such as `fetch`, `navigator.clipboard`, and storage; always pair it with `vi.unstubAllGlobals()` as in `tests/unit/chat/ae-thread-transcript.test.tsx`.
- Use `vi.spyOn(Date, 'now')` or injected clocks for deterministic time. Restore spies in teardown; examples appear in `tests/unit/convex/observability-runtime.test.ts`.
- Use `vi.useFakeTimers` only for logic whose contract is time progression; prefer explicit timestamps or injected clocks in domain fixtures such as `tests/integration/money-external-spend.test.ts`.
- For AI/provider SDKs, mock the transport or SDK boundary, not downstream domain logic. `tests/unit/customer-request/openrouter-transport.test.ts` mocks `ai` and `fetch`; `tests/helpers/openrouter-contract-server.ts` supports higher-level contract tests.

**What to Mock:**
- Mock nondeterministic or external boundaries: HTTP `fetch`, AI model SDK calls, payment SDKs, clipboard/browser APIs, authentication adapters, and server-framework function wrappers. Examples are `tests/unit/customer-request/openrouter-transport.test.ts`, `tests/unit/ui/demand-console.test.tsx`, and `tests/unit/work-tree/human-root.functions.test.ts`.
- Inject explicit ports/options when production code exposes them. `handleAnswerTurnRequest` accepts admission, stream, authentication, and operation service overrides in `src/routes/api.answer.turn.ts`; route tests should use those seams.
- Replace real Convex with `convex-test` for function and persistence tests. Register component test implementations through `tests/helpers/convex-fixtures.ts`.
- Use local fixture adapters for discovery and browser flows instead of production services. `tests/helpers/discovery-fixture-routes.ts` and `tests/helpers/inquiry-local-e2e-adapter.ts` provide these boundaries.

**What NOT to Mock:**
- Do not mock pure domain projectors, parsers, reducers, digests, or state transitions when they are the subject of the test. `tests/unit/answer/operation-result-presentation.test.ts` executes real artifact and sanitization logic.
- Do not mock Convex database semantics in integration tests; use `convex-test` and assert actual indexes, writes, auth identities, scheduled work, and readbacks as in `convex/externalRuns.test.ts`.
- Do not mock React child components when testing an end-user surface unless the test specifically isolates route orchestration. `tests/unit/chat/ae-thread-transcript.test.tsx` renders real transcript and answer components with only platform boundaries stubbed.
- Do not contact real deployments from default tests. `tests/setup/no-search-gap-writes.ts` globally disables search-gap writes, and hosted/provider tests are separate explicit commands in `package.json`.
- Do not use live time or network for Convex tests; the project Convex testing rules are recorded in `.agents/skills/convex-test/SKILL.md` and `convex/_generated/ai/guidelines.md`.

## Fixtures and Factories

**Test Data:**
```typescript
// Pattern from tests/helpers/convex-fixtures.ts
export function convexTestWithWorkers(options = {}) {
  const backend = convexTest(schema, convexModules)
  registerWorkpool(backend)
  registerRateLimiter(backend)
  return backend
}

export async function publishedBusinessOwner(backend, slug, options = {}) {
  // Seed authoritative owner/business rows.
  return { businessId, owner: backend.withIdentity(identity) }
}
```
- Build fixtures as typed functions that return only identities and handles a test needs. `ownerAdmin` and `publishedBusinessOwner` in `tests/helpers/convex-fixtures.ts` are the preferred Convex factory style.
- Use deterministic IDs, timestamps, URLs under `.example`/`.test`, and explicit evidence references. `tests/integration/money-external-spend.test.ts` uses fixed identities and observed times.
- Use partial override builders for large read models. The `provider(overrides)` helper in `tests/unit/chat/ae-thread-transcript.test.tsx` supplies a valid default and lets each test state only the relevant difference.
- Validate fixture assumptions immediately with guards. `tests/e2e/landing-answer.spec.ts` refuses to run without the named `plumbing-demo` fixture.
- Keep curated local browser data in `tests/helpers/local-e2e-business-fixtures.ts` and source-state builders in `tests/helpers/discovery-fixture-source-state.ts`; do not duplicate production records inline across E2E suites.
- Keep invalid source samples under `tests/fixtures/` and execute scanners in fixture mode via `AE_SCAN_MODE=fixtures`, as wired by `package.json`.

**Location:**
- Shared cross-suite helpers: `tests/helpers/`.
- Global test-environment setup: `tests/setup/`.
- Invalid/static source samples: `tests/fixtures/`.
- Suite-local builders: in the owning `.test.ts[x]`, as in `tests/unit/chat/ae-thread-transcript.test.tsx`.
- Convex module discovery and component registration: `tests/helpers/convex-fixtures.ts`.
- Answer evaluation cases and coverage requirements: `eval/answer/lib/cases.ts` and `eval/answer/lib/coverage.ts`.

## Coverage

**Requirements:** No statement, branch, function, or line percentage threshold is configured in `vitest.config.ts` or `package.json`. Release confidence is enforced through suite breadth, executable architecture guards, semantic answer-eval coverage, source conformance, typechecking, linting, codegen verification, and production build checks.

- `eval/answer/lib/coverage.ts` requires tagged cases for declared answer and harness behaviors and rejects missing assertions.
- `tests/eval/answer-pipeline.test.ts` verifies that required answer-eval coverage remains present.
- `eval/answer/lib/scoring.ts` applies answer quality score thresholds; `npm run test:eval:report` emits `output/eval/answer-suite-report.json`.
- `tests/imports/`, `tests/types/`, `tests/seo/`, and `tests/ui-contract/` cover source-level contracts that ordinary runtime coverage would not detect.
- `.github/workflows/kernel-release-gate.yml` runs conformance, lint, typecheck, kernel retirement, unit, integration, type, import, TS-standard, SEO, UI-contract, eval-report, and build checks before hosted proof.
- `.github/workflows/react-doctor.yml` reports React correctness, security, accessibility, performance, bundle, and architecture diagnostics but is advisory (`blocking: none`).

**View Coverage:**
```bash
npm run test:eval:coverage       # Audit semantic answer/harness case coverage
npm run test:eval:report         # Generate deterministic answer-suite report
npm run test:release:source      # Produce complete source-gate evidence artifacts
```
- Release Vitest JSON evidence is written to `output/release/unit-vitest.json` and `output/release/integration-vitest.json` by scripts in `package.json`; `.github/workflows/kernel-release-gate.yml` uploads these artifacts.

## Test Types

**Unit Tests:**
- Cover pure domain logic, state machines, parsers, validation, route adapters, error redaction, React components, and client/server seams under `tests/unit/`.
- Prefer real collaborators for pure logic and inject only external boundaries. `tests/unit/answer/operation-result-presentation.test.ts` exercises real schemas, digests, artifact construction, sanitization, and presentation.
- React tests use per-file `@vitest-environment jsdom`, Testing Library cleanup, accessible queries, and explicit memory-router wrappers; see `tests/unit/chat/ae-thread-transcript.test.tsx`.
- Unit tests also encode security and refusal behavior, including hostile/private output and malformed input; redaction assertions in `tests/unit/answer/operation-result-presentation.test.ts` verify secrets never survive serialization.

**Integration Tests:**
- Cover cross-module behavior and durable Convex state in `tests/integration/`, plus co-located `convex/**/*.test.ts`.
- Use `convex-test` with the real `convex/schema.ts` and module map from `tests/helpers/convex-fixtures.ts`; do not require a deployed backend.
- Exercise authorization with `backend.withIdentity`, data setup with `backend.run`, public functions with `query`/`mutation`/`action`, and durable readback through indexed queries. `convex/externalRuns.test.ts` is the canonical auth/readback example.
- Run integration and Convex suites without file parallelism through `npm run test:integration` because they modify process environment and exercise shared runtime behavior, as configured in `package.json`.
- Register `@convex-dev/workpool` and `@convex-dev/rate-limiter` test components through `convexTestWithWorkers` in `tests/helpers/convex-fixtures.ts` when component behavior is part of the contract.

**E2E Tests:**
- Playwright is used for local end-to-end journeys under `tests/e2e/`, configured by `playwright.config.ts`.
- Run two Chromium viewports by default: compact 375×812 and wide 1440×1100. `playwright.config.ts` starts a clean local Vite server on port 3020 unless `PLAYWRIGHT_BASE_URL` is supplied.
- Use accessible locator contracts (`getByRole`, `getByLabel`, `getByText`) and web-first assertions. `tests/e2e/landing-answer.spec.ts` verifies query submission, thread navigation, cited provider output, recovery, and public-language exclusions.
- Accessibility scenarios under `tests/e2e/a11y/` verify keyboard paths, skip links, focus indicators, and responsive behavior; `tests/e2e/a11y/engine-product-a11y.spec.ts` is representative.
- Hosted and paid smoke tests are isolated behind explicit scripts and specialized configs under `tests/deploy-smoke/`; they are not part of the default `npm test`.
- CI retries Playwright tests twice, forbids `.only`, captures traces on first retry, and takes screenshots only on failure, as configured in `playwright.config.ts`.

## Common Patterns

**Async Testing:**
```typescript
// UI pattern from tests/unit/chat/ae-thread-transcript.test.tsx
fireEvent.click(screen.getByRole('button', { name: 'Copy summary' }))
await waitFor(() => expect(writeText).toHaveBeenCalledOnce())

// Convex pattern from tests/integration/money-external-spend.test.ts
await expect(backend.mutation(reserve, baseIdentity))
  .resolves.toMatchObject({ status: 'reserved' })
```
- Await every mutation, query, action, navigation, and user-visible state transition. Avoid unobserved promises in tests.
- Use Testing Library `waitFor`/`findByRole` for React updates, Playwright's auto-waiting `expect` for browser state, and `vi.waitFor` for non-DOM polling; examples occur in `tests/unit/chat/ae-thread-transcript.test.tsx`, `tests/e2e/landing-answer.spec.ts`, and `tests/unit/harness/run-loop.test.ts`.
- Use Playwright `expect(...).toPass` only around genuinely retryable UI setup, as `submitLandingQuery` does in `tests/e2e/landing-answer.spec.ts`.
- Keep timeout increases local and justified. Release integration uses a 15-second test timeout in `package.json`, while Playwright defaults are centralized in `playwright.config.ts`.

**Error Testing:**
```typescript
// Typed refusal pattern from tests/integration/money-external-spend.test.ts
const conflict = await backend.mutation(reserve, changedIdentity)
expect(conflict).toEqual({
  kind: 'refused',
  code: 'external_spend_identity_conflict',
  retryable: false,
})

// Redaction pattern from tests/unit/answer/operation-result-presentation.test.ts
expect(JSON.stringify(sanitized)).not.toContain('TOPSECRET')
expect(projected.output).toBeUndefined()
```
- Prefer asserting typed refusal/error variants over `toThrow` when failure is an expected domain outcome. Integration suites in `tests/integration/` consistently assert `kind`, stable `code`/`reason`, and `retryable`.
- Use `toThrow` or fixture guards for invariant violations and malformed internal state. Stable error strings make failures searchable, as in `tests/unit/answer/operation-result-presentation.test.ts`.
- Test malformed input, over-size input, unavailable dependencies, replay/idempotency conflicts, authorization denial, and recovery paths—not only success. `src/routes/api.answer.turn.ts` has corresponding route tests under `tests/integration/answer-turn-*.test.ts`.
- For public boundaries, assert both response shape and absence of private data. `tests/unit/answer/operation-result-presentation.test.ts` checks withheld output and secret-free serialization; `convex/externalRuns.test.ts` checks resource-existence hiding.
- For UI failures, assert the accessible role and recovery action, not implementation state. `tests/unit/chat/ae-thread-transcript.test.tsx` checks `role="alert"`, error copy, and a `New chat` recovery link.

---

*Testing analysis: 2026-08-15*
