# Technology Stack

**Analysis Date:** 2026-09-04

## Languages

**Primary:**
- TypeScript 5.9.3 - Application, Convex backend, API routes, React UI, CLI source, tests, and release tooling in `src/`, `convex/`, `tools/`, `packages/cli/`, and `tests/`. The root compiler configuration in `tsconfig.json` enables strict mode, exact optional properties, unchecked-index checks, isolated modules, and no emit.
- TSX / React 19.2.7 - Route and component UI in `src/routes/` and `src/components/`; JSX is compiled through the automatic React transform configured in `tsconfig.json`.

**Secondary:**
- HCL / OpenTofu 1.12.6 - AWS and Cloudflare infrastructure in `infra/package4/` and `infra/cloudflare/`; provider versions are pinned in each `versions.tf`.
- JavaScript ES modules - Build, audit, local-development, and test-runner scripts in `scripts/*.mjs` and `tools/dev/*.mjs`.
- CSS with Tailwind CSS 4.3.1 - Global tokens and utility-driven styling in `src/styles/globals.css`, loaded from `src/routes/__root.tsx`.
- YAML - GitHub Actions workflows in `.github/workflows/`, deployment evidence in `docs/operations/deployment-registry.yaml`, and AWS bootstrap material in `infra/package4/bootstrap/state-and-deployer.yaml`.
- Shell - Small operational scripts under `infra/package4/` and the OpenTofu bootstrap template at `infra/package4/modules/release-environment/templates/bootstrap.sh.tftpl`.

## Runtime

**Environment:**
- Node.js 22.x - Required by the root `package.json`, pinned as `22` in `.nvmrc`, and deployed as `nodejs22.x` by `vite.config.ts`.
- Browser runtime - React 19 client application produced by TanStack Start and Vite from `src/routes/__root.tsx` and `src/router.tsx`.
- Vercel Node serverless - Nitro uses the `vercel` preset and Node entry format in `vite.config.ts`; raw request bodies and Node/WebCrypto-compatible signing flows intentionally rule out an edge-only runtime.
- Convex managed backend - Stateful queries, mutations, actions, HTTP actions, scheduled jobs, file storage, and installed components live in `convex/` and are configured by `convex.json` and `convex/convex.config.ts`.
- Private k3s runtime - The Formance community stack is pinned and bootstrapped on an ARM64 Ubuntu 24.04 EC2 host by `infra/package4/modules/release-environment/compute.tf` and `infra/package4/modules/release-environment/locals.tf`.

**Package Manager:**
- npm 11.5.1 - Declared by `package.json`; use `npm ci` for frozen installs.
- Lockfile: present at `package-lock.json` (lockfile version 3).
- Workspace: `packages/cli/` is the `@agentic-economy/cli` npm workspace defined by the root `package.json`.

## Frameworks

**Core:**
- TanStack Start 1.168.26 - Full-stack React application and server-function runtime; request middleware is composed in `src/start.ts`.
- TanStack React Router 1.170.16 - File-based routes under `src/routes/`; generated route registration is in `src/routeTree.gen.ts`, and router defaults are in `src/router.tsx`.
- React 19.2.7 / React DOM 19.2.7 - Browser rendering and component model throughout `src/components/` and `src/routes/`.
- Convex 1.45.0 - Primary application database, realtime client, server functions, scheduler, HTTP router, auth bridge, and file storage under `convex/`.
- Nitro nightly 3.0.1 (2026-06-28 build) - TanStack Start server adapter and Vercel deployment output configured in `vite.config.ts`.
- Tailwind CSS 4.3.1 with `@tailwindcss/vite` 4.3.1 - Styling pipeline for `src/styles/globals.css`.
- shadcn/Radix component stack - Component aliases and the New York style are declared in `components.json`; primitives live in `src/components/ui/`.

**Testing:**
- Vitest 4.1.9 - Unit, integration, type, import-boundary, SEO, UI-contract, eval, and Convex tests selected by `vitest.config.ts` and root `package.json` scripts.
- Playwright 1.61.1 - Browser E2E, accessibility, authenticated, staging-chat, and deployment-smoke suites configured in `playwright*.config.ts`.
- Testing Library React 16.3.2 / DOM 10.4.1 - DOM-facing component behavior tests under `tests/`.
- `convex-test` 0.0.56 - In-memory Convex backend testing for files including `convex/*.test.ts`.

