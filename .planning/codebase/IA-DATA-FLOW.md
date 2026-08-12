# Info Architecture — Schemas & Data-Flow Routes

**Analysis date: 2026-08-12**

## Scope, evidence ceiling, and maintenance contract

This map owns the current information architecture: durable schemas, source/projection boundaries,
personas, HTTP/UI/CLI/MCP adapters, Operation discovery/invocation/recovery, owner supply and
readiness, Answer/thread/share artifacts, Customer Requests, agent access/OAuth, money, inquiries,
notifications, operator/security, and public discovery. Prompt internals, model/tool-loop mechanics,
and evaluation harness detail belong to [PROMPT-DATA-FLOW.md](PROMPT-DATA-FLOW.md).

- **Authority:** Convex durable rows and deterministic module/kernel seams own identity, validation,
  authorization, dispatch, persistence, budgets, money, settlement, and evidence (`convex/schema.ts`,
  `src/modules/**/public.ts`, and the corresponding `internal/*` seams). Models, providers, browser
  state, and HTTP responses are observations or proposals until a source seam validates and persists
  them.
- **Adapter rule:** TanStack Start routes, UI loaders, CLI, and MCP expose or submit contracts; they
  are not alternate authority (`src/routes/**`, `tools/ae/**`, `src/routes/mcp.ts`,
  `src/modules/actions/index.ts`). Retired redirects are labelled as such rather than treated as
  current flows.
- **Evidence classes:** A source-integrated contract is not locally verified, eval-fixture-only,
  config-gated, or hosted/live-certified proof. This document reports source facts only; no hosted
  certification, external provider completion, payment settlement, or runtime SLO is implied.
- **Maintenance:** Re-walk `convex/schema.ts`, public module seams, route files, and adapter registries
  when changing this map. Keep caps and resource ownership next to the symbol that enforces them.
  Do not restore retired DTOs, route authorities, or historical counts. Companion maps must retain their
  assigned boundary. The resource table applies Brendan Gregg's USE lens (utilization, saturation,
  errors) after inventory; `?` means the repository has no observation seam, never zero or healthy.

## 1. Authority spine and functional blocks

The source of truth is a Convex schema made from **26 table bundles/spreads**: business, catalog,
capability-contract-registry, capability-supply, customer-request, three agent-access bundles,
action-invocation, capability-operation-invocation, answer-thread, demand, discovery, harness,
inquiries, notification-outbox, observability, registry, routing-kernel, security, money, settings,
project-spine, work-tree, study, and external-run (`convex/schema.ts`). The bundle count is not a
claim about the number of individual tables; several bundles intentionally contain many durable
command, attempt, projection, and evidence rows.

```text
 Public/buyer                 Owner/admin/developer             Agent/CLI/MCP
 ────────────                 ─────────────────────             ───────────────
 /, /t/new, /$slug            /owner/*, /admin/*                OAuth + bearer
 /t/$threadId, /s/$token      /developers/discovery             /api/v1/operations/*
 /$slug/inquiry               /agent-access/*                  /api/v1/requests/*
        │                              │                              │
        │ read/submit adapters         │ identity + source writes      │ strict contracts
        └──────────────┬───────────────┴──────────────┬───────────────┘
                       ▼                              ▼
        deterministic projections and admission seams (non-authoritative UI/API DTOs)
                       │                              │
                       ├──────────────┐               │
                       ▼              ▼               ▼
             Convex durable source  Convex actions   source write gates
       identity/revision/evidence  reservation/worker  auth/idempotency/digest
                       │              │               │
                       │              ▼               │
                       │      Workpool/scheduler      │
                       │              │               │
                       └──────────────┴───────┬───────┘
                                              ▼
          external effects: guarded provider HTTP/MCP/x402, Stripe, Novu/Resend
                                              │
                 response/payment/webhook is an observation, not authority
                                              ▼
       canonical terminal/reconciliation evidence → bounded owner/public readbacks
```

```text
Supply draft → admission/import → publication + offering + binding
      │                                  │
      │ source/provenance/contract digest │ readiness cron (1 min)
      ▼                                  ▼
BusinessSupplyProjection → registry Operation/Service projections → public discovery
      │                                  │
      └──────────── catalog-origin exact join ────────┘

Answer reservation → transient stream → checkpoint/finalization → answerThreads projection
Customer Request aggregate → mandate/route plan → Workpool transport → outcome/recovery projection
Agent OAuth consent → principal/grant → operation gateway → invocation envelope → status/reconcile
```

The functional blocks are deliberately separate: capability supply establishes what can be offered;
registry/catalog projections establish what can be discovered; agent access establishes who may call;
operation invocation and the action-invocation kernel establish what may execute; money establishes
exact charge/settlement; Customer Request route mandates establish business-side authorization; Answer
persistence establishes what can be shown. The boundaries are implemented by the source modules named
below, not by the diagrams.

## 2. Personas and current route inventory

### Buyer/customer

- `/` validates bounded `q`/`project`; a query redirects to `/t/new`, while an explicit project loads
  the source-backed work-tree readback (`src/routes/index.tsx`, `Route`, `loadRootRoute`).
- `/t/new` starts an Answer thread; `/t/$threadId` reads a pseudonymous-session-owned projection and
  can switch, with a private access-key fragment, to `AeCustomerRecord`
  (`src/routes/t.new.tsx`, `src/routes/t.$threadId.tsx`, `src/components/ae/inquiries/AeCustomerRecord.tsx`).
- `/s/$shareToken` is an unowned, read-only, parsed public Answer projection; `/i/$threadId` is a
  legacy 301 redirect to `/t/$threadId` (`src/routes/s.$shareToken.tsx`, `src/routes/i.$threadId.tsx`).
- `/$slug` reads a source-backed public business page; `/$slug/inquiry` performs exact target
  admission, governed-send review/digest, and one durable inquiry submit (`src/routes/$slug.tsx`,
  `src/routes/$slug.inquiry.tsx`, `src/modules/inquiries/route-readbacks.ts`).
- `/api/answer/turn`, `/api/answer/threads`, `/api/answer/threads/$threadId`, and the thread
  share/stop siblings are bounded HTTP adapters. They reserve and finalize durable Answer state,
  never treating an open stream as terminal truth (`src/routes/api.answer.turn.ts`,
  `src/modules/answer-thread/answer-thread.functions.ts`).

### Public catalog and agent discovery

