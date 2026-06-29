# Testing Patterns

**Analysis Date:** 2026-06-29

## Test Framework

**Runner:**
- Vitest 4.1.9 for `.test.ts` and `.test.tsx` files under `tests/`, configured in `vitest.config.ts`.
- Playwright 1.61.1 for `.spec.ts` browser and deploy-smoke files under `tests/e2e/` and `tests/deploy-smoke/`, configured in `playwright.config.ts` and `playwright.deploy-smoke.config.ts`.
- TypeScript 6.0.3 typechecking is a required quality gate through `npm run typecheck` in `package.json`.
- Convex code generation is checked through `npm run check:convex-codegen`, which runs `convex codegen --dry-run --typecheck=disable`.

**Assertion Library:**
- Use Vitest `expect`, `expectTypeOf`, `describe`, and `it`, as in `tests/types/domain-contracts.test.ts`.
- Use Playwright `expect` and role/label locators, as in `tests/e2e/public-owner-ui.spec.ts`.

**Run Commands:**
```bash
npm run test                     # Run all Vitest .test.ts/.test.tsx files
npm run test:unit                # Run tests/unit
npm run test:integration         # Run tests/integration
npm run test:types               # Run tests/types
npm run test:imports             # Run import and route-boundary guardrails in clean mode
npm run test:imports:fixtures    # Run import guardrails against bad fixtures
npm run test:source-mining       # Run source-mining guardrail in clean mode
npm run test:source-mining:fixtures # Run source-mining guardrail against bad fixtures
npm run test:ts-standards        # Run runtime TypeScript standards scan
npm run test:ts-standards:fixtures # Run TypeScript standards scan against bad fixtures
npm run test:copy                # Run public/phase copy guardrails
npm run test:copy:fixtures       # Run copy guardrails against bad fixtures
npm run test:ui-contract         # Run UI class/status contract guardrails
npm run test:ui-contract:fixtures # Run UI contract scanner against bad fixtures
npm run test:seo                 # Run SEO and discovery file tests
npm run test:e2e                 # Run Playwright E2E tests/e2e
npm run test:e2e:a11y            # Run Playwright accessibility subset
npm run test:a11y                # Alias for Playwright accessibility subset
npm run test:deploy-smoke        # Run deployed Phase 1 smoke test
npm run test:provider-smoke:resend # Run deployed Resend provider smoke test
npm run test:provider-smoke:novu # Run deployed Novu provider smoke test
npm run test:all                 # Run typecheck, Convex dry-run codegen, Vitest suites, scans, and build
```

## Test File Organization

**Location:**
- Unit tests live in `tests/unit/` and domain subdirectories such as `tests/unit/billing/`, `tests/unit/catalog/`, `tests/unit/security/`, `tests/unit/convex/`, and `tests/unit/server/`.
- Integration tests live in `tests/integration/` and exercise route handlers plus public seams, such as `tests/integration/registry-api.test.ts`.
- Type contract tests live in `tests/types/`, such as `tests/types/domain-contracts.test.ts`.
- Source guardrail tests live in `tests/imports/`, backed by scanners in `src/lib/ui/contract-scans.ts`.
- UI contract tests live in `tests/ui-contract/` and scan `src/routes/` plus `src/components/ae/`.
- Copy and phase-claim tests live in `tests/copy/`.
- SEO and discovery-output tests live in `tests/seo/`.
- Browser E2E tests live in `tests/e2e/` with accessibility tests in `tests/e2e/a11y/`.
- Deploy smoke tests live in `tests/deploy-smoke/` and use `playwright.deploy-smoke.config.ts`.
- Negative scan fixtures live in `tests/fixtures/`.

**Naming:**
- Use `*.test.ts` for Vitest tests, such as `tests/unit/billing/rail.test.ts`.
- Use `*.spec.ts` for Playwright tests, such as `tests/e2e/public-owner-ui.spec.ts` and `tests/deploy-smoke/phase1-deploy-smoke.spec.ts`.
- Use `*.fixture` for intentional bad scan inputs under `tests/fixtures/`.

