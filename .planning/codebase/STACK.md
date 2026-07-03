# Technology Stack

**Analysis Date:** 2026-07-03

## Languages

**Primary:**
- TypeScript 6.0.3 - application routes, domain modules, Convex functions, tests, and config in `src/`, `convex/`, `tests/`, `vite.config.ts`, `vitest.config.ts`, and `playwright.config.ts`.
- TSX / React 19.2.7 - public, owner, admin, inquiry, billing, answer-thread, and business-action UI in `src/routes/`, `src/components/`, and `src/app/`.

**Secondary:**
- CSS / Tailwind CSS 4.3.1 - Tailwind 4 and Astryx theme CSS enter through `src/styles/globals.css`, with compatibility tokens in `src/styles/tokens.css`.
- YAML - Promptfoo eval config in `eval/answer/promptfooconfig.yaml` and GitHub Actions CI in `.github/workflows/eval-gate.yml`.
- JavaScript / MJS - eval providers and assertions in `eval/answer/providers/` and `eval/answer/assertions/`.
- XML/plain-text response generation - route handlers for `src/routes/sitemap[.]xml.ts`, `src/routes/robots[.]txt.ts`, and `src/routes/llms[.]txt.ts`.

## Runtime

**Environment:**
- Node.js - server-side runtime for TanStack Start/Nitro, scripts in `package.json`, and Node APIs in `src/lib/server/billing-provider.ts`, `src/lib/server/notification-provider.ts`, and `src/modules/business-action/internal/stripe-checkout.ts`.
- CI pins Node 20 in `.github/workflows/eval-gate.yml`; `package.json` has no `engines` field, `.nvmrc`, or `.node-version`.
- Local scan observed Node `v26.4.0` and npm `11.17.0`; this is not a project pin.
- Browser - React/TanStack Router client runtime bootstrapped by `src/routes/__root.tsx`, `src/router.tsx`, and generated `src/routeTree.gen.ts`.
- Convex - backend/runtime for persisted source state and scheduled jobs under `convex/`, with application server code calling through `src/lib/server/convex-source.ts`.

**Package Manager:**
- npm 11.5.1 - declared by `package.json` `packageManager`.
- Lockfile: present as `package-lock.json` lockfile version 3.
- Not detected: `pnpm-lock.yaml`, `yarn.lock`, `bun.lock`, `bun.lockb`.

## Frameworks

**Core:**
- React 19.2.7 - UI rendering for route components in `src/routes/`, shared components in `src/components/`, and app pages in `src/app/`.
- TanStack Start 1.168.26 - full-stack runtime, request middleware, route handlers, and server functions in `src/start.ts`, `src/routes/api.answer.turn.ts`, `src/modules/billing/billing.functions.ts`, and `src/modules/inquiries/inquiry.functions.ts`.
- TanStack Router 1.170.16 - file routes via `createFileRoute`, generated route tree in `src/routeTree.gen.ts`, router setup in `src/router.tsx`, and root document wiring in `src/routes/__root.tsx`.
- Nitro nightly (`npm:nitro-nightly@^3.0.1-20260628-090458-3df69609`) - Start server output plugin configured in `vite.config.ts`.
- Convex 1.42.0 - source database schema in `convex/schema.ts`, auth issuer config in `convex/auth.config.ts`, domain functions in `convex/*.ts`, source-write admission in `convex/sourceWriteAdmission.ts`, and crons in `convex/crons.ts`.
- Clerk TanStack Start 1.4.9 - auth provider and request middleware in `src/routes/__root.tsx`, `src/start.ts`, `src/routes/sign-in.$.tsx`, `src/routes/sign-up.$.tsx`, `src/lib/server/require-operator-session.ts`, and `src/lib/server/claim-owner-session.ts`.
- Astryx Design 0.1.2 - primary UI primitive and neutral theme layer via `@astryxdesign/core` and `@astryxdesign/theme-neutral`; root providers are in `src/routes/__root.tsx`.

