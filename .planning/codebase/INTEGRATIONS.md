---
last_mapped_commit: 63a451f43edea453d0a1a8d8502504433acf76fb
---

# External Integrations

**Analysis Date:** 2026-07-21

**Source Anchor:** commit `63a451f43edea453d0a1a8d8502504433acf76fb`, tree `16fee2f5321d7917f7f0bccd5d59e3d6a018be64`

## APIs & External Services

**Hosted paid Action Detail and agent handoff:**
- TanStack/Vercel HTTP surface — implemented host adapters for the paid-operation aggregate.
  - Agent creation/inspection/commands: `src/routes/api.v1.paid-operations.ts`, `src/routes/api.v1.paid-operations.$invocationRef.ts`, and `src/routes/api.v1.paid-operations.$invocationRef.commands.ts`.
  - Human creation/detail: `src/routes/actions.paid.new.tsx` and `src/routes/actions.paid.$invocationRef.tsx`.
  - Shared server adapter: `src/lib/server/hosted-paid-operation-runtime.ts` transports closed intent to Convex; lifecycle, provider, payment, and evidence truth remain source-owned in `convex/hostedPaidOperationGateway.ts` and `convex/hostedPaidOperation.ts`.
  - Human handoff: `src/modules/action-invocation/paid-operation-human-handoff.ts` projects a version-bound GET relation to `/actions/paid/$invocationRef`; it is navigation only and carries no authority or business truth.
  - Agent response projection: `src/lib/server/hosted-paid-operation-agent-api.ts` includes both current command relations and the human handoff. `src/modules/action-invocation/paid-operation-agent-command-contract.ts` excludes generic retry and exposes only the current source-owned continuation.
  - Auth: human Clerk session; agent Clerk API key with `paid_operation:invoke`; server-to-Convex agent calls add a short-lived service token using `AE_CONVEX_SERVER_FUNCTION_TOKEN` in `src/lib/server/hosted-paid-operation-runtime.ts` and `src/modules/action-invocation/hosted-paid-operation-service-auth.ts`.
  - Claim boundary: this is implemented hosted source and transport, but the action is a bounded evaluator sandbox. Providers A/B are labelled mock fixtures, endpoints use `.invalid`, and the UI says “No real payment” in `src/routes/actions.paid.new.tsx`.

**x402 payment transport:**
- x402 exact EVM signing — implemented source seam for registered capability-supply transport.
  - SDK/client: `@x402/core`, `@x402/evm`, `@x402/extensions`, and `viem` in `src/modules/capability-supply/internal/x402-payment-signer.ts`.
  - Admission: `x402-fetch:v2` configuration is validated in `src/modules/capability-supply/internal/transport-adapters.ts`, including HTTPS endpoint, environment-backed credential reference, network, asset, recipient, amount exponents, and timeout.
  - Runtime: `src/modules/capability-supply/route-transport-runtime.ts` obtains a 402 challenge, binds it to route-step spend/expiry authority, prepares an opaque-custody authorization, persists “possibly submitted” before the paid request, and records observed or reconciliation-required outcomes.
  - Credentials: references must use `env:NAME`; the transport resolves server-held credentials through a runtime port. No credential value is persisted in the paid-operation aggregate.
  - Evidence: provider headers can yield payment proof/receipt digests, while ambiguous post-release failures remain settlement `unknown` and reconciliation-required.
  - Claim boundary: this proves an implemented source/fixture transport contract. The hosted paid-operation trial in `convex/hostedPaidOperationGateway.ts` does not call a real x402 provider; it models x402 proposal, custody, attempt, and reconciliation semantics with labelled mock effects.

**LLM / model gateway:**
- OpenRouter — live raw-fetch integration for the answer tool-use agent.
  - Client: `src/modules/answer/internal/answer-tool-use-agent.ts` posts to `https://openrouter.ai/api/v1/chat/completions`; `src/modules/answer/internal/openrouter-models.ts` handles model metadata.
  - Auth: `OPENROUTER_API_KEY`; answer overrides `AE_LLM_MODEL`, `AE_LLM_MODELS`, and optional `AE_OPENROUTER_API_BASE_URL` in `src/modules/answer/internal/llm-config.ts`.
  - Convex configuration: `OPENROUTER_API_KEY` and `AE_CUSTOMER_REQUEST_MODEL` are declared in `convex/convex.config.ts` for Customer Request interpretation paths.
  - Runtime boundary: no OpenRouter SDK is in `package.json`; calls use raw `fetch`, bounded agent rounds, Zod-validated tool input, source-owned catalog tool execution, and answer gates in `src/modules/answer/internal/answer-tool-use-agent.ts`.
  - Eval boundary: Promptfoo and local reports under `eval/answer/` prove the declared eval set only; they do not establish hosted model availability or customer value.

