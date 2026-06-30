# Technology Stack

**Analysis Date:** 2026-06-30

## Languages

**Primary:**
- TypeScript 6.0.3 - application routes, server functions, domain modules, Convex functions, tests, and config in `src/`, `convex/`, `tests/`, `vite.config.ts`, `vitest.config.ts`, and `playwright.config.ts`.
- TSX / React 19.2.7 - route components and UI components in `src/routes/`, `src/components/`, and `src/future-phases/`.

**Secondary:**
- CSS / Tailwind CSS 4.3.1 - global styles, theme tokens, shadcn styles, and public landing styles in `src/styles/globals.css`, `src/styles/tokens.css`, `src/styles/landing-v2.css`, and `tailwind.config.ts`.
- JSON - package, TypeScript, component, lockfile, planning, and generated graph/config files in `package.json`, `package-lock.json`, `tsconfig.json`, `components.json`, and `.planning/`.
- Markdown - product, design, security, phase, and codebase planning documents in `DESIGN.md`, `PRODUCT.md`, and `.planning/`.

## Runtime

**Environment:**
- Node.js runtime - local shell reports `v26.4.0`; the repo has no committed `.nvmrc` or `engines` field in `package.json`.
- Package constraints in `package-lock.json` include tools that require Node `^20.19.0 || >=22.12.0`, so use Node 20.19+ or 22.12+/24+ for reproducible installs.
- ESM modules are enabled through `"type": "module"` in `package.json`.
- TanStack Start runs through Vite and Nitro via `vite.config.ts`; the dev server is configured for port `3000`.

**Package Manager:**
- npm declared as `npm@11.5.1` in `package.json`.
- Local shell npm reports `11.17.0`; prefer the declared `packageManager` value for reproducible automation.
- Lockfile: present as `package-lock.json` with `lockfileVersion: 3`.

## Frameworks

**Core:**
- React 19.2.7 - UI rendering for route and component trees in `src/routes/` and `src/components/`.
- @tanstack/react-start 1.168.26 - full-stack server functions, middleware, SSR, and API routes through `src/start.ts`, `src/routes/*.ts`, and `src/routes/*.tsx`.
- @tanstack/react-router 1.170.16 - file route definitions in `src/routes/`, router setup in `src/router.tsx`, and generated tree in `src/routeTree.gen.ts`.
- Vite 8.1.0 - dev/build entry in `vite.config.ts` and scripts in `package.json`.
- Nitro nightly `3.0.1-20260628-090458-3df69609` - server runtime plugin configured in `vite.config.ts`.
- Convex 1.42.0 - source-owned database schema, queries, and mutations in `convex/` and Convex HTTP client access in `src/lib/server/convex-source.ts`.
- Clerk TanStack React Start 1.4.9 - auth provider, middleware, root provider, and sign-in/sign-up routes in `src/start.ts`, `src/routes/__root.tsx`, `src/routes/sign-in.$.tsx`, and `src/routes/sign-up.$.tsx`.

**UI & Styling:**
- Tailwind CSS 4.3.1 with `@tailwindcss/vite` 4.3.1 - configured in `tailwind.config.ts`, `vite.config.ts`, and `src/styles/globals.css`.
- shadcn 4.12.0 with Radix Nova style - configured in `components.json`; generated UI primitives live in `src/components/ui/`.
- radix-ui 1.6.0 - low-level UI primitives used by `src/components/ui/button.tsx`, `src/components/ui/separator.tsx`, and related UI files.
- lucide-react 1.21.0 - icon set used across routes and AE components in `src/routes/` and `src/components/ae/`.
- `@fontsource-variable/geist` 5.2.9 - imported in `src/styles/globals.css`.
- `class-variance-authority`, `clsx`, `tailwind-merge`, and `tw-animate-css` - styling utilities used by `src/components/ui/`, `src/lib/utils.ts`, and `src/styles/globals.css`.

