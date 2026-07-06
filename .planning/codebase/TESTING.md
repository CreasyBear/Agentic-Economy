# Testing Patterns

**Analysis Date:** 2026-07-06

## Test Framework

**Runner and configs**
- Vitest 4.1.9 is the default source-level runner. `vitest.config.ts` enables `tsconfigPaths`, uses the Node environment by default, and includes `tests/**/*.test.ts` plus `tests/**/*.test.tsx`.
- Playwright 1.61.1 owns browser E2E and accessibility checks. `playwright.config.ts` runs `tests/e2e` in two Chromium viewports: `compact-chromium` at `375x812` and `wide-chromium` at `1440x1100`.
- Deploy/provider smoke tests use `playwright.deploy-smoke.config.ts` instead of the local web-server config. They are serialized, keep traces on failure, and expect real deployed/provider inputs from the environment.
- TanStack route generation and Convex generated contracts are treated as build artifacts that must stay current with source changes.

**Assertion libraries**
- Vitest imports `describe`, `it` / `test`, `expect`, `expectTypeOf`, lifecycle hooks, and `vi` explicitly; globals are disabled.
- React component tests use React Testing Library and opt into jsdom per file with `/** @vitest-environment jsdom */` when the DOM is required.
- Playwright tests use role/label/test-id locators and browser assertions from `@playwright/test`.

## Commands

Commands below are declared in `package.json` in this checkout.

```bash
npm run typecheck                 # tsc --noEmit
npm run check:convex-codegen      # convex codegen --dry-run --typecheck=disable
npm test                          # vitest run over configured tests
npm run test:unit                 # vitest run tests/unit
npm run test:integration          # vitest run tests/integration
npm run test:types                # vitest run tests/types
npm run test:imports              # clean import/private/route boundary scans
npm run test:imports:fixtures     # negative fixtures for import scanners
npm run test:source-mining        # clean source-mining/future-surface scan
npm run test:source-mining:fixtures
npm run test:ts-standards         # clean TypeScript standards scan
npm run test:ts-standards:fixtures
npm run test:copy                 # clean public/assistant copy guardrails
npm run test:copy:fixtures
npm run test:seo                  # SEO/AEO/public metadata tests
npm run test:eval                 # eval coverage + report + promptfoo + tests/eval
npm run test:eval:coverage        # eval/answer coverage audit
npm run test:eval:report          # writes output/eval/answer-suite-report.json
npm run test:eval:validate        # promptfoo config validation plus eval coverage
npm run test:eval:live-api        # live API study, explicit opt-in command
npm run test:graph-freshness      # asserts .planning graph freshness
npm run test:e2e                  # Playwright tests/e2e
npm run test:e2e:a11y             # Playwright tests/e2e/a11y
npm run test:a11y                 # alias for the a11y Playwright suite
npm run test:deploy-smoke         # Phase 1 deployed readback smoke
npm run test:phase2-support-smoke # Phase 2 support-record deployed smoke
npm run test:provider-smoke:resend
npm run test:provider-smoke:novu
npm run test:provider-smoke:autumn-stripe
npm run test:provider-smoke:business-action-stripe
npm run test:provider-smoke:capability-check
npm run test:dev-smoke:wba-agent-door
npm run test:all                  # broad local gate: typecheck, Convex, Vitest guards, build
npm run test:release              # release gate: adds eval, graph, e2e, a11y, build
npm run build
```

**Known command drift**
- `.github/workflows/eval-gate.yml` runs `npm run test:ui-contract`, but `package.json` does not define `test:ui-contract` and `tests/ui-contract/` is absent in this checkout. That CI step is stale until the script or workflow is corrected.

## Test File Organization

```text
tests/
├── unit/                  # domain logic, route seams, Convex runtime shims, components
├── integration/           # route/server/domain integration without a browser
├── e2e/                   # browser flows; local dev server from Playwright config
│   └── a11y/              # accessibility-specific Playwright checks
├── deploy-smoke/          # deployed/provider proof harnesses; fail loud without inputs
├── imports/               # backup/private/route/source-mining/TS standard scans
├── copy/                  # public and assistant-visible copy guardrails
├── seo/                   # sitemap/robots/llms/JSON-LD/noindex tests
├── types/                 # runtime/schema/type contract tests
├── eval/                  # answer/eval Vitest layer
├── spike/                 # exploratory spike tests kept separate from gates
├── helpers/               # source-write, answer-thread, OpenRouter, route test helpers
└── fixtures/              # negative fixtures for scanner modes
```

