---
last_mapped_commit: 796c584aaac12a48443b2f42c9d0d69c949615e2
---

# Testing Patterns

**Analysis Date:** 2026-08-20

## Test Framework

**Runner:**
- Vitest `4.1.9` for unit, integration, types, imports, seo, ui-contract, eval, and colocated Convex tests.
- Config: `vitest.config.ts`.
- Playwright `@playwright/test` `1.61.1` for e2e, a11y, paid-operation surface, and deploy-smoke.
- Configs: `playwright.config.ts` (local e2e), `playwright.paid-operation.config.ts`, `playwright.deploy-smoke.config.ts`.
- Promptfoo `^0.121.17` for answer-gate/turn/thread assertions: `eval/answer/promptfooconfig.yaml`.
- `convex-test` `^0.0.54` for in-process Convex schema + function tests.

**Assertion Library:**
- Vitest `expect` (globals off — always `import { describe, expect, it } from 'vitest'`).
- `expectTypeOf` from Vitest for compile-time contract tests (`tests/types/domain-contracts.test.ts`).
- Playwright `expect` for browser/API smoke.
- Promptfoo JavaScript assertions under `eval/answer/assertions/*.mjs`.

**Environment:**
- Default Vitest environment is `node` (`vitest.config.ts`).
- Component tests opt into jsdom with a file pragma:

```typescript
/**
 * @vitest-environment jsdom
 */
```

- Setup files (always loaded): `tests/setup/web-storage.ts`, `tests/setup/jsdom-platform.ts`, `tests/setup/http-rate-limit.ts`.
- Extra jsdom helpers exist but are not global setup: `tests/setup/jsdom-dialog.ts`, `tests/setup/resize-observer.ts`. Prefer the global `jsdom-platform` stubs; do not re-stub `ResizeObserver` / `matchMedia` per file.
- `tsconfigPaths: true` plus explicit `@` → `src` alias so `tools/ae/lib/*` resolves in unit tests.
- `watch: false` by default.
- There is no `tests/setup/no-search-gap-writes.ts`. Do not restore a stub for a deleted demand module.

**Run Commands:**

Prefer npm scripts (they wrap `tools/dev/run-with-cleanup.mjs`). When invoking Vitest directly, use `./node_modules/.bin/vitest` — not a global `vitest`.

```bash
npm test                         # Vitest: tests/**/*.test.ts(x) + convex/**/*.test.ts
npm run test:unit                # tests/unit
npm run test:integration         # tests/integration + convex (no file parallelism)
npm run test:types               # tests/types
npm run test:imports             # listed import-boundary files (AE_SCAN_MODE=clean)
npm run test:ts-standards        # tests/imports/ts-standards.test.ts
npm run test:seo                 # tests/seo
npm run test:ui-contract         # tests/ui-contract
npm run test:eval                # coverage + report + promptfoo + tests/eval
npm run test:eval:coverage       # catalog/seed/promptfoo sync audit
npm run test:eval:report         # writes output/eval/answer-suite-report.json
npm run test:eval:validate       # coverage + promptfoo validate
npm run test:e2e                 # Playwright tests/e2e (ports 3020)
npm run test:e2e:a11y            # tests/e2e/a11y
npm run test:e2e:paid-operation  # isolated Vite surface on 3021
npm run test:all                 # typecheck + codegen + unit + integration + types + imports + ts-standards + seo + ui-contract + build
npm run test:release:source      # production source gate (lint, typecheck, conformance, eval:report, build, …)
npm run lint                     # oxlint --deny-warnings
npm run typecheck                # tsc --noEmit

# Direct Vitest (local binary only)
./node_modules/.bin/vitest run tests/unit/answer/answer-gate.test.ts
./node_modules/.bin/vitest run tests/integration convex --no-file-parallelism
```

`npm run test:all` does **not** run Playwright, Promptfoo, or deploy-smoke. `npm run test:release:source` adds lint, kernel/product-frontier checks, conformance, and `test:eval:report`, still not full `test:eval` / e2e.

Almost every test script is wrapped in `tools/dev/run-with-cleanup.mjs` so stray processes are reaped. `test:imports` uses `tools/dev/run-listed-vitest.mjs`, which **fails if a listed path is missing**.

## Test File Organization

**Location:**
- Separate `tests/` tree, not co-located next to `src/` (exception: `convex/*.test.ts` sit beside Convex modules).
- Domain folder under `tests/unit/<domain>/` matches `src/modules/<domain>/` or a surface (`chat`, `server`, `routes`, `convex`).

**Naming:**
- Vitest: `*.test.ts` / `*.test.tsx`.
- Playwright: `*.spec.ts`.
- Helpers: `tests/helpers/*.ts` (not `*.test.ts`, so Vitest does not run them).
- Fixtures: `tests/fixtures/*.ts` plus `tests/fixtures/bad-imports/` and `tests/fixtures/bad-ts-standards/` for scanner fixture mode.

