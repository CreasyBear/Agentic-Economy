# TESTING.md

**Analysis Date:** 2026-09-01

## Toolchain (package.json devDependencies)

- `vitest: 4.1.9`, `@playwright/test: 1.61.1`, `convex-test: 0.0.56`, `jsdom: 29.1.1`, `@testing-library/react: 16.3.2`, `@testing-library/dom: 10.4.1`.
- `engines: { node: "22.x" }` — release-gate scripts wrap commands in `node tools/dev/require-supported-node.mjs`.
- `tsconfig.json` includes `tests/**/*.ts(x)` and `convex/**/*.ts`, so all tests are typechecked by `npm run typecheck` (`tsc --noEmit`).

## Vitest Config (vitest.config.ts)

```ts
test: {
  environment: 'node',
  include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx', 'convex/**/*.test.ts'],
  setupFiles: ['./tests/setup/web-storage.ts', './tests/setup/jsdom-platform.ts', './tests/setup/http-rate-limit.ts'],
  globals: false, watch: false,
}
```

`@` alias re-mapped for tool modules (comment: vitest needs the tsconfig path map "when a unit test pulls tools/ae/lib/*"). Explicit imports (`import { describe, it, expect } from 'vitest'`) — no globals.

### Setup files (tests/setup/)

- `web-storage.ts`: Node 25 ships a partial global `localStorage`/`sessionStorage` that breaks jsdom's; this installs a complete per-file Map-backed Web Storage implementation (its doc comment explains whole suites were silently disabled without it).
- `jsdom-platform.ts`: stubs/restores `ResizeObserver`, `matchMedia`, `Element.prototype.scrollIntoView` in `beforeAll`/`afterAll` for component tests.
- `http-rate-limit.ts`: `beforeEach(() => setHttpRateLimitAdmissionForTests(async () => ({ ok: true })))` — admits all HTTP requests by default in tests.
- (`resize-observer.ts` and `jsdom-dialog.ts` also exist under tests/setup/ but are not wired into vitest.config.ts setupFiles — unverified how they load.)

## Directory Layout (tests/)

|Dir|Contents|
|---|---|
|`tests/unit/**`|Largest tier: module-level unit tests, incl. per-module subdirs (`tests/unit/capability-supply/*`, `tests/unit/action-invocation/*`, `tests/unit/convex/*`, `tests/unit/money/*`, `tests/unit/ui/*`)|
|`tests/integration/**`|Cross-layer tests over real convex-test backends (e.g. `capability-operation-workpool.test.ts` 1058 lines, `capability-publication-harness.ts` shared harness)|
|`tests/imports/**`|Static boundary/standard scanners + `scan-targets.ts` and `tests/fixtures/bad-imports/*` negative fixtures|
|`tests/ui-contract/`|UI token/motion contract scans|
|`tests/e2e/**`|Playwright specs (+ `authenticated/`, `a11y/`)|
|`tests/deploy-smoke/**`|Post-deploy Playwright smoke specs|
|`tests/types/`|Type-level contract tests (`domain-contracts.test.ts`)|
|`tests/seo/`, `tests/eval/`, `tests/security/maturity/`, `tests/review/`|SEO tests, product-foundry evals, security maturity, review assertions|
|`tests/helpers/**`|`convex-fixtures.ts` (19.8KB), `source-write-admission.ts`, `x402-payment-attempt.ts`, `openrouter-contract-server.ts`, `local-e2e-business-fixtures.ts`, etc.|
|`tests/fixtures/**`|Negative-mode fixtures (`bad-imports/`, `bad-ts-standards/`, `bad-ui-contract/`, `module-boundaries/`) — oxlint-ignored|

**Convex co-located tests**: `convex/**/*.test.ts` (e.g. `convex/agentAccessPrincipals.test.ts`, 1173 lines) run inside the default vitest include and by `test:release:integration`.

## Test Scripts (package.json, verbatim)

