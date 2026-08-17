# Technology Stack

**Analysis Date:** 2026-08-17

## Languages

**Primary:**
- TypeScript 6.0.3 — All application, Convex backend, test, and tooling code under `src/`, `convex/`, `tests/`, and `tools/`
- TSX — React components and route modules in `src/**/*.tsx`

**Secondary:**
- JavaScript (ESM) — Build/dev scripts in `tools/dev/*.mjs`, release verification in `tools/release/*.mjs`, eval runners in `eval/`
- CSS — Global and component styles via Tailwind in `src/styles/globals.css` and co-located component styles
- YAML — Prompt evaluation config in `eval/answer/promptfooconfig.yaml`
- JSON — Deployment manifests, fixtures, and schema artifacts under `tools/`, `.planning/`, and `docs/codemap/`

## Runtime

**Environment:**
- Node.js 22.x — Required engine per `package.json` `engines.node` and `.nvmrc` (`22`); enforced by `tools/dev/local-dev.mjs`
- Browser (modern Chromium/WebKit) — React 19 client via Vite; Playwright E2E targets compact and wide Chromium viewports in `playwright.config.ts`

**Package Manager:**
- npm 11.5.1 — Pinned via `package.json` `packageManager`
- Lockfile: `package-lock.json` present; CI uses `npm ci` in `.github/workflows/kernel-release-gate.yml`

## Frameworks

**Core:**
- TanStack React Start 1.168.26 — Full-stack app framework; server middleware and API routes in `src/start.ts`, `src/routes/**`
- TanStack React Router 1.170.16 — File-based routing; generated route tree in `src/routeTree.gen.ts`
- React 19.2.7 / React DOM 19.2.7 — UI runtime
- Convex 1.42.0 — Primary backend (queries, mutations, actions, crons, HTTP router); schema in `convex/schema.ts`, app config in `convex/convex.config.ts`
- Vite 8.1.0 — Dev server and production bundler; config in `vite.config.ts`
- Nitro (nightly `nitro-nightly@^3.0.1`) — Server output adapter with Vercel Node preset in `vite.config.ts`
- Tailwind CSS 4.3.1 — Utility-first styling via `@tailwindcss/vite` plugin

**Testing:**
- Vitest 4.1.9 — Unit, integration, import-boundary, SEO, UI-contract, and Convex tests; config in `vitest.config.ts`
- Playwright 1.61.1 — E2E (`tests/e2e/`), deploy smokes (`tests/deploy-smoke/`), and paid-operation surface tests; configs in `playwright.config.ts`, `playwright.deploy-smoke.config.ts`, `playwright.paid-operation.config.ts`
- convex-test 0.0.54 — In-process Convex function testing in `convex/**/*.test.ts` and `tests/integration/convex/**`
- promptfoo 0.121.17 — Answer prompt evaluation in `eval/answer/`
- braintrust 3.27.0 — Remote/local answer eval dataset runs in `eval/braintrust/answer.eval.ts`

**Build/Dev:**
- TypeScript 6.0.3 — Strict compilation; `tsconfig.json` with `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`
- tsx 4.20.5 — TypeScript execution for CLI (`tools/ae/cli.ts`) and release/dev scripts
- oxlint 1.73.0 — Lint gate (`npm run lint`); config in `.oxlintrc.json`
- @sentry/vite-plugin 5.3.0 — Conditional sourcemap upload when Sentry build env is complete
- react-doctor 0.7.7 — Advisory React health scans (`npm run doctor`, `.github/workflows/react-doctor.yml`)

## Key Dependencies

**Critical:**
- `convex` 1.42.0 + `@convex-dev/workflow`, `@convex-dev/workpool`, `@convex-dev/rate-limiter`, `@convex-dev/aggregate` — Durable workflows, background workpools, rate limiting, and owner-activation aggregates wired in `convex/convex.config.ts`
- `@clerk/tanstack-react-start` 1.4.9 — Authentication middleware and provider; Clerk JWT issuer configured in `convex/auth.config.ts`
- `ai` 7.0.44 + `@openrouter/ai-sdk-provider` 3.0.0 + `@tanstack/ai` 0.38.0 — LLM gateway seam in `src/modules/model-gateway/public.ts`; answer runtime consumes OpenRouter through Vercel AI SDK
- `stripe` 22.5.0 + `@stripe/stripe-js` / `@stripe/react-stripe-js` — Fiat money (credit top-up, Connect payouts, webhooks) in `src/lib/server/stripe-money-provider.ts`, `src/modules/money/server.ts`
- `@x402/core` / `@x402/evm` / `@x402/extensions` 2.18.0 + `viem` 2.55.2 — On-chain x402 payment signing and settlement in `src/modules/capability-supply/internal/x402-payment-signer.ts`, `x402-evm-receipt-reader.ts`
- `@modelcontextprotocol/sdk` 1.30.0 — MCP Streamable HTTP server at `src/routes/mcp.ts` via `src/lib/server/mcp-api.ts`
- `zod` 4.4.3 — Runtime validation across modules, Convex validators, and MCP tool schemas

