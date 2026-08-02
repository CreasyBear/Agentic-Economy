# External Integrations

**Analysis Date:** 2026-08-02

## APIs & External Services

**Identity and authentication:**
- Clerk - Browser sign-in, server sessions, Convex JWT issuer, owner lookup, and customer-request agent API keys.
  - SDK/Client: `@clerk/tanstack-react-start` in `src/start.ts`, `src/routes/__root.tsx`, and `src/lib/server/`; server API-key operations use `clerkClient().apiKeys`.
  - Auth: `VITE_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, and `CLERK_JWT_ISSUER_DOMAIN`.

**AI and model providers:**
- OpenRouter - Vercel AI SDK model inference, structured output, tool calls, usage metadata, and bounded web search.
  - SDK/Client: `ai` plus `@openrouter/ai-sdk-provider`, centralized by `src/modules/model-gateway/public.ts`; model catalog readback is in `src/modules/answer/internal/openrouter-models.ts`.
  - Auth: `OPENROUTER_API_KEY`; model/base URL/app URL controls are `AE_LLM_MODEL`, `AE_OPENROUTER_API_BASE_URL`, and `SITE_URL`.

**Notifications and messaging:**
- Resend - Owner inquiry email delivery and signed delivery-event webhook ingestion.
  - SDK/Client: Server `fetch` adapter in `src/lib/server/notification-provider.ts`; routes are `src/routes/api.notification.resend-dispatch.ts` and `src/routes/api.notification.resend-webhook.ts`.
  - Auth: `RESEND_API_KEY`, `RESEND_FROM`, `RESEND_WEBHOOK_SECRET`, and `AE_NOTIFICATION_OUTBOX_SECRET`.
- Novu - Inquiry workflow trigger and transaction/message readback for owner or customer recipients.
  - SDK/Client: Server `fetch` adapter in `src/lib/server/notification-provider.ts`; dispatch route is `src/routes/api.notification.novu-dispatch.ts`.
  - Auth: `NOVU_SECRET_KEY`, `NOVU_WORKFLOW_INQUIRY_OWNER`, optional `NOVU_WORKFLOW_INQUIRY_CUSTOMER`, and optional `NOVU_API_BASE_URL`.

**Agent-facing protocols:**
- Model Context Protocol - Hosted streamable HTTP action endpoint and dynamic provider MCP JSON-RPC transport.
  - SDK/Client: `@modelcontextprotocol/sdk` and `WebStandardStreamableHTTPServerTransport` in `src/lib/server/mcp-api.ts`; hosted route is `src/routes/mcp.ts`.
  - Auth: Anonymous requests are limited to read-only registered actions; protected calls use Clerk API-key bearer authentication and scopes from `src/lib/server/customer-request-agent-auth.ts`.
- Customer Request REST and OAuth surfaces - Agent request creation, execution, readback, cancellation, OAuth device/authorization-code flow, and protected-resource metadata.
  - SDK/Client: TanStack Start handlers in `src/routes/api.v1.requests.ts`, `src/routes/api.v1.requests.$requestRef.*.ts`, `src/routes/api.requests.ts`, `src/routes/api.requests.$requestRef.*.ts`, and `src/routes/oauth.*.ts`.
  - Auth: Clerk API keys, OAuth bearer challenges, and Convex-backed grant/client state in `src/lib/server/customer-request-agent-oauth-store.ts`.

**Provider execution and payments:**
- Registered HTTP JSON providers - Calls to capability-published public HTTPS endpoints with bounded request/response and reconciliation/cancellation contracts.
  - SDK/Client: `fetch`, `undici`, and the admission/runtime seams in `src/modules/capability-supply/internal/transport-adapters.ts` and `src/modules/capability-supply/route-transport-runtime.ts`.
  - Auth: Registered `env:NAME` credential references resolved server-side by `src/modules/capability-supply/internal/credential-runtime.ts`; public `none` is allowed only for eligible HTTP JSON bindings.
- x402/EVM providers - Payment-challenged HTTP calls, exact scheme validation, EVM signatures, and payment/reconciliation evidence.
  - SDK/Client: `@x402/core`, `@x402/evm`, `@x402/extensions`, and `viem` in `src/modules/capability-supply/internal/x402-payment-signer.ts` and `src/modules/capability-supply/route-transport-runtime.ts`.
  - Auth: Registered credential references and spend authority; the credential is never accepted directly from browser input.
- Stripe - Webhook and money-provider boundary exists, but the live provider is not configured in the current source.
  - SDK/Client: Injected verifier/applier ports in `src/modules/money/internal/stripe-webhook.ts`, route `src/routes/api.stripe.webhook.ts`, and internal actions in `convex/moneyStripe.ts`; no Stripe SDK import is present.
  - Auth: `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` are environment-contract names; default operations return `stripe_setup_required`.
- Google Maps - Optional client-side place-map iframe for generated answer and office artifacts.
  - SDK/Client: Google Maps Embed URL built by `src/components/ae/artifacts/AeGenerativeMap.tsx`.
  - Auth: `VITE_GOOGLE_MAPS_API_KEY`.

**Telemetry and analytics:**
- Sentry - Browser/server exception capture, tracing, and build sourcemap publication.
  - SDK/Client: `@sentry/react`, `@sentry/node`, and `@sentry/vite-plugin` in `src/lib/observability/` and `vite.config.ts`.
  - Auth: `VITE_SENTRY_DSN`, `SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, and `SENTRY_PROJECT`.
