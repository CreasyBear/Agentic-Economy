---
last_mapped_commit: 63a451f43edea453d0a1a8d8502504433acf76fb
---

# Technology Stack

**Analysis Date:** 2026-07-21

**Source Anchor:** commit `63a451f43edea453d0a1a8d8502504433acf76fb`, tree `16fee2f5321d7917f7f0bccd5d59e3d6a018be64`

## Languages

**Primary:**
- TypeScript 6.0.3 — application, domain modules, TanStack server handlers, Convex functions, verification tools, and tests under `src/`, `convex/`, `tools/`, and `tests/`; strict settings are defined in `tsconfig.json`.
- TSX with React 19.2.7 — route and component rendering under `src/routes/` and `src/components/`.

**Secondary:**
- JavaScript ESM (`.mjs`) — hosted routing/provider examples under `examples/routing-provider/` and other example bridges.
- CSS — Tailwind CSS 4.3.1 plus Astryx neutral design tokens in `src/styles/globals.css` and the local paid-operation browser in `tools/dev/paid-operation-browser/browser.css`.
- YAML — Promptfoo evaluation configuration under `eval/answer/promptfooconfig.yaml` and GitHub Actions in `.github/workflows/`.
- JSON/JSONC — package/configuration manifests including `package.json`, `examples/routing-edge/wrangler.jsonc`, and `examples/routing-agent-directory/wrangler.jsonc`.

## Runtime

**Environment:**
- Node.js — CI pins Node 22 in `.github/workflows/kernel-release-gate.yml`; the root package does not declare an `engines.node` requirement in `package.json`.
- Vercel Node serverless `nodejs20.x` — the primary TanStack Start application deployment target configured by Nitro in `vite.config.ts`.
- Convex managed runtime — queries, mutations, actions, schema, schedules, and HTTP handlers under `convex/`; Node-dependent actions are isolated in files that begin with `"use node";`.
- Cloudflare Workers — example routing edge and signature-directory deployments configured in `examples/routing-edge/wrangler.jsonc` and `examples/routing-agent-directory/wrangler.jsonc`; these are not the primary application host.
- Vercel Node 22 example — the conformance provider declares Node 22 in `examples/routing-provider/package.json` and routes in `examples/routing-provider/vercel.json`.

**Package Manager:**
- npm 11.5.1 — pinned by `packageManager` in `package.json` and installed explicitly in `.github/workflows/kernel-release-gate.yml`.
- Lockfile: present at `package-lock.json` using lockfile version 3.

## Frameworks

**Core:**
- TanStack Start 1.168.26 and TanStack Router 1.170.16 — full-stack React routing, server functions, and route handlers under `src/routes/` and middleware composition in `src/start.ts`.
- React / React DOM 19.2.7 — human UI and source-owned projections under `src/components/` and `src/routes/`.
- Vite 8.1.0 with Nitro nightly 3.0.1 — development/build pipeline and Vercel serverless packaging in `vite.config.ts`.
- Convex 1.42.0 — authoritative document persistence and backend execution under `convex/`; `convex/schema.ts` composes module-owned schema fragments from `src/modules/*/internal/`.
- Astryx `@astryxdesign/core` and `@astryxdesign/theme-neutral` ^0.1.2 — active UI component and theme system used from `src/components/`.
- Tailwind CSS 4.3.1 — layout and styling pipeline through `@tailwindcss/vite` in `vite.config.ts`.

**Testing:**
- Vitest 4.1.9 — unit, integration, type, import-boundary, copy, SEO, and UI-contract suites configured by `vitest.config.ts` and scripts in `package.json`.
- Playwright 1.61.1 — local E2E, deploy-smoke, accessibility, and paid-operation browser verification configured by `playwright.config.ts`, `playwright.deploy-smoke.config.ts`, and `playwright.paid-operation.config.ts`.
- `convex-test` ^0.0.54 — in-process Convex function tests under `tests/integration/` and `convex/*.test.ts`.
- Promptfoo ^0.121.17 — answer-agent evaluation configured under `eval/answer/` and run by `npm run test:eval` in `package.json`.
- Testing Library 16.3.2, jest-dom 6.9.1, and jsdom 29.1.1 — component and DOM contract tests under `tests/unit/` and `tests/ui-contract/`.