**Infrastructure:**
- `openapi-fetch` 0.17.0 — Typed HTTP transport for provider route execution in `src/modules/capability-supply/route-transport-runtime.ts`
- `undici` 7.28.0 — HTTP client for server-side fetches
- `http-message-sig` 0.2.0 — Web Bot Auth (WBA) signature verification in `src/modules/security/source-write-admission.ts`
- `@sentry/node` / `@sentry/react` 10.63.0 — Error tracking in `src/lib/observability/sentry.server.ts` and client boundary in `src/components/ae/feedback/AeObservabilityErrorBoundary.tsx`
- `posthog-js` / `posthog-node` — Product analytics in `src/lib/observability/posthog.server.ts` and client hooks
- `xstate` 5.32.5 — Stateful UI/workflow machines in select modules
- `graphology` + `graphology-dag` — Capability graph modeling in supply/discovery paths
- `@react-email/components` / `@react-email/render` — HTML email rendering for work-tree memos in `src/modules/work-tree/internal/memo.tsx`
- `@shadcn/react` 0.3.0 + Radix UI + `lucide-react` — Component primitives; shadcn config in `components.json`, UI in `src/components/ui/`

## Configuration

**Environment:**
- `.env.example` documents all known variables; local secrets go in gitignored `.env` / `.env.local` (existence only — never commit values)
- Production readiness validated by `src/lib/deployment/manifest.ts` and `tools/release/verify-deployment-manifest.ts`
- Key production groups: Convex (`VITE_CONVEX_URL`, `CONVEX_URL`), Clerk (`VITE_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `CLERK_JWT_ISSUER_DOMAIN`), OpenRouter (`OPENROUTER_API_KEY`), Stripe, x402 custody, scoped source-write signing keys (`AE_SOURCE_WRITE_KEY_*`), canonical URL (`AE_CANONICAL_BASE_URL`)

**Build:**
- `vite.config.ts` — TanStack Start + Nitro Vercel preset (`nodejs22.x`), Tailwind, conditional Sentry plugin
- `tsconfig.json` — Path aliases `@/*` and `~/*` → `src/*`; operator route aliases for `owner.*` and `admin.*`
- `vitest.config.ts` — Node test environment with setup files in `tests/setup/`
- `convex/convex.config.ts` — Convex component registration and server env schema
- `convex/auth.config.ts` — Clerk JWT issuer domain for Convex auth
- `components.json` — shadcn/ui code-generation settings
- `.oxlintrc.json` — Lint rules; ignores `convex/_generated/**`
- `doctor.config.ts` — React Doctor scan configuration

## Platform Requirements

**Development:**
- macOS/Linux/Windows with Node.js 22.x and npm 11.5.1
- Convex CLI for local backend: `npm run dev:local` orchestrates Convex dev + Vite via `tools/dev/local-dev.mjs`
- Vite dev server defaults to port 3000 (`vite.config.ts`); local-dev uses port 3024; Playwright spins port 3020
- Optional: OpenRouter API key for live answer turns; Stripe/Resend/Novu test credentials for provider smokes

**Production:**
- Vercel — Node.js 22.x serverless functions via Nitro `preset: 'vercel'` in `vite.config.ts`; canonical host `agentic-economy-phi.vercel.app` referenced in `.github/workflows/kernel-release-gate.yml`
- Convex Cloud — Deployed schema/functions via `npx convex deploy`; production env vars set in Convex dashboard and Vercel
- GitHub Actions — Kernel release gate (`.github/workflows/kernel-release-gate.yml`) runs source proof on PRs; hosted proof and opt-in live gateway smoke on `main`
- Node 22 runtime fingerprint declared in `src/lib/deployment/manifest.ts` (`DEPLOYMENT_MANIFEST.runtime`)

---

*Stack analysis: 2026-08-17*
*Update after major dependency changes*
