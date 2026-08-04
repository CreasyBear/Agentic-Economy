# External Integrations

**Analysis Date:** 2026-08-04

## APIs & External Services

**Identity and authentication:**
- Clerk - Browser sign-in, TanStack server sessions, Convex JWT trust, owner delivery lookup, and customer-request agent API-key lifecycle.
  - SDK/Client: `@clerk/tanstack-react-start` in `src/start.ts`, `src/routes/__root.tsx`, and `src/lib/server/`; server API-key operations use `clerkClient().apiKeys` in `src/lib/server/customer-request-agent-auth.ts` and `src/modules/customer-request/agent-access.functions.ts`.
  - Auth: `VITE_CLERK_PUBLISHABLE_KEY` follows the Clerk client convention; `CLERK_SECRET_KEY` is read by `src/lib/server/notification-provider.ts`; `CLERK_JWT_ISSUER_DOMAIN` is required by `convex/auth.config.ts`.

**AI and model providers:**
- OpenRouter - Structured model responses, tool calls, follow-up intent classification, and web-search-grounded enrichment through the Vercel AI SDK.
  - SDK/Client: `ai` and `@openrouter/ai-sdk-provider`, centralized by `src/modules/model-gateway/public.ts`; consumers include `src/modules/answer/internal/answer-tool-use-agent.ts`, `src/modules/customer-request/openrouter-transport.ts`, and `src/modules/storefront/internal/business-enrichment.ts`.
  - Auth: `OPENROUTER_API_KEY`; model and endpoint controls are `AE_LLM_MODEL`, `AE_OPENROUTER_API_BASE_URL`, `AE_CUSTOMER_REQUEST_MODEL`, `AE_SITE_URL`, and `SITE_URL` in `src/modules/model-gateway/public.ts` and `convex/customerRequestApplication.ts`.

**Notifications and messaging:**
- Resend - Owner inquiry email delivery and signed delivery-event ingestion.
  - SDK/Client: A bounded server `fetch` adapter in `src/lib/server/notification-provider.ts`; dispatch and webhook handlers are `src/routes/api.notification.resend-dispatch.ts` and `src/routes/api.notification.resend-webhook.ts`.
  - Auth: `RESEND_API_KEY`, `RESEND_FROM`, `RESEND_WEBHOOK_SECRET`, `RESEND_API_BASE_URL`, and the internal `AE_NOTIFICATION_OUTBOX_SECRET`.
- Novu - Inquiry workflow trigger plus transaction/message readback for owner and customer recipients.
  - SDK/Client: A bounded server `fetch` adapter in `src/lib/server/notification-provider.ts`; dispatch is handled by `src/routes/api.notification.novu-dispatch.ts`.
  - Auth: `NOVU_SECRET_KEY`, `NOVU_WORKFLOW_INQUIRY_OWNER`, optional `NOVU_WORKFLOW_INQUIRY_CUSTOMER`, and optional `NOVU_API_BASE_URL`.
- React Email - WorkTree memo HTML rendering before the same idempotent logical notification is queued.
  - SDK/Client: `@react-email/components` and `@react-email/render` in `src/modules/work-tree/internal/memo.tsx` and `src/modules/work-tree/internal/memo-notification.ts`.
  - Auth: None; provider credentials are consumed later by the notification adapters.

**Agent-facing protocols:**
- Model Context Protocol - Hosted streamable HTTP action server and dynamic provider MCP JSON-RPC transport.
  - SDK/Client: `@modelcontextprotocol/sdk` with `WebStandardStreamableHTTPServerTransport` in `src/lib/server/mcp-api.ts`; the host route is `src/routes/mcp.ts`.
  - Auth: Anonymous calls are limited to read-only registered actions; protected calls use Clerk API-key bearer authentication and authority modes from `src/lib/server/customer-request-agent-auth.ts` and `src/modules/customer-request/agent-contract.ts`.
- Customer Request REST and OAuth - Agent request creation, route execution, evidence/readback, cancellation, repeat permission, and OAuth device/authorization-code flow.
  - SDK/Client: TanStack Start handlers in `src/routes/api.v1.requests.ts`, `src/routes/api.v1.requests.$requestRef.*.ts`, `src/routes/api.requests.ts`, `src/routes/api.requests.$requestRef.*.ts`, and `src/routes/oauth.*.ts`.
  - Auth: Clerk API keys, bearer challenges from `src/lib/http/oauth-challenge.ts`, and Convex-backed client/grant state in `src/lib/server/customer-request-agent-oauth-store.ts` and `convex/customerRequestAgentOAuth.ts`.