- PostHog - Pseudonymous client funnel events and server product analytics.
  - SDK/Client: `posthog-js` and `posthog-node` in `src/lib/observability/posthog.client.ts` and `src/lib/observability/posthog.server.ts`.
  - Auth: `VITE_POSTHOG_KEY` or `POSTHOG_KEY`; hosts use `VITE_POSTHOG_HOST` or `POSTHOG_HOST`.

## Data Storage

**Databases:**
- Convex - Durable source of truth for domain state, projections, evidence, OAuth clients/grants, notification outbox, answer threads, capability registry/supply, money records, and audit data.
  - Connection: `VITE_CONVEX_URL` for browser/server configuration, `CONVEX_URL` for server calls, and deployment credentials such as `CONVEX_DEPLOY_KEY` in CI.
  - Client: `convex/browser` `ConvexHttpClient` through `src/lib/server/convex-source.ts`; schemas and generated API are composed by `convex/schema.ts` and `convex/_generated/`.
- Convex components - Workflow, workpool, rate limiter, and aggregate state are mounted in `convex/convex.config.ts` and accessed through generated `components` references.

**File Storage:**
- No application-managed object/file-storage service is used by the active source. Local filesystem writes support development/evidence tooling such as `src/modules/action-invocation/development-file-x402-payment-attempt-port.ts` and `tools/dev/`; browser pointers use `localStorage`/`sessionStorage` in `src/components/ae/customer-request/AeCustomerRequestWorkspace.tsx` and `src/lib/ui/journey-events.ts`.

**Caching:**
- No external cache service is configured. In-process caches hold model-provider factories in `src/modules/model-gateway/public.ts`, model catalog data in `src/modules/answer/internal/openrouter-models.ts`, and compiled validators in `src/modules/capability-contract/public.ts`.

## Authentication & Identity

**Auth Provider:**
- Clerk with Convex JWT trust - `src/start.ts` installs Clerk middleware except for a guarded local E2E bypass, while `src/routes/__root.tsx` mounts `ClerkProvider` only on authenticated route families.
  - Implementation: `convex/auth.config.ts` validates `CLERK_JWT_ISSUER_DOMAIN` with application ID `convex`; `src/lib/server/convex-source.ts` requests the Clerk `convex` token template for authenticated Convex clients.
  - Agent identity: `src/lib/server/customer-request-agent-auth.ts` validates API-key type, scope, revocation/expiry, and authority mode; `src/modules/customer-request/agent-access.functions.ts` creates, lists, reads, and revokes owner-managed Clerk API keys.
  - OAuth state: Device authorization, registration, authorization, and token routes persist clients/grants through Convex using `src/lib/server/customer-request-agent-oauth-store.ts`.

## Monitoring & Observability

**Error Tracking:**
- Sentry is optional and fail-closed when DSNs or build credentials are absent. `src/lib/observability/sentry.client.ts`, `src/lib/observability/sentry.server.ts`, and `src/start.ts` sanitize route-scoped exceptions and initialize isolation scopes.

