# Testing Patterns

**Analysis Date:** 2026-07-02

## Test Framework

**Runner:**
- Vitest `4.1.9` for unit, integration, type-contract, static-scan, SEO, copy, UI-contract, and eval tests.
- Config: `vitest.config.ts`
- Vitest environment defaults to `node`; component tests opt into jsdom per file with `/** @vitest-environment jsdom */`, as in `tests/unit/chat/ae-chat-route-promotion.test.tsx` and `tests/unit/observability/error-boundary-client.test.tsx`.
- Playwright `1.61.1` for local browser E2E, accessibility, and deployed smoke tests.
- Config: `playwright.config.ts` for local browser tests and `playwright.deploy-smoke.config.ts` for deployed smoke tests.

**Assertion Library:**
- Vitest `expect`, `expectTypeOf`, `vi`, `describe`, `it`, `afterEach`.
- Playwright `expect`, `test`, page/request fixtures, and locator assertions.
- Testing Library React in jsdom component tests; examples: `tests/unit/chat/ae-chat-route-promotion.test.tsx`, `tests/unit/observability/error-boundary-client.test.tsx`.
- Promptfoo is used through `eval/answer/promptfooconfig.yaml` and `package.json` scripts for answer gate and follow-up evals.

**Run Commands:**
```bash
npm test                         # Run all Vitest tests matching tests/**/*.test.ts(x)
npm run test:unit                # Run tests/unit
npm run test:integration         # Run tests/integration
npm run test:e2e                 # Run Playwright tests/e2e
npm run test:a11y                # Run Playwright tests/e2e/a11y
npm run test:copy                # Run public copy guardrail tests
npm run test:ui-contract         # Run UI contract scans
npm run test:imports             # Run import-boundary guardrails
npm run test:source-mining       # Run source-mining guardrails
npm run test:ts-standards        # Run runtime TypeScript standards scans
npm run test:seo                 # Run SEO/discovery tests
npm run test:types               # Run type-contract tests
npm run test:eval                # Run answer eval coverage, report, promptfoo, and Vitest evals
npm run test:all                 # Run typecheck, Convex codegen dry run, core test suites, and build
npm run test:release             # Run release gate including eval, E2E, a11y, and build
```

## Test File Organization

**Location:**
- Unit tests live under `tests/unit/<area>/`; examples: `tests/unit/registry/registry-fallback.test.ts`, `tests/unit/answer/answer-gate.test.ts`, `tests/unit/convex/registry-runtime.test.ts`.
- Integration tests live under `tests/integration/`; examples: `tests/integration/agent-tools-api.test.ts`, `tests/integration/registry-api.test.ts`, `tests/integration/answer-turn-empty-state.test.ts`.
- Static guardrails live under `tests/imports/`, `tests/copy/`, and `tests/ui-contract/`; examples: `tests/imports/ts-standards.test.ts`, `tests/copy/phase1-banned-copy.test.ts`, `tests/ui-contract/class-scan.test.ts`.
- Browser tests live under `tests/e2e/` and `tests/e2e/a11y/`; examples: `tests/e2e/public-owner-ui.spec.ts`, `tests/e2e/a11y/public-owner-a11y.spec.ts`.
- Deploy smoke tests live under `tests/deploy-smoke/`; examples: `tests/deploy-smoke/phase1-deploy-smoke.spec.ts`, `tests/deploy-smoke/phase2-resend-dispatch-smoke.spec.ts`.
- Eval tests and harness code live under `tests/eval/` and `eval/answer/`; examples: `tests/eval/answer-pipeline.test.ts`, `eval/answer/lib/cases.ts`, `eval/answer/scripts/run-suite.ts`.
- Shared helpers live under `tests/helpers/`; examples: `tests/helpers/source-ports.ts`, `tests/helpers/source-write-admission.ts`, `tests/helpers/answer-thread-test-port.ts`.
- Negative scanner fixtures live under `tests/fixtures/`; examples: `tests/fixtures/bad-copy/`, `tests/fixtures/bad-imports/`, `tests/fixtures/bad-ts-standards/`.

