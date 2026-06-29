# Technology Stack

**Analysis Date:** 2026-06-29

## Languages

**Primary:**
- TypeScript 6.0.3 - Application routes, TanStack Start server functions, Convex functions, billing modules, provider seams, and tests live in `src/**/*.ts`, `src/**/*.tsx`, `convex/**/*.ts`, `tests/**/*.ts`, and `tests/**/*.tsx`.
- TSX / React JSX - Route and component UI lives in `src/routes/*.tsx`, `src/components/**/*.tsx`, and parked Phase 5 route surfaces under `src/future-phases/05-paid-activation-money-rails/routes/*.tsx`.

**Secondary:**
- CSS - Global styles and token imports live in `src/styles/globals.css`; Tailwind runs through the Vite plugin configured in `vite.config.ts`.
- JSON - Project and compiler configuration lives in `package.json`, `package-lock.json`, `tsconfig.json`, and `convex/tsconfig.json`.
- Markdown - Phase and codebase planning docs live under `.planning/`; Phase 5 paid-activation contracts live under `.planning/phases/05-paid-activation-money-rails/`.

## Runtime

**Environment:**
- Node.js - Local command output is `v26.4.0`; the repo does not declare a Node `engines` field in `package.json`.
- TanStack Start on Vite/Nitro - Runtime entry is created in `src/start.ts`, Vite/Nitro plugins are configured in `vite.config.ts`, and generated Nitro metadata in `.output/nitro.json` reports preset `node-server` with server entry `server/index.mjs`.
- Browser runtime - React/TanStack Router route surfaces live under `src/routes/`; parked future route helpers live under `src/future-phases/route-helpers.ts`.

**Package Manager:**
- npm 11.5.1 - Declared by `"packageManager": "npm@11.5.1"` in `package.json`.
- npm 11.17.0 - Local `npm --version` output in this checkout.
- Lockfile: present - `package-lock.json` is committed and pins the dependency graph.

## Frameworks

**Core:**
- React 19.2.7 and React DOM 19.2.7 - UI runtime declared in `package.json`.
- TanStack React Start 1.168.26 - Full-stack app framework configured by `vite.config.ts` and request middleware in `src/start.ts`.
- TanStack React Router 1.170.16 - File-route routing used by route files under `src/routes/` and generated route types in `src/routeTree.gen.ts`.
- Vite 8.1.0 - Dev/build tool invoked by `npm run dev` and `npm run build` in `package.json`; configured in `vite.config.ts`.
- Nitro 3.0.1 nightly - Server build plugin imported in `vite.config.ts`; generated output metadata is in `.output/nitro.json`.
- Convex 1.42.0 - Backend database/functions under `convex/`; schema composition imports `billingTables` and other domain tables in `convex/schema.ts`.
- Clerk TanStack React Start 1.4.9 - Auth middleware and server auth in `src/start.ts` and `src/lib/server/convex-source.ts`; Convex JWT issuer config in `convex/auth.config.ts`.

**UI:**
- Tailwind CSS 4.3.1 - Vite plugin configured in `vite.config.ts`.
- shadcn 4.12.0 and Radix UI 1.6.0 - UI component tooling/dependencies declared in `package.json`; components live under `src/components/ui/` and `src/components/ae/`.
- lucide-react 1.21.0 - Icon dependency declared in `package.json`.
- `class-variance-authority` 0.7.1, `clsx` 2.1.1, and `tailwind-merge` 3.6.0 - Component styling utilities declared in `package.json`.
- `@fontsource-variable/geist` 5.2.9 - Font asset dependency declared in `package.json`.

**Testing:**
- Vitest 4.1.9 - Test runner configured in `vitest.config.ts`; package scripts in `package.json` cover unit, integration, type, imports, copy, SEO, and UI-contract tests.
- Playwright 1.61.1 - Local E2E/a11y config in `playwright.config.ts`; deployed smoke config in `playwright.deploy-smoke.config.ts`.
- Testing Library React 16.3.2, jest-dom 6.9.1, and jsdom 29.1.1 - Test helpers declared in `package.json`; `vitest.config.ts` uses Node as the default test environment.

**Build/Dev:**
- TypeScript compiler - `npm run typecheck` runs `tsc --noEmit` from `package.json`; strict options are enabled in `tsconfig.json` and `convex/tsconfig.json`.
- Convex codegen check - `npm run check:convex-codegen` runs `convex codegen --dry-run --typecheck=disable` from `package.json`.
- Vite dev server - `npm run dev` runs `vite dev --host 127.0.0.1`; `vite.config.ts` sets dev server port `3000`.
- TanStack/Vite plugins - `tanstackStart()`, `nitro()`, `viteReact()`, and `tailwindcss()` are registered in `vite.config.ts`.

## Key Dependencies

