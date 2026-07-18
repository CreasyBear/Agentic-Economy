# External Integrations

**Analysis Date:** 2026-07-18  
**last_mapped_commit:** `9d8faa04`

## APIs & External Services

**LLM / model gateway:**
- OpenRouter — chat completions and model catalog for answer agent and Customer Request semantic interpret/compile.
  - Client: raw `fetch` to `https://openrouter.ai/api/v1/chat/completions` and `/models` (no OpenRouter SDK).
  - Key files: `src/modules/answer/internal/answer-tool-use-agent.ts`, `src/modules/answer/internal/llm-config.ts`, `src/modules/answer/internal/openrouter-models.ts`, `src/modules/customer-request/openrouter-transport.ts`, `src/modules/answer-thread/internal/llm-follow-up-chips.ts`.
  - Auth: `OPENROUTER_API_KEY`; model overrides `AE_LLM_MODEL` / `AE_LLM_MODELS` / Convex `AE_CUSTOMER_REQUEST_MODEL`; optional `AE_OPENROUTER_API_BASE_URL` (answer `llm-config.ts` only — Customer Request transport hardcodes OpenRouter host).
  - Convex env: `OPENROUTER_API_KEY`, `AE_CUSTOMER_REQUEST_MODEL` in `convex/convex.config.ts`.

**Auth / identity (human + agent):**
- Clerk — session auth for owners/operators; API-key auth for Customer Request agent principals.
  - SDK: `@clerk/tanstack-react-start` (`ClerkProvider` in `src/routes/__root.tsx`, `clerkMiddleware` in `src/start.ts`).
  - Agent API keys: `auth({ acceptsToken: 'api_key' })` in `src/lib/server/customer-request-agent-auth.ts`.
  - Convex JWT: `CLERK_JWT_ISSUER_DOMAIN` in `convex/auth.config.ts`.
  - Auth env: `VITE_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `CLERK_JWT_ISSUER_DOMAIN`.
  - Owner delivery address lookup via Clerk Backend API inside `src/lib/server/notification-provider.ts`.

**Email / notifications:**
- Resend — owner/customer inquiry email send + delivery webhooks.
  - Client: raw `fetch` in `src/lib/server/notification-provider.ts` (no `resend` npm package).
  - Routes: `src/routes/api.notification.resend-dispatch.ts`, `src/routes/api.notification.resend-webhook.ts`.
  - Auth: `RESEND_API_KEY`, `RESEND_FROM`, `RESEND_WEBHOOK_SECRET`; optional `RESEND_API_BASE_URL` (default `https://api.resend.com`).
  - Outbox coordination: `AE_NOTIFICATION_OUTBOX_SECRET` + Convex `notification-outbox` module (`src/modules/notification-outbox/`).
  - Provider smoke: `npm run test:provider-smoke:resend` → `tests/deploy-smoke/resend-notification-smoke.spec.ts` / phase2 resend dispatch smoke.
- Novu — workflow triggers / readback for inquiry notifications.
  - Client: raw `fetch` in `src/lib/server/notification-provider.ts` (no `@novu/*` package).
  - Route: `src/routes/api.notification.novu-dispatch.ts`.
  - Auth: `NOVU_SECRET_KEY`, `NOVU_WORKFLOW_INQUIRY_OWNER`, optional `NOVU_WORKFLOW_INQUIRY_CUSTOMER`, `NOVU_API_BASE_URL` (default `https://api.novu.co`).
  - Provider smoke: `npm run test:provider-smoke:novu`.

