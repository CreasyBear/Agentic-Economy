---
title: Codebase Testing Practices
analysis_date: 2026-08-01
scope: Full repository
---

# Codebase Testing Practices

**Analysis date:** 2026-08-01  
**Scope:** Vitest unit/integration/contract tests, Convex runtime tests, Playwright browser/smoke suites, evaluation harnesses, fixtures, scripts, and CI gates.

## Test architecture at a glance

The repository uses several complementary proof layers rather than one undifferentiated suite:

| Layer | Location/configuration | What it proves |
|---|---|---|
| Vitest unit/domain | `tests/unit/**`, root `convex/*.test.ts` | Pure state transitions, schemas, projections, action contracts, UI components, refusal/error precedence |
| Vitest integration | `tests/integration/**` and selected Convex tests | Route/server seams, Convex persistence, source-write admission, seeded catalog behavior, streaming and follow-up boundaries |
| Static architecture/contract scans | `tests/imports/**`, `tests/types/**`, `tests/ui-contract/**`, `tests/seo/**` | Import ownership, forbidden patterns, type/validator parity, semantic UI tokens, SEO/discovery serialization |
| Evaluation suites | `eval/**` plus `tests/eval/**` | Deterministic answer/engine cases, semantic coverage, user-outcome scores, persisted evidence and protocol traces |
| Browser E2E | `tests/e2e/**` | User journeys, responsive behavior, accessibility, visible boundary copy, thread/session continuity |
| Hosted/deployment smoke | `tests/deploy-smoke/**` | Exact deployed readback, authentication boundaries, headers, provider dispatch, production Request lifecycle |
| Release/CI orchestration | `.github/workflows/kernel-release-gate.yml` and `.github/workflows/react-doctor.yml` | Source proof chain, exact-revision deployment/readback, advisory React diagnostics |

## Vitest configuration and execution

- `vitest.config.ts` uses the Node environment by default, sets `globals: false`, disables watch mode, and includes `tests/**/*.test.ts`, `tests/**/*.test.tsx`, and `convex/**/*.test.ts`.
- Every Vitest file receives `tests/setup/web-storage.ts` and `tests/setup/no-search-gap-writes.ts`. The former installs a per-file Web Storage implementation only when `window` exists; the latter replaces search-gap recording with a no-op so ordinary tests cannot write fabricated traffic to a configured Convex deployment. Tests that need the seam must explicitly call `setSearchGapRecorderForTests`.
- UI files opt into jsdom locally with a file header such as `/** @vitest-environment jsdom */` in `tests/unit/ui/demand-console.test.tsx`; the default remains Node for fast domain/server testing.
- Test code imports `describe`, `it`, `expect`, and lifecycle helpers explicitly because globals are disabled. Parameterized cases use `it.each`, and asynchronous outcomes commonly use `resolves`/`rejects` with `toMatchObject` or exact `toEqual` checks.
- `package.json` exposes focused commands: `npm test`, `npm run test:unit`, `npm run test:integration`, `npm run test:types`, `npm run test:imports`, `npm run test:ts-standards`, `npm run test:seo`, `npm run test:ui-contract`, and `npm run test:all`. The release chain composes these in `test:release:source` after lint/type/routing/codegen-retirement checks.

## Unit and domain test patterns

- Unit tests are arranged by domain (`tests/unit/action-invocation`, `tests/unit/answer`, `tests/unit/answer-thread`, `tests/unit/capability-supply`, `tests/unit/customer-request`, `tests/unit/registry`, `tests/unit/security`, and many others). Test names describe an observable transition or refusal, for example `tests/unit/plan-proposal/proposal-contract.test.ts` checks invalid menu actions, cyclic plans, non-frontier steps, budget exhaustion, missing evidence, nonce mismatch, and missing provider cost.
- Tests assert discriminated result codes and side effects rather than private implementation. The proposal tests use a hoisted model mock and then assert `kind`/`reason`, call counts, and the exact pre-transport refusal ordering.
- `tests/types/domain-contracts.test.ts` combines `expectTypeOf` with runtime Zod parses. It proves validators infer the exported unions, invalid statuses are rejected, representative literals remain accepted, and `@ts-expect-error` catches widened/bogus status assignments.
- Schema tests inspect exported structure and required indexes. `tests/unit/schema/convex-schema.test.ts` parses Convex's schema export and checks durable tables/indexes; it is a structural contract test, not a snapshot of arbitrary generated output.
- UI unit tests use Testing Library with semantic queries. `tests/unit/ui/demand-console.test.tsx` renders components, stubs browser APIs with `vi.fn`, clicks accessible buttons, waits for visible state, and asserts that internal identifiers or unavailable-success language are absent. Cleanup is explicit via `afterEach(cleanup)`.
- Domain tests prefer deterministic constants/builders and test both accepted and refused branches. Large scenario files such as `tests/unit/action-invocation/durable-action-invocation.test.ts` and `tests/unit/customer-request/v2-request-semantics.test.ts` encode state-machine transitions, replay, stale revisions, authority, and reconciliation boundaries.

