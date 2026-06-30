# External Integrations

**Analysis Date:** 2026-06-30

## APIs & External Services

**Source Database & Functions:**
- Convex - durable source-of-truth database, query/mutation runtime, and generated API references.
  - SDK/Client: `convex` from `package.json`; `ConvexHttpClient` in `src/lib/server/convex-source.ts`; Convex functions in `convex/*.ts`.
  - Auth: Clerk-issued Convex token template `convex` through `src/lib/server/convex-source.ts`; `CLERK_JWT_ISSUER_DOMAIN` in `convex/auth.config.ts`.
  - Env: `CONVEX_URL` or `VITE_CONVEX_URL`; Convex CLI also depends on deployment configuration for `npm run check:convex-codegen`.
  - Entry points: public and authenticated source helpers in `src/lib/server/convex-source.ts`; schema root in `convex/schema.ts`.

**Authentication:**
- Clerk - user sessions, sign-in/sign-up UI, owner/admin auth, server-side owner email lookup, and Convex auth provider.
  - SDK/Client: `@clerk/tanstack-react-start` from `package.json`.
  - Middleware: `clerkMiddleware()` in `src/start.ts`.
  - UI provider: `ClerkProvider` in `src/routes/__root.tsx`.
  - Routes: `src/routes/sign-in.$.tsx`, `src/routes/sign-up.$.tsx`, owner/admin route consumers under `src/routes/owner.*.tsx` and `src/routes/admin.*.tsx`.
  - Server auth: `auth()` in `src/lib/server/convex-source.ts` and `src/lib/server/claim-owner-session.ts`.
  - Auth: Clerk env is SDK-managed for the provider; source code explicitly reads `CLERK_SECRET_KEY` in `src/lib/server/notification-provider.ts` and `CLERK_JWT_ISSUER_DOMAIN` in `convex/auth.config.ts`.

**LLM / Answer Generation:**
- OpenRouter - opt-in structured answer prose, follow-up chip generation, model list readback, and `/api/chat` streaming answers.
  - SDK/Client: direct `fetch`; no OpenRouter SDK is used.
  - Auth: `OPENROUTER_API_KEY`.
  - Config: `AE_LLM_MODEL`, `AE_LLM_MODELS`, `AE_ANSWER_SYNTHESIZER`, `AE_GATED_LLM_ANSWER`, `AE_ANSWER_EVAL_PASSED`, `AE_SITE_URL`, and `SITE_URL`.
  - Endpoints: `https://openrouter.ai/api/v1/chat/completions` in `src/modules/answer/internal/gated-llm-prose.ts` and `src/modules/answer-thread/internal/llm-follow-up-chips.ts`; `https://openrouter.ai/api/v1/models` in `src/modules/answer/internal/openrouter-models.ts`.
  - Routes: `src/routes/api.chat.ts`, `src/routes/api.chat.models.ts`, `src/routes/api.answer.follow-up-chips.ts`, and `src/routes/api.answer.eval-status.ts`.

**Billing / Paid Activation:**
- Autumn - hosted paid activation, customer portal, customer/subscription/invoice readbacks, and signed billing webhooks.
  - SDK/Client: direct `fetch` through `src/modules/billing/internal/provider-readback.ts`; `atmn` config in `autumn.config.ts`.
  - Auth: `AUTUMN_SECRET_KEY` for provider calls; `AUTUMN_WEBHOOK_SECRET` for Svix-signed webhook verification.
  - Config: `AUTUMN_API_BASE_URL`, `AUTUMN_API_VERSION`, `AE_APP_BASE_URL`, `VITE_AE_APP_BASE_URL`, and `VERCEL_URL`.
  - Default API: `https://api.useautumn.com` in `src/modules/billing/internal/provider-readback.ts`.
  - Routes: `src/routes/api.billing.webhook.ts`, `src/routes/owner.billing.activate.tsx`, `src/routes/owner.billing.return.$operationId.tsx`, `src/routes/owner.billing.cancel.$operationId.tsx`, `src/routes/owner.billing.receipts.$receiptId.tsx`, and admin billing routes under `src/routes/admin.monetization*.tsx`.

**Payment Evidence:**
- Stripe - signed webhook evidence for business-action receipts and Stripe invoice IDs inside Autumn billing readbacks.
  - SDK/Client: direct HMAC verification using Node `crypto`; no `stripe` npm package is installed.
  - Auth: `STRIPE_WEBHOOK_SECRET` for `src/routes/api.business-actions.stripe-webhook.ts`.
  - Route: `POST /api/business-actions/stripe-webhook` in `src/routes/api.business-actions.stripe-webhook.ts`.
  - Billing state: `stripe_psp` provider and Stripe receipt refs in `src/modules/billing/internal/schema.ts` and `src/modules/billing/internal/operations.ts`.
  - Boundary: Stripe events are recorded as evidence through `src/modules/business-action/business-action.functions.ts`; no source code reads `STRIPE_SECRET_KEY`.