**Structure:**

```
tests/
├── setup/                 # Vitest setupFiles (storage, jsdom, rate-limit)
├── helpers/               # Shared adapters, Convex fixtures, OpenRouter contract server, durable-write fixture
├── fixtures/              # In-memory source state, bad-import/ts-standards fixtures
├── unit/                  # Fast, no deployment. Domain folders under tests/unit/<domain>/
├── integration/           # Multi-module flows + convex-test
├── types/                 # expectTypeOf + @ts-expect-error contract pins
├── imports/               # Architectural scanners + retirement manifests
├── seo/                   # llms.txt / sitemap / robots / canonical / public copy
├── ui-contract/           # Semantic token / layout utility scan
├── eval/                  # Vitest wrappers around eval/answer + product-foundry
├── e2e/                   # Playwright local product journeys (+ a11y/)
└── deploy-smoke/          # Playwright against hosted URLs (separate config)
convex/*.test.ts           # Colocated convex-test (agent-access, external runs)
eval/answer/               # Case catalog, coverage, scoring, promptfoo, scripts
eval/quality/              # Golden-corpus structural/live gate
eval/braintrust/           # Optional Braintrust runner
eval/product-foundry/      # Partial-entry surfaces; retired CR/inquiry doors are absent
```

**Unit domain folders (place new tests here):** `action-invocation`, `actions`, `agent-access`, `answer`, `answer-stream`, `answer-thread`, `business`, `capability-contract`, `capability-contract-registry`, `capability-execution`, `capability-supply`, `catalog`, `chat`, `common`, `compatibility`, `convex`, `discovery`, `external-run`, `governed-action`, `harness`, `http`, `market-terminal`, `model-gateway`, `money`, `notification-outbox`, `observability`, `product-frontier`, `registry`, `routes`, `sandbox-supply`, `schema`, `security`, `server`, `storefront`, `ui`, plus smaller folders (`dev`, `deployment`, `release`, `tools`, `status`, …). Deleted families (`demand`, `inquiries`, `study`, `work-tree`) must not get new folders; pin absence under `product-frontier` / `actions` / `imports` instead. `tests/unit/routes/home-work-tree-loop.test.ts` is the **root route redirect**, not a WorkTree product test. `tests/unit/study-actions.test.ts` asserts `study.*` action ids are undefined.

## Test Structure

**Suite Organization:**

```typescript
import { describe, expect, it } from 'vitest'

import { runAnswerGate } from '@/modules/answer/public'
import type { AnswerSnapshot } from '@/modules/answer/public'

function snapshot(overrides: Partial<AnswerSnapshot> = {}): AnswerSnapshot {
  return { query: 'plumber Preston', /* …defaults… */, ...overrides }
}

describe('runAnswerGate', () => {
  it('passes a grounded snapshot with boundary copy', () => {
    const result = runAnswerGate({ snapshot: snapshot(), allowedSlugs: new Set(['preston-plumbing']) })
    expect(result.ok).toBe(true)
  })

  it('fails when a provider slug is not in the allowed set', () => {
    const result = runAnswerGate({
      snapshot: snapshot({ providers: [{ ...snapshot().providers[0]!, slug: 'hallucinated-slug' }] }),
      allowedSlugs: new Set(['preston-plumbing']),
    })
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected gate failure')
    expect(result.code).toBe('grounding_failed')
  })
})
```

Canonical file: `tests/unit/answer/answer-gate.test.ts`.

**Patterns:**
- One `describe` per unit under test (function, component, or flow). Nested `describe` only when grouping many cases of one behavior.
- Factory helpers at file scope (`snapshot()`, `claimFacts()`, `emptyCatalogPublishSourceState()`) rather than beforeEach mutation when state is a value object.
- After a discriminated failure, narrow with `if (result.ok) throw new Error(...)` or `if (claim.kind !== 'ok') throw new Error(...)` — do not use non-null assertions to please the checker in new tests (the answer-gate file still uses `providers[0]!` in one override; prefer optional chaining + throw).
- Assertions prefer `toMatchObject` on discriminated results (`{ kind: 'error', code: 'claim_unauthenticated' }`) and exact `toBe` on `code`.
- Component tests: `@testing-library/react` `render` / `screen.getByRole` / `fireEvent` / `waitFor`, plus `cleanup()` in `afterEach` (`tests/unit/chat/ae-query-panel.test.tsx`).
- Playwright tests: `test.describe` + `getByRole`, then `assertPublicLanguage` helpers that ban internal vocabulary (`KNOWN`/`UNKNOWN`, `ownerId`, `MCP`, `checkout`). See `tests/e2e/landing-answer.spec.ts`.

