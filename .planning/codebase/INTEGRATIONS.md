# External Integrations

**Analysis Date:** 2026-07-17
**Inspected Revision:** `3aa46069a00724679020f7f3cb338cc4ee177591`

## APIs & External Services

**Data and compute:**
- Convex - canonical database, functions, HTTP actions, and crons.
  - SDK/Client: `convex`; adapter `src/lib/server/convex-source.ts`, backend `convex/`.
  - Auth/config: `VITE_CONVEX_URL`, `CONVEX_URL`, deploy-only `CONVEX_DEPLOY_KEY`.

**Authentication and identity:**
- Clerk - human sessions, owner/operator authorization, and temporary external-agent API credentials.
  - SDK/Client: `@clerk/tanstack-react-start`; `src/start.ts`, `src/lib/server/customer-request-agent-auth.ts`.
  - Auth/config: `CLERK_SECRET_KEY`, `CLERK_JWT_ISSUER_DOMAIN`, Clerk public configuration; release tools use `AE_CUSTOMER_REQUEST_CLERK_INSTANCE_ID`/`AE_CUSTOMER_REQUEST_CLERK_SUBJECT`.
- Web Bot Auth / HTTP Message Signatures - signed caller attribution.
  - SDK/Client: `web-bot-auth`, `http-message-sig`, `@noble/hashes`.
  - Config: JWK/directory values including `AE_WBA_DIRECTORY_PUBLIC_JWK_JSON`, `AGENT_PUBLIC_JWK_BASE64URL`; identity never authorizes a verb by itself.

**AI inference:**
- OpenRouter - optional Customer Request interpretation/evaluation.
  - SDK/Client: direct fetch in `src/modules/customer-request/openrouter-transport.ts`.
  - Auth/config: `OPENROUTER_API_KEY`, `AE_LLM_MODEL`/`AE_LLM_MODELS`, optional `AE_OPENROUTER_API_BASE_URL`, `AE_SITE_URL`.

**Notifications:**
- Resend - inquiry email delivery and signed delivery-event ingestion.
  - Client: `src/lib/server/notification-provider.ts`; routes `src/routes/api.notification.resend-dispatch.ts` and `src/routes/api.notification.resend-webhook.ts`.
  - Auth: server-only API key/from/webhook secret; internal dispatch uses `AE_NOTIFICATION_OUTBOX_SECRET`.
- Novu - notification workflows with transaction/message readback.
  - Client: `src/lib/server/notification-provider.ts`; route `src/routes/api.notification.novu-dispatch.ts`.
  - Auth: server-only secret/workflow identifiers plus `AE_NOTIFICATION_OUTBOX_SECRET`.

**Observability:**
- PostHog - optional pseudonymous funnel/product events via `posthog-js` and `posthog-node` (`src/lib/observability/`).
- Sentry - optional sanitized exceptions/traces/source maps via `@sentry/react`, `@sentry/node`, and Vite plugin; build auth uses `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`, optional `SENTRY_RELEASE`.

**Maps and interoperability:**
- Google Maps - browser map integration configured by `VITE_GOOGLE_MAPS_API_KEY`; restrict this browser-visible key at Google.
- External capability endpoints - guarded outbound calls from `convex/customerRequestV2PreparationEgress.ts`, `convex/customerRequestRouteTransportWorker.ts`, and `convex/capabilitySupplyReadiness.ts`; configure `AE_ROUTE_*`, `AE_SANDBOX_*`, and `AE_ROUTING_*`.
- Shippo/EasyPost - conformance-provider example gateways in `examples/routing-provider/lib/`; not evidence of production fulfilment.
- x402/EVM - narrowly scoped payment-required signing in `src/modules/capability-supply/internal/x402-payment-signer.ts`; not evidence AE publicly charges.

## Data Storage

**Databases:**
- Convex document database is canonical.
  - Connection: `VITE_CONVEX_URL`/`CONVEX_URL`.
  - Client: generated API and `ConvexHttpClient`; schema assembled at `convex/schema.ts`.

