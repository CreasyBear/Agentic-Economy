# Technology Stack

**Analysis Date:** 2026-08-19

Bound to working tree at remap commit `7e067dfb`. Product inventory: **14 public actions**; **60 listed Convex tables**; inquiry 12 stay; `marketDispatchWorkpool` stays; Customer Request TypeScript module is absent; `customerRequest.*` HTTP surfaces are 410 tombstones only.

## Languages

**Primary:**
- TypeScript `6.0.3` (`package.json` `devDependencies.typescript`, `tsconfig.json`) — application, Convex functions, tests, CLI, and release tools. Compiler: `target` ES2022, `module` ESNext, `moduleResolution` Bundler, `strict` true, `exactOptionalPropertyTypes` true, `noUncheckedIndexedAccess` true. Path aliases `@/*` and `~/*` map to `src/*` in `tsconfig.json`.
- TSX / JSX (`"jsx": "react-jsx"` in `tsconfig.json`) — TanStack Start routes and React UI under `src/routes/`, `src/components/`.

**Secondary:**
- JavaScript / ESM (Node) — release and doctor scripts (`tools/dev/papercut.mjs`, `tools/release/product-frontier-manifest.mjs`, `tools/release/verify-kernel-retirement.mjs`). `"type": "module"` in `package.json`.
- CSS — Tailwind v4 via `tailwindcss` `^4.3.1` and `@tailwindcss/vite` `4.3.1`; global sheet `src/styles/globals.css`.
- YAML — Answer eval suite `eval/answer/promptfooconfig.yaml`.

## Runtime

**Environment:**
- Node.js `22.x` (`package.json` `engines.node`, `.nvmrc` `22`, deployment runtime `nodejs22.x` in `vite.config.ts` Nitro/Vercel block and `src/lib/deployment/manifest.ts` `DEPLOYMENT_MANIFEST.runtime`).
- Convex default V8 isolate for queries/mutations; Node Convex actions only in files that declare `"use node"` (`convex/_generated/ai/guidelines.md`).
- Browser: React 19 client bundle from Vite; Clerk and Stripe.js run in the browser.

**Package Manager:**
- npm `11.5.1` (`package.json` `packageManager`)
- Lockfile: present (`package-lock.json`)

## Frameworks

**Core:**
- TanStack Start `1.168.26` + TanStack React Router `1.170.16` (`package.json`) — SSR/server-function host and file routes under `src/routes/`. Boot middleware in `src/start.ts`.
- React `19.2.7` / React DOM `19.2.7` — UI. Root provider in `src/routes/__root.tsx`.
- Convex `1.42.0` — durable backend, schema, scheduled jobs, Workpool dispatch. Schema composition in `convex/schema.ts`; app components in `convex/convex.config.ts`.
- Clerk via `@clerk/tanstack-react-start` `1.4.9` — session/JWT identity. Middleware in `src/start.ts`; JWT issuer in `convex/auth.config.ts`.
- Vercel AI SDK `ai` `^7.0.44` + `@openrouter/ai-sdk-provider` `^3.0.0` — single model seam in `src/modules/model-gateway/public.ts`.
- Zod `4.4.3` — action/input schemas (`src/modules/actions/`, `src/modules/common/action`).
- Model Context Protocol SDK `@modelcontextprotocol/sdk` `1.30.0` — Streamable HTTP MCP host in `src/lib/server/mcp-api.ts` served at `src/routes/mcp.ts`.

**Testing:**
- Vitest `4.1.9` — unit, integration, types, imports, SEO, UI-contract (`vitest.config.ts`, `package.json` scripts).
- `convex-test` `^0.0.54` — Convex function tests (example: `tests/unit/schema/convex-schema.test.ts`).
- Playwright `@playwright/test` `1.61.1` — E2E (`playwright.config.ts`, `tests/e2e/`), deploy smoke (`playwright.deploy-smoke.config.ts`), paid-operation surface (`playwright.paid-operation.config.ts`).
- Promptfoo `^0.121.17` — Answer eval (`eval/answer/promptfooconfig.yaml`, `npm run test:eval`).
- Braintrust `3.27.0` — optional eval export (`eval/braintrust/answer.eval.ts`, CLI `tools/ae/commands/eval.ts`).
- Testing Library `@testing-library/react` `16.3.2` + jsdom `29.1.1`.