**Validation & Domain Contracts:**
- Zod 4.4.3 - server function validators and contract tests in files such as `src/modules/business-action/business-action.functions.ts`, `src/modules/catalog/owner-claim.functions.ts`, and `tests/types/domain-contracts.test.ts`.
- Convex validators from `convex/values` - schema and function validators in `convex/schema.ts`, `convex/businessActions.ts`, and module schemas under `src/modules/*/internal/schema.ts`.

**Testing:**
- Vitest 4.1.9 - unit, integration, type, import, SEO, copy, and UI contract suites configured by `vitest.config.ts` and scripts in `package.json`.
- Playwright 1.61.1 - browser E2E, a11y, and deployed smoke tests configured by `playwright.config.ts` and `playwright.deploy-smoke.config.ts`.
- Testing Library React 16.3.2, jest-dom 6.9.1, and jsdom 29.1.1 - component and DOM-oriented testing dependencies in `package.json`.

**Build/Dev:**
- TypeScript strict mode is configured in `tsconfig.json` with `strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `useUnknownInCatchVariables`, and `noImplicitOverride`.
- Path aliases `@/*` and `~/*` map to `src/*` in `tsconfig.json`; Vite enables `tsconfigPaths` in `vite.config.ts`.
- Convex code generation is run by `npm run check:convex-codegen`, which executes `convex codegen --dry-run --typecheck=disable` from `package.json`.
- No committed ESLint, Prettier, or Biome config was detected in the repo root; formatting/linting enforcement is mostly encoded in tests under `tests/imports/`, `tests/ui-contract/`, and `tests/copy/`.

## Key Dependencies

**Critical:**
- `@tanstack/react-start` and `@tanstack/react-router` - define the app, API routes, server functions, middleware, and routing surface in `src/start.ts`, `src/router.tsx`, and `src/routes/`.
- `convex` - stores source-owned business, registry, discovery, inquiry, notification, protected-action, billing, and observability state through `convex/schema.ts`.
- `@clerk/tanstack-react-start` - supplies request auth middleware, `<ClerkProvider>`, auth tokens for Convex, and sign-in/sign-up UI in `src/start.ts`, `src/routes/__root.tsx`, and `src/lib/server/convex-source.ts`.
- `zod` - validates TanStack server function inputs before source writes in modules such as `src/modules/business-action/business-action.functions.ts`.
- `react` / `react-dom` - render the client and SSR route tree.

**Infrastructure:**
- Provider integrations for Resend, Novu, Autumn, Stripe, and Clerk REST use `fetch`, `node:crypto`, HMAC checks, and route handlers rather than official provider SDK packages; see `src/lib/server/notification-provider.ts`, `src/lib/server/billing-provider.ts`, `src/modules/billing/internal/provider-readback.ts`, `src/modules/business-action/internal/stripe-checkout.ts`, and `src/routes/api.business-actions.stripe-webhook.ts`.
- `@playwright/test` provides local browser, a11y, and deployed smoke gates in `tests/e2e/` and `tests/deploy-smoke/`.
- `@vitejs/plugin-react`, `@tailwindcss/vite`, `nitro/vite`, and `@tanstack/react-start/plugin/vite` are composed in `vite.config.ts`.

## Configuration

**Environment:**
- `.env.local` is present and `.env.example` is present; contents were not read. `.gitignore` ignores `.env` and `.env.*` while allowing `.env.example`.
- Ignored local artifacts that can contain environment or session material include `.clerk/`, `.vercel/`, `.convex/`, `.output/`, `.vinxi/`, `playwright-report/`, and `test-results/` in `.gitignore`; Playwright storage-state artifacts under `.auth/` were detected separately and should be treated as local secrets.
- Core runtime env names referenced by source include `CONVEX_URL`, `VITE_CONVEX_URL`, `CLERK_JWT_ISSUER_DOMAIN`, `CLERK_SECRET_KEY`, `AE_SOURCE_WRITE_SECRET`, `ADMIN_BOOTSTRAP_PRINCIPAL_IDS`, `AE_NOTIFICATION_OUTBOX_SECRET`, `RESEND_API_KEY`, `RESEND_FROM`, `RESEND_API_BASE_URL`, `RESEND_WEBHOOK_SECRET`, `NOVU_SECRET_KEY`, `NOVU_WORKFLOW_INQUIRY_OWNER`, `NOVU_WORKFLOW_INQUIRY_CUSTOMER`, `NOVU_API_BASE_URL`, `AUTUMN_SECRET_KEY`, `AUTUMN_API_BASE_URL`, `AUTUMN_API_VERSION`, `AUTUMN_WEBHOOK_SECRET`, `STRIPE_WEBHOOK_SECRET`, `SITE_URL`, `VITE_SITE_URL`, `AE_CANONICAL_BASE_URL`, and `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E`.
- Deploy smoke tests require additional command-side env names such as `DEPLOY_BASE_URL`, `DEPLOY_CONVEX_URL`, and `SMOKE_*` identifiers in `tests/deploy-smoke/`.

**Build:**
- `vite.config.ts` composes `tanstackStart()`, `nitro()`, `viteReact()`, and `tailwindcss()`.
- `tsconfig.json` includes `src/**/*.ts`, `src/**/*.tsx`, `convex/**/*.ts`, `tests/**/*.ts`, config files, and excludes `node_modules`, `dist`, and `convex/_generated`.
- `convex/tsconfig.json` applies strict ESNext settings to Convex source and excludes `convex/_generated`.
- `components.json` configures shadcn aliases for `@/components`, `@/components/ui`, `@/lib`, `@/hooks`, and `@/lib/utils`.
- `playwright.config.ts` starts `npm run dev` for local browser tests; `playwright.deploy-smoke.config.ts` intentionally does not start a local server for deployed smoke tests.

## Platform Requirements

**Development:**
- Install with npm using `package-lock.json`; use Node 20.19+ or a newer compatible Node runtime.
- Run `npm run dev` for the local TanStack Start/Vite app at `http://127.0.0.1:3000`.
- Run `npm run typecheck`, `npm run check:convex-codegen`, `npm run test`, `npm run test:e2e`, and `npm run test:all` from `package.json` for progressively broader verification.
- Convex codegen and production-like source calls require a configured Convex deployment and environment; source modules fail closed when `CONVEX_URL`/`VITE_CONVEX_URL` or Clerk auth tokens are absent.
- Local E2E bypasses are gated by command-scoped `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E=true` checks in `src/start.ts`, `src/routes/__root.tsx`, and route/server-function helper modules.

