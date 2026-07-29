---
last_mapped_commit: b1b105b1e07a46f637f4dcfb33537eaf4dca6bc0
last_mapped_at: 2026-07-29
last_mapped_tree: e6a09cd838ecd86ccb4b6693b5d25a58fc85bddf
worktree_dirty_files: 189
---

# Technology Stack

**Analysis Date:** 2026-07-29

## Languages

**Primary:**
- TypeScript 6.0.3 is the application language for `src/`, `convex/`, `tests/`, and the TypeScript tools under `tools/`.
- TSX with React 19.2.7 renders routes and components under `src/routes/` and `src/components/`.

**Secondary:**
- JavaScript ESM (`.mjs`) is used by release verification and example tooling such as `tools/release/verify-kernel-proof-manifest.mjs` and `tools/release/verify-kernel-retirement.mjs`.
- CSS is compiled through Tailwind CSS 4.3.1 and the Astryx neutral token layer in `src/styles/globals.css`.
- YAML and JSON/JSONC hold evaluation and deployment configuration, including `eval/answer/promptfooconfig.yaml` and `examples/routing-edge/wrangler.jsonc`.

## Runtime

**Environment:**
- Node.js 22 is the CI development/release runtime pinned by `.github/workflows/kernel-release-gate.yml`; the root package has no `engines.node` field.
- The primary TanStack Start application is packaged for Vercel Node serverless with `nodejs20.x` in `vite.config.ts`.
- Convex supplies the backend function and document runtime under `convex/`; Node-dependent Convex actions use a file-level `"use node"` directive, as in `convex/capabilitySupplyReadiness.ts`.
- Cloudflare Workers are used by the example routing edge and agent directory configured under `examples/routing-edge/` and `examples/routing-agent-directory/`.
- The conformance provider example declares Node 22 in `examples/routing-provider/package.json`.

**Package Manager:**
- npm 11.5.1 is declared by `package.json` and installed by the release workflow.
- Lockfile: `package-lock.json` is present and uses lockfile version 3.

## Frameworks

**Core:**
- TanStack Start 1.168.26 and TanStack Router 1.170.16 provide full-stack React routing and server handlers; middleware composition is in `src/start.ts`.
- React and React DOM 19.2.7 provide the UI runtime.
- Vite 8.1.0, Nitro nightly 3.0.1, `@vitejs/plugin-react`, and `@tailwindcss/vite` form the build and dev pipeline in `vite.config.ts`.
- Convex 1.42.0 provides database functions, HTTP/backend functions, schema composition, and scheduled work in `convex/`.
- `@astryxdesign/core` and `@astryxdesign/theme-neutral` provide the active UI primitives and theme; shared visual values live in `src/styles/globals.css`.

**Testing:**
- Vitest 4.1.9 is configured by `vitest.config.ts` for tests under `tests/**/*.test.ts`, `tests/**/*.test.tsx`, and `convex/**/*.test.ts`.
- Playwright 1.61.1 covers browser, deploy-smoke, accessibility, and paid-operation development surfaces through `playwright.config.ts`, `playwright.deploy-smoke.config.ts`, and `playwright.paid-operation.config.ts`.
- `convex-test` supplies in-process Convex tests.
- Promptfoo 0.121.17 runs the answer evaluation configuration in `eval/answer/promptfooconfig.yaml`.