**Naming:**
- Use `*.test.ts` or `*.test.tsx` for Vitest suites.
- Use `*.spec.ts` for Playwright suites.
- Name tests after behavior or product contract, not implementation mechanics; examples: `tests/unit/server/source-readback-truth.test.ts`, `tests/integration/discovery-prompt-injection.test.ts`, `tests/e2e/thread-first.spec.ts`.

**Structure:**
```text
tests/
├── unit/            # Pure domain, component, Convex runtime, and seam tests
├── integration/     # Route handlers, multi-module flows, source-port behavior
├── e2e/             # Local Playwright browser flows
├── e2e/a11y/        # Keyboard, labels, focus, layout overflow checks
├── deploy-smoke/    # Deployed environment smoke checks
├── imports/         # Import/source/type standards scanners
├── copy/            # Trust-boundary and public copy scanners
├── ui-contract/     # Styling/layout contract scanners
├── seo/             # Discovery, llms.txt, sitemap, robots, SEO contracts
├── types/           # expectTypeOf and @ts-expect-error contracts
├── eval/            # Vitest wrapper around eval/answer harness
├── fixtures/        # Bad fixtures for scanner fixture mode
└── helpers/         # Shared source ports, admission helpers, thread stores
```

## Test Structure

**Suite Organization:**
```typescript
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createDefaultRegistrySourceState } from '@/modules/registry/public'
import { withRegistrySourcePortForTest } from '../helpers/source-ports'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('POST /api/agent/tools registry search', () => {
  it('invokes registry.search and returns the public catalog page', async () => {
    const state = createDefaultRegistrySourceState()
    await withRegistrySourcePortForTest(state, async () => {
      const response = await handleInvokeAgentTool(new Request('https://ae.example/api/agent/tools'))
      expect(response.status).toBe(200)
    })
  })
})
```

**Patterns:**
- Use `describe` blocks by route, module, or contract; examples: `tests/integration/agent-tools-api.test.ts`, `tests/unit/schema/convex-schema.test.ts`.
- Use `afterEach` to reset global seams, env vars, and mocks; examples: `tests/unit/answer/answer-tool-use-agent.test.ts`, `tests/unit/answer/openrouter-models.test.ts`, `tests/integration/answer-turn-gate-fallback.test.ts`.
- Use helper wrappers that install a test port and reset it in `finally`; examples: `withRegistrySourcePortForTest` and `withDiscoverySourcePortForTest` in `tests/helpers/source-ports.ts`.
- Use table-driven assertions with `it.each` for shared contract examples; examples: `tests/eval/answer-pipeline.test.ts`, `tests/copy/claims-register.test.ts`, `tests/ui-contract/public-layout-contract.test.ts`.
- For HTTP route handlers, instantiate `Request`, call exported handlers directly, assert `Response.status`, then parse `response.json()` or `response.text()`; examples: `tests/integration/agent-tools-api.test.ts`, `tests/seo/discovery-files.test.ts`.
- For Playwright, prefer role/label locators and user-visible assertions; examples: `tests/e2e/public-owner-ui.spec.ts`, `tests/e2e/a11y/public-owner-a11y.spec.ts`.

## Mocking

**Framework:** Vitest `vi.mock`, `vi.spyOn`, test seam setters, fake in-memory ports, and fake Convex DB/query classes.

**Patterns:**
```typescript
vi.mock('@/lib/server/convex-source', () => ({
  callPublicSourceQuery: vi.fn(async () => {
    throw new Error('convex unavailable')
  }),
  sourceQuery: (name: string) => name,
}))

const reset = setPublicRegistrySourcePortForTests({
  list: async (input) => listPublicBusinessCatalog(state, input),
  search: async (input) => searchPublicBusinessCatalog(state, input),
  detail: async (input) => getPublicBusinessCatalogBySlug(state, input),
})
try {
  // assertions
} finally {
  reset()
}
```

**What to Mock:**
- Mock external LLM/API calls with `vi.spyOn(globalThis, 'fetch')`; example: `tests/unit/answer/answer-tool-use-agent.test.ts`.
- Mock module seams through `set...ForTests` helpers; examples: `setAnswerToolUseAgentForTests` in `src/modules/answer/internal/answer-tool-use-agent.ts`, `setAnswerThreadPortForTests` in `src/modules/answer-thread/answer-thread.functions.ts`.
- Mock React dependencies in jsdom component tests with `vi.mock`; examples: router and UI component mocks in `tests/unit/chat/ae-chat-route-promotion.test.tsx`.
- Use fake Convex DB/query classes for Convex runtime behavior tests; examples: `tests/unit/convex/registry-runtime.test.ts`, `tests/unit/convex/source-state.test.ts`.
- Use local deterministic source states instead of live data for route/integration tests; examples: `createDefaultRegistrySourceState` in `src/modules/registry/public.ts`, `createDefaultDiscoverySourceState` in `src/modules/discovery/public.ts`.