**Setup pattern:**
- Global: `tests/setup/*` (do not duplicate ResizeObserver / matchMedia stubs in each file).
- Per-file: `setXForTests(fake)` at the start of a case, restore in `finally` or by calling the returned disposer:

```typescript
const restoreRegistry = setPublicRegistrySourcePortForTests(registry)
try {
  // …
} finally {
  restoreRegistry()
}
```

**Teardown pattern:**
- jsdom: `afterEach(() => { cleanup() })`.
- HTTP contract server: `await server.close()` in `afterAll` / `finally` (`tests/helpers/openrouter-contract-server.ts`).
- Convex tests create a fresh `convexTest(schema, modules)` per `it` — no shared backend across cases.

**Assertion pattern:**
- Named refusal / problem codes are the contract. Assert `code`, `kind`, `retryable`, not human `detail` strings (those may change).
- Public copy tests assert both required boundary sentences **and** banned patterns (`mustNotMatch` in deploy-smoke, `publicInternalCopy` in e2e).
- Scanner tests expect `violations` to equal `[]` in clean mode, and to contain named `rule` ids in fixture mode (`AE_SCAN_MODE=fixtures`).

## Mocking

**Framework:** Vitest `vi` (`vi.fn`, `vi.spyOn`, `vi.mock`, `vi.stubGlobal`). Playwright does not mock product modules; it drives the running app. Promptfoo uses file providers (`eval/answer/providers/gate.mjs`), not network LLMs, for gate/turn/thread rows.

**Patterns:**

```typescript
import { vi } from 'vitest'

vi.mock('../../../convex/sourceWriteAdmission', () => ({
  requireSourceWrite: vi.fn(async () => ({ kind: 'accepted' as const })),
}))
```

Used in Convex unit tests that cannot boot the full admission stack (`tests/unit/convex/money-topup-recovery.test.ts`, `tests/unit/convex/payout-ledger-connect.test.ts`).

Port injection is preferred over `vi.mock` when the module already exposes a test seam:

```typescript
const restore = setPublicRegistrySourcePortForTests(createLocalE2eRegistrySourcePort(/* … */))
```

OpenRouter is replaced by an in-process HTTP contract server, not by mocking `fetch` globally:

```typescript
const server = await startOpenRouterContractServer(openRouterToolThenProseResponses(/* … */))
const restoreEnv = server.installEnv()
```

See `tests/helpers/openrouter-contract-server.ts` and `tests/eval/answer-pipeline.test.ts`.

jsdom platform APIs are stubbed once in `tests/setup/jsdom-platform.ts` (`ResizeObserver`, `matchMedia`, `scrollIntoView`).

HTTP rate limits are admitted in every test via `setHttpRateLimitAdmissionForTests(async () => ({ ok: true }))` in `tests/setup/http-rate-limit.ts`. Override locally when testing 429 behavior.

**What to Mock:**
- Network LLM/OpenRouter (contract server or captured provider).
- Convex `ctx` when the test is a pure command/ledger test — use `MemoryDb` (`tests/unit/convex/payout-ledger-test-harness.ts`) or `convexTest`.
- Source-write admission when the case is not about CSRF (`requireSourceWrite` mock).
- Stripe / live money providers — assert `live_money_gate_open` / `stripe_setup_required` rather than calling Stripe.

**What NOT to Mock:**
- Domain commands under test (`runAnswerGate`, `claimBusiness`, `publishBusinessCatalog`, `evaluateLiveMoneyGate`). Integration tests in `tests/integration/claim-publish.test.ts` run the real command graph against in-memory `sourceState`.
- RFC 9457 helpers (`buildProblem`, `problem`) — unit-test the real projection.
- Promptfoo/Vitest case catalogs — they must stay synchronized via `auditPromptfooAnswerConfig`.
- Playwright product journeys — hit the real Vite server on `127.0.0.1:3020` (Clerk bypass via `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E`).
- Import-boundary scanners — they read real `src/` and `convex/` files.
- Admin membership lookup and Connect reserve/finalize — those are fail-closed in source. Do not mock `readActiveAdminMembership` to return a membership, and do not stub Connect handlers to `accepted`, in order to green a success-path test.

## Fixtures and Factories

**Test Data:**

```typescript
import { emptyCatalogPublishSourceState } from '../fixtures/source-state'
import { LOCAL_E2E_BUSINESS_FIXTURES } from '../helpers/local-e2e-business-fixtures'
import { createDurablePublishedDiscoveryState } from '../fixtures/discovery-published-state'
import { convexTestWithWorkers, publishedBusinessOwner } from '../helpers/convex-fixtures'
```