## Convex and persistence testing

- Convex integration tests use `convex-test` with the real schema and dynamically discovered module map. `tests/integration/adelaide-dental-seed.test.ts`, `tests/integration/answer-thread-source-write.test.ts`, and `tests/integration/capability-publication.test.ts` build `convexTest(schema, modules)`, then call generated `api`/`internal` queries and mutations through authenticated test identities.
- These tests seed the source-owned catalog and inspect persisted rows, projections, audit records, idempotency receipts, and public readbacks. Helpers such as `publishedBusinessOwner` in `tests/integration/capability-publication.test.ts` keep identity/setup details consistent.
- Root Convex tests (`convex/decisionMaps.test.ts`, `convex/projectSpine.test.ts`, `convex/enginePlans.test.ts`, `convex/customerRequestRouteMandate.test.ts`, and `convex/customerRequestAgentOAuth.test.ts`) are included by `vitest.config.ts` and exercise backend-owned logic alongside the mirrored `tests/` suites.
- Where invoking a Convex function directly is more useful than spinning the full harness, tests extract the generated handler with a narrowly typed test cast and provide a fake DB/index implementation. `tests/unit/convex/notification-outbox-runtime.test.ts` does this for notification mutations/queries, then asserts durable rows, redaction, audit/funnel events, replay, operator authority, CSRF refusal, and no side effect after refusal.
- Persistence tests favor fresh backend instances per test and explicit seeded identities. They check atomicity and no-write guarantees (`tests/integration/customer-request-v2-application-path.test.ts`, `tests/integration/capability-supply-registration.test.ts`) instead of merely checking a final response.

## Integration, HTTP, and streaming tests

- Integration tests call route handlers directly with `Request` objects when the contract is server-local. `tests/integration/answer-turn-boundary-follow-up.test.ts` exercises `handleAnswerTurnRequest`, installs a thread test port, sets local/eval environment flags, parses SSE `data:` frames, and restores ports/environment in `afterEach`/`finally` blocks.
- HTTP tests cover response status, JSON error codes, headers, cookies, rate limits, access control, and stream ordering. `tests/unit/server/mcp-api.test.ts`, `tests/unit/server/customer-request-agent-api.test.ts`, and `tests/integration/answer-turn-empty-state.test.ts` are representative.
- External model calls are isolated behind deterministic contract servers rather than live network calls. `tests/helpers/openrouter-contract-server.ts` starts an ephemeral `127.0.0.1` HTTP server, captures request bodies, returns planned tool/prose payloads, installs temporary environment variables, and returns a `close`/restore function. `tests/eval/answer-pipeline.test.ts` and answer integration tests use this helper.
- Tests that mutate process environment preserve the prior value and restore it in `finally` or `afterEach`. `tests/integration/answer-thread-share.test.ts`, `tests/integration/adelaide-dental-seed.test.ts`, and `tests/unit/answer/answer-tool-use-agent.test.ts` demonstrate this pattern.
- Test seams are explicit and resettable: examples include `setAnswerThreadPortForTests`/`resetAnswerTurnGuardForTests` from `src/modules/answer-thread/testing`, `setSearchGapRecorderForTests` in the global setup, and `vi.spyOn`/`vi.mock` for bounded provider or clock seams.

## Static architecture and contract tests

