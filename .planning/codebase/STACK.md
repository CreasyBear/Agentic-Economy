---
last_mapped_commit: abcc85a8
---

# Technology Stack

**Analysis Date:** 2026-08-21

Agentic Economy is a Convex + TanStack Start market where authorized agents discover, buy and invoke admitted third-party Market Operations. The public machine surface is **14 registered actions** (`src/modules/actions/index.ts`) and **51 Convex tables** (`defineTable` entries composed by `convex/schema.ts`). `/api/v1/operations/call` (`src/routes/api.v1.operations.call.ts`, contract `src/modules/capability-execution/operation-invoke-entry.ts`) is the paid door; MCP (`src/routes/mcp.ts`), CLI (`tools/ae/cli.ts`), and chat (`src/routes/api.answer.turn.ts`) are thin adapters over the same action registry. Live money is activated by source-owned policy (`LIVE_MONEY_GATE_POLICY`, `enabled: true`, revision `2026-08-20` in `src/modules/money/internal/live-money-gate.ts`).

Package identity: `agentic-economy` `0.1.0`, `private`, `"type": "module"`, `"sideEffects": false` (`package.json`).

**Snapshot caveat:** the working tree carries a large uncommitted refactor and was still being modified during this analysis (the inquiry, notification-outbox, and work-tree families were removed mid-scan). This document reflects the tree as verified on 2026-08-21; re-run the mapper after the refactor lands.

## Languages

