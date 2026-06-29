# External Integrations

**Analysis Date:** 2026-06-29

## APIs & External Services

**Backend Database and Functions:**
- Convex - Source-of-truth database, query/mutation runtime, and public source-state read/write API.
  - SDK/Client: `convex` 1.42.0 from `package.json`.
  - Auth: `CONVEX_URL` or `VITE_CONVEX_URL` in `src/lib/server/convex-source.ts`; Clerk token template `convex` in `src/lib/server/convex-source.ts`; Clerk issuer domain `CLERK_JWT_ISSUER_DOMAIN` in `convex/auth.config.ts`.
  - Implementation: schema composition in `convex/schema.ts`, domain functions in `convex/*.ts`, table schema fragments in `src/modules/*/internal/schema.ts`, and HTTP clients in `src/lib/server/convex-source.ts`.

**Authentication and Identity:**
- Clerk - Browser auth UI, request middleware, server auth, Convex JWT issuer, and owner email lookup for notification dispatch.
  - SDK/Client: `@clerk/tanstack-react-start` 1.4.9 from `package.json`.
  - Auth: Clerk SDK env by provider convention; source explicitly reads `CLERK_SECRET_KEY` in `src/lib/server/notification-provider.ts` and `CLERK_JWT_ISSUER_DOMAIN` in `convex/auth.config.ts`.
  - Implementation: `clerkMiddleware()` in `src/start.ts`, `ClerkProvider` in `src/routes/__root.tsx`, sign-in route `src/routes/sign-in.$.tsx`, sign-up route `src/routes/sign-up.$.tsx`, server `auth()` use in `src/lib/server/convex-source.ts`, and Clerk REST owner lookup in `src/lib/server/notification-provider.ts`.
  - External endpoint: `https://api.clerk.com/v1/users/{clerkUserId}` in `src/lib/server/notification-provider.ts`.

**Email Delivery:**
- Resend - Owner inquiry email dispatch and delivery webhook ingestion.
  - SDK/Client: No Resend npm SDK; raw `fetch` implementation in `src/lib/server/notification-provider.ts`.
  - Auth: `RESEND_API_KEY`, `RESEND_FROM`, optional `RESEND_API_BASE_URL`, and webhook secret `RESEND_WEBHOOK_SECRET` in `src/lib/server/notification-provider.ts`.
  - Dispatch route: `/api/notification/resend-dispatch` implemented by `src/routes/api.notification.resend-dispatch.ts`.
  - Webhook route: `/api/notification/resend-webhook` implemented by `src/routes/api.notification.resend-webhook.ts`.
  - External endpoint: `https://api.resend.com/emails` in `src/lib/server/notification-provider.ts`.

**Notification Workflow:**
- Novu - Owner inquiry workflow trigger and message readback.
  - SDK/Client: No Novu npm SDK; raw `fetch` implementation in `src/lib/server/notification-provider.ts`.
  - Auth: `NOVU_SECRET_KEY`, `NOVU_WORKFLOW_INQUIRY_OWNER`, optional `NOVU_WORKFLOW_INQUIRY_CUSTOMER`, and optional `NOVU_API_BASE_URL` in `src/lib/server/notification-provider.ts`.
  - Dispatch route: `/api/notification/novu-dispatch` implemented by `src/routes/api.notification.novu-dispatch.ts`.
  - External endpoints: `https://api.novu.co/v1/events/trigger` and `https://api.novu.co/v1/messages` in `src/lib/server/notification-provider.ts`.

**Billing Provider:**
- Autumn Cloud - Paid activation attach, customer portal, customer readback, and provider event model.
  - SDK/Client: No Autumn npm SDK; raw `fetch` provider in `src/modules/billing/internal/provider-readback.ts`, surfaced through `src/lib/server/billing-provider.ts`.
  - Auth: `AUTUMN_SECRET_KEY`, optional `AUTUMN_API_BASE_URL`, optional `AUTUMN_API_VERSION`, and optional `AUTUMN_WEBHOOK_SECRET` in `src/lib/server/billing-provider.ts`.
  - External endpoint: default `https://api.useautumn.com` in `src/modules/billing/internal/provider-readback.ts`.
  - Webhook state: parked route `src/future-phases/05-paid-activation-money-rails/routes/api.billing.webhook.ts` calls `verifyAutumnWebhook`, and `src/lib/server/billing-provider.ts` rejects unverified callbacks.
  - Stripe surface: Stripe invoice IDs and hosted invoice URLs are normalized from Autumn responses in `src/modules/billing/internal/provider-readback.ts`; no direct Stripe SDK or Stripe API client is declared in `package.json`.

