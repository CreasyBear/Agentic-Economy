# External Integrations

**Analysis Date:** 2026-07-11

## APIs & External Services

**AI / Model Provider:**
- OpenRouter - Tool-using answer synthesis, follow-up chips, model catalog, live answer evaluation, and optional Hermes-compatible external-agent diagnostics.
  - Integration method: Direct REST `fetch` calls to OpenAI-compatible `/chat/completions` and `/models` endpoints in `src/modules/answer/internal/answer-tool-use-agent.ts`, `src/modules/answer-thread/internal/llm-follow-up-chips.ts`, and `src/modules/answer/internal/openrouter-models.ts`.
  - Auth: `OPENROUTER_API_KEY`; model selection uses `AE_LLM_MODEL` / `AE_LLM_MODELS`; tests can override the base with `AE_OPENROUTER_API_BASE_URL`.
  - Gating: `AE_ANSWER_SYNTHESIZER`, `AE_GATED_LLM_ANSWER`, and `AE_ANSWER_EVAL_PASSED` prevent ungated model use; deterministic synthesis remains an explicit mode in `.env.example`.
  - External-agent audit: `examples/agent-experience/run-audit.ts` accepts `HERMES_BASE_URL`, `HERMES_API_KEY`, and `HERMES_MODEL` for any compatible endpoint.

**Email / Notification Providers:**
- Resend - Sends owner/customer inquiry email and reports delivery events.
  - Integration method: Direct REST calls via `fetch` in `src/lib/server/notification-provider.ts`; dispatch route is `POST /api/notification/resend-dispatch` in `src/routes/api.notification.resend-dispatch.ts`.
  - Auth/config: `RESEND_API_KEY`, `RESEND_FROM`, and optional `RESEND_API_BASE_URL` (default `https://api.resend.com`).
  - Readback: Provider message identifiers are persisted through the Convex notification outbox.
- Novu - Orchestrates owner/customer inquiry notification workflows and provider readback.
  - Integration method: Direct REST calls in `src/lib/server/notification-provider.ts`; dispatch route is `POST /api/notification/novu-dispatch` in `src/routes/api.notification.novu-dispatch.ts`.
  - Auth/config: `NOVU_SECRET_KEY`, optional `NOVU_API_BASE_URL`, and workflow IDs `NOVU_WORKFLOW_INQUIRY_OWNER` / `NOVU_WORKFLOW_INQUIRY_CUSTOMER`.
  - Readback: Transaction/message records are reconciled before Convex outbox state is advanced.
- Clerk Backend API - Resolves an owner Clerk user to a current delivery email before Resend/Novu dispatch.
  - Integration method: Direct REST request to `https://api.clerk.com/v1` in `src/lib/server/notification-provider.ts`.
  - Auth: `CLERK_SECRET_KEY`; errors are normalized without exposing the address or secret.

**Search Service:**
- Meilisearch - Optional generated search projection; Convex remains the source of truth.
  - Integration method: REST `fetch` client implemented in `src/modules/registry/internal/catalog-search-port.ts`; sync/readback state lives in `src/modules/registry/internal/search-sync.ts` and the registry schema.
  - Auth/config: `MEILISEARCH_HOST`, `MEILISEARCH_ADMIN_KEY`, `AE_SEARCH_INDEX_UID`.
  - Rollout: `AE_SEARCH_BACKEND` selects `convex`, `dual`, or `meilisearch`; `AE_SEARCH_TIMEOUT_MS` bounds calls. Dual mode shadows Meilisearch while retaining Convex fallback.