**Notification Delivery:**
- Resend - owner inquiry email delivery and signed delivery webhook readback.
  - SDK/Client: direct `fetch`; no Resend SDK is installed.
  - Auth: `RESEND_API_KEY` for sends; `RESEND_WEBHOOK_SECRET` for Svix-signed webhook verification.
  - Config: `RESEND_FROM`, `RESEND_API_BASE_URL`, and `AE_NOTIFICATION_OUTBOX_SECRET`.
  - Default API: `https://api.resend.com` in `src/lib/server/notification-provider.ts`.
  - Routes: `POST /api/notification/resend-dispatch` in `src/routes/api.notification.resend-dispatch.ts`; `POST /api/notification/resend-webhook` in `src/routes/api.notification.resend-webhook.ts`.
  - Owner lookup dependency: `CLERK_SECRET_KEY` is used to fetch the owner primary email from Clerk at send time in `src/lib/server/notification-provider.ts`.

- Novu - owner inquiry notification workflow trigger and transaction message readback.
  - SDK/Client: direct `fetch`; no Novu SDK is installed.
  - Auth: `NOVU_SECRET_KEY`.
  - Config: `NOVU_WORKFLOW_INQUIRY_OWNER`, optional `NOVU_WORKFLOW_INQUIRY_CUSTOMER`, `NOVU_API_BASE_URL`, and `AE_NOTIFICATION_OUTBOX_SECRET`.
  - Default API: `https://api.novu.co` in `src/lib/server/notification-provider.ts`.
  - Route: `POST /api/notification/novu-dispatch` in `src/routes/api.notification.novu-dispatch.ts`.
  - Webhook status: no Novu webhook route is implemented; the route performs authenticated trigger and `/v1/messages` readback.

**Maps & Public Embeds:**
- Google Maps Embed - optional iframe map for query/provider map components.
  - SDK/Client: iframe URL in `src/components/ae/artifacts/AeGenerativeMap.tsx`.
  - Auth: `VITE_GOOGLE_MAPS_API_KEY`.
  - Behavior: component returns `null` when the public key is absent.

**Assistant / Agent Door:**
- AE agent tools endpoint - internal machine-facing action list and invocation surface.
  - SDK/Client: JSON HTTP route, no external SDK.
  - Auth: action-specific admission and source-write checks.
  - Routes: `GET /api/agent/tools` and `POST /api/agent/tools` in `src/routes/api.agent.tools.ts`.
  - Registered actions: `src/modules/actions/index.ts`; currently assistant-facing action contracts include `src/modules/inquiries/inquiry.actions.ts`.

**Developer Tooling:**
- Promptfoo - local eval runner for answer safety gates.
  - SDK/Client: `promptfoo` dev dependency and `eval/answer/promptfooconfig.yaml`.
  - Auth: Not detected in source; config uses local `file://providers/gate.mjs`.
- shadcn / AI Elements registry - component-generation registry configured in `components.json`.
  - SDK/Client: registry URL `https://elements.ai-sdk.dev/api/registry/{name}.json` in `components.json`.
  - Runtime: Not used by application routes at runtime.

## Data Storage

**Databases:**
- Convex
  - Connection: `CONVEX_URL` or `VITE_CONVEX_URL` in `src/lib/server/convex-source.ts`.
  - Client: `ConvexHttpClient` in `src/lib/server/convex-source.ts`; Convex query/mutation definitions in `convex/*.ts`.
  - Schema: `convex/schema.ts` composes module-owned schema fragments from `src/modules/*/internal/*schema*.ts` and `convex/businessActionStore.ts`.
  - Core tables: owner/business/catalog tables in `src/modules/business/internal/schema.ts` and `src/modules/catalog/internal/schema.ts`; registry tables in `src/modules/registry/internal/schema.ts`; inquiry tables in `src/modules/inquiries/internal/convex-schema.ts`; notification outbox tables in `src/modules/notification-outbox/internal/schema.ts`; billing tables in `src/modules/billing/internal/schema.ts`; protected/business action tables in `src/modules/protected-action/internal/schema.ts` and `convex/businessActionStore.ts`; observability/security tables in `src/modules/observability/internal/schema.ts` and `src/modules/security/internal/schema.ts`.

**File Storage:**
- Local committed public assets only.
  - Files: `public/images/illustration/*.png`.
  - Usage: referenced by UI and dev seed catalog fixture data in `src/modules/dev/internal/dev-seed-fixture.ts`.
  - External file storage: Not detected.