**Structure:**
```text
tests/
├── unit/             # Pure domain, billing rail, Convex runtime adapters, server seams
├── integration/      # Route handlers plus durable public readbacks
├── types/            # expectTypeOf and @ts-expect-error contracts
├── imports/          # Architecture, source-mining, and TypeScript source scans
├── ui-contract/      # UI class and status presentation scans
├── copy/             # Public copy, payment claims, and phase-claim scans
├── seo/              # SEO, robots, sitemap, llms, UCP tests
├── e2e/              # Local Playwright browser flows
├── deploy-smoke/     # Remote/deployed Playwright smoke checks
└── fixtures/         # Negative scan fixtures
```

## Test Structure

**Suite Organization:**
```typescript
import { describe, expect, it } from 'vitest'

import { brandNonEmpty } from '@/modules/common/ids'
import { startPaidActivation } from '@/modules/billing/public'

describe('billing rail contract', () => {
  it('rejects client supplied money and provider fields', async () => {
    const result = await startPaidActivation(state(), commandWithUnsafeField(), provider())

    expect(result).toMatchObject({
      kind: 'error',
      code: 'billing_client_field_rejected',
    })
  })
})
```

**Patterns:**
- Keep unit tests focused on public module seams such as `src/modules/billing/public.ts`, `src/modules/catalog/public.ts`, `src/modules/security/public.ts`, and `src/modules/observability/public.ts`.
- Use in-memory source-state factories such as `createEmptyBillingSourceState` from `src/modules/billing/internal/operations.ts`, `createEmptyBusinessSourceState` from `src/modules/business/public.ts`, and `createDefaultDiscoverySourceState` from `src/modules/discovery/public.ts`.
- Use `brandNonEmpty` from `src/modules/common/ids.ts` for branded IDs in tests, as in `tests/unit/billing/rail.test.ts`.
- Assert whole result shapes with `toEqual` or `toMatchObject`, and assert absence of private data with `JSON.stringify(...).not.toContain(...)` or `.not.toMatch(...)`.
- Use `try`/`finally` around test injection setters and env mutations so global test seams reset reliably, as in `tests/seo/discovery-files.test.ts` and `tests/unit/server/server-seams.test.ts`.
- Avoid `.only` and `.skip`; no focused or skipped tests are present under `tests/`.

## Mocking

**Framework:** Hand-rolled fakes and dependency injection are preferred; Vitest `vi` is used narrowly.

**Patterns:**
```typescript
const deterministicProvider = provider()
const result = await startPaidActivation(sourceState, command, deterministicProvider)

expect(result.kind).toBe('ok')
expect(deterministicProvider.attachCalls).toHaveLength(1)
```

**What to Mock:**
- Mock external query clients through test-only setters such as `setPublicRegistryQueryClientForTests` in `src/routes/api.businesses.ts` and `setPublicDiscoveryQueryClientForTests` in `src/modules/discovery/public.ts`.
- Mock network behavior by passing a `fetch` callback into server seams, as in `tests/unit/server/server-seams.test.ts` for Convex, Resend, Novu, and provider seam behavior.
- Mock Convex auth/runtime boundaries with small fake DB/context classes, as in `tests/unit/convex/phase1-runtime.test.ts`.
- Mock billing providers with deterministic objects that implement `AutumnProvider`, as in `tests/unit/billing/rail.test.ts`.
- Use `vi.stubEnv` only for environment behavior that is itself under test.
- Use Playwright `request.newContext({ storageState })` for deployed authenticated smoke flows in `tests/deploy-smoke/phase1-deploy-smoke.spec.ts`.

**What NOT to Mock:**
- Do not mock the domain function being tested; call public seams such as `startPaidActivation`, `publishBusinessCatalog`, and `validateAuditEvent` directly.
- Do not mock route handlers when integration tests can call exported handlers directly, such as `handleDurableListBusinessesRequest` in `src/routes/api.businesses.ts`.
- Do not bypass private-data assertions; tests should prove output omits fields such as owner IDs, source hashes, raw contact values, provider payloads, and unredacted payment/provider data.
- Do not treat env vars, provider dashboards, screenshots, return URL arrival, or webhook arrival as paid-state proof. Tests should assert source-owned readback/evidence rows.

## Fixtures and Factories