**Public HTTP API Surface:**
- TanStack Start API routes - Public catalog, discovery, notification, sitemap, robots, and llms endpoints.
  - SDK/Client: `@tanstack/react-router` route handlers and `@tanstack/react-start` runtime from `package.json`.
  - Auth: Public routes use public Convex clients or route-specific checks; server-to-server notification routes require `AE_NOTIFICATION_OUTBOX_SECRET` in `src/routes/api.notification.resend-dispatch.ts` and `src/routes/api.notification.novu-dispatch.ts`.
  - Implementation: API route files under `src/routes/api.*.ts`, text/XML routes `src/routes/robots[.]txt.ts`, `src/routes/sitemap[.]xml.ts`, and `src/routes/llms[.]txt.ts`.

## Data Storage

**Databases:**
- Convex document database.
  - Connection: `CONVEX_URL` or `VITE_CONVEX_URL`, read by `src/lib/server/convex-source.ts` and route helpers such as `src/routes/api.businesses.ts`.
  - Client: `ConvexHttpClient` from `convex/browser` in `src/lib/server/convex-source.ts`, `src/modules/catalog/owner-claim.functions.ts`, `src/modules/inquiries/inquiry.functions.ts`, `src/modules/protected-action/contact-follow-up.functions.ts`, and multiple server routes under `src/routes/`.
  - Schema: `convex/schema.ts` composes table modules from `src/modules/business/internal/schema.ts`, `src/modules/catalog/internal/schema.ts`, `src/modules/registry/internal/schema.ts`, `src/modules/discovery/internal/schema.ts`, `src/modules/inquiries/internal/convex-schema.ts`, `src/modules/notification-outbox/internal/schema.ts`, `src/modules/protected-action/internal/schema.ts`, `src/modules/observability/internal/schema.ts`, `src/modules/security/internal/schema.ts`, and `src/modules/billing/internal/schema.ts`.
  - Major tables: business/owner/claim tables in `src/modules/business/internal/schema.ts`, catalog tables in `src/modules/catalog/internal/schema.ts`, inquiry tables in `src/modules/inquiries/internal/convex-schema.ts`, notification dispatch/webhook tables in `src/modules/notification-outbox/internal/schema.ts`, audit/funnel/operation tables in `src/modules/observability/internal/schema.ts`, admin/security tables in `src/modules/security/internal/schema.ts`, protected-action tables in `src/modules/protected-action/internal/schema.ts`, and billing tables in `src/modules/billing/internal/schema.ts`.

**File Storage:**
- Local/generated artifacts only - Generated app output lives under `.output/`, screenshots/proofs under `output/playwright/`, and test results under `test-results/`.
- No Convex file storage, S3, GCS, R2, or upload SDK usage is detected in `src/` or `convex/`.

**Caching:**
- Convex query caching/reactivity - Provided by Convex query runtime used in `convex/*.ts`.
- HTTP caching is explicit per route - Notification and business API responses set `Cache-Control: no-store` in `src/routes/api.notification.resend-dispatch.ts`, `src/routes/api.notification.novu-dispatch.ts`, `src/routes/api.notification.resend-webhook.ts`, `src/routes/api.businesses.ts`, and `src/lib/http/discovery-response.ts`.
- Developer discovery cache metadata is internal source state - Cache version and headers are modeled in `src/modules/discovery/public.ts` and route `src/routes/api.discovery.schema.ts`.
- External cache service: Not detected in `package.json`, `src/`, or `convex/`.

## Authentication & Identity

