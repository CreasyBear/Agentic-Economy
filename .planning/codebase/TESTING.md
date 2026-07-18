# Testing Patterns

**Analysis Date:** 2026-07-18
**last_mapped_commit:** 19e988f5

## Test Framework

**Runner:**
- Vitest `4.1.9`
- Config: `vitest.config.ts`
- Defaults: `environment: 'node'`, `globals: false`, `watch: false`
- Includes: `tests/**/*.test.ts`, `tests/**/*.test.tsx`, `convex/**/*.test.ts`
- Path resolution: `resolve.tsconfigPaths: true` (honors `@/` from `tsconfig.json`)

**Assertion Library:**
- Vitest `expect` (imported explicitly — no globals)
- `@testing-library/jest-dom` available as a dependency for DOM matchers when needed

**Browser / E2E:**
- Playwright `@playwright/test` `1.61.1`
- Config: `playwright.config.ts` (local e2e on `127.0.0.1:3020`)
- Deploy smoke: `playwright.deploy-smoke.config.ts`

**Convex in-process:**
- `convex-test` (`convexTest(schema, modules)`) in integration suites

**Model evals:**
- Promptfoo + Vitest under `eval/` and `tests/eval/` (`npm run test:eval`)

**Run Commands:**
```bash
npm test                          # vitest run (all included unit/integration-style files)
npm run test:unit                 # vitest run tests/unit
npm run test:integration          # vitest run tests/integration (+ one convex test); --no-file-parallelism
npm run test:types                # tests/types
npm run test:imports              # boundary scanners (clean mode)
npm run test:ts-standards         # TypeScript hole scanner
npm run test:copy                 # public copy bans
npm run test:seo                  # SEO / discovery output
npm run test:ui-contract          # UI contract scanner
npm run test:e2e                  # playwright tests/e2e
npm run test:e2e:a11y             # playwright tests/e2e/a11y
npm run test:all                  # typecheck + codegen + unit + integration + gates + build
npm run test:release              # full release source + hosted readback/smoke
npm run typecheck                 # tsc --noEmit
npm run lint                      # oxlint --deny-warnings
npm run check:convex-codegen      # convex codegen dry-run
```

**Verification selection:** use the smallest gate that proves the change (`.agents/skills/ae-verification-gates/SKILL.md`).

## Test File Organization

**Location:**
- Separate `tests/` tree (not co-located next to `src/` modules), plus occasional `convex/**/*.test.ts`.

**Naming:**
- Behavior: `*.test.ts` / `*.test.tsx`
- Playwright: `*.spec.ts`
- Thinness campaign: `*-thinness.test.ts` under `tests/unit/**`

**Structure:**
```
tests/
├── unit/              # Pure/application/UI unit tests (+ thinness campaign)
├── integration/       # Cross-module + convex-test backends
├── imports/           # Import/boundary/ts-standards scanners
├── copy/              # Banned public copy
├── seo/               # SEO / metadata
├── ui-contract/       # UI contract scans
├── types/             # Type-level tests
├── e2e/               # Playwright local flows (+ a11y/)
├── deploy-smoke/      # Hosted/production smoke specs
├── eval/              # Eval suite Vitest wrappers
├── fixtures/          # Bad-* fixtures for scanner fixture mode
├── helpers/           # Shared test ports/helpers
├── ai/                # AI-related suites
└── scripts/           # Tooling script tests
```

**Mirror modules under unit:** e.g. `tests/unit/customer-request/application/composition.test.ts` ↔ `src/modules/customer-request/application/`.

## Test Structure

**Suite Organization:**
```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { interpretCompileCommit } from '@/modules/customer-request/application/public'

describe('customer-request application composition', () => {
  describe('interpret-compile orchestration ports', () => {
    beforeEach(() => {
      // reset mocks / ports
    })

    it('short-circuits interpretCompileCommit on committed-command replay', async () => {
      const result = await interpretCompileCommit(baseInput, ports, interpreterEnv)
      expect(result).toEqual(replayed)
      expect(loadRequestGraphPort).not.toHaveBeenCalled()
    })
  })
})
```
Reference: `tests/unit/customer-request/application/composition.test.ts`.

**Patterns:**
- Explicit vitest imports (`globals: false`).
- Nested `describe` by seam or concern.
- Behavior names in `it(...)` read like specs (“short-circuits…”, “rejects…”).
- Prefer `toEqual` / `toMatchObject` / `toBe` with independent literals — not recomputed tautologies.
- DOM suites: top-of-file `/** @vitest-environment jsdom */` + `afterEach(cleanup)` (`tests/unit/chat/ae-chat-loop-context.test.tsx`).

## Mocking

**Framework:** Vitest `vi` (`vi.fn`, `vi.mock`, `vi.mocked`, `mockReset`, `mockImplementation`).

