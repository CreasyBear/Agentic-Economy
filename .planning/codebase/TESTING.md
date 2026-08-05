# TESTING.md

**Analysis Date:** 2026-08-05

Testing strategy and patterns for Agentic-Economy: framework, directory layout, the run-with-cleanup wrapper, value-based stubbing rules, static boundary gates, and the release gate. All commands run from the repo root.

<!-- refreshed: 2026-08-05 -->

## 1. Framework and configuration

- **Vitest 3** is the unit/integration runner, configured centrally in `vitest.config.ts`:
  - `environment: 'node'` (no happy-dom/jsdom by default; client tests add their own setup).
  - `include`: `tests/**/*.test.ts`, `tests/**/*.test.tsx`, and `convex/**/*.test.ts`.
  - `setupFiles`: `tests/setup/web-storage.ts`, `no-search-gap-writes.ts`, `resize-observer.ts`, `http-rate-limit.ts`.
  - `globals: false` — **always** `import { describe, expect, it, vi } from 'vitest'`; nothing is global.
  - `watch: false` (CI-oriented; no watch mode by default).
- **Playwright** for browser-level suites (`tests/e2e`, `tests/deploy-smoke`), configured via `playwright.config.ts` and per-scenario configs (`playwright.deploy-smoke.config.ts`, `playwright.paid-operation.config.ts`).
- **`convex-test`** (`convexTest` / `convexTestWithWorkers`) runs real in-memory Convex with worker components inside integration tests. `convex/_generated/api` and `convex/_generated/dataModel` supply types; `tests/helpers/convex-fixtures` provides `ownerAdmin`, `publishedBusinessOwner`, etc.

## 2. Directory layout

- `tests/unit/` — fast, pure, dependency-injected tests mirroring `src/modules/*` one subfolder at a time (`customer-request/`, `capability-supply/`, `capability-contract/`, `discovery/`, `routes/`, `catalog/`, `answer-thread/`, `action-invocation/`, `actions/`, `schema/`, `planning/`, `server/`, `release/`, …).
- `tests/integration/` — real-Convex end-to-end slices (`customer-request-v2-multi-capability-route.test.ts`, `customer-request-v2-application-path.test.ts`, `capability-supply-registration.test.ts`, `answer-*.test.ts`, `curated-provider-registry.test.ts`, `dev-seed-public-catalog-facts.test.ts`). Run with `--no-file-parallelism` and `--test-timeout=15000` because they share a workpool and Convex state.
- `tests/types/` — type-contract tests.
- `tests/imports/` — **static boundary-scan gates** (`*-boundaries.test.ts`, `ts-standards.test.ts`, `routing-authority-retirement.test.ts`, `kernel-retirement-manifest.test.ts`, `legacy-engine-retirement.test.ts`, `source-completeness.test.ts`). Run under `AE_SCAN_MODE=clean` (and `=fixtures` as a fixture-only variant). These fail on cross-layer imports and style drift by scanning source text.
- `tests/e2e/`, `tests/deploy-smoke/` — Playwright against the real app / a deployed target.
- `tests/seo/`, `tests/ui-contract/`, `tests/eval/` — SEO, UI-contract, and eval-suite tests.
- `tests/helpers/` — shared fixtures/factories: `curated-supply.ts`, `customer-request-lineage.ts`, `answer-turn-stream.ts`, `convex-fixtures`.
- `tests/setup/` — Vitest setup files (web-storage, resize-observer, http-rate-limit, no-search-gap-writes).
- `tests/fixtures/` — static fixtures (e.g. `capability-contract-v2.ts`) and `vendor/**` (lint-ignored).

## 3. Uniform test runner: `tools/dev/run-with-cleanup.mjs`

Every test command is wrapped by `tools/dev/run-with-cleanup.mjs` (see `package.json` scripts; the release gate uses the `test:release:*` variants). It does not change test semantics — it is a clean-up wrapper:

1. **Snapshot the process table before launching** (`-axo pid=,ppid=,command=`).
2. Run the command with `execFile`/`spawn`.
3. In `finally`, **terminate only test-owned headless browsers** (new Playwright/Puppeteer processes and their descendants) — it distinguishes test browsers via `--headless` + browser-executable markers and **protects** baseline processes and explicit interactive/Orca profiles. It clears only **transient project caches**, never Convex state, reports, build outputs, or global npm/OS caches.
4. Forward signal exit codes; the child exit code is the wrapper's exit code.

This is why `npm test` / `npm run test:unit` etc. are written as `node tools/dev/run-with-cleanup.mjs vitest run …`. Run tests through these scripts, not bare `vitest`, so stray browsers/caches don't leak across the shared worktree.

## 4. Value-based stubbing rules

The repo is deliberate about *what* gets mocked. Prefer passing real, in-memory values and injected dependencies; mock only the external/model seam.

