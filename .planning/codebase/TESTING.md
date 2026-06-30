# Testing Patterns

**Analysis Date:** 2026-06-30

## Test Framework

**Runner:**
- Vitest 4.1.9 for unit, integration, type, copy, import, SEO, UI-contract, and eval-adjacent tests.
- Config: `vitest.config.ts`
- Environment: `node`
- Include pattern: `tests/**/*.test.ts` and `tests/**/*.test.tsx`
- Globals: disabled. Import `describe`, `expect`, `it`, `beforeEach`, `afterEach`, and `vi` explicitly from `vitest`.
- Playwright 1.61.1 for local browser, accessibility, and deploy-smoke tests.
- Config: `playwright.config.ts`
- Deploy-smoke config: `playwright.deploy-smoke.config.ts`
- Promptfoo 0.120.3 for answer-gate and follow-up-chip evals before the Vitest eval lane.
- Config: `eval/answer/promptfooconfig.yaml`

**Assertion Library:**
- Vitest `expect` and `expectTypeOf`.
- Playwright `expect`.
- Promptfoo JavaScript assertions in `eval/answer/assertions/expect-gate.mjs` and `eval/answer/assertions/expect-chip.mjs`.

**Run Commands:**
```bash
npm test                         # Run all Vitest tests matching vitest.config.ts
npm run test:unit                # Run tests/unit
npm run test:integration         # Run tests/integration
npm run test:types               # Run tests/types
npm run test:imports             # Run import boundary guardrails in clean scan mode
npm run test:imports:fixtures    # Run import boundary guardrails against negative fixtures
npm run test:source-mining       # Run source-mining scanner in clean scan mode
npm run test:source-mining:fixtures # Run source-mining scanner against negative fixtures
npm run test:ts-standards        # Run TypeScript standards scanner in clean scan mode
npm run test:ts-standards:fixtures # Run TypeScript standards scanner against negative fixtures
npm run test:copy                # Run public/capability copy guardrails
npm run test:copy:fixtures       # Run copy guardrails against negative fixtures
npm run test:seo                 # Run SEO and discovery-file tests
npm run test:ui-contract         # Run UI contract scans
npm run test:ui-contract:fixtures # Run UI contract scans against negative fixtures
npm run test:eval                # Run Promptfoo eval and tests/eval
npm run test:eval:validate       # Validate Promptfoo eval config
npm run test:e2e                 # Run all Playwright local e2e tests
npm run test:a11y                # Run Playwright accessibility tests
npm run test:deploy-smoke        # Run Phase 1 deployed readback smoke
npm run test:all                 # Typecheck, Convex codegen dry-run, major Vitest lanes, and build
npm run test:release             # Release gate including e2e, a11y, eval, and build
```

## Test File Organization

**Location:**
- Unit tests: `tests/unit/**` with domain subdirectories such as `tests/unit/business/`, `tests/unit/answer/`, `tests/unit/convex/`, and `tests/unit/observability/`.
- Integration tests: `tests/integration/**`, often importing route handlers directly from `src/routes/*`.
- Type contract tests: `tests/types/**`.
- Static guardrail tests: `tests/imports/**`, `tests/copy/**`, `tests/ui-contract/**`, and `tests/seo/**`.
- Browser tests: `tests/e2e/**` and `tests/e2e/a11y/**`.
- Deploy smoke tests: `tests/deploy-smoke/**`.
- Shared test helpers: `tests/helpers/source-ports.ts`, `tests/helpers/answer-thread-test-port.ts`, and `tests/helpers/source-write-admission.ts`.
- Negative fixtures: `tests/fixtures/bad-*`.
- Promptfoo eval assets: `eval/answer/**`.

**Naming:**
- Use `*.test.ts` or `*.test.tsx` for Vitest files.
- Use `*.spec.ts` for Playwright files.
- Use descriptive domain names in test files: `tests/unit/business/claim.test.ts`, `tests/integration/agent-tools-api.test.ts`, `tests/ui-contract/public-language-copy.test.ts`.

**Structure:**
```text
tests/
├── unit/              # Pure domain, source runtime, provider, and module contract tests
├── integration/       # Route handler and cross-module behavior tests
├── types/             # expectTypeOf and @ts-expect-error contracts
├── imports/           # Static boundary and TypeScript scanner tests
├── copy/              # Public/capability copy claim guardrails
├── seo/               # SEO, discovery files, JSON-LD, noindex, llms/sitemap/robots
├── ui-contract/       # UI class and public language contract scans
├── e2e/               # Local Playwright flows and accessibility tests
├── deploy-smoke/      # Deployed route, provider, and readback smoke tests
├── eval/              # Vitest answer pipeline evals
├── fixtures/          # Negative scanner fixtures
└── helpers/           # Source-port, thread-port, and source-write test helpers
```

