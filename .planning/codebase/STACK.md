# Technology Stack

**Analysis Date:** 2026-07-02

## Languages

**Primary:**
- TypeScript 6.0.3 - application code, server routes, Convex functions, test suites, and tooling in `src/`, `convex/`, `tests/`, `eval/`, `vite.config.ts`, and `vitest.config.ts`.
- TSX with React 19.2.7 - route components, UI components, and interactive surfaces in `src/routes/`, `src/components/`, and `src/future-phases/`.

**Secondary:**
- CSS - global styles, tokens, and answer surface styles in `src/styles/globals.css`, `src/styles/tokens.css`, and `src/styles/answer/`.
- JavaScript/MJS - promptfoo assertions and provider scripts in `eval/answer/assertions/*.mjs` and `eval/answer/providers/gate.mjs`.
- YAML - Promptfoo and GitHub Actions configuration in `eval/answer/promptfooconfig.yaml` and `.github/workflows/eval-gate.yml`.
- JSON - package metadata, shadcn configuration, and generated route metadata in `package.json`, `components.json`, and `src/routeTree.gen.ts`.

## Runtime

**Environment:**
- Node.js 20 - CI runtime configured by `.github/workflows/eval-gate.yml` with `actions/setup-node@v4` and `node-version: '20'`.
- Browser runtime - React UI served by TanStack Start routes in `src/routes/` and bootstrapped by `src/router.tsx` and `src/routes/__root.tsx`.
- TanStack Start server runtime - server functions and route handlers use `@tanstack/react-start`, `@tanstack/react-router`, Vite, and Nitro through `src/start.ts`, `src/routes/api.*.ts`, and `vite.config.ts`.
- Convex runtime - backend database functions, schema, auth, and cron jobs live under `convex/`; read `convex/_generated/ai/guidelines.md` before editing Convex code.

**Package Manager:**
- npm 11.5.1 - declared in `package.json` as `"packageManager": "npm@11.5.1"`.
- Lockfile: present at `package-lock.json`.
- Other package manager lockfiles: not detected for pnpm, yarn, or bun.

## Frameworks

**Core:**
- React 19.2.7 - UI rendering across `src/components/` and `src/routes/`.
- TanStack React Start 1.168.26 - full-stack app runtime, server functions, middleware, and route handlers in `src/start.ts` and `src/routes/`.
- TanStack Router 1.170.16 - file-based routing and generated route tree in `src/router.tsx`, `src/routes/`, and `src/routeTree.gen.ts`.
- Vite 8.1.0 - dev server and production build, configured in `vite.config.ts`.
- Nitro nightly 3.0.1 alias - server build/runtime plugin in `vite.config.ts`.
- Convex 1.42.0 - source-of-truth database, server functions, auth configuration, and crons under `convex/`.
- Clerk TanStack React Start 1.4.9 - authentication middleware, providers, and sign-in/up pages in `src/start.ts`, `src/routes/__root.tsx`, `src/routes/sign-in.$.tsx`, and `src/routes/sign-up.$.tsx`.

**Testing:**
- Vitest 4.1.9 - unit, integration, type, copy, SEO, import, UI-contract, and eval tests configured in `vitest.config.ts` and `package.json`.
- Playwright 1.61.1 - E2E, a11y, and deploy-smoke tests configured in `playwright.config.ts` and `playwright.deploy-smoke.config.ts`.
- Testing Library - React component testing with `@testing-library/react` and `@testing-library/jest-dom` in `package.json`.
- Promptfoo 0.120.3 - answer evaluation gate configured by `eval/answer/promptfooconfig.yaml` and `.github/workflows/eval-gate.yml`.

**Build/Dev:**
- TypeScript strict mode - configured in `tsconfig.json` with `strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, and `moduleResolution: "Bundler"`.
- Tailwind CSS 4.3.1 - Vite plugin in `vite.config.ts`, content paths in `tailwind.config.ts`, and token implementation in `src/styles/tokens.css`.
- shadcn/radix-nova - component registry settings in `components.json`; local UI components live in `src/components/ui/`.
- Sentry Vite plugin 5.3.0 - optional sourcemap upload in `vite.config.ts` when `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, and `SENTRY_PROJECT` are configured.
- Autumn CLI config - paid activation plan model in `autumn.config.ts` using `atmn`.

