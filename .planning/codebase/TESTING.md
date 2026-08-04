# Testing Patterns

**Analysis Date:** 2026-08-04

## Test Framework

**Runner:**
- Vitest `4.1.9` runs authored `.test.ts` and `.test.tsx` files under `tests/` plus `.test.ts` files under `convex/`; inclusion, Node environment, explicit-import globals, and shared setup are defined in `vitest.config.ts`. TS path aliases resolve via `resolve.tsconfigPaths`.
- Playwright Test `1.61.1` owns browser `.spec.ts`/`.spec.tsx` files. The default local browser matrix is in `playwright.config.ts`; deployed smoke and paid-operation variants use `playwright.deploy-smoke.config.ts` and `playwright.paid-operation.config.ts`.

**Assertion Library:**
- Use Vitest `expect`, `expectTypeOf`, `toMatchObject`, `resolves`, `rejects`, and mock assertions (`tests/types/domain-contracts.test.ts`, `tests/unit/actions/action-contract-compatibility.test.ts`).
- Use Testing Library queries and `act`/`render` for React behavior (`tests/unit/chat/ae-thread-turn-stream-section.test.tsx`, `tests/unit/ui/demand-console.test.tsx`); use Playwright role/label locators, URL assertions, and response/readback checks for browser journeys (`tests/e2e/thread-first.spec.ts`, `tests/deploy-smoke/customer-request-human-lifecycle-smoke.spec.ts`).

**Run Commands:**
```bash
npm test                                      # All Vitest-configured tests through the cleanup wrapper
npm run test:unit                             # tests/unit
npm run test:integration                       # tests/integration plus convex/customerRequestRouteMandate.test.ts, no file parallelism
npx vitest --watch                            # Watch mode; no package watch script is defined (vitest.config.ts sets watch:false)
npm run test:eval:coverage                    # Answer-case coverage audit, not source line coverage
npm run test:eval:report                      # Write output/eval/answer-suite-report.json
npm run test:types                            # tests/types static contract checks
npm run test:imports                          # Import/boundary scans under AE_SCAN_MODE=clean
npm run test:ts-standards                     # TypeScript-standard scan under AE_SCAN_MODE=clean
npm run test:seo                              # tests/seo discovery/SEO checks
npm run test:ui-contract                      # tests/ui-contract under AE_SCAN_MODE=clean
npm run test:e2e                              # Local Playwright browser journeys
npm run test:e2e:a11y                         # Local Playwright accessibility journeys
npm run gate:release                          # Source release contract
npm run test:release                          # Source contract plus hosted proof
```

## Test File Organization

**Location:**
- Keep pure module, schema, simulated-runtime, route-handler, and UI seam tests in `tests/unit/` (`tests/unit/customer-request/route-mandate.test.ts`, `tests/unit/schema/convex-schema.test.ts`, `tests/unit/server/customer-request-api.test.ts`).
- Keep behavior-spanning Convex persistence, provider, route, stream, and multi-module journeys in `tests/integration/` (`tests/integration/capability-publication.test.ts`, `tests/integration/customer-request-v2-multi-capability-route.test.ts`).
- Keep Convex-native function contract tests beside their backend in `convex/` (`convex/workTrees.test.ts`, `convex/customerRequestRouteMandate.test.ts`); use `tests/unit/convex/` for focused handlers and read/index bridges (`tests/unit/convex/registry-runtime.test.ts`, `tests/unit/convex/notification-outbox-runtime.test.ts`).
- Keep local browser journeys in `tests/e2e/` and deployed production/readback proofs in `tests/deploy-smoke/` (`tests/e2e/public-owner-ui.spec.ts`, `tests/deploy-smoke/customer-request-human-lifecycle-smoke.spec.ts`).
- Keep static contracts in `tests/types/`, import/boundary scans in `tests/imports/`, discovery/SEO checks in `tests/seo/`, product UI-token checks in `tests/ui-contract/`, and answer evaluation checks in `tests/eval/`. Shared answer test data lives in `eval/answer/` (`tests/types/domain-contracts.test.ts`, `tests/imports/ts-standards.test.ts`, `tests/ui-contract/ui-contract.test.ts`, `tests/eval/answer-pipeline.test.ts`).

**Naming:**
- Name Vitest files with `.test.ts` or `.test.tsx`, and browser files with `.spec.ts` or `.spec.tsx`; use domain/behavior names rather than implementation-only names (`tests/unit/customer-request/v2-request-semantics.test.ts`, `tests/e2e/thread-first.spec.ts`).
- Name helpers and fixtures for the seam they support (`tests/helpers/convex-fixtures.ts`, `tests/helpers/openrouter-contract-server.ts`, `tests/fixtures/capability-contract-v2.ts`).

