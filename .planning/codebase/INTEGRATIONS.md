# External Integrations

**Analysis Date:** 2026-07-13

## APIs & External Services

**AI / Model Provider:**
- OpenRouter - Optional structured-answer synthesis, tool use, follow-up chips, model discovery, and live evaluation.
  - Integration: Direct REST `fetch` calls to OpenAI-compatible endpoints in `src/modules/answer/internal/answer-tool-use-agent.ts`, `src/modules/answer/internal/openrouter-models.ts`, `src/modules/answer-thread/internal/llm-follow-up-chips.ts`, and `src/modules/customer-request/openrouter-transport.ts`.
  - Auth/config: `OPENROUTER_API_KEY`, `AE_LLM_MODEL`, and `AE_LLM_MODELS`; synthesizer/evaluation gates are `AE_ANSWER_SYNTHESIZER` and `AE_ANSWER_EVAL_PASSED` in `.env.example`.
  - Boundary: Deterministic synthesis is the default; configured credentials alone do not prove the LLM path passed its evaluation gate.

**Email / Notification Providers:**
- Resend - Inquiry notification dispatch and delivery-event readback.
  - Integration: Direct REST in `src/lib/server/notification-provider.ts`; protected dispatch route `src/routes/api.notification.resend-dispatch.ts`.
  - Auth/config: `RESEND_API_KEY`, `RESEND_FROM`, optional `RESEND_API_BASE_URL`, and `AE_NOTIFICATION_OUTBOX_SECRET`.
  - Webhook: `src/routes/api.notification.resend-webhook.ts` verifies raw-body Svix-compatible signatures using `RESEND_WEBHOOK_SECRET`, checks timestamp tolerance, and deduplicates provider event IDs.
- Novu - Owner/customer inquiry notification workflows and provider readback.
  - Integration: Direct REST in `src/lib/server/notification-provider.ts`; protected route `src/routes/api.notification.novu-dispatch.ts`.
  - Auth/config: `NOVU_SECRET_KEY`, optional `NOVU_API_BASE_URL`, `NOVU_WORKFLOW_INQUIRY_OWNER`, and `NOVU_WORKFLOW_INQUIRY_CUSTOMER`.
  - Readback: Transaction messages are reconciled before the Convex notification outbox advances.
- Clerk Backend API - Resolves the authenticated owner's delivery address for provider dispatch and supports temporary production acceptance credentials.
  - Integration: REST calls to `https://api.clerk.com/v1` in `src/lib/server/notification-provider.ts` and `tools/release/customer-request-production-credential.ts`.
  - Auth: `CLERK_SECRET_KEY`; production credential tooling requires explicit instance and subject identifiers and revokes temporary keys.

**Search Service:**
- Meilisearch - Optional derived registry search projection; Convex remains source of truth.
  - Integration: REST client and rollout/fallback logic in `src/modules/registry/internal/catalog-search-port.ts`; sync/readback state is modeled with registry data.
  - Auth/config: `MEILISEARCH_HOST`, `MEILISEARCH_ADMIN_KEY`, `AE_SEARCH_INDEX_UID`, `AE_SEARCH_BACKEND`, and `AE_SEARCH_TIMEOUT_MS`.
  - Rollout: Backend modes are `convex`, `dual`, and `meilisearch`; timeout/unavailability paths preserve an explicit Convex fallback where configured.

**Agent Identity / Routing:**
- Signature-Agent directories - Remote machine principals publish public keys at `/.well-known/http-message-signatures-directory` for Web Bot Auth/HTTP Message Signature verification.
  - Integration: Retrieval and verification in `src/modules/routing-kernel/caller-identity.ts`; AE's directory route is `src/routes/[.]well-known/http-message-signatures-directory.ts`.
  - Config: `AE_WBA_SIGNATURE_AGENT_ALLOWLIST`, `AE_WBA_DIRECTORY_PUBLIC_JWK_JSON`, and admitted inquiry principals in `AE_AGENT_PUBLIC_INQUIRY_ADMISSION_PRINCIPALS`.
- Convex routing origin - Durable routing endpoints and evidence live behind `convex/http.ts`; hosted probes in `examples/routing-provider/` exercise route, execute, inspect, cancel, budgets, data authority, recovery, and evidence.
  - Config: Hosted probes use `AE_ROUTING_BASE_URL`, signing identity/key variables, and an explicitly selected Convex Site origin.
  - Boundary: Readback/evidence from these endpoints demonstrates the observed hosted state; it does not expand AE beyond read, compare, summarize, route, and qualified-inquiry authority.
- Cloudflare routing edge - `examples/routing-edge/src/index.ts` forwards routing traffic to configured Convex staging/production origins.
  - Config: `examples/routing-edge/wrangler.jsonc` supplies `AE_ROUTING_ORIGIN`, environment/revision metadata, and requires `AE_EDGE_ORIGIN_HMAC_KEY` as a Worker secret.
  - Observability: Worker logs and traces are enabled with explicit sampling configuration.
