# Technology Stack
**Analysis Date:** 2026-08-12

## Languages
- TypeScript is the application and Convex language. Browser/UI code uses TSX; `package.json` sets ESM mode with `"type": "module"` and `src/routes/__root.tsx` is the React document root.
- Runtime configuration, contracts, and seed material are JSON-shaped TypeScript values (OpenAPI 3.1 documents, JSON Schema 2020-12, Convex validators). YAML is used by evaluation/config assets such as `eval/answer/promptfooconfig.yaml`.
- Styling is CSS plus Tailwind CSS utilities. `src/styles/globals.css` is the configured stylesheet in `components.json`; generated agent/discovery material is Markdown/text (`src/routes/SKILL[.]md.ts`, `src/routes/llms[.]txt.ts`).

## Runtime
- Local and package-declared runtime is Node 22: `.nvmrc` contains `22`, `package.json` requires `node: 22.x`, and `src/lib/deployment/manifest.ts` declares `{ nodeMajor: 22, engine: 'nodejs22.x' }`.
- The web server is TanStack Start/Nitro on Vercel's Node serverless runtime. `vite.config.ts` sets Nitro's Vercel preset, `entryFormat: 'node'`, and function runtime `nodejs22.x`; it deliberately does not use an edge runtime because webhook handlers need raw bodies and Node/WebCrypto signature verification.
- `vite.config.ts` serves development on `127.0.0.1:3000`, while `src/start.ts` installs the request middleware chain (correlation, API boundary, observability, security headers, agent-content negotiation, CSRF, source-write admission, and conditional Clerk middleware).
- Convex 1.42.0 is the authoritative backend runtime. `convex/` contains database functions, actions, HTTP/cron entrypoints, workers, and generated API bindings. `src/lib/server/convex-source.ts` is the server-side HTTP client seam for public and Clerk-authenticated Convex queries, mutations, and actions.
- The external-agent CLI runs TypeScript directly through `tsx` (`package.json` script `ae` -> `tools/ae/cli.ts`); `tools/tsconfig.json` intentionally typechecks only `tools/ae/**/*.ts`.
- `.vercel/project.json` currently records Vercel project framework `nitro` and platform `nodeVersion: 24.x`, whereas the generated `.vercel/output/functions/__server.func/.vc-config.json` and the source deployment manifest pin the deployed function to `nodejs22.x`. The repository/CI contract is Node 22; the Vercel project metadata is a separate current setting.

## Frameworks
- React 19.2.7 and React DOM 19.2.7 render the browser surface. `src/router.tsx` creates the TanStack Router with the generated `src/routeTree.gen.ts`; `src/routes/__root.tsx` conditionally wraps protected paths in Clerk's provider.
- `@tanstack/react-router` 1.170.16 supplies file-based routes and server handlers; `@tanstack/react-start` 1.168.26 supplies SSR/server functions and middleware. `vite.config.ts` composes `tanstackStart()`, `viteReact()`, Nitro, and Tailwind's Vite plugin.
- Tailwind CSS and `@tailwindcss/vite` are 4.3.1. `components.json` records the shadcn/ui `new-york` style, non-RSC TSX output, CSS-variable theme, and `lucide` icon library.
- Convex's component system is configured in `convex/convex.config.ts`: `@convex-dev/workflow` 0.4.4, `@convex-dev/workpool` 0.4.9, `@convex-dev/rate-limiter` 0.3.2, and `@convex-dev/aggregate` 0.2.2 (named `ownerActivationByStage`).

## Key Dependencies
- Model/agent execution: `ai` 7.0.44, `@ai-sdk/provider-utils` 5.0.16, `@openrouter/ai-sdk-provider` 3.0.0, and `@tanstack/ai` 0.38.0. All model calls are routed through `src/modules/model-gateway/public.ts`; answer tool loops and customer-request semantic interpretation use the Vercel AI SDK rather than opening ad-hoc model HTTP clients.
- Contract/schema and transport: `zod` 4.4.3, `@cfworker/json-schema` 4.1.1, `@apidevtools/json-schema-ref-parser` 11.9.3 (lockfile resolution), `openapi-fetch` 0.17.0, `@modelcontextprotocol/sdk` 1.30.0, and `undici` 7.28.0. `src/modules/capability-supply/internal/publication-importers.ts` normalizes OpenAPI/MCP sources; `src/modules/capability-supply/route-transport-runtime.ts` executes registered HTTP JSON, MCP JSON-RPC, and x402 transports.
- Persistence and coordination: `convex` 1.42.0 plus the four Convex components above; `graphology`/`graphology-dag` provide operation/discovery graph structures. Durable invocation, provider-route work, readiness probes, scheduled cleanup, and money/answer ledgers are Convex-owned.
- Identity, money, and paid transport: `@clerk/tanstack-react-start` 1.4.9, `stripe` 22.5.0, `@stripe/stripe-js` 9.13.0, `@stripe/react-stripe-js` 6.8.1, `@x402/core`/`@x402/evm`/`@x402/extensions` 2.18.0, `viem` 2.55.2, and `http-message-sig` 0.2.0.
- Observability and UI support: `@sentry/node`/`@sentry/react` 10.63.0, `posthog-node` 5.39.0, `posthog-js` 1.398.2, `streamdown` 2.5.0 with its CJK/code/math/mermaid packages, `motion` 12.42.0, `radix-ui` 1.6.7, and `sonner` 2.0.7.
- Build/test toolchain versions are pinned or lock-resolved in `package.json`/`package-lock.json`: TypeScript 6.0.3, Vite 8.1.0, Nitro nightly `3.0.1-20260628-090458-3df69609`, `tsx` 4.20.5, Vitest 4.1.9, Playwright 1.61.1, Tailwind 4.3.1, and Oxlint 1.73.0.