## Key Dependencies

**Critical:**
- `@tanstack/react-start` 1.168.26 - owns server functions, middleware, and route handlers such as `src/start.ts` and `src/routes/api.agent.tools.ts`.
- `@tanstack/react-router` 1.170.16 - owns route definitions in `src/routes/` and generated router types in `src/routeTree.gen.ts`.
- `convex` 1.42.0 - owns durable data access through `convex/schema.ts`, `convex/auth.config.ts`, and `src/lib/server/convex-source.ts`.
- `@clerk/tanstack-react-start` 1.4.9 - owns authentication middleware and UI in `src/start.ts`, `src/routes/__root.tsx`, `src/routes/sign-in.$.tsx`, and `src/routes/sign-up.$.tsx`.
- `zod` 4.4.3 - validates route/action payloads in files such as `src/modules/registry/registry.actions.ts`, `src/modules/inquiries/inquiry.actions.ts`, and `src/modules/business-action/business-action.functions.ts`.
- `react` / `react-dom` 19.2.7 - browser UI runtime.

**Infrastructure:**
- `@sentry/react` and `@sentry/node` 10.62.0 - client/server error tracking in `src/lib/observability/sentry.client.ts` and `src/lib/observability/sentry.server.ts`.
- `posthog-js` 1.396.2 and `posthog-node` 5.39.0 - product/funnel analytics in `src/lib/observability/posthog.client.ts`, `src/lib/observability/posthog.server.ts`, and `src/routes/api.observability.funnel.ts`.
- `@tanstack/ai` 0.38.0 - declared dependency; current OpenRouter answer integrations use direct HTTP in `src/modules/answer/internal/answer-tool-use-agent.ts`.
- `@tanstack/react-table` 8.21.3 - table UI dependency for admin/operator surfaces.
- `radix-ui`, `@shadcn/react`, `class-variance-authority`, `tailwind-merge`, `lucide-react`, `motion`, `sonner`, and `cmdk` - UI system dependencies used by `src/components/ui/` and `src/components/ae/`.
- `@fontsource-variable/fraunces`, `@fontsource-variable/hanken-grotesk`, and `@fontsource/ibm-plex-mono` - self-hosted brand fonts imported through the frontend bundle.
- `promptfoo`, `tsx`, `@playwright/test`, and `vitest` - evaluation, script, browser, and test tooling.

## Configuration

