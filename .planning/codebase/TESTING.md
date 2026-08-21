# Testing Patterns — Agentic-Economy

**Analysis Date:** 2026-08-21
**Scope:** Full repository, current working tree (large uncommitted refactor included: `eval/answer` harness split into `lib/eval-*.ts`, module splits under `convex/`, deleted inquiry/work-tree families)
**Sources of truth:** `package.json` scripts, `vitest.config.ts`, `playwright*.config.ts` (three configs), `tests/` tree, `convex/*.test.ts`, `eval/`, `convex/_generated/ai/guidelines.md`, `.planning/ENGINEERING-STANDARDS.md`.

<!-- refreshed: 2026-08-21 -->

---

## 1. Test Frameworks and Tooling

| Framework | Version/Config | Purpose |
| --- | --- | --- |
| **Vitest 4** | `vitest.config.ts` | Unit, integration, Convex, boundary, SEO, type, eval-support, release-contract tests |
| **convex-test** | via `tests/helpers/convex-fixtures.ts` | In-memory Convex backend (`MemoryDb`) for schema/functions |
| **Playwright** | `playwright.config.ts`, `playwright.deploy-smoke.config.ts`, `playwright.paid-operation.config.ts` | E2E, deploy smoke, paid-operation development-surface exclusion |
| **Promptfoo** | `eval/answer/promptfooconfig.yaml` (env `PROMPTFOO_CONFIG_DIR=.promptfoo-home`, `PROMPTFOO_DISABLE_WAL_MODE=true`) | Answer-quality eval suites |
| **Braintrust** | `eval/braintrust/answer.eval.ts` (`test:eval:braintrust:local` / `--remote`) | Answer eval runs against Braintrust |
| `@testing-library/react` + `jsdom` | per-file `// @vitest-environment jsdom` pragma | Component tests (`*.test.tsx`) |
| `expectTypeOf` (Vitest) | `tests/types/` | Compile-time contract tests (`test:types`) |
| Oxlint | `.oxlintrc.json` with `--deny-warnings` | Lint gate inside release chain (not a test framework, but part of the gate) |

### 1.1 Vitest Configuration (`vitest.config.ts`)

- `environment: 'node'` default; `globals: false` (explicit imports of `describe`/`it`/`expect` from `'vitest'` in every file); `watch: false`.
- `include`: `tests/**/*.test.ts`, `tests/**/*.test.tsx`, `convex/**/*.test.ts`.
- `setupFiles`: `tests/setup/web-storage.ts`, `tests/setup/jsdom-platform.ts` (plus `tests/setup/jsdom-dialog.ts`, `tests/setup/resize-observer.ts`, `tests/setup/http-rate-limit.ts` for specific surfaces).
- `tsconfigPaths: true` with the `@` alias so tests import via `@/` like source.

### 1.2 Run Commands (all wrapped by `tools/dev/run-with-cleanup.mjs`; `tools/dev/run-listed-vitest.mjs` for enumerated boundary files)

| Script | What it runs |
| --- | --- |
| `npm run test` | Whole Vitest suite |
| `test:unit` / `test:integration` | `tests/unit` / `tests/integration` + `convex` (integration runs `--no-file-parallelism`, 15s timeout in release mode) |
| `test:types` | `tests/types` (`expectTypeOf` contracts) |
| `test:imports` | 10 enumerated boundary files via `run-listed-vitest.mjs` with `AE_SCAN_MODE=clean` |
| `test:imports:fixtures` | Fixture mode (`AE_SCAN_MODE=fixtures`) for the three scanner suites with violation fixtures |
| `test:ts-standards` (+ `:fixtures`) | `tests/imports/ts-standards.test.ts` in clean/fixture mode |
| `test:seo` / `test:ui-contract` | `tests/seo` / `tests/ui-contract` |
| `test:eval` | coverage audit → suite report → promptfoo eval → `vitest run tests/eval` |
| `test:eval:coverage` / `test:eval:report` / `test:eval:validate` | `eval/answer/scripts/audit-coverage.ts`, `run-suite.ts`, promptfoo validate |
| `test:quality:gate` (+ `:live`) | `eval/quality/gate.ts` judge/gate |
| `test:e2e` / `test:e2e:a11y` / `test:e2e:paid-operation` | Playwright suites |
| `test:conformance` | Enumerated durable action-invocation + paid-operation slice |
| `test:release` → `test:release:source` → `test:release:source:after-codegen` | Full source release contract: deployment-manifest verify → conformance → convex codegen → lint → typecheck → release unit/integration → types → imports → ts-standards → seo → ui-contract → eval report → build |
| `test:release:live-gateway` → `smoke:gateway:production` | Opt-in paid production smoke (never part of `test:release`) |
| `smoke:deploy` family | Deploy smoke via `playwright.deploy-smoke.config.ts` |