**Auth Provider:**
- Clerk with Convex JWT integration.
  - Implementation: `clerkMiddleware()` in `src/start.ts`, `ClerkProvider` in `src/routes/__root.tsx`, hosted Clerk UI components in `src/routes/sign-in.$.tsx` and `src/routes/sign-up.$.tsx`, server `auth()` integration in `src/lib/server/convex-source.ts`, and Convex JWT provider config in `convex/auth.config.ts`.
  - Convex token template: `convex`, requested by `readRequiredConvexAuthToken` in `src/lib/server/convex-source.ts`.
  - Local bypass: `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E` disables Clerk middleware/provider in `src/start.ts` and `src/routes/__root.tsx` for local E2E paths.
  - Admin identity: Clerk user IDs are persisted and indexed through `src/modules/business/internal/schema.ts` (`owners.by_clerkUserId`) and `src/modules/security/internal/schema.ts` (`adminMemberships.by_clerkUserId_state`).

## Monitoring & Observability

**Error Tracking:**
- External error tracking: Not detected in `package.json`, `src/`, or `convex/`; no Sentry package is installed.
- Internal audit/observability: Convex-backed audit events, funnel events, operation keys, operator controls, notification readbacks, and billing readbacks are defined in `src/modules/observability/public.ts`, `src/modules/observability/internal/schema.ts`, `convex/observability.ts`, and feature-specific Convex modules such as `convex/inquiries.ts` and `convex/notificationOutbox.ts`.

**Logs:**
- Runtime logging framework: Not detected; errors are represented as typed results and JSON responses in server routes such as `src/routes/api.notification.resend-dispatch.ts`, `src/routes/api.notification.novu-dispatch.ts`, and `src/routes/api.notification.resend-webhook.ts`.
- Test reporting: Vitest uses `vitest.config.ts`; Playwright reporters are configured in `playwright.config.ts` and `playwright.deploy-smoke.config.ts`.

## CI/CD & Deployment

**Hosting:**
- Nitro node server output - `.output/nitro.json` identifies preset `node-server` and server entry `.output/server/index.mjs`.
- Vercel link marker - `.vercel/README.txt` indicates the project directory is linked to Vercel; no `vercel.json` deployment config is detected.
- Convex deployment - Convex source exists under `convex/`, generated Convex artifacts are under `convex/_generated/`, and `package.json` includes `check:convex-codegen`.

**CI Pipeline:**
- GitHub Actions: Not detected; `.github/` is absent.
- Package scripts: `package.json` provides `test:all`, `test:e2e`, deploy smoke scripts, provider smoke scripts, and `build` for local or external CI orchestration.

## Environment Configuration

**Required env vars:**
- Core Convex: `CONVEX_URL` or `VITE_CONVEX_URL` in `src/lib/server/convex-source.ts`.
- Convex/Clerk auth: `CLERK_JWT_ISSUER_DOMAIN` in `convex/auth.config.ts`.
- Clerk owner lookup: `CLERK_SECRET_KEY` in `src/lib/server/notification-provider.ts`.
- Clerk local bypass: `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E` in `src/start.ts` and `src/routes/__root.tsx`.
- Public URLs: `SITE_URL` or `VITE_SITE_URL` in `src/modules/inquiries/inquiry.functions.ts`, `src/modules/catalog/owner-claim.functions.ts`, and `src/routes/privacy.remove-business.tsx`.
- Allowed origins: `AE_ALLOWED_ORIGINS` or `VITE_AE_ALLOWED_ORIGINS` in `convex/catalog.ts`, `convex/business.ts`, `convex/discovery.ts`, `convex/inquiries.ts`, `convex/notificationOutbox.ts`, `convex/observability.ts`, and `convex/security.ts`.
- Notification system auth: `AE_NOTIFICATION_OUTBOX_SECRET` in `src/lib/server/notification-provider.ts`, `src/routes/api.notification.resend-dispatch.ts`, `src/routes/api.notification.novu-dispatch.ts`, and `src/routes/api.notification.resend-webhook.ts`.
- Resend: `RESEND_API_KEY`, `RESEND_FROM`, optional `RESEND_API_BASE_URL`, and `RESEND_WEBHOOK_SECRET` in `src/lib/server/notification-provider.ts`.
- Novu: `NOVU_SECRET_KEY`, `NOVU_WORKFLOW_INQUIRY_OWNER`, optional `NOVU_WORKFLOW_INQUIRY_CUSTOMER`, and optional `NOVU_API_BASE_URL` in `src/lib/server/notification-provider.ts`.
- Autumn: `AUTUMN_SECRET_KEY`, optional `AUTUMN_API_BASE_URL`, optional `AUTUMN_API_VERSION`, and optional `AUTUMN_WEBHOOK_SECRET` in `src/lib/server/billing-provider.ts`.
- Playwright local E2E: `PLAYWRIGHT_BASE_URL` in `playwright.config.ts`.
- Deploy smoke: `DEPLOY_BASE_URL`, `DEPLOY_CONVEX_URL`, `SMOKE_ADMIN_STORAGE_STATE`, `SMOKE_OWNER_STORAGE_STATE`, `SMOKE_BUSINESS_SLUG`, `SMOKE_PHASE2_BUSINESS_SLUG`, `SMOKE_NOTIFICATION_DISPATCH_ID`, and `SMOKE_NOVU_NOTIFICATION_DISPATCH_ID` in `tests/deploy-smoke/*.spec.ts`.