- `/api/businesses`, `/api/businesses/search`, `/api/businesses/$slug`, `/api/v1/services`,
  `/api/v1/services/search`, and `/api/v1/services/$serviceId` read the same public catalog/source
  projection; Service endpoints are an adapter projection, not a second catalog authority
  (`src/routes/api.businesses.ts`, `src/routes/api.businesses.search.ts`,
  `src/modules/registry/internal/services-api-projection.ts`, `src/modules/registry/internal/service-projection.ts`).
- `/api/v1/market-operations/search`, `detail`, `compare`, and `inspect-plan` expose anonymous,
  exact Operation discovery/inspection. They return current descriptors, contract/input, price and
  evidence context, effects, authentication, availability, provenance, and recovery navigation;
  they grant no invocation authority (`src/routes/api.v1.market-operations.search.ts`,
  `src/modules/capability-supply/operation-projection.ts`, `convex/capabilitySupplyOperations.ts`).
- `/operations/$operationRef` displays one exact Operation; `/operations/invocations/$invocationRef`
  is owner-scoped status/cancel/reconcile UI (`src/routes/operations.$operationRef.tsx`,
  `src/routes/operations.invocations.$invocationRef.tsx`).
- `/for-agents`, `/for-providers`, `/[.]well-known/ucp`, `/$slug.ucp`, `/llms.txt`, `/SKILL.md`,
  `/api/discovery/schema`, and `/api/discovery/examples` publish current route/catalog contracts,
  manifests, freshness, or degraded state. They do not prove execution or reveal credentials
  (`src/routes/for-agents.tsx`, `src/modules/discovery/public.ts`, `src/routes/api.discovery.schema.ts`).
- `/mcp` is a Streamable MCP adapter over the one action registry. Anonymous actions are read-only;
  authenticated actions require principal scope/authority. `/api/health` and `/api/ready` are health
  and readiness adapters, not operation readiness (`src/routes/mcp.ts`, `src/lib/server/mcp-api.ts`,
  `src/modules/actions/index.ts`).

### Owner/supplier, admin, and developer

- `/claim`, `/claim/form`, and `/claim/success` are the public claim path; `/owner/supply`,
  `/owner/supply/$offeringRef`, `/owner/offerings`, `/owner/offerings/new`,
  `/owner/offerings/$offeringRef`, `/owner/status`, `/owner/inquiries`,
  `/owner/inquiries/$threadId`, `/owner/request-problems/$reportRef`, and `/owner/settings` are
  source-backed owner surfaces (`src/routes/claim.tsx`, `src/routes/_operator/owner.supply.$offeringRef.tsx`,
  `src/routes/_operator/owner.inquiries.$threadId.tsx`).
- `/_operator` supplies one Clerk sign-in shell for `/owner/*`, `/admin/*`, `/developers/*`, and
  `/agent-access/*`; per-surface durable membership/ownership decides access, so the shell is not a
  role authority (`src/routes/_operator.tsx`, `src/lib/operator/route-options.ts`).
- `/admin/claims`, `/admin/audit-events`, `/admin/index-health`, `/admin/request-problems`,
  `/admin/runs`, `/admin/runs/$turnId`, and `/admin/search-gaps` expose bounded, redacted admin
  readbacks; `/developers/discovery` is sign-in/read-only discovery and is not an admin projection
  (`src/routes/_operator/admin.claims.tsx`, `convex/security.ts`,
  `src/routes/_operator/developers.discovery.tsx`).
- `/agent-access` and `/agent-access/authorize` issue/revoke owner-controlled access and pending
  approval decisions. OAuth HTTP routes are `/oauth/register`, `/oauth/device_authorization`,
  `/oauth/authorize`, `/oauth/token`, plus the OAuth well-known metadata routes
  (`src/routes/_operator/agent-access.tsx`, `src/lib/server/agent-access-oauth-api.ts`,
  `src/routes/oauth.token.ts`).
- `/engine` redirects to `/`; it is retained only as a retired route and is not current authority
  (`src/routes/engine.tsx`).

### Operation, Customer Request, notification, and integration APIs

- Operation gateway: `POST /api/v1/operations/execute`, `GET /api/v1/operations/$invocationRef`,
  `POST .../$invocationRef/cancel`, and `POST .../$invocationRef/reconcile`. The gateway validates
  bearer scope, strict input, principal-bound idempotency, durable status, and evidence-bound recovery
  (`src/routes/api.v1.operations.execute.ts`, `src/lib/server/operation-invoke-api.ts`,
  `convex/capabilityOperationInvocations.ts`).
- Customer Request browser routes are `/api/requests`, `/api/requests/$requestRef` and its
  `messages`, `options`, `facts`, `authorization`, `confirmation`, `run`, `cancellation`,
  `evidence`, `problems`, `problems/$reportRef/replies`, and repeat-permission descendants.
  Agent equivalents live under `/api/v1/requests`; `/api/v1/requests/schema` publishes the strict
  contract. Browser adapters use a signed guest cookie or authenticated fallback; agent adapters use
  bearer principal/customer scope (`src/lib/server/customer-request-browser-api.ts`,
  `src/lib/server/customer-request-agent-api.ts`, `src/routes/api.v1.requests.ts`).
- `/api/notification/novu-dispatch`, `/api/notification/resend-dispatch`, and
  `/api/notification/resend-webhook` are system-authenticated, bounded, idempotent outbox/provider
  adapters. `/api/stripe/webhook` is the bounded Stripe event adapter
  (`src/lib/server/notification-dispatch.ts`, `convex/notificationOutbox.ts`,
  `src/modules/money/internal/stripe-webhook.ts`).
- `/api/storefront/import-draft` and `/api/storefront/enrich` are source-admission storefront
  adapters; `/api/v1/release`, observability client-error/funnel routes, and sitemap/robots/legal
  routes are separate bounded projections (`src/routes/api.storefront.import-draft.ts`,
  `src/routes/api.observability.client-error.ts`).
- `tools/ae` is a thin external CLI over the action/Operation registries: manifest, search, inspect,
  compare, connect, invoke, status, recover, demand, and advanced commands. It preserves explicit
  idempotency, source-local evidence, and unknown/recovery outcomes (`tools/ae/cli.ts`,
  `tools/ae/commands/manifest.ts`, `tools/ae/commands/invoke.ts`).

## 3. Durable schema inventory

The following is the current authority inventory, grouped by source bundle. Exact field validators,
indexes, and legacy unions remain in the cited schema; this map names the information-bearing rows
without duplicating every validator.