**Environment:**
- Environment files are present at `.env`, `.env.local`, and `.env.example`; note existence only and do not read or quote their contents.
- Convex server calls require `CONVEX_URL` or `VITE_CONVEX_URL` through `src/lib/server/convex-source.ts`.
- Convex JWT auth requires `CLERK_JWT_ISSUER_DOMAIN` in `convex/auth.config.ts`; Clerk owner-server calls use `CLERK_SECRET_KEY` in `src/lib/server/notification-provider.ts`.
- Local E2E can bypass Clerk with `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E`; `src/start.ts` and `src/routes/__root.tsx` reject that bypass in production.
- Source-write admission uses `AE_SOURCE_WRITE_SECRET` server-side through `src/lib/server/source-write-admission.ts`; public `VITE_` source-write secrets are explicitly treated as invalid by `src/lib/ui/contract-scans.ts`.
- Observability uses `SENTRY_DSN`, `VITE_SENTRY_DSN`, `SENTRY_ENVIRONMENT`, `SENTRY_RELEASE`, `POSTHOG_KEY`, `VITE_POSTHOG_KEY`, `POSTHOG_HOST`, `VITE_POSTHOG_HOST`, `POSTHOG_APP_URL`, `VITE_POSTHOG_APP_URL`, `AE_DISABLE_OBSERVABILITY`, and `VITE_AE_DISABLE_OBSERVABILITY` in `src/lib/observability/config.ts`.
- Answer generation uses `OPENROUTER_API_KEY`, `AE_LLM_MODEL`, `AE_LLM_MODELS`, `AE_ANSWER_EVAL_PASSED`, and `AE_ALLOW_CHAT_API` in `src/modules/answer/internal/llm-config.ts` and `src/modules/answer/internal/openrouter-models.ts`.
- Billing and provider integrations use `AUTUMN_SECRET_KEY`, `AUTUMN_API_BASE_URL`, `AUTUMN_API_VERSION`, `AUTUMN_WEBHOOK_SECRET`, `STRIPE_WEBHOOK_SECRET`, `RESEND_API_KEY`, `RESEND_FROM`, `RESEND_API_BASE_URL`, `RESEND_WEBHOOK_SECRET`, `NOVU_SECRET_KEY`, `NOVU_WORKFLOW_INQUIRY_OWNER`, `NOVU_WORKFLOW_INQUIRY_CUSTOMER`, `NOVU_API_BASE_URL`, and `AE_NOTIFICATION_OUTBOX_SECRET`.
- Optional Meilisearch uses `AE_SEARCH_BACKEND`, `MEILISEARCH_HOST`, `MEILISEARCH_ADMIN_KEY`, `AE_SEARCH_INDEX_UID`, and `AE_SEARCH_TIMEOUT_MS` in `src/modules/registry/internal/catalog-search-port.ts`.
- Google Maps embeds use `VITE_GOOGLE_MAPS_API_KEY` in `src/components/ae/artifacts/AeGenerativeMap.tsx`.

**Build:**
- `vite.config.ts` wires TanStack Start, Nitro, React, Tailwind, and optional Sentry sourcemap upload.
- `tsconfig.json` sets strict TypeScript, path aliases `@/*` and `~/*`, and excludes `convex/_generated`.
- `vitest.config.ts` runs tests in Node and includes `tests/**/*.test.ts` and `tests/**/*.test.tsx`.
- `playwright.config.ts` starts `npm run dev -- --port 3020 --strictPort --host 127.0.0.1` for local E2E with `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E=true`.
- `playwright.deploy-smoke.config.ts` runs deploy smoke tests against externally supplied deployment URLs.
- `components.json` configures shadcn aliases and the AI Elements registry.
- `.github/workflows/eval-gate.yml` runs `npm ci`, typecheck, Convex codegen check, unit/integration tests, copy/UI/import scans, promptfoo eval, and build.

## Platform Requirements

**Development:**
- Use Node.js 20-compatible tooling and npm 11.5.1 from `package.json` / `.github/workflows/eval-gate.yml`.
- Install dependencies with `npm ci` when reproducing CI.
- Start the app with `npm run dev`; Vite binds to `127.0.0.1` by default and `playwright.config.ts` uses port `3020` for tests.
- Run Convex codegen checks with `npm run check:convex-codegen`.
- Keep AE trust boundaries from `AGENTS.md`: AE reads, compares, summarizes, routes, and can send qualified inquiries; it does not book, charge, dispatch, or auto-fulfil.
- When editing Convex code, follow `convex/_generated/ai/guidelines.md`; public Convex functions require validators and sensitive logic should stay internal.

**Production:**
- Deployment is Vercel-oriented: `src/modules/billing/billing.functions.ts` reads `VERCEL_URL`, observability uses `VERCEL_ENV` / `VERCEL_GIT_COMMIT_SHA`, `.vercel/` is present, and deploy smoke tests use Vercel protection bypass helpers in `tests/deploy-smoke/vercel-bypass.ts`.
- Production backend state requires a Convex deployment configured through `CONVEX_URL` / `VITE_CONVEX_URL`.
- Provider webhooks must be configured for `/api/billing/webhook`, `/api/notification/resend-webhook`, and `/api/business-actions/stripe-webhook`.
- Build output is managed by Vite/TanStack Start/Nitro; generated artifacts such as `.output/`, `dist/`, `output/`, `playwright-report/`, and `test-results/` are not source modules.

---

*Stack analysis: 2026-07-02*
