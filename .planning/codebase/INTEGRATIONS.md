# External Integrations

**Analysis date:** 2026-07-10

## Integration Model

Agentic Economy treats external systems as adapters and evidence sources, not as implicit domain authority. Convex and the source-owned modules under `src/modules/` retain durable product state. Provider calls are made from server-only routes/functions, provider responses are normalized and hashed where relevant, and webhook/readback evidence is admitted through explicit validation boundaries.

## Convex

- **Purpose:** Durable source of truth, queries/mutations/actions, source-owned projections, audit/readback records, and authenticated backend access.
- **Packages/configuration:** `convex` 1.42.0; schema in `convex/schema.ts`; Clerk auth provider in `convex/auth.config.ts`; generated bindings in `convex/_generated/`.
- **Application boundary:** `src/lib/server/convex-source.ts` constructs server clients and binds source-write admission. Browser reads use Convex clients through module/route readback helpers.
- **Configuration:** `VITE_CONVEX_URL`, `CONVEX_URL`/deployment equivalents, and `CLERK_JWT_ISSUER_DOMAIN`; source-write families and rotation keys are enumerated in `.env.example`.
- **Failure posture:** Missing/unavailable Convex is a source-read/write failure. External providers and search mirrors do not become substitute authority.

## Clerk

- **Purpose:** Sign-up/sign-in, session identity, operator/owner authentication, Convex JWT issuance, and owner email lookup for notification delivery.
- **SDK boundary:** Clerk middleware is installed in `src/start.ts`; auth pages are `src/routes/sign-in.$.tsx` and `src/routes/sign-up.$.tsx`; server authorization is centralized under `src/lib/server/require-operator-session.ts` and `src/modules/security/`.
- **Convex trust:** `convex/auth.config.ts` accepts tokens from the configured Clerk issuer with application ID `convex`.
- **Management API:** `src/lib/server/notification-provider.ts` calls `https://api.clerk.com/v1/users/:id` to resolve an owner delivery address before dispatch.
- **Configuration:** `VITE_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, and `CLERK_JWT_ISSUER_DOMAIN` in `.env.example`.
- **Local testing:** A tightly scoped local-E2E bypass exists in `src/lib/server/local-e2e-bypass.ts`; it is not the production auth path.

## OpenRouter and LLM Execution

- **Purpose:** Tool-use answer synthesis, model discovery/selection, and evaluated follow-up chip generation.
- **Endpoints:** Chat completions at `https://openrouter.ai/api/v1/chat/completions` in `src/modules/answer/internal/answer-tool-use-agent.ts`; models at `https://openrouter.ai/api/v1/models` in `src/modules/answer/internal/openrouter-models.ts`.
- **Configuration:** `OPENROUTER_API_KEY`, `AE_LLM_MODEL`, optional `AE_LLM_MODELS`, `AE_OPENROUTER_API_BASE_URL`, site/referrer values, and `AE_ANSWER_EVAL_PASSED` (`.env.example`, `src/modules/answer/internal/llm-config.ts`).
- **Default model:** `deepseek/deepseek-v4-flash`, declared in `src/modules/answer/internal/llm-config.ts`.
- **Controls:** Search-answer synthesis requires an API key; unsupported/boundary intents use source-owned boundary prose. Evaluated auxiliary LLM behavior is gated by `npm run test:eval` and `AE_ANSWER_EVAL_PASSED=1`.
- **Failure posture:** Model listing falls back to configured model IDs; answer execution fails safely rather than fabricating a sourced answer when required LLM configuration is absent.

## Autumn Billing

- **Purpose:** Paid activation/customer/subscription operations and provider invoice/readback evidence.
- **HTTP adapter:** `src/modules/billing/internal/provider-readback.ts` calls Autumn through the `AutumnProvider` interface; `src/lib/server/billing-provider.ts` constructs the configured provider and normalizes webhooks.
- **Endpoint:** Production base URL defaults to `https://api.useautumn.com`; `src/modules/security/provider-api-base-url.ts` constrains production provider hosts.
- **Webhooks:** `src/lib/server/billing-provider.ts` verifies Svix-format Autumn signatures, enforces a five-minute replay window, normalizes provider IDs/status, hashes payloads, and redacts stored payload detail.
- **Configuration:** `AUTUMN_SECRET_KEY`, `AUTUMN_WEBHOOK_SECRET`, environment/project/version/base URL, and portal return URL names in `.env.example`; `autumn.config.ts` defines the repository-side Autumn product configuration.
- **Authority boundary:** Environment presence is not provider readiness. Source-owned operation, receipt, reconciliation, and provider-event readbacks remain the proof surface.

## Stripe