| Authority area | Durable rows and purpose | Current source |
|---|---|---|
| Business/catalog | `owners`, `businesses`, `businessContexts`, `claims`; `businessOfferings`, revisions, access paths, and `businessSupplyProjectionSnapshots` | `src/modules/business/internal/schema.ts`, `src/modules/catalog/internal/schema.ts` |
| Capability contract/supply | Immutable contract documents; `capabilityPublications`, `capabilityOfferings`, `capabilityTransportBindings`, source drafts, provider connections/leases/approvals, registered mappings, call events | `src/modules/capability-contract-registry/internal/convex-schema.ts`, `src/modules/capability-supply/internal/convex-schema.ts` |
| Registry/discovery | Registry projection items/attempts, search documents, index status; discovery manifests/attempts; demand and search-gap records | `src/modules/registry/internal/schema.ts`, `src/modules/discovery/internal/schema.ts`, `src/modules/demand/internal/schema.ts` |
| Operation execution | Outer `capabilityOperationInvocations`; canonical `actionInvocationControls`, attempts, and history; routing admission meters/leases/decisions, provider telemetry, incident freeze/recovery/evidence rows | `src/modules/capability-execution/internal/convex-schema.ts`, `src/modules/action-invocation/internal/convex-schema.ts`, `src/modules/routing-kernel/internal/convex-schema.ts` |
| Answer | `answerThreads`, `answerTurns`, `answerTurnReservations`, `answerToolCalls`, `answerThreadShares`; reservations bind session/thread/turn identity before model or provider work | `src/modules/answer-thread/internal/convex-schema.ts`, `convex/answerThreads.ts` |
| Customer Request | V2 heads/submission shells/revisions/commands, route-plan generations, action preparations/disclosure/authority/egress/reconciliation/prepared-action rows; route mandates, step/data reservations, runs, cancellation/problem reports | `src/modules/customer-request/internal/convex-v2-schema.ts`, `src/modules/customer-request/internal/route-mandate-convex-schema.ts` |
| Agent access | Principals; seven-day OAuth grants and dynamic clients; durable policy grants with generation, scopes, spend, concurrency, and rate limits | `src/modules/agent-access/internal/principal-convex-schema.ts`, `oauth-convex-schema.ts`, `convex-schema.ts` |
| Money | Accounts, append-only ledger entries, transactions, usage, credential budgets, free-tier counters, topup/connect/Stripe events, payout accounts and payouts | `src/modules/money/internal/convex-schema.ts`, `convex/moneyLedger.ts` |
| Inquiry/notification | Inquiry threads, customer access grants, messages, notifications/read states, abuse buckets, privacy tombstones, governed-send receipt/keys/lineage; notification dispatches/attempts/webhook events | `src/modules/inquiries/internal/convex-schema.ts`, `src/modules/notification-outbox/internal/schema.ts` |
| Governance/operations | Admin disputes/suppression/memberships/nonces; operation keys/audit/funnel/operator controls/owner activation; settings preferences; project spine; work trees/events/decisions/repeat permissions/uses/approvals | `src/modules/security/internal/schema.ts`, `src/modules/observability/internal/schema.ts`, `src/modules/settings/internal/schema.ts`, `src/modules/project-spine/internal/convex-schema.ts`, `src/modules/work-tree/internal/convex-schema.ts` |
| Study/run/harness | `studies` and append-only study events, external-run manifests/starts/evidence/gate decisions, harness sessions/entries | `src/modules/study/internal/convex-schema.ts`, `src/modules/external-run/internal/convex-schema.ts`, `src/modules/harness/internal/convex-schema.ts` |

`convex/schema.ts` is the registered root. Public catalog reads come from current, published,
unsuppressed supply snapshots (`convex/registry.ts`, `registry:listPublicBusinessOfferingSupply`),
while registry/search tables are projections and repair/index state. Capability publications and
bindings are likewise source material for operation projections; they are not replaced by a browser,
model, or registry search result.

## 4. Numbered data-flow journeys

### J1 — Buyer ask → Answer thread → private/share readback

1. `/` validates bounded query/project state; a query enters `/t/new`, while an explicit project uses
   `readRootWorkTreeServer` (`src/routes/index.tsx`).
2. `/api/answer/turn` requires JSON, a 16 KiB body, an `x-ae-turn-key` (≤128 chars), rate admission,
   session identity, and strict request parsing (`src/routes/api.answer.turn.ts`,
   `src/lib/server/bounded-request-body.ts`). `reserveAnswerTurn` atomically binds owner/session,
   thread scope, request digest, turn identity, sequence, and the 25-turn ceiling before streaming
   (`convex/answerThreads.ts`).
3. The stream is transient. Checkpoint/finalization writes durable turn evidence and terminal status;
   owner readback is the terminal confirmation. Same key+digest replays; changed material input
   conflicts (`src/modules/answer-thread/internal/answer-turn-checkpoint.ts`,
   `src/modules/answer-thread/internal/public-projection.ts`).
4. `/t/$threadId` exposes a pseudonymous-session projection; share issue/revoke creates a durable
   revocable grant; `/s/$shareToken` accepts only a 64-hex token and projects sanitized transcript
   state (`src/modules/answer-thread/answer-thread.functions.ts`, `src/routes/s.$shareToken.tsx`).
   Stop durably transitions a turn before browser abort, and never upgrades an interrupted stream to
   completion (`src/routes/api.answer.turn.stop.ts`).

### J2 — Public business catalog → exact inquiry → owner/customer record

1. Business/context/catalog writes are source-write-admitted and rebuild a bounded
   `BusinessSupplyProjection`; public list/search/detail reads hide unpublished or suppressed supply
   (`convex/capabilitySupplyProjection.ts`, `convex/registry.ts`,
   `src/modules/catalog/internal/offering-supply.ts`).
2. `projectServiceFromBusinessDto` projects one business to `ServiceDto.endpoints[]`. An Operation
   enrichment occurs only for one exact catalog-origin match across offering revision, access path,
   URL, and method; ambiguity remains catalog-only (`src/modules/registry/internal/services-api-projection.ts`).
3. `/$slug/inquiry` re-reads target admission, renders exact governed-send fields, signs a canonical
   intent digest, and submits through `submitPublicInquiryServer`. Convex verifies source-write
   admission/rate limit and persists inquiry thread, access grant, message, receipt, and notification
   outbox (`src/routes/$slug.inquiry.tsx`, `src/modules/inquiries/inquiry.functions.ts`,
   `convex/inquiries.ts`).
