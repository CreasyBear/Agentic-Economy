# External Integrations
**Analysis Date:** 2026-08-06

## APIs & External Services
- **OpenRouter (LLM provider)** — sole language-model gateway; every model call goes through the Vercel AI SDK with the OpenRouter provider (`src/modules/model-gateway/public.ts`, `@openrouter/ai-sdk-provider`). Auth: `OPENROUTER_API_KEY` (Bearer, set on the provider factory), optional `AE_OPENROUTER_API_BASE_URL` + `SITE_URL` overrides. Env: `OPENROUTER_API_KEY`, `AE_LLM_MODEL` (default `deepseek/deepseek-v4-flash`), `AE_LLM_MODELS`, `AE_OPENROUTER_API_BASE_URL`, `SITE_URL`. Convex env also declares `OPENROUTER_API_KEY`, `AE_CUSTOMER_REQUEST_MODEL`, `AE_SITE_URL` (`convex/convex.config.ts`).
- **Clerk (auth)** — authentication/identity via `@clerk/tanstack-react-start`; `clerkMiddleware` in `src/start.ts`. Env: `VITE_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `CLERK_JWT_ISSUER_DOMAIN` (also in Convex app env). Tokens validated against `CLERK_JWT_ISSUER_DOMAIN` issuer; Convex auth via Clerk (see `convex/auth.config.ts`).
- **x402 / HTTP Message Signatures / Web Bot Auth (WBx)** — `@x402/*` 2.18.0 for x402 payment + signature-agent transport (message signatures, JWK directory). Public key directory served at `/.well-known/http-message-signatures-directory` from `AE_WBA_DIRECTORY_PUBLIC_JWK_JSON`; OAuth AS/RS + UCP at `/.well-known/oauth-authorization-server`, `/.well-known/oauth-protected-resource`, `/.well-known/ucp` (`src/routes/[.]well-known/`). Env: `AE_WBA_DIRECTORY_PUBLIC_JWK_JSON`, `AE_WBA_SIGNATURE_AGENT_ALLOWLIST`, `AE_AGENT_PUBLIC_INQUIRY_ADMISSION_PRINCIPALS`, dev-only `AE_DEV_WBA_SMOKE_*`/`AE_DEV_WBA_SIGNATURE_AGENT`. Agentic Market / CDP Bazaar remain external candidate-supply sources.
- **Stripe (billing/top-up)** — credit top-up via `payment_intent.succeeded` webhook (`src/modules/money/internal/stripe-webhook.ts`, `live-money-gate.ts`). Auth: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` (verify `stripe-signature` header). Provider host allowlisted. Env: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `AE_PROVIDER_STRIPE_MODE`.
- **Autumn (billing/fintech provider)** — second billing path; host allowlist `api.useautumn.com`. Env: `AUTUMN_SECRET_KEY`, `AUTUMN_WEBHOOK_SECRET`, `AUTUMN_ENVIRONMENT`, `AUTUMN_PROJECT_ID`, `AUTUMN_API_BASE_URL`, `AUTUMN_API_VERSION`, `AUTUMN_PORTAL_RETURN_BASE_URL` (+ `AE_AUTUMN_*`/`AE_PROVIDER_AUTUMN_MODE` variants in `.env.local`).
- **Resend (email)** — transactional mail (React Email render). Env: `RESEND_API_KEY`, `RESEND_FROM`, `RESEND_API_BASE_URL`, `RESEND_WEBHOOK_SECRET`. Dispatch/adapter: `src/lib/server/notification-provider.ts`, `src/modules/notification-outbox/`.
- **Novu (notifications)** — primary notification dispatch route. Env: `NOVU_SECRET_KEY`, `NOVU_API_BASE_URL`, `NOVU_WORKFLOW_INQUIRY_OWNER`, `NOVU_WORKFLOW_INQUIRY_CUSTOMER`.
- **PostHog (analytics)** — funnel analytics (client `posthog-js`, server `posthog-node`). DSN/key via `VITE_POSTHOG_KEY`/`POSTHOG_HOST`/`POSTHOG_APP_URL` (+ server `POSTHOG_KEY`/`POSTHOG_HOST`/`POSTHOG_APP_URL`); opt-out `VITE_AE_DISABLE_OBSERVABILITY`, brake `AE_DISABLE_PUBLIC_FUNNEL_SOURCE_SYNC`. See `src/modules/observability/`.
- **Sentry (error monitoring)** — client + server error capture, sourcemaps via `@sentry/vite-plugin` (enabled when `SENTRY_AUTH_TOKEN/ORG/PROJECT` present). Env: `VITE_SENTRY_DSN`, `SENTRY_DSN`, `SENTRY_ENVIRONMENT`, `SENTRY_RELEASE`, `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN`.
- **Google Maps (embed)** — optional generative location/map artifacts. Env: `VITE_GOOGLE_MAPS_API_KEY`.
- **OpenAI / Expo-style provider adapters** — demo/provider adapters under `src/routes/api.demo-provider.*` (health, quote) used for local/dev provider smoke; not a production external dependency.
- **Agentic Market / CDP Bazaar** — external candidate-supply discovery source (curated/provider import domain), not a runtime API dependency in the shipped app.

## Data Storage
- **Convex** — single source of truth. Client: `convex` 1.42.0 (`VITE_CONVEX_URL` for the browser client, `CONVEX_DEPLOYMENT`/`CONVEX_DEPLOY_KEY` for CLI/server). Schema composed in `convex/schema.ts` from bounded-context tables in `src/modules/**/internal/schema.ts`; migrations in `convex/migrations.ts` + `@convex-dev/migrations` patterns. Local dev via `convex dev` and seeding (`npm run seed:dev` → `convex/devSeed.ts`, `convex/curatedProviders.ts`).
- No external SQL/NoSQL DB besides Convex; provider-owned data (Stripe/Autumn/Resend/Novu) is read back into Convex rows for durable evidence.

## Authentication & Identity
- **Clerk** — primary human/operator auth; sign-in/sign-up routes `sign-in.$.tsx`/`sign-up.$.tsx`; tokens bound to `CLERK_JWT_ISSUER_DOMAIN`; Convex authz in `convex/authz.ts` + `requireIdentity` patterns; `AE_CUSTOMER_REQUEST_CLERK_INSTANCE_ID`/`AE_CUSTOMER_REQUEST_CLERK_SUBJECT`/`AE_WORK_TREE_CLERK_INSTANCE_ID` used by release smoke automation.
- **x402 / agent principals** — signature-agent (WBA) + message-signature auth for agent/bot callers (`src/modules/security/`, `[.]well-known/*`, `AE_AGENT_PUBLIC_INQUIRY_ADMISSION_PRINCIPALS`).
- **Source-write admission** — scoped HMAC source keys for trusted server→Convex writes; `AE_SOURCE_WRITE_SECRET` (non-prod HKDF) or per-family `AE_SOURCE_WRITE_KEY_*`/`AE_SOURCE_WRITE_PREVIOUS_KEYS_*` (`src/lib/server/source-write-admission.ts`, `src/modules/security/source-write-admission.ts`). Convex env also carries `AE_CONVEX_SERVER_FUNCTION_TOKEN`, `AE_ROUTE_CALL_SIGNING_SECRET`/`AE_ROUTE_CALL_SIGNING_KEY_ID`.
- **OAuth** (in-app) — OAuth authorization-server routes (`oauth.authorize.ts`, `oauth.token.ts`, `oauth.device_authorization.ts`, `oauth.register.ts`) + `/.well-known/oauth-*` discovery.
- **CSRF** — `createCsrfMiddleware` in `src/start.ts`.

## Monitoring & Observability
- **PostHog** — product/funnel analytics (`src/modules/observability/funnel.*`, `api.observability.funnel.ts`).
- **Sentry** — server+client error capture `initSentryServer`/`captureServerException` (`src/lib/observability/sentry.server.ts`). Env as above.
- **Convex logs/insights** — server function logs, crons (`convex/crons.ts`), rate limiting (`@convex-dev/rate-limiter`, `src/modules/common/…`, `convex/rateLimit.ts`).
- Release evidence pipelines write JSON reports under `output/release/` (source/hosted gates), uploaded as CI artifacts.

## CI/CD & Deployment
- **GitHub Actions** — `.github/workflows/kernel-release-gate.yml` (on push/PR to `main`): `source-proof` job runs `npm ci`, `check:convex-codegen`, `test:release:source:after-codegen` (lint, typecheck, unit/integration/types/imports/ts-standards/seo/ui-contract, build) on Node 22 + npm 11.5.1; `hosted-proof` job (main, non-PR, production env) deploys the exact clean revision to Vercel with `VERCEL_TOKEN`/`VERCEL_ORG_ID`/`VERCEL_PROJECT_ID`, deploys Convex with `CONVEX_DEPLOY_KEY`, verifies env (`AE_ROUTE_CALL_SIGNING_SECRET`/`AE_ROUTE_CALL_SIGNING_KEY_ID`/`AE_SITE_URL`), seeds curated supply, and runs hosted Request-lifecycle + WorkTree parity smokes against `https://agentic-economy-phi.vercel.app`. `.github/workflows/react-doctor.yml` — advisory React Doctor PR/push scan (non-blocking).
- **Local release scripts** — `tools/release/deploy-customer-request-git-source.ts`, `customer-request-production-smoke.ts`, `verify-*` etc.
- **Vercel** — deployment target via Nitro vercel preset; `VITE_*` env for client; project `agentic-economy` (`.vercel/project.json`).

## Environment Configuration
- **Dev:** `.env.local` (gitignored) + `.env.example` (documented names, committed). Local dev via `npm run dev` (Vite 3000) + `convex dev`.
- **Staging/Prod:** vars set on Vercel (prefixed `VITE_*` exposed to client; others server-only) and on the Convex deployment (`convex env set`). Secret/sensitive vars are server-only.
- **Canonical var-name inventory** (names only, from `.env.example`): `VITE_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `VITE_CONVEX_URL`, `CLERK_JWT_ISSUER_DOMAIN`, source-write family (`AE_SOURCE_WRITE_SECRET`, `AE_SOURCE_WRITE_KEY_*`, `AE_SOURCE_WRITE_PREVIOUS_KEYS_*`, `AE_SOURCE_WRITE_DERIVED_KEY_ID_*`), WBA family (`AE_WBA_*`, `AE_AGENT_PUBLIC_INQUIRY_ADMISSION_PRINCIPALS`), canonical URL (`AE_CANONICAL_BASE_URL`, `AE_CANONICAL_HOST_ALLOWLIST`, `AE_CSP_REPORT_ONLY`), billing (`AUTUMN_*`, `STRIPE_*`), notifications (`RESEND_*`, `NOVU_*`, `AE_NOTIFICATION_OUTBOX_SECRET`), model (`OPENROUTER_API_KEY`, `AE_LLM_MODEL`, `AE_LLM_MODELS`, `AE_ANSWER_EVAL_PASSED`, `VITE_AE_ANSWER_MODE`), observability (`SENTRY_*`, `POSTHOG_*`/`VITE_POSTHOG_*`, `VITE_AE_DISABLE_OBSERVABILITY`, `AE_DISABLE_PUBLIC_FUNNEL_SOURCE_SYNC`), Google Maps `VITE_GOOGLE_MAPS_API_KEY`, `AE_ROUTING_PUBLIC_BASE_URL`, Convex app env (`AE_CUSTOMER_REQUEST_MODEL`, `AE_SITE_URL`, `AE_CONVEX_SERVER_FUNCTION_TOKEN`, `AE_ROUTE_CALL_SIGNING_SECRET`, `AE_ROUTE_CALL_SIGNING_KEY_ID`). Never commit values; secrets stay in the deployment secret stores.

## Webhooks & Callbacks
- **Incoming:**
  - **Stripe** — `POST /api/...` Stripe webhook handling (`src/modules/money/internal/stripe-webhook.ts`): verifies `stripe-signature` with `STRIPE_WEBHOOK_SECRET`, enforces bounded body (256 KB), applies `payment_intent.succeeded` to the money ledger.
  - **Resend** — `POST /api/notification/resend-webhook` (`src/routes/api.notification.resend-webhook.ts`): bounded body, `RESEND_WEBHOOK_SECRET` signature verification, then notifies Convex via source-mutation.
  - **Novu** — dispatch route `api.notification.novu-dispatch.ts` (+ `resend-dispatch.ts`); inbound webhook resolution in `src/modules/notification-outbox/operator/resolve-webhook-dispatch.ts` (verifier driven by `AE_NOTIFICATION_OUTBOX_SECRET` / provider secrets).
  - **Autumn** — webhook secret `AUTUMN_WEBHOOK_SECRET` (verification enforced on the Autumn path).
- **Outgoing callbacks:** notification outbox dispatches to Resend/Novu on provider events; money top-up portal returns via `AUTUMN_PORTAL_RETURN_BASE_URL`.
- **Verification pattern:** server-side webhooks are signature-verified against provider secrets over the raw bounded request body (Node + WebCrypto — which is why Nitro is pinned to the `nodejs22.x` Node serverless format rather than edge). Inbound write callbacks that must reach Convex use the source-write HMAC admission envelope.
---
*Integration audit: 2026-08-06*