- Import tests scan source text and local import graphs, often with `node:fs`/`globSync`, and use deliberately invalid fixture files under `tests/fixtures/bad-imports/`. `tests/imports/action-invocation-host-boundaries.test.ts` recursively walks host imports, rejects low-level commands, and confirms development provider fixtures remain outside production graphs.
- `tests/imports/ts-standards.test.ts` runs `scanTypeScriptStandards` over clean runtime targets or `tests/fixtures/bad-ts-standards/` when `AE_SCAN_MODE=fixtures`. It expects explicit violations such as `explicit-any`, non-null assertions, `v.any()`, broad statuses, and unsafe secret patterns in fixture mode, while requiring no violations in clean mode.
- Additional ownership tests in `tests/imports/route-boundary.test.ts`, `tests/imports/private-imports.test.ts`, `tests/imports/capability-contract-boundaries.test.ts`, and `tests/imports/action-invocation-host-boundaries.test.ts` enforce that routes use public seams and that private/provider/runtime internals do not leak across module boundaries.
- `tests/ui-contract/ui-contract.test.ts` scans `src/components/ae` and `src/routes` for semantic visual token usage. `tests/seo/**` and related integration tests parse serialized metadata, canonical URLs, robots/sitemap output, discovery files, and JSON-LD rather than relying on snapshots alone.
- Fixture mode is opt-in through environment variables, and scripts such as `package.json`'s `test:imports:fixtures` and `test:ts-standards:fixtures` run the negative examples without weakening the clean-source gate.

## Answer and engine evaluation harnesses

### Answer evaluation

- Answer cases and required semantic tags live in `eval/answer/lib/cases.ts`; turn, thread, and harness cases are typed with `as const satisfies` and have stable IDs. `eval/answer/lib/coverage.ts` checks uniqueness, required tags/assertions, expected case shape, promptfoo synchronization, and a broad seed minimum.
- `eval/answer/lib/evaluators.ts` executes deterministic gate/chip/parity/injection/tool-use/answer-turn/thread evaluators through real module seams, collects evidence/work steps/artifact kinds, and returns diagnostics rather than opaque booleans.
- The Promptfoo configuration `eval/answer/promptfooconfig.yaml` contains explicit pass/fail cases for grounding, epistemic language, unsupported booking, boundary copy, filters, tool input, answer turns, and answer threads. JavaScript assertions under `eval/answer/assertions/` compare each result to its expected pass/fail variable.
- `tests/eval/answer-pipeline.test.ts` audits the shared catalog and Promptfoo config, runs the suite, checks score thresholds and user-outcome fields (`satisfied`, `gotRightAnswer`, `canProceed`, low abandonment risk), and executes every typed turn/thread case with `it.each`.
- `package.json`'s `test:eval` runs the custom coverage audit, writes an answer report, runs Promptfoo without cache/WAL mode, and then runs `tests/eval`; `test:eval:validate` performs the coverage/config validation without executing the full eval.

### Engine evaluation

- `eval/engine/cases.json` is parsed with Zod in `eval/engine/lib/suite.ts` into clear, vague, no-supply, plan, and adversarial cases. The suite runs production answer-turn seams with deterministic ports/model responses, checks persisted plan events, validates hostile proposals, and reports case status, evidence class, model calls, revisions, metrics, and p95 role latency.
- `eval/engine/run-suite.ts` writes a stable JSON report under `output/eval/`, prints summary fields, and exits non-zero when `report.ok` is false. `tests/eval/engine-suite.test.ts` asserts the twenty-case composition, no-model-call clear/vague paths, persisted plan evidence, adversarial refusal reasons, cost/action ceilings, and non-zero latency signals.
- Other `tests/eval/*` files cover product-foundry bundles/partial entry, graph freshness, ADR transfer/composition controls, and answer pipeline evidence. These are executable semantic proof, not static documentation checks.

## Browser E2E and accessibility

