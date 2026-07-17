# Testing Patterns

**Analysis Date:** 2026-07-17  
**Inspected revision:** `7deffac41e103ee619ce099db531fc2127ba9985`  
**last_mapped_commit:** `7deffac41e103ee619ce099db531fc2127ba9985`

## Test Framework

**Runner:**
- Vitest `4.1.9` for unit, integration, types, imports, copy, SEO, UI-contract, and eval harness tests
- Config: `vitest.config.ts` — `environment: 'node'`, `globals: false`, `include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx', 'convex/**/*.test.ts']`, `tsconfigPaths: true`
- Playwright `@playwright/test` `1.61.1` for browser E2E and deploy smokes (`playwright.config.ts`, `playwright.deploy-smoke.config.ts`)
- Promptfoo for model eval suites under `eval/answer/` (`npm run test:eval`)

**Assertion Library:**
- Vitest `expect` / `expectTypeOf` (types suite)
- Playwright `expect` for browser assertions
- Prefer `toEqual`, `toMatchObject`, `toBe`, `resolves` / `rejects`, `not.toMatch` for copy/overclaim checks

**Run Commands:**
```bash
npm test                              # vitest run (all Vitest includes)
npm run test:unit                     # tests/unit
npm run test:integration              # tests/integration (+ one convex mandate test); no file parallelism
npm run test:types                    # tests/types
npm run test:imports                  # module/route boundary scanners
npm run test:ts-standards             # explicit-any / ! / v.any() / CSRF guards
npm run test:copy                     # public/assistant copy claims
npm run test:seo                      # discovery/SEO outputs
npm run test:ui-contract              # semantic token / UI contract scan
npm run test:e2e                      # Playwright tests/e2e
npm run test:e2e:a11y                 # Playwright a11y suite
npm run test:all                      # typecheck + codegen check + core Vitest gates + build
npm run test:release                  # full release source + hosted readback path
npm run lint && npm run typecheck     # always pair with logic changes
```

**Verification gate (smallest first):** see `.agents/skills/ae-verification-gates/SKILL.md` — run the narrowest script that proves the change class.

## Test File Organization

**Location:**
- Central `tests/` tree (not co-located next to `src/` sources)
- Rare Convex colocated tests: `convex/**/*.test.ts`
- Fixtures for negative scanners: `tests/fixtures/` (`bad-imports`, `bad-ts-standards`, `bad-copy`, `bad-ui-contract`)
- Shared helpers: `tests/helpers/`

**Naming:**
- Unit/integration/copy/imports: `feature-name.test.ts` or `feature-name.test.tsx`
- E2E / deploy smoke: `feature-name.spec.ts`
- Mirror domain folders under `tests/unit/<domain>/` when practical

**Structure:**
```
tests/
  unit/           # pure module + component unit tests
  integration/    # multi-module / route / convex-test flows
  types/          # expectTypeOf domain contract alignment
  imports/        # architectural import scanners
  copy/           # public language / overclaim
  seo/            # sitemap, robots, llms, meta
  ui-contract/    # visual token contract
  e2e/            # Playwright local app flows (+ e2e/a11y)
  deploy-smoke/   # Playwright against hosted surfaces
  eval/           # Vitest wrappers around eval outputs
  helpers/        # admission secrets, ports, contract servers
  fixtures/       # intentional violations for scanner fixture mode
```

## Test Structure

**Suite Organization:**
```typescript
import { describe, expect, it } from 'vitest'

import { buildRegistrySearchDocumentsForCatalog } from '@/modules/registry/internal/search-documents'

describe('registry search documents', () => {
  it('builds one public search document per published service', () => {
    const docs = buildRegistrySearchDocumentsForCatalog(catalog())
    expect(docs).toHaveLength(2)
  })
})

function catalog(overrides: Partial<...> = {}): ... {
  return { slug: 'parramatta-emergency-plumbing', ...overrides }
}
```

**Component (jsdom) pattern:**
```typescript
/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

describe('AeQueryPanel', () => {
  afterEach(() => {
    cleanup()
  })

  it('can render session-aware follow-up guidance in the compact composer', () => {
    render(<AeQueryPanel onSubmit={() => undefined} ... />)
    expect(screen.getByPlaceholderText('...')).toBeTruthy()
  })
})
```

**Patterns:**
- Import Vitest APIs explicitly (`globals: false`)
- Local factory helpers at bottom of the test file
- Guard undefined fixtures with `throw new Error('expected ...')` rather than `!`
- Behavior-focused `it('...')` names (outcome, not implementation gossip)
- Playwright: `test.describe` + role/label queries; assert forbidden future-surface copy with `not.toMatch`

## Mocking

**Framework:**
- Vitest `vi` (`vi.fn`, `vi.stubEnv`, `vi.unstubAllEnvs`, `vi.mock` when needed)
- Prefer real domain modules with in-memory source state over heavy mocks
- Convex: `convex-test` with `schema` + `import.meta.glob('../../convex/**/*.{ts,js}')` module map

**Patterns:**
```typescript
import { afterEach, describe, expect, it, vi } from 'vitest'
import { convexTest } from 'convex-test'
import schema from '../../convex/schema'

const modules = Object.fromEntries(
  Object.entries(import.meta.glob('../../convex/**/*.{ts,js}')).map(([path, load]) => [
    path.replace('../../convex/', './'),
    load,
  ]),
)

it('binds labelled sandbox businesses...', async () => {
  const backend = convexTest(schema, modules)
  const first = await backend.mutation(internal.sandboxAcceptanceSupply.seedLabelledSandboxSupply, {
    ownerClerkUserId: 'user_dev_business_owner',
  })
  expect(first.ownerClerkUserId).toBe('user_dev_business_owner')
})

it('fails closed when issuer missing', async () => {
  vi.stubEnv('CLERK_JWT_ISSUER_DOMAIN', '')
  try {
    await expect(import('../../../convex/auth.config')).rejects.toThrow(/CLERK_JWT_ISSUER_DOMAIN/)
  } finally {
    vi.unstubAllEnvs()
  }
})
```

