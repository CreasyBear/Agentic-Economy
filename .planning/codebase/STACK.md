# Technology Stack

**Analysis Date:** 2026-07-14

## Languages

**Primary:**
- TypeScript 6.0.3 - application, server, Convex, release tooling, and tests under `src/`, `convex/`, `tools/`, and `tests/`.
- TSX with React 19.2.7 - file routes and UI under `src/routes/` and `src/components/`.

**Secondary:**
- CSS with Tailwind 4.3.1 - global style entrypoint and limited layout utilities in `src/styles/globals.css` and `src/styles/`.
- JavaScript ESM (`.mjs`) - release checks and standalone routing examples under `tools/release/` and `examples/`; do not place canonical product behavior here.
- JSON, JSONC, and YAML - package, TypeScript, Wrangler, Promptfoo, and GitHub Actions configuration.
- Generated JavaScript and declarations - Convex client/server bindings in `convex/_generated/` and TanStack route output in `src/routeTree.gen.ts`.

## Runtime

**Environment:**
- Browser runtime for React human surfaces in `src/routes/`.
- Node.js 20 Vercel serverless runtime, pinned by Nitro in `vite.config.ts`.
- Node.js 22 in the source/release workflow in `.github/workflows/kernel-release-gate.yml`.
- Convex Cloud runtime for durable queries, mutations, actions, schedules, and cron in `convex/`.
- Cloudflare Workers only for standalone examples in `examples/routing-edge/` and `examples/routing-agent-directory/`; these are not the canonical application runtime.

**Package Manager:**
- npm 11.5.1, declared by `packageManager` in `package.json`.
- Lockfile: `package-lock.json` is present and is the install authority used by `npm ci`.
- An untracked `pnpm-lock.yaml` is present; do not treat it as package authority while `package.json` declares npm.

## Frameworks

**Core:**
- TanStack Start 1.168.26 - full-stack server handlers, middleware, SSR, and hydration configured by `src/start.ts` and `vite.config.ts`.
- TanStack Router 1.170.16 - file routes under `src/routes/` and generated route tree at `src/routeTree.gen.ts`.
- React and React DOM 19.2.7 - browser and SSR component runtime.
- Convex 1.42.0 - durable data and backend functions in `convex/`, with the composed schema in `convex/schema.ts`.
- Astryx `@astryxdesign/core` and `@astryxdesign/theme-neutral` 0.1.2 - primary UI component and theme system, initialized in `src/routes/__root.tsx`.
- Tailwind CSS 4.3.1 - layout glue compiled through `@tailwindcss/vite` in `vite.config.ts`.

**Testing:**
- Vitest 4.1.9 - unit, integration, type, import, copy, SEO, UI-contract, and evaluation suites configured by `vitest.config.ts`.
- Playwright 1.61.1 - local E2E/accessibility and hosted smoke suites configured by `playwright.config.ts` and `playwright.deploy-smoke.config.ts`.
- Testing Library 16.3.2, jest-dom 6.9.1, and jsdom 29.1.1 - React component testing.
- `convex-test` 0.0.54 - Convex function tests.
- Promptfoo 0.121.17 - answer behavior evaluation configured under `eval/`.

**Build/Dev:**
- Vite 8.1.0 - development server and production build in `vite.config.ts`.
- Nitro nightly 3.0.1 - TanStack Start Vercel server output.
- TypeScript `tsc --noEmit` - strict static checking configured by `tsconfig.json`.
- oxlint 1.73.0 - warning-denying lint gate over `src`, `convex`, `tests`, `tools`, and `examples`.
- React Doctor 0.7.7 - local React diagnostics through the `doctor` script in `package.json`.
- Wrangler 4.110.0 - types and dry-run deployment checks for `examples/routing-edge/`.

## Key Dependencies

