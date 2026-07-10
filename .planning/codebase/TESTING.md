# Testing Strategy

**Analysis date:** 2026-07-10

## Test Stack

- Vitest 4 is the primary runner for unit, integration, contract, copy, SEO, import-boundary, and evaluation-support tests. Configuration lives in `vitest.config.ts`.
- Vitest runs in a Node environment, with globals disabled and watch mode disabled. Test APIs are imported explicitly from `vitest`.
- React component tests use `@testing-library/react`, `@testing-library/jest-dom`, and JSDOM where a file needs DOM behavior.
- Playwright 1.61 drives browser end-to-end, accessibility, and hosted deployment-smoke suites via `playwright.config.ts` and `playwright.deploy-smoke.config.ts`.
- Promptfoo evaluates the answer pipeline through `eval/answer/promptfooconfig.yaml`, with repository scripts producing and auditing reports under `output/eval/`.
- TypeScript compiler checks and Convex dry-run codegen are first-class verification gates, not substitutes for runtime tests.

## Test Organization

- `tests/unit/` contains focused domain, adapter, React, security, observability, and Convex-runtime behavior tests.
- `tests/integration/` exercises route handlers, cross-module workflows, authentication/session boundaries, API DTOs, and source/readback behavior.
- `tests/types/` verifies literal unions, validators, exhaustive contracts, and public type compatibility with `expectTypeOf`.
- `tests/e2e/` contains browser journeys; `tests/e2e/a11y/` is a separately runnable accessibility suite.
- `tests/deploy-smoke/` exercises deployed/provider-backed boundaries with a distinct Playwright configuration and explicit environment requirements.
- `tests/eval/` and `eval/answer/` cover answer quality, graph freshness, prompt cases, and report generation.
- `tests/copy/`, `tests/seo/`, `tests/imports/`, and `tests/ui-contract/` are executable architecture and product-policy gates.
- `tests/fixtures/` contains deliberately invalid files. Clean-mode scanners must accept production source; fixture-mode scripts prove each scanner detects a representative violation.
- Shared test adapters belong in `tests/helpers/`; representative examples are `tests/helpers/answer-thread-test-port.ts` and `tests/helpers/openrouter-contract-server.ts`.

## File and Suite Conventions

- Vitest files use `*.test.ts` or `*.test.tsx`. `vitest.config.ts` includes both patterns under `tests/`.
- Playwright files use `*.spec.ts`. Browser suites are discovered under `tests/e2e/`; deploy smoke tests pass their directory and config explicitly.
- Group tests by behavior with `describe`, then state one observable outcome per `it`. Test descriptions are behavior sentences rather than implementation labels.
- Use `it.each` for finite matrices and named eval cases, as in `tests/eval/answer-pipeline.test.ts` and `tests/integration/registry-api.test.ts`.
- Arrange inputs close to the assertion. Larger builders live at the bottom of the test file or in `tests/helpers/` when shared across suites.
- Tests import through production public seams where possible. A test that intentionally verifies an internal unit may import the owning internal file, but integration tests generally compose module `public.ts` surfaces and route handlers.

## Unit Testing Patterns

- Pure domain functions are tested with explicit state and deterministic inputs. `tests/unit/common/runtime-id.test.ts` checks both the stable readable prefix and the UUID-shape invariant.
- Result-union tests assert discriminants, literal codes, retryability, and payload shape rather than only truthiness.
- State-machine tests cover valid transitions, invalid transitions, idempotent retries, duplicate requests, suppression, and retention boundaries.
- Security tests include malicious/invalid inputs and leakage assertions. Relevant suites live under `tests/unit/security/`, `tests/unit/clearance/`, and `tests/unit/server/`.
- Provider adapters use controlled fakes or mocked fetch boundaries; they verify request construction, redaction, evidence capture, and provider failure classification without making live calls.
- React component tests render with Testing Library, query by role/label/text, exercise interactions with `fireEvent`, and call `cleanup` in `afterEach` when automatic cleanup is not assumed.
- Mock only boundary dependencies. `vi.mock` is used for router hooks, capture clients, or server-only seams; domain behavior is usually exercised directly.
- Reset spies and restore environment/global mutations in `afterEach` or `finally` to keep suites order-independent.