**Authentication and identity:**
- Clerk — primary human session and API-key identity provider.
  - SDK/client: `@clerk/tanstack-react-start` in `src/start.ts` and server auth helpers under `src/lib/server/`.
  - Human paid operation: `auth()` is required by `src/lib/server/hosted-paid-operation-human-api.ts`.
  - Agent paid operation: `auth({ acceptsToken: 'api_key' })`, scope check, and live Clerk API-key revocation/expiry readback in `src/lib/server/hosted-paid-operation-agent-auth.ts`.
  - Convex JWT: issuer `CLERK_JWT_ISSUER_DOMAIN` and application ID `convex` in `convex/auth.config.ts`; authenticated Convex client token template is `convex` in `src/lib/server/convex-source.ts`.
  - Backend lookup: `src/lib/server/notification-provider.ts` uses the Clerk Backend API to resolve an owner's delivery email.
  - Auth configuration: `VITE_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, and `CLERK_JWT_ISSUER_DOMAIN` are the principal families referenced by current source/tooling.
  - Authority boundary: Clerk attributes the caller. Paid-operation authorization remains a separate source-owned command/state transition in `src/modules/action-invocation/paid-operation-application-service.ts` and `convex/hostedPaidOperationGateway.ts`.

**Notifications:**
- Resend — implemented email send and incoming delivery-event integration using raw `fetch`.
  - Client: `src/lib/server/notification-provider.ts`; dispatch route `src/routes/api.notification.resend-dispatch.ts`.
  - Auth/config: `RESEND_API_KEY`, `RESEND_FROM`, optional `RESEND_API_BASE_URL`; incoming verification uses `RESEND_WEBHOOK_SECRET`.
  - Incoming webhook: `POST /api/notification/resend-webhook` in `src/routes/api.notification.resend-webhook.ts`, verified using Svix headers/HMAC in `src/lib/server/notification-provider.ts`.
  - Coordination: `AE_NOTIFICATION_OUTBOX_SECRET` protects outbox operations backed by `src/modules/notification-outbox/` and `convex/notificationOutbox.ts`.
- Novu — implemented workflow trigger and message readback integration using raw `fetch`.
  - Client: `src/lib/server/notification-provider.ts`; dispatch route `src/routes/api.notification.novu-dispatch.ts`.
  - Auth/config: `NOVU_SECRET_KEY`, `NOVU_WORKFLOW_INQUIRY_OWNER`, optional `NOVU_WORKFLOW_INQUIRY_CUSTOMER`, and optional `NOVU_API_BASE_URL`.
  - Readback: bounded `/v1/messages` query by transaction and optional subscriber in `src/lib/server/notification-provider.ts`.
- Evidence boundary: `tests/deploy-smoke/resend-notification-smoke.spec.ts` and `tests/deploy-smoke/novu-notification-smoke.spec.ts` are provider-smoke harnesses; their presence does not establish a current passing hosted provider run.

**Search and maps:**
- Meilisearch — optional raw-HTTP catalog search backend in `src/modules/registry/internal/catalog-search-port.ts`.
  - Auth/config: `MEILISEARCH_HOST`, `MEILISEARCH_ADMIN_KEY`, `AE_SEARCH_INDEX_UID`, `AE_SEARCH_BACKEND`, and `AE_SEARCH_TIMEOUT_MS`.
  - Boundary: Convex remains the primary/fallback catalog source; no Meilisearch SDK is declared in `package.json`.
- Google Maps JavaScript API — optional browser map rendering in `src/components/ae/artifacts/AeGenerativeMap.tsx`.
  - Auth: `VITE_GOOGLE_MAPS_API_KEY`.
  - Network policy: Maps hosts are allowed in `src/lib/http/security-headers.ts`.

**Observability:**
- Sentry — client and server error/tracing integration in `src/lib/observability/sentry.client.ts` and `src/lib/observability/sentry.server.ts`.
  - SDK/client: `@sentry/react`, `@sentry/node`, and conditional `@sentry/vite-plugin` in `vite.config.ts`.
  - Runtime config: `VITE_SENTRY_DSN` or `SENTRY_DSN`, environment/release fields from `src/lib/observability/config.ts`; build upload uses `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, and `SENTRY_PROJECT` in `vite.config.ts`.
  - Privacy: telemetry is sanitized and suppressed for protected paths by `src/lib/observability/private-route-safety.ts`.