**Payments / billing (credential + gate surface; limited runtime modules):**
- Stripe — secret names and source-write key IDs remain in security admission; **no `stripe` npm SDK** and **no `src/modules/billing` / `stripe-checkout` module files** in the current tree. Env keys `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` listed in `.env.example` and `src/modules/security/source-write-admission.ts`. Deploy-smoke evidence still references Phase-6 Stripe checkout IDs (`tests/deploy-smoke/phase6-business-action-stripe-smoke.spec.ts`). Treat as reserved/integration-ready credentials + smoke harness, not a current checkout implementation path.
- Autumn — same pattern: `AUTUMN_*` env names in `.env.example` and source-write admission secret list; no Autumn SDK dependency in root `package.json`. Do not imply live Autumn portal/billing UI unless a module reappears under `src/`.
- x402 (Coinbase HTTP 402 rails) — **implemented** for capability-supply route transport signing (EVM exact scheme).
  - Packages: `@x402/core`, `@x402/evm`, `@x402/extensions`, `viem`.
  - Key files: `src/modules/capability-supply/internal/x402-payment-signer.ts`, `src/modules/capability-supply/route-transport-runtime.ts`, `src/modules/capability-supply/internal/transport-adapters.ts`, readiness probe `x402` in `src/modules/capability-supply/internal/readiness-probe.ts`.
  - Import posture: `@x402/*` / `viem/accounts` allowed only in the signer file via `src/lib/ui/contract-scans.ts` exception; broader handshake/`x402` product claims remain negative in copy scans.
  - Public inquiry policy still refuses payment-flavored natural language (`stripe|wallet|x402|…`) in `src/modules/inquiries/internal/policy.ts` — product copy boundary ≠ transport adapter.

**Maps:**
- Google Maps JavaScript API — generative map artifact when key present.
  - Client: browser Maps loader in `src/components/ae/artifacts/AeGenerativeMap.tsx`.
  - Auth: `VITE_GOOGLE_MAPS_API_KEY`.

**Search:**
- Meilisearch — optional catalog search backend (`convex` | `dual` | `meilisearch`).
  - Client: HTTP in `src/modules/registry/internal/catalog-search-port.ts`.
  - Auth: `MEILISEARCH_HOST`, `MEILISEARCH_ADMIN_KEY`; index `AE_SEARCH_INDEX_UID`; backend select `AE_SEARCH_BACKEND`; timeout `AE_SEARCH_TIMEOUT_MS`.

**Agent / routing identity:**
- Web Bot Auth + HTTP Message Signatures directory.
  - Packages: `web-bot-auth`, `http-message-sig` (tests/signing), `@noble/hashes`.
  - Runtime: `src/modules/routing-kernel/caller-identity.ts`.
  - Public directory: `GET /.well-known/http-message-signatures-directory` (`src/routes/[.]well-known/http-message-signatures-directory.ts`).
  - Env: `AE_WBA_DIRECTORY_PUBLIC_JWK_JSON`, `AE_WBA_SIGNATURE_AGENT_ALLOWLIST`, optional dev smoke keys `AE_DEV_WBA_*`.

**Provider integrations (domain adapters):**
- Shipping quote input derivation — pure Zod/digest helpers in `src/modules/provider-integrations/shipping/` (no external carrier API SDK in-tree; adapter boundary for request facts).

**Sandbox / conformance providers:**
- Hosted sandbox route resolver/quoter — Convex HTTP (`convex/http.ts`) and TanStack routes under `src/routes/api.sandbox.*`; seeded via Convex (`sandboxAcceptanceSupply` in release workflow).
- Examples: `examples/routing-provider` (Vercel Node 22), `examples/routing-edge` / `routing-agent-directory` (Cloudflare Workers), `examples/routing-agent-bridge`, `examples/agent-experience`.

**In-process ports (not external SaaS — Waves 38–42):**
- Customer Request V2 write and route-execution port families deepen Convex-backed domain logic behind ports (`src/modules/customer-request/v2-write/`, `src/modules/customer-request/route-execution/`, adapters under `convex/customerRequest*Ports.ts`). They call Convex tables/functions and capability-supply graph code — they do **not** introduce OpenRouter, payment, or notification clients of their own.

## Data Storage

**Databases:**
- Convex — primary document store.
  - Connection: `VITE_CONVEX_URL` / `CONVEX_URL`; deploy key `CONVEX_DEPLOY_KEY` (CI).
  - Client: Convex React/HTTP from app; `ConvexHttpClient` + `sourceMutation` pattern in `src/lib/server/convex-source.ts`.
  - Schema composition root: `convex/schema.ts` (module fragments from `src/modules/*/internal/*schema*`).
  - Auth providers: Clerk JWT domain in `convex/auth.config.ts`.

