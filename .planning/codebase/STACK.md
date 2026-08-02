# Technology Stack

**Analysis Date:** 2026-08-02

## Languages

**Primary:**
- TypeScript 6.0.3 - Application, Convex functions, route handlers, tests, and operational tooling in `src/`, `convex/`, `tests/`, and `tools/`.

**Secondary:**
- JavaScript (ES modules) - Release and repository utilities such as `tools/release/*.mjs` and package scripts; `package.json` sets `"type": "module"`.
- CSS - Tailwind CSS layers and application styles in `src/styles/globals.css` and `src/styles/legacy.css`.
- JSON/YAML - Package, tool, route-contract, and CI configuration in `package.json`, `tsconfig.json`, `vite.config.ts`, and `.github/workflows/`.

## Runtime

**Environment:**
- Node.js >=22 - Local scripts, Nitro server functions, Convex actions, and CI (`package.json`, `vite.config.ts`, `.github/workflows/kernel-release-gate.yml`).
- Browser - React client rendering, Web Crypto, Fetch, streams, and browser storage used by `src/routes/` and `src/components/`.

**Package Manager:**
- npm 11.5.1 - Declared by `package.json` and installed explicitly by the release workflow.
- Lockfile: present - `package-lock.json` uses lockfile version 3 and records the resolved dependency graph.

## Frameworks

**Core:**
- React 19.2.7 and React DOM 19.2.7 - UI runtime in `src/`.
- TanStack Start 1.168.26 - SSR, server functions, request middleware, and application startup in `src/start.ts`.
- TanStack Router 1.170.16 - File-based typed routes and server handlers in `src/routes/` and generated `src/routeTree.gen.ts`.
- Convex 1.42.0 - Durable database, queries, mutations, actions, scheduling, and generated API in `convex/`.

**Testing:**
- Vitest 4.1.9 - Unit, integration, type, import-boundary, SEO, and UI-contract suites configured by `vitest.config.ts`.
- Playwright 1.61.1 - Browser and hosted deployment smoke tests configured by `playwright.config.ts`, `playwright.deploy-smoke.config.ts`, and `playwright.paid-operation.config.ts`.
- `convex-test` 0.0.54 - In-memory Convex function tests in `convex/*.test.ts` and `tests/`.

**Build/Dev:**
- Vite 8.1.0 - Development server and production bundling in `vite.config.ts`; local application port is configured there.
- Nitro 3.0.1-20260628-090458-3df69609 - Vercel server bundle through `nitro/vite` in `vite.config.ts`.
- Tailwind CSS 4.3.1 - CSS processing through `@tailwindcss/vite` and `src/styles/globals.css`.

## Key Dependencies

**Critical:**
- `@clerk/tanstack-react-start` 1.4.9 - Authentication middleware, server identity, and owner/API-key access in `src/start.ts` and `src/lib/server/`.
- `ai` 7.0.44 and `@openrouter/ai-sdk-provider` 3.0.0 - Central model transport and structured/tool output seam in `src/modules/model-gateway/public.ts`.
- `@modelcontextprotocol/sdk` 1.30.0 - Streamable HTTP MCP server in `src/lib/server/mcp-api.ts` and `src/routes/mcp.ts`.
- `@x402/core`, `@x402/evm`, and `@x402/extensions` 2.18.0 - Payment-challenged provider transport and EVM signing in `src/modules/capability-supply/`.
- `zod` 4.4.3, `ajv` 8.20.0, and `@cfworker/json-schema` 4.1.1 - Runtime validation and contract/schema checks across `src/modules/` and `convex/`.

**Infrastructure:**
- `@convex-dev/workflow` 0.4.4 and `@convex-dev/workpool` 0.4.9 - Durable workflows and bounded asynchronous work mounted in `convex/convex.config.ts`.
- `@convex-dev/rate-limiter` 0.3.2 and `@convex-dev/aggregate` 0.2.2 - Durable admission limits and aggregate projections used by `convex/lib/rateLimit.ts` and `convex/observability.ts`.
- `@sentry/node` and `@sentry/react` 10.63.0 - Server and browser errors/tracing in `src/lib/observability/`.
- `posthog-node` 5.39.0 and `posthog-js` 1.398.2 - Server/client product analytics in `src/lib/observability/`.
- `viem` 2.55.2, `@noble/curves` 1.9.1, and `@noble/hashes` 1.8.0 - EVM accounts, signatures, attestations, and digests in `src/modules/`.

## Configuration

**Environment:**
- `.env.example` is the checked-in environment contract; `.env` and `.env.*` are ignored by `.gitignore` except for the example file.
- Core names include `VITE_CONVEX_URL`, `CONVEX_URL`, `VITE_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, and `CLERK_JWT_ISSUER_DOMAIN`; provider and telemetry names are grouped in `.env.example`.
- Convex-deployed names are validated in `convex/convex.config.ts`; browser-visible values use the `VITE_` prefix while server-only credentials do not.

**Build:**
- `vite.config.ts` composes TanStack Start, Nitro, React, Tailwind, and conditional Sentry sourcemap upload; the Vercel function runtime is `nodejs22.x`.
- `tsconfig.json` enforces strict TypeScript, ES2022 output, ES2024/DOM libraries, bundler resolution, exact optional properties, and no emit.
- `convex/convex.config.ts`, `convex/auth.config.ts`, and `convex/schema.ts` define backend components, Clerk JWT trust, environment types, and data tables.
- `vitest.config.ts`, `playwright.config.ts`, `playwright.deploy-smoke.config.ts`, `components.json`, `.oxlintrc.json`, and `doctor.config.ts` configure verification and UI tooling.

## Platform Requirements

**Development:**
- Node.js 22 or newer and npm 11.5.1; install from `package-lock.json` with `npm ci` for the CI-equivalent dependency graph.
- A local environment based on `.env.example`; Vite serves the app on `127.0.0.1:3000`, while Playwright starts an isolated server on `127.0.0.1:3020` with a guarded local auth bypass.
- Convex development credentials/deployment access are required for live backend operations; in-memory tests use `convex-test` instead.

**Production:**
- Vercel hosts the Nitro server bundle with Node.js 22 as configured in `vite.config.ts`; Convex hosts the durable backend deployed by `.github/workflows/kernel-release-gate.yml`.
- GitHub Actions runs the source gate on Node 22, deploys the exact revision to Vercel and Convex, reads deployment environment settings, and executes hosted readback smoke paths.

---

*Stack analysis: 2026-08-02*
