# Testing Patterns

**Analysis Date:** 2026-07-07

## Test Framework

**Runner:**
- Vitest 4.1.9 for unit, integration, copy, import, SEO, type-contract, eval, and script tests.
- Config: `vitest.config.ts`
- Vitest config uses `environment: 'node'`, `include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx']`, `globals: false`, and `watch: false`.
- DOM/component tests opt into jsdom per file with `/** @vitest-environment jsdom */` when needed, as documented in `docs/CONTRIBUTING.md`.

**Browser Runner:**
- Playwright 1.61.1 for local E2E/a11y and deployed/provider smoke tests.
- Config: `playwright.config.ts` for local E2E.
- Config: `playwright.deploy-smoke.config.ts` for deployed/provider smoke posture.

**Assertion Library:**
- Vitest `expect`, `expectTypeOf`, `describe`, and `it`.
- `@testing-library/react` and `@testing-library/jest-dom` are available for component tests.
- Playwright `expect` for browser flows.

**Run Commands:**
```bash
npm test                         # Run all Vitest tests matched by vitest.config.ts
npm run typecheck                # tsc --noEmit
npm run test:unit                # Vitest unit suite
npm run test:integration         # Route/server integration suite
npm run test:all                 # Broad local gate
npm run test:release             # Release gate with eval, graph freshness, browser, a11y, build
```

## Package Scripts

**Static and Build Gates:**
```bash
npm run typecheck                # tsc --noEmit
npm run check:convex-codegen     # convex codegen --dry-run --typecheck=disable
npm run build                    # vite build
```

**Vitest Gates:**
```bash
npm run test:unit                # vitest run tests/unit
npm run test:integration         # vitest run tests/integration
npm run test:types               # vitest run tests/types
npm run test:copy                # AE_SCAN_MODE=clean vitest run tests/copy
npm run test:seo                 # vitest run tests/seo
npm run test:eval                # coverage audit + promptfoo eval + tests/eval
npm run test:graph-freshness     # node --import tsx tests/scripts/assert-graph-fresh.ts
```

**Import and Source Scanners:**
```bash
npm run test:imports             # Backup/private/route-boundary scanner suite
npm run test:source-mining       # Future-phase/source-mining scanner
npm run test:ts-standards        # TypeScript standards scanner
npm run test:imports:fixtures    # Negative fixtures for import scanners
npm run test:source-mining:fixtures
npm run test:ts-standards:fixtures
npm run test:copy:fixtures
```

**Browser and Smoke Gates:**
```bash
npm run test:e2e                 # playwright test tests/e2e
npm run test:e2e:a11y            # playwright test tests/e2e/a11y
npm run test:a11y                # Same as test:e2e:a11y
npm run test:deploy-smoke        # Deployed Phase 1 smoke
npm run test:phase2-support-smoke
npm run test:provider-smoke:resend
npm run test:provider-smoke:novu
npm run test:provider-smoke:autumn-stripe
npm run test:provider-smoke:business-action-stripe
npm run test:provider-smoke:capability-check
npm run test:dev-smoke:wba-agent-door
```

## Test File Organization

**Location:**
- Unit tests: `tests/unit/**`
- Integration tests: `tests/integration/**`
- Import/source/type-standard scanners: `tests/imports/**`
- Copy guardrails: `tests/copy/**`
- SEO/discovery tests: `tests/seo/**`
- Type-level contracts: `tests/types/**`
- Browser tests: `tests/e2e/**`
- Accessibility browser tests: `tests/e2e/a11y/**`
- Deployed/provider smokes: `tests/deploy-smoke/**`
- Eval tests and promptfoo suite: `tests/eval/**`, `eval/answer/**`
- Intentional scanner negatives: `tests/fixtures/bad-*`
- Test helpers: `tests/helpers/**`

**Naming:**
- Vitest files use `*.test.ts` or `*.test.tsx`.
- Playwright browser files use `*.spec.ts`.
- Negative scanner examples use `.fixture` under `tests/fixtures/bad-*`.

**Structure:**
```text
tests/
├── unit/             # Domain logic, Convex runtime shims, components
├── integration/      # Real Request/Response route/server tests
├── imports/          # Source scanners and scan target helpers
├── copy/             # Public/assistant copy guardrails
├── seo/              # Sitemap, robots, JSON-LD, canonical/noindex tests
├── types/            # expectTypeOf runtime/type contract checks
├── e2e/              # Playwright browser flows
├── deploy-smoke/     # Real deployment/provider smokes
├── eval/             # Answer pipeline tests
├── fixtures/         # Intentionally bad scanner fixtures
└── helpers/          # Shared test ports/stubs/helpers
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
    expect(JSON.stringify(body)).not.toMatch(/ownerId|clerk|apiKey/i)
  })
})
```

