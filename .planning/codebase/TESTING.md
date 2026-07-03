---
analysis_date: 2026-07-03
focus: quality
---

# Testing Patterns

**Analysis Date:** 2026-07-03

## Test Framework

**Runner:**
- Vitest `4.1.9` runs all `tests/**/*.test.ts` and `tests/**/*.test.tsx` files through `vitest.config.ts` with `environment: 'node'`, `globals: false`, and `watch: false`.
- Per-file `@vitest-environment jsdom` comments opt React component tests into jsdom, as in `tests/unit/chat/ae-chat-route-promotion.test.tsx` and `tests/unit/observability/error-boundary-client.test.tsx`.
- Playwright `1.61.1` runs local browser specs from `tests/e2e` through `playwright.config.ts` with compact and wide Chromium projects.
- Playwright deploy smoke specs run through `playwright.deploy-smoke.config.ts`, which disables parallel deploy runs and retains traces on failure.
- Promptfoo `^0.120.3` runs answer eval rows from `eval/answer/promptfooconfig.yaml` using the file provider `eval/answer/providers/gate.mjs`.
- TypeScript `6.0.3`, Convex dry-run codegen, React Doctor, and custom scanner tests are part of the quality ecosystem even though they are not all Vitest tests.

**Assertion Library:**
- Vitest `expect` for unit, integration, copy, import, SEO, UI-contract, type-contract, and eval tests.
- Playwright `expect` for `tests/e2e/**/*.spec.ts` and `tests/deploy-smoke/**/*.spec.ts`.
- Testing Library (`@testing-library/react`, `@testing-library/jest-dom`) for jsdom React component tests.
- Zod and Convex validators for runtime parsing/contract assertions in files such as `tests/unit/schema/convex-schema.test.ts`, `tests/types/domain-contracts.test.ts`, and `src/modules/registry/registry.actions.ts`.
- Promptfoo JavaScript assertions under `eval/answer/assertions/*.mjs` for answer gate, answer-turn, answer-thread, chip, and tool-input checks.

**Run Commands:**
```bash
npm test                         # Run all Vitest tests matched by vitest.config.ts
npm run test:unit                # Run tests/unit
npm run test:integration         # Run tests/integration
npm run test:types               # Run tests/types
npm run test:imports             # Run clean import/private/route-boundary scans
npm run test:imports:fixtures    # Run import scans against intentionally bad fixtures
npm run test:source-mining       # Run source-mining guardrails against clean targets
npm run test:source-mining:fixtures # Run source-mining guardrails against bad fixtures
npm run test:ts-standards        # Run TypeScript standards scan against runtime source
npm run test:ts-standards:fixtures # Run TypeScript standards scan against bad fixtures
npm run test:copy                # Run public copy and overclaim guardrails
npm run test:copy:fixtures       # Run copy guardrails against bad fixtures
npm run test:seo                 # Run SEO and public discovery tests
npm run test:ui-contract         # Run UI token/layout/status/public-language contracts
npm run test:ui-contract:fixtures # Run UI-contract scans against bad fixtures
npm run test:eval:coverage       # Audit eval catalog coverage and promptfoo sync
npm run test:eval:report         # Write output/eval/answer-suite-report.json
npm run test:eval:validate       # Validate promptfoo config after coverage audit
npm run test:eval                # Run coverage, report, promptfoo eval, and tests/eval
npm run test:graph-freshness     # Ensure graph artifacts match HEAD and watched dirty paths
npm run test:e2e                 # Run Playwright specs under tests/e2e
npm run test:a11y                # Run Playwright specs under tests/e2e/a11y
npm run test:deploy-smoke        # Run deployed Phase 1 smoke spec with deploy-smoke config
npm run test:phase2-support-smoke # Run Phase 2 support-record deploy smoke
npm run test:provider-smoke:resend # Run Resend provider deploy smoke
npm run test:provider-smoke:novu # Run Novu provider deploy smoke
npm run test:provider-smoke:autumn-stripe # Run Autumn/Stripe provider deploy smoke
npm run test:provider-smoke:business-action-stripe # Run business-action Stripe deploy smoke
npm run test:all                 # Typecheck, Convex dry-run, main Vitest guardrails, SEO, UI contract, build
npm run test:release             # Full release gate including eval, graph freshness, E2E, a11y, build
```

