---
name: Technology stack
analysis_date: 2026-08-01
refreshed: 2026-08-01
scope: Full repository technology, runtime, build, and tooling inventory
---

# Technology Stack

## Snapshot

Agentic Economy is a TypeScript/React 19 web application built with TanStack Start and TanStack Router, rendered and served through Vite and Nitro. Convex is the source-of-truth database and server-function runtime, with Clerk providing authentication. The production build is configured for Vercel Node.js serverless functions; GitHub Actions deploys the application and Convex functions on the release path.

The active application is in `src/` and `convex/`. `src/routeTree.gen.ts` and `convex/_generated/` are generated framework artifacts. `vendor/handshake-protocol-kernel/` is retained source, but active application imports use the installed protocol packages described below rather than the retired kernel.

## Languages and module/runtime model

- TypeScript is the application language for browser, server, Convex, tooling, and tests (`src/**/*.ts`, `src/**/*.tsx`, `convex/**/*.ts`, and `tests/**/*.ts`).
- The package is ESM (`package.json` sets `"type": "module"`) and uses npm 11.5.1 (`package.json` `packageManager`, locked by `package-lock.json`).
- TypeScript targets ES2022 with DOM/ES2023 libraries, strict checking, exact optional properties, unchecked-index checking, and bundler module resolution (`tsconfig.json`). JSX uses the React JSX transform.
- Browser/server code uses standard Fetch API `Request`/`Response`, Web Crypto, streams, and `AbortSignal`; Node-only Convex actions and operational scripts opt into Node where needed.
- The main local development server is Vite on `127.0.0.1:3000` (`vite.config.ts`). Playwright starts a separate Vite server on `127.0.0.1:3020` (`playwright.config.ts`).

## Application framework and routing

- React 19.2.7 and React DOM 19.2.7 provide the UI runtime (`package.json`).
- `@tanstack/react-start` supplies SSR/server functions, request middleware, and the application start instance (`src/start.ts`).
- `@tanstack/react-router` supplies file-based routes, typed navigation, loaders, server handlers, and generated route registration (`src/router.tsx`, `src/routes/`, `src/routeTree.gen.ts`).
- `src/start.ts` composes observability, security headers, agent content negotiation, CSRF, source-write admission, and conditional Clerk middleware before route handling.
- Server routes are colocated in `src/routes/`; API routes use TanStack server handlers, for example `src/routes/api.answer.turn.ts`, `src/routes/mcp.ts`, and `src/routes/api.notification.resend-webhook.ts`.
- `@tanstack/react-table` supports tabular operator/admin views; `@tanstack/react-router` also drives router-aware Sentry tracing and PostHog pageview capture.
- Nitro is integrated through `nitro/vite` in `vite.config.ts`; TanStack Start and Nitro produce the deployable server bundle.

## Build and deployment runtime