**Primary:**
- TypeScript 6.0.3 (`typescript` in `package.json`) — application, Convex functions, tests, CLI, eval, and release tools. `tsconfig.json` targets `ES2022`, libs `DOM` + `DOM.Iterable` + `ES2024`, `module`/`moduleResolution` `ESNext`/`Bundler`, `jsx` `react-jsx`, `strict` plus `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `useUnknownInCatchVariables`, `noImplicitOverride`. `ignoreDeprecations` is `"6.0"`. `allowJs` false, `noEmit` true, `isolatedModules` true, `skipLibCheck` true. `types`: `vite/client`, `node`. Include: `src/**`, `convex/**`, `tests/**`, plus root Vite/Vitest/Playwright configs. Exclude: `node_modules`, `dist`, `convex/_generated`.
- TSX / React 19.2.7 (`react`, `react-dom`, `@types/react` 19.2.7, `@types/react-dom` 19.2.3) — UI in `src/routes/`, `src/components/ae/`, `src/components/ui/`, `src/components/ai-elements/`.

**Secondary:**
- JavaScript (ESM, `"type": "module"`) — Node scripts under `tools/`, `eval/`, `scripts/`. Examples: `tools/dev/local-dev.mjs`, `tools/dev/papercut.mjs`, `tools/dev/run-with-cleanup.mjs`, `tools/release/kernel-retirement-manifest.mjs`, `eval/parity/check-parity.mjs`, `scripts/audit-action-surfaces.mjs`.
- YAML — Promptfoo eval config `eval/answer/promptfooconfig.yaml`; GitHub Actions `.github/workflows/kernel-release-gate.yml`, `.github/workflows/react-doctor.yml`.
- CSS — Tailwind 4 entry `src/styles/globals.css` with `tw-animate-css` 1.4.0. `@source not "../../.planning"` keeps planning files out of the Tailwind scan.
- Markdown — agent skill route `src/routes/SKILL[.]md.ts` registered in Nitro as `/SKILL.md`. Discovery documents `src/routes/llms[.]txt.ts`, `src/routes/robots[.]txt.ts`, `src/routes/sitemap[.]xml.ts`, `src/routes/[.]well-known/ucp.ts`.

Path aliases in `tsconfig.json`: `@/*` and `~/*` → `src/*`; operator route remaps `@/routes/owner.*`, `@/routes/admin.*`, `@/routes/developers.discovery` → `src/routes/_operator/…`. Convex tsconfig `convex/tsconfig.json` maps `@/*` to `src/*` with `baseUrl` `..`, target `ESNext`, lib `ES2024`. CLI tsconfig `tools/tsconfig.json` extends the root config for `tools/ae/**/*.ts`. Vitest repeats the `@` → `src` alias so tool modules resolve under tests (`vitest.config.ts`).

Use `defineAction` / Zod schemas in TypeScript. Do not add JavaScript application modules under `src/`. Keep Convex generated files out of hand edits (`convex/_generated/`).

## Runtime

**Environment:**
- Node.js 22.x (`engines.node` in `package.json`, `.nvmrc` is `22`, deployment manifest `runtime.nodeMajor: 22` / `engine: nodejs22.x` in `src/lib/deployment/manifest.ts`). Incompatible majors fail `validateDeploymentManifest` with `node_runtime_incompatible`.
- Node 25 cannot deploy Convex `"use node"` actions. Codegen and local Convex work must run under Node 22; `tools/dev/local-dev.mjs` `assertSupportedNode()` refuses any major other than 22 and prepends the Node 22 bin dir onto `PATH` so `npx convex` children stay on Node 22.
- `"use node"` Convex action files: `convex/capabilityOperationInvocationWorker.ts`, `convex/capabilitySupplyReadiness.ts`, `convex/capabilitySupplyOwnerSupply.ts`, `convex/facilitatorDiscoveryAction.ts`. Queries and mutations stay in the default Convex runtime.
- Vercel Node serverless via Nitro (`nitro({ preset: 'vercel', vercel: { entryFormat: 'node', functions: { runtime: 'nodejs22.x' } } })` in `vite.config.ts`). Not Edge: webhook routes need raw `Request` bodies and Node/WebCrypto signature verification.
- Dev server: Vite on port 3000, host `127.0.0.1` (`npm run dev` → `vite dev --host 127.0.0.1`). Watch ignores `test-results/`, `playwright-report/`, `.output/`. `allowedHosts` includes a Tailscale hostname.
- Playwright local e2e uses port 3020 (`playwright.config.ts`). Paid-operation browser fixture uses port 3021 and `tools/dev/paid-operation-browser/vite.config.ts` (`playwright.paid-operation.config.ts`). Local stack `npm run dev:local` defaults Vite to port 3024 (`tools/dev/local-dev.mjs`).
- Convex backend runtime for queries/mutations/internal mutations/actions/crons/workpools (`convex/` plus module schemas under `src/modules/*/internal/`). Convex HTTP is retired (`convex/http.ts` returns `routingV1RetiredResponse` for `/v1/*`, `/mcp`, `/.well-known/ae-routing.json`; do not revive).

**Package Manager:**
- npm 11.5.1 (`packageManager` in `package.json`; CI pins `npm install --global npm@11.5.1` in `.github/workflows/kernel-release-gate.yml`).
- Lockfile: `package-lock.json` present. CI source-proof uses `npm ci`; the opt-in live-gateway job uses `npm ci --ignore-scripts` so install lifecycle cannot read production secrets.
- Overrides in `package.json`: `@opentelemetry/exporter-trace-otlp-http` `0.219.0`; `shiki`, `@shikijs/types`, `@shikijs/core`, `@shikijs/langs`, `@shikijs/themes`, `@shikijs/engine-javascript`, `@shikijs/engine-oniguruma` all `^3.23.0`.

## Frameworks

**Core:**
- TanStack Start 1.168.26 (`@tanstack/react-start`) — SSR/server functions, request middleware in `src/start.ts` (`createStart`), file routes under `src/routes/`, generated tree `src/routeTree.gen.ts`. Middleware order: request correlation → API request boundary (`src/lib/server/api-request-boundary.ts`) → observability → security headers (`src/lib/http/security-headers.ts`) → agent content negotiation (`src/lib/http/agent-content-negotiation.ts`) → CSRF (`createCsrfMiddleware`, serverFn only) → source-write admission → Clerk (`clerkMiddleware()`, omitted when local e2e bypass is on).
- TanStack Router 1.170.16 (`@tanstack/react-router`) — `src/router.tsx` (`createRouter`, `defaultPreload: 'intent'`, `defaultPendingMs: 150`, view transitions, scroll restoration).
- Convex 1.42.0 (`convex`) — schema `convex/schema.ts`, auth `convex/auth.config.ts`, app components `convex/convex.config.ts`, retired HTTP router `convex/http.ts`, crons `convex/crons.ts`. Server seam `src/lib/server/convex-source.ts` (`ConvexHttpClient`, `anyApi` / `makeFunctionReference`).
- Clerk TanStack Start SDK 1.4.9 (`@clerk/tanstack-react-start`) — `clerkMiddleware()` in `src/start.ts`, `ClerkProvider` in `src/routes/__root.tsx`, sign-in/up `src/routes/sign-in.$.tsx` / `src/routes/sign-up.$.tsx`. Vite `optimizeDeps.include` lists `@clerk/backend`, `@clerk/react`, `@clerk/shared/*`.
- Vercel AI SDK `ai` ^7.0.44 plus `@openrouter/ai-sdk-provider` ^3.0.0 — single model seam `src/modules/model-gateway/public.ts` (`createOpenRouter`, `wrapLanguageModel` + `addToolInputExamplesMiddleware`). Answer tool rounds use `generateText`; streaming UI messages on `src/routes/api.answer.turn.ts` via `createUIMessageStream` / `createUIMessageStreamResponse`.
- Zod 4.4.3 — action/input/output contracts, money amounts, live-money gate, deployment field validation. MCP host uses SDK zod-compat parsers in `src/lib/server/mcp-api.ts`.
- Tailwind CSS 4.3.1 + `@tailwindcss/vite` 4.3.1 — `src/styles/globals.css`; shadcn New York style via `components.json` (`rsc: false`, lucide icons, aliases `@/components`, `@/components/ui`, `@/lib/utils`).
- Radix UI (`radix-ui` ^1.6.7) + `class-variance-authority` ^0.7.1 + `clsx` 2.1.1 + `tailwind-merge` 3.6.0 — primitives in `src/components/ui/`.
- MCP SDK 1.30.0 (`@modelcontextprotocol/sdk`) — inbound host `src/lib/server/mcp-api.ts` (`McpServer`, `WebStandardStreamableHTTPServerTransport`); outbound provider client in `src/modules/capability-supply/internal/route-transport-mcp.ts` and `readiness-probe-mcp.ts` (`Client`, `StreamableHTTPClientTransport`).
- x402 2.18.0 (`@x402/core`, `@x402/evm`, `@x402/extensions`, `@x402/svm`) + viem 2.55.2 + `@coinbase/cdp-sdk` 1.53.0 — paid provider settlement. Production custody signer: `src/modules/capability-supply/internal/cdp-x402-payment-signer.ts` (Coinbase CDP `CdpClient` + `fromCdpEvmAccount`, Exact EVM scheme, EIP-3009 only, Base `eip155:8453` USDC). Local/dev raw-key signer: `src/modules/capability-supply/internal/x402-payment-signer.ts` (`privateKeyToAccount`); the raw-key env names are forbidden in production. `@x402/svm` is installed but has no direct `src/` import yet.
- Stripe ^22.5.0 (`stripe`) + `@stripe/stripe-js` ^9.13.0 + `@stripe/react-stripe-js` ^6.8.1 — money provider `src/lib/server/stripe-money-provider.ts`, webhook `src/routes/api.stripe.webhook.ts`.

**Testing:**
- Vitest 4.1.9 (`vitest.config.ts`) — Node environment, includes `tests/**/*.test.ts(x)` and `convex/**/*.test.ts`, setup files under `tests/setup/` (web-storage, jsdom-platform, http-rate-limit). `globals: false`. `watch: false`.
- Playwright 1.61.1 — e2e `playwright.config.ts` (`tests/e2e`, compact 375×812 + wide 1440×1100 Chromium, CI retries 2, github+html reporters on CI); deploy smoke `playwright.deploy-smoke.config.ts` (`tests/deploy-smoke`); paid-operation surface `playwright.paid-operation.config.ts`.
- Testing Library 16.3.2 (`@testing-library/react`) + jsdom 29.1.1.
- convex-test ^0.0.54 — Convex function tests.
- Promptfoo ^0.121.17 — `eval/answer/promptfooconfig.yaml`; home dir `.promptfoo-home` (gitignored). Scripts: `test:eval`, `test:eval:coverage`, `test:eval:report`, `test:eval:validate`.
- Braintrust 3.27.0 — `eval/braintrust/answer.eval.ts` (`npm run test:eval:braintrust:local` / `:remote`).
- oxlint ^1.73.0 — `npm run lint` (`oxlint src convex tests tools --deny-warnings`); config `.oxlintrc.json`.
- react-doctor ^0.7.7 — `npm run doctor`; advisory CI `.github/workflows/react-doctor.yml` (`millionco/react-doctor@v2`).

**Build/Dev:**
- Vite 8.1.0 (`vite.config.ts`) with `@vitejs/plugin-react` 6.0.3, `tanstackStart()`, `nitro()`, `tailwindcss()`, optional `@sentry/vite-plugin` ^5.3.0. `resolve.tsconfigPaths: true`. Sourcemaps only when the Sentry plugin is enabled.
- Nitro (`nitro-nightly@^3.0.1-20260628-090458-3df69609`) — Vercel Node adapter; extra route `/SKILL.md` → `src/routes/SKILL[.]md.ts`.
- tsx ^4.20.5 — CLI (`npm run ae` → `tsx tools/ae/cli.ts`) and release/eval scripts.
- `@types/node` 24.10.2.

## Key Dependencies

**Critical:**
- `convex` 1.42.0 — source of record. HTTP client seam `src/lib/server/convex-source.ts` (`ConvexHttpClient`, Clerk JWT or `AE_CONVEX_SERVER_FUNCTION_TOKEN` server-function assertion).
- `@clerk/tanstack-react-start` 1.4.9 — human sessions and Clerk API-key agent access (`auth({ acceptsToken: 'api_key' })` in `src/lib/server/agent-access-auth.ts`). Convex JWT issuer `CLERK_JWT_ISSUER_DOMAIN` / `applicationID: 'convex'` in `convex/auth.config.ts`.
- `ai` ^7.0.44 + `@openrouter/ai-sdk-provider` ^3.0.0 + `@ai-sdk/provider-utils` ^5.0.16 — OpenRouter is the only language-model gateway (`DEFAULT_OPENROUTER_MODEL` `deepseek/deepseek-v4-flash` in `src/modules/model-gateway/public.ts`). Used by `src/modules/answer/internal/answer-tool-use-agent.ts`, `src/modules/answer/internal/answer-query-safety.ts`, `src/modules/storefront/internal/business-enrichment.ts`. Do not open a parallel HTTP client to a model vendor.
- `@tanstack/ai` ^0.38.0 — `convertSchemaToJsonSchema` for action JSON Schema (`src/modules/common/action.ts`, `src/modules/registry/operation-action-contracts.ts`); `JSONSchema` type in `src/modules/harness/harness.schema.ts` and `src/modules/harness/tool-contract.ts`.
- `@modelcontextprotocol/sdk` 1.30.0 — MCP host at `/mcp`; server identity `agentic-economy` `1.0.0` (`src/lib/server/mcp-api.ts`). Anonymous tools are read-only; authenticated tools include `operation.invoke` and supply management.
- `stripe` ^22.5.0 — Checkout credit top-up, Connect onboarding, payout transfers, webhook ingest. `apiVersion: Stripe.API_VERSION`, `maxNetworkRetries: 0` in `src/lib/server/stripe-money-provider-config.ts`.
- `@coinbase/cdp-sdk` 1.53.0 — x402 payer custody: `CdpClient` (`apiKeyId`/`apiKeySecret`/`walletSecret`) + `evm.getOrCreateAccount({ name })`, x402 signing via `@coinbase/cdp-sdk/x402` (`fromCdpEvmAccount`). Configuration reader `cdpX402CustodyConfigurationFromEnvironment` in `src/modules/capability-supply/internal/server-credential.ts`; signer `src/modules/capability-supply/internal/cdp-x402-payment-signer.ts`.
- `@x402/core` / `@x402/evm` / `@x402/extensions` 2.18.0 + `viem` 2.55.2 — Exact EVM scheme (EIP-3009), payment-identifier extension, settlement verification (`src/modules/capability-supply/internal/x402-settlement-verifier.ts`, `x402-evm-receipt-reader.ts` with `createPublicClient`).
- `@convex-dev/workpool` ^0.4.9 — `convex/marketDispatchWorkpool.ts` (`maxParallelism: 32`, retry 3 attempts, 1s backoff ×2). Invocation workers run through it (`convex/capabilityOperationInvocationWorker.ts`).
- `@convex-dev/rate-limiter` ^0.3.2 — Convex-side admission `convex/lib/rateLimit.ts`, HTTP client `src/lib/server/rate-limit.ts`. Named limits in `convex/lib/rateLimit.ts`: `public-read` (120/min), `public-mutation` (5/min), `oauth-issuance` (5/min), `answer-turn-submit` (30/hour), `answer-stream` (30/hour), `inquiry-submit` (5/min; name retained after the inquiry removal), `dispute-open` (3/min), plus dynamic `agent-access-hour` / `agent-access-minute` from grant policy. The HTTP client exposes the first five names only.
- `@convex-dev/aggregate` ^0.2.2 — named component `ownerActivationByStage` in `convex/convex.config.ts`.
- `zod` 4.4.3 — runtime contracts across actions, money, deployment manifest.
- `http-message-sig` 0.2.0 — RFC 9421 signatures for source-write admission (`src/modules/security/source-write-admission.ts`) and the WBA directory `src/routes/[.]well-known/http-message-signatures-directory.ts`.
- `@noble/hashes` 1.8.0 / `@noble/curves` 1.9.1 — canonical SHA-256 digests (`src/modules/common/canonical-digest.ts`), HMAC route-call signing (`src/modules/capability-supply/internal/route-call-signing.ts`), Ed25519 attestation (`src/modules/common/ed25519-attestation.ts`).
- `@sentry/node` / `@sentry/react` ^10.63.0 — `src/lib/observability/sentry.server.ts`, `src/lib/observability/sentry.client.ts`. Production `tracesSampleRate` 0.1.
- `posthog-js` ^1.398.2 / `posthog-node` ^5.39.0 — `src/lib/observability/posthog.client.ts`, `src/lib/observability/posthog.server.ts`. Default host `https://us.i.posthog.com` (`src/lib/observability/config.ts`).
- `openapi-fetch` 0.17.0 — OpenAPI HTTP JSON parameter serialization in `src/modules/capability-supply/internal/route-transport-http-json.ts` and `src/modules/capability-execution/operation-execute.functions.ts`.
- `@cfworker/json-schema` 4.1.1 — capability contract JSON-Schema validation (`src/modules/capability-contract/internal/pointed-schema.ts`).
- `@apidevtools/json-schema-ref-parser` ^11.0.0 — schema `$ref` deref (`src/modules/capability-supply/internal/schema-deref.ts`).
- `undici` 7.28.0 — bounded/guarded fetch agents in `"use node"` workers and storefront (`src/modules/storefront/server.ts`, `src/modules/capability-execution/invocation-worker/*`, `src/modules/capability-supply/internal/x402-evm-receipt-reader.ts`).

