# Info Architecture — Schemas & Data-Flow Routes

**Analysis date: 2026-08-15**

## Scope, evidence ceiling, and maintenance contract

This map owns the current information architecture:

- durable schemas and source/projection boundaries;
- buyer, owner, administrator, developer, and agent personas;
- HTTP, TanStack Start UI, CLI, and MCP adapters;
- Market Operation discovery, invocation, cancellation, status, and reconciliation;
- owner supply admission, publication, readiness, and supplier economic readback;
- Answer threads, durable turns, sharing, and public projections;
- Customer Requests, route plans, mandates, execution, recovery, and problems;
- agent access, OAuth, grants, budgets, and approval modes;
- internal billing, provider-direct x402 spend, Stripe, and payout evidence;
- inquiries, notifications, operator/security surfaces, and public discovery.

Prompt construction, model selection, tool-loop mechanics, model-visible schemas, and eval detail belong
in [PROMPT-DATA-FLOW.md](PROMPT-DATA-FLOW.md). This map links that boundary and does not duplicate those
internals.

- **Authority:** Convex durable rows plus deterministic module/kernel seams own identity, validation,
  authorization, dispatch, persistence, budgets, money, settlement state, and evidence
  (`convex/schema.ts`, `src/modules/**/public.ts`, and enforcing `internal/*` seams).
- **Adapter rule:** TanStack Start routes, UI loaders, HTTP handlers, CLI, and MCP expose or submit
  contracts. They are not alternate sources of truth (`src/routes/**`, `src/lib/server/**`,
  `tools/ae/**`, `src/lib/server/mcp-api.ts`).
- **Projection rule:** Search documents, public DTOs, Answer artifacts, status pages, and provider
  responses are bounded projections or observations. A projection cannot grant authority or upgrade
  uncertain work to completion.
- **Evidence classes:** repository-integrated source, locally verified behavior, fixture/eval proof,
  configured hosted observation, independently supplied evidence, and settled production evidence are
  distinct classes. Source integration alone proves only source facts.
- **Source-facts-only ceiling:** Nothing here certifies hosted uptime, external provider completion,
  real-money settlement, payout, legal readiness, or an SLO unless a cited durable observation proves
  that exact claim.
- **Maintenance:** Re-walk `convex/schema.ts`, every spread source, public module seams, route files,
  adapter registries, and dirty-tree changes before changing counts or flows.
- **USE notation:** The resource table applies Brendan Gregg's utilization, saturation, errors lens
  after inventory. `?` means no repository observation seam was found; it never means zero or healthy.

## 1. Authority spine and functional blocks

`convex/schema.ts` registers **26 table bundles/spreads containing 205 application tables**.
The spread count describes root composition; the table count describes concrete `defineTable(...)`
registrations reachable through those spreads. Convex component-owned tables are outside this
application-schema count.

```text
 Public/buyer                 Owner/admin/developer               Agent/CLI/MCP
 ────────────                 ─────────────────────               ─────────────
 /, /t/new, /$slug            /owner/*, /admin/*                  OAuth + bearer
 /t/$threadId, /s/$token      /developers/discovery              /api/v1/operations/*
 /$slug/inquiry               /agent-access/*                    /api/v1/requests/*
 /$slug/tools/*               /operations/invocations/*          /mcp, tools/ae
        │                              │                                │
        │ read/submit adapters         │ identity + source writes       │ strict contracts
        └──────────────┬───────────────┴───────────────┬────────────────┘
                       ▼                               ▼
          deterministic projections         signed source-write admission
          and public module seams            auth/scope/nonce/digest checks
                       │                               │
                       └──────────────┬────────────────┘
                                      ▼
                       Convex durable source rows
             identity / revision / authority / evidence / money
                                      │
                    ┌─────────────────┴──────────────────┐
                    ▼                                    ▼
        Convex actions + mutations             Workpool + scheduler
        reserve/claim/finalize                  bounded asynchronous work
                    │                                    │
                    └─────────────────┬──────────────────┘
                                      ▼
       guarded external effects: provider HTTP/MCP/x402, Stripe, Novu, Resend
                                      │
              response, webhook, chain receipt, or provider claim = observation
                                      ▼
     canonical terminal/reconciliation evidence → bounded owner/public readbacks
```

```text
Catalog source ──► BusinessSupplyProjection ──► public business/service DTOs
      │                         │
      │ exact offering/access-path lineage
      ▼                         ▼
Capability publication ──► current Operation projection ──► discovery only
      │
      ├─ readiness observation + revision/target/credential fence
      └─ binding + provider connection + policy
                              │
                              ▼
Agent grant ─► invocation reservation ─► canonical Action Invocation claim
                              │                       │
                              ▼                       ▼
                       Workpool dispatch       release/effect fence
                              │                       │
                              └──────────┬────────────┘
                                         ▼
                           transport + money observation
                                         ▼
                           terminal or reconcile-only state
```

```text
Answer reservation → transient stream → checkpoint/finalization → answerThreads readback
Customer Request head → immutable revision → RoutePlan generation → mandate → route run
Owner supply draft → import/admission → publication/binding → readiness → public projection
OAuth consent → principal/grant → scoped adapter → invocation envelope → status/recovery
```

The functional blocks stay separate:

1. **Business/catalog** owns public business identity, offerings, revisions, and access paths.
2. **Capability supply** owns contract-backed publications, offerings, bindings, provider authority,
   readiness observations, and Operation material.
3. **Registry/discovery** owns deterministic public projections, manifests, search documents, and
   repair/readback state.
4. **Agent access** owns principals, OAuth clients/grants, policy grants, scope, authority mode,
   generation, expiry, and budget/rate/concurrency policy.
5. **Capability execution + Action Invocation** own invocation reservation, canonical claim, lease,
   release, terminal outcome, and recovery.
6. **Money** owns exact internal ledger state, credential-budget reservations, provider-direct external
   spend reservations, Stripe observations, provider accrual, and payout rows.
7. **Customer Request** owns request ancestry, route proposals, approval/mandate authority, route
   dispatch, result evidence, cancellation, and problem reports.
8. **Answer/thread** owns durable conversational lifecycle and sanitized readbacks. Its prompt/model
   execution boundary remains in the companion prompt map.

## 2. Personas and current route inventory

The current TanStack Start tree has **128 `createFileRoute(...)` modules plus `__root.tsx`**.
The count includes the `/_operator` layout, `/api/$` catch-all, and two retained redirects.
Route presence proves an adapter exists, not that its backing dependency is configured or healthy.

