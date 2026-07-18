---
last_mapped_commit: 19e988f5
---

# Technology Stack

**Analysis Date:** 2026-07-18

## Languages

**Primary:**
- TypeScript 6.0.3 — application (`src/`), Convex backend (`convex/`), tests (`tests/`), tooling (`tools/`). Configured in `tsconfig.json` with `strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`.
- TSX / React 19.2.7 — UI routes and components under `src/routes/`, `src/components/`, `src/app/`.

**Secondary:**
- JavaScript (ESM `.mjs`) — release/smoke scripts under `tools/`, provider examples under `examples/routing-provider/`.
- CSS via Tailwind CSS 4.3.1 — layout utilities only; design system is Astryx (`@astryxdesign/*`).
- YAML — Promptfoo eval config at `eval/answer/promptfooconfig.yaml`.
- JSONC — Cloudflare Worker config at `examples/routing-edge/wrangler.jsonc`.

## Runtime

**Environment:**
- Node.js — local observed `v25.2.1`; CI pins Node 22 (`/.github/workflows/kernel-release-gate.yml`); Nitro/Vercel functions target `nodejs20.x` (`vite.config.ts`).
- Browser — React client via Vite / TanStack Start.
- Convex runtime — queries/mutations/actions in `convex/`; Node-flagged actions use `"use node"` where required.
- Cloudflare Workers — routing edge worker in `examples/routing-edge/` (`wrangler` 4.x, `nodejs_compat`).

**Package Manager:**
- npm 11.5.1 (`packageManager` in `package.json`)
- Lockfile: `package-lock.json` present (frozen installs via `npm ci` in CI)

## Frameworks

**Core:**
- TanStack Start 1.168.26 + TanStack React Router 1.170.16 — full-stack app, file routes in `src/routes/`, server middleware in `src/start.ts`
- Vite 8.1.0 — bundler/dev server (`vite.config.ts`); `npm run dev` / `build` / `start`
- Nitro (nitro-nightly) — Vite plugin with `preset: 'vercel'` and Node serverless entry (`vite.config.ts`)
- React 19.2.7 + React DOM 19.2.7 — UI
- Convex 1.42.0 — source-of-truth backend (`convex/`, schema composition in `convex/schema.ts`)
- Clerk TanStack Start SDK 1.4.9 — auth (`@clerk/tanstack-react-start` in `src/start.ts`, `src/routes/__root.tsx`)
- Astryx Design (`@astryxdesign/core` ^0.1.2, `@astryxdesign/theme-neutral` ^0.1.2) — UI primitives; Tailwind is layout glue only
- Zod 4.4.3 — runtime schemas across modules and agent contracts
- TanStack AI ^0.38.0 — JSON Schema conversion for actions (`src/modules/common/action.ts`)
- TanStack React Table ^8.21.3 — admin/operator tables
- Motion ^12.42.0 — UI motion
- Lucide React — icons

**Testing:**
- Vitest 4.1.9 — unit/integration/types/imports/copy/seo/ui-contract (`vitest.config.ts`)
- Playwright 1.61.1 — e2e (`playwright.config.ts`) and deploy-smoke (`playwright.deploy-smoke.config.ts`)
- Testing Library React 16.3.2 + jest-dom 6.9.1 — component tests
- jsdom 29.1.1 — DOM environment for Vitest where needed
- convex-test ^0.0.54 — Convex integration tests
- Promptfoo ^0.121.17 — answer eval suite (`eval/answer/`)
- @edge-runtime/vm — edge/runtime test support

**Build/Dev:**
- TypeScript compiler — `npm run typecheck` (`tsc --noEmit`)
- Oxlint ^1.73.0 — lint (`npm run lint`, `.oxlintrc.json`)
- tsx — scripts under `tools/`
- Wrangler ^4.110.0 — Cloudflare Worker typecheck/dry-run (`npm run check:routing-edge`)
- @sentry/vite-plugin — source maps when Sentry org/project/token are set
- react-doctor — optional quality doctor (`npm run doctor`, `doctor.config.ts`)
- @astryxdesign/cli — design-system tooling

