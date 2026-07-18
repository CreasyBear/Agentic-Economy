# Technology Stack

**Analysis Date:** 2026-07-18
**last_mapped_commit:** `5ea44454`

## Languages

**Primary:**
- TypeScript 6.0.3 — application (`src/`), Convex backend (`convex/`), tests (`tests/`), tooling (`tools/`)
- TSX / React JSX — UI routes and components under `src/routes/`, `src/components/`

**Secondary:**
- JavaScript (ESM `.mjs`) — release/provider scripts under `tools/`, `examples/`
- CSS — Tailwind 4 + Astryx layers in `src/styles/globals.css`
- YAML — Promptfoo eval config at `eval/answer/promptfooconfig.yaml`
- JSONC — Cloudflare Worker config at `examples/routing-edge/wrangler.jsonc`

## Runtime

**Environment:**
- Node.js 22.x in CI (`.github/workflows/kernel-release-gate.yml` pins `node-version: '22'`)
- Local development commonly Node 25.x (workspace measured `v25.2.1`); Vite Nitro deploy target is `nodejs20.x` (`vite.config.ts`)
- Cloudflare Workers for the routing-edge example (`examples/routing-edge/`, `nodejs_compat`)

**Package Manager:**
- npm 11.5.1 (`package.json` `packageManager` field; CI installs `npm@11.5.1`)
- Lockfile: `package-lock.json` present (lockfileVersion 3)

## Frameworks

**Core:**
- TanStack React Start 1.168.26 + TanStack React Router 1.170.16 — full-stack app, file routes, server fns (`src/start.ts`, `src/router.tsx`, `src/routes/`)
- React 19.2.7 / React DOM 19.2.7 — UI
- Convex 1.42.0 — source-of-truth backend (schema, queries, mutations, actions, HTTP router, crons)
- Vite 8.1.0 — bundler/dev server
- Nitro (nitro-nightly) — Vite plugin; Vercel Node serverless preset (`vite.config.ts`)
- Clerk TanStack Start 1.4.9 — auth middleware and session (`@clerk/tanstack-react-start`)
- Astryx Design System (`@astryxdesign/core` ^0.1.2, `@astryxdesign/theme-neutral` ^0.1.2) — UI primitives/theme
- Tailwind CSS 4.3.1 (`@tailwindcss/vite`) — layout/utility glue only

**Testing:**
- Vitest 4.1.9 — unit/integration/type/import/copy/seo/ui-contract suites
- Playwright 1.61.1 — e2e, a11y, deploy-smoke, provider-smoke
- convex-test ^0.0.54 — Convex function tests (e.g. `convex/customerRequestRouteMandate.test.ts`)
- Testing Library React 16.3.2 + jest-dom 6.9.1 — component assertions
- jsdom 29.1.1 — DOM environment for selected Vitest cases
- Promptfoo ^0.121.17 — LLM answer eval suite (`npm run test:eval`)
- @edge-runtime/vm ^5.0.0 — edge/runtime simulation support in tests

**Build/Dev:**
- TypeScript compiler (`tsc --noEmit` via `npm run typecheck`)
- oxlint ^1.73.0 — lint (`npm run lint`, config `.oxlintrc.json`)
- tsx ^4.20.5 — run TypeScript tools/scripts
- wrangler ^4.110.0 — Cloudflare Worker typecheck/dry-run deploy for routing-edge
- @sentry/vite-plugin ^5.3.0 — optional sourcemap upload when Sentry org/project/token set
- @astryxdesign/cli ^0.1.2 — design-system CLI
- react-doctor ^0.7.7 — React health checks (`npm run doctor`)

## Key Dependencies

