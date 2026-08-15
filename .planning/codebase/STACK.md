# Technology Stack

**Analysis Date:** 2026-08-15

## Languages

**Primary:**
- TypeScript 6.0.3 with strict ES2022/ES2024 targets - application, Convex backend, routes, tools, and tests in `src/`, `convex/`, `tools/`, and `tests/`; compiler policy is in `tsconfig.json`.
- TSX / React JSX - server-rendered and client-interactive UI in `src/components/` and file routes in `src/routes/`, compiled with the React JSX transform configured in `tsconfig.json`.

**Secondary:**
- JavaScript ES modules - release, audit, and evaluation utilities such as `scripts/audit-action-surfaces.mjs`, `tools/release/verify-kernel-retirement.mjs`, and `eval/parity/check-parity.mjs`.
- CSS - Tailwind CSS v4 theme and global styling in `src/styles/globals.css` and `src/styles/base.css`.
- YAML - GitHub Actions and prompt evaluation configuration in `.github/workflows/kernel-release-gate.yml`, `.github/workflows/react-doctor.yml`, and `eval/answer/promptfooconfig.yaml`.

## Runtime

**Environment:**
- Node.js 22.x - pinned by `.nvmrc`, `package.json`, and the Vercel `nodejs22.x` runtime in `vite.config.ts`.
- Browser runtime - React 19.2.7 client surfaces under `src/components/`; DOM and ES2024 libraries are enabled in `tsconfig.json`.
- Convex managed runtime 1.42.0 - database functions, actions, scheduled work, and reactive data under `convex/`; Node-only actions declare their runtime in individual Convex files.

**Package Manager:**
- npm 11.5.1 - declared in `package.json` and explicitly installed in `.github/workflows/kernel-release-gate.yml`.
- Lockfile: present at `package-lock.json`; use `npm ci` for reproducible CI installation as shown in `.github/workflows/kernel-release-gate.yml`.

## Frameworks

**Core:**
- React 19.2.7 - component and rendering model for `src/components/` and `src/routes/`.
- TanStack Start 1.168.26 and TanStack Router 1.170.16 - full-stack SSR, server handlers, middleware, and file-based routing configured by `vite.config.ts`, `src/start.ts`, and `src/routeTree.gen.ts`.
- Convex 1.42.0 - type-safe database, server functions, scheduling, and backend state declared in `convex/schema.ts`, `convex/convex.config.ts`, and `convex/crons.ts`.
- Vercel AI SDK 7.0.44 with OpenRouter provider 3.x - model and tool execution through the single gateway seam in `src/modules/model-gateway/public.ts`.
- Tailwind CSS 4.3.1 with shadcn/Radix primitives - styling and component foundations in `src/styles/globals.css`, `src/components/ui/`, and `components.json`.

**Testing:**
- Vitest 4.1.9 - unit, integration, schema, import-boundary, SEO, type, and UI-contract suites configured in `vitest.config.ts`.
- Playwright 1.61.1 - responsive Chromium E2E and deployed smoke tests configured in `playwright.config.ts` and additional `playwright.*.config.ts` files.
- convex-test 0.0.54 - in-memory Convex function/component testing in `convex/**/*.test.ts` and helpers such as `tests/helpers/convex-fixtures.ts`.
- Testing Library React 16.3.2 and jsdom 29.1.1 - component behavior tests under `tests/unit/`, with platform setup in `tests/setup/jsdom-platform.ts`.
- Promptfoo 0.121.17 and Braintrust 3.27.0 - answer evaluation workflows in `eval/answer/promptfooconfig.yaml` and `eval/braintrust/answer.eval.ts`.

**Build/Dev:**
- Vite 8.1.0 - development server and production bundling in `vite.config.ts`; commands are declared in `package.json`.
- Nitro nightly 3.0.1 - TanStack Start server output targeting Vercel Node functions in `vite.config.ts`.
- TypeScript compiler 6.0.3 - no-emit strict type checking through `npm run typecheck` in `package.json`.
- oxlint 1.73.0 - warning-denying lint gate across `src`, `convex`, `tests`, and `tools` via `package.json`.
- tsx 4.20.5 - direct TypeScript execution for `tools/`, release checks, smoke tests, and the `ae` CLI configured in `package.json`.

## Key Dependencies