**What NOT to Mock:**
- Do not mock the module under test; call the exported public seam, route handler, or Convex handler directly.
- Do not mock static scanners when testing guardrails; scanner tests call `scanTypeScriptStandards`, `scanPrivateImports`, `scanCopyClaims`, and `scanUiContract` from `src/lib/ui/contract-scans.ts`.
- Do not mock browser behavior in Playwright E2E; use `playwright.config.ts` local web server and role/label locators.
- Do not put production secrets in tests. Use env var names and local test values only; examples: `tests/helpers/source-write-admission.ts`, `tests/deploy-smoke/phase1-deploy-smoke.spec.ts`.

## Fixtures and Factories

**Test Data:**
```typescript
function businessDto(overrides: Partial<PublicBusinessCatalogApiDto> = {}): PublicBusinessCatalogApiDto {
  return {
    slug: 'parramatta-emergency-plumbing',
    name: 'Parramatta Emergency Plumbing',
    publicStatus: 'published',
    services: [serviceDto()],
    ...overrides,
  }
}
```

**Location:**
- Inline factories live near the tests that need them; examples: `businessDto` and `serviceDto` in `tests/unit/registry/registry-fallback.test.ts`, `seedCatalogs` in `tests/unit/convex/registry-runtime.test.ts`.
- Shared source-port fixtures live in `tests/helpers/source-ports.ts`.
- Source-write admission test helpers live in `tests/helpers/source-write-admission.ts`.
- Answer-thread in-memory store helpers live in `tests/helpers/answer-thread-test-port.ts`.
- Bad scanner fixtures live in `tests/fixtures/bad-*` and are selected with `AE_SCAN_MODE=fixtures`.
- Eval case fixtures live in `eval/answer/lib/cases.ts` and broad registry seed data lives in `eval/answer/lib/registry-seed.ts`.

## Coverage

**Requirements:** No Istanbul/V8 coverage threshold is configured in `vitest.config.ts`. Coverage is enforced by custom product and guardrail suites:
- `tests/eval/answer-pipeline.test.ts` and `eval/answer/lib/coverage.ts` require answer eval dimensions, promptfoo synchronization, timing assertions, and a broad seed of at least 100 businesses.
- `eval/answer/README.md` documents a deterministic answer-eval product score threshold of 9/10 per case.
- `tests/imports/ts-standards.test.ts` enforces runtime TypeScript standards.
- `tests/copy/phase1-banned-copy.test.ts` and related copy tests enforce AE trust-boundary copy.
- `tests/ui-contract/class-scan.test.ts` enforces UI token/style constraints for routes and AE components.

**View Coverage:**
```bash
npm run test:eval:coverage       # Audit answer eval coverage and promptfoo sync
npm run test:eval:report         # Write output/eval/answer-suite-report.json
npm run test:all                 # Run the main non-E2E gate plus build
npm run test:release             # Run the full release gate
```

## Test Types

**Unit Tests:**
- Scope: pure domain logic, validators, presentation helpers, source-state adapters, Convex handler behavior, component state, and test seams.
- Use paths under `tests/unit/`.
- Examples: `tests/unit/business/claim.test.ts`, `tests/unit/catalog/publish.test.ts`, `tests/unit/answer/answer-gate.test.ts`, `tests/unit/convex/registry-runtime.test.ts`.
- Convex tests currently live under `tests/unit/convex/` and extract `_handler` from registered functions with typed fake contexts. `convex/_generated/ai/guidelines.md` describes `convex-test` as the official Convex test approach; this repo's current Vitest config uses `environment: 'node'`, not `edge-runtime`.