**File Storage:**
- Local filesystem / repo artifacts only for eval outputs, simulation HTML under `outputs/`, Playwright reports — no S3/GCS SDK in root dependencies.
- Not detected: object-storage product integration.

**Caching:**
- Not detected as a dedicated Redis/Memcached service.
- Browser/CDN caching is host-default (Vercel); Cloudflare Cache API available only inside Workers examples.

**Search index:**
- Meilisearch (optional) — see Search above; Convex remains default/fallback catalog path.

## Authentication & Identity

**Auth Provider:**
- Clerk (primary).
  - Human UI: sign-in/up routes `src/routes/sign-in.$.tsx`, `src/routes/sign-up.$.tsx`; operator session helpers `src/lib/server/require-operator-session.ts`, `claim-owner-session.ts`.
  - Agent: Clerk API keys with Customer Request scope (`CUSTOMER_REQUEST_AGENT_SCOPE` via `src/modules/customer-request/agent-contract`).
  - Local e2e bypass: `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E` (`src/lib/server/local-e2e-bypass.ts`) — production-hard-fail.
- Source-write admission — AE-owned HMAC/HKDF keys for protected writes (`src/modules/security/source-write-admission.ts`, middleware in `src/start.ts`).
  - Env family: `AE_SOURCE_WRITE_SECRET`, per-scope `AE_SOURCE_WRITE_KEY_*` / derived key IDs, previous-key rotation fields.
- Route-call signing (Convex execution): `AE_ROUTE_CALL_SIGNING_SECRET`, `AE_ROUTE_CALL_SIGNING_KEY_ID` (required in production Convex env per release gate; declared in `convex/convex.config.ts`).
- Web Bot Auth for routing-kernel caller identity (above).

## Monitoring & Observability

**Error Tracking:**
- Sentry — client `@sentry/react` (`src/lib/observability/sentry.client.ts`), server `@sentry/node` (`sentry.server.ts`), Vite plugin when `SENTRY_AUTH_TOKEN` + `SENTRY_ORG` + `SENTRY_PROJECT` set.
  - DSN: `SENTRY_DSN` / `VITE_SENTRY_DSN`; release from `SENTRY_RELEASE` | `VERCEL_GIT_COMMIT_SHA` | `GITHUB_SHA`.

**Product analytics:**
- PostHog — `posthog-js` / `posthog-node`; config in `src/lib/observability/config.ts`, funnel helpers under `src/lib/observability/` and `src/modules/observability/`.
  - Keys: `VITE_POSTHOG_KEY` / `POSTHOG_KEY`, hosts `VITE_POSTHOG_HOST` / `POSTHOG_HOST` (default `https://us.i.posthog.com`), optional app URLs.
  - Kill-switch: `VITE_AE_DISABLE_OBSERVABILITY` / `AE_DISABLE_OBSERVABILITY` (`isObservabilityDisabled` in `src/lib/observability/config.ts`).
  - Event catalog file present: `.posthog-events.json`.
  - Optional: `AE_DISABLE_PUBLIC_FUNNEL_SOURCE_SYNC` for funnel source sync.

**Logs:**
- Server: Sentry isolation scope + path tags in `src/start.ts` observability middleware; PostHog flush on request end.
- Cloudflare Workers examples: Wrangler observability logs/traces enabled in `examples/routing-edge/wrangler.jsonc`.
- Convex: platform logs via Convex dashboard / CLI (no separate APM package).

## CI/CD & Deployment

**Hosting:**
- Vercel — production app (`agentic-economy-phi.vercel.app`); Nitro `preset: 'vercel'`, Node 20.x functions (`vite.config.ts`).
- Convex — production backend deploy in release workflow.
- Cloudflare Workers — staging/production names for `ae-routing-edge` (example/edge path).

