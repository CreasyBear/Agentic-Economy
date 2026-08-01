---
name: External integrations
analysis_date: 2026-08-01
refreshed: 2026-08-01
scope: Full repository external services, protocols, adapters, webhooks, and operations
---

# External Integrations

## Integration posture

The application keeps Convex as the source of truth and places third-party calls behind narrow server/module seams. Browser code receives only explicitly `VITE_*` configuration; provider secrets are read on the server or in Convex actions. Provider outcomes are generally converted into redacted, hashed, idempotent source-owned records rather than exposing raw credentials or payloads.

The main request path is TanStack Start/Nitro on Vercel, with Clerk-authenticated calls into Convex. Convex owns durable domain state and schedules/records work; Vercel route handlers own raw HTTP bodies and third-party webhook/provider calls that need the Node/Web Crypto runtime.

## Integration inventory

| Service/protocol | Role | Evidence in repository | Configuration/status |
| --- | --- | --- | --- |
| Clerk | User auth, JWT issuer, owner lookup, agent API keys, conditional UI provider | `src/start.ts`, `src/routes/__root.tsx`, `convex/auth.config.ts`, `src/lib/server/customer-request-agent-auth.ts`, `src/lib/server/notification-provider.ts` | Active. `VITE_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `CLERK_JWT_ISSUER_DOMAIN`. |
| Convex | Database, queries/mutations/actions, auth-backed source of truth, durable OAuth/notification/search state | `convex/convex.config.ts`, `convex/schema.ts`, `src/lib/server/convex-source.ts` | Active. `VITE_CONVEX_URL`/`CONVEX_URL`, Convex deployment credentials in CI. |
| OpenRouter | LLM inference, model catalog, structured outputs, web-search plugin | `src/modules/model-gateway/public.ts`, `src/modules/answer/internal/openrouter-models.ts` | Active when `OPENROUTER_API_KEY` is present; deterministic paths remain available without it. |
| Meilisearch | Optional generated catalog search mirror | `src/modules/registry/internal/catalog-search-port.ts`, `src/modules/registry/registry.functions.ts` | Optional/rollout-controlled. `AE_SEARCH_BACKEND` defaults to Convex; `dual` shadows Meili; failures/empty hits fall back to Convex. |
| Resend | Owner inquiry email delivery and signed webhook ingestion | `src/lib/server/notification-provider.ts`, `src/routes/api.notification.resend-dispatch.ts`, `src/routes/api.notification.resend-webhook.ts` | Active when configured. API `https://api.resend.com`; webhook uses Svix headers/signature. |
| Novu | Inquiry notification workflow trigger and message-delivery readback | `src/lib/server/notification-provider.ts`, `src/routes/api.notification.novu-dispatch.ts` | Active when configured; owner workflow required, customer workflow optional. API `https://api.novu.co`. |
| Sentry | Browser/server errors, tracing, release source maps | `src/lib/observability/sentry.client.ts`, `src/lib/observability/sentry.server.ts`, `vite.config.ts` | Optional and fail-closed when DSN/credentials are absent. |
| PostHog | Client/server funnel and product analytics | `src/lib/observability/posthog.client.ts`, `src/lib/observability/posthog.server.ts` | Optional and disabled by `VITE_AE_DISABLE_OBSERVABILITY`/`AE_DISABLE_OBSERVABILITY`. |
| Google Maps | Lazy embedded place maps in generated answer/office artifacts | `src/components/ae/artifacts/AeGenerativeMap.tsx`, `src/lib/http/security-headers.ts` | Optional; component returns no iframe without `VITE_GOOGLE_MAPS_API_KEY`. |
| MCP | Hosted action/tool endpoint for assistants; dynamic provider MCP transport | `src/lib/server/mcp-api.ts`, `src/routes/mcp.ts`, `src/modules/capability-supply/route-transport-runtime.ts` | Active protocol surface. Anonymous MCP is read-only; writes require agent auth/authority. |
| OAuth 2.0-style agent flow | Device authorization, authorization code, registration, bearer metadata | `src/lib/server/customer-request-agent-oauth-api.ts`, `src/routes/oauth.device_authorization.ts`, `src/routes/oauth.token.ts` | Active, Convex-backed; Clerk owner session/API-key operations complete grants. |
| x402/EVM | Payment-challenged provider calls and EVM payment signatures | `src/modules/capability-supply/internal/x402-payment-signer.ts`, `src/modules/capability-supply/route-transport-runtime.ts` | Active only for registered `x402-fetch:v2` bindings with configured credential and authority. |
| Stripe | Planned money provider interface, webhook route, ledger evidence model | `src/routes/api.stripe.webhook.ts`, `src/modules/money/internal/stripe-webhook.ts`, `convex/moneyStripe.ts` | Scaffold/disabled. Default verifier, applier, and Convex provider actions return `stripe_setup_required`; no live Stripe SDK import. |
| Autumn | Declared billing-provider configuration | `.env.example`, `src/modules/security/source-write-admission.ts` | No active Autumn adapter/call was found in application source; variables are reserved/config-contract only. |
| Vercel | Production web hosting/deployment and Node serverless runtime | `vite.config.ts`, `.vercel/project.json`, `.github/workflows/kernel-release-gate.yml` | Active production target. Nitro preset `vercel`, functions `nodejs20.x`. |
| GitHub Actions | Source proof, exact-revision Vercel/Convex deploy, hosted readback, React Doctor | `.github/workflows/kernel-release-gate.yml`, `.github/workflows/react-doctor.yml` | Active CI/release automation. |
| Cloudflare Workers/Wrangler | Reserved routing-edge example/check and WBA ecosystem references | `package.json`, `.env.example`, `research/`/ADR material | Not an active app deployment in this checkout; `examples/routing-edge` is referenced but absent from the checked-in examples tree. |