**Infrastructure / UI:**
- `shiki` ^3.23.0 — code highlighting (`src/components/ai-elements/code-block.tsx`).
- `lucide-react` ^1.21.0, `motion` ^12.42.0, `sonner` ^2.0.7 (toaster in `src/routes/__root.tsx`), `cmdk` ^1.1.1, `thinking-orbs` ^0.2.0 (`src/components/ae/magic/MagicOrb.tsx`), `@tanstack/react-table` ^8.21.3, `use-stick-to-bottom` ^1.1.6.
- `date-fns` ^4.4.0, `es-toolkit` ^1.50.0, `nanoid` ^5.1.16, `yaml` 2.9.0, `@sindresorhus/slugify` ^3.0.0, `fastest-levenshtein` ^1.0.16.
- `@shadcn/react` ^0.3.0 — CLI companion to `components.json`.

**Known manifest drift:** `DEPLOYMENT_MANIFEST.resources` in `src/lib/deployment/manifest.ts` still lists component `workflow` inside `convex-components`. `package.json` has no `@convex-dev/workflow` dependency and `convex/convex.config.ts` registers only workpool, rate-limiter, and aggregate.

**Exact `package.json` versions (copy these; do not invent ranges):**

Runtime: `@ai-sdk/provider-utils` ^5.0.16, `@apidevtools/json-schema-ref-parser` ^11.0.0, `@cfworker/json-schema` 4.1.1, `@clerk/tanstack-react-start` 1.4.9, `@coinbase/cdp-sdk` 1.53.0, `@convex-dev/aggregate` ^0.2.2, `@convex-dev/rate-limiter` ^0.3.2, `@convex-dev/workpool` ^0.4.9, `@modelcontextprotocol/sdk` 1.30.0, `@noble/curves` 1.9.1, `@noble/hashes` 1.8.0, `@openrouter/ai-sdk-provider` ^3.0.0, `@sentry/node` ^10.63.0, `@sentry/react` ^10.63.0, `@shadcn/react` ^0.3.0, `@sindresorhus/slugify` ^3.0.0, `@stripe/react-stripe-js` ^6.8.1, `@stripe/stripe-js` ^9.13.0, `@tanstack/ai` ^0.38.0, `@tanstack/react-router` 1.170.16, `@tanstack/react-start` 1.168.26, `@tanstack/react-table` ^8.21.3, `@x402/core` 2.18.0, `@x402/evm` 2.18.0, `@x402/extensions` 2.18.0, `@x402/svm` 2.18.0, `ai` ^7.0.44, `class-variance-authority` ^0.7.1, `clsx` 2.1.1, `cmdk` ^1.1.1, `convex` 1.42.0, `date-fns` ^4.4.0, `es-toolkit` ^1.50.0, `fastest-levenshtein` ^1.0.16, `http-message-sig` 0.2.0, `lucide-react` ^1.21.0, `motion` ^12.42.0, `nanoid` ^5.1.16, `openapi-fetch` 0.17.0, `posthog-js` ^1.398.2, `posthog-node` ^5.39.0, `radix-ui` ^1.6.7, `react` 19.2.7, `react-dom` 19.2.7, `shiki` ^3.23.0, `sonner` ^2.0.7, `stripe` ^22.5.0, `tailwind-merge` 3.6.0, `thinking-orbs` ^0.2.0, `tw-animate-css` 1.4.0, `undici` 7.28.0, `use-stick-to-bottom` ^1.1.6, `viem` 2.55.2, `yaml` 2.9.0, `zod` 4.4.3.

