# Technology Stack

**Analysis Date:** 2026-08-04

## Languages

**Primary:**
- TypeScript 6.0.3 - Application modules, TanStack Start route handlers, Convex functions, tests, and operational tooling in `src/`, `convex/`, `tests/`, and `tools/`.

**Secondary:**
- JavaScript ES modules - Release and repository utilities in `tools/**/*.mjs` and package scripts; `package.json` sets `"type": "module"`.
- CSS - Tailwind layers and application styles in `src/styles/globals.css` and `src/styles/legacy.css`.
- JSON and YAML - Package, schema, route-contract, evaluation, and CI configuration in `package.json`, `tsconfig.json`, `eval/`, and `.github/workflows/kernel-release-gate.yml`.

## Runtime

**Environment:**
- Node.js >=22 - Local scripts and server builds from `package.json`, Vercel serverless functions pinned to `nodejs22.x` in `vite.config.ts`, and CI jobs pinned to Node 22 in `.github/workflows/kernel-release-gate.yml`.
- Browser Web APIs - React rendering, Fetch, streams, Web Crypto, cookies, and browser `localStorage`/`sessionStorage` used by `src/routes/` and `src/components/`.

**Package Manager:**
- npm 11.5.1 - Declared by `package.json` and installed explicitly in `.github/workflows/kernel-release-gate.yml`.
- Lockfile: present - `package-lock.json` uses lockfile version 3 and records the resolved dependency graph.

## Frameworks

**Core:**
- React 19.2.7 and React DOM 19.2.7 - Client and server-rendered UI in `src/routes/` and `src/components/`.
- TanStack Start 1.168.26 - SSR, server functions, request middleware, and application startup in `src/start.ts`.
- TanStack Router 1.170.16 - File-based typed routes and generated route metadata in `src/routes/` and `src/routeTree.gen.ts`.
- Convex 1.42.0 - Durable database, queries, mutations, actions, scheduled jobs, HTTP actions, and generated API in `convex/`.

**Testing:**
- Vitest 4.1.9 - Unit, integration, Convex, import-boundary, SEO, type, and UI-contract suites configured by `vitest.config.ts`.
- Playwright 1.61.1 - Local browser, deployment-smoke, and paid-operation browser suites configured by `playwright.config.ts`, `playwright.deploy-smoke.config.ts`, and `playwright.paid-operation.config.ts`.
- `convex-test` 0.0.54 - In-memory Convex function tests in `tests/` and `convex/*.test.ts`.
- Testing Library React 16.3.2 - React component assertions used by `tests/`.

**Build/Dev:**
- Vite 8.1.0 - Development server on port 3000 and production bundling in `vite.config.ts`.
- Nitro 3.0.1-20260628-090458-3df69609 - Vercel Node server bundle through `nitro/vite` in `vite.config.ts`.
- `@vitejs/plugin-react` 6.0.3 - React transform in `vite.config.ts`.
- Tailwind CSS 4.3.1 and `@tailwindcss/vite` 4.3.1 - CSS generation from `src/styles/globals.css` through `vite.config.ts`.
- `tsx` 4.20.5 and Oxlint 1.73.0 - TypeScript CLI execution and lint commands in `package.json`.

## Key Dependencies

**Critical:**
- `@clerk/tanstack-react-start` 1.4.9 - Clerk middleware, `ClerkProvider`, server sessions, owner identity, and API-key access in `src/start.ts`, `src/routes/__root.tsx`, and `src/lib/server/`.
- `ai` 7.0.44 and `@openrouter/ai-sdk-provider` 3.0.0 - The centralized model gateway, structured output, tool calls, streaming, usage, and web-search plugin path in `src/modules/model-gateway/public.ts`.
- `@modelcontextprotocol/sdk` 1.30.0 - Streamable HTTP MCP host adapter in `src/lib/server/mcp-api.ts` and `src/routes/mcp.ts`.
- `@x402/core`, `@x402/evm`, and `@x402/extensions` 2.18.0 - x402 challenge decoding, exact EVM payment payloads, payment identifiers, and transport execution in `src/modules/capability-supply/internal/x402-payment-signer.ts`.
- `zod` 4.4.3, `ajv` 8.20.0, and `@cfworker/json-schema` 4.1.1 - Runtime request, action, JSON Schema, and capability-contract validation in `src/modules/` and `convex/`.
- `@tanstack/ai` 0.38.0 - Zod-to-JSON-Schema projection for registered actions and sandbox provider descriptors in `src/modules/common/action.ts` and `src/lib/server/sandbox-capability-provider.ts`.