```json
"test": "node tools/dev/run-with-cleanup.mjs vitest run",
"test:unit": "node tools/dev/run-with-cleanup.mjs vitest run tests/unit",
"test:integration": "node tools/dev/run-with-cleanup.mjs vitest run tests/integration convex --no-file-parallelism",
"test:eval": "node tools/dev/run-with-cleanup.mjs vitest run tests/eval",
"test:types": "node tools/dev/run-with-cleanup.mjs vitest run tests/types",
"test:seo": "node tools/dev/run-with-cleanup.mjs vitest run tests/seo",
"test:imports": "npm run build:cli && AE_SCAN_MODE=clean node tools/dev/run-listed-vitest.mjs tests/imports/module-boundaries.test.ts tests/imports/chat-sharing-boundaries.test.ts tests/imports/backup-imports.test.ts tests/imports/private-imports.test.ts tests/imports/route-boundary.test.ts tests/imports/capability-contract-boundaries.test.ts tests/imports/capability-contract-registry-boundaries.test.ts tests/imports/capability-supply-boundaries.test.ts tests/imports/action-invocation-host-boundaries.test.ts tests/imports/operation-surface-conformance.test.ts tests/imports/development-evidence-boundary.test.ts",
"test:ts-standards": "AE_SCAN_MODE=clean node tools/dev/run-with-cleanup.mjs vitest run tests/imports/ts-standards.test.ts",
"test:ui-contract": "AE_SCAN_MODE=clean node tools/dev/run-with-cleanup.mjs vitest run tests/ui-contract",
"test:e2e": "node tools/dev/run-with-cleanup.mjs playwright test tests/e2e",
"test:e2e:a11y": "node tools/dev/run-with-cleanup.mjs playwright test tests/e2e/a11y --workers=1",
"test:e2e:authenticated": "node tools/dev/run-with-cleanup.mjs playwright test --config=playwright.authenticated.config.ts",
"test:all": "npm run typecheck && npm run check:convex-codegen && npm run test:unit && npm run test:integration && npm run test:types && npm run test:imports && npm run test:ts-standards && npm run test:seo && npm run test:ui-contract && npm run build"
```

(`run-with-cleanup.mjs` wraps vitest with cleanup; `run-listed-vitest.mjs` runs an explicit file list.)

Release gates:

```json
"gate:anatomy": "node tools/dev/require-supported-node.mjs -- npm run --silent gate:anatomy:legs",
"gate:anatomy:legs": "npx vitest run tests/integration/discovery-route-parity.test.ts tests/unit/http/problem-envelope-drift.test.ts --no-file-parallelism && npm run test:imports && npm run test:ui-contract",
"test:release:unit": "node tools/dev/run-with-cleanup.mjs vitest run tests/unit --reporter=default --reporter=json --outputFile.json=output/release/unit-vitest.json",
"test:release:integration": "node tools/dev/run-with-cleanup.mjs vitest run tests/integration convex --no-file-parallelism --test-timeout=15000 --reporter=default --reporter=json --outputFile.json=output/release/integration-vitest.json",
"test:release:architecture": "node tools/dev/run-with-cleanup.mjs vitest run tests/integration/canonical-operation-reads.test.ts tests/integration/current-operation-snapshot-stability.test.ts --no-file-parallelism --test-timeout=60000",
"test:conformance": "node tools/dev/run-listed-vitest.mjs tests/unit/action-invocation/durable-action-invocation-transact.test.ts ... (explicit listed file set)",
"test:release:source": "mkdir -p output/release && npm run verify:deployment-manifest -- --environment development && npm run test:conformance && npm run test:chat:conformance && npm run verify:convex-generated:anonymous && npm run verify:release-integrity && npm run test:release:source:after-codegen",
"test:release:source:after-codegen": "npm run test:release:architecture && npm run lint && npm run typecheck && npm run test:release:unit && npm run test:release:integration && npm run test:types && npm run test:imports && npm run test:ts-standards && npm run test:seo && npm run test:ui-contract && npm run test:e2e && npm run test:e2e:a11y && npm run test:cli-package && npm run build",
"test:release": "npm run test:release:source",
"gate:release": "npm run test:release:source"
```

