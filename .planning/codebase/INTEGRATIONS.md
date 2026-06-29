# External Integrations

**Analysis Date:** 2026-06-29

## APIs & External Services

**Backend Database and Functions:**
- Convex - Source-of-truth database, query/mutation/action runtime, and route-facing source state API.
  - SDK/Client: `convex` 1.42.0 from `package.json`.
  - Auth: `CONVEX_URL` or `VITE_CONVEX_URL` in `src/lib/server/convex-source.ts`; Clerk token template `convex` in `src/lib/server/convex-source.ts`; Clerk issuer `CLERK_JWT_ISSUER_DOMAIN` in `convex/auth.config.ts`.
  - Implementation: schema composition in `convex/schema.ts`, domain functions in `convex/*.ts`, schema fragments in `src/modules/*/internal/schema.ts`, and server HTTP clients in `src/lib/server/convex-source.ts`.

**Authentication and Identity:**
- Clerk - Browser auth provider, TanStack Start request middleware, server auth reads, Convex JWT issuer, and owner email lookup for notification dispatch.
  - SDK/Client: `@clerk/tanstack-react-start` 1.4.9 from `package.json`.
  - Auth: Clerk SDK env by provider convention; source explicitly reads `CLERK_JWT_ISSUER_DOMAIN` in `convex/auth.config.ts` and `CLERK_SECRET_KEY` in `src/lib/server/notification-provider.ts`.
  - Implementation: `clerkMiddleware()` in `src/start.ts`, `ClerkProvider` in `src/routes/__root.tsx`, hosted auth routes in `src/routes/sign-in.$.tsx` and `src/routes/sign-up.$.tsx`, server `auth()` in `src/lib/server/convex-source.ts`, and Clerk REST user lookup in `src/lib/server/notification-provider.ts`.
  - External endpoint: `https://api.clerk.com/v1/users/{clerkUserId}` in `src/lib/server/notification-provider.ts`.

**Billing and Paid Activation:**
- Autumn Cloud - Default Phase 5 billing/product-ops authority for paid activation, checkout attach, customer portal, and customer readback.
  - SDK/Client: No Autumn npm SDK; raw `fetch` provider in `src/modules/billing/internal/provider-readback.ts`, exported through `src/modules/billing/server.ts` and configured by `src/lib/server/billing-provider.ts`.
  - Auth: `AUTUMN_SECRET_KEY`, optional `AUTUMN_API_BASE_URL`, optional `AUTUMN_API_VERSION`, and optional `AUTUMN_WEBHOOK_SECRET` in `src/lib/server/billing-provider.ts`.
  - External endpoints: default `https://api.useautumn.com/v1/billing.attach`, `https://api.useautumn.com/v1/billing.open_customer_portal`, and `https://api.useautumn.com/v1/customers.get` in `src/modules/billing/internal/provider-readback.ts`.
  - Source seam: `startPaidActivation`, `startCustomerPortal`, `ingestBillingProviderEvent`, `recordBillingEvidence`, `readBillingStatus`, `readReceipt`, `readBillingReconciliation`, `retryBillingReconciliation`, `markBillingNoRepair`, `disablePaidActivation`, and billing projections exported by `src/modules/billing/public.ts`.
  - Webhook posture: parked route `src/future-phases/05-paid-activation-money-rails/routes/api.billing.webhook.ts` preserves raw request text, but `verifyAutumnWebhook` in `src/lib/server/billing-provider.ts` rejects callbacks with `unverified_webhook`.
- Stripe PSP - Payment collection, invoices/receipts, refunds, disputes, and PSP evidence beneath Autumn for Phase 5.
  - SDK/Client: Not installed; no `stripe` package in `package.json`.
  - Auth: `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` are Phase 5 planned env vars in `.planning/phases/05-paid-activation-money-rails/05-01-autumn-stripe-paid-activation-PLAN.md`; current source does not read them.
  - Implementation: provider value `stripe_psp` exists in `src/modules/billing/internal/schema.ts`; Stripe invoice IDs and hosted invoice URLs are normalized from Autumn readbacks in `src/modules/billing/internal/provider-readback.ts`.
  - Constraint: Direct Stripe subscription authority is out of scope unless an evidence-backed Autumn blocker record exists, per `.planning/phases/05-paid-activation-money-rails/05-SPEC.md` and `.planning/phases/05-paid-activation-money-rails/05-CONTEXT.md`.

