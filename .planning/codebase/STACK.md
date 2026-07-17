# Technology Stack

**Analysis Date:** 2026-07-17  
**Inspected revision / last_mapped_commit:** `7deffac41e103ee619ce099db531fc2127ba9985`

## Languages

**Primary:**
- TypeScript 6.0.3 - Application code under `src/`, Convex functions under `convex/`, tests under `tests/`

**Secondary:**
- JavaScript (ESM `.mjs`) - Release/dev tooling under `tools/`, provider examples under `examples/`
- CSS - Tailwind 4 utilities plus design tokens in `src/styles/` (Astryx themes supply component styles)

## Runtime

**Environment:**
- Node.js 22.x in CI (`.github/workflows/kernel-release-gate.yml` uses `node-version: '22'`)
- Production serverless target: Node.js 20.x via Nitro Vercel preset (`vite.config.ts` → `runtime: 'nodejs20.x'`)
- Browser runtime for React 19 client UI
- Convex cloud runtime for queries/mutations/actions (default Convex JS + `"use node"` actions where Node built-ins are required)
- Cloudflare Workers for the optional routing-edge example (`examples/routing-edge/`, `nodejs_compat`)

**Package Manager:**
- npm 11.5.1 (`packageManager` field in `package.json`; CI pins the same version)
- Lockfile: `package-lock.json` present (frozen installs via `npm ci`)

## Frameworks

**Core:**
- TanStack Start 1.168.26 + TanStack React Router 1.170.16 - Full-stack React app (SSR/server functions/file routes)
- React 19.2.7 / React DOM 19.2.7 - UI
- Convex 1.42.0 - Backend database, reactive queries/mutations/actions, HTTP router (`convex/http.ts`)
- Clerk (`@clerk/tanstack-react-start` 1.4.9) - Authentication for humans and Convex JWT issuer bridge
- Astryx (`@astryxdesign/core` ^0.1.2, `@astryxdesign/theme-neutral` ^0.1.2) - Design-system primitives; Tailwind is layout glue only
- Zod 4.4.3 - Boundary schemas for actions, APIs, and validators
- Tailwind CSS 4.3.1 (`@tailwindcss/vite`) - Utility styling

**Testing:**
- Vitest 4.1.9 - Unit, integration, types, imports, copy, SEO, UI-contract suites
- Playwright 1.61.1 - E2E (`tests/e2e`) and deploy-smoke (`playwright.deploy-smoke.config.ts`)
- convex-test ^0.0.54 - In-process Convex function tests
- Testing Library (`@testing-library/react` 16.3.2, jest-dom 6.9.1) + jsdom 29.1.1 - Component/DOM tests
- Promptfoo ^0.121.17 - LLM answer eval harness (`eval/answer/`)
- Oxlint ^1.73.0 - Lint gate (`npm run lint`)

**Build/Dev:**
- Vite 8.1.0 - Dev server (`vite dev`), production build (`vite build`), start (`vite start`)
- Nitro (nitro-nightly) - Vite plugin / Vercel Node serverless adapter
- TypeScript 6.0.3 - `tsc --noEmit` typecheck
- tsx ^4.20.5 - Run TypeScript release/smoke scripts
- Wrangler ^4.110.0 - Cloudflare Worker typecheck/dry-deploy for `examples/routing-edge`
- `@sentry/vite-plugin` ^5.3.0 - Optional source-map upload when Sentry org/project/token are set
- `@astryxdesign/cli` ^0.1.2 - Design-system CLI (dev)

## Key Dependencies