- **Inject dependencies as parameters** rather than module-global mocks. `discoverAndFilterDescriptors(query, graph, discover)` takes the discovery function as an argument; tests pass `vi.fn<DiscoverCapabilities>()` implementations. This keeps unit tests pure and deterministic.
- **Stub the AI SDK's `fetch`, not logic.** Model calls (`generateText`/`streamText`) are reached through the global/`undici` `fetch` in `src`/`convex`. Stub that seam:
  ```ts
  // GOOD — fresh Response per call
  const fetchImpl = vi.fn().mockImplementation(async () => modelResponse({ ... }))
  // BAD — eagerly-built one-shot body
  const fetchImpl = vi.fn().mockResolvedValue(modelResponse({ ... }))
  ```
  A `Response` body is a one-shot stream; `mockResolvedValue(modelResponse({…}))` evaluates the body once and later reads throw `Body has already been read` when the SDK's `maxRetries > 0` re-fetches. Use `mockImplementation` to build a fresh `Response` lazily per invocation. This is the `customer_request_interpretation_provider_invalid` / `unknown_finish_reason` root cause class (see skill `ai-sdk-fetch-stub-one-shot-response`).
- **`vi.mock('ai')` only where a package seam must be replaced** — spread the original (`...await importOriginal()`) then override the surface (see `tests/unit/answer/answer-tool-use-agent.test.ts`, `tests/unit/chat/follow-up-chips.test.ts`). Never mock deterministic core logic.
- **`vi.stubGlobal('fetch', …)` + `vi.unstubAllGlobals()`** for host-integration tests (Vercel/readback, `tests/unit/release/*`); pair with `afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })`.
- **Assert on values, not plumbing.** Prefer `expect(proposal).toMatchObject({ kind: 'capability_candidates', selections: [...] })`, refusal `reason`s, `rejects.toThrow('hosted_release_revision_mismatch')`, and `fetchImpl.mock.calls` request/URL/header/body shapes. `vi.hoisted` keeps `vi.fn` refs available to `vi.mock` factories (see `tests/integration/customer-request-v2-multi-capability-route.test.ts`).

## 5. What tests must defend

- **Observable contracts**: discriminated `kind` outcomes, refusal reasons, boundary behavior, ordering, provenance tri-state, idempotent guards.
- **Negative cases included**: unauthorized/refused (`wrong user refused`, `scope_required`, `401`), discovery `no_candidates`/`unavailable`, empty-state and degenerate inputs, unreachable-`needs_information` granularity.
- **An AI-capability engine must stay honest**: zero fabrication / zero data-leak / zero hostile responses are the baseline; capability-eligible-but-unresolved is a *usefulness* defect, root-caused (discovery vs model-selection vs readiness) rather than papered over.

## 6. Static gates and quality checks

Run these before relying on a change:

- **`npm run typecheck`** — `tsc --noEmit` (strict config in `tsconfig.json`).
- **`npm run lint`** — `oxlint src convex tests tools --deny-warnings`, config `.oxlintrc.json` (`correctness: error`, `suspicious: off`, TypeScript + oxc plugins, ignores `convex/_generated/**`, `tests/fixtures/**`, `vendor/**`).
- **`npm run check:convex-codegen`** — `convex codegen --dry-run --typecheck=disable`; the release gate runs codegen before source tests so generated `convex/_generated` stays current.
- **`npm run check:kernel-retirement`** — verifies the deterministic kernel's legacy surface has been retired (no dangling legacy engine).

## 7. Release gate and coverage

- **`npm run gate:release`** = `npm run test:release:source`, the full gate:
  `check:convex-codegen` → `lint` → `typecheck` → `check:kernel-retirement` → `test:release:unit` → `test:release:integration` → `test:types` → `test:imports` → `test:ts-standards` → `test:seo` → `test:ui-contract` → `test:eval:report` → `build`. `test:release:hosted` adds production readback + credential/human smoke tests.
- **JSON report output**: release unit/integration runs emit `--reporter=json --outputFile.json=output/release/{unit,integration}-vitest.json`.
- **Coverage / eval**: `npm run test:eval:coverage` (audit-coverage) and `npm run test:eval:report` (answer-suite report) drive the eval-suite; `npm run test:eval` runs `promptfoo eval` plus `vitest run tests/eval`. The engine's measurement contract (workflows × MUST cells: resolves-real-capability / correct-inputs / no-false-positive / no-fabrication / ambiguous-needs_information / latency / determinism) lives with the eval harness.
- **Focused iteration**: `npm run test:unit`, `npm run test:integration`, `npm test`, and per-suite scripts (`test:imports`, `test:types`, `test:seo`, `test:ui-contract`, `test:e2e`) let you iterate without the whole gate.

Keep tests deterministic, isolated, and full-suite-safe: integration tests are serialized (`--no-file-parallelism`) because they share Convex/workpool state; unit tests are pure and side-effect free.
