# Technology Stack

**Analysis Date:** 2026-07-13

## Languages

**Primary:**
- TypeScript 6.0.3 - Strict application, Convex backend, tests, evaluation tooling, and most examples across `src/`, `convex/`, `tests/`, `eval/`, `tools/`, and `examples/`.
- TSX / React JSX - Route components and UI under `src/routes/` and `src/components/`.

**Secondary:**
- JavaScript ESM - Standalone release and hosted-routing probes in `tools/**/*.mjs` and `examples/**/*.mjs`, plus generated Convex bindings in `convex/_generated/`.
- CSS - Tailwind entry point and application/design-system glue in `src/styles.css` and `src/styles/`.
- YAML / JSON / JSONC - GitHub Actions, Promptfoo, TypeScript, Vercel, and Wrangler configuration in `.github/workflows/kernel-release-gate.yml`, `eval/answer/promptfooconfig.yaml`, `tsconfig.json`, `examples/routing-provider/vercel.json`, and `examples/*/wrangler.jsonc`.

## Runtime

**Environment:**
- Browser - React UI, Clerk session UI, PostHog client analytics, Sentry client capture, and optional map embeds.
- Node.js 20.x - Main TanStack Start server output is explicitly pinned to Vercel Node serverless `nodejs20.x` in `vite.config.ts`.
- Node.js 22.x - GitHub Actions source/hosted proof jobs use Node 22 in `.github/workflows/kernel-release-gate.yml`; the root package does not declare an `engines` range.
- Convex managed runtime - Durable functions, schema, cron jobs, and HTTP actions under `convex/`.
- Cloudflare Workers - Separately deployable routing edge and agent-directory examples in `examples/routing-edge/` and `examples/routing-agent-directory/`.

**Package Manager:**
- npm 11.5.1 - Declared by `packageManager` in `package.json`.
- Lockfile: `package-lock.json` is present with lockfile version 3.
- Root package is private ESM (`"type": "module"`) with `sideEffects: false`.

## Frameworks

**Core:**
- React 19.2.7 / React DOM 19.2.7 - Browser component runtime.
- TanStack Start 1.168.26 - Full-stack web framework, configured in `vite.config.ts` and initialized in `src/start.ts`.
- TanStack React Router 1.170.16 - File-based routes under `src/routes/` with generated route bindings in `src/routeTree.gen.ts`.
- Convex 1.42.0 - Durable source database, authenticated queries/mutations/actions, scheduled work, and HTTP endpoints under `convex/`.
- Tailwind CSS 4.3.1 - Utility compiler integrated through `@tailwindcss/vite` in `vite.config.ts`.
- Astryx Design 0.1.2 - Primary UI primitives and neutral theme via `@astryxdesign/core` and `@astryxdesign/theme-neutral`; bundled for SSR by `vite.config.ts`.

**Testing:**
- Vitest 4.1.9 - Unit, integration, type, import-boundary, copy, SEO, UI-contract, and evaluation tests selected by scripts in `package.json` and configured in `vitest.config.ts`.
- Playwright 1.61.1 - Browser E2E, accessibility, public deploy, inquiry-support, and provider smoke tests configured in `playwright.config.ts` and `playwright.deploy-smoke.config.ts`.
- Testing Library React 16.3.2, jest-dom 6.9.1, and jsdom 29.1.1 - Component rendering and DOM assertions.
- Promptfoo 0.121.17 - Structured-answer evaluation driven by `eval/answer/promptfooconfig.yaml` and `eval/answer/scripts/`.
- Convex Test 0.0.54 and Edge Runtime VM 5.x - Backend and edge-boundary test infrastructure.

**Build/Dev:**
- Vite 8.1.0 - Development server and production bundling; `npm run dev` binds to `127.0.0.1`.
- Nitro nightly 3.0.1 - Vite-integrated server output using the Vercel preset and Node entry format in `vite.config.ts`.
- TypeScript 6.0.3 - No-emit compiler targeting ES2022 with strict mode, exact optional types, unchecked-index protection, and bundler module resolution in `tsconfig.json`.
- oxlint 1.73.x - Warning-denying lint gate over `src`, `convex`, `tests`, `tools`, and `examples`.
- Wrangler 4.110.x - Types, dry-run validation, and deployment tooling for Cloudflare Worker examples.
- tsx 4.20.x - Direct execution of TypeScript release, smoke, and evaluation scripts.
- Sentry Vite plugin 5.3.x - Conditional source-map/release upload when all build credentials exist.

## Key Dependencies

