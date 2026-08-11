# Testing Patterns
**Analysis Date:** 2026-08-11

## Test Framework
- Vitest `4.1.9` is configured in `vitest.config.ts`: Node environment, `tests/**/*.test.ts`, `tests/**/*.test.tsx`, and `convex/**/*.test.ts`, `globals: false`, `watch: false`, `tsconfigPaths: true`, and a Vitest-only `@` alias to `src/`.
- Every Vitest file receives `tests/setup/web-storage.ts`, `tests/setup/no-search-gap-writes.ts`, `tests/setup/resize-observer.ts`, and `tests/setup/http-rate-limit.ts`. UI tests opt into jsdom per file (`@vitest-environment jsdom`) and add `tests/setup/jsdom-platform.ts`; `@testing-library/react` is the component harness.
- Convex behavior uses `convex-test` (`tests/helpers/convex-fixtures.ts`) with the repository schema and dynamically loaded `convex/` modules. Browser tests use Playwright `1.61.1`; local defaults are in `playwright.config.ts`, while hosted/development paid-operation suites use the specialized configs.
- Primary declared commands are `npm test` (`node tools/dev/run-with-cleanup.mjs vitest run`), `npm run test:unit` (`node tools/dev/run-with-cleanup.mjs vitest run tests/unit`), and `npm run test:integration` (`node tools/dev/run-with-cleanup.mjs vitest run tests/integration convex/customerRequestRouteMandate.test.ts --no-file-parallelism`).

## Test File Organization
- `tests/unit/` covers pure modules, server adapters, Convex contracts, UI components, registry, money, supply, invocation, and route handlers; names end in `.test.ts`/`.test.tsx` and mirror the subject (`tests/unit/capability-supply/publication-validate.test.ts`).
- `tests/integration/` drives multi-module Convex/application flows (`tests/integration/capability-publication.test.ts`, `tests/integration/answer-thread-source-write.test.ts`). The standalone `convex/customerRequestRouteMandate.test.ts` is included by the integration command.
- `tests/imports/`, `tests/types/`, `tests/seo/`, and `tests/ui-contract/` are executable boundary/static-contract suites. `tests/eval/` contains answer/product evaluation tests; `tests/e2e/` contains local browser specs; `tests/deploy-smoke/` contains hosted/deployment smoke specs.
- `tests/helpers/` contains ports, Convex fixtures, local E2E adapters, keyless seeds, and contract servers; `tests/fixtures/` contains deliberately bad fixture trees and domain fixture data. `tests/setup/` is global Vitest setup, not a test case directory.

## Test Structure
- Use `describe`/`it` with one observable contract per case, arrange inputs/fakes, invoke the public seam, then assert discriminated outcomes, response status/headers/body, durable readback, or accessible UI. Unit examples are in `tests/unit/capability-supply/publication-validate.test.ts`; route-boundary examples are in `tests/imports/route-boundary.test.ts`.
- Async contracts use `await expect(promise).resolves...` or `.rejects...`; when checking a discriminated union, assert `kind` then narrow before accessing variant fields. Integration tests additionally query persisted state and assert replay/idempotency, refusal, authorization, and redaction (`tests/integration/answer-thread-source-write.test.ts`).
- Convex tests create an isolated `convexTest(schema, modules)` backend, call generated `api` functions, and use `backend.run(...)` only for explicit fixture setup/readback. `convexTestWithWorkers` registers Workpool and Rate Limiter components and can pause workers for deterministic assertions (`tests/helpers/convex-fixtures.ts`).
- UI tests render components, use Testing Library role/name queries and `fireEvent`/async finders, and call `cleanup()` in `afterEach` (`tests/unit/ui/demand-console.test.tsx`). Browser tests use Playwright role locators, `expect.poll` for eventual states, and explicit compact/wide assertions (`tests/e2e/landing-answer.spec.ts`).

## Mocking
- Global setup deliberately disables external side effects: `tests/setup/no-search-gap-writes.ts` installs a no-op search-gap recorder, and `tests/setup/http-rate-limit.ts` admits HTTP test requests unless a case overrides it.
- Prefer dependency ports and test setters (`setAnswerThreadPortForTests`, `setPublicRegistrySourcePortForTests`, `setHttpRateLimitAdmissionForTests`) over reaching a live Convex deployment. Restore setters and globals in `afterEach`/`afterAll` (`tests/helpers/answer-thread-test-port.ts`, `tests/helpers/registry-local-e2e.ts`).
- Use Vitest `vi.mock` for module seams, typed `vi.fn` for callbacks, `vi.spyOn` for clocks/DNS, `vi.stubGlobal` for `fetch`/browser APIs, and `vi.stubEnv` for configuration. Provider/model HTTP is mocked with fresh `Response`/`UndiciResponse` values (`tests/integration/customer-request-v2-application-path.test.ts`, `tests/integration/customer-request-v2-multi-capability-route.test.ts`).
- The answer eval harness uses the in-repo OpenRouter contract server (`tests/helpers/openrouter-contract-server.ts`), not an uncontrolled model call. Mocks must preserve the real schema and refusal/error shape; do not assert only that a mock was called when the returned contract is the behavior under test.