## Configuration
- `package.json` and `package-lock.json` are the dependency/script manifests. `packageManager` is `npm@11.5.1`; CI installs that exact npm version before `npm ci`. Main execution scripts are `dev`, `dev:local`, `build`, `typecheck`, `check:convex-codegen`, `seed:dev`, `ae`, and the source/hosted release gates.
- `tsconfig.json` targets ES2022 with DOM/ES2024 libraries, strict checking, exact optional properties, unchecked-index checking, bundler resolution, no emit, JSX transform, and `@/*`/`~/*` aliases. `convex/tsconfig.json` keeps Convex code strict and ESNext with the same `@/* -> src/*` alias.
- `vite.config.ts` enables tsconfig paths, a Graphology CJS optimize-deps shim for Vite 8, ignored test-report directories, optional Sentry source maps/upload only when `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, and `SENTRY_PROJECT` are all present, and the `/SKILL.md` Nitro route registration.
- `convex/convex.config.ts` declares optional Convex environment values for OpenRouter, customer-request model/site identity, release identity, Clerk issuer, server-function auth, and route-call signing; `convex/auth.config.ts` requires `CLERK_JWT_ISSUER_DOMAIN` and registers Clerk's `convex` application.
- `convex/schema.ts` composes the current domain tables (capability supply/contracts, operations/invocations, answer threads, customer requests, agent access/OAuth, money, inquiries/notifications, observability, work trees, studies, external runs, and supporting catalog/business/settings tables). `convex/crons.ts` schedules one-minute readiness refresh plus hourly abuse-bucket, source-write-nonce, and OAuth-grant cleanup.
- `src/lib/deployment/manifest.ts` is the machine-readable production/preview contract. It declares required canonical/Convex/Clerk/model/source-write/x402/Stripe groups, conditional notification/sandbox/routing/security/observability/release-smoke groups, field types, production-forbidden development secrets, and the liveness/readiness/release probes. `.env.example` is the human-facing name-only environment template.
- `components.json` configures the UI component generator; `.vercel/project.json`, `.vercel/output/config.json`, and `.vercel/output/functions/__server.func/.vc-config.json` are current Vercel/Nitro deployment metadata, not alternate application entrypoints.

## Platform Requirements
- Development requires Node 22 and npm 11.5.1 (or the repository's pinned package manager), a modern browser for the React/TanStack Start surface, and a reachable Convex deployment URL (`CONVEX_URL` or `VITE_CONVEX_URL`).
- Server-side authenticated Convex calls require Clerk's server session token template unless the local-only E2E bypass is active with `CONVEX_SELF_HOSTED_ADMIN_KEY`; production validation forbids that bypass and admin key.
- Production/preview startup is fail-closed through `src/lib/server/readiness.ts`: it validates the deployment manifest, canonical URL rules, and Convex URL, then probes Convex with a bounded public HTTP request (2s default, 5s maximum). `/api/health` is liveness-only; `/api/ready` reports configuration and Convex readiness.
- Provider execution needs outbound HTTPS to allowlisted/public targets. `src/modules/network-guard/public.ts`, `undici`'s guarded dispatcher, and the Convex workers reject localhost/private/link-local/multicast targets and bound response sizes/timeouts. x402 execution additionally needs server-only custody material and `viem` EVM signing.
- Vercel deployment uses Nitro's Node serverless function; GitHub Actions uses `.nvmrc`, `npm@11.5.1`, frozen installs, Convex codegen/deploy, Vercel exact-revision deployment, and the source/hosted release scripts documented in `.github/workflows/kernel-release-gate.yml`.