4. The customer record shows sent/delivery/reply evidence only. Owner inbox/detail actions require
   owner identity and expected version; notification providers return IDs/hashes/status, not raw
   addresses or credentials (`src/components/ae/inquiries/AeCustomerRecord.tsx`,
   `src/modules/notification-outbox/public.ts`).

### J3 — Claim/owner supply → admission/import → projection/readiness

1. Claim and offering editors persist owner/business/revision state with expected revision and
   idempotent request keys (`src/modules/catalog/owner-claim.functions.ts`,
   `src/routes/_operator/owner.offerings.$offeringRef.tsx`).
2. The owner funnel reads source drafts and runs document/capability preflight, admission, readiness,
   test, maintenance, withdraw, and republish against owner/business/offering/revision identity
   (`src/routes/_operator/owner.supply.$offeringRef.tsx`,
   `src/modules/capability-supply/supply-funnel.functions.ts`).
3. `normalizeCapabilityPublication` and the OpenAPI/MCP/x402 importers bound source bytes/depth/nodes,
   normalize transport/payment/schema, and emit named refusal reasons. `commitPreparedPublicationCommand`
   persists provenance, contract, publication, offering, binding, and replay identity only after
   deterministic checks (`src/modules/capability-supply/internal/publication-importers.ts`,
   `src/modules/capability-supply/internal/publication/publish.ts`).
4. A one-minute cron schedules at most 20 due probes; the probe uses guarded public-target lookup,
   a bounded request/response, credential resolution, and revision/target fences. It records
   `observedAt`, `validUntil`, request/response digests, credential/health state, and typed outcome
   (`convex/crons.ts`, `convex/capabilitySupply.ts`, `convex/capabilitySupplyReadiness.ts`).
5. Projection rebuilds and exact graph qualification fail closed on stale revision, invalid binding,
   readiness expiry, source capacity, or insufficient evidence; public search/detail shows those
   states instead of inventing routeability (`src/modules/capability-supply/internal/graph/qualify-candidate.ts`,
   `convex/capabilitySupplyProjection.ts`).

### J4 — Operation discovery → access/OAuth → invocation → recovery/money

1. `searchCapabilityOperations` reads current publication snapshots, validates query/cursor/filters,
   recomputes `operation:v1:<64hex>` identity, and returns bounded descriptors. Detail, compare, and
   inspect-plan are exact reads/joins, not authority grants (`src/modules/capability-supply/operation-projection.ts`,
   `convex/capabilitySupplyOperations.ts`).
2. Owner consent through OAuth device or authorization-code/PKCE flow creates a principal and durable
   grant before returning a one-time AE caller key. Grants carry scopes, environment, generation,
   policy digest, spend/rate/concurrency limits, and seven-day expiry; supplier credentials stay
   server-side (`src/lib/server/agent-access-oauth-api.ts`, `src/modules/agent-access/agent-access.ts`).
3. The authenticated gateway checks bearer identity and `market_operations:invoke`, strict input,
   operation source-write authority, grant/policy, and principal-bound idempotency before persisting
   `capabilityOperationInvocations` (`src/lib/server/operation-invoke-api.ts`,
   `convex/capabilityOperationInvocations.ts`).
4. The durable worker re-reads grant/principal, current publication, operation material, readiness,
   binding/provider approval, accepted authority, and budget. It claims an attempt/effect generation,
   obtains provider lease when needed, persists a release fence, calls guarded HTTP/MCP/x402 transport,
   settles money/lease, then persists canonical terminal evidence before projecting outer status
   (`convex/capabilityOperationInvocationWorker.ts`, `src/modules/action-invocation/canonical-claim.ts`).
5. Status is owner/principal scoped. Cancel can yield `cancelled/not_released`; transport uncertainty
   yields `reconciliation_required/possibly_released`; reconcile requires matching attempt, input,
   provider/payment/transport evidence and never creates a new effect (`src/modules/action-invocation/operation-public.ts`,
   `src/routes/api.v1.operations.$invocationRef.reconcile.ts`).
6. Dynamic published actions authorize exact price, debit operator credit, accrue provider earnings,
   and record AE rake with immutable transaction/idempotency identity. Topup, refund, payout, Stripe
   webhook, and outcome-unknown reconciliation are separate money commands (`src/modules/action-invocation/dynamic-published-adapter.ts`,
   `convex/moneyLedger.ts`, `src/modules/money/internal/topup.ts`).

### J5 — Customer Request → route plan/mandate → external action → outcome/recovery

1. Browser submit uses a signed, bounded-lived guest session; agent submit uses bearer principal and
   customer scope. Both enter strict action contracts with command keys, expected revisions, and
   source assertions (`src/lib/server/customer-request-browser-api.ts`,
   `src/lib/server/customer-request-agent-api.ts`, `src/modules/customer-request/agent-contract.ts`).
2. Deterministic aggregate/compiler/projection stores criteria, provenance, route candidates, required
   facts, preparation/disclosure review, route plan generation, and next action. Model interpretation
   is a proposal; compile/commit validates routeability against current supply (`src/modules/customer-request/compiler.ts`,
   `src/modules/customer-request/customer-projection.ts`, `convex/customerRequestApplication.ts`).
3. Confirmation/run requires `approve_each`; repeat permission requires a bounded mandate. Durable
   route step admission checks principal/owner/mandate/target/effect scope and reserves command identity
   before dispatch (`src/modules/customer-request/route-mandate.ts`,
   `src/modules/customer-request/customer-request.actions.ts`).
4. Route work is dispatched through the shared Workpool into the transport worker. The worker opens
   dispatch, checks expiry/target safety, signs the call, authorizes x402 when applicable, records
   response/evidence, and converges unknown/released outcomes; it never treats a provider response or
   browser state as a completed business result (`convex/customerRequestRouteWorkpool.ts`,
   `convex/customerRequestRouteTransportWorker.ts`).
5. Browser and agent projections share the same durable Request aggregate but differ in authentication
   and navigation. `outcome_unknown` and unsupported revision states are visible next actions, not
   silent retries (`src/modules/customer-request/agent-navigation.ts`,
   `src/modules/customer-request/customer-projection.ts`).

### J6 — Agent access/OAuth lifecycle

OAuth metadata and registration are public bounded adapters; device/PKCE consent is owner-controlled.
`agentAccessOAuth` transitions are durable, one-time delivery is separated from token storage, and
revoke persists the AE grant/principal lifecycle before provider key revocation (`src/routes/oauth.*`,
`src/modules/agent-access/oauth-state.ts`, `src/modules/agent-access/agent-access.ts`). Policy
checks active lifecycle, principal/application/environment, generation/digest, scopes, spend, rate,
and concurrency (`src/modules/agent-access/policy.ts`, `convex/agentAccessPolicy.ts`). Owner
readbacks omit secrets and supplier credentials; local E2E bypass is explicitly not production
authorization (`src/lib/server/local-e2e-bypass.ts`).

