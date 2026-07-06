# Technology Stack

**Analysis Date:** 2026-07-06

## Languages

**Primary:**
- TypeScript 6.0.3 - Application routes, server functions, Convex functions, domain modules, tests, eval tooling, and scripts live in `src/`, `convex/`, `tests/`, `eval/`, and `examples/agent-experience/`; strict compiler options are in `tsconfig.json` and `convex/tsconfig.json`.
- TSX / React JSX - UI routes and components live in `src/routes/` and `src/components/`; React 19.2.7 and React DOM 19.2.7 are declared in `package.json`.

**Secondary:**
- CSS - Astryx + Tailwind 4 styling is composed through `src/styles/globals.css`; retiring legacy styles remain imported from `src/styles/legacy.css` and should shrink rather than expand.
- YAML - CI and answer-eval configuration use YAML in `.github/workflows/eval-gate.yml` and `eval/answer/promptfooconfig.yaml`.
- Markdown - Product, design, GSD, and codebase guidance lives in `AGENTS.md`, `PRODUCT.md`, `DESIGN.md`, `.planning/`, and `.planning/codebase/`.

## Runtime

**Environment:**
- Node.js 20.x - Production server output is Vercel Node serverless via Nitro in `vite.config.ts`; GitHub Actions uses Node 20 in `.github/workflows/eval-gate.yml`.
- Browser runtime - TanStack Router/React renders from `src/routes/__root.tsx`; Astryx providers, Clerk provider gating, global CSS, observability boot, and route scripts are mounted there.
- TanStack Start server runtime - `src/start.ts` wires request middleware for Sentry/PostHog observability, security headers, CSRF, source-write admission, and Clerk middleware.
- Convex cloud runtime - Convex schema/functions live under `convex/`; module-owned schema fragments are composed by `convex/schema.ts`, and Convex auth is configured in `convex/auth.config.ts`.
- Vite dev server - `npm run dev` runs `vite dev --host 127.0.0.1`; Playwright launches the same app on `127.0.0.1:3020` in `playwright.config.ts`.

**Package Manager:**
- npm 11.5.1 - Declared as `packageManager` in `package.json`.
- Lockfile: present - `package-lock.json` uses lockfile version 3 and mirrors the root dependency set.

## Frameworks

**Core:**
- TanStack React Start 1.168.26 - Full-stack app/runtime plugin in `vite.config.ts`; server entry and middleware live in `src/start.ts`.
- TanStack React Router 1.170.16 - File routes live in `src/routes/`; router setup is `src/router.tsx`; generated route metadata is `src/routeTree.gen.ts`.
- React 19.2.7 - UI rendering for route components and shared components in `src/routes/` and `src/components/`.
- Vite 8.1.0 - Build/dev server is configured in `vite.config.ts` with TanStack Start, Nitro, React, Tailwind, and optional Sentry plugins.
- Nitro nightly 3.0.1 alias - `vite.config.ts` pins Vercel Node output with `entryFormat: 'node'` and `runtime: 'nodejs20.x'`.
- Convex 1.42.0 - Database schema, queries, mutations, actions, auth, crons, and generated types live under `convex/`; server-side app calls use `src/lib/server/convex-source.ts`.
- Clerk TanStack React Start 1.4.9 - Request middleware is in `src/start.ts`; provider wrapping is in `src/routes/__root.tsx`; Convex JWT issuer config is in `convex/auth.config.ts`.
- Astryx design system 0.1.2 + Tailwind CSS 4.3.1 - Astryx providers are mounted in `src/routes/__root.tsx`; Tailwind 4 is installed through `@tailwindcss/vite` and CSS-first imports in `src/styles/globals.css`.
- Zod 4.4.3 - Runtime schemas and action/server-function input validation are used across `src/modules/**` and route handlers such as `src/routes/api.storefront.import-draft.ts`.
- TanStack AI 0.38.0 - Zod-to-JSON-schema tool contract conversion lives in `src/modules/common/action.ts` and `src/modules/harness/tool-contract.ts`.

**Testing:**
- Vitest 4.1.9 - Unit, integration, type/import/source/copy/SEO/eval tests are declared in `package.json`; runner config is `vitest.config.ts`.
- Playwright 1.61.1 - Local E2E and accessibility tests use `playwright.config.ts`; deployed/provider smoke tests use `playwright.deploy-smoke.config.ts` and `tests/deploy-smoke/`.
- Promptfoo 0.121.17 - Answer evals use `eval/answer/promptfooconfig.yaml` and scripts under `eval/answer/scripts/`.
- Testing Library / jsdom - React tests use `@testing-library/react`, `@testing-library/jest-dom`, and `jsdom` from `package.json`.

