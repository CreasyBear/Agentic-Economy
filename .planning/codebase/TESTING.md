# Testing Patterns

**Analysis Date:** 2026-07-04

## Test Framework

**Runner:**
- Vitest 4.1.9 for unit, integration, type-contract, import, copy, UI-contract, SEO, eval, dev-smoke, spike, and script tests.
- Config: `vitest.config.ts`
- Playwright 1.61.1 for browser E2E, accessibility, and deployed smoke tests.
- Config: `playwright.config.ts` and `playwright.deploy-smoke.config.ts`
- Promptfoo is used for answer-gate and follow-up chip evals.
- Config: `eval/answer/promptfooconfig.yaml`

**Assertion Library:**
- Vitest `expect`, `expectTypeOf`, `describe`, `it`, `test`, and `vi`.
- Testing Library React helpers from `@testing-library/react` for component tests.
- Playwright `expect` and role/text locators for browser tests.
- Promptfoo JavaScript assertions from `eval/answer/assertions/*.mjs`.

**Run Commands:**
```bash
npm test                         # Run all Vitest tests matching tests/**/*.test.ts(x)
npm run test:unit                # Run tests/unit
npm run test:integration         # Run tests/integration
npm run test:e2e                 # Run Playwright tests/e2e
npm run test:a11y                # Run Playwright tests/e2e/a11y
npm run test:eval                # Run answer eval coverage, report, promptfoo, and tests/eval
npm run test:all                 # Typecheck, Convex codegen dry-run, unit/integration/guardrail/build suite
npm run test:release             # Release gate including eval, graph freshness, copy, UI contract, E2E, a11y, and build
npx vitest                       # Watch mode; no package script is defined
```

## Test File Organization

**Location:**
- Tests live under `tests/`, not co-located with source. There are 205 first-party `*.test.*` / `*.spec.*` files as of this analysis.
- Unit tests are grouped by domain under `tests/unit/<domain>/`, for example `tests/unit/inquiries/inquiry-flow.test.ts` and `tests/unit/registry/search-documents.test.ts`.
- Integration tests live directly under `tests/integration/`, for example `tests/integration/registry-api.test.ts` and `tests/integration/agent-tools-api.test.ts`.
- Contract/guardrail tests have dedicated directories: `tests/types/`, `tests/imports/`, `tests/copy/`, `tests/ui-contract/`, `tests/seo/`, and `tests/eval/`.
- Browser tests live under `tests/e2e/`; accessibility browser tests live under `tests/e2e/a11y/`; deployed checks live under `tests/deploy-smoke/`.
- Shared helpers live in `tests/helpers/`, including `tests/helpers/openrouter-contract-server.ts`, `tests/helpers/source-write-admission.ts`, and `tests/helpers/answer-thread-test-port.ts`.

**Naming:**
- Use `*.test.ts` or `*.test.tsx` for Vitest.
- Use `*.spec.ts` for Playwright.
- Name files after the unit or contract being protected: `tests/unit/answer/answer-gate.test.ts`, `tests/imports/route-boundary.test.ts`, `tests/ui-contract/public-layout-contract.test.ts`.

**Structure:**
```text
tests/
├── unit/<domain>/*.test.ts(x)      # Pure domain, UI component, Convex bridge, helper tests
├── integration/*.test.ts           # Route/API/server seam behavior
├── imports/*.test.ts               # Import and TypeScript guardrail scans
├── copy/*.test.ts                  # AE trust/copy overclaim scans
├── ui-contract/*.test.ts           # Design and layout contract scans
├── types/*.test.ts                 # Type/runtime literal alignment
├── seo/*.test.ts                   # SEO/discovery file contracts
├── eval/*.test.ts                  # Answer/evidence eval integration
├── e2e/**/*.spec.ts                # Local Playwright browser flows
├── deploy-smoke/*.spec.ts          # Deployed Playwright smoke checks
└── helpers/*.ts                    # Test ports, fake servers, source-write helpers
```

## Test Structure

**Suite Organization:**
```typescript
import { describe, expect, it } from 'vitest'

describe('registry public API routes', () => {
  it('lists eligible public business catalogs without private fields', async () => {
    const response = handleListBusinessesRequest(
      new Request('https://ae.example/api/businesses?limit=1'),
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(JSON.stringify(body)).not.toMatch(/businessId|serviceId|ownerId|rawContact/)
  })
})
```

**Patterns:**
- Assert both positive behavior and forbidden leakage. Examples: `tests/integration/registry-api.test.ts`, `tests/seo/public-business-seo.test.ts`, and `tests/integration/agent-tools-api.test.ts`.
- Narrow discriminated unions before reading variant-specific fields:

```typescript
expect(submit.kind).toBe('ok')
if (submit.kind !== 'ok') throw new Error(submit.code)
expect(submit.state.threads).toHaveLength(1)
```

- Use route handler functions directly for API tests instead of spinning up a server when possible: `handleSearchBusinessesRequest` in `tests/integration/registry-api.test.ts`, `handleInvokeAgentTool` in `tests/integration/agent-tools-api.test.ts`.
- Use environment save/restore in `try/finally` whenever a test mutates `process.env`, as in `tests/integration/registry-api.test.ts` and `tests/unit/inquiries/inquiry-slug-target.test.ts`.
- Component tests that need DOM use a file-level `@vitest-environment jsdom` comment and call `cleanup()` in `afterEach`, as in `tests/unit/chat/ae-follow-up-chips.test.tsx`.

## Mocking

**Framework:** Vitest `vi`, local fake classes, test ports, and local HTTP servers.

**Patterns:**
```typescript
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function stubDeterministicChips() {
  vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ llmChipsEnabled: false })))
}
```

Use `vi.mock` for high-level component isolation when rendering route-level components, as in `tests/unit/chat/ae-chat-route-promotion.test.tsx`.

Use local HTTP contract servers for model/provider integrations:

```typescript
const server = await startOpenRouterContractServer(openRouterToolThenProseResponses({
  toolCalls: [{ toolId: 'registry.search', input: { query: 'parramatta' } }],
  prose: { oneLine: 'One listed business matches.', summary: '...', whatToDoNow: '...' },
}))
const restoreEnv = server.installEnv()
try {
  // run test
} finally {
  restoreEnv()
  await server.close()
}
```

Use test ports for module seams. `tests/helpers/answer-thread-test-port.ts` installs an in-memory `AnswerThreadPort` through `src/modules/answer-thread/testing.ts`.

**What to Mock:**
- Network/model/provider boundaries: OpenRouter via `tests/helpers/openrouter-contract-server.ts`, Web Bot Auth directory servers in `tests/integration/agent-tools-api.test.ts`, and source-write admission via `tests/helpers/source-write-admission.ts`.
- Browser globals and `fetch` for deterministic component behavior.
- Convex runtime storage/queries with local fake DB classes when testing adapter behavior, as in `tests/unit/convex/source-state.test.ts` and `tests/unit/convex/inquiries-runtime.test.ts`.
- UI child components only when a route/component test targets parent state transitions, as in `tests/unit/chat/ae-chat-route-promotion.test.tsx`.

**What NOT to Mock:**
- Pure domain command functions in `src/modules/*/internal/*.ts`; tests should use real state factories and assert state changes.
- Public route/readback helpers when the test protects API or copy contracts; use real handlers and readbacks.
- AE trust/copy boundaries; tests should scan real source targets through `src/lib/ui/contract-scans.ts`.

## Fixtures and Factories

**Test Data:**
```typescript
const target = {
  businessId,
  serviceId,
  capabilityKind: 'phone_inquiry',
} as const

const submitted = inquiries.submitInquiry(sourceState(), submitCommand('submit', {
  body: 'Pipe burst under the kitchen sink. Can someone contact me today?',
  contact: { name: 'Sam Customer', email: 'sam.customer@example.test' },
  notificationStatus: 'queued',
}))
```

**Location:**
- Inline factories are common inside unit tests: `sourceState`, `submitCommand`, `operationKey`, and `correlationId` in `tests/unit/inquiries/inquiry-flow.test.ts`.
- Shared helpers live in `tests/helpers/`.
- Negative scanner fixtures live in `tests/fixtures/bad-copy/`, `tests/fixtures/bad-imports/`, `tests/fixtures/bad-ui-contract/`, `tests/fixtures/bad-source-mining/`, and `tests/fixtures/bad-ts-standards/`.
- Eval cases live in `eval/answer/lib/cases.ts`; broad catalog seed lives in `eval/answer/lib/registry-seed.ts`.
- Promptfoo assertions live in `eval/answer/assertions/`.

## Coverage

**Requirements:** No generic line/branch coverage threshold is enforced. Quality coverage is enforced through contract-specific gates:
- `npm run test:eval:coverage` verifies answer eval case coverage, promptfoo sync, timing/evidence assertions, and broad-seed counts.
- `npm run test:graph-freshness` verifies `.planning/graphs/GRAPH_REPORT.md` and `.planning/graphs/graph.json` freshness against source changes.
- `npm run test:imports`, `npm run test:copy`, `npm run test:ui-contract`, and `npm run test:types` enforce architecture, copy, UI, and type contracts.
- `npm run test:release` is the broad release gate.