**Agent Identity / Routing:**
- Signature-Agent directories - Agent callers publish public keys at `/.well-known/http-message-signatures-directory`; Web Bot Auth / HTTP Message Signatures bind requests to admitted identities.
  - Integration method: Directory retrieval in `src/modules/routing-kernel/caller-identity.ts`; the main site publishes its own directory from `src/routes/[.]well-known/http-message-signatures-directory.ts`.
  - Auth/config: `AE_WBA_SIGNATURE_AGENT_ALLOWLIST`, `AE_WBA_DIRECTORY_PUBLIC_JWK_JSON`, and routing-specific `AE_ROUTING_SIGNATURE_AGENTS` / signing-key variables. Private key material stays server-side or in diagnostic environment variables.
  - Convex endpoints: `convex/http.ts` exposes `/.well-known/ae-routing.json`, `/v1/route`, `/v1/execute`, `/v1/inspect`, `/v1/cancel`, and `/mcp`; authenticated calls resolve directory keys and durable grants before authorization.
- Cloudflare Worker directory example - `examples/routing-agent-directory/` is a separately deployable public-key directory used by integration/conformance tests.
  - Deployment/config: `examples/routing-agent-directory/wrangler.jsonc`; public verification JWK is provided as a Worker variable.
- Hosted routing conformance provider - `examples/routing-provider/*.mjs` sends signed requests to a hosted Convex routing origin for route, budget, data-authority, cancellation, recovery, and evidence scenarios.
  - Auth/config: `AE_ROUTING_BASE_URL`, `AE_ROUTING_PRIVATE_JWK_PATH`, and `AE_ROUTING_SIGNATURE_AGENT`; the default hosted URL in the probes is a Convex Site origin.

**Maps:**
- Google Maps - Optional client-side embedded map artifacts/office maps.
  - Integration method: Browser Maps URLs allowed by CSP in `src/lib/http/security-headers.ts`; UI configuration uses `VITE_GOOGLE_MAPS_API_KEY` from `.env.example`.
  - Auth: Browser API key; feature degrades when absent rather than becoming a server dependency.

**Payment Processing:**
- None in the current working tree. Stripe/Autumn billing variables, routes, modules, tests, and package dependencies are absent from the active source snapshot; do not infer a live money rail from deleted planning/history paths.

## Data Storage

**Databases:**
- Convex hosted database - Durable source of truth for catalog/businesses, ownership and authz, inquiries, answer threads, notification outbox, observability/audit projections, routing grants/evidence, and operational controls.
  - Connection: `CONVEX_URL` or `VITE_CONVEX_URL`; server calls use `ConvexHttpClient` in `src/lib/server/convex-source.ts`, while backend functions and schema live in `convex/`.
  - Client: `convex` 1.42.0 generated bindings in `convex/_generated/`; authenticated server calls obtain Clerk's `convex` JWT template.
  - Schema/change flow: Composed source schema in `convex/schema.ts`; generated types/code are checked with `npm run check:convex-codegen` rather than a SQL migration system.
  - Scheduled maintenance: Hourly cleanup jobs for security/inquiry abuse buckets and source-write nonces in `convex/crons.ts`.

**Search Projection:**
- Meilisearch - Derived registry index only; task IDs/readback are persisted in Convex so projection work can be observed and reconciled.
  - Connection/auth: `MEILISEARCH_HOST` and `MEILISEARCH_ADMIN_KEY`.
  - Index: `AE_SEARCH_INDEX_UID`, defaulting to `registry-search-documents` per `.env.example`.

**File Storage:**
- No external object-storage integration is present. Generated reports and browser artifacts are local/CI files under paths such as `output/`, `test-results/`, and `playwright-report/`.

**Caching:**
- No Redis or external cache service. In-memory/runtime caches are local implementation details; Convex and Meilisearch are the durable/source and projection services.

## Authentication & Identity

**Human Auth Provider:**
- Clerk - Sign-in/sign-up UI, TanStack Start request middleware, server session lookup, and JWT federation to Convex.
  - Implementation: `@clerk/tanstack-react-start`; middleware in `src/start.ts`, auth UI under `src/routes/sign-in.$.tsx` and `src/routes/sign-up.$.tsx`, server-to-Convex token exchange in `src/lib/server/convex-source.ts`.
  - Credentials: `VITE_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`; Convex validates issuer `CLERK_JWT_ISSUER_DOMAIN` with application ID `convex` in `convex/auth.config.ts`.
  - Session management: Clerk-managed browser session; server code requests the `convex` token template. Local E2E bypasses are explicit and guarded by environment/test helpers, not production defaults.