**Critical:**
- `@clerk/tanstack-react-start` 1.4.9 - human sessions, operator-route protection, and scoped external-agent API-key authentication in `src/start.ts` and `src/lib/server/customer-request-agent-auth.ts`.
- `zod` 4.4.3 - HTTP, provider, configuration, and domain-boundary validation across `src/modules/`, `src/routes/`, and `tools/release/`.
- `@tanstack/ai` 0.38.x - structured AI message types used by answer and harness code.
- `ajv` 8.20.0 and `@cfworker/json-schema` 4.1.1 - supported capability-contract JSON Schema validation in `src/modules/capability-contract/`.
- `undici` 7.28.0 - guarded provider-readiness HTTP egress in `convex/capabilitySupplyReadiness.ts`.
- `@noble/curves` 1.9.1 and `@noble/hashes` 1.8.0 - portable cryptographic operations in trust and evidence modules.
- `web-bot-auth` 0.1.3 and `http-message-sig` 0.2.x - signature-directory and retired routing/example identity support; do not use them as the current Request-agent authentication authority.

**Infrastructure:**
- `@sentry/react`, `@sentry/node`, and `@sentry/vite-plugin` - optional client/server exception capture and source-map upload in `src/lib/observability/` and `vite.config.ts`.
- `posthog-js` and `posthog-node` - optional browser/server funnel analytics in `src/lib/observability/`.
- `@tanstack/react-table` 8.21.x - operator-facing table behavior.
- `motion` 12.42.x - reduced-motion-aware animation components in `src/components/`.
- `lucide-react` 1.21.x - interface icons.

## Configuration

**Environment:**
- Environment values are read through guarded readers in `src/lib/`, `src/modules/`, `convex/`, and `tools/release/`; never infer provider availability from a variable name.
- Clerk and Convex are required for authenticated human and external Request paths; source references include `VITE_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `CLERK_JWT_ISSUER_DOMAIN`, `VITE_CONVEX_URL`, and `CONVEX_URL`.
- OpenRouter is required for AI-backed Request interpretation and search-answer synthesis through `OPENROUTER_API_KEY`; model selection is bounded in `src/modules/customer-request/openrouter-transport.ts` and `src/modules/answer/internal/llm-config.ts`.
- `.env.example` and `.env.local` exist. Their contents are not part of this map and do not prove deployed configuration.

**Build:**
- `vite.config.ts` configures TanStack Start, Nitro/Vercel Node output, React, Tailwind, Astryx SSR bundling, local `/SKILL.md` compatibility, and conditional Sentry upload.
- `tsconfig.json` targets ES2022 with strict mode, exact optional properties, unchecked indexed access, unknown catch variables, and bundler resolution.
- `vitest.config.ts`, `playwright.config.ts`, and `playwright.deploy-smoke.config.ts` define local and hosted verification surfaces.
- `.github/workflows/kernel-release-gate.yml` is the canonical source/release pipeline. The untracked `.github/workflows/react-doctor.yml` is not established repository authority.

## Platform Requirements

**Development:**
- Use Node.js 22 to match CI tooling and npm 11.5.1 with `npm ci`.
- Use `npm run dev` for the Vite server on `127.0.0.1:3000`.
- Configure Clerk, Convex, and OpenRouter for the full authenticated Request flow; optional integrations degrade or refuse according to their source-owned guards.
- Install Playwright browser binaries for E2E suites and use Wrangler only for the standalone routing-edge check.
- Run `npm run typecheck`, `npm run check:convex-codegen`, focused tests, import/copy/UI gates, and `npm run build` for touched interfaces.

**Production:**
- Vercel Node serverless hosts TanStack Start output defined in `vite.config.ts`.
- Convex Cloud hosts durable state and backend functions defined in `convex/`.
- GitHub Actions deploys exact source through `tools/release/deploy-customer-request-git-source.ts` and the Convex CLI in `.github/workflows/kernel-release-gate.yml`.
- Current production claims require executable proof through the intended route or machine surface; source configuration, schemas, tests, examples, and sandbox supply alone are not production evidence.

---

*Stack analysis: 2026-07-14*