**Caching:**
- In-memory answer response cache: `answerCache` in `src/routes/api.answer.ts`, 30-second TTL.
- In-memory OpenRouter model cache: `modelsCache` in `src/modules/answer/internal/openrouter-models.ts`, 2-minute TTL.
- Convex query/reactive caching: provided by Convex runtime; no Redis, Memcached, or external cache is detected.

## Authentication & Identity

**Auth Provider:**
- Clerk
  - Implementation: `clerkMiddleware()` is installed in `src/start.ts`; `ClerkProvider` wraps protected/public auth routes in `src/routes/__root.tsx`; `auth()` obtains Convex tokens in `src/lib/server/convex-source.ts`.
  - Convex integration: `convex/auth.config.ts` uses `CLERK_JWT_ISSUER_DOMAIN` and application ID `convex`.
  - Owner/admin authority: Convex functions derive identity from `ctx.auth.getUserIdentity()` plus stored owner/admin rows in `convex/authz.ts`, `convex/business.ts`, `convex/security.ts`, and related module runtimes.
  - Local bypass: `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E` is accepted only outside production by `src/start.ts` and `src/routes/__root.tsx`.

## Monitoring & Observability

**Error Tracking:**
- Sentry or hosted error tracking: Not detected.
- PostHog/analytics service: Not detected.

**Logs:**
- Operational audit and funnel events are persisted in Convex tables from `src/modules/observability/internal/schema.ts` and runtimes in `convex/observability.ts`.
- Provider routes return JSON error codes and avoid raw provider payload persistence: `src/routes/api.notification.resend-webhook.ts`, `src/routes/api.billing.webhook.ts`, and `src/routes/api.business-actions.stripe-webhook.ts`.
- Tests scan for secret/private leakage in copy and UI contracts under `tests/copy/`, `tests/ui-contract/`, and `tests/e2e/`.

## CI/CD & Deployment

**Hosting:**
- Vercel inferred from `VERCEL_URL` usage in `src/modules/billing/billing.functions.ts`, local `.vercel/` metadata presence, and deploy smoke bypass helper `tests/deploy-smoke/vercel-bypass.ts`.
- Runtime build: Vite + TanStack Start + Nitro from `vite.config.ts`.
- Durable backend: Convex deployment; deploy smoke expects `DEPLOY_CONVEX_URL` in `tests/deploy-smoke/phase1-deploy-smoke.spec.ts`.

**CI Pipeline:**
- No committed CI pipeline detected.
- No workflow files found under `.github/`, `.gitlab/`, `.circleci/`, or `.husky/`.
- Release-quality command composition lives in `package.json` scripts such as `test:release`, `test:all`, and provider smoke commands.

## Environment Configuration

**Required env vars:**
- Core source/runtime:
  - `CONVEX_URL` or `VITE_CONVEX_URL` - server Convex calls in `src/lib/server/convex-source.ts`.
  - `CLERK_JWT_ISSUER_DOMAIN` - Convex auth config in `convex/auth.config.ts`.
  - `AE_SOURCE_WRITE_SECRET` - source-write admission in `src/lib/server/source-write-admission.ts`.
  - `SITE_URL` or `VITE_SITE_URL` - route links in inquiry/catalog/security server functions.
  - `AE_CANONICAL_BASE_URL` or `SITE_URL` - discovery file generation in `convex/discovery.ts`.
  - `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E` - local E2E bypass only; production use throws.
- Clerk:
  - `CLERK_SECRET_KEY` - owner email lookup for Resend dispatch in `src/lib/server/notification-provider.ts`.
  - Clerk frontend keys are SDK-managed by `@clerk/tanstack-react-start`; no explicit frontend Clerk env read appears in source.
- OpenRouter:
  - `OPENROUTER_API_KEY`.
  - `AE_LLM_MODEL`, `AE_LLM_MODELS`, `AE_ANSWER_SYNTHESIZER`, `AE_GATED_LLM_ANSWER`, `AE_ANSWER_EVAL_PASSED`, `AE_SITE_URL`, `SITE_URL`.
- Notification:
  - `AE_NOTIFICATION_OUTBOX_SECRET`.
  - `RESEND_API_KEY`, `RESEND_FROM`, optional `RESEND_API_BASE_URL`, `RESEND_WEBHOOK_SECRET`.
  - `NOVU_SECRET_KEY`, `NOVU_WORKFLOW_INQUIRY_OWNER`, optional `NOVU_WORKFLOW_INQUIRY_CUSTOMER`, optional `NOVU_API_BASE_URL`.