**Build/Dev:**
- TypeScript 6.0.3 with `noEmit` — type checking through `npm run typecheck`; path aliases `@/*` and `~/*` resolve to `src/*` in `tsconfig.json`.
- oxlint ^1.73.0 — linting across `src`, `convex`, `tests`, `tools`, and `examples` using `.oxlintrc.json`.
- tsx ^4.20.5 — TypeScript execution for development evidence and release tooling under `tools/dev/` and `tools/release/`.
- Wrangler ^4.110.0 — Cloudflare example type generation and dry-run verification through `npm run check:routing-edge`.
- React Doctor ^0.7.7 — local health command in `package.json`, configuration in `doctor.config.ts`, and advisory GitHub workflow in `.github/workflows/react-doctor.yml`.
- Sentry Vite plugin ^5.3.0 — conditional source-map production in `vite.config.ts` when the Sentry build credential set is present.

## Key Dependencies

**Critical:**
- `convex` 1.42.0 — source persistence, functions, and `ConvexHttpClient` transport in `src/lib/server/convex-source.ts`.
- `@clerk/tanstack-react-start` 1.4.9 — request middleware in `src/start.ts`, human sessions in `src/lib/server/hosted-paid-operation-human-api.ts`, and scoped API-key authentication in `src/lib/server/hosted-paid-operation-agent-auth.ts`.
- `zod` 4.4.3 — action, transport, API, and provider contract validation throughout `src/modules/`.
- `@tanstack/ai` ^0.38.0 — action/tool JSON Schema projection in `src/modules/common/action.ts` and `src/modules/harness/tool-contract.ts`.
- `@x402/core`, `@x402/evm`, and `@x402/extensions` 2.18.0 with `viem` 2.55.2 — implemented EVM x402 signature creation in `src/modules/capability-supply/internal/x402-payment-signer.ts`.
- `undici` 7.28.0 — guarded outbound HTTP in Convex actions such as `convex/capabilitySupplyReadiness.ts` and `convex/customerRequestRouteCancellationWorker.ts`.
- `web-bot-auth` 0.1.3 and `http-message-sig` ^0.2.0 — Web Bot Auth verification and example signing in `src/modules/routing-kernel/caller-identity.ts` and `examples/routing-provider/`; the public routing V1 runtime remains retired.
- `@noble/hashes` 1.8.0 and `@noble/curves` 1.9.1 — digests, keyed admission, and signature primitives used by security and attestation modules under `src/modules/common/` and `src/modules/security/`.
- `@sentry/react` / `@sentry/node` ^10.63.0 and `posthog-js` ^1.398.2 / `posthog-node` ^5.39.0 — opt-in error and analytics clients under `src/lib/observability/`.
- `ajv` 8.20.0 and `@cfworker/json-schema` 4.1.1 — JSON Schema validation for capability and OpenAPI-shaped contracts under `src/modules/capability-supply/` and related modules.

**Infrastructure:**
- Nitro Vercel preset — production application packaging in `vite.config.ts`.
- Convex schema/function deployment — backend infrastructure under `convex/`, deployed by `.github/workflows/kernel-release-gate.yml`.
- Raw Fetch integrations — OpenRouter, Clerk Backend API, Resend, Novu, Meilisearch, registered HTTP/MCP/x402 providers, Shippo, and EasyPost use `fetch`/`undici` rather than service-specific root SDKs; implementations are mapped in `INTEGRATIONS.md`.
- No Stripe, Resend, Novu, Meilisearch, Shippo, EasyPost, OpenRouter, Redis, or object-storage SDK is declared in root `package.json`.

## Paid-Operation Runtime Stack

