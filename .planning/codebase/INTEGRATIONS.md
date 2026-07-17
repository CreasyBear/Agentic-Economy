# External Integrations

**Analysis Date:** 2026-07-17  
**Inspected revision / last_mapped_commit:** `7deffac41e103ee619ce099db531fc2127ba9985`

## APIs & External Services

**Payment Processing:**
- Stripe / Autumn — Documented in `.env.example` (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `AUTUMN_*`) and treated as provider secrets that must not be reused as AE source-write keys (`src/modules/security/source-write-admission.ts`). Production host commentary pins Autumn `api.useautumn.com` and Stripe `api.stripe.com`.
  - SDK/Client: No `stripe` or Autumn npm SDK in `package.json`; no `src/modules/billing/` or `src/modules/business-action/` trees in this revision
  - Auth: Server-only env vars listed above
  - Status: Env + deploy-smoke residue (`tests/deploy-smoke/phase6-business-action-stripe-smoke.spec.ts`) remain; live checkout/webhook route modules are not present in source at this commit
- x402 (EVM) — Capability-supply transport may create `PAYMENT-SIGNATURE` headers for HTTP 402 challenges
  - SDK/Client: `@x402/core`, `@x402/evm`, `@x402/extensions`, `viem` via `src/modules/capability-supply/internal/x402-payment-signer.ts`
  - Auth: Caller-supplied EVM private key credential on the signature request (not a global env API key)
  - Scope: Transport helper only; not a public booking/payment product surface

**Email/SMS / Notifications:**
- Resend — Transactional email dispatch and delivery webhooks
  - Client: Raw `fetch` in `src/lib/server/notification-provider.ts` (default host `https://api.resend.com`)
  - Auth: `RESEND_API_KEY`, `RESEND_FROM`, optional `RESEND_API_BASE_URL`, `RESEND_WEBHOOK_SECRET`
  - Routes: `POST /api/notification/resend-dispatch` (`src/routes/api.notification.resend-dispatch.ts`), `POST /api/notification/resend-webhook` (`src/routes/api.notification.resend-webhook.ts`)
  - Outbox gate: `AE_NOTIFICATION_OUTBOX_SECRET` for system admission into Convex outbox mutations
- Novu — Workflow-triggered owner/customer inquiry notifications
  - Client: Raw `fetch` in `src/lib/server/notification-provider.ts` (default host `https://api.novu.co`)
  - Auth: `NOVU_SECRET_KEY`, optional `NOVU_API_BASE_URL`, workflow ids `NOVU_WORKFLOW_INQUIRY_OWNER` / `NOVU_WORKFLOW_INQUIRY_CUSTOMER`
  - Route: `POST /api/notification/novu-dispatch` (`src/routes/api.notification.novu-dispatch.ts`)

**LLM / AI:**
- OpenRouter — Chat completions and model listing for the answer tool-use agent and related paths
  - Integration: `fetch` to `https://openrouter.ai/api/v1/chat/completions` and `/api/v1/models`
  - Auth: `OPENROUTER_API_KEY` (server-only); model via `AE_LLM_MODEL` (default `deepseek/deepseek-v4-flash`); optional `AE_OPENROUTER_API_BASE_URL`, `AE_LLM_MODELS`
  - Code: `src/modules/answer/internal/answer-tool-use-agent.ts`, `llm-config.ts`, `openrouter-models.ts`, `src/modules/customer-request/openrouter-transport.ts`, follow-up chips under `src/modules/answer-thread/`
  - Gates: `AE_ANSWER_EVAL_PASSED=1` unlocks LLM follow-up chips after eval; TanStack AI used for tool JSON Schema (`@tanstack/ai`), not as the model provider

**Search:**
- Meilisearch — Optional generated search mirror; Convex remains catalog source of truth
  - Integration: HTTP port in `src/modules/registry/internal/catalog-search-port.ts`
  - Auth: `MEILISEARCH_HOST`, `MEILISEARCH_ADMIN_KEY`, index `AE_SEARCH_INDEX_UID` (default `registry-search-documents`)
  - Backend mode: `AE_SEARCH_BACKEND` = `convex` | `dual` | `meilisearch`; timeout `AE_SEARCH_TIMEOUT_MS`

**Maps:**
- Google Maps Embed — Optional generative/location map iframes
  - Client: `VITE_GOOGLE_MAPS_API_KEY` in `src/components/ae/artifacts/AeGenerativeMap.tsx`
  - CSP allowlist includes `maps.googleapis.com` / `maps.google.com` in `src/lib/http/security-headers.ts`