**Build/Dev:**
- TypeScript compiler - `npm run typecheck` runs `tsc --noEmit` using `tsconfig.json`.
- Convex codegen check - `npm run check:convex-codegen` runs `convex codegen --dry-run --typecheck=disable`; generated Convex files are under `convex/_generated/`.
- Vite build/start - `npm run build` runs `vite build`; `npm run start` runs `vite start`.
- Dev seeding - `npm run seed:dev` runs `convex run devSeed:seedDevCatalog`; source fixtures live in `src/modules/dev/internal/dev-seed-fixture.ts`.
- React Doctor - `npm run doctor` runs React Doctor; supply-chain severity is configured as a warning in `doctor.config.ts`.
- Astryx CLI / UI craft helpers - `@astryxdesign/cli` is installed; `ui-craft:*` scripts in `package.json` point at `.agents/skills/ui-craft/scripts/`, which is not part of the active app source map.
- Sentry Vite plugin - Source map upload is conditional on Sentry build env in `vite.config.ts`.

## Key Dependencies

**Critical:**
- `convex@1.42.0` - Source-of-truth data and runtime for catalog, registry, discovery, inquiries, notification outbox, billing, business actions, observability, clearance, and settings in `convex/` and `src/modules/**/internal/*schema.ts`.
- `@clerk/tanstack-react-start@1.4.9` - Owner/admin auth, route provider gating, server auth, and Convex token flow in `src/start.ts`, `src/routes/__root.tsx`, `src/lib/server/convex-source.ts`, and `convex/auth.config.ts`.
- `@tanstack/react-start@1.168.26` and `@tanstack/react-router@1.170.16` - File-route app architecture and server route handlers in `src/routes/`.
- `react@19.2.7` and `react-dom@19.2.7` - UI rendering for public, owner, admin, answer, and discovery surfaces.
- `zod@4.4.3` - Runtime validation for action contracts, API bodies, and module commands.
- `@astryxdesign/core@0.1.2`, `@astryxdesign/theme-neutral@0.1.2`, `tailwindcss@4.3.1`, and `@tailwindcss/vite@4.3.1` - Active UI/design-system stack wired through `src/routes/__root.tsx`, `src/styles/globals.css`, and `DESIGN.md`.
- `@tanstack/ai@0.38.0` - JSON-schema conversion for harness/agent tool descriptors in `src/modules/common/action.ts` and `src/modules/harness/tool-contract.ts`.
- `web-bot-auth@0.1.3` - Signed assistant identity verification for the quiet agent tools endpoint in `src/modules/clearance/internal/web-bot-auth.ts` and `src/routes/api.agent.tools.ts`.
- `@noble/hashes@1.8.0` and `@noble/curves@1.9.1` - Source-write admission HMAC/HKDF and Convex handshake-spike crypto in `src/modules/security/source-write-admission.ts` and `convex/spikeHandshakeRuntime.ts`.
- `handshake-protocol-kernel@0.4.0` - Imported only by the Convex spike runtime in `convex/spikeHandshakeRuntime.ts`; broad Handshake/x402/MCP/customer-edge imports are blocked by scanner rules in `src/lib/ui/contract-scans.ts`.

**Infrastructure:**
- `@sentry/node`, `@sentry/react`, and `@sentry/vite-plugin` - Optional server/client error tracking and build upload paths in `src/lib/observability/` and `vite.config.ts`.
- `posthog-js` and `posthog-node` - Optional client/server product analytics in `src/lib/observability/posthog.client.ts` and `src/lib/observability/posthog.server.ts`.
- `atmn` - Autumn plan/feature modeling in `autumn.config.ts`; HTTP provider integration is implemented in `src/modules/billing/internal/provider-readback.ts` and `src/lib/server/billing-provider.ts`.
- `undici@7.28.0` - Guarded storefront website import uses `Agent` in `src/modules/storefront/internal/import-draft.ts` and DNS/IP SSRF guardrails in `src/modules/storefront/internal/network-guard.ts`.
- `lucide-react`, `motion`, `clsx`, `tailwind-merge`, and `tw-animate-css` - UI utility/support packages declared in `package.json`.
- `tsx` - TypeScript script runner for eval and audit scripts in `package.json`.

## Configuration

**Environment:**
- Runtime env is read from `process.env` for server/Convex code and `import.meta.env` for browser/Vite code; key readers include `src/lib/server/convex-source.ts`, `convex/auth.config.ts`, `src/lib/observability/config.ts`, `src/lib/server/notification-provider.ts`, `src/lib/server/billing-provider.ts`, `src/modules/answer/internal/llm-config.ts`, and `src/modules/security/source-write-admission.ts`.
- Secret-bearing env files are present but not inspected: `.env.local`; non-secret examples are present at `.env.example` and `examples/agent-experience/.env.example`. `.gitignore` ignores `.env` and `.env.*` while explicitly allowing `.env.example`.
- Core runtime env names detected in source include `CONVEX_URL`, `VITE_CONVEX_URL`, `CLERK_JWT_ISSUER_DOMAIN`, `CLERK_SECRET_KEY`, `AE_SOURCE_WRITE_KEY_*`, `AE_SOURCE_WRITE_SECRET`, `AE_NOTIFICATION_OUTBOX_SECRET`, `OPENROUTER_API_KEY`, `AE_LLM_MODEL`, `AE_LLM_MODELS`, `AE_OPENROUTER_API_BASE_URL`, `AE_ALLOW_CHAT_API`, `AE_ANSWER_EVAL_PASSED`, `AUTUMN_SECRET_KEY`, `AUTUMN_WEBHOOK_SECRET`, `STRIPE_WEBHOOK_SECRET`, `RESEND_API_KEY`, `RESEND_FROM`, `RESEND_WEBHOOK_SECRET`, `NOVU_SECRET_KEY`, `NOVU_WORKFLOW_INQUIRY_OWNER`, `MEILISEARCH_HOST`, `MEILISEARCH_ADMIN_KEY`, `AE_SEARCH_INDEX_UID`, `SENTRY_DSN`, `VITE_SENTRY_DSN`, `POSTHOG_KEY`, `VITE_POSTHOG_KEY`, `VITE_GOOGLE_MAPS_API_KEY`, `AE_CANONICAL_BASE_URL`, and `AE_CANONICAL_HOST_ALLOWLIST`.
- Local/test auth bypass is explicitly fail-loud: `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E` is accepted for local E2E but throws in production in `src/lib/server/local-e2e-bypass.ts` and `src/routes/__root.tsx`.
- CSP mode defaults differ by environment: production enforces CSP unless `AE_CSP_REPORT_ONLY` opts into report-only; non-production defaults to report-only in `src/lib/http/security-headers.ts`.

