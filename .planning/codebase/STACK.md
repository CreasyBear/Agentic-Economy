# Technology Stack

**Analysis Date:** 2026-07-11

## Languages

**Primary:**
- TypeScript 6.0.3 - Strictly typed application, Convex backend, tests, build configuration, and diagnostic tooling across `src/`, `convex/`, `tests/`, `eval/`, and most of `examples/`.
- TSX / React JSX - Route components and reusable UI in `src/routes/` and `src/components/`.

**Secondary:**
- JavaScript ESM - Generated Convex bindings and standalone hosted-routing probes in `convex/_generated/*.js` and `examples/routing-provider/*.mjs`.
- CSS - Tailwind v4 entry point, design tokens, and application styles in `src/styles.css` and `src/styles/`.
- YAML / JSONC - CI, prompt evaluation, and Cloudflare example configuration in `.github/workflows/eval-gate.yml`, `eval/answer/promptfooconfig.yaml`, and `examples/routing-agent-directory/wrangler.jsonc`.

## Runtime

**Environment:**
- Browser - React 19 UI, Clerk client auth, PostHog client analytics, and Sentry client error capture.
- Node.js 20.x - Vercel serverless runtime explicitly selected in `vite.config.ts`; GitHub Actions also installs Node 20 in `.github/workflows/eval-gate.yml`.
- Convex managed runtime - Database queries/mutations/actions, scheduled jobs, and HTTP endpoints under `convex/`; HTTP routing includes the agent routing kernel in `convex/http.ts`.
- Cloudflare Workers - Standalone agent-directory example in `examples/routing-agent-directory/src/index.ts`, configured by `examples/routing-agent-directory/wrangler.jsonc`.
- Node.js 22.x - Required only by the standalone conformance-provider package in `examples/routing-provider/package.json`.

**Package Manager:**
- npm 11.5.1 - Declared by `packageManager` in `package.json`.
- Lockfile: `package-lock.json` is present (lockfile version 3).
- The root package is private ESM (`"type": "module"`) and does not declare a root `engines` range.

## Frameworks

**Core:**
- React 19.2.7 / React DOM 19.2.7 - Component runtime for public, customer, owner, and operator UI.
- TanStack Start 1.168.26 - Full-stack application framework and server-function/runtime integration, configured through `vite.config.ts` and bootstrapped in `src/start.ts`.
- TanStack React Router 1.170.16 - File-based route graph under `src/routes/`, with generated bindings in `src/routeTree.gen.ts`.
- Convex 1.42.0 - Durable source-of-truth database, authenticated functions, HTTP actions, scheduled maintenance, and generated API types under `convex/`.
- Tailwind CSS 4.3.1 - CSS utility/compiler integration through `@tailwindcss/vite` in `vite.config.ts`.
- Astryx Design 0.1.2 - UI primitives and neutral theme packages (`@astryxdesign/core`, `@astryxdesign/theme-neutral`) bundled for SSR by `vite.config.ts`.

**Testing:**
- Vitest 4.1.9 - Unit, integration, type-contract, copy, SEO, import-boundary, UI-contract, and evaluation tests selected by scripts in `package.json` and configured in `vitest.config.ts`.
- Playwright 1.61.1 - Browser E2E, accessibility, deployed-surface, and provider smoke tests configured in `playwright.config.ts` and `playwright.deploy-smoke.config.ts`.
- Testing Library React 16.3.2 / jest-dom 6.9.1 / jsdom 29.1.1 - Component rendering, DOM assertions, and browser-like unit-test environment.
- Promptfoo 0.121.17 - Answer-quality evaluation driven by `eval/answer/promptfooconfig.yaml` and the `test:eval` scripts.

