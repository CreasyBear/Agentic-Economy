# Technology Stack

**Analysis Date:** 2026-07-03

## Languages

**Primary:**
- TypeScript 6.0.3 - application source, TanStack Start routes, Convex functions, domain modules, tests, and config files under `src/`, `convex/`, `tests/`, `vite.config.ts`, `vitest.config.ts`, and `playwright.config.ts`.
- TSX / React 19.2.7 - route components and UI components under `src/routes/`, `src/components/`, and route-mounted panels such as `src/routes/owner.billing.activate.tsx`.

**Secondary:**
- CSS / Tailwind CSS 4.3.1 - CSS-first Tailwind and Astryx theme imports through `src/styles/globals.css`, with token compatibility in `src/styles/tokens.css`.
- YAML - Promptfoo answer eval config in `eval/answer/promptfooconfig.yaml` and GitHub Actions workflow in `.github/workflows/eval-gate.yml`.
- JavaScript / MJS - eval providers and assertions under `eval/answer/providers/` and `eval/answer/assertions/`.
- XML / text response routes - deterministic machine-readable outputs in `src/routes/sitemap[.]xml.ts`, `src/routes/robots[.]txt.ts`, and `src/routes/llms[.]txt.ts`.

## Runtime

**Environment:**
- Node.js runtime is assumed by scripts in `package.json`, the TanStack Start/Nitro server in `src/start.ts`, and Node APIs in server-only seams such as `src/lib/server/billing-provider.ts`, `src/lib/server/notification-provider.ts`, and `src/modules/business-action/internal/stripe-checkout.ts`.
- CI pins Node 20 in `.github/workflows/eval-gate.yml`; `package.json` has no `engines` field, so local Node version is not enforced by the manifest.
- Browser runtime is React 19 + TanStack Router. Client boot happens through the generated TanStack route tree at `src/routeTree.gen.ts` and the root route at `src/routes/__root.tsx`.
- Convex is the database/serverless backend runtime. Runtime function files live under `convex/`; application server functions call Convex through the small source seam in `src/lib/server/convex-source.ts`.

**Package Manager:**
- npm 11.5.1 - declared by `package.json` `packageManager`.
- Lockfile: present as `package-lock.json` lockfile version 3.
- Not detected: `pnpm-lock.yaml`, `yarn.lock`, `bun.lock`, `bun.lockb`, `.nvmrc`, `.node-version`, `vercel.json`, `netlify.toml`, and `wrangler.toml`.

## Frameworks

**Core:**
- React 19.2.7 - UI rendering for public, owner, admin, answer-thread, inquiry, billing, and business-action surfaces in `src/routes/` and `src/components/`.
- TanStack Start 1.168.26 - full-stack app runtime, server functions, request middleware, and route handlers; see `src/start.ts`, `src/routes/api.answer.turn.ts`, and `src/modules/billing/billing.functions.ts`.
- TanStack Router 1.170.16 - file-route definitions through `createFileRoute`, generated route tree in `src/routeTree.gen.ts`, router setup in `src/router.tsx`, and root document wiring in `src/routes/__root.tsx`.
- Nitro nightly (`npm:nitro-nightly@^3.0.1-20260628-090458-3df69609`) - Vite plugin in `vite.config.ts` for Start server output.
- Convex 1.42.0 - schema composition in `convex/schema.ts`, Clerk issuer config in `convex/auth.config.ts`, queries/mutations in `convex/*.ts`, and source-write verification in `convex/sourceWriteAdmission.ts`.
- Clerk TanStack Start 1.4.9 - authentication provider and middleware in `src/routes/__root.tsx`, `src/start.ts`, `src/routes/sign-in.$.tsx`, `src/routes/sign-up.$.tsx`, `src/lib/server/require-operator-session.ts`, and `src/lib/server/claim-owner-session.ts`.
- Astryx Design 0.1.2 - UI primitive/theme layer via `@astryxdesign/core` and `@astryxdesign/theme-neutral`; root providers are in `src/routes/__root.tsx`, and CSS imports are in `src/styles/globals.css`.

