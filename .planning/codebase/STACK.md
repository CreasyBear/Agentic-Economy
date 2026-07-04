# Technology Stack

**Analysis Date:** 2026-07-04

## Languages

**Primary:**
- TypeScript 6.0.3 - application code, server functions, Convex functions, tests, and tooling config in `src/`, `convex/`, `tests/`, `vite.config.ts`, `vitest.config.ts`, and `playwright.config.ts`.
- TSX with React 19.2.7 - route components, page shells, owner/admin surfaces, registry UI, and assistant answer UI under `src/routes/`, `src/components/`, and `src/modules/*`.
- CSS with Tailwind CSS 4.3.1 and Astryx styles - global theme and utility styling in `src/styles/globals.css`, with legacy styles still imported from `src/styles/legacy.css`.

**Secondary:**
- Markdown - product, design, agent, and planning documentation in `PRODUCT.md`, `DESIGN.md`, `AGENTS.md`, `.planning/`, `.codex/skills/`, and `.agents/skills/`.
- JSON - package and TypeScript configuration in `package.json`, `package-lock.json`, `tsconfig.json`, and generated package metadata.
- YAML - GitHub Actions CI configuration in `.github/workflows/eval-gate.yml`.

## Runtime

**Environment:**
- Node.js 20 - CI uses `actions/setup-node@v4` with `node-version: '20'` in `.github/workflows/eval-gate.yml`, and production build output targets Vercel `nodejs20.x` in `vite.config.ts`.
- Browser runtime - React/TanStack client application bootstrapped through `src/routes/__root.tsx`, `src/router.tsx`, and TanStack Start route generation.
- Convex runtime - backend data functions live under `convex/`, with project-specific Convex guidance in `convex/_generated/ai/guidelines.md`.
- Local shell observation: Node `v26.4.0` and npm `11.17.0`; use the repository-pinned package manager and CI runtime as the implementation target.

**Package Manager:**
- npm 11.5.1 - declared by `"packageManager": "npm@11.5.1"` in `package.json`.
- Lockfile: present, `package-lock.json` with lockfile version 3.

## Frameworks

**Core:**
- React 19.2.7 - UI rendering for all human surfaces in `src/routes/`, `src/components/`, and `src/modules/*`.
- TanStack React Start 1.168.26 - full-stack routing/server-function framework configured in `vite.config.ts`, `src/start.ts`, `src/router.tsx`, and generated route artifacts.
- TanStack React Router 1.170.16 - file-based routes under `src/routes/`, root provider shell in `src/routes/__root.tsx`, and router creation in `src/router.tsx`.
- TanStack React Table 8.21.3 - table UI support for dense owner/admin views where imported under `src/`.
- Vite 8.1.0 - dev server and application build pipeline in `vite.config.ts`.
- Nitro nightly 3.0.1 alias - server build adapter in `vite.config.ts`, with Vercel preset and Node 20 function runtime.
- Convex 1.42.0 - database, scheduled jobs, queries, mutations, and source-of-record backend under `convex/` and `src/lib/server/convex-source.ts`.
- Clerk TanStack React Start 1.4.9 - owner/admin authentication middleware and provider integration in `src/start.ts`, `src/routes/__root.tsx`, `src/lib/server/claim-owner-session.ts`, and `src/lib/server/require-operator-session.ts`.
- Astryx Design 0.1.2 - canonical component/theme system via `@astryxdesign/core` and `@astryxdesign/theme-neutral`, wired in `src/routes/__root.tsx`, `src/components/astryx/RouterLink.tsx`, and `src/styles/globals.css`.
- Tailwind CSS 4.3.1 - layout and utility glue through `@tailwindcss/vite` in `vite.config.ts` and CSS imports in `src/styles/globals.css`.

**Testing:**
- Vitest 4.1.9 - unit, integration, type, copy, SEO, UI contract, and import tests configured in `vitest.config.ts` and `package.json`.
- Playwright 1.61.1 - browser E2E and deploy smoke tests configured in `playwright.config.ts` and `tests/e2e/`.
- Testing Library React 16.3.2 and Jest DOM 6.9.1 - React component and DOM assertions in `tests/`.
- JSDOM 29.1.1 - DOM environment support for Vitest tests in `package.json`.
- Promptfoo 0.120.3 - answer quality eval gate through `tests/eval/answer.promptfooconfig.yaml` and `package.json`.
- React Doctor 0.5.8 - React diagnostics through the `doctor` script in `package.json`.

**Build/Dev:**
- TypeScript compiler 6.0.3 - strict typechecking via `npm run typecheck` and `tsconfig.json`.
- TSX 4.20.5 - TypeScript script execution for test helpers and scans in `package.json`.
- Sentry Vite plugin 5.3.0 - optional sourcemap upload in `vite.config.ts` when Sentry build env vars are configured.
- Astryx CLI 0.1.2 - installed as a development dependency in `package.json`.
- Convex CLI from `convex` package - codegen and dev seeding through `npm run check:convex-codegen` and `npm run seed:dev`.