Observed examples:
- Registry and search: `tests/unit/registry/search-documents.test.ts`, `tests/integration/registry-api.test.ts`.
- Convex runtime shims: `tests/unit/convex/registry-runtime.test.ts`, `tests/unit/convex/source-state.test.ts`, `tests/unit/convex/business-actions-runtime.test.ts`.
- Inquiry and owner flows: `tests/unit/inquiries/inquiry-flow.test.ts`, `tests/e2e/public-owner-ui.spec.ts`.
- Agent/answer surfaces: `tests/unit/answer-thread/*`, `tests/unit/answer/*`, `tests/e2e/chat-discovery-inquiry-loop.spec.ts`, `tests/eval/answer-pipeline.test.ts`.
- Security: `tests/unit/security/admin-authority.test.ts`, `tests/unit/server/bounded-request-body.test.ts`, `tests/unit/http/security-headers.test.ts`, `tests/imports/*`.
- Provider/deploy proof: `tests/deploy-smoke/phase2-resend-dispatch-smoke.spec.ts`, `tests/deploy-smoke/phase6-business-action-stripe-smoke.spec.ts`, `tests/deploy-smoke/scope2-capability-check-smoke.spec.ts`.

## Test Structure

**Preferred shape**
```ts
import { describe, expect, it } from 'vitest'

import {
  buildRegistrySearchDocumentsForCatalog,
  documentMatchesRegistryQuery,
} from '@/modules/registry/internal/search-documents'

describe('registry search documents', () => {
  it('keeps local location matching literal', () => {
    const [document] = buildRegistrySearchDocumentsForCatalog(catalog())
    if (document === undefined) {
      throw new Error('expected search document')
    }

    expect(documentMatchesRegistryQuery(document, { query: 'Emergency plumber Parramatta' })).toBe(true)
    expect(documentMatchesRegistryQuery(document, { query: 'Emergency plumber Brunswick' })).toBe(false)
  })
})
```

**Patterns**
- Name suites by behavior or route: `registry search documents`, `POST /api/agent/tools`, `source write admission`.
- Use realistic domain-shaped fixtures, with local factories near the bottom of the file when the setup is test-specific.
- Throw explicit `Error` for impossible fixture states before assertions. Do not let `undefined` flow into assertions.
- Route integration tests should call exported handler seams with real `Request` objects and assert `Response` status, headers, and JSON body.
- Component tests that need DOM opt into jsdom in that file only; keep pure domain tests in the default Node environment.
- Playwright should use roles, names, labels, and stable test ids over CSS selectors.

## Mocking and Test Ports

**Use mocks for boundaries**
- Mock network/DNS boundaries with injected dependencies or `vi.mock`, as in storefront import and capability-check tests.
- Stub environment with `vi.stubEnv` / `vi.unstubAllEnvs`, restoring values in `finally` when direct mutation is needed.
- Stub global `fetch` only when the test is about UI behavior rather than transport.
- Use explicit test ports such as `tests/helpers/answer-thread-test-port.ts` and `tests/helpers/openrouter-contract-server.ts` for agent/eval integration surfaces.

**Do not mock the contract under test**
- Do not mock domain state machines when validating their behavior.
- Do not mock route handlers in integration tests; call the exported handler/readback seam.
- Do not fake provider/deployed proof. Provider smoke tests must fail loudly without the real deployment URL, operation id, secret, or provider readback they require.
- Do not use public copy fixtures as truth. Guardrail tests scan real files in clean mode and use `tests/fixtures/bad-*` only to prove scanners catch violations.

## Guardrail Suites

