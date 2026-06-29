# Technology Stack

**Analysis Date:** 2026-06-29

## Languages

**Primary:**
- TypeScript 6.0.3 - Application routes, server functions, Convex functions, domain modules, and tests live in `src/**/*.ts`, `src/**/*.tsx`, `convex/**/*.ts`, `tests/**/*.ts`, and `tests/**/*.tsx`.
- TSX / React JSX - UI routes and components live in `src/routes/*.tsx`, `src/components/**/*.tsx`, and parked phase routes under `src/future-phases/**/*.tsx`.

**Secondary:**
- CSS - Global styles and design tokens live in `src/styles/globals.css` and `src/styles/tokens.css`; Tailwind scans `src/**/*.{ts,tsx}` and `tests/**/*.{ts,tsx}` from `tailwind.config.ts`.
- JSON - Project, TypeScript, shadcn, package, and lockfile configuration lives in `package.json`, `package-lock.json`, `tsconfig.json`, `components.json`, and `convex/tsconfig.json`.
- Markdown - Planning and process documents live under `.planning/` and Convex notes live in `convex/README.md`.

## Runtime

**Environment:**
- Node.js - The local runtime reports `node` v26.4.0; the app scripts in `package.json` run Vite, TypeScript, Convex codegen, Vitest, and Playwright through npm.
- Nitro node server - Build output metadata in `.output/nitro.json` uses the `node-server` preset with server entry `.output/server/index.mjs`.
- Browser runtime - React and TanStack Router client assets are generated into `.output/public/assets/` by the Vite/TanStack Start build.

**Package Manager:**
- npm 11.5.1 - Declared in `package.json` as `"packageManager": "npm@11.5.1"`.
- npm 11.17.0 - The local `npm -v` result for this checkout.
- Lockfile: present - `package-lock.json` uses lockfileVersion 3 and pins the dependency graph.

## Frameworks

**Core:**
- React 19.2.7 - UI runtime for `src/routes/*.tsx` and `src/components/**/*.tsx`, declared in `package.json`.
- React DOM 19.2.7 - Browser rendering package declared in `package.json`.
- TanStack React Start 1.168.26 - Full-stack React framework used through `@tanstack/react-start` in `package.json`, `vite.config.ts`, `src/start.ts`, and server functions such as `src/modules/inquiries/inquiry.functions.ts`.
- TanStack React Router 1.170.16 - File-route router used in `src/router.tsx`, generated route tree `src/routeTree.gen.ts`, and route files under `src/routes/`.
- Vite 8.1.0 - Dev/build tool configured in `vite.config.ts` and invoked by `npm run dev` and `npm run build` in `package.json`.
- Nitro 3.0.1 nightly - Server build/runtime plugin imported from `nitro/vite` in `vite.config.ts`; output metadata is in `.output/nitro.json`.
- Convex 1.42.0 - Backend database and function runtime under `convex/`, with schema composition in `convex/schema.ts`.
- Clerk TanStack React Start 1.4.9 - Authentication provider integrated through `src/start.ts`, `src/routes/__root.tsx`, `src/routes/sign-in.$.tsx`, `src/routes/sign-up.$.tsx`, and `convex/auth.config.ts`.

**UI:**
- Tailwind CSS 4.3.1 - Vite plugin configured in `vite.config.ts`; content scan configured in `tailwind.config.ts`.
- shadcn 4.12.0 - Component system configured in `components.json`, with UI source files under `src/components/ui/`.
- Radix UI 1.6.0 - Primitive dependency used by shadcn components such as `src/components/ui/button.tsx`, `src/components/ui/badge.tsx`, and `src/components/ui/separator.tsx`.
- lucide-react 1.21.0 - Icon library used in route and layout components such as `src/routes/index.tsx`, `src/routes/admin.inquiries.tsx`, and `src/components/ae/layout/AeAdminShell.tsx`.
- @fontsource-variable/geist 5.2.9 - Font asset dependency declared in `package.json`; generated font assets appear under `.output/public/assets/`.
- class-variance-authority 0.7.1, clsx 2.1.1, tailwind-merge 3.6.0 - Component styling utilities used by `src/components/ui/button.tsx`, `src/components/ui/badge.tsx`, and `src/lib/utils.ts`.
- tw-animate-css 1.4.0 - Animation utility dependency declared in `package.json`.

**Validation and Contracts:**
- Zod 4.4.3 - Runtime validation for server functions and domain modules such as `src/modules/inquiries/inquiry.functions.ts`, `src/modules/catalog/owner-claim.functions.ts`, and `src/modules/registry/internal/validators.ts`.
- Convex validators - `convex/values` validators are used across `convex/*.ts` and schema fragments in `src/modules/*/internal/schema.ts`.