**Patterns:**
```typescript
vi.mock('@/modules/customer-request/application/interpret-compile/interpreter', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/modules/customer-request/application/interpret-compile/interpreter')>()
  return {
    ...actual,
    createConfiguredRequestInterpreter: vi.fn(actual.createConfiguredRequestInterpreter),
  }
})

// Prefer port fakes over deep mocks:
const ports = {
  replayCommittedCommand: async () => undefined,
  loadRequestGraph: vi.fn(async () => { throw new Error('must not run') }),
  commitAggregate: async () => { throw new Error('must not run') },
}
```
Reference: `tests/unit/customer-request/application/composition.test.ts`.

**What to Mock:**
- External interpreters / network / LLM transports at the port or thin wrapper.
- Selective module exports via `importOriginal` when the rest of the module must stay real.
- HTTP/action callers with `vi.fn` returning fixture envelopes (`tests/unit/server/customer-request-agent-api.test.ts`).

**What NOT to Mock:**
- Pure compilers, projections, and eligibility logic under test — call the real public seam.
- Prefer injectable ports over mocking `internal/` collaborators.
- Do not mock away the behavior the test claims to prove.

## Fixtures and Factories

**Test Data:**
```typescript
import { LOCAL_E2E_BUSINESS_FIXTURES } from '@/lib/dev/local-e2e-business-fixtures'

const admittedLocalE2eBusiness = LOCAL_E2E_BUSINESS_FIXTURES.find(
  (fixture) => fixture.inquiryAdmission === 'admitted',
)
```
Reference: `tests/integration/registry-api.test.ts`.

**Location:**
- Runtime fixtures: `src/lib/dev/local-e2e-business-fixtures.ts`, module `createEmpty*` / `createDefault*` factories in `public.ts`.
- Scanner negative fixtures: `tests/fixtures/bad-imports/`, `bad-ts-standards/`, `bad-copy/`, `bad-ui-contract/`.
- Shared helpers: `tests/helpers/` (`answer-thread-test-port.ts`, `source-write-admission.ts`, `openrouter-contract-server.ts`).
- Capability fixtures: `tests/fixtures/capability-contract-v2.ts`.

**convex-test bootstrap:**
```typescript
import { convexTest } from 'convex-test'
import schema from '../../convex/schema'

const discoveredModules = import.meta.glob('../../convex/**/*.{ts,js}')
const modules = Object.fromEntries(
  Object.entries(discoveredModules).map(([path, load]) => [path.replace('../../convex/', './'), load]),
)

const backend = convexTest(schema, modules)
await backend.mutation(internal.devSeed.seedDevCatalog, {})
```
Reference: `tests/integration/customer-request-sandbox-registration.test.ts`.

## Coverage

**Requirements:** None enforced as a global % threshold in `vitest.config.ts`.

**Proof classes (do not conflate):**
| Class | Proves | Commands / paths |
|---|---|---|
| Unit / integration | Source behavior under fixtures | `test:unit`, `test:integration` |
| Import / TS / UI / copy / SEO scanners | Structural contracts | `test:imports`, `test:ts-standards`, `test:ui-contract`, `test:copy`, `test:seo` |
| Thinness | Host stays thin; logic in modules | `tests/unit/**/*-thinness.test.ts` |
| Browser e2e | Local browser flow | `test:e2e` |
| Deploy smoke | Named hosted surface | `test:deploy-smoke:*`, release smokes |
| Evals | Model suite performance | `test:eval` |

**View Coverage:** Not a standard npm script; add Vitest coverage only if explicitly requested.

## Test Types

**Unit Tests:**
- Scope: pure domain, application ports, projections, UI components, HTTP handler units.
- Approach: call `public` / application seams; inject ports; assert discriminated results.
- Examples: `tests/unit/customer-request/application/composition.test.ts`, `tests/unit/routing-kernel/neutral-kernel.test.ts`, `tests/unit/status/owner-trust-progress.test.tsx`.

**Integration Tests:**
- Scope: multi-module flows, registry API parity, capability publication, Convex mutations via `convex-test`.
- Approach: real schema + seeded catalog; assert DB/readback shape.
- Examples: `tests/integration/registry-api.test.ts`, `tests/integration/capability-supply-sandbox-registration.test.ts`, `tests/integration/customer-request-v2-application-path.test.ts`.
- Note: `npm run test:integration` disables file parallelism.

**E2E Tests:**
- Playwright under `tests/e2e/`; a11y under `tests/e2e/a11y/`.
- Local webServer via `npm run dev -- --port 3020` unless `PLAYWRIGHT_BASE_URL` is set.
- Projects: `compact-chromium` (375×812) and `wide-chromium` (1440×1100).
- Deploy/production smokes: `tests/deploy-smoke/*.spec.ts`.