### Buyer/customer

- `/` validates bounded `q` and project state. A query enters `/t/new`; an explicit project reads the
  source-backed root Work Tree (`src/routes/index.tsx`, `loadRootRoute`).
- `/t/new` starts an Answer; `/t/$threadId` reads a pseudonymous-session-owned durable projection
  (`src/routes/t.new.tsx`, `src/routes/t.$threadId.tsx`).
- `/s/$shareToken` is an unowned, read-only, sanitized shared Answer projection. The token is a grant,
  not thread authority (`src/routes/s.$shareToken.tsx`,
  `src/modules/answer-thread/internal/share-token.ts`).
- `/i/$threadId` is a retained **301** redirect to `/t/$threadId`; it is not a second record model
  (`src/routes/i.$threadId.tsx`).
- `/$slug` reads a source-backed public business page; `/$slug/inquiry` performs exact target
  admission and governed submission (`src/routes/$slug.tsx`, `src/routes/$slug.inquiry.tsx`).
- `/$slug/tools/$toolId` exposes a business tool read contract and
  `/$slug/tools/$toolId/prepare` exposes bounded preparation; neither bypasses action authority
  (`src/routes/$slug.tools.$toolId.ts`, `src/routes/$slug.tools.$toolId.prepare.ts`,
  `src/lib/server/business-tool-api.ts`).
- `/about`, `/help`, `/privacy`, `/privacy/remove-business`, and `/terms` are public informational or
  privacy adapters, not durable business authorities.

### Answer HTTP family

- `POST /api/answer/turn` reserves durable identity before transient streaming
  (`src/routes/api.answer.turn.ts`, `convex/answerThreads.ts`).
- `POST /api/answer/turn/stop` durably stops eligible work before client abort is treated as final
  (`src/routes/api.answer.turn.stop.ts`).
- `/api/answer/threads`, `/api/answer/threads/$threadId`, and
  `/api/answer/threads/$threadId/share` expose bounded session-owned list/read/share operations.
- `/api/answer/follow-up-chips` is a bounded Answer follow-up adapter.
- `/api/answer/eval-status` reports gate/config state; it is not production Answer quality evidence.
- Prompt, model, and tool-loop internals for these routes are documented only in
  [PROMPT-DATA-FLOW.md](PROMPT-DATA-FLOW.md).

### Public catalog, services, and Operation discovery

- `/api/businesses`, `/api/businesses/search`, and `/api/businesses/$slug` read the public catalog
  source projection (`src/modules/registry/internal/offering-api-projection.ts`).
- `/api/v1/services`, `/api/v1/services/search`, and `/api/v1/services/$serviceId` project that same
  catalog into Service DTOs. They are not a second catalog authority
  (`src/modules/registry/internal/services-api-projection.ts`).
- `/api/v1/market-operations/search`, `/detail`, `/compare`, and `/inspect-plan` expose read-only
  Operation contracts from the canonical action registry
  (`src/modules/registry/operation-action-contracts.ts`).
- Search accepts a query of at most 200 characters and returns at most 20 results; compare and inspect
  accept at most four exact Operation refs (caps: `operationSearchInputSchema`,
  `operationCompareInputSchema`, `operationInspectPlanInputSchema`).
- `/operations/$operationRef` displays one exact current Operation descriptor.
- `/operations/invocations/$invocationRef` is an owner-scoped status/cancel/reconcile surface, not a
  public invocation readback.
- Discovery descriptors include contract/input, commercial, evidence, effect, authentication,
  availability, provenance, and recovery navigation. They never grant invocation authority.

### Public discovery and machine-readable adapters

- `/for-agents` and `/for-providers` render current public guidance.
- `/.well-known/ucp` is the site UCP manifest; `/$slug/ucp` is the current offering manifest route
  (`src/routes/[.]well-known/ucp.ts`, `src/routes/$slug.ucp.ts`).
- `/llms.txt`, `/SKILL.md`, `/robots.txt`, and `/sitemap.xml` derive bounded public files from current
  registry/discovery seams.
- `/api/discovery/schema` and `/api/discovery/examples` publish current contracts and examples.
- `/.well-known/http-message-signatures-directory` publishes signature-key discovery material.
- `/mcp` is the Streamable HTTP MCP adapter over the shared action registry
  (`src/lib/server/mcp-api.ts`, `src/modules/actions/index.ts`).
- `src/lib/mcp-protocol.ts` re-exports the installed SDK's `LATEST_PROTOCOL_VERSION`; MCP execution
  refuses a publication pinned to a different version (`prepareRegisteredRouteTransportInvocation`).
- Anonymous MCP lists/runs only read-only actions without credential admission. Authenticated MCP
  resolves bearer principal, scope, and required authority mode before registering protected tools
  (`createAeMcpServer`, `handleMcpRequest`).
- `/api/health` and `/api/ready` are application health/readiness adapters. They do not prove a given
  supplier binding or Operation is routeable.

### Owner/supplier

- `/claim`, `/claim/form`, and `/claim/success` are the public owner-claim funnel.
- `/owner/supply` and `/owner/supply/$offeringRef` expose source-backed supply setup, publication,
  readiness, testing, maintenance, and supplier economic readback.
- `/owner/offerings`, `/owner/offerings/new`, and `/owner/offerings/$offeringRef` own offering source
  editing and revisions.
- `/owner/status`, `/owner/inquiries`, `/owner/inquiries/$threadId`,
  `/owner/request-problems/$reportRef`, and `/owner/settings` expose bounded owner readbacks/actions.
- Source files use the layout IDs `/_operator/owner/...`; user-visible paths omit the pathless layout
  segment (`src/routes/_operator/owner.*`).
- Owner supply currently reads provider earnings and payout state using owner-derived Business
  authority (`src/modules/capability-supply/supply-funnel.functions.ts`,
  `convex/moneyLedger.ts`).
- Setup/test does not create a paid production invocation or supplier earnings. Its UI cannot serve as
  Qualified Use or payout evidence.

### Administrator and developer

- `/_operator` supplies the Clerk-authenticated shell for owner, admin, developer, and agent-access
  surfaces. Durable membership or ownership still decides each operation
  (`src/routes/_operator.tsx`, `src/lib/operator/route-options.ts`).
- `/admin/claims`, `/admin/audit-events`, `/admin/index-health`, `/admin/inquiries`,
  `/admin/request-problems`, `/admin/runs`, `/admin/runs/$turnId`, and `/admin/search-gaps` expose
  bounded redacted admin readbacks.