**CI Pipeline:**
- GitHub Actions:
  - `.github/workflows/kernel-release-gate.yml` — `npm run test:release:source` on PR/main; on main: Vercel exact-revision deploy, Convex deploy, sandbox supply seed, Customer Request lifecycle smoke.
  - `.github/workflows/react-doctor.yml` — React Doctor gate.
- Secrets used in CI (names only): `CLERK_SECRET_KEY`, `AE_CUSTOMER_REQUEST_CLERK_*`, `VERCEL_*`, `CONVEX_DEPLOY_KEY`, automation bypass secret.

## Environment Configuration

**Required env vars (critical families — full name list in `.env.example`):**
- Clerk: `VITE_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `CLERK_JWT_ISSUER_DOMAIN`
- Convex: `VITE_CONVEX_URL` / `CONVEX_URL` (+ deploy key for prod CI)
- OpenRouter: `OPENROUTER_API_KEY` (answer / interpret paths)
- Notifications: `RESEND_*`, `NOVU_*`, `AE_NOTIFICATION_OUTBOX_SECRET`
- Observability: `SENTRY_*`, `VITE_SENTRY_DSN`, `POSTHOG_*` / `VITE_POSTHOG_*`, observability kill-switches
- Source-write: `AE_SOURCE_WRITE_*` family
- Canonical URLs: `AE_CANONICAL_BASE_URL`, `AE_CANONICAL_HOST_ALLOWLIST`, `AE_SITE_URL` (Convex)
- Search (optional): `AE_SEARCH_BACKEND`, `MEILISEARCH_*`
- Billing reserved: `STRIPE_*`, `AUTUMN_*`
- WBA: `AE_WBA_*`
- Maps (optional): `VITE_GOOGLE_MAPS_API_KEY`
- Routing edge example base: `AE_ROUTING_PUBLIC_BASE_URL`

**Secrets location:**
- Local: `.env.local` / `.env.development.local` (gitignored); template `.env.example`.
- Hosted: Vercel project env, Convex dashboard/`npx convex env`, GitHub Actions `secrets` + `environment: production`.
- Never commit filled secret files; never paste values into planning docs.

## Webhooks & Callbacks

**Incoming:**
- `POST /api/notification/resend-webhook` — Resend delivery events → notification outbox ingest (`src/routes/api.notification.resend-webhook.ts`).
- Stripe / Autumn webhook routes — **not present as `src/routes/api.*` files** at this map; secrets still named for admission. Re-check before claiming webhook handlers.
- Clerk — session/JWT validation on requests (middleware), not a custom webhook route in-tree for core app flows.

**Outgoing:**
- OpenRouter chat/completions and models.
- Resend email send API; Novu trigger/readback APIs.
- Clerk Backend API (owner email resolution).
- Meilisearch search/index HTTP (when backend enabled).
- Capability provider HTTP (sandbox + registered supply endpoints; may include x402 402 challenge/response).
- PostHog / Sentry ingest endpoints.
- Convex HTTP client calls from TanStack server to Convex functions.
- Vercel / Convex deploy APIs from release tools (`tools/release/*`).

**Public machine surfaces (HTTP, not third-party SaaS):**
- Catalog: `GET /api/businesses`, `GET /api/businesses/search`, `GET /api/businesses/$slug`
- Discovery: `GET /llms.txt`, `GET /SKILL.md`, discovery schema/examples under `src/routes/api.discovery.*`
- Customer Request API: `src/routes/api.requests.*` and versioned `api.v1.requests.*` (Clerk API-key agent auth)
- Answer: `src/routes/api.answer.*`
- Action surfaces: declared in `src/modules/*/…actions.ts`, registered in `src/modules/actions/index.ts` with surfaces `ui` | `http` | `agentJson` | `answerThread` (no separate `/api/agent/tools` route in current `src/routes/`; no `agentTools` surface string in action declarations)
- Convex HTTP: sandbox providers + retired `/v1/*` and `/mcp` stubs (`convex/http.ts`)

---

*Integration audit: 2026-07-18 (commit 9d8faa04)*