**Structure:**
```text
tests/
  unit/             pure modules, handlers, UI, Convex bridges, security, schemas
  integration/      route/provider/Convex journeys and cross-module persistence
  e2e/              local Playwright browser journeys and accessibility
  deploy-smoke/     hosted/deployed release smoke and parity proofs
  types/ imports/ seo/ ui-contract/ eval/  static and evaluation contracts
  helpers/ fixtures/ setup/                 ports, data builders, and setup hooks
convex/*.test.ts                              Convex-native function tests
```

## Test Structure

**Suite Organization:**
```typescript
import { afterEach, describe, expect, it } from 'vitest'

describe('answer HTTP rate limits', () => {
  afterEach(() => resetAnswerTurnGuardForTests())

  it('maps a refused turn admission to 429', async () => {
    const admit = sequencedAdmission()
    const response = await handleAnswerTurnRequest(request(), { admit, stream: NOOP_TURN_STREAM })
    expect(response.status).toBe(429)
    expect(await response.json()).toEqual({ error: 'rate_limited' })
  })
})
```
This boundary-injection pattern is implemented in `tests/integration/answer-rate-limits.test.ts`; Convex journeys instead create an isolated `convexTest(schema, modules)` backend and call generated `api`/`internal` bindings (`tests/helpers/convex-fixtures.ts`, `convex/workTrees.test.ts`).

**Patterns:**
- Group behavior with `describe` and behavior-oriented `it` names; assert user-visible results, durable state transitions, refusal precedence, replay, redaction, and no-effect guarantees (`tests/unit/security/admin-authority.test.ts`, `tests/unit/action-invocation/durable-action-invocation.test.ts`).
- Import Vitest functions explicitly because `globals: false` is set in `vitest.config.ts`; use `beforeEach` for per-test env/port setup and `afterEach` for cleanup, stubs, and test-port restoration (`tests/integration/answer-turn-empty-state.test.ts`, `tests/unit/catalog/public-business-page-not-found.test.tsx`).
- Use `it.each` for origin/status/error matrices rather than duplicating nearly identical cases (`tests/unit/action-invocation/durable-action-invocation.test.ts`, `tests/unit/capability-supply/publication-importers.test.ts`).
- Prefer explicit assertions over snapshots; the current snapshot is narrow and colocated in `tests/unit/work-tree/__snapshots__/memo.test.tsx.snap`, exercised by `tests/unit/work-tree/memo.test.tsx`.
- Narrow a discriminated result before reading variant fields and throw a descriptive fixture/setup error if an expected branch is missing (`tests/unit/customer-request/application/compare-resume.test.ts`, `convex/workTrees.test.ts`).

## Mocking

**Framework:** Vitest `vi` mocks, spies, stubs, and injected ports; Testing Library and Playwright provide the browser interaction layers (`tests/unit/chat/ae-thread-turn-stream-section.test.tsx`, `tests/e2e/public-owner-ui.spec.ts`).

**Patterns:**
```typescript
const streamSession = vi.hoisted(() => ({
  abort: vi.fn(),
  attach: vi.fn(() => vi.fn()),
}))

vi.mock('@/components/ae/chat/turn-stream-session', () => ({
  abortAnswerTurnStream: streamSession.abort,
  attachAnswerTurnStream: streamSession.attach,
}))

afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})
```
The `vi.hoisted`/`vi.mock` pattern is used in `tests/unit/chat/ae-thread-turn-stream-section.test.tsx`; provider and boundary tests also use `vi.stubGlobal('fetch', ...)`, `vi.stubEnv(...)`, `vi.spyOn(...)`, `mockResolvedValue`, and `mockRejectedValue` (`tests/integration/customer-request-v2-entrypoint-substitution.test.ts`, `tests/unit/answer-thread/follow-up-chips-client.test.ts`).

**What to Mock:**
- Mock provider/network calls, model SDKs, clocks, environment configuration, browser-only APIs, and explicit application ports when testing a narrower boundary (`tests/helpers/openrouter-contract-server.ts`, `tests/setup/jsdom-platform.ts`, `tests/unit/customer-request/application/compare-resume.test.ts`).
- Prefer the local OpenRouter contract server when the test is about wire shape; it records requests and returns schema-shaped tool/prose responses instead of hiding protocol behavior behind a client mock (`tests/helpers/openrouter-contract-server.ts`, `tests/eval/answer-pipeline.test.ts`).
- Use `setAnswerThreadPortForTests` and shared stream readers to isolate HTTP streaming while still exercising the real response framing (`tests/integration/answer-turn-empty-state.test.ts`, `tests/helpers/answer-turn-stream.ts`, `tests/helpers/answer-thread-test-port.ts`).

