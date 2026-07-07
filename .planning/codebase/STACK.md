# Technology Stack

**Analysis Date:** 2026-07-07

## Languages

**Primary:**
- TypeScript 6.0.3 - application, Convex functions, tests, scripts, and route handlers (`package.json`, `tsconfig.json`, `src/`, `convex/`, `tests/`).
- TSX / React 19.2.7 - public pages, operator UI, and reusable UI components (`src/routes/`, `src/components/`, `src/app/`).

**Secondary:**
- CSS - Tailwind v4 entry styles and design tokens (`src/styles/base.css`, `src/styles/globals.css`, `src/styles/tokens.css`, `src/styles/legacy.css`).
- JavaScript - generated Convex API files only (`convex/_generated/api.js`, `convex/_generated/server.js`).

## Runtime

**Environment:**
- Node.js 20.x - documented local/production target; Nitro is configured for Vercel `nodejs20.x` serverless functions (`docs/ONBOARDING.md`, `vite.config.ts`).
- Browser runtime - React client routes/components, Clerk provider, Convex React client, Sentry/PostHog browser observability (`src/routes/__root.tsx`, `src/modules/inquiries/customer-record-client.tsx`, `src/lib/observability/sentry.client.ts`, `src/lib/observability/posthog.client.ts`).
- Convex Cloud runtime - durable backend functions and schema under `convex/`; Convex codegen output is generated under `convex/_generated/` (`convex/schema.ts`, `convex/auth.config.ts`, `convex/_generated/`).

**Package Manager:**
- npm 11.5.1 - pinned by `packageManager` in `package.json`.
- Lockfile: present, npm lockfile v3 (`package-lock.json`).

## Frameworks

**Core:**
- TanStack React Start 1.168.26 - full-stack React routing/server handlers via file routes (`package.json`, `src/router.tsx`, `src/routes/`).
- TanStack React Router 1.170.16 - route tree and generated route metadata (`package.json`, `src/routeTree.gen.ts`).
- React 19.2.7 / React DOM 19.2.7 - UI runtime (`package.json`, `src/components/`, `src/routes/`).
- Convex 1.42.0 - backend database, functions, auth config, codegen, and source-of-truth state (`package.json`, `convex/`, `src/lib/server/convex-source.ts`).
- Vite 8.1.0 - dev/build pipeline (`package.json`, `vite.config.ts`).
- Nitro nightly 3.0.1 - TanStack Start server output with Vercel preset (`package.json`, `vite.config.ts`).

**Testing:**
- Vitest 4.1.9 - unit, integration, type-contract, copy, SEO, import-boundary, eval, and scanner tests (`vitest.config.ts`, `package.json`, `tests/`).
- Playwright 1.61.1 - browser E2E, accessibility, and deployed/provider smoke tests (`playwright.config.ts`, `playwright.deploy-smoke.config.ts`, `tests/e2e/`, `tests/deploy-smoke/`).
- Testing Library React 16.3.2 and Jest DOM 6.9.1 - component-oriented assertions (`package.json`, `tests/unit/`).
- promptfoo 0.121.17 - answer-pipeline eval validation and eval runs (`package.json`, `eval/answer/promptfooconfig.yaml`).

**Build/Dev:**
- `@tanstack/react-start/plugin/vite` - React Start Vite integration (`vite.config.ts`).
- `@vitejs/plugin-react` 6.0.3 - React transform (`vite.config.ts`).
- `@tailwindcss/vite` 4.3.1 and Tailwind CSS 4.3.1 - styling pipeline (`vite.config.ts`, `src/styles/`).
- `@sentry/vite-plugin` 5.3.0 - optional source-map upload when Sentry build env exists (`vite.config.ts`).
- tsx 4.20.5 - TypeScript script runner for eval/audit/test scripts (`package.json`, `eval/answer/scripts/`, `examples/agent-experience/run-audit.ts`).

## Package Scripts