- `/developers/discovery` reports discovery route health/freshness and is not an admin projection.
- `/sign-in/$` and `/sign-up/$` are authentication adapters.
- `/engine` is retained only as a redirect to `/`; it is not current product authority
  (`src/routes/engine.tsx`).

### Agent access and OAuth

- `/agent-access` lists/issues/revokes owner-controlled access.
- `/agent-access/authorize` handles pending approval decisions for operation authority.
- `/oauth/register`, `/oauth/device_authorization`, `/oauth/authorize`, and `/oauth/token` implement
  dynamic-client/device/authorization-code token flows through the durable OAuth store.
- `/.well-known/oauth-authorization-server` and `/.well-known/oauth-protected-resource` publish OAuth
  metadata.
- OAuth adapters are bounded by `src/lib/server/agent-access-oauth-api.ts`; durable principals,
  OAuth rows, and policy grants remain the authority.

### Operation APIs

- `POST /api/v1/operations/execute` invokes one exact Operation.
- `GET /api/v1/operations/$invocationRef` reads principal-scoped status.
- `POST /api/v1/operations/$invocationRef/cancel` requests cancellation.
- `POST /api/v1/operations/$invocationRef/reconcile` submits evidence-bound reconciliation.
- Invocation bodies are capped at 256 KiB; cancel/reconcile bodies at 64 KiB
  (`MAX_OPERATION_INVOKE_BODY_BYTES`, `parseRecoveryBody` in
  `src/lib/server/operation-invoke-api.ts`).
- The gateway requires bearer scope `market_operations:invoke`, strict canonical schemas,
  source-write admission, and principal-bound idempotency before source execution.

### Customer Request and Work Tree APIs

- Browser Customer Request routes start at `/api/requests`; agent equivalents start at
  `/api/v1/requests`.
- Both families expose request detail plus `messages`, `options`, `facts`, `confirmation`, `run`,
  `cancellation`, `evidence`, `problems`, problem replies, repeat-permission list/detail/use, and
  withdrawal descendants.
- Browser-only `/api/requests/$requestRef/authorization` records the confirmation authority adapter.
- `/api/v1/requests/schema` publishes the strict agent contract.
- Browser adapters use signed guest identity or authenticated fallback; agent adapters use bearer
  principal/customer scope (`src/lib/server/customer-request-browser-api.ts`,
  `src/lib/server/customer-request-agent-api.ts`).
- `/api/v1/work-tree/$operation` is the agent Work Tree command adapter. Durable Work Tree revisions,
  events, receipts, repeat permissions/uses, and approvals remain source authority.

### Notification, money, storefront, release, and observability APIs

- `/api/notification/novu-dispatch`, `/resend-dispatch`, and `/resend-webhook` are system-authenticated,
  bounded outbox/provider adapters.
- `/api/stripe/webhook` is the bounded Stripe observation adapter. Browser success is never payment
  authority.
- `/api/storefront/import-draft` and `/api/storefront/enrich` submit guarded source-admission work.
- `/api/v1/release` is a release contract adapter.
- `/api/observability/client-error` and `/api/observability/funnel` submit bounded telemetry.
- `/api/$` returns an API 404 rather than SPA HTML (`src/routes/api.$.ts`).

### CLI

- `tools/ae/cli.ts` is a thin external adapter over HTTP/action contracts.
- Current commands cover ask, actions, business, cancel, compare, connect, discover, doctor, enrich,
  eval, import, inspect, inspect-plan, invoke, journey, manifest, policy, recover, request, search,
  and status (`tools/ae/commands/**`).
- CLI output preserves explicit unknown/recovery states and source-local evidence. Local output is not
  durable authority.

## 3. Durable schema inventory

### Root count

The exact current root is:

- **26 spreads** in `convex/schema.ts`;
- **205 tables** across their concrete spread definitions;
- **64 Customer Request tables**: 39 V2 ancestry/execution tables plus 25 route-mandate/run tables;
- **44 routing-kernel tables**, the largest single bundle;
- **13 money tables**, now including `moneyExternalSpendReservations`.

| # | Root bundle/spread | Tables | Durable responsibility | Source |
|---:|---|---:|---|---|
| 1 | `actionInvocationTables` | 3 | controls, attempts, append-only history | `src/modules/action-invocation/internal/convex-schema.ts` |
| 2 | `capabilityOperationInvocationTables` | 1 | outer agent-facing invocation envelope/projection | `src/modules/capability-execution/internal/convex-schema.ts` |
| 3 | `answerThreadTables` | 5 | threads, turns, reservations, tool calls, shares | `src/modules/answer-thread/internal/convex-schema.ts` |
| 4 | `businessTables` | 4 | owners, businesses, contexts, claims | `src/modules/business/internal/schema.ts` |
| 5 | `catalogTables` | 4 | offerings, revisions, access paths, supply snapshots | `src/modules/catalog/internal/schema.ts` |
| 6 | `capabilityContractRegistryTables` | 1 | immutable capability contract documents | `src/modules/capability-contract-registry/internal/convex-schema.ts` |
| 7 | `capabilitySupplyTables` | 9 | publications, offerings, bindings, drafts, provider authority, mappings, call events | `src/modules/capability-supply/internal/convex-schema.ts` |
| 8 | `customerRequestTables` | 64 | V2 ancestry, preparations, grants, attempts, mandates, runs, evidence, problems, x402 attempts | `src/modules/customer-request/internal/convex-schema.ts` |
| 9 | `agentAccessPrincipalTables` | 1 | durable caller principals | `src/modules/agent-access/internal/principal-convex-schema.ts` |
| 10 | `agentAccessOAuthTables` | 2 | OAuth grants and dynamic clients | `src/modules/agent-access/internal/oauth-convex-schema.ts` |
| 11 | `agentAccessPolicyTables` | 1 | generation-bound policy grants | `src/modules/agent-access/internal/convex-schema.ts` |
| 12 | `registryTables` | 4 | projection items/attempts, search documents, index status | `src/modules/registry/internal/schema.ts` |
| 13 | `routingKernelTables` | 0 | unlisted after P6 hashed export; HTTP 410 handlers remain | `src/modules/routing-kernel/internal/convex-schema.ts` |
| 14 | `demandTables` | 3 | demand signals and search-gap records | `src/modules/demand/internal/schema.ts` |
| 15 | `discoveryTables` | 2 | manifests and generation attempts | `src/modules/discovery/internal/schema.ts` |
| 16 | `harnessTables` | 2 | harness sessions and append-only entries | `src/modules/harness/internal/convex-schema.ts` |
| 17 | `inquiryTables` | 12 | inquiry/access/message/read/privacy/governed-send rows | `src/modules/inquiries/internal/convex-schema.ts` |
| 18 | `notificationOutboxTables` | 3 | dispatches, attempts, webhook events | `src/modules/notification-outbox/internal/schema.ts` |
| 19 | `observabilityTables` | 5 | operation keys, audit, controls, funnel, owner activation | `src/modules/observability/internal/schema.ts` |
| 20 | `securityTables` | 6 | disputes, suppression, admin membership/audit, fingerprints, source-write nonces | `src/modules/security/internal/schema.ts` |
| 21 | `moneyTables` | 13 | accounts, ledger, transactions, usage, budgets, external spend, Stripe, payouts | `src/modules/money/internal/convex-schema.ts` |
| 22 | `settingsTables` | 1 | owner notification preferences | `src/modules/settings/internal/schema.ts` |
| 23 | `projectSpineTables` | 3 | project spine, events, quotes | `src/modules/project-spine/internal/convex-schema.ts` |
| 24 | `workTreeTables` | 6 | trees, events, decisions, repeat permission/use, approval | `src/modules/work-tree/internal/convex-schema.ts` |
| 25 | `studyTables` | 2 | studies and append-only study events | `src/modules/study/internal/convex-schema.ts` |
| 26 | `externalRunTables` | 4 | frozen manifests, starts, evidence, gate decisions | `src/modules/external-run/internal/convex-schema.ts` |