- **Purpose:** Test-mode paid business-action checkout evidence and signed payment webhook admission.
- **Checkout adapter:** `src/modules/business-action/internal/stripe-checkout.ts` creates Checkout Sessions against `https://api.stripe.com`, with a source-owned amount/currency, Stripe idempotency key, and correlation metadata.
- **Current scope:** The business-action path explicitly requires `sk_test_` credentials and `cs_test_` sessions; live-mode evidence is rejected by the source adapter.
- **Webhook route:** `src/routes/api.business-actions.stripe-webhook.ts` admits raw signed payloads through `src/modules/business-action/internal/stripe-webhook-source.ts`.
- **Verification:** HMAC verification, timestamp tolerance, exact request/checkpoint/mandate/hash binding, duplicate detection, and held-for-operator handling are implemented before evidence becomes accepted source state.
- **Configuration:** `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` in `.env.example`. Stripe invoice references may also arrive through Autumn billing readbacks, but those are normalized as Autumn provider evidence.

## Resend

- **Purpose:** Transactional owner/customer inquiry email delivery and delivery-event evidence.
- **Dispatch:** `src/routes/api.notification.resend-dispatch.ts` calls the provider boundary in `src/lib/server/notification-provider.ts`; the default endpoint is `https://api.resend.com/emails`.
- **Webhook:** `src/routes/api.notification.resend-webhook.ts` verifies Svix-style signature headers, enforces replay tolerance, validates the event payload, and records normalized dispatch/readback data.
- **Configuration:** `RESEND_API_KEY`, `RESEND_FROM`, optional `RESEND_API_BASE_URL`, `RESEND_WEBHOOK_SECRET`, and the internal `AE_NOTIFICATION_OUTBOX_SECRET` in `.env.example`.
- **Privacy/idempotency:** Delivery addresses are resolved server-side, represented in redacted/hash form for evidence, and provider requests carry source-owned idempotency keys.

## Novu

- **Purpose:** Primary workflow-based owner/customer inquiry notifications, with trigger and message-status readback.
- **Adapter:** `src/lib/server/notification-provider.ts` posts events to `/v1/events/trigger` and reads `/v1/messages`; `src/routes/api.notification.novu-dispatch.ts` exposes the internal dispatch route.
- **Endpoint:** Defaults to `https://api.novu.co`, with a controlled override for provider smoke tests.
- **Configuration:** `NOVU_SECRET_KEY`, `NOVU_API_BASE_URL`, `NOVU_WORKFLOW_INQUIRY_OWNER`, `NOVU_WORKFLOW_INQUIRY_CUSTOMER`, and `AE_NOTIFICATION_OUTBOX_SECRET` in `.env.example`.
- **Failure posture:** Trigger/readback failures are normalized into explicit provider errors and source-owned dispatch attempts; an accepted trigger is not silently equated with delivered state.

## Meilisearch

- **Purpose:** Optional generated search mirror for the public registry; Convex remains the source of truth.
- **Adapter:** `src/modules/registry/internal/catalog-search-port.ts` owns search, document replacement/deletion, index settings, and task readbacks through Meilisearch's HTTP API.
- **Configuration:** `MEILISEARCH_HOST`, `MEILISEARCH_ADMIN_KEY`, `AE_SEARCH_INDEX_UID`, `AE_SEARCH_BACKEND`, and `AE_SEARCH_TIMEOUT_MS` in `.env.example`.
- **Modes:** `convex` (source only), `dual` (rollout/comparison), or `meilisearch`. The configured port does not exist unless host, key, and index are all present.
- **Reliability:** Requests are bounded by a 250–10,000 ms timeout (default 1,500 ms), errors are normalized, results are revalidated against the repository's registry-query semantics, and sync attempts/task states are captured in source-owned registry projections.

## Sentry

- **Purpose:** Client/server error capture, request isolation, release/environment tagging, and source-map association.
- **Runtime:** `src/lib/observability/sentry.client.ts`, `src/lib/observability/sentry.server.ts`, and the request middleware in `src/start.ts`.
- **Build integration:** `@sentry/vite-plugin` in `vite.config.ts` uploads source maps only when auth token, organization, and project are all configured; source maps are otherwise disabled.
- **Configuration:** Client/server DSNs, environment, release, org, project, and auth token variables in `.env.example`.
- **Failure posture:** Optional and disableable; capture/flush behavior is isolated from product response authority.

## PostHog

- **Purpose:** Client/server funnel analytics and product-event inspection.
- **Runtime:** `src/lib/observability/posthog.client.ts`, `src/lib/observability/posthog.server.ts`, and event shaping in `src/lib/observability/funnel-event-props.ts`.
- **Endpoint/configuration:** Defaults to `https://us.i.posthog.com`; client/server keys, ingest host, and optional app URL are documented in `.env.example`.
- **Authority boundary:** Analytics events are telemetry. Source-owned owner-activation/funnel milestones are separately written through `src/modules/observability/` and Convex.
- **Testing/failure posture:** `VITE_AE_DISABLE_OBSERVABILITY` disables third-party telemetry in local E2E; server flush failures are swallowed after capture so they do not fail the application request.