**Counts by lane:**
- `tests/unit`: 74 test files
- `tests/integration`: 20 test files
- `tests/e2e`: 8 spec files including `tests/e2e/a11y`
- `tests/deploy-smoke`: 6 spec files
- `tests/ui-contract`: 6 test files
- `tests/imports`: 5 test files
- `tests/copy`: 5 test files
- `tests/seo`: 5 test files
- `tests/types`: 3 test files
- `tests/eval`: 1 test file

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

**Patterns:**
- Put one domain or route contract per `describe` block: `claimBusiness` in `tests/unit/business/claim.test.ts`, `POST /api/agent/tools` in `tests/integration/agent-tools-api.test.ts`.
- Build explicit source state in the test with `createEmpty*SourceState` or `createDefault*SourceState`, then call pure functions directly.
- Assert both the returned result and state side effects for domain mutations, as in `tests/unit/business/claim.test.ts`.
- For route integration tests, import exported handlers and call them with synthetic `Request` objects: `handleInvokeAgentTool` in `tests/integration/agent-tools-api.test.ts`.
- For stream/generator behavior, collect async events with `for await` and assert the final event shape, as in `tests/unit/answer/synthesize-with-fallback.test.ts`.
- For scanner tests, run clean targets by default and negative fixture targets under `AE_SCAN_MODE=fixtures`: `tests/imports/private-imports.test.ts`, `tests/ui-contract/class-scan.test.ts`, and `tests/copy/phase1-banned-copy.test.ts`.
- For Playwright, use role and label locators rather than CSS selectors wherever possible: `tests/e2e/public-owner-ui.spec.ts` and `tests/e2e/a11y/public-owner-a11y.spec.ts`.

## Mocking

**Framework:** Vitest `vi`

**Patterns:**
```typescript
import { afterEach, describe, expect, it, vi } from 'vitest'

import { readPublicRegistrySearchPage } from '@/modules/registry/registry.functions'

vi.mock('@/lib/server/convex-source', () => ({
  callPublicSourceQuery: vi.fn(async () => {
    throw new Error('convex unavailable')
  }),
  sourceQuery: (name: string) => name,
}))

describe('registry convex fallback', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })
})
```

**What to Mock:**
- Mock external transports and provider boundaries: Convex source calls in `tests/unit/registry/registry-fallback.test.ts`, `globalThis.fetch` in `tests/unit/billing/autumn-provider.test.ts`, and answer prose generation in `tests/unit/answer/synthesize-with-fallback.test.ts`.
- Use explicit source-port test seams for source state: `withRegistrySourcePortForTest` and `withDiscoverySourcePortForTest` in `tests/helpers/source-ports.ts`.
- Use answer-thread port seams for persistence behavior: `installAnswerThreadTestPort` in `tests/helpers/answer-thread-test-port.ts`.
- Use source-write helper signatures for mutation admission paths: `sourceWriteAdmission` and `withSourceWrite` in `tests/helpers/source-write-admission.ts`.
- Clean up process environment mutations in `afterEach`, as in `tests/unit/answer/synthesize-with-fallback.test.ts`.
- Restore global replacements in `afterEach`, as in `tests/unit/billing/autumn-provider.test.ts`.

**What NOT to Mock:**
- Do not mock the domain function under test. Call functions such as `claimBusiness`, `publishBusinessCatalog`, `runAnswerGate`, and `syncCatalogProjection` directly.
- Do not mock guardrail scanners when testing clean-vs-fixture behavior. Use `scanUiContract`, `scanCopyClaims`, `scanPrivateImports`, and `scanTypeScriptStandards` directly from `src/lib/ui/contract-scans.ts`.
- Do not mock route handlers in integration tests. Import handlers such as `handleListAgentTools`, `handleInvokeAgentTool`, and `handleAnswerTurnRequest` directly.
- Do not depend on real secrets or live provider credentials in unit/integration tests. Use test-only values and local source ports.

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

**Location:**
- Local helpers live beside the test when specific to one test file, such as `validFacts`, `validSecurity`, and `rateLimit` in `tests/unit/business/claim.test.ts`.
- Reusable helpers live in `tests/helpers/`: `tests/helpers/source-ports.ts`, `tests/helpers/answer-thread-test-port.ts`, and `tests/helpers/source-write-admission.ts`.
- Negative scanner fixtures live under `tests/fixtures/bad-copy/`, `tests/fixtures/bad-imports/`, `tests/fixtures/bad-source-mining/`, `tests/fixtures/bad-ts-standards/`, and `tests/fixtures/bad-ui-contract/`.
- Domain default fixture builders live in modules when used by production fallback and tests: `createDefaultRegistrySourceState` in `src/modules/registry/public.ts` and dev seed data in `src/modules/dev/internal/dev-seed-fixture.ts`.

## Coverage

**Requirements:** None enforced

**View Coverage:**
```bash
Not configured
```

- No coverage script is defined in `package.json`.
- No coverage thresholds are configured in `vitest.config.ts`.
- Use targeted lane commands plus `npm run test:all` or `npm run test:release` as the practical quality gate.

## Test Types