The release contract itself is asserted by `tests/unit/release/green-release-baseline.test.ts`, which parses `package.json` and `.github/workflows/kernel-release-gate.yml` and requires every sub-gate (including `test:eval:report` and `build`) to appear in the `gate:release` chain, keeps PRs credential-free, and keeps the paid gateway smoke opt-in (`workflow_dispatch` + `inputs.confirm_live_gateway_spend` + `production` environment).

---

## 2. Test File Organization

```
tests/
  unit/            # Vitest units, grouped by domain: answer/, answer-thread/, money/,
                   # capability-supply/, convex/, routes/, server/, ui/ (*.tsx), release/, ...
    convex/        # Convex function tests using convex-test helpers (43 *.test.ts files incl. convex/*.test.ts)
  integration/     # Cross-module flows (capability publication, supplier money readback, admin runtime)
  imports/         # Architecture/boundary scanners (14 files incl. scan-targets.ts)
  types/           # expectTypeOf contract tests
  seo/             # Canonical URL + discovery files
  ui-contract/     # UI token/contract scans
  eval/            # Vitest tests over eval harness invariants + tests/eval/support/
  e2e/             # Playwright specs (incl. e2e/a11y/)
  deploy-smoke/    # Playwright deploy smoke specs
  scripts/         # Tests over tools (assert-graph-fresh)
  helpers/         # Shared harness code (convex-fixtures.ts, http.ts, source-files.ts, ...)
  fixtures/        # Static fixtures incl. violation fixtures (bad-imports/, bad-ts-standards/, bad-ui-contract/)
  setup/           # Vitest setup files (web-storage, jsdom-platform, jsdom-dialog, resize-observer, http-rate-limit)
convex/*.test.ts   # Convex tests colocated with functions (agentAccessOAuth.test.ts,
                   # agentAccessPolicy.test.ts, externalRuns.test.ts) — picked up by the same Vitest config
eval/              # Non-Vitest eval harness: answer/ (lib/eval-*.ts, scripts/, promptfooconfig.yaml),
                   # braintrust/, toolcall/, quality/, product-foundry/
```

Naming: Vitest files end `.test.ts` / `.test.tsx`; Playwright files end `.spec.ts`. Non-test harness modules drop the suffix (`tests/integration/capability-publication-harness.ts`, `tests/unit/capability-supply/route-transport-test-harness.ts`, `tests/unit/action-invocation/dynamic-published-operation-harness.ts`).

---

## 3. Test Structure Patterns

- One `describe` per unit under test with lowercase descriptive names: `'graph freshness gate'` (`tests/eval/graph-freshness.test.ts`), `'project record-keeping system'` (`tests/unit/planning/project-records.test.ts`), `'AE Product Foundry and Primitive Refinery'` (`tests/eval/product-foundry.test.ts`), `'green release baseline'` (`tests/unit/release/green-release-baseline.test.ts`).
- Explicit imports: `import { describe, expect, it } from 'vitest'` (globals off).
- Factory helpers build state (`snapshot` in `tests/unit/answer/answer-gate.test.ts`; `ownerAdmin` / `publishedBusinessOwner` in `tests/helpers/convex-fixtures.ts`).
- **Narrowing after discriminated failures:** `if (result.ok) throw new Error('expected refusal')` before asserting `result.code` — the standard idiom for named-refusal results (e.g. `tests/unit/answer/answer-gate.test.ts`).
- Money assertions compare `ExactAmount` values, never raw floats; fail-closed paths assert the exact refusal code and `retryable` flag.
- Component tests use `@testing-library/react` with role-based queries; E2E uses Playwright `getByRole` locators; a11y specs live in `tests/e2e/a11y/`.
- Public-language assertions (`assertPublicLanguage`) guard user-facing copy in UI tests.
- Release/manifest tests read repo files directly (`readFileSync` + `yaml.parse` in `tests/unit/release/green-release-baseline.test.ts`) — config-as-contract testing.
- Determinism: no wall-clock sleeps; time and secrets injected via `vi.stubEnv` / factory args.

---

## 4. Mocking and Test Doubles