**Critical:**
- `@tanstack/react-start` 1.168.26 - Owns request middleware in `src/start.ts` and server function patterns in `src/modules/**/*.functions.ts`.
- `convex` 1.42.0 - Owns source state and typed functions in `convex/*.ts`, schema fragments under `src/modules/*/internal/schema.ts`, and HTTP clients in `src/lib/server/convex-source.ts`.
- `@clerk/tanstack-react-start` 1.4.9 - Owns Clerk middleware, provider integration, hosted sign-in/sign-up routes, and server auth calls in `src/start.ts`, `src/routes/__root.tsx`, `src/routes/sign-in.$.tsx`, `src/routes/sign-up.$.tsx`, and `src/lib/server/convex-source.ts`.
- `zod` 4.4.3 - Runtime validation dependency for route/server-function modules under `src/modules/` and `src/routes/`.
- `src/modules/billing/public.ts` - Route-facing Phase 5 billing seam exporting paid activation, customer portal, provider event ingest, receipts, reconciliation, no-repair, disable, and projection functions.

**Infrastructure:**
- `src/modules/billing/internal/provider-readback.ts` - Raw `fetch` Autumn HTTP provider for `/v1/billing.attach`, `/v1/billing.open_customer_portal`, and `/v1/customers.get`; no Autumn npm SDK is declared in `package.json`.
- Stripe package: Not detected - `package.json` has no `stripe` dependency; Stripe PSP evidence appears as provider value `stripe_psp` in `src/modules/billing/internal/schema.ts` and invoice snapshots normalized from Autumn responses in `src/modules/billing/internal/provider-readback.ts`.
- `src/lib/server/billing-provider.ts` - Server-only Autumn config reader and webhook seam; `verifyAutumnWebhook` currently rejects callbacks with `unverified_webhook`.
- `src/lib/server/notification-provider.ts` - Raw `fetch` integrations for Clerk owner lookup, Resend email send/webhook normalization, and Novu workflow trigger/readback.
- `@playwright/test` 1.61.1 - Browser automation for `tests/e2e/`, `tests/e2e/a11y/`, and `tests/deploy-smoke/`.

## Configuration

**Environment:**
- Environment files are present as `.env.local` and `.env.example`; contents were not read.
- Convex server calls require `CONVEX_URL` or `VITE_CONVEX_URL`, read by `src/lib/server/convex-source.ts`.
- Convex auth requires `CLERK_JWT_ISSUER_DOMAIN`, read by `convex/auth.config.ts`.
- Clerk owner lookup requires `CLERK_SECRET_KEY`, read by `src/lib/server/notification-provider.ts`.
- Clerk local E2E bypass uses `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E`, read by `src/start.ts`, `src/routes/__root.tsx`, and multiple server-function helpers under `src/modules/`.
- Source-write admission requires `AE_SOURCE_WRITE_SECRET` and explicitly rejects `VITE_AE_SOURCE_WRITE_SECRET` in `src/lib/server/source-write-admission.ts`.
- Notification dispatch requires `AE_NOTIFICATION_OUTBOX_SECRET`, read by `src/lib/server/notification-provider.ts` and `convex/notificationOutbox.ts`.
- Resend requires `RESEND_API_KEY`, `RESEND_FROM`, and `RESEND_WEBHOOK_SECRET`, with optional `RESEND_API_BASE_URL`, read by `src/lib/server/notification-provider.ts`.
- Novu requires `NOVU_SECRET_KEY` and `NOVU_WORKFLOW_INQUIRY_OWNER`, with optional `NOVU_WORKFLOW_INQUIRY_CUSTOMER` and `NOVU_API_BASE_URL`, read by `src/lib/server/notification-provider.ts`.
- Autumn currently requires `AUTUMN_SECRET_KEY`, with optional `AUTUMN_API_BASE_URL`, `AUTUMN_API_VERSION`, and `AUTUMN_WEBHOOK_SECRET`, read by `src/lib/server/billing-provider.ts`.
- Phase 5 plan also reserves `AUTUMN_ENVIRONMENT`, `AUTUMN_PROJECT_ID`, `AUTUMN_PORTAL_RETURN_BASE_URL`, `STRIPE_SECRET_KEY`, and `STRIPE_WEBHOOK_SECRET` for the first implementation PR that reads them; see `.planning/phases/05-paid-activation-money-rails/05-01-autumn-stripe-paid-activation-PLAN.md`.

**Build:**
- `vite.config.ts` configures port `3000`, TypeScript path resolution, TanStack Start, Nitro, React, and Tailwind.
- `tsconfig.json` enables strict TypeScript, `moduleResolution: "Bundler"`, `jsx: "react-jsx"`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, and aliases `@/*` and `~/*` to `src/*`.
- `convex/tsconfig.json` applies strict TypeScript to Convex source and excludes `convex/_generated`.
- `vitest.config.ts` configures `tsconfigPaths`, Node environment, non-global tests, and `tests/**/*.test.ts(x)` includes.
- `playwright.config.ts` starts `npm run dev` and tests compact and wide Chromium projects against `PLAYWRIGHT_BASE_URL` or `http://127.0.0.1:3000`.
- `playwright.deploy-smoke.config.ts` configures deployed smoke tests without a local web server.
- No root `vercel.json`, `.github/`, Dockerfile, Netlify, Fly, or Railway config is detected.