Dev: `@playwright/test` 1.61.1, `@sentry/vite-plugin` ^5.3.0, `@tailwindcss/vite` 4.3.1, `@testing-library/react` 16.3.2, `@types/node` 24.10.2, `@types/react` 19.2.7, `@types/react-dom` 19.2.3, `@vitejs/plugin-react` 6.0.3, `braintrust` 3.27.0, `convex-test` ^0.0.54, `jsdom` 29.1.1, `nitro` `npm:nitro-nightly@^3.0.1-20260628-090458-3df69609`, `oxlint` ^1.73.0, `promptfoo` ^0.121.17, `react-doctor` ^0.7.7, `tailwindcss` ^4.3.1, `tsx` ^4.20.5, `typescript` 6.0.3, `vite` 8.1.0, `vitest` 4.1.9.

## Configuration

**Environment:**
- Closed catalog lives in `src/lib/deployment/manifest.ts` (`DEPLOYMENT_MANIFEST` schema `ae.deployment-manifest:v1`, `validateDeploymentManifest`). Unknown `AE_*` / `VITE_AE_*` names fail validation. Production requires Node 22, HTTPS canonical origin, Convex URL, Clerk live keys, OpenRouter, six source-write family keys, CDP x402 custody, and Stripe.
- Readiness probes: `GET/HEAD /api/health` (`src/routes/api.health.ts`), `GET/HEAD /api/ready` (`src/routes/api.ready.ts` + `src/lib/server/readiness.ts`), `GET /api/v1/release` (`src/routes/api.v1.release.ts`). Verify locally with `npm run verify:deployment-manifest`.
- Convex dashboard env (declared in `convex/convex.config.ts`): `OPENROUTER_API_KEY`, `AE_SITE_URL`, `AE_RELEASE_SOURCE_REVISION`, `CLERK_JWT_ISSUER_DOMAIN`, `AE_CONVEX_SERVER_FUNCTION_TOKEN`, `AE_ROUTE_CALL_SIGNING_SECRET`, `AE_ROUTE_CALL_SIGNING_KEY_ID`, `AE_X402_RPC_URLS_JSON`, `AE_X402_PAYMENT_CREDENTIAL_REF`, `AE_X402_PAYMENT_PRIVATE_KEY`, `CDP_API_KEY_ID`, `CDP_API_KEY_SECRET`, `CDP_WALLET_SECRET`, `AE_X402_CDP_ACCOUNT_NAME`, `AE_X402_CUSTODY_ENABLED`, `AE_X402_CUSTODY_MAX_ATOMIC`.
- `.env` is not present. `.env.example` exists (allowlisted in `.gitignore`). `.env.local` is present and gitignored — note existence only; do not copy values from env files.
- `.clerk/` and `.vercel/` are gitignored (may contain secrets). Convex snapshot zips (`*.convex-export.zip`) are forbidden in git. Other gitignored runtime dirs: `.output/`, `.vinxi/`, `.tanstack/`, `.promptfoo-home/`, `.react-doctor/`, `output/`, `playwright-report/`, `test-results/`, `/.ae-cli/`.
- Project skills live under `.agents/skills/` (Convex family, `better-*` UI/review family, `ponytail` family, `react-doctor`, and more; vendor trees gitignored except `ae-*`). Skill files are agent guidance, not runtime dependencies.

