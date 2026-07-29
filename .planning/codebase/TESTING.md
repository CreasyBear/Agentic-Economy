---
last_mapped_commit: b1b105b1e07a46f637f4dcfb33537eaf4dca6bc0
last_mapped_at: 2026-07-29
last_mapped_tree: e6a09cd838ecd86ccb4b6693b5d25a58fc85bddf
worktree_dirty_files: 189
---
# Testing Patterns

**Analysis Date:** 2026-07-29

## Test Framework

**Runner:**
- Vitest `4.1.9` is the configured runner for unit, integration, type, import-boundary, SEO, UI-contract, and evaluation tests. The version is declared in `package.json`.
- `vitest.config.ts` uses the Node environment, disables globals, disables watch mode, enables `tsconfigPaths`, and includes `tests/**/*.test.ts`, `tests/**/*.test.tsx`, and `convex/**/*.test.ts`.
- `vitest.config.ts` always loads `tests/setup/web-storage.ts` and `tests/setup/no-search-gap-writes.ts`.
- Playwright `1.61.1` runs browser journeys through `playwright.config.ts`, `playwright.paid-operation.config.ts`, and `playwright.deploy-smoke.config.ts`.
- Promptfoo `0.121.17` supplements the answer evaluation flow configured by `eval/answer/promptfooconfig.yaml` and the `test:eval` scripts in `package.json`.

**Assertion Library:**
- Vitest suites use Vitest's `expect`, with `@testing-library/react` and `@testing-library/jest-dom` available for React DOM tests.
- Playwright suites use Playwright's `expect`, accessible role/label locators, and customer-visible assertions.
- Integration suites use `convex-test` when persistence and Convex function execution are part of the contract, as shown in `tests/integration/customer-request-v2-application-path.test.ts`.

**Run Commands:**
```bash
npm test                                  # vitest run
npm run test:unit                         # vitest run tests/unit
npm run test:integration                   # integration plus convex/customerRequestRouteMandate.test.ts, no file parallelism
npm run test:types                         # vitest run tests/types
npm run test:imports                       # clean import/module-boundary scans
npm run test:imports:fixtures              # selected scans against deliberate bad fixtures
npm run test:ts-standards                  # clean TypeScript source-policy scan
npm run test:ts-standards:fixtures         # TypeScript scan against fixtures
npm run test:seo                           # vitest run tests/seo
npm run test:ui-contract                   # clean UI policy scan
npm run test:e2e                           # local Playwright journeys
npm run test:e2e:a11y                      # Playwright accessibility journeys
npm run test:a11y                          # alias for tests/e2e/a11y
npm run test:eval                          # eval coverage/report, Promptfoo, then Vitest evals
npm run test:eval:coverage                 # semantic eval-case coverage auditor
npm run test:eval:report                   # answer-suite report writer
npm run test:eval:validate                 # coverage auditor plus Promptfoo validation
npm run test:all                           # typecheck, Convex dry-run, selected tests, and build
npm run test:release:source                # lint, typecheck, routing/kernel checks, tests, and build
npm run test:release                      # source gate followed by hosted readback and smokes
npm run typecheck                         # tsc --noEmit
npm run check:convex-codegen              # convex codegen --dry-run --typecheck=disable
```

`package.json` has no `format` script. It also has no `test:copy` script and no `tests/copy/` directory; copy/claim checks are currently distributed across unit, integration, SEO, UI-contract, and browser tests. The commands above are available commands, not results of this mapping task.

## Test File Organization

**Location:**
- `tests/unit/` mirrors domain areas and contains pure behavior, schemas, projections, UI units, fake Convex hosts, security tests, and source-thinness checks.
- `tests/integration/` exercises cross-module flows, route handlers, Convex-backed behavior, registration/publication, Request lifecycle, provider adapters, and source parity.
- `tests/e2e/` contains local Playwright customer journeys, with accessibility journeys under `tests/e2e/a11y/`.
- `tests/deploy-smoke/` contains hosted/readback-oriented Playwright specs using `playwright.deploy-smoke.config.ts`.
- `tests/imports/`, `tests/seo/`, `tests/ui-contract/`, and `tests/types/` are executable policy or contract gates. `tests/copy/` is not present.
- `tests/eval/` validates evaluation contracts; case catalogs and evaluators live under `eval/answer/` and `eval/product-foundry/`.
- `tests/helpers/` owns reusable doubles and contract servers. `tests/fixtures/` contains deliberate violations for scanner self-tests.
- `convex/customerRequestRouteMandate.test.ts` is explicitly included by the integration script alongside `tests/integration/`.