**What NOT to Mock:**
- Do not replace the domain transition, validator, authorization, projection, idempotency, or source-owned persistence under test; use `convexTest` for real Convex functions and in-memory database state (`tests/helpers/convex-fixtures.ts`, `convex/workTrees.test.ts`).
- Do not let deterministic tests write search-gap traffic to a configured deployment: `tests/setup/no-search-gap-writes.ts` installs a no-op recorder, and intentional writes require an explicit test override.
- Do not depend on live credentials, a developer's Convex URL, or provider availability in deterministic suites; relevant tests unset deployment URLs and install local adapters (`tests/integration/registry-api.test.ts`, `tests/seo/developer-discovery.test.ts`).

## Test Setup

`vitest.config.ts` loads four auto-applied setup files for every suite; browser-only features require the level-specific helpers:
- `tests/setup/web-storage.ts` — in-memory `localStorage`/`sessionStorage` shim for Node.
- `tests/setup/no-search-gap-writes.ts` — no-op recorder so deterministic tests never write search-gap traffic to a configured deployment.
- `tests/setup/resize-observer.ts` — `ResizeObserver` stub for UI tests.
- `tests/setup/http-rate-limit.ts` — HTTP rate-limit stubbing.
- `tests/setup/jsdom-platform.ts` and `tests/setup/jsdom-dialog.ts` — focused jsdom platform/dialog helpers imported by the specific UI suites that need them.

## Fixtures and Factories

**Test Data:**
```typescript
const backend = convexTestWithWorkers({ pauseWorkpool: true })
const { businessId, owner } = await publishedBusinessOwner(backend, 'legacy-rebuild')
const admin = await ownerAdmin(backend, 'user_capability_publication_observer')
```
The reusable identity/database setup lives in `tests/helpers/convex-fixtures.ts`: `convexTestWithWorkers` registers Workpool and rate-limiter test components, `pauseWorkpool` prevents uncontrolled worker effects, and `ownerAdmin`/`publishedBusinessOwner` create source-owned identities and rows.

**Location:**
- Put reusable typed state builders in `tests/fixtures/` (`tests/fixtures/source-state.ts`, `tests/fixtures/capability-contract-v2.ts`, `tests/fixtures/discovery-published-state.ts`).
- Put seam-specific backend, HTTP, lineage, stream, curated-supply, and contract helpers in `tests/helpers/`; use local builders for scenario-only rows and stable operation/correlation keys (`tests/helpers/convex-fixtures.ts`, `tests/helpers/customer-request-lineage.ts`, `tests/helpers/curated-supply.ts`, `tests/helpers/http.ts`).
- Keep intentionally invalid static-analysis inputs in `tests/fixtures/bad-*`; `tests/imports/scan-targets.ts` selects them only when `AE_SCAN_MODE=fixtures`, while `.oxlintrc.json` ignores `tests/fixtures/**` during ordinary lint.
- Use test-only adapters/ports rather than production fallbacks; explicit local E2E business fixtures live in `src/lib/dev/local-e2e-business-fixtures.ts` and are consumed by `tests/e2e/public-owner-ui.spec.ts`.

## Coverage

**Requirements:** No line/branch coverage threshold or instrumentation configuration is present in `package.json` or `vitest.config.ts`; behavioral, type, import, UI-contract, release, and evaluation gates are the enforced coverage model. `npm run test:eval:coverage` audits required answer-evaluation cases through `eval/answer/scripts/audit-coverage.ts`, not source-code percentages.

**View Coverage:**
```bash
npm run test:eval:coverage                    # Audit required answer cases and promptfoo coverage
npm run test:eval:report                      # Write output/eval/answer-suite-report.json
```
No `--coverage` command or coverage reporter is configured in `package.json` or `vitest.config.ts`; do not report a source coverage percentage from the current suite.

## Test Types