- Vite 8.1.0 is the build/development bundler, with `@vitejs/plugin-react`, Tailwind's Vite plugin, TanStack Start's Vite plugin, and Nitro (`vite.config.ts`).
- The Nitro preset is `vercel`; Vercel functions are explicitly Node `nodejs20.x` (`vite.config.ts`). This is distinct from CI's Node 22 setup (`.github/workflows/kernel-release-gate.yml`).
- Production builds emit sourcemaps only when the Sentry Vite plugin has `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, and `SENTRY_PROJECT` (`vite.config.ts`). `SENTRY_RELEASE` falls back to Vercel/GitHub commit identifiers.
- Vercel project identity is recorded in `.vercel/project.json`; `.vercelignore` excludes generated/local state such as `.convex`, `.tanstack`, `output`, and test reports.
- `package.json` exposes `dev`, `build`, release checks, Convex codegen/deploy-related commands, and Vercel-hosted smoke commands. `package.json` also contains `check:routing-edge`, which points at `examples/routing-edge`; the checked-in `examples/` directory currently contains only `routing-provider/.vercel/`, so that script is a repository integration gap rather than an active application runtime.

## Data and server state

- Convex 1.42.0 is the primary data store and backend function platform (`package.json`, `convex/`). Queries, mutations, actions, HTTP-facing route adapters, and internal scheduled work are implemented as Convex functions.
- `convex/schema.ts` composes domain schemas for businesses/catalog, capability contracts and supply, customer requests, inquiries, notifications, observability, registry/discovery, money, security, settings, project spine, answer threads, plans, and action invocation.
- `convex/convex.config.ts` mounts `@convex-dev/workflow` and `@convex-dev/workpool`; the same file declares typed Convex environment values for OpenRouter, Clerk issuer, site URL, route signing, and server-function authentication.
- `src/lib/server/convex-source.ts` is the application transport seam. Authenticated calls resolve `CONVEX_URL`/`VITE_CONVEX_URL`, obtain a Clerk token template (`convex` by default), and call Convex query/mutation/action references. Public calls use a no-auth `ConvexHttpClient`.
- Convex generated types in `convex/_generated/` provide the typed API/data model; `tsconfig.json` explicitly excludes generated Convex code from source compilation.
- Local E2E can use a guarded Convex self-hosted admin key through `src/lib/server/convex-source.ts`, but the bypass fails in production and is not an alternate production identity model.

## Authentication and security primitives

- Clerk TanStack Start integration (`@clerk/tanstack-react-start`) provides server middleware and server `auth()`/`clerkClient()` access (`src/start.ts`, `src/lib/server/claim-owner-session.ts`, `src/lib/server/customer-request-agent-auth.ts`).
- `src/routes/__root.tsx` conditionally mounts `ClerkProvider` on sign-in, sign-up, owner, admin, and claim surfaces; public pages do not need the provider.
- Convex verifies Clerk JWTs using `CLERK_JWT_ISSUER_DOMAIN` and application ID `convex` (`convex/auth.config.ts`).
- `@noble/curves` and `@noble/hashes` provide Ed25519 attestations, signatures, and digest helpers (`src/modules/common/ed25519-attestation.ts`). Web Crypto is used for request/webhook HMAC verification where importing Node crypto into route code would break hydration (`src/lib/server/notification-provider.ts`).
- Zod 4, AJV 8, `@cfworker/json-schema`, and local bounded/stable-hash utilities validate wire payloads and canonicalize evidence. `src/modules/capability-supply/internal/transport-adapters.ts` admits only registered HTTPS transports with bounded configuration.
- `undici` is used with a guarded DNS dispatcher for Convex readiness probes and route cancellation workers (`convex/capabilitySupplyReadiness.ts`, `convex/customerRequestRouteCancellationWorker.ts`).

## AI and model stack

- The Vercel AI SDK (`ai`) is the model-call abstraction. `src/modules/model-gateway/public.ts` is the single OpenRouter seam and caches provider factories by credential/base URL/site URL.
- `@openrouter/ai-sdk-provider` sends model requests to OpenRouter. The gateway reads `OPENROUTER_API_KEY`, `AE_LLM_MODEL`, optional `AE_OPENROUTER_API_BASE_URL`, and optional `SITE_URL`; the default model is `deepseek/deepseek-v4-flash` (`src/modules/model-gateway/public.ts`).
- Structured outputs, provider fallback/parameter requirements, reasoning controls, usage/cost metadata, and OpenRouter's capped web-search plugin are configured centrally in `src/modules/model-gateway/public.ts`.
- Customer-request interpretation uses an OpenRouter transport (`src/modules/customer-request/openrouter-transport.ts`). Answer tool-use, follow-up chips, engine plans, storefront enrichment, and discovery route through the same gateway (`src/modules/answer/internal/answer-tool-use-agent.ts`, `src/modules/answer-thread/internal/llm-follow-up-chips.ts`, `src/modules/plan-proposal/internal/model-transport.ts`, `src/modules/storefront/internal/business-enrichment.ts`).
- `@tanstack/ai` converts Zod/action schemas to JSON Schema for agent tools (`src/modules/common/action.ts`, `src/modules/business-tools/internal/descriptors.ts`); it is not a second model transport.
- `src/modules/answer/internal/openrouter-models.ts` reads the OpenRouter model catalog at `https://openrouter.ai/api/v1/models`, caches it for two minutes, and falls back to a configured model list when unavailable.
- `src/routes/api.answer.turn.ts` exposes streamed answer events as an SSE response; model persistence/readback is handled through the answer-thread Convex-backed modules.
- `promptfoo` and the `eval/` tree support answer/engine evaluation and coverage gates, but are development/evaluation tooling rather than production request dependencies.

## Agent and payment protocol stack