**Agent identity / HTTP signatures:**
- Web Bot Auth — Verify signed agent callers
  - SDK: `web-bot-auth` (+ noble hashes/curves) in `src/modules/routing-kernel/caller-identity.ts`
  - Config: `AE_WBA_SIGNATURE_AGENT_ALLOWLIST`, `AE_WBA_DIRECTORY_PUBLIC_JWK_JSON`, `AE_AGENT_PUBLIC_INQUIRY_ADMISSION_PRINCIPALS`; public JWKS at `GET /.well-known/http-message-signatures-directory`
  - Dev-only smoke: `AE_DEV_WBA_SMOKE_*` (ignored in production)

**External APIs (product HTTP surfaces AE exposes):**
- Public catalog: `GET /api/businesses`, `/api/businesses/search`, `/api/businesses/$slug`
- Customer Request APIs: `/api/requests*`, `/api/v1/requests*` (authenticated agent/human lifecycle)
- Answer: `/api/answer/turn`, threads, follow-up chips
- Discovery: `/api/discovery/schema`, examples, fixtures; `/llms.txt`, `/SKILL.md`, `/$slug/ucp`
- Sandbox providers: `/api/sandbox/providers/route-resolver|route-quoter|workflow` (also mirrored on Convex HTTP in `convex/http.ts`)
- Observability funnel write: `POST /api/observability/funnel`

## Data Storage

**Databases:**
- Convex — Primary application database and backend execution
  - Connection: `VITE_CONVEX_URL` (client + `ConvexHttpClient` in `src/lib/server/convex-source.ts`); deploy key `CONVEX_DEPLOY_KEY` in CI
  - Client: `convex` package; authenticated clients attach Clerk JWT (`template` for Convex)
  - Schema: Composition root `convex/schema.ts` importing module-owned `*Tables` fragments under `src/modules/*/internal/`
  - Auth config: `convex/auth.config.ts` requires `CLERK_JWT_ISSUER_DOMAIN`

**File Storage:**
- Not detected as a dedicated object store (no S3/Supabase Storage client in dependencies). Static/build assets ship with the Vercel deployment; catalog/media facts live as Convex documents / published URLs.

**Caching:**
- None as a standalone Redis/Memcached service. Search mirror (Meilisearch) and CDN/hosting caches are the external accelerators when configured.

## Authentication & Identity

**Auth Provider:**
- Clerk — Human sign-in/sign-up and session middleware
  - Implementation: `@clerk/tanstack-react-start` (`ClerkProvider` in `src/routes/__root.tsx`, `clerkMiddleware` in `src/start.ts`, routes `sign-in.$`, `sign-up.$`)
  - Keys: `VITE_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`
  - Convex bridge: JWT issuer domain `CLERK_JWT_ISSUER_DOMAIN`, applicationID `convex`
  - Server lookups: Clerk Backend API `https://api.clerk.com/v1` for owner delivery addresses (`notification-provider.ts`)
  - Local E2E bypass: `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E=true` (non-production only; `src/lib/server/local-e2e-bypass.ts`)

**OAuth Integrations:**
- Configured inside the Clerk dashboard (not hard-coded provider clients in-repo). Use Clerk’s connected social providers as configured for the instance.

**Source-write admission:**
- AE HMAC source-write trust envelope (`AE_SOURCE_WRITE_SECRET` / per-family `AE_SOURCE_WRITE_KEY_*`) gates Convex writes from server routes — independent of Clerk and provider secrets (`src/lib/server/source-write-admission.ts`, `src/modules/security/source-write-admission.ts`)

## Monitoring & Observability

**Error Tracking:**
- Sentry — Client (`@sentry/react` / `src/lib/observability/sentry.client.ts`) and server (`@sentry/node` / `sentry.server.ts`)
  - DSN: `VITE_SENTRY_DSN` / `SENTRY_DSN`; env/release via `SENTRY_ENVIRONMENT`, `SENTRY_RELEASE` (falls back to `VERCEL_GIT_COMMIT_SHA` / `GITHUB_SHA`)
  - Build upload: `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` enable Vite plugin
  - Kill switch: `VITE_AE_DISABLE_OBSERVABILITY` / `AE_DISABLE_OBSERVABILITY`