**Secrets location:**
- `.env.local` file present - contains local environment configuration and was not read.
- `.env.example` file present - existence noted and contents were not read under the repository secret-handling rules.
- `.vercel/` link marker present - `.vercel/README.txt` describes project/org IDs in Vercel link metadata; do not treat `.vercel/` as source configuration for runtime secrets.
- Runtime provider secrets are read from `process.env` in `src/lib/server/notification-provider.ts`, `src/lib/server/billing-provider.ts`, `src/lib/server/convex-source.ts`, and `convex/auth.config.ts`.

## Webhooks & Callbacks

**Incoming:**
- `/api/notification/resend-webhook` - Resend webhook endpoint in `src/routes/api.notification.resend-webhook.ts`; verifies Svix-style `svix-id`, `svix-timestamp`, and `svix-signature` headers using `RESEND_WEBHOOK_SECRET` in `src/lib/server/notification-provider.ts`, then writes to Convex mutation `notificationOutbox:ingestNotificationWebhookEvent`.
- `/api/billing/webhook` - Parked billing webhook route in `src/future-phases/05-paid-activation-money-rails/routes/api.billing.webhook.ts`; `verifyAutumnWebhook` in `src/lib/server/billing-provider.ts` rejects unverified callbacks.
- Public API reads - `/api/businesses`, `/api/businesses/search`, `/api/businesses/$slug`, `/api/discovery/schema`, `/api/discovery/examples`, `/api/discovery/fixtures`, `/sitemap.xml`, `/robots.txt`, `/llms.txt`, and `/$slug.ucp` are implemented in `src/routes/` and primarily read Convex state.

**Outgoing:**
- Convex calls - Server routes and server functions call Convex queries/mutations through `ConvexHttpClient` in `src/lib/server/convex-source.ts`, `src/modules/catalog/owner-claim.functions.ts`, `src/modules/inquiries/inquiry.functions.ts`, `src/modules/protected-action/contact-follow-up.functions.ts`, and route-specific helpers in `src/routes/`.
- Clerk REST - Owner delivery address lookup calls Clerk users API from `src/lib/server/notification-provider.ts`.
- Resend REST - Owner email dispatch posts to Resend from `src/lib/server/notification-provider.ts` and is orchestrated by `src/routes/api.notification.resend-dispatch.ts`.
- Novu REST - Workflow trigger and message readback call Novu from `src/lib/server/notification-provider.ts` and are orchestrated by `src/routes/api.notification.novu-dispatch.ts`.
- Autumn REST - Billing attach, portal, and customer readback call Autumn from `src/modules/billing/internal/provider-readback.ts` and are configured by `src/lib/server/billing-provider.ts`.
- Server-to-server dispatch callbacks - `/api/notification/resend-dispatch` and `/api/notification/novu-dispatch` require `Authorization: Bearer ${AE_NOTIFICATION_OUTBOX_SECRET}` in `src/routes/api.notification.resend-dispatch.ts` and `src/routes/api.notification.novu-dispatch.ts`.

---

*Integration audit: 2026-06-29*
