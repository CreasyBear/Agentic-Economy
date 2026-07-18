# Testing Patterns

**Analysis Date:** 2026-07-18  
**Last mapped commit:** `5ea44454`

Verification ladder: `.agents/skills/ae-verification-gates/SKILL.md`.  
Hard gates inventory: `.planning/ENGINEERING-STANDARDS.md` (Testing standards).

## Test Framework

**Runner:**
- Vitest `4.1.9`
- Config: `vitest.config.ts` — Node environment, `tsconfigPaths: true`, `globals: false`, `watch: false`
- Include: `tests/**/*.test.ts`, `tests/**/*.test.tsx`, `convex/**/*.test.ts`

**Assertion Library:**
- Vitest `expect` / `expectTypeOf` (type tests)
- No separate Chai dependency

**Browser / E2E:**
- Playwright (`playwright` / `@playwright/test` ecosystem, config `playwright.config.ts`)
- Deploy smoke: `playwright.deploy-smoke.config.ts` under `tests/deploy-smoke/`

**Convex integration harness:**
- `convex-test` with `import.meta.glob('../../convex/**/*.{ts,js}')` module map (see `tests/integration/capability-supply-registration.test.ts`)

**Run Commands:**
```bash
npm test                         # vitest run (all included paths)
npm run test:unit                # vitest run tests/unit
npm run test:integration         # vitest run tests/integration + convex/customerRequestRouteMandate.test.ts --no-file-parallelism
npm run test:types               # vitest run tests/types
npm run test:imports             # import/boundary scans (AE_SCAN_MODE=clean)
npm run test:ts-standards        # TypeScript hole scans
npm run test:copy                # public/assistant copy gates
npm run test:seo                 # SEO/discovery file gates
npm run test:ui-contract         # UI contract scans
npm run test:e2e                 # playwright test tests/e2e
npm run test:a11y                # playwright tests/e2e/a11y
npm run test:all                 # typecheck + codegen + unit/integration/types/imports/ts-standards/copy/seo/ui-contract + build
npm run test:release             # release:source then release:hosted
npm run lint                     # oxlint --deny-warnings
npm run typecheck                # tsc --noEmit
```

Narrowest gate first when changing code (verification-gates skill). For thinness/architecture moves, run the matching `*-thinness.test.ts` under `tests/unit/`.

## Test File Organization

**Location:**
- Centralized under `tests/` (not co-located next to `src/` sources)
- ~373 `*.test.ts` / `*.test.tsx` / `*.spec.ts` files across suites
- Unit suite is largest: `tests/unit/` with domain subfolders mirroring modules

**Naming:**
- Behavior/unit: `<concern>.test.ts` (e.g. `problem-route.test.ts`, `inquiry-flow.test.ts`)
- Architecture thinness: `<concern>-thinness.test.ts` (e.g. `journal-thinness.test.ts`)
- Integration: `tests/integration/<flow>.test.ts`
- Type contracts: `tests/types/domain-contracts.test.ts`
- E2E: `tests/e2e/<flow>.spec.ts`
- Scan fixtures: `tests/fixtures/bad-*` with `.fixture` files; flip via `AE_SCAN_MODE=fixtures`

**Structure:**
```
tests/
├── unit/                 # Pure + ports-mocked domain tests + thinness campaign
├── integration/          # convex-test / HTTP / multi-module flows
├── types/                # expectTypeOf + @ts-expect-error contract tests
├── imports/              # boundary + ts-standards scanners
├── copy/                 # public language / claims gates
├── seo/                  # discovery SEO contracts
├── ui-contract/          # UI structure contract
├── e2e/                  # Playwright local browser
├── deploy-smoke/         # Hosted/production smoke Playwright
├── eval/                 # Model eval harness consumers
├── fixtures/             # Intentional bad fixtures for scanners
├── helpers/              # Shared test ports/helpers
└── ai/ scripts/ …        # Supporting suites
```

## Test Structure

