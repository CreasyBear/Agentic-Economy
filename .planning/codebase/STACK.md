# Technology Stack

**Analysis Date:** 2026-07-01

## Languages

**Primary:**
- TypeScript 6.0.3 - Application, Convex functions, server functions, route handlers, tests, and tooling in `src/`, `convex/`, `tests/`, `eval/answer/`, `vite.config.ts`, `vitest.config.ts`, and `playwright.config.ts`.
- TSX / React 19.2.7 - Route components and UI components in `src/routes/*.tsx`, `src/components/`, and `src/modules/answer/openui/ae-library.tsx`.

**Secondary:**
- JavaScript / ESM - Package/runtime scripts in `package.json`, generated or external eval provider files referenced by `eval/answer/promptfooconfig.yaml`, and Node script execution through `tsx` in `eval/answer/scripts/*.ts`.
- YAML - GitHub Actions and Promptfoo configuration in `.github/workflows/eval-gate.yml` and `eval/answer/promptfooconfig.yaml`.
- CSS - Global styles, design tokens, and feature styles in `src/styles/globals.css`, `src/styles/tokens.css`, and `src/styles/answer/`.

## Runtime

**Environment:**
- Node.js - Project runtime for TanStack Start/Vite, tests, eval scripts, and server-side route handlers. The repo pins CI to Node 20 in `.github/workflows/eval-gate.yml`; no `.nvmrc`, `.node-version`, or `engines` field is present in `package.json`.
- Local shell observed Node.js v26.4.0 and npm 11.17.0, but the project-declared package manager is `npm@11.5.1` in `package.json`.
- Browser runtime - React client UI runs through TanStack Start/Vite routes in `src/routes/__root.tsx` and `src/router.tsx`.
- Convex runtime - Backend database functions live in `convex/*.ts`; generated Convex guidance in `convex/_generated/ai/guidelines.md` targets Convex `^1.41.0`, while `package.json` pins `convex` to 1.42.0.

**Package Manager:**
- npm 11.5.1 - Declared by `packageManager` in `package.json`.
- Lockfile: present - `package-lock.json` with `lockfileVersion: 3`.

## Frameworks

**Core:**
- TanStack Start 1.168.26 - Full-stack React framework, request middleware, CSRF middleware, server functions, and file routes in `src/start.ts`, `src/routes/`, and `src/modules/*/*.functions.ts`.
- TanStack Router 1.170.16 - File-based route tree and router registration in `src/routes/`, `src/routeTree.gen.ts`, and `src/router.tsx`.
- React 19.2.7 / React DOM 19.2.7 - UI runtime for route and component rendering in `src/routes/` and `src/components/`.
- Convex 1.42.0 - Durable source database, schema, auth config, and domain queries/mutations in `convex/schema.ts`, `convex/auth.config.ts`, `convex/*.ts`, and `src/modules/*/internal/schema*.ts`.
- Clerk TanStack React Start 1.4.9 - Auth middleware, auth provider, sign-in/sign-up routes, and server auth in `src/start.ts`, `src/routes/__root.tsx`, `src/routes/sign-in.$.tsx`, `src/routes/sign-up.$.tsx`, and `src/lib/server/convex-source.ts`.

**Testing:**
- Vitest 4.1.9 - Unit, integration, eval, copy, SEO, import, type, and UI-contract tests configured in `vitest.config.ts` and scripted in `package.json`.
- Playwright 1.61.1 - E2E, accessibility, and deployment smoke tests configured in `playwright.config.ts`, `playwright.deploy-smoke.config.ts`, and `tests/deploy-smoke/`.
- Testing Library React 16.3.2 / jest-dom 6.9.1 - React component assertions used by tests under `tests/unit/`.
- Promptfoo 0.120.3 - Answer-eval gate configured by `eval/answer/promptfooconfig.yaml` and invoked by `package.json` scripts.

**Build/Dev:**
- Vite 8.1.0 - Dev server and build tool in `vite.config.ts`; `npm run dev` runs `vite dev --host 127.0.0.1` from `package.json`.
- `@tanstack/react-start/plugin/vite` - TanStack Start Vite integration in `vite.config.ts`.
- `nitro` (`nitro-nightly@^3.0.1-20260628-090458-3df69609`) - Server runtime/build integration in `vite.config.ts`.
- `@vitejs/plugin-react` 6.0.3 - React plugin in `vite.config.ts`.
- Tailwind CSS 4.3.1 / `@tailwindcss/vite` 4.3.1 - Utility CSS and Vite plugin configured in `tailwind.config.ts` and `vite.config.ts`.
- TypeScript `tsc --noEmit` - Typechecking via `npm run typecheck` in `package.json`.
- Convex codegen dry-run - `npm run check:convex-codegen` runs `convex codegen --dry-run --typecheck=disable` from `package.json`.

## Key Dependencies

