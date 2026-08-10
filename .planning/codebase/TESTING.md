# Testing Patterns

**Analysis Date:** 2026-08-09

## Test Framework

- Vitest `4.1.9` is the default unit/integration/contract runner (`package.json`, `vitest.config.ts`); the Node environment, no globals, and no watch mode are explicit.
- `vitest.config.ts` includes `tests/**/*.test.ts`, `tests/**/*.test.tsx`, and `convex/**/*.test.ts`, and installs `tests/setup/web-storage.ts`, `no-search-gap-writes.ts`, `resize-observer.ts`, and `http-rate-limit.ts` for every file.
- React tests opt into jsdom per file with `@vitest-environment jsdom` and use React Testing Library (`tests/unit/chat/home-landing-submit.test.tsx`, `tests/unit/action-invocation/paid-operation-card.test.tsx`).
- Convex behavior uses `convex-test` `0.0.54` with the real `convex/schema` and module graph; Playwright `1.61.1` owns browser and deployment smoke suites (`tests/helpers/convex-fixtures.ts`, `playwright*.config.ts`).

## Run Commands

- `npm test` runs all Vitest-discovered tests through `tools/dev/run-with-cleanup.mjs`; `npm run test:unit` and `npm run test:integration` select the unit or integration/Convex route sets.
- Contract suites have exact scripts: `npm run test:types`, `npm run test:imports`, `npm run test:imports:fixtures`, `npm run test:ts-standards`, `npm run test:ts-standards:fixtures`, `npm run test:seo`, and `npm run test:ui-contract`.
- Answer evaluation commands are `npm run test:eval:coverage`, `npm run test:eval:report`, `npm run test:eval:validate`, and the composed `npm run test:eval`.
- Local browser commands are `npm run test:e2e`, `npm run test:e2e:a11y`, and `npm run test:e2e:paid-operation`; provider browser smoke commands are `npm run test:provider-smoke:resend` and `npm run test:provider-smoke:novu`.
- Release source gates are `npm run test:release:unit`, `npm run test:release:integration`, and `npm run test:release:source`; `npm run test:release` adds hosted request/gateway smoke.
- `npm run test:all` composes typecheck, Convex codegen, unit/integration, contract suites, and build. These scripts are supported commands; no percentage coverage command is declared.

## Test File Organization

- `tests/unit/` covers deterministic domain, answer/tool, money, capability execution, route, server, CLI, and jsdom component behavior. Tests use `.test.ts`/`.test.tsx`.
- `tests/integration/` drives route handlers, source ports, answer streams, admission/publication, auth/rate limits, and projection readback; `convex/*.test.ts` covers schema-backed Convex behavior.
- `tests/imports/`, `tests/types/`, `tests/seo/`, and `tests/ui-contract/` are static/type/SEO/UI contract gates. Fixture-only negative inputs live under `tests/fixtures/bad-*`.
- `tests/eval/` runs answer cases; `eval/answer/` owns coverage/report/Promptfoo data. `tests/e2e/` owns local browser journeys, `tests/e2e/a11y/` accessibility journeys, and `tests/deploy-smoke/` hosted/deployment evidence.
- Shared infrastructure is under `tests/helpers/`; global setup is under `tests/setup/`. Release tests and repository/evidence script tests have their own `tests/unit/release/` and `tests/scripts/` locations.

## Test Structure

- Vitest suites use `describe`/`it`/`expect`, with names describing observable behavior, including refusal, replay, conflict, or unsafe cases.
- Unit tests assert pure output, exact literal/state transitions, hashes, refusal codes, and injected-port calls (`tests/unit/money/pricing-config.test.ts`, `tests/unit/answer/answer-selected-operation-loop.test.ts`).
- Route integration tests construct real `Request` objects, call exported handlers, inspect status/problem headers/body, and consume UI streams through `tests/helpers/answer-turn-stream.ts`.
- Answer stream tests assert SDK-owned SSE content type, contiguous sequence numbers, terminal events, durable turn persistence, stop/replay, and sanitized error frames (`tests/integration/answer-turn-ui-stream.test.ts`).
- Convex tests call `convexTest(schema, modules)`, seed through `backend.run`, invoke generated public/internal functions, use `withIdentity`, and compare readback before/after idempotent transitions (`tests/helpers/convex-fixtures.ts`, `tests/integration/capability-publication.test.ts`).
- UI tests render components, interact by accessible role/label or `fireEvent`/`act`, and assert visible copy, focus, links, callbacks, and lifecycle cleanup.
- Playwright uses role/name locators and public URL/copy assertions; serial mode is explicit for stateful discovery/inquiry loops, while the default projects run compact and wide Chromium viewports (`playwright.config.ts`).

