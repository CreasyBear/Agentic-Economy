# Architecture

**Analysis Date:** 2026-08-09

## Pattern Overview

Agentic Economy is a full-stack TypeScript application. TanStack Start owns the request/runtime shell, TanStack Router owns the generated file-route graph, React owns presentation, and Convex is the durable source of truth. The runtime is assembled in `src/start.ts`; the browser router is created in `src/router.tsx`; the durable schema is composed in `convex/schema.ts`.

The dominant dependency direction is:

```text
browser routes/components
        ↓ server functions, HTTP adapters, public module contracts
HTTP/CLI/MCP/agent adapters
        ↓ typed source ports and action contracts
src/modules deterministic domain policy and projections
        ↓ Convex function references and validated commands
Convex queries, mutations, actions, workflows, and scheduled jobs
        ↓ guarded protocol/model/provider effects
external services and transport protocols
```

`src/modules/<domain>/public.ts` is the normal boundary for cross-domain contracts and projections; policy and implementation live below `internal/` or in named module adapters. `convex/schema.ts` is the intentional composition exception that imports module-owned schema fragments. `tests/imports/private-imports.test.ts` and `tests/imports/route-boundary.test.ts` enforce the rest of the boundary: routes and sibling modules do not reach module internals or own Convex transport/schema imports.

Convex plus deterministic domain seams own identity, authority, admission, validation, dispatch, persistence, budgets, and evidence. Models may interpret or compose typed proposals and answer prose, but they do not become provider authority, invent operation references, or turn unverified output into public facts.

## Layers

### Browser and presentation layer

- `src/routes/__root.tsx` mounts the HTML document, Clerk selection, global CSS, client observability, error boundary, and outlet.
- `src/components/ae/layout/AePublicShell.tsx` and `src/components/ae/layout/AeOperatorShell.tsx` provide public and authenticated operator chrome.
- `src/components/ae/chat/AeChat.tsx` owns browser chat state, optimistic turns, stored thread records, route navigation, and convergence with durable projections. `src/components/ae/chat/AeThreadTurnStreamSection.tsx` and `src/components/ae/artifacts/` render typed answer events and artifacts.
- Product areas under `src/components/ae/` cover services, supply onboarding, customer requests, inquiries, work trees, plans, operator consoles, and readbacks; reusable primitives are under `src/components/ui/` and AI presentation pieces under `src/components/ai-elements/`.

### HTTP and server-function adapters

- TanStack file routes under `src/routes/` adapt browser pages and machine requests. Representative handlers are `src/routes/api.answer.turn.ts`, `src/routes/api.v1.services.ts`, `src/routes/api.v1.operations.execute.ts`, `src/routes/api.v1.requests.ts`, and `src/routes/mcp.ts`.
- `src/lib/server/` centralizes bounded request readers, method guards, RFC 9457 responses, request correlation, rate admission, Clerk/agent authentication, source-write admission, and Convex source transport.
- Module server functions such as `src/modules/registry/registry.functions.ts`, `src/modules/catalog/owner-claim.functions.ts`, and `src/modules/capability-supply/supply-funnel.functions.ts` validate public input and call typed Convex source references rather than exposing Convex clients to routes.
- `tools/ae/cli.ts` is a separate machine/human adapter. It consumes public HTTP surfaces and projects failures through `tools/ae/lib/output.ts`.

### Deterministic domain and kernel layer

- `src/modules/common/` supplies canonical digests, stable hashes, IDs, normalization, bounded JSON, result types, and the central action contract in `action.ts`.
- `src/modules/actions/index.ts` explicitly registers action constants from registry, Customer Request, inquiry, operation, work-tree, study, storefront, demand, and settings modules. Registration is not side-effect discovered.
- `src/modules/business/`, `src/modules/catalog/`, and `src/modules/registry/` own business identity, offerings, public catalog readbacks, and the canonical agent-native `ServiceDto`/`endpoints[]` projection in `src/modules/registry/internal/service-projection.ts` and `src/modules/registry/internal/services-api-projection.ts`.
- `src/modules/capability-contract/` validates bounded AE contract documents and JSON Schema; `src/modules/capability-supply/` owns source import, admission, publication, bindings, provider authority, readiness, lifecycle, pricing, and operation projection.
- `src/modules/capability-execution/` owns DB-described keyless execution plus the authenticated operation invocation seam. `src/modules/action-invocation/` owns durable claims, attempts, release fences, mandates, reconciliation, and invocation projections.
- `src/modules/answer/` contains answer contracts, UI frames, synthesis, and gates. `src/modules/answer-thread/` contains durable reservation, orchestration, checkpointing, persistence, ownership, sharing, and readback.
- `src/modules/customer-request/` keeps semantic interpretation and route compilation proposal-only. Route mandates, prepared actions, invocation authority, and durable execution live in `src/modules/customer-request/`, `src/modules/action-invocation/`, and the Convex route workers.
- Supporting domains include `inquiries`, `discovery`, `storefront`, `study`, `work-tree`, `money`, `harness`, `security`, `observability`, `notification-outbox`, `agent-access`, `external-run`, `demand`, `seo`, and `project-spine`.