**Email Delivery:**
- Resend - Owner inquiry email dispatch and delivery webhook ingestion.
  - SDK/Client: No Resend npm SDK; raw `fetch` in `src/lib/server/notification-provider.ts`.
  - Auth: `RESEND_API_KEY`, `RESEND_FROM`, optional `RESEND_API_BASE_URL`, and `RESEND_WEBHOOK_SECRET` in `src/lib/server/notification-provider.ts`.
  - Dispatch route: `/api/notification/resend-dispatch` implemented by `src/routes/api.notification.resend-dispatch.ts`.
  - Webhook route: `/api/notification/resend-webhook` implemented by `src/routes/api.notification.resend-webhook.ts`.
  - External endpoint: `https://api.resend.com/emails` in `src/lib/server/notification-provider.ts`.

**Notification Workflow:**
- Novu - Owner inquiry workflow trigger and message readback.
  - SDK/Client: No Novu npm SDK; raw `fetch` in `src/lib/server/notification-provider.ts`.
  - Auth: `NOVU_SECRET_KEY`, `NOVU_WORKFLOW_INQUIRY_OWNER`, optional `NOVU_WORKFLOW_INQUIRY_CUSTOMER`, and optional `NOVU_API_BASE_URL` in `src/lib/server/notification-provider.ts`.
  - Dispatch route: `/api/notification/novu-dispatch` implemented by `src/routes/api.notification.novu-dispatch.ts`.
  - External endpoints: `https://api.novu.co/v1/events/trigger` and `https://api.novu.co/v1/messages` in `src/lib/server/notification-provider.ts`.

**Public HTTP Surface:**
- TanStack Start routes - Public catalog, discovery, notification, sitemap, robots, llms, owner, admin, and parked future Phase 5 route handlers.
  - SDK/Client: `@tanstack/react-start` and `@tanstack/react-router` from `package.json`.
  - Auth: Clerk middleware in `src/start.ts`; route-specific Convex or notification secrets in `src/lib/server/convex-source.ts` and `src/lib/server/notification-provider.ts`.
  - Implementation: API route files under `src/routes/api.*.ts`, public text/XML routes under `src/routes/robots[.]txt.ts`, `src/routes/sitemap[.]xml.ts`, `src/routes/llms[.]txt.ts`, and parked Phase 5 routes under `src/future-phases/05-paid-activation-money-rails/routes/`.

## Data Storage

**Databases:**
- Convex document database.
  - Connection: `CONVEX_URL` or `VITE_CONVEX_URL`, read by `src/lib/server/convex-source.ts`.
  - Client: `ConvexHttpClient` from `convex/browser` in `src/lib/server/convex-source.ts` and server-function/route helpers under `src/modules/` and `src/routes/`.
  - Schema root: `convex/schema.ts`.
  - Billing tables: `billingOffers`, `billingOperations`, `billingProviderEvents`, `billingReceipts`, `billingReconciliations`, and `capabilityLaunchSupportRecords` in `src/modules/billing/internal/schema.ts`.
  - Billing state policy: provider events store `payloadHash`, `redactedPayloadJson`, normalized fields, signature status, retrieval status, and correlation IDs in `src/modules/billing/internal/schema.ts`; raw provider/payment bodies are not modeled.
  - Notification tables: `src/modules/notification-outbox/internal/schema.ts`.
  - Observability tables: `src/modules/observability/internal/schema.ts`.

**File Storage:**
- Local/generated artifacts only - Build output lives under `.output/`, Playwright/test output under `test-results/` and `output/playwright/` when generated.
- External object storage: Not detected in `package.json`, `src/`, or `convex/`.

**Caching:**
- Convex query caching/reactivity - Provided by Convex for `convex/*.ts`.
- HTTP no-store controls - Notification and provider callback routes set no-store behavior in `src/routes/api.notification.resend-dispatch.ts`, `src/routes/api.notification.novu-dispatch.ts`, `src/routes/api.notification.resend-webhook.ts`, and `src/future-phases/05-paid-activation-money-rails/routes/api.billing.webhook.ts`.
- External cache service: Not detected.

## Authentication & Identity

**Auth Provider:**
- Clerk with Convex JWT integration.
  - Implementation: request middleware in `src/start.ts`, provider wrapper in `src/routes/__root.tsx`, hosted auth routes in `src/routes/sign-in.$.tsx` and `src/routes/sign-up.$.tsx`, Convex token read in `src/lib/server/convex-source.ts`, and Convex auth config in `convex/auth.config.ts`.
  - Convex token template: `convex`, requested by `readRequiredConvexAuthToken` in `src/lib/server/convex-source.ts`.
  - Local E2E bypass: `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E` disables Clerk middleware/provider in `src/start.ts` and `src/routes/__root.tsx`.
  - Billing authority: owner-only starts are enforced by `requireBillingOwner` in `src/modules/billing/internal/authority.ts`; operator read/reconcile/disable/no-repair permissions are enforced by `requireBillingOperator` in `src/modules/billing/internal/authority.ts`.