**Suite Organization:**
```typescript
import { describe, expect, it, vi } from 'vitest'

import {
  reportRouteProblem,
  type ProblemRoutePorts,
} from '@/modules/customer-request/application/public'

describe('customer-request problem-route', () => {
  it('reports through ports and projects the reported state', async () => {
    const ports = basePorts({
      reportProblem: vi.fn(async () => ({ kind: 'reported' as const, /* … */ })),
    })
    const result = await reportRouteProblem(/* command */, ports)
    expect(result.kind).toBe('reported')
    expect(ports.reportProblem).toHaveBeenCalled()
  })
})
```

Pattern source: `tests/unit/customer-request/application/problem-route.test.ts`.

**Patterns:**
- Setup: local factory helpers (`basePorts`, `capability()`, `ownerAdmissionCatalog`) in the same test file
- Teardown: usually unnecessary; avoid shared mutable module state
- Assertion: prefer exact `toEqual` / `toMatchObject` on discriminated `kind` results; use `resolves.toEqual` for async Convex refusals

## Thinness-Test Campaign

**Purpose:** Prove Convex hosts stay thin adapters after deepen waves — logic lives in `src/modules/**`, effects go through ports, modules stay free of Convex runtime.

**Glob:** `tests/unit/**/*-thinness.test.ts` (23 files, ~2486 lines total at map time)

**How they work (prescriptive pattern):**
1. `readFileSync` the Convex host and relevant module/ports sources as strings.
2. Assert moved symbols are **not** redefined in the host (`function X` / `const X =`).
3. Assert host **delegates** via ports factories and module entrypoints (`inquirySourceStatePorts(…).load`, `journalMutationPorts(ctx)`, `*FromModule`, `*Application`).
4. Walk module trees with `listTsFiles` and forbid Convex imports (`_generated`, `convex/server`, `MutationCtx`, `Doc<`, often `ctx.db`).
5. Enforce **line budgets** (handler bodies, ports factories ≤80, implementation files ≤1000).
6. Enforce **concern isolation** (journal ↛ machines; notification ↛ source-state; evidence-load ↛ WritePlan; readiness HTTP ↛ graph).

Thinness tests do **not** mock runtime collaborators with `vi.fn` — they are static architecture gates. Pair them with a sibling `*.test.ts` that exercises behavior through ports.

### Inventory (by area)

**Inquiries** (`tests/unit/inquiries/`):
| File | Locks |
|------|--------|
| `convex-host-thinness.test.ts` | `convex/inquiries.ts` thin; source-state + notification ports; serialize split (`internal/projections/serialize.ts` vs `convex/inquirySerializeOperator.ts`); `submitPublicInquiry` ≤90 lines; ports impl ≤1000 |
| `inquiry-source-state-thinness.test.ts` | `inquirySourceStatePorts` ≤80; no notification outbox in source-state; shared `inquiryRuntimeDbHelpers`; ports type exported via ledger/public |
| `notification-bridge-thinness.test.ts` | `inquiryNotificationPorts` / `inquiryNotificationBridge`; no source-state leakage; reuse runtime DB helpers |

**Capability-supply** (`tests/unit/capability-supply/`):
| File | Locks |
|------|--------|
| `convex-host-thinness.test.ts` | Moved offering/binding/eligibility/quarantine/publication/ledger/graph helpers out of `convex/capabilitySupply.ts` |
| `graph-probe-thinness.test.ts` | Probe/graph bodies in `src/modules/capability-supply/internal/graph`; host uses `capabilitySupplyGraphPorts`; auth for `includeInactive` stays in host; no fetch/readiness cross-wire |
| `eligible-supply-thinness.test.ts` | Eligible inventory via `eligibleSupplyPorts` |
| `publication-commands-thinness.test.ts` | Publish/refresh/withdraw command deepening |
| `operation-ledger-thinness.test.ts` | Operation ledger deepen |
| `supply-writers-thinness.test.ts` | Supply writers deepen |