**Critical:**
- `@clerk/tanstack-react-start` 1.4.9 - Human sign-in/sign-up, server auth, middleware, and Convex JWT handoff.
- `convex` 1.42.0 - Typed browser/server clients and backend storage/execution contract.
- `@tanstack/ai` 0.38.x - Structured message and tool schemas used by answer and harness modules.
- `zod` 4.4.3 and `ajv` 8.20.0 - Runtime validation and JSON Schema enforcement at external/tool boundaries.
- `web-bot-auth` 0.1.3 and `http-message-sig` 0.2.x - HTTP Message Signature identity and signing for machine-facing routing/inquiry boundaries.
- `@noble/curves` 1.9.1 and `@noble/hashes` 1.8.0 - Cryptographic primitives used by signed trust contracts.
- `undici` 7.28.0 - Explicit server HTTP implementation at network boundaries.
- `@sentry/node` / `@sentry/react` 10.63.x and `posthog-node` 5.39.x / `posthog-js` 1.398.x - Error and funnel observability.

**UI Infrastructure:**
- `@astryxdesign/core` / `@astryxdesign/theme-neutral` 0.1.2 - Source design-system components and theme.
- `@tanstack/react-table` 8.21.x - Operator-table behavior.
- `motion` 12.42.x, `lucide-react` 1.21.x, `clsx` 2.1.1, and `tailwind-merge` 3.6.0 - Interaction, icons, and class composition.

## Configuration

**Environment:**
- `.env.example` is the committed variable-name inventory. Secret values belong in ignored local environment files or deployment secret stores, never in the map.
- Full authenticated operation depends on Clerk (`VITE_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `CLERK_JWT_ISSUER_DOMAIN`) and Convex (`VITE_CONVEX_URL` or `CONVEX_URL`).
- Optional integrations are explicitly gated: OpenRouter answer synthesis, Meilisearch projection, Resend/Novu notifications, Sentry/PostHog observability, Google Maps embeds, Web Bot Auth identities, routing-edge credentials, canonical-host policy, and scoped source-write keys. The authoritative names are in `.env.example` and their readers under `src/lib/`, `src/modules/`, and `convex/`.
- Stripe/Autumn names in `.env.example` and provider-secret guardrails in `src/modules/security/source-write-admission.ts` do not constitute an active payment stack. Active billing modules/routes are explicitly prohibited by `src/lib/ui/contract-scans.ts`, consistent with the product boundary in `AGENTS.md`.

**Build:**
- `vite.config.ts` - TanStack Start, Nitro/Vercel Node output, React, Tailwind, Astryx SSR bundling, local discovery compatibility, and optional Sentry source maps.
- `tsconfig.json` and `convex/tsconfig.json` - Application/backend compiler boundaries; `@/*` and `~/*` resolve to `src/*`.
- `vitest.config.ts`, `playwright.config.ts`, and `playwright.deploy-smoke.config.ts` - Node, local-browser, and hosted-browser verification.
- `.github/workflows/kernel-release-gate.yml` - Clean source proof on pull requests/pushes plus production-environment hosted proof outside pull requests.
- `examples/routing-edge/wrangler.jsonc`, `examples/routing-agent-directory/wrangler.jsonc`, and `examples/routing-provider/vercel.json` - Standalone routing deployments, not the main application configuration.

## Platform Requirements

**Development:**
- Node/npm environment compatible with the pinned dependency graph; Node 22 matches current CI, while the production web output is Node 20.
- `npm ci` is the frozen install path used by CI.
- Convex and Clerk deployments are required for authenticated full-stack behavior; individual provider credentials are needed only for corresponding live/provider paths.
- Playwright browser binaries are needed for browser suites; Wrangler is required for Worker type/dry-run verification.
- Core commands are `npm run dev`, `npm run build`, `npm run typecheck`, `npm run lint`, and the focused `test:*` scripts in `package.json`.

**Production:**
- Main web application: Vercel Node serverless, `nodejs20.x`, generated by Nitro from `vite.config.ts`.
- Durable backend/source: hosted Convex deployment with Clerk JWT and scoped source-write configuration.
- Routing edge: Cloudflare Worker from `examples/routing-edge/`, forwarding to a configured Convex routing origin with HMAC-bound origin calls.
- Agent-directory and conformance provider: standalone example deployments under `examples/routing-agent-directory/` and `examples/routing-provider/`; they are not the main AE web host.
- CI: GitHub Actions runs `test:release:source`; non-PR runs additionally execute deployment-bound `test:release:hosted` with Convex/revision proof secrets.

---

*Stack analysis: 2026-07-13*
*Update after major dependency changes*