### Information-bearing row groups

**Business/catalog.** `owners`, `businesses`, `businessContexts`, and `claims` establish durable public
identity. `businessOfferings`, `businessOfferingRevisions`, `offeringAccessPaths`, and
`businessSupplyProjectionSnapshots` establish versioned supply and bounded public snapshots.

**Capability supply.** `capabilityContractDocuments`, `capabilityPublications`,
`capabilityOfferings`, `capabilityTransportBindings`, and `capabilitySupplySourceDrafts` own admitted
contract/transport material. Provider connections, leases, approvals, registered mappings, and call
events own server-side authority and operational observations.

**Registry/discovery.** Projection items/attempts, search documents, and index status are repairable
projections. Discovery manifests/attempts are generated read contracts. Neither replaces source
business or capability rows.

**Operation execution.** `capabilityOperationInvocations` is the outer principal-owned envelope.
`actionInvocationControls`, `actionInvocationAttempts`, and `actionInvocationHistory` are the canonical
effect-lifecycle authority. Outer completion must agree with canonical terminal evidence.

**Answer.** `answerTurnReservations` binds session, thread scope, request digest, turn ID, and sequence
before model/provider work. `answerTurns` stores frozen terminal material; `answerToolCalls` and
`answerThreadShares` support evidence and revocable sharing.

**Customer Request.** Immutable heads/revisions/commands and route-plan generations preserve ancestry.
Preparation, disclosure, approval, budget, idempotency, spend/data reservation, release, provider
outcome, protocol evidence, reconciliation, and resolution rows preserve effect authority. Mandate,
step reservation, run, cancellation, problem, outbox, and x402-attempt rows preserve business flow.

**Agent access.** Principals, OAuth grants/clients, and policy grants separate caller identity,
one-time OAuth lifecycle, and durable scope/budget policy.

**Money.** Accounts/entries/transactions own AE-internal balances. Usage and credential-budget rows own
charge attribution and budget accounting. `moneyExternalSpendReservations` owns provider-direct spend
reservation, submission, settlement/release/unknown/reversal state without creating an AE supplier
payout for that same x402 transfer.

**Inquiry/notification.** Inquiry rows own customer/owner communication and governed-send evidence.
Notification outbox rows own durable-before-send provider dispatch and webhook observations.

**Governance.** Security, observability, settings, project, Work Tree, study, harness, and external-run
bundles own bounded operational and evidence records. External-run gates cap 12 starts and 64 evidence
records per start (`MAX_EXTERNAL_RUN_STARTS`, `MAX_EXTERNAL_RUN_EVIDENCE_PER_START`).

## 4. Numbered data-flow journeys

### J1 — Buyer ask → Answer reservation → durable/private/share readback

1. `/` validates query/project state and routes an ask to `/t/new`.
2. `/api/answer/turn` requires JSON, a 16 KiB body, session identity, rate admission, and a bounded
   `x-ae-turn-key` (`src/routes/api.answer.turn.ts`).
3. `reserveAnswerTurn` atomically binds reservation key, session, requested thread scope, request
   digest, thread/turn identity, and sequence before streaming (`convex/answerThreads.ts`).
4. A thread admits at most 25 turns; source reads 26 to detect overflow
   (`ANSWER_THREAD_MAX_TURNS`, `ANSWER_THREAD_TURN_COUNT_SNAPSHOT_LIMIT`).
5. The stream is transient. Checkpoint/finalization writes frozen evidence and a terminal status;
   durable readback, not an open SSE frame, confirms completion.
6. Public projection rejects malformed frozen evidence, recursive forbidden replay keys, inconsistent
   Operation candidate/selection/outcome digests, and oversized artifacts
   (`isCurrentFrozenEvidence`, `hasForbiddenReplayKey`).
7. A pending/stopped reservation can be projected as lifecycle truth, but it never manufactures
   prose, artifacts, work log, or tool payload (`buildPublicReservationTurn`).
8. Share issue/revoke persists a revocable grant. `/s/$shareToken` projects only sanitized thread
   state.

### J2 — Catalog → exact Service/Operation projection → inquiry or business tool

1. Source-write-admitted business/catalog writes create or revise durable business, offering, and
   access-path rows.
2. Projection rebuild creates a bounded `BusinessSupplyProjection`; public reads hide unpublished,
   suppressed, stale, or missing source.
3. Service projection enriches an endpoint with Operation semantics only for one exact catalog-origin
   join across offering revision, access path, URL, method, and source hashes
   (`src/modules/registry/internal/services-api-projection.ts`).
4. Operation search/detail/compare/inspect-plan read current supply and recompute
   `operation:v1:<64hex>` identity (`createPublicOperationRef`).
5. `/$slug/inquiry` re-reads exact target admission, signs governed-send intent, and persists inquiry,
   access, message, receipt, and notification-outbox rows before provider dispatch.