## Key Dependencies

**Critical:**
- `convex` 1.42.0 — persistence, business logic ports, HTTP router (`convex/http.ts`)
- `@clerk/tanstack-react-start` 1.4.9 — human sessions + Customer Request agent API keys
- `@tanstack/react-start` / `@tanstack/react-router` — HTTP/API surfaces and UI routing
- `zod` 4.4.3 — contracts for actions, agent API, validation
- `@astryxdesign/core` + `@astryxdesign/theme-neutral` — presentation layer
- `web-bot-auth` 0.1.3 + `http-message-sig` — Web Bot Auth identity (`src/modules/routing-kernel/caller-identity.ts`)
- `@x402/core` / `@x402/evm` / `@x402/extensions` + `viem` — EVM x402 payment signature helper for capability-supply transport (`src/modules/capability-supply/internal/x402-payment-signer.ts`)
- `@noble/curves` / `@noble/hashes` — crypto for attestation, HMAC, HKDF, digests
- `@cfworker/json-schema` + `ajv` — JSON Schema validation paths
- `undici` 7.28.0 — HTTP client where Node fetch needs control
- `posthog-js` / `posthog-node` — analytics
- `@sentry/react` / `@sentry/node` — error reporting

**Infrastructure:**
- Nitro Vercel preset — production Node serverless on Vercel
- Cloudflare Workers (example edge) — `examples/routing-edge/`
- Meilisearch (HTTP, no SDK package) — optional search mirror via raw `fetch` in `src/modules/registry/internal/catalog-search-port.ts`
- OpenRouter (HTTP) — LLM chat completions for answer + customer-request interpretation

## Configuration

**Environment:**
- Documented placeholders in `.env.example` (do not commit real secrets; `.env.local` / `.env.development.local` exist locally)
- Client-visible vars use `VITE_*` prefix
- Server-only secrets: Clerk, Convex, source-write keys, notifications, OpenRouter, Meilisearch, Sentry/PostHog server keys, WBA, billing placeholder names
- Convex app env declared in `convex/convex.config.ts` (`OPENROUTER_API_KEY`, `AE_CUSTOMER_REQUEST_MODEL`, `CLERK_JWT_ISSUER_DOMAIN`, route-call signing, etc.)
- Clerk JWT issuer for Convex auth in `convex/auth.config.ts` (`CLERK_JWT_ISSUER_DOMAIN`)

**Build:**
- `vite.config.ts` — TanStack Start, Nitro (Vercel/nodejs20.x), React, Tailwind, optional Sentry plugin
- `tsconfig.json` — path aliases `@/*` and `~/*` → `src/*`; operator route remaps for owner/admin
- `vitest.config.ts` — Node env, `tests/**/*.test.ts(x)` + `convex/**/*.test.ts`
- `.oxlintrc.json` — lint rules
- `playwright.config.ts` / `playwright.deploy-smoke.config.ts` — browser tests
- `eval/answer/promptfooconfig.yaml` — LLM eval
- `examples/routing-edge/wrangler.jsonc` — edge worker
- `doctor.config.ts` — react-doctor

## Platform Requirements

**Development:**
- Node.js compatible with npm 11.5.1 (CI uses Node 22)
- `npm install` / `npm ci`
- Convex project configured (`VITE_CONVEX_URL`, Clerk issuer) for backend work
- Optional: Meilisearch, OpenRouter, Resend/Novu, Sentry/PostHog for full local parity
- Dev server: `npm run dev` → Vite on `127.0.0.1:3000` (`vite.config.ts`)

**Production:**
- Vercel Node serverless (`nodejs20.x` via Nitro preset in `vite.config.ts`)
- Convex deployment for schema/functions (CI hosted-proof deploys Convex after Vercel)
- Cloudflare Worker optional for public routing edge (`AE_ROUTING_PUBLIC_BASE_URL`, `examples/routing-edge/`)
- Observability: Sentry + PostHog when DSNs/keys configured
- Release gate: `.github/workflows/kernel-release-gate.yml` (`test:release:source` on PR; hosted production readback on `main`)

---

*Stack analysis: 2026-07-18*
