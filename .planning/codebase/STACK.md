# Technology Stack

**Analysis Date:** 2026-07-03

## Languages

**Primary:**
- TypeScript 6.0.3 - application routes, server functions, domain modules, Convex functions, tests, and config in `src/`, `convex/`, `tests/`, `vite.config.ts`, `vitest.config.ts`, and `playwright.config.ts`.
- TSX / React 19.2.7 - public, owner, admin, inquiry, billing, answer-thread, and business-action UI in `src/routes/`, `src/components/`, and `src/app/`.

**Secondary:**
- CSS / Tailwind CSS 4.3.1 - Tailwind 4 utility glue and Astryx CSS enter through `src/styles/globals.css`; retiring legacy CSS is isolated through `src/styles/legacy.css`.
- YAML - Promptfoo eval config in `eval/answer/promptfooconfig.yaml` and GitHub Actions CI in `.github/workflows/eval-gate.yml`.
- JavaScript / MJS - project skill scripts and eval/tooling helpers under `.agents/skills/*/scripts/` and `.codex/skills/*/scripts/` where those vendor trees are present locally.
- XML/plain text route generation - discovery files in `src/routes/sitemap[.]xml.ts`, `src/routes/robots[.]txt.ts`, and `src/routes/llms[.]txt.ts`.

## Runtime

**Environment:**
- Node.js - server-side runtime for TanStack Start/Nitro, package scripts in `package.json`, and Node APIs in `src/lib/server/billing-provider.ts`, `src/lib/server/notification-provider.ts`, `src/routes/api.business-actions.stripe-webhook.ts`, and `src/modules/business-action/internal/stripe-checkout.ts`.
- CI uses Node 20 in `.github/workflows/eval-gate.yml`; the repository does not declare `engines`, `.nvmrc`, or `.node-version`.
- Local scan observed Node `v26.4.0` and npm `11.17.0`; treat those as workstation facts, not repository pins.
- Browser runtime - React and TanStack Router client boot through `src/routes/__root.tsx`, `src/router.tsx`, generated `src/routeTree.gen.ts`, and route components in `src/routes/`.
- Convex runtime - persisted source state and scheduled cleanup live under `convex/`; application server code calls Convex through `src/lib/server/convex-source.ts`.

**Package Manager:**
- npm 11.5.1 - declared by `package.json` `packageManager`.
- Lockfile: present as `package-lock.json` lockfile version 3.
- Not detected: `pnpm-lock.yaml`, `yarn.lock`, `bun.lock`, `bun.lockb`, or `npm-shrinkwrap.json`.

## Frameworks

**Core:**
- React 19.2.7 - UI rendering for route components in `src/routes/`, shared components in `src/components/`, and app-style pages in `src/app/`.
- TanStack Start 1.168.26 - full-stack runtime, request middleware, server functions, and route handlers in `src/start.ts`, `src/routes/api.answer.turn.ts`, `src/modules/billing/billing.functions.ts`, `src/modules/inquiries/inquiry.functions.ts`, and `src/modules/business-action/business-action.functions.ts`.
- TanStack Router 1.170.16 - file routing through `createFileRoute`, generated route tree in `src/routeTree.gen.ts`, router setup in `src/router.tsx`, and root document wiring in `src/routes/__root.tsx`.
- Nitro nightly (`npm:nitro-nightly@^3.0.1-20260628-090458-3df69609`) - TanStack Start server output plugin configured in `vite.config.ts`.
- Convex 1.42.0 - backend schema composition in `convex/schema.ts`, Clerk issuer config in `convex/auth.config.ts`, query/mutation modules in `convex/*.ts`, source-write admission in `convex/sourceWriteAdmission.ts`, and scheduled jobs in `convex/crons.ts`.
- Clerk TanStack Start 1.4.9 - auth provider and request middleware in `src/routes/__root.tsx` and `src/start.ts`; protected session helpers in `src/lib/server/require-operator-session.ts`, `src/lib/server/claim-owner-session.ts`, and Convex token retrieval in `src/lib/server/convex-source.ts`.
- Astryx Design 0.1.2 - current component and neutral-theme system via `@astryxdesign/core` and `@astryxdesign/theme-neutral`; root providers are in `src/routes/__root.tsx` and CSS imports are in `src/styles/globals.css`.

**Testing:**
- Vitest 4.1.9 - unit, integration, type, import-boundary, copy, SEO, UI-contract, and eval-adjacent tests configured by `vitest.config.ts` and scripts in `package.json`.
- Playwright 1.61.1 - local E2E and deployed provider-smoke tests configured by `playwright.config.ts` and `playwright.deploy-smoke.config.ts`, with test files in `tests/e2e/` and `tests/deploy-smoke/`.
- Testing Library React 16.3.2 and jest-dom 6.9.1 - React DOM assertions for tests under `tests/unit/` and `tests/integration/`.
- Promptfoo 0.120.3 - answer eval gate configured by `eval/answer/promptfooconfig.yaml` and `package.json` scripts.
- React Doctor 0.5.8 - diagnostics exposed by the `doctor` script in `package.json` and tuned by `doctor.config.ts`.