6. `/$slug/tools/$toolId` exposes a registered business tool; preparation remains a proposal until an
   enforcing authority seam accepts it.
7. Customer/owner readbacks expose delivery/reply/status evidence, not private recipient credentials or
   a claim that the business accepted or completed the request.

### J3 — Owner claim/supply → admission/import → readiness → public projection

1. Claim and offering editors persist owner/business/revision state with expected version and
   idempotent operation keys.
2. Owner supply reads source drafts and runs document/capability preflight, admission, testing,
   readiness, maintenance, withdrawal, and republish against exact owner/business/offering revision.
3. OpenAPI, MCP, and x402 importers bound source bytes, depth, nodes, schemas, transport, and payment
   configuration before creating prepared publication material.
4. Commit persists provenance, contract document, publication, offering, binding, and replay identity
   only after deterministic validation.
5. Curated provider bootstrap uses the same generic contract→offering→binding→publication path. In
   production it filters demo/development-keyed publications and refuses source drift as migration
   required (`convex/curatedProviders.ts`, `seed`).
6. Readiness is a separate guarded observation against exact revision, endpoint, credential state, and
   target. Bootstrap never fabricates readiness.
7. Public projection fails closed on stale revision, invalid binding, expired readiness, source
   capacity, ambiguous catalog origin, or insufficient evidence.

### J4 — Operation discovery → grant/OAuth → invocation → effect/recovery/money

1. Anonymous discovery returns bounded current descriptors but no execution authority.
2. OAuth device/PKCE consent establishes a durable principal and policy grant before a one-time caller
   key is returned. Supplier credentials stay server-side.
3. The operation gateway authenticates bearer scope, parses strict input, computes principal-bound
   operation/idempotency material, and obtains signed source-write admission.
4. `capabilityOperationInvocations.reserve` replays exact identity and conflicts on changed principal,
   grant, operation, input, request, or persisted publication material.
5. Reservation enforces grant lifecycle/generation/expiry, per-credential rate limits, and maximum
   concurrent pending/reconciliation rows before insert.
6. Authority mode can permit a free read, require owner approval, or consume standing grant authority.
   Approval re-reads current publication and exact persisted input before dispatch.
7. Workpool dispatch re-reads principal/grant/current publication/readiness/provider authority and
   opens the canonical Action Invocation claim.
8. `authorizeInvocationCharge` now derives billing authority from persisted invocation, publication,
   offering, grant, principal, canonical attempt, and exact price material; it is an internal source
   mutation, not caller-supplied billing identity (`convex/moneyLedger.ts`).
9. The worker persists release fencing before guarded HTTP/MCP/x402 effect. A provider response is
   normalized and output-schema-validated before terminal delivery.
10. AE-internal billing settles through the exact ledger. Provider-direct x402 reserves external spend,
    records possible submission before send, verifies settlement evidence, and avoids a duplicate AE
    provider payout lane.
11. Status is principal/owner scoped. Cancellation is safe only before release; uncertain release
    becomes `reconciliation_required`.
12. Reconciliation binds invocation, attempt, effect generation, input, transport, payment, provider,
    and evidence identity and never creates a fresh external effect.

### J5 — Customer Request → RoutePlan/mandate → Workpool transport → recovery

1. Browser submission uses signed guest identity; agent submission uses bearer principal/customer
   scope. Both enter strict contracts with command keys and expected revisions.
2. Evaluation/compiler records facts, criteria, candidates, completion requirements, proposal
   provenance, registry snapshot digest, and immutable RoutePlan generation.
3. Interpretation is proposal-only. Commit revalidates current registered supply and source-owned
   operation admission.
4. Confirmation issues explicit or bounded standing authority. `compileRouteMandate` binds principal,
   request revision, generation, route, spend, data/effect/evidence scope, expiry, and fallback policy.
5. Step admission reserves spend/data/command identity before dispatch.
6. Shared Workpool owns 32 parallel route slots and retries idempotent actions at most three attempts
   with 1-second exponential backoff (`customerRequestRouteWorkpool`).
7. The transport worker opens dispatch, checks cancellation/expiry/target/credential/readiness fences,
   and signs one HTTP/MCP/x402 call.
8. Route transport records request/response/output/evidence digests and typed release/settlement state.
9. `outcome_unknown` is reconcile-only. Automatic retry cannot reinterpret possibly released work as
   not released.
10. Browser and agent projections share the same durable aggregate but expose different authentication
    and navigation adapters.

### J6 — Agent access/OAuth and Work Tree approval lifecycle

1. Public metadata and registration are bounded adapters.
2. Device or authorization-code/PKCE consent creates durable OAuth state and one-time delivery material.
3. Policy grant binds principal, application, environment, credential, generation, scopes, Operation
   access, spend, rate, concurrency, and expiry.
4. Revocation persists grant/principal lifecycle before external credential cleanup.
5. Work Tree approval issuance derives owner from auth, checks owner-bound credential, exact tree
   generation/revision, decision-node proposal digest, amount, expiry, and idempotency
   (`convex/workTreeApprovals.ts`).
6. Approval consumption checks the same binding and atomically marks the row consumed with receipt ID.
7. Owner readbacks omit caller keys and supplier credentials. Local E2E bypass is explicitly not
   production authorization.

### J7 — Inquiry/notification/Stripe/x402 observations

1. Inquiry submission persists governed-send receipt and notification dispatch source rows before
   provider send.
2. Novu/Resend dispatch resolves recipients server-side, records attempts, and exposes only bounded
   provider IDs, hashes, status, and redacted failure.
3. Resend and Stripe webhooks verify bounded raw events, deduplicate durable event identity, and record
   observations before projecting status.
4. Internal topup/connect/payout paths preserve pending, succeeded, failed, reversed, and unknown
   states; browser navigation cannot settle them.
5. x402 challenge and authorization are bound to target, exact amount, network, asset, `payTo`,
   attempt, effect generation, and operation identity.
6. `verifyExactEvmX402Settlement` additionally requires a successful matching transaction, at least
   12 confirmations, and an exact ERC-20 `Transfer` from payer to `payTo`
   (`src/modules/capability-supply/internal/x402-settlement-verifier.ts`).
7. Settlement evidence does not prove output schema validity or Qualified Use.

### J8 — Operator/admin/developer, public discovery, and external proof gates

1. The operator shell authenticates Clerk; each source query/mutation still enforces ownership or the
   admin action matrix.