**Testing:**
- Vitest 4.1.9 - unit, integration, type, copy, UI-contract, import-boundary, and eval-adjacent tests configured by `vitest.config.ts` and scripts in `package.json`.
- Playwright 1.61.1 - E2E and deployed provider smoke tests configured by `playwright.config.ts` and `playwright.deploy-smoke.config.ts`.
- Testing Library React 16.3.2 and jest-dom 6.9.1 - React DOM assertions for component/unit tests under `tests/unit/`.
- Promptfoo 0.120.3 - answer gate and follow-up chip eval configured in `eval/answer/promptfooconfig.yaml`, with shared case docs in `eval/answer/README.md`.
- React Doctor 0.5.8 - diagnostics tool exposed by the `doctor` script in `package.json`; supply-chain warning behavior is configured in `doctor.config.ts`.

**Build/Dev:**
- Vite 8.1.0 - dev server, build, SSR bundling, and plugin pipeline in `vite.config.ts`.
- `@tanstack/react-start/plugin/vite` - Start plugin in `vite.config.ts`.
- `nitro/vite` - server bundling plugin in `vite.config.ts`.
- `@vitejs/plugin-react` 6.0.3 - React plugin in `vite.config.ts`.
- `@tailwindcss/vite` 4.3.1 - Tailwind 4 Vite plugin in `vite.config.ts`; CSS entry is `src/styles/globals.css`.
- `tsx` 4.20.5 - TypeScript script execution for eval/report scripts in `package.json`.
- `atmn` 1.1.10 - Autumn product/pricing config DSL used by `autumn.config.ts`.
- `@astryxdesign/cli` 0.1.2 - design-system CLI dependency declared in `package.json`; generated/reference pages exist under `src/app/`.

## Key Dependencies

**Critical:**
- `@tanstack/react-start` 1.168.26 - owns full-stack runtime, request middleware, server functions, and route handlers; central files: `src/start.ts`, `src/routes/__root.tsx`, and `src/routes/api.answer.turn.ts`.
- `@tanstack/react-router` 1.170.16 - owns file routes and navigation; central files: `src/router.tsx`, `src/routeTree.gen.ts`, and `src/routes/`.
- `convex` 1.42.0 - source state and backend persistence; central files: `convex/schema.ts`, `src/lib/server/convex-source.ts`, `convex/sourceWriteAdmission.ts`, and `convex/auth.config.ts`.
- `@clerk/tanstack-react-start` 1.4.9 - sign-in/sign-up UI and server auth; central files: `src/start.ts`, `src/routes/sign-in.$.tsx`, `src/routes/sign-up.$.tsx`, `src/lib/server/require-operator-session.ts`, and `src/lib/server/claim-owner-session.ts`.
- `zod` 4.4.3 - runtime validation for server functions, actions, answer schemas, and route payloads; examples: `src/modules/billing/billing.functions.ts`, `src/modules/inquiries/inquiry.functions.ts`, and `src/modules/registry/registry.actions.ts`.
- `@tanstack/ai` 0.38.0 - Zod-to-JSON-Schema conversion for action/tool contracts; see `src/modules/common/action.ts`, `src/modules/harness/tool-contract.ts`, and `src/modules/harness/strict-schema.ts`.
- `@astryxdesign/core` and `@astryxdesign/theme-neutral` 0.1.2 - active component/token system; root providers live in `src/routes/__root.tsx`, and CSS imports live in `src/styles/globals.css`.