### Durable Convex layer

- `convex/schema.ts` composes tables for answer threads, action/capability invocation, business/catalog, capability contracts and supply, Customer Request, agent access, registry, routing history, demand/discovery, harness, inquiries, notification outbox, observability, security, exact money, settings, Project Spine, work trees, studies, and external runs.
- `convex/*.ts` contains Convex validators and durable adapters. Representative sources are `convex/answerThreads.ts`, `convex/registry.ts`, `convex/catalog.ts`, `convex/business.ts`, `convex/capabilitySupply.ts`, `convex/capabilitySupplyOperations.ts`, `convex/capabilityOperationInvocations.ts`, and `convex/customerRequestApplication.ts`.
- `convex/http.ts` currently registers retired V1 routing/MCP responses; public TanStack routes are the active HTTP surface. `convex/crons.ts` schedules readiness probes, inquiry abuse cleanup, source-write nonce cleanup, and OAuth grant cleanup.
- `convex/_generated/` is generated API/server/data-model output and is consumed by Convex adapters, not by browser routes.

### External model and protocol adapters

- `src/modules/model-gateway/public.ts` is the single OpenRouter provider seam. `src/modules/answer/internal/answer-tool-use-agent.ts` uses the AI SDK tool loop and structured `AnswerProse` output while AE retains tool admission, budgets, evidence, and grounding.
- `src/modules/capability-execution/operation-execute.functions.ts` is a DB-driven, fail-closed executor. `convex/capabilitySupplyOperations.ts` supplies the descriptor; the executor rechecks operation identity, keyless authority, HTTPS target, schema, GET/http-json eligibility, bounds, response shape, and evidence digest.
- `src/modules/capability-supply/route-transport-runtime.ts` and `src/modules/action-invocation/` handle provider connections, non-keyless/paid transport, attempts, payment/reconciliation, and durable outcome states separately from the keyless answer tool.
- `src/lib/server/mcp-api.ts` projects explicitly registered actions through the installed MCP streamable HTTP SDK. `src/modules/network-guard/` and x402 adapters are protocol-specific safety boundaries.

## Data Flow

### Browser answer turn

1. A query submitted at `/` is redirected to `/t/new` by `src/routes/index.tsx`; `src/routes/t.new.tsx` mounts `AeChat` with `threadId={null}` and an optional bounded `q`.
2. `AeChat` posts JSON to `/api/answer/turn` with `X-AE-Turn-Key`. `src/routes/api.answer.turn.ts` enforces content type, body/key bounds, Zod input, rate admission, request correlation, and optional authenticated operation context.
3. `reserveAnswerTurn` in `src/modules/answer-thread/answer-thread.functions.ts` calls `convex/answerThreads.ts` before model/provider work. Convex binds session, thread, turn, sequence, request digest, and replay state.
4. The route streams typed `AnswerTurnFrame` data through the AI SDK UI stream. `streamAnswerTurn` in `src/modules/answer-thread/internal/turn-orchestrator.ts` runs the harness phases for context, intent, route, retrieval, model, gate, assembly, persistence, and report.
5. Retrieval-first paths use registry and operation actions. When a live capability is eligible, `answer-tool-use-agent.ts` builds strict per-operation tools from the descriptor returned by `convex/capabilitySupplyOperations.ts`; the closure records an `operation.execute` call and runs the validated keyless executor.
6. The answer gate grounds provider slugs and live operation results, rejects unsafe or ungrounded prose, and produces an accepted snapshot or a typed failure. The turn and tool records are persisted through `convex/answerThreads.ts` and harness finalization before `complete` is emitted.
7. `AeThreadTurnStreamSection` reduces transient frames, refreshes owner readback, and lets the durable projection replace optimistic state. Stop, share, revoke, and `/s/$shareToken` use dedicated durable/read-only routes.