**Build/Dev:**
- TypeScript runs in strict, no-emit mode with `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, and `moduleResolution: Bundler` in `tsconfig.json`; Convex has a separate strict configuration in `convex/tsconfig.json`.
- `oxlint`, configured by `.oxlintrc.json`, lints `src`, `convex`, `tests`, `tools`, and `examples`.
- `tsx` runs TypeScript CLI, smoke, and evidence tools.
- `wrangler` type-checks and dry-runs the Cloudflare routing example.
- `react-doctor`, configured by `doctor.config.ts`, is an additional health check.

## Key Dependencies

**Critical:**
- `convex` 1.42.0 and `convex/browser` provide the source transport in `src/lib/server/convex-source.ts` and backend functions in `convex/`.
- `@clerk/tanstack-react-start` 1.4.9 supplies middleware and session/API-key identity integration.
- `zod` 4.4.3 validates action, API, provider, and environment-derived contracts.
- `@tanstack/ai` 0.38.0 supports action/tool schema projection.
- `@x402/core`, `@x402/evm`, `@x402/extensions` 2.18.0, and `viem` 2.55.2 implement the bounded EVM x402 signature adapter in `src/modules/capability-supply/internal/x402-payment-signer.ts`.
- `undici` 7.28.0 supplies guarded outbound HTTP for Convex actions such as `convex/capabilitySupplyReadiness.ts`.
- `web-bot-auth` 0.1.3 and `http-message-sig` 0.2.0 support identity/signature code in `src/modules/routing-kernel/caller-identity.ts` and example routing tooling.
- `@noble/hashes` and `@noble/curves` provide digest and signature primitives used by common/security modules.

**Infrastructure and UI:**
- `@sentry/react`, `@sentry/node`, and `@sentry/vite-plugin` support configuration-dependent error reporting and build source-map upload.
- `posthog-js` and `posthog-node` support opt-in browser/server analytics.
- `ajv` and `@cfworker/json-schema` validate JSON Schema-shaped capability contracts.
- `lucide-react`, `motion`, `@tanstack/react-table`, `clsx`, `tailwind-merge`, and `tw-animate-css` support UI composition.
- No Stripe, Autumn, Resend, Novu, Meilisearch, Shippo, EasyPost, or OpenRouter SDK is declared in `package.json`; those integrations use raw `fetch` or injected transports where implemented.

**Current scripts:**
- `dev`, `build`, `start`, and `typecheck` operate the TanStack/Vite application.
- `lint`, `check:convex-codegen`, `check:kernel-proof`, `check:kernel-retirement`, and `check:routing-edge` are source and boundary checks.
- `test:unit`, `test:integration`, `test:types`, `test:imports`, `test:ts-standards`, `test:seo`, `test:ui-contract`, `test:e2e`, and `test:a11y` select focused suites.
- `smoke:customer-request:development`, `smoke:customer-request:development:surface-parity`, and the production readback/smoke scripts exercise labelled or hosted Customer Request paths.
- `evidence:*`, `verify:*`, `provider:readiness`, `ae`, and `audit:agent-experience` run development evidence, CLI, provider, and audit tooling. The exact commands are defined in `package.json`.

## Paid-Operation Runtime Stack

**Current source seam:**
- Paid-operation semantics and application services are implemented as module code in `src/modules/action-invocation/paid-operation-semantics.ts` and `src/modules/action-invocation/paid-operation-application-service.ts`.
- The public module export is `src/modules/action-invocation/index.ts`; development hosts and browser tooling live in `tools/dev/paid-operation-surface-host.tsx` and `tools/dev/paid-operation-browser/`.
- Focused behavior is covered by `tests/unit/action-invocation/paid-operation-application-service.test.ts`, `tests/unit/action-invocation/paid-operation-development-surface.test.tsx`, and `tests/unit/action-invocation/paid-operation-projection.test.ts`.
- Registered action contracts include `src/modules/registry/registry.actions.ts`, `src/modules/customer-request/customer-request.actions.ts`, and `src/modules/capability-supply/supplied-quote.actions.ts`; `src/modules/actions/index.ts` explicitly collects the set. Registration is a shared contract seam, not proof of a public route or customer reachability.

**Evidence and boundary:**
- The module models inspect, authorization, execution, payment-attempt, reconciliation, and projection semantics, but the current tree does not expose a customer-facing paid-operation route or prove a real provider effect.
- x402 transport admission and signing are source-level adapters in `src/modules/capability-supply/internal/transport-adapters.ts`, `src/modules/capability-supply/route-transport-runtime.ts`, and `src/modules/capability-supply/internal/x402-payment-signer.ts`.
- x402 code records bounded challenge, submission, receipt, and unknown/reconciliation states; focused tests prove adapter behavior only. It does not establish customer-reachable payment, booking, fulfilment, settlement, custody, wallets, credits, or payouts.
- Payment, wallet, checkout, and settlement terms in refusal/public-copy guards remain guards or refusal policies unless a specific live intended surface and external effect are independently evidenced. `src/modules/inquiries/internal/policy.ts` and `src/lib/ui/contract-scans.ts` enforce this boundary.

## Configuration

**Environment:**
- `.env.example` exists at the repository root; only names are documented here and no secret-bearing environment file is read.
- `CONVEX_URL` or `VITE_CONVEX_URL` is required by `src/lib/server/convex-source.ts`; authenticated calls use a Clerk token template.
- `convex/convex.config.ts` declares optional `OPENROUTER_API_KEY`, `AE_CUSTOMER_REQUEST_MODEL`, `AE_SITE_URL`, `CLERK_JWT_ISSUER_DOMAIN`, `AE_CONVEX_SERVER_FUNCTION_TOKEN`, and route-call signing names.
- `convex/auth.config.ts` requires `CLERK_JWT_ISSUER_DOMAIN` for the Convex Clerk provider.
- OpenRouter answer behavior reads `OPENROUTER_API_KEY`, `AE_LLM_MODEL`, and optional `AE_OPENROUTER_API_BASE_URL` in `src/modules/answer/internal/llm-config.ts`.
- Sentry/PostHog configuration and the `VITE_AE_DISABLE_OBSERVABILITY` / `AE_DISABLE_OBSERVABILITY` kill-switch are handled by `src/lib/observability/config.ts`.
- Search, maps, notifications, and provider credential names are read by their owning integrations; values stay in runtime environments rather than map documents.

**Build:**
- `vite.config.ts` configures TanStack Start, Nitro Vercel Node, React, Tailwind, Astryx SSR bundling, local `/SKILL.md` compatibility, and conditional Sentry upload.
- The build-only `react/jsx-dev-runtime` alias points at `src/lib/compat/react-jsx-dev-runtime.production.ts` to accommodate the installed Astryx distribution; this is a build compatibility shim, not an application integration.
- `tsconfig.json`, `convex/tsconfig.json`, `vitest.config.ts`, the Playwright configs, `.oxlintrc.json`, and `doctor.config.ts` define compilation, testing, linting, and health-check behavior.

## Platform Requirements

**Development:**
- Install with npm 11.5.1 and `npm ci` from `package-lock.json`; use Node 22 to match `.github/workflows/kernel-release-gate.yml`.
- Local app work uses `npm run dev`; type/build checks use the scripts in `package.json`.
- Clerk and Convex environment configuration is required for authenticated source calls; the local E2E bypass is a test/development mechanism, not production identity.
- Provider and evidence tools under `tools/dev/`, `tools/release/`, `examples/`, and the focused tests use labelled fixtures or injected fetchers where stated; their output is not automatically production proof.

**Production:**
- The primary application target is Vercel Node serverless as configured in `vite.config.ts`.
- Convex functions/schema are deployed independently from `convex/`; exact-revision deployment and readback automation is defined in `.github/workflows/kernel-release-gate.yml`.
- Cloudflare Workers and example provider deployments under `examples/` are conformance/example infrastructure, not evidence that the primary application uses those deployments.

---

*Stack analysis: 2026-07-29*