## Integration Testing Patterns

- Integration tests invoke route handlers and module workflows directly in-process, avoiding a browser when the contract is HTTP/data behavior.
- They cover status codes, headers, response schemas, authorization, source/readback distinction, and private-field exclusion. `tests/integration/registry-api.test.ts` is a representative public API contract suite.
- Cross-surface parity is explicit: registry, search, API list/detail, discovery manifests, and route loaders are tested against the same source state to prevent projection drift.
- Session/auth tests set the minimum relevant environment, restore it after the test, and exercise both authorized and denied paths.
- Answer-pipeline integration suites cover tool calls, rate limits, follow-ups, intent routing, empty states, streaming boundaries, thread sharing, and gate fallback.
- Convex-facing behavior is also tested without depending solely on a deployed backend; `tests/unit/convex/` verifies source stores, cleanup, authorization, indexes, and runtime contracts.

## Type and Architecture Contract Tests

- `tests/types/domain-contracts.test.ts` proves that Zod-inferred types equal the exported domain unions.
- `tests/types/capability-contracts.test.ts`, `tests/types/protected-actions-contracts.test.ts`, and `tests/types/business-action-contracts.test.ts` pin literal versions, action slugs, facet maps, and evidence contracts.
- `tests/imports/private-imports.test.ts` rejects imports across private module seams.
- `tests/imports/route-boundary.test.ts` rejects route access to forbidden implementation/provider surfaces.
- `tests/imports/backup-imports.test.ts` prevents runtime dependence on backup/archive sources.
- `tests/imports/source-mining.test.ts` prevents planned or future-only surfaces from becoming accidental runtime source.
- `tests/imports/ts-standards.test.ts` enforces banned constructs such as explicit `any`, unsafe cast chains, non-null assertions, broad statuses, and untyped Convex validators.
- `tests/unit/schema/convex-schema.test.ts` and `npm run check:convex-codegen` guard schema composition and generated contract freshness.

## Product and Copy Gates

- Copy tests scan public human and machine surfaces for unsupported product, payment, autonomy, protocol, and trust claims.
- `tests/copy/claims-register.test.ts` distinguishes approved phase-owned statements from public overclaims; fixtures prove rejected language is actually detected.
- SEO suites verify canonical URLs, public structured data, discovery files, noindex behavior, and public-thread/business metadata.
- `tests/ui-contract/ui-contract.test.ts` scans for design-system and route styling violations using clean/fixture modes.
- Leakage assertions intentionally serialize DTOs and reject private identifiers, raw contact/provider material, admin internals, and capability flags that would imply unavailable behavior.

## Browser and Accessibility Tests

- `playwright.config.ts` runs Chromium at compact (`375x812`) and wide (`1440x1100`) viewports.
- Tests are fully parallel. Local runs have no retry; CI retries twice. Traces are retained on first retry and screenshots on failure.
- The local browser server runs `npm run dev` on `127.0.0.1:3020` with `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E=true`; CI starts a fresh server while local runs may reuse one.
- Browser assertions prefer accessible roles, names, labels, and focus state. This makes the same suite prove core accessibility semantics and user behavior.
- End-to-end journeys verify public landing/search, claim/publish, owner readbacks, inquiry and protected-action flows, answer threads, and developer discovery.
- `tests/e2e/a11y/` is separately addressable through `npm run test:a11y` or `npm run test:e2e:a11y`; it covers chat, discovery, protected actions, and public/owner surfaces.
- Deploy-smoke suites are not part of ordinary local E2E. They use `playwright.deploy-smoke.config.ts`, target a supplied hosted base URL, and exercise real provider or deployment boundaries only when credentials/configuration are available.

## Evaluation and Graph Freshness

- `npm run test:eval:coverage` audits the answer evaluation case inventory before running model-backed evaluation.
- `npm run test:eval:report` generates `output/eval/answer-suite-report.json` from deterministic suite execution.
- `npm run test:eval` then runs Promptfoo without cache and executes `tests/eval/` through Vitest.
- `npm run test:eval:validate` validates the Promptfoo configuration and audit coverage without running the complete release path.
- `npm run test:graph-freshness` executes `tests/scripts/assert-graph-fresh.ts` to detect stale derived graph artifacts.
- Live API studies are opt-in via `npm run test:eval:live-api`; they are distinct from deterministic release verification.