**Development:**
- `npm run dev` - `vite dev --host 127.0.0.1` (`package.json`).
- `npm run seed:dev` - `convex run devSeed:seedDevCatalog` (`package.json`, `convex/devSeed.ts`).
- `npm run start` - `vite start` (`package.json`).

**Build / static gates:**
- `npm run build` - `vite build` (`package.json`).
- `npm run typecheck` - `tsc --noEmit` (`package.json`, `tsconfig.json`).
- `npm run check:convex-codegen` - `convex codegen --dry-run --typecheck=disable` (`package.json`).

**Tests:**
- `npm test` - all Vitest tests matching `tests/**/*.test.ts(x)` (`package.json`, `vitest.config.ts`).
- `npm run test:unit`, `npm run test:integration`, `npm run test:types`, `npm run test:copy`, `npm run test:imports`, `npm run test:source-mining`, `npm run test:ts-standards`, `npm run test:seo` - focused local gates (`package.json`).
- `npm run test:e2e`, `npm run test:a11y` - local browser gates with Playwright-managed Vite server on port 3020 (`package.json`, `playwright.config.ts`).
- `npm run test:eval`, `npm run test:eval:validate`, `npm run test:eval:live-api` - answer eval and live API study gates (`package.json`, `eval/answer/`).
- `npm run test:all` - broad local gate: typecheck, Convex codegen, unit, integration, types, imports, source-mining, TS standards, copy, SEO, and build (`package.json`).
- `npm run test:release` - release gate: typecheck, Convex codegen, unit, integration, eval, graph freshness, copy, E2E, accessibility, and build (`package.json`).
- Provider/deploy smokes are explicit and fail-loud: `test:deploy-smoke`, `test:provider-smoke:resend`, `test:provider-smoke:novu`, `test:provider-smoke:autumn-stripe`, `test:provider-smoke:business-action-stripe`, `test:provider-smoke:capability-check` (`package.json`, `playwright.deploy-smoke.config.ts`, `tests/deploy-smoke/`).

## Key Dependencies

**Critical:**
- `convex` 1.42.0 - source-of-truth database/functions and generated client contracts (`convex/`, `src/lib/server/convex-source.ts`).
- `@clerk/tanstack-react-start` 1.4.9 - route auth middleware and server auth tokens for Convex (`src/start.ts`, `src/lib/server/convex-source.ts`, `convex/auth.config.ts`).
- `zod` 4.4.3 - action input/output schemas, route validation, and DTO contracts (`src/modules/common/action.ts`, `src/modules/*/*.actions.ts`).
- `web-bot-auth` 0.1.3 - assistant request signature verification for the quiet agent door (`src/modules/clearance/internal/web-bot-auth.ts`, `src/routes/api.agent.tools.ts`).
- `handshake-protocol-kernel` 0.4.0, `@noble/curves`, `@noble/hashes` - clearance/identity spike runtime and cryptographic primitives (`convex/spikeHandshakeRuntime.ts`, `package.json`).
- `undici` 7.28.0 - fetch/server HTTP compatibility dependency (`package.json`).

**Infrastructure:**
- `@sentry/node`, `@sentry/react`, `@sentry/vite-plugin` - error capture and build-source-map integration (`src/lib/observability/sentry.server.ts`, `src/lib/observability/sentry.client.ts`, `vite.config.ts`).
- `posthog-js`, `posthog-node` - funnel analytics on browser and server (`src/lib/observability/posthog.client.ts`, `src/lib/observability/posthog.server.ts`).
- `atmn` - Autumn CLI/development integration; runtime Autumn calls use local HTTP provider seams, not an SDK client (`package.json`, `src/lib/server/billing-provider.ts`, `src/modules/billing/server.ts`).
- `@astryxdesign/core`, `@astryxdesign/theme-neutral`, `@astryxdesign/cli` - Astryx design-system runtime and CLI (`package.json`, `vite.config.ts`, `src/components/astryx/`).
- `lucide-react`, `motion`, `@tanstack/react-table`, `clsx`, `tailwind-merge`, `tw-animate-css` - UI icons, animation, data tables, class composition, and Tailwind helpers (`package.json`, `src/components/`).