**Logs:**
- Application/provider outcomes are represented by typed results, redacted payloads, stable hashes, and Convex audit/outbox records in `src/lib/server/notification-provider.ts`, `src/lib/observability/`, and `convex/observability.ts`; no separate log aggregation client is present.
- PostHog request-boundary flushing is handled by `src/start.ts`, with telemetry disable controls in `src/lib/observability/config.ts` and `VITE_AE_DISABLE_OBSERVABILITY`/`AE_DISABLE_OBSERVABILITY`.

## CI/CD & Deployment

**Hosting:**
- Vercel hosts the Nitro server bundle with the `vercel` preset and Node.js 22 functions configured in `vite.config.ts`; `.vercel/project.json` records the project linkage.
- Convex hosts the database and server functions; deployment uses the exact checkout revision in `.github/workflows/kernel-release-gate.yml`.

**CI Pipeline:**
- GitHub Actions runs source proof, frozen `npm ci`, type/lint/codegen/tests/build, and sanitized artifacts in `.github/workflows/kernel-release-gate.yml`.
- The same workflow deploys Vercel and Convex on `main`, verifies deployment environment names, seeds labelled sandbox supply, and runs hosted Customer Request readback.
- `.github/workflows/react-doctor.yml` runs advisory React Doctor checks on pull requests and `main` pushes.

## Environment Configuration

**Required env vars:**
- Core browser/server identity and data: `VITE_CONVEX_URL`, `CONVEX_URL`, `VITE_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, and `CLERK_JWT_ISSUER_DOMAIN`.
- Source and route admission: scoped `AE_SOURCE_WRITE_*` names, `AE_CONVEX_SERVER_FUNCTION_TOKEN`, `AE_ROUTE_CALL_SIGNING_SECRET`, and `AE_ROUTE_CALL_SIGNING_KEY_ID`.
- Model and site identity: `OPENROUTER_API_KEY`, `AE_LLM_MODEL`, `AE_CUSTOMER_REQUEST_MODEL`, `AE_SITE_URL`, and `SITE_URL` where their respective runtime seams require them.
- Notifications and billing boundaries: `AE_NOTIFICATION_OUTBOX_SECRET`, `RESEND_*`, `NOVU_*`, and the reserved `STRIPE_*`/`AUTUMN_*` names documented in `.env.example`.
- Telemetry and client embeds: `VITE_SENTRY_DSN`, `SENTRY_DSN`, `VITE_POSTHOG_KEY`, `POSTHOG_KEY`, and `VITE_GOOGLE_MAPS_API_KEY` when those integrations are enabled.

**Secrets location:**
- Local values belong in ignored `.env.local`/`.env.*` files; `.env.example` contains names and non-secret contract guidance only.
- CI deployment values are supplied as GitHub Actions secrets in `.github/workflows/kernel-release-gate.yml`; Convex runtime values are read from the target deployment with `npx convex env get`.
- Vercel and Convex deployment environments hold production credentials; no secret values are committed in the repository mapping.

## Webhooks & Callbacks

**Incoming:**
- `POST /api/notification/resend-webhook` - Resend delivery events; `src/routes/api.notification.resend-webhook.ts` verifies raw-body Svix headers and records a redacted Convex event.
- `POST /api/stripe/webhook` - Stripe signature boundary in `src/routes/api.stripe.webhook.ts`; current default verifier/applier refuses with `stripe_setup_required`.
- `GET/POST/DELETE /mcp` - MCP streamable HTTP session and tool callbacks handled by `src/routes/mcp.ts`.
- `/oauth/device_authorization`, `/oauth/register`, `/oauth/authorize`, and `/oauth/token` - OAuth agent lifecycle callbacks in `src/routes/oauth.*.ts`.

**Outgoing:**
- OpenRouter model and catalog requests from `src/modules/model-gateway/public.ts` and `src/modules/answer/internal/openrouter-models.ts`.
- Resend email requests and Novu trigger/readback requests from `src/lib/server/notification-provider.ts`.
- Clerk user/API-key requests from `src/lib/server/customer-request-agent-auth.ts`, `src/modules/customer-request/agent-access.functions.ts`, and owner delivery lookup code.
- Registered provider HTTP/MCP/x402 calls from `src/modules/capability-supply/route-transport-runtime.ts`; target URLs are admitted and DNS-guarded before execution.
- Sentry/PostHog telemetry and browser Google Maps iframe requests from `src/lib/observability/` and `src/components/ae/artifacts/AeGenerativeMap.tsx`.

---

*Integration audit: 2026-08-02*
