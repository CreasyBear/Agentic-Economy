# External Integrations

**Analysis Date:** 2026-06-30

## APIs & External Services

**Authentication & Identity:**
- Clerk - user authentication, route/session middleware, sign-in/sign-up UI, Convex JWT issuance, and owner delivery-address lookup.
  - SDK/Client: `@clerk/tanstack-react-start` in `src/start.ts`, `src/routes/__root.tsx`, `src/routes/sign-in.$.tsx`, `src/routes/sign-up.$.tsx`, and `src/lib/server/convex-source.ts`.
  - REST API: direct `fetch` to `https://api.clerk.com/v1/users/{id}` in `src/lib/server/notification-provider.ts`.
  - Auth: `CLERK_JWT_ISSUER_DOMAIN`, `CLERK_SECRET_KEY`, and Clerk SDK-managed publishable/secret env. Planning docs also name `VITE_CLERK_PUBLISHABLE_KEY`.

**Source Database & Functions:**
- Convex - primary source-owned database, query/mutation runtime, generated client target, and durable readback store.
  - SDK/Client: `convex`, `ConvexHttpClient`, `convex/server`, and `convex/values` in `convex/schema.ts`, `src/lib/server/convex-source.ts`, and `convex/*.ts`.
  - Auth: Clerk JWT token template `convex` in `src/lib/server/convex-source.ts`; issuer configured by `CLERK_JWT_ISSUER_DOMAIN` in `convex/auth.config.ts`.
  - Connection: `CONVEX_URL` or `VITE_CONVEX_URL` for server source calls; `CONVEX_DEPLOYMENT` is required by Convex CLI/codegen workflows.

**Notifications:**
- Resend - owner inquiry email dispatch and delivery webhook readbacks.
  - SDK/Client: no Resend SDK package detected; direct REST calls in `src/lib/server/notification-provider.ts` and route orchestration in `src/routes/api.notification.resend-dispatch.ts`.
  - Auth: `RESEND_API_KEY`, `RESEND_FROM`, optional `RESEND_API_BASE_URL`, and `RESEND_WEBHOOK_SECRET`.
  - Webhook: incoming POST `/api/notification/resend-webhook` implemented by `src/routes/api.notification.resend-webhook.ts`; raw-body Svix HMAC verification lives in `src/lib/server/notification-provider.ts`.
- Novu - owner inquiry workflow trigger and provider message readback.
  - SDK/Client: no Novu SDK package detected; direct REST calls to `/v1/events/trigger` and `/v1/messages` in `src/lib/server/notification-provider.ts`.
  - Auth: `NOVU_SECRET_KEY`, `NOVU_WORKFLOW_INQUIRY_OWNER`, optional `NOVU_WORKFLOW_INQUIRY_CUSTOMER`, and optional `NOVU_API_BASE_URL`.
  - Dispatch endpoint: POST `/api/notification/novu-dispatch` in `src/routes/api.notification.novu-dispatch.ts`; request auth uses `AE_NOTIFICATION_OUTBOX_SECRET` as a bearer secret.

**Billing & Payment Evidence:**
- Autumn Cloud - paid activation billing provider, customer portal, customer readback, and invoice/Stripe PSP normalization.
  - SDK/Client: no Autumn SDK package detected; direct REST calls in `src/modules/billing/internal/provider-readback.ts`, with env loading in `src/lib/server/billing-provider.ts`.
  - Auth: `AUTUMN_SECRET_KEY`, optional `AUTUMN_API_BASE_URL`, optional `AUTUMN_API_VERSION`, and optional `AUTUMN_WEBHOOK_SECRET`.
  - Webhook posture: parked `/api/billing/webhook` in `src/future-phases/05-paid-activation-money-rails/routes/api.billing.webhook.ts` refuses unverified Autumn callbacks because `verifyAutumnWebhook` throws `unverified_webhook` in `src/lib/server/billing-provider.ts`.
- Stripe - test-mode business-action Checkout evidence and signed webhook evidence.
  - SDK/Client: no Stripe SDK package detected; direct form-encoded REST request builder in `src/modules/business-action/internal/stripe-checkout.ts`.
  - Auth: `STRIPE_WEBHOOK_SECRET` for incoming signed webhook verification in `src/routes/api.business-actions.stripe-webhook.ts`; the Checkout helper accepts a server-supplied test-mode secret key and rejects non-test-mode keys in `src/modules/business-action/internal/stripe-checkout.ts`.
  - Webhook: incoming POST `/api/business-actions/stripe-webhook` verifies `stripe-signature` using HMAC and forwards source-admitted evidence through `src/modules/business-action/business-action.functions.ts`.

**Hosting & Deployment:**
- Vercel - local deployment link detected through `.vercel/README.txt`; `.vercel/` is ignored by `.gitignore` and no committed `vercel.json` was detected.
  - SDK/Client: not applicable.
  - Auth: Vercel credentials are local/operator-managed outside committed source.