**Provider execution and payments:**
- Registered HTTP JSON providers - AE calls admitted public HTTPS endpoints with bounded request/response, idempotency, reconciliation, and cancellation contracts.
  - SDK/Client: `fetch`/`undici` through `src/modules/capability-supply/internal/transport-adapters.ts`, `src/modules/capability-supply/route-transport-runtime.ts`, and `convex/customerRequestRouteTransportWorker.ts`.
  - Auth: Bindings use `none` only for eligible public HTTP JSON calls or `env:NAME` credential references resolved from the Convex action environment; browser input never supplies provider credentials.
- Provider MCP JSON-RPC - AE performs initialize/notification/tool-call exchanges against an admitted provider MCP endpoint.
  - SDK/Client: JSON-RPC framing, protocol headers, bounded parsing, and session handling are implemented in `src/modules/capability-supply/route-transport-runtime.ts`.
  - Auth: Registered `env:NAME` credentials and AE call headers; admission rejects public credentials for MCP bindings in `src/modules/capability-supply/internal/transport-adapters.ts`.
- x402/EVM providers - AE validates a 402 payment challenge, applies spend/expiry/asset checks, creates an exact EVM payment signature, submits the second request, and records payment/reconciliation evidence.
  - SDK/Client: `@x402/core`, `@x402/evm`, `@x402/extensions`, and `viem` in `src/modules/capability-supply/internal/x402-payment-signer.ts` and `src/modules/capability-supply/route-transport-runtime.ts`.
  - Auth: Registered `env:NAME` credentials, AE route-call signatures from `AE_ROUTE_CALL_SIGNING_SECRET` and `AE_ROUTE_CALL_SIGNING_KEY_ID`, and Convex-backed payment authorization in `convex/customerRequestRouteTransportWorker.ts`.
- Stripe - Money and webhook boundaries exist, but the route's default verifier/applier refuses with `stripe_setup_required` and no Stripe SDK import is present.
  - SDK/Client: Injected verifier/applier ports in `src/modules/money/internal/stripe-webhook.ts` and `src/routes/api.stripe.webhook.ts`.
  - Auth: The webhook boundary reads a `stripe-signature` header; `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` appear in the provider-secret collision guard in `src/lib/server/source-write-admission.ts`, not as a configured live client.
- Google Maps - Optional client-side place-map iframe for generated answer and office artifacts.
  - SDK/Client: Google Maps Embed URL construction in `src/components/ae/artifacts/AeGenerativeMap.tsx`.
  - Auth: `VITE_GOOGLE_MAPS_API_KEY`; no map is rendered when it is absent.