**Critical:**
- `convex` 1.42.0 — persistence, auth identity bridge, customer-request/route execution
- `@clerk/tanstack-react-start` 1.4.9 — human auth + server `auth()` / `clerkClient()`
- `@tanstack/react-start` / `@tanstack/react-router` — HTTP routes, SSR, server middleware
- `zod` 4.4.3 — request/schema validation across modules
- `@tanstack/ai` ^0.38.0 — JSON Schema conversion for action/tool contracts (`src/modules/common/action.ts`, harness)
- `web-bot-auth` 0.1.3 — Web Bot Auth verification for agent identity (`src/modules/routing-kernel/caller-identity.ts`)
- `@x402/core` / `@x402/evm` / `@x402/extensions` 2.18.0 + `viem` 2.55.2 — EVM x402 payment signature for capability route transport (`src/modules/capability-supply/internal/x402-payment-signer.ts`)
- `@noble/hashes` / `@noble/curves` — HKDF/HMAC/SHA-256/ed25519 for admission digests and attestations
- `@cfworker/json-schema` + `ajv` — capability-contract JSON Schema validation
- `undici` 7.28.0 — guarded HTTP agent for storefront import (`src/modules/storefront/internal/import-draft.ts`)

**Infrastructure:**
- `@sentry/node` / `@sentry/react` ^10.63.0 — server/client error tracking
- `posthog-js` / `posthog-node` — product/funnel analytics
- `motion` ^12.42.0 — UI motion
- `lucide-react` — icons
- `@tanstack/react-table` — operator data tables
- `clsx` / `tailwind-merge` / `tw-animate-css` — class composition and animation utilities
- `http-message-sig` ^0.2.0 — HTTP message signatures support for WBA directory surface

## Configuration

**Environment:**
- Template: `.env.example` (names only; never commit secrets)
- Local overlays present: `.env.local`, `.env.development.local` (gitignored; do not read contents)
- Client-visible vars use `VITE_*` prefix (Clerk publishable key, Convex URL, PostHog/Sentry DSNs, Google Maps, answer mode)
- Server-only secrets: Clerk secret, source-write keys, Stripe/Autumn/Resend/Novu/OpenRouter/Meilisearch, WBA allowlists, notification outbox, route-call signing (Convex env)
- Convex app env declared in `convex/convex.config.ts` (`OPENROUTER_API_KEY`, `AE_CUSTOMER_REQUEST_MODEL`, `AE_SITE_URL`, `CLERK_JWT_ISSUER_DOMAIN`, signing tokens)

**Build:**
- `vite.config.ts` — TanStack Start, Nitro Vercel Node 20, React, Tailwind, optional Sentry plugin
- `tsconfig.json` — strict TS (exactOptionalPropertyTypes, noUncheckedIndexedAccess), path aliases `@/*` and `~/*` → `src/*`
- `convex/tsconfig.json` — Convex function compile settings
- `vitest.config.ts` — Node test env; includes `tests/**/*.test.ts(x)` and `convex/**/*.test.ts`
- `playwright.config.ts` / `playwright.deploy-smoke.config.ts` — browser suites
- `.oxlintrc.json` — lint rules
- `doctor.config.ts` — react-doctor config

## Platform Requirements

**Development:**
- Node 22+ recommended (CI = 22; engines in example packages pin `22.x`)
- npm 11.5.1
- Convex CLI (`npx convex`) for local backend / codegen (`npm run check:convex-codegen`)
- Optional: Wrangler for `examples/routing-edge`
- Optional provider keys for Resend/Novu/OpenRouter/Meilisearch/Stripe smoke paths

**Production:**
- Host app: Vercel Node serverless via Nitro (`preset: 'vercel'`, `runtime: 'nodejs20.x'`) — production URL `https://agentic-economy-phi.vercel.app`
- Backend: Convex cloud deploy (`npx convex deploy` in release gate)
- Optional edge: Cloudflare Worker `ae-routing-edge` / `ae-routing-edge-production` (`examples/routing-edge/wrangler.jsonc`)
- CI: GitHub Actions (`kernel-release-gate.yml`, `react-doctor.yml`)

---

*Stack analysis: 2026-07-18*
*last_mapped_commit: 5ea44454*