- `@modelcontextprotocol/sdk` plus `WebStandardStreamableHTTPServerTransport` implements the hosted MCP endpoint (`src/lib/server/mcp-api.ts`, `src/routes/mcp.ts`).
- `@x402/core`, `@x402/evm`, `@x402/extensions`, and `viem` implement the registered `x402-fetch:v2` transport and EVM payment-signature path (`src/modules/capability-supply/internal/x402-payment-signer.ts`, `src/modules/capability-supply/route-transport-runtime.ts`).
- Registered provider transports are `http-json:v1`, `mcp-jsonrpc:v1`, and `x402-fetch:v2` (`src/modules/capability-supply/internal/transport-adapters.ts`). HTTP/MCP calls use bounded timeouts and digest-bound request/response observations; x402 validates payment challenges against spend authority before signing and records reconciliation evidence.
- OAuth device/authorization-code flows and customer-request agent keys are implemented in application code and persisted through Convex (`src/lib/server/customer-request-agent-oauth-api.ts`, `src/lib/server/customer-request-agent-oauth-store.ts`).

## UI, styling, and presentation

- Tailwind CSS 4.3.1 is loaded as CSS layers through `src/styles/globals.css`; `@tailwindcss/vite` supplies Vite integration. `src/styles/legacy.css` remains an intentionally unlayered migration layer.
- `components.json` identifies the shadcn/ui New York style, CSS variables, neutral base color, Lucide icons, and `@/*` aliases. UI primitives live under `src/components/ui/`.
- Radix UI packages (`radix-ui`, `@radix-ui/react-use-controllable-state`), `class-variance-authority`, `clsx`, and `tailwind-merge` support composable class-based components.
- `lucide-react`, `motion`, `sonner`, `cmdk`, `embla-carousel-react`, and `use-stick-to-bottom` support icons, motion, toasts, command menus, carousels, and streaming chat scroll behavior.
- `streamdown` and its CJK/code/math/mermaid packages render model-authored content; `shiki` provides code highlighting; `ansi-to-react` handles terminal-style text.

## Observability and analytics

- Sentry uses `@sentry/react` in the browser and `@sentry/node` on the server (`src/lib/observability/sentry.client.ts`, `src/lib/observability/sentry.server.ts`). Browser tracing integrates with TanStack Router; server request middleware initializes an isolation scope and flushes PostHog after each request (`src/start.ts`).
- PostHog uses `posthog-js` client-side and `posthog-node` server-side (`src/lib/observability/posthog.client.ts`, `src/lib/observability/posthog.server.ts`). Client pageviews are explicit rather than automatic, session recording is disabled, and pseudonymous IDs are used.
- `src/lib/observability/config.ts` supports separate Vite-visible (`VITE_*`) and server-only keys, a default PostHog host, release/environment resolution from Sentry/Vercel/GitHub variables, and a local telemetry disable switch.

## Test, lint, and diagnostics toolchain

- Vitest 4.1.9 runs Node-environment unit/integration/type/import/SEO/UI-contract suites through `vitest.config.ts`; setup files are `tests/setup/web-storage.ts` and `tests/setup/no-search-gap-writes.ts`.
- Playwright 1.61.1 drives browser and deployment smoke suites (`playwright.config.ts`, `playwright.deploy-smoke.config.ts`); it supports compact and wide Chromium projects, trace-on-first-retry, and screenshot-on-failure.
- `convex-test` supplies in-memory Convex behavior for Convex/domain tests. `jsdom` supports browser-like test fixtures.
- `oxlint` is configured through `.oxlintrc.json`; `react-doctor` is configured by `doctor.config.ts` and runs in `.github/workflows/react-doctor.yml`.
- TypeScript 6.0.3 powers `typecheck`; `tsx` executes TypeScript tooling and smoke/evidence scripts; `wrangler` is present for the routing-edge check; `promptfoo` drives LLM evaluations.
- Import-boundary and source-retirement checks are first-class scripts (`package.json`, `tests/imports/`, `tools/release/kernel-retirement-manifest.mjs`).

## Configuration surface

- The documented environment contract is `.env.example`; local values are in `.env.local` and are server/client-scoped by naming (`VITE_*` is browser-exposed, unprefixed secrets remain server-side).
- Auth/config groups include Clerk (`VITE_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `CLERK_JWT_ISSUER_DOMAIN`), Convex (`VITE_CONVEX_URL`), source-write keyrings, canonical URL/CSP, agent/WBA admission, provider billing/notifications, OpenRouter answer controls, Sentry/PostHog, and Google Maps (`.env.example`).
- `vite.config.ts`, `tsconfig.json`, `vitest.config.ts`, `playwright.config.ts`, `components.json`, `doctor.config.ts`, `.oxlintrc.json`, and `.github/workflows/kernel-release-gate.yml` are the primary runtime/build/tooling configuration files.

## Analysis completion

_Completed technology stack mapping on 2026-08-01; 109 lines._