**Critical:**
- `convex` 1.42.0 - Source-of-truth database, generated API types, auth config, and domain functions in `convex/`.
- `@clerk/tanstack-react-start` 1.4.9 - Owner/admin auth, Clerk middleware, sign-in/up UI, and Convex auth token acquisition in `src/start.ts`, `src/routes/__root.tsx`, `src/lib/server/claim-owner-session.ts`, and `src/lib/server/convex-source.ts`.
- `@tanstack/react-start` 1.168.26 - Server functions and middleware in `src/start.ts`, `src/modules/inquiries/inquiry.functions.ts`, `src/modules/billing/billing.functions.ts`, `src/modules/business-action/business-action.functions.ts`, and other `*.functions.ts` files.
- `@tanstack/react-router` 1.170.16 - Route declarations in `src/routes/` and router setup in `src/router.tsx`.
- `zod` 4.4.3 - Runtime schemas for server functions, actions, API input, and answer artifacts in `src/modules/common/action.ts`, `src/modules/inquiries/inquiry.functions.ts`, `src/modules/registry/registry.actions.ts`, and `src/modules/answer/answer-schema.ts`.
- `@tanstack/ai` 0.38.0 - Tool-definition adapter for the answer agent registry search tool in `src/modules/answer/tools/registry-search.tool.ts`.
- `atmn` 1.1.10 - Autumn pricing config helpers in `autumn.config.ts`; runtime Autumn calls are custom `fetch` wrappers in `src/modules/billing/internal/provider-readback.ts`.

**Infrastructure:**
- `@sentry/react` 10.62.0 / `@sentry/node` 10.62.0 - Client/server exception tracking in `src/lib/observability/sentry.client.ts`, `src/lib/observability/sentry.server.ts`, and `src/start.ts`.
- `@sentry/vite-plugin` 5.3.0 - Optional sourcemap upload plugin enabled by env in `vite.config.ts`.
- `posthog-js` 1.396.2 / `posthog-node` 5.39.0 - Client/server funnel and product analytics in `src/lib/observability/posthog.client.ts`, `src/lib/observability/posthog.server.ts`, and `src/modules/observability/funnel.functions.ts`.
- `@shadcn/react`, `shadcn`, `radix-ui`, `lucide-react`, `sonner`, `cmdk`, `class-variance-authority`, `clsx`, `tailwind-merge`, and `tw-animate-css` - UI primitives and styling helpers used across `src/components/ui/` and `src/components/ae/`.
- `motion` 12.42.0 - Animation components in `src/components/animate/fade-in.tsx` and `src/components/ai-elements/shimmer.tsx`.
- `@openuidev/react-lang` 0.2.8 - OpenUI answer component library in `src/modules/answer/openui/ae-library.tsx`.
- Font packages `@fontsource-variable/fraunces`, `@fontsource-variable/hanken-grotesk`, and `@fontsource/ibm-plex-mono` - Brand fonts declared in `package.json` and consumed through app styling in `src/styles/`.

## Configuration