## Mocking

- Vitest module mocks use `vi.mock`; `vi.hoisted` prepares values needed by mock factories. Suites reset mocks/env/ports in `afterEach`/`finally`.
- Prefer injected seams over replacing domain modules: answer persistence uses `setAnswerThreadPortForTests`, routes accept admission/stream/auth overrides, and Convex tests use an in-memory backend.
- Model tests use `tests/helpers/openrouter-contract-server.ts`, which records request shape and returns scripted safety/tool/prose responses; direct AI SDK mocks are used only for narrower client/model behavior.
- Provider egress, DNS, HTTP rate admission, global fetch, browser APIs, and search-gap recording are stubbed at explicit seams. `tests/setup/no-search-gap-writes.ts` prevents accidental writes to a configured deployment.
- Mocked model HTTP responses must create a fresh `Response` per call because bodies are one-shot; helpers or `mockImplementation` are preferred over reusing a consumed response.

## Fixtures and Factories

- `tests/helpers/convex-fixtures.ts` creates schema-backed backends, registers workpool/rate-limiter components, creates identities, and prepares canonical publication material.
- `tests/helpers/answer-thread-test-port.ts` provides an in-memory store for threads, turns, reservations, checkpoints, generations, shares, persistence, and injected failures.
- `tests/helpers/openrouter-contract-server.ts` routes by request shape rather than call order, allowing multi-turn tool/prose scenarios without a real provider.
- Typed local browser expectations live in `tests/helpers/local-e2e-business-fixtures.ts`; registry and inquiry doubles are installed explicitly by `tests/helpers/registry-local-e2e.ts`, outside deployable source.
- Small unit factories provide complete defaults with `Partial<...>` overrides; IDs, timestamps, hashes, and identities are deterministic unless randomness is the behavior under test.
- Fixtures, retained captures, mocks, and local adapters are not hosted evidence. Deployment smoke selects runtime catalog subjects and checks public/readback behavior rather than trusting fixture slugs.

## Coverage

- No Vitest coverage instrumentation, threshold, or reporter script is configured. The observed policy is behavior/contract coverage, not a universal percentage claim.
- `npm run test:eval:coverage` audits shared answer case IDs/tags, required case classes, Promptfoo synchronization, and seeded-business breadth; `test:eval:report` writes the answer-suite report.
- `tests/eval/answer-pipeline.test.ts` checks answer outcomes, artifacts, timing, tool/model/provider usage, and report invariants. Static gates cover boundaries that ordinary unit tests cannot.

## Test Types

- **Unit/pure:** deterministic reducers, validators, projections, exact money, operation execution, answer selection, and CLI/error helpers under `tests/unit/`.
- **Integration/route:** direct HTTP handlers, RFC 9457 problems, SSE framing, durable answer state, capability publication, provider ports, auth, and rate limits under `tests/integration/`.
- **Convex integration:** schema-backed queries/mutations/actions and identity/worker/component behavior in `convex/*.test.ts` and selected integration suites.
- **Import/type/standards:** `tests/imports/` scans clean runtime or fixture targets; `tests/types/` checks type/value parity; `AE_SCAN_MODE=clean` is production-source mode and `fixtures` is negative-fixture mode.
- **UI/SEO:** jsdom interaction/lifecycle tests plus `tests/ui-contract/` semantic-token scans and `tests/seo/` public/discovery projection contracts.
- **Evaluation:** data-driven answer cases and Promptfoo/quality artifacts under `tests/eval/` and `eval/answer/`.
- **E2E/deploy smoke:** local Vite/TanStack browser journeys versus separately configured hosted page/API/readback and provider lifecycle evidence.

## Common Patterns

- Every test restores environment variables, injected ports, mocks, and local servers in `finally`/`afterEach`; streaming helpers close readers and contract servers.
- Assertions favor exact public contracts plus negative checks: stable problem kind/code, no private vocabulary, no unsafe effect claim, no unexpected fetch, no duplicate sequence, and no fixture-as-hosted-proof.
- `tools/dev/run-with-cleanup.mjs` wraps most scripts, records a process baseline, removes transient caches, forwards signals, and terminates only newly detected test-owned headless browser trees while preserving protected interactive profiles.
- `playwright.config.ts` starts Vite on `127.0.0.1:3020` with local auth bypass when no `PLAYWRIGHT_BASE_URL` is supplied; paid-operation uses a separate Vite port/config, and deploy smoke has its own 45-second config.

*Testing analysis: 2026-08-09*

Updated from `package.json`, test configs, helpers, fixtures, representative tests, and cleanup wrapper in the current repository on 2026-08-09.
