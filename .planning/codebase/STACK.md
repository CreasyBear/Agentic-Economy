# Technology Stack

**Analysis Date:** 2026-08-08

**Evidence note:** This map describes the current working tree. `Implemented` means the current source imports or executes the technology; `Configured` means a current config, manifest, or deployment file selects it; a dependency being installed is not treated as proof that a feature is live.

## Languages

**Primary:**
- TypeScript 6.0.3 - Application, Convex functions, route handlers, domain modules, tests, and typed tooling; the compiler version is declared in `package.json` and the strict project boundary is in `tsconfig.json`.
- TSX - React UI and route components under `src/components/` and `src/routes/`, with the `react-jsx` transform configured in `tsconfig.json`.

**Secondary:**
- ECMAScript modules / JavaScript - `package.json` sets `"type": "module"`; JavaScript and MJS evaluation/tooling scripts live under `eval/` and `tools/`.
- CSS with Tailwind directives - `src/styles/globals.css` imports Tailwind 4 layers and `tw-animate-css`; `@tailwindcss/vite` is configured in `vite.config.ts`.
- YAML and JSON - GitHub Actions and Promptfoo/configuration artifacts under `.github/workflows/`, `eval/`, and root configuration files.

## Runtime

**Environment:**
- Node.js >=22 - The package engine is `>=22` in `package.json`; the release workflow installs Node 22 in `.github/workflows/kernel-release-gate.yml`.
- Vercel Node serverless runtime - The Nitro Vercel preset selects `nodejs22.x` functions in `vite.config.ts`; `.vercel/project.json` separately records a Vercel project `nodeVersion` of `24.x`, so deployment declarations are not uniform.
- Browser plus server-rendered React - TanStack Router creates the browser router in `src/router.tsx`, while `src/routes/__root.tsx` and `src/start.ts` provide the server/start surface.
- Convex function runtimes - `convex/` contains queries, mutations, and actions; Node-only external transport work is explicitly separated with `"use node"` in `convex/customerRequestRouteTransportWorker.ts`.

**Package Manager:**
- npm 11.5.1 - Pinned by `package.json` and installed explicitly in `.github/workflows/kernel-release-gate.yml`.
- Lockfile: `package-lock.json` present with lockfile version 3.

## Frameworks

**Core:**
- React 19.2.7 / React DOM 19.2.7 - UI rendering and hydration; versions are pinned in `package.json` and the route shell is in `src/routes/__root.tsx`.
- TanStack React Start 1.168.26 and TanStack React Router 1.170.16 - Full-stack route handlers, SSR/start middleware, file routes, and generated route tree; configured in `src/start.ts`, `src/router.tsx`, and `vite.config.ts`.
- Convex 1.42.0 - Reactive backend functions, hosted database, auth-aware source transport, and generated API; the application schema is composed in `convex/schema.ts` and the client seam is `src/lib/server/convex-source.ts`.
- Nitro nightly 3.0.1 build integration - Vercel server output for TanStack Start, selected by `nitro/vite` in `vite.config.ts` and declared as `nitro` in `package.json`.
- Tailwind CSS 4.3.1 - Utility styling and preflight through `@tailwindcss/vite`; the entrypoint is `src/styles/globals.css` and component metadata is in `components.json`.

**Testing:**
- Vitest 4.1.9 - Node-environment unit/integration tests, including `tests/**/*.test.ts[x]` and `convex/**/*.test.ts`; configured in `vitest.config.ts`.
- Playwright 1.61.1 - Browser E2E projects for compact and wide Chromium; configured in `playwright.config.ts` with a Vite dev server on port 3020 for local runs.
- React Testing Library 16.3.2 with jsdom 29.1.1 - React component tests; both packages are in `package.json` and component tests are under `tests/`.

**Build/Dev:**
- Vite 8.1.0 with `@vitejs/plugin-react` 6.0.3 - Development server and production bundling in `vite.config.ts`.
- TypeScript compiler 6.0.3 - Strict, no-emit type checking through `tsconfig.json` and the `typecheck` script in `package.json`.
- `tsx` 4.20.5 - Direct TypeScript execution for `tools/` and release/evidence scripts, wired through `package.json` scripts.
- Oxlint 1.73.0 - Repository lint command declared in `package.json`; `doctor.config.ts` configures the optional React Doctor diagnostics integration.

## Key Dependencies