**Testing:**
- Vitest 4.1.9 - Unit, integration, type, import, copy, SEO, and UI-contract tests configured in `vitest.config.ts` and scripted in `package.json`.
- Playwright 1.61.1 - E2E, accessibility, and deploy smoke tests configured in `playwright.config.ts` and `playwright.deploy-smoke.config.ts`.
- Testing Library React 16.3.2 and jest-dom 6.9.1 - React test helpers declared in `package.json`.
- jsdom 29.1.1 - DOM test environment dependency declared in `package.json`, while `vitest.config.ts` sets the default test environment to `node`.

**Build/Dev:**
- TypeScript compiler - `npm run typecheck` runs `tsc --noEmit` from `package.json`; strict compiler options are set in `tsconfig.json`.
- Convex codegen - `npm run check:convex-codegen` runs `convex codegen --dry-run --typecheck=disable` from `package.json`.
- Vite React plugin - `@vitejs/plugin-react` 6.0.3 is imported by `vite.config.ts`.
- Tailwind Vite plugin - `@tailwindcss/vite` 4.3.1 is imported by `vite.config.ts`.
- vite-tsconfig-paths 6.1.1 - Declared in `package.json`; `vite.config.ts` enables `resolve.tsconfigPaths`.

## Key Dependencies

**Critical:**
- `@tanstack/react-start` 1.168.26 - Owns server functions, request middleware, and app runtime in `src/start.ts`, `src/modules/**/*.functions.ts`, and `vite.config.ts`.
- `@tanstack/react-router` 1.170.16 - Owns file-based route definitions under `src/routes/` and generated types in `src/routeTree.gen.ts`.
- `convex` 1.42.0 - Owns persistent source state, typed Convex functions, and HTTP clients in `convex/schema.ts`, `convex/*.ts`, and `src/lib/server/convex-source.ts`.
- `@clerk/tanstack-react-start` 1.4.9 - Owns Clerk middleware, provider wrapper, sign-in/sign-up UI, and server auth reads in `src/start.ts`, `src/routes/__root.tsx`, `src/routes/sign-in.$.tsx`, `src/routes/sign-up.$.tsx`, and `src/lib/server/convex-source.ts`.
- `zod` 4.4.3 - Validate route/server-function inputs in `src/routes/privacy.remove-business.tsx`, `src/modules/inquiries/inquiry.functions.ts`, `src/modules/catalog/owner-claim.functions.ts`, and module validators under `src/modules/*/internal/validators.ts`.
- `react` 19.2.7 and `react-dom` 19.2.7 - Required by every TSX route/component under `src/routes/` and `src/components/`.

**Infrastructure:**
- `@playwright/test` 1.61.1 - Browser automation for `tests/e2e/`, `tests/e2e/a11y/`, and `tests/deploy-smoke/`.
- `vitest` 4.1.9 - Test runner for `tests/unit/`, `tests/integration/`, `tests/types/`, `tests/imports/`, `tests/copy/`, `tests/seo/`, and `tests/ui-contract/`.
- `typescript` 6.0.3 - Type checking configured by `tsconfig.json` and `convex/tsconfig.json`.
- `@tailwindcss/vite` 4.3.1 and `tailwindcss` 4.3.1 - Styling pipeline configured by `vite.config.ts`, `tailwind.config.ts`, and `src/styles/globals.css`.
- `nitro` nightly - Server bundling configured by `vite.config.ts`; generated server metadata appears in `.output/nitro.json`.
- `shadcn` 4.12.0 - Component registry tooling configured by `components.json`.

## Configuration

**Environment:**
- Environment files are present as `.env.local` and `.env.example`; contents were not read.
- Convex server calls require `CONVEX_URL` or `VITE_CONVEX_URL`, read by `src/lib/server/convex-source.ts` and duplicate server route helpers such as `src/routes/api.businesses.ts`.
- Convex auth requires `CLERK_JWT_ISSUER_DOMAIN`, read by `convex/auth.config.ts`.
- Clerk-backed notification delivery uses `CLERK_SECRET_KEY`, read by `src/lib/server/notification-provider.ts`.
- Public URL generation uses `SITE_URL` or `VITE_SITE_URL`, read by `src/modules/inquiries/inquiry.functions.ts`, `src/modules/catalog/owner-claim.functions.ts`, and `src/routes/privacy.remove-business.tsx`.
- Local/E2E auth bypass uses `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E`, read by `src/start.ts`, `src/routes/__root.tsx`, and server-route helpers.
- Origin controls use `AE_ALLOWED_ORIGINS` or `VITE_AE_ALLOWED_ORIGINS`, read by `convex/catalog.ts`, `convex/business.ts`, `convex/discovery.ts`, `convex/inquiries.ts`, `convex/notificationOutbox.ts`, `convex/observability.ts`, and `convex/security.ts`.
- Notification dispatch requires `AE_NOTIFICATION_OUTBOX_SECRET`, read by `src/lib/server/notification-provider.ts` and `convex/notificationOutbox.ts`.
- Resend requires `RESEND_API_KEY`, `RESEND_FROM`, and `RESEND_WEBHOOK_SECRET`, with optional `RESEND_API_BASE_URL`, read by `src/lib/server/notification-provider.ts`.
- Novu requires `NOVU_SECRET_KEY` and `NOVU_WORKFLOW_INQUIRY_OWNER`, with optional `NOVU_WORKFLOW_INQUIRY_CUSTOMER` and `NOVU_API_BASE_URL`, read by `src/lib/server/notification-provider.ts`.
- Autumn billing requires `AUTUMN_SECRET_KEY`, with optional `AUTUMN_API_BASE_URL`, `AUTUMN_API_VERSION`, and `AUTUMN_WEBHOOK_SECRET`, read by `src/lib/server/billing-provider.ts`.
- Playwright uses `PLAYWRIGHT_BASE_URL` in `playwright.config.ts`; deploy smoke tests use `DEPLOY_BASE_URL`, `DEPLOY_CONVEX_URL`, `SMOKE_*`, and storage-state env vars under `tests/deploy-smoke/`.