**Location:**
- `tests/fixtures/source-state.ts` — empty catalog/claim source graphs for command tests.
- `tests/fixtures/discovery-published-state.ts` — durable published rows for SEO/discovery.
- `tests/fixtures/capability-contract-v2.ts` — contract documents.
- `tests/helpers/local-e2e-business-fixtures.ts` — named demo businesses (`demo-inquiry-provider`, …) shared by e2e and eval. The `demo-inquiry-provider` slug remains a catalog fixture name; `/{slug}/inquiry` is 404.
- `tests/helpers/convex-fixtures.ts` — `convexTestWithWorkers()`, `ownerAdmin()`, `publishedBusinessOwner()`, workpool/rate-limiter registration. `ownerAdmin` sets Convex identity; it does **not** insert an `adminMemberships` row that `readActiveAdminMembership` would honor.
- `tests/helpers/openrouter-contract-server.ts` — deterministic OpenRouter HTTP.
- `tests/helpers/answer-turn-stream.ts`, `tests/helpers/answer-thread-test-port.ts` — stream/thread ports.
- `tests/helpers/registry-local-e2e.ts`, `tests/helpers/keyless-seed-source.ts`.
- `tests/helpers/durable-write-fixture-action.ts` — `test.durable_write` for invocation/CAS tests. Do not point those tests at `inquiry.submit`.
- `tests/helpers/deployed-smoke.ts`, `tests/deploy-smoke/vercel-bypass.ts` — hosted smoke.
- `eval/answer/lib/cases.ts` — barrel for turn/thread/harness catalogs (source of truth for Promptfoo + Vitest). Case arrays live in `eval/answer/lib/eval-turn-cases.ts`, `eval/answer/lib/eval-thread-cases.ts`, `eval/answer/lib/eval-harness-cases.ts`. Coverage tags live in `eval/answer/lib/eval-case-types.ts`.
- `eval/answer/lib/registry-seed.ts` — broad 100-business seed.
- `tools/dev/fixtures/` — development evidence packets; production `src/` must not import these (`tests/imports/development-evidence-boundary.test.ts`).

**Convex fixture pattern:**

```typescript
import { convexTest } from 'convex-test'
import schema from '../../../convex/schema'
import { convexTestWithWorkers } from '../../helpers/convex-fixtures'

const backend = convexTestWithWorkers()
await expect(
  backend.query(/* registered query */, { /* args */ }),
).resolves.toMatchObject({ kind: 'ok' })
```

Colocated examples: `convex/agentAccessPolicy.test.ts`, `convex/externalRuns.test.ts`, `convex/agentAccessOAuth.test.ts`. Shared helper: `convexTestWithWorkers` in `tests/helpers/convex-fixtures.ts` (registers `@convex-dev/workpool/test` and `@convex-dev/rate-limiter/test`). Schema/index pins live in `tests/unit/schema/convex-schema.test.ts`. Do not add `convex/workTrees.test.ts` / `convex/studies.test.ts` — those modules are deleted.

Money MemoryDb tests pull **registered wrappers** from `convex/moneyLedger.ts` via `_handler` in `tests/unit/convex/payout-ledger-test-harness.ts`. Keep calling `api.moneyLedger.*` / those wrapper `_handler`s. Do not retarget tests at a sibling file's unregistered handler to dodge wrappers-first.

**Eval case shape:** each case has stable `id`, `covers` tags, `registrySeed` (`default` | `broad`), and `expected` (slugs, tool queries, copy checks, timing budget). Promptfoo rows reference `caseId` rather than duplicating expectations. Turn/thread runners live in `eval/answer/lib/eval-turn.ts` and `eval/answer/lib/eval-thread.ts`.

## Coverage

**Requirements:**
- No Vitest `coverage` block in `vitest.config.ts`. Line coverage is not the gate.
- Answer eval coverage **is** a gate: `auditAnswerEvalCoverage()` in `eval/answer/lib/coverage.ts` requires unique ids, required tags from `ANSWER_EVAL_COVERAGE_REQUIREMENTS` in `eval/answer/lib/eval-case-types.ts` (`model-chosen-tool-loop`, `bounded-tool-loop`, `visible-typo-recovery`, `empty-state`, `near-me-location-guard`, `unsupported-action-boundary`, `persisted-tool-evidence`, `public-copy-boundary`, `capability-tool-execution`, `keyed-execute-refused`, …), Promptfoo sync, and `broadSeedBusinessCount >= 100`.
- Scoring bar is 9/10 (`ANSWER_EVAL_SCORE_THRESHOLD = 9` in `eval/answer/lib/scoring.ts`) across dimensions `right_answer`, `grounded_evidence`, `safe_boundary`, `can_proceed`, `generated_answer_ui`, `abandonment_risk`, `journey_continuity`.
- Quality golden corpus: `eval/quality/gate.ts` requires `>= 100` L1 runnable cases (`npm run test:quality:gate`). `--live` adds the engine harness.
- Product frontier / kernel retirement manifests are verified as source tests (`check:product-frontier`, `check:kernel-retirement`, `tests/imports/product-frontier-manifest.test.ts`, `tests/imports/kernel-retirement-manifest.test.ts`).
- UI contract: zero `scanUiContract` violations on `src/components/ae` and `src/routes`.
- TS standards: zero `scanTypeScriptStandards` violations on `src` + `convex`.

