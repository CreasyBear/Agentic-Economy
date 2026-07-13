# Testing Patterns

**Analysis Date:** 2026-07-13

## Test Framework

**Runners:**
- Vitest 4.1.9 runs TypeScript/TSX unit, integration, contract, type, copy, SEO, import-boundary, UI-contract, evaluation, and colocated Convex tests. `vitest.config.ts` defaults to Node, uses explicit imports (`globals: false`), disables watch, and includes `tests/**/*.test.ts[x]` plus `convex/**/*.test.ts`.
- Convex function tests use `convex-test` with `@edge-runtime/vm`; colocated files opt into `// @vitest-environment edge-runtime` and pass an `import.meta.glob` module map as required by `convex/_generated/ai/guidelines.md`.
- Playwright 1.61.1 runs local E2E/accessibility specs from `tests/e2e/`. A separate `playwright.deploy-smoke.config.ts` runs narrow hosted/provider smokes without starting the local app.
- Promptfoo evaluates answer quality through `eval/answer/promptfooconfig.yaml`; Vitest separately verifies evaluation catalog and report semantics.
- React component tests use Testing Library and opt into jsdom per test file when DOM behavior is required.

**Assertions:**
- Use Vitest's built-in `expect`: exact `toEqual`/`toBe`, structural `toMatchObject`, explicit property and collection assertions, `toThrowError`, and async `resolves`/`rejects`.
- Use Playwright web-first assertions and accessible role/label selectors (`await expect(locator).toBeVisible()`, `toHaveURL`, `toBeEnabled`).
- No snapshot-test convention was found; tests prefer explicit objects, codes, public text, persisted rows, and semantic DOM behavior.

**Run Commands:**
```bash
npm test                                      # All configured Vitest tests
npm run test:unit                             # tests/unit
npm run test:integration                      # tests/integration
npm run test:types                            # Compile-time/domain contracts
npm run test:imports                          # Clean-tree architecture/import guardrails
npm run test:ts-standards                     # TypeScript standards source scan
npm run test:copy                             # Public and assistant copy boundaries
npm run test:seo                              # SEO/discovery contracts
npm run test:ui-contract                      # UI/design source contract
npm run test:eval                             # Eval coverage, report, Promptfoo, and Vitest evals
npm run test:e2e                              # Local Playwright user flows
npm run test:a11y                             # Local Playwright accessibility flows
npm run test:all                              # Broad local gate plus build
npm run test:release:source                   # CI source/contract/build proof
npm run test:release:hosted                   # Convex codegen plus revision-bound kernel proof
npm run test:release                          # Source then hosted proof
npx vitest run tests/unit/common/runtime-id.test.ts
npx playwright test tests/e2e/landing-answer.spec.ts
```

## Test File Organization

**Location and Naming:**
- Tests are primarily centralized under `tests/` and grouped by proof class. Vitest uses `*.test.ts` or `*.test.tsx`; Playwright uses `*.spec.ts`.
- Unit tests mirror domain ownership under `tests/unit/<domain>/` (183 files at analysis time). Integration tests live under `tests/integration/` (38 files).
- Architecture, TypeScript, copy, SEO, UI, and evaluation guardrails live in `tests/imports/`, `tests/types/`, `tests/copy/`, `tests/seo/`, `tests/ui-contract/`, and `tests/eval/`.
- Browser flows are under `tests/e2e/` (8 specs, including accessibility); hosted/provider proof is under `tests/deploy-smoke/` (5 specs).
- Convex-specific edge-runtime tests may be colocated in `convex/` (currently `convex/customerRequestPreparationAuthority.test.ts` and `convex/routingKernelStructuredPreparation.test.ts`). Other multi-boundary Convex tests remain in `tests/integration/` and construct a normalized Convex module map.
- Shared ports/servers live in `tests/helpers/`; deliberately invalid scanner inputs are isolated under `tests/fixtures/bad-*`.

**Structure:**
```text
tests/
  unit/<domain>/<behavior>.test.ts[x]
  integration/<boundary-or-flow>.test.ts
  imports/ | types/ | copy/ | seo/ | ui-contract/ | eval/
  helpers/<test-port-or-contract-server>.ts
  fixtures/bad-*/<violation>.fixture
  e2e/<user-flow>.spec.ts
  e2e/a11y/<surface>-a11y.spec.ts
  deploy-smoke/<hosted-boundary>-smoke.spec.ts
convex/
  <function-boundary>.test.ts
```