**Required production groups** (names only; see `src/lib/deployment/manifest.ts`):
- Canonical origin: `AE_CANONICAL_BASE_URL` or `AE_CANONICAL_HOST_ALLOWLIST` (`src/lib/server/canonical-url.ts`).
- Convex: `CONVEX_URL` or `VITE_CONVEX_URL` (must match if both set); `AE_CONVEX_SERVER_FUNCTION_TOKEN`.
- Clerk: `VITE_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` (must be `sk_live_`), `CLERK_JWT_ISSUER_DOMAIN` (publishable must be `pk_live_`).
- Model gateway: `OPENROUTER_API_KEY`.
- Source-write families (now six; `inquiry` removed): `AE_SOURCE_WRITE_KEY_BILLING`, `_PROTECTED`, `_CLAIM`, `_OPERATOR`, `_REPAIR`, `_SESSION` (`SOURCE_WRITE_FAMILIES` in the manifest; scope map in `src/modules/security/source-write-admission.ts`).
- x402 custody (all required): `CDP_API_KEY_ID`, `CDP_API_KEY_SECRET`, `CDP_WALLET_SECRET`, `AE_X402_CDP_ACCOUNT_NAME`, `AE_X402_CUSTODY_ENABLED` (must be `true`), `AE_X402_CUSTODY_MAX_ATOMIC`, `AE_X402_RPC_URLS_JSON` (`eip155:<id>` → up to 2 URLs, max 32 networks).
- Stripe: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `VITE_STRIPE_PUBLISHABLE_KEY`.

