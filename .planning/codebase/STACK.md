# Technology Stack

**Analysis Date:** 2026-07-17
**Inspected Revision:** `3aa46069a00724679020f7f3cb338cc4ee177591`

## Languages

**Primary:**
- TypeScript 6.0.3 in strict mode - application, Convex backend, tests, tools, and Worker examples (`src/`, `convex/`, `tests/`, `tools/`, `examples/routing-edge/src/`).
- TSX with React 19.2.7 - routes and UI (`src/routes/`, `src/components/`).

**Secondary:**
- JavaScript ESM (`.mjs`) - hosted routing, deploy, and readiness tools (`examples/routing-provider/`, `examples/routing-agent-bridge/`).
- JSON/JSONC/YAML - package, deployment, Worker, evaluation, and CI configuration.

## Runtime

**Environment:**
- Node.js 22 in CI and the standalone provider; Vercel server output pins Node.js 20.x (`.github/workflows/kernel-release-gate.yml`, `examples/routing-provider/package.json`, `vite.config.ts`).
- Browser for React, Cloudflare Workers for routing examples, and Convex managed runtime for data/functions.

**Package Manager:**
- npm 11.5.1, pinned in `package.json` and CI.
- Lockfile: `package-lock.json` present; use `npm ci`.

## Frameworks

**Core:**
- TanStack Start 1.168.26 - full-stack React and server functions (`src/routes/`, `src/start.ts`).
- TanStack React Router 1.170.16 - file-based routing; generated tree at `src/routeTree.gen.ts`.
- React/React DOM 19.2.7 - UI runtime.
- Convex 1.42.0 - source database, functions, HTTP router, and crons (`convex/`).
- Nitro nightly 3.0.1 - Vercel Node server output (`vite.config.ts`).

**UI:**
- Astryx core/theme-neutral 0.1.2 - required design system; read `DESIGN.md` before UI changes.
- Tailwind CSS 4.3.1 - layout glue through `@tailwindcss/vite`, not a competing component system.
- TanStack Table 8.21.3, Lucide React 1.21.x, Motion 12.42.x - tables, icons, motion.

**Validation and contracts:**
- Zod 4.4.3 - runtime and action schemas.
- AJV 8.20.0 and `@cfworker/json-schema` 4.1.1 - JSON Schema validation.
- `@tanstack/ai` 0.38.x - action-to-agent JSON Schema (`src/modules/common/action.ts`).

**Testing:**
- Vitest 4.1.9 with jsdom 29.1.1 - unit, integration, type, import, copy, SEO, and UI-contract suites.
- Playwright 1.61.1 - E2E, accessibility, deploy smoke, and authenticated lifecycle checks.
- Testing Library React 16.3.2/jest-dom 6.9.1, `convex-test` 0.0.54, Edge Runtime VM 5.x.
- Promptfoo 0.121.x - answer evaluation (`eval/answer/`).

**Build/Dev:**
- Vite 8.1.0 with React plugin 6.0.3 - dev and build (`vite.config.ts`).
- TypeScript 6.0.3 - strict no-emit checking (`tsconfig.json`).
- oxlint 1.73.x - repository linting; tsx 4.20.x - TypeScript tools.
- Wrangler 4.110.x - Worker typecheck and dry-run deploy.

## Key Dependencies

**Critical:**
- `@clerk/tanstack-react-start` 1.4.9 - sessions, owner/operator auth, and external-agent credentials.
- `convex` 1.42.0 - persistence and server execution; read `convex/_generated/ai/guidelines.md` before Convex changes.
- `web-bot-auth` 0.1.3 and `http-message-sig` 0.2.x - signed agent identity and example clients.
- `@noble/hashes` 1.8.0 / `@noble/curves` 1.9.1 - hashes, HMAC/HKDF, Ed25519, receipts, authority integrity.
- `undici` 7.28.0 - guarded outbound networking.
- `@x402/*` 2.18.0 and `viem` 2.55.2 - scoped payment-signing adapter (`src/modules/capability-supply/internal/x402-payment-signer.ts`), not evidence of public payment capability.

**Infrastructure:**
- Sentry Node/React 10.63.x and Vite plugin 5.3.x - sanitized telemetry/source maps (`src/lib/observability/`).
- PostHog JS 1.398.x / Node 5.39.x - optional client/server analytics.

## Configuration

**Environment:**
- `.env.development.local`, `.env.local`, and `.env.example` exist; contents were not read.
- Browser-safe values use `VITE_*`; server/Convex secrets use provider or `AE_*` names. Enforce provider-secret boundaries with `tests/unit/security/provider-secret-surface.test.ts`.
- Convex and Vercel environments deploy separately; CI checks required production Convex execution settings.

**Build:**
- `vite.config.ts` composes TanStack Start, Nitro/Vercel, React, Tailwind, and optional Sentry upload.
- `tsconfig.json` targets ES2022 with strict optional/index/catch rules and bundler resolution.
- `vitest.config.ts`, `playwright.config.ts`, and deploy-smoke configs define verification.
- Worker deployments use `examples/routing-edge/wrangler.jsonc` and `examples/routing-agent-directory/wrangler.jsonc`.

## Platform Requirements

**Development:**
- Use Node.js 22 and npm 11.5.1; run `npm ci`, then `npm run dev` on loopback port 3000.
- Convex and Clerk configuration are required for authenticated/source-backed paths.
- Use `npm run test:release:source` for the complete source gate; prefer focused scripts while iterating.

**Production:**
- Vercel Node serverless web app, Convex data/functions/HTTP/crons, and optional independent Cloudflare Worker routing examples.
- Hosted claims require the exact-revision deploy and authenticated readback in `.github/workflows/kernel-release-gate.yml`; local build success is not hosted proof.

---

*Stack analysis: 2026-07-17*