**Build/Dev:**
- Vite `8.1.0` — `vite.config.ts` (`npm run dev`, `npm run build`).
- Nitro (`nitro-nightly` `^3.0.1-20260628-090458-3df69609`) — Vercel Node serverless preset in `vite.config.ts` (`preset: 'vercel'`, `vercel.entryFormat: 'node'`, `functions.runtime: 'nodejs22.x'`).
- TypeScript `tsc --noEmit` (`npm run typecheck`); Convex codegen (`npm run check:convex-codegen`).
- oxlint `^1.73.0` — `npm run lint` with `.oxlintrc.json`.
- tsx `^4.20.5` — CLI and release tools (`npm run ae`, `tools/release/*`).
- react-doctor `^0.7.7` — `npm run doctor`; CI workflow `.github/workflows/react-doctor.yml`.
- Tailwind CSS `^4.3.1` + `tw-animate-css` `1.4.0`.

## Key Dependencies

**Critical:**
- `convex` `1.42.0` — listed schema (60 tables in `tests/unit/schema/convex-schema.test.ts` `durableTables`), mutations/queries/actions, crons in `convex/crons.ts`.
- `@convex-dev/workpool` `^0.4.9` — paid invoke dispatch. Keep `convex/marketDispatchWorkpool.ts` (`maxParallelism: 32`). Mounted in `convex/convex.config.ts`.
- `@convex-dev/workflow` `^0.4.4` — workflow component (example: `convex/projectSpine.ts`).
- `@convex-dev/rate-limiter` `^0.3.2` — HTTP/Convex admission in `convex/lib/rateLimit.ts`; HTTP wrapper `src/lib/server/rate-limit.ts`.
- `@convex-dev/aggregate` `^0.2.2` — mounted as `ownerActivationByStage` in `convex/convex.config.ts`.
- `@clerk/tanstack-react-start` `1.4.9` — auth. Convex JWT `applicationID: 'convex'` in `convex/auth.config.ts`; server token template `'convex'` in `src/lib/server/convex-source.ts`.
- `stripe` `^22.5.0`, `@stripe/stripe-js` `^9.13.0`, `@stripe/react-stripe-js` `^6.8.1` — credit top-up, Connect, webhooks. Provider `src/lib/server/stripe-money-provider.ts`; Checkout UI `src/components/ae/console/AeCreditTopUpPanel.tsx`.
- `@x402/core` `2.18.0`, `@x402/evm` `2.18.0`, `@x402/extensions` `2.18.0`, `viem` `2.55.2` — x402 exact-EVM payment custody and settlement. Signer `src/modules/capability-supply/internal/x402-payment-signer.ts`; receipt reader `src/modules/capability-supply/internal/x402-evm-receipt-reader.ts`. Attempts persist in listed table `moneyX402PaymentAttempts`.
- `ai` `^7.0.44` + `@openrouter/ai-sdk-provider` `^3.0.0` — Answer/harness LLM. Default model `deepseek/deepseek-v4-flash` in `src/modules/model-gateway/public.ts`.
- `@modelcontextprotocol/sdk` `1.30.0` — MCP adapter over the 14 public actions (`src/lib/server/mcp-api.ts`).
- `zod` `4.4.3` — contracts for the action plane (`src/modules/actions/index.ts`).
- `openapi-fetch` `0.17.0` — provider HTTP transport (`src/modules/capability-supply/route-transport-runtime.ts`).
- `@cfworker/json-schema` `4.1.1` + `@apidevtools/json-schema-ref-parser` `^11.0.0` — capability schema admission.
- `http-message-sig` `0.2.0` + `@noble/hashes` `1.8.0` / `@noble/curves` `1.9.1` — HTTP message signatures / WBA directory (`src/routes/[.]well-known/http-message-signatures-directory.ts`).