## Commands and Gate Ladder

Run the narrowest relevant test first, then expand according to the changed boundary:

| Purpose | Command |
|---|---|
| Strict compiler check | `npm run typecheck` |
| Convex generated-contract check | `npm run check:convex-codegen` |
| One Vitest file | `npx vitest run tests/path/to/file.test.ts` |
| Unit suite | `npm run test:unit` |
| Integration suite | `npm run test:integration` |
| Type contracts | `npm run test:types` |
| Import boundaries | `npm run test:imports` |
| Source ownership scan | `npm run test:source-mining` |
| TypeScript standards scan | `npm run test:ts-standards` |
| Copy gate | `npm run test:copy` |
| SEO gate | `npm run test:seo` |
| UI contract | `npm run test:ui-contract` |
| Browser E2E | `npm run test:e2e` |
| Accessibility browser suite | `npm run test:a11y` |
| Answer evaluation | `npm run test:eval` |
| Build | `npm run build` |
| Broad deterministic repository gate | `npm run test:all` |
| Release gate including eval/E2E/a11y | `npm run test:release` |

`npm run test:all` includes typecheck, Convex codegen, unit, integration, type, import, source-mining, TypeScript-standard, copy, SEO, UI-contract, and build checks. `npm run test:release` uses a different release-oriented sequence: it includes eval, graph freshness, E2E, and accessibility, but does not include every standalone suite from `test:all`. Select the gate based on the change rather than assuming one command is a strict superset of the other.

## CI Behavior

- `.github/workflows/eval-gate.yml` runs on pushes and pull requests to `main` using Node 20 and `npm ci`.
- CI runs typecheck, Convex codegen, unit, integration, type contracts, copy, SEO, UI contract, import/source scans, TypeScript standards, the answer eval gate, and build.
- Evaluation reports are uploaded even when the job fails, supporting diagnosis without treating artifact presence as a passing gate.
- The workflow sets `AE_ANSWER_EVAL_PASSED=1` only after the evaluation step succeeds, then confirms the flag before the build release valve.
- The primary CI workflow does not currently run Playwright E2E, accessibility, graph freshness, or deploy-smoke suites. Those remain explicit local/release/hosted gates and should not be described as CI-proven unless another external workflow runs them.

## Coverage and Known Gaps

- The repository has broad behavioral breadth: 268 `*.test.ts`, `*.test.tsx`, and `*.spec.ts` files were present under `tests/` at analysis time.
- There is no configured line/branch coverage provider or numeric coverage threshold in `vitest.config.ts` or `package.json`. `test:eval:coverage` audits evaluation-case coverage, not JavaScript statement/branch coverage.
- There is no lint/format command in `package.json`; correctness relies on TypeScript plus custom repository scans. Formatting consistency is convention-based rather than tool-enforced.
- Vitest defaults to a Node environment; React test files that need DOM behavior must establish JSDOM through their test setup/file convention. Do not assume a browser-like environment globally.
- Provider-backed and hosted smoke tests require environment-specific credentials and endpoints and therefore cannot be inferred green from local unit/integration results.
- Test fixtures include `.DS_Store` files under `tests/`; scanners should continue to target explicit source extensions rather than treating every filesystem entry as a test input.

## Expectations for New Work

- Add unit tests for pure logic and state transitions, integration tests for transport/persistence/auth boundaries, and Playwright tests only when browser behavior materially matters.
- For bug fixes, first add a regression case that reproduces the failed behavior at the narrowest authoritative seam.
- For schema changes, update validators, generated types, type-contract tests, Convex schema tests, and codegen together.
- For public API or discovery changes, assert exact DTO shape, status/headers, parity across projections, and absence of private fields.
- For security-sensitive changes, cover deny paths, malformed input, replay/idempotency, redaction, and fail-closed behavior.
- For UI changes, cover loading/empty/error/success states, keyboard/focus behavior, accessible names, compact and wide layouts where relevant, and public-copy constraints.
- Report verification precisely: name the commands that actually ran, separate deterministic local proof from hosted/provider proof, and never infer passing suites from adjacent gates.

---

*Testing analysis: 2026-07-10*