**Integration Tests:**
- Scope: route handlers, multi-module flows, source ports, session behavior, tool calls, and public API parity.
- Use paths under `tests/integration/`.
- Examples: `tests/integration/agent-tools-api.test.ts`, `tests/integration/registry-api.test.ts`, `tests/integration/discovery-route-parity.test.ts`, `tests/integration/answer-turn-intent-routing.test.ts`.

**E2E Tests:**
- Framework: Playwright.
- Local config: `playwright.config.ts`.
- Scope: public/owner/admin browser flows, keyboard accessibility, layout overflow, and trust-boundary copy.
- Examples: `tests/e2e/public-owner-ui.spec.ts`, `tests/e2e/thread-first.spec.ts`, `tests/e2e/a11y/public-owner-a11y.spec.ts`.
- Local browser tests start `npm run dev -- --port 3020 --strictPort --host 127.0.0.1` and set `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E` in the Playwright web server environment.

**Deploy Smoke Tests:**
- Framework: Playwright with `playwright.deploy-smoke.config.ts`.
- Scope: deployed public routes, protected routes, provider dispatches, billing/business-action provider smoke, and explicit HTTPS Convex deployment checks.
- Examples: `tests/deploy-smoke/phase1-deploy-smoke.spec.ts`, `tests/deploy-smoke/phase2-resend-dispatch-smoke.spec.ts`, `tests/deploy-smoke/phase6-business-action-stripe-smoke.spec.ts`.
- Deploy smoke tests read required env var names and storage-state file paths but must not commit storage state or secrets.

**Static Contract Tests:**
- Import boundaries: `tests/imports/private-imports.test.ts`, `tests/imports/route-boundary.test.ts`.
- Type standards: `tests/imports/ts-standards.test.ts`.
- Copy safety: `tests/copy/`.
- UI styling/layout contracts: `tests/ui-contract/`.
- SEO/discovery contracts: `tests/seo/`.
- Type-only contracts: `tests/types/` with `expectTypeOf` and `@ts-expect-error`.

**Eval Tests:**
- Vitest wrapper: `tests/eval/answer-pipeline.test.ts`.
- Shared case catalog: `eval/answer/lib/cases.ts`.
- Promptfoo config: `eval/answer/promptfooconfig.yaml`.
- Report writer: `eval/answer/scripts/run-suite.ts`.
- Use these tests for answer grounding, tool-input evidence, copy safety, timing budgets, and follow-up behavior.

## Common Patterns

**Async Testing:**
```typescript
await expect(readPublicRegistryCatalogPage({ limit: 10 })).resolves.toMatchObject({
  items: [{ slug: 'parramatta-emergency-plumbing' }],
})

await withRegistrySourcePortForTest(state, async () => {
  const response = await handleInvokeAgentTool(request)
  expect(response.status).toBe(200)
})
```

**Error Testing:**
```typescript
await expect(
  runAnswerToolUseAgent({
    query: 'compare the first two',
    disableTools: true,
    config: { apiKey: 'test-key', model: 'test-model' },
  }),
).rejects.toMatchObject({ code: 'tool_unavailable' })

const response = await handleInvokeAgentTool(invalidRequest)
expect(response.status).toBe(400)
await expect(response.json()).resolves.toMatchObject({
  kind: 'error',
  code: 'agent_tools_invalid_input',
  retryable: false,
})
```

**Environment Testing:**
- Snapshot prior env values, mutate only inside the test, and restore in `finally`; examples: `tests/unit/server/source-readback-truth.test.ts`, `tests/unit/server/protected-action-server-seams.test.ts`, `tests/unit/answer/llm-config-modes.test.ts`.
- Delete env vars to test missing-config behavior rather than assigning secret-like placeholders.

**Browser Testing:**
- Use `page.getByRole`, `page.getByLabel`, and `page.locator` assertions; examples: `tests/e2e/public-owner-ui.spec.ts`, `tests/e2e/a11y/public-owner-a11y.spec.ts`.
- Assert both positive UI behavior and negative trust-boundary leakage; examples: `assertPublicLanguage` in `tests/e2e/public-owner-ui.spec.ts`, private data patterns in `tests/deploy-smoke/phase1-deploy-smoke.spec.ts`.
- Write screenshots only to `output/playwright/` when artifacts are needed; example: `phase2ArtifactDir` in `tests/e2e/public-owner-ui.spec.ts`.

---

*Testing analysis: 2026-07-02*