**Telemetry and analytics:**
- Sentry - Browser/server exception capture, route tracing, sanitized events, and optional build sourcemap publication.
  - SDK/Client: `@sentry/react` and `@sentry/node` in `src/lib/observability/sentry.client.ts` and `src/lib/observability/sentry.server.ts`; `@sentry/vite-plugin` is configured in `vite.config.ts`.
  - Auth: `VITE_SENTRY_DSN`/`SENTRY_DSN` at runtime and `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, and `SENTRY_PROJECT` for sourcemap upload in `vite.config.ts`.
- PostHog - Pseudonymous client funnel/product events and server-side event capture.
  - SDK/Client: `posthog-js` and `posthog-node` in `src/lib/observability/posthog.client.ts` and `src/lib/observability/posthog.server.ts`.
  - Auth: `VITE_POSTHOG_KEY` or `POSTHOG_KEY`; host overrides are `VITE_POSTHOG_HOST` or `POSTHOG_HOST`, with optional app URL names in `src/lib/observability/config.ts`.

## Data Storage

**Databases:**
- Convex - Durable source of truth for domain state, projections, evidence, OAuth clients/grants, answer threads, capability supply/registry, notifications, money records, work trees, studies, and audit data.
  - Connection: `VITE_CONVEX_URL` and `CONVEX_URL` are read by `src/lib/server/convex-source.ts`; deployment tooling uses `CONVEX_DEPLOYMENT` and `CONVEX_DEPLOY_KEY` in `tools/` and `.github/workflows/kernel-release-gate.yml`.
  - Client: `convex/browser` `ConvexHttpClient` is wrapped by `src/lib/server/convex-source.ts`; table composition is in `convex/schema.ts`, and generated references are in `convex/_generated/`.
- Convex components - Workflow, workpool, rate-limiter, and aggregate component state is mounted in `convex/convex.config.ts` and accessed through `convex/_generated/api` component references.
  - Connection: Component deployment configuration is declared in `convex/convex.config.ts`.
  - Client: `@convex-dev/workflow`, `@convex-dev/workpool`, `@convex-dev/rate-limiter`, and `@convex-dev/aggregate` APIs in `convex/` and `src/lib/server/rate-limit.ts`.

**File Storage:**
- No external object-storage service or Convex `ctx.storage` call is used by the active application source; browser continuity pointers use `localStorage`/`sessionStorage` in `src/components/ae/` and `src/lib/ui/journey-events.ts`.
- Development-only payment attempt snapshots use local filesystem writes through `src/modules/action-invocation/development-file-x402-payment-attempt-port.ts`; this is not the production data store.

**Caching:**
- No external cache service is configured in `package.json` or runtime configuration.
- In-process caches hold the OpenRouter provider factory in `src/modules/model-gateway/public.ts` and model-catalog data in `src/modules/answer/internal/openrouter-models.ts`; browser session storage provides optional UI continuity in `src/components/ae/chat/AeChat.tsx`.

## Authentication & Identity

**Auth Provider:**
- Clerk with Convex JWT trust - `src/start.ts` installs Clerk request middleware, while `src/routes/__root.tsx` mounts `ClerkProvider` for sign-in, sign-up, owner, admin, and claim route families.
  - Implementation: `convex/auth.config.ts` requires `CLERK_JWT_ISSUER_DOMAIN` and trusts application ID `convex`; `src/lib/server/convex-source.ts` requests the Clerk `convex` token template for authenticated Convex clients.
  - Agent identity: `src/lib/server/customer-request-agent-auth.ts` validates API-key subject, scope, revocation, and expiry; `src/modules/customer-request/agent-access.functions.ts` creates, lists, and revokes owner-managed Clerk API keys.
  - OAuth state: `src/routes/oauth.device_authorization.ts`, `src/routes/oauth.register.ts`, `src/routes/oauth.authorize.ts`, and `src/routes/oauth.token.ts` persist client/grant state through `src/lib/server/customer-request-agent-oauth-store.ts` and Convex functions.
  - Local testing: `src/lib/server/local-e2e-bypass.ts` permits a non-production Clerk bypass only when `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E` is enabled and the local Convex admin key is available.

## Monitoring & Observability

**Error Tracking:**
- Sentry is optional and fail-closed when DSN configuration is absent; `src/start.ts`, `src/lib/observability/sentry.client.ts`, and `src/lib/observability/sentry.server.ts` sanitize route-scoped errors and initialize isolation scopes.

**Logs:**
- Provider outcomes, webhook payloads, and notification operations are represented by typed results, redacted payloads, stable hashes, and Convex audit/outbox records in `src/lib/server/notification-provider.ts`, `convex/notificationOutbox.ts`, and `convex/observability.ts`.
- PostHog request-boundary flushing is handled by `src/start.ts`; disable controls are read from `src/lib/observability/config.ts` using `VITE_AE_DISABLE_OBSERVABILITY` or `AE_DISABLE_OBSERVABILITY`.
- No separate log-aggregation client is configured in `package.json` or `.github/workflows/kernel-release-gate.yml`.

## CI/CD & Deployment

**Hosting:**
- Vercel hosts the Nitro server bundle using the `vercel` preset and Node 22 functions from `vite.config.ts`; `.vercel/project.json` records the linked project metadata.
- Convex hosts the database and server functions; deployment configuration and component mounting are in `convex/convex.config.ts` and `convex/schema.ts`.

**CI Pipeline:**
- GitHub Actions runs `.github/workflows/kernel-release-gate.yml` for pushes, pull requests, merge groups, and manual dispatch; it performs frozen `npm ci`, source release proof, type/lint/codegen/tests/build, and sanitized artifact upload.
- The hosted job deploys the exact source revision through `tools/release/deploy-customer-request-git-source.ts` and `npx convex deploy`, reads target Convex environment settings, seeds sandbox supply, and runs authenticated Customer Request and WorkTree readback smoke paths.
- CI credentials are supplied through GitHub Actions secret references such as `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, and `CONVEX_DEPLOY_KEY`; no values are committed in source maps.

## Environment Configuration