**Testing:**
- Vitest 4.1.9 - unit, integration, type, copy, UI-contract, import-boundary, SEO, and eval-adjacent tests configured by `vitest.config.ts` and scripts in `package.json`.
- Playwright 1.61.1 - local E2E and deployed provider smoke tests configured by `playwright.config.ts` and `playwright.deploy-smoke.config.ts`.
- Testing Library React 16.3.2 and jest-dom 6.9.1 - React DOM assertions for tests under `tests/unit/` and `tests/integration/`.
- Promptfoo 0.120.3 - answer gate and follow-up chip eval configured in `eval/answer/promptfooconfig.yaml`.
- React Doctor 0.5.8 - diagnostics exposed by the `doctor` script in `package.json` with config in `doctor.config.ts`.

**Build/Dev:**
- Vite 8.1.0 - dev server, build, SSR bundling, and plugin pipeline in `vite.config.ts`.
- `@tanstack/react-start/plugin/vite` - Start plugin in `vite.config.ts`.
- `nitro/vite` - server output plugin in `vite.config.ts`.
- `@vitejs/plugin-react` 6.0.3 - React plugin in `vite.config.ts`.
- `@tailwindcss/vite` 4.3.1 - Tailwind 4 Vite plugin in `vite.config.ts`.
- `tsx` 4.20.5 - TypeScript script runner for eval/report scripts in `package.json`.
- `atmn` 1.1.10 - Autumn product/pricing DSL in `autumn.config.ts`.
- `@astryxdesign/cli` 0.1.2 - design-system CLI dependency declared in `package.json`.

## Key Dependencies

**Critical:**
- `@tanstack/react-start` 1.168.26 - owns request middleware, server functions, and route handlers; central files are `src/start.ts`, `src/routes/__root.tsx`, and `src/routes/api.answer.turn.ts`.
- `@tanstack/react-router` 1.170.16 - owns file routes and navigation; central files are `src/router.tsx`, `src/routeTree.gen.ts`, and `src/routes/`.
- `convex` 1.42.0 - source-state persistence and backend functions; central files are `convex/schema.ts`, `convex/auth.config.ts`, `convex/sourceWriteAdmission.ts`, and `src/lib/server/convex-source.ts`.
- `@clerk/tanstack-react-start` 1.4.9 - sign-in/sign-up, request auth, and Convex token retrieval; central files are `src/start.ts`, `src/routes/__root.tsx`, and `src/lib/server/convex-source.ts`.
- `zod` 4.4.3 - input/output schemas for actions, server functions, route payloads, and answer artifacts; examples are `src/modules/registry/registry.actions.ts`, `src/modules/inquiries/inquiry.functions.ts`, and `src/modules/answer/answer-schema.ts`.
- `@tanstack/ai` 0.38.0 - JSON Schema/tool-contract conversion for action and harness tools in `src/modules/common/action.ts`, `src/modules/harness/tool-contract.ts`, and `src/modules/harness/strict-schema.ts`.
- `@astryxdesign/core` and `@astryxdesign/theme-neutral` 0.1.2 - current component and theme system in `src/routes/__root.tsx` and `src/styles/globals.css`.

**Infrastructure:**
- `@sentry/node`, `@sentry/react`, and `@sentry/vite-plugin` - server/client error tracking, router tracing, replay-on-error, and optional sourcemap upload in `src/lib/observability/sentry.server.ts`, `src/lib/observability/sentry.client.ts`, and `vite.config.ts`.
- `posthog-js` and `posthog-node` - browser/server analytics in `src/lib/observability/posthog.client.ts`, `src/lib/observability/posthog.server.ts`, and `src/routes/api.observability.funnel.ts`.
- `promptfoo` - answer-eval CLI used by `eval/answer/promptfooconfig.yaml` and `package.json` scripts.
- `@playwright/test` - browser E2E and deployed smoke tests under `tests/e2e/` and `tests/deploy-smoke/`.
- `motion` 12.42.0 - UI animation dependency used by components under `src/components/`.
- `lucide-react` 1.21.0 - icon set used across `src/routes/` and `src/components/`.
- `@tanstack/react-table` 8.21.3 - table dependency declared in `package.json`; inspect local usage before adding data-table code.
- `clsx`, `tailwind-merge`, and `tw-animate-css` - styling helpers and animation utilities, including `src/lib/utils.ts`.

## Configuration