- PostHog — browser and server analytics in `src/lib/observability/posthog.client.ts` and `src/lib/observability/posthog.server.ts`.
  - SDK/client: `posthog-js` and `posthog-node`.
  - Auth/config: `VITE_POSTHOG_KEY` / `POSTHOG_KEY`, optional host/app URL variables; default ingest host is defined in `src/lib/observability/config.ts`.
  - Kill-switch: `VITE_AE_DISABLE_OBSERVABILITY` or `AE_DISABLE_OBSERVABILITY` in `src/lib/observability/config.ts`.

**Registered provider transports:**
- HTTP JSON, MCP JSON-RPC, and x402 are the registered adapter set in `src/modules/capability-supply/internal/transport-adapters.ts`, executed by `src/modules/capability-supply/route-transport-runtime.ts`.
- Adapter endpoints must be public HTTPS and pass static private-network rejection in `src/modules/capability-supply/internal/transport-adapters.ts`; credentials remain environment references.
- Route transport returns typed refused/partial/unknown outcomes and bounded response material in `src/modules/capability-supply/route-transport-runtime.ts`; external release uncertainty is not translated into success.

**Conformance/example provider integrations:**
- Shippo — raw HTTP gateway at `examples/routing-provider/lib/shippo-gateway.mjs`, configured by server-side `SHIPPO_API_TOKEN`, carrier/service identifiers, shipment fixture JSON, and signing/observability fields in `examples/routing-provider/lib/provider-configuration.mjs`.
- EasyPost — raw HTTP gateway at `examples/routing-provider/lib/easypost-gateway.mjs`, configured by server-side `EASYPOST_API_KEY`, carrier/service identifiers, shipment fixture JSON, and signing/observability fields in `examples/routing-provider/lib/provider-configuration.mjs`.
- Vercel conformance provider routes are declared in `examples/routing-provider/vercel.json`; Cloudflare routing edge and agent directory are configured under `examples/routing-edge/` and `examples/routing-agent-directory/`.
- Claim boundary: these are example/conformance adapters and hosted-tracer inputs. Source presence is not independent provider acceptance, shipping purchase, fulfilment, or production routing proof.

**Reserved or non-current payment integrations:**
- Stripe and Autumn secret names are allowlisted for protected source writes in `src/modules/security/source-write-admission.ts`; no Stripe/Autumn SDK and no current billing/checkout module is present in root `package.json` or `src/modules/`.
- Historical deploy-smoke files such as `tests/deploy-smoke/phase6-business-action-stripe-smoke.spec.ts` do not create a current checkout route or live payment rail.

## Data Storage

**Databases:**
- Convex — primary authoritative document database and function runtime.
  - Connection: `CONVEX_URL` or `VITE_CONVEX_URL` in `src/lib/server/convex-source.ts`; deployment uses `CONVEX_DEPLOY_KEY` in `.github/workflows/kernel-release-gate.yml`.
  - Client: authenticated or public `ConvexHttpClient` transport in `src/lib/server/convex-source.ts`.
  - Schema: module fragments are composed by `convex/schema.ts`; action-invocation tables are owned by `src/modules/action-invocation/internal/convex-schema.ts`.
  - Paid operation: `convex/hostedPaidOperation.ts` stores bounded header/source/control/attempt/payment/evidence/history records and only opaque custody/evidence digests; `convex/hostedPaidOperationGateway.ts` owns public intent handling.
  - Authentication: Clerk JWT provider in `convex/auth.config.ts`; agent server-function calls use signed service intent rather than a caller-supplied actor.

**File Storage:**
- Development-only local persistence exists for x402 attempt fixtures in `src/modules/action-invocation/development-file-x402-payment-attempt-port.ts` and evidence/report artifacts under `output/` or `.planning/`.
- No S3, GCS, Azure Blob, or product object-storage client is detected in `package.json` or current `src/` imports.

**Caching:**
- No Redis or Memcached service is detected in `package.json` or current source.
- Public/immutable response caching is controlled by HTTP headers in route/source code; paid-operation and authenticated state responses use `Cache-Control: no-store` in `src/lib/server/hosted-paid-operation-human-api.ts`.