## Test File Organization

**Location:**
- Tests live under `tests/`; 159 Vitest test files are present under `tests/**/*.test.ts` and `tests/**/*.test.tsx`.
- Unit tests live under `tests/unit/<domain>/` and cover pure modules, domain transitions, Convex bridge handlers, harness primitives, action descriptors, server seams, and React components.
- Integration tests live under `tests/integration` and usually call exported route handlers, source ports, or HTTP-like `Request` objects directly.
- Local browser tests live under `tests/e2e`; accessibility-specific browser tests live under `tests/e2e/a11y`.
- Deploy smoke tests live under `tests/deploy-smoke` and use `playwright.deploy-smoke.config.ts`.
- Guardrail suites live under `tests/imports`, `tests/copy`, `tests/ui-contract`, `tests/seo`, `tests/types`, and `tests/eval`.
- Shared fixtures live under `tests/fixtures`; shared source-port/admission helpers live under `tests/helpers`.
- Answer eval implementation lives under `eval/answer`, with catalogs in `eval/answer/lib/cases.ts`, scripts in `eval/answer/scripts`, promptfoo assertions in `eval/answer/assertions`, and the file provider in `eval/answer/providers/gate.mjs`.

**Naming:**
- Vitest tests use `*.test.ts` or `*.test.tsx`.
- Browser/deploy Playwright specs use `*.spec.ts`.
- Bad scanner fixture files use `*.fixture` under `tests/fixtures/bad-copy`, `tests/fixtures/bad-imports`, `tests/fixtures/bad-source-mining`, `tests/fixtures/bad-ts-standards`, and `tests/fixtures/bad-ui-contract`.
- Test names should state the preserved behavior or guardrail, not the implementation detail only. Examples: `keeps the registry literal: a misspelled suburb does not auto-correct` in `tests/integration/agent-tools-api.test.ts` and `keeps raw tool evidence in private envelopes` in `tests/unit/harness/evidence-envelope.test.ts`.

**Structure:**
```text
tests/
├── unit/              # Pure domain, harness, Convex bridge, UI component, helper tests
├── integration/       # Route handler, API, source-port, and cross-module flow tests
├── e2e/               # Local Playwright browser flows
├── e2e/a11y/          # Keyboard, focus, and responsive accessibility flows
├── deploy-smoke/      # Deployed environment smoke checks
├── copy/              # Public trust/copy overclaim scans
├── imports/           # Import, route, source-mining, and TypeScript standards scans
├── seo/               # SEO/discovery/public metadata checks
├── types/             # Runtime literal/type contract tests
├── ui-contract/       # UI token, layout, status, and public language contracts
├── eval/              # Answer pipeline and graph freshness assertions
├── fixtures/          # Intentionally bad scanner fixtures
└── helpers/           # Shared source-port and source-write helpers
```

**Current counts:**
- `tests/unit`: 105 files.
- `tests/integration`: 27 files.
- `tests/e2e`: 8 files, including 3 files under `tests/e2e/a11y`.
- `tests/deploy-smoke`: 6 files.
- `tests/copy`: 5 files.
- `tests/imports`: 5 files.
- `tests/seo`: 6 files.
- `tests/types`: 3 files.
- `tests/ui-contract`: 6 files.
- `tests/eval`: 2 files.

## Test Structure

**Suite Organization:**
```typescript
import { describe, expect, it } from 'vitest'

import { handleInvokeAgentTool } from '@/routes/api.agent.tools'
import { createDefaultRegistrySourceState } from '@/modules/registry/public'
import { withRegistrySourcePortForTest } from '../helpers/source-ports'

describe('POST /api/agent/tools registry search', () => {
  it('invokes registry.search and returns the public catalog page', async () => {
    const state = createDefaultRegistrySourceState()
    await withRegistrySourcePortForTest(state, async () => {
      const response = await handleInvokeAgentTool(
        new Request('https://ae.example/api/agent/tools', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tool: 'registry.search', input: { query: 'parramatta' } }),
        })
      )

      expect(response.status).toBe(200)
      const body = (await response.json()) as { kind: string; items: readonly { slug: string }[] }
      expect(body.kind).toBe('ok')
      expect(body.items.map((item) => item.slug)).toContain('parramatta-emergency-plumbing')
    })
  })
})
```