## Clerk authentication and identity

### Browser and request middleware

- `src/start.ts` installs `clerkMiddleware()` unless `isLocalE2EAuthBypassEnabled()` is true. The bypass is guarded against production use (`src/lib/server/local-e2e-bypass.ts`).
- `src/routes/__root.tsx` mounts `ClerkProvider` only for sign-in/sign-up, owner, admin, and claim paths. Clerk appearance variables and control sizing are centralized there.
- Server functions such as `src/lib/server/claim-owner-session.ts` and `src/lib/server/require-operator-session.ts` call Clerk `auth()` for owner/operator gates.

### Convex JWT trust

- `convex/auth.config.ts` requires `CLERK_JWT_ISSUER_DOMAIN` and registers Clerk with `applicationID: 'convex'`.
- `src/lib/server/convex-source.ts` asks Clerk for a `convex` token template and passes it to `ConvexHttpClient`; missing auth or missing Convex URL becomes a typed HTTP error.
- `convex/authz.ts` resolves owner/admin identity from the Convex `UserIdentity`, linking rows by Clerk subject/token identity.

### Clerk API keys for agents

- `src/lib/server/customer-request-agent-auth.ts` accepts Clerk API-key bearer auth, checks required scopes, and re-reads key state with `clerkClient().apiKeys.get(keyId)` to reject revocation/expiry/scope drift.
- `src/modules/customer-request/agent-access.functions.ts` wraps Clerk `apiKeys.list/create/get/getSecret/revoke` for owner-managed customer-request agent credentials.
- `src/lib/server/customer-request-agent-oauth-api.ts` consumes Clerk API-key secrets after OAuth grants and issues the agent credential used by customer-request/MCP calls.
- `src/lib/server/notification-provider.ts` calls `https://api.clerk.com/v1/users/{clerkUserId}` with `CLERK_SECRET_KEY` to resolve a primary owner email without returning the email address in provider readback; it stores an address hash/redacted value.

## Convex data/backend integration