**Required env vars:**
- Connection and identity: `VITE_CONVEX_URL`, `CONVEX_URL`, `CONVEX_DEPLOYMENT`, `CONVEX_DEPLOY_KEY`, `VITE_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, and `CLERK_JWT_ISSUER_DOMAIN`.
- Model and canonical site: `OPENROUTER_API_KEY`, `AE_LLM_MODEL`, `AE_LLM_MODELS`, `AE_CUSTOMER_REQUEST_MODEL`, `AE_OPENROUTER_API_BASE_URL`, `AE_SITE_URL`, `SITE_URL`, and `AE_CANONICAL_BASE_URL`/`AE_CANONICAL_HOST_ALLOWLIST`.
- Source, service, and route admission: `AE_SOURCE_WRITE_SECRET`, scoped `AE_SOURCE_WRITE_*` names, `AE_CONVEX_SERVER_FUNCTION_TOKEN`, `AE_ROUTE_CALL_SIGNING_SECRET`, `AE_ROUTE_CALL_SIGNING_KEY_ID`, `AE_NOTIFICATION_OUTBOX_SECRET`, and dynamic provider credentials referenced as `env:NAME`.
- Notifications: `RESEND_API_KEY`, `RESEND_FROM`, `RESEND_WEBHOOK_SECRET`, `RESEND_API_BASE_URL`, `NOVU_SECRET_KEY`, `NOVU_WORKFLOW_INQUIRY_OWNER`, `NOVU_WORKFLOW_INQUIRY_CUSTOMER`, and `NOVU_API_BASE_URL`.
- Telemetry and optional embeds: `VITE_SENTRY_DSN`, `SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `VITE_POSTHOG_KEY`, `POSTHOG_KEY`, `VITE_POSTHOG_HOST`, `POSTHOG_HOST`, and `VITE_GOOGLE_MAPS_API_KEY`.
- Hosted proof and local controls: `VERCEL_TOKEN`, `VERCEL_AUTOMATION_BYPASS_SECRET`, `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E`, `CONVEX_SELF_HOSTED_ADMIN_KEY`, and the deployment/smoke variables consumed by `tools/release/` and `tests/deploy-smoke/`.

**Secrets location:**
- Local values belong in ignored `.env.local`/`.env.*` files; `.env.example` is present as a checked-in configuration template, and `.vercel/.env.production.local` is present for Vercel-local configuration.
- CI deployment values are supplied through GitHub Actions secret references in `.github/workflows/kernel-release-gate.yml`; Convex runtime values are held by the target deployment and read by Convex CLI commands.
- Browser-visible `VITE_` values are bundled into the client only where an integration requires them; server credentials and provider `env:NAME` material remain in Node/Convex action environments.

## Webhooks & Callbacks

**Incoming:**
- `POST /api/notification/resend-webhook` - Resend delivery events; `src/routes/api.notification.resend-webhook.ts` bounds the raw body, verifies the provider signature, and ingests a redacted event through Convex.
- `POST /api/notification/resend-dispatch` and `POST /api/notification/novu-dispatch` - Authorized notification outbox dispatch callbacks handled by `src/routes/api.notification.resend-dispatch.ts` and `src/routes/api.notification.novu-dispatch.ts`.
- `POST /api/stripe/webhook` - Stripe signature boundary in `src/routes/api.stripe.webhook.ts`; the default injected verifier/applier returns `stripe_setup_required` rather than contacting Stripe.
- `GET/POST/DELETE /mcp` - Streamable HTTP MCP session and tool protocol handled by `src/routes/mcp.ts`.
- `/oauth/device_authorization`, `/oauth/register`, `/oauth/authorize`, and `/oauth/token` - Agent OAuth lifecycle endpoints in `src/routes/oauth.device_authorization.ts`, `src/routes/oauth.register.ts`, `src/routes/oauth.authorize.ts`, and `src/routes/oauth.token.ts`.
- `GET/POST /api/sandbox/providers/route-resolver` and `GET/POST /api/sandbox/providers/route-quoter` - AE sandbox provider discovery and request endpoints in `src/routes/api.sandbox.providers.route-resolver.ts`, `src/routes/api.sandbox.providers.route-quoter.ts`, and `src/lib/server/sandbox-capability-provider.ts`.

**Outgoing:**
- OpenRouter model requests and web-search plugin calls from `src/modules/model-gateway/public.ts` through the `ai` SDK.
- Clerk user/API-key requests from `src/lib/server/customer-request-agent-auth.ts`, `src/modules/customer-request/agent-access.functions.ts`, and `src/lib/server/notification-provider.ts`.
- Resend email and Novu workflow/readback requests from `src/lib/server/notification-provider.ts`.
- Registered provider HTTP, MCP, and x402 calls from `src/modules/capability-supply/route-transport-runtime.ts`; `convex/customerRequestRouteTransportWorker.ts` guards DNS, endpoint visibility, credentials, and payment custody.
- Sentry/PostHog telemetry and Google Maps browser iframe requests from `src/lib/observability/` and `src/components/ae/artifacts/AeGenerativeMap.tsx`.

---

*Integration audit: 2026-08-04*