**Machine Identity:**
- Web Bot Auth / HTTP Message Signatures - Cryptographic request identity for agent-facing inquiry and routing surfaces.
  - Implementation: `web-bot-auth`, Noble cryptography, source admission code, and routing-kernel identity modules under `src/modules/routing-kernel/`.
  - Key discovery: HTTPS Signature-Agent directories; only configured origins/principals are admitted.
  - Replay/authorization controls: Nonces, scoped source-write keys, durable grants, spend/data budgets, and idempotency evidence are enforced by `convex/sourceWriteAdmission.ts` and routing modules under `convex/`.

**Internal Source Writes:**
- Scoped HMAC/source-write envelope - Server-to-Convex mutations that are not user-session calls use family-specific keys and rotation metadata from the `AE_SOURCE_WRITE_*` variables documented in `.env.example`.
  - Production posture: Family keys are explicit; `AE_SOURCE_WRITE_SECRET` may derive isolated family keys only outside production.
  - Notification dispatch: `AE_NOTIFICATION_OUTBOX_SECRET` authenticates the server routes to protected outbox read/write functions.

## Monitoring & Observability

**Error Tracking:**
- Sentry - Browser and server exception capture through `@sentry/react` and `@sentry/node` in `src/lib/observability/sentry.client.ts` and `src/lib/observability/sentry.server.ts`.
  - Runtime config: `VITE_SENTRY_DSN` / `SENTRY_DSN`, `SENTRY_ENVIRONMENT`, and `SENTRY_RELEASE`.
  - Build integration: `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, and `SENTRY_PROJECT` enable sourcemaps and release upload in `vite.config.ts`; absent credentials disable the plugin.

**Analytics:**
- PostHog - Client pageviews/funnel actions and server-side funnel events.
  - SDKs: `posthog-js` and `posthog-node`; implementation in `src/lib/observability/posthog.client.ts`, `src/lib/observability/posthog.server.ts`, and `src/modules/observability/`.
  - Config: Client/server keys and hosts via `VITE_POSTHOG_*` / `POSTHOG_*`; default ingest host is `https://us.i.posthog.com`.
  - Privacy/control: Pseudonymous client sessions, normalized event properties, redaction helpers, `VITE_AE_DISABLE_OBSERVABILITY`, and an emergency `AE_DISABLE_PUBLIC_FUNNEL_SOURCE_SYNC` brake.

**Logs / Durable Audit:**
- Vercel/Convex runtime logs - Structured `console` events surface server and Convex failures; no separate log-aggregation SDK is configured.
- Convex observability tables - Durable application audit/funnel/outbox/operator-control data is modeled in `src/modules/observability/internal/schema.ts` and composed into `convex/schema.ts`.

## CI/CD & Deployment

**Hosting:**
- Vercel - Main TanStack Start web deployment as Node 20 serverless output.
  - Deployment artifact: Nitro `vercel` preset in `vite.config.ts`; raw request bodies and Node/WebCrypto support are retained for signed webhook handling.
  - Environment vars: Expected to be provisioned per deployment; `.env.example` is the source inventory, not a secret store.
- Convex Cloud / Convex Sites - Managed database/functions and routing-kernel HTTP endpoints from `convex/`.
  - Deployment environment: Clerk issuer, routing admission, and source-write variables must also exist in the Convex deployment where read by backend code.
- Cloudflare Workers - Only the standalone routing-agent-directory example in `examples/routing-agent-directory/`, deployed with Wrangler.