### J7 — Inquiry/notification/Stripe observations

Inquiry submission persists a governed receipt and notification dispatch source row before provider
send. Novu/Resend dispatchers resolve recipients server-side, bound webhook bodies, verify provider
signatures, deduplicate provider events, and project status/error/hash/next-action readbacks
(`convex/inquiries.ts`, `convex/notificationOutbox.ts`, `src/lib/server/notification-dispatch.ts`).
Stripe checkout/connect webhook and payout paths preserve pending, succeeded, failed, reversed, and
`outcome_unknown`; browser success is not payment evidence (`src/modules/money/internal/stripe-webhook.ts`,
`src/modules/money/internal/payout-policy.ts`).

### J8 — Operator/admin/developer readbacks and public discovery

The operator layout authenticates a Clerk session, then source queries/mutations enforce ownership or
admin membership/action matrices. Admin readbacks take bounded source rows and redact identity/content;
developer discovery renders public route health, freshness, support, and gated/unavailable states
(`src/lib/operator/route-options.ts`, `src/modules/security/internal/admin-authority.ts`,
`convex/security.ts`, `src/modules/discovery/developer-discovery.ts`). Public UCP, llms, SKILL,
catalog, and Operation manifests derive from route/action registries and current projections; they
are documentation/read contracts, not proof of live routeability or settlement (`src/modules/discovery/public.ts`,
`src/modules/actions/index.ts`).

## 5. Authority, provenance, redaction, idempotency, and evidence invariants

- **Identity and revisions:** Public Operation refs are recomputed from operation/publication/revision/
  contract material (`src/modules/capability-supply/public.ts`, `src/modules/capability-supply/operation-projection.ts`).
  Owner/source commands bind business, offering, revision, source digest, expected version, and
  correlation/operation key (`src/modules/capability-supply/internal/publication/publish.ts`).
- **Exact catalog origin:** Service endpoint enrichment requires one unambiguous catalog-offering
  origin/link; no quote, model, or ambiguous URL creates an executable endpoint
  (`src/modules/registry/internal/services-api-projection.ts`).
- **Authority before effect:** Owner/admin/principal identity and source-write admission precede claim,
  publication, inquiry, route, operation, money, and OAuth mutations (`src/lib/server/convex-source.ts`,
  `src/modules/security/internal/admin-authority.ts`, `src/modules/agent-access/policy.ts`).
- **Model/provider non-authority:** Model proposals select from deterministic descriptors; provider
  responses, readiness probes, MCP state, browser state, and Stripe/notification webhooks are recorded
  observations. Only durable source transitions can publish completion/evidence (`src/modules/customer-request/compiler.ts`,
  `src/modules/capability-supply/internal/readiness-probe.ts`, `src/modules/action-invocation/canonical-claim.ts`).
- **Redaction:** Public business/Service/Operation projections omit private source rows; Answer public
  projections reject forbidden replay keys recursively and omit raw evidence/provider/model payloads;
  inquiry/customer/admin/notification/OAuth projections expose refs, status, hashes, and bounded text,
  not secrets or raw recipient credentials (`src/modules/answer-thread/internal/public-projection.ts`,
  `src/modules/inquiries/internal/schema.ts`, `src/modules/security/internal/admin-readbacks.ts`).
- **Idempotency/replay:** Answer reservation keys bind owner/session/scope/digest; Customer Request,
  publication, route, operation, action-invocation, money, notification, OAuth, and payout commands
  bind canonical command digests and expected versions. Replay returns the prior durable result;
  material conflicts refuse (`convex/answerThreads.ts`, `src/modules/action-invocation/durable.ts`,
  `convex/moneyLedger.ts`).
- **Release/effect fencing:** Canonical action attempts track lease owner, effect generation,
  release state, terminal outcome, and reconciliation evidence. `possibly_released` is never reported
  as safe to retry (`src/modules/action-invocation/contracts.ts`, `src/modules/action-invocation/canonical-claim.ts`).
- **Money identity:** Charge amount/currency/price digest, account version, transaction/refund
  identity, credential budget generation, provider accrual, and rake are checked transactionally;
  outcome unknown requires reconciliation (`src/modules/money/internal/ledger.ts`, `convex/moneyLedger.ts`).
- **HTTP boundary:** `problem()` emits RFC 9457 `application/problem+json`; concrete routes guard
  unsupported methods and the `/api/$` catch-all returns 404 instead of SPA HTML (`src/lib/server/problem.ts`,
  `src/routes/api.$.ts`, `src/lib/server/method-guard.ts`). Coverage is a route contract, not evidence
  that every external system is healthy.

## 6. Resource-first USE inventory

USE is applied to resources after listing them: utilization is used/busy capacity over the stated
window/cap, saturation is waiting/queued work caused by unavailable capacity, and errors include
failed, recovered, or retried attempts. Source state and per-request evidence exist, but aggregate
telemetry is often absent. No `?` below means a current source-enforced bound, not a measured SLO.