**Infrastructure:**
- `@convex-dev/workflow` 0.4.4, `@convex-dev/workpool` 0.4.9, `@convex-dev/rate-limiter` 0.3.2, and `@convex-dev/aggregate` 0.2.2 - Mounted Convex components in `convex/convex.config.ts` and used by `convex/projectSpine.ts`, `convex/customerRequestRouteWorkpool.ts`, `src/lib/server/rate-limit.ts`, and `convex/observability.ts`.
- `undici` 7.28.0 - Guarded provider fetch, DNS resolution, and dispatcher lifecycle in `convex/customerRequestRouteTransportWorker.ts` and `src/modules/storefront/internal/import-draft.ts`.
- `viem` 2.55.2, `@noble/curves` 1.9.1, and `@noble/hashes` 1.8.0 - EVM accounts, Ed25519/HMAC/SHA-256 signatures, canonical digests, and attestation helpers in `src/modules/common/` and `src/modules/capability-supply/`.
- `@sentry/node`, `@sentry/react`, and `@sentry/vite-plugin` 10.63.0/5.3.0 - Optional server/client error capture, tracing, and build sourcemap publication in `src/lib/observability/` and `vite.config.ts`.
- `posthog-node` 5.39.0 and `posthog-js` 1.398.2 - Optional server/client product and funnel telemetry in `src/lib/observability/`.
- `@react-email/components` 1.0.12 and `@react-email/render` 2.1.0 - WorkTree memo HTML rendering in `src/modules/work-tree/internal/memo.tsx`.
- `graphology`, `graphology-dag`, `graphology-traversal`, and `xstate` - Customer Request graph compilation and Study state-machine execution in `src/modules/customer-request/` and `src/modules/study/internal/rfx-machine.ts`.
- `@convex-dev/agent` - Not detected in `package.json` or `convex/convex.config.ts`; durable model ownership remains in AE modules rather than this component.

## Configuration

**Environment:**
- `.env`, `.env.local`, `.env.example`, and `.vercel/.env.production.local` are present as environment-configuration files; values are not committed to this map.
- Convex deployment environment names are declared in `convex/convex.config.ts`; server reads use `process.env` through `src/lib/server/read-trimmed-env.ts`, while browser-exposed configuration uses `VITE_` names.
- Core connection and identity names include `VITE_CONVEX_URL`, `CONVEX_URL`, `CLERK_JWT_ISSUER_DOMAIN`, and `CLERK_SECRET_KEY` in `src/lib/server/convex-source.ts` and `convex/auth.config.ts`.
- Model and site names include `OPENROUTER_API_KEY`, `AE_LLM_MODEL`, `AE_OPENROUTER_API_BASE_URL`, `AE_CUSTOMER_REQUEST_MODEL`, `AE_SITE_URL`, and `SITE_URL` in `src/modules/model-gateway/public.ts`, `convex/customerRequestApplication.ts`, and `convex/convex.config.ts`.
- Telemetry and optional client integration names include `VITE_SENTRY_DSN`, `SENTRY_DSN`, `VITE_POSTHOG_KEY`, `POSTHOG_KEY`, and `VITE_GOOGLE_MAPS_API_KEY` in `src/lib/observability/config.ts` and `src/components/ae/artifacts/AeGenerativeMap.tsx`.

**Build:**
- `vite.config.ts` composes TanStack Start, Nitro, React, Tailwind, and conditional Sentry sourcemap upload; Nitro uses the Vercel preset with `nodejs22.x` functions.
- `tsconfig.json` enforces strict TypeScript, ES2022 output, ES2024/DOM libraries, bundler resolution, exact optional properties, isolated modules, and no emit; `convex/tsconfig.json` applies the Convex-specific ESNext backend target.
- `convex/convex.config.ts`, `convex/auth.config.ts`, and `convex/schema.ts` mount components, define Convex environment types, trust Clerk JWTs, and compose domain tables.
- `vitest.config.ts`, `playwright.config.ts`, `playwright.deploy-smoke.config.ts`, `playwright.paid-operation.config.ts`, `components.json`, `.oxlintrc.json`, and `doctor.config.ts` configure verification and UI tooling.

## Platform Requirements

**Development:**
- Node.js 22 or newer and npm 11.5.1; `npm ci` uses the pinned graph in `package-lock.json`.
- Vite serves the application at `127.0.0.1:3000`; Playwright starts a separate `127.0.0.1:3020` server with `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E` only under the guarded non-production bypass in `src/lib/server/local-e2e-bypass.ts`.
- Convex deployment configuration is required for live backend calls; `convex-test` supplies isolated in-memory backends for tests in `tests/helpers/convex-fixtures.ts`.

**Production:**
- Vercel hosts the Nitro server bundle; `vite.config.ts` selects Node 22 functions, while `.vercel/project.json` records Node 24.x project metadata.
- Convex hosts the durable schema and server functions composed by `convex/schema.ts`; `.github/workflows/kernel-release-gate.yml` deploys the exact revision and performs hosted readback checks.

---

*Stack analysis: 2026-08-04*