**Production:**
- Deployment target is TanStack Start/Nitro output from Vite; `.vercel/README.txt` indicates a local Vercel project link, but `.vercel/` is ignored and no committed `vercel.json` was detected.
- Production operation requires configured Convex, Clerk, source-write, notification, and provider env vars; deploy-smoke scripts in `package.json` require deployed URLs and source-owned smoke IDs before external provider proof is claimed.
- Provider secrets must stay server-side; source code explicitly rejects client-exposed source-write secrets in `src/lib/server/source-write-admission.ts`.

## Local Skill Guidance

**Applicable project skills:**
- Convex guidance from `.codex/skills/convex-best-practices/SKILL.md` and `.codex/skills/convex-functions/SKILL.md`: keep Convex functions domain-organized, define `args` and `returns` validators, prefer indexes over filters, make mutations idempotent, use internal functions for sensitive operations, and do not run `npx convex deploy` unless explicitly instructed.
- Clerk/TanStack guidance from `.codex/skills/clerk-tanstack-patterns/SKILL.md`: keep `clerkMiddleware()` in `src/start.ts`, wrap the app with `<ClerkProvider>` in `src/routes/__root.tsx`, and use server-side `auth()` for server functions and loaders.
- TanStack Start guidance from `.codex/skills/tanstack-start/SKILL.md`: use `createServerFn` for server-side mutations, validate inputs, keep secrets server-side, use CSRF protection, and route API endpoints through file routes.
- Stripe guidance from `.codex/skills/stripe/SKILL.md`: default to test mode, prefer read-only inspection before mutations, never expose keys or webhook signing secrets, and require explicit confirmation for live charges, refunds, cancellations, or other destructive billing changes.

---

*Stack analysis: 2026-06-30*