**Build/Dev:**
- Vite 8.2.2 - Local server and production build configured by `vite.config.ts`.
- TypeScript 5.9.3 - Strict type-check gate via `npm run typecheck` and `tsconfig.json`.
- tsx 4.20.5 - Executes the TypeScript CLI, release checks, and development evidence tools from `tools/`.
- esbuild 0.27.0 - Bundles the public CLI through `scripts/build-cli.mjs`.
- Oxlint 1.80.x with `@nkzw/oxlint-config` 2.0.0 - Correctness and complexity gate configured in `oxlint.config.ts`.
- OpenTofu/Terraform language 1.12.6 - Infrastructure plans in `infra/`; AWS provider 6.57.1 and Cloudflare provider 5.24.0 are exact pins.
- GitHub Actions - Source release gates and React Doctor checks in `.github/workflows/kernel-release-gate.yml` and `.github/workflows/react-doctor.yml`.

## Key Dependencies

**Critical:**
- `convex` 1.45.0 - Owns primary product state and server execution; schema and functions are rooted at `convex/schema.ts` and `convex/`.
- `@convex-dev/workpool` 0.4.10, `@convex-dev/workflow` 0.4.6, `@convex-dev/rate-limiter` 0.3.2, `@convex-dev/agent` 0.7.1, and `@convex-dev/aggregate` 0.2.x - Durable Invocation work, Provider offboarding, rate limiting, thin chat, and materialized aggregates registered in `convex/convex.config.ts`.
- `@clerk/tanstack-react-start` 1.5.9 and `@clerk/shared` 4.30.2 - Human identity, middleware, session tokens, UI provider, and webhook verification in `src/start.ts`, `src/routes/__root.tsx`, and `src/lib/server/clerk-security-webhook.ts`.
- `stripe` 22.5.x - Hosted AUD credit checkout, webhook verification, refunds, Connect onboarding, and Provider transfers implemented behind `src/lib/server/stripe-money-provider.ts`.
- Vendored `@formance/formance-sdk` 7.0.0 - Typed access to the Formance ledger gateway for funding, reservations, settlement, reversals, balances, and statements in `src/modules/money/formance.ts`.
- `@coinbase/cdp-sdk` 1.55.0 - Corporate custody account and EVM typed-data signing for x402 payments in `src/modules/capability-supply/internal/cdp-x402-payment-signer.ts`.
- `@x402/core`, `@x402/evm`, and `@x402/extensions` 2.23.0 - x402 requirement parsing, payment authorization, payment identifiers, EVM settlement checks, and transport support in `src/modules/capability-supply/internal/`.
- Vercel AI SDK `ai` 7.0.x plus `@openrouter/ai-sdk-provider` 3.0.x - All model calls pass through the single OpenRouter seam in `src/modules/model-gateway/public.ts`.
- `zod` 4.4.3 - Boundary validation across routes, external registry adapters, and action contracts under `src/`.
- `decimal.js` 10.6.0 - Exact commercial amount calculations in the money modules under `src/modules/money/`.
- `@modelcontextprotocol/sdk` 1.30.0 and `@modelcontextprotocol/client` 2.0.0 - Public MCP server transport, Provider MCP discovery/invocation, and CLI health checks in `src/lib/server/mcp-api.ts`, `src/modules/capability-supply/internal/`, and `tools/ae/commands/doctor.ts`.

**Infrastructure:**
- AWS provider 6.57.1 - EC2, RDS PostgreSQL, KMS, S3, CloudTrail, GuardDuty, IAM, SSM, CloudWatch, SNS, AWS Backup, VPC, and cross-region recovery resources in `infra/package4/`.
- Cloudflare provider 5.24.0 - Tunnel, DNS, Zero Trust Access, service tokens, and account notification policies in `infra/package4/modules/release-environment/cloudflare.tf` and `infra/cloudflare/account-baseline/`.
- `@vercel/oidc` 3.2.0 - Short-lived workload identity used by the Infisical secret plane in `src/modules/secrets/vercel-oidc.ts`.
- Sentry Node/React 10.63.x and PostHog browser/server clients - Optional error, trace, and product-event telemetry in `src/lib/observability/`.
- `undici` 7.29.0 and the guarded network layer in `src/modules/network-guard/` - Bounded outbound HTTP for Provider, registry, and secret-store calls.
- `viem` 2.55.2, `@noble/curves` 1.9.1, `@noble/hashes` 1.8.0, and `http-message-sig` 0.2.0 - EVM reads and cryptographic signing/verification at external-effect boundaries.

## Configuration