**Build:**
- `vite.config.ts` configures port `3000`, `resolve.tsconfigPaths`, TanStack Start, Nitro, React, and Tailwind plugins.
- `tsconfig.json` enables strict TypeScript, `ES2022`, `moduleResolution: "Bundler"`, `jsx: "react-jsx"`, and aliases `@/*` and `~/*` to `src/*`.
- `convex/tsconfig.json` applies strict TypeScript to Convex source and excludes `convex/_generated`.
- `tailwind.config.ts` configures Tailwind content paths for `src/` and `tests/`.
- `components.json` configures shadcn style `radix-nova`, Tailwind CSS file `src/styles/globals.css`, base color `neutral`, lucide icons, and aliases for `@/components`, `@/components/ui`, `@/lib`, and `@/hooks`.
- `vitest.config.ts` configures Vitest with `tsconfigPaths`, node environment, and `tests/**/*.test.ts(x)` includes.
- `playwright.config.ts` configures local E2E test projects and starts `npm run dev`; `playwright.deploy-smoke.config.ts` configures deployed smoke tests without a local web server.
- No ESLint, Prettier, Biome, Docker, Vercel JSON, Netlify, Fly, Railway, or GitHub Actions config is detected in the repository root.

**Project skill constraints:**
- Use Convex validator and index-first patterns from `.codex/skills/convex-best-practices/SKILL.md` and `.codex/skills/convex-functions/SKILL.md` when adding Convex functions under `convex/` or schema fragments under `src/modules/*/internal/schema.ts`.
- Use Clerk/TanStack Start auth patterns from `.codex/skills/clerk-tanstack-patterns/SKILL.md`: middleware belongs in `src/start.ts`, provider wrapping belongs in `src/routes/__root.tsx`, and server auth belongs in server-side code.
- Use TanStack Start server-function and API-route patterns from `.codex/skills/tanstack-start/SKILL.md` for code under `src/modules/**/*.functions.ts` and `src/routes/api.*.ts`.
- Use TanStack Router file-route patterns from `.codex/skills/tanstack-router/SKILL.md` for route files under `src/routes/` and generated route types in `src/routeTree.gen.ts`.
- Use shadcn component constraints from `.agents/skills/shadcn/SKILL.md` and project settings from `components.json` for components under `src/components/ui/` and `src/components/ae/`.

## Platform Requirements

**Development:**
- Install dependencies with npm using `package.json` and `package-lock.json`.
- Run the app with `npm run dev`; Vite serves on `127.0.0.1` from the script in `package.json` and port `3000` from `vite.config.ts`.
- Type check with `npm run typecheck` and Convex codegen validation with `npm run check:convex-codegen` from `package.json`.
- Run tests with `npm run test`, `npm run test:unit`, `npm run test:integration`, `npm run test:e2e`, and the focused scripts in `package.json`.
- Configure `.env.local` with the env vars read by `src/lib/server/convex-source.ts`, `convex/auth.config.ts`, `src/lib/server/notification-provider.ts`, and `src/lib/server/billing-provider.ts`.

**Production:**
- Build with `npm run build`, which runs `vite build` from `package.json`.
- The generated server target is Nitro `node-server` in `.output/nitro.json`.
- The repo has a linked Vercel marker directory `.vercel/` and `.vercel/README.txt`, but no checked-in `vercel.json` or CI workflow is detected.
- Production Convex access depends on `CONVEX_URL` or `VITE_CONVEX_URL`, Convex schema/functions under `convex/`, and Clerk issuer config in `convex/auth.config.ts`.
- Production auth, notification, and billing providers depend on server-side env vars read by `src/start.ts`, `src/lib/server/notification-provider.ts`, and `src/lib/server/billing-provider.ts`.

---

*Stack analysis: 2026-06-29*