## Fixtures and Factories
- `tests/helpers/convex-fixtures.ts` supplies `convexModules`, `convexTestWithWorkers`, `ownerAdmin`, `publishedBusinessOwner`, and publication preparation helpers. Use these instead of duplicating identity, catalog, workpool, or rate-limiter setup.
- Local browser fixtures are explicit and public-facing (`tests/helpers/local-e2e-business-fixtures.ts`, `tests/helpers/registry-local-e2e.ts`); discovery and keyless behavior has dedicated fixture sources (`tests/helpers/discovery-fixture-routes.ts`, `tests/helpers/keyless-seed-source.ts`).
- Bad trees under `tests/fixtures/bad-imports`, `bad-ts-standards`, and `bad-ui-contract` prove scanners fail closed. `AE_SCAN_MODE=fixtures` selects these fixtures; clean runs scan runtime source. Do not add real credentials to fixtures.
- Prefer deterministic IDs/timestamps and small builders. Direct `backend.run` inserts are reserved for corruption/readback/ownership cases that cannot be reached through the public command; document that reason in the test.

## Coverage
- `vitest.config.ts` declares no global coverage provider or threshold. Coverage is contract-specific: answer coverage is audited by `test:eval:coverage`, and `tests/eval/answer-pipeline.test.ts` checks case uniqueness, required coverage, score thresholds, timing, and report invariants.
- The source release gate runs the curated conformance list (`npm run test:conformance`), then `npm run test:release:unit`, `npm run test:release:integration`, `npm run test:types`, `npm run test:imports`, `npm run test:ts-standards`, `npm run test:seo`, `npm run test:ui-contract`, `npm run test:eval:report`, and build/type/lint checks via `npm run test:release:source` (`package.json`).
- Specialized declarations include `npm run test:types`, `npm run test:imports`, `npm run test:imports:fixtures`, `npm run test:ts-standards`, `npm run test:ts-standards:fixtures`, `npm run test:seo`, and `npm run test:ui-contract`; these are boundary assertions, not line-coverage substitutes.

## Test Types
- **Source/unit:** `npm run test:unit` and the focused Vitest files prove pure/domain/route/Convex contracts in-process; no hosted behavior is implied.
- **Source/integration:** `npm run test:integration` and `tests/integration/` prove composed application/Convex behavior with isolated `convex-test`, mocked providers/models, and durable readback.
- **Static contracts:** `tests/imports/`, `tests/types/`, `tests/seo/`, and `tests/ui-contract/` scan source/fixtures for forbidden imports, broad type holes, public SEO, and UI rules.
- **Local browser:** `npm run test:e2e` runs `node tools/dev/run-with-cleanup.mjs playwright test tests/e2e` with `playwright.config.ts`; its web server command is `npm run dev -- --port 3020 --strictPort --host 127.0.0.1`, with compact and wide Chromium projects and `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E=true`. It proves the checked-out app plus local services. The paid-operation config declares `vite --config tools/dev/paid-operation-browser/vite.config.ts --port 3021 --strictPort`.
- **Eval:** `npm run test:eval` runs coverage/report, Promptfoo with `eval/answer/promptfooconfig.yaml`, and `vitest run tests/eval`; `npm run test:eval:validate` validates the Promptfoo configuration. These prove evaluation contracts, not production provider availability.
- **Hosted:** `npm run test:release:hosted` chains hosted readback, production credential/smoke setup, human lifecycle Playwright, and gateway smoke. `playwright.deploy-smoke.config.ts` has no local `webServer`, uses one deploy project, 45-second tests, retained-on-failure traces, and failure screenshots. `tests/deploy-smoke/customer-request-human-lifecycle-smoke.spec.ts` obtains its base URL/configuration from deployment environment and proves reload/readback against the hosted app.
- **Development evidence:** `npm run smoke:customer-request:development`, `npm run smoke:work-tree:development`, and the `evidence:*:development` scripts are explicitly local/development evidence; `tools/ae/cli.ts` states that `--base-url` execution never proves hosted behavior. Do not label this output as production certification.

## Common Patterns
- Every test command that uses `tools/dev/run-with-cleanup.mjs` snapshots the process list, forwards signals, removes transient caches (`node_modules/.vite`, `node_modules/.cache`, `.vite`, `.vinxi`, `.tanstack`, `.cache`, `.promptfoo-home`), and terminates only test-owned headless browsers created after the snapshot; protected interactive profiles are excluded (`tools/dev/run-with-cleanup.mjs`).
- Browser config uses `fullyParallel` for local E2E, `retries: 2` only under `CI`, 30-second tests, 5-second expects, 10-second actions, 15-second navigation, trace-on-first-retry, and failure screenshots (`playwright.config.ts`). Deploy smoke is serial, no-retry, 45-second, 20-second navigation, and retain-on-failure traces (`playwright.deploy-smoke.config.ts`).
- Reset mutated process environment, mocked ports, clocks, browser globals, and storage after each test. Keep generated reports in `output/`, Playwright artifacts in `test-results/`/`playwright-report/`, and avoid assertions on unstable timing except bounded/p95 invariants.
- Release distinctions are explicit: `npm run test:release:source` checks the source tree, manifests, codegen, unit/integration/boundary/eval suites, and build; `npm run test:release:hosted` checks deployed endpoints. A passing source suite is not hosted evidence, and a local E2E pass is not a production proof.

---
*Testing analysis: 2026-08-11*
*Update when test patterns change*