**Implemented hosted seam:**
- Agent HTTP routes are `src/routes/api.v1.paid-operations.ts`, `src/routes/api.v1.paid-operations.$invocationRef.ts`, and `src/routes/api.v1.paid-operations.$invocationRef.commands.ts`.
- Human routes are `src/routes/actions.paid.new.tsx` and `src/routes/actions.paid.$invocationRef.tsx`; UI rendering uses `src/components/ae/action-invocation/AePaidOperationCard.tsx`.
- Both hosts delegate through `src/lib/server/hosted-paid-operation-runtime.ts` to `convex/hostedPaidOperationGateway.ts` and durable records in `convex/hostedPaidOperation.ts`.
- The source-owned handoff is `src/modules/action-invocation/paid-operation-human-handoff.ts`: agent responses carry a version-bound GET relation to the existing human Action Detail. It is navigation only, carrying neither authority nor business truth.
- Agent continuations are projected from the same semantics by `src/modules/action-invocation/paid-operation-agent-command-contract.ts`; callers receive only the current inspect/authorize/execute/reconcile relation and never construct a retry route.

**Evidence boundary:**
- The hosted runtime and Convex persistence are implemented source. The operation created by `src/modules/action-invocation/hosted-paid-operation-creation.ts` is explicitly evaluator-only and resolves provider `A` or `B` from labelled sandbox fixtures in `convex/hostedPaidOperationGateway.ts`.
- The human setup page states “Hosted sandbox”, “labelled mock providers”, and “No real payment” in `src/routes/actions.paid.new.tsx`.
- x402 fields, payment proposals, submission uncertainty, reconciliation, custody digests, and evidence references are persisted and evaluated, but the hosted Phase 3C operation records mock effects; it is not proof of independent provider payment, settlement, fulfilment, or customer value.

## Configuration

**Environment:**
- A `.env.example` file exists at repository root; its contents were not read. No secret-bearing environment file was read for this map.
- Convex connection uses `CONVEX_URL` or `VITE_CONVEX_URL` in `src/lib/server/convex-source.ts`.
- Convex declares optional application keys in `convex/convex.config.ts`, including OpenRouter, site URL, Clerk issuer, server-function token, and route-call signing fields.
- Clerk JWT verification requires `CLERK_JWT_ISSUER_DOMAIN` in `convex/auth.config.ts`.
- Observability configuration is isolated in `src/lib/observability/config.ts`; clients remain disabled when no DSN/key is configured or an AE observability kill-switch is set.

**Build:**
- `vite.config.ts` — TanStack Start, Nitro Vercel Node, React, Tailwind, local `/SKILL.md` compatibility, Astryx SSR bundling, and optional Sentry upload.
- `tsconfig.json` and `convex/tsconfig.json` — strict application and Convex compilation.
- `vitest.config.ts`, `playwright.config.ts`, `playwright.deploy-smoke.config.ts`, and `playwright.paid-operation.config.ts` — test environments.
- `.oxlintrc.json` and `doctor.config.ts` — static-quality configuration.
- `.github/workflows/kernel-release-gate.yml` — source gates plus exact-revision Vercel/Convex release paths; `.github/workflows/react-doctor.yml` — advisory React analysis.

## Platform Requirements

**Development:**
- Use Node 22 to match `.github/workflows/kernel-release-gate.yml` and npm 11.5.1 from `package.json`.
- Install from `package-lock.json` with `npm ci`; use `npm run dev`, `npm run typecheck`, focused Vitest commands, and `npm run build` from `package.json`.
- Authenticated source calls require Clerk and Convex configuration; the local-only Clerk bypass in `src/lib/server/local-e2e-bypass.ts` throws if enabled in production.
- Provider/evidence tools under `tools/dev/` and `examples/` require their named environment configuration; run them as labelled development or conformance evidence, not production proof.

**Production:**
- Primary web host: Vercel Node serverless from `vite.config.ts`.
- Backend: Convex deployment from `convex/`, authenticated with Clerk JWT configuration in `convex/auth.config.ts`.
- Release automation: GitHub Actions in `.github/workflows/kernel-release-gate.yml`; the Phase 3C path verifies source/build, observes the Vercel Git deployment, deploys Convex, configures bounded evaluator admission, and records a deployment receipt.
- Cloudflare Workers and the Vercel routing provider under `examples/` are example/conformance infrastructure, not proof that the primary customer application routes through those deployments.

---

*Stack analysis: 2026-07-21 (commit 63a451f43edea453d0a1a8d8502504433acf76fb)*