**Patterns:**
- Unit tests import module seams and assert exact behavior. Example: `tests/unit/actions/registry.test.ts`.
- Integration tests call exported route handler seams with real `Request` objects and inspect real `Response` bodies. Example: `tests/integration/registry-api.test.ts`.
- Scanner tests run against clean source in `AE_SCAN_MODE=clean` and against intentionally bad fixtures in `AE_SCAN_MODE=fixtures`. Example: `tests/imports/ts-standards.test.ts`.
- Type tests use `expectTypeOf` plus runtime schema assertions. Example: `tests/types/domain-contracts.test.ts`.
- Copy tests dynamically create temporary fixtures when validating scanner edge cases. Example: `tests/copy/pm05-trust-language-gate.test.ts`.

## Mocking

**Framework:** Vitest mocks where needed; many tests prefer explicit in-memory states and helper ports over broad mocks.

**Patterns:**
```typescript
const previous = process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = 'true'

try {
  const registry = await loadRegistryRouteReadback({ q: '', limit: 10 })
  expect(registry.result.items.length).toBeGreaterThan(0)
} finally {
  if (previous === undefined) {
    delete process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
  } else {
    process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = previous
  }
}
```

**What to Mock:**
- External model/provider contracts when the test owns app behavior, using helpers such as `tests/helpers/openrouter-contract-server.ts`.
- Source-write admission input construction where the test is focused on a route or action boundary, using `tests/helpers/source-write-admission.ts`.
- Browser auth bypass only through the documented local E2E flag in `playwright.config.ts`.

**What NOT to Mock:**
- Do not mock the route handler being tested in integration tests.
- Do not mock domain state machines when validating their behavior.
- Do not fake provider/deployment smoke success; `tests/deploy-smoke/**` must fail loudly without real inputs.
- Do not treat negative fixtures in `tests/fixtures/bad-*` as product examples.

## Fixtures and Factories

**Test Data:**
```typescript
const state = createDurablePublishedRegistryState({
  businessName: 'Fremantle Heat Pump Repairs',
  requestedSlug: 'fremantle-heat-pump-repairs',
  serviceName: 'Heat pump diagnostics',
  serviceQuery: 'heat pump fremantle',
  suburb: 'Fremantle',
})
```

**Location:**
- Domain factories often live in the test file when local to one suite, as in `tests/integration/registry-api.test.ts`.
- Shared helpers live in `tests/helpers/**`.
- Bad scanner fixtures live under `tests/fixtures/bad-copy`, `tests/fixtures/bad-imports`, `tests/fixtures/bad-source-mining`, `tests/fixtures/bad-ts-standards`, and `tests/fixtures/bad-ui-contract`.
- Dev seed fixtures are covered by `tests/unit/dev/dev-seed-fixture.test.ts`.

## Coverage

**Requirements:** No numeric coverage threshold or coverage reporter is configured in `vitest.config.ts`.

**View Coverage:**
```bash
Not configured
```

**Quality Coverage Model:**
- Coverage is gate-based rather than percentage-based.
- `npm run test:all` is the broad local proof for non-trivial PRs.
- `npm run test:release` is the release-candidate proof and includes eval, graph freshness, Playwright E2E, a11y, and build.
- `npm run test:eval:coverage` audits answer-eval scenario coverage through `eval/answer/scripts/audit-coverage.ts`.

## Test Types

**Unit Tests:**
- Scope: domain logic, action registry contracts, Convex runtime shims, UI/component behavior, observability helpers, and harness behavior.
- Examples: `tests/unit/actions/registry.test.ts`, `tests/unit/harness/run-loop.test.ts`, `tests/unit/convex/registry-runtime.test.ts`, `tests/unit/chat/home-landing-submit.test.tsx`.

**Integration Tests:**
- Scope: route/server/domain wiring without a browser.
- Pattern: construct a real `Request`, call `handle*Request`, assert on real `Response` status, headers, and serialized body.
- Examples: `tests/integration/agent-tools-api.test.ts`, `tests/integration/registry-api.test.ts`, `tests/integration/answer-route.test.ts`.

**Import and Boundary Tests:**
- `tests/imports/backup-imports.test.ts` blocks runtime imports from `.planning`/backup paths.
- `tests/imports/private-imports.test.ts` blocks cross-module `internal/*` imports.
- `tests/imports/route-boundary.test.ts` keeps routes as adapters over public seams.
- `tests/imports/source-mining.test.ts` blocks future-phase/protocol leakage.
- `tests/imports/ts-standards.test.ts` blocks broad type holes and unsafe source-write secret exposure.

**Copy Tests:**
- `tests/copy/phase1-banned-copy.test.ts` covers payment/booking/dispatch/PCI/escrow/payout/epistemic-label boundaries.
- `tests/copy/claims-register.test.ts` scans route-handler output and shared copy.
- `tests/copy/discovery-overclaim.test.ts` covers discovery files and agent discoverability overclaims.
- `tests/copy/pm05-trust-language-gate.test.ts` is the trust-language gate for public and assistant-visible descriptors.
- `tests/copy/scope3-handshake-banned-copy.test.ts` keeps Handshake/protocol vocabulary out of public and quiet-agent descriptors.