**Unit Tests:**
- Exercise pure transitions, schemas, DTO/projection builders, route handlers with injected ports, simulated stores, and security/refusal behavior under `tests/unit/` (`tests/unit/customer-request/route-mandate.test.ts`, `tests/unit/server/customer-request-api.test.ts`, `tests/unit/security/admin-authority.test.ts`).
- Keep positive and negative behavior together: malformed input, invalid statuses, cross-principal access, stale revisions, sensitive-content refusal, replay, and no-side-effect guarantees are first-class assertions (`tests/types/domain-contracts.test.ts`, `tests/unit/action-invocation/durable-action-invocation.test.ts`).

**Integration Tests:**
- Exercise module-to-Convex persistence, generated bindings, provider contracts, HTTP/SSE streams, workpool/rate-limiter components, and multi-step Customer Request journeys under `tests/integration/` and `convex/` (`tests/integration/capability-publication.test.ts`, `tests/integration/customer-request-v2-multi-capability-route.test.ts`, `convex/workTrees.test.ts`).
- Run integration files with `--no-file-parallelism` through `npm run test:integration` and release integration commands; use `pauseWorkpool: true` when asynchronous worker effects must be controlled (`tests/helpers/convex-fixtures.ts`, `package.json`).

**E2E Tests:**
- Use Playwright role/label locators, URL assertions, explicit readiness waits, public-language/no-leakage checks, and screenshots only for failure evidence (`tests/e2e/public-owner-ui.spec.ts`, `tests/e2e/a11y/engine-product-a11y.spec.ts`).
- The default config runs compact and wide Chromium projects against a Vite server on `127.0.0.1:3020` with local E2E auth bypass; `playwright.paid-operation.config.ts` uses a separate `127.0.0.1:3021` server, and `playwright.deploy-smoke.config.ts` targets hosted release proofs with JSON output.

**Static and Evaluation Tests:**
- Keep import/private-boundary, retired-authority, TypeScript-standard, SEO, and UI-token scans in their dedicated roots (`tests/imports/`, `tests/types/`, `tests/seo/`, `tests/ui-contract/`); clean scans use `AE_SCAN_MODE=clean` and negative examples use `AE_SCAN_MODE=fixtures` (`tests/imports/scan-targets.ts`, `tests/imports/ts-standards.test.ts`).
- Keep deterministic answer-case and promptfoo synchronization checks in `tests/eval/answer-pipeline.test.ts`; the suite report is generated by `eval/answer/scripts/run-suite.ts` and must satisfy score/timing/failure thresholds before the release gate passes.

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
Await every Convex/provider operation, use `resolves`/`rejects` for promise outcomes, and drain streams with the shared reader (`tests/integration/capability-publication.test.ts`, `convex/workTrees.test.ts`, `tests/helpers/answer-turn-stream.ts`).

**Error Testing:**
```typescript
expect(result).toMatchObject({ kind: 'error', code: 'notification_system_denied' })
expect(JSON.stringify(readback)).not.toContain('customer@example.test')
expect(submit).not.toHaveBeenCalled()
```
Assert typed refusal/error codes, HTTP statuses, redacted output, idempotent replay, and unchanged durable state (`tests/unit/convex/notification-outbox-runtime.test.ts`, `tests/unit/server/customer-request-api.test.ts`). For boundary faults, assert sanitized response codes and safe fallback copy instead of provider/internal details (`src/routes/api.answer.turn.ts`, `tests/integration/answer-turn-empty-state.test.ts`).

## Release Gates and Ownership

- `npm run gate:release` expands to codegen, lint, typecheck, kernel-retirement verification, unit/integration release reports, type/import/TypeScript-standard/SEO/UI-contract checks, answer evaluation reporting, and the production build (`package.json`, `tests/unit/release/green-release-baseline.test.ts`).
- `.github/workflows/kernel-release-gate.yml` runs the source gate on pull requests, merge groups, and `main`; it uploads sanitized source evidence, while hosted proof is restricted to the exact main revision and runs the Customer Request lifecycle plus WorkTree parity readbacks against the production deployment (`.github/workflows/kernel-release-gate.yml`, `tests/deploy-smoke/customer-request-human-lifecycle-smoke.spec.ts`).
- Wrap test commands with `tools/dev/run-with-cleanup.mjs`: it snapshots the baseline process table, terminates only newly identified test-owned headless browsers, removes transient project caches, forwards signals, preserves the child exit code, and always cleans up in `finally` (`tools/dev/run-with-cleanup.mjs`).
- Subject selection for hosted proof is runtime-determined (real curated supply and provider readiness), not a development fixture; `RULES.MD` forbids proof-class inflation and sandboxing as acceptance evidence.

---

*Testing analysis: 2026-08-04*