**Infrastructure:**
- `@sentry/node` `^10.63.0`, `@sentry/react` `^10.63.0`, `@sentry/vite-plugin` `^5.3.0` — error tracking (`src/lib/observability/sentry.server.ts`, `src/lib/observability/sentry.client.ts`, `vite.config.ts`).
- `posthog-js` `^1.398.2`, `posthog-node` `^5.39.0` — product analytics and measured businesses/services traffic (`src/lib/observability/posthog.server.ts`, `src/modules/product-frontier/business-services-policy.ts`).
- `radix-ui` `^1.6.7`, `@shadcn/react` `^0.3.0`, `class-variance-authority` `^0.7.1`, `tailwind-merge` `3.6.0`, `lucide-react` `^1.21.0`, `cmdk` `^1.1.1`, `sonner` `^2.0.7`, `motion` `^12.42.0` — UI kit.
- `xstate` `^5.32.5` — state machines where used in domain modules.
- `graphology` `^0.26.0` / `graphology-dag` `^0.4.1` — graph helpers (Vite CJS optimize in `vite.config.ts`).
- `undici` `7.28.0` — Node HTTP client where needed.
- `@react-email/components` `^1.0.12` / `@react-email/render` `^2.1.0` — email HTML for Resend dispatch.
- `yaml` `2.9.0`, `date-fns` `^4.4.0`, `nanoid` `^5.1.16`, `es-toolkit` `^1.50.0`.

**Public action plane (14):** `listActions()` in `src/modules/actions/index.ts` drops quarantine-family ids (`customerRequest.*`, `inquiry.*`, `study.*`, `workTree.*`) via `src/modules/product-frontier/quarantine-write-admission.ts`. The remaining inventory matches `.planning/evidence/product-frontier-baseline/product-frontier-manifest.json` `requiredActionIds`:

1. `registry.search` / `registry.detail` — `src/modules/registry/registry.actions.ts`
2. `registry.operations.search` / `detail` / `compare` / `inspectPlan` — `src/modules/registry/operations.actions.ts`
3. `operation.execute` (MCP + Answer; no HTTP invoke route) — `src/modules/capability-execution/operation-execute-mcp.actions.ts`
4. `operation.invoke` — paid door `POST /api/v1/operations/call` (`src/routes/api.v1.operations.call.ts`, `src/modules/capability-execution/operation-invoke-entry.ts`). This path is **not** deprecated. RFC 9745/8594 headers must never attach to `/call` (`src/modules/product-frontier/deprecation-notice.ts`).
5. `operation.status` / `cancel` / `reconcile` — `src/modules/capability-execution/operation-recovery.actions.ts` + routes under `src/routes/api.v1.operations.$invocationRef*.ts`
6. `supply.publish` / `withdraw` / `earnings` — `src/modules/capability-supply/supply-actions.ts`

`inquiry.readCustomerRecord` stays as a non-410 HTTP keep (`QUARANTINE_READ_KEEP_ACTION_ID` in `src/modules/product-frontier/quarantine-write-admission.ts`; action in `src/modules/inquiries/inquiry.actions.ts`). It is not one of the 14 public market actions.

`POST /api/v1/operations/execute` is an HTTP 410 tombstone for the old invoke path (`src/routes/api.v1.operations.execute.ts`). Keyless `operation.execute` remains MCP/Answer only.

**Customer Request:** `src/modules/customer-request` is absent. Tombstone actions live in `src/modules/product-frontier/quarantine-family-actions.ts`. HTTP handlers in `src/lib/server/customer-request-gone.ts` and `src/lib/server/customer-request-*-api.ts` return HTTP 410 with successor `/api/v1/operations/call`.

**Businesses/services HTTP:** expansion frozen, URLs retained and instrumented (`src/modules/product-frontier/business-services-policy.ts`). Paths: `/api/v1/services`, `/api/v1/services/search`, `/api/v1/services/$serviceId`, `/api/businesses`, `/api/businesses/search`, `/api/businesses/$slug`. Route files listed in `MEASURED_BUSINESS_SERVICES_ROUTE_FILES`.

**Listed Convex tables (60):** `durableTables` in `tests/unit/schema/convex-schema.test.ts`. Inquiry 12 stay (`INQUIRY_EXPORT_TABLES` in `src/modules/product-frontier/table-export-tables.ts`). 29 leftover listed names in `src/modules/product-frontier/retired-listed-tables.ts` are unlisted (writers throw `retired_listed_tables_unlisted`). Schema still composes additional module table maps in `convex/schema.ts` (routing-kernel, work-tree, study, project-spine, notification-outbox, observability, demand, discovery, settings, agent-access OAuth); those families are unlisted leftover, not the keep-60 set.

## Configuration