## Monitoring & Observability

**Error Tracking:**
- External error tracking: Not detected in `package.json`, `src/`, or `convex/`; no Sentry package is installed.
- Internal audit/readback: Audit events, funnel events, operator controls, provider evidence, receipts, and reconciliation records are modeled in `src/modules/observability/public.ts`, `src/modules/observability/internal/schema.ts`, `convex/observability.ts`, and `src/modules/billing/internal/operations.ts`.

**Logs:**
- Runtime logging framework: Not detected.
- Provider evidence posture: `src/modules/billing/internal/operations.ts` records redacted payload JSON, hashes, provider refs, and audit events; `tests/unit/billing/rail.test.ts` asserts raw provider bodies are not stored on provider events.
- Test reporting: Vitest uses `vitest.config.ts`; Playwright local and deploy smoke reporters are configured in `playwright.config.ts` and `playwright.deploy-smoke.config.ts`.

## CI/CD & Deployment

**Hosting:**
- Nitro node server output - `.output/nitro.json` identifies preset `node-server` and server entry `server/index.mjs`.
- Vercel link marker - `.vercel/README.txt` indicates the local directory is linked to a Vercel project; `.vercel/` metadata is not source configuration and should not be shared.
- Convex deployment - Convex source lives under `convex/`, generated artifacts under `convex/_generated/`, and `package.json` includes `check:convex-codegen`.

**CI Pipeline:**
- GitHub Actions: Not detected; `.github/` is absent.
- Root deployment config: No `vercel.json`, Netlify, Docker, Fly, Railway, or other root deploy config detected.
- Package-script gates: `package.json` provides local verification through `test:all`, E2E/a11y scripts, deploy smoke scripts, provider smoke scripts, `typecheck`, `check:convex-codegen`, and `build`.

## Environment Configuration

**Required env vars:**
- Core Convex: `CONVEX_URL` or `VITE_CONVEX_URL` in `src/lib/server/convex-source.ts`.
- Convex/Clerk auth: `CLERK_JWT_ISSUER_DOMAIN` in `convex/auth.config.ts`.
- Clerk owner lookup: `CLERK_SECRET_KEY` in `src/lib/server/notification-provider.ts`.
- Clerk local bypass: `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E` in `src/start.ts` and `src/routes/__root.tsx`.
- Public URLs: `SITE_URL` or `VITE_SITE_URL` in source modules under `src/modules/inquiries/`, `src/modules/catalog/`, and `src/modules/security/`.
- Source write admission: `AE_SOURCE_WRITE_SECRET` in `src/lib/server/source-write-admission.ts`.
- Notification outbox: `AE_NOTIFICATION_OUTBOX_SECRET` in `src/lib/server/notification-provider.ts`, notification routes under `src/routes/`, and `convex/notificationOutbox.ts`.
- Resend: `RESEND_API_KEY`, `RESEND_FROM`, optional `RESEND_API_BASE_URL`, and `RESEND_WEBHOOK_SECRET` in `src/lib/server/notification-provider.ts`.
- Novu: `NOVU_SECRET_KEY`, `NOVU_WORKFLOW_INQUIRY_OWNER`, optional `NOVU_WORKFLOW_INQUIRY_CUSTOMER`, and optional `NOVU_API_BASE_URL` in `src/lib/server/notification-provider.ts`.
- Autumn current source: `AUTUMN_SECRET_KEY`, optional `AUTUMN_API_BASE_URL`, optional `AUTUMN_API_VERSION`, and optional `AUTUMN_WEBHOOK_SECRET` in `src/lib/server/billing-provider.ts`.
- Phase 5 planned additions: `AUTUMN_ENVIRONMENT`, `AUTUMN_PROJECT_ID`, `AUTUMN_PORTAL_RETURN_BASE_URL`, `STRIPE_SECRET_KEY`, and `STRIPE_WEBHOOK_SECRET` are named in `.planning/phases/05-paid-activation-money-rails/05-01-autumn-stripe-paid-activation-PLAN.md` but are not read by current source.
- Playwright local E2E: `PLAYWRIGHT_BASE_URL` in `playwright.config.ts`.
- Deploy smoke: `DEPLOY_BASE_URL`, `DEPLOY_CONVEX_URL`, `SMOKE_ADMIN_STORAGE_STATE`, `SMOKE_OWNER_STORAGE_STATE`, `SMOKE_BUSINESS_SLUG`, `SMOKE_PHASE2_BUSINESS_SLUG`, `SMOKE_NOTIFICATION_DISPATCH_ID`, and `SMOKE_NOVU_NOTIFICATION_DISPATCH_ID` in `tests/deploy-smoke/*.spec.ts`.