## Key Dependencies

**Critical:**
- `convex` 1.42.0 - database client/server SDK, generated API, schema definitions in `convex/schema.ts`, scheduled jobs in `convex/crons.ts`, and server access helpers in `src/lib/server/convex-source.ts`.
- `@clerk/tanstack-react-start` 1.4.9 - auth middleware/provider and server auth helpers in `src/start.ts`, `src/routes/__root.tsx`, `src/lib/server/claim-owner-session.ts`, and `src/lib/server/require-operator-session.ts`.
- `@astryxdesign/core` 0.1.2 and `@astryxdesign/theme-neutral` 0.1.2 - required visual system per `DESIGN.md`, imported in `src/routes/__root.tsx` and `src/styles/globals.css`.
- `@tanstack/ai` 0.38.0 - converts Zod action schemas to JSON Schema for action/tool contracts in `src/modules/common/action.ts`.
- `zod` 4.4.3 - request validation, action schemas, route handlers, Convex source inputs, and config parsing across `src/modules/*` and `src/routes/*`.
- `web-bot-auth` 0.1.3 - HTTP Message Signature verification for the quiet agent door in `src/modules/clearance/internal/web-bot-auth.ts`.
- `handshake-protocol-kernel` 0.4.0, `@noble/curves` 1.9.1, and `@noble/hashes` 1.8.0 - clearance and handshake primitives in `convex/spikeHandshakeRuntime.ts` and `src/modules/clearance/internal/*`.
- `posthog-js` 1.396.2 and `posthog-node` 5.39.0 - optional product analytics in `src/lib/observability/posthog.client.ts`, `src/lib/observability/posthog.server.ts`, and `src/lib/observability/config.ts`.
- `@sentry/react` 10.62.0 and `@sentry/node` 10.62.0 - optional error tracking/tracing in `src/lib/observability/sentry.client.ts`, `src/lib/observability/sentry.server.ts`, and `src/start.ts`.

**Infrastructure:**
- `@vitejs/plugin-react` 6.0.3 - React support in `vite.config.ts`.
- `@tailwindcss/vite` 4.3.1 - Tailwind 4 integration in `vite.config.ts`.
- `lucide-react` 1.21.0 - icon set for UI components in `src/`.
- `motion` 12.42.0 - animation primitives in UI components under `src/`.
- `clsx` 2.1.1, `tailwind-merge` 3.6.0, and `tw-animate-css` 1.4.0 - class composition and animation utilities in `package.json`.
- `atmn` 1.1.10 - Autumn CLI/dev dependency in `package.json`; runtime Autumn integration is custom HTTP in `src/modules/billing/internal/provider-readback.ts` and `src/lib/server/billing-provider.ts`.
- `@types/node`, `@types/react`, and `@types/react-dom` - TypeScript type support declared in `package.json`.

## Configuration

**Environment:**
- Environment files exist: `.env`, `.env.local`, and `.env.example`; contents were not read because they may contain secrets.
- Convex URL is read from `CONVEX_URL` or `VITE_CONVEX_URL` in `src/lib/server/convex-source.ts`.
- Clerk JWT issuer for Convex auth is `CLERK_JWT_ISSUER_DOMAIN` in `convex/auth.config.ts`; Clerk Backend API owner lookup uses `CLERK_SECRET_KEY` in `src/lib/server/notification-provider.ts`.
- Source-write admission uses server-only `AE_SOURCE_WRITE_SECRET` in `src/modules/security/source-write-admission.ts` and `src/lib/server/source-write-admission.ts`; public `VITE_AE_SOURCE_WRITE_SECRET` is explicitly rejected.
- OpenRouter answer tooling uses `OPENROUTER_API_KEY`, `AE_LLM_MODEL`, `AE_OPENROUTER_API_BASE_URL`, `AE_LLM_MODELS`, `AE_ANSWER_EVAL_PASSED`, and `AE_ALLOW_CHAT_API` in `src/modules/answer/internal/llm-config.ts`.
- Search backend selection uses `AE_SEARCH_BACKEND`, `MEILISEARCH_HOST`, `MEILISEARCH_ADMIN_KEY`, `AE_SEARCH_INDEX_UID`, and `AE_SEARCH_TIMEOUT_MS` in `src/modules/registry/internal/catalog-search-port.ts`.
- Observability uses `SENTRY_DSN`, `VITE_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_RELEASE`, `POSTHOG_KEY`, `VITE_POSTHOG_KEY`, `POSTHOG_HOST`, `VITE_POSTHOG_HOST`, `POSTHOG_APP_URL`, `VITE_POSTHOG_APP_URL`, `AE_DISABLE_OBSERVABILITY`, and `VITE_AE_DISABLE_OBSERVABILITY` in `vite.config.ts` and `src/lib/observability/config.ts`.
- Billing provider integration uses `AUTUMN_SECRET_KEY`, `AUTUMN_API_BASE_URL`, `AUTUMN_API_VERSION`, and `AUTUMN_WEBHOOK_SECRET` in `src/lib/server/billing-provider.ts` and `src/modules/billing/internal/provider-readback.ts`.
- Notification dispatch uses `AE_NOTIFICATION_OUTBOX_SECRET`, `RESEND_API_KEY`, `RESEND_FROM`, `RESEND_API_BASE_URL`, `RESEND_WEBHOOK_SECRET`, `NOVU_SECRET_KEY`, `NOVU_WORKFLOW_INQUIRY_OWNER`, `NOVU_WORKFLOW_INQUIRY_CUSTOMER`, and `NOVU_API_BASE_URL` in `src/lib/server/notification-provider.ts`.
- Business-action Stripe webhook verification uses `STRIPE_WEBHOOK_SECRET` in `src/routes/api.business-actions.stripe-webhook.ts`; checkout evidence creation accepts a server-supplied test-mode Stripe secret in `src/modules/business-action/internal/stripe-checkout.ts`.
- Canonical URL and host behavior uses `AE_CANONICAL_BASE_URL`, `AE_CANONICAL_HOST_ALLOWLIST`, `AE_SITE_URL`, `SITE_URL`, and Vercel env vars in `src/lib/server/canonical-url.ts`, `convex/discovery.ts`, and answer/OpenRouter headers.
- Local E2E auth bypass uses `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E` in `src/start.ts`, `src/routes/__root.tsx`, and `playwright.config.ts`; production throws if the bypass is enabled.
- Google Maps iframe rendering uses `VITE_GOOGLE_MAPS_API_KEY` in `src/components/ae/artifacts/AeGenerativeMap.tsx`.