**Patterns:**
- Use `describe` blocks by route, domain, source, or contract: `GET /api/agent/tools`, `harness evidence envelope`, `Convex harness session journal source`, and `thread-first answer flow`.
- Test public behavior and failure modes, not private implementation plumbing. `tests/integration/agent-tools-api.test.ts` asserts stable response status/codes and public catalog output; `tests/unit/harness/evidence-envelope.test.ts` asserts private data is removed from public projections.
- Use exported route handlers and native `Request`/`Response` objects for API tests. Examples: `tests/integration/agent-tools-api.test.ts`, `tests/integration/registry-api.test.ts`, `tests/integration/answer-rate-limits.test.ts`, and `tests/integration/answer-turn-empty-state.test.ts`.
- Use pure state/domain functions for deterministic behavior tests. Examples: `tests/unit/inquiries/inquiry-flow.test.ts`, `tests/unit/harness/run-loop.test.ts`, and `tests/unit/catalog/public-catalog-dto.test.ts`.
- Use `it.each` over shared catalogs when the catalog is the source of truth, as in `tests/eval/answer-pipeline.test.ts` for `ANSWER_TURN_EVAL_CASES` and `ANSWER_THREAD_EVAL_CASES`.
- Use `if (result.kind !== 'ok') throw new Error(...)` or exact discriminated-union checks before accessing narrowed fields.
- Keep local factories at the bottom of a test file unless multiple files reuse them.

## Mocking

**Framework:** Vitest `vi`, module source-port setters, fake Convex DB/auth harnesses, Testing Library jsdom mocks, and Playwright fixtures.

**Patterns:**
```typescript
afterEach(() => {
  setAnswerToolUseAgentForTests(undefined)
  delete process.env.OPENROUTER_API_KEY
  vi.restoreAllMocks()
})
```

```typescript
export async function withRegistrySourcePortForTest(
  state: RegistrySourceState,
  run: () => Promise<void>
): Promise<void> {
  const reset = setPublicRegistrySourcePortForTests({
    list: (input) => Promise.resolve(listPublicBusinessCatalog(state, input)),
    search: (input) => Promise.resolve(searchPublicBusinessCatalog(state, input)),
    detail: (input) => Promise.resolve(getPublicBusinessCatalogBySlug(state, input)),
  })

  try {
    await run()
  } finally {
    reset()
  }
}
```

```typescript
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => testState.navigate,
}))
```

**What to Mock:**
- Mock external/source transport at the module seam, for example `@/lib/server/convex-source` in `tests/unit/registry/registry-fallback.test.ts`.
- Swap domain ports through `setPublicRegistrySourcePortForTests`, `setPublicDiscoverySourcePortForTests`, `setAnswerThreadPortForTests`, `setAnswerToolCallPortForTests`, `setAnswerToolUseAgentForTests`, `setLlmFollowUpChipGeneratorForTests`, and `setHarnessRunViewerSourcePortForTests`.
- Use fake Convex `db` and `auth` contexts for Convex bridge tests under `tests/unit/convex`, as in `tests/unit/convex/harness-sessions-runtime.test.ts`.
- Mock browser/router/UI children in jsdom component tests when the test is about parent state behavior, as in `tests/unit/chat/ae-chat-route-promotion.test.tsx`.
- Stub environment variables only for focused config behavior and delete them in `afterEach`, as in `tests/unit/answer/llm-config-modes.test.ts` and `tests/integration/answer-thread-share.test.ts`.

