<!-- refreshed: 2026-08-04 -->
# Architecture

**Analysis Date:** 2026-08-04

The repository is a bounded-context TypeScript modular monolith. The maintained prompt and AI execution trace remains [PROMPT-DATA-FLOW.md](PROMPT-DATA-FLOW.md); use that map for prompt sites, model calls, stream frames, harness phases, and Flow A/B/C evidence. This document records ownership and boundaries around those flows.

## System Overview

```text
┌──────────────────────────────────────────────────────────────────────┐
│ People, external agents, operators, and providers                    │
├──────────────────────┬────────────────────────┬──────────────────────┤
│ Browser / TanStack   │ Agent / CLI / MCP       │ Provider / webhook   │
│ `src/routes/`        │ `tools/ae/cli.ts`       │ `convex/http.ts`      │
│ `src/components/`    │ `src/lib/server/`       │ `src/routes/api.*`    │
└──────────┬───────────┴────────────┬───────────┴──────────┬───────────┘
           │ thin transport and presentation adapters                 │
           ▼                                                           ▼
┌──────────────────────────────────────────────────────────────────────┐
│ Public domain seams and registered operations                        │
│ `src/modules/*/public.ts`, `*.actions.ts`, `*.functions.ts`           │
│ `src/modules/common/action.ts`, `src/modules/actions/index.ts`       │
└──────────────────────────────┬───────────────────────────────────────┘
                               │ typed source refs and domain ports
                               ▼
┌──────────────────────────────────────────────────────────────────────┐
│ Convex application, persistence, and durable effect coordination      │
│ `convex/schema.ts`, `convex/*.ts`, Workpool, Workflow, cron, HTTP      │
│ application functions recheck identity, revisions, digests, and      │
│ idempotency before source writes or external effects                  │
└──────────────────────────────┬───────────────────────────────────────┘
                               │ projections, journals, observations
                               ▼
┌──────────────────────────────────────────────────────────────────────┐
│ Convex tables and bounded external observations                        │
│ module schema fragments, provider HTTP/MCP/x402, OpenRouter,         │
│ notification providers, Stripe, and generated readbacks              │
└──────────────────────────────────────────────────────────────────────┘
```

Convex is the durable source of truth for business, catalog, capability supply, Customer Request, answer thread, harness, inquiry, WorkTree, Study, money, notification, and supporting state. Model output, provider responses, web discovery claims, imported commitments, browser state, and transcripts are observations or proposals until deterministic validation and source-owned admission accept them.

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| Request middleware | Orders observability, security headers, agent-content negotiation, CSRF, source-write admission, and Clerk middleware. | `src/start.ts` |
| Router and root document | Creates the TanStack router, generated route tree, root document, Clerk provider, CSS, and global error/observability hosts. | `src/router.tsx`, `src/routes/__root.tsx`, `src/routeTree.gen.ts` |
| File-route boundary | Maps pages, operator workspaces, Customer Request APIs, answer streaming, registry/catalog, discovery, OAuth, MCP, webhooks, and sandbox routes to thin handlers or UI. | `src/routes/` |
| Root journey | Chooses service discovery or durable WorkTree readback from one bounded query and URL project reference. | `src/routes/index.tsx`, `src/modules/work-tree/human-root.functions.ts` |
| Action contract | Describes input/output schemas, surfaces, authority, consequences, effects, retry posture, evidence, and safe continuations. | `src/modules/common/action.ts` |
| Action registry | Explicitly registers all cross-surface actions and derives list, lookup, MCP admission, and tool names from one array. | `src/modules/actions/index.ts` |
| Customer Request domain | Interprets intent, validates proposals, compiles bounded capability graphs, creates route generations, prepares authority, and projects customer-safe states. | `src/modules/customer-request/`, `src/modules/customer-request/application/` |
| Customer Request application | Authenticates browser/agent callers, applies rate/idempotency/revision checks, commits V2 aggregates, confirms routes, starts/reconciles effects, and exposes problem/evidence/repeat operations. | `convex/customerRequestApplication.ts`, `convex/customerRequestV2.ts`, `convex/customerRequestRouteExecution.ts` |
| Capability contract and supply | Owns contract validation, durable contract registration, publication lifecycle, bindings, mappings, readiness, public operation projections, and HTTP/MCP/x402 transport preparation. | `src/modules/capability-contract/`, `src/modules/capability-contract-registry/`, `src/modules/capability-supply/` |
| Catalog and registry | Publishes business/offering projections, indexes them, serves business/service/operation search/detail/compare/inspect-plan readbacks, and resolves inquiry targets. | `src/modules/catalog/`, `src/modules/registry/`, `convex/catalog.ts`, `convex/registry.ts`, `convex/capabilitySupplyOperations.ts` |
| Discovery and storefront | Builds UCP, `llms.txt`, `SKILL.md`, sitemap, and agent page projections; imports/enriches web claims as explicitly labelled draft observations. | `src/modules/discovery/`, `src/modules/storefront/`, `convex/discovery.ts` |
| Answer and answer-thread | Plans retrieval-first answer paths, runs bounded model/tool phases, gates grounded snapshots, emits typed stream events, persists turns/tool calls, and serves redacted thread projections. | `src/modules/answer/`, `src/modules/answer-thread/`, `src/routes/api.answer.turn.ts`, `convex/answerThreads.ts` |
| Harness and invocation control | Records ordered phases, model usage/cost observations, tool evidence, approvals, durable invocation attempts, replay, late observations, and private/public readback. | `src/modules/harness/`, `src/modules/action-invocation/`, `convex/harnessSessions.ts`, `convex/actionInvocationControl.ts` |
| WorkTree host | Owns source-backed human and agent project loops, guest/owner binding, bounded gardener verbs, decision inbox, approval artifacts, repeat permissions, receipts, and rollups. | `src/modules/work-tree/`, `src/routes/index.tsx`, `src/lib/server/work-tree-agent-api.ts`, `convex/workTrees.ts` |
| Study protocol | Scans only registered services, qualifies hard needs, collects bounded quotes, scores with deterministic TOPSIS, journals evidence, and proposes rather than locks a WorkTree decision. | `src/modules/study/`, `convex/studies.ts` |
| External-run protocol | Freezes manifests, admits bounded starts, records integrity-checked evidence, and computes `PASS` or `FAIL/KILL` without treating eval or Study output as hosted proof. | `src/modules/external-run/`, `convex/externalRuns.ts` |
| Money and notification effects | Owns pricing, credit ledger, charge/reconciliation, provider earnings/payout state, notification outbox, signed webhooks, and dispatch readbacks. | `src/modules/money/`, `src/modules/notification-outbox/`, `convex/moneyLedger.ts`, `convex/notificationOutbox.ts` |
| Durable backend | Composes all module table fragments and exposes public/internal Convex queries, mutations, actions, ports, cron jobs, and workers. | `convex/schema.ts`, `convex/*.ts`, `src/modules/**/internal/*schema.ts` |

## Pattern Overview

**Overall:** Bounded-context modular monolith with explicit public seams, registered action contracts, typed source adapters, and Convex-backed durability.

**Key Characteristics:**
- `public.ts` is the supported import seam; `internal/` contains private schema, ports, state machines, projections, and adapters.
- A `*.actions.ts` declaration is inert until explicitly imported into `src/modules/actions/index.ts`; the registry fans one operation into UI, HTTP, agent JSON, answer-thread, CLI, and MCP hosts.
- Routes, server functions, CLI, MCP, and React components adapt transport and presentation. Domain modules own semantics, validation, authority preparation, state transitions, and result meaning.
- `*.functions.ts` files bind domain contracts to named Convex source references; Convex functions own identity derivation, source writes, projections, journaling, and recovery.
- Workpool and Workflow provide queue/sleep/replay mechanics. AE-owned state machines decide authority, effect release, output validity, evidence, reconciliation, and customer-visible outcomes.
- Public and customer readbacks are explicit projections. They do not reconstruct authority from raw Convex documents, model transcripts, credentials, or private harness entries.

## Layers

**Presentation and transport:**
- Purpose: Accept browser, agent, CLI, MCP, OAuth, webhook, and provider requests; render pages or protocol responses.
- Location: `src/routes/`, `src/components/`, `tools/ae/`, `convex/http.ts`.
- Contains: TanStack file routes, server functions, UI shells, HTTP parsing, OAuth/MCP adapters, discovery files, and webhook adapters.
- Depends on: Module public seams, action registry, server helpers, authentication, and read projections.
- Used by: People, external agents, provider systems, operators, and local/release tooling.

**Server source adapters:**
- Purpose: Convert a host command into an authenticated or public Convex query/mutation/action while preserving domain input/output types.
- Location: `src/lib/server/convex-source.ts`, `src/modules/*/*.functions.ts`, `src/lib/server/customer-request-*-api.ts`.
- Contains: `sourceQuery`, `sourceMutation`, `sourceAction`, Clerk/guest/API-key authentication, bounded-body parsing, source-write admission, and response mapping.
- Depends on: Convex HTTP client, Clerk, domain public seams, Zod schemas, and request context.
- Used by: File routes, UI loaders/actions, CLI, MCP, WorkTree hosts, and agent APIs.

**Domain and application modules:**
- Purpose: Define bounded-context vocabulary, runtime schemas, deterministic algorithms, action contracts, state machines, ports, and projections.
- Location: `src/modules/`.
- Contains: `customer-request`, `capability-supply`, `catalog`, `registry`, `answer-thread`, `harness`, `work-tree`, `study`, `inquiries`, `money`, `external-run`, and supporting contexts.
- Depends on: `src/modules/common/`, other public seams, and injected persistence/provider ports; route code must not become a domain owner.
- Used by: Source adapters, Convex application functions, action hosts, tests, evals, and projections.

**Durable application and persistence:**
- Purpose: Enforce source-owned identity, admission, revisions, idempotency, transactions, scheduled continuation, state projection, and readback.
- Location: `convex/*.ts`, `convex/schema.ts`, and module schema fragments under `src/modules/**/internal/`.
- Contains: Public/internal queries, mutations/actions, table mappers, port adapters, Workpool dispatch, Workflow definitions, cron jobs, and Convex HTTP routes.
- Depends on: Convex runtime, `convex/values`, `_generated` refs, module public contracts, and runtime environment.
- Used by: Server source adapters, worker callbacks, scheduler callbacks, and Convex HTTP requests.

**External effect and observation:**
- Purpose: Call provider endpoints, model/payment systems, and notification transports only after durable authority and effect fences; record bounded observations and reconcile unknown outcomes.
- Location: `convex/customerRequestRouteTransportWorker.ts`, `src/modules/capability-supply/route-transport-runtime.ts`, `src/modules/model-gateway/public.ts`, `convex/moneyLedger.ts`, `convex/notificationOutbox.ts`.
- Contains: Guarded HTTP/MCP/x402, signed route calls, OpenRouter construction/cost parsing, payment authorization hooks, and notification dispatch adapters.
- Depends on: Durable dispatch state, network guard, credentials, prepared authority, provider adapters, and evidence/digest contracts.
- Used by: Customer Request execution, answer/model calls, capability readiness, Study quote adapters, money flows, and notification workflows.

**Projection and readback:**
- Purpose: Expose stable privacy-scoped views to people and agents without leaking private authority or rebuilding truth from raw documents.
- Location: `src/modules/customer-request/customer-projection.ts`, `src/modules/registry/public.ts`, `src/modules/answer-thread/internal/public-projection.ts`, `src/modules/work-tree/internal/inbox-projection.ts`, `convex/businessSupplyProjectionSnapshot.ts`.
- Contains: Customer Request state, public catalog/operation DTOs, answer thread projections, WorkTree inbox/readback, Study artifacts, inquiry readbacks, and evidence exports.
- Depends on: Durable source state and explicit serializers/limits.
- Used by: `src/components/`, public pages, machine APIs, discovery documents, operator pages, and CLI output.

## Data Flow

### Primary Request Path

1. `POST /api/requests` or `POST /api/v1/requests` enters `src/routes/api.requests.ts` or `src/routes/api.v1.requests.ts` and delegates to `src/lib/server/customer-request-browser-api.ts` or `src/lib/server/customer-request-agent-api.ts`.
2. The boundary limits and validates the body in `src/lib/server/customer-request-api.ts`, derives a browser guest or scoped Clerk API-key principal, and sends `customerRequestApplication:submit` through `src/lib/server/convex-source.ts`.
3. `convex/customerRequestApplication.ts` reserves a durable submission shell, applies rate admission and idempotency/revision checks, resolves exact supply and contract descriptors, and calls the application composition in `src/modules/customer-request/application/`.
4. The semantic interpreter (`src/modules/customer-request/semantic-interpreter.ts`) accepts only a bounded proposal. The compiler (`src/modules/customer-request/compiler.ts`) validates opaque keys, mappings, graph limits, registry digests, costs, effects, evidence, and dependencies, then produces a `proposal_only` aggregate/route generation.
5. `convex/customerRequestV2.ts` and `convex/customerRequestV2WritePorts.ts` persist the aggregate, current revision, route generation, command digest, replay record, and customer-safe projection. Model output cannot create authority or release a provider call.
6. Confirmation (`convex/customerRequestApplication.ts`, `src/modules/customer-request/application/confirm-route/`) requires the exact current revision/route and creates a bounded mandate through `convex/customerRequestRouteMandate.ts`; confirmation is distinct from execution.
7. Run admission (`convex/customerRequestRouteExecution.ts`, `convex/customerRequestRouteExecutionJournalPorts.ts`) creates the run head, attempt, dispatch, outbox, and effect fence before enqueueing `customerRequestRouteWorkpool`.
8. `convex/customerRequestRouteTransportWorker.ts` reopens current durable authority, signs the request, validates a public endpoint through `src/modules/network-guard/public.ts`, marks release, and invokes the registered HTTP/MCP/x402 adapter in `src/modules/capability-supply/route-transport-runtime.ts`.
9. Outcome state machines validate the bounded provider observation and registered output, record success/partial/refusal/unknown, reconcile payment and route state where required, and project the next customer action from `src/modules/customer-request/application/route-plan-projection/`.
10. The same browser/agent action surfaces read a redacted projection, evidence export, problem state, or repeat-permission receipt. Reload and retry resume from Convex state, never from browser/model memory.

### Answer Turn Path

1. `POST /api/answer/turn` enters `src/routes/api.answer.turn.ts`, bounds the body, resolves a pseudonymous session/thread, checks access/idempotency/rate admission, and opens an AI SDK UI message stream.
2. `src/modules/answer-thread/internal/turn-orchestrator.ts` creates a `HarnessRunLoop` run and executes context, intent, route, response-plan, retrieval, model, gate, assembly, persistence, and finalization phases.
3. Retrieval-first paths use registered read actions through `src/modules/answer-thread/internal/tool-runner.ts`; deterministic catalog hits, frozen/boundary/inquiry branches, and qualifying empty-state `web.discover` paths may avoid a model call.
4. Unresolved tool-search uses `src/modules/answer/internal/answer-tool-use-agent.ts` with `src/modules/model-gateway/public.ts`; the final structured answer is sanitized, grounded to allowed public slugs, and converted into typed answer events.
5. `convex/answerThreads.ts` persists thread/turn/tool-call rows, while `convex/harnessSessions.ts` finalizes the private run journal and hashes. `src/modules/answer-thread/internal/public-projection.ts` serves redacted durable readback.
6. `src/components/ae/chat/` merges transient typed stream frames with the durable projection; durable state wins after reload. The detailed stage inventory and evidence ceilings remain in [PROMPT-DATA-FLOW.md](PROMPT-DATA-FLOW.md#flow-a--public-answer-turn-request--plan--answer--persistence--ui).

### Root Discovery and WorkTree Path

1. The `/` loader in `src/routes/index.tsx` treats `?project=` as a WorkTree readback and otherwise bounds `?q=` before choosing a path.
2. A BAS development ask enters `startRootWorkTreeServer` in `src/modules/work-tree/human-root.functions.ts`, which calls `workTrees:create` and redirects to the durable project reference before elaboration.
3. A normal ask runs `registryServicesSearchAction` and `customerRequestPlanPreviewAction`; when no listed service exists, `webDiscoverAction` returns explicitly labelled claims for explanation, not provider admission. `projectConsumerPlan` builds the UI plan.
4. The human UI renders `AeWorkTreePanel`/`AeDecisionInbox` or `AeServiceList`; component state carries only transient pending status. `readRootWorkTreeServer` reloads the source projection.
5. Authenticated owner claim, decision, and approval paths use separate server functions in `src/modules/work-tree/human-root.functions.ts`; agent operations use `/api/v1/work-tree/$operation` and `src/lib/server/work-tree-agent-api.ts`.
6. `convex/workTrees.ts` is the sole WorkTree snapshot mutation owner (`create`, `inspect`, `claim`, `apply`, `decide`); `convex/workTreeApprovals.ts` and `convex/workTreeRepeatLedger.ts` own approval/repeat state.

### WorkTree Study Path

1. A registered `study.start` action applies a fenced `study` gardener verb through `src/modules/study/study.functions.ts` and `src/modules/work-tree/work-tree.functions.ts`.
2. `src/modules/study/internal/pipeline.ts` scans the existing public services projection, qualifies only registered services, collects bounded quote observations, scores fresh quotes with deterministic TOPSIS, and labels web claims as learning evidence only.
3. `convex/studies.ts` stores an `ae.study:v1` artifact plus append-only `studyEvents`; `src/modules/study/internal/rfx-machine.ts` replays the journal and enforces lifecycle state.
4. `study.complete` records a proposal-only recommendation back into the WorkTree decision inbox. It does not lock a decision, claim availability, charge money, or turn a mock into a provider. Detailed Study and external-run protocol boundaries remain in [PROMPT-DATA-FLOW.md](PROMPT-DATA-FLOW.md#flow-c--eval-promptfoo-probe-study-and-external-run-protocols).

### Supply Publication and Public Readback

1. Owner pages such as `src/routes/_operator/owner.supply.tsx` call `src/modules/capability-supply/supply-funnel.functions.ts` and typed source functions.
2. `convex/capabilitySupply.ts` owns publication, admission, binding/mapping registration, eligibility, readiness, withdrawal, and owner funnel functions; module schemas under `src/modules/capability-supply/internal/` describe durable rows.
3. `src/modules/capability-contract/public.ts` validates contract documents and `src/modules/capability-contract-registry/public.ts` encodes/digests active durable contracts.
4. `convex/catalog.ts` persists business/offering source state and public catalog projections; `convex/registry.ts` serves business/service search/detail and `convex/capabilitySupplyOperations.ts` serves executable operation search/detail/compare/inspect-plan.
5. `src/modules/registry/public.ts` projects redacted DTOs and navigation relations. `src/routes/api.businesses*`, `src/routes/api.v1.services*`, `src/routes/$slug.tsx`, and `src/routes/$slug.ucp.ts` consume those projections.
6. `convex/discovery.ts`, `src/modules/discovery/public.ts`, and `src/routes/[.]well-known/`, `src/routes/llms[.]txt.ts`, `src/routes/SKILL[.]md.ts`, and `src/routes/sitemap[.]xml.ts` expose discovery documents derived from current public contracts.

### Inquiry and Notification Path

1. A public listing, answer handoff, or business tool sends a strict inquiry body to `src/modules/inquiries/inquiry.functions.ts` through `src/routes/$slug.inquiry.tsx` or the corresponding API/server function.
2. `inquiries:submitPublicInquiry` in `convex/inquiries.ts` resolves a published target, enforces R1 admission, CSRF/rate/idempotency/integrity checks, persists source-state rows, and returns a customer access key plus a submission receipt.
3. `convex/inquiryNotificationBridge.ts` enqueues notification dispatches into `convex/notificationOutbox.ts`; provider adapters and signed webhook routes update dispatch readbacks without exposing raw private payloads.
4. Owner/operator reads and mutations use `src/modules/inquiries/public.ts` projections, `src/routes/_operator/owner.inquiries*`, and source-authenticated Convex functions. Customer record reads use the scoped access key and explicit serializer.

### Registered Action, Agent, and MCP Path

1. Action declarations live beside their owning context, for example `src/modules/registry/registry.actions.ts`, `src/modules/customer-request/customer-request.actions.ts`, `src/modules/study/study.actions.ts`, and `src/modules/work-tree/work-tree-agent.actions.ts`.
2. `src/modules/actions/index.ts` imports and registers every action, checks unique IDs, derives MCP names, and exposes `listActions`/`findAction`/`listMcpActions`.
3. UI and answer tools call the action's `run` function with a typed context. HTTP and agent hosts use the corresponding `*.functions.ts` or `src/lib/server/*-api.ts` source adapter; action metadata does not grant authority.
4. `src/lib/server/mcp-api.ts` builds the MCP server from the same registry. Anonymous MCP admits only read-only actions; authenticated MCP filters by declared surface and Customer Request authority mode.
5. `src/routes/SKILL[.]md.ts`, `src/routes/[.]well-known/ucp.ts`, and related discovery files serialize canonical action IDs, MCP names, and navigation relations. `tools/ae/cli.ts` dispatches search, discover, request, action, ask, and journey commands through the public machine surfaces.

**State Management:**
- Durable lifecycle state lives in Convex documents, append-only event/journal rows, command digests, revisions, idempotency keys, authority fences, and projections.
- Module-level state is limited to immutable registries and performance/test seams, such as the action array in `src/modules/actions/index.ts`, the OpenRouter provider cache in `src/modules/model-gateway/public.ts`, and injected local ports in source adapters.
- Browser cookies hold session/guest identifiers and UI state; server boundaries resolve them into source-owned principals before writes.
- Streaming and model runtime state may precede persistence, but finalization and source-write success are checked before a turn or action is declared complete.
- Local-e2e adapters and development seeds are explicit alternate ports (`src/lib/server/*`, `src/modules/dev/`, `tests/helpers/`); they do not upgrade fixture evidence into hosted/provider/customer evidence.

## Key Abstractions

**Public module seam:**
- Purpose: Keep route and host imports stable while hiding private schemas, ports, state machines, and implementation details.
- Examples: `src/modules/customer-request/public.ts`, `src/modules/capability-supply/public.ts`, `src/modules/work-tree/public.ts`.
- Pattern: Consumers import public contracts/functions; import-boundary tests protect `internal/` and private Convex seams.

**Registered action:**
- Purpose: Describe one operation once for execution, machine discovery, UI/HTTP/agent/MCP surfaces, authority, effects, retry, and evidence.
- Examples: `src/modules/common/action.ts`, `src/modules/actions/index.ts`, `src/modules/registry/operations.actions.ts`.
- Pattern: Use `defineAction`; register the exported constant explicitly; route writes through its owning source adapter.

**Typed source function reference:**
- Purpose: Keep server callers typed while routing to a named Convex function.
- Examples: `src/lib/server/convex-source.ts`, `src/modules/customer-request/customer-request.functions.ts`, `src/modules/registry/registry.functions.ts`.
- Pattern: Construct `sourceQuery`/`sourceMutation`/`sourceAction`, then call through authenticated/public source transport; keep fallback ports explicit and bounded.

**Schema fragment and Convex ownership:**
- Purpose: Keep durable table shape with its bounded context while composing one schema.
- Examples: `src/modules/customer-request/internal/convex-v2-schema.ts`, `src/modules/study/internal/convex-schema.ts`, `convex/schema.ts`.
- Pattern: Export a `*Tables` object from the owning module, spread it in `convex/schema.ts`, and implement its Convex application functions in the matching `convex/<Context>.ts` family.

**Projection/readback:**
- Purpose: Give people and agents stable, privacy-scoped state without exposing raw documents or authority internals.
- Examples: `src/modules/customer-request/customer-projection.ts`, `src/modules/registry/public.ts`, `src/modules/answer-thread/internal/public-projection.ts`, `src/modules/work-tree/internal/inbox-projection.ts`.
- Pattern: Validate source state, serialize an explicit DTO, redact credentials/mandates/private prompts, and return status plus safe next action.

**Authority and digest fence:**
- Purpose: Bind a command/effect to principal, exact inputs, current revision, prepared authority, and idempotency before release.
- Examples: `src/modules/common/canonical-digest.ts`, `src/modules/security/source-write-admission.ts`, `convex/customerRequestRouteMandateAdmission.ts`, `src/modules/action-invocation/durable.ts`.
- Pattern: Canonicalize material fields, persist the fence, reject stale/conflicting commands, and reconcile unknown effects from source readback.

**Journal/replay machine:**
- Purpose: Make recovery and evidence deterministic across WorkTree, Study, answer harness, action invocation, inquiry, and route execution.
- Examples: `src/modules/study/internal/rfx-machine.ts`, `src/modules/work-tree/internal/verbs.ts`, `src/modules/harness/run-loop.ts`, `src/modules/customer-request/route-execution/machines/record-outcome.ts`.
- Pattern: Apply bounded discriminated events, validate sequence/digest identity, persist append-only history, and project current state rather than mutating UI-owned snapshots.

## Entry Points

**TanStack Start server:**
- Location: `src/start.ts`.
- Triggers: Every application request.
- Responsibilities: Run middleware ordering for security, negotiation, CSRF, source-write admission, observability, and Clerk authentication.

**TanStack Router and document:**
- Location: `src/router.tsx`, `src/routes/__root.tsx`, `src/routeTree.gen.ts`.
- Triggers: Browser navigation and generated file-route registration.
- Responsibilities: Build the router, mount the document/providers, and dispatch page/API handlers. `src/routeTree.gen.ts` is generated; add route files under `src/routes/` instead of editing it.

**Root journey:**
- Location: `src/routes/index.tsx`.
- Triggers: `/` navigation and `?q`/`?project` search parameters.
- Responsibilities: Load public services and plan preview, branch to the durable WorkTree loop, and render projections through `src/components/ae/`.

**HTTP and protocol routes:**
- Location: `src/routes/`.
- Triggers: Browser, agent, OAuth, MCP, discovery, webhook, provider, and sandbox requests.
- Responsibilities: Bound/parse transport input and delegate; route files do not own domain transitions.

**Registered action host:**
- Location: `src/modules/actions/index.ts`, `src/lib/server/mcp-api.ts`, `tools/ae/cli.ts`.
- Triggers: UI/server callers, answer tools, MCP discovery/calls, agent JSON, and CLI commands.
- Responsibilities: Resolve explicit metadata and run one source-backed implementation with surface-specific admission.

**Convex application:**
- Location: `convex/schema.ts` and exported functions in `convex/*.ts`.
- Triggers: Source transport, Convex scheduler, Workpool callbacks, Workflow steps, and Convex HTTP routes.
- Responsibilities: Validate values, derive identity, authorize source writes, perform transactions, persist projections/journals, and schedule bounded continuation.

**Scheduled and worker execution:**
- Location: `convex/crons.ts`, `convex/customerRequestRouteWorkpool.ts`, `convex/customerRequestRouteTransportWorker.ts`, `convex/customerRequestRouteCancellationWorker.ts`, `convex/projectSpine.ts`.
- Triggers: Periodic cleanup, route dispatch, cancellation, Workflow generations, and completion callbacks.
- Responsibilities: Continue bounded durable work from persisted state; never execute an unpersisted browser/model proposal.

**Model/provider/effect gateways:**
- Location: `src/modules/model-gateway/public.ts`, `src/modules/capability-supply/route-transport-runtime.ts`, `convex/moneyLedger.ts`, `convex/notificationOutbox.ts`.
- Triggers: Validated answer/model requests, authorized route dispatch, ledger commands, or notification outbox entries.
- Responsibilities: Construct bounded provider requests, enforce network/credential/payment policy, attribute observations/cost, and return untrusted results to deterministic gates.

## Architectural Constraints

- **Threading:** TanStack and most Convex handlers are asynchronous event-loop functions. `convex/customerRequestRouteTransportWorker.ts` opts into Node and uses guarded `undici`; route work is bounded by `maxParallelism: 32` in `convex/customerRequestRouteWorkpool.ts`.
- **Global state:** `src/modules/actions/index.ts` owns an immutable action array; `src/modules/model-gateway/public.ts` caches a provider factory by credential/config. These are lookup/performance state, never authority or business state.
- **Import direction:** Hosts import public module seams and source adapters. Private modules, schema fragments, and raw Convex tables must not leak into routes/components; boundary tests under `tests/imports/` encode this direction.
- **Generated code:** `src/routeTree.gen.ts`, `convex/_generated/`, and `.vercel/output/` are generated. Add source under `src/routes/`, `src/modules/`, or `convex/`, then regenerate.
- **Source authority:** Caller identity, owner/admin authority, browser guest assertions, agent scopes, source-write admission, and route mandates are derived/rechecked at source boundaries; request bodies, action attribution metadata, model output, and browser state cannot self-authorize.
- **Effect ordering:** Durable admission, idempotency, revisions, digests, prepared authority, and release state precede provider/payment/notification effects. An ambiguous result remains `unknown`/reconciliation-required.
- **Resource bounds:** Body readers, JSON values, contracts, graph selections, answer turns, provider responses, WorkTree events, Study journals, external-run starts, and retries have limits in their owning modules; new boundaries must add equivalent bounds.
- **Projection privacy:** Public/customer/agent serializers omit raw credentials, mandates, binding internals, private prompts, provider payloads, and private harness evidence.
- **Runtime configuration:** `package.json` declares Node `>=22`; `vite.config.ts` pins the Nitro Vercel function runtime to Node 22. Keep runtime-sensitive code in the existing Node/edge seams rather than changing route handlers ad hoc.
- **Protocol retirement:** Legacy `/v1/route`, `/v1/authorize`, `/v1/execute`, `/v1/reconcile`, `/v1/inspect`, `/v1/cancel`, legacy `/mcp` in Convex HTTP, and `/.well-known/ae-routing.json` are explicit 410 responses from `src/modules/routing-kernel/retirement.ts` and `convex/http.ts`; use `/api/v1/requests` and current action/MCP surfaces.

## Anti-Patterns

### Domain logic in routes or components

**What happens:** A route or React component decides eligibility, authority, routing, provider selection, or durable state transitions.
**Why it's wrong:** Browser, agent, CLI, MCP, and answer paths diverge and UI/transcript state can be mistaken for source authority.
**Do this instead:** Keep routes thin (`src/routes/api.businesses.search.ts`, `src/routes/api.v1.requests.$requestRef.run.ts`) and call the owning action/function/projection (`src/modules/registry/registry.actions.ts`, `src/lib/server/convex-source.ts`).

### Direct private-module or raw-table imports from a host

**What happens:** A host imports `src/modules/<context>/internal/*`, `convex/schema.ts`, or a raw Convex document to reconstruct a public response.
**Why it's wrong:** Private contracts become accidental API, serializers diverge, and schema changes fan out across hosts.
**Do this instead:** Import `src/modules/<context>/public.ts`, call an owning `*.functions.ts` adapter, and return an explicit DTO. Keep private table access inside the owning Convex/application adapter.

### Treating a proposal or observation as authority

**What happens:** Model output, web discovery, provider response, imported commitment, or browser confirmation becomes a route, provider choice, availability claim, or approval without deterministic checks.
**Why it's wrong:** Observations can be stale, malformed, replayed, unverified, or outside caller scope.
**Do this instead:** Normalize/validate in `src/modules/customer-request/semantic-interpreter.ts`, compile in `src/modules/customer-request/compiler.ts`, admit exact authority in `convex/customerRequestRouteMandateAdmission.ts`, and record provider results as evidence/state-machine observations.

### Releasing an effect before durable fencing

**What happens:** Code calls an endpoint, payment rail, notification provider, or external state change before persisting the exact command, current revision, authority, and release state.
**Why it's wrong:** A timeout cannot distinguish not-sent from possibly-sent, retries can duplicate effects, and cancellation loses its source of truth.
**Do this instead:** Use `convex/customerRequestRouteExecution.ts`, `convex/customerRequestRouteTransportWorker.ts`, `convex/moneyLedger.ts`, and `convex/notificationOutbox.ts`; persist dispatch/charge state, release once, then reconcile unknown outcomes.

### Duplicating operation or discovery catalogs

**What happens:** A route, MCP host, UI, Study pipeline, or CLI creates a second operation descriptor/search shape instead of using the registry and capability-supply projections.
**Why it's wrong:** Machine navigation, action IDs, availability, pricing, effect metadata, and source provenance drift between surfaces.
**Do this instead:** Use `src/modules/actions/index.ts`, `src/modules/registry/public.ts`, `src/modules/capability-supply/operation-projection.ts`, and `src/modules/study/internal/pipeline.ts`.

## Error Handling

**Strategy:** Fail closed at each boundary, preserve a discriminated refusal/unknown/conflict/partial state, and expose only redacted status plus a safe next action.

**Patterns:**
- Zod schemas validate route/server-function/action payloads; Convex `v.*` validators validate every Convex function boundary (`src/modules/common/action.ts`, `convex/customerRequestApplication.ts`).
- Bounded-body utilities map oversize/malformed input to explicit 400/413 responses (`src/lib/server/bounded-request-body.ts`, `src/lib/server/json-error.ts`).
- Expected business outcomes are discriminated results such as `available`, `refused`, `conflict`, `partial`, `unknown`, `needs_information`, and `not_found`; callers do not infer success from a thrown/empty response.
- External effects persist request/response digests, provider references, payment evidence, and release state. An unknown or possibly released effect is reconciled from Convex readback before retry.
- Source adapters map missing identity, scope, rate limits, conflicts, stale fences, and unavailable source to bounded HTTP status/payloads (`src/lib/server/customer-request-agent-api.ts`, `src/lib/server/work-tree-agent-api.ts`).
- Unexpected exceptions are captured by `src/lib/observability/` and `src/modules/observability/` while public responses remain bounded and redacted.

## Cross-Cutting Concerns

**Logging:** `src/modules/harness/run-collector.ts`, `src/modules/observability/public.ts`, `src/lib/observability/`, and `src/lib/ui/journey-events.ts` collect typed run, timing, funnel, Sentry, and PostHog signals; customer-facing outputs use explicit redaction.

**Validation:** Zod and action schemas validate host/module inputs, Convex `values` validates source boundaries, and capability/customer-request/WorkTree/Study modules apply canonical digests, bounded JSON, graph, contract, evidence, and journal checks.

**Authentication:** `src/start.ts` installs Clerk middleware; `convex/auth.config.ts` configures the Convex issuer; `src/lib/server/convex-source.ts` obtains authenticated tokens; `src/lib/server/customer-request-agent-auth.ts` derives scoped API-key principals; browser guest assertions are source-bound and never caller-chosen.

**Authorization:** Source-write admission, owner/admin authority, agent scopes and authority modes, WorkTree claim/approval, Customer Request mandate/grant, action metadata, and inquiry R1 target admission determine whether a command may proceed. Attribution fields in `src/modules/common/action.ts` do not grant authority.

**Evidence and privacy:** Projection builders and evidence exports are domain-owned (`src/modules/customer-request/route-execution/`, `src/modules/answer-thread/internal/public-projection.ts`, `src/modules/external-run/internal/gate.ts`); public routes do not expose credentials, raw prompts, private model traces, or internal authority digests.

**Recovery:** Durable command keys, revisions, replay records, append-only journals, Workpool completion mutations, Workflow generations, cancellation workers, and explicit unknown states provide cold-resume paths. A UI retry is safe only when the owning state machine says it is replayable or reconciled.

---

*Architecture analysis: 2026-08-04*