**Observed direct-file inventory:**
- `tests/unit/` has 8 direct files plus domain subdirectories including `action-invocation/`, `actions/`, `answer/`, `answer-thread/`, `capability-supply/`, `catalog/`, `chat/`, `convex/`, `customer-request/`, `discovery/`, `inquiries/`, `observability/`, `registry/`, `routing-kernel/`, `security/`, `server/`, and `ui/`.
- `tests/integration/` has 44 direct files; `tests/e2e/` has 11 and `tests/e2e/a11y/` has 3.
- `tests/deploy-smoke/` has 7 direct files; `tests/imports/` has 15; `tests/seo/` has 6; `tests/types/` has 2; and `tests/ui-contract/` has 1.
- `tests/eval/` has 7 direct files and `tests/eval/support/` has 1. `tests/helpers/` has 3 direct files.
- `tests/fixtures/` has 2 direct files, with additional `bad-copy/`, `bad-imports/`, `bad-ts-standards/`, `bad-ui-contract/`, and `customer-request/` fixture directories.

**Naming:**
- Use `<behavior>.test.ts` or `<component>.test.tsx` for Vitest.
- Use `<journey>.spec.ts` for Playwright.
- Use `<area>-thinness.test.ts` for source-structure locks.
- Phrase `describe` around the unit or contract and `it`/`test` around an observable behavior. Current examples include `describe('integrated Offering supply projection', ...)` in `tests/unit/catalog/offering-supply.test.ts` and `describe('registry public API routes', ...)` in `tests/integration/registry-api.test.ts`.

**Structure:**
```text
tests/
├── unit/<domain>/                 # Pure behavior, UI units, host fakes, thinness locks
├── integration/                   # Cross-module, HTTP, and Convex-backed flows
├── e2e/                           # Local browser journeys
│   └── a11y/                      # Accessibility journeys
├── deploy-smoke/                  # Hosted/readback browser specs
├── imports/                       # Architecture and TypeScript scans
├── seo/ ui-contract/ types/       # Specialized contract gates
├── eval/                          # Evaluation contract tests
├── helpers/                       # Shared doubles and contract servers
└── fixtures/                      # Deliberately bad scanner fixtures
```

## Test Structure

**Suite Organization:**
```typescript
import { describe, expect, it } from 'vitest'

import { buildBusinessSupplyProjection } from '@/modules/catalog/public'

describe('integrated Offering supply projection', () => {
  it('keeps a public business visible with zero Offerings', () => {
    const result = buildBusinessSupplyProjection(input)

    expect(result).toMatchObject({
      kind: 'available',
      projection: { offerings: [], disposition: 'current' },
    })
  })
})
```
This pattern is present in `tests/unit/catalog/offering-supply.test.ts`: import through a public seam, build small typed data, and assert the semantic result rather than internal calls.

**Patterns:**
- Import behavior through the owning module's public seam. Deep imports are appropriate when the test intentionally owns the same internal package or enforces its structure.
- Assert semantic result shapes and refusal codes. Use `toMatchObject`, `objectContaining`, and targeted exact assertions to avoid binding unrelated fields.
- Cover success, refusal, unsupported input, stale/replay behavior, boundary values, redaction, and recovery for consequential paths where those states exist in the source contract.
- Use `it.each` for shared evaluation case catalogs, as in `tests/eval/answer-pipeline.test.ts`.
- Source-policy tests read live files and assert forbidden imports/tokens, required wiring, or line limits. Pair static locks with behavior tests.
- For Convex behavior, use `convexTest(schema, modules)` and an identity-backed client when the test needs real schema/function execution; `tests/integration/customer-request-v2-application-path.test.ts` demonstrates this.
- For source and public-surface parity, assert the same durable state through registry, search, API list, API detail, and route projections as `tests/integration/registry-api.test.ts` does.