**Forbidden in production:** `AE_SOURCE_WRITE_SECRET`, `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E`, `AE_ANSWER_EVAL_REGISTRY_SEED`, `AE_DEV_WBA_SMOKE_*`, `AE_LOCAL_DEV_VITE_ARGS`, `AE_X402_PAYMENT_CREDENTIAL_REF`, `AE_X402_PAYMENT_PRIVATE_KEY` (raw-key custody is dev-only now), `CONVEX_SELF_HOSTED_ADMIN_KEY`, `AE_API_KEY`.

**Build:**
- `vite.config.ts` — plugins, Nitro Vercel Node preset, Clerk optimizeDeps includes, Sentry sourcemaps when `SENTRY_AUTH_TOKEN` + `SENTRY_ORG` + `SENTRY_PROJECT` are set.
- `tsconfig.json`, `convex/tsconfig.json`, `tools/tsconfig.json`.
- `vitest.config.ts`, `playwright.config.ts`, `playwright.deploy-smoke.config.ts`, `playwright.paid-operation.config.ts`.
- `.oxlintrc.json`, `components.json`.
- No root `vercel.json`; Nitro emits the Vercel function bundle under `.vercel/` (gitignored).
- `package.json` `"sideEffects": false`.

**Public machine contract:**
- Action registry `src/modules/actions/index.ts` — exactly 14 actions: registry search/detail, operations search/detail/compare/inspect-plan, `operation.execute` (keyless), `operation.invoke`, `operation.status`, `operation.cancel`, `operation.reconcile`, supply publish/withdraw/earnings. MCP tool names derive as `ae_<action.id with dots → underscores>`.
- Paid invoke contract `src/modules/capability-execution/operation-invoke-entry.ts`: `POST /api/v1/operations/call` (`operation.invoke:v1`), `GET /api/v1/operations/{invocationRef}` (`operation.status:v1`), `POST …/cancel`, `POST …/reconcile`. The former `/api/v1/operations/execute` HTTP alias route is removed from `src/routes/`; keyless execution remains available via MCP `ae_operation_execute` (fail-closed to published keyless HTTP JSON ops, `src/modules/capability-execution/operation-execute-mcp.actions.ts`).
- Live money: `LIVE_MONEY_GATE_POLICY` in `src/modules/money/internal/live-money-gate.ts` is source-enabled (`policyId` `live-money-source-policy`, revision `2026-08-20`, `enabled: true`). Do not add an env flag that gates live money; the policy is source-owned.

**Convex tables (51 `defineTable` entries composed by `convex/schema.ts`):**
- Catalog / business: `owners`, `businesses` (`src/modules/business/internal/schema.ts`); `businessOfferings`, `businessOfferingRevisions`, `offeringAccessPaths` (`src/modules/catalog/internal/schema.ts`).
- Money (15): `moneyAccounts`, `moneyLedgerEntries`, `moneyTransactions`, `moneyUsageEvents`, `moneyCredentialBudgetStates`, `moneyExternalSpendReservations`, `moneyX402PaymentAttempts`, `moneyCredentialUsageSummaries`, `qualifiedUseReceipts`, `moneyTopupCommands`, `moneyStripeEvents`, `moneyPayoutAccounts`, `moneyPayouts`, `moneyPayoutAllocations`, plus `moneyProviderEarnings`-backed rows (`src/modules/money/internal/convex-schema.ts`).
- Capability supply (8): `capabilityPublications`, `capabilityOfferings`, `capabilityTransportBindings`, `capabilityProviderConnections`, `capabilityProviderConnectionLeases`, `capabilityProviderApprovals`, `registeredOperationMappings`, plus contract-registry `capabilityContractDocuments` (`src/modules/capability-supply/internal/convex-schema.ts`, `src/modules/capability-contract-registry/internal/convex-schema.ts`).
- Execution / invocation: `capabilityOperationInvocations` (`src/modules/capability-execution/internal/convex-schema.ts`); `actionInvocationControls`, `actionInvocationAttempts`, `actionInvocationHistory` (`src/modules/action-invocation/internal/convex-schema.ts`).
- Agent access: `agentAccessPrincipals` (`src/modules/agent-access/internal/principal-convex-schema.ts`), `agentAccessGrants` (`src/modules/agent-access/internal/convex-schema.ts`).
- Answer: `answerThreads`, `answerTurns`, `answerTurnReservations`, `answerToolCalls`, `answerThreadShares` (`src/modules/answer-thread/internal/convex-schema.ts`).
- Harness / external-run: `harnessSessions`, `harnessSessionEntries` (`src/modules/harness/internal/convex-schema.ts`); `externalRunManifests`, `externalRunStarts`, `externalRunEvidence`, `externalRunGateDecisions` (`src/modules/external-run/internal/convex-schema.ts`).
- Other: `registrySearchDocuments` (`src/modules/registry/internal/schema.ts`), `auditEvents` + `operationKeys` (`src/modules/observability/internal/schema.ts`), `adminMemberships`, `adminMembershipAuditEvents`, `disputes`, `sourceWriteNonces` (`src/modules/security/internal/schema.ts`).
- Empty spreads (unlisted; do not re-list): `discoveryTables` (`src/modules/discovery/internal/schema.ts`), `settingsTables` (`src/modules/settings/internal/schema.ts`), `routingKernelTables` (`src/modules/routing-kernel/internal/convex-schema.ts`), `notificationOutboxTables` (`src/modules/notification-outbox/internal/schema.ts` — module code deleted, empty marker remains), `agentAccessOAuthTables` (`src/modules/agent-access/internal/oauth-convex-schema.ts`).