- Playwright deploy smoke - deployed environment verification harness rather than a production service integration.
  - Config: `playwright.deploy-smoke.config.ts`.
  - Env: `DEPLOY_BASE_URL`, `DEPLOY_CONVEX_URL`, and scenario-specific `SMOKE_*` IDs in `tests/deploy-smoke/`.

## Data Storage

**Databases:**
- Convex database.
  - Connection: `CONVEX_URL`, `VITE_CONVEX_URL`, and Convex CLI deployment state.
  - Client: `ConvexHttpClient` in `src/lib/server/convex-source.ts`; Convex functions in `convex/*.ts`.
  - Schema: `convex/schema.ts` combines tables from `src/modules/billing/internal/schema.ts`, `convex/businessActionStore.ts`, `src/modules/business/internal/schema.ts`, `src/modules/catalog/internal/schema.ts`, `src/modules/registry/internal/schema.ts`, `src/modules/discovery/internal/schema.ts`, `src/modules/inquiries/internal/convex-schema.ts`, `src/modules/notification-outbox/internal/schema.ts`, `src/modules/protected-action/internal/schema.ts`, `src/modules/observability/internal/schema.ts`, and `src/modules/security/internal/schema.ts`.
  - Major table families: businesses, owners, claims, business services, registry projections, discovery manifests, inquiry threads/messages, notification dispatches/webhooks, protected actions, business actions, billing operations/events/receipts, audit events, operator controls, disputes, suppression rules, admin memberships, and abuse buckets.

**File Storage:**
- Local static assets only.
  - Public images live in `public/images/`.
  - No S3, Cloudflare R2, GCS, Supabase Storage, or Convex file-storage usage was detected in source imports.

**Caching:**
- No external cache service detected.
- HTTP cache headers are set manually for selected API/discovery responses in `src/lib/http/discovery-response.ts`, `src/routes/api.discovery.schema.ts`, and no-store provider responses in notification, billing, Stripe, and business API routes.
- Convex provides reactive query caching at the data layer; no Redis or Memcached dependency exists in `package.json`.

## Authentication & Identity

**Auth Provider:**
- Clerk.
  - Implementation: `clerkMiddleware()` is added to TanStack Start request middleware in `src/start.ts`; `<ClerkProvider>` wraps the root document in `src/routes/__root.tsx`; Clerk sign-in/sign-up UI routes live in `src/routes/sign-in.$.tsx` and `src/routes/sign-up.$.tsx`.
  - Convex identity: `createAuthenticatedConvexClient` calls Clerk `auth()` and requests a `convex` token template in `src/lib/server/convex-source.ts`.
  - Convex issuer: `convex/auth.config.ts` fails closed if `CLERK_JWT_ISSUER_DOMAIN` is absent.
  - Local E2E bypass: `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E=true` disables Clerk middleware/provider only for local test paths in `src/start.ts`, `src/routes/__root.tsx`, and module helper files.

**Internal Admission & Operator Identity:**
- Source-write admission uses `AE_SOURCE_WRITE_SECRET` and request origin/path/method context in `src/lib/server/source-write-admission.ts` and `src/modules/security/source-write-admission.ts`.
- Admin bootstrap membership can be configured with `ADMIN_BOOTSTRAP_PRINCIPAL_IDS` in `convex/security.ts`; admin authority otherwise comes from source-owned membership tables.
- Notification dispatch routes use `AE_NOTIFICATION_OUTBOX_SECRET` as the system bearer secret in `src/routes/api.notification.resend-dispatch.ts`, `src/routes/api.notification.novu-dispatch.ts`, and `convex/notificationOutbox.ts`.

## Monitoring & Observability

**Error Tracking:**
- No Sentry, PostHog, Datadog, OpenTelemetry, or external error tracking package was detected in `package.json` or source imports.

**Logs:**
- No centralized logger framework was detected.
- Operational observability is source-owned: `src/modules/observability/internal/schema.ts` defines `operationKeys`, `auditEvents`, `operatorControls`, `funnelEvents`, and `ownerActivationState`; Convex runtime functions in `convex/observability.ts` persist/read these records.
- Provider routes return structured JSON error bodies with `Cache-Control: no-store` in `src/routes/api.notification.resend-webhook.ts`, `src/routes/api.notification.resend-dispatch.ts`, `src/routes/api.notification.novu-dispatch.ts`, `src/routes/api.business-actions.stripe-webhook.ts`, and `src/future-phases/05-paid-activation-money-rails/routes/api.billing.webhook.ts`.

## CI/CD & Deployment

**Hosting:**
- Vercel is the detected hosting target from `.vercel/README.txt`; the local `.vercel/` folder is ignored and should not be committed.
- TanStack Start/Nitro build output is generated under ignored `.output/` and `.vercel/output/` paths.

