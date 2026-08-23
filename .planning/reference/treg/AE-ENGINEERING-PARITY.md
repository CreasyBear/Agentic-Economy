# AE–Treg Engineering Parity

**Analysis date:** 2026-08-23
**AE scope:** current working tree, task-supplied base `ac857aef0` plus all current source/WIP.
**Treg scope:** pinned reference commit [`603540f653994080d4f507a9a3564e1017c28eef`](https://github.com/superdesigndev/treg/tree/603540f653994080d4f507a9a3564e1017c28eef).
**Evidence boundary:** current `src/`, `convex/`, `tools/`, `tests/`, package/config files, and the two pinned Treg reference cards only. No live service, historical planning, or network state was inspected.

Statuses are relative to whether the two implementations expose the same engineering
surface: `MATCHED` means materially the same role; `PARTIAL` means overlapping role
with material differences; `MISSING` means one product has no source counterpart for
the mapped surface; `DIFFERENT-BY-DESIGN` means both have a counterpart but their architecture
or hosting boundary differs; `AE-EXTRA` records an AE-only product surface outside
Treg's provider-registry boundary.

## Classification summary

| Domain | Status |
|---|---|
| Module ownership | DIFFERENT-BY-DESIGN |
| Data model and tenancy | DIFFERENT-BY-DESIGN |
| Runtime entrypoints | DIFFERENT-BY-DESIGN |
| Catalog source breadth and curation | PARTIAL |
| Search, ranking, and evidence | PARTIAL |
| Credential ladder | PARTIAL |
| Faithful relay | PARTIAL |
| x402 broker path | MISSING |
| Reserve, settle, refund, and replay | PARTIAL |
| Authentication, tenants, and grants | PARTIAL |
| Secret/OAuth/tool vault | PARTIAL |
| Billing, top-up, and audit | PARTIAL |
| MCP and CLI thinness | MATCHED |
| Deployment boundary | DIFFERENT-BY-DESIGN |
| Jobs, health, and operations | PARTIAL |
| External integrations | DIFFERENT-BY-DESIGN |
| Test organization and coverage | PARTIAL |
| Security controls | PARTIAL |
| AE answer/business/market surfaces | AE-EXTRA |

**Summary counts:** MATCHED 1; PARTIAL 11; MISSING 1; DIFFERENT-BY-DESIGN 5;
AE-EXTRA 1. Total classified domains: 19.

## Module ownership

**DIFFERENT-BY-DESIGN**

- **AE evidence:** `src/modules/` separates capability supply, capability
  execution, action invocation, agent access, money, catalog, business, market,
  answer-thread, and observability; `convex/schema.ts` composes their table sets.
- **Treg evidence:** `src/treg/api.py` composes a mostly single Python package,
  with adjacent ownership in `src/treg/catalog_store.py`, `src/treg/proxy.py`,
  `src/treg/billing.py`, and `src/treg/health.py`.
- **Consequence:** AE changes cross typed module ports and Convex function
  boundaries; Treg changes cross FastAPI/application modules and SQLModel services.
  File placement and dependency direction are not interchangeable.

## Data model and tenancy

**DIFFERENT-BY-DESIGN**

- **AE evidence:** `convex/schema.ts` composes tables for `businesses`,
  `capabilityPublications`, `capabilityOfferings`, `capabilityTransportBindings`,
  `capabilityProviderConnections`, `agentAccessPrincipals`, money, invocations,
  market evidence, and audit events. `src/modules/business/internal/schema.ts`
  and `src/modules/capability-supply/internal/convex-schema.ts` define the owner
  and published-supply relationships.
- **Treg evidence:** `src/treg/models.py` uses SQLModel entities such as `Org`,
  `Membership`, `Tool`, `Secret`, calls/runs/audits, OAuth records, and ledger
  rows; `src/treg/db.py` owns the async SQLAlchemy session boundary.
- **Consequence:** AE tenancy is business/provider/publication/principal based in
  a Convex document model; Treg tenancy is organization/membership/tool based in
  a relational model. Equivalent records cannot be joined by shape alone.

## Runtime entrypoints

**DIFFERENT-BY-DESIGN**

- **AE evidence:** `vite.config.ts` selects TanStack Start plus Nitro's Vercel
  Node 22 preset; `src/routes/` provides file-routed HTTP, UI, OAuth, MCP, health,
  Stripe, registry, and operation routes. `convex/http.ts` is an intentionally
  empty HTTP router while server functions are file-routed under `convex/`.
- **Treg evidence:** `src/treg/__main__.py` starts Uvicorn/FastAPI and
  `src/treg/cli.py` is the `treg` console entrypoint; `src/treg/web/index.html`
  ships as a package-resident dashboard.
- **Consequence:** AE has a Node web gateway plus Convex backend actions/queries;
  Treg has one Python web process and an HTTP CLI. The same URL-shaped surface
  does not imply the same execution runtime.

## Catalog source breadth and curation

**PARTIAL**

- **AE evidence:** `src/modules/capability-supply/internal/publication-importers.ts`
  accepts `ae_envelope`, `openapi_http`, `mcp`, `agent_plugin_mcp`, and `x402`;
  the individual importers are `publication-importer-openapi.ts`,
  `publication-importer-mcp.ts`, `publication-importer-agent-plugin.ts`, and
  `publication-importer-x402.ts`.
- **Treg evidence:** `src/treg/catalog/` contains hand-curated provider YAML,
  generated `<provider>.extended.yaml`, control files, and JSON examples;
  `scripts/catalog_ingest.py`, `scripts/catalog_validate.py`, and
  `scripts/catalog_verify*.py` curate, validate, and verify that catalog.
- **Consequence:** Both describe executable supply, but AE is publication and
  contract admission driven while Treg ships a broad prebuilt provider endpoint
  inventory. AE's source breadth is protocol-oriented; Treg's is provider-route
  oriented, so catalog entries are not directly portable.

## Search, ranking, and evidence

**PARTIAL**

- **AE evidence:** `src/modules/capability-supply/internal/operation-search.ts`
  normalizes bounded queries, applies network/location/effect/data-use/
  availability/price filters, ranks token matches, returns scores/cursors, and
  rejects sensitive query material. `convex/marketEvidence.ts`,
  `convex/marketListingEvidence.ts`, and `convex/marketExternalSnapshots.ts`
  persist source and first-party evidence.
- **Treg evidence:** `src/treg/catalog_store.py` normalizes endpoint records for
  catalog consumers and `src/treg/api.py` exposes catalog/tool reads; its
  evidence is endpoint verification/example metadata rather than AE's scored
  operation ranking and market evidence facts.
- **Consequence:** AE search output includes ranked candidate identity and
  evidence-backed market state; Treg catalog search returns normalized provider
  endpoints and cost/verification fields without the AE ranking/evidence model.

## Credential ladder

**PARTIAL**

- **AE evidence:** `src/modules/agent-access/policy.ts` validates grant lifecycle,
  environment, generation, spend, and rate policy; provider credentials are
  resolved through `capabilityProviderConnections` and leases in
  `src/modules/capability-supply/internal/provider-connection/`; transport
  authority is carried by `route-transport-http-json.ts`.
- **Treg evidence:** `src/treg/providers.py` selects a provider binding;
  `src/treg/crypto.py` decrypts organization `Secret` records; and
  `src/treg/injectors.py` injects environment/CLI/header/query credentials.
  `src/treg/config.py` adds the platform-key allow-list and `src/treg/localrun.py`
  handles short-lived local grants.
- **Consequence:** Both ladder caller authority into provider credentials, but AE
  binds principal/grant/connection generations and leases, while Treg ladders
  org secret, OAuth connection, platform key, and local-run paths. Failure codes
  and credential storage boundaries differ.

## Faithful relay

**PARTIAL**

- **AE evidence:** `src/modules/capability-supply/internal/route-transport-http-json.ts`
  serializes declared OpenAPI-style routes, injects credentials, adds signed AE
  call headers, bounds responses, and classifies provider HTTP/content/JSON
  failures. MCP and x402 are separate adapters in
  `route-transport-mcp.ts` and `route-transport-x402.ts`.
- **Treg evidence:** `src/treg/proxy.py` is a generic upstream relay with shared
  `httpx`, hop-by-hop/control-header filtering, timeout and SSRF controls;
  `src/treg/localproxy.py` is the local HTTPS interception path.
- **Consequence:** Both preserve an upstream request boundary and inject auth,
  but AE faithfully executes admitted operation contracts/transports and emits
  typed observations; Treg can relay catalog provider routes without AE contract
  admission or x402 observation semantics.

## x402 broker path

**MISSING**

- **AE evidence:** `src/modules/capability-execution/invocation-worker/brokeredX402.ts`,
  `x402Settlement.ts`, `src/modules/capability-supply/internal/cdp-x402-payment-signer.ts`,
  and `convex/moneyX402PaymentAttempts.ts` validate challenges, bind payment to
  request fingerprints, sign through CDP custody, record attempts, and verify
  settlement/reconciliation.
- **Treg evidence:** `src/treg/oauth_providers.py` and `src/treg/proxy.py` cover
  provider OAuth/key HTTP calls; `src/treg/billing.py` covers Stripe money, not
  x402 payment headers, wallet custody, facilitator settlement, or chain receipt
  verification. No Treg x402 broker module is identified in its reference cards.
- **Consequence:** AE can broker a declared x402 operation with custody and
  settlement evidence; Treg's provider call path cannot reproduce that payment
  lifecycle.

## Reserve, settle, refund, and replay

**PARTIAL**

- **AE evidence:** `convex/moneyExternalSpendReserve.ts`,
  `moneyExternalSpendFinalize.ts`, and `moneyExternalSpendReverse.ts` reserve,
  settle, release, and reverse external spend; `convex/moneyRefund.ts` handles
  refund accounting. `convex/capabilityOperationInvocations.ts` and
  `src/modules/action-invocation/reconciliation-evidence.ts` model durable
  recovery, while `src/modules/capability-supply/internal/operation-ledger/replay.ts`
  provides replay validation.
- **Treg evidence:** `src/treg/billing.py` and `src/treg/models.py` provide
  idempotent holds/settlement and ledger records; `src/treg/sandbox.py` provides
  synthesized demo calls, while `src/treg/health.py` and `src/treg/api.py` do not
  expose AE-style durable invocation reconciliation.
- **Consequence:** Both prevent untracked billable calls and record outcomes, but
  AE distinguishes unknown external outcomes, evidence-bound reversal, and replay
  generations; Treg's replay-like path is sandbox/history oriented.

## Authentication, tenants, and grants

**PARTIAL**

- **AE evidence:** `convex/auth.config.ts` binds Convex JWT auth to Clerk;
  `src/lib/server/agent-access-auth.ts` verifies Clerk API keys/scopes and
  resolves an AE principal; `src/modules/agent-access/production-policy.ts` and
  `convex/authz.ts` enforce owner/admin/agent boundaries.
- **Treg evidence:** `src/treg/session.py` signs browser sessions;
  `src/treg/auth.py`/`src/treg/api.py` handle GitHub, Google, email OTP, CLI
  handshake, admin tokens, and `Org`/`Membership` checks in `src/treg/models.py`.
- **Consequence:** Both resolve a caller before provider execution and isolate a
  tenant, but AE's primary machine identity is Clerk API-key principal plus
  grant/policy; Treg's is browser/machine session plus organization membership.

## Secret/OAuth/tool vault

**PARTIAL**

- **AE evidence:** `convex/agentAccessOAuth.ts` and `src/modules/agent-access/oauth-state.ts`
  persist OAuth clients/grants with source-read/write admission; provider
  connection rows retain opaque `credentialRef` values and authority digests in
  `src/modules/capability-supply/internal/convex-schema.ts` and
  `server-credential.ts` resolves approved environment references.
- **Treg evidence:** `src/treg/models.py` has encrypted `Secret` rows;
  `src/treg/oauth.py` plus `oauth_providers.py` implement a curated provider
  registry and refresh/probe lifecycle; `src/treg/crypto.py` owns Fernet/token
  protection.
- **Consequence:** AE protects references and admission authority but does not
  mirror Treg's broad Fernet-backed provider secret vault/registry. Treg stores
  provider credentials centrally, while AE's credential material remains behind
  an opaque connection/reference boundary.

## Billing, top-up, and audit

**PARTIAL**

- **AE evidence:** `src/modules/money/internal/convex-schema.ts` defines accounts,
  ledger entries, transactions, usage, reservations, x402 attempts, top-up
  commands, Stripe events, payouts, and allocations. `convex/moneyCreditTopup.ts`
  and `src/routes/api.stripe.webhook.ts` cover top-up/provider recovery;
  `src/modules/observability/internal/schema.ts` stores redacted audit events,
  hashes, correlations, and evidence references.
- **Treg evidence:** `src/treg/billing.py` owns Stripe Checkout/Setup/Portal,
  webhook validation, top-up/auto-top-up/refund/dispute handling; `src/treg/models.py`
  stores ledger and audit records.
- **Consequence:** Both have Stripe-backed top-up and auditable ledger effects,
  but AE couples money to principal/operation/provider earnings and x402 evidence;
  Treg couples money to organization credit and provider-call holds.

## MCP and CLI thinness

**MATCHED**

- **AE evidence:** `src/routes/mcp.ts` and `src/lib/server/mcp-api.ts` expose a
  bounded MCP host over the registered action registry; `tools/ae/cli.ts` and
  `tools/ae/commands/` call public HTTP machine surfaces for search, connect,
  invoke, status, cancel, and reconcile.
- **Treg evidence:** `src/treg/mcp.py` consumes the same catalog/tool call path,
  `src/treg/mcp_oauth.py` owns MCP OAuth, and `src/treg/cli.py` is explicitly an
  HTTP client rather than a second server implementation.
- **Consequence:** Both keep CLI/MCP at transport/adaptor edges and reuse a
  server-side admission/execution path; command names and auth protocols differ,
  but neither requires a duplicate provider runtime in the client.

## Deployment boundary

**DIFFERENT-BY-DESIGN**

- **AE evidence:** `vite.config.ts` targets Vercel Node 22 through Nitro;
  `convex/convex.config.ts` mounts workpool, rate-limiter, and aggregate
  components; `src/lib/deployment/manifest.ts` declares Vercel, Convex, Clerk,
  Stripe, model gateway, source-write, and x402 custody requirements.
- **Treg evidence:** `render.yaml` declares a Render Python web service with
  managed PostgreSQL, `pip install ".[server]`, `python -m treg`, and `/meta`.
- **Consequence:** AE's production boundary spans two managed runtimes and
  component resources; Treg's declared hosted boundary is one Render service
  plus Postgres. Readiness/resource names cannot be copied between deployments.

## Jobs, health, and operations

**PARTIAL**

- **AE evidence:** `convex/crons.ts` schedules facilitator reconciliation,
  discovery/market refresh, readiness/presence, source-write/OAuth cleanup, and
  daily supplier settlement. `src/routes/api.health.ts` and `api.ready.ts` expose
  liveness/readiness; `tools/release/verify-deployment-manifest.ts` and release
  smoke tools validate operational configuration.
- **Treg evidence:** `src/treg/health.py` provides `/health/run` and
  `treg health --run`; `render.yaml` declares only `/meta`, while
  `.github/workflows/catalog-drift.yml` schedules TikHub drift checking and the
  Treg card records recurring health as an external scheduler responsibility.
- **Consequence:** AE has application-owned recurring reconciliation and refresh;
  Treg has health/probe code but recurring execution is outside the declared web
  service. Both have operational checks, with different ownership of the clock.

## External integrations

**DIFFERENT-BY-DESIGN**

- **AE evidence:** `package.json`, `convex/convex.config.ts`, and
  `src/lib/deployment/manifest.ts` identify Convex, Clerk, OpenRouter, Stripe,
  Coinbase CDP/x402 custody, PostHog, Sentry, and MCP integrations; `vite.config.ts`
  enables Sentry build telemetry when its configuration exists.
- **Treg evidence:** `src/treg/oauth_providers.py` covers its curated OAuth/key
  provider APIs; `src/treg/email.py` uses Resend; `src/treg/analytics.py` uses
  PostHog; `src/treg/api.py` exposes Intercom identity support; `render.yaml`
  supplies Render/Postgres deployment and Stripe/Resend/provider settings.
- **Consequence:** The systems share Stripe/PostHog/MCP-like concerns but have
  different identity, model gateway, custody, hosting, email, and provider API
  edges. Integration parity cannot be inferred from a shared package name.

## Test organization and coverage

**PARTIAL**

- **AE evidence:** The current tree contains 476 `*.test.ts`/`*.spec.ts` files
  across `tests/unit/`, `tests/integration/`, `tests/e2e/`, `tests/eval/`,
  `tests/imports/`, `tests/types/`, `tests/ui-contract/`, and `convex/`.
  `package.json` defines Vitest, Playwright, type, import-boundary, conformance,
  eval, lint, and build gates.
- **Treg evidence:** The Treg card identifies flat `tests/test_*.py` coverage
  for auth, billing, catalog, OAuth, proxy, local execution, MCP, health,
  sandbox, and security, run by pytest/pytest-asyncio in `pyproject.toml` and
  `.github/workflows/ci.yml`.
- **Consequence:** Both have source-level automated coverage for the main
  registry/integration surfaces, but AE separates unit/integration/browser/eval
  and boundary suites while Treg uses one pytest tree; test fixtures and commands
  are not interchangeable.

## Security controls

**PARTIAL**

- **AE evidence:** `src/lib/server/bounded-request-body.ts`,
  `src/lib/server/rate-limit.ts`, `src/lib/server/no-store-response.ts`,
  `src/lib/server/request-correlation.ts`, `src/modules/security/`, and
  `src/lib/server/source-write-admission.ts` provide bounded inputs, rate limits,
  redacted/no-store responses, signed source-write admission, and auditability.
  `convex/authz.ts` and `src/lib/deployment/manifest.ts` enforce auth/config gates.
- **Treg evidence:** `src/treg/crypto.py` encrypts secrets; `src/treg/proxy.py`
  and `health.py` guard SSRF; `src/treg/runner.py` applies allow-lists, limits,
  and environment scrubbing; `src/treg/fsjail.py` adds macOS sandboxing; and
  `.gitleaks.toml` exists for secret scanning.
- **Consequence:** Both fail closed around credentials, outbound access, and
  administrative actions, but AE's controls center on signed source writes,
  Convex grants, and typed evidence while Treg's center on Fernet secrets,
  provider relay SSRF, and host subprocess controls.

## AE answer/business/market surfaces

**AE-EXTRA**

- **AE evidence:** `src/modules/answer/`, `src/modules/answer-thread/`,
  `src/modules/business/`, `src/modules/discovery/`, and `src/modules/market/`
  provide answer threads, business supply, discovery, market snapshots, market
  evidence, and owner/provider funnels; corresponding routes include
  `src/routes/api.answer.turn.ts`, `src/routes/api.businesses.tsx`-family routes,
  and `src/routes/market.tsx`.
- **Treg evidence:** Treg's pinned cards center on provider catalog, proxy/tool
  calls, OAuth, organization billing, health, CLI, and MCP in `src/treg/`; they do
  not identify AE-style answer-thread, business-directory, or market-evidence
  modules.
- **Consequence:** These AE surfaces add a first-party demand/supply and evidence
  product layer beyond Treg's registry boundary. They are recorded as AE-only
  source scope, not as a claim that Treg's provider registry is incomplete.

## Production source completeness versus hosted activation

- **Production source completeness (AE):** Current `src/`, `convex/`, `tools/`,
  `tests/`, and package/config files contain implementation and tests for the
  classified AE surfaces, including x402, durable invocation recovery, provider
  connections, money, MCP, and operations. `src/lib/deployment/manifest.ts`
  makes the required production resource/config names explicit.
- **Production source completeness (Treg):** The pinned Treg cards identify
  implementation paths for FastAPI, SQLModel persistence, catalog loading,
  provider relay, OAuth/secrets, Stripe, MCP, CLI execution, health, and tests.
  This is source evidence, not a live provider or account check.
- **Hosted activation (AE):** `tools/release/verify-deployment-manifest.ts`,
  `src/routes/api.ready.ts`, `src/routes/api.v1.release.ts`, and
  `tools/release/operation-gateway-production-smoke.ts` provide readiness,
  release identity, and live-gateway verification surfaces. Their existence does
  not prove that Vercel, Convex, Clerk, Stripe, OpenRouter, or CDP credentials are
  currently configured.
- **Hosted activation (Treg):** `render.yaml` declares Render/Postgres wiring,
  but its dashboard-managed secrets and external health scheduler are outside
  the repository. The Treg card explicitly distinguishes this declaration from
  live activation.
- **Observable boundary:** Both repositories can be source-complete while their
  hosted activation remains unverified; parity statuses above describe code and
  declared configuration only, not production traffic or account readiness.

---

*Parity analysis: 2026-08-23*
