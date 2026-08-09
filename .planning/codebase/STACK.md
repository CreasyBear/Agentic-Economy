# Technology Stack

**Analysis Date:** 2026-08-09

## Languages

- TypeScript is the application and backend language. The project is strict, ESM-only, uses ES2022 output with DOM/ES2024 libraries, `noEmit`, bundler module resolution, and `@/*` plus `~/*` source aliases in `tsconfig.json` and `package.json`.
- TSX/JSX is the browser component language (`jsx: react-jsx`); representative route and root-component code lives in `src/routes/__root.tsx` and `src/components/ae/`.
- JavaScript is used for Node-side operational tooling and evaluations, primarily `.mjs` scripts such as `tools/dev/local-dev.mjs`, `tools/dev/papercut.mjs`, and `eval/engine/run-evaluation.mjs`; the package is declared as ESM in `package.json`.
- CSS is authored as Tailwind v4-compatible CSS with a semantic token bridge and explicit layer imports in `src/styles/globals.css`; `vite.config.ts` installs the Tailwind Vite plugin.
- YAML and JSON are configuration formats for CI, package/build tooling, and UI metadata (`.github/workflows/kernel-release-gate.yml`, `components.json`, `.oxlintrc.json`, and `package.json`).

## Runtime

- The supported runtime is Node.js 22.x, enforced by `package.json`, `.nvmrc`, and the explicit major-version guard in `tools/dev/local-dev.mjs`. The pinned package manager is npm 11.5.1 and the committed dependency lockfile is npm lockfile version 3 (`package.json`, `package-lock.json`).
- Vite's direct development server binds to `127.0.0.1:3000`; `npm run dev:local` supervises a local Convex deployment and launches Vite on `127.0.0.1:3024` by default (`vite.config.ts`, `tools/dev/local-dev.mjs`).
- Hosted server output is Nitro's Vercel preset with Node `nodejs22.x`, and the Vercel function entry format is Node rather than edge because raw webhook bodies and Node/WebCrypto signature verification are required (`vite.config.ts`). The checked-in Vercel project metadata currently reports `nodeVersion: 24.x`, so the deployment setting and repository/runtime pin are not presently aligned (`.vercel/project.json`, `package.json`, `vite.config.ts`).
- Browser execution is React 19.2.7 with DOM typings and a Chromium test matrix; Playwright supplies compact and wide Chromium projects and starts a separate Vite server on `127.0.0.1:3020` for E2E tests (`package.json`, `tsconfig.json`, `playwright.config.ts`).
- Convex supplies the reactive database/function runtime. Convex components for workflow, workpool, rate limiting, and aggregation are registered in `convex/convex.config.ts`; Node-only Convex actions are marked explicitly, for example the readiness probe in `convex/capabilitySupplyReadiness.ts`.

## Frameworks

- TanStack Start and TanStack Router provide the full-stack route/runtime layer, with Vite integration and Nitro server output (`package.json`, `vite.config.ts`, `src/start.ts`, `src/routes/`).
- React 19 provides the UI runtime; the component system uses Tailwind CSS v4, shadcn's `new-york` configuration, Radix primitives, and the shared CSS entrypoint (`package.json`, `components.json`, `src/styles/globals.css`).
- Convex is the server/data framework. The app schema composes module-owned table groups, while `convex/convex.config.ts` installs the required first-party components (`convex/schema.ts`, `convex/convex.config.ts`).
- Vitest is the Node test runner with repository setup files and TS path aliases; Playwright Test is the browser runner with separate deployment-smoke configs (`vitest.config.ts`, `playwright.config.ts`, `playwright.deploy-smoke.config.ts`).
- TypeScript, Vite, Tailwind's Vite plugin, Oxlint, and `tsx` form the build/type/lint/tooling layer; the available gates and their composition are declared in `package.json` and `.oxlintrc.json`.

## Key Dependencies