**Infrastructure:**
- `@sentry/node`, `@sentry/react`, and `@sentry/vite-plugin` - server/client error tracking, router tracing, replay-on-error, and build sourcemap upload; see `src/lib/observability/sentry.server.ts`, `src/lib/observability/sentry.client.ts`, and `vite.config.ts`.
- `posthog-js` and `posthog-node` - client/server analytics capture; see `src/lib/observability/posthog.client.ts`, `src/lib/observability/posthog.server.ts`, and `src/routes/api.observability.funnel.ts`.
- `atmn` - source-owned Autumn plan config in `autumn.config.ts`; provider calls are implemented with fetch in `src/modules/billing/internal/provider-readback.ts` rather than an app runtime Autumn SDK dependency.
- `promptfoo` - answer-eval CLI used by `eval/answer/promptfooconfig.yaml` and `package.json` scripts.
- `@playwright/test` - local E2E plus deployed provider smokes under `tests/e2e/` and `tests/deploy-smoke/`.
- `motion` 12.42.0 - animation components in `src/components/ae/`.
- `lucide-react` 1.21.0 - icon set used throughout `src/components/` and `src/routes/`.
- `@tanstack/react-table` 8.21.3 - table dependency declared in `package.json`; inspect usage before adding new data-table code.
- `clsx` and `tailwind-merge` - class composition helper in `src/lib/utils.ts`.

## Configuration

**Environment:**
- Secret-bearing environment files exist as `.env` and `.env.local`; do not read their contents. `.env.example` is present only as an example file and should not be treated as a secret source.
- Convex requires `CONVEX_URL` or `VITE_CONVEX_URL` for server source calls in `src/lib/server/convex-source.ts`.
- Convex auth requires `CLERK_JWT_ISSUER_DOMAIN` in `convex/auth.config.ts`.
- Clerk local bypass is gated by `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E` and fails closed in production in `src/start.ts` and `src/routes/__root.tsx`.
- Source-write admission requires `AE_SOURCE_WRITE_SECRET` in `src/lib/server/source-write-admission.ts` and `convex/sourceWriteAdmission.ts`.
- Observability config reads Sentry and PostHog env through `src/lib/observability/config.ts`: `SENTRY_DSN`, `VITE_SENTRY_DSN`, `SENTRY_ENVIRONMENT`, `VITE_SENTRY_ENVIRONMENT`, `SENTRY_RELEASE`, `POSTHOG_KEY`, `VITE_POSTHOG_KEY`, `POSTHOG_HOST`, `VITE_POSTHOG_HOST`, `POSTHOG_APP_URL`, `VITE_POSTHOG_APP_URL`, `AE_DISABLE_OBSERVABILITY`, and `VITE_AE_DISABLE_OBSERVABILITY`.
- Vite Sentry sourcemap upload is enabled only when `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, and `SENTRY_PROJECT` are set in `vite.config.ts`.
- OpenRouter answer integration reads `OPENROUTER_API_KEY`, `AE_LLM_MODEL`, `AE_LLM_MODELS`, `AE_ANSWER_EVAL_PASSED`, `AE_ALLOW_CHAT_API`, `AE_SITE_URL`, and `SITE_URL` in `src/modules/answer/internal/llm-config.ts`, `src/modules/answer/internal/openrouter-models.ts`, and `src/modules/answer/internal/answer-tool-use-agent.ts`.
- Google Maps embed reads `VITE_GOOGLE_MAPS_API_KEY` in `src/components/ae/artifacts/AeGenerativeMap.tsx`.
- Billing provider config reads `AUTUMN_SECRET_KEY`, `AUTUMN_API_BASE_URL`, `AUTUMN_API_VERSION`, `AUTUMN_WEBHOOK_SECRET`, `AE_APP_BASE_URL`, `VITE_AE_APP_BASE_URL`, and `VERCEL_URL` in `src/lib/server/billing-provider.ts` and `src/modules/billing/billing.functions.ts`.
- Notification provider config reads `AE_NOTIFICATION_OUTBOX_SECRET`, `CLERK_SECRET_KEY`, `RESEND_API_KEY`, `RESEND_FROM`, `RESEND_API_BASE_URL`, `RESEND_WEBHOOK_SECRET`, `NOVU_SECRET_KEY`, `NOVU_WORKFLOW_INQUIRY_OWNER`, `NOVU_WORKFLOW_INQUIRY_CUSTOMER`, and `NOVU_API_BASE_URL` in `src/lib/server/notification-provider.ts`.
- Stripe business-action webhook reads `STRIPE_WEBHOOK_SECRET` in `src/routes/api.business-actions.stripe-webhook.ts`; Stripe checkout evidence accepts an injected server-side test-mode secret in `src/modules/business-action/internal/stripe-checkout.ts`.
- Playwright local E2E reads `PLAYWRIGHT_BASE_URL` in `playwright.config.ts`; deployed smoke configs read `DEPLOY_BASE_URL` and purpose-specific `SMOKE_*` variables in `tests/deploy-smoke/`.

**Build:**
- `vite.config.ts` sets dev server port 3000, `resolve.tsconfigPaths`, Astryx SSR bundling via `ssr.noExternal`, conditional sourcemaps for Sentry, and plugins in this order: TanStack Start, Nitro, React, Tailwind, optional Sentry.
- `tsconfig.json` is strict with `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `useUnknownInCatchVariables`, `noImplicitOverride`, `isolatedModules`, and path aliases `@/*` and `~/*` to `src/*`.
- `convex/tsconfig.json` uses strict TypeScript, `moduleResolution: Bundler`, and includes all Convex files except generated output.
- `vitest.config.ts` runs Node-environment tests under `tests/**/*.test.ts` and `tests/**/*.test.tsx` without globals.
- `playwright.config.ts` starts the app with `npm run dev -- --port 3020 --strictPort --host 127.0.0.1`, uses compact and wide Chromium projects, and sets `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E=true` only for local E2E.
- `playwright.deploy-smoke.config.ts` has no web server and is intended for HTTPS deployed targets supplied by smoke-test env.
- `.github/workflows/eval-gate.yml` runs npm install, typecheck, Convex codegen dry run, unit/integration tests, copy/UI/import scans, Promptfoo eval, report upload, eval flagging, and build on GitHub Actions.