**Test Data:**
```typescript
const businessId = brandNonEmpty('business:demo', 'BusinessId')
const operationKey = brandNonEmpty('billing:checkout:1', 'OperationKey')

expect(
  await startPaidActivation(state(), {
    authority: { ownerId, businessId },
    businessId,
    ownerId,
    offerId,
    operationKey,
    correlationId,
    appBaseUrl: 'https://agentic.example',
    now,
  }, provider())
).toMatchObject({ kind: 'ok' })
```

**Location:**
- Domain state factories live with public seams or the owning module internals, such as `createEmptyBillingSourceState` in `src/modules/billing/internal/operations.ts`.
- Test-local helper functions are placed at the bottom of each test file, as in `tests/unit/billing/rail.test.ts`, `tests/integration/claim-publish.test.ts`, and `tests/seo/discovery-files.test.ts`.
- Negative scan fixtures live under `tests/fixtures/bad-imports/`, `tests/fixtures/bad-source-mining/`, `tests/fixtures/bad-copy/`, `tests/fixtures/bad-ui-contract/`, and `tests/fixtures/bad-ts-standards/`.
- Temporary files for scan-specific copy examples should be created under `tmpdir()` and cleaned with `rmSync(..., { recursive: true })`, as in `tests/copy/claims-register.test.ts`.

## Coverage

**Requirements:** No coverage threshold or coverage script is detected in `package.json` or `vitest.config.ts`.

**View Coverage:**
```bash
Not configured
```

## Test Types

**Unit Tests:**
- Use `tests/unit/` for pure domain behavior, source-state transitions, Convex runtime adapters, server-provider seams, and billing rail behavior.
- `tests/unit/billing/rail.test.ts` covers the Phase 5-facing rail contract: exported billing functions, Convex billing tables, env-var readiness rejection, client-supplied money/provider field rejection, idempotency replay/conflict, unsigned provider event rejection, signed provider evidence, paid-state transition, and receipt reads.
- `tests/unit/billing/owner-routes.test.ts` covers parked owner billing route helpers under `src/future-phases/05-paid-activation-money-rails/routes/`: unavailable/offer states, provider redirect/return/cancel summaries, paid/refunded/disputed/chargeback receipts, module loading, and disallowed money-rail copy absence.
- `tests/unit/server/server-seams.test.ts` covers server-only provider config and billing webhook refusal in `src/lib/server/billing-provider.ts` and `src/future-phases/05-paid-activation-money-rails/routes/api.billing.webhook.ts`.
- Use direct Convex function tests for runtime bridges under `tests/unit/convex/`, such as `tests/unit/convex/phase1-runtime.test.ts`.

**Integration Tests:**
- Use `tests/integration/` for route handler parity, API readbacks, durable flow behavior, suppression behavior, and cross-surface consistency.
- Call exported route handlers directly with `new Request(...)`, as in `tests/integration/registry-api.test.ts`, `tests/integration/discovery-routes.test.ts`, and `tests/integration/discovery-route-parity.test.ts`.
- Phase 5 runtime integration should add billing-specific files under `tests/integration/billing/` when routes move from parked future-phase helpers to active route/server behavior.

**Type Contract Tests:**
- Use `tests/types/` for `expectTypeOf`, runtime validator parity, and intentional `@ts-expect-error` invalid-state checks.
- Keep validators and exported literal unions in sync, as in `tests/types/domain-contracts.test.ts`.
- Phase 5 billing type tests should prove billing operation statuses, provider values, receipt statuses, audit event names, and public projection DTOs do not widen to broad `string`.

**Guardrail Scan Tests:**
- Use `tests/imports/` for import boundaries, source-mining constraints, route boundaries, and TypeScript standards.
- `tests/imports/scan-targets.ts` centralizes clean runtime targets and fixture-mode targets controlled by `AE_SCAN_MODE`.
- `tests/imports/route-boundary.test.ts` keeps active routes as adapters and rejects route imports of `convex/schema.ts`, Convex transport plumbing, module internals, and future provider SDKs.
- `tests/imports/private-imports.test.ts` keeps modules and routes on `public.ts` seams.
- `tests/imports/source-mining.test.ts` rejects backup coupling, future-surface symbols, future protocol symbols, and premature Phase 4/5 route registrations.
- `tests/imports/ts-standards.test.ts` rejects explicit `any`, non-null assertions, `v.any()`, broad statuses, hard-coded source CSRF literals, and client-exposed source-write secrets.