**View Coverage:**

```bash
npm run test:eval:coverage
npm run test:eval:report          # output/eval/answer-suite-report.json
npm run test:quality:gate
```

There is no `vitest --coverage` script. Do not add Istanbul config unless a phase explicitly asks for it.

## Test Types

**Unit Tests:**
- Scope: one module or helper, in-memory, no Convex deployment, no Playwright.
- Command/ledger tests pass an explicit `state` + `now` + branded `operationKey` (`tests/integration/claim-publish.test.ts` is the multi-command version of this style; smaller versions live under `tests/unit/business`, `tests/unit/catalog`, `tests/unit/money`).
- Convex **unit** tests under `tests/unit/convex/` often use a handwritten `MemoryDb` + `vi.fn` ctx (`tests/unit/convex/payout-ledger-test-harness.ts`) rather than `convex-test`, to isolate ledger/CAS/idempotency.
- Component unit tests: jsdom + Testing Library, role queries, copy/boundary assertions (`tests/unit/chat/`, `tests/unit/ui/`).
- Run: `npm run test:unit`.

**Integration Tests:**
- Scope: several modules, or Convex functions through `convex-test`, or HTTP handlers with fixture source state.
- `tests/integration/claim-publish.test.ts` — claim → publish → suppress against in-memory source state (no database).
- `tests/integration/catalog-source-write.test.ts`, `tests/integration/answer-thread-source-write-*.test.ts` — `convexTest` + source-write admission.
- `tests/integration/capability-operation-workpool.test.ts` — workpool-backed operation worker.
- `tests/integration/answer-tool-calls.test.ts`, `tests/integration/answer-turn-*.test.ts` — answer loop against contract LLM + seeded registry.
- `tests/integration/supplier-money-readback-*.test.ts` — owner earnings/payout readback (missing Connect is `accountState: 'missing'`, not a successful Connect bind).
- Run with `--no-file-parallelism` (`npm run test:integration`) because Convex test backends and shared ports collide under file parallelism.
- Colocated `convex/*.test.ts` are included in that integration script (the glob `convex` in the Vitest CLI).

**Convex tests vs app tests:**
| Kind | Where | Harness | Use when |
|------|--------|---------|----------|
| App unit | `tests/unit/<domain>/` | Vitest + in-memory state | Pure commands, UI, scanners |
| Convex unit (memory) | `tests/unit/convex/` | Hand-rolled `MemoryDb` / `vi.fn` ctx | Ledger math, worker sequencing without schema boot |
| Convex-test | `tests/integration/*`, `convex/*.test.ts`, some `tests/unit/schema` | `convexTest(schema, import.meta.glob(...))` | Real validators, indexes, identity (`withIdentity`) |
| App integration | `tests/integration/` | Ports + fixture state or convex-test | Cross-module invariants |

Do not hit a developer Convex deployment from unit/integration tests. Prefer `npm run check:convex-codegen` (`convex codegen --dry-run`) over a live upload after deleting Convex modules — a non-dry-run codegen restores the last pushed bundle.

**Known-red pins (do not “fix” by opening the gate):**

Admin membership is unlisted. `readActiveAdminMembership` in `convex/authz.ts` always returns `undefined`, so `resolveAdminAuthority` is `denied` / `missing_membership` even when a test seeds `adminMemberships`. The fail-closed pin is `tests/unit/convex/authz.test.ts` (`fails closed for admin membership once listed memberships were unlisted`). Tests that still **expect success** stay red:

- `tests/unit/convex/harness-sessions-runtime.test.ts` — `keeps private payload reads behind admin authority` seeds `adminMemberships` and expects `{ kind: 'allowed' }`.
- `tests/integration/admin-runtime.test.ts` — grant/bootstrap/read paths that expect `{ kind: 'allowed' }` after a seeded membership.
- `tests/unit/convex/observability-runtime.test.ts` — operator-control / activation-summary cases that seed membership and expect `{ kind: 'allowed' }`.

Do not restore membership lookup, insert a live `adminMemberships` read, or mock `readActiveAdminMembership` to return a membership so those cases pass.

Connect reserve/finalize is unlisted. `reserveConnectAccountHandler` and `finalizeConnectAccountHandler` in `convex/moneyConnect.ts` always return `{ kind: 'refused', code: 'connect_account_unlisted', retryable: false }`. Tests that **expect `accepted`** stay red:

- `tests/unit/convex/payout-ledger-connect.test.ts` — success/finalize/replay cases that `toMatchObject({ kind: 'accepted' })` after `reserveConnect` / `finalizeConnect`.

Do not implement Connect onboarding, stub those handlers to `accepted`, or open `connect_account_unlisted` so those cases pass. Assert the refusal code when adding new Connect tests. Bind/event paths that still run behind the live-money gate are a separate seam (`bindConnectAccountHandler` in `convex/moneyConnect.ts`).

**E2E Tests:**
- Playwright, `tests/e2e/*.spec.ts`.
- Default config starts `npm run dev -- --port 3020 --strictPort --host 127.0.0.1` unless `PLAYWRIGHT_BASE_URL` is set.
- Two projects: `compact-chromium` (375×812) and `wide-chromium` (1440×1100). CI retries 2; local retries 0.
- `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E=true` is injected by the webServer. `tests/e2e/local-auth-boundary.spec.ts` exists to pin signed-out behavior; do not treat bypass as production auth evidence.
- Journeys: landing → thread (`landing-answer.spec.ts`), thread-first, public owner UI (including 404s for retired `/inquiry` and `/owner/inquiries` in `tests/e2e/public-owner-ui.spec.ts`), protected owner action, shortlist export, developer discovery, a11y. There is no chat-discovery-inquiry loop and no governed-send/review e2e.
- Paid-operation development surface uses a **separate** Vite config and port 3021 (`playwright.paid-operation.config.ts`). That surface must stay out of `src/routeTree.gen.ts` (`tests/imports/paid-operation-development-surface-exclusion.test.ts`).

**Deploy-smoke Tests:**
- Playwright config `playwright.deploy-smoke.config.ts`, `testDir: ./tests/deploy-smoke`, not fully parallel, JSON reporter to `output/release/playwright-deploy-smoke.json`.
- Hits hosted URLs (env-provided). `phase1-deploy-smoke.spec.ts` checks public routes, status codes, `Cache-Control`, security headers, and bans private vocabulary (`ownerId`, `callable=true`, `/admin/`).
- `phase2-support-record-smoke.spec.ts` asserts `/{slug}/inquiry` is **404** (inquiry cut). It is not a live human-inquiry submit journey.
- Provider smokes: Resend / Novu dispatch (`test:provider-smoke:resend`, `test:provider-smoke:novu`). Hosted Customer Request smokes are retired (`test:release:hosted:retired`); live paid proof is opt-in `test:release:hosted:live-gateway`.
- These are **hosted evidence**, not a substitute for `test:eval:report`.

**Eval Tests:**
- Catalog barrel: `eval/answer/lib/cases.ts` (re-exports turn/thread/harness cases and coverage tags).
- Coverage auditor: `eval/answer/lib/coverage.ts`.
- Endpoint evaluators: `eval/answer/lib/evaluators.ts`.
- Scoring: `eval/answer/lib/scoring.ts` (9/10 user-outcome bar).
- Suite runner: `eval/answer/lib/suite.ts`, script `eval/answer/scripts/run-suite.ts`.
- Promptfoo: `eval/answer/promptfooconfig.yaml` + `eval/answer/providers/gate.mjs` + `eval/answer/assertions/expect-gate.mjs`, `expect-answer-turn.mjs`, `expect-answer-thread.mjs`, `expect-eval-ok.mjs`, `expect-tool-input.mjs`. There is no `expect-chip.mjs`. Runs with `PROMPTFOO_CONFIG_DIR=.promptfoo-home` and `PROMPTFOO_DISABLE_WAL_MODE=true`.
- Vitest wrapper: `tests/eval/answer-pipeline.test.ts` (unique ids, coverage audit, promptfoo sync, stream frames, harness cases). Also `tests/eval/product-foundry*.test.ts`, ADR-009 composition tests, `graph-freshness.test.ts`.
- Optional: `npm run test:eval:braintrust:local` / `:remote` (`eval/braintrust/answer.eval.ts`).
- Quality gate (separate corpus): `eval/quality/gate.ts`, cases in `eval/quality/cases/`.

**Import-boundary Tests (`tests/imports/`):**
Run listed files with `npm run test:imports` (`AE_SCAN_MODE=clean`). Fixture mode (`test:imports:fixtures`) points scanners at `tests/fixtures/bad-imports/` to prove the scanner still fires.