**File Storage:**
- No production object-storage integration detected. `output/`, reports, and proof artifacts are development/evidence files.

**Caching:**
- No Redis/external cache detected. Do not assume cross-instance cache semantics.

## Authentication & Identity

**Auth Provider:**
- Clerk handles interactive and API-key-backed principals (`src/start.ts`, `src/lib/server/claim-owner-session.ts`).
- Web Bot Auth verifies signed external caller identity (`src/modules/routing-kernel/caller-identity.ts`).
- AE-native HMAC/HKDF and Ed25519 helpers bind source writes, inquiry access, preparation authority, receipts, and attestations (`src/modules/security/`, `src/modules/common/`).

## Monitoring & Observability

**Error Tracking:**
- Sentry is optional and disabled without configuration; events are sanitized in `src/lib/observability/sentry.server.ts` and client equivalent.

**Logs:**
- Operational/audit records and platform logs are primary; provider failures are redacted before persistence (`src/modules/observability/`, `convex/observability.ts`, `convex/notificationOutbox.ts`).
- Worker examples enable Cloudflare logs/traces in their Wrangler configs; PostHog provides optional product events.

## CI/CD & Deployment

**Hosting:**
- Vercel hosts the Nitro/TanStack Node app; Convex hosts data/functions/HTTP; Cloudflare Workers host routing-edge/signature-directory examples.
- The standalone provider example has `examples/routing-provider/vercel.json`.

**CI Pipeline:**
- `.github/workflows/kernel-release-gate.yml` runs the source contract, exact-revision Vercel + Convex deploy, and authenticated hosted readback on `main`.
- `.github/workflows/react-doctor.yml` is advisory.
- `tools/release/deploy-customer-request-git-source.ts` calls Vercel APIs and release tools call Clerk/deployed AE surfaces.

## Environment Configuration

**Required env-var families:**
- Core: Convex URL(s), Clerk public configuration, `CLERK_SECRET_KEY` for protected server paths.
- Production routing: `AE_ROUTE_CALL_SIGNING_SECRET`, `AE_ROUTE_CALL_SIGNING_KEY_ID`, `AE_SANDBOX_PROVIDER_KEY`, `AE_SITE_URL` (CI-gated).
- Protected records/writes: `AE_SOURCE_WRITE_SECRET`, `AE_INQUIRY_ACCESS_SECRET`, `AE_INQUIRY_RECEIPT_KEK`, `AE_GOVERNED_SEND_INTEGRITY_SECRET`, `AE_NOTIFICATION_OUTBOX_SECRET` as required by the path.
- Optional: OpenRouter, Resend, Novu, PostHog, Sentry, and Google Maps variables when enabled.
- Release: `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, `VERCEL_AUTOMATION_BYPASS_SECRET`, `CONVEX_DEPLOY_KEY`.

**Secrets location:**
- `.env.development.local` and `.env.local` exist but were not read; `.env.example` documents names.
- Production secrets are split between Vercel/GitHub environment secrets and Convex environment variables. Never put secrets in `VITE_*` unless intentionally public.

## Webhooks & Callbacks

**Incoming:**
- Resend delivery events enter `src/routes/api.notification.resend-webhook.ts`, require signature validation, and persist redacted webhook records.
- Convex HTTP routes are registered in `convex/http.ts`.
- The quiet agent door is `GET/POST /api/agent/tools` at `src/routes/api.agent.tools.ts`; only registered and allowlisted actions reach it.

**Outgoing:**
- Notification dispatch calls Resend/Novu; interpretation calls OpenRouter when configured.
- Request execution calls admitted capability endpoints via guarded transports and records inspectable state.
- Release automation calls Vercel and Clerk APIs; PostHog/Sentry receive sanitized telemetry only when configured.

---

*Integration audit: 2026-07-17*
