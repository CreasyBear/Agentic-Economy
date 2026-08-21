---
last_mapped_commit: abcc85a8aba390f337f35314c7f94063a73af204
---
<!-- refreshed: 2026-08-21 -->
# Architecture

**Analysis Date:** 2026-08-21

> Mapped against the **current working tree**, not git HEAD. HEAD is `abcc85a8` (2026-08-20); the working tree carries a large uncommitted refactor: big Convex modules were split into focused sibling files (money charge/payout/ledger family, `capabilityOperation*` invoke pipeline, `capabilitySupply*` publish funnel, `answerThreads*`, `harnessSessions*`, `security*`), publication importers/readiness probes/route transports were split under `src/modules/capability-supply/internal/`, and the Customer Request / WorkTree / Study / inquiry / demand / project-spine families were **deleted** (Convex files, `src/lib/server/customer-request-*`, `src/modules/demand/`, `src/components/ae/inquiries/`, `src/routes/api*.requests.*`, `/_operator` inquiry/admin screens). Deleted families survive only as 410 tombstones and retirement tests.

## System Overview

Agentic Economy is a **market kernel** for admitted third-party Market Operations. Convex durable rows plus module seams own identity, admission, authority, dispatch, budgets, money, settlement, and evidence. HTTP, MCP, CLI, and the first-party Answer chat are adapters. Consuming agents own planning; the kernel owns exactly-once invocation, money, and evidence.

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│                    Consuming agents / humans                                  │
│  Browser UI `src/components/ae/`  ·  CLI `tools/ae/`  ·  MCP clients          │
│  Third-party runtimes via HTTP `/api/v1/*` and OAuth `src/routes/oauth.*`     │
└───────────┬────────────────────────┬────────────────────────┬────────────────┘
            │                        │                        │
            ▼                        ▼                        ▼