2. Admin readbacks cap source rows, redact identity/content, and expose truncation or bounded windows.
3. Developer discovery renders route health, freshness, supported/degraded state, and repair action.
4. Public UCP, llms, SKILL, catalog, Services, and Operation descriptors derive from current source
   projections and route/action registries.
5. External-run manifests are frozen, starts/evidence are capped and digest-bound, and final gate
   decisions are durable (`convex/externalRuns.ts`).
6. A release or external-run report proves only the evidence classes actually recorded. It cannot
   promote fixture/local/source integration into hosted, independent-provider, customer, or settled
   payment proof.

## 5. Authority, provenance, redaction, idempotency, and evidence invariants

- **Registered root:** only tables spread through `convex/schema.ts` are application durable authority.
- **Public Convex exposure:** sensitive helpers use `internalQuery`, `internalMutation`, and
  `internalAction`; public functions remain explicit adapters.
- **Identity and revision:** Operation refs derive from operation ID, publication ref/revision, and
  contract ref (`createPublicOperationRef`). Admitted material additionally binds catalog and binding
  lineage, readiness, commercial, and effect digests.
- **Exact catalog origin:** no model result, URL similarity, or ambiguous offering creates an executable
  Service endpoint.
- **Authority before effect:** authentication, ownership/admin membership or principal/grant, source
  write, expected revision, command digest, and consequence authority precede every consequential
  mutation.
- **Signed source writes:** `source-write:v2` binds scope, key ID, operation key, correlation ID,
  command digest, request method/origin/path/query/body digest, issue time, nonce, and signature
  (`requireSourceWrite`).
- **Nonce replay:** accepted source writes consume `sourceWriteNonces`; cleanup deletes at most 200 per
  batch and reschedules, capped at 500 (`SOURCE_WRITE_NONCE_CLEANUP_BATCH_SIZE`,
  `SOURCE_WRITE_NONCE_CLEANUP_MAX_BATCH_SIZE`).
- **Model non-authority:** a model may propose interpretation or selection. Deterministic schemas,
  current source descriptors, compiler checks, and durable command seams decide acceptance.
- **Provider non-authority:** HTTP success, MCP output, x402 headers, readiness probes, Stripe events,
  and notification webhooks are observations until validated and durably transitioned.
- **Redaction:** public Answer projection recursively rejects token/secret/credential-shaped replay
  keys. Public catalog, operation, inquiry, notification, OAuth, and admin projections omit private
  source material.
- **Credential locality:** provider credentials and x402 signing material resolve server-side from
  opaque refs. Transport output is rejected/unknown if it contains outbound sensitive values.
- **Idempotency:** Answer reservation, publication, Customer Request, route, Operation, canonical
  Action Invocation, money, external spend, notification, OAuth, and payout commands bind stable
  identity plus canonical material digest.
- **Replay conflict:** exact replay returns prior durable result; same identity with changed material
  refuses. Cache/TTL dedupe is never the authority.
- **Release fencing:** canonical attempts bind attempt ref, effect generation, lease owner/expiry,
  release state, and terminal/reconciliation evidence.
- **Possibly released:** `possibly_released`, unknown submission, unknown settlement, and
  `reconciliation_required` are never safe-to-retry completion states.
- **Two money lanes:** AE-internal billing owns ledger debit/provider accrual/rake. Provider-direct x402
  owns external-spend reservation and direct settlement evidence. One invocation must not pay through
  both lanes.
- **Exact money:** currency, exponent, units, price digest, account version, transaction identity,
  credential-budget generation, provider accrual, and rake are checked transactionally.
- **x402 ordering:** authorization is prepared, durable possible submission is recorded, payment is
  sent, and settlement observation is persisted. Process loss restores signing material only through
  an opaque custody digest.
- **Completion:** Operation completion requires canonical terminal state and contract-valid output.
  Payment settlement alone is not delivery; delivery alone is not a payout.
- **HTTP boundary:** concrete handlers bound body, method, schema, auth, and rate; failures use RFC 9457
  `application/problem+json` (`src/lib/server/problem.ts`, `src/lib/server/method-guard.ts`).
- **MCP schema:** MCP projects the canonical action input/output schemas, including strict top-level
  output unions; it does not own a parallel tool contract.

## 6. Resource-first USE inventory

USE is applied after naming the resource. Utilization is used/busy capacity over a stated cap and
window. Saturation is waiting caused by unavailable capacity. Errors include refused, failed,
recovered, and retried work. A source-enforced cap is not an aggregate measurement.

