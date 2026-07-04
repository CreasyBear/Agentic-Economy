# Technology Stack

**Analysis Date:** 2026-07-04

## Languages

**Primary:**
- TypeScript 6.0.3 - Application, route handlers, Convex functions, tooling scripts, and tests live in `src/`, `convex/`, `tests/`, `eval/`, and `examples/`; strict compiler settings are in `tsconfig.json` and `convex/tsconfig.json`.
- TSX / React JSX - UI routes and components live in `src/routes/` and `src/components/`; React 19.2.7 and React DOM 19.2.7 are declared in `package.json`.

**Secondary:**
- CSS - Astryx and Tailwind 4 global styling is composed in `src/styles/globals.css`; legacy styling remains imported from `src/styles/legacy.css`.
- YAML - CI and prompt/eval configuration use YAML in `.github/workflows/eval-gate.yml` and `eval/answer/promptfooconfig.yaml`.
- Markdown - Product, design, and planning guidance lives in `AGENTS.md`, `PRODUCT.md`, `DESIGN.md`, and `.planning/`.

## Runtime

**Environment:**
- Node.js 20.x - Production serverless runtime is pinned through Nitro/Vercel in `vite.config.ts`; GitHub Actions uses Node 20 in `.github/workflows/eval-gate.yml`.
- Browser runtime - React/TanStack Router client code runs from `src/routes/__root.tsx` with Astryx providers, Clerk provider gating, and client observability boot.
- Convex cloud runtime - Database functions live under `convex/`; Convex generated guidance in `convex/_generated/ai/guidelines.md` targets Convex `^1.41.0`, and `package.json` uses `convex@1.42.0`.
- Vite dev server - `npm run dev` runs `vite dev --host 127.0.0.1` from `package.json`; Playwright starts Vite on port 3020 in `playwright.config.ts`.

**Package Manager:**
- npm 11.5.1 - Declared as `packageManager` in `package.json`.
- Lockfile: present - `package-lock.json` uses lockfile version 3.

## Frameworks

**Core:**
- TanStack React Start 1.168.26 - Server functions, middleware, and SSR route handlers are wired in `src/start.ts` and `src/routes/`.
- TanStack React Router 1.170.16 - File routes live in `src/routes/`; the root route is `src/routes/__root.tsx`.
- Vite 8.1.0 - Build and dev tooling are configured in `vite.config.ts`.
- Nitro nightly 3.0.1 alias - Vercel Node serverless output is configured through the Nitro Vite plugin in `vite.config.ts`.
- Convex 1.42.0 - Backend schema and functions live in `convex/schema.ts` and `convex/*.ts`; server transport wrappers live in `src/lib/server/convex-source.ts`.
- Clerk TanStack React Start 1.4.9 - Auth middleware is wired in `src/start.ts`; route-level provider wrapping is in `src/routes/__root.tsx`; Convex JWT issuer config is in `convex/auth.config.ts`.
- Astryx design system 0.1.2 - Astryx providers are mounted in `src/routes/__root.tsx`, and CSS is imported in `src/styles/globals.css`.
- Tailwind CSS 4.3.1 - Tailwind is included through `@tailwindcss/vite` in `vite.config.ts` and CSS-first imports in `src/styles/globals.css`.

**Testing:**
- Vitest 4.1.9 - Unit, integration, eval, import, SEO, copy, UI-contract, and type-focused test scripts are declared in `package.json`; runner config is in `vitest.config.ts`.
- Playwright 1.61.1 - E2E tests use `playwright.config.ts`; deploy smoke tests use `playwright.deploy-smoke.config.ts`.
- Promptfoo 0.121.17 - Answer evals are run from `package.json` with config at `eval/answer/promptfooconfig.yaml`.
- Testing Library / jsdom - React tests use `@testing-library/react`, `@testing-library/jest-dom`, and `jsdom` from `package.json`.

**Build/Dev:**
- TypeScript compiler - `npm run typecheck` runs `tsc --noEmit` using `tsconfig.json`.
- Convex codegen check - `npm run check:convex-codegen` runs `convex codegen --dry-run --typecheck=disable` from `package.json`.
- Sentry Vite plugin - Conditional source map upload is configured in `vite.config.ts`.
- Astryx CLI - `@astryxdesign/cli` is installed in `package.json`; UI-craft helper scripts are wired through `.agents/skills/ui-craft/scripts/` in `package.json`.
- React Doctor - `doctor.config.ts` configures the supply-chain warning behavior; `npm run doctor` runs `react-doctor` from `package.json`.

## Key Dependencies

**Critical:**
- `convex@1.42.0` - Source-of-truth data, catalog search, inquiry, billing, notification, clearance, and observability functions are under `convex/`.
- `@clerk/tanstack-react-start@1.4.9` - Owner/admin auth and Convex token acquisition flow through `src/start.ts`, `src/routes/__root.tsx`, and `src/lib/server/convex-source.ts`.
- `@tanstack/react-start@1.168.26` and `@tanstack/react-router@1.170.16` - App routing and server-function architecture are centered on `src/routes/` and `src/start.ts`.
- `react@19.2.7` and `react-dom@19.2.7` - UI rendering for `src/routes/` and `src/components/`.
- `zod@4.4.3` - Runtime schemas for actions and route inputs are used in `src/modules/*/*.actions.ts` and `src/modules/*/*.functions.ts`.
- `@astryxdesign/core@0.1.2` and `@astryxdesign/theme-neutral@0.1.2` - The active design system is mounted in `src/routes/__root.tsx` and imported in `src/styles/globals.css`.
- `web-bot-auth@0.1.3` - Signed assistant identity verification is implemented in `src/modules/clearance/internal/web-bot-auth.ts`.
- `@noble/hashes@1.8.0` and `@noble/curves@1.9.1` - Source-write HMAC/HKDF signing support is implemented in `src/modules/security/source-write-admission.ts`.