- `playwright.config.ts` points `testDir` to `tests/e2e`, runs compact (375×812) and wide (1440×1100) Chromium projects, enables full parallelism, uses 30-second test timeouts/5-second expectations, retries twice on CI, traces on first retry, and captures screenshots only on failure.
- If `PLAYWRIGHT_BASE_URL` is absent, Playwright starts the local Vite server on `127.0.0.1:3020` with local Clerk disabled. A supplied base URL switches the suite to an external deployment without the local web server.
- E2E tests use accessible roles/names, visible copy, semantic URLs, and browser APIs. `tests/e2e/thread-first.spec.ts` serializes a multi-step thread journey; `tests/e2e/chat-discovery-inquiry-loop.spec.ts` serializes discovery-to-inquiry transitions; `tests/e2e/landing-answer.spec.ts` covers first answer and empty state.
- Responsive/accessibility tests live under `tests/e2e/a11y/` and in `tests/e2e/paid-operation-development-surface.spec.ts`. They check keyboard reachability, skip links, reduced motion, target sizes, non-colour truth labels, overflow at 320px, and visible focus rather than internal component state.
- E2E tests may skip intentionally unsupported project combinations with an explanatory reason (`tests/e2e/thread-first.spec.ts` skips compact sidebar and the paid-operation test skips non-Chromium overflow proof). Serial mode is reserved for flows whose later test depends on session continuity.

## Deployed and provider smoke tests

- Deployment smoke files under `tests/deploy-smoke/` are Playwright tests but are not in the default `tests/e2e` directory. `package.json` selects them with dedicated configs/scripts such as `test:release:hosted`, `smoke:customer-request:production:human`, `test:provider-smoke:resend`, and `test:provider-smoke:novu`.
- `tests/deploy-smoke/phase1-deploy-smoke.spec.ts` reads required environment variables, constructs bypassed request contexts, checks public/private/admin status and headers, validates robots/sitemap/discovery output, verifies owner/admin boundaries, and disposes contexts in `finally`.
- Provider smoke files (`phase2-resend-dispatch-smoke.spec.ts`, `phase2-novu-dispatch-smoke.spec.ts`, and `phase6-business-action-stripe-smoke.spec.ts`) require explicit deployment/readback IDs and reject localhost/decorative proof or unredacted provider/payment material before making assertions.
- `tests/deploy-smoke/customer-request-human-lifecycle-smoke.spec.ts` is a long-timeout cold-browser test that runs and resumes the production Request lifecycle against labelled sandbox supply. Required env is validated early and expected business/finish values are parsed narrowly.

## CI and coverage signals

- `.github/workflows/kernel-release-gate.yml` runs on main pushes, pull requests, and manual dispatch. Its `source-proof` job installs with `npm ci` under Node 22 and runs `npm run test:release:source`; its hosted job, only on main pushes, deploys the exact triggering revision, deploys Convex, validates production configuration, seeds labelled acceptance supply, and runs `npm run test:release:hosted` with authenticated readback.
- `.github/workflows/react-doctor.yml` runs React Doctor on pull requests and main pushes. It is advisory by default: it posts a sticky summary/inline findings/status but does not fail the check. `doctor.config.ts` records reviewed false-positive suppressions and a warning-level supply-chain posture.
- There is no Vitest `coverage` provider, Istanbul/nyc configuration, or branch/line coverage threshold in `vitest.config.ts` or `package.json`. The repository's `test:eval:coverage` name refers to semantic answer-evaluation coverage: `eval/answer/scripts/audit-coverage.ts` checks required tags, assertions, case synchronization, and broad seed count, then exits 1 on issues.
- Evaluation reports include domain-specific quality signals rather than source-code coverage: case counts, failed cases, score thresholds, user outcomes, model calls, action counts, costs, persisted evidence class, timing percentiles, and engine protocol/refusal reasons. Reports are written to `output/eval/` and are consumed by tests such as `tests/eval/answer-pipeline.test.ts` and `tests/eval/engine-suite.test.ts`.

## Practical testing workflow

1. Start with the narrowest behavior test matching the changed seam: a unit/domain test for pure logic, an integration or Convex test for persistence/server boundaries, a UI contract or E2E test for visible behavior, or a focused eval case for model/evidence semantics.
2. Use deterministic ports, fake DBs, fixtures, and contract servers rather than live provider/network calls in ordinary Vitest runs.
3. Assert outcomes, refusal precedence, authority, persisted effects, redaction, recovery, and visible next actions. Avoid tests that freeze incidental implementation or marketing prose.
4. Restore every process env value, test seam, clock spy, mock server, browser context, and storage override in `afterEach`/`finally`.
5. Expand only across crossed boundaries using the named `package.json` scripts; reserve `test:release:hosted` and provider smoke commands for deployed evidence.

> Completion: testing-practice mapping written for the full repository on 2026-08-01; line count: 113.