| Resource | Capacity/bound | Utilization observation | Saturation observation | Errors | Current observability | Owner/seam |
|---|---|---|---|---|---|---|
| Answer model/tool loop | 4 rounds; output 1,024 tokens; normalized tool calls; one default registry search limit 3; tool result 64 KiB; no model retries | Per-request model/token usage may be recorded; aggregate used-token/round utilization over a window `?` | Exhausted loop/tool budget (`budget_exceeded`); queued model work or context waiting `?` | Windowed failed/recovered/retried count/rate `?`; taxonomy: `budget_exceeded`, `result_too_large`, provider/model errors; `maxRetries: 0` | Request-level checkpoints and harness/model request observations; aggregate token/cost dashboard `?` | `src/modules/answer/internal/answer-tool-use-agent.ts`, `src/modules/answer-thread/internal/answer-turn-checkpoint.ts`; Answer owns accounting |
| Answer durable turns/checkpoints | 25 turns/thread; reads 26 to detect overflow; checkpoint 256 KiB, max 16 tool calls/digests/model requests, 25 providers, 32 replay messages; 30 s lease | Per-turn reservation/active status and checkpoint steps are durable; aggregate active-turn/lease utilization over a window `?` | `thread_turn_limit` records exhausted 25-turn capacity; queued or waiting turn reservations `?` | Windowed failed/recovered/retried count/rate `?`; taxonomy: digest/identity/checkpoint conflicts, stale lease, finalization errors | `answerTurnReservations`, `answerTurns`, checkpoint/final status; per-turn state only | `convex/answerThreads.ts`, `src/modules/answer-thread/internal/answer-turn-checkpoint.ts` |
| Convex transactions/queries and projections | `?` platform byte/read/write ceilings; application pagination validator; source projections use bounded `take(+1)` | Convex per-transaction consumption may be platform-observed; repository aggregate used byte/read/write utilization over a window `?` | Queued/waiting or exhausted Convex platform capacity `?`; no repository observation seam | Windowed failed/recovered/retried count/rate `?`; taxonomy: capacity refusal, stale projection, query/transaction errors | Named capacity errors and bounded rows; live Convex byte/doc counters `?` | `convex/schema.ts`, `convex/capabilitySupplyProjection.ts`, `convex/security.ts`; each module owns its query shape |
| Operation catalog source/search | Source 256 (+1 overflow), query 200, cursor 512, page 20, compare 4, inspect plan 4, mappings 32; schema 65,536 bytes/depth 24/properties 128/refs 64 | Per-request returned-row counts against page/source bounds; aggregate source/read capacity utilization over a window `?` | `source_capacity_exceeded` only when the source bound is exhausted; DB queue/wait `?` | Windowed failed/recovered/retried count/rate `?`; taxonomy: operation unavailable/not current, mapping cycle/incompatible, schema-bound refusal, invalid cursor/limit | Public pagination (`nextCursor`, `hasMore`) and typed unavailable result; aggregate search load `?` | `src/modules/capability-supply/operation-projection.ts`, `convex/capabilitySupplyOperations.ts`; registry/supply owns |
| Eligible supply/catalog projection | Eligible max 256; catalog max 100 offerings/business and 20 access paths/offering; rebuild reads +1 and parallelizes per-offering joins | Per-rebuild row counts and projection generation/source digest; aggregate rebuild CPU/read utilization over a window `?` | `capacity-exceeded` only when an explicit source bound is exhausted; rebuild queue/wait `?` | Windowed failed/recovered/retried count/rate `?`; taxonomy: pending snapshot, offering/path overflow, lineage mismatch, source stale/invalid binding | `businessSupplyProjectionSnapshots`, registry projection attempts/index status; utilization `?` | `src/modules/capability-supply/internal/eligibility/list.ts`, `src/modules/catalog/internal/offering-source.ts`, `convex/capabilitySupplyProjection.ts` |
| Customer Request graph/plan | Graph listRouteable 64, mappings 128; interpreter descriptors 512 KiB, projected input schema 256 KiB; compiler selections 64/facts 128/route plans 256; preview 32 steps/64 options | Per-request graph/plan row and step counts plus work observations; aggregate graph/model capacity utilization over a window `?` | Compiler overflow refusal is an exhausted bound; graph/plan queue or wait `?` | Windowed failed/recovered/retried count/rate `?`; taxonomy: needs-information, context-stale, route unavailable, unsafe interpretation, stale revision/mandate, unsupported/unknown outcome | Durable heads/revisions/commands/route runs/recovery evidence; aggregate route saturation `?` | `convex/customerRequestApplication.ts`, `src/modules/customer-request/compiler.ts`, `src/modules/customer-request/internal/convex-v2-schema.ts` |
| Shared route Workpool/scheduler | Workpool max parallelism 32; global Convex slot ceiling `?`; default max attempts 3, backoff 1 s, base 2; scheduler `runAfter(0)` | Durable work IDs/dispatch states and completion callbacks; active slots/worker busy time over a window `?` | Queue depth/age, retry backlog, or exhausted slots `?` (no aggregate queue/capacity observation) | Windowed failed/recovered/retried count/rate `?`; taxonomy: retry/completion failures and transport unknowns | `customerRequestRouteWorkpool`, dispatch state/work ID, cron invocation counts; no queue metrics | `convex/customerRequestRouteWorkpool.ts`, `convex/customerRequestRouteTransportWorker.ts`, `convex/capabilityOperationInvocations.ts`; Workpool owns dispatch |
| Readiness probe capacity | 1-minute cron; refresh lead 90 s; max 20 due publications per run; healthy TTL 5 min/unhealthy TTL 1 min; probe response 64 KiB | Per-publication `observedAt`, `validUntil`, credential/health state, response digest/status; aggregate probe/cron capacity utilization over a window `?` | Due rows beyond 20 wait for next minute (source-enforced scheduler bound); probe queue/active-slot saturation `?` | Windowed failed/recovered/retried count/rate `?`; taxonomy: typed unreachable/redirect/4xx/5xx/content-type/too-large/invalid/credential failures | Publication lifecycle and evidence refs; aggregate latency/error/saturation `?` | `convex/crons.ts`, `convex/capabilitySupply.ts`, `convex/capabilitySupplyReadiness.ts`, `src/modules/capability-supply/internal/readiness-probe.ts` |
| Provider HTTP/MCP/x402 transport | HTTP timeout 100..120,000 ms (probe default 10 s); execution response 512 KiB; manual redirects; MCP page 32/tool 4,096; MCP maxRetries 0 | Per-attempt request/response/evidence/unknown observation; aggregate cross-provider concurrency/byte utilization over a window `?` | Provider/client queue or exhausted transport capacity `?`; no source observation seam | Windowed failed/recovered/retried count/rate `?`; taxonomy: timeout, network unknown, malformed response, transport/refusal, payment unknown; Workpool retries selected outer actions only | Route transport observation, request/response digests, typed disposition/release; aggregate provider health `?` | `src/modules/capability-supply/route-transport-runtime.ts`, `src/modules/capability-supply/internal/readiness-probe.ts`, `convex/customerRequestRouteTransportWorker.ts` |
| HTTP ingress/body and rate-limit buckets | Body guard; route caps 4 KiB–256 KiB (Answer 16 KiB, MCP 64 KiB, market search/inspect 16 KiB/detail 4 KiB/compare 8 KiB, OAuth 16 KiB, Stripe/webhooks 256 KiB); token buckets public read 120/min, mutation 5/min, OAuth 5/min, Answer 30/hour/60/hour/30/hour, inquiry 5/min, dispute 3/min | Per-request admission outcomes and Retry-After; aggregate used ingress/bucket capacity over a window `?` | 429 refusal + Retry-After (exhausted rate-limit bucket); server concurrency/in-flight `?` | Windowed failed/recovered/retried count/rate `?`; taxonomy: payload-too-large, rate_limited, parser/method errors | `rateLimit` component rows and RFC 9457 responses; aggregate ingress utilization `?` | `src/lib/server/bounded-request-body.ts`, `src/lib/server/rate-limit.ts`, `convex/lib/rateLimit.ts`; ingress/rate limiter owns |
| Agent grant/credential budgets | Policy requires positive-safe spend/concurrency/rate; default policy zero spend, concurrency 1, 30/min, 300/hour; dynamic buckets clamp 60/min/300/hour; daily/monthly/per-invocation exact amounts | Durable budget reserved/consumed/released; calls and spend per credential are queryable; aggregate used budget/concurrency utilization over a window `?` | Concurrency/quota exhaustion (daily/monthly/per-invocation limits); queued or waiting work `?` | Windowed failed/recovered/retried count/rate `?`; taxonomy: stale/missing policy/generation, currency/account conflict, budget rejection | `moneyCredentialBudgetStates`, usage summaries/events, grant policy digest; no global spend SLO | `src/modules/agent-access/policy.ts`, `src/modules/money/internal/credential-budget.ts`, `convex/moneyLedger.ts` |
| Money/Stripe/payout effects | Exact currency units/exponent; topup production USD $5–$25,000; Stripe webhook 256 KiB and 5 s retry hint; payout account/threshold/KYC gates | Ledger entries/transactions/account versions and payout transfer status; aggregate payment-provider used capacity over a window `?` | Payment/payout queue or exhausted provider capacity `?`; pending/outcome_unknown/reconciliation_required and payout held threshold/KYC are status/effect taxonomy, not saturation | Windowed failed/recovered/retried count/rate `?`; taxonomy: insufficient credit, idempotency/currency conflict, provider failure/unknown, reversal, pending/outcome_unknown/reconciliation_required | Append-only ledger, Stripe event digest, payout/transfer evidence; aggregate settlement latency `?` | `src/modules/money/internal/ledger.ts`, `topup.ts`, `payout-policy.ts`, `src/modules/money/internal/stripe-webhook.ts`, `convex/moneyLedger.ts` |
| Notification outbox/providers | Dispatch/attempt/webhook rows; webhook body 256 KiB; provider retry policy is durable per dispatch, not global | Per-dispatch status, attempt count/provider IDs/payload hashes; aggregate dispatch/worker utilization over a window `?` | Dispatch queue/worker wait caused by unavailable capacity `?`; pending/held/retry are status/recovery taxonomy, not saturation | Windowed failed/recovered/retried count/rate `?`; taxonomy: duplicate, provider mismatch/disabled, signature rejection, send unknown | Redacted dispatch readback and webhook event status; aggregate provider error rate `?` | `src/modules/notification-outbox/internal/schema.ts`, `convex/notificationOutbox.ts`, `src/lib/server/notification-dispatch.ts` |
| Browser/stream/client concurrency | UI duplicate-submit refs and typed SSE frames; no global browser fetch semaphore or HTTP in-flight cap found | Client turn/submit state and stream frames; aggregate client used/in-flight utilization over a window `?` | Browser in-flight/backpressure queue or exhausted client capacity `?`; durable stop/lease is correctness protection, not saturation | Windowed failed/recovered/retried count/rate `?`; taxonomy: disconnect, abort, malformed frame, stale client projection; never terminal authority | Browser state machine plus durable readback; global client telemetry `?` | `src/modules/answer/answer-ui-stream.ts`, `src/components/ae/chat/answer-turn-state.ts`, `src/routes/api.answer.turn.stop.ts` |
| Admin/operator/discovery readbacks | Admin source reads cap 100 rows per source; discovery is projection/read-only | Per-readback row counts/truncation and route health/freshness; aggregate read-capacity utilization over a window `?` | Admin/discovery read queue or exhausted read capacity `?`; source stale/unavailable/degraded are status/error taxonomy, not saturation | Windowed failed/recovered/retried count/rate `?`; taxonomy: membership denied, source unavailable, malformed projection | `readAdminRows`, discovery health/state, redacted error codes; aggregate admin latency `?` | `convex/security.ts:704-753`, `src/modules/security/internal/admin-readbacks.ts`, `src/modules/discovery/developer-discovery.ts` |