**Crons** (`convex/crons.ts`): `refresh facilitator discovery` every 10 minutes (`internal.facilitatorDiscoveryAction.run`); `refresh capability supply readiness` every 1 minute (`internal.capabilitySupply.scheduleDueCapabilityProbes`); `cleanup expired source write nonces` hourly (`internal.sourceWriteAdmission.cleanupExpiredSourceWriteNonces`); `run daily supplier settlement` cron `0 0 * * *` (`internal.moneyLedger.runDailySupplierSettlement`). `internal.agentAccessOAuth.cleanupExpiredOAuthGrants` exists in `convex/agentAccessOAuth.ts` and is not scheduled from `convex/crons.ts`.

**CLI** (`tools/ae/cli.ts`, `npm run ae --`): command modules in `tools/ae/commands/` — `manifest.ts`, `search.ts`, `inspect.ts`, `compare.ts`, `inspect-plan.ts`, `connect.ts`, `invoke.ts`, `status.ts`, `recover.ts`, `cancel.ts`, `ask.ts`, `business.ts`, `discover.ts`, `enrich.ts`, `import.ts`, `journey.ts`, `actions.ts`, `doctor.ts`, `eval.ts`, `policy.ts`, `market-operations.ts`. `--json` emits one machine-readable value. Invoke/cancel/reconcile require `--idempotency-key`. Base URL from `--base-url` / `AE_CLI_BASE_URL` / `AE_CANONICAL_BASE_URL`.

**HTTP API file routes (TanStack Start, under `src/routes/`):**
- Paid door and recovery: `api.v1.operations.call.ts`, `api.v1.operations.$invocationRef.ts`, `api.v1.operations.$invocationRef.cancel.ts`, `api.v1.operations.$invocationRef.reconcile.ts`.
- Market reads: `api.v1.market-operations.search.ts`, `api.v1.market-operations.detail.ts`, `api.v1.market-operations.compare.ts`, `api.v1.market-operations.inspect-plan.ts`, `api.v1.services.ts`, `api.v1.services.search.ts`, `api.v1.services.$serviceId.ts`.
- Chat: `api.answer.turn.ts`, `api.answer.turn.stop.ts`, `api.answer.threads.ts`, `api.answer.threads.$threadId.ts`, `api.answer.threads.$threadId.share.ts`, `api.answer.eval-status.ts`.
- Discovery/business/storefront: `api.businesses.ts`, `api.businesses.search.ts`, `api.businesses.$slug.ts`, `api.discovery.schema.ts`, `api.discovery.examples.ts`, `api.storefront.enrich.ts`, `api.storefront.import-draft.ts`.
- Health/observability/money: `api.health.ts`, `api.ready.ts`, `api.v1.release.ts`, `api.observability.funnel.ts`, `api.observability.client-error.ts`, `api.stripe.webhook.ts`.
- Catch-all: `api.$.ts`. MCP: `mcp.ts`. OAuth: `oauth.authorize.ts`, `oauth.token.ts`, `oauth.register.ts`, `oauth.device_authorization.ts`. Well-known: `[.]well-known/oauth-authorization-server.ts`, `[.]well-known/oauth-protected-resource.ts`, `[.]well-known/http-message-signatures-directory.ts`, `[.]well-known/ucp.ts`.
- Notification dispatch/webhook routes were removed with the notification-outbox family.

**Convex module files (handlers, not generated):** ~114 top-level files under `convex/` excluding `convex/_generated/`. Composition and config: `schema.ts`, `convex.config.ts`, `auth.config.ts`, `authz.ts`, `http.ts` (retired paths only), `crons.ts`, `rateLimit.ts`, `lib/rateLimit.ts`, `marketDispatchWorkpool.ts`. Split domain families: `capabilitySupply*` (20 files: commands, graph, lists, probes, publish, readiness, owner funnel read/commands/projection/agent-read, operation keyless/queries/shared, ports/row-mappers/values), `capabilityOperation*` (admission, dispatch, invocation identity/projection, invocations, invoke actions, worker, work complete), `capabilityProvider*` (approvals, connections, connection leases/lifecycle/owner/cleanup), `capabilityContractDocuments.ts`, `money*` (20 files: canonical accounts, charge admission/authorize/brokered/journal/reconcile, connect, credit reads/topup, external spend, ledger + values, payout transfer begin/complete/complete-apply/read/reconcile/settlement/shared, provider earnings, qualified use payout, refund, stripe events, budget persist, x402 payment attempts), `answerThreads*` (base/checkpoint/reads/reserve/share), `harnessSessions*` (base/append/finalize/reads), `security*` (base/admin-membership/admin-readbacks/removal-disputes/shared), `agentAccess*` (principals/policy/oauth), `catalog*` (base/offering-mutations/public-reads/publish/runtime-queries), `facilitatorDiscovery.ts` + `facilitatorDiscoveryAction.ts`, plus `business.ts`, `businessSupplyProjectionSnapshot.ts`, `registry.ts`, `discovery.ts`, `observability.ts`, `qualifiedUse.ts`, `sourceWriteAdmission.ts`, `settings.ts`, `externalRuns.ts`, `actionInvocationControl.ts`, `serviceAssertion.ts`, `devSeed.ts`, `devSeedStore.ts`. Generated output: `convex/_generated/` (do not hand-edit).