### Public catalog and operation flow

`GET /api/v1/services` is handled by `src/routes/api.v1.services.ts`, invokes `registryServicesListAction`, reads the public business/offering projection through `src/modules/registry/registry.functions.ts` and `convex/registry.ts`, then returns one canonical `ServiceDto` per business. `src/modules/registry/internal/services-api-projection.ts` flattens offering endpoints and adds `operationRef`, exact pricing, networks, provenance, and settlement fields only when capability-supply linkage proves them.

An operation discovered through registry search can be invoked in two distinct ways. The answer chat uses keyless `operation.execute` over a source descriptor. An authenticated external agent uses `POST /api/v1/operations/execute`, `src/lib/server/operation-invoke-api.ts`, and `operation.invoke:v1`: bearer authentication and scope admission precede a Convex action, durable invocation reservation/dispatch, provider execution, and completed/pending/authority/reconciliation/refused projection. Recovery routes read status, cancel, or reconcile the durable invocation.

### Owner supply admission flow

`/_operator/owner/supply` and `/_operator/owner/supply/$offeringRef` load owner readbacks through `src/modules/capability-supply/supply-funnel.functions.ts`. The editor saves the catalog offering, performs source-specific preflight, and submits prepared OpenAPI/MCP/Agent Plugin/x402 material to the canonical admission path. `convex/capabilitySupply.ts:publishPreparedCapability` verifies owner identity, published business ownership, current catalog origin/revision, source-write context, production runtime, and prepared digests before persisting publication/binding state. Readiness, contract test, recheck, withdraw, and republish remain durable lifecycle commands.

### Agent and CLI flow

`/mcp` calls `src/lib/server/mcp-api.ts`, which derives tools from `src/modules/actions/index.ts`; anonymous access is limited to read-only actions, while authenticated operations and Customer Request actions require declared scopes/modes. `/api/v1/requests` and nested request routes use `src/lib/server/customer-request-agent-api.ts` for bearer/OAuth identity, authority-mode checks, proposal compilation, confirmation, execution, recovery, and evidence readback.

`npm run ae -- ask ...` in `tools/ae/commands/ask.ts` consumes the answer SSE protocol and projects typed work/result/problem state. `npm run ae -- invoke ...` in `tools/ae/commands/invoke.ts` uses only the authenticated operation gateway, waits on bounded status polling for pending invocations, and emits human or JSON output through `tools/ae/lib/output.ts`.

## State Management

- Convex rows are authoritative for answer reservations, turn/tool records, capability publications, catalog revisions, operation invocations, Customer Request revisions, route generations, work-tree generations, money ledgers, readiness observations, and notification/workflow state.
- Answer turns use request digests, client keys, reservation generations, durable checkpoints, and owner-scoped projections. Browser state in `AeChat` is explicitly optimistic/transient and converges to Convex readback; local thread records are navigation support, not authority.
- Customer Request snapshots, plan revisions, route plans, mandates, action preparation, and execution journals separate proposal state from effect authority. Models can propose; durable mandate/action seams decide.
- Capability identity is carried through contract digest, publication revision, binding identity, source digest, pricing digest, and `operation:v1:<digest>` references. Lifecycle/readiness/authority rechecks prevent stale rows from becoming executable.

## Key Abstractions

- **Public module seam:** `public.ts` contracts and projection types; `internal/` policy, schemas, and implementation.
- **Action contract:** `defineAction`, `ActionContext`, consequence/authority/retry metadata, explicit `listActions`, and `listMcpActions` in `src/modules/common/action.ts` and `src/modules/actions/index.ts`.
- **Source transport:** `sourceQuery`, `sourceMutation`, `sourceAction`, `ConvexSourceTransport`, and `call*Source*` in `src/lib/server/convex-source.ts`.
- **Capability identity:** `defineCapabilityContract`, contract refs/digests, publication/binding descriptors, canonical `operationRef`, and exact `PricingConfig`/`ExactAmount` types.
- **Projection-first public API:** catalog, Services, registry operations, discovery, inquiries, answer, admin, and work-tree routes return purpose-built readbacks rather than raw Convex documents.
- **Answer evidence:** `AnswerEvent`, `AnswerTurnFrame`, `FrozenTurnEvidence`, `AnswerSnapshot`, harness journals, and `PublicThreadProjection` separate transient events, private evidence, and public readback.
- **Authority/effects:** route mandates, prepared actions, action invocation claims/attempts/release fences, standing mandates, payment evidence, and reconciliation states in `src/modules/action-invocation/`.