**Analytics:**
- PostHog — Funnel/product analytics
  - Client: `posthog-js` (`VITE_POSTHOG_KEY`, `VITE_POSTHOG_HOST`, optional `VITE_POSTHOG_APP_URL`)
  - Server: `posthog-node` (`POSTHOG_KEY`, `POSTHOG_HOST`)
  - Funnel sync to Convex may be disabled with `AE_DISABLE_PUBLIC_FUNNEL_SOURCE_SYNC`

**Logs:**
- Vercel / hosting platform stdout for the web app
- Cloudflare Workers observability enabled in `examples/routing-edge/wrangler.jsonc` (logs + sampled traces)
- Convex dashboard logs for backend functions

## CI/CD & Deployment

**Hosting:**
- Vercel — Primary web/app host (Nitro Vercel Node preset in `vite.config.ts`)
  - Deploy: GitHub Actions hosted-proof job on `main` using `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, automation bypass secret
  - Companion: Convex production deploy in the same workflow
- Cloudflare Workers — Optional routing edge (`examples/routing-edge/`, secret `AE_EDGE_ORIGIN_HMAC_KEY`, vars `AE_ROUTING_ORIGIN`, etc.); public base URL advertised via `AE_ROUTING_PUBLIC_BASE_URL`

**CI Pipeline:**
- GitHub Actions
  - `.github/workflows/kernel-release-gate.yml` — `npm run test:release:source` on PR/push; hosted production deploy + Customer Request smoke on `main`
  - `.github/workflows/react-doctor.yml` — React Doctor checks
  - Secrets: Clerk, Vercel, Convex deploy key, Customer Request smoke subject/instance ids (GitHub environment `production`)

## Environment Configuration

**Development:**
- Required for a working local stack: `VITE_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `CLERK_JWT_ISSUER_DOMAIN`, `VITE_CONVEX_URL`, plus source-write keys (or `AE_SOURCE_WRITE_SECRET` derivation in non-prod)
- Secrets location: `.env.example` as the name catalog; real values in gitignored `.env.local` / `.env.development.local` / host dashboards
- Optional: `OPENROUTER_API_KEY` for answer LLM path; Resend/Novu for notification smokes; Meilisearch for dual search; `VITE_GOOGLE_MAPS_API_KEY` for maps
- Mock/stub: Sandbox capability providers (`AE_SANDBOX_PROVIDER_KEY`); non-prod provider base URL overrides allowed by `resolveProviderApiBaseUrl` (`src/modules/security/provider-api-base-url.ts`)

**Staging:**
- Routing-edge example defaults to a staging Convex `.site` origin in `wrangler.jsonc` vars
- Use separate Clerk/Convex/Vercel projects or env slots; keep provider secrets out of `VITE_*`

**Production:**
- Secrets management: Vercel project env, Convex prod env (`npx convex env`), Cloudflare Worker secrets, GitHub Actions environment secrets
- Release gate refuses missing Convex execution settings (`AE_ROUTE_CALL_SIGNING_*`, `AE_SANDBOX_PROVIDER_KEY`, `AE_SITE_URL`)
- Canonical public URL: `AE_CANONICAL_BASE_URL`, `AE_CANONICAL_HOST_ALLOWLIST`; optional CSP report-only `AE_CSP_REPORT_ONLY`

## Webhooks & Callbacks

**Incoming:**
- Resend — `POST /api/notification/resend-webhook`
  - Verification: HMAC headers via `verifyResendWebhook` in `src/lib/server/notification-provider.ts` using `RESEND_WEBHOOK_SECRET`
  - Effect: Admitted webhook ingested into Convex notification outbox with idempotent operation keys
- Stripe / Autumn webhooks — Env names `STRIPE_WEBHOOK_SECRET` / `AUTUMN_WEBHOOK_SECRET` documented; no matching `src/routes/api.*webhook*` handlers for those providers in this revision

**Outgoing:**
- Resend send API / Novu trigger API — From dispatch routes after outbox admission
- OpenRouter chat/models — From answer and customer-request transport paths
- Meilisearch index/search HTTP — When search backend is `dual` or `meilisearch`
- Clerk Backend API — Owner email resolution for notifications
- Convex HTTP sandbox provider callbacks — Edge/origin integrations using signing secrets (`AE_ROUTE_CALL_SIGNING_*`)
- PostHog / Sentry — Telemetry egress when observability is enabled

---

*Integration audit: 2026-07-17*  
*Update when adding/removing external services*