**Unit Tests:**
- Scope: pure domain operations, source-state transitions, provider adapters, security decisions, observability contracts, schema validators, and deterministic answer behavior.
- Location: `tests/unit/**`.
- Approach: create in-memory source state, call exported public seams or targeted internals, assert exact result codes and state changes.
- Examples: `tests/unit/business/claim.test.ts`, `tests/unit/catalog/publish.test.ts`, `tests/unit/security/csrf-rate-limit.test.ts`, `tests/unit/answer/answer-gate.test.ts`, `tests/unit/convex/inquiries-runtime.test.ts`.

**Integration Tests:**
- Scope: route handlers, discovery APIs, source-port fallbacks, route parity, and cross-module workflows.
- Location: `tests/integration/**`.
- Approach: import route handler functions, build `Request` objects, call handlers directly, and assert status/body/readback behavior.
- Examples: `tests/integration/agent-tools-api.test.ts`, `tests/integration/registry-api.test.ts`, `tests/integration/discovery-routes.test.ts`, `tests/integration/answer-turn-empty-state.test.ts`.

**Type Contract Tests:**
- Scope: exported union types, Zod validators, exact literals, and compile-time invalid examples.
- Location: `tests/types/**`.
- Approach: use `expectTypeOf`, `z.infer`, and `@ts-expect-error`.
- Example: `tests/types/domain-contracts.test.ts`.

**Static Guardrail Tests:**
- Scope: forbidden imports, runtime source-mining drift, TypeScript type holes, public copy overclaims, UI class drift, and public language restrictions.
- Location: `tests/imports/**`, `tests/copy/**`, and `tests/ui-contract/**`.
- Approach: scanners in `src/lib/ui/contract-scans.ts` run on clean runtime targets and negative fixtures.

**SEO and Discovery Tests:**
- Scope: public business SEO, discovery files, noindex posture, business-action claims, developer discovery.
- Location: `tests/seo/**`.
- Examples: `tests/seo/discovery-files.test.ts`, `tests/seo/public-business-seo.test.ts`, `tests/seo/protected-action-noindex.test.ts`.

**Eval Tests:**
- Scope: answer grounding, answer gate, follow-up chips, prompt injection detection, and catalog parity.
- Location: `eval/answer/**` and `tests/eval/answer-pipeline.test.ts`.
- Command: `npm run test:eval` runs Promptfoo with `eval/answer/promptfooconfig.yaml`, then Vitest on `tests/eval`.

**E2E Tests:**
- Framework: Playwright.
- Location: `tests/e2e/**`.
- Config: `playwright.config.ts`.
- Projects: compact Chromium viewport `375x812` and wide Chromium viewport `1440x1100`.
- Local server: `npm run dev -- --port 3020 --strictPort --host 127.0.0.1`.
- Local e2e env: `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E=true`.
- Approach: assert user-visible workflows, accessibility, no private/public language leakage, focus behavior, screenshots for selected operator evidence.
- Examples: `tests/e2e/public-owner-ui.spec.ts`, `tests/e2e/thread-first.spec.ts`, `tests/e2e/a11y/public-owner-a11y.spec.ts`.

**Deploy Smoke Tests:**
- Framework: Playwright request contexts.
- Location: `tests/deploy-smoke/**`.
- Config: `playwright.deploy-smoke.config.ts`.
- Approach: read environment-driven deployed URLs/storage states, check HTTP status/content-type/cache/CORS/body contracts, and validate auth boundaries.
- Examples: `tests/deploy-smoke/phase1-deploy-smoke.spec.ts`, `tests/deploy-smoke/phase6-business-action-stripe-smoke.spec.ts`.

## Common Patterns

**Async Testing:**
```typescript
await withRegistrySourcePortForTest(state, async () => {
  const events: AnswerEvent[] = []
  for await (const event of synthesizeAnswerWithFallback({ query, limit: 10 })) {
    events.push(event)
  }
  expect(events.at(-1)?.type).toBe('complete')
})
```

**Error Testing:**
```typescript
expect(result).toMatchObject({
  kind: 'error',
  code: 'claim_rate_limited',
  retryable: true,
})
```

**Route Handler Testing:**
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

**Scanner Fixture Testing:**
```typescript
const violations = scanPrivateImports(
  isFixtureMode() ? fixtureTargets('tests/fixtures/bad-imports/private-import.fixture') : cleanRuntimeTargets()
)

if (isFixtureMode()) {
  expect(violations.map((violation) => violation.rule)).toContain('module-private-import')
  return
}

expect(violations).toEqual([])
```

**Playwright Testing:**
```typescript
await page.goto('/registry')
await expect(page.getByLabel('Business, service, or place')).toBeVisible()
await page.getByLabel('Business, service, or place').fill('emergency plumber parramatta')
await page.getByRole('button', { name: /^search businesses$/i }).click()
await expect(page).toHaveURL(/q=emergency\+plumber\+parramatta/)
```

---

*Testing analysis: 2026-06-30*