**Build/Dev:**
- Vite 8.1.0 - dev server, build, SSR bundling, and plugin pipeline in `vite.config.ts`.
- `@tanstack/react-start/plugin/vite` - TanStack Start plugin in `vite.config.ts`.
- `nitro/vite` - server output plugin in `vite.config.ts`.
- `@vitejs/plugin-react` 6.0.3 - React transform plugin in `vite.config.ts`.
- `@tailwindcss/vite` 4.3.1 - Tailwind 4 Vite plugin in `vite.config.ts`.
- `tsx` 4.20.5 - TypeScript script runner for eval/report scripts in `package.json`.
- `atmn` 1.1.10 - Autumn product/pricing DSL in `autumn.config.ts`.
- `@astryxdesign/cli` 0.1.2 - Astryx CLI dependency declared in `package.json`; project design guidance expects Astryx before bespoke presentation code.

## Key Dependencies

**Critical:**
- `@tanstack/react-start` 1.168.26 - owns request middleware, server functions, and route handlers; central files are `src/start.ts`, `src/routes/__root.tsx`, and `src/routes/api.answer.turn.ts`.
- `@tanstack/react-router` 1.170.16 - owns file routes and navigation; central files are `src/router.tsx`, `src/routeTree.gen.ts`, and `src/routes/`.
- `convex` 1.42.0 - owns source-state persistence and backend functions; central files are `convex/schema.ts`, `convex/auth.config.ts`, `convex/sourceWriteAdmission.ts`, and `src/lib/server/convex-source.ts`.
- `@clerk/tanstack-react-start` 1.4.9 - owns sign-in/sign-up, request auth, and Convex token retrieval; central files are `src/start.ts`, `src/routes/__root.tsx`, and `src/lib/server/convex-source.ts`.
- `zod` 4.4.3 - input/output schemas for actions, server functions, route payloads, and answer artifacts; examples are `src/modules/registry/registry.actions.ts`, `src/modules/inquiries/inquiry.functions.ts`, and `src/modules/answer/answer-schema.ts`.
- `@tanstack/ai` 0.38.0 - JSON Schema/tool-contract conversion for action and harness tools in `src/modules/common/action.ts`, `src/modules/harness/tool-contract.ts`, and `src/modules/harness/strict-schema.ts`.
- `@astryxdesign/core` and `@astryxdesign/theme-neutral` 0.1.2 - primary component/theme system in `src/routes/__root.tsx` and `src/styles/globals.css`.

**Infrastructure:**
- `@sentry/node`, `@sentry/react`, and `@sentry/vite-plugin` - server/client error tracking, router tracing, replay-on-error, and optional sourcemap upload in `src/lib/observability/sentry.server.ts`, `src/lib/observability/sentry.client.ts`, `src/components/ae/feedback/AeObservabilityErrorBoundary.tsx`, and `vite.config.ts`.
- `posthog-js` and `posthog-node` - browser/server analytics in `src/lib/observability/posthog.client.ts`, `src/lib/observability/posthog.server.ts`, and `src/routes/api.observability.funnel.ts`.
- `motion` 12.42.0 - UI animation dependency used by components under `src/components/ae/` and `src/components/animate/`.
- `lucide-react` 1.21.0 - icon set used across `src/routes/` and `src/components/`.
- `@tanstack/react-table` 8.21.3 - table dependency declared in `package.json`; use Astryx `Table` patterns from `DESIGN.md` before adding new table UI.
- `clsx`, `tailwind-merge`, and `tw-animate-css` - styling helpers and legacy animation compatibility, including `src/lib/utils.ts` and `src/styles/legacy.css`.
- `promptfoo` - answer-eval CLI used by `eval/answer/promptfooconfig.yaml` and `.github/workflows/eval-gate.yml`.
- `@playwright/test` - browser E2E and deployed smoke tests under `tests/e2e/` and `tests/deploy-smoke/`.

## Configuration