- Convex's client/server packages and `@convex-dev/{aggregate,rate-limiter,workflow,workpool}` are the persistence, scheduled-work, rate-limit, and aggregate primitives used by the application (`package.json`, `convex/convex.config.ts`, `convex/schema.ts`).
- The AI boundary is Vercel AI SDK plus `@openrouter/ai-sdk-provider`, `@ai-sdk/provider-utils`, and TanStack AI. AE centralizes model construction, structured-output options, web-plugin options, usage inclusion, and model selection in `src/modules/model-gateway/public.ts`; answer orchestration consumes that seam in `src/modules/answer/` (`package.json`, `src/modules/model-gateway/public.ts`).
- Clerk's TanStack Start integration provides browser/server identity and the Convex JWT bridge (`@clerk/tanstack-react-start`, `convex/auth.config.ts`, `src/routes/__root.tsx`, `src/lib/server/convex-source.ts`).
- Zod 4, `@cfworker/json-schema`, and `@apidevtools/json-schema-ref-parser` cover boundary/schema validation and OpenAPI normalization; the capability admission and contract modules use them (`package.json`, `src/modules/capability-supply/`, `src/modules/capability-contract/`).
- `undici` plus the in-repo network guard provide bounded, DNS-aware outbound HTTP; `@modelcontextprotocol/sdk` supplies the Streamable HTTP MCP adapter; x402 packages and `viem` isolate payment-required challenge validation/signing (`package.json`, `src/modules/network-guard/public.ts`, `src/lib/server/mcp-api.ts`, `src/modules/capability-supply/internal/x402-payment-signer.ts`).
- Sentry, PostHog, and their Vite/server/client packages provide the two observability integrations; React Testing Library, `convex-test`, and Promptfoo support component, Convex, and answer-evaluation coverage (`package.json`, `src/lib/observability/config.ts`, `src/start.ts`).

## Configuration

- TypeScript behavior and aliases are centralized in `tsconfig.json`; Vite/TanStack/Nitro/Tailwind/Sentry behavior is centralized in `vite.config.ts`; test aliases, environment, setup files, and included globs are centralized in `vitest.config.ts` and `playwright.config.ts`.
- `package.json` is the command registry for development, Convex codegen, unit/integration/evaluation/E2E/type/import/UI-contract gates, builds, and release proof. `.oxlintrc.json` defines the active Oxlint categories/plugins and excludes generated/fixture/vendor trees.
- `components.json` defines the shadcn aliases and CSS path; `src/styles/globals.css` is the active style entrypoint and imports the base reset, Tailwind theme/preflight/utilities, and animation layer.
- Convex environment declarations and component registration live in `convex/convex.config.ts`; the composed database table schema is in `convex/schema.ts`. Server-side callers resolve Convex URLs from `CONVEX_URL` or `VITE_CONVEX_URL` in `src/lib/server/convex-source.ts`.
- `.env.example` documents variable names and deployment roles without supplying real credentials. Generated/local/deployment outputs, secrets, and test reports are intentionally ignored by `.gitignore` (`.gitignore`, `.env.example`).

## Platform Requirements

- Local development requires Node 22 and npm 11.5.1. `npm run dev` is the standalone Vite process; `npm run dev:local` selects the local Convex deployment, starts `convex dev`, injects local-only source-write/admin settings, and supervises the Vite child (`package.json`, `tools/dev/local-dev.mjs`).
- Browser automation requires a Chromium-capable Playwright environment. The default E2E server is `127.0.0.1:3020`; local application development uses port 3000 or 3024 depending on the launcher (`playwright.config.ts`, `vite.config.ts`, `tools/dev/local-dev.mjs`).
- Hosted deployment targets Vercel's Node serverless runtime through Nitro and a separately deployed Convex backend. The release workflow installs from the lockfile, runs source/codegen proof, deploys the exact Vercel revision and Convex functions, then performs authenticated readback and hosted smoke checks (`vite.config.ts`, `.github/workflows/kernel-release-gate.yml`).
- CI must provide Node and npm pins from `.nvmrc`/`package.json`, uses `npm ci`, and supplies deployment-only credentials through GitHub Actions secrets; source proof intentionally runs without production deployment credentials (`.github/workflows/kernel-release-gate.yml`).
- The app needs a browser-capable frontend plus a reachable Convex deployment for server data/function calls. Clerk, model, provider, billing, notification, and observability settings are environment-driven rather than compiled into source (`convex/auth.config.ts`, `src/lib/server/convex-source.ts`, `.env.example`).

_Update note: Replaced during the 2026-08-09 current-dirty-tree codebase-map refresh; claims are source-grounded and environment values are intentionally omitted._

*Stack analysis: 2026-08-09*