**Search index:**
- Optional Meilisearch integration in `src/modules/registry/internal/catalog-search-port.ts`; Convex-backed registry remains the durable source.

## Authentication & Identity

**Auth Provider:**
- Clerk is the primary hosted identity provider.
  - Human sessions: middleware in `src/start.ts`; paid-operation session read in `src/lib/server/hosted-paid-operation-human-api.ts`.
  - Agent API keys: scope `paid_operation:invoke`, live key state check, and principal derivation in `src/lib/server/hosted-paid-operation-agent-auth.ts`.
  - Customer Request agent keys: separate scoped implementation under `src/modules/customer-request/agent-access.ts` and `src/modules/customer-request/agent-access.functions.ts`.
  - Convex bridge: Clerk JWT issuer configuration in `convex/auth.config.ts` and bearer token creation in `src/lib/server/convex-source.ts`.
- AE service authentication for paid-operation agent calls is implemented in `src/modules/action-invocation/hosted-paid-operation-service-auth.ts`; `src/lib/server/hosted-paid-operation-runtime.ts` signs only the closed intent being sent to public Convex functions.
- Web Bot Auth verification exists in `src/modules/routing-kernel/caller-identity.ts`, with public key-directory route `src/routes/[.]well-known/http-message-signatures-directory.ts`; the V1 routing public runtime is retired, so treat this as dormant/reference unless a current ingress trace is established.
- Source-write admission middleware is active in `src/start.ts` through `src/lib/server/source-write-admission.ts`; implementation resides under `src/modules/security/`.

## Monitoring & Observability

**Error Tracking:**
- Sentry is implemented but configuration-dependent; files and keys are listed above. `src/start.ts` initializes server isolation and captures exceptions only when observability is enabled.

**Logs:**
- Convex platform logging applies to functions under `convex/`; no separate log-shipping client is declared in `package.json`.
- PostHog captures sanitized funnel/product events through `src/lib/observability/`; private-route protections and disabled session recording are enforced in `src/lib/observability/posthog.client.ts`.
- Provider dispatch routes log only redacted errors, for example `src/routes/api.notification.novu-dispatch.ts`.

**Evidence tooling:**
- Source/local gates: `verify:phase3c:release-source` and `verify:paid-operation:hosted-source-local` in `package.json` cover paid-operation application, persistence, host auth/API, projections, UI contract, release contract, and residue boundaries.
- Development evidence: `tools/dev/action-invocation-development-evidence.ts`, `tools/dev/published-operation-development-evidence.ts`, `tools/dev/dynamic-published-invocation-evidence.ts`, and the paid-operation browser under `tools/dev/paid-operation-browser/` are labelled development/fixture tools.
- Hosted evidence: `tools/release/paid-operation-hosted-proof-contract.ts`, `tools/release/paid-operation-hosted-live-collector.ts`, and `tools/release/paid-operation-hosted-journey.ts` define exact-revision readback and trial packet collection; `tools/release/observe-vercel-git-source-deployment.ts` observes Vercel deployment source.
- Claim boundary: tooling source and passing local tests do not prove that a named hosted deployment ran, that Vercel and Convex revisions match, that a provider independently operated, or that a real customer received value.

## CI/CD & Deployment

**Hosting:**
- Vercel — primary TanStack Start application, packaged by Nitro with Node 20 functions in `vite.config.ts`.
- Convex — backend data/functions under `convex/`, independently deployed by `.github/workflows/kernel-release-gate.yml`.
- Cloudflare Workers — routing edge and agent-directory examples under `examples/routing-edge/` and `examples/routing-agent-directory/`.
- Vercel example provider — conformance endpoints under `examples/routing-provider/`.

**CI Pipeline:**
- GitHub Actions release gate in `.github/workflows/kernel-release-gate.yml`.
  - Normal source path runs `npm run test:release:source`; main then deploys exact clean Vercel/Convex source and executes authenticated Customer Request readback.
  - Commits marked for the Phase 3C hosted trial run the focused paid-operation source gate, exact-source build, Vercel Git deployment observation, Convex deployment, bounded evaluator admission, and deployment-receipt recording.
  - The workflow does not itself perform the Phase 3C hosted paid-operation journey after receipt recording; manual/package hosted evidence commands remain separate in `package.json` and `tools/release/`.
- React Doctor workflow in `.github/workflows/react-doctor.yml` is advisory and reports React health on pull requests and main pushes.

## Environment Configuration