**CI Pipeline:**
- GitHub Actions - `eval-gate` runs on pushes and pull requests to `main` in `.github/workflows/eval-gate.yml`.
  - Proof: npm clean install, TypeScript, Convex codegen, unit/integration/type contracts, copy/SEO/UI/import standards, Promptfoo answer eval, report upload, eval flag confirmation, and production build.
  - Secrets: The checked-in gate is deterministic and does not declare provider credentials; live API/provider/deployed-smoke scripts are separate commands.

## Environment Configuration

**Development:**
- Core variables: `VITE_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `CLERK_JWT_ISSUER_DOMAIN`, and `VITE_CONVEX_URL` / `CONVEX_URL` for full authenticated behavior.
- Optional provider groups: OpenRouter, Meilisearch, Resend, Novu, Sentry, PostHog, Google Maps, canonical-host policy, Web Bot Auth, and scoped source-write admission are enumerated in `.env.example`.
- Secrets location: Local ignored environment file or exported shell variables; only names/placeholders belong in `.env.example`.
- Mock/stub strategy: Vitest dependency injection and local contract servers; Playwright local server; Promptfoo deterministic providers; provider/base-URL overrides where explicitly supported. Live-provider commands are intentionally separate.

**Staging / Hosted Smoke:**
- Deployed Playwright runs use `DEPLOY_BASE_URL` / `PLAYWRIGHT_BASE_URL`, optional Vercel bypass secret, Clerk storage state, Convex URL, and provider-specific smoke IDs as configured by `playwright.deploy-smoke.config.ts` and `tests/deploy-smoke/`.
- Hosted routing probes accept a hosted Convex base URL and signing identity variables from `examples/routing-provider/`.
- These commands prove hosted/readback behavior only when the target and credentials are actually supplied; their presence does not establish a currently healthy deployment.

**Production:**
- Secrets management: Vercel environment variables for web/server routes and Convex deployment environment variables for backend functions; Cloudflare Worker variables/secrets for the standalone example.
- Provider absence generally fails closed or returns an explicit provider/orchestrator-missing state in notification and AI boundaries.
- Redundancy: Convex has no in-repo failover provider; search can fall back to Convex when Meilisearch is unavailable, while Resend and Novu are modeled as distinct notification provider families rather than automatic interchangeable failover.

## Webhooks & Callbacks

**Incoming:**
- Resend - `POST /api/notification/resend-webhook` in `src/routes/api.notification.resend-webhook.ts`.
  - Verification: Raw request body plus Svix-compatible signature headers verified with `RESEND_WEBHOOK_SECRET` in `src/lib/server/notification-provider.ts`; timestamp tolerance and signature failures are rejected.
  - Events: Delivery-state events are normalized, deduplicated by provider event ID, redacted, and ingested into Convex notification outbox/audit state.
- Agent routing - Signed `POST /v1/route`, `/v1/execute`, `/v1/inspect`, and `/v1/cancel`, plus GET/POST `/mcp`, in `convex/http.ts`.
  - Verification: HTTP Message Signature identity, allowlisted directory retrieval, durable agent grant resolution, and budget/data authorization.

**Outgoing:**
- Resend dispatch - `POST /api/notification/resend-dispatch` sends a queued Convex outbox item, then records provider ID/readback; protected with `AE_NOTIFICATION_OUTBOX_SECRET` and provider idempotency state.
- Novu dispatch - `POST /api/notification/novu-dispatch` triggers configured workflow(s), reads transaction messages back, then records the reconciled result in Convex.
- Signature-Agent directory retrieval - Convex routing actions fetch an admitted remote principal's public key directory; failures are logged and authentication fails closed.
- Meilisearch synchronization - Registry writes generate/update the derived index and retain task/readback identifiers for reconciliation.
- PostHog/Sentry telemetry - Optional browser/server event and error delivery when configured; local E2E can disable all third-party telemetry.

---

*Integration audit: 2026-07-11*
*Update when adding/removing external services*