**Build:**
- Vite/TanStack/Nitro/Tailwind/Sentry build configuration: `vite.config.ts`.
- TypeScript configuration: `tsconfig.json` and `convex/tsconfig.json`.
- Test configuration: `vitest.config.ts`, `playwright.config.ts`, and `playwright.deploy-smoke.config.ts`.
- Billing plan configuration: `autumn.config.ts`.
- CI configuration: `.github/workflows/eval-gate.yml`.
- React Doctor configuration: `doctor.config.ts`.
- Design-system authority: `DESIGN.md` and `src/styles/globals.css`.

**Generated Code & Artifacts:**
- `src/routeTree.gen.ts` is generated by TanStack Router and explicitly says not to edit it manually.
- `convex/_generated/api.d.ts`, `convex/_generated/server.d.ts`, and `convex/_generated/dataModel.d.ts` are generated Convex files; `convex/_generated/api.d.ts` says to regenerate with `npx convex dev`, while this repo's verification script uses `npm run check:convex-codegen`.
- `dist/`, `.output/`, `.vercel/`, `.convex/`, `output/`, `test-results/`, `playwright-report/`, `coverage/`, and `graphify-out/` are ignored/generated by `.gitignore`; treat them as rebuildable artifacts, not source.
- `src/styles/globals.css` excludes `.planning` from Tailwind scanning with `@source not "../../.planning"`.

**Toolchain Constraints:**
- New UI should use Astryx first. `DESIGN.md` marks `src/components/ui/*` shadcn/radix/cva components as legacy; no `components.json` is present in the current source tree, even though `.agents/skills/shadcn/SKILL.md` exists as a local agent skill.
- Convex shared modules must avoid Node-only imports unless isolated from Convex-bundled graphs; server-only Node APIs appear intentionally in files such as `src/lib/server/billing-provider.ts`, `src/modules/business-action/internal/stripe-checkout.ts`, and `src/modules/storefront/internal/network-guard.ts`.
- `.github/workflows/eval-gate.yml` references `npm run test:ui-contract`, but `package.json` does not currently declare a `test:ui-contract` script. Verify package scripts before treating that workflow step as runnable.

## Platform Requirements

**Development:**
- Use npm with the committed lockfile: `npm ci` and scripts in `package.json`.
- Use a Node 20-compatible runtime for parity with `vite.config.ts` and `.github/workflows/eval-gate.yml`.
- Use `npm run dev` for local app serving; Playwright E2E uses `npm run dev -- --port 3020 --strictPort --host 127.0.0.1` and injects `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E=true` through `playwright.config.ts`.
- Use `npm run check:convex-codegen` for Convex generated contract drift; Convex auth requires `CLERK_JWT_ISSUER_DOMAIN` in `convex/auth.config.ts`.
- Follow `DESIGN.md`: Astryx providers live in `src/routes/__root.tsx`; CSS tokens and Tailwind 4 glue live in `src/styles/globals.css`.

**Production:**
- Hosting target is Vercel Node serverless through the Nitro `vercel` preset in `vite.config.ts`; this is not an edge-runtime app.
- Data/runtime target is Convex Cloud via `CONVEX_URL` or `VITE_CONVEX_URL` in `src/lib/server/convex-source.ts`.
- Authentication target is Clerk with Convex JWT issuer configured in `convex/auth.config.ts` and owner/admin authority checks in Convex modules such as `convex/authz.ts`.
- Observability is optional and env-driven through `src/lib/observability/config.ts`; Sentry build uploads only run when Sentry build env is present in `vite.config.ts`.
- Public-readiness posture is constrained by `.planning/STATE.md`: Phase 6 proof is source/local only, the 14-day bootstrap gate is active, and deployed/provider/demo smoke gates in `tests/deploy-smoke/` must pass before public shipment claims.

---

*Stack analysis: 2026-07-06*