## Platform Requirements

**Development:**
- Use npm with `package-lock.json`; do not introduce another package manager without updating `package.json` and lockfile policy.
- Run the app through the Vite/TanStack Start entry defined by `package.json` and `vite.config.ts`.
- Keep app server functions behind TanStack Start patterns (`createServerFn` and `createFileRoute`) as shown in `src/modules/billing/billing.functions.ts`, `src/modules/inquiries/inquiry.functions.ts`, and `src/routes/api.answer.turn.ts`.
- Put source-state reads/writes behind `src/lib/server/convex-source.ts`; do not open-code Convex transport in routes.
- Put new Convex tables in the owning module's `internal/*schema.ts`, then compose them through `convex/schema.ts`.
- Keep new UI on Astryx + Tailwind 4 imports from `src/styles/globals.css`; legacy token shims live in `src/styles/tokens.css` only for surfaces not yet migrated.
- Keep answer eval data in `eval/answer/lib/cases.ts` and Promptfoo rows in `eval/answer/promptfooconfig.yaml` when changing answer behavior.

**Production:**
- [INFERENCE] Deployment is Vercel-compatible TanStack Start/Nitro: source reads `VERCEL_URL`, `VERCEL_ENV`, and `VERCEL_GIT_COMMIT_SHA` in `src/modules/billing/billing.functions.ts`, `src/lib/observability/config.ts`, and `vite.config.ts`; no `vercel.json` is present.
- Production auth depends on Clerk middleware in `src/start.ts` plus Clerk provider gating in `src/routes/__root.tsx`.
- Production data persistence depends on Convex source state and source-write admission in `src/lib/server/convex-source.ts`, `convex/schema.ts`, and `convex/sourceWriteAdmission.ts`.
- Production observability is optional-by-config: Sentry and PostHog initialize only when configured in `src/lib/observability/config.ts`.
- Deployed provider proof is source-owned, not env-presence proof: provider smoke tests in `tests/deploy-smoke/phase2-resend-dispatch-smoke.spec.ts`, `tests/deploy-smoke/phase2-novu-dispatch-smoke.spec.ts`, `tests/deploy-smoke/phase5-paid-activation-provider-smoke.spec.ts`, and `tests/deploy-smoke/phase6-business-action-stripe-smoke.spec.ts` expect source readbacks and redacted UI output.

---

*Stack analysis: 2026-07-03*