## Configuration

**Environment:**
- Tracked env names live in `.env.example`; local secrets live in ignored `.env.local` and are not read into docs (`.env.example`, `.gitignore`, `.env.local` present).
- Required local baseline: `VITE_CONVEX_URL`, `VITE_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `CLERK_JWT_ISSUER_DOMAIN`, and non-production `AE_SOURCE_WRITE_SECRET` when exercising mutating source-write flows (`docs/ONBOARDING.md`, `.env.example`).
- Production source-write admission uses scoped key families such as `AE_SOURCE_WRITE_KEY_INQUIRY`, `AE_SOURCE_WRITE_KEY_BILLING`, `AE_SOURCE_WRITE_KEY_PROTECTED`, `AE_SOURCE_WRITE_KEY_CLAIM`, `AE_SOURCE_WRITE_KEY_OPERATOR`, `AE_SOURCE_WRITE_KEY_REPAIR`, and `AE_SOURCE_WRITE_KEY_SESSION` plus previous-key rotation vars (`.env.example`, `src/lib/server/source-write-admission.ts`).
- Feature-gated env families cover WBA dev smoke, canonical URL/CSP, Autumn/Stripe billing, Resend/Novu notification providers, OpenRouter answer LLM, MeiliSearch mirror, Sentry/PostHog observability, local E2E/observability bypasses, and Google Maps embeds (`.env.example`, `docs/ONBOARDING.md`).

**Build:**
- Vite config enables React Start, Nitro Vercel Node preset, React plugin, Tailwind plugin, tsconfig paths, Astryx SSR bundling, and optional Sentry plugin/source maps (`vite.config.ts`).
- TypeScript is strict with `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `useUnknownInCatchVariables`, `noImplicitOverride`, bundler module resolution, `@/*` and `~/*` aliases, and includes `src/`, `convex/`, `tests/`, and config files (`tsconfig.json`).
- Vitest uses Node environment, no globals, no watch, and test files under `tests/**/*.test.ts(x)` (`vitest.config.ts`).
- Playwright local E2E runs compact and wide Chromium projects and starts Vite with `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E=true` (`playwright.config.ts`).

## Platform Requirements

**Development:**
- Use Node.js 20.x and npm 11.5.1 (`docs/ONBOARDING.md`, `package.json`).
- Run `npx convex dev` to link/create a Convex deployment and generate/update `convex/_generated/` before app work that needs real data (`docs/ONBOARDING.md`, `convex/`).
- Use `npm run dev` for local app server and `npm run seed:dev` for seed catalog data (`docs/ONBOARDING.md`, `package.json`).
- No ESLint, Prettier, or Biome config is committed in the repo root; enforcement is via TypeScript, Vitest scanners, copy gates, import-boundary gates, and build scripts (`package.json`, `docs/ONBOARDING.md`).

**Production:**
- Deployment target is Vercel Node serverless through Nitro `preset: 'vercel'`, `entryFormat: 'node'`, `runtime: 'nodejs20.x'` (`vite.config.ts`).
- Webhook and provider routes rely on raw `Request` bodies and Node/WebCrypto-compatible verification, so the configured runtime is Node serverless rather than edge (`vite.config.ts`, `src/routes/api.billing.webhook.ts`, `src/routes/api.business-actions.stripe-webhook.ts`, `src/routes/api.notification.resend-webhook.ts`).
- Convex Cloud stores durable application state and enforces Clerk JWT issuer configuration (`convex/schema.ts`, `convex/auth.config.ts`).
- Sentry build uploads/source maps only activate when `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, and `SENTRY_PROJECT` are present (`vite.config.ts`).

---

*Stack analysis: 2026-07-07*