**Setup and Teardown:**
- Use `beforeEach` and `afterEach` for repeatable environment, fake-runtime, or injected-backend setup.
- `tests/integration/customer-request-v2-application-path.test.ts` stubs the issuer environment in `beforeEach` and restores env/global stubs in `afterEach`.
- Restore injected source backends, global `fetch`, spies, temporary servers, and fake timers. Use `try`/`finally` around temporary process state, as in `tests/seo/public-business-seo.test.ts`.
- Avoid suite ordering and persistent process state.
- `tests/setup/web-storage.ts` installs per-file `localStorage` and `sessionStorage` implementations for browser-like tests when Node's globals are incomplete.
- `tests/setup/no-search-gap-writes.ts` installs a no-op search-gap recorder; a test must explicitly call `setSearchGapRecorderForTests` to override it before writing deployment-backed search data.

## Mocking

**Framework:** Vitest `vi` is the primary mocking API. Playwright uses `page.route` for browser network control. Convex integration uses `convex-test` rather than replacing persistence with an untyped mock.

**Patterns:**
```typescript
vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
  choices: [{ message: { content: JSON.stringify({ kind: 'unsupported_request' }) } }],
}), { status: 200 })))

vi.stubEnv('OPENROUTER_API_KEY', 'test-openrouter-key')
```
The global fetch and environment pattern is used in `tests/integration/customer-request-v2-application-path.test.ts`; restore both with `vi.unstubAllGlobals()` and `vi.unstubAllEnvs()`.

Use `vi.fn` for ports and fetch implementations, `vi.spyOn` for narrow collaborators, `vi.stubGlobal` for runtime globals, and `page.route` for deterministic browser API states.

**What to Mock:**
- External networks, provider API edges, DNS, time, randomness, authentication identities, and source-write admission when the unit contract is not the provider itself.
- Typed ports when testing a pure machine or application operation.
- Browser APIs absent from the configured environment, in the component suite that requires them.
- Convex persistence only for host-bridge unit behavior; use `convex-test` when persistence is part of the integration claim.

**What NOT to Mock:**
- The public operation under test or its result schema.
- Private collaborators merely to make implementation-aware assertions.
- Source scanners; give them live targets and deliberate fixtures.
- Hosted behavior with local imports or privileged database reads; hosted proof must use the intended surface.
- Source ownership when ownership is the claim. A projection can compare views, but it cannot replace the business record or trusted observation that owns a fact.

## Fixtures and Factories

**Test Data:**
```typescript
const input = {
  requestRef: 'request:test',
  revision: 1,
  routeRef: 'route:test',
} as const
```

- Prefer small inline typed builders and constants next to the suite when data is domain-specific, as in `tests/unit/catalog/offering-supply.test.ts`.
- Use shared fixtures when multiple suites must prove continuity across surfaces; local E2E business data is in `src/lib/dev/local-e2e-business-fixtures.ts`.
- Keep fake credentials and identifiers visibly test-only. Do not read secret-bearing environment files in tests or docs.
- `tests/fixtures/bad-*` intentionally violate source-policy rules and are selected through `AE_SCAN_MODE=fixtures`.

**Location:**
- Shared doubles and servers include `tests/helpers/openrouter-contract-server.ts`, `tests/helpers/source-write-admission.ts`, and `tests/helpers/answer-thread-test-port.ts`.
- Evaluation cases are in `eval/answer/lib/cases.ts` and `eval/product-foundry/`.
- Domain-specific factories remain in the owning test file until reuse is demonstrated.

## Coverage

**Requirements:**
- `vitest.config.ts` configures no coverage provider and no line, branch, or function threshold. The repository uses layered behavioral and contract gates instead of a numeric source-coverage target.
- The answer evaluator has a separate semantic case-coverage auditor in `eval/answer/lib/coverage.ts`; `npm run test:eval:coverage` checks required tags, assertions, and seed breadth. This is evaluation-case coverage, not source-code coverage.

**View Coverage:**
```bash
npm run test:eval:coverage        # Semantic evaluation-case coverage only
```
No supported repository command currently reports source-code coverage; adding that would require configuring a Vitest coverage provider and thresholds.