## Entry Points

- Runtime bootstrap: `src/start.ts`; browser router: `src/router.tsx`; root document: `src/routes/__root.tsx`; generated route graph: `src/routeTree.gen.ts`.
- Browser families: `/`, `/t/new`, `/t/$threadId`, `/s/$shareToken`, `/$slug`, `/$slug/inquiry`, `/claim`, `/for-providers`, and `/_operator/*` route files.
- API families: answer turn/thread/share/Stop, business/registry/services, operation invoke/status/cancel/reconcile, Customer Request, inquiries, storefront, notifications/webhooks, OAuth, discovery files, MCP, health/ready, and the `src/routes/api.$.ts` RFC 9457 catch-all.
- Agent/discovery files: `src/routes/mcp.ts`, `src/routes/SKILL[.]md.ts`, `src/routes/llms[.]txt.ts`, `src/routes/robots[.]txt.ts`, `src/routes/sitemap[.]xml.ts`, `.well-known` routes, and `/$slug.ucp.ts`.
- Durable backend roots: `convex/schema.ts`, `convex/answerThreads.ts`, `convex/capabilitySupply.ts`, `convex/capabilitySupplyOperations.ts`, `convex/capabilityOperationInvocations.ts`, `convex/registry.ts`, `convex/customerRequestApplication.ts`, `convex/http.ts`, and `convex/crons.ts`.
- CLI/evaluation roots: `tools/ae/cli.ts`, `tools/ae/commands/`, `eval/`, and the boundary-partitioned `tests/` tree.

## Error Handling

- `src/lib/errors.ts` defines the canonical RFC 9457 `ProblemDetails` shape with stable code/kind semantics; `src/lib/server/problem.ts` emits `application/problem+json` and `Cache-Control: no-store`.
- Route adapters use explicit method guards, bounded body readers, Zod schemas, rate admission, authentication, and `src/routes/api.$.ts` for unknown API paths. Source failures are mapped from `ConvexSourceError` without forwarding arbitrary backend payloads.
- Answer failures use the allowlisted `AnswerTurnProblem` vocabulary in typed SSE frames and durable terminal rows. The browser and CLI distinguish malformed streams, unavailable source, refusal, stop, and complete outcomes.
- Capability/keyless execution and operation invocation return discriminated `ok`/`completed`/`pending`/`needs_authority`/`reconciliation_required`/`refused`/`error` results. Unknown payment/provider outcomes remain explicit rather than synthetic success.
- MCP projects action failures into structured JSON-RPC tool errors; React route boundaries and operator shells render safe pending/error states while private projections conceal owner/customer data.

## Cross-Cutting Concerns

- **Identity and authorization:** Clerk session gates, pseudonymous answer sessions, agent-access principals/scopes, Customer Request authority modes, owner/admin membership, MCP tiers, share HMAC tokens, and signed guest assertions are separate mechanisms checked at their owning boundary.
- **Write admission and idempotency:** source-write middleware/context, operation keys, request digests, reservation keys, expected revisions, generation fences, idempotency keys, and Convex mutation checks protect writes and replay.
- **Bounds and network safety:** request/response byte caps, schema depth/node limits, HTTPS/public-target checks, DNS/private-target guards, timeouts, manual redirects, and JSON/content-type validation are distributed through `src/lib/server/bounded-request-body.ts`, `src/modules/network-guard/`, capability contracts, and execution adapters.
- **Integrity and evidence:** canonical digests, source/contract/pricing hashes, operation refs, result hashes, harness journals, audit events, payment/reconciliation evidence, and redacted projections keep model/provider output subordinate to durable source.
- **Observability:** request correlation, Sentry/PostHog adapters, client boot/error boundaries, funnel events, gateway telemetry, and harness timings are additive; they cannot grant domain authority.
- **Scheduling and recovery:** `convex/crons.ts`, Convex workpool/worker files, route execution journals, action invocation recovery, and reconciliation commands own retries, cancellation, cleanup, and readback.
- **Bundle isolation:** server-only Convex/Clerk/Graphology imports stay behind server functions and adapters; route/client bundle safety and import-boundary scans prevent raw Convex/private-module edges from crossing into browser code.

*Architecture analysis: 2026-08-09*

_Refresh marker: current-source refresh completed 2026-08-09. This document is the conceptual map; `.planning/codebase/STRUCTURE.md` is the physical layout map._