**Infrastructure:**
- `@sentry/node`, `@sentry/react`, and `@sentry/vite-plugin` - Server/client error tracking and build uploads are wired in `src/lib/observability/` and `vite.config.ts`.
- `posthog-js` and `posthog-node` - Client/server analytics are implemented in `src/lib/observability/posthog.client.ts` and `src/lib/observability/posthog.server.ts`.
- `atmn` - Autumn feature/plan modeling is declared in `autumn.config.ts`.
- `undici` - Guarded storefront website import uses `Agent` in `src/modules/storefront/internal/import-draft.ts`.
- `handshake-protocol-kernel` - Handshake protocol spike/runtime code exists in `convex/spikeHandshakeRuntime.ts`, `tests/spike/`, and `vendor/handshake-protocol-kernel/`.
- `lucide-react`, `motion`, `clsx`, `tailwind-merge`, and `tw-animate-css` - UI support dependencies are declared in `package.json`.

## Configuration

**Environment:**
- Environment configuration is read from process/import-meta env in source files such as `src/lib/server/convex-source.ts`, `convex/auth.config.ts`, `src/lib/observability/config.ts`, `src/modules/answer/internal/llm-config.ts`, `src/lib/server/notification-provider.ts`, and `src/lib/server/billing-provider.ts`.
- Secret-bearing env files are present but not inspected: `.env`, `.env.local`, `.env.example`, and `examples/agent-experience/.env.example`.
- Core runtime env names detected in source include `CONVEX_URL`, `VITE_CONVEX_URL`, `CLERK_JWT_ISSUER_DOMAIN`, `CLERK_SECRET_KEY`, `AE_SOURCE_WRITE_KEY_*`, `AE_SOURCE_WRITE_SECRET`, `AE_NOTIFICATION_OUTBOX_SECRET`, `OPENROUTER_API_KEY`, `SENTRY_DSN`, `VITE_SENTRY_DSN`, `POSTHOG_KEY`, `VITE_POSTHOG_KEY`, `AUTUMN_SECRET_KEY`, `AUTUMN_WEBHOOK_SECRET`, `RESEND_API_KEY`, `RESEND_FROM`, `RESEND_WEBHOOK_SECRET`, `NOVU_SECRET_KEY`, `NOVU_WORKFLOW_INQUIRY_OWNER`, `MEILISEARCH_HOST`, `MEILISEARCH_ADMIN_KEY`, `AE_SEARCH_INDEX_UID`, and `VITE_GOOGLE_MAPS_API_KEY`.
- Local/test bypass env is explicitly guarded in source: `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E` is rejected in production in `src/start.ts` and `src/routes/__root.tsx`.

**Build:**
- Vite/TanStack/Nitro/Sentry/Tailwind build configuration: `vite.config.ts`.
- TypeScript configuration: `tsconfig.json` and `convex/tsconfig.json`.
- Test configuration: `vitest.config.ts`, `playwright.config.ts`, and `playwright.deploy-smoke.config.ts`.
- Billing plan configuration: `autumn.config.ts`.
- CI configuration: `.github/workflows/eval-gate.yml`.
- Convex generated AI guidance: `convex/_generated/ai/guidelines.md`.
- React Doctor configuration: `doctor.config.ts`.

## Platform Requirements

**Development:**
- Use npm with the committed lockfile: `npm ci` and scripts in `package.json`.
- Use Node 20-compatible runtime; CI and production both target Node 20 through `.github/workflows/eval-gate.yml` and `vite.config.ts`.
- Run Convex codegen checks with `npm run check:convex-codegen`; seed dev catalog through `npm run seed:dev` in `package.json`.
- Keep Convex work aligned with `convex/_generated/ai/guidelines.md`; Convex auth requires `convex/auth.config.ts`.
- UI work must follow Astryx/Tailwind constraints in `DESIGN.md`, with Astryx providers in `src/routes/__root.tsx`.

**Production:**
- Hosting target is Vercel Node serverless through Nitro preset `vercel` in `vite.config.ts`; `.vercel/` artifacts are present.
- Data/runtime target is Convex cloud via `CONVEX_URL` or `VITE_CONVEX_URL` in `src/lib/server/convex-source.ts`.
- Authentication target is Clerk with Convex JWT issuer configured in `convex/auth.config.ts`.
- Observability is optional and env-driven through `src/lib/observability/config.ts`.
- Public/product boundary remains discovery, comparison, and qualified inquiry only; `PRODUCT.md`, `AGENTS.md`, and `src/modules/inquiries/inquiry.actions.ts` explicitly avoid booking, charging, work dispatch, or auto-fulfilment claims.

---

*Stack analysis: 2026-07-04*