**Critical:**
- `convex` 1.42.0 - Source-of-truth data plane; schema composed in `convex/schema.ts` from module fragments
- `@clerk/tanstack-react-start` 1.4.9 - Session middleware (`src/start.ts`), Sign-in/up routes, Convex auth issuer (`convex/auth.config.ts`)
- `@tanstack/react-start` / `@tanstack/react-router` - App shell, file-based routes under `src/routes/`, server handlers
- `@astryxdesign/core` + `@astryxdesign/theme-neutral` - Required UI primitives (no parallel component system)
- `zod` 4.4.3 - Action and HTTP boundary validation
- `@tanstack/ai` ^0.38.0 - JSON Schema conversion for action/tool descriptors (`src/modules/common/action.ts`, harness)
- `web-bot-auth` 0.1.3 + `@noble/hashes` / `@noble/curves` - Web Bot Auth identity verification (`src/modules/routing-kernel/caller-identity.ts`)
- `@x402/core` / `@x402/evm` / `@x402/extensions` + `viem` - EVM x402 payment-signature helper for capability-supply transport (`src/modules/capability-supply/internal/x402-payment-signer.ts`; import allowlisted only for that file)

**Infrastructure:**
- `@sentry/node` / `@sentry/react` ^10.63.0 - Error tracking
- `posthog-js` / `posthog-node` - Product/funnel analytics
- `undici` 7.28.0 - HTTP client support where needed
- `ajv` 8.20.0 + `@cfworker/json-schema` 4.1.1 - JSON Schema validation helpers
- `http-message-sig` ^0.2.0 - HTTP message signature utilities (directory/WBA surfaces)
- `motion` ^12.42.0 + `lucide-react` - Motion and icons on UI surfaces
- `clsx` / `tailwind-merge` / `tw-animate-css` - Class composition and animation utilities

## Configuration

**Environment:**
- Documented in `.env.example` (do not commit secrets; `.env.local` / `.env.development.local` present locally and gitignored)
- Critical families: Clerk (`VITE_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `CLERK_JWT_ISSUER_DOMAIN`), Convex (`VITE_CONVEX_URL`), source-write admission keys (`AE_SOURCE_WRITE_*`), notifications (Resend/Novu), OpenRouter (`OPENROUTER_API_KEY`), Meilisearch mirror, Sentry/PostHog, WBA allowlists, canonical URL/CSP
- Client-exposed vars use `VITE_*` prefix only; provider and source-write secrets stay server-only

**Build:**
- `vite.config.ts` - TanStack Start + Nitro (Vercel Node) + React + Tailwind + optional Sentry plugin
- `tsconfig.json` - Strict TS (`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`); path aliases `@/*` and `~/*` → `src/*`
- `vitest.config.ts` - Node environment; includes `tests/**` and `convex/**/*.test.ts`
- `playwright.config.ts` / `playwright.deploy-smoke.config.ts` - Browser and hosted smoke
- `convex/auth.config.ts` / `convex/convex.config.ts` - Convex auth providers and app config
- `doctor.config.ts` - react-doctor configuration
- `examples/routing-edge/wrangler.jsonc` - Cloudflare Worker config

## Platform Requirements

**Development:**
- macOS/Linux/Windows with Node.js compatible with CI (22.x recommended) and npm 11.5.1
- Convex CLI (`npx convex dev`) for local backend + `CLERK_JWT_ISSUER_DOMAIN`
- Optional: Meilisearch host for dual/search-backend experiments; OpenRouter key for answer tool-use path; Resend/Novu for notification smoke
- Dev server: `npm run dev` → Vite on `127.0.0.1:3000`

**Production:**
- Vercel (Nitro `preset: 'vercel'`, Node.js 20.x serverless functions) — deploy path in `.github/workflows/kernel-release-gate.yml` via `tools/release/deploy-customer-request-git-source.ts`
- Convex production deployment (`npx convex deploy`) alongside the web app
- Optional Cloudflare Worker `ae-routing-edge` / `ae-routing-edge-production` for routing origin HMAC edge (`examples/routing-edge/`)
- Hosted release gate also requires Convex env: `AE_ROUTE_CALL_SIGNING_SECRET`, `AE_ROUTE_CALL_SIGNING_KEY_ID`, `AE_SANDBOX_PROVIDER_KEY`, `AE_SITE_URL`

---

*Stack analysis: 2026-07-17*  
*Update after major dependency changes*