## Test Types

**Unit Tests:**
- Domain suites under `tests/unit/` exercise pure operations, schemas, projections, UI units, security primitives, fake Convex hosts, and source-thinness locks.
- Use direct ports, deterministic clocks, and focused fakes for speed and explicit refusal/recovery cases.

**Integration Tests:**
- `tests/integration/` exercises cross-module APIs, Convex persistence, publication/registry behavior, Customer Request lifecycle, security, provider boundaries, and surface parity.
- `tests/integration/customer-request-v2-application-path.test.ts` uses `convex-test`, `import.meta.glob` module loading, seeded records, an identity, and a stubbed external response to test the application path.
- `npm run test:integration` passes `--no-file-parallelism` because these flows share heavier runtime/global resources.

**E2E Tests:**
- `tests/e2e/` uses Playwright with compact and wide Chromium projects configured in `playwright.config.ts`.
- Local E2E starts `npm run dev -- --port 3020 --strictPort --host 127.0.0.1` when `PLAYWRIGHT_BASE_URL` is not set and sets `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E=true` for that server.
- Local browser tests should use role/label locators and customer-visible language. `tests/e2e/public-owner-ui.spec.ts` checks rendered copy, links, responsive menu behavior, and public boundary language.

**Deploy Smoke Tests:**
- `tests/deploy-smoke/` contains seven specs using `playwright.deploy-smoke.config.ts`, which is serial, has no retries, retains traces on failure, and uses a 45-second test timeout.
- `playwright.paid-operation.config.ts` runs the development paid-operation browser spec against a separate Vite server on port 3021 with retained traces.
- A deploy smoke or local browser pass proves only the named surface, environment, revision, and fixture/provider behavior exercised by that run. The presence of a script or skipped smoke does not prove deployment or external fulfilment.

**Static Contract Tests:**
- Import ownership and retirement checks live in `tests/imports/`; `tests/imports/route-boundary.test.ts` asserts that routes remain adapters over public seams and exercises `route-convex-schema-import`, `route-owned-convex-transport`, and `route-clearance-functions-import` in fixture mode.
- TypeScript source standards live in `tests/imports/ts-standards.test.ts` and are run with `AE_SCAN_MODE=clean` or `AE_SCAN_MODE=fixtures`.
- UI policy is implemented by `src/lib/ui/contract-scans.ts` and exercised by `tests/ui-contract/ui-contract.test.ts`. Rules include `raw-color`, `space-utility`, `transition-all`, `hardcoded-layer`, `raw-overlay`, `generic-tailwind-shadow`, `arbitrary-visual-token`, and `route-local-scroll-listener`.
- SEO and discovery contracts live in `tests/seo/`. `tests/seo/public-business-seo.test.ts` checks canonical metadata and explicitly excludes ratings, offers, and payment fields from JSON-LD.
- Thinness checks are distributed through `tests/unit/` with the `*-thinness.test.ts` naming pattern.

**Evaluation Tests:**
- `tests/eval/answer-pipeline.test.ts` checks unique case IDs, semantic coverage, Promptfoo catalog parity, suite report shape, score thresholds, and declared user-outcome fields.
- `npm run test:eval` runs the coverage auditor, report writer, Promptfoo without cache, and Vitest eval tests in sequence.
- `tests/eval/product-foundry-partial-entry.test.ts` uses rejected Zod inputs and disposition assertions to record what current entry surfaces do and do not address. Any pass is bounded to its declared case catalog.

## Evidence Planes and Claim Limits

**Source and fixture plane:**
- Vitest unit, integration, import, SEO, UI-contract, and eval tests prove only the source behavior and fixtures they execute.
- A labelled local browser run proves the named local projection, interaction, and semantic parity. It does not by itself prove a deployed revision, independent supply, real-world work, or customer value.
- Payment-adjacent tests must keep provider challenges, signatures, identifiers, and receipts separate from evidence that an external real-world outcome occurred.

**Hosted plane:**
- Hosted/readback scripts and `tests/deploy-smoke/` are separate from local Vitest proof. Exact revision, deployment, identity, inputs, and environment must be observed by the named smoke or collector.
- A packet-integrity check can prove internal consistency and provenance of the packet; it does not upgrade that evidence into independent provider or customer evidence.