**CI Pipeline:**
- None detected: no `.github/` directory exists.
- Command-based gates are defined in `package.json`, including `npm run typecheck`, `npm run check:convex-codegen`, `npm run test:all`, `npm run test:e2e`, `npm run test:deploy-smoke`, `npm run test:provider-smoke:resend`, `npm run test:provider-smoke:novu`, `npm run test:provider-smoke:autumn-stripe`, and `npm run test:provider-smoke:business-action-stripe`.

## Environment Configuration

**Required env vars:**
- Core app/auth/source: `CONVEX_URL` or `VITE_CONVEX_URL`, `CLERK_JWT_ISSUER_DOMAIN`, `CLERK_SECRET_KEY`, `AE_SOURCE_WRITE_SECRET`, `ADMIN_BOOTSTRAP_PRINCIPAL_IDS`, `SITE_URL`, `VITE_SITE_URL`, `AE_CANONICAL_BASE_URL`, and `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E`.
- Notification outbox: `AE_NOTIFICATION_OUTBOX_SECRET`, `RESEND_API_KEY`, `RESEND_FROM`, `RESEND_WEBHOOK_SECRET`, `NOVU_SECRET_KEY`, `NOVU_WORKFLOW_INQUIRY_OWNER`, optional `RESEND_API_BASE_URL`, optional `NOVU_WORKFLOW_INQUIRY_CUSTOMER`, and optional `NOVU_API_BASE_URL`.
- Billing/payment evidence: `AUTUMN_SECRET_KEY`, optional `AUTUMN_API_BASE_URL`, optional `AUTUMN_API_VERSION`, optional `AUTUMN_WEBHOOK_SECRET`, and `STRIPE_WEBHOOK_SECRET`.
- Deploy smoke: `DEPLOY_BASE_URL`, `DEPLOY_CONVEX_URL`, and scenario-specific `SMOKE_*` values in `tests/deploy-smoke/`.

**Secrets location:**
- `.env.local` exists and `.env.example` exists; contents were not read.
- `.gitignore` ignores `.env`, `.env.*`, `.clerk/`, `.vercel/`, `.convex/`, `playwright-report/`, and `test-results/`; Playwright storage-state artifacts under `.auth/` exist separately and should be treated as local secrets.
- Do not commit `.env.local`, Clerk local config, Playwright storage states, Vercel project metadata, Convex deployment state, provider secrets, webhook signing secrets, or smoke storage-state artifacts.

## Webhooks & Callbacks

**Incoming:**
- `POST /api/notification/resend-webhook` - Resend delivery webhook in `src/routes/api.notification.resend-webhook.ts`; verifies Svix headers `svix-id`, `svix-timestamp`, and `svix-signature` with `RESEND_WEBHOOK_SECRET` in `src/lib/server/notification-provider.ts`.
- `POST /api/business-actions/stripe-webhook` - Stripe test-mode business-action evidence webhook in `src/routes/api.business-actions.stripe-webhook.ts`; verifies `stripe-signature` with `STRIPE_WEBHOOK_SECRET` and admits source-owned evidence through `src/modules/business-action/business-action.functions.ts`.
- `POST /api/billing/webhook` - parked Autumn billing webhook route in `src/future-phases/05-paid-activation-money-rails/routes/api.billing.webhook.ts`; currently returns `unverified_webhook` because `src/lib/server/billing-provider.ts` refuses unconfigured Autumn webhook verification.

**Outgoing:**
- Clerk REST lookup - `GET https://api.clerk.com/v1/users/{clerkUserId}` from `src/lib/server/notification-provider.ts` using `CLERK_SECRET_KEY`.
- Resend send - `POST {RESEND_API_BASE_URL or https://api.resend.com}/emails` from `src/lib/server/notification-provider.ts` using `RESEND_API_KEY` and `Idempotency-Key`.
- Novu trigger - `POST {NOVU_API_BASE_URL or https://api.novu.co}/v1/events/trigger` from `src/lib/server/notification-provider.ts` using `NOVU_SECRET_KEY`, workflow IDs, and `Idempotency-Key`.
- Novu readback - `GET {NOVU_API_BASE_URL or https://api.novu.co}/v1/messages` from `src/lib/server/notification-provider.ts` using `NOVU_SECRET_KEY`.
- Autumn billing - `POST https://api.useautumn.com/v1/billing.attach`, `/v1/billing.open_customer_portal`, and `/v1/customers.get` from `src/modules/billing/internal/provider-readback.ts` using `AUTUMN_SECRET_KEY`.
- Stripe Checkout - `POST https://api.stripe.com/v1/checkout/sessions` from `src/modules/business-action/internal/stripe-checkout.ts` using a server-supplied test secret key and source-owned metadata/idempotency fields.
- Convex source calls - queries, mutations, and actions through `ConvexHttpClient` in `src/lib/server/convex-source.ts` using Clerk-authenticated or public source transports.

---

*Integration audit: 2026-06-30*