## Test Structure

**Suite Organization:**
```typescript
import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'

import { api } from '../../convex/_generated/api'
import schema from '../../convex/schema'

const discoveredModules = import.meta.glob('../../convex/**/*.{ts,js}')
const modules = Object.fromEntries(
  Object.entries(discoveredModules).map(([path, load]) => [path.replace('../../convex/', './'), load]),
)

describe('capability supply registration', () => {
  it('refuses invalid authority without a persisted write', async () => {
    const backend = convexTest(schema, modules)
    const result = await backend.mutation(api.capabilitySupply.registerOffering, input)

    expect(result).toEqual({ kind: 'refused', reason: 'authorization_denied' })
    await expect(backend.run(async (ctx) => ctx.db.query('capabilityOfferings').collect()))
      .resolves.toEqual([])
  })
})
```

**Patterns:**
- Name the unit or boundary in `describe`; phrase `it` names as observable outcomes, including refusal behavior and forbidden side effects.
- Arrange explicit domain values, call the public API/route/function, then assert exact result plus relevant persistence, audit, or response effects.
- Use `it.each` for behavior matrices. Use serial Playwright mode only for flows intentionally sharing browser/session state (`tests/e2e/thread-first.spec.ts`, `tests/e2e/chat-discovery-inquiry-loop.spec.ts`).
- Restore injected ports, environments, globals, timers, spies, and servers in `afterEach` or `finally`; tests should otherwise be order-independent.
- For race, idempotency, and atomicity contracts, run concurrent operations and inspect durable rows as well as returned results (`convex/customerRequestPreparationAuthority.test.ts`).

## Mocking and Test Seams

**Framework and Patterns:**
- Vitest provides `vi.fn`, `vi.spyOn`, `vi.mock`, `vi.stubGlobal`, and environment stubs. Restore them with `vi.restoreAllMocks`, `vi.unstubAllGlobals`, or `vi.unstubAllEnvs`.
- Prefer explicit ports and injected functions over broad module mocks: in-memory thread stores (`tests/helpers/answer-thread-test-port.ts`), local provider servers (`tests/helpers/openrouter-contract-server.ts`), fetch implementations, deterministic clocks, and server action seams.
- Use `convexTest(schema, modules)` for real validators, functions, schema, indexes, auth identities, and in-memory persistence rather than mocking Convex internals.
- React tests render real components and query with Testing Library `screen`; mock router/browser primitives only when navigation/browser integration is not the behavior under test.
- Playwright local tests run the real Vite server with `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E=true`. Hosted smokes require explicit target credentials/configuration and do not use the local bypass.

**What to Mock:**
- Provider/network APIs, runtime persistence ports when not under test, browser APIs unavailable in Node/jsdom, clocks for expiry, and environment-selected adapters.
- Keep schemas, validators, pure domain functions, command logic, hashing, DTO projection, and internal module composition real.

## Fixtures and Factories

**Test Data:**
- Define compact local factories with explicit defaults and optional overrides when data is specific to one domain test (`tests/unit/capability-supply/capability-supply-contract.test.ts`).
- Use shared in-memory stores or server helpers for repeated runtime behavior (`tests/helpers/answer-thread-test-port.ts`, `tests/helpers/openrouter-contract-server.ts`).
- Evaluation cases and registry seeds are centralized under `eval/answer/lib/cases.ts` and `eval/answer/lib/registry-seed.ts`; coverage audits pin breadth and uniqueness.
- Scanner fixtures are intentionally invalid and selected with `AE_SCAN_MODE=fixtures`; clean-mode tests scan live source and must return zero violations.
- Prefer transparent identifiers, timestamps, digests, principals, slugs, and expected records over opaque serialized fixtures.

## Coverage and Quality Gates