**Build:**
- `vite.config.ts` configures TanStack Start, Nitro Vercel output, React, Tailwind, optional Sentry sourcemaps, dev server port 3000, Astryx SSR no-external handling, and dependency optimization.
- `tsconfig.json` enables strict TypeScript, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `useUnknownInCatchVariables`, `moduleResolution: "Bundler"`, `jsx: "react-jsx"`, and path aliases `@/*` and `~/*` to `src/*`.
- `convex/tsconfig.json` applies strict ESNext/Bundler TypeScript settings for Convex functions and excludes `convex/_generated`.
- `vitest.config.ts` runs `tests/**/*.test.ts` and `tests/**/*.test.tsx` in Node mode with `vite-tsconfig-paths`.
- `playwright.config.ts` runs compact and wide Chromium projects against `npm run dev -- --port 3020 --strictPort --host 127.0.0.1`.
- `.github/workflows/eval-gate.yml` runs typecheck, Convex codegen, Vitest suites, source scans, promptfoo answer eval, and production build on pushes and PRs to `main`.
- `package.json` scripts define the release gate: `test:release`, `test:all`, `test:unit`, `test:integration`, `test:e2e`, `test:a11y`, `test:types`, `test:imports`, `test:copy`, `test:seo`, `test:ui-contract`, `test:source`, `test:eval`, and `build`.

## Platform Requirements

**Development:**
- Use npm with `package-lock.json`; install dependencies with `npm ci` before running repo scripts from `package.json`.
- Use Node 20-compatible behavior because CI and Vercel output are pinned to Node 20 in `.github/workflows/eval-gate.yml` and `vite.config.ts`.
- Run `npm run check:convex-codegen` when Convex schema/functions change; Convex rules are documented in `convex/_generated/ai/guidelines.md`.
- Use `npm run dev` for local TanStack Start development; Playwright starts the app on `127.0.0.1:3020` through `playwright.config.ts`.
- Keep visual/UI implementation aligned with `DESIGN.md`: use Astryx first, use Tailwind 4 as layout glue, and do not introduce bespoke presentation systems.
- Keep product/API copy aligned with `PRODUCT.md` and `AGENTS.md`: AE reads, compares, summarizes, routes to next steps, and can send a qualified inquiry; it does not book, charge, dispatch, or auto-fulfil.

**Production:**
- Vercel is the configured server target through Nitro preset `vercel` and function runtime `nodejs20.x` in `vite.config.ts`.
- Convex is the primary data platform; production requires configured Convex deployment URL and Clerk Convex JWT issuer in `src/lib/server/convex-source.ts` and `convex/auth.config.ts`.
- Clerk protects owner/admin routes and provides authenticated Convex tokens through `src/start.ts`, `src/routes/__root.tsx`, and server auth helpers.
- Optional production services include OpenRouter for answer synthesis, Meilisearch for search shadow/primary mode, Sentry/PostHog for observability, Autumn for paid activation provider readback, Resend/Novu for notification dispatch, and Google Maps iframe embeds.
- CI/CD release confidence is enforced by `.github/workflows/eval-gate.yml` before build artifacts are produced.

---

*Stack analysis: 2026-07-04*