**Environment:**
- Closed catalog and validation: `src/lib/deployment/manifest.ts` (`DEPLOYMENT_MANIFEST`, `validateDeploymentManifest`). CLI: `tools/release/verify-deployment-manifest.ts` (`npm run verify:deployment-manifest`).
- Convex typed env declarations: `convex/convex.config.ts` (`OPENROUTER_API_KEY`, `AE_CUSTOMER_REQUEST_MODEL`, `AE_SITE_URL`, `AE_RELEASE_SOURCE_REVISION`, `CLERK_JWT_ISSUER_DOMAIN`, `AE_CONVEX_SERVER_FUNCTION_TOKEN`, `AE_ROUTE_CALL_SIGNING_SECRET`, `AE_ROUTE_CALL_SIGNING_KEY_ID`, `AE_X402_RPC_URLS_JSON`).
- Clerk JWT issuer: `CLERK_JWT_ISSUER_DOMAIN` required in `convex/auth.config.ts`.
- Template file `.env.example` present. Local overlay `.env.local` present. Do not read either file; names below come from code (`src/lib/deployment/manifest.ts` and call sites).
- Vite public (`VITE_*`) vars bake into the client bundle. Server secrets stay in Node `process.env` / Convex env / GitHub `secrets`.

**Build:**
- `vite.config.ts` — TanStack Start + Nitro Vercel Node 22 + Tailwind + optional Sentry source maps (`SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`).
- `tsconfig.json` — app/tests; `convex/tsconfig.json` — Convex isolate; `tools/tsconfig.json` — CLI/tools.
- `vitest.config.ts` — Node environment, `tests/**/*.test.ts(x)` and `convex/**/*.test.ts`.
- `.oxlintrc.json` — lint categories/plugins.
- `doctor.config.ts` — react-doctor rule overrides.
- Playwright configs: `playwright.config.ts`, `playwright.deploy-smoke.config.ts`, `playwright.paid-operation.config.ts`.
- No `vercel.json` at repo root; Nitro preset emits Vercel output from `npm run build`.

## Platform Requirements

**Development:**
- Node 22 (`.nvmrc`). Host Node may differ; engines pin 22.x for product/runtime proof.
- npm 11.5.1 (`package.json` `packageManager`); CI installs that npm in `.github/workflows/kernel-release-gate.yml`.
- Convex CLI (`npx convex`) against a development deployment. `CONVEX_URL` or `VITE_CONVEX_URL` for server/client source.
- Clerk keys for authenticated flows; `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E=true` plus `CONVEX_SELF_HOSTED_ADMIN_KEY` only for local E2E bypass (`src/lib/server/local-e2e-bypass.ts`, `src/lib/server/convex-source.ts`). Forbidden in production (`forbiddenProductionNames` in `src/lib/deployment/manifest.ts`).
- OpenRouter key for Answer. Stripe + x402 custody for money paths. Live money stays fail-closed until counsel sign-offs in `src/modules/money/internal/live-money-gate.ts`.
- Local app: `npm run dev` (Vite `--host 127.0.0.1`, port 3000 in `vite.config.ts`). Combined local: `npm run dev:local` (`tools/dev/local-dev.mjs`).
- CLI: `npm run ae` (`tools/ae/cli.ts`) against `AE_CLI_BASE_URL` / `AE_CANONICAL_BASE_URL`.

**Production:**
- Web: Vercel Node.js 22 serverless (`vite.config.ts` Nitro `preset: 'vercel'`). Canonical host in CI: `https://agentic-economy-phi.vercel.app` (`.github/workflows/kernel-release-gate.yml`).
- Backend: Convex cloud deployment (`npx convex deploy` in the same workflow). Crons in `convex/crons.ts`. Workpool component tables remain with `marketDispatchWorkpool`.
- Auth: Clerk live keys (`VITE_CLERK_PUBLISHABLE_KEY` must match `pk_live_*`, `CLERK_SECRET_KEY` `sk_live_*` in production validation).
- Release gate: `npm run test:release:source` (manifest → conformance → codegen → lint/typecheck/frontier/unit/integration/build). Hosted/live-gateway jobs are consent-gated in `.github/workflows/kernel-release-gate.yml`.
- Readiness probes: `GET/HEAD /api/health`, `GET/HEAD /api/ready`, `GET /api/v1/release` (`src/lib/deployment/manifest.ts` `readinessProbes`; routes `src/routes/api.health.ts`, `src/routes/api.ready.ts`, `src/routes/api.v1.release.ts`).

---

*Stack analysis: 2026-08-19*