- **Vitest `vi` utilities:** `vi.stubEnv` for env (e.g. `convex/agentAccessPolicy.test.ts`), `vi.fn()` for sinks; restore in `afterEach`.
- **convex-test with components:** `tests/helpers/convex-fixtures.ts` provides `convexTestWithWorkers`, registering the workpool and rate-limiter components, plus identity helpers; tests use `import.meta.glob` over `convex/**/*.*` and `makeFunctionReference` for internal refs; `afterEach` cleanup is mandatory.
- **Port-injected HTTP doubles:** `tests/helpers/openrouter-contract-server.ts` spins an in-process contract server for answer-provider calls; `tests/helpers/answer-thread-test-port.ts` injects ports instead of global mocks.
- **Source-write admission:** `tests/helpers/source-write-admission.ts` + `requireSourceWrite` mocks; local secret provisioning covered by `tests/unit/dev/local-source-write-secret.test.ts`.
- **Live money providers:** never contacted in tests — Stripe/live paths are refused or stubbed behind the live-money gate; `tests/helpers/x402-payment-attempt.ts` fabricates x402 attempt records.
- **Scanner fixture mode:** `AE_SCAN_MODE=fixtures` makes `tests/imports/*` and `tests/ui-contract` scan violation fixtures (`tests/fixtures/bad-imports/*.fixture`, `tests/fixtures/bad-ts-standards/unsafe.fixture`, `tests/fixtures/bad-ui-contract/route-styles.fixture`) instead of the real tree; `AE_SCAN_MODE=clean` scans the repo (used by `test:imports`, `test:ts-standards`, `test:ui-contract`).

---

## 5. Fixtures and Factories

- `tests/fixtures/source-state.ts` — canonical source-state fixture for discovery/storefront tests.
- `tests/fixtures/discovery-published-state.ts`, `tests/fixtures/capability-contract-v2.ts` — domain-shaped fixtures.
- `tests/helpers/` factories: `convex-fixtures.ts` (Convex seeding), `local-e2e-business-fixtures.ts`, `registry-local-e2e.ts`, `curated-supply.ts`, `keyless-seed-source.ts`, `owner-default-claim.ts`, `durable-write-fixture-action.ts`, `discovery-fixture-*`.
- Eval case catalogs are data modules, not fixtures: `eval/answer/lib/cases.ts`, `eval/answer/lib/eval-thread-cases.ts`, `eval/answer/lib/eval-turn-cases.ts`, `eval/answer/lib/eval-harness-cases.ts`, `eval/answer/lib/eval-expectations.ts`, `eval/toolcall/cases.ts`, `eval/quality/cases/goldenCases.ts`.

---

## 6. Coverage

- **No Vitest line-coverage gate.** Coverage is enforced semantically:
  - **Answer eval coverage gate:** `npm run test:eval:coverage` runs `eval/answer/scripts/audit-coverage.ts`; case tags must cover required capability/intent tags, and the suite report (`test:eval:report` → `eval/answer/scripts/run-suite.ts`) must clear the scoring bar in `eval/answer/lib/scoring.ts`. `tests/eval/answer-pipeline.test.ts` pins harness invariants.
  - **Quality judge gate:** `eval/quality/gate.ts` + `eval/quality/judge.ts` + `eval/quality/scoring.ts` (golden cases in `eval/quality/cases/goldenCases.ts`), run via `test:quality:gate`.
  - **Manifest freshness:** `tests/eval/graph-freshness.test.ts` + `tests/scripts/assert-graph-fresh.test.ts` keep product-frontier/kernel-retirement manifests fresh; deployment manifest verified in the release chain (`verify:deployment-manifest`).
  - **UI contract + TS standards scans** act as structural coverage of conventions (see `tests/imports/ts-standards.test.ts`, `tests/ui-contract/`).

---

## 7. Test Types Inventory