**Build/Dev:**
- Vite 8.1.0 - Local development and production bundling; serves on `127.0.0.1:3000` via `npm run dev`.
- Nitro nightly 3.0.1 (npm alias) - Produces the Vercel Node serverless output with the `vercel` preset in `vite.config.ts`.
- TypeScript 6.0.3 - No-emit strict typecheck; `tsconfig.json` targets ES2022 and enables `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, and bundler module resolution.
- tsx 4.20.5 - Executes TypeScript audit and evaluation scripts directly under Node.
- Sentry Vite plugin 5.3.0 - Optional release/source-map upload when all required Sentry build credentials are present.

## Key Dependencies

**Critical:**
- `@clerk/tanstack-react-start` 1.4.9 - Request middleware, UI sign-in/sign-up, server auth, and Convex JWT handoff; initialized in `src/start.ts`.
- `convex` 1.42.0 - Typed browser/server clients and backend execution/storage contract.
- `@tanstack/ai` 0.38.x - Structured AI messaging/tooling used by the answer experience.
- `zod` 4.4.3 - Runtime validation at route, model, and external-input boundaries.
- `web-bot-auth` 0.1.3 - HTTP Message Signature identity primitives for agent-facing surfaces and routing.
- `@noble/curves` 1.9.1 and `@noble/hashes` 1.8.0 - Cryptographic verification/digest support for signed agent and routing contracts.
- `undici` 7.28.0 - Explicit HTTP client implementation used at server/network boundaries.
- `@sentry/node`, `@sentry/react` 10.63.x - Server and browser error monitoring.
- `posthog-js` 1.398.x and `posthog-node` 5.39.x - Client/server product funnel analytics.

**UI Infrastructure:**
- `@astryxdesign/core` / `@astryxdesign/theme-neutral` 0.1.2 - Source design-system primitives and theme.
- `@tanstack/react-table` 8.21.x - Data-grid/table behavior on operator surfaces.
- Motion 12.42.x and Lucide React 1.21.x - Interaction animation and iconography.

## Configuration

**Environment:**
- `.env.example` is the committed inventory of application/provider variable names; local values may be supplied through ignored environment files such as `.env.local` or deployment dashboards. Never commit secret values.
- Core application connectivity requires Clerk keys (`VITE_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `CLERK_JWT_ISSUER_DOMAIN`) and Convex URLs (`VITE_CONVEX_URL` or server-side `CONVEX_URL`).
- Optional feature families are gated by explicit variables: OpenRouter/answer synthesis, Meilisearch projection, Resend/Novu notifications, Sentry/PostHog observability, Google Maps embeds, canonical-host policy, Web Bot Auth identities, and scoped source-write keys. See `.env.example` and the integration-specific readers under `src/lib/` and `src/modules/`.
- Convex configuration itself reads deployment environment variables, including Clerk issuer and routing/source-write admission material, from `convex/auth.config.ts`, `convex/http.ts`, and backend modules.

**Build:**
- `vite.config.ts` - TanStack Start, Nitro/Vercel Node preset, React, Tailwind, Astryx SSR bundling, and optional Sentry source maps.
- `tsconfig.json` and `convex/tsconfig.json` - Application and backend compiler boundaries; `@/*` and `~/*` map to `src/*`.
- `vitest.config.ts`, `playwright.config.ts`, and `playwright.deploy-smoke.config.ts` - Test runtime and local/deployed browser settings.
- `eval/answer/promptfooconfig.yaml` - Promptfoo answer-evaluation contract.
- `doctor.config.ts` - React Doctor analysis settings.

## Platform Requirements

**Development:**
- Any platform with Node.js 20-compatible tooling and npm; Node 20 matches CI and the production serverless runtime.
- A Convex deployment and Clerk application are needed for authenticated/full-stack behavior; provider-specific credentials are only needed for the corresponding optional/live smoke paths.
- `npm run dev` starts the TanStack application locally; Convex schema/code generation is checked separately with `npm run check:convex-codegen`.
- Playwright browser binaries are required for E2E/a11y suites; outbound network access and secrets are required only for live-provider, deployed-smoke, or live-evaluation commands.

**Production:**
- Main web application: Vercel Node serverless functions using `nodejs20.x`, as source-owned by `vite.config.ts`.
- Durable data/backend: hosted Convex deployment with Clerk JWT configuration and the environment material used by `convex/`.
- Example routing directory: Cloudflare Workers with `nodejs_compat`; this is a separate example deployment, not the main web host.
- CI: GitHub Actions validates typecheck, Convex codegen, unit/integration/contracts, copy/SEO/import/UI rules, Promptfoo evaluation, and build in `.github/workflows/eval-gate.yml`.

---

*Stack analysis: 2026-07-11*
*Update after major dependency changes*