**Focused versus broad gates:**
- Start with the narrowest test that falsifies the changed transition, then expand to `npm run typecheck`, `npm run test:imports`, `npm run test:ui-contract`, `npm run test:seo`, the relevant browser flow, or `npm run check:convex-codegen` only when the change crosses that boundary.
- Use `npm run test:all` for cross-cutting source changes and `npm run test:release:source` for source release candidates. Hosted commands are separate and require their own evidence.
- Never report a package script as passing merely because it exists. Record the exact command, revision, first failure, and evidence ceiling when verification is performed.

## Current Exact-Revision Readback

- This mapping task records the source anchor as commit `b1b105b1e07a46f637f4dcfb33537eaf4dca6bc0`, tree `e6a09cd838ecd86ccb4b6693b5d25a58fc85bddf`, with 189 dirty worktree files.
- No test, lint, typecheck, build, browser, hosted smoke, or release command was executed as part of this documentation rewrite. The commands documented above are read from `package.json` and configuration files.
- Consequently, this document makes no claim that the current worktree passes any gate. A future verification report must identify the command, exact source state, first failure if any, and whether the evidence is source, fixture, local/dev, hosted readback, provider, or customer evidence.

## Common Patterns

**Async Testing:**
```typescript
it('preserves the application projection', async () => {
  const backend = convexTest(schema, modules)
  const result = await backend.action(api.customerRequestApplication.submit, input)

  expect(result).toMatchObject({ kind: 'request' })
})
```
Await every async operation. Close temporary contract servers and restore injected backends in `finally`; `tests/integration/customer-request-v2-application-path.test.ts` demonstrates the Convex backend and environment cleanup pattern.

**Error Testing:**
```typescript
const result = await operationUnderTest(invalidInput, ports)

expect(result).toEqual({
  kind: 'refused',
  code: 'input_not_admitted',
})
```
Use `toThrow` for invariants and programmer/setup errors. For expected product refusal, unsupported, stale, conflict, or uncertainty states, assert the full typed result posture.

**Browser Testing:**
```typescript
await page.goto('/')
await expect(page.getByRole('heading', { name: 'What do you need to make happen?' })).toBeVisible()
await expect(page.getByRole('link', { name: 'Claim your business page' })).toBeVisible()
```
Test what a customer or external caller can observe. Do not substitute internal IDs, direct Convex calls, privileged reads, or a scripted transcript for a public journey. `tests/e2e/public-owner-ui.spec.ts` is the representative pattern.

**Contract and guard testing:**
```typescript
describe('AE UI contract', () => {
  it('keeps product routes and AE components on semantic visual tokens', () => {
    expect(scanUiContract(productUiTargets)).toEqual([])
  })
})
```
Keep scanner behavior in `src/lib/ui/contract-scans.ts`, run it against live targets in clean mode, and use deliberate fixtures only in fixture mode. The same seam is used by `tests/ui-contract/ui-contract.test.ts` and `tests/imports/route-boundary.test.ts`.

## Change-to-Gate Guide

| Change | Minimum focused proof |
|---|---|
| Pure domain behavior | Owning `tests/unit/<domain>/` file |
| Convex schema, host, or persistence | Focused test plus owning integration coverage; run `npm run check:convex-codegen` when authorized |
| Module or route boundary | `npm run test:imports` and, for source-policy changes, `npm run test:ts-standards` |
| Public or assistant-visible copy | `npm run test:ui-contract`; add `npm run test:seo` for discovery/metadata output |
| React interaction or UI state | Component/unit coverage plus the focused `tests/e2e/` journey |
| Customer Request lifecycle | Focused unit/integration test, then intended-surface browser or development smoke when applicable |
| Evaluation behavior | `npm run test:eval:coverage`, focused `tests/eval/`, then `npm run test:eval` |
| Release source claim | `npm run test:release:source`; report hosted evidence separately |
| Hosted readback claim | The exact hosted readback/smoke command and revision/custody evidence named by that command |

---

*Testing analysis: 2026-07-29*
