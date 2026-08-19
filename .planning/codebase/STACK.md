# Technology Stack

**Analysis Date:** 2026-08-19

Agentic Economy is a Convex + TanStack Start market for agent-invoked operations. Public inventory is **14 MCP-exposed actions** (`listMcpActions()` in `src/modules/actions/index.ts`) and **60 Convex tables** (`defineTable` entries composed by `convex/schema.ts`). `/api/v1/operations/call` (`src/routes/api.v1.operations.call.ts`) is the paid door; MCP (`src/routes/mcp.ts`), CLI (`tools/ae/cli.ts`), and chat (`src/routes/api.answer.turn.ts`) are thin adapters over the same action registry. Live money is fail-closed (`LIVE_MONEY_GATE_POLICY` in `src/modules/money/internal/live-money-gate.ts`).

Package identity: `agentic-economy` `0.1.0`, `private`, `"type": "module"`, `"sideEffects": false` (`package.json`).

## Languages

**Primary:**
- TypeScript 6.0.3 (`typescript` in `package.json`) — application, Convex functions, tests, CLI, eval, and release tools. `tsconfig.json` targets `ES2022`, libs `DOM` + `DOM.Iterable` + `ES2024`, `module`/`moduleResolution` `ESNext`/`Bundler`, `jsx` `react-jsx`, `strict` plus `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `useUnknownInCatchVariables`, `noImplicitOverride`. `ignoreDeprecations` is `"6.0"`. `allowJs` is false. `noEmit` true. `isolatedModules` true. `skipLibCheck` true. `types`: `vite/client`, `node`. Include: `src/**`, `convex/**`, `tests/**`, plus root Vite/Vitest/Playwright configs. Exclude: `node_modules`, `dist`, `convex/_generated`.
- TSX / React 19.2.7 (`react`, `react-dom`, `@types/react` 19.2.7, `@types/react-dom` 19.2.3) — UI in `src/routes/`, `src/components/ae/`, `src/components/ui/`, `src/components/ai-elements/`.

**Secondary:**
- JavaScript (ESM, `"type": "module"`) — Node scripts under `tools/`, `eval/`, `scripts/`. Examples: `tools/dev/local-dev.mjs`, `tools/dev/papercut.mjs`, `tools/dev/run-with-cleanup.mjs`, `tools/release/kernel-retirement-manifest.mjs`, `eval/parity/check-parity.mjs`, `scripts/audit-action-surfaces.mjs`.
- YAML — Promptfoo eval config `eval/answer/promptfooconfig.yaml`; GitHub Actions `.github/workflows/kernel-release-gate.yml`, `.github/workflows/react-doctor.yml`.
- CSS — Tailwind 4 entry `src/styles/globals.css` importing `src/styles/base.css` and `tw-animate-css` (`tw-animate-css` 1.4.0). `@source not "../../.planning"` keeps planning files out of the Tailwind scan.
- Markdown — agent skill route `src/routes/SKILL[.]md.ts` registered in Nitro as `/SKILL.md`. Discovery files `src/routes/llms[.]txt.ts`, `src/routes/robots[.]txt.ts`, `src/routes/sitemap[.]xml.ts`.

Path aliases in `tsconfig.json`: `@/*` and `~/*` → `src/*`; operator route remaps `@/routes/owner.*`, `@/routes/admin.*`, `@/routes/developers.discovery` → `src/routes/_operator/…`. Convex tsconfig `convex/tsconfig.json` maps `@/*` to `src/*` with `baseUrl` `..`, target `ESNext`, lib `ES2024`. CLI tsconfig `tools/tsconfig.json` extends the root config for `tools/ae/**/*.ts`. Vitest repeats the `@` → `src` alias so CLI modules resolve under tests (`vitest.config.ts`).

Use `defineAction` / Zod schemas in TypeScript. Do not add JavaScript application modules under `src/`. Keep Convex generated files out of hand edits (`convex/_generated/`).

## Runtime

**Environment:**
- Node.js 22.x (`engines.node` in `package.json`, `.nvmrc` is `22`, deployment manifest `runtime.nodeMajor: 22` / `engine: nodejs22.x` in `src/lib/deployment/manifest.ts`). Incompatible majors fail `validateDeploymentManifest` with `node_runtime_incompatible`.
- Vercel Node serverless via Nitro (`nitro({ preset: 'vercel', vercel: { entryFormat: 'node', functions: { runtime: 'nodejs22.x' } } })` in `vite.config.ts`). Not Edge: webhook routes need raw `Request` bodies and Node/WebCrypto signature verification.
- Dev server: Vite on port 3000, host `127.0.0.1` (`npm run dev` → `vite dev --host 127.0.0.1`). Watch ignores `test-results/`, `playwright-report/`, `.output/`. `allowedHosts` includes a Tailscale hostname.
- Playwright local e2e uses port 3020 (`playwright.config.ts`). Paid-operation browser fixture uses port 3021 and `tools/dev/paid-operation-browser/vite.config.ts` (`playwright.paid-operation.config.ts`).
- Convex backend runtime for queries/mutations/internal mutations/actions/crons/workpools (`convex/` plus module schemas under `src/modules/*/internal/`). HTTP on Convex is retired (`convex/http.ts`).

**Package Manager:**
- npm 11.5.1 (`packageManager` in `package.json`; CI pins `npm install --global npm@11.5.1` in `.github/workflows/kernel-release-gate.yml`).
- Lockfile: `package-lock.json` present. CI uses `npm ci`. Hosted jobs use `npm ci --ignore-scripts` so install lifecycle cannot read production secrets (react-doctor secret-boundary).
- Overrides in `package.json`: `@opentelemetry/exporter-trace-otlp-http` `0.219.0`; `shiki`, `@shikijs/types`, `@shikijs/core`, `@shikijs/langs`, `@shikijs/themes`, `@shikijs/engine-javascript`, `@shikijs/engine-oniguruma` all `^3.23.0`.

## Frameworks

**Core:**
- TanStack Start 1.168.26 (`@tanstack/react-start`) — SSR/server functions, request middleware in `src/start.ts` (`createStart`), file routes under `src/routes/`, generated tree `src/routeTree.gen.ts`. Middleware order: request correlation → API request boundary (`src/lib/server/api-request-boundary.ts`) → observability → security headers (`src/lib/http/security-headers.ts`) → agent content negotiation (`src/lib/http/agent-content-negotiation.ts`) → CSRF (`createCsrfMiddleware`, serverFn only) → source-write admission → Clerk (`clerkMiddleware()`, omitted when local e2e bypass is on).
- TanStack Router 1.170.16 (`@tanstack/react-router`) — `src/router.tsx` (`createRouter`, `defaultPreload: 'intent'`, `defaultPendingMs: 150`, view transitions, scroll restoration, `AeNotFound` from `src/components/ae/layout/AeNotFound`).
- Convex 1.42.0 (`convex`) — schema `convex/schema.ts`, auth `convex/auth.config.ts`, app components `convex/convex.config.ts`, HTTP router `convex/http.ts` (retired v1 routing paths only), crons `convex/crons.ts`. Server seam `src/lib/server/convex-source.ts` (`ConvexHttpClient`, `anyApi` / `makeFunctionReference`).
- Clerk TanStack Start SDK 1.4.9 (`@clerk/tanstack-react-start`) — `clerkMiddleware()` in `src/start.ts`, `ClerkProvider` in `src/routes/__root.tsx`, sign-in/up `src/routes/sign-in.$.tsx` / `src/routes/sign-up.$.tsx`. Vite `optimizeDeps.include` lists `@clerk/backend`, `@clerk/react`, `@clerk/shared/*`.
- Vercel AI SDK `ai` ^7.0.44 plus `@openrouter/ai-sdk-provider` ^3.0.0 — single model seam `src/modules/model-gateway/public.ts` (`createOpenRouter`, `wrapLanguageModel` + `addToolInputExamplesMiddleware`). Streaming UI messages on `src/routes/api.answer.turn.ts` via `createUIMessageStream` / `createUIMessageStreamResponse`.
- Zod 4.4.3 — action/input/output contracts, money amounts, live-money gate, deployment field validation. MCP host uses SDK zod-compat parsers in `src/lib/server/mcp-api.ts`.
- Tailwind CSS 4.3.1 + `@tailwindcss/vite` 4.3.1 — `src/styles/globals.css`; shadcn New York style via `components.json` (`rsc: false`, lucide icons, aliases `@/components`, `@/components/ui`, `@/lib/utils`).
- Radix UI (`radix-ui` ^1.6.7) + `class-variance-authority` ^0.7.1 + `clsx` 2.1.1 + `tailwind-merge` 3.6.0 — primitives in `src/components/ui/` (button, dialog, sheet, sidebar, command, table, and related).
- MCP SDK 1.30.0 (`@modelcontextprotocol/sdk`) — inbound host `src/lib/server/mcp-api.ts` (`McpServer`, `WebStandardStreamableHTTPServerTransport`); outbound provider client in `src/modules/capability-supply/route-transport-runtime.ts`.
- x402 2.18.0 (`@x402/core`, `@x402/evm`, `@x402/extensions`) + viem 2.55.2 — paid provider settlement in `src/modules/capability-supply/internal/x402-payment-signer.ts` (`ExactEvmScheme`, `privateKeyToAccount`).
- Stripe ^22.5.0 (`stripe`) + `@stripe/stripe-js` ^9.13.0 + `@stripe/react-stripe-js` ^6.8.1 — money provider `src/lib/server/stripe-money-provider.ts`, webhook `src/routes/api.stripe.webhook.ts`.

**Testing:**
- Vitest 4.1.9 (`vitest.config.ts`) — Node environment, includes `tests/**/*.test.ts(x)` and `convex/**/*.test.ts`, setup files `tests/setup/web-storage.ts`, `tests/setup/no-search-gap-writes.ts`, `tests/setup/jsdom-platform.ts`, `tests/setup/http-rate-limit.ts`. `globals: false`. `watch: false`.
- Playwright 1.61.1 — e2e `playwright.config.ts` (`tests/e2e`, compact 375×812 + wide 1440×1100 Chromium, CI retries 2, github+html reporters on CI); deploy smoke `playwright.deploy-smoke.config.ts` (`tests/deploy-smoke`, JSON to `output/release/playwright-deploy-smoke.json`); paid-operation surface `playwright.paid-operation.config.ts`.
- Testing Library 16.3.2 (`@testing-library/react`) + jsdom 29.1.1.
- convex-test ^0.0.54 — Convex function tests (example `tests/unit/schema/convex-schema.test.ts`).
- Promptfoo ^0.121.17 — `eval/answer/promptfooconfig.yaml`; home dir `.promptfoo-home` (gitignored). Scripts: `test:eval`, `test:eval:coverage`, `test:eval:report`, `test:eval:validate`.
- Braintrust 3.27.0 — `eval/braintrust/answer.eval.ts` (`npm run test:eval:braintrust:local` / `:remote`). Default project `Agentic Economy`, dataset `ae-answer-reviewed`.
- oxlint ^1.73.0 — `npm run lint` (`oxlint src convex tests tools --deny-warnings`); config `.oxlintrc.json` (correctness as error; typescript+oxc plugins; ignore `convex/_generated/**`, `tests/fixtures/**`, `vendor/**`).
- react-doctor ^0.7.7 — `npm run doctor`; advisory CI `.github/workflows/react-doctor.yml` (`millionco/react-doctor@v2`, `blocking: none`).

**Build/Dev:**
- Vite 8.1.0 (`vite.config.ts`) with `@vitejs/plugin-react` 6.0.3, `tanstackStart()`, `nitro()`, `tailwindcss()`, optional `@sentry/vite-plugin` ^5.3.0. `resolve.tsconfigPaths: true`. Sourcemaps only when Sentry plugin is enabled.
- Nitro (`nitro-nightly@^3.0.1-20260628-090458-3df69609`) — Vercel Node adapter; extra route `/SKILL.md` → `src/routes/SKILL[.]md.ts`.
- tsx ^4.20.5 — CLI (`npm run ae` → `tsx tools/ae/cli.ts`) and release/eval scripts.
- `@types/node` 24.10.2.

## Key Dependencies

**Critical:**
- `convex` 1.42.0 — source of record. HTTP client seam `src/lib/server/convex-source.ts` (`ConvexHttpClient`, Clerk JWT template or `AE_CONVEX_SERVER_FUNCTION_TOKEN` via `createConvexServerFunctionAssertion`).
- `@clerk/tanstack-react-start` 1.4.9 — human sessions and Clerk API-key agent access (`auth({ acceptsToken: 'api_key' })` in `src/lib/server/agent-access-auth.ts`). Convex JWT issuer `CLERK_JWT_ISSUER_DOMAIN` / `applicationID: 'convex'` in `convex/auth.config.ts`.
- `ai` ^7.0.44 + `@openrouter/ai-sdk-provider` ^3.0.0 + `@ai-sdk/provider-utils` ^5.0.16 — OpenRouter is the only language-model gateway (`DEFAULT_OPENROUTER_MODEL` `deepseek/deepseek-v4-flash` in `src/modules/model-gateway/public.ts`). Used by `src/modules/answer/internal/answer-tool-use-agent.ts`, `src/modules/answer/internal/answer-query-safety.ts`, `src/modules/storefront/internal/business-enrichment.ts`. Do not open a parallel HTTP client to a model vendor.
- `@tanstack/ai` ^0.38.0 — `convertSchemaToJsonSchema` for action JSON Schema (`src/modules/registry/operation-action-contracts.ts`, `src/modules/answer/internal/action-to-tool-spec.ts`, `src/modules/harness/harness.schema.ts`).
- `@modelcontextprotocol/sdk` 1.30.0 — MCP host at `/mcp`; anonymous tools are read-only; authenticated tools include `operation.invoke` and supply management. Server name `agentic-economy` version `1.0.0` in `src/lib/server/mcp-api.ts`.
- `stripe` ^22.5.0 — Checkout credit top-up, Connect onboarding, payout transfers, webhook ingest. `maxNetworkRetries: 0`. Live first-dollar spend is refused until counsel signoffs close (`src/modules/money/internal/live-money-gate.ts`).
- `@x402/core` / `@x402/evm` / `@x402/extensions` 2.18.0 + `viem` 2.55.2 — Exact EVM scheme signing and settlement headers for x402 publications.
- `@convex-dev/workpool` ^0.4.9 — `convex/marketDispatchWorkpool.ts` (`maxParallelism: 32`, retry 3 attempts, 1s backoff ×2). Workers: `convex/capabilityOperationInvocationWorker.ts`.
- `@convex-dev/rate-limiter` ^0.3.2 — HTTP admission `convex/rateLimit.ts` / `src/lib/server/rate-limit.ts` (`public-read`, `public-mutation`, `oauth-issuance`, `answer-turn-submit`, `answer-follow-up-chips`, `answer-stream`, `inquiry-submit`, `dispute-open`).
- `@convex-dev/workflow` ^0.4.4 — registered in `convex/convex.config.ts`; listed as a deployment resource even when not imported from app modules.
- `@convex-dev/aggregate` ^0.2.2 — named component `ownerActivationByStage` in `convex/convex.config.ts`.
- `zod` 4.4.3 — runtime contracts across actions, money, deployment manifest.
- `http-message-sig` 0.2.0 — RFC 9421 signatures for source-write admission (`src/modules/security/source-write-admission.ts`) and WBA directory `src/routes/[.]well-known/http-message-signatures-directory.ts`.
- `@noble/hashes` 1.8.0 / `@noble/curves` 1.9.1 — HMAC-SHA256 route-call signing (`src/modules/capability-supply/internal/route-call-signing.ts`), HKDF source-write keys, Ed25519 attestation (`src/modules/common/ed25519-attestation.ts`).
- `@sentry/node` / `@sentry/react` ^10.63.0 — `src/lib/observability/sentry.server.ts`, `src/lib/observability/sentry.client.ts`. Production traces sample rate 0.1.
- `posthog-js` ^1.398.2 / `posthog-node` ^5.39.0 — `src/lib/observability/posthog.client.ts`, `src/lib/observability/posthog.server.ts`. Default host `https://us.i.posthog.com` (`src/lib/observability/config.ts`).
- `openapi-fetch` 0.17.0 — OpenAPI HTTP JSON transport serialization in `src/modules/capability-supply/route-transport-runtime.ts` and `src/modules/capability-execution/operation-execute.functions.ts`.
- `@cfworker/json-schema` 4.1.1 — capability contract validation (`src/modules/capability-contract/public.ts`).
- `@apidevtools/json-schema-ref-parser` ^11.0.0 — schema `$ref` deref (`src/modules/capability-supply/internal/schema-deref.ts`).
- `undici` 7.28.0 — storefront HTTP agent (`src/modules/storefront/server.ts`).

**Infrastructure / UI:**
- `@react-email/components` ^1.0.12 + `@react-email/render` ^2.1.0 — work-tree memo HTML (`src/modules/work-tree/internal/memo.tsx`).
- `graphology` ^0.26.0 + `graphology-dag` ^0.4.1 + `@flatten-js/interval-tree` ^2.0.3 — work-tree CPM/rollup (`src/modules/work-tree/internal/cpm.ts`, `src/modules/work-tree/internal/rollup.ts`). Vite 8 CJS optimize-deps workaround in `vite.config.ts` (graphology ESM `import(...)` method).
- `xstate` ^5.32.5 — study RFX machine (`src/modules/study/internal/rfx-machine.ts`); study Convex tables are unlisted (`src/modules/study/internal/convex-schema.ts` exports `{}`).
- `shiki` ^3.23.0 — code highlighting (`src/components/ai-elements/code-block.tsx`).
- `lucide-react` ^1.21.0, `motion` ^12.42.0, `sonner` ^2.0.7 (toaster in `src/routes/__root.tsx`), `cmdk` ^1.1.1, `thinking-orbs` ^0.2.0 (`src/components/ae/magic/MagicOrb.tsx`), `react-arborist` ^3.16.0, `@tanstack/react-table` ^8.21.3, `use-stick-to-bottom` ^1.1.6.
- `date-fns` ^4.4.0, `es-toolkit` ^1.50.0, `nanoid` ^5.1.16, `yaml` 2.9.0, `@sindresorhus/slugify` ^3.0.0, `fastest-levenshtein` ^1.0.16.
- `@shadcn/react` ^0.3.0 — CLI companion to `components.json`.

**Exact `package.json` versions (copy these; do not invent ranges):**

Runtime: `@ai-sdk/provider-utils` ^5.0.16, `@apidevtools/json-schema-ref-parser` ^11.0.0, `@cfworker/json-schema` 4.1.1, `@clerk/tanstack-react-start` 1.4.9, `@convex-dev/aggregate` ^0.2.2, `@convex-dev/rate-limiter` ^0.3.2, `@convex-dev/workflow` ^0.4.4, `@convex-dev/workpool` ^0.4.9, `@flatten-js/interval-tree` ^2.0.3, `@modelcontextprotocol/sdk` 1.30.0, `@noble/curves` 1.9.1, `@noble/hashes` 1.8.0, `@openrouter/ai-sdk-provider` ^3.0.0, `@react-email/components` ^1.0.12, `@react-email/render` ^2.1.0, `@sentry/node` ^10.63.0, `@sentry/react` ^10.63.0, `@shadcn/react` ^0.3.0, `@sindresorhus/slugify` ^3.0.0, `@stripe/react-stripe-js` ^6.8.1, `@stripe/stripe-js` ^9.13.0, `@tanstack/ai` ^0.38.0, `@tanstack/react-router` 1.170.16, `@tanstack/react-start` 1.168.26, `@tanstack/react-table` ^8.21.3, `@x402/core` 2.18.0, `@x402/evm` 2.18.0, `@x402/extensions` 2.18.0, `ai` ^7.0.44, `class-variance-authority` ^0.7.1, `clsx` 2.1.1, `cmdk` ^1.1.1, `convex` 1.42.0, `date-fns` ^4.4.0, `es-toolkit` ^1.50.0, `fastest-levenshtein` ^1.0.16, `graphology` ^0.26.0, `graphology-dag` ^0.4.1, `http-message-sig` 0.2.0, `lucide-react` ^1.21.0, `motion` ^12.42.0, `nanoid` ^5.1.16, `openapi-fetch` 0.17.0, `posthog-js` ^1.398.2, `posthog-node` ^5.39.0, `radix-ui` ^1.6.7, `react` 19.2.7, `react-arborist` ^3.16.0, `react-dom` 19.2.7, `shiki` ^3.23.0, `sonner` ^2.0.7, `stripe` ^22.5.0, `tailwind-merge` 3.6.0, `thinking-orbs` ^0.2.0, `tw-animate-css` 1.4.0, `undici` 7.28.0, `use-stick-to-bottom` ^1.1.6, `viem` 2.55.2, `xstate` ^5.32.5, `yaml` 2.9.0, `zod` 4.4.3.

Dev: `@playwright/test` 1.61.1, `@sentry/vite-plugin` ^5.3.0, `@tailwindcss/vite` 4.3.1, `@testing-library/react` 16.3.2, `@types/node` 24.10.2, `@types/react` 19.2.7, `@types/react-dom` 19.2.3, `@vitejs/plugin-react` 6.0.3, `braintrust` 3.27.0, `convex-test` ^0.0.54, `jsdom` 29.1.1, `nitro` `npm:nitro-nightly@^3.0.1-20260628-090458-3df69609`, `oxlint` ^1.73.0, `promptfoo` ^0.121.17, `react-doctor` ^0.7.7, `tailwindcss` ^4.3.1, `tsx` ^4.20.5, `typescript` 6.0.3, `vite` 8.1.0, `vitest` 4.1.9.

## Configuration

**Environment:**
- Closed catalog lives in `src/lib/deployment/manifest.ts` (`DEPLOYMENT_MANIFEST` schema `ae.deployment-manifest:v1`, `validateDeploymentManifest`). Unknown `AE_*` / `VITE_AE_*` names fail validation. Production requires Node 22, HTTPS canonical origin, Convex URL, Clerk live keys, OpenRouter, seven source-write family keys, x402 custody, and Stripe.
- Readiness probes: `GET/HEAD /api/health` (`src/routes/api.health.ts`), `GET/HEAD /api/ready` (`src/routes/api.ready.ts` + `src/lib/server/readiness.ts`), `GET /api/v1/release` (`src/routes/api.v1.release.ts`). Verify locally with `npm run verify:deployment-manifest`.
- Convex dashboard env (declared in `convex/convex.config.ts`): `OPENROUTER_API_KEY`, `AE_CUSTOMER_REQUEST_MODEL`, `AE_SITE_URL`, `AE_RELEASE_SOURCE_REVISION`, `CLERK_JWT_ISSUER_DOMAIN`, `AE_CONVEX_SERVER_FUNCTION_TOKEN`, `AE_ROUTE_CALL_SIGNING_SECRET`, `AE_ROUTE_CALL_SIGNING_KEY_ID`, `AE_X402_RPC_URLS_JSON`.
- `.env` / `.env.*` are gitignored. `.env.example` exists (allowlisted in `.gitignore`) — note existence only; do not copy values from env files.
- `.clerk/` and `.vercel/` are gitignored (may contain secrets). Convex snapshot zips (`*.convex-export.zip`) are forbidden in git. Other gitignored runtime dirs: `.output/`, `.vinxi/`, `.tanstack/`, `.promptfoo-home/`, `.react-doctor/`, `output/`, `playwright-report/`, `test-results/`, `/.ae-cli/`.

**Required production groups** (names only; see `src/lib/deployment/manifest.ts`):
- Canonical origin: `AE_CANONICAL_BASE_URL` or `AE_CANONICAL_HOST_ALLOWLIST` (`src/lib/server/canonical-url.ts`).
- Convex: `CONVEX_URL` or `VITE_CONVEX_URL` (must match if both set); `AE_CONVEX_SERVER_FUNCTION_TOKEN`.
- Clerk: `VITE_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `CLERK_JWT_ISSUER_DOMAIN` (production keys must be `pk_live_` / `sk_live_`).
- Model gateway: `OPENROUTER_API_KEY`.
- Source-write families: `AE_SOURCE_WRITE_KEY_{INQUIRY,BILLING,PROTECTED,CLAIM,OPERATOR,REPAIR,SESSION}` (`SOURCE_WRITE_FAMILIES` in the manifest).
- x402: `AE_X402_PAYMENT_CREDENTIAL_REF` (must equal `env:AE_X402_PAYMENT_PRIVATE_KEY`), `AE_X402_PAYMENT_PRIVATE_KEY`, `AE_X402_RPC_URLS_JSON` (map of `eip155:<id>` → URL, max 32 entries).
- Stripe: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `VITE_STRIPE_PUBLISHABLE_KEY`.

**Forbidden in production:** `AE_SOURCE_WRITE_SECRET`, `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E`, `AE_ANSWER_EVAL_REGISTRY_SEED`, `AE_DEV_WBA_SMOKE_ENABLED`, `AE_DEV_WBA_SMOKE_SECRET`, `AE_DEV_WBA_SIGNATURE_AGENT`, `AE_LOCAL_DEV_VITE_ARGS`, `CONVEX_SELF_HOSTED_ADMIN_KEY`, `AE_API_KEY`.

**Build:**
- `vite.config.ts` — plugins, Nitro Vercel Node preset, Clerk optimizeDeps includes, graphology CJS esbuild plugin, Sentry sourcemaps when `SENTRY_AUTH_TOKEN` + `SENTRY_ORG` + `SENTRY_PROJECT` are set.
- `tsconfig.json`, `convex/tsconfig.json`, `tools/tsconfig.json`.
- `vitest.config.ts`, `playwright.config.ts`, `playwright.deploy-smoke.config.ts`, `playwright.paid-operation.config.ts`.
- `.oxlintrc.json`, `components.json`.
- No root `vercel.json`; Nitro emits the Vercel function bundle under `.vercel/` (gitignored).
- `package.json` `"sideEffects": false`.

**Public machine contract:**
- Action registry `src/modules/actions/index.ts`. Quarantine prefixes `customerRequest.`, `inquiry.`, `study.`, `workTree.` (`src/modules/product-frontier/quarantine-write-admission.ts`) are unlisted from `listActions()`; they remain findable via `findAction`. HTTP/MCP tombstones return 410 except `inquiry.readCustomerRecord`. Writes on quarantined families return 403 `quarantine_writes_frozen` and point at `/api/v1/operations/call`.
- Public MCP tool names (exactly 14): `ae_registry_search`, `ae_registry_detail`, `ae_registry_operations_search`, `ae_registry_operations_detail`, `ae_registry_operations_compare`, `ae_registry_operations_inspectPlan`, `ae_operation_execute`, `ae_operation_invoke`, `ae_operation_status`, `ae_operation_cancel`, `ae_operation_reconcile`, `ae_supply_publish`, `ae_supply_withdraw`, `ae_supply_earnings` (`tests/unit/actions/registry.test.ts`).
- Paid invoke contract `src/modules/capability-execution/operation-invoke-entry.ts`: `POST /api/v1/operations/call` (`operation.invoke:v1`), `GET /api/v1/operations/{invocationRef}` (`operation.status:v1`), `POST …/cancel`, `POST …/reconcile`. Legacy alias `/api/v1/operations/execute` (`src/routes/api.v1.operations.execute.ts`). Keyless MCP execute is `operation.execute` (`src/modules/capability-execution/operation-execute-mcp.actions.ts`) and is fail-closed to published keyless HTTP JSON ops (`convex/capabilitySupplyOperations.ts`).

**Convex tables (60 `defineTable` entries in `convex/schema.ts`):**
- Catalog / business: `owners`, `businesses` (`src/modules/business/internal/schema.ts`); `businessOfferings`, `businessOfferingRevisions`, `offeringAccessPaths` (`src/modules/catalog/internal/schema.ts`).
- Money (15): `moneyAccounts`, `moneyLedgerEntries`, `moneyTransactions`, `moneyUsageEvents`, `moneyCredentialBudgetStates`, `moneyExternalSpendReservations`, `moneyX402PaymentAttempts`, `moneyCredentialUsageSummaries`, `qualifiedUseReceipts`, `moneyTopupCommands`, `moneyStripeEvents`, `moneyPayoutAccounts`, `moneyPayouts`, `moneyPayoutAllocations` (`src/modules/money/internal/convex-schema.ts`).
- Capability: `capabilityPublications`, `capabilityOfferings`, `capabilityTransportBindings`, `capabilityProviderConnections`, `capabilityProviderConnectionLeases`, `capabilityProviderApprovals`, `registeredOperationMappings` (`src/modules/capability-supply/internal/convex-schema.ts`); `capabilityContractDocuments`; `capabilityOperationInvocations`.
- Agent access: `agentAccessPrincipals`, `agentAccessGrants`.
- Inquiries (12): `capabilityLaunchSupportRecords`, `inquiryThreads`, `inquiryCustomerAccessGrants`, `inquiryMessages`, `inquiryNotifications`, `inquiryReadStates`, `inquiryAbuseBuckets`, `inquiryPrivacyTombstones`, `governedSendReceipts`, `governedSendIntegrityCommitments`, `governedSendReceiptKeys`, `governedSendErasureLineage`.
- Answer: `answerThreads`, `answerTurns`, `answerTurnReservations`, `answerToolCalls`, `answerThreadShares`.
- Harness / invocation / external-run: `harnessSessions`, `harnessSessionEntries`; `actionInvocationControls`, `actionInvocationAttempts`, `actionInvocationHistory`; `externalRunManifests`, `externalRunStarts`, `externalRunEvidence`, `externalRunGateDecisions`.
- Other: `registrySearchDocuments`, `operationKeys`, `disputes`, `sourceWriteNonces`.
- Empty spreads (unlisted): `demandTables`, `discoveryTables`, `settingsTables`, `projectSpineTables`, `workTreeTables`, `studyTables`, `routingKernelTables`, `agentAccessOAuthTables`.

**Crons** (`convex/crons.ts`): `refresh capability supply readiness` every 1 minute (`internal.capabilitySupply.scheduleDueCapabilityProbes`); `cleanup expired inquiry abuse buckets`, `cleanup expired source write nonces`, `cleanup expired OAuth grants` hourly; `run daily supplier settlement` cron `0 0 * * *` (`internal.moneyLedger.runDailySupplierSettlement`).

**CLI** (`tools/ae/cli.ts`, `npm run ae --`): `manifest`, `search`, `inspect`, `compare`, `inspect-plan`, `connect`, `invoke`, `status`, `recover`, `demand ask|business|discover|enrich|import|journey|request`, `advanced action|actions|cancel|doctor|eval|policy`. Command files: `tools/ae/commands/manifest.ts`, `search.ts`, `inspect.ts`, `compare.ts`, `inspect-plan.ts`, `connect.ts`, `invoke.ts`, `status.ts`, `recover.ts`, `ask.ts`, `business.ts`, `discover.ts`, `enrich.ts`, `import.ts`, `journey.ts`, `request.ts`, `actions.ts`, `cancel.ts`, `doctor.ts`, `eval.ts`, `policy.ts`. `--json` emits one machine-readable value. Invoke/cancel/reconcile require `--idempotency-key`. Base URL from `--base-url` / `AE_CLI_BASE_URL` / `AE_CANONICAL_BASE_URL`.

**HTTP API file routes (TanStack Start, under `src/routes/`):**
- Paid door and recovery: `api.v1.operations.call.ts`, `api.v1.operations.execute.ts` (legacy), `api.v1.operations.$invocationRef.ts`, `api.v1.operations.$invocationRef.cancel.ts`, `api.v1.operations.$invocationRef.reconcile.ts`.
- Market reads: `api.v1.market-operations.search.ts`, `api.v1.market-operations.detail.ts`, `api.v1.market-operations.compare.ts`, `api.v1.market-operations.inspect-plan.ts`, `api.v1.services.ts`, `api.v1.services.search.ts`, `api.v1.services.$serviceId.ts`.
- Customer request v1: `api.v1.requests.ts`, `api.v1.requests.schema.ts`, `api.v1.requests.$requestRef.ts` and nested `messages`, `facts`, `options`, `run`, `confirmation`, `cancellation`, `evidence`, `problems`, `repeat-permissions` routes. Parallel non-v1 `api.requests.*` remain for the same lifecycle.
- Chat: `api.answer.turn.ts`, `api.answer.turn.stop.ts`, `api.answer.threads.ts`, `api.answer.threads.$threadId.ts`, `api.answer.threads.$threadId.share.ts`, `api.answer.eval-status.ts`.
- Discovery/business: `api.businesses.ts`, `api.businesses.search.ts`, `api.businesses.$slug.ts`, `api.discovery.schema.ts`, `api.discovery.examples.ts`, `api.storefront.enrich.ts`, `api.storefront.import-draft.ts`.
- Work-tree agent: `api.v1.work-tree.$operation.ts`.
- Health/observability/money/notifications: `api.health.ts`, `api.ready.ts`, `api.v1.release.ts`, `api.observability.funnel.ts`, `api.observability.client-error.ts`, `api.stripe.webhook.ts`, `api.notification.resend-dispatch.ts`, `api.notification.resend-webhook.ts`, `api.notification.novu-dispatch.ts`.
- Catch-all: `api.$.ts`. MCP: `mcp.ts`. OAuth: `oauth.authorize.ts`, `oauth.token.ts`, `oauth.register.ts`. Well-known: `[.]well-known/oauth-authorization-server.ts`, `[.]well-known/oauth-protected-resource.ts`, `[.]well-known/http-message-signatures-directory.ts`, `[.]well-known/ucp.ts`.

**Convex module files (handlers, not generated):** `convex/schema.ts`, `convex/convex.config.ts`, `convex/auth.config.ts`, `convex/authz.ts`, `convex/http.ts`, `convex/crons.ts`, `convex/rateLimit.ts`, `convex/marketDispatchWorkpool.ts`, plus domain files `business.ts`, `catalog.ts`, `registry.ts`, `discovery.ts`, `demand.ts`, `inquiries.ts`, `answerThreads.ts`, `moneyLedger.ts`, `moneyX402PaymentAttempts.ts`, `capabilitySupply.ts`, `capabilitySupplyOperations.ts`, `capabilityOperationInvocations.ts`, `capabilityOperationInvocationWorker.ts`, `curatedProviders.ts`, `devSeed.ts`, `agentAccessPrincipals.ts`, `agentAccessPolicy.ts`, `agentAccessOAuth.ts`, `notificationOutbox.ts`, `observability.ts`, `security.ts`, `sourceWriteAdmission.ts`, `settings.ts`, `workTrees.ts`, `studies.ts`, `externalRuns.ts`, `harnessSessions.ts`, `actionInvocationControl.ts`, and matching `*Ports.ts` / `*Projection.ts` files. Generated output: `convex/_generated/` (do not hand-edit).

**npm script groups** (`package.json`): `dev` / `dev:local` / `build` / `typecheck` / `lint`; `test`, `test:unit`, `test:integration`, `test:e2e`, `test:e2e:a11y`, `test:e2e:paid-operation`, `test:types`, `test:imports`, `test:ts-standards`, `test:seo`, `test:ui-contract`, `test:eval*`, `test:conformance`, `test:release:source` / `:hosted`; smoke (`smoke:customer-request:*`, `smoke:gateway:production`, `smoke:work-tree:development`); evidence (`evidence:action-invocation:development`, `evidence:operation:development`, `evidence:bounded-mandate:development`, `evidence:full-yolo:development`); `seed:dev`; `papercut`; `parity:check`; `audit:actions`; `check:kernel-retirement`; `check:product-frontier`; `verify:deployment-manifest`; `gate:release`; `doctor`.

## Platform Requirements

**Development:**
- Node 22 (`nvm use` / `.nvmrc`).
- `npm ci` then `npm run dev:local` (`tools/dev/local-dev.mjs`) or `npm run dev`.
- Convex deployment URL in `CONVEX_URL` / `VITE_CONVEX_URL`. Optional local Clerk bypass `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E=true` (Playwright webServer sets this; forbidden in production).
- Seed: `npm run seed:dev` → `convex run devSeed:seedDevCatalog`. Curated publications: Exa (`agentic-market-exa`) + Frankfurter (`frankfurter-ecb-rates`) plus cluster A/B/C imports (`src/modules/dev/internal/curated-provider-publications.ts`). `DEV_SEED_BUSINESS_COUNT` is 20 (`src/modules/dev/internal/dev-seed-business-fixtures.ts`).
- CLI: `npm run ae -- <command>` (`tools/ae/cli.ts`). Market search is anonymous HTTP; invoke uses the authenticated gateway.
- Lint/typecheck: `npm run lint`, `npm run typecheck`, `npm run check:convex-codegen` (`convex codegen --dry-run --typecheck=disable`; Convex 1.42 still resolves deployment credentials with `--dry-run`).
- Tests: `npm test` (vitest via `tools/dev/run-with-cleanup.mjs`); `npm run test:e2e`; eval `npm run test:eval`. Release source gate `npm run test:release:source`. Import/ts-standards scans use `AE_SCAN_MODE=clean` vs `fixtures`.
- Papercuts: `npm run papercut -- -m <model> "message"` → `PAPERCUTS.md` (`tools/dev/papercut.mjs`).

**Production:**
- Hosting: Vercel Node 22 (`preset: 'vercel'`). Canonical production origin used by CI: `https://agentic-economy-phi.vercel.app` (`.github/workflows/kernel-release-gate.yml`).
- Convex production deploy via `npx convex deploy` with `CONVEX_DEPLOY_KEY`. Hosted proof seeds curated Frankfurter + Exa fixtures (`convex/curatedProviders.ts`) and retires legacy Exa v1 (`curatedProviders:retireLegacyExaV1`).
- Dual deploy: Vercel git-source (`tools/release/deploy-customer-request-git-source.ts`) plus exact-revision Convex functions. `AE_RELEASE_SOURCE_REVISION` is bound in production Convex. Hosted proof refuses a dirty checkout and requires Convex-side `AE_ROUTE_CALL_SIGNING_SECRET`, `AE_ROUTE_CALL_SIGNING_KEY_ID`, `AE_SITE_URL`.
- Live paid gateway smoke is opt-in `workflow_dispatch` only, fail-closed unless `AE_GATEWAY_SMOKE_CONFIRM_LIVE_SPEND=true` and a matching run ID; workflow copy caps external movement at USD 6.00. Prepare vs complete stages keep Checkout out of the automated first pass.
- Observability is optional and fail-open (`src/lib/observability/config.ts`); disabling via `AE_DISABLE_OBSERVABILITY` / `VITE_AE_DISABLE_OBSERVABILITY`. CSP in `src/lib/http/security-headers.ts` (Clerk, Convex, Stripe, PostHog, Sentry, Google Maps, Cloudflare challenges allowlists; `unsafe-inline` for Start hydration `<Scripts />` in `src/routes/__root.tsx`). Toggle report-only with `AE_CSP_REPORT_ONLY`.

**Prescriptive notes for new code:**
- Add public machine operations as `defineAction` modules (`src/modules/common/action.ts`) and register them in `src/modules/actions/index.ts`. Do not invent a parallel HTTP contract that bypasses `/api/v1/operations/call` for paid work.
- Call language models only through `src/modules/model-gateway/public.ts`.
- Keep secrets off `VITE_` prefixes except the documented publishable keys (`VITE_CLERK_PUBLISHABLE_KEY`, `VITE_STRIPE_PUBLISHABLE_KEY`, `VITE_SENTRY_DSN`, `VITE_POSTHOG_KEY`, `VITE_GOOGLE_MAPS_API_KEY`).
- New env names must be added to the closed deployment catalog in `src/lib/deployment/manifest.ts` or validation fails.
- Pin Node 22; do not target Edge runtimes for webhook or signature routes.
- Live money: do not add an env flag that opens first-dollar spend; the gate is source-owned policy in `src/modules/money/internal/live-money-gate.ts` (`policyId` `first-dollar-compliance-au`, revision `2026-08-01`).
- Do not revive Convex HTTP `/mcp` or `/v1/*` routing paths in `convex/http.ts`.
- UI primitives go in `src/components/ui/` following `components.json` (New York, lucide). Product surfaces go in `src/components/ae/`.

---

*Stack analysis: 2026-08-19*