**Environment:**
- Browser-visible configuration is restricted to `VITE_*` names. `VITE_CONVEX_URL` connects the client in `src/routes/__root.tsx`; Clerk, Sentry, and PostHog public settings are read by `src/start.ts` and `src/lib/observability/config.ts`.
- Server and Convex values are validated centrally by `src/lib/deployment/manifest.ts` and declared for Convex bundling in `convex/convex.config.ts`. Production groups cover canonical URL, Convex, Clerk, OpenRouter, source-write keys, x402 custody, Stripe, and Formance.
- Core identity/state names include `CONVEX_URL`, `VITE_CONVEX_URL`, `AE_CONVEX_SERVER_FUNCTION_TOKEN`, `VITE_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `CLERK_JWT_ISSUER_DOMAIN`, and `CLERK_WEBHOOK_SIGNING_SECRET`.
- Money and execution names include `STRIPE_SECRET_KEY`, `STRIPE_READBACK_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_V2_WEBHOOK_SECRET`, `STRIPE_AU_INCLUSIVE_GST_TAX_RATE_ID`, `AE_FORMANCE_*`, `CDP_*`, `AE_X402_CDP_*`, `AE_X402_CUSTODY_*`, and `AE_X402_RPC_URLS_JSON`; authoritative validation is in `src/lib/deployment/manifest.ts`.
- Model and telemetry names include `OPENROUTER_API_KEY`, `AE_LLM_MODEL`, optional `AE_OPENROUTER_API_BASE_URL`, `SENTRY_*`, `POSTHOG_*`, and their browser-safe `VITE_*` forms; readers live in `src/modules/model-gateway/public.ts` and `src/lib/observability/config.ts`.
- Secret-plane names include `AE_INFISICAL_BASE_URL`, scope-specific `AE_INFISICAL_PLATFORM_*` / `AE_INFISICAL_CUSTOMER_*`, and `AE_SECRET_LIFECYCLE_RPC_TOKEN`; they are read only on server boundaries in `src/routes/api.internal.provider-consequence.ts` and `src/routes/api.internal.secret-lifecycle.ts`.
- `.env.example`, `.env.local`, `.vercel/.env.production.local`, and `.vercel/prod-debug.env` are present. Their contents are deliberately excluded from this map; `.gitignore` excludes local environment and Vercel state.

**Build:**
- `vite.config.ts` composes TanStack Start, Nitro, React, Tailwind, and conditional Sentry source-map upload.
- `tsconfig.json` is the repository-wide compiler contract; `convex/tsconfig.json` adapts it for the Convex runtime.
- `convex.json`, `convex/convex.config.ts`, `convex/auth.config.ts`, `convex/http.ts`, and `convex/crons.ts` configure Convex packages, auth, HTTP actions, and scheduled work.
- `components.json` defines shadcn aliases and points at `src/styles/globals.css`.
- `oxlint.config.ts`, `vitest.config.ts`, and `playwright*.config.ts` define lint and test gates.
- `infra/package4/**/versions.tf` pins OpenTofu and providers; `infra/package4/modules/release-environment/locals.tf` pins k3s, Formance images, cloudflared, Caddy, AWS CLI, and CloudWatch Agent.

## Platform Requirements

**Development:**
- Install Node.js 22 and npm 11.5.1, then run `npm ci` and `npm run dev:local` as documented in `README.md`.
- The combined local runner in `tools/dev/local-dev.mjs` starts the Vite and Convex development surfaces; default UI entrances are `http://127.0.0.1:3024/market` and `/t/new` per `README.md`.
- A usable integrated environment needs a Convex deployment plus the service-specific configuration validated by `src/lib/deployment/manifest.ts`; optional services fail closed or remain disabled when their configuration is absent.
- Run `npm run typecheck`, `npm run lint`, targeted Vitest/Playwright scripts, and `npm run build`; `package.json` defines the complete source release gate.

**Production:**
- The web/API deployment target is Vercel Node serverless, backed by a separate Convex deployment; the concrete synthetic release topology is recorded in `docs/operations/deployment-registry.yaml`.
- Clerk supplies human identity; Stripe supplies hosted checkout and Connect money movements; OpenRouter supplies model access; Coinbase CDP and x402 libraries supply corporate-USDC payment authorization; Formance supplies the money subledger.
- The deployed synthetic Formance release runs in AWS `ap-southeast-2` on private k3s with PostgreSQL 16 RDS, exposed only through Cloudflare Tunnel and Access; disaster-recovery backup copies target `ap-southeast-4`. Resources are defined in `infra/package4/modules/release-environment/`.
- The production AWS/Cloudflare foundation in `infra/package4/environments/production/` is fail-closed behind `foundation_gates_passed`; `docs/operations/deployment-registry.yaml` records it as declared but not applied and records production money as disabled.

---

*Stack analysis: 2026-09-04*