- Billing:
  - `AUTUMN_SECRET_KEY`, optional `AUTUMN_API_BASE_URL`, optional `AUTUMN_API_VERSION`, `AUTUMN_WEBHOOK_SECRET`.
  - `AE_APP_BASE_URL`, `VITE_AE_APP_BASE_URL`, or `VERCEL_URL` for hosted flow return URLs.
- Stripe evidence:
  - `STRIPE_WEBHOOK_SECRET` for `src/routes/api.business-actions.stripe-webhook.ts`.
- Maps:
  - `VITE_GOOGLE_MAPS_API_KEY` for `src/components/ae/artifacts/AeGenerativeMap.tsx`.
- Deploy smoke:
  - `DEPLOY_BASE_URL`, `DEPLOY_CONVEX_URL`, `VERCEL_AUTOMATION_BYPASS_SECRET`, `SMOKE_*` variables, and Playwright storage-state paths are read by `tests/deploy-smoke/*.spec.ts` and `tests/deploy-smoke/vercel-bypass.ts`.

**Secrets location:**
- `.env.example` and `.env.local` are present; contents were not read.
- Deployment secrets are expected in the hosting/provider environment, referenced by route handlers and smoke tests.
- `.auth/*.json` files are present for Playwright storage state; contents were not read and should be treated as sensitive local test artifacts.
- `.planning/SECURITY-SPEC.md` classifies provider keys, webhook secrets, Clerk/session tokens, and raw provider payloads as secrets that must not be logged or exposed.

## Webhooks & Callbacks

**Incoming:**
- `POST /api/billing/webhook` - Autumn Svix-signed billing webhook in `src/routes/api.billing.webhook.ts`; verifier in `src/lib/server/billing-provider.ts`; source admission in `src/modules/billing/billing.functions.ts`.
- `POST /api/business-actions/stripe-webhook` - Stripe-signed business-action evidence webhook in `src/routes/api.business-actions.stripe-webhook.ts`; source admission in `src/modules/business-action/business-action.functions.ts`.
- `POST /api/notification/resend-webhook` - Resend Svix-signed delivery webhook in `src/routes/api.notification.resend-webhook.ts`; verifier in `src/lib/server/notification-provider.ts`.
- `POST /api/notification/resend-dispatch` - guarded Resend dispatch bridge in `src/routes/api.notification.resend-dispatch.ts`; bearer authorization uses `AE_NOTIFICATION_OUTBOX_SECRET`.
- `POST /api/notification/novu-dispatch` - guarded Novu dispatch/readback bridge in `src/routes/api.notification.novu-dispatch.ts`; bearer authorization uses `AE_NOTIFICATION_OUTBOX_SECRET`.
- `GET /api/agent/tools` and `POST /api/agent/tools` - assistant action list/invocation endpoint in `src/routes/api.agent.tools.ts`.
- Read-only public APIs: `GET /api/businesses`, `GET /api/businesses/search`, `GET /api/businesses/$slug`, `GET /api/discovery/schema`, `GET /api/discovery/examples`, `GET /api/discovery/fixtures`, `GET /llms.txt`, `GET /sitemap.xml`, and `GET /robots.txt` under `src/routes/`.
- Answer APIs: `GET /api/answer`, `POST /api/answer/turn`, `POST /api/answer/follow-up-chips`, `GET /api/answer/eval-status`, `POST /api/chat`, `GET /api/chat/models`, `GET /api/answer/threads`, and `GET /api/answer/threads/$threadId`.

**Outgoing:**
- Convex HTTP calls from `src/lib/server/convex-source.ts` to `CONVEX_URL` or `VITE_CONVEX_URL`.
- Clerk API `GET /v1/users/{clerkUserId}` from `src/lib/server/notification-provider.ts` for owner email lookup.
- OpenRouter chat completions from `src/modules/answer/internal/gated-llm-prose.ts` and `src/modules/answer-thread/internal/llm-follow-up-chips.ts`.
- OpenRouter models list from `src/modules/answer/internal/openrouter-models.ts`.
- Autumn `/v1/customers`, `/v1/billing.attach`, `/v1/billing.open_customer_portal`, and `/v1/customers.get` from `src/modules/billing/internal/provider-readback.ts`.
- Resend `/emails` from `src/lib/server/notification-provider.ts`.
- Novu `/v1/events/trigger` and `/v1/messages` from `src/lib/server/notification-provider.ts`.
- Google Maps embed iframe from `src/components/ae/artifacts/AeGenerativeMap.tsx`.
- Vercel deployment smoke bypass requests from `tests/deploy-smoke/vercel-bypass.ts`.

---

*Integration audit: 2026-06-30*