- `convex/schema.ts` merges domain-owned table groups, including `moneyStripeEvents`, notification outbox/attempt state, OAuth clients/grants, registry index status, capability bindings, answer threads, and audit/evidence records.
- `convex/convex.config.ts` mounts `@convex-dev/workflow` and `@convex-dev/workpool`; release CI deploys the exact schema/functions with `npx convex deploy` (`.github/workflows/kernel-release-gate.yml`).
- `src/lib/server/convex-source.ts` exposes typed `sourceQuery`, `sourceMutation`, and `sourceAction` references. Server routes use authenticated or public `ConvexHttpClient` transports rather than importing generated internals directly.
- Convex actions are the execution point for some external calls and readiness probes; source state is written/read back through mutations so provider availability is not inferred from environment presence alone.
- CI checks production Convex settings through `npx convex env get` for route signing, sandbox provider key, and site URL before hosted lifecycle verification (`.github/workflows/kernel-release-gate.yml`).

## OpenRouter / Vercel AI SDK

- `src/modules/model-gateway/public.ts` creates the sole `@openrouter/ai-sdk-provider` instance and invokes it through `ai` (`generateText`/structured output). It adds `appName: 'Agentic Economy'`, optional `appUrl` from `SITE_URL`, provider fallback settings, usage accounting, and configured JSON/schema/reasoning options.
- `OPENROUTER_API_KEY` is server-only. `AE_LLM_MODEL` selects the default model; `AE_OPENROUTER_API_BASE_URL` is a test/local override; `SITE_URL` is forwarded as the OpenRouter app URL.
- `src/modules/answer/internal/openrouter-models.ts` makes an authenticated `GET https://openrouter.ai/api/v1/models`, caches the normalized catalog for two minutes, and uses fallback models if the catalog is unavailable.
- `src/modules/storefront/internal/business-enrichment.ts` enables OpenRouter's web plugin with a bounded result count and accepts a drafted fact only when the model returned a URL citation.
- `src/routes/api.answer.turn.ts` streams answer events to the browser as `text/event-stream`; the model gateway is upstream of this stream and is not directly exposed to clients.

## Meilisearch catalog mirror

- `src/modules/registry/internal/catalog-search-port.ts` configures a generic Meilisearch HTTP client from `MEILISEARCH_HOST`, `MEILISEARCH_ADMIN_KEY`, and `AE_SEARCH_INDEX_UID` (default `registry-search-documents`). Requests use `Authorization: Bearer`, a 1.5-second default timeout bounded to 250–10,000 ms, and a 50-hit maximum.
- Search calls `POST /indexes/{indexUid}/search`; index maintenance supports document add/replace, delete-batch, settings PATCH, and task readback (`/tasks/{taskUid}`).
- `src/modules/registry/registry.functions.ts` treats Convex as source of truth. `AE_SEARCH_BACKEND=convex` bypasses Meili, `dual` performs a shadow search while returning Convex results, and `meilisearch` hydrates Meili-ranked IDs from the Convex Offering projection.
- A Meili network error or a non-empty query with zero hits falls back to Convex, preventing stale/generated mirror state from being treated as proof of no listings.
- Registry index status and `meiliTaskUid` are modeled in `src/modules/registry/internal/schema.ts`; the search mirror is generated, not authoritative.

## Resend email and webhook integration

- `src/routes/api.notification.resend-dispatch.ts` accepts an internally authorized dispatch ID, reads the source-owned outbox projection from Convex, resolves the Clerk owner email, and sends through `POST https://api.resend.com/emails`.
- `src/lib/server/notification-provider.ts` sends `Authorization: Bearer ${RESEND_API_KEY}`, `RESEND_FROM`, recipient, subject/text, and `Idempotency-Key: providerIdempotencyKey`. It requires a provider message ID and records a stable response hash.
- The dispatch route requires `AE_NOTIFICATION_OUTBOX_SECRET` and rejects non-owner/non-Resend dispatches. It writes the provider result back through `notificationOutbox:dispatchNotificationOutbox`.
- `src/routes/api.notification.resend-webhook.ts` reads the raw body, verifies `svix-id`, `svix-timestamp`, and `svix-signature` with `RESEND_WEBHOOK_SECRET`, enforces a five-minute timestamp tolerance, and ingests only a redacted event summary into Convex.
- Webhook ingestion uses idempotent provider event IDs and records operation/correlation keys; raw provider payloads and secrets are not returned to the UI.