| Resource | Capacity/bound next to enforcing symbol | Utilization observation | Saturation observation | Errors | Authority/observation seam |
|---|---|---|---|---|---|
| Answer turn storage | 25 turns/thread; read 26 for overflow (`ANSWER_THREAD_MAX_TURNS`) | per-thread rows; windowed turn utilization `?` | `thread_turn_limit`; wait/queue `?` | reservation, digest, identity, finalization failures | `convex/answerThreads.ts` |
| Answer checkpoint | 256 KiB; step ≤16 (`MAX_ANSWER_TURN_CHECKPOINT_BYTES`, `ANSWER_TURN_CHECKPOINT_MAX_STEP`) | per-turn checkpoint bytes/step; aggregate `?` | exhausted checkpoint/step cap | invalid/oversized/stale checkpoint | Answer thread checkpoint/finalization |
| Answer model/tool loop | Prompt/model/tool caps live in companion map | request-level usage; aggregate tokens/cost `?` | model/provider queue `?` | bounded taxonomy; aggregate rate `?` | [PROMPT-DATA-FLOW.md](PROMPT-DATA-FLOW.md) |
| Convex transactions | platform transaction ceilings; application reads use bounded `take`/pagination | live bytes/docs/queries may exist platform-side; repo aggregate `?` | platform queue/limit `?` | capacity/transaction errors | each module source seam |
| Operation search | source 256, query 200 chars, page 20, cursor 512, compare/inspect 4 | returned count/page | source-capacity refusal; DB queue `?` | invalid cursor/ref/unavailable/schema | Operation projection |
| Catalog source | 100 offerings/business; 20 access paths/offering (`MAX_OFFERINGS_PER_BUSINESS`, `MAX_ACCESS_PATHS_PER_OFFERING`) | per-business row counts | explicit overflow; rebuild queue `?` | stale revision/lineage/projection | catalog source/projection |
| Eligible capability supply | max 256 (`MAX_ELIGIBLE_SUPPLY`) | rows examined per qualification | source-capacity refusal | binding/readiness/evidence refusal | capability supply graph |
| Agent grant rate | policy-bound minute/hour rates; dynamic ceilings | durable rate admissions | 429 + Retry-After | stale grant/scope/rate refusal | agent access + rate limiter |
| Agent invocation concurrency | grant `maximumConcurrentInvocations` across pending + reconciliation rows | current bounded rows per credential | `concurrency_limited` | grant/rate/concurrency refusal | `capabilityOperationInvocations.reserve` |
| Shared route Workpool | 32 parallel; 3 attempts; 1 s base-2 backoff (`customerRequestRouteWorkpool`) | work IDs/states; active-slot window `?` | queue depth/age `?` | completion/retry/transport failures | Workpool component + source callbacks |
| Readiness scheduler | one-minute scheduling; 20 due probes/run; healthy 5 min/unhealthy 1 min | per-publication observed/valid times | due rows beyond batch wait; queue age `?` | typed probe failures | readiness source rows |
| Provider HTTP transport | timeout 100–120,000 ms; response 512 KiB (`requestTimeout`, `MAX_RESPONSE_BYTES`) | per-attempt bytes/status/timing where recorded | provider/client queue `?` | network/status/content/schema/size | route transport observation |
| Provider MCP transport | 32 pages; 4,096 tools; no reconnect retries (`MCP_TOOL_LIST_PAGE_LIMIT`, `MCP_TOOL_LIST_TOOL_LIMIT`, `maxRetries: 0`) | pages/tools per lookup | provider queue `?` | initialize/list/cursor/tool/result errors | MCP SDK transport observation |
| MCP ingress | 64 KiB body (`MAX_MCP_REQUEST_BODY_BYTES`) | per-request admission; aggregate `?` | server in-flight `?` | 413/invalid JSON-RPC/auth/tool errors | `handleMcpRequest` |
| Operation HTTP ingress | invoke 256 KiB; recovery 64 KiB | per-request body/admission; aggregate `?` | server in-flight `?` | schema/auth/source/provider errors | operation invoke API |
| Source-write nonce store | 200 cleanup batch, max 500 | durable nonce rows; aggregate age/volume `?` | cleanup backlog `?` | replay/signature/age/origin mismatch | `sourceWriteNonces` |
| Customer Request graph/plan | candidate/route/step/fact schema caps; immutable generations | per-request counts | compiler overflow; planning queue `?` | stale context/mandate/route/unknown | CR V2 rows |
| Route x402 attempts | one row per attempt/effect identity; challenge accepts max 16; timeout max 86,400 s | reserved/possibly-submitted/observed rows | signer/facilitator/chain queue `?` | mismatch/unverified/unknown | CR x402 + money external spend |
| External spend budget | grant daily/monthly/per-invocation/concurrency limits | reserved/settled/released amounts | budget concurrency exhaustion | identity/state/live-gate/reconcile refusal | `moneyExternalSpendReservations` |
| Internal money ledger | exact units/exponent; OCC account version | accounts, entries, transactions, usage | provider/Stripe queue `?` | insufficient credit/conflict/unknown | money kernel |
| x402 settlement verifier | exact EVM, ≥12 confirmations (`verifyExactEvmX402Settlement`) | per-receipt confirmation count | chain finality wait; aggregate age `?` | reverted/mismatch/unverified | x402 verifier + durable observation |
| Notification outbox | bounded body 256 KiB; per-dispatch attempt state | per-dispatch attempts/status | queue depth/age `?` | signature/provider/duplicate/send unknown | notification outbox |
| Inquiry governed send | rate-limited exact target; bounded messages/readback | per-thread activity | send queue `?` | abuse/target/provider/refusal | inquiry + outbox |
| Admin readbacks | typically bounded source pages, often 100 | returned rows/truncation | read queue `?` | auth/source/projection errors | security/admin readbacks |
| External-run proof | 12 starts; 64 evidence/start; 768 total (`MAX_EXTERNAL_RUN_*`) | starts/evidence against caps | cohort/evidence-full refusal | integrity/class/gate failures | external-run rows |
| Browser/stream client | no global browser fetch semaphore found | local in-flight state; aggregate `?` | client backpressure `?` | abort/disconnect/malformed frame | UI state + durable Answer readback |

### USE interpretation and unknown metrics

- A 429 is an admission error and can be a saturation signal, but it does not prove measured
  utilization.
- A source `take(cap + 1)` overflow proves one bound was reached, not that the resource is normally
  busy.
- `outcome_unknown` describes effect uncertainty, not utilization or health.
- Per-request rows expose IDs, counts, attempts, state, digests, `observedAt`, `validUntil`, and retry
  status. They generally do not expose windowed utilization/saturation/error rates.
- Unknown aggregate seams remain: Convex transaction consumption; Workpool active slots and queue
  depth/age; readiness/provider aggregate latency; model token/cost totals; browser/HTTP in-flight
  concurrency; external-spend reconciliation age; and notification queue saturation.

## 7. Proof ceilings and reachable gaps

### Proof ceilings

- **Catalog/discovery:** proves a bounded current source projection, declared provenance, price,
  contract, and availability state at read time. It does not prove provider uptime or business
  acceptance.
- **Readiness:** proves one guarded observation against a revision/target/credential at
  `observedAt`/`validUntil`. It is not an SLA.
- **Answer:** proves only durable frozen evidence and sanitized terminal/error projection. Model prose
  and open streams cannot declare an external effect complete.
- **Inquiry:** proves AE submission, governed target, durable message/dispatch lineage, and recorded
  reply/delivery status. It does not prove booking, fulfilment, or compensation.
- **Operation:** `completed` proves canonical terminal acceptance of matching contract-valid output.
  Pending, possibly released, unknown payment, and reconciliation-required states remain incomplete.
- **Internal money:** proves AE's exact ledger transition and recorded provider accrual/rake. Accrual is
  not Stripe transfer or bank payout.
- **x402:** proves only the bound external-spend and settlement observation accepted by the verifier.
  It does not prove output-schema-valid delivery or Qualified Use.
- **Stripe:** proves the recorded verified provider event/transfer observation, not browser success or
  downstream bank payout.
- **Owner/admin:** proves an authorized bounded redacted view, not external causality or adjudication.
- **External run:** proves only the frozen manifest, admitted evidence classes, and deterministic gate
  over those rows. Missing hosted/provider/customer/payment evidence stays missing.