**npm script groups** (`package.json`): `dev` / `dev:local` / `build` / `typecheck` / `lint` / `check:convex-codegen`; `test`, `test:unit`, `test:integration`, `test:e2e`, `test:e2e:a11y`, `test:e2e:paid-operation`, `test:types`, `test:imports`, `test:ts-standards`, `test:seo`, `test:ui-contract`, `test:eval*`, `test:conformance`, `test:release:source`; smoke (`smoke:gateway:production`, `validate:release:gateway`); evidence (`evidence:action-invocation:development`, `evidence:operation:development`, `evidence:bounded-mandate:development`, `evidence:full-yolo:development`); `seed:dev`; `papercut`; `parity:check`; `audit:actions`; `check:kernel-retirement`; `check:product-frontier`; `verify:deployment-manifest`; `gate:release`; `doctor`; `test:quality:gate` / `:live`.

## Platform Requirements

**Development:**
- Node 22 (`nvm use` / `.nvmrc`). Do not run Convex codegen, `convex dev`, or `"use node"` actions under Node 25.
- `npm ci` then `npm run dev:local` (`tools/dev/local-dev.mjs`) or `npm run dev`.
- Convex deployment URL in `CONVEX_URL` / `VITE_CONVEX_URL`. Optional local Clerk bypass `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E=true` (Playwright webServer sets this; forbidden in production).
- Seed: `npm run seed:dev` → `convex run devSeed:seedDevCatalog` (`convex/devSeed.ts`). Catalog fill is facilitator discovery ingest (`convex/facilitatorDiscovery.ts`), not curated publications.
- CLI: `npm run ae -- <command>` (`tools/ae/cli.ts`). Market search is anonymous HTTP; invoke uses the authenticated gateway.
- Lint/typecheck: `npm run lint`, `npm run typecheck`, `npm run check:convex-codegen` (`convex codegen --dry-run --typecheck=disable`).
- Tests: `npm test` (vitest via `tools/dev/run-with-cleanup.mjs`); `npm run test:e2e`; eval `npm run test:eval`. Release source gate `npm run test:release:source`. Import/ts-standards scans use `AE_SCAN_MODE=clean` vs `fixtures`.
- Papercuts: `npm run papercut -- -m <model> "message"` → `PAPERCUTS.md` (`tools/dev/papercut.mjs`).

**Production:**
- Hosting: Vercel Node 22 (`preset: 'vercel'`). Canonical production origin used by CI: `https://agentic-economy-phi.vercel.app` (`.github/workflows/kernel-release-gate.yml`).
- CI has no deploy step: `source-proof` validates the deployment manifest for development and runs conformance/lint/typecheck/unit/integration/types/imports/ts-standards/seo/ui-contract/eval-report/build without production credentials. The `live-gateway-proof` job runs only on `workflow_dispatch` with explicit spend confirmation (prepare/complete stages, USD 6.00 cap) against the production environment; Convex functions deploy outside CI (Convex CLI/dashboard with `CONVEX_DEPLOY_KEY`).
- x402 payer custody is CDP-based in production: the raw-key names `AE_X402_PAYMENT_CREDENTIAL_REF` / `AE_X402_PAYMENT_PRIVATE_KEY` are forbidden in production and required only for local/dev signing paths.
- Observability is optional and fail-open (`src/lib/observability/config.ts`); disable via `AE_DISABLE_OBSERVABILITY` / `VITE_AE_DISABLE_OBSERVABILITY`. CSP lives in `src/lib/http/security-headers.ts`; toggle report-only with `AE_CSP_REPORT_ONLY`.

**Prescriptive notes for new code:**
- Add public machine operations as `defineAction` modules (`src/modules/common/action.ts`) and register them in `src/modules/actions/index.ts`. Do not invent a parallel HTTP contract that bypasses `/api/v1/operations/call` for paid work.
- Call language models only through `src/modules/model-gateway/public.ts`.
- Keep secrets off `VITE_` prefixes except the documented publishable keys (`VITE_CLERK_PUBLISHABLE_KEY`, `VITE_STRIPE_PUBLISHABLE_KEY`, `VITE_SENTRY_DSN`, `VITE_POSTHOG_KEY`, `VITE_GOOGLE_MAPS_API_KEY`).
- New env names must be added to the closed deployment catalog in `src/lib/deployment/manifest.ts` or validation fails.
- Pin Node 22; do not target Edge runtimes for webhook or signature routes; do not run Convex `"use node"` files under Node 25.
- x402 spending in production goes through CDP custody (`src/modules/capability-supply/internal/cdp-x402-payment-signer.ts`); keep the raw-key signer confined to dev/test paths.
- Do not revive Convex HTTP `/mcp` or `/v1/*` routing paths in `convex/http.ts`.
- UI primitives go in `src/components/ui/` following `components.json` (New York, lucide). Product surfaces go in `src/components/ae/`.

---

*Stack analysis: 2026-08-21*
