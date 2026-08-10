# Technology Stack

**Analysis Date:** 2026-08-09

## Languages

- TypeScript is the application, server, Convex, and tooling language. `tsconfig.json` enables strict checking, exact optional properties, unchecked-index protection, ES2022 output targeting, ESM modules, bundler resolution, and `@/*`/`~/*` aliases.
- TSX/JSX is used by the React application and TanStack route components, including `src/routes/__root.tsx` and `src/components/ae/`.
- Node-oriented JavaScript and TypeScript tools are ESM scripts (`tools/**/*.mjs`, `tools/**/*.ts`, `eval/**/*.mjs`, and `eval/**/*.ts`); `package.json` sets `"type": "module"`.
- CSS is Tailwind CSS v4-compatible CSS with semantic tokens and layered imports in `src/styles/globals.css`; JSON/YAML configure packages, UI scaffolding, and CI (`components.json`, `.oxlintrc.json`, `.github/workflows/kernel-release-gate.yml`).

## Runtime

- The supported runtime is Node.js 22.x (`package.json` engines, `.nvmrc`, and the guard in `tools/dev/local-dev.mjs`). npm 11.5.1 is pinned by `package.json`; `package-lock.json` is the npm lockfile v3.
- `npm run dev` launches Vite on port 3000. `npm run dev:local` selects local Convex, supervises `convex dev`, and launches the Vite child on port 3024 by default (`tools/dev/local-dev.mjs`, `vite.config.ts`).
- Hosted output uses Nitro's Vercel preset with Node serverless functions and `nodejs22.x` (`vite.config.ts`). Checked-in Vercel metadata currently says Node 24.x (`.vercel/project.json`), so deployment metadata and repository runtime pins are not aligned.
- Convex is the reactive database/function runtime. Components for workflow, workpool, rate limiting, and the owner-activation aggregate are registered in `convex/convex.config.ts`; Node-only actions are kept in Convex action modules.
- Playwright's local browser server defaults to port 3020 and runs compact and wide Chromium projects (`playwright.config.ts`).

## Frameworks

- TanStack Start and TanStack Router provide full-stack routing and server handlers (`src/start.ts`, `src/router.tsx`, `src/routes/`, `vite.config.ts`).
- React 19.2.7 and React DOM 19.2.7 provide the browser runtime. Tailwind CSS v4, shadcn's `new-york` setup, Radix UI, and Lucide supply the component/styling layer (`package.json`, `components.json`, `src/styles/globals.css`).
- Vite 8, Nitro, the React Vite plugin, Tailwind Vite plugin, and optional Sentry Vite plugin compose the build (`vite.config.ts`).
- Vitest is the Node test runner; Playwright Test is the browser runner; Promptfoo and Braintrust support answer-evaluation tooling (`vitest.config.ts`, `playwright.config.ts`, `eval/answer/`, `eval/braintrust/`).

## Key Dependencies

- `convex` plus `@convex-dev/workflow`, `@convex-dev/workpool`, `@convex-dev/rate-limiter`, and `@convex-dev/aggregate` provide durable state, jobs, rate admission, and aggregation (`package.json`, `convex/convex.config.ts`, `convex/schema.ts`).
- `ai`, `@openrouter/ai-sdk-provider`, `@ai-sdk/provider-utils`, and `@tanstack/ai` form the model/streaming boundary; model construction is centralized in `src/modules/model-gateway/public.ts`.
- `@clerk/tanstack-react-start` bridges Clerk browser/server identity into TanStack Start and Convex (`src/start.ts`, `src/routes/__root.tsx`, `convex/auth.config.ts`).
- Zod 4, `@cfworker/json-schema`, and `@apidevtools/json-schema-ref-parser` validate API, capability, OpenAPI, and publication boundaries (`src/modules/capability-supply/`, `src/modules/capability-contract/`).
- `undici` and `src/modules/network-guard/public.ts` provide bounded, DNS-vetted outbound HTTP; `@modelcontextprotocol/sdk` provides Streamable HTTP MCP; `@x402/core`, `@x402/evm`, `@x402/extensions`, and `viem` isolate x402 payment handling.
- `@sentry/node`, `@sentry/react`, `posthog-node`, and `posthog-js` provide error and funnel telemetry (`src/lib/observability/`).

## Configuration

- Compiler behavior and aliases are in `tsconfig.json`; Vite/TanStack/Nitro/Tailwind/Sentry behavior is in `vite.config.ts`; test aliases and setup are in `vitest.config.ts` and `playwright.config.ts`.
- `package.json` is the command registry for development, Convex codegen, release proof, evaluation, browser runs, and source checks. `.oxlintrc.json` defines lint scope and exclusions.
- `convex/schema.ts` composes module-owned tables; `convex/convex.config.ts` registers Convex components and the typed Convex environment subset.
- `.env.example` documents variable names and deployment roles only. `src/lib/deployment/manifest.ts` and `tools/release/verify-deployment-manifest.ts` validate production, preview, development, and test configuration without exposing values.

## Platform Requirements

- Local development requires Node 22, npm 11.5.1, a reachable local Convex deployment, and a Chromium-capable environment for browser smoke (`.nvmrc`, `tools/dev/local-dev.mjs`, `playwright.config.ts`).
- Local E2E may use `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E` plus a self-hosted Convex admin credential; `src/lib/server/local-e2e-bypass.ts` fails closed if that bypass is enabled in production.
- Hosted production requires Vercel's Node runtime plus a separately deployed Convex backend, Clerk configuration, and deployment-manifest authorities (`vite.config.ts`, `src/lib/deployment/manifest.ts`). No separate staging product is declared; Vercel preview is the supported pre-production mode.
- `.github/workflows/kernel-release-gate.yml` installs the pinned Node/npm toolchain, runs source proof in development mode, and gates main-branch hosted proof/deployment in the production environment.

_Stack refresh: 2026-08-09; source/config paths were re-read from the current dirty tree and environment values were intentionally omitted._