**SEO Tests:**
- `tests/seo/discovery-files.test.ts`, `tests/seo/public-business-seo.test.ts`, `tests/seo/public-thread-seo.test.ts`, `tests/seo/canonical-base-url.test.ts`, and related files cover sitemap, robots, `llms.txt`, JSON-LD, canonical, and noindex behavior.

**Type Contract Tests:**
- `tests/types/domain-contracts.test.ts` aligns exported unions with Zod schemas.
- `tests/types/business-action-contracts.test.ts`, `tests/types/capability-contracts.test.ts`, and `tests/types/protected-actions-contracts.test.ts` protect domain/action contracts.

**E2E Tests:**
- Framework: Playwright.
- `playwright.config.ts` defines `compact-chromium` at 375x812 and `wide-chromium` at 1440x1100.
- Playwright starts `npm run dev -- --port 3020 --strictPort --host 127.0.0.1` with `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E=true`.
- Tests live in `tests/e2e/**`; a11y tests live in `tests/e2e/a11y/**`.

**Provider/Deploy Smokes:**
- `playwright.deploy-smoke.config.ts` is fully serial (`fullyParallel: false`) with `trace: retain-on-failure`.
- `tests/deploy-smoke/**` requires real deployed URLs, operation ids, provider secrets, or provider readback depending on the smoke.
- A skipped or locally blocked provider smoke is not production proof.

## Common Patterns

**Async Testing:**
```typescript
it('searches deterministically across public tokens', async () => {
  const response = handleSearchBusinessesRequest(
    new Request('https://ae.example/api/businesses/search?q=emergency+plumber+parramatta'),
  )
  const body = await response.json()

  expect(response.status).toBe(200)
  expect(body).toMatchObject({
    kind: 'ok',
    query: 'emergency plumber parramatta',
  })
})
```

**Error Testing:**
```typescript
expect(schema.safeParse({ ...baseInput, body: 'a'.repeat(2_001) }).success).toBe(false)
expect(PublicStatusSchema.safeParse('live').success).toBe(false)
```

**Scanner Fixture Testing:**
```typescript
const violations = scanTypeScriptStandards(
  isFixtureMode() ? fixtureTargets('tests/fixtures/bad-ts-standards') : cleanRuntimeTargets(),
)

if (isFixtureMode()) {
  expect(violations.map((violation) => violation.rule)).toContain('explicit-any')
  return
}

expect(violations).toEqual([])
```

## Verification Selection

**Use the narrowest reliable proof first:**
- Pure domain logic: focused `vitest run tests/unit/<domain>/<file>.test.ts`, then `npm run typecheck`.
- Route/API handlers: focused `tests/integration/**`, then `npm run test:integration`.
- Public/assistant-visible copy: `npm run test:copy`; add `npm run test:seo` for metadata/discovery surfaces.
- Module boundary/import movement: `npm run test:imports`.
- Type or validator contract changes: `npm run test:types`.
- Convex schema/function changes: `npm run check:convex-codegen` plus `npm run typecheck`.
- UI/browser behavior: focused Playwright spec, then `npm run test:e2e` or `npm run test:a11y`.
- Non-trivial PR: `npm run test:all`.
- Release candidate: `npm run test:release`.

## Environment and Known Blockers

**Local Environment:**
- Node.js 20.x is documented in `docs/ONBOARDING.md` and used by `.github/workflows/eval-gate.yml`.
- npm 11.5.1 is pinned by `package.json`.
- Convex requires a linked deployment and env setup; `npm run check:convex-codegen` can fail before schema/bundling if Convex env or network access is missing.
- Playwright E2E requires browser binaries installed with `npx playwright install`.

**Env Files and Secrets:**
- `.env.example` documents variable names. Do not read or quote `.env` / `.env.*` secret values.
- `docs/ONBOARDING.md` lists required and optional env variable names for Convex, Clerk, source-write admission, billing, notifications, OpenRouter, search, observability, and maps.

**Known CI Drift:**
- `.github/workflows/eval-gate.yml` runs `npm run test:ui-contract`.
- `package.json` does not define `test:ui-contract`, and `tests/ui-contract/` is absent.
- `.agents/skills/ae-verification-gates/SKILL.md` marks this as known drift. Do not add a local `test:ui-contract` run to match CI without fixing the workflow or defining the missing gate intentionally.

**Known File Discrepancy:**
- `CLAUDE.md` and docs reference `AGENTS.md`, but `AGENTS.md` was not present as a live file during this scan. The prompt supplied AGENTS instructions for this run.

---

*Testing analysis: 2026-07-07*