`test:conformance` runs an explicit frozen file list (durable-action-invocation transact/lease/release/cancel/observation/result + operation-invoke admit/dispatch/recover + recovery actions + more) via `run-listed-vitest.mjs` — it is the conformance validator RULES.MD names as a legitimate gate. `test:chat:conformance` similarly lists 11 chat-specific files.

**Fixture-mode duality**: boundary tests run two modes. `AE_SCAN_MODE=clean` (default in test scripts) scans real runtime sources and asserts zero violations; `AE_SCAN_MODE=fixtures` (e.g. `test:imports:fixtures`, `test:ts-standards:fixtures`) scans `tests/fixtures/bad-*` and asserts the scanner *catches* each violation class (`module-private-import`, `explicit-any`, `convex-any-validator`, `route-convex-schema-import`, …). This proves the scanners detect violations, per RULES.MD's anti-tautology rule (tests/imports/ts-standards.test.ts, private-imports.test.ts, route-boundary.test.ts).

## convex-test Usage Pattern

Real setup from `convex/agentAccessPrincipals.test.ts` (lines 1-30):

```ts
import { makeFunctionReference, type UserIdentity } from 'convex/server'
import { convexTest } from 'convex-test'
import schema from './schema'
import { api } from './_generated/api'
const modules = import.meta.glob('./**/*.ts')
const identity = (subject: string): UserIdentity => ({
  subject, issuer: 'https://clerk.example.test',
  tokenIdentifier: `https://clerk.example.test|${subject}`, exp: 1_000,
})
const registerIssuedBinding = makeFunctionReference<'mutation', RegisterArgs, RegisterResult>(
  'agentAccessPrincipals:registerIssuedAgentBindingForServer',
)
```

Shared harness `tests/helpers/convex-fixtures.ts` (real code):

```ts
export const convexModules = Object.fromEntries(
  Object.entries(import.meta.glob('../../convex/**/*.{ts,js}')).map(
    ([path, load]) => [path.replace('../../convex/', './'), load],
  ),
)
export function convexTestWithMarketComponents() {
  const backend = convexTest(schema, convexModules)
  registerRateLimiter(backend)           // @convex-dev/rate-limiter/test
  agentTest.register(backend)            // @convex-dev/agent/test
  registerAggregate(backend, 'marketEvidence')  // + 3 more aggregate components
  return backend
}
export function convexTestWithWorkers(options = {}) {
  const backend = convexTestWithMarketComponents()
  registerWorkpool(backend)              // @convex-dev/workpool/test
  if (options.pauseWorkpool === true) { /* maxParallelism: 0 via workpool.config.update */ }
  return backend
}
```

Integration tests use it: `tests/integration/capability-operation-workpool.test.ts` imports `convexTestWithWorkers, publishedBusinessOwner` from helpers, mocks `undici.fetch` via `vi.hoisted(() => vi.fn<typeof UndiciFetch>())`, and drives real route handlers (`handleMarketOperationSearchRequest` etc.) against the in-memory Convex backend — real cross-layer behavior, only external I/O stubbed.

## Import-Boundary Tests (tests/imports/)

- `module-boundaries.test.ts`: `scanModuleBoundaries({ manifest: MODULE_BOUNDARY_MANIFEST })` — asserts 27 modules, zero violations, zero declared-graph cycles, every manifest exception actually used; plus fixture-driven negative cases asserting rules `module-undeclared-entry` and `module-forbidden-edge` fire, and a cycle-rejection case. Also `scanTestOnlyModuleBoundaries` (all ~60 white-box exceptions must be used) and `scanRuntimeModuleConsumers` (routes/lib/components/convex must consume declared entries).
- `private-imports.test.ts` / `route-boundary.test.ts` / `ts-standards.test.ts`: fixture-mode/clean-mode pattern described above. `ts-standards` rejects `explicit-any`, `non-null-assertion`, `convex-any-validator`, `broad-status-string`, `hard-coded-source-csrf`, `client-exposed-source-write-secret`.
- Others (globbed): `chat-sharing-boundaries`, `backup-imports`, `capability-supply-boundaries`, `capability-contract[-registry]-boundaries`, `action-invocation-host-boundaries`, `operation-surface-conformance`, `development-evidence-boundary`, `faux-runtime-surfaces`, `deployment-manifest-boundaries`, `clerk-security-exports`.

## UI-Contract Tests (tests/ui-contract/ui-contract.test.ts)

Two real assertions: (1) `scanUiContract([{root:'src/components/ae'},{root:'src/routes'}])` must return zero violations — product UI stays on semantic visual tokens; (2) shell primitives (`src/components/ui/dialog.tsx`, `sheet.tsx`, `sidebar.tsx`) must NOT contain `transition-all`, `bg-black/\d+`, `shadow-(sm|md|lg|xl|2xl)` and MUST contain `duration-base`, `ease-emphasized`, `shadow-overlay`, `active:scale-[0.96]`.

## Playwright Configs

1. **playwright.config.ts** (default): `testDir: './tests/e2e'`, fullyParallel, 30s timeout, projects `compact-chromium` (375×812) + `wide-chromium` (1440×1100). Without `PLAYWRIGHT_BASE_URL`, boots its own server: `npm run dev -- --port 3020 --strictPort --host 127.0.0.1` with `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E: 'true'`.
2. **playwright.authenticated.config.ts**: `testDir: './tests/e2e/authenticated'`, workers 1, 120s timeout. Environment from `tests/e2e/authenticated/environment` (`requireAuthenticatedE2EEnvironment()`); when configured, runs a `clerk-setup` global-setup project first, webServer on port 3021 with `AE_CANONICAL_BASE_URL`. Release path `test:e2e:authenticated:required` sets `AE_REQUIRE_AUTHENTICATED_E2E=true` so missing Clerk config fails rather than skips.
3. **playwright.chat-staging.config.ts**: `testDir: './tests/deploy-smoke'`, matches only `chat-anonymous-streaming-smoke.spec.ts` + `chat-browser-staging.spec.ts`; JSON report to `output/release/playwright-chat-staging-smoke.json`; external `PLAYWRIGHT_BASE_URL` (no local server).
4. **playwright.deploy-smoke.config.ts**: `testDir: './tests/deploy-smoke'`, JSON report to `output/release/playwright-deploy-smoke.json`; runs `tests/deploy-smoke/phase1-deploy-smoke.spec.ts` against a deployed environment.

Common Playwright settings: `trace: 'on-first-retry'` (default/authenticated) or `'retain-on-failure'` (smoke), `screenshot: 'only-on-failure'`, `forbidOnly` in CI.

## Helpers (tests/helpers/)

`convex-fixtures.ts` (convex-test backend builders, owner/identity seeding, `publishedBusinessOwner`), `source-write-admission.ts` (`installTestSourceWriteSecret`, `withSourceWrite`, `withSourceWriteCommand`), `x402-payment-attempt.ts` (white-box exception into action-invocation internals), `openrouter-contract-server.ts` (local HTTP stub for chat model contract), `local-e2e-business-fixtures.ts`, `registry-local-e2e.ts`, `http.ts`, `agent-directory-fixture.ts`, `durable-write-fixture-action.ts`, `discovery-fixture-routes.ts`, `source-files.ts`, `public-business-fixture.ts`. Per-module harnesses also live beside integration tests (`tests/integration/capability-publication-harness.ts`, `capability-supply-owner-funnel-harness.ts`).