**Environment:**
- Environment files present: `.env`, `.env.local`, and `.env.example`; contents were not read. `.gitignore` excludes `.env` and `.env.*` while allowing `.env.example`.
- Convex config uses `CONVEX_URL` or `VITE_CONVEX_URL` in `src/lib/server/convex-source.ts` and `CLERK_JWT_ISSUER_DOMAIN` in `convex/auth.config.ts`.
- Clerk local bypass uses `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E` in `src/start.ts`, `src/routes/__root.tsx`, and multiple source readback seams; it throws in production.
- Source-write admission requires server-only `AE_SOURCE_WRITE_SECRET` in `src/lib/server/source-write-admission.ts` and `convex/sourceWriteAdmission.ts`.
- OpenRouter answer mode uses `OPENROUTER_API_KEY`, `AE_LLM_MODEL`, `AE_LLM_MODELS`, `AE_SITE_URL`, `SITE_URL`, `AE_ANSWER_EVAL_PASSED`, and `AE_ALLOW_CHAT_API` in `src/modules/answer/internal/llm-config.ts`, `src/modules/answer/internal/openrouter-models.ts`, and `src/routes/api.chat.ts`.
- Observability reads `SENTRY_DSN`, `VITE_SENTRY_DSN`, `SENTRY_ENVIRONMENT`, `SENTRY_RELEASE`, `POSTHOG_KEY`, `VITE_POSTHOG_KEY`, `POSTHOG_HOST`, `VITE_POSTHOG_HOST`, `POSTHOG_APP_URL`, `VITE_POSTHOG_APP_URL`, `AE_DISABLE_OBSERVABILITY`, and `VITE_AE_DISABLE_OBSERVABILITY` in `src/lib/observability/config.ts`.
- Sentry build upload reads `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_RELEASE`, `VERCEL_GIT_COMMIT_SHA`, and `GITHUB_SHA` in `vite.config.ts`.
- Billing and notification provider env readers live in `src/lib/server/billing-provider.ts` and `src/lib/server/notification-provider.ts`.

**Build:**
- Build config: `vite.config.ts`, `tsconfig.json`, `convex/tsconfig.json`, `vitest.config.ts`, `playwright.config.ts`, `playwright.deploy-smoke.config.ts`, `autumn.config.ts`, and `.github/workflows/eval-gate.yml`.
- TypeScript is strict with `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `useUnknownInCatchVariables`, and path aliases `@/*` and `~/*` in `tsconfig.json`.
- Vite enables `tsconfigPaths`, bundles Astryx packages for SSR via `ssr.noExternal`, and conditionally enables Sentry sourcemaps in `vite.config.ts`.
- Tailwind 4 is provided through `@tailwindcss/vite`; no standalone `tailwind.config.*` was detected.

## Platform Requirements

**Development:**
- Install with `npm ci` using `package-lock.json`.
- Run app with `npm run dev`; Vite serves on port 3000 by default in `vite.config.ts` and script host `127.0.0.1` in `package.json`.
- Run checks with `npm run typecheck`, `npm run check:convex-codegen`, `npm run test:unit`, `npm run test:integration`, `npm run test:e2e`, and `npm run build`.
- Convex development requires generated files under `convex/_generated/`; `package.json` includes `npm run check:convex-codegen` and `npm run seed:dev`.
- When changing Convex code, read `convex/_generated/ai/guidelines.md` first; project guidance is declared in `AGENTS.md`.
- Project-specific action boundaries live in `AGENTS.md`, `src/modules/actions/index.ts`, `src/modules/registry/registry.actions.ts`, and `src/modules/inquiries/inquiry.actions.ts`: AE reads, compares, summarizes, routes to next step, and can submit a qualified inquiry only when the listing publishes that path. It does not book, charge, dispatch, or auto-fulfil.

**Production:**
- Deployment target is Vercel-compatible but not fully specified by a checked-in `vercel.json`; evidence is `.vercel/` existence, `VERCEL_URL` and `VERCEL_GIT_COMMIT_SHA` handling in `src/modules/billing/billing.functions.ts` and `vite.config.ts`, plus deploy smoke tests in `tests/deploy-smoke/`.
- CI uses GitHub Actions in `.github/workflows/eval-gate.yml` to run typecheck, Convex codegen check, unit/integration tests, copy/UI/import scans, promptfoo answer eval, and build.
- Production server must configure Convex, Clerk, source-write admission, and any enabled provider env vars described in `.planning/codebase/INTEGRATIONS.md`.

---

*Stack analysis: 2026-07-03*