**What NOT to Mock:**
- Do not mock scanner suites. Copy, import, UI-contract, source-mining, TypeScript standards, graph freshness, and eval coverage tests should inspect actual files or intentionally bad fixtures.
- Do not mock action descriptors when testing `/api/agent/tools`; assert the registered output from `src/modules/actions/index.ts`, `src/modules/registry/registry.actions.ts`, and `src/modules/inquiries/inquiry.actions.ts`.
- Do not bypass source-write admission in write-path tests unless the test specifically verifies rejection. Use `tests/helpers/source-write-admission.ts` and source-write arguments instead.
- Do not invent booking, payment, dispatch, availability, autonomous fulfillment, fake ratings, fake verification, or unsupported platform claims in normal fixtures. Such strings belong only in intentionally bad scanner fixtures under `tests/fixtures`.

## Fixtures and Factories

**Test Data:**
```typescript
function toolResult(overrides: Partial<HarnessToolResult> = {}): HarnessToolResult {
  return {
    toolCallId: 'raw-call',
    toolId: 'registry.search',
    status: 'ok',
    inputJson: '{}',
    summaryJson: '{"count":0}',
    resultHash: 'hash:raw',
    durationMs: 1,
    createdAt: 1_000,
    ...overrides,
  }
}
```

```typescript
const state = createDefaultRegistrySourceState()
await withRegistrySourcePortForTest(state, async () => {
  const evidence = await assembleAnswerEvidence({ query: 'emergency plumber parramatta', limit: 10 })
  expect(evidence?.providers.map((provider) => provider.slug)).toEqual(['parramatta-emergency-plumbing'])
})
```

**Location:**
- Bad scanner fixtures live under `tests/fixtures/bad-copy`, `tests/fixtures/bad-imports`, `tests/fixtures/bad-source-mining`, `tests/fixtures/bad-ts-standards`, and `tests/fixtures/bad-ui-contract`.
- Shared source-port helpers live in `tests/helpers/source-ports.ts`.
- Shared answer-thread in-memory port helpers live in `tests/helpers/answer-thread-test-port.ts`.
- Source-write admission helpers live in `tests/helpers/source-write-admission.ts`.
- Broad answer eval seed data lives in `eval/answer/lib/registry-seed.ts`.
- Eval cases and coverage metadata live in `eval/answer/lib/cases.ts`; eval coverage validation lives in `eval/answer/lib/coverage.ts`.
- Most domain factories remain local to their test files to keep scenario data close to assertions.

**Fixture mode:**
- Scanner tests use `AE_SCAN_MODE=clean` for runtime targets and `AE_SCAN_MODE=fixtures` for intentionally bad inputs.
- Fixture-mode tests assert rule IDs such as `module-private-import`, `route-convex-schema-import`, `explicit-any`, `payment-or-booking-overclaim`, `p5-money-rail-overclaim`, and `raw-color`.
- Clean-mode tests assert an empty violation array, as in `tests/imports/ts-standards.test.ts`, `tests/copy/phase1-banned-copy.test.ts`, and `tests/ui-contract/class-scan.test.ts`.

## Coverage

**Requirements:** No numeric Vitest coverage threshold is configured in `vitest.config.ts` or `package.json`.

**View Coverage:**
```bash
# Not configured as a package script.
```

**Eval coverage:**
```bash
npm run test:eval:coverage
```
- `eval/answer/scripts/audit-coverage.ts` runs `auditAnswerEvalCoverage` and `auditPromptfooAnswerConfig`.
- `tests/eval/answer-pipeline.test.ts` asserts unique eval case IDs, required coverage, promptfoo sync, suite score thresholds, user-outcome thresholds, tool evidence, and broad seed size.
- `eval/answer/lib/coverage.ts` requires every answer eval case to declare coverage tags and checks promptfoo case/mode sync.
- `eval/answer/lib/coverage.ts` also audits expected shape: timing names, SSE snapshot, total timing budget, public-copy safety, typo-recovery evidence, and harness coverage tags.

## Test Types

**Unit Tests:**
- Scope: pure module behavior, domain state transitions, schema contracts, Convex bridge handlers, action descriptors, harness primitives, answer orchestration helpers, source adapters, and component behavior.
- Examples:
  - `tests/unit/harness/run-loop.test.ts` covers run phases, event counters, terminal reports, aborts, timeouts, and model/tool accounting.
  - `tests/unit/harness/evidence-envelope.test.ts` covers private raw evidence, public projection sanitization, replay ID remapping, compaction, sensitivity classification, and stale projection metadata.
  - `tests/unit/convex/harness-sessions-runtime.test.ts` covers bounded session storage, idempotency, parent conflicts, admission rejection, public/private reads, admin authority, and indexed read logging.
  - `tests/unit/chat/ae-chat-route-promotion.test.tsx` covers route promotion and stale-projection prevention with jsdom and mocked child components.
  - `tests/unit/schema/convex-schema.test.ts` checks durable table inventory and indexes from `convex/schema.ts`.