**Critical:**
- `convex` 1.42.0 plus `@convex-dev/workflow` 0.4.4, `@convex-dev/workpool` 0.4.9, `@convex-dev/rate-limiter` 0.3.2, and `@convex-dev/aggregate` 0.2.2 - Backend persistence, scheduled/workpool execution, rate limits, and aggregate projections; components are installed in `convex/convex.config.ts`.
- `@clerk/tanstack-react-start` 1.4.9 - Clerk UI, request middleware, server auth, and API-key access; used in `src/start.ts`, `src/routes/__root.tsx`, and `src/lib/server/customer-request-agent-auth.ts`.
- `@tanstack/react-start` 1.168.26 and `@tanstack/react-router` 1.170.16 - Full-stack routing and request/server-function framework; used by `src/start.ts`, `src/router.tsx`, and `src/routes/`.
- `ai` 7.0.44, `@openrouter/ai-sdk-provider` 3.0.0, and `@ai-sdk/provider-utils` 5.0.16 - Vercel AI SDK model calls, structured output, tool loops, provider transport, and streaming; centralized in `src/modules/model-gateway/public.ts` and used by `src/modules/answer/` and `src/modules/customer-request/`.
- `@modelcontextprotocol/sdk` 1.30.0 - Streamable HTTP MCP server and protocol adapter at `src/lib/server/mcp-api.ts`; registered external MCP transports are also supported by `src/modules/capability-supply/route-transport-runtime.ts`.
- `@x402/core`, `@x402/evm`, and `@x402/extensions` 2.18.0 with `viem` 2.55.2 - Payment-required challenge validation, EVM payment signatures, and exact token amount conversion; the reviewed signer seam is `src/modules/capability-supply/internal/x402-payment-signer.ts`.
- `zod` 4.4.3, `@cfworker/json-schema` 4.1.1, and `@apidevtools/json-schema-ref-parser` 11.0.0 - Runtime validation and OpenAPI/JSON Schema admission/normalization; source contracts and importers live under `src/modules/capability-contract/` and `src/modules/capability-supply/internal/`.
- `@sentry/node`/`@sentry/react` 10.63.0 and `posthog-node` 5.39.0/`posthog-js` 1.398.2 - Optional server/client error tracking and funnel/product analytics; configured under `src/lib/observability/`.
- `undici` 7.28.0 - Guarded Node HTTP dispatch and DNS-aware external provider requests; used by `convex/customerRequestRouteTransportWorker.ts` and storefront import code.

**Infrastructure:**
- `@sentry/vite-plugin` 5.3.0 - Conditional source-map/release integration in `vite.config.ts`.
- `@tailwindcss/vite` 4.3.1 and `tw-animate-css` 1.4.0 - CSS build integration used by `vite.config.ts` and `src/styles/globals.css`.

## Configuration

**Environment:**
- `.env.example` documents Clerk, Convex, source-write, WBA, billing, notification, OpenRouter, observability, canonical URL, Google Maps, and routing variables; `.env.local` is the local secret-bearing file and is not reproduced in this document.
- Convex-deployed environment names are declared in `convex/convex.config.ts`, including `OPENROUTER_API_KEY`, `AE_CUSTOMER_REQUEST_MODEL`, `AE_SITE_URL`, `CLERK_JWT_ISSUER_DOMAIN`, `AE_CONVEX_SERVER_FUNCTION_TOKEN`, and route-call signing variables.
- Client-exposed values use `VITE_*` names; server-only credentials are read from `process.env` in seams such as `src/lib/server/convex-source.ts`, `src/modules/model-gateway/public.ts`, and `src/lib/server/notification-provider.ts`.

**Build:**
- `tsconfig.json` - Strict TypeScript, `@/*` and `~/*` aliases, DOM/ES2024 libraries, no emit, and route/test inclusion.
- `vite.config.ts` - TanStack Start, Nitro/Vercel Node, React, Tailwind, optional Sentry, port 3000, and host/watch settings.
- `vitest.config.ts` - TypeScript path aliases, Node test environment, setup files, and test globs.
- `playwright.config.ts` plus `playwright.deploy-smoke.config.ts` and `playwright.paid-operation.config.ts` - Local/hosted browser targets and smoke-specific runtime settings.
- `components.json` - shadcn-compatible component aliases, Tailwind CSS entrypoint, and Lucide icon library.

## Platform Requirements

**Development:**
- Node.js 22 or newer and npm 11.5.1; the minimum is enforced by `package.json` and the CI baseline by `.github/workflows/kernel-release-gate.yml`.
- A browser is required for Playwright E2E journeys; `playwright.config.ts` starts the local Vite server and disables Clerk only for the explicitly marked local-E2E path.
- A Convex URL plus Clerk/OpenRouter/provider credentials are required only for the corresponding live flows; `.env.example`, `convex/auth.config.ts`, and `convex/convex.config.ts` document those boundaries.
- No Docker or local SQL service is configured in the current tree; persistence is provided by Convex.

**Production:**
- Vercel is the application deployment target: `.vercel/project.json` identifies the `agentic-economy` Nitro project, `vite.config.ts` selects the Vercel Nitro preset, and `tools/release/deploy-customer-request-git-source.ts` calls the Vercel deployment API.
- Convex is a separately deployed backend/database: `.github/workflows/kernel-release-gate.yml` runs Convex deploy/env/seed commands, and `convex/auth.config.ts` binds Convex JWT validation to Clerk.
- Production operation depends on deployment-managed secrets for Clerk, Convex, OpenRouter, notifications, observability, source-write admission, route-call signing, and any keyed external capability publication; names are documented in `.env.example` and workflow secret references, never values.

---

*Stack analysis: 2026-08-08*
*Update after major dependency changes*
