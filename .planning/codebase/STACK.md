# Technology Stack

**Analysis Date:** 2026-07-18  
**last_mapped_commit:** `3463c1d4`

## Languages

**Primary:**
- TypeScript 6.0.3 (`typescript` in `package.json`) — application, Convex functions, tests, tools. Strict compiler options in `tsconfig.json` (`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `useUnknownInCatchVariables`, `noImplicitOverride`).
- TSX / React 19.2.7 — UI routes and components under `src/routes/`, `src/components/`, `src/app/`.

**Secondary:**
- JavaScript / ESM (`.mjs`) — release and provider scripts under `tools/`, `examples/routing-provider/`, `eval/answer/scripts/`.
- CSS — Tailwind 4 + Astryx theme layers in `src/styles/globals.css`, `src/styles/tokens.css`, `src/styles/base.css`.
- YAML — Promptfoo eval config at `eval/answer/promptfooconfig.yaml`.
- JSONC — Cloudflare Workers configs (`examples/routing-edge/wrangler.jsonc`, `examples/routing-agent-directory/wrangler.jsonc`).

## Runtime

**Environment:**
- Node.js — local/dev commonly Node 25.x; CI and Workers examples pin **Node 22** (`.github/workflows/kernel-release-gate.yml` `node-version: '22'`; `examples/routing-provider/package.json` `engines.node: "22.x"`).
- Vercel Node serverless **nodejs20.x** for production app functions (`vite.config.ts` Nitro `vercel.functions.runtime`).
- Convex managed runtime for queries/mutations/actions (`convex/`); Node-flagged Convex actions use `"use node"` where builtins are required.
- Cloudflare Workers for routing-edge / agent-directory examples (`wrangler` ^4.110.0).

**Package Manager:**
- npm 11.5.1 (`packageManager` field in `package.json`; CI installs `npm@11.5.1`)
- Lockfile: `package-lock.json` present (npm)

## Frameworks

**Core:**
- TanStack Start 1.168.26 (`@tanstack/react-start`) + TanStack Router 1.170.16 — full-stack React app, file routes under `src/routes/`, server fns / middleware in `src/start.ts`.
- Vite 8.1.0 — dev server and production build (`npm run dev` / `npm run build`).
- Nitro (nightly `nitro-nightly@3.0.1-…`) via `nitro/vite` — Vercel Node preset for SSR/server handlers.
- Convex 1.42.0 — primary transactional store and backend functions; schema composed in `convex/schema.ts` from module fragments.
- React 19.2.7 + React DOM 19.2.7 — UI.
- Astryx Design System — `@astryxdesign/core` ^0.1.2 + `@astryxdesign/theme-neutral` ^0.1.2 (CLI `@astryxdesign/cli` as devDep). Visual authority for components/templates; Tailwind utilities are layout glue only.

**Testing:**
- Vitest 4.1.9 — unit/integration/types/imports/copy/seo/ui-contract (`vitest.config.ts`, `tests/**`).
- Playwright 1.61.1 — e2e (`playwright.config.ts`), deploy-smoke (`playwright.deploy-smoke.config.ts`), a11y under `tests/e2e/a11y`.
- convex-test ^0.0.54 — Convex function tests.
- Promptfoo ^0.121.17 — answer-pipeline evals (`npm run test:eval`).
- Testing Library (`@testing-library/react`, `@testing-library/jest-dom`) + jsdom 29.1.1 — component/DOM tests.
- `@edge-runtime/vm` — edge-runtime test helper where needed.

**Build/Dev:**
- `@vitejs/plugin-react` 6.0.3 — React transform.
- `@tailwindcss/vite` 4.3.1 + `tailwindcss` ^4.3.1 — CSS pipeline.
- oxlint ^1.73.0 — lint (`npm run lint`, `.oxlintrc.json`).
- tsx ^4.20.5 — run TypeScript tools/smokes.
- wrangler ^4.110.0 — Cloudflare Workers typecheck/deploy dry-run (`npm run check:routing-edge`).
- react-doctor ^0.7.7 — React health (`doctor.config.ts`, `npm run doctor`).
- `@sentry/vite-plugin` ^5.3.0 — source-map upload when Sentry env is set.

## Key Dependencies

**Critical:**
- `convex` 1.42.0 — data plane; `ConvexHttpClient` in `src/lib/server/convex-source.ts`.
- `@clerk/tanstack-react-start` 1.4.9 — human auth, API-key agent auth for Customer Request (`src/lib/server/customer-request-agent-auth.ts`, `src/start.ts` `clerkMiddleware`).
- `zod` 4.4.3 — schemas across actions, transports, API validation.
- `@tanstack/ai` ^0.38.0 — JSON Schema conversion for harness/action tool contracts (`src/modules/common/action.ts`, `src/modules/harness/tool-contract.ts`).
- `@astryxdesign/core` / `@astryxdesign/theme-neutral` — UI primitives and theme.
- `@x402/core` 2.18.0, `@x402/evm` 2.18.0, `@x402/extensions` 2.18.0, `viem` 2.55.2 — EVM x402 payment-signature path for capability-supply route transport (`src/modules/capability-supply/internal/x402-payment-signer.ts`).
- `web-bot-auth` 0.1.3 + `http-message-sig` ^0.2.0 — Web Bot Auth / HTTP message signature identity (`src/modules/routing-kernel/caller-identity.ts`, `src/routes/[.]well-known/http-message-signatures-directory.ts`).
- `@noble/hashes` 1.8.0 + `@noble/curves` 1.9.1 — HKDF/HMAC/sha256/ed25519 for admission, digests, attestation (`src/modules/security/source-write-admission.ts`, `src/modules/common/ed25519-attestation.ts`).
- `@sentry/react` / `@sentry/node` ^10.63.0 — error tracking (`src/lib/observability/sentry.*.ts`).
- `posthog-js` ^1.398.2 / `posthog-node` ^5.39.0 — product analytics (`src/lib/observability/posthog.*.ts`).
- `motion` ^12.42.0 — UI motion.
- `lucide-react` ^1.21.0 — icons via Astryx/Icon usage.
- `@tanstack/react-table` ^8.21.3 — operator tables (e.g. readback panels).
- `undici` 7.28.0 — HTTP client where Node fetch needs control.
- `ajv` 8.20.0 / `@cfworker/json-schema` 4.1.1 — JSON Schema validation (capability/OpenAPI-shaped paths).
- `clsx` + `tailwind-merge` — class composition (`src/lib/utils.ts`).

**Infrastructure:**
- Nitro Vercel preset — host packaging.
- Convex HTTP router (`convex/http.ts`) — sandbox provider endpoints + retired routing v1/MCP stubs.
- Meilisearch (HTTP, no npm SDK) — optional catalog search backend via `MEILISEARCH_*` / `AE_SEARCH_*` (`src/modules/registry/internal/catalog-search-port.ts`).

## Configuration

**Environment:**
- Local secrets/config via `.env.local`, `.env.development.local` (present; do not commit values). Template of required keys: `.env.example` (names only — never commit filled secrets).
- Vite public vars: `VITE_*` (Clerk publishable key, Convex URL, PostHog, Sentry DSN, Google Maps, answer mode, observability kill-switch).
- Convex app env declared in `convex/convex.config.ts` (`OPENROUTER_API_KEY`, `AE_CUSTOMER_REQUEST_MODEL`, `AE_SITE_URL`, `CLERK_JWT_ISSUER_DOMAIN`, route-call signing secrets, server function token).
- Clerk JWT issuer for Convex: `convex/auth.config.ts` requires `CLERK_JWT_ISSUER_DOMAIN`.

**Build:**
- `vite.config.ts` — TanStack Start, Nitro Vercel Node, React, Tailwind, optional Sentry plugin, SSR `noExternal` for `@astryxdesign/*`.
- `tsconfig.json` — path aliases `@/*` and `~/*` → `src/*`; operator route remaps for owner/admin.
- `convex/tsconfig.json` — Convex package compile.
- `vitest.config.ts`, `playwright.config.ts`, `playwright.deploy-smoke.config.ts`.
- `.oxlintrc.json` — lint rules.
- `doctor.config.ts` — react-doctor rule overrides / ignore list.

## Platform Requirements

**Development:**
- Node 22+ recommended (CI uses 22; local may be newer).
- npm 11.5.1 (`npm ci`).
- Convex CLI / deployment linked (`npx convex dev`, `CONVEX_URL` / `VITE_CONVEX_URL`).
- Clerk keys for authenticated surfaces (or `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E=true` for local e2e only — refused in production builds).
- Optional: OpenRouter, Resend, Novu, Meilisearch, Sentry, PostHog, Google Maps for full feature parity.

**Production:**
- Host: **Vercel** Node serverless (app at `https://agentic-economy-phi.vercel.app` per release workflow / seed defaults).
- Backend: **Convex** production deployment (schema+functions via `npx convex deploy` in `.github/workflows/kernel-release-gate.yml`).
- Edge examples: **Cloudflare Workers** (`ae-routing-edge`, agent-directory) — not the primary customer app host.
- Release gate: GitHub Actions `kernel-release-gate.yml` (source proof on PR/main; hosted deploy+Request readback on main).

---

*Stack analysis: 2026-07-18 (commit 3463c1d4)*