### Reachable gaps in the current source

1. **Qualified Use is not durable yet.** ADR-034 defines an immutable Qualified Use receipt, but no
   `qualifiedUse` table or source writer exists. `moneyUsageEvents` and `capabilityCallEvents` are not
   equivalent because payment, call, or output observation alone does not prove the full authorized,
   production, contract-valid delivery chain
   (`.planning/adr/ADR-034-supplier-usage-qualified-use-and-payout-spine.md`).
2. **Automatic daily supplier settlement remains policy, not an implemented authority spine.**
   Existing payout rows, Connect adapters, provider earnings readback, and transfer recovery are real
   source seams, but no source-owned daily full-balance settlement runner or immutable allocation from
   Qualified Uses is present.
3. **Live-money/legal gate remains fail-closed.** `evaluateLiveMoneyGate` can refuse production money
   while operator/legal decisions are open. Source integration is not proof that jurisdiction,
   reserve, tax, merchant-of-record, or emergency-stop policy is configured.
4. **Provider-direct x402 is source-integrated but not hosted-certified here.** External spend,
   durable possible-submission ordering, exact EVM verification, and reconciliation paths exist. The
   repository alone does not prove funded custody, facilitator/chain reachability, a settled real
   transfer, or supplier delivery.
5. **Cancellation still has a narrow outer/canonical race surface.** Outer cancellation can mark a
   pending invocation cancelled when no canonical control is yet visible, while an already enqueued
   worker may be opening its claim. Canonical claim/release state remains the safety authority, not the
   outer label (`cancelBeforeClaim`, `claimDispatch`).
6. **Bounded readbacks are not complete history.** Provider earnings can report `truncated`; admin,
   inquiry, catalog, and Operation surfaces use caps/cursors. Consumers must honor `truncated`,
   `continueCursor`, `nextCursor`, or `hasMore`.
7. **Projection/readiness repair has no source-proven latency SLO.** Current behavior truthfully fails
   closed on pending/stale/expired/unsupported state, but the schema does not prove repair within a
   target interval.
8. **Aggregate USE telemetry is absent.** Per-request evidence exists; repository seams do not expose
   the aggregate utilization, saturation, and error windows marked `?` in §6.
9. **Curated supply is configuration- and environment-sensitive.** Production bootstrap excludes
   demo/development-keyed publications and returns source drift as migration required. A seeded row is
   not independent-provider or live-route proof.
10. **Hosted completion remains deployment evidence.** OAuth keys, provider credentials, Stripe,
    Novu/Resend, MCP, and public DNS guards are source adapters. Production claims require configured
    deployment plus matching durable observations.

## 8. Primary-source register

Repository-relative sources authoritative for this map:

- Root schema: `convex/schema.ts`.
- Convex guidelines governing interpretation: `convex/_generated/ai/guidelines.md`.
- Answer durability: `convex/answerThreads.ts`,
  `src/modules/answer-thread/public.ts`,
  `src/modules/answer-thread/internal/public-projection.ts`.
- Capability supply/readiness: `convex/capabilitySupply.ts`,
  `convex/capabilitySupplyReadiness.ts`,
  `convex/capabilitySupplyProjection.ts`,
  `convex/capabilitySupplyOperations.ts`,
  `src/modules/capability-supply/public.ts`,
  `src/modules/capability-supply/operation-projection.ts`.
- Operation invocation/recovery: `convex/capabilityOperationInvocations.ts`,
  `convex/capabilityOperationInvocationWorker.ts`,
  `src/modules/capability-execution/public.ts`,
  `src/lib/server/operation-invoke-api.ts`.
- Canonical effect lifecycle: `src/modules/action-invocation/canonical-claim.ts`,
  `src/modules/action-invocation/durable.ts`,
  `src/modules/action-invocation/operation-public.ts`.
- Customer Request: `src/modules/customer-request/public.ts`,
  `src/modules/customer-request/internal/convex-v2-schema.ts`,
  `src/modules/customer-request/internal/route-mandate-convex-schema.ts`,
  `convex/customerRequestApplication.ts`,
  `convex/customerRequestRouteTransportWorker.ts`.
- Money and settlement: `src/modules/money/public.ts`,
  `src/modules/money/internal/convex-schema.ts`,
  `src/modules/money/internal/external-spend.ts`,
  `convex/moneyLedger.ts`.
- x402 transport/verification: `src/modules/capability-supply/route-transport-runtime.ts`,
  `src/modules/capability-supply/internal/x402-payment-signer.ts`,
  `src/modules/capability-supply/internal/x402-settlement-verifier.ts`.
- Registry/catalog/discovery: `src/modules/registry/public.ts`,
  `src/modules/registry/operation-action-contracts.ts`,
  `src/modules/registry/internal/services-api-projection.ts`,
  `src/modules/catalog/public.ts`,
  `src/modules/discovery/public.ts`.
- Curated supply: `convex/curatedProviders.ts`,
  `src/modules/capability-supply/curated-provider-publications.ts`.
- Agent access/OAuth: `src/modules/agent-access/public.ts`,
  `src/modules/agent-access/agent-access.ts`,
  `src/modules/agent-access/policy.ts`,
  `src/lib/server/agent-access-oauth-api.ts`.
- Inquiries/notifications: `convex/inquiries.ts`, `convex/notificationOutbox.ts`,
  `src/lib/server/notification-dispatch.ts`.
- Source-write/security: `convex/sourceWriteAdmission.ts`, `convex/security.ts`,
  `src/modules/security/source-write-admission.ts`.
- Work Tree and external proof: `convex/workTreeApprovals.ts`, `convex/externalRuns.ts`.
- MCP: `src/lib/server/mcp-api.ts`, `src/lib/mcp-protocol.ts`,
  `src/modules/actions/index.ts`.
- Route/adapter inventory: `src/routes/**`, `src/lib/server/**`, `tools/ae/**`.
- Supplier-use decision boundary:
  `.planning/adr/ADR-034-supplier-usage-qualified-use-and-payout-spine.md`.
- Prompt/model/tool/eval boundary: [PROMPT-DATA-FLOW.md](PROMPT-DATA-FLOW.md).
- External method: Brendan Gregg, “The USE Method,”
  <https://www.brendangregg.com/usemethod.html>.

_Refreshed against the current dirty tree on 2026-08-15. Counts are current-source counts. This map
does not infer hosted readiness, external effects, settlement, payout, or SLO health from source shape._