**Environment:**
- Environment files are present at `.env`, `.env.local`, and `.env.example`; their contents were not read.
- Convex server calls require `CONVEX_URL` or `VITE_CONVEX_URL` in `src/lib/server/convex-source.ts`.
- Convex Clerk auth requires `CLERK_JWT_ISSUER_DOMAIN` in `convex/auth.config.ts`.
- Clerk server owner lookup for notification dispatch requires `CLERK_SECRET_KEY` in `src/lib/server/notification-provider.ts`.
- Source-write admission requires server-only `AE_SOURCE_WRITE_SECRET`; `src/lib/server/source-write-admission.ts` rejects `VITE_AE_SOURCE_WRITE_SECRET`.
- OpenRouter answer mode requires `OPENROUTER_API_KEY`; optional model controls are `AE_LLM_MODEL`, `AE_LLM_MODELS`, and `AE_ALLOW_CHAT_API` in `src/modules/answer/internal/llm-config.ts`, `src/modules/answer/internal/openrouter-models.ts`, and `src/routes/api.chat.ts`.
- Observability uses `SENTRY_DSN`, `VITE_SENTRY_DSN`, `SENTRY_ENVIRONMENT`, `SENTRY_RELEASE`, `POSTHOG_KEY`, `VITE_POSTHOG_KEY`, `POSTHOG_HOST`, `VITE_POSTHOG_HOST`, `POSTHOG_APP_URL`, `VITE_POSTHOG_APP_URL`, `AE_DISABLE_OBSERVABILITY`, and `VITE_AE_DISABLE_OBSERVABILITY` in `src/lib/observability/config.ts`.
- Sentry build sourcemaps require `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, and `SENTRY_PROJECT`; release falls back through `SENTRY_RELEASE`, `VERCEL_GIT_COMMIT_SHA`, and `GITHUB_SHA` in `vite.config.ts`.
- Resend/Novu notifications require `AE_NOTIFICATION_OUTBOX_SECRET`, `RESEND_API_KEY`, `RESEND_FROM`, `RESEND_WEBHOOK_SECRET`, `NOVU_SECRET_KEY`, and `NOVU_WORKFLOW_INQUIRY_OWNER`; optional overrides are `RESEND_API_BASE_URL`, `NOVU_API_BASE_URL`, and `NOVU_WORKFLOW_INQUIRY_CUSTOMER` in `src/lib/server/notification-provider.ts`.
- Autumn billing requires `AUTUMN_SECRET_KEY` for provider calls and `AUTUMN_WEBHOOK_SECRET` for webhooks; optional overrides are `AUTUMN_API_BASE_URL` and `AUTUMN_API_VERSION` in `src/lib/server/billing-provider.ts`.
- Business-action Stripe webhook evidence requires `STRIPE_WEBHOOK_SECRET` in `src/routes/api.business-actions.stripe-webhook.ts`.
- Optional Meilisearch search requires `AE_SEARCH_BACKEND`, `MEILISEARCH_HOST`, `MEILISEARCH_ADMIN_KEY`, `AE_SEARCH_INDEX_UID`, and `AE_SEARCH_TIMEOUT_MS` in `src/modules/registry/internal/catalog-search-port.ts`.
- Google Maps embeds require `VITE_GOOGLE_MAPS_API_KEY` in `src/components/ae/artifacts/AeGenerativeMap.tsx`.

**Build:**
- `vite.config.ts` configures port 3000, tsconfig path resolution, TanStack Start, Nitro, React, Tailwind, and optional Sentry sourcemaps.
- `tsconfig.json` enforces strict TypeScript, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `moduleResolution: "Bundler"`, and aliases `@/*` and `~/*` to `src/*`.
- `tailwind.config.ts` scans `src/**/*.{ts,tsx}` and `tests/**/*.{ts,tsx}`.
- `vitest.config.ts` uses Node environment and includes `tests/**/*.test.ts` and `tests/**/*.test.tsx`.
- `playwright.config.ts` starts `npm run dev -- --port 3020 --strictPort --host 127.0.0.1` with local Clerk bypass for E2E.
- `playwright.deploy-smoke.config.ts` defines non-parallel deploy smoke runs without a web server.
- `autumn.config.ts` defines the `paid_activation` feature and `paid_activation_monthly` plan.
- `.github/workflows/eval-gate.yml` runs `npm ci`, typecheck, Convex codegen, unit/integration/copy/UI/import tests, Promptfoo eval, and build on `main` pushes and PRs.

## Platform Requirements

**Development:**
- Install dependencies with `npm ci` using `package-lock.json`.
- Run dev server with `npm run dev`; Vite serves on `127.0.0.1` and defaults to port 3000 from `vite.config.ts`.
- Run typecheck with `npm run typecheck` and Convex generated API check with `npm run check:convex-codegen`.
- Run tests with `npm test`, `npm run test:unit`, `npm run test:integration`, `npm run test:e2e`, `npm run test:a11y`, `npm run test:eval`, or `npm run test:all` from `package.json`.
- Convex code changes must follow `convex/_generated/ai/guidelines.md`: define schema in `convex/schema.ts`, include validators, prefer indexed queries, and use Convex auth via `convex/auth.config.ts`.
- Local project skills relevant to this stack are indexed in `.codex/skills/convex-best-practices/SKILL.md`, `.codex/skills/convex-functions/SKILL.md`, `.codex/skills/convex-http-actions/SKILL.md`, `.codex/skills/clerk-tanstack-patterns/SKILL.md`, `.codex/skills/tanstack-start/SKILL.md`, `.codex/skills/sentry/SKILL.md`, `.agents/skills/autumn-setup/SKILL.md`, `.agents/skills/autumn-gating/SKILL.md`, and `.agents/skills/autumn-modelling-pricing-plans/SKILL.md`.

**Production:**
- Deployment target is Vercel-like/TanStack Start Nitro output: `vite.config.ts` references `VERCEL_GIT_COMMIT_SHA`; `src/modules/billing/billing.functions.ts` falls back to `VERCEL_URL`; deploy smoke tests use `DEPLOY_BASE_URL`, `DEPLOY_CONVEX_URL`, and `VERCEL_AUTOMATION_BYPASS_SECRET` in `tests/deploy-smoke/`.
- Production requires configured Convex deployment URL, Clerk keys/JWT issuer, source-write secret, and provider-specific secrets for enabled integrations.
- Observability and search integrations are optional by env: missing Sentry/PostHog disables vendor capture in `src/lib/observability/config.ts`; missing Meilisearch config falls back to Convex search in `src/modules/registry/registry.functions.ts`.

---

*Stack analysis: 2026-07-01*