## Novu notification integration

- `src/routes/api.notification.novu-dispatch.ts` reads a Convex notification outbox row, resolves a subscriber (owner via Clerk identity/email; customer via inquiry thread), and triggers `POST https://api.novu.co/v1/events/trigger`.
- `src/lib/server/notification-provider.ts` sends `Authorization: ApiKey ${NOVU_SECRET_KEY}`, an idempotency key/transaction ID, workflow name, subscriber target, and a redacted payload containing inquiry links and identifiers.
- Owner notifications require `NOVU_WORKFLOW_INQUIRY_OWNER`; customer notifications additionally require `NOVU_WORKFLOW_INQUIRY_CUSTOMER`. `NOVU_API_BASE_URL` permits local/provider-stub overrides.
- The route immediately reads `GET https://api.novu.co/v1/messages?transactionId=...` (bounded to ten messages), maps statuses (`sent`, `error`, warning/unknown), and records the readback hash with the Convex outbox mutation.
- Missing Novu configuration is recorded as a held/provider-missing result rather than treated as successful delivery. Existing transaction IDs are read back rather than re-triggered.

## Payments and billing

### Stripe seam (not live)

- `src/routes/api.stripe.webhook.ts` exposes `POST /api/stripe/webhook`, but its default verifier/applier are explicit setup-required functions.
- `src/modules/money/internal/stripe-webhook.ts` still enforces raw-body handling and the `stripe-signature` header shape, then delegates verification/application to injected ports; it returns `stripe_setup_required` with 503 when unconfigured.
- `convex/moneyStripe.ts` defines internal action ports for credit payments, Connect accounts/onboarding, transfers, and readbacks, but each handler currently returns `stripe_setup_required`.
- Money schemas and ledger paths preserve Stripe event/account/transfer identifiers and idempotency/reconciliation states (`src/modules/money/public.ts`, `src/modules/money/internal/convex-schema.ts`, `convex/moneyLedger.ts`).
- `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` are documented in `.env.example`, but no live Stripe SDK/client call was found in active source.

### Autumn configuration

- `.env.example` documents `AUTUMN_SECRET_KEY`, `AUTUMN_WEBHOOK_SECRET`, sandbox environment/project/API base/version/portal return values.
- `src/modules/security/source-write-admission.ts` explicitly prevents source-write keys from being reused as Autumn/Stripe provider secrets.
- No Autumn import, HTTP adapter, route, or webhook implementation was found in active `src/`, `convex/`, `tools/`, or `tests/` code; treat these variables as reserved deployment configuration rather than an active integration.

## MCP, OAuth, and agent-facing APIs

- `src/routes/mcp.ts` serves GET/POST/DELETE `/mcp` through the MCP SDK's streamable HTTP transport (`src/lib/server/mcp-api.ts`). Tool names derive from the action registry (`ae_${action.id}`), and tool schemas/output are registered from action contracts.
- Anonymous MCP admits only read-only actions. A POST tool call for a mutating action triggers Clerk API-key authentication and authority-mode admission (`inspect_only`, `approve_each`, or `bounded_mandate`) before the action is exposed.
- Customer-request agent REST routes under `src/routes/api.v1.requests.*.ts` and `src/routes/api.requests.*.ts` use bearer challenges and Clerk API-key authentication. `src/lib/http/oauth-challenge.ts` emits OAuth protected-resource metadata and scope challenges.
- `/oauth/device_authorization`, `/oauth/token`, `/oauth/register`, and `/oauth/authorize` are mapped by `src/routes/oauth.device_authorization.ts`, `src/routes/oauth.token.ts`, `src/routes/oauth.register.ts`, and `src/routes/oauth.authorize.ts`. `src/lib/server/customer-request-agent-oauth-store.ts` persists grants/clients through Convex.
- `src/routes/[.]well-known/oauth-protected-resource.ts` and `src/routes/[.]well-known/oauth-authorization-server.ts` publish discovery metadata. `src/components/ae/console/AeAssistantInstallFunnel.tsx` generates Claude/Codex MCP install commands against the site `/mcp` endpoint.