**Environment:**
- Environment files present: `.env`, `.env.local`, and `.env.example`; contents were not read. `.gitignore` excludes `.env` and `.env.*` while allowing `.env.example`.
- Convex calls require `CONVEX_URL` or `VITE_CONVEX_URL` in `src/lib/server/convex-source.ts`; Convex JWT auth requires `CLERK_JWT_ISSUER_DOMAIN` in `convex/auth.config.ts`.
- Clerk local bypass uses `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E` in `src/start.ts`, `src/routes/__root.tsx`, and source readback seams; it throws in production.
- Source-write admission requires server-only `AE_SOURCE_WRITE_SECRET` in `src/lib/server/source-write-admission.ts` and `convex/sourceWriteAdmission.ts`.
- OpenRouter answer mode uses `OPENROUTER_API_KEY`, `AE_LLM_MODEL`, `AE_LLM_MODELS`, `AE_SITE_URL`, `SITE_URL`, `AE_ANSWER_EVAL_PASSED`, and `AE_ALLOW_CHAT_API` in `src/modules/answer/internal/llm-config.ts`, `src/modules/answer/internal/openrouter-models.ts`, `src/modules/answer/internal/answer-tool-use-agent.ts`, `src/modules/answer-thread/internal/llm-follow-up-chips.ts`, and `src/routes/api.chat.ts`.
- Observability reads `SENTRY_DSN`, `VITE_SENTRY_DSN`, `SENTRY_ENVIRONMENT`, `SENTRY_RELEASE`, `POSTHOG_KEY`, `VITE_POSTHOG_KEY`, `POSTHOG_HOST`, `VITE_POSTHOG_HOST`, `POSTHOG_APP_URL`, `VITE_POSTHOG_APP_URL`, `AE_DISABLE_OBSERVABILITY`, and `VITE_AE_DISABLE_OBSERVABILITY` in `src/lib/observability/config.ts`.
- Sentry sourcemap upload reads `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_RELEASE`, `VERCEL_GIT_COMMIT_SHA`, and `GITHUB_SHA` in `vite.config.ts`.
- Billing provider env readers live in `src/lib/server/billing-provider.ts` and include `AUTUMN_SECRET_KEY`, `AUTUMN_API_BASE_URL`, `AUTUMN_API_VERSION`, and `AUTUMN_WEBHOOK_SECRET`.
- Notification provider env readers live in `src/lib/server/notification-provider.ts` and include `AE_NOTIFICATION_OUTBOX_SECRET`, `CLERK_SECRET_KEY`, `RESEND_API_KEY`, `RESEND_FROM`, `RESEND_API_BASE_URL`, `RESEND_WEBHOOK_SECRET`, `NOVU_SECRET_KEY`, `NOVU_API_BASE_URL`, `NOVU_WORKFLOW_INQUIRY_OWNER`, and `NOVU_WORKFLOW_INQUIRY_CUSTOMER`.
- Optional catalog search env is read in `src/modules/registry/internal/catalog-search-port.ts`: `AE_SEARCH_BACKEND`, `AE_SEARCH_TIMEOUT_MS`, `MEILISEARCH_HOST`, `MEILISEARCH_ADMIN_KEY`, and `AE_SEARCH_INDEX_UID`.

**Build:**
- Build config: `vite.config.ts`, `tsconfig.json`, `convex/tsconfig.json`, `vitest.config.ts`, `playwright.config.ts`, `playwright.deploy-smoke.config.ts`, `autumn.config.ts`, and `.github/workflows/eval-gate.yml`.
- TypeScript is strict with `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `useUnknownInCatchVariables`, `noImplicitOverride`, and path aliases `@/*` and `~/*` in `tsconfig.json`.
- Vite enables `tsconfigPaths`, bundles Astryx packages for SSR via `ssr.noExternal`, watches port 3000, and conditionally enables Sentry sourcemaps in `vite.config.ts`.
- Tailwind 4 is CSS-first through `@tailwindcss/vite`; no standalone `tailwind.config.*` was detected.

## Platform Requirements

**Development:**
- Install dependencies with `npm ci` using `package-lock.json`.
- Run the app with `npm run dev`; Vite serves on port 3000 by default in `vite.config.ts` and the script binds host `127.0.0.1` in `package.json`.
- Run standard checks with `npm run typecheck`, `npm run check:convex-codegen`, `npm run test:unit`, `npm run test:integration`, `npm run test:e2e`, and `npm run build`.
- Use `npm run test:all` for the local non-Playwright aggregate in `package.json`; use `npm run test:release` for the broader gate that includes eval, graph freshness, copy, UI contract, E2E, a11y, and build.
- Convex development requires generated files under `convex/_generated/`; `package.json` includes `npm run check:convex-codegen` and `npm run seed:dev`.
- When changing Convex code, read `convex/_generated/ai/guidelines.md` first as required by `AGENTS.md`; the local guidelines target Convex `^1.41.0` and override generic Convex assumptions.
- UI work must follow `DESIGN.md`: use Astryx (`@astryxdesign/core` plus `@astryxdesign/theme-neutral`) before adding presentation code; Tailwind is layout glue only.
- New user- or assistant-facing operations must be actions in `src/modules/*/<module>.actions.ts` and must be registered in `src/modules/actions/index.ts`.

**Production:**
- Deployment target is Vercel-compatible but not fully specified by a checked-in `vercel.json`; evidence is `.vercel/` existence, `VERCEL_URL` handling in `src/modules/billing/billing.functions.ts`, `VERCEL_GIT_COMMIT_SHA` handling in `vite.config.ts` and `src/lib/observability/config.ts`, and deploy smoke tests in `tests/deploy-smoke/`.
- CI uses GitHub Actions in `.github/workflows/eval-gate.yml` to run typecheck, Convex codegen check, unit/integration tests, copy/UI/import scans, promptfoo answer eval, and build.
- Production server must configure Convex, Clerk, source-write admission, and any enabled provider env vars described in `.planning/codebase/INTEGRATIONS.md`.
- Public product boundaries from `AGENTS.md` and `PRODUCT.md` are technical constraints: AE reads, compares, summarizes, routes to next step, and may submit a qualified inquiry only when a listing publishes that path. It does not book, charge, dispatch, auto-fulfil, or use "verified" without a named standard.

---

*Stack analysis: 2026-07-03*