**View Coverage:**
```bash
npm run test:eval:coverage       # Eval case coverage audit
npm run test:eval:report         # Writes output/eval/answer-suite-report.json
npm run test:graph-freshness     # Operational graph freshness gate
```

## Test Types

**Unit Tests:**
- Scope and approach: Pure domain behavior, validators, helpers, UI component rendering, Convex adapter bridges, and module contracts.
- Examples: `tests/unit/inquiries/inquiry-flow.test.ts`, `tests/unit/security/admin-authority.test.ts`, `tests/unit/answer/answer-gate.test.ts`, `tests/unit/chat/ae-follow-up-chips.test.tsx`.
- Keep tests deterministic with injected `now`, branded IDs, source state factories, and local ports.

**Integration Tests:**
- Scope and approach: Route handlers, server seams, agent tools, registry APIs, chat/answer routes, discovery routes, and source admission behavior.
- Examples: `tests/integration/registry-api.test.ts`, `tests/integration/agent-tools-api.test.ts`, `tests/integration/answer-turn-boundary-follow-up.test.ts`.
- Build `Request` objects and call route handlers directly where possible.

**E2E Tests:**
- Framework: Playwright.
- Local E2E config: `playwright.config.ts` starts `npm run dev -- --port 3020 --strictPort --host 127.0.0.1`, sets `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E=true`, and runs `compact-chromium` and `wide-chromium` projects.
- Accessibility tests live in `tests/e2e/a11y/`, using keyboard and layout assertions such as `expectNoHorizontalOverflow` in `tests/e2e/a11y/developer-discovery-a11y.spec.ts`.
- Deploy smoke config: `playwright.deploy-smoke.config.ts` has no local web server and is used by `tests/deploy-smoke/*.spec.ts`.

**Guardrail Tests:**
- Import and architecture guardrails: `tests/imports/*.test.ts`.
- Copy and trust-contract guardrails: `tests/copy/*.test.ts`.
- UI/design guardrails: `tests/ui-contract/*.test.ts`.
- Type literal alignment: `tests/types/*.test.ts`.

**Convex Tests:**
- Current repo tests use custom fake DB classes and direct `_handler` extraction for Convex function bridges, as in `tests/unit/convex/inquiries-runtime.test.ts`.
- Some spike tests run actual Convex CLI commands, as in `tests/spike/handshake-convex-runtime.spike.test.ts`.
- When adding Convex tests, read `convex/_generated/ai/guidelines.md` first. It recommends `convex-test` with Vitest and `@edge-runtime/vm`, but the current `vitest.config.ts` uses `environment: 'node'` and the active first-party pattern is custom fakes plus focused CLI spikes.

**Eval Tests:**
- `eval/answer/README.md` documents the answer eval harness.
- `eval/answer/promptfooconfig.yaml` runs gate, chip, tool-use, and answer-turn cases through promptfoo.
- `tests/eval/answer-pipeline.test.ts` and `eval/answer/lib/evaluators.ts` exercise the real answer-turn endpoint against deterministic registry state.

## Common Patterns

**Async Testing:**
```typescript
const response = await handleInvokeAgentTool(
  new Request('https://ae.example/api/agent/tools', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tool: 'registry.search', input: { query: 'parramatta' } }),
  }),
)

expect(response.status).toBe(200)
await expect(response.json()).resolves.toMatchObject({ kind: 'ok' })
```

For Playwright, prefer role-based selectors and explicit product-contract assertions:

```typescript
await expect(page.getByRole('region', { name: /business shortlist/i })).toContainText(/These are the listed businesses AE found/i)
await expect(page.getByRole('region', { name: /continue this thread/i })).not.toContainText(/Prepare qualified inquiry/i)
```

**Error Testing:**
```typescript
const response = await handleInvokeAgentTool(
  new Request('https://ae.example/api/agent/tools', {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: 'tool=inquiry.submit',
  }),
)

expect(response.status).toBe(415)
await expect(response.json()).resolves.toMatchObject({
  code: 'agent_tools_invalid_content_type',
})
```

For domain errors, assert exact codes and side-effect absence:

```typescript
expect(result).toMatchObject({ kind: 'error', code: 'inquiry_rate_limited' })
expect(state.auditEvents).toHaveLength(1)
expect(JSON.stringify(state)).not.toContain('customer@example.test')
```

---

*Testing analysis: 2026-07-04*