### USE interpretation and unknown metrics

The table intentionally keeps three questions separate. For example, a 429 is an ingress error and
saturation signal, but it is not proof of high utilization; a `take(257)` overflow is a projection
capacity error, but not a measurement that 256 rows are normally busy; `outcome_unknown` is a
correctness/effect uncertainty, not zero utilization. Proposed future SLOs would need explicit
`[PROPOSED]` labels and a measurement seam; this map does not invent them.

Unknowns requiring new observation rather than inference are: live Convex bytes/documents/transaction
consumption; Workpool active slots, queue depth/age, retry saturation, and scheduler backlog; readiness
and provider aggregate latency/error rates; model aggregate token/cost/context utilization; browser and
HTTP global in-flight concurrency; and cross-surface read amplification. Current rows expose per-request
status, count, digest, observedAt, validUntil, work ID, attempt, and retry state but not those aggregates
(`convex/**`, `src/modules/**` sources cited in the table).

## 7. Proof ceilings and reachable gaps

### Proof ceilings

- **Public discovery/catalog:** proves a current source projection, contract, price/evidence context,
  provenance, and declared availability at read time. It does not prove provider uptime, execution,
  payment, booking, or business acceptance (`src/modules/registry/internal/services-api-projection.ts`,
  `src/modules/capability-supply/operation-projection.ts`).
- **Readiness:** proves one bounded, guarded observation against a revision/target/credential at its
  `observedAt`/`validUntil`; it is not an SLA or continuous health metric (`src/modules/capability-supply/internal/readiness-probe.ts`).
- **Answer:** proves only durable frozen evidence and sanitized completion/error projection. Model prose
  or an open stream cannot upgrade pending/unknown into completion (`src/modules/answer-thread/internal/public-projection.ts`).
- **Inquiry/customer record:** proves what AE submitted, to whom (as bounded/verified identity), when,
  delivery/readback, and recorded reply. It does not prove acceptance, availability, booking,
  confirmation, compensation, or completed business work (`src/components/ae/inquiries/AeCustomerRecord.tsx`).