**Copy and Payment Claim Tests:**
- `tests/copy/phase1-banned-copy.test.ts` runs `scanCopyClaims` over public route/component/UI/SEO/discovery/public asset targets and rejects unsupported owner/public capability claims.
- `tests/copy/claims-register.test.ts` proves phase-owned copy allowances and public overclaim rejections, including Phase 5 Autumn+Stripe paid activation, wallet/credits/balance, Connect/x402, custody, settlement, direct Stripe authority, and `paymentRequired` claims.
- `tests/copy/discovery-overclaim.test.ts` proves discovery outputs keep unsupported protocol/action/payment surfaces absent while retaining explicit negative flags such as `paymentRequired=false`.
- Phase 5 implementation must expand these tests before public paid claims ship: every allowed public paid claim needs claim ID, exact copy, public asset, route/readback evidence, funnel event, support owner, valid launch stage, and kill rule.

**UI Contract Tests:**
- `tests/ui-contract/class-scan.test.ts` scans active `src/routes/` and `src/components/ae/` for raw colors, `space-*`, `transition-all`, arbitrary visual tokens, and route-local scroll listeners.
- `tests/ui-contract/status-copy.test.ts` proves every `aeStatusValues` entry has label, description, and priority.
- `tests/ui-contract/protected-action-status-copy.test.ts` proves route-tree registration and selected-action status text for Phase 4.
- Phase 5 UI work should add billing status-copy and route-tree tests when parked billing routes move into `src/routes/`.

**SEO Tests:**
- Use `tests/seo/` for robots, sitemap, llms, UCP, JSON-LD, noindex, headers, and crawler-safe readbacks.
- Phase 5 public paid activation SEO tests should prove payment/custody/settlement/paymentRequired/direct-Stripe claims do not appear before selected-rail smoke/readback evidence.

**E2E Tests:**
- Use Playwright tests under `tests/e2e/` for local browser flows, keyboard/accessibility assertions, and public owner journeys.
- `playwright.config.ts` runs compact `375x812` and wide `1440x1100` Chromium projects and starts `npm run dev` against `http://127.0.0.1:3000`.
- Phase 5 E2E must cover activation, redirect/return/cancel, Billing Center, receipt detail, operator reconciliation, keyboard/focus, compact width, and redacted provider-error states after routes are active.

**Deploy Smoke Tests:**
- Use `tests/deploy-smoke/` with `playwright.deploy-smoke.config.ts` for deployed-route, provider, and support-record smoke checks.
- Deploy smoke tests validate required environment-derived URLs, storage states, HTTPS-only targets, headers, private-data absence, and provider readbacks.
- Phase 5 provider smoke evidence must include timestamp, environment, provider family, stable provider refs, payload hash, route/readback evidence, redacted error if any, operator next action, and proof that env var presence is not accepted as provider readiness.

## Common Patterns

**Async Testing:**
```typescript
await withDiscoveryQueryClient(state, async () => {
  const response = await handleDurableLlmsTxtRequest(new Request('https://ae.example/llms.txt'))
  expect(response.headers.get('Cache-Control')).toBe('no-store')
})
```

**Error Testing:**
```typescript
await expect(
  verifyAutumnWebhook({ rawBody: '{"id":"evt_1"}', headers: new Headers(), secret: 'whsec' })
).rejects.toMatchObject({ code: 'unverified_webhook', status: 401 })
```

**Scan Testing:**
```typescript
const violations = scanUiContract(
  isFixtureMode() ? fixtureTargets('tests/fixtures/bad-ui-contract') : cleanUiTargets
)

expect(isFixtureMode() ? violations.length > 0 : violations.length === 0).toBe(true)
```

**Phase 5 Closeout Verification:**
```bash
npm run typecheck
npm run check:convex-codegen
npm run test:unit
npm run test:integration
npm run test:e2e
npm run test:e2e:a11y
npm run test:a11y
npm run test:types
npm run test:imports
npm run test:source-mining
npm run test:ts-standards
npm run test:copy
npm run test:seo
npm run test:ui-contract
npm run build
npm run test:all
```

---

*Testing analysis: 2026-06-29*