**Integration Tests:**
- Scope: route handlers, API contracts, cross-module flows, source-port swaps, session/cookie behavior, public/private payload shape, rate limits, source-write admission, and quiet-agent action behavior.
- Examples:
  - `tests/integration/agent-tools-api.test.ts` calls `handleListAgentTools` and `handleInvokeAgentTool` directly and verifies action boundaries, validation, quiet-agent allowlists, literal registry search, and not-found behavior.
  - `tests/integration/answer-tool-calls.test.ts` verifies persisted tool calls and public projection leakage controls.
  - `tests/integration/answer-turn-empty-state.test.ts` covers answer-turn empty-state behavior and persistence resilience.
  - `tests/integration/claim-publish.test.ts`, `tests/integration/durable-claim-route.test.ts`, and `tests/integration/registry-api.test.ts` cover public catalog/claim route contracts.

**E2E Tests:**
- Framework: Playwright through `playwright.config.ts` for local browser flows and `playwright.deploy-smoke.config.ts` for deployed smoke flows.
- Local projects: `compact-chromium` at 375×812 and `wide-chromium` at 1440×1100.
- The local web server runs `npm run dev -- --port 3020 --strictPort --host 127.0.0.1` with `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E=true`.
- Examples:
  - `tests/e2e/public-owner-ui.spec.ts` covers home, registry search, claim, public listing, privacy removal, inquiry, owner inbox, and public-language constraints.
  - `tests/e2e/thread-first.spec.ts` covers first query to `/t/$threadId`, answer-ready state, follow-up structure, recent questions, and public-language constraints.
  - `tests/e2e/protected-action-owner-flow.spec.ts` and `tests/e2e/developer-discovery.spec.ts` cover phase-specific UI flows.
  - `tests/e2e/a11y/public-owner-a11y.spec.ts`, `tests/e2e/a11y/protected-action-a11y.spec.ts`, and `tests/e2e/a11y/developer-discovery-a11y.spec.ts` cover browser accessibility scenarios.

**Deploy Smoke Tests:**
- Scope: deployed route/provider readbacks and provider-specific smoke checks.
- Examples: `tests/deploy-smoke/phase1-deploy-smoke.spec.ts`, `tests/deploy-smoke/phase2-resend-dispatch-smoke.spec.ts`, `tests/deploy-smoke/phase2-novu-dispatch-smoke.spec.ts`, `tests/deploy-smoke/phase5-paid-activation-provider-smoke.spec.ts`, and `tests/deploy-smoke/phase6-business-action-stripe-smoke.spec.ts`.

**Copy, UI, Import, Type, SEO, And Eval Guardrails:**
- Copy scans: `tests/copy/phase1-banned-copy.test.ts`, `tests/copy/discovery-overclaim.test.ts`, `tests/copy/phase4-protected-action-claims.test.ts`, and `tests/copy/phase6-business-action-claims.test.ts` protect public claims and phase-owned language.
- UI scans: `tests/ui-contract/class-scan.test.ts`, `tests/ui-contract/public-layout-contract.test.ts`, `tests/ui-contract/public-language-copy.test.ts`, and status-copy tests enforce Astryx/Tailwind and public copy contracts.
- Import scans: `tests/imports/private-imports.test.ts`, `tests/imports/route-boundary.test.ts`, `tests/imports/source-mining.test.ts`, and `tests/imports/backup-imports.test.ts` protect module and runtime boundaries.
- Type contracts: `tests/types/domain-contracts.test.ts`, `tests/types/business-action-contracts.test.ts`, and `tests/types/protected-actions-contracts.test.ts` protect literal unions and domain contract shape.
- SEO tests: `tests/seo/public-business-seo.test.ts`, `tests/seo/public-thread-seo.test.ts`, `tests/seo/developer-discovery.test.ts`, and `tests/seo/discovery-files.test.ts` protect public metadata and discovery outputs.
- Eval tests: `tests/eval/answer-pipeline.test.ts` and `tests/eval/graph-freshness.test.ts` protect answer quality and graph freshness.