1. **Unit** (`tests/unit/**`) — pure functions and module seams; includes `tests/unit/release/green-release-baseline.test.ts` (release contract) and thinness audits (`tests/unit/capability-supply/operation-ledger-thinness.test.ts`, `supply-writers-thinness.test.ts`, `graph-probe-thinness.test.ts`).
2. **Convex runtime** (`convex/*.test.ts` + `tests/unit/convex/**`) — schema, authz, ledger math, worker leases/recovery, pagination, seeded dev store.
3. **Integration** (`tests/integration/**`) — publication lifecycle, supplier money readback (incl. refund recovery, failed payout), admin runtime, dev-seed public catalog facts; harness modules shared with unit tests.
4. **Boundary/architecture** (`tests/imports/**`) — route boundaries, private imports, capability-contract boundaries (three variants), action-invocation host boundaries, capability-supply boundaries, backup imports, paid-operation development-surface exclusion, development-evidence boundary, operation-surface conformance, deployment-manifest boundaries, faux runtime surfaces.
5. **Type contracts** (`tests/types/**`) — `expectTypeOf` compile-time assertions.
6. **SEO** (`tests/seo/**`) — canonical base URL, discovery files; plus `tests/unit/seo-json-ld.test.ts`.
7. **UI contract** (`tests/ui-contract/**`) — token/style scans in clean or fixture mode.
8. **E2E** (`tests/e2e/**`, `playwright.config.ts`) — owner/public UI journeys, a11y specs, code-block hit targets, local auth boundary.
9. **Paid-operation E2E** (`playwright.paid-operation.config.ts`) — asserts the paid-operation development surface stays excluded from public surfaces.
10. **Deploy smoke** (`tests/deploy-smoke/**`, `playwright.deploy-smoke.config.ts`) — post-deploy probes (phase1/phase2), including 404 assertions for retired inquiry routes; selection logic covered by `tests/unit/deploy-smoke/answer-runtime-production-smoke-selection.test.ts`.
11. **Eval** (`eval/**` + `tests/eval/**`) — promptfoo answer suite, Braintrust runs, product-foundry portfolio (`eval/product-foundry/`), toolcall suite (`eval/toolcall/`), ADR009 transfer-comparison support (`tests/eval/support/`).
12. **Conformance slice** (`test:conformance`) — enumerated durable action-invocation + paid-operation + operation-invoke admission files.

### Known-red pins (intentional, do not "fix")

- `convex/authz.ts` `readActiveAdminMembership` returns `undefined` → admin authority denied (`tests/unit/convex/authz.test.ts`).
- `convex/moneyConnect.ts` reserve/finalize always refuse with `connect_account_unlisted` (Connect ledger tests pin the refusal).
- Live money gate open state is pinned by `tests/unit/money/*` refusing live paths.

### Post-cut deletion assertions

Deleted families are asserted absent: `tests/unit/actions/registry.test.ts` and `tests/unit/study-actions.test.ts` expect `inquiry.*`, `study.*`, `customerRequest.confirm`, `workTree.*` to be `undefined` in the action registry; `tests/e2e/public-owner-ui.spec.ts` and `tests/deploy-smoke/phase2-support-record-smoke.spec.ts` assert retired inquiry routes return 404.

---

## 8. Secrets and Environment in Tests

- `.env.example` exists at repo root (existence only — never read `.env*` contents); tests never load real secrets.
- OpenRouter contract tests use the in-process server from `tests/helpers/openrouter-contract-server.ts` with `installEnv()`-style injection — no network.
- `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E` gates Clerk-free local E2E (`tests/e2e/local-auth-boundary.spec.ts`, helpers in `tests/helpers/local-e2e-business-fixtures.ts`).
- Promptfoo runs are sandboxed via `PROMPTFOO_CONFIG_DIR=.promptfoo-home PROMPTFOO_DISABLE_WAL_MODE=true`.
- Release workflow assertions forbid `CONVEX_DEPLOY_KEY` / `secrets.*` in the PR-facing job and forbid credential-looking artifact paths (`tests/unit/release/green-release-baseline.test.ts`).
- CI evidence artifacts are asserted sanitized (`sanitized: true`, no `.env`/credential regex matches in artifact names/paths).

---

## 9. Adding New Tests (checklist)

1. Place the file in the matching `tests/<tier>/<domain>/` directory (or colocate in `convex/*.test.ts` for Convex functions); name it `*.test.ts(x)` (Vitest) or `*.spec.ts` (Playwright).
2. Import `describe`/`it`/`expect` explicitly; one `describe` per unit; factories over shared mutable state.
3. For Convex tests: use `convexTestWithWorkers` + identity helpers from `tests/helpers/convex-fixtures.ts`, `import.meta.glob`, and `afterEach` cleanup.
4. For refusal paths: narrow with `if (result.ok) throw ...`, then assert the exact `code` and `retryable`.
5. New architecture rule? Add a scanner + fixture pair (`tests/imports/` + `tests/fixtures/bad-*/`), register the file in `test:imports` list, and keep `AE_SCAN_MODE` semantics.
6. New answer capability? Add tagged eval cases in `eval/answer/lib/` and confirm `test:eval:coverage` passes.
7. Never contact live money/provider endpoints; use contract servers and gates.
8. Log frictions via `npm run papercut -- -m <model> "..."`.

---

*Testing analysis: 2026-08-21*