- Agent directory Worker - `examples/routing-agent-directory/src/index.ts` hosts a standalone public-key directory used by routing integration/conformance flows.
  - Config: `examples/routing-agent-directory/wrangler.jsonc` supplies the public JWK as a non-secret Worker variable.
- Routing conformance provider - `examples/routing-provider/` is a standalone Vercel-hostable provider with capability and signature-directory endpoints configured by `examples/routing-provider/vercel.json`.

**Maps:**
- Google Maps - Optional client-side map/office embeds.
  - Config: `VITE_GOOGLE_MAPS_API_KEY`; allowed browser origins are constrained by `src/lib/http/security-headers.ts`.
  - Boundary: Absence degrades the optional map feature rather than blocking core catalog/inquiry behavior.

**Payment Processing:**
- No active payment provider integration exists in the live application source. `AGENTS.md` states that AE does not charge, and `src/lib/ui/contract-scans.ts` rejects active billing module/route surfaces.
- `AUTUMN_*` and `STRIPE_*` variable names remain in `.env.example`, and `src/modules/security/source-write-admission.ts` recognizes them only for provider-secret exposure guardrails. They are not evidence of checkout, subscription, or payment execution.

## Data Storage

**Databases:**
- Convex hosted database - Durable source for public catalog/business data, ownership/authz, qualified inquiries, answer threads, notification outbox, routing grants/evidence, audit/funnel projections, and operator controls.
  - Connection: `CONVEX_URL` or `VITE_CONVEX_URL`; server access uses `ConvexHttpClient` in `src/lib/server/convex-source.ts`.
  - Client/backend: `convex` 1.42.0, composed schema in `convex/schema.ts`, generated bindings in `convex/_generated/`, and domain functions under `convex/`.
  - Schema flow: `npm run check:convex-codegen` validates code generation; there is no SQL migration system.
  - Maintenance: Scheduled cleanup/reconciliation work is declared in `convex/crons.ts`.

**Search Projection:**
- Meilisearch - Derived registry index only, with provider task/readback state retained so synchronization can be observed and reconciled.
  - Connection/auth: `MEILISEARCH_HOST` and `MEILISEARCH_ADMIN_KEY`.
  - Index selection: `AE_SEARCH_INDEX_UID`; rollout behavior is chosen with `AE_SEARCH_BACKEND`.

**File Storage:**
- No S3-equivalent or external object-storage SDK is present. Build, evaluation, test, and browser artifacts are filesystem/CI outputs such as `output/`, `test-results/`, and `playwright-report/`.

**Caching:**
- No Redis or external cache integration is configured. Any in-process caching is runtime-local; Convex is durable source and Meilisearch is a derived projection.

## Authentication & Identity

**Human Auth Provider:**
- Clerk - Sign-in/up UI, TanStack Start request middleware, server sessions, owner/operator authorization context, and JWT federation to Convex.
  - Implementation: `@clerk/tanstack-react-start`; application setup in `src/start.ts`, auth routes in `src/routes/sign-in.$.tsx` and `src/routes/sign-up.$.tsx`, and server token exchange in `src/lib/server/convex-source.ts`.
  - Credentials: `VITE_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, and `CLERK_JWT_ISSUER_DOMAIN`; Convex auth configuration is in `convex/auth.config.ts`.
  - Local testing: Clerk bypass is explicit, local-only, and production-failing in `src/lib/server/local-e2e-bypass.ts` and `src/routes/__root.tsx`.

**Machine Identity:**
- Web Bot Auth / HTTP Message Signatures - Cryptographic caller identity for machine-facing inquiry and routing surfaces.
  - Implementation: `web-bot-auth`, `http-message-sig`, Noble cryptography, and routing identity code under `src/modules/routing-kernel/`.
  - Discovery/admission: HTTPS Signature-Agent directories plus configured origin/principal allowlists.
  - Controls: Replay nonces, scoped grants, idempotency, data/spend budgets, and source-write admission are enforced in routing/security modules and Convex functions.

**Internal Source Writes:**
- Scoped HMAC trust envelope - Server-to-Convex writes without a human session use family-specific keys, derived key IDs, previous-key rotation sets, and replay protection from the `AE_SOURCE_WRITE_*` inventory in `.env.example`.
  - Production posture: Explicit family keys are required; the common `AE_SOURCE_WRITE_SECRET` derivation path is non-production only.
  - Notification routes: `AE_NOTIFICATION_OUTBOX_SECRET` protects server dispatch access to outbox operations.

## Monitoring & Observability

**Error Tracking:**
- Sentry - Browser/server exception capture in `src/lib/observability/sentry.client.ts` and `src/lib/observability/sentry.server.ts`.
  - Runtime config: `VITE_SENTRY_DSN`, `SENTRY_DSN`, `SENTRY_ENVIRONMENT`, and `SENTRY_RELEASE`.
  - Build config: `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, and `SENTRY_PROJECT` jointly enable source maps/release upload in `vite.config.ts`; otherwise the plugin and source maps are disabled.

