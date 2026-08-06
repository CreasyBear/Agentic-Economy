# Testing Patterns
**Analysis Date:** 2026-08-06

## Test Framework
- **Runner/assertion:** Vitest (via `vitest.config.ts`), config `globals: false` — import `{ describe, expect, it, beforeEach, afterEach, vi }` from `vitest` explicitly. Environment `node`; `watch: false`; `setupFiles` under `tests/setup/`.
- **Include globs** (`vitest.config.ts`): `tests/**/*.test.ts`, `tests/**/*.test.tsx`, `convex/**/*.test.ts`.
- **Setup files:** `web-storage.ts`, `no-search-gap-writes.ts`, `resize-observer.ts`, `http-rate-limit.ts`.
- **Run commands** (`package.json`):
  - `npm test` / `npm run test:unit` → `vitest run tests/unit`
  - `npm run test:integration` → `vitest run tests/integration convex/customerRequestRouteMandate.test.ts --no-file-parallelism`
  - `npm run test:types` → `tests/types` · `test:seo` → `tests/seo` · `test:ui-contract` → `tests/ui-contract`
  - `npm run test:imports` → granular import-boundary suites in `tests/imports/*` with `AE_SCAN_MODE=clean`; `test:ts-standards` → `tests/imports/ts-standards.test.ts`
  - `npm run test:e2e` → Playwright `tests/e2e`; `npm run test:eval` → promptfoo + `tests/eval`
  - Gate: `npm run gate:release` → `test:release:source` (codegen + lint + typecheck + unit + integration + types + imports + ts-standards + seo + ui-contract + eval-report + build) then `test:release:hosted`.
- Many test scripts wrap via `node tools/dev/run-with-cleanup.mjs vitest run ...` which snapshots PIDs and reaps only test-owned headless browsers afterwards.

## Test File Organization
- **Location mirrors source:** `tests/unit/<domain>/<filename>.test.ts` for unit; `tests/integration/*.test.ts` for cross-surface/integration; `convex/*.test.ts` colocated for Convex function tests; `tests/e2e/`, `tests/e2e/a11y`, `tests/deploy-smoke/` for Playwright specs (`.spec.ts`); `tests/types/`, `tests/seo/`, `tests/ui-contract/` for contract suites.
- **Naming:** `<module>.test.ts` / `.test.tsx` (component tests); Playwright is `<name>.spec.ts`.
- **Shared helpers** live in `tests/helpers/` (`answer-thread-test-port.ts`, `answer-turn-stream.ts`, `convex-fixtures.ts`, `curated-supply.ts`, `http.ts`, `openrouter-contract-server.ts`, `source-files.ts`, `source-write-admission.ts`).

## Test Structure
- **`describe`/`it`** with `it.each([...])` for parameterized cases (e.g. `it.each([0, 22])('does not reinterpret responseTimeMinutes=%i ...')`). Suites group by function-under-test or boundary.
- **Arrange/Act/Assert:** build fixtures via local helper functions returning typed DTOs, invoke, then assert with `expect(...).toEqual(...)`, `.toBe(...)`, `.toMatch(/.../)`, `.toContain(...)`
- **Boundary/import tests** read source via `readFileSync`/`readdirSync` and assert the exact import list or a forbidden-vocabulary regex (see `tests/imports/capability-contract-boundaries.test.ts`).

## Mocking
- **`vi.mock`** is used sparsely (36 files) — prefer real code + dependency injection where possible.
- **Global fetch stubs:** `const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({...})))` then `vi.stubGlobal('fetch', fetchMock)`; assert via `fetchMock.mock.calls[0]?.[1]`. Guard against an eagerly-built one-shot `Response` body — when a body must be re-consumable per call, build it with `mockImplementation((async () => new Response(...)) )` rather than `mockResolvedValue(modelResponse(...))`.
- **AI SDK module interception:** `vi.mock('ai', async (importOriginal) => { const actual = await importOriginal(); return { ...actual, generateText: new Proxy(...) } })` to observe calls, or `import { MockLanguageModelV4 } from 'ai/test'` with `new MockLanguageModelV4({ doGenerate: [...] })` for multi-step tool-call/usage scenarios (`tests/unit/answer/answer-tool-use-agent.test.ts`).
- **`vi.hoisted`** for state shared between the mock factory and tests; `vi.stubGlobal`/env cleanup in `afterEach` (`delete process.env.OPENROUTER_API_KEY`).
- **Env-scoped suites:** `AE_SCAN_MODE=clean` vs `AE_SCAN_MODE=fixtures` toggles import-scan assertions over `tests/fixtures/`.

## Coverage
- No `coverage` threshold block in `vitest.config.ts` (no `coverage:` key). Coverage intent surfaces via eval/suite report scripts: `npm run test:eval:coverage` → `eval/answer/scripts/audit-coverage.ts`, and `test:eval:report` → `eval/answer/scripts/run-suite.ts`. JSON reporters write `output/release/{unit,integration}-vitest.json`.

## Special Cases
- **Unit vs integration:** unit = single module in `tests/unit/<domain>/`; integration = cross-surface flows in `tests/integration/` (run with `--no-file-parallelism` and `--test-timeout=15000`) plus `convex/*.test.ts` for Convex route/durable-path tests.
- **Convex helpers:** `tests/helpers/convex-fixtures.ts` + `convexFixtures` for generating Convex-shaped fixtures; codegen gate is `npm run check:convex-codegen` (`convex codegen --dry-run --typecheck=disable`); Convex deployments seeded via `npm run seed:dev`.
- **Type/schema contracts:** `tests/types/domain-contracts.test.ts`, `tests/ui-contract/ui-contract.test.ts`, `tests/seo-json-ld` for shape/SEO contracts — assert exact DTO projections (no invented fields, e.g. trust projection locks "unknown" labels).
- **Playwright e2e:** dedicated configs `playwright.config.ts`, `playwright.deploy-smoke.config.ts`, `playwright.paid-operation.config.ts`; `tests/deploy-smoke/*-smoke.spec.ts` for hosted provider smoke (Resend/Novu dispatch, customer-request lifecycle).
- **Eval:** promptfoo config `eval/answer/promptfooconfig.yaml` + `eval/engine/run-evaluation.mjs` (`test:engine:eval`); run with `PROMPTFOO_CONFIG_DIR=.promptfoo-home PROMPTFOO_DISABLE_WAL_MODE=true`.
- **Browser reaping:** all `vitest run`/`playwright test` invocations route through `tools/dev/run-with-cleanup.mjs` to terminate only test-owned headless browsers and preserve the child exit code.
---
*Testing analysis: 2026-08-06*