- **Operation:** `completed` means the canonical source accepted a terminal provider observation with
  matching input/contract/evidence. `pending`, transport unknown, `possibly_released`, and
  `reconciliation_required` remain non-completion states (`src/modules/action-invocation/operation-public.ts`,
  `convex/capabilityOperationInvocationWorker.ts`).
- **Money:** ledger/Stripe evidence proves the recorded transaction/provider observation, not a browser
  success screen. Unknown topups/charges/payouts require reconciliation; provider accrual is not a
  payout (`src/modules/money/internal/ledger.ts`, `src/modules/money/internal/payout-policy.ts`).
- **Operator/admin:** redacted readback proves an authorized view of bounded current source rows,
  not adjudication, external causality, or remediation (`src/modules/security/internal/admin-authority.ts`,
  `convex/security.ts`).

### Reachable gaps (current source, not historical backlog)

1. **Worker-to-ledger identity seam:** the durable operation worker calls internal
   `moneyLedger.authorizeInvocationCharge` after checking an operator account, but the ledger mutation
   independently requires an authenticated `ctx.auth` identity for the principal and returns
   `billing_identity_missing` otherwise. The worker action has no request identity injection at this
   call site, so a configured paid invocation can refuse before transport (`convex/capabilityOperationInvocationWorker.ts`,
   `convex/moneyLedger.ts`, `authorizeInvocationCharge`). This is a source-integrated gap, not proof
   that a hosted deployment always fails.
2. **Cancellation race:** worker cancellation checks occur before canonical claim/release, while the
   recovery path can project a pending outer row to `cancelled` and clear work/attempt fields. A
   cancellation acknowledged in that window can race a later claim/release; canonical effect state,
   not the outer cancelled label, is the safety authority (`convex/capabilityOperationInvocationWorker.ts`,
   `recover`, `openDispatch`, `src/modules/action-invocation/canonical-claim.ts`).
3. **Possibly-released retry identity:** the worker rebuilds canonical claim material with a fresh
   `recordedAt`; canonical claim command identity includes recorded-at material while the stable
   command ID is attempt-based. A retry after a persisted possibly-released fence can therefore hit
   `command_identity_conflict` instead of the intended reconciliation path (`convex/capabilityOperationInvocationWorker.ts`,
   `operationInvocationAttemptIdentityDigest`, `src/modules/action-invocation/canonical-claim.ts`).
4. **Readback truncation and pagination:** provider earnings/admin/inquiry/readback surfaces are bounded
   source projections (for example admin rows take 100 and public operation/catalog pages are capped).
   Consumers must honor `truncated`, `nextCursor`, or `hasMore`; there is no claim of a complete historical
   statement from a bounded page (`convex/security.ts`, `convex/moneyLedger.ts`,
   `src/modules/capability-supply/operation-projection.ts`).
5. **Projection/readiness staleness is honest but visible:** catalog/capability projection pending,
   revision mismatch, readiness expiry, source capacity, unsupported transport, and provider
   `source_unavailable` can make a route unavailable. The current behavior fails closed; no source proves
   that stale rows are automatically repaired within a target latency (`convex/capabilitySupplyProjection.ts`,
   `convex/capabilitySupply.ts`, `src/modules/capability-execution/operation-execute.functions.ts`).
6. **No aggregate USE telemetry:** source rows record bounded per-request observations, but no repository
   seam reports Convex read/write utilization, Workpool queue depth/age/slot use, provider aggregate
   saturation/error rate, model aggregate token budget, or browser/HTTP in-flight concurrency. These
   remain `?`, not healthy zeros (`convex/customerRequestRouteWorkpool.ts`, `convex/crons.ts`,
   `src/lib/server/rate-limit.ts`).
7. **Hosted/live proof remains configuration-gated:** source has environment credentials, guarded target
   checks, Stripe/OAuth/provider adapters, and local/eval fixture paths, but this map does not promote
   them into hosted certification. Live completion, paid delivery, payout, and external business effect
   require the corresponding configured deployment and durable evidence (`src/lib/server/local-e2e-bypass.ts`,
   `src/modules/money/internal/live-money-gate.ts`, `tools/ae/README.md`).

## 8. Primary-source register

Repository-relative sources are authoritative for this map:

- Schema root and durable adapters: `convex/schema.ts`; `convex/capabilitySupply.ts`,
  `convex/capabilitySupplyProjection.ts`, `convex/capabilitySupplyOperations.ts`,
  `convex/capabilityOperationInvocations.ts`, `convex/capabilityOperationInvocationWorker.ts`,
  `convex/customerRequestApplication.ts`, `convex/customerRequestRouteTransportWorker.ts`,
  `convex/answerThreads.ts`, `convex/inquiries.ts`, `convex/notificationOutbox.ts`,
  `convex/moneyLedger.ts`, `convex/security.ts`.
- Supply/registry/contracts: `src/modules/capability-supply/internal/publication-importers.ts`,
  `src/modules/capability-supply/internal/publication/publish.ts`,
  `src/modules/capability-supply/internal/readiness-probe.ts`,
  `src/modules/capability-supply/operation-projection.ts`,
  `src/modules/registry/internal/services-api-projection.ts`,
  `src/modules/registry/internal/offering-api-projection.ts`.
- Durable action/authority/evidence: `src/modules/action-invocation/canonical-claim.ts`,
  `src/modules/action-invocation/durable.ts`, `src/modules/action-invocation/operation-public.ts`,
  `src/modules/agent-access/policy.ts`, `src/modules/agent-access/oauth-state.ts`,
  `src/modules/money/internal/ledger.ts`, `src/modules/customer-request/customer-projection.ts`,
  `src/modules/customer-request/route-mandate.ts`.
- Route/adapters and contracts: `src/routes/**` families named in §2, `src/lib/server/problem.ts`,
  `src/lib/server/rate-limit.ts`, `src/lib/server/bounded-request-body.ts`,
  `src/lib/server/operation-invoke-api.ts`, `src/lib/server/customer-request-agent-api.ts`,
  `src/lib/server/customer-request-browser-api.ts`, `src/lib/server/mcp-api.ts`, `tools/ae/cli.ts`,
  `src/modules/actions/index.ts`.
- External method: Brendan Gregg, “The USE Method”,
  <https://www.brendangregg.com/usemethod.html> (retrieved 2026-08-12 as recorded in the refresh
  contract). USE supplements correctness, authority, provenance, privacy, idempotency, and security;
  it does not replace them.

_Refreshed against the current dirty tree on 2026-08-12. This document intentionally contains no
historical schema/route counts, no unverified runtime measurements, and no migration backlog._