| File | What it pins |
|------|----------------|
| `private-imports.test.ts` | No `@/modules/*/internal/*` from routes/siblings |
| `route-boundary.test.ts` | Routes do not import Convex schema/transport or future provider SDKs |
| `backup-imports.test.ts` | No backup-repo / `.planning` / quarantined handshake SDK imports |
| `ts-standards.test.ts` | `any`, `!`, `v.any()`, broad status strings, CSRF literals |
| `capability-supply-boundaries.test.ts` | Answer cannot import capability-supply; no V1 authorities; sandbox uses production commands |
| `capability-contract-boundaries.test.ts` | Contract module import allowlist (zod, json-schema, common) |
| `capability-contract-registry-boundaries.test.ts` | Registry depends only on contract + common + Convex primitives |
| `kernel-retirement-manifest.test.ts` | Retired writers/routes/tables stay gone |
| `legacy-engine-retirement.test.ts` | Deleted engine hosts (`eval/engine`, `AePlanWork`, …) stay gone |
| `routing-authority-retirement.test.ts` | Handshake/clearance authorities stay gone |
| `action-invocation-host-boundaries.test.ts` | Hosts cannot import low-level lease/execute internals |
| `paid-operation-development-surface-exclusion.test.ts` | Dev paid-operation routes absent from production inventory |
| `product-frontier-manifest.test.ts` | Required actions, MCP tools, eval tags stay aligned |
| `development-evidence-boundary.test.ts` | Deployable source cannot import `tools/dev` or `tests/helpers` |
| `faux-runtime-surfaces.test.ts` | Production discovery/answer/registry cannot import local-e2e fixtures (Vitest include; **not** in the listed `test:imports` command) |

Also present (Vitest include, not in the listed `test:imports` command): `deployment-manifest-boundaries.test.ts`.

**SEO Tests:**
- `tests/seo/discovery-files.test.ts` — `llms.txt` / sitemap / robots from durable rows, no private fields, no positive capability claims.
- `tests/seo/public-business-seo.test.ts`, `public-thread-seo.test.ts`, `canonical-base-url.test.ts`, `agent-skill.test.ts`, `developer-discovery.test.ts`.
- Run: `npm run test:seo`.

**Type Tests:**
- `tests/types/domain-contracts.test.ts` — `expectTypeOf<z.infer<typeof Schema>>().toEqualTypeOf<DomainUnion>()` plus `@ts-expect-error` pins that `'live'` is not a `PublicStatus`.
- Run: `npm run test:types`.

**Conformance slice:**
- `npm run test:conformance` is a named Vitest file list (durable invocation, x402 reconciliation, operation worker, answer harness finalization, deployment manifest, …). It is the fast production-contract subset inside `test:release:source`.

## Common Patterns

**Async Testing:**

```typescript
it('refuses anonymous claim', async () => {
  expect(anonymousClaim).toMatchObject({ kind: 'error', code: 'claim_unauthenticated' })
})
```

Playwright retries flaky fill/click with `expect(async () => { … }).toPass({ timeout: 30_000 })` (`tests/e2e/landing-answer.spec.ts`).

**Error Testing:**

```typescript
expect(anonymousClaim).toMatchObject({ kind: 'error', code: 'claim_unauthenticated' })
expect(evaluateLiveMoneyGate()).toMatchObject({
  kind: 'refused',
  code: 'live_money_gate_open',
  retryable: false,
})
```

HTTP: call the handler, `expect(response.status).toBe(404)`, `expect(response.headers.get('content-type')).toContain('application/problem+json')`, parse JSON and assert `kind` + `code`. Do not snapshot the full `detail` string unless the test is specifically about copy.

**Fail-closed money tests:**
- Assert the gate refuses with `live_money_gate_open` against `LIVE_MONEY_GATE_POLICY` (`src/modules/money/internal/live-money-gate.ts`).
- Ledger tests cover idempotency conflict, CAS conflict, outcome-unknown, and reverse — not a successful live Stripe charge (`tests/unit/convex/money-ledger-*.test.ts`, `tests/unit/money/`).
- New Connect tests assert `{ kind: 'refused', code: 'connect_account_unlisted' }` from `reserveConnectAccount` / `finalizeConnectAccount` on `convex/moneyLedger.ts`.

**Named-refusal tests:**
- Publication validate: each `CapabilityPublicationImportRefusal` has a `fix` string; tests should hit `kind: 'refused'` + `reason`, not a generic 400.
- Paid invoke without connect: `{ kind: 'UNAUTHENTICATED', code: 'agent_access_key_required' }` (JA labelled-local proof class).
- Answer gate: `{ ok: false, code: 'grounding_failed' | 'epistemic_vocabulary' | … }`.
- Deleted family actions: `findAction('inquiry.submit' | 'workTree.create' | 'study.start' | 'customerRequest.confirm')` is `undefined` — do not assert a live 403/410 on a registered action.