**Customer-request application** (`tests/unit/customer-request/application/`):
| File | Locks |
|------|--------|
| `problem-route-thinness.test.ts` | Problem-route application + `problemRoutePorts`; host uses `application/public` |
| `confirm-route-thinness.test.ts` | Confirm-route deepen |
| `compare-resume-thinness.test.ts` | Compare/resume deepen |
| `provide-facts-thinness.test.ts` | Provide-facts deepen |
| `refine-thinness.test.ts` | Refine deepen |
| `authorize-preparation-thinness.test.ts` | Authorize-preparation deepen |
| `preparation-egress-thinness.test.ts` | Preparation egress deepen |
| `action-projection-thinness.test.ts` | Action projection deepen |
| `standing-route-thinness.test.ts` | Standing-route deepen |

**Route-execution** (`tests/unit/customer-request/route-execution/`) — emphasize:

| File | Locks |
|------|--------|
| `journal-thinness.test.ts` | Host `startOrResume` / `leaseNextDispatch` / `recordOutcome` shells ≤40 lines via `journalMutationPorts` + machines; cancel/recover helpers stay module-owned; journal free of Convex + WritePlan; ports factory ≤1000; no sibling Start/Lease/Outcome Convex hosts |
| `machines-thinness.test.ts` | Machines under `route-execution/machines/`; effects only via `JournalMutationPorts`; journal must not import machines; each machines file ≤1000 |
| `evidence-load-thinness.test.ts` | Evidence assembly in `route-execution/evidence-load`; `exportCustomerEvidence` / support list thin via `evidenceLoadPorts` (ports ≤80); journal must not absorb evidence-load |

**Other:**
- `tests/unit/routing-kernel/kernel-execute-reconcile-thinness.test.ts`
- `tests/unit/answer-thread/turn-path-thinness.test.ts`

**When adding a deepen wave:** add or extend the matching `*-thinness.test.ts` in the same PR as the move; keep behavioral coverage in the non-thinness sibling test.

## Mocking

**Framework:** Vitest `vi` (`vi.fn`, occasionally `vi.mock`)

**Patterns:**
```typescript
function basePorts(overrides: Partial<ProblemRoutePorts> = {}): ProblemRoutePorts {
  return {
    loadCurrent: vi.fn(async () => ({ kind: 'current' as const, /* … */ })),
    reportProblem: vi.fn(async () => ({ kind: 'reported' as const, /* … */ })),
    ...overrides,
  }
}
```

**What to Mock:**
- Ports interfaces at the module seam (`ProblemRoutePorts`, journal/mutation ports in unit tests)
- External providers and HTTP when testing orchestration without live networks

**What NOT to Mock:**
- Pure domain functions under test (call them directly)
- Thinness/architecture gates (read source files instead)
- Import/copy/ts-standards scanners (they scan real trees; use fixture mode only to prove the scanner itself)

**Shoehorn:** `@total-typescript/shoehorn` is not currently used in the suite; prefer typed fixtures/`satisfies` and ports fakes over `as` casts. See `.agents/skills/migrate-to-shoehorn/SKILL.md` if introducing it.

## Fixtures and Factories

**Test Data:**
```typescript
const aggregate = {
  snapshot: { requestId: 'req:1', /* … */ },
  evaluation: { posture: 'progress_available' as const, /* … */ },
  outcome: 'plan_ready' as const,
  plan: { /* … */ },
} satisfies CompareResumeAggregate
```

**Location:**
- Inline factories in unit/integration files (dominant pattern)
- Shared fixtures: `tests/fixtures/` (e.g. `capability-contract-v2`, bad-import / bad-ts-standards fixtures)
- Helpers: `tests/helpers/` (`answer-thread-test-port.ts`, `source-write-admission.ts`, …)
- Integration: build state via `convexTest` mutations/helpers in-file (`publishedBusiness`, `ownerAdmin`, `operationContext`)

## Coverage

**Requirements:** No enforced coverage percentage in `package.json` / Vitest config.

**View Coverage:** Not configured as a first-class npm script — add Vitest coverage only if explicitly required; prefer targeted suite runs from verification-gates.

## Test Types

