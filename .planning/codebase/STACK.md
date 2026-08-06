# Technology Stack
**Analysis Date:** 2026-08-06

## Languages
**Primary:** TypeScript 6.0.3 (compiler, `tsconfig.json`) — application source under `src/`, `convex/`, `tests/`, `tools/`, `eval/`. Strict mode with `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `useUnknownInCatchVariables`, `noImplicitOverride`, `moduleResolution: "Bundler"`, `jsx: "react-jsx"`.
**Secondary:** CSS/Tailwind (via `@tailwindcss/vite`), a small amount of JS/MJS in `tools/` + `eval/` script runners (`eval/parity/check-parity.mjs`, `eval/engine/run-evaluation.mjs`).

## Runtime
**Environment:** Node.js `>=22` (declared in `package.json` `engines`; Vite dev server + Nitro build). Browser runtime for the TanStack Start client. Convex backend runtime for server functions.
**Package Manager:** npm 11.5.1 — `"packageManager": "npm@11.5.1"`, `package-lock.json` present (923 KB, lockfile committed).
**Deployment runtime:** Vercel Nitro preset, Node serverless functions on `nodejs22.x` (see `vite.config.ts` → `nitro({ preset: 'vercel', vercel: { entryFormat: 'node', functions: { runtime: 'nodejs22.x' } } })`). Note `.vercel/project.json` currently reports `nodeVersion: "24.x"` — a source-vs-project-runtime discrepancy flagged in memory.

## Frameworks
**Core:**
- **React 19.2.7** (+ `react-dom`) — UI.
- **TanStack Start / React Router 1.x** (`@tanstack/react-start` 1.168.26, `@tanstack/react-router` 1.170.16) — SSR/SSG-ish file-route application shell; routes in `src/routes/`, `src/router.tsx`, `src/start.ts`.
- **TanStack AI** (`@tanstack/ai` ^0.38.0) — AI/harness integration layer.
- **TanStack React Table** (`@tanstack/react-table` ^8.21.3) — operator data tables.
- **Convex 1.42.0** — durable backend / single source of truth; server functions in `convex/`, schema composed from `src/modules/**/internal/schema.ts`.
- **AI SDK** (`ai` ^7.0.44) — model gateway; see `src/modules/model-gateway/public.ts`.
- **Nitro** (pinned nightly `nitro: npm:nitro-nightly@^3.0.1-...`) — server/edge functions and routing layer for webhooks via Vite plugin.

**Testing:** Vitest 4.1.9 (+ `convex-test` ^0.0.54, `@testing-library/react`, `jsdom`), Playwright 1.61.1 (@playwright/test), promptfoo ^0.121.17 for LLM evals.
**Build/Dev:** Vite 8.1.0, `vite build`, `tsc --noEmit` typecheck, `tsx` for scripts, oxlint for linting, Tailwind CSS 4.

## Key Dependencies
**Critical:**
- **convex 1.42.0** — backend, schema, server functions, mutations/queries/actions, codegen.
- **ai ^7.0.44 + @openrouter/ai-sdk-provider ^3.0.0** — the single model-gateway seam (OpenRouter); every model call routes through it (see `src/modules/model-gateway/public.ts`).
- **@tanstack/react-start 1.168.26 / @tanstack/react-router 1.170.16** — app shell, SSR, file routes, server functions.
- **@clerk/tanstack-react-start 1.4.9** — authentication (Clerk) bound to the TanStack Start server (`src/start.ts` `clerkMiddleware`).
- **@x402/core / @x402/evm / @x402/extensions 2.18.0** — HTTP message-signatures / x402 payment + Web Bot Auth primitives (quarantined to `src/modules/x402-*`-style signing paths per import-boundary tests).
- **@convex-dev/workflow ^0.4.4 + @convex-dev/workpool ^0.4.9 + @convex-dev/rate-limiter ^0.3.2 + @convex-dev/aggregate ^0.2.2** — Convex components for long-running route execution, work pools, rate limiting, and aggregate projections (`convex/convex.config.ts`).
- **zod 4.4.3** — schema validation across domain/contract boundaries and Convex validators.
- **viem 2.55.2 + @noble/curves/@noble/hashes** — EVM / cryptographic signing for x402 and message signatures.

**Infrastructure (runtime/networking):**
- **@apidevtools/json-schema-ref-parser ^11.0.0** — OpenAPI deref for capability-admission (kept OUT of the convex-reachable graph; lives in `src/modules/capability-supply/internal/schema-deref.ts`, node-side only).
- **@sentry/node + @sentry/react ^10.63.0 + @sentry/vite-plugin** — error observability.
- **posthog-js ^1.398.2 / posthog-node ^5.39.0** — funnel analytics.
- **@react-email/components @react-email/render** — transactional email rendering.
- **@modelcontextprotocol/sdk 1.30.0** — MCP adapter (`src/routes/mcp.ts`, `src/lib/server/mcp-api.ts`).
- **motion ^12.42.0, thinking-orbs ^0.2.0** — UI animation layer.

## Configuration
**Environment:** `.env.example` (documented names, canonical reference) + `.env.local` (local dev secrets, gitignored). See `INTEGRATIONS.md` → Environment Configuration for the full var-name inventory. No committed `.env` values.
**Build:** `vite.config.ts` (plugins: `tanstackStart`, `nitro` vercel preset, `viteReact`, `tailwindcss`, optional `sentryVitePlugin` gated on `SENTRY_AUTH_TOKEN/ORG/PROJECT`); `tsconfig.json` (path aliases `@/*` and `~/*` → `./src/*`, plus route-ng aliases `@/routes/owner.*`, `@/routes/admin.*`, `@/routes/developers.discovery`); `.oxlintrc.json`; `vitest.config.ts`; `components.json` (shadcn); `convex/convex.config.ts` (app env + `defineApp` with Convex components).
**No wrangler config** (Cloudflare not wired into source); the `.env.local` `CLOUDFLARE_*`/`R2_*`/`MEILISEARCH_*`/`AZURE_OPENAI_*`/`HANDSHAKE_*` names are **not referenced** in `src/`/`convex/`/`tools/` — treated as stale/experimental leftovers, not live stack.

## Platform Requirements
**Development:** macOS (Apple Silicon M4 Max), Node.js >= 22, npm 11.5.1. Vite dev server on port 3000 (`vite.config.ts`), host `127.0.0.1` via `npm run dev`; local dev helpers under `tools/dev/`.
**Production:** Vercel (deployment URL `https://agentic-economy-phi.vercel.app`), Nitro vercel preset with Node serverless functions `nodejs22.x`, plus a Convex deployment (functions + schema). Network/host allowlisting for provider calls (`AE_CANONICAL_HOST_ALLOWLIST`, provider-host allowance in `money`/`notification` paths). Node runtime `>=22`.
---
*Stack analysis: 2026-08-06*