**Critical:**
- `convex` 1.42.0 plus `@convex-dev/aggregate`, `@convex-dev/rate-limiter`, `@convex-dev/workflow`, and `@convex-dev/workpool` - durable storage, bounded work, rate admission, orchestration, and owner-stage aggregates mounted in `convex/convex.config.ts`.
- `@clerk/tanstack-react-start` 1.4.9 - user sessions, middleware, API keys, and server identity in `src/start.ts`, `src/routes/__root.tsx`, and `src/modules/agent-access/agent-access.functions.ts`.
- `ai` 7.0.44, `@openrouter/ai-sdk-provider` 3.x, and `@tanstack/ai` 0.38.0 - LLM calls, tool execution, provider metadata, and JSON-schema projection in `src/modules/model-gateway/public.ts` and `src/modules/registry/operation-action-contracts.ts`.
- `@modelcontextprotocol/sdk` 1.30.0 - Streamable HTTP MCP host and remote MCP transport contracts in `src/lib/server/mcp-api.ts` and `src/modules/capability-supply/internal/transport-adapters.ts`.
- `stripe` 22.5.0 and Stripe React/JS SDKs - Checkout, Elements, Connect onboarding, webhook verification, and payouts in `src/lib/server/stripe-money-provider.ts` and `src/components/ae/console/AeCreditTopUpPanel.tsx`.
- `@x402/core`, `@x402/evm`, and `@x402/extensions` 2.18.0 with `viem` 2.55.2 - paid capability negotiation, EVM signing, and settlement evidence in `src/modules/capability-supply/internal/x402-payment-signer.ts` and `src/modules/capability-supply/internal/x402-settlement-verifier.ts`.
- `zod` 4.4.3, `@apidevtools/json-schema-ref-parser` 11.x, `@cfworker/json-schema` 4.1.1, and `openapi-fetch` 0.17.0 - contract validation, dereferencing, and OpenAPI execution in `src/modules/capability-supply/internal/publication-importers.ts` and `src/modules/capability-execution/operation-execute.functions.ts`.
- `xstate` 5.32.5 - state-machine orchestration for request execution under `src/modules/customer-request/route-execution/machines/`.

**Infrastructure:**
- `nitro` nightly and Vite - Vercel Node serverless output configured in `vite.config.ts`.
- `@sentry/node`, `@sentry/react`, and `@sentry/vite-plugin` 10.63.x/5.3.x - server/client errors, traces, and source-map release upload in `src/lib/observability/` and `vite.config.ts`.
- `posthog-js` 1.398.2 and `posthog-node` 5.39.0 - browser/server funnel analytics in `src/lib/observability/posthog.client.ts` and `src/lib/observability/posthog.server.ts`.
- `undici` 7.28.0 - guarded outbound agent transports in `src/modules/capability-execution/operation-execute.server.ts` and Convex workers such as `convex/capabilityOperationInvocationWorker.ts`.
- `@noble/curves`, `@noble/hashes`, and `http-message-sig` - request identity and signature verification around agent/provider calls in `src/modules/security/` and `src/modules/capability-supply/`.

## Configuration

**Environment:**
- Validate production configuration through the closed manifest in `src/lib/deployment/manifest.ts`; it classifies required, conditional, optional, forbidden, and malformed settings before release.
- Declare Convex action environment keys in `convex/convex.config.ts`; authenticate Convex JWTs through Clerk issuer configuration in `convex/auth.config.ts`.
- `.env.example` is present for environment configuration; its contents are intentionally not part of this map. Runtime secrets are supplied through deployment environments referenced by `.github/workflows/kernel-release-gate.yml`.

**Build:**
- `vite.config.ts` composes TanStack Start, Nitro/Vercel Node, React, Tailwind, Graphology compatibility, and conditional Sentry source maps.
- `tsconfig.json` enables strict typing, exact optional properties, unchecked-index protection, bundler resolution, and `@/*`/`~/*` aliases.
- `vitest.config.ts`, `playwright.config.ts`, and `components.json` configure tests and UI generation; release commands and dependency versions live in `package.json`.

## Platform Requirements

**Development:**
- Use Node 22 and npm 11.5.1 from `.nvmrc` and `package.json`; install from `package-lock.json`.
- Run the Vite/TanStack server and Convex development backend using commands in `package.json`; local orchestration is implemented by `tools/dev/local-dev.mjs`.
- Supply non-production environment configuration without committing secrets; deployment shape is checked by `src/lib/deployment/manifest.ts`.

**Production:**
- Deploy the web/SSR runtime as Vercel Node 22 serverless functions using `vite.config.ts`.
- Deploy data, functions, crons, workflow/workpool/rate-limiter components, and aggregates to Convex using `convex/convex.config.ts` and `convex/schema.ts`.
- Release through the GitHub Actions source, hosted, and opt-in paid gateway gates in `.github/workflows/kernel-release-gate.yml`.

---

*Stack analysis: 2026-08-15*