**Phase 5 Autumn+Stripe readiness:**
- Implemented local seam: `src/modules/billing/public.ts`, `src/modules/billing/internal/operations.ts`, `src/modules/billing/internal/provider-readback.ts`, `src/modules/billing/internal/schema.ts`, and `convex/schema.ts`.
- Implemented source tables: `billingOffers`, `billingOperations`, `billingProviderEvents`, `billingReceipts`, `billingReconciliations`, and `capabilityLaunchSupportRecords` in `src/modules/billing/internal/schema.ts`, included by `convex/schema.ts`.
- Parked route surfaces: `src/future-phases/05-paid-activation-money-rails/routes/owner.billing*.tsx` and `src/future-phases/05-paid-activation-money-rails/routes/api.billing.webhook.ts`.
- Current webhook posture: `src/lib/server/billing-provider.ts` refuses Autumn callbacks until a real signature verifier is configured.
- Current Stripe posture: direct Stripe SDK/client is not installed; Stripe appears only as PSP evidence under Autumn in `src/modules/billing/internal/schema.ts` and `src/modules/billing/internal/provider-readback.ts`.
- Phase 5 execution status is ready for execution prep after `.planning/phases/05-paid-activation-money-rails/05-MONEY-RAIL-DECISION.md`; live/provider claims remain blocked on durable billing runtime, signature verification, provider smoke/readback, receipts, reconciliation, and rollback evidence.

**Verification commands:**
- `npm run check:convex-codegen` - Convex codegen/type surface check from `package.json`.
- `npm run typecheck` - TypeScript strict check from `package.json`.
- `npm run test`, `npm run test:unit`, and `npm run test:integration` - Vitest suites from `package.json`.
- `npm run test:e2e` and `npm run test:e2e:a11y` - Playwright local browser suites from `package.json`.
- `npm run test:types`, `npm run test:imports`, `npm run test:source-mining`, `npm run test:copy`, `npm run test:seo`, and `npm run test:ui-contract` - contract gates from `package.json`.
- `npm run test:deploy-smoke`, `npm run test:provider-smoke:resend`, and `npm run test:provider-smoke:novu` - deployed smoke scripts from `package.json`; Phase 5 provider smoke commands are specified in `.planning/phases/05-paid-activation-money-rails/05-01-autumn-stripe-paid-activation-PLAN.md`.
- `npm run build` and `npm run test:all` - build and aggregate local verification from `package.json`.

## Platform Requirements

**Development:**
- Install dependencies with npm using `package.json` and `package-lock.json`.
- Run the app with `npm run dev`; `vite.config.ts` serves port `3000` and `package.json` binds Vite to `127.0.0.1`.
- Configure `.env.local` with Convex, Clerk, source-write, notification, and Autumn env vars read by `src/lib/server/convex-source.ts`, `convex/auth.config.ts`, `src/lib/server/source-write-admission.ts`, `src/lib/server/notification-provider.ts`, and `src/lib/server/billing-provider.ts`.
- Use Convex validator/index/idempotency patterns from `.codex/skills/convex-best-practices/SKILL.md` and HTTP action webhook patterns from `.codex/skills/convex-http-actions/SKILL.md` when adding Convex functions or webhooks.
- Use Clerk TanStack/React auth patterns from `.codex/skills/clerk/SKILL.md`, `.codex/skills/clerk-react-patterns/SKILL.md`, and current `src/start.ts`/`src/routes/__root.tsx` placement.
- Use Stripe skill guardrails from `.codex/skills/stripe/SKILL.md`: default to test mode, prefer read-only inspection first, and never expose secret keys or webhook signing secrets.

**Production:**
- Build with `npm run build`, which runs `vite build` from `package.json`.
- Runtime output is Nitro `node-server` per `.output/nitro.json`.
- Vercel posture: `.vercel/README.txt` indicates the directory is linked to Vercel, but root deployment config is not committed and `.vercel/` should not be shared.
- Convex production posture requires deployed Convex URL env (`CONVEX_URL` or `VITE_CONVEX_URL`) and Clerk issuer env (`CLERK_JWT_ISSUER_DOMAIN`) matching `src/lib/server/convex-source.ts` and `convex/auth.config.ts`.
- Phase 5 production posture requires real Autumn+Stripe provider keys, signed webhook/readback verification, receipts, reconciliation, rollback/disable evidence, and deploy/readback smoke as specified in `.planning/phases/05-paid-activation-money-rails/05-CONTEXT.md` and `.planning/phases/05-paid-activation-money-rails/05-01-autumn-stripe-paid-activation-PLAN.md`.

---

*Stack analysis: 2026-06-29*