**What to Mock / Stub:**
- Env secrets for admission (`tests/helpers/source-write-admission.ts` — `installTestSourceWriteSecret`)
- Auth identity / FakeDb rows for Convex authz unit tests
- External network (OpenRouter contract server helper) when testing HTTP adapters
- Catalog search backends via test setters (e.g. `setCatalogSearchBackendForTests`)

**What NOT to Mock:**
- Pure domain compilers, projections, and public catalog search logic
- Zod validators and branded ID helpers
- Prefer exercising `public.ts` / route handlers with constructed source state

**Note on double casts:** production `as unknown as` is banned by `test:ts-standards`. Some Convex handler tests still cast `_handler` for direct invocation — do not copy that pattern into production source; prefer public APIs or convex-test mutations when adding coverage.

## Fixtures and Factories

**Test Data:**
```typescript
// File-local factory (preferred for unit tests)
function catalog(overrides: Partial<PublicBusinessCatalogApiDto> = {}): PublicBusinessCatalogApiDto {
  return {
    slug: 'parramatta-emergency-plumbing',
    name: 'Parramatta Emergency Plumbing',
    ...overrides,
  }
}

// Shared product fixtures
import { LOCAL_E2E_BUSINESS_FIXTURES } from '@/lib/dev/local-e2e-business-fixtures'
import { DEV_SEED_BUSINESS_FIXTURES } from '@/modules/dev/public'
```

**Location:**
- Factories: bottom of the consuming test file
- Shared helpers: `tests/helpers/`
- Scanner negatives: `tests/fixtures/` with `AE_SCAN_MODE=fixtures` vs default clean mode (`tests/imports/scan-targets.ts`)
- Sandbox supply profiles: `src/modules/sandbox-supply/public` (and workflow cohorts)

## Coverage

**Requirements:**
- No Vitest line-coverage gate / no `test:coverage` script for unit suites
- Proof is behavior gates (`test:unit`, `test:integration`, scanners, Playwright, hosted smokes), not percentage thresholds
- Eval “coverage” means promptfoo case-set audit (`npm run test:eval:coverage` → `eval/answer/scripts/audit-coverage.ts`), not Istanbul/c8

**Configuration:**
- Not applicable for Vitest coverage reporters
- Release proof: `npm run test:release:source` then hosted readback/smokes

**View Coverage:**
```bash
# Not applicable for unit/integration Istanbul reports.
# For answer eval case coverage:
npm run test:eval:coverage
```

## Test Types

**Unit Tests (`tests/unit`):**
- Single module/function/component in isolation
- May import `internal/` within the same domain under test
- jsdom + Testing Library for React pieces (`@vitest-environment jsdom`)
- Fast; no live network

**Integration Tests (`tests/integration`):**
- Multi-module source state, HTTP route handlers, registry API parity, answer-turn flows
- Convex runtime via `convex-test` where durability matters
- Run with `--no-file-parallelism` via `npm run test:integration`

**Type / Architecture Scanners:**
- `tests/types` — Zod schemas equal exported unions (`expectTypeOf`)
- `tests/imports` — private imports, route boundaries, kernel retirement, capability seams
- `tests/ts-standards` path — `tests/imports/ts-standards.test.ts`
- `tests/copy`, `tests/seo`, `tests/ui-contract` — product-contract scanners over `src/`

**E2E / Smokes:**
- Local Playwright: `npm run test:e2e` (starts `npm run dev` on `127.0.0.1:3020` unless `PLAYWRIGHT_BASE_URL` set)
- Projects: `compact-chromium` (375×812) and `wide-chromium` (1440×1100)
- Deploy/provider smokes: `playwright.deploy-smoke.config.ts` + `tests/deploy-smoke/`
- Hosted customer-request smokes: `tsx tools/release/...` and `tools/dev/...` scripts in `package.json`

**Model Evals:**
- `eval/answer/promptfooconfig.yaml` + `npm run test:eval`
- Vitest assertions under `tests/eval/` consume reports; do not treat eval pass as deploy proof

## Common Patterns

**Async Testing:**
```typescript
it('reads durable catalog through registry and API', async () => {
  const state = createDurablePublishedRegistryState({ ... })
  const detail = getPublicBusinessCatalogBySlug(state, { slug: 'fremantle-heat-pump-repairs' })
  expect(detail).toMatchObject({ kind: 'found', business: { slug: 'fremantle-heat-pump-repairs' } })
})
```

**Error Testing:**
```typescript
await expect(resolveAdminAuthority(authCtx(db, null), 'set_operator_control')).resolves.toEqual({
  kind: 'denied',
  reason: 'missing_membership',
})

await expect(asyncCall()).rejects.toThrow(/required/)
```

**Copy / overclaim:**
```typescript
expect(outputs).not.toMatch(/book now|payment required|marketplace/i)
expect(outputs).toContain('/api/v1/requests')
```

**Source-write admission in tests:**
```typescript
import { installTestSourceWriteSecret } from '../helpers/source-write-admission'
// call in beforeEach / suite setup when exercising write paths
```

**Snapshot Testing:**
- Not a primary pattern; prefer explicit `toMatchObject` / role assertions
- Playwright traces/screenshots on failure only (`trace: 'on-first-retry'`)

---

*Testing analysis: 2026-07-17*  
*Update when test patterns change*