## Dynamic provider HTTP/MCP/x402 integration

- `src/modules/capability-supply/internal/transport-adapters.ts` admits only three adapter IDs: `http-json:v1`, `mcp-jsonrpc:v1`, and `x402-fetch:v2`. Each requires a public HTTPS endpoint, bounded config, a canonical config digest, and an `env:NAME` credential reference (public `none` is allowed only for HTTP JSON).
- `src/modules/capability-supply/route-transport-runtime.ts` executes admitted bindings. HTTP JSON supports bounded GET/POST requests, request/cancellation endpoints, manual redirects, and normalized JSON response evidence. MCP performs `initialize`, `notifications/initialized`, then `tools/call` using `MCP-Protocol-Version` and optional session IDs.
- `convex/capabilitySupplyReadiness.ts` probes provider endpoints with `undici` and a guarded DNS resolver, rejects private/unsafe targets, limits response bodies to 64 KiB, and records health/readiness back into Convex.
- `src/modules/network-guard/public.ts` supplies target validation; `src/modules/capability-supply/internal/credential-runtime.ts` resolves `env:NAME` references server-side, so provider credentials are never accepted from browser input.
- Dynamic provider URLs are data supplied by registered capability publications. The repository's sandbox/fixture URLs in `convex/devSeed.ts` and `src/modules/capability-supply/development-*.ts` are test/development providers, not fixed SaaS integrations.

### x402/EVM payment path

- `src/modules/capability-supply/route-transport-runtime.ts` first calls the provider, parses `402` `payment-required`, validates scheme/network/asset/pay-to/resource/expiry/spend ceiling, then obtains an authorization and retries with `Payment-Signature`.
- `src/modules/capability-supply/internal/x402-payment-signer.ts` uses `@x402/core`, `@x402/evm` `ExactEvmScheme`, payment-identifier extensions, and `viem/accounts.privateKeyToAccount`; credentials must be a 32-byte `0x` private key.
- Payment attempts are keyed by operation/attempt/effect generation and observed/reconciled through `src/modules/action-invocation/x402-payment-attempt.ts` and `src/modules/action-invocation/x402-payment-reconciliation-evidence.ts`. Provider `payment-response`/`provider-receipt` headers become hashed evidence, not trusted raw settlement proof.

## WBA/signature-agent discovery surface

- `src/routes/[.]well-known/http-message-signatures-directory.ts` serves public JWKs from `AE_WBA_DIRECTORY_PUBLIC_JWK_JSON` at `/.well-known/http-message-signatures-directory`, rejects private `d` material, and returns 404 when unconfigured.
- `.env.example` also documents `AE_WBA_SIGNATURE_AGENT_ALLOWLIST` and `AE_AGENT_PUBLIC_INQUIRY_ADMISSION_PRINCIPALS` for production agent admission. The active source scan found the public directory reader and signature-agent identity fields, but no installed WBA verification SDK or complete signature-agent verifier in the current checkout; do not describe the allowlist as live enforcement without additional implementation.
- Source-write admission for public/owner/billing/protected writes is a separate HMAC key-family mechanism (`src/modules/security/source-write-admission.ts`, `convex/sourceWriteAdmission.ts`) and should not be conflated with provider identity or WBA discovery.

## Google Maps embed

- `src/components/ae/artifacts/AeGenerativeMap.tsx` and `AeOfficeMap` build `https://www.google.com/maps/embed/v1/place` iframe URLs from a query/address and `VITE_GOOGLE_MAPS_API_KEY`.
- The component returns `null` when no client key exists. The iframe is lazy, sandboxed, and has a downgrade-compatible referrer policy.
- `src/lib/http/security-headers.ts` allows Google Maps/Google static assets in `script-src`, `img-src`, `connect-src`, and `frame-src`; no server-side geocoding call is present.