**Guardrail / scanner tests:**
- `tests/imports/*.test.ts` — private imports, route boundaries, kernel/capability/customer-request boundaries, backup imports, ts-standards.
- Clean vs fixtures: `AE_SCAN_MODE=clean` (default in scripts) vs `AE_SCAN_MODE=fixtures`.
- Scanners live in `src/lib/ui/contract-scans.ts`.

## Thinness Campaign Pattern

**Glob:** `tests/unit/**/*-thinness.test.ts` (17 files at map time).

**Purpose:** Executable structure tests that keep Convex (or host) files as thin adapters and keep domain modules free of Convex runtime imports. They are a **campaign pattern** for deepening modules — not substitutes for behavior tests.

**How they work:**
1. `readFileSync` the Convex host (e.g. `convex/capabilitySupply.ts`, `convex/customerRequestApplication.ts`).
2. Assert forbidden domain literals / helper definitions are **absent** from the host.
3. Assert the host **imports** module ports and calls `*FromModule` / `*Application` delegates.
4. Walk `src/modules/...` with `readdirSync` and forbid `convex/server`, `_generated`, `MutationCtx` / `QueryCtx` / `Doc<>` in those files.

**Canonical examples:**
- `tests/unit/capability-supply/eligible-supply-thinness.test.ts`
- `tests/unit/capability-supply/convex-host-thinness.test.ts`
- `tests/unit/capability-supply/operation-ledger-thinness.test.ts`
- `tests/unit/capability-supply/publication-commands-thinness.test.ts`
- `tests/unit/capability-supply/supply-writers-thinness.test.ts`
- `tests/unit/customer-request/application/problem-route-thinness.test.ts`
- `tests/unit/customer-request/application/provide-facts-thinness.test.ts`
- `tests/unit/customer-request/application/compare-resume-thinness.test.ts`
- `tests/unit/customer-request/application/confirm-route-thinness.test.ts`
- `tests/unit/customer-request/application/authorize-preparation-thinness.test.ts`
- `tests/unit/customer-request/application/action-projection-thinness.test.ts`
- `tests/unit/customer-request/application/preparation-egress-thinness.test.ts`
- `tests/unit/customer-request/application/standing-route-thinness.test.ts`
- `tests/unit/customer-request/application/refine-thinness.test.ts`
- `tests/unit/customer-request/route-execution/journal-thinness.test.ts`
- `tests/unit/answer-thread/turn-path-thinness.test.ts`
- `tests/unit/routing-kernel/kernel-execute-reconcile-thinness.test.ts`

**When adding a thinness test:** place it under `tests/unit/<domain>/.../<concern>-thinness.test.ts`, target one host + one module root, and keep assertions source-text based (contain / not.toMatch). Pair with a behavior unit test for the moved logic.

## Common Patterns

**Async Testing:**
```typescript
it('reads catalog through registry and API', async () => {
  const detail = getPublicBusinessCatalogBySlug(state, { slug: 'fremantle-heat-pump-repairs' })
  expect(detail).toMatchObject({ kind: 'ok', /* ... */ })
})
```

**Error / refuse Testing:**
```typescript
expect(await provideCustomerRequestFacts(input, ports)).toEqual({
  kind: 'refused',
  reason: 'request_not_found',
})
```

**React Testing:**
```typescript
/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

afterEach(() => cleanup())

it('shows owner trust progress', () => {
  render(<AeStatusCard readback={ownerReadback(admission)} />)
  expect(screen.getByRole('link', { name: blocker.ownerLabel })).toBeTruthy()
})
```
References: `tests/unit/status/owner-trust-progress.test.tsx`, `tests/unit/chat/ae-chat-loop-context.test.tsx`.

**In-memory registry / API parity:**
- Build durable source state with module factories, then exercise `public` readers and `src/routes/api.businesses*` handlers together (`tests/integration/registry-api.test.ts`).

## Where to Add New Tests

| Change | Put test in |
|---|---|
| Module / application logic | `tests/unit/<domain>/.../*.test.ts` |
| Convex host extraction | `tests/unit/<domain>/**/*-thinness.test.ts` + behavior unit for moved code |
| Cross-module / Convex persistence | `tests/integration/*.test.ts` |
| New import boundary | `tests/imports/*-boundaries.test.ts` (+ fixture under `tests/fixtures/` if scanner) |
| Public copy | `tests/copy/` |
| SEO / discovery strings | `tests/seo/` |
| Browser flow | `tests/e2e/` or a11y subfolder |
| Hosted smoke | `tests/deploy-smoke/` |

---

*Testing analysis: 2026-07-18*
*last_mapped_commit: 19e988f5*