## Google Maps Embed

- **Purpose:** Optional place/office maps inside generated answer artifacts.
- **Implementation:** `src/components/ae/artifacts/AeGenerativeMap.tsx` renders Google Maps Embed URLs using `https://www.google.com/maps/embed/v1/place`.
- **Configuration:** Client-visible `VITE_GOOGLE_MAPS_API_KEY` in `.env.example`.
- **Security:** Google Maps origins are explicitly listed in the CSP in `src/lib/http/security-headers.ts`; without a key the optional map artifact is not treated as core business evidence.

## Web Bot Auth Signature-Agent Directories

- **Purpose:** Verify incoming agent identities by resolving public keys from each allowed Signature-Agent's `/.well-known/http-message-signatures-directory`.
- **Implementation:** `src/modules/clearance/internal/web-bot-auth.ts` verifies message signatures, key algorithms, covered components, digest, created time, and replay age. `src/modules/harness/agent-door.ts` applies the same origin posture to the agent door.
- **Default trust origin:** `https://chatgpt.com`, with additional production-safe HTTPS origins configured through `AE_WBA_SIGNATURE_AGENT_ALLOWLIST`.
- **Local directory:** The application publishes its own public directory at `src/routes/[.]well-known/http-message-signatures-directory.ts`, using `AE_WBA_DIRECTORY_PUBLIC_JWK_JSON`.
- **Admission:** A valid cryptographic identity still needs an admitted principal for protected actions, such as `AE_AGENT_PUBLIC_INQUIRY_ADMISSION_PRINCIPALS`; verification is not blanket authorization.

## Vercel

- **Purpose:** Production hosting for the TanStack Start/Nitro web and API application.
- **Configuration:** `vite.config.ts` selects Nitro's `vercel` preset, Node entry format, and `nodejs20.x` functions. Vercel-provided deployment/release variables are consumed for canonical URLs, environment tagging, and Sentry releases.
- **Runtime constraints:** Webhook routes depend on raw `Request` bodies plus Node/WebCrypto verification, so the deployment target is Node serverless rather than edge.
- **Verification:** Hosted flows are exercised through the deploy-smoke Playwright configuration and provider-specific scripts in `package.json`; a successful local build is not itself hosted-provider proof.

## Internal API and Webhook Surface

- Answer/chat: `src/routes/api.answer.ts`, `src/routes/api.answer.turn.ts`, `src/routes/api.chat.ts`, and thread/model/tool routes.
- Discovery/business catalog: `src/routes/api.businesses.ts`, `src/routes/api.businesses.$slug.ts`, `src/routes/api.businesses.search.ts`, and discovery schema/example/fixture routes.
- Billing/business actions: `src/routes/api.billing.webhook.ts` and `src/routes/api.business-actions.stripe-webhook.ts`.
- Notifications: `src/routes/api.notification.novu-dispatch.ts`, `src/routes/api.notification.resend-dispatch.ts`, and `src/routes/api.notification.resend-webhook.ts`.
- Observability: `src/routes/api.observability.funnel.ts` accepts bounded first-party funnel events before optional provider capture/source synchronization.
- Storefront import: `src/routes/api.storefront.import-draft.ts` is a guarded import boundary, not an unconstrained third-party sync.

## Secrets and Environment Boundaries

- `.env.example` documents names and safe defaults only; actual `.env.local` contents are not source documentation and must not be committed or logged.
- Browser-visible variables are intentionally prefixed `VITE_`; Clerk, Convex URL, Sentry/PostHog client configuration, and Google Maps are the main client settings.
- Provider API keys, webhook secrets, source-write keys, notification outbox secret, OpenRouter key, Meilisearch admin key, and Sentry upload token remain server-only.
- Provider base URL overrides exist for local/provider smoke testing. Production code validates HTTPS and expected hosts before making money-rail calls.
- Source-write keys are split by operation family with previous-key support in `.env.example`, enabling scoped rotation rather than one undifferentiated permanent secret.

## Integration Verification Paths

- Static/local gates are encoded in `package.json`: typecheck, Convex codegen, unit/integration/eval suites, browser/a11y tests, and build.
- Hosted/provider evidence uses the dedicated `tests/deploy-smoke/` cases and scripts such as `test:provider-smoke:resend`, `test:provider-smoke:novu`, `test:provider-smoke:autumn-stripe`, and `test:provider-smoke:business-action-stripe`.
- Readiness is established by source-owned dispatch, webhook, operation, receipt, reconciliation, projection, or audit readback—not by an environment variable merely being present.

---

*Integration analysis: 2026-07-10*