## Observability provider integrations

### Sentry

- `src/lib/observability/sentry.client.ts` initializes `@sentry/react` only when a client DSN exists and telemetry is allowed for the route. Browser tracing is wired to the TanStack Router; production traces use a 0.1 sample rate.
- `src/lib/observability/sentry.server.ts` initializes `@sentry/node` in the request middleware, captures exceptions with sanitized tags, and uses a 0.1 production trace rate.
- `vite.config.ts` enables `@sentry/vite-plugin` only when `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, and `SENTRY_PROJECT` are all present; sourcemaps follow the same enablement condition.

### PostHog

- `src/lib/observability/posthog.client.ts` lazy-loads `posthog-js`, uses `VITE_POSTHOG_HOST` (default `https://us.i.posthog.com`), disables automatic pageview/pageleave and session recording, and identifies a pseudonymous session ID.
- `src/lib/observability/posthog.server.ts` uses `posthog-node` with `POSTHOG_HOST`/`POSTHOG_KEY`, flushes at request boundaries, and emits sanitized funnel/product events.
- `src/lib/observability/private-route-safety.ts` blocks or sanitizes telemetry on private routes; `src/lib/observability/config.ts` provides the shared enable/disable/release/environment policy.

## Deployment and operational integrations

- `.github/workflows/kernel-release-gate.yml` runs npm source proof on Node 22, deploys the exact revision to Vercel with `tools/release/deploy-customer-request-git-source.ts`, deploys Convex with `npx convex deploy`, checks production Convex env values, seeds labelled sandbox supply, and runs hosted customer-request readback against `https://agentic-economy-phi.vercel.app`.
- `.github/workflows/react-doctor.yml` runs `millionco/react-doctor@v2` on pushes/PRs and posts GitHub review/status output; it is advisory by default.
- `.vercel/project.json` identifies the active Vercel project; `vite.config.ts` selects the Vercel Nitro preset and Node serverless runtime. `AE_CANONICAL_BASE_URL`, `AE_CANONICAL_HOST_ALLOWLIST`, `AE_CSP_REPORT_ONLY`, and `VERCEL_*`/GitHub release variables influence URL/security/release behavior.
- `src/lib/http/security-headers.ts` contains the external-origin CSP contract for Clerk, Convex, Sentry, PostHog, Google Maps, and Cloudflare challenge frames. `src/start.ts` applies these headers to every response.
- `wrangler` is a development dependency and `AE_ROUTING_PUBLIC_BASE_URL` points at a placeholder `workers.dev` origin in `.env.example`, but no checked-in worker source/config is present under `examples/`; the active production deployment remains Vercel plus Convex.

## Credential and failure boundaries

- Provider secrets are declared in `.env.example`; secret-bearing values must not be sent to browser code. Client-facing keys are limited to Clerk publishable key, PostHog client key, Google Maps embed key, and Convex URL.
- Notification dispatches require `AE_NOTIFICATION_OUTBOX_SECRET`; source writes use scoped key families (`AE_SOURCE_WRITE_KEY_*`/derived key IDs); both are checked before Convex mutations. `src/modules/security/source-write-admission.ts` rejects reuse of provider secrets such as Stripe/Autumn keys.
- Third-party calls use bounded timeouts, manual redirects, public-target validation where URLs are data, and redacted/hash-based readbacks. Resend webhooks verify raw bodies before parsing; Stripe has the same raw-body seam but remains unconfigured.
- Idempotency is propagated through Resend `Idempotency-Key`, Novu `transactionId`/`Idempotency-Key`, Convex outbox records, OAuth grant state, and x402 payment-attempt keys. A provider being configured is not itself treated as delivery/settlement proof.

## Analysis completion

_Completed external integration mapping on 2026-08-01; 180 lines._