**Required env vars:**
- Core host/data: `CONVEX_URL` or `VITE_CONVEX_URL`; `VITE_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, and `CLERK_JWT_ISSUER_DOMAIN` in `src/lib/server/convex-source.ts`, `src/start.ts`, and `convex/auth.config.ts`.
- Paid-operation agent bridge: `AE_CONVEX_SERVER_FUNCTION_TOKEN` in `src/lib/server/hosted-paid-operation-runtime.ts`; Clerk API key scope is enforced in source, not configured by an env flag.
- OpenRouter: `OPENROUTER_API_KEY`, optional `AE_LLM_MODEL`, `AE_LLM_MODELS`, `AE_OPENROUTER_API_BASE_URL`, and Convex `AE_CUSTOMER_REQUEST_MODEL` in `src/modules/answer/internal/llm-config.ts` and `convex/convex.config.ts`.
- Notifications: `AE_NOTIFICATION_OUTBOX_SECRET`, `RESEND_API_KEY`, `RESEND_FROM`, `RESEND_WEBHOOK_SECRET`, optional `RESEND_API_BASE_URL`, `NOVU_SECRET_KEY`, `NOVU_WORKFLOW_INQUIRY_OWNER`, optional `NOVU_WORKFLOW_INQUIRY_CUSTOMER` / `NOVU_API_BASE_URL` in `src/lib/server/notification-provider.ts`.
- Observability: Sentry and PostHog key/host/release/environment families plus AE kill-switches in `src/lib/observability/config.ts`; Vite upload credentials in `vite.config.ts`.
- Search/maps: Meilisearch and `AE_SEARCH_*` names in `src/modules/registry/internal/catalog-search-port.ts`; `VITE_GOOGLE_MAPS_API_KEY` in `src/components/ae/artifacts/AeGenerativeMap.tsx`.
- Registered provider execution: bindings persist `env:NAME` credential references; current production release checks route-call signing and sandbox-provider settings in `.github/workflows/kernel-release-gate.yml`.
- Release observation: Vercel project/token and exact source revision fields are consumed by `tools/release/observe-vercel-git-source-deployment.ts` and `.github/workflows/kernel-release-gate.yml`.

**Secrets location:**
- A root `.env.example` exists and was not read. Secret values must remain in local ignored environment files, Vercel project environment, Convex environment, or GitHub Actions secrets; no values belong in `.planning/codebase/`.
- Convex-declared environment names are listed in `convex/convex.config.ts`; release secret references are names-only in `.github/workflows/kernel-release-gate.yml`.
- Paid-operation durable records reject raw credential, signature, provider response, authorization payload, or raw evidence material in `src/modules/action-invocation/hosted-paid-operation-port.ts` and persist opaque digests through `convex/hostedPaidOperation.ts`.

## Webhooks & Callbacks

**Incoming:**
- `POST /api/notification/resend-webhook` — verified Resend/Svix delivery events handled by `src/routes/api.notification.resend-webhook.ts` and `src/lib/server/notification-provider.ts`.
- Paid-operation agent API: `POST /api/v1/paid-operations`, `GET /api/v1/paid-operations/$invocationRef`, and `POST /api/v1/paid-operations/$invocationRef/commands` under `src/routes/`; these are authenticated AE application endpoints, not third-party webhooks.
- No current Stripe or Autumn webhook route is detected under `src/routes/`; reserved secret names in `src/modules/security/source-write-admission.ts` do not constitute an integration.

**Outgoing:**
- TanStack server to Convex query/mutation/action calls through `src/lib/server/convex-source.ts`.
- OpenRouter chat/model requests from `src/modules/answer/internal/` and Customer Request transports.
- Clerk Backend API key readback and owner-email lookup from `src/lib/server/hosted-paid-operation-agent-auth.ts` and `src/lib/server/notification-provider.ts`.
- Resend send API and Novu trigger/readback from `src/lib/server/notification-provider.ts`.
- Registered provider HTTP/MCP/x402 calls from `src/modules/capability-supply/route-transport-runtime.ts`.
- Optional Meilisearch search/index requests from `src/modules/registry/internal/catalog-search-port.ts`.
- Sentry and PostHog telemetry from `src/lib/observability/` when enabled.
- Vercel/Convex deployment and readback APIs from `.github/workflows/kernel-release-gate.yml` and `tools/release/`; these are release operations, not customer runtime calls.

---

*Integration audit: 2026-07-21 (commit 63a451f43edea453d0a1a8d8502504433acf76fb)*
