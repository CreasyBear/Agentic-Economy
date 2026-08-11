# Technology Stack
**Analysis Date:** 2026-08-11

## Languages
- TypeScript is the application and backend language (`tsconfig.json`, `src/**/*.ts`, `convex/**/*.ts`), with strict checking, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, and no emitted JavaScript.
- TSX renders the React UI (`src/**/*.tsx`); the package is native ESM (`package.json` `type: module`).
- JavaScript/MJS remains the scripting language for local tooling and evaluation (`tools/**/*.mjs`, `eval/**/*.mjs`); CSS/Tailwind and YAML are used for styling and CI/evaluation configuration.

## Runtime
- Node.js 22.x is the supported runtime: `.nvmrc` contains `22`, `package.json` requires `engines.node: 22.x`, and `tools/dev/local-dev.mjs` rejects other major versions.
- npm 11.5.1 is the pinned package manager (`package.json` `packageManager`); `package-lock.json` is lockfile version 3 and is installed with `npm ci` in CI.
- The local Vite server defaults to `127.0.0.1:3000`; `npm run dev:local` starts Convex development plus Vite on `127.0.0.1:3024` (`vite.config.ts`, `tools/dev/local-dev.mjs`).
- Browser code targets the React/Vite client while TanStack Start/Nitro run server handlers on Node. No separate runtime is declared for edge execution.

## Frameworks
- React 19.2.7 with React DOM 19.2.7 is the UI runtime (`package-lock.json`).
- TanStack Start 1.168.26 and TanStack Router 1.170.16 provide SSR/server handlers and file-based routing (`src/start.ts`, `src/routes/`, `vite.config.ts`).
- Convex 1.42.0 supplies the TypeScript backend and database client/server runtime (`convex/schema.ts`, `src/lib/server/convex-source.ts`).
- Vite 8.1.0 is the build/dev tool. The Vite plugins combine TanStack Start, Nitro, React, and Tailwind CSS (`vite.config.ts`).
- Nitro nightly `3.0.1-20260628-090458-3df69609` targets Vercel with Node serverless functions; the Vite config explicitly sets Vercel `nodejs22.x` (`vite.config.ts`).
- Tailwind CSS 4.3.1 is loaded through `@tailwindcss/vite` and `src/styles/globals.css`; shadcn metadata is in `components.json`.

## Key Dependencies
- `ai` 7.0.44 and `@openrouter/ai-sdk-provider` 3.0.0 provide the single model gateway (`src/modules/model-gateway/public.ts`).
- `@clerk/tanstack-react-start` 1.4.9 provides Clerk server/client integration (`src/start.ts`, `convex/auth.config.ts`).
- `@modelcontextprotocol/sdk` 1.30.0 supports MCP server/client protocol paths (`src/routes/mcp.ts`, `src/lib/server/mcp-api.ts`).
- `@x402/core`, `@x402/evm`, and `@x402/extensions` are 2.18.0 and support paid HTTP operation settlement (`src/modules/capability-supply/internal/x402-payment-signer.ts`).
- `zod` 4.4.3 is the runtime schema/validation dependency across route and domain boundaries.
- `@sentry/node`/`@sentry/react` 10.63.0 and `posthog-node` 5.39.0/`posthog-js` 1.398.2 provide optional observability (`src/lib/observability/`).
- Vitest 4.1.9 and Playwright 1.61.1 provide unit/integration and browser runners (`vitest.config.ts`, `playwright.config.ts`).

## Configuration
- `tsconfig.json` uses ES2022 output semantics, ES2024 library types, bundler module resolution, `@/*` and `~/*` aliases to `src`, JSX automatic runtime, and includes `src`, `convex`, `tests`, and the Vite/Vitest/Playwright configs.
- `vite.config.ts` enables Vite 8 dependency optimization, TanStack Start, Nitro Vercel preset, React, and Tailwind. Build sourcemaps are enabled only when the Sentry build variables are complete (`SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`); the Sentry plugin is otherwise omitted.
- `npm run build` invokes `vite build`; `npm run dev` invokes Vite directly; `npm run dev:local` wraps `convex dev` and the local Vite process. `npm run typecheck` invokes `tsc --noEmit`.
- `vitest.config.ts` runs Node-environment tests from `tests/**/*.test.ts(x)` and `convex/**/*.test.ts` with four setup files. `playwright.config.ts` runs compact and wide Chromium projects and starts local Vite unless `PLAYWRIGHT_BASE_URL` is supplied.
- `.env.example` documents names only. The deployment manifest (`src/lib/deployment/manifest.ts`) validates environment groups and rejects incomplete production configuration before release operations.

## Platform Requirements
- Development and CI require Node.js 22.x, npm 11.5.1, a frozen install from `package-lock.json`, and a browser for Playwright checks.
- Runtime access requires a Convex deployment URL (`CONVEX_URL` or `VITE_CONVEX_URL`) plus Clerk issuer/auth configuration for authenticated calls; local self-hosted/E2E paths additionally use `CONVEX_SELF_HOSTED_ADMIN_KEY` and the explicit local bypass.
- Production builds target Vercel Node serverless functions through Nitro. `.vercel/project.json` currently records Vercel `nodeVersion: 24.x`, which conflicts with the repository’s Node 22 requirement and `vite.config.ts`’s `nodejs22.x` target; deployment metadata should be reconciled before relying on hosted builds.

---
*Stack analysis: 2026-08-11*
*Update after major dependency changes*