**Scanner fixture mode:**
- `AE_SCAN_MODE=fixtures npm run test:ts-standards:fixtures` (and `:imports:fixtures`) prove the scanner still detects planted violations under `tests/fixtures/`. Clean mode must stay empty. Do not weaken a scanner to silence a real `src/` hit.

**Determinism:**
- Pass `now:` into commands.
- Brand ids with `brandNonEmpty('op:claim:sam-integration', 'OperationKey')` from `src/modules/common/ids.ts`.
- Do not depend on wall-clock, network, or Clerk in unit tests.
- Optional fields in fixtures: conditional-spread them. `exactOptionalPropertyTypes` is on.

## Secrets and env

- `.env.example` and `.env.local` exist (environment configuration). Never read or quote their contents in tests or docs.
- Tests that need OpenRouter install env through `startOpenRouterContractServer(...).installEnv()` and restore it.
- Source-write secrets must not use a `VITE_` prefix (ts-standards rule `client-exposed-source-write-secret`).
- Deploy-smoke may use Vercel bypass helpers in `tests/deploy-smoke/vercel-bypass.ts`; that is hosted-test plumbing, not product auth.

## Where to add new tests

| Change | Put the test |
|--------|----------------|
| Domain command / refusal code | `tests/unit/<module>/<name>.test.ts` |
| RFC 9457 mapping | `tests/unit/server/` or next to `src/lib/errors.ts` usage |
| React component | `tests/unit/chat/` or `tests/unit/ui/` with jsdom pragma |
| Cross-module flow | `tests/integration/<flow>.test.ts` |
| Convex schema / identity | `convex-test` in `tests/integration/` or `convex/<file>.test.ts` |
| New public module import | Expect `test:imports` to fail if you imported `internal/` — fix the seam, don't skip |
| Answer behavior | Add a case to `eval/answer/lib/eval-turn-cases.ts` or `eval-thread-cases.ts` **and** a Promptfoo row; `tests/eval/answer-pipeline.test.ts` will fail coverage if you only do one |
| Public copy / SEO | `tests/seo/` and/or e2e `assertPublicLanguage` |
| Hosted evidence | `tests/deploy-smoke/` — never as a replacement for unit/eval |
| Deleted family (inquiry, CR HTTP, WorkTree, Study, demand) | Absence pin in `tests/imports/product-frontier-manifest.test.ts` or `tests/unit/actions/registry.test.ts`. Do not restore the module. |
| Admin authority | Assert `denied` / `missing_membership`. Do not add a success-path that requires `readActiveAdminMembership` to return a row. |
| Connect reserve/finalize | Assert `connect_account_unlisted`. Do not add an `accepted` success path. |

## Post-cut deletion assertions

WorkTree, Study, demand, project-spine, Customer Request HTTP, and inquiries are **deleted**, not quarantined. `quarantineFamilies` is `[]`. `QUARANTINE_FAMILY_ACTION_PREFIXES` is empty. The connect authority tag `customer_requests:bounded_mandate` stays.

| Surface | Where absence is pinned |
|--------|-------------------------|
| `inquiry.submit`, `inquiry.readCustomerRecord`, `workTree.*`, `study.*`, `customerRequest.*` | `tests/imports/product-frontier-manifest.test.ts`, `tests/unit/actions/registry.test.ts`, `tests/unit/study-actions.test.ts`, `tests/unit/product-frontier/quarantine-write-admission.test.ts`, `tests/eval/product-foundry-partial-entry.test.ts` |
| Inquiry routes | `tests/e2e/public-owner-ui.spec.ts` (`/demo-inquiry-provider/inquiry`, `/owner/inquiries`, `/admin/inquiries` → 404) |
| Hosted inquiry URL | `tests/deploy-smoke/phase2-support-record-smoke.spec.ts` (404) |
| Business-tool HTTP | `tests/unit/server/business-tool-api.test.ts` and `tests/unit/server/quarantine-write-http.test.ts` — RFC 9457 410 for the retired door, including `inquiry.submit` as an instance string |
| `/api/v1/operations/execute` | 410 tombstone (`quarantine-write-http`); paid door is `POST /api/v1/operations/call` |
| Durable write in invocation tests | `tests/helpers/durable-write-fixture-action.ts` (`test.durable_write`) |
| MCP `workTree.*` | `tests/unit/server/mcp-api-tools-list.test.ts` expects no `ae_workTree_*` tools |

Harness still classifies the retired `inquiry.submit` tool id (`src/modules/harness/approval-policy.ts`). Those unit tests use the string as a fixture; they must not `import '@/modules/inquiries'`.

Do not run live `npx convex codegen` (upload) to refresh after a cut — it restores deleted Convex files from the last push. Stop `npm run dev:local` first. Quote globs that contain `$` (`'$slug.inquiry'`) or `inquiry*` (zsh `nomatch`).

---

*Testing analysis: 2026-08-20*