**Import and source boundaries**
- `tests/imports/backup-imports.test.ts`: runtime source cannot import `.planning` or `Agentic-Economy-Backup`.
- `tests/imports/private-imports.test.ts`: routes and sibling modules cannot import module internals.
- `tests/imports/route-boundary.test.ts`: routes cannot own Convex transport/schema/provider SDK boundaries.
- `tests/imports/source-mining.test.ts`: future-surface/protocol symbols stay quarantined to source-owned phase seams.
- `tests/imports/ts-standards.test.ts`: bans explicit `any`, non-null assertions, broad status strings, `v.any()`, client-exposed source-write secrets, and other TypeScript shortcuts.

**Copy and public truth**
- `tests/copy/*` prevents unsupported booking/payment/dispatch/autonomy/readiness claims and internal vocabulary on public/assistant-visible surfaces.
- `tests/seo/*` keeps sitemap, robots, `llms.txt`, JSON-LD, and noindex behavior aligned with public truth boundaries.
- `tests/eval/*` plus `eval/answer/*` gates the answer pipeline; promptfoo runs with `PROMPTFOO_CONFIG_DIR=.promptfoo-home` and `PROMPTFOO_DISABLE_WAL_MODE=true`.

## Browser and Accessibility Testing

**Local E2E**
- `playwright.config.ts` starts `npm run dev -- --port 3020 --strictPort --host 127.0.0.1` and sets `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E=true` for local browser tests.
- The server-side bypass must go through `src/lib/server/local-e2e-bypass.ts`; production throws if the bypass flag is enabled.
- Compact and wide projects run the same suite to catch responsive regressions.

**Deploy/provider smoke**
- Deploy-smoke tests use `playwright.deploy-smoke.config.ts`; they do not start a local server.
- Smoke harnesses are meant to fail until concrete deployed/provider inputs are supplied. A skip is not proof.
- Phase 6 Stripe/business-action tests remain source/local or test-mode evidence unless a real deployed webhook/readback artifact is present.

**Accessibility expectations**
- A11y tests live under `tests/e2e/a11y` and should cover keyboard traversal, focus states, labels, error states, responsive overflow, and public/owner route semantics.
- For UI changes, pair source-level tests with at least one rendered compact/wide check when route layout or interaction state materially changes.

## Convex and Generated Artifacts

- Run `npm run check:convex-codegen` after Convex schema/function changes. It is a dry-run codegen check with typecheck disabled in this checkout.
- Read `convex/_generated/ai/guidelines.md` before editing Convex functions or schema.
- Keep `convex/schema.ts` as the composition root over module-owned schema fragments.
- Treat `src/routeTree.gen.ts` as generated by TanStack Router; route changes must include regenerated output and review should separate generated churn from hand edits.

## Coverage and Confidence Model

There is no global Vitest line/branch threshold in `vitest.config.ts`. Confidence is command-composed:
- Pure logic/domain changes: focused `vitest run <test-file>` plus the owning guardrail suite when boundaries/copy/types are touched.
- Convex/schema changes: focused Convex runtime tests plus `npm run check:convex-codegen` and `npm run test:types` when contracts change.
- Route/API changes: handler/integration tests with real `Request` objects plus Playwright only when browser behavior changes.
- Public copy/SEO changes: `npm run test:copy`, `npm run test:seo`, and fixture variants if scanner rules changed.
- Answer/eval changes: `npm run test:eval:coverage`, `npm run test:eval:report`, promptfoo validation/eval, and `tests/eval`.
- Release candidates: `npm run test:release`, with the current caveat that CI references missing `test:ui-contract` until fixed.

## Known Testing Risks

1. **CI workflow drift:** `.github/workflows/eval-gate.yml` references a missing `test:ui-contract` script.
2. **Provider proof is environment-bound:** provider smoke tests are useful only with real deployed inputs; local green tests do not prove production provider behavior.
3. **Convex performance is not load-tested:** broad source-state loaders have unit/runtime shims but no measured production-scale budgets.
4. **Graph freshness depends on refreshed artifacts:** `npm run test:graph-freshness` validates planning graph state; run `/gsd-graphify build` after significant codebase/planning refreshes.

---

*Testing analysis: 2026-07-06*