**Coverage:**
- No conventional line/branch percentage threshold or Vitest coverage reporter is configured in `vitest.config.ts` or `package.json`.
- Coverage is risk- and contract-oriented across unit, integration, Convex edge-runtime, browser, security, import-boundary, copy, SEO, UI, deployment, and AI-evaluation proof classes.
- Evaluation coverage has its own executable audit (`npm run test:eval:coverage`) and report generation (`npm run test:eval:report`); this is case/contract coverage, not source-line coverage.

**Gate Composition:**
- `npm run test:all` runs TypeScript, Convex codegen, unit, integration, types, imports, TS standards, copy, SEO, UI contract, and build. It does not run browser E2E, evaluation, or hosted smokes.
- `npm run test:release:source` adds Oxlint, routing-edge dry-run/type proof, kernel-retirement proof, and the same source suites/build. Despite the older map, it does not currently include Promptfoo, Playwright E2E, or accessibility.
- `npm run test:release:hosted` runs deployment-dependent Convex codegen and revision-bound kernel-proof verification; it requires hosted secrets/evidence.
- `.github/workflows/kernel-release-gate.yml` runs source proof on PRs and pushes to `main`; the hosted job runs only outside pull requests after source proof succeeds, with `CONVEX_DEPLOY_KEY`, `AE_KERNEL_PROOF_MANIFEST_JSON`, and the GitHub SHA.
- Deploy/provider smoke scripts remain separate and require the exact external environment. Never claim hosted behavior from local source tests.

## Test Types

**Unit:**
- Exercise deterministic domain contracts, validators, hashing, reducers, security rules, render behavior, and runtime adapters under `tests/unit/`.
- Many runtime “unit” tests intentionally use realistic in-memory state instead of mocking every collaborator.

**Integration and Convex:**
- `tests/integration/` exercises route handlers, auth/session boundaries, persistence flows, capability registration, provider adapters, discovery parity, and multi-module behavior.
- Convex tests use real generated APIs and schema through `convex-test`; colocated tests use the edge-runtime directive and direct `import.meta.glob('./**/*.ts')` convention from `convex/_generated/ai/guidelines.md`.
- Assert both returned contracts and durable state: refusal paths must prove no unauthorized write, audit payloads must prove redaction, and replay/atomicity paths must prove row counts and stable hashes.

**Contract and Static Guardrails:**
- `tests/imports/` scans live source for forbidden private imports, backups, route leaks, kernel-boundary drift, capability-contract drift, capability-supply drift, and unsafe TypeScript constructs.
- `tests/types/domain-contracts.test.ts` pins type contracts; copy, SEO, UI-contract, schema, and security tests pin product language, source ownership, and generated/schema boundaries.
- Fixture-mode commands prove scanners detect known-bad examples rather than merely returning empty results.

**E2E and Accessibility:**
- `playwright.config.ts` runs compact (375x812) and wide (1440x1100) Chromium projects, fully parallel by default, with screenshots on failure and traces on first retry.
- Query by accessible role/name and assert user outcomes, URLs, responsive behavior, focus, enabled state, and prohibited public language.
- E2E is an explicit command, not part of the current release-source CI job.

**Deploy and Provider Smoke:**
- `tests/deploy-smoke/` verifies narrow hosted public, support-record, notification-provider, and Stripe boundaries through a non-local Playwright config.
- Commands such as `npm run test:deploy-smoke:public` and `npm run test:provider-smoke:resend` are credentialed readback proofs, not substitutes for source tests and not included in `test:release`.

## Common Patterns

**Async Refusal and Persistence:**
```typescript
await expect(operation()).resolves.toEqual({ kind: 'refused', reason: 'contract_not_found' })
await expect(backend.run(async (ctx) => ctx.db.query('capabilityOfferings').collect()))
  .resolves.toEqual([])
```

**Error Testing:**
```typescript
expect(() => defineCapabilityOfferingRegistration(invalidInput))
  .toThrowError('capability_offering_invalid')

await expect(providerCall()).rejects.toThrow('expected boundary error')
```

**Browser:**
```typescript
await page.goto('/registry')
await expect(page.getByRole('main')).toBeVisible()
await expect(page.getByRole('button', { name: /send/i })).toBeEnabled()
```

**Snapshots:**
- Not used. Prefer exact objects, explicit public strings/codes, semantic DOM queries, durable row inspection, and contract scan results.

---

*Testing analysis: 2026-07-13*
*Update when test patterns change*