**Analytics:**
- PostHog - Browser and server funnel events via `posthog-js` and `posthog-node` in `src/lib/observability/` and `src/modules/observability/`.
  - Config: `VITE_POSTHOG_*` and `POSTHOG_*`; browser/server configuration is normalized in `src/lib/observability/config.ts`.
  - Controls: `VITE_AE_DISABLE_OBSERVABILITY` disables third-party telemetry for local E2E, and `AE_DISABLE_PUBLIC_FUNNEL_SOURCE_SYNC` brakes public funnel writes.

**Logs / Durable Audit:**
- Vercel, Convex, and Cloudflare runtime logs carry structured server/edge events; no separate log-aggregation client is declared.
- Convex persists application audit/funnel/outbox/control records through schemas under `src/modules/observability/` and the composed `convex/schema.ts`.

## CI/CD & Deployment

**Hosting:**
- Vercel - Main TanStack Start application as Node 20 serverless output from the Nitro `vercel` preset in `vite.config.ts`.
- Convex Cloud / Convex Sites - Managed database/functions plus routing HTTP origin under `convex/`.
- Cloudflare Workers - Separate routing-edge and agent-directory examples configured in `examples/routing-edge/wrangler.jsonc` and `examples/routing-agent-directory/wrangler.jsonc`.
- Vercel example provider - Separate routing conformance provider configured by `examples/routing-provider/vercel.json`.

**CI Pipeline:**
- GitHub Actions - `.github/workflows/kernel-release-gate.yml` runs for pushes/pull requests to `main` and manual dispatch.
  - Source proof: Node 22, `npm ci`, then `npm run test:release:source` (lint, typecheck, Worker dry-run, kernel retirement, focused test suites, and build).
  - Hosted proof: Non-PR runs only, after source proof, against the GitHub `production` environment; `CONVEX_DEPLOY_KEY`, `AE_KERNEL_PROOF_MANIFEST_JSON`, and the current Git SHA feed `npm run test:release:hosted`.
  - Interpretation: Local/source proof and hosted/revision proof are distinct gates; workflow configuration alone is not proof that a particular hosted run passed.

## Environment Configuration

**Development:**
- Core connectivity: `VITE_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `CLERK_JWT_ISSUER_DOMAIN`, and `VITE_CONVEX_URL` / `CONVEX_URL` for authenticated full-stack behavior.
- Optional provider groups: OpenRouter, Meilisearch, Resend, Novu, Sentry, PostHog, Google Maps, routing/Web Bot Auth, canonical host policy, and scoped source-write admission are enumerated by name in `.env.example`.
- Secrets: Ignored local environment or shell variables. Only placeholder names belong in `.env.example`.
- Test doubles: Vitest dependency injection, local contract servers, Playwright's local server, deterministic Promptfoo providers, and explicit provider base-URL overrides where supported.

**Staging / Hosted Smoke:**
- Deploy smoke uses `DEPLOY_BASE_URL` / `PLAYWRIGHT_BASE_URL`, optional Vercel bypass, Clerk state/credentials, Convex connectivity, and provider-specific smoke identifiers through `playwright.deploy-smoke.config.ts` and `tests/deploy-smoke/`.
- Routing probes use an explicit hosted Convex base URL and signing identity variables from `examples/routing-provider/`.
- These paths prove hosted behavior only when run successfully against the named revision/environment.

**Production:**
- Vercel holds web/server variables; Convex deployment environment holds backend-read variables; Cloudflare secrets/vars belong to the individual Worker deployments.
- Provider boundaries fail closed or return explicit unavailable/readback states when required configuration is absent.
- Search may retain Convex as fallback; Resend and Novu are separate provider families, not an undocumented automatic failover promise.

## Webhooks & Callbacks

**Incoming:**
- Resend - `POST /api/notification/resend-webhook` implemented by `src/routes/api.notification.resend-webhook.ts`.
  - Verification: Raw body plus Svix-compatible headers, HMAC verification, timestamp tolerance, provider event ID deduplication, and redacted persistence in `src/lib/server/notification-provider.ts` and the Convex outbox.
- Routing - Signed route/execute/inspect/cancel and agent-tool-shaped HTTP endpoints exposed from `convex/http.ts`.
  - Verification: HTTP Message Signature identity, allowlisted key-directory resolution, durable grants, replay/idempotency controls, and budget/data authorization.

**Outgoing:**
- Resend dispatch - `src/routes/api.notification.resend-dispatch.ts` sends an admitted outbox item and records provider identifier/readback.
- Novu dispatch - `src/routes/api.notification.novu-dispatch.ts` triggers the configured workflow, reads provider transaction state, and records reconciliation.
- Signature-Agent lookup - Routing identity code fetches admitted HTTPS public-key directories and fails authentication closed on retrieval/verification failure.
- Meilisearch synchronization - Registry projection operations write/read provider task state while Convex remains authoritative.
- OpenRouter, PostHog, and Sentry - Optional model/telemetry egress occurs only when configured and permitted by the relevant gates.
- Cloudflare routing edge - Forwards admitted edge requests to the configured Convex routing origin with origin HMAC material; it is a routing boundary, not booking/payment/dispatch authority.

---

*Integration audit: 2026-07-13*
*Update when adding/removing external services*