**Secrets location:**
- `.env.local` file present - contains local environment configuration and was not read.
- `.env.example` file present - existence noted and contents were not read.
- `.vercel/` marker present - `.vercel/README.txt` says it contains linked project/org IDs and should not be shared.
- Runtime secrets are read from `process.env` in `src/lib/server/convex-source.ts`, `src/lib/server/source-write-admission.ts`, `src/lib/server/notification-provider.ts`, `src/lib/server/billing-provider.ts`, and `convex/auth.config.ts`.

## Webhooks & Callbacks

**Incoming:**
- `/api/notification/resend-webhook` - Resend webhook endpoint in `src/routes/api.notification.resend-webhook.ts`; verifies Svix-style headers using `RESEND_WEBHOOK_SECRET` in `src/lib/server/notification-provider.ts`.
- `/api/billing/webhook` - Parked Phase 5 billing webhook route in `src/future-phases/05-paid-activation-money-rails/routes/api.billing.webhook.ts`; preserves raw body text and currently returns typed refusal because `verifyAutumnWebhook` in `src/lib/server/billing-provider.ts` is not configured.
- Public read endpoints - `/api/businesses`, `/api/businesses/search`, `/api/businesses/$slug`, `/api/discovery/schema`, `/api/discovery/examples`, `/api/discovery/fixtures`, `/sitemap.xml`, `/robots.txt`, `/llms.txt`, and `/$slug.ucp` are implemented under `src/routes/`.

**Outgoing:**
- Convex calls - Server routes and server functions call Convex through `src/lib/server/convex-source.ts` and route/module helpers under `src/modules/` and `src/routes/`.
- Clerk REST - Owner delivery address lookup calls Clerk users API from `src/lib/server/notification-provider.ts`.
- Resend REST - Owner email dispatch posts to Resend from `src/lib/server/notification-provider.ts`, orchestrated by `src/routes/api.notification.resend-dispatch.ts`.
- Novu REST - Workflow trigger and message readback call Novu from `src/lib/server/notification-provider.ts`, orchestrated by `src/routes/api.notification.novu-dispatch.ts`.
- Autumn REST - Billing attach, customer portal, and customer readback call Autumn from `src/modules/billing/internal/provider-readback.ts`, configured by `src/lib/server/billing-provider.ts`.
- Server-to-server dispatch callbacks - `/api/notification/resend-dispatch` and `/api/notification/novu-dispatch` require `Authorization: Bearer ${AE_NOTIFICATION_OUTBOX_SECRET}` in route implementations under `src/routes/`.

## Phase 5 Autumn+Stripe Readiness

**Ready in source:**
- Route-facing billing API seam exists in `src/modules/billing/public.ts`.
- Autumn raw HTTP provider exists in `src/modules/billing/internal/provider-readback.ts`.
- Billing authority checks exist in `src/modules/billing/internal/authority.ts`.
- Billing source schema and Convex table definitions exist in `src/modules/billing/internal/schema.ts` and are included by `convex/schema.ts`.
- Owner/admin/private/public projections exist in `src/modules/billing/internal/projections.ts`.
- Contract tests exist in `tests/unit/billing/rail.test.ts`, `tests/unit/billing/owner-routes.test.ts`, `tests/unit/schema/convex-schema.test.ts`, `tests/copy/claims-register.test.ts`, and `tests/unit/server/server-seams.test.ts`.

**Blocked or not configured:**
- Money decision record is required before Phase 5 runtime work per `.planning/phases/05-paid-activation-money-rails/05-01-autumn-stripe-paid-activation-PLAN.md`.
- Autumn webhook signature verification is not configured; `src/lib/server/billing-provider.ts` returns `unverified_webhook`.
- Stripe direct SDK/API integration is not present in `package.json`; Stripe remains PSP evidence under Autumn unless an Autumn blocker record selects fallback.
- Live provider readiness cannot be proven by env vars, screenshots, or dashboard state; `.planning/phases/05-paid-activation-money-rails/05-01-autumn-stripe-paid-activation-PLAN.md` requires source-owned readback rows with timestamp, stable provider refs, payload hash, route or smoke evidence, and operator next action.
- Phase 5 closeout requires provider smoke for checkout start, return, cancel, signed webhook, receipt, refund/dispute, reconciliation mismatch, retry/no-repair, disable/rollback, and selected public claim evidence per `.planning/phases/05-paid-activation-money-rails/05-01-autumn-stripe-paid-activation-PLAN.md`.

---

*Integration audit: 2026-06-29*