## Common Patterns

**Async Testing:**
```typescript
await withRegistrySourcePortForTest(state, async () => {
  const response = await handleInvokeAgentTool(request)
  expect(response.status).toBe(200)
  await expect(response.json()).resolves.toMatchObject({ kind: 'ok' })
})
```

```typescript
await act(async () => {
  testState.latestTranscriptProps?.onThreadCreated?.('thread-promoted-1')
  testState.latestTranscriptProps?.onStreamEnd?.('complete')
  await Promise.resolve()
})
```

- Await all route-handler responses and JSON reads.
- Use `act` around React updates that cross async boundaries.
- Reset module-level ports and environment variables in `afterEach` or `finally`.
- For Playwright, assert URL and visible landmarks after navigation before interacting with changed DOM.

**Error Testing:**
```typescript
const response = await handleInvokeAgentTool(
  new Request('https://ae.example/api/agent/tools', {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: 'tool=inquiry.submit',
  })
)

expect(response.status).toBe(415)
await expect(response.json()).resolves.toMatchObject({
  code: 'agent_tools_invalid_content_type',
})
```

```typescript
const conflict = await appendHandler(authCtx(db, null), {
  ...args,
  entryId: 'entry-drift',
  payloadJson: '{"changed":true}',
})
expect(conflict).toMatchObject({
  status: 'conflict',
  reason: 'idempotency_conflict',
})
```

- Test invalid input, unknown tools, unauthorized/admission-denied writes, idempotency conflicts, privacy leakage, and unsupported/future claims.
- Assert stable codes/reasons/statuses rather than only thrown errors.
- When a test expects rejection from a scanner, use fixture mode and assert the expected rule IDs.

**React Component Testing:**
```typescript
/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

afterEach(() => {
  cleanup()
})
```

- Add `@vitest-environment jsdom` at the top of component tests because global Vitest config defaults to Node.
- Mock router/provider children only when the tested behavior is parent state or rendering contract.
- Keep accessibility-oriented queries (`getByRole`, `getByLabel`, `getByText`) aligned with Playwright E2E selectors.

**Playwright Testing:**
```typescript
await page.goto('/registry')
await expect(page.getByRole('heading', { name: /find local service details before you contact a business/i })).toBeVisible()
await page.getByLabel('Business, service, or place').fill('emergency plumber parramatta')
await page.getByRole('button', { name: /^search businesses$/i }).click()
await expect(page).toHaveURL(/q=emergency\+plumber\+parramatta/)
```

- Prefer role/label/text selectors over CSS selectors.
- Assert public language constraints by reading `body` text where routes are trust-sensitive.
- Use project-name conditionals only for genuine viewport differences, as in `tests/e2e/thread-first.spec.ts`.
- Store Playwright artifacts under `output/playwright/` when a spec needs a durable artifact path, as in `tests/e2e/public-owner-ui.spec.ts`.

**Eval Harness:**
```typescript
it.each(ANSWER_TURN_EVAL_CASES)('$id', async (testCase: AnswerTurnEvalCase) => {
  const result = await runAnswerTurnEvalCase(testCase)
  expect(result.ok, result.problems.join('; ')).toBe(true)
})
```

- Add answer eval cases to `eval/answer/lib/cases.ts` first, not directly to `eval/answer/promptfooconfig.yaml`.
- Keep promptfoo rows synchronized with the shared catalog; `auditPromptfooAnswerConfig` in `eval/answer/lib/coverage.ts` fails unknown, duplicate, missing, or mode-mismatched cases.
- Use `eval/answer/scripts/run-case.ts` for promptfoo provider execution and `eval/answer/scripts/run-suite.ts` for deterministic JSON reports.
- Every answer case should declare coverage tags and assert timing, SSE snapshots, copy safety, and evidence where relevant.

---

*Testing analysis: 2026-07-03*