**Unit Tests:**
- Scope: domain logic behind public/application seams with ports fakes
- Approach: `tests/unit/**/*.test.ts`; import from `@/modules/.../public` or `application/public`
- Architecture: `*-thinness.test.ts` static gates (see campaign above)

**Integration Tests:**
- Scope: Convex mutations/queries/actions, registry/capability/customer-request flows, some HTTP/route loaders
- Approach: `convex-test(schema, modules)` + `api` / `internal` from `convex/_generated/api`
- Run without file parallelism (`--no-file-parallelism`) for the integration script

**Type Tests:**
- `tests/types/domain-contracts.test.ts` — `expectTypeOf` equality between Zod-inferred and exported unions; runtime `safeParse` negatives; file-level `@ts-expect-error` for invalid statuses

**Import / standards scans:**
- `tests/imports/*.test.ts` — zero violations on clean trees; fixture mode proves scanner sensitivity
- Rules live in `src/lib/ui/contract-scans.ts` (`explicit-any`, `non-null-assertion`, `module-private-import`, copy/SEO/UI rules, …)

**Copy / SEO / UI-contract:**
- `tests/copy/*` — trust language, banned Phase-1 claims, claims register
- `tests/seo/*` — discovery files, public business/thread SEO, `llms.txt` adjacency
- `tests/ui-contract/ui-contract.test.ts` — structural UI contract scans

**E2E Tests:**
- Playwright local app on `127.0.0.1:3020` with `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E=true` when not using `PLAYWRIGHT_BASE_URL`
- Projects: compact (375×812) and wide (1440×1100) Chromium
- Accessibility suite under `tests/e2e/a11y`

**Deploy / release smokes:**
- `tests/deploy-smoke/*.spec.ts` + `tools/release/*` / `tools/dev/*` scripts
- Hosted evidence is a separate proof class from unit/integration (do not upgrade claims across classes)

**Evals:**
- `npm run test:eval` — coverage audit, Promptfoo suite, `tests/eval`

## Common Patterns

**Async Testing:**
```typescript
await expect(backend.mutation(api.capabilitySupply.registerOffering, {
  registration,
  ...operationContext('anonymous'),
})).resolves.toEqual({ kind: 'refused', reason: 'authorization_denied' })
```

**Error Testing:**
```typescript
expect(ClaimStatusSchema.safeParse('active').success).toBe(false)
// @ts-expect-error broad live state is not a valid public status
const invalidPublicStatus: PublicStatus = 'live'
```

**Thinness (static) assertion:**
```typescript
expect(convexHost).not.toMatch(/(?:^|\n)(?:async\s+)?function\s+assembleCustomerEvidenceExport\b/)
expect(convexHost).toContain('evidenceLoadPorts(ctx)')
expect(exportBody.split('\n').length).toBeLessThanOrEqual(120)
expect(source).not.toMatch(/from\s+['"][^'"]*convex\/server['"]/)
```

**Scan clean vs fixture:**
```typescript
const violations = scanTypeScriptStandards(
  isFixtureMode() ? fixtureTargets('tests/fixtures/bad-ts-standards') : cleanRuntimeTargets(),
)
expect(isFixtureMode() ? /* contains rules */ : violations).toEqual(
  isFixtureMode() ? expect.arrayContaining([/* … */]) : [],
)
```

## Prescriptive Guidance for New Tests

| Change | Preferred proof |
|--------|-----------------|
| Pure domain / application logic | `tests/unit/.../<name>.test.ts` through public seam + ports fake |
| Convex deepen / host thinness | Matching `*-thinness.test.ts` + keep/extend behavior unit test |
| Convex schema/function wiring | `tests/integration/...` with `convex-test` + `npm run check:convex-codegen` |
| Import or private-boundary risk | `npm run test:imports` |
| Type/status union change | `tests/types/domain-contracts.test.ts` + `npm run test:ts-standards` |
| Public/assistant copy | `npm run test:copy` |
| Browser UX | `tests/e2e/*.spec.ts` |
| Hosted release claim | `test:release` / deploy-smoke / release tools — not unit alone |

---

*Testing analysis: 2026-07-18 (commit `5ea44454`)*