┌─────────────────────┐  ┌──────────────────────┐  ┌───────────────────────────┐
│  Chat / Answer      │  │  MCP host            │  │  Market HTTP + CLI        │
│  `src/routes/       │  │  `src/routes/mcp.ts` │  │  `/api/v1/market-         │
│   api.answer.*`     │  │  `src/lib/server/    │  │   operations/*`           │
│  `src/modules/      │  │   mcp-api.ts`        │  │  `POST /api/v1/           │
│   answer-thread/`   │  │                      │  │   operations/call`        │
│                     │  │                      │  │  `tools/ae/cli.ts`        │
└───────────┬─────────┘  └──────────┬───────────┘  └─────────────┬─────────────┘
            │                       │                            │
            └───────────────────────┴────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  Action plane  `src/modules/actions/index.ts` + `src/modules/common/action.ts`│
│  One `defineAction` contract fans out to http / mcp / cli / answerThread / ui │
└──────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  Market kernel (domain modules under `src/modules/`)                          │
│  capability-contract · capability-contract-registry · capability-supply ·     │
│  registry projection · capability-execution · action-invocation · money ·     │
│  agent-access · network-guard · harness · model-gateway · security            │
└──────────────────────────────────────────────────────────────────────────────┘
                                    │
                     ┌──────────────┴──────────────┐
                     ▼                             ▼
┌──────────────────────────────────┐  ┌────────────────────────────────────────┐
│  App-server adapters             │  │  Convex durable source                 │
│  `src/lib/server/*`              │  │  `convex/*.ts` + `convex/schema.ts`    │
│  ConvexHttpClient, source-write  │  │  51 listed tables; mutations/queries   │
│  rate-limit, RFC 9457 problems   │  │  Workpool `convex/marketDispatchWorkpool.ts` │
└──────────────────────────────────┘  └──────────────────┬─────────────────────┘
                                                         │
                                                         ▼
                                          Guarded provider HTTP / x402 / Stripe
                                          `invocation-worker` Node action + facilitator
                                          discovery cron + Stripe/Novu/Resend/OpenRouter
```

Prompt/model/tool/eval internals: [PROMPT-DATA-FLOW.md](PROMPT-DATA-FLOW.md). Schema/persona/route maps: [IA-DATA-FLOW.md](IA-DATA-FLOW.md). This document does not duplicate those maps.

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| TanStack Start host | File routes, middleware, Nitro Node deploy | `src/start.ts`, `src/router.tsx`, `vite.config.ts` |
| Route adapters | HTTP/UI admission only; no Convex schema, no kernel policy | `src/routes/**` |
| Action registry | Explicit machine-operation contracts; unique action ids (14) | `src/modules/actions/index.ts` |
| Action contract | Shared `defineAction` type, surfaces, source-write, agent descriptors | `src/modules/common/action.ts` |
| Capability contract | Typed v2 schemas, effects, data-use, customer annotations | `src/modules/capability-contract/public.ts` |
| Contract registry | Durable encoded contract documents | `src/modules/capability-contract-registry/public.ts` |
| Capability supply | Admit / publish / bind / eligibility / readiness / Operation projection; publication importers (OpenAPI, MCP, x402, x402-bazaar, agent-plugin), readiness probes (http-json, mcp, x402), route transports (http-json, mcp, x402, invoke, cancel, observation) | `src/modules/capability-supply/public.ts`, `src/modules/capability-supply/internal/` |
| Facilitator discovery | x402 facilitator (payai + CDP) catalogue ingest → bootstrap publications | `convex/facilitatorDiscoveryAction.ts`, `convex/facilitatorDiscovery.ts`, `src/modules/capability-supply/internal/facilitator-discovery-client.ts` |
| Registry projection | Search / detail / compare / inspect-plan + business/service DTOs | `src/modules/registry/public.ts` |
| Operation market paths | Canonical discovery HTTP paths | `src/modules/registry/operation-paths.ts` |
| Capability execution | Keyless `operation.execute` + paid `operation.invoke` + recovery | `src/modules/capability-execution/` |
| Invoke route contract | `/api/v1/operations/call` and lifecycle siblings | `src/modules/capability-execution/operation-invoke-entry.ts` |
| Invocation worker | `"use node"` guarded provider HTTP / x402 prepare→release, charge, lease, recover, brokered x402 | `convex/capabilityOperationInvocationWorker.ts`, `src/modules/capability-execution/invocation-worker/` |
| Action invocation | Exactly-once claim, lease, release fence, reconcile; dynamic-published adapters | `src/modules/action-invocation/` |
| Money | Exact ledger, budgets, x402 spend, Stripe, credit topup, payout transfers, Qualified Use payouts | `src/modules/money/public.ts`, `src/modules/money/internal/`, `convex/money*.ts` |
| Agent access | Bearer principals, scopes, OAuth device flow, authority modes, sandbox/production policy | `src/modules/agent-access/` |
| Network guard | SSRF-safe DNS/IP allowlist for outbound HTTP | `src/modules/network-guard/public.ts` |
| Harness | Bounded run loop, emission guard, session journal | `src/modules/harness/run-loop.ts`, `src/modules/harness/emission-guard.ts` |
| Model gateway | Single OpenRouter / AI SDK seam | `src/modules/model-gateway/public.ts` |
| Answer | Preflight, tool-use agent, gate, grounding, presentation | `src/modules/answer/public.ts`, `src/modules/answer/server.ts` |
| Answer thread | Reservation, lease, checkpoint, finalization, public projection | `src/modules/answer-thread/` |
| Catalog / business | Public listings, offerings, claim, owner publish | `src/modules/catalog/public.ts`, `src/modules/business/public.ts` |
| Discovery / SEO | Site manifest, llms.txt, UCP, developer discovery, public JSON-LD | `src/modules/discovery/public.ts`, `src/modules/seo/public.ts` |
| Product frontier | 410/403 for retired family doors; empty quarantine prefixes | `src/modules/product-frontier/quarantine-write-admission.ts` |
| Convex functions | Durable identity, admission, Workpool dispatch | `convex/` |
| MCP adapter | Streamable HTTP MCP over `listMcpActions()` | `src/lib/server/mcp-api.ts` |
| CLI adapter | Cold-path HTTP client over the same contracts | `tools/ae/cli.ts` |
| Chat UI | Stream frames + durable thread readback | `src/components/ae/chat/` |
| Governed action | Canonical bytes + digest for two-step commits | `src/modules/governed-action/public.ts` |
| Business tools | Listing-bound descriptors; HTTP handlers return 410 | `src/modules/business-tools/public.ts`, `src/lib/server/business-tool-api.ts` |
| Notification outbox | Novu/Resend dispatch + webhook ingest (tables unlisted) | `src/modules/notification-outbox/public.ts`, `src/lib/server/notification-provider-*.ts` |
| Stripe host adapters | Checkout evidence, connect evidence, idempotency, money webhook, transfer evidence | `src/lib/server/stripe-*.ts` |
| Sandbox supply | Reference publications + six sandbox workflow cohorts for local seed | `src/modules/sandbox-supply/public.ts`, `src/modules/sandbox-supply/workflow-cohorts.ts` |
| Dev seed | Curated provider publications + fixtures | `src/modules/dev/public.ts`, `convex/devSeed.ts`, `convex/devSeedStore.ts` |
| Imported commitment | Claim observation of external commitments | `src/modules/imported-commitment/` |
| External run | Frozen evidence/manifest contracts | `src/modules/external-run/public.ts` |

**Market kernel (load-bearing) under `src/modules/`:**
- `capability-contract` — JSON Schema contracts, effects, data-use; format constant `ae.capability-contract:v2` (`src/modules/capability-contract/internal/define-contract.ts`).
- `capability-contract-registry` — durable encoded documents.
- `capability-supply` — admit/publish/bind/eligibility/readiness/operation projection; `internal/{offering,binding,eligibility,publication,quarantine,operation-ledger,graph,shared,provider-connection,supply-funnel}`; publication importers (`publication-importer-{openapi,mcp,x402,x402-bazaar,agent-plugin}.ts`), readiness probes (`readiness-probe-{http,mcp,x402}.ts`), route transports (`route-transport-{http-json,mcp,x402,invoke,cancel,observation}.ts`), operation projection wire split (`operation-projection-wire-*.ts`), x402 payment signing (`x402-payment-signer.ts`, `cdp-x402-payment-signer.ts`); Node extras in `server.ts`.
- `registry` — public search documents, business/service DTOs, `operations.actions.ts`, `registry.actions.ts`, `operation-paths.ts`.
- `capability-execution` — keyless `operation.execute` (`operation-execute.functions.ts` + `operation-execute.server.ts` + `operation-execute-mcp.actions.ts`) and paid `operation.invoke` (`operation-invoke.ts` + `operation-invoke-admit.ts` + `operation-invoke.actions.ts` + `operation-invoke-recover.ts` + `operation-recovery.actions.ts`). `index.ts` / `public.ts` re-export the keyless execute seam; invoke is imported from `operation-invoke.ts` / `operation-invoke-entry.ts`. Node worker internals in `invocation-worker/{runPreparation,runRelease,charge,lease,recover,brokeredX402,x402Authorization,x402Route,x402Settlement}.ts`.
- `action-invocation` — claim, fenced execution, x402 reconciliation evidence; dynamic-published adapter split (`dynamic-published-adapter-{commands,snapshot,transact}.ts`).
- `money` — exact amounts, ledger, budgets, live-money gate, Stripe in `server.ts`; internal ports (`internal/ports.ts`), payout transfer command/http, credit topup http, charge contract, account refs.
- `agent-access` — principals, OAuth (`oauth-state.ts`), policy grants, `production-policy.ts` / `sandbox-policy.ts`.
- `network-guard` — public HTTP target checks.
- `actions` + `common/action.ts` — registry and `defineAction`.
- `harness` — `run-loop.ts`, `emission-guard.ts`, session journal.
- `model-gateway` — `openRouterModel`.
- `security` — CSRF/source-write, admin authority, disputes; Convex split in `convex/securityShared.ts`, `securityAdminMembership.ts`, `securityAdminReadbacks.ts`, `securityRemovalDisputes.ts`.
- `observability` — funnel, audit, operation keys.
- `governed-action` — JCS canonicalization.

**Distribution / catalog:** `catalog`, `business`, `discovery`, `seo`, `storefront`.

**First-party proving ground:** `answer`, `answer-thread`.

**Owner / ops / parked:** `settings`, `notification-outbox`, `dev`, `sandbox-supply`, `imported-commitment`, `external-run`, `routing-kernel`, `product-frontier`, `business-tools`.

Do not describe Customer Request, WorkTree, Study, or inquiry inboxes as live product. Those TypeScript families are deleted in the working tree. HTTP 410 tombstones remain (`src/routes/api.v1.operations.execute.ts`, listing tool handlers in `src/lib/server/business-tool-api.ts`, Convex routing-v1 in `convex/http.ts`); `tests/unit/study-actions.test.ts` asserts the study action ids stay unregistered.

## Pattern Overview

**Overall:** Kernel-and-adapters over a single action plane, with Convex as the durable source of truth and TanStack Start as the HTTP/UI host.

**Key Characteristics:**
- **Kernel vs planner split.** Market modules own identity, contract, authorization, exactly-once invoke, evidence, and money. Answer / CLI / MCP / third-party agents own planning and tool selection.
- **One action, many surfaces.** Register in `src/modules/actions/index.ts`. HTTP, MCP, CLI, and Answer read tools share `defineAction` in `src/modules/common/action.ts`.
- **Adapters stay thin.** Routes in `src/routes/` bound JSON, rate-limit, authenticate, and call public module seams or `src/lib/server/*`. They do not import `src/modules/**/internal/**`, `convex/schema.ts`, or `convex/browser`.
- **Thin Convex files over split handlers.** The refactor made Convex files admission-only shells: `convex/capabilityOperationInvocations.ts` declares `v.*` validators and delegates to handler modules (`capabilityOperationAdmission.ts`, `capabilityOperationDispatch.ts`, `capabilityOperationInvokeActions.ts`, `capabilityOperationWorkComplete.ts`, `capabilityOperationInvocationIdentity.ts`, `capabilityOperationInvocationProjection.ts`); the same pattern holds for `answerThreads*`, `money*`, `capabilitySupply*`, `harnessSessions*`, `security*`, `catalog*`. Domain logic lives in `src/modules/**`.
- **Durable source beats stream.** Convex rows plus signed source-write admission own completion. UI stream frames and browser reducers are observations.
- **Fail-closed money and effects.** Paid work is `operation.invoke` via `POST /api/v1/operations/call`. Anonymous keyless reads are `operation.execute` (MCP tool + Answer tool loop). `/api/v1/operations/execute` is a 410 tombstone, not keyless execute.
- **Facilitator-sourced supply.** A 10-minute Convex cron ingests x402 facilitator discovery catalogues and publishes bootstrap capabilities through the same supply funnel owners use.

## Layers

**Presentation (UI):**
- Purpose: Render public, owner, admin, and Answer surfaces from projections.
- Location: `src/components/ae/`, `src/components/ui/`, `src/components/ai-elements/`
- Contains: Product shells (`AePublicShell`, `AeOperatorShell` in `src/components/ae/layout/`), chat (`AeChat.tsx`), claim (`AeFindMyBusiness.tsx`), supply, offerings, artifacts (`AeOperationCandidates.tsx`, `AeOperationOutcome.tsx`, `AeProviderCompare.tsx`, `AeRecoveryPrompts.tsx`, `AeAnswerSources.tsx`), action-invocation status (`AePaidOperationCard.tsx`).
- Depends on: Module public types, TanStack server functions (`*.functions.ts`), `src/content/brand-copy.ts`.
- Used by: File routes under `src/routes/`.

**HTTP / file-route adapters:**
- Purpose: Admit requests, negotiate content, emit RFC 9457 problems, stream UI events.
- Location: `src/routes/`, `src/start.ts`
- Contains: `createFileRoute` modules with `server.handlers` for APIs and React components for pages.
- Depends on: `src/lib/server/*`, module `public.ts` / `*.actions.ts` / `*.functions.ts`.
- Used by: Browsers, CLI, MCP, third-party agents.

**App-server seams (`src/lib/server`):**
- Purpose: Host-only plumbing: Convex HTTP client, source-write, agent-access auth, rate limits, bounded bodies, correlation, MCP, invoke gateway, Stripe/notification providers.
- Location: `src/lib/server/`
- Contains: `convex-source.ts`, `operation-invoke-api.ts`, `mcp-api.ts`, `source-write-admission.ts`, `agent-access-auth.ts`, `rate-limit.ts`, `problem.ts`, `stripe-*.ts`, `notification-provider-*.ts`.
- Depends on: Convex generated API names, `src/modules/security/source-write-admission.ts`, action registry.
- Used by: Routes and some `*.functions.ts` server fns. Not imported from client components.

**Domain modules (`src/modules`):**
- Purpose: Kernel logic, schemas, actions, projections. Each module is a bounded context.
- Location: `src/modules/<name>/`
- Contains: `public.ts` (and optional `server.ts`, `testing.ts`, `convex.ts`, `*.actions.ts`, `*.functions.ts`); private code under `internal/`.
- Depends on: Sibling **public** seams only (import scanner in `src/lib/ui/contract-scans.ts`).
- Used by: Routes, Convex function files, other modules' public layers, tests.

**Convex durable source:**
- Purpose: Transactional identity, reservations, ledgers, Workpool jobs, crons, facilitator ingest.
- Location: `convex/`
- Contains: `schema.ts` (spreads 15 module table bundles into **51 listed tables**), function files that declare validators and call split handler modules, `http.ts` (routing-v1 410s), `crons.ts`, `marketDispatchWorkpool.ts`.
- Depends on: `src/modules/**` contracts and `internal/convex-schema.ts` table defs; generated `convex/_generated/*`.
- Used by: App-server via `ConvexHttpClient` in `src/lib/server/convex-source.ts`.

**External effects:**
- Purpose: Provider HTTP JSON, x402 settlement, Stripe, Novu/Resend, OpenRouter, x402 facilitator discovery.
- Location: `src/modules/capability-supply/internal/route-transport-*.ts`, `src/modules/capability-execution/invocation-worker/`, `src/modules/money/server.ts`, `src/modules/model-gateway/public.ts`, `src/lib/server/notification-dispatch.ts`, `src/modules/capability-supply/internal/facilitator-discovery-client.ts`
- Contains: Guarded fetch, payment authorization/settlement, model calls, catalogue fetch.
- Depends on: Network guard, published descriptors, live-money gates.
- Used by: Kernel execution paths and the facilitator cron only. Provider payloads are untrusted until validated.

**Listed Convex tables (count = 51):** `convex/schema.ts` spreads `actionInvocationTables`, `capabilityOperationInvocationTables`, `answerThreadTables`, `businessTables`, `catalogTables`, `capabilityContractRegistryTables`, `capabilitySupplyTables`, `agentAccessPrincipalTables`, `agentAccessPolicyTables`, `registryTables`, `harnessTables`, `observabilityTables`, `securityTables`, `moneyTables`, `externalRunTables`. The authoritative list is `durableTables` (51 names) in `tests/unit/schema/convex-schema.test.ts`; it now includes `capabilityProviderConnectionLeases`, `moneyTopupCommands`, `moneyStripeEvents`, `moneyPayoutAccounts`, `moneyPayouts`, `moneyPayoutAllocations`, `qualifiedUseReceipts`, and `answerThreadShares` among others. Do not copy older “205 tables”, “60 tables”, or “48 tables” claims.

**Unlisted families (empty table objects; do not spread back in):** routing-kernel (`src/modules/routing-kernel/internal/convex-schema.ts`), discovery, notification outbox, settings, agent-access OAuth (`src/modules/agent-access/internal/oauth-convex-schema.ts`). Comment in `convex/schema.ts` is the contract.

## Data Flow

### Primary Request Path — paid Market Operation invoke

1. Caller POSTs JSON to `POST /api/v1/operations/call` (`src/routes/api.v1.operations.call.ts`).
2. Route delegates to `handleOperationInvokePost` (`src/lib/server/operation-invoke-api.ts`).
3. Host authenticates an agent-access principal (`src/lib/server/agent-access-auth.ts`) with scope `market_operations:invoke` (`src/modules/agent-access/contract.ts`).
4. Body is bounded (256 KiB), parsed against the invoke schema, and signed into source-write admission (`src/lib/server/source-write-admission.ts`).
5. `operationInvokeAction` (`src/modules/capability-execution/operation-invoke.actions.ts`) runs with principal + correlation; it cannot accept caller-supplied transport, credentials, or price. Application logic: `createOperationInvokeApplication` in `src/modules/capability-execution/operation-invoke.ts` (admit → reserve → dispatch), with admission split into `operation-invoke-admit.ts` and recovery into `operation-invoke-recover.ts`.
6. Convex `capabilityOperationInvocations:invoke` (`convex/capabilityOperationInvocations.ts` action → `invokeHandler` in `convex/capabilityOperationInvokeActions.ts`) verifies source-write, reserves idempotency (`reserve` via `convex/capabilityOperationAdmission.ts`), checks grant/budget/authority, and claims a durable Action Invocation (`src/modules/action-invocation/`).
7. `convex/capabilityOperationDispatch.ts` opens the dispatch row and enqueues `convex/marketDispatchWorkpool.ts` (maxParallelism 32, retry ×3) which runs `convex/capabilityOperationInvocationWorker.ts` (`"use node"`).
8. The worker prepares the run (`src/modules/capability-execution/invocation-worker/runPreparation.ts`: lease via `lease.ts`, charge authorization via `charge.ts` → `convex/moneyChargeAuthorize.ts`), invokes the registered route transport (`x402Route.ts`, `x402Authorization.ts`, `x402Settlement.ts`, `brokeredX402.ts` over `src/modules/capability-supply/internal/route-transport-*.ts`), then releases (`runRelease.ts`) and persists terminal state through `convex/capabilityOperationWorkComplete.ts`.
9. HTTP returns `operationInvokeResultSchema` kinds `completed` / `pending` / `needs_authority` / `reconciliation_required` / `refused` (`src/modules/capability-execution/operation-invoke-contracts.ts`). Status / cancel / reconcile use `GET/POST /api/v1/operations/$invocationRef…` (`OPERATION_INVOKE_ROUTE_CONTRACT` in `src/modules/capability-execution/operation-invoke-entry.ts`) → `operationStatusSourceAction` / `cancelInvocation` / `reconcileInvocation` Convex actions.

**Trap:** `src/routes/api.v1.operations.execute.ts` returns 410 `quarantine_surface_retired` with RFC 9745 deprecation toward `/api/v1/operations/call`. It is not keyless `operation.execute`.

### Secondary Flow — anonymous discovery

1. `POST /api/v1/market-operations/search` (`src/routes/api.v1.market-operations.search.ts`) bounds JSON to 16 KiB, rate-limits `public-read`, and runs `registryOperationsSearchAction`.
2. Action `run` reads current publications through `src/modules/capability-supply/operation-source.ts`, which calls Convex queries `capabilitySupplyOperations:search|detail|compare|inspectPlan|offeringOperationMap` (`convex/capabilitySupplyOperations.ts` → handlers in `convex/capabilitySupplyOperationQueries.ts`) and deserializes the wire projection (`src/modules/capability-supply/internal/operation-projection-wire-*.ts`).
3. Paths are canonical in `src/modules/registry/operation-paths.ts`: `/api/v1/market-operations/{search,detail,compare,inspect-plan}`.
4. Same actions are MCP tools (`ae_registry_operations_*`) and CLI `search` / `inspect` / `compare` / `inspect-plan` (`tools/ae/commands/`).

### Secondary Flow — keyless `operation.execute`

1. Eligible keyless `http-json:v1` operations only (`isAnonymousKeylessOperationEligible` in `src/modules/capability-supply/public.ts`; Convex eligibility in `convex/capabilitySupplyOperationKeyless.ts` with `readKeylessExecutable` / `listKeylessExecutable`).
2. `executeOperation` (`src/modules/capability-execution/operation-execute.functions.ts`) rereads the descriptor, validates input schema, SSRF-checks the URL, performs one bounded HTTP request (512 KiB), validates output.
3. Host fetch is `executeKeylessOperation` (`src/modules/capability-execution/operation-execute.server.ts`) using `undici` + `network-guard`.
4. Surfaces: MCP (`operationExecuteAction` in `src/modules/capability-execution/operation-execute-mcp.actions.ts`, tool `ae_operation_execute`) and Answer tool loop (`ANSWER_READ_TOOL_IDS` in `src/modules/answer-thread/answer-thread.schema.ts`). **No public HTTP route.** MCP may annotate the tool description with the paid successor `POST /api/v1/operations/call` (`isDeprecatedMcpAction` in `src/lib/server/mcp-api.ts`); that annotation does not make the MCP tool the `/execute` 410 tombstone.

### Secondary Flow — Answer turn (first-party proving ground)

1. Browser `AeChat` (`src/components/ae/chat/AeChat.tsx`) POSTs to `/api/answer/turn` with `x-ae-turn-key` (`src/routes/api.answer.turn.ts`).
2. Route bounds body to 16 KiB, admits `answer-turn-submit` (30/hour token bucket in `convex/lib/rateLimit.ts`), resolves a pseudonymous session cookie (`src/modules/answer-thread/public.ts`).
3. Optional `Authorization` builds `AnswerOperationInvokeContext` via `authenticateOperationGateway` (`src/lib/server/operation-invoke-api.ts`) so authenticated turns may call `operation.invoke`; anonymous turns stay on `operation.execute`.
4. Convex reservation (`convex/answerThreadsReserve.ts` behind `convex/answerThreads.ts`) is generation-fenced (`ANSWER_TURN_EXECUTION_LEASE_MS` = 30s in `src/modules/answer-thread/answer-thread.schema.ts`; `ANSWER_THREAD_MAX_TURNS = 25`).
5. `streamAnswerTurn` (`src/modules/answer-thread/internal/turn-orchestrator.ts`, phases in `internal/answer-turn-phases.ts`, turn paths in `internal/turns/agent.ts` and `internal/turns/boundary.ts`) runs harness phases with checkpoint/lease/persist split across `internal/answer-turn-{lease,checkpoint,persist,snapshots,timing}.ts`. Safe turns enter `runAnswerToolUseAgent` (`src/modules/answer/internal/answer-tool-use-agent.ts` via `src/modules/answer/server.ts`).
6. Model-facing read tools are exactly `ANSWER_READ_TOOL_IDS`: `registry.search`, `registry.detail`, `registry.operations.search|detail|compare|inspectPlan`, `operation.execute`. Capability tools are generated from admitted descriptors; `MAX_EFFECT_CALLS=1` and `ANSWER_AGENT_MAX_TOOL_CALLS=4` in `src/modules/answer/internal/answer-tool-use-agent-types.ts` (`ANSWER_OPERATION_EFFECT_DISPATCH_IDS` = `operation.execute` + `operation.invoke`).
7. Privacy + answer gate run before prose. Stream frames are transient; durable projection is readback via `/t/$threadId` and `src/modules/answer-thread/answer-thread.functions.ts`.
8. Landing example pills come from `AE_CATALOG_EXAMPLE_ASKS` (`src/modules/answer/catalog-example-asks.ts`) rendered through `AeAnswerSuggestions` (`src/components/ae/chat/AeSuggestionChips.tsx`) and `AeAnswerPromptInput.tsx`. Continuation uses `classifyFollowUpIntent` (`src/modules/answer-thread/internal/follow-up-intent.ts`). There is no follow-up-chip generator route (`src/routes/api.answer.follow-up-chips.ts` was deleted).

### Secondary Flow — MCP

1. `POST|DELETE /mcp` (`src/routes/mcp.ts`) rate-limits `public-read` and calls `handleMcpRequest` (`src/lib/server/mcp-api.ts`).
2. Anonymous tier: read-only MCP actions from `listMcpActions()`. Authenticated tier: actions whose `authorityRequirement` fits the principal's mode; invoke uses `createOperationInvokeService`.
3. Tool names are `ae_${action.id.replace(/\./g, '_')}` (`mcpToolName` in `src/modules/actions/index.ts`).
4. `QUARANTINE_FAMILY_ACTION_PREFIXES` is empty (`src/modules/product-frontier/quarantine-write-admission.ts`). Families are deleted; do not restore prefix membership as live product.

### Secondary Flow — CLI

1. `npm run ae -- <command>` → `tools/ae/cli.ts` (commands in `tools/ae/commands/`, manifest in `tools/ae/commands/manifest.ts`).
2. Anonymous HTTP for search/inspect/compare/inspect-plan. `connect` uses OAuth device flow (`src/routes/oauth.device_authorization.ts`).
3. `invoke` / `status` / `recover` (reconcile) hit `/api/v1/operations/call` and invocation lifecycle paths; `cancel` hits the cancel path. CLI never invents operation identity. `demand *` / `advanced *` command groups cover ask/business/discover/enrich/import/journey and action/policy/eval tooling.

### Secondary Flow — owner claim / supply

1. `/claim` (`src/routes/claim.tsx`) uses storefront enrich/import (`src/modules/storefront/`) and `submitOwnerClaimServer` (`src/modules/catalog/owner-claim.functions.ts`).
2. Owner supply UI (`src/routes/_operator/owner.supply.tsx`) calls `src/modules/capability-supply/supply-funnel.functions.ts` server fns backed by `internal/supply-funnel/{landing,publication-admit,publication-import,funnel-owner,connections,pricing-port}.ts`: admit, publish, readiness, connections, earnings.
3. Publication imports come from OpenAPI documents, MCP servers, x402 endpoints, x402-bazaar listings, or agent plugins (`src/modules/capability-supply/internal/publication-importer-*.ts`).
4. Public listing is `/$slug` (`src/routes/$slug.tsx`) from catalog/registry projections. Listing tool HTTP (`src/routes/$slug.tools.$toolId.ts`) returns 410 via `handleBusinessToolInvoke`.
5. Owner invocation status UI is `/operations/invocations/$invocationRef` (`src/routes/operations.invocations.$invocationRef.tsx` + `src/components/ae/action-invocation/AePaidOperationCard.tsx`).

### Secondary Flow — facilitator discovery (supply ingest cron)

1. Every 10 minutes `convex/crons.ts` schedules `internal.facilitatorDiscoveryAction.run` (`convex/facilitatorDiscoveryAction.ts`, `"use node"`).
2. The action fetches discovery pages from `FACILITATOR_DISCOVERY_URLS` — `https://facilitator.payai.network/discovery/resources` and `https://api.cdp.coinbase.com/platform/v2/x402/discovery/resources` (`src/modules/capability-supply/internal/facilitator-discovery-client.ts`).
3. Items are admitted through `admitFacilitatorDiscoveryItems` (`src/modules/capability-supply/internal/facilitator-discovery-ingest.ts`) into publication drafts under the system publisher `FACILITATOR_DISCOVERY_PUBLISHER_REF`.
4. `convex/facilitatorDiscovery.ts` (`reconcile` internal mutation) publishes/refreshes bootstrap capabilities via `convex/capabilitySupplyPublish.ts`, rebuilds the supply projection (`convex/capabilitySupplyShared.ts`), and withdraws items no longer seen (`seenPublicationRefs`).

### Secondary Flow — site discovery

1. `GET /.well-known/ucp` (`src/routes/[.]well-known/ucp.ts`) projects `buildSiteDiscoveryManifest` (`src/modules/discovery/internal/site-manifest.ts`).
2. The manifest advertises `POST /api/v1/operations/call` as the paid door (`SITE_DISCOVERY_SUMMARY_LINES`, `operationGateway`, `customerRequest.retired` successorPath). It does not advertise `/api/v1/requests`.
3. Same contract list feeds `/llms.txt`, `/SKILL.md`, and developer discovery (`src/routes/_operator/developers.discovery.tsx` via `src/modules/discovery/developer-discovery.ts`).

**State Management:**
- **Durable:** Convex tables composed in `convex/schema.ts` from module `internal/convex-schema.ts` / `internal/schema.ts` bundles. Count and names: `durableTables` in `tests/unit/schema/convex-schema.test.ts` (51).
- **Request:** `runWithRequestCorrelation` (`src/lib/server/request-correlation.ts`); source-write nonce + digest.
- **Answer UI:** `answer-turn-state.ts` + `turn-stream-session.ts` are client observations; `getOwnedThreadProjection` is authority.
- **Model provider cache:** module-level OpenRouter provider cache in `src/modules/model-gateway/public.ts` (stateless factory keyed by credential set).

## Key Abstractions

**Action (`defineAction`):**
- Purpose: One machine contract with id, schemas, `readOnly`, effect, surfaces, optional `credentialAdmission` / `invocationContract`, and `run`.
- Examples: `src/modules/common/action.ts`, `src/modules/capability-execution/operation-invoke.actions.ts`, `src/modules/registry/operations.actions.ts`
- Pattern: Explicit registration array in `src/modules/actions/index.ts`. Do not rely on import side effects.

**Registered action ids (14, `src/modules/actions/index.ts`):**
- `registry.search`, `registry.detail`
- `registry.operations.search`, `registry.operations.detail`, `registry.operations.compare`, `registry.operations.inspectPlan`
- `operation.execute`, `operation.invoke`, `operation.status`, `operation.cancel`, `operation.reconcile`
- `supply.publish`, `supply.withdraw`, `supply.earnings`

Answer model tools are a **subset**: `ANSWER_READ_TOOL_IDS` in `src/modules/answer-thread/answer-thread.schema.ts`. Authenticated Answer may additionally bind `operation.invoke` through `AnswerOperationInvokeContext`, not as a free-form model tool id in the read list.

**Public Operation Ref:**
- Purpose: Opaque current-revision identity `operation:v1:<64 hex>` from operationId + publicationRef + revision + contractRef.
- Examples: `createPublicOperationRef` / `isPublicOperationRef` in `src/modules/capability-supply/public.ts`
- Pattern: Callers pass the ref from search/detail; kernel resolves descriptor server-side.

**Published Operation / runtime descriptor:**
- Purpose: Current admitted contract + binding + commercial + effect + transport material.
- Examples: `src/modules/capability-supply/published-operation.ts`, `operation-projection.ts` (wire split under `internal/operation-projection-wire-*.ts`)
- Pattern: Discovery projects a public DTO (`registry-operations:v1` in `src/modules/capability-supply/internal/operation-projection-types.ts`); execution rematerializes and fail-closes on drift.

**Source-write admission:**
- Purpose: Signed v2 envelope (scope, operationKey, nonce, body digest, RFC 9421 signature) required for durable writes.
- Examples: `src/modules/security/source-write-admission.ts`, `src/lib/server/source-write-admission.ts`, `convex/sourceWriteAdmission.ts`
- Pattern: Host mints admission; Convex `requireSourceWrite` verifies and replays nonces.

**Action Invocation:**
- Purpose: Canonical claim + attempt lease + release fence + terminal/reconcile evidence.
- Examples: `src/modules/action-invocation/canonical-claim.ts`, `application-service.ts`, `paid-operation-application-service.ts`, `convex/actionInvocationControl.ts`
- Pattern: Idempotency key + principal + operation revision + input digest. Replay of a changed command is refused.

**HarnessRunLoop:**
- Purpose: Bounded phase machine for Answer (and harness sessions): context → intent → route → retrieval → model → gate → assemble → persist → report.
- Examples: `src/modules/harness/run-loop.ts`, `src/modules/answer-thread/internal/turn-orchestrator.ts`
- Pattern: Model proposes; host enforces budgets, tools, and persistence identity.

**RFC 9457 Problem:**
- Purpose: Single error envelope for HTTP and CLI.
- Examples: `src/lib/errors.ts`, `src/lib/server/problem.ts`
- Pattern: `kind` (google.rpc.Code subset) + stable `code` + `retryable`. Unknown API paths use `src/routes/api.$.ts`.

**Module public / internal / server split:**
- Purpose: Keep routes and sibling modules on stable seams.
- Examples: `src/modules/answer/public.ts` + `server.ts`; `src/modules/answer-thread/public.ts` + `server.ts` + `testing.ts`; `src/modules/capability-supply/server.ts`; `src/modules/money/server.ts`.
- Pattern: `public.ts` for types and read-safe exports; `server.ts` for Node/host execution; `internal/` private; `convex.ts` for Convex-callable helpers; `testing.ts` for eval/test ports only.

**Product-frontier quarantine:**
- Purpose: Fail-closed retired family doors without restoring deleted product TypeScript.
- Examples: `src/modules/product-frontier/quarantine-write-admission.ts`, `deprecation-notice.ts`
- Pattern: HTTP `/execute` is 410. Server-fns stay 403 freeze. Never attach deprecation headers to `/call`. Prefix list is empty; families are deleted.

## Entry Points

**Web app (TanStack Start):**
- Location: `src/start.ts` (`createStart` middleware stack), `src/router.tsx`, generated `src/routeTree.gen.ts`
- Triggers: Vite/Nitro HTTP on port 3000 (`vite.config.ts`); production Vercel Node (not edge).
- Responsibilities: Correlation, API path boundary, observability, security headers, agent markdown negotiation, CSRF for server fns, source-write middleware, Clerk (unless local E2E bypass). Middleware order in `src/start.ts`: requestCorrelation → apiRequestBoundary → observability → securityHeaders → agentContentNegotiation → csrf → sourceWriteAdmission → clerk.

**Answer HTTP:**
- Location: `src/routes/api.answer.turn.ts`, `api.answer.turn.stop.ts`, `api.answer.threads.ts`, `api.answer.threads.$threadId.ts`, `api.answer.threads.$threadId.share.ts`, `api.answer.eval-status.ts`
- Triggers: `AeChat` / `tools/ae/commands/ask.ts`
- Responsibilities: Session cookie, reservation, UI stream; stop lease; list/get/share projections; `/api/answer/eval-status` reflects `AE_ANSWER_EVAL_PASSED` (`src/modules/answer/internal/llm-config.ts`).

**Market HTTP:**
- Location: `src/routes/api.v1.market-operations.*.ts`, `src/routes/api.v1.operations.call.ts`, `api.v1.operations.$invocationRef*.ts`
- Triggers: CLI, MCP (indirectly via actions), third-party agents, `/for-agents` docs
- Responsibilities: Anonymous discovery; authenticated invoke/status/cancel/reconcile.

**MCP:**
- Location: `src/routes/mcp.ts` → `src/lib/server/mcp-api.ts`
- Triggers: MCP clients against canonical origin `/mcp`
- Responsibilities: Streamable HTTP transport, anonymous vs authenticated tool admission.

**CLI:**
- Location: `tools/ae/cli.ts` (`npm run ae`)
- Triggers: Operator/agent terminals
- Responsibilities: HTTP client over public contracts; `--json` machine output; never a second kernel.

**Convex:**
- Location: `convex/schema.ts`, `convex/convex.config.ts` (workpool, rateLimiter, aggregate), `convex/http.ts`, `convex/crons.ts`
- Triggers: App-server `callPublicSourceAction` / mutations; schedulers; Workpool
- Responsibilities: Transactions, readiness probes every 1 minute (`capabilitySupply:scheduleDueCapabilityProbes`), facilitator discovery every 10 minutes (`facilitatorDiscoveryAction:run`), nonce cleanup hourly (`sourceWriteAdmission:cleanupExpiredSourceWriteNonces`), daily supplier settlement midnight UTC (`moneyLedger:runDailySupplierSettlement`).

**OAuth / agent access:**
- Location: `src/routes/oauth.authorize.ts`, `oauth.token.ts`, `oauth.register.ts`, `oauth.device_authorization.ts`, `src/routes/_operator/agent-access.tsx`
- Triggers: CLI `connect`, assistant install funnel (`src/components/ae/console/AeAssistantInstallFunnel.tsx`)
- Responsibilities: Device-code client registration, grants, bearer keys, budgets.

**Public pages:**
- Location: `src/routes/index.tsx` (`/` renders the ask composer; `?q=` deep-links into `/t/new`), `t.new.tsx`, `t.$threadId.tsx`, `s.$shareToken.tsx`, `$slug.tsx`, `operations.$operationRef.tsx`, `operations.invocations.$invocationRef.tsx`, `for-agents.tsx`, `for-providers.tsx`, `claim.tsx`, `privacy.remove-business.tsx`
- Triggers: Humans and agent content-negotiation markdown (`src/lib/http/agent-content-negotiation.ts`)
- Responsibilities: Loaders call `*.functions.ts` source ports; no direct Convex.

**HTTP surface inventory (adapters only):**

Market (live):
- `POST /api/v1/market-operations/search|detail|compare|inspect-plan` — anonymous reads (`src/routes/api.v1.market-operations.*.ts`).
- `POST /api/v1/operations/call` — paid invoke.
- `GET /api/v1/operations/$invocationRef` — status.
- `POST /api/v1/operations/$invocationRef/cancel|reconcile`.
- `POST|DELETE /mcp` — MCP host (`src/routes/mcp.ts`).

Answer:
- `POST /api/answer/turn`, `POST /api/answer/turn/stop`.
- `GET/POST /api/answer/threads`, thread get/share under `api.answer.threads.$threadId*`.
- `GET /api/answer/eval-status` (`src/routes/api.answer.eval-status.ts`).
- No follow-up-chip route. Landing examples: `src/modules/answer/catalog-example-asks.ts`.

Catalog / discovery (projections):
- `/api/businesses`, `/api/businesses/search`, `/api/businesses/$slug`.
- `/api/v1/services`, `/api/v1/services/search`, `/api/v1/services/$serviceId`.
- `/api/discovery/schema`, `/api/discovery/examples`.
- `/.well-known/ucp`, `/.well-known/oauth-authorization-server`, `/.well-known/oauth-protected-resource`, `/.well-known/http-message-signatures-directory` (`src/routes/[.]well-known/`), `/llms.txt`, `/SKILL.md`, `/sitemap.xml`, `/robots.txt`, `/$slug/ucp`.

Owner / webhooks:
- `/api/storefront/enrich`, `/api/storefront/import-draft`.
- `/api/stripe/webhook`, `/api/notification/resend-webhook`, `/api/notification/resend-dispatch`, `/api/notification/novu-dispatch`.
- `/api/observability/funnel`, `/api/observability/client-error`.
- `/api/health`, `/api/ready`, `/api/v1/release`.

Tombstones / redirects:
- `/api/v1/operations/execute` — 410, successor `/call` (`src/routes/api.v1.operations.execute.ts`).
- `/$slug/tools/$toolId` and `/$slug/tools/$toolId/prepare` — 410 (`src/lib/server/business-tool-api.ts`).
- Convex `http.ts` `/v1/*` and Convex `/mcp` — routing-v1 410 (`src/modules/routing-kernel/retirement.ts`). Live MCP is Start `/mcp`.
- `/i/$threadId` — 301 to `/t/$threadId` (`src/routes/i.$threadId.tsx`).
- `/engine` — redirect to `/` (`src/routes/engine.tsx`).

There is no live `/api/v1/requests` TypeScript route family; all `api*.requests.*` files were deleted.

**Convex area map (app-server calls named functions through `src/lib/server/convex-source.ts`):**

| Area | Convex files | Module owners |
|------|----------------|---------------|
| Schema | `convex/schema.ts` | Spreads listed `internal/convex-schema.ts` / `internal/schema.ts` bundles (51 tables) |
| Invoke | `capabilityOperationInvocations.ts` (validators) + `capabilityOperationAdmission.ts`, `capabilityOperationDispatch.ts`, `capabilityOperationInvokeActions.ts`, `capabilityOperationWorkComplete.ts`, `capabilityOperationInvocationIdentity.ts`, `capabilityOperationInvocationProjection.ts`, `capabilityOperationInvocationWorker.ts`, `actionInvocationControl.ts`, `marketDispatchWorkpool.ts` | `capability-execution`, `action-invocation` |
| Supply | `capabilitySupply.ts`, `capabilitySupplyCommands.ts`, `capabilitySupplyPublish.ts`, `capabilitySupplyProbes.ts`, `capabilitySupplyGraph.ts`, `capabilitySupplyLists.ts`, `capabilitySupplyOperations.ts`, `capabilitySupplyOperationQueries.ts`, `capabilitySupplyOperationKeyless.ts`, `capabilitySupplyOperationShared.ts`, `capabilitySupplyOwnerFunnel*.ts`, `capabilitySupplyEligiblePorts.ts`, `capabilitySupplyPublicationPorts.ts`, `capabilitySupplyWriterPorts.ts`, `capabilitySupplyProjection.ts`, `capabilitySupplyReadiness.ts`, `capabilitySupplyRowMappers.ts`, `capabilitySupplyValues.ts`, `capabilityProviderConnections.ts`, `capabilityProviderConnection{Leases,Lifecycle,Owner,Cleanup}.ts`, `capabilityProviderApprovals.ts`, `capabilityContractDocuments.ts` | `capability-supply`, `capability-contract-registry` |
| Registry / catalog | `registry.ts`, `catalog.ts`, `catalogRuntimeQueries.ts`, `catalogPublicReads.ts`, `catalogOfferingMutations.ts`, `catalogPublish.ts`, `business.ts`, `businessSupplyProjectionSnapshot.ts`, `discovery.ts` | `registry`, `catalog`, `business`, `discovery` |
| Answer | `answerThreads.ts` (validators) + `answerThreadsReserve.ts`, `answerThreadsCheckpoint.ts`, `answerThreadsReads.ts`, `answerThreadsShare.ts`, `harnessSessions.ts` + `harnessSessions{Append,Finalize,Reads}.ts` | `answer-thread`, `harness` |
| Money | `moneyLedger.ts`, `moneyLedgerValues.ts`, `moneyCanonicalAccounts.ts`, `moneyBudgetPersist.ts`, `moneyCharge{Admission,Authorize,Brokered,Journal,Reconcile}.ts`, `moneyExternalSpend.ts`, `moneyCredit{Topup,Reads}.ts`, `moneyConnect.ts`, `moneyPayoutTransfer{Begin,Complete,CompleteApply,Read,Reconcile,Settlement,Shared}.ts`, `moneyProviderEarnings.ts`, `moneyQualifiedUsePayout.ts`, `moneyRefund.ts`, `moneyStripeEvents.ts`, `moneyX402PaymentAttempts.ts`, `qualifiedUse.ts` | `money` |
| Agent access | `agentAccessPrincipals.ts`, `agentAccessOAuth.ts`, `agentAccessPolicy.ts` | `agent-access` |
| Facilitator | `facilitatorDiscoveryAction.ts` (cron action), `facilitatorDiscovery.ts` (reconcile) | `capability-supply` (internal ingest) |
| Notifications | `notificationOutbox.ts`, `notificationOutboxPersistence.ts`, `notificationOutboxSourceState.ts`, `notificationOutboxReconstruction.ts` | `notification-outbox` (tables unlisted) |
| Authz / writes | `authz.ts`, `sourceWriteAdmission.ts`, `security.ts` + `securityShared.ts`, `securityAdminMembership.ts`, `securityAdminReadbacks.ts`, `securityRemovalDisputes.ts`, `rateLimit.ts`, `lib/rateLimit.ts` | `security` |
| Seed | `devSeed.ts`, `devSeedStore.ts`, `curatedProviders.ts` | `dev`, `sandbox-supply` |
| Other | `settings.ts`, `observability.ts`, `externalRuns.ts`, `routingKernelV1History.ts`, `migrations.ts`, `serviceAssertion.ts` | matching modules |

Crons in `convex/crons.ts`: readiness probes (1 min), facilitator discovery (10 min), source-write nonces (1 h), daily supplier settlement midnight UTC.

## Architectural Constraints

- **Threading:** Single-threaded Node event loop on the Start host. Convex queries/mutations are serializable transactions. Market invoke uses `@convex-dev/workpool` (32 slots, retry ×3 with exponential backoff in `convex/marketDispatchWorkpool.ts`). Answer generation uses a 30-second fenced lease (`ANSWER_TURN_EXECUTION_LEASE_MS` in `src/modules/answer-thread/answer-thread.schema.ts`). Worker file `convex/capabilityOperationInvocationWorker.ts` is `"use node"` for undici/x402, as is `convex/facilitatorDiscoveryAction.ts`.
- **Global state:** OpenRouter provider cache in `src/modules/model-gateway/public.ts`. Compiled JSON Schema validators in `src/modules/capability-contract/`. In-memory Answer stream sessions in `src/components/ae/chat/turn-stream-session.ts` (per Node isolate, module-level `Map`). Do not add new process-wide mutable stores for market identity.
- **Circular imports:** Convex files import `src/modules/**`; modules must not import `convex/_generated` except through `src/lib/server/convex-source.ts` or module `*.functions.ts` that already own that seam. Registry operation actions dynamically import `capability-supply/operation-source` inside `run` (`src/modules/registry/operations.actions.ts`) to keep the action registry tree-shakeable — do not copy that pattern into routes.
- **Import boundaries:** Enforced by `tests/imports/private-imports.test.ts` and `route-boundary.test.ts` via `src/lib/ui/contract-scans.ts` (including the `forbidden-handshake-import` quarantine of `@x402/*`, `viem`, and MCP SDK imports outside reviewed transport files). Answer must not import `src/modules/capability-supply/**` (`tests/imports/capability-supply-boundaries.test.ts`); it reaches operations through registry actions and `capability-execution`.
- **Auth split:** Humans = Clerk (`src/start.ts`, `convex/auth.config.ts`, `convex/authz.ts`). Agents = bearer keys / OAuth (`src/lib/server/agent-access-auth.ts`). Server-to-Convex function calls = `AE_CONVEX_SERVER_FUNCTION_TOKEN` assertion (`createConvexServerFunctionAssertion` in `src/lib/server/convex-source.ts`). Env file `.env.example` documents names; do not read secret files.
- **Money fail-closed:** `src/modules/money/internal/live-money-gate.ts` and credential budgets. Kernel owns charges (`convex/moneyChargeAuthorize.ts`, `moneyChargeAdmission.ts`, `moneyChargeBrokered.ts`, `moneyChargeJournal.ts`); adapters do not round or invent amounts (`src/modules/money/internal/exact-amount.ts`).
- **Quarantine:** Do not restore Customer Request planners, WorkTree/Study inboxes, or inquiry send as live product — the TypeScript is deleted in this tree. Do not serve routing-v1 paths (`convex/http.ts` → `src/modules/routing-kernel/retirement.ts`).
- **Answer tool bounds:** `ANSWER_AGENT_MAX_TOOL_CALLS=4` and `MAX_EFFECT_CALLS=1` in `src/modules/answer/internal/answer-tool-use-agent-types.ts`. Navigation must search then exact-detail before a capability call. Boundary/refusal uses `src/modules/answer/internal/boundary-prose.ts` without an LLM.
- **Catalog vs capability:** Public businesses/offerings live in `catalog`/`business` tables and `src/modules/registry/internal/service-projection.ts`. Market Operations are capability publications. Do not collapse them.
- **Rate limits:** Host classes in `src/lib/server/rate-limit.ts` (`public-read`, `public-mutation`, `oauth-issuance`, `answer-turn-submit`, `answer-stream`). Convex `@convex-dev/rate-limiter` names in `convex/lib/rateLimit.ts` (same five plus legacy `inquiry-submit`, `dispute-open` buckets kept for definitions).

## Anti-Patterns

### Route owns Convex transport or schema

**What happens:** A `src/routes/**` file imports `convex/browser`, `convex/server`, or `convex/schema`.
**Why it's wrong:** Routes become a second source of truth; scanners fail (`route-owned-convex-transport`, `route-convex-schema-import`).
**Do this instead:** Call `src/lib/server/convex-source.ts` from `src/lib/server/*` or a module `*.functions.ts`. Example: `src/routes/api.v1.operations.call.ts` → `handleOperationInvokePost`.

### Sibling module imports `internal/`

**What happens:** `from '@/modules/foo/internal/bar'` in a route or another module.
**Why it's wrong:** Breaks the public seam; `module-private-import` fails. Internal files move freely.
**Do this instead:** Export through `public.ts` or a documented root file (`operation-invoke-entry.ts`, `*.actions.ts`). Convex table composition may import `internal/convex-schema.ts` from `convex/schema.ts` only. Convex function files may import module internals for handlers (e.g. `convex/capabilityOperationInvokeActions.ts`), but keep the Convex file a validator+delegation shell.

### Paid work through keyless execute or `/execute`

**What happens:** Authenticated spend goes through `operation.execute`, or clients POST `/api/v1/operations/execute`.
**Why it's wrong:** Keyless execute has no principal, money, or exactly-once invocation. `/execute` is a 410 tombstone (`src/routes/api.v1.operations.execute.ts`).
**Do this instead:** `POST /api/v1/operations/call` with `Authorization` and `idempotencyKey` (`OPERATION_INVOKE_ROUTE_CONTRACT.invoke`). Use MCP `ae_operation_execute` only for admitted keyless reads.

### Answer (or CLI) invents operation identity / price / credentials

**What happens:** The model or adapter supplies endpoint URLs, API keys, or prices.
**Why it's wrong:** Kernel contracts say callers pass `operationRef` + input only (`operation-invoke.actions.ts` boundaries).
**Do this instead:** Search → detail → execute/invoke. Host binds descriptor from Convex.

### Treat Answer as the product category

**What happens:** New market features land only in `src/modules/answer*` or chat UI.
**Why it's wrong:** Answer is a first-party proving ground. Third-party agents skip chat.
**Do this instead:** Add kernel contract + action + HTTP/MCP/CLI first; Answer consumes the same action ids (`ANSWER_READ_TOOL_IDS`).

### Restore retired family HTTP as live write doors

**What happens:** `/api/v1/requests/*`, MCP `customerRequest.*` / `workTree.*` / `inquiry.*` writes, or listing `inquiry.submit` are reopened as live product.
**Why it's wrong:** Those TypeScript families are deleted. Paid successor is `/api/v1/operations/call`. Listing tools already return 410 (`src/lib/server/business-tool-api.ts`).
**Do this instead:** Keep tombstones as tombstones. Grow Market Operation invoke, supply, and Answer proving ground.

### Generate thread follow-up chips as a host API

**What happens:** A new `/api/answer/follow-up-chips` or LLM chip planner is added beside the turn.
**Why it's wrong:** The host has landing examples only (`catalog-example-asks.ts` + `AeSuggestionChips.tsx`); the chips route and LLM planner were deleted. Continuation is turn state + composer, not a chip generator.
**Do this instead:** Put next-step copy in turn prose / pending-decision UI. Keep `classifyFollowUpIntent` as intent classification, not chip synthesis.

### Handshake / x402 SDK imports outside reviewed adapters

**What happens:** `@x402/*`, `viem`, or MCP SDK imported from random modules.
**Why it's wrong:** `forbidden-handshake-import` in `contract-scans.ts` quarantines protocol SDKs to reviewed transport.
**Do this instead:** Use `src/modules/capability-supply/server.ts`, `route-transport-runtime.ts`, and `operation-execute.server.ts`.

### Fat Convex function files

**What happens:** New Convex area logic is written inline in one growing `convex/<area>.ts`.
**Why it's wrong:** The tree just finished splitting `money*`, `capabilityOperation*`, `answerThreads*`, `capabilitySupply*`, and `security*` into focused handler files; validators and handlers are separated so Convex files stay admission shells.
**Do this instead:** Declare `v.*` args/returns in the area file, put handlers in a focused sibling (e.g. `convex/moneyChargeAuthorize.ts`), and put domain logic in `src/modules/**` behind `convex.ts` / `public.ts` seams.

## Error Handling

**Strategy:** Canonical RFC 9457 `application/problem+json` from `src/lib/errors.ts` via `problem()` in `src/lib/server/problem.ts`. CLI maps the same `ProblemKind` (`tools/ae/lib/output.ts`).

**Patterns:**
- Bound request bodies (`src/lib/server/bounded-request-body.ts`); 413 `PAYLOAD_TOO_LARGE` on overflow.
- Discriminated kernel results (`kind: 'ok' | 'refused' | 'error' | 'completed' | 'pending' | 'needs_authority' | 'reconciliation_required'`) — do not throw for expected refusals on invoke/execute.
- Convex `ConvexSourceError` (`missing_auth` / `missing_convex_url`) → gateway problems in MCP and invoke adapters.
- Answer turn problems: `buildAnswerTurnProblem` / `redactAnswerTurnProblem` so the stream never leaks source internals.
- Method guards: `src/lib/server/method-guard.ts` on every API route.
- Unknown `/api/**`: `src/routes/api.$.ts` plus `apiRequestBoundaryResponse` for encoded-dot segments.

## Cross-Cutting Concerns

**Logging:** Request correlation header from `src/lib/server/request-correlation.ts`. Gateway telemetry `src/lib/server/gateway-telemetry.ts`. Sentry/PostHog behind `src/lib/observability/config.ts` (disable via `AE_DISABLE_OBSERVABILITY` / `VITE_AE_DISABLE_OBSERVABILITY`). Funnel events `src/modules/observability/`. Sanitize with `src/lib/observability/private-route-safety.ts`.

**Validation:** Zod at HTTP/action boundaries. JSON Schema 2020-12 inside capability contracts (`@cfworker/json-schema`). Convex `v.*` validators on functions; `v.any()` only at documented JSON boundaries. Exact optional properties / `noUncheckedIndexedAccess` in `tsconfig.json`.

**Authentication:** Clerk for owner/admin UI. Agent-access API keys and OAuth for machines. Source-write admission for mutations. Public discovery is unauthenticated + `public-read` rate limit (`src/lib/server/rate-limit.ts`). Local E2E bypass is explicit (`src/lib/server/local-e2e-bypass.ts`) and must not ship as default.

**Authorization:** `convex/authz.ts` maps Clerk identity to business actor / admin membership (`src/modules/security/public.ts`). Invoke path checks grant, environment, authority mode (`inspect_only` / `approve_each` / `bounded_mandate` / `full_yolo` in `src/modules/agent-access/contract.ts`), budget, concurrency in `src/modules/capability-execution/operation-invoke.ts` + Convex.

**Observability of money and evidence:** Hashes and usage summaries are first-class; missing provider cost is unavailable, never zero (`model-gateway`). Operation results strip secret-like keys before model/UI.

## Related maps

- Prompt, model, tool loop, stream, and eval seams: [PROMPT-DATA-FLOW.md](PROMPT-DATA-FLOW.md)
- Durable schemas, personas, and adapter routes: [IA-DATA-FLOW.md](IA-DATA-FLOW.md)
- Admitted capability inventory: [CAPABILITY-MAP.md](CAPABILITY-MAP.md)
- Stack / structure / conventions / testing / concerns: `STACK.md`, `STRUCTURE.md`, `CONVENTIONS.md`, `TESTING.md`, `CONCERNS.md`

---

*Architecture analysis: 2026-08-21*
