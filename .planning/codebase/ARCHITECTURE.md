<!-- refreshed: 2026-08-15 -->
# Architecture

**Analysis Date:** 2026-08-15

[`PROMPT-DATA-FLOW.md`](PROMPT-DATA-FLOW.md) is the primary prompt and data-flow
map. Any change to prompt construction, model/tool orchestration, evidence,
persistence, replay, or projection boundaries MUST update it in the same batch.

## System Overview

```text
┌──────────────────────────────────────────────────────────────────────────┐
│                         Public host surfaces                             │
├───────────────────────┬──────────────────────┬───────────────────────────┤
│ React/HTML + HTTP API │ MCP + agent files    │ External-agent CLI        │
│ `src/routes/`         │ `src/routes/mcp.ts`  │ `tools/ae/cli.ts`         │
└───────────┬───────────┴──────────┬───────────┴─────────────┬─────────────┘
            │                      │                         │
            ▼                      ▼                         ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                 Adapters, middleware, and action registry                │
│ `src/start.ts` · `src/lib/server/` · `src/modules/actions/index.ts`      │
└──────────────────────────────────┬───────────────────────────────────────┘
                                   │
                                   ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                     Domain/application modules                           │
│ `src/modules/*/{public,server}.ts` · `src/modules/*/*.functions.ts`      │
│ contracts → supply/registry → answer/customer request → invocation/money │
└──────────────────────────────────┬───────────────────────────────────────┘
                                   │ typed source ports
                                   ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                Convex source authority and durable workers               │
│ `convex/schema.ts` · `convex/*.ts` · `convex/convex.config.ts`           │
│ tables, transactions, schedules, workpool/workflow, external I/O actions │
└──────────────────────────────────┬───────────────────────────────────────┘
                                   │
                                   ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ Supplier runtimes, model providers, payment rails, Clerk, observability │
│ reached only through guarded server/Convex action adapters               │
└──────────────────────────────────────────────────────────────────────────┘
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| TanStack Start host | Owns SSR, file routes, server handlers, root document, and middleware composition | `src/start.ts`, `src/router.tsx`, `src/routes/__root.tsx` |
| Route adapters | Parse HTTP/UI input, authenticate or rate-limit, call public module seams, and project responses | `src/routes/`, especially `src/routes/api.answer.turn.ts` and `src/routes/api.v1.operations.execute.ts` |
| Canonical action plane | Defines one typed operation contract and explicitly projects it to UI, HTTP, Answer, CLI, agent JSON, and MCP | `src/modules/common/action.ts`, `src/modules/actions/index.ts` |
| MCP adapter | Filters the action registry by read/write authority, validates MCP requests and action outputs, and serves Streamable HTTP | `src/lib/server/mcp-api.ts`, `src/routes/mcp.ts` |
| Capability contract | Owns the transport-neutral capability grammar, JSON Schema validation, semantic input/evidence projection, and digests | `src/modules/capability-contract/public.ts` |
| Capability supply | Owns admitted offerings, bindings, eligibility, publication, readiness, immutable operation identity, and route transport | `src/modules/capability-supply/` |
| Registry | Projects source-owned business and Market Operation data into bounded public read DTOs | `src/modules/registry/public.ts`, `src/modules/registry/registry.actions.ts`, `src/modules/registry/operations.actions.ts` |
| Answer runtime | Interprets a conversational request, selects tools/operations, assembles public artifacts, gates evidence, and streams typed events | `src/modules/answer/`, `src/modules/answer-thread/internal/turn-orchestrator.ts` |
| Harness | Supplies the generic phase loop, tool validation/execution, model accounting, approval policy, evidence envelopes, and replay journal | `src/modules/harness/public.ts`, `src/modules/harness/run-loop.ts` |
| Customer Request | Owns the broader outcome aggregate, semantic compilation, evaluation, preparation, route mandates, authority, execution journals, and recovery | `src/modules/customer-request/` |
| Capability execution | Owns keyless reads and the authenticated operation invocation application service, including idempotency and recovery contracts | `src/modules/capability-execution/operation-execute.server.ts`, `src/modules/capability-execution/operation-invoke.ts` |
| Action Invocation | Owns durable prepare/authorize/lease/execute/reconcile state transitions used by consequential operations | `src/modules/action-invocation/`, `convex/actionInvocationControl.ts` |
| Money | Owns exact amounts, credit/budget admission, usage, internal ledger entries, provider accrual, external-spend reservations, Stripe, and payout state | `src/modules/money/`, `convex/moneyLedger.ts` |
| Convex source | Composes domain-owned tables, executes transactions, hosts internal workers, and supplies generated function references | `convex/schema.ts`, `convex/`, `convex/_generated/` |
| Source-write security | Binds writes to request origin/body/command, signing scope, correlation identity, and a single-use nonce | `src/modules/security/source-write-admission.ts`, `src/lib/server/source-write-admission.ts`, `convex/sourceWriteAdmission.ts` |

## Pattern Overview

**Overall:** Modular monolith with hexagonal domain boundaries, file-based host adapters, Convex source authority, and asynchronous durable execution.

**Key Characteristics:**
- Keep domain contracts and deterministic decisions in `src/modules/`; keep persistence and scheduling adapters in `convex/`.
- Publish module behavior through explicit `public.ts`, `server.ts`, action definitions, or `*.functions.ts` seams; treat `internal/` as module-private.
- Treat routes as adapters rather than owners of schema, persistence, execution state machines, or provider transport.
- Define agent-callable operations once with `defineAction` in `src/modules/common/action.ts`, then explicitly register them in `src/modules/actions/index.ts`.
- Use canonical digests and immutable references across capability, invocation, authority, evidence, money, and replay boundaries.
- Separate read projection from write authority: anonymous reads are bounded projections; writes require authentication and/or source-write admission.
- Keep consequential external work durable: reserve identity and authority transactionally, dispatch through Convex workpool/workflow, then reconcile uncertain outcomes.
- Compose the Convex schema from table maps owned by domain modules rather than centralizing all table definitions in `convex/schema.ts`.

## Layers

**Host and Presentation:**
- Purpose: Render public/operator interfaces and expose HTTP, OAuth, discovery, webhook, answer, and MCP endpoints.
- Location: `src/routes/`, `src/components/`, `src/styles/`
- Contains: TanStack file routes, React components, server handlers, SEO/agent discovery documents, webhooks.
- Depends on: `src/lib/`, module public seams, server-function seams.
- Used by: Browsers, crawlers, external agents, providers, operators.

**Request Boundary and Infrastructure Adapters:**
- Purpose: Normalize authentication, correlation, security headers, rate limits, bounded bodies, source-write admission, Convex transport, and provider-specific I/O.
- Location: `src/start.ts`, `src/lib/server/`, `src/lib/http/`, `src/lib/observability/`
- Contains: Middleware, Clerk/agent access adapters, RFC 9457 problem projection, Convex HTTP client, guarded operation gateway.
- Depends on: Framework APIs, module contracts, environment configuration.
- Used by: Routes, server functions, action surfaces.

**Action Contract Plane:**
- Purpose: Give each machine operation one input/output/effect/authority/retry contract and one implementation entry.
- Location: `src/modules/common/action.ts`, `src/modules/actions/index.ts`, `src/modules/*/*.actions.ts`
- Contains: Zod schemas, effect metadata, surface exposure, runners, deterministic MCP tool names.
- Depends on: Domain module public contracts.
- Used by: MCP, HTTP routes, Answer tools, CLI, harness, agent descriptors.

**Domain and Application:**
- Purpose: Own business invariants, state-transition decisions, projections, and ports without owning transport setup.
- Location: `src/modules/`
- Contains: Capability contracts, supply, registry, requests, answer threads, invocation, money, security, work trees, inquiries, observability.
- Depends on: Other modules only through deliberate public/application seams and `src/modules/common/`.
- Used by: Host adapters and Convex functions.

**Durable Source and Workers:**
- Purpose: Persist canonical state and atomically enforce indexes, ownership, idempotency, leases, admission, and money transitions.
- Location: `convex/`
- Contains: Public/internal queries and mutations, Node actions, workpool/workflow workers, crons, schema composition.
- Depends on: `src/modules/*` validators and deterministic domain functions plus Convex components.
- Used by: Server-side source transports in `src/lib/server/convex-source.ts`.

**External Edges:**
- Purpose: Invoke supplier-hosted operations, models, payments, email/notification services, authentication, and telemetry.
- Location: `src/modules/capability-supply/internal/transport-adapters.ts`, `src/modules/model-gateway/`, `convex/capabilityOperationInvocationWorker.ts`, `src/lib/observability/`
- Contains: Guarded fetch, DNS/SSRF policy, signing, x402 settlement verification, Stripe, OpenRouter, Sentry/PostHog.
- Depends on: Server-only credentials and admitted immutable descriptors.
- Used by: Convex actions and server-only application services.

## Data Flow

### Primary Request Path

1. A browser submits a query through `/t/new`; TanStack resolves the generated route tree and root middleware (`src/router.tsx:6`, `src/start.ts:91`, `src/routes/t.new.tsx`).
2. The chat client posts a bounded JSON command and `x-ae-turn-key` to the answer endpoint (`src/routes/api.answer.turn.ts:36`, `src/routes/api.answer.turn.ts:68`).
3. The route establishes correlation/session identity, validates content and rate admission, optionally resolves an authenticated operation principal, and reserves a durable turn (`src/routes/api.answer.turn.ts:72`, `src/routes/api.answer.turn.ts:121`, `src/routes/api.answer.turn.ts:154`).
4. The Answer orchestrator loads prior durable context, classifies safety/intent, selects a turn path, and runs the harness phases `context → intent → route → retrieval → model → gate → assemble → persist → report` (`src/modules/answer-thread/internal/turn-orchestrator.ts:772`, `src/modules/answer-thread/internal/turn-orchestrator.ts:964`, `src/modules/answer-thread/internal/turn-orchestrator.ts:1068`).
5. Read tools resolve through the canonical action registry, execute through the harness, and buffer validated tool evidence rather than writing mid-stream (`src/modules/answer-thread/internal/answer-tool-registry.ts:17`, `src/modules/answer-thread/internal/tool-runner.ts:63`).
6. Operation discovery/selection uses capability-supply descriptors; keyless operations use guarded server fetch, while authenticated operations use the shared invocation service (`src/modules/capability-execution/operation-execute.server.ts:22`, `src/modules/capability-execution/operation-invoke.ts:504`).
7. The orchestrator gates and freezes public artifacts, persists the answer and harness journal through source-write-admitted Convex mutations, then sends the terminal typed frame (`src/modules/answer-thread/internal/turn-orchestrator.ts:1685`, `src/modules/answer-thread/internal/turn-orchestrator.ts:1762`, `convex/answerThreads.ts:235`).
8. `createUIMessageStreamResponse` returns typed transient frames to the React transcript; durable thread reads reconstruct the public projection from Convex (`src/routes/api.answer.turn.ts:182`, `src/routes/api.answer.turn.ts:250`, `src/modules/answer-thread/answer-thread.functions.ts`).

### Market Operation Invocation

1. HTTP, MCP, CLI, or Answer chooses the same registered `operation.invoke` action; the adapter derives an `AgentAccessPrincipal` and injects one `OperationInvokeService` (`src/modules/actions/index.ts:53`, `src/lib/server/mcp-api.ts:270`, `src/lib/server/operation-invoke-api.ts`).
2. The application service validates the public operation reference/input, reads the key grant, derives deterministic request/invocation identities, and reserves idempotency before dispatch (`src/modules/capability-execution/operation-invoke.ts:511`, `src/modules/capability-execution/operation-invoke.ts:536`, `src/modules/capability-execution/operation-invoke.ts:657`).
3. Current immutable operation material and authority are checked against publication, binding, contract, environment, budget, and grant generation (`src/modules/capability-execution/operation-invoke.ts:571`, `src/modules/capability-execution/operation-invoke.ts:860`).
4. Production dispatch is committed in Convex and enqueued to workpool; the Node worker claims the attempt before external I/O (`convex/capabilityOperationInvocations.ts`, `convex/capabilityOperationInvocationWorker.ts`).
5. The worker signs and invokes the admitted supplier transport through public-target DNS guards; x402 payment uses a separately reserved external-spend identity and verifies settlement evidence (`src/modules/capability-supply/route-transport-runtime.ts`, `convex/capabilityOperationInvocationWorker.ts`, `src/modules/money/internal/external-spend.ts`).
6. Transactional finalization records invocation evidence, usage, charge/provider/rake ledger effects, or a reconciliation-required state; status/cancel/reconcile read the same durable identity (`convex/capabilityOperationInvocations.ts`, `convex/moneyLedger.ts`).

### Customer Request Execution

1. Request routes/actions parse facts and call application seams rather than constructing routing authority (`src/routes/api.v1.requests.ts`, `src/modules/customer-request/customer-request.actions.ts`).
2. The Customer Request aggregate compiles semantic intent against capability contracts, evaluates supply candidates, and prepares action options (`src/modules/customer-request/public.ts`, `src/modules/customer-request/application/`).
3. Confirmation and route-mandate admission bind principal, facts, plan generation, spend, and exact route-step authority before execution (`src/modules/customer-request/route-mandate.ts`, `src/modules/customer-request/route-mandate-admission.ts`, `convex/customerRequestRouteMandateAdmission.ts`).
4. Convex route execution and workpool workers journal dispatch, transport, cancellation, evidence, problems, and reconciliation (`convex/customerRequestRouteExecution.ts`, `convex/customerRequestRouteTransportWorker.ts`, `src/modules/customer-request/route-execution/`).

### MCP and CLI Projection

1. `/mcp` delegates GET/POST/DELETE to the rate-limited MCP adapter (`src/routes/mcp.ts:7`).
2. Anonymous callers see only read-only, credential-free registered actions; authenticated calls are filtered by scope and authority mode (`src/lib/server/mcp-api.ts:270`, `src/lib/server/mcp-api.ts:360`).
3. MCP input/output validation reuses each canonical action's Zod schemas; top-level union outputs are projected into `tools/list` without a second schema owner (`src/lib/server/mcp-api.ts:147`, `src/lib/server/mcp-api.ts:294`).
4. `tools/ae/cli.ts` exercises public HTTP/OAuth surfaces as an external agent and does not import Convex persistence (`tools/ae/cli.ts:1`).

**State Management:**
- Durable canonical state lives in Convex tables composed by `convex/schema.ts`; indexes encode intended access paths.
- React route/component state is ephemeral presentation state; source truth is reloaded through route loaders, server functions, or HTTP streams.
- Answer turns use reservation keys, request digests, generations, leases, checkpoints, frozen evidence/prose, and replay-safe finalization.
- Consequential operations use deterministic invocation/attempt references, idempotency reservations, authority generations, release fences, evidence hashes, and explicit uncertain-outcome states.
- Shared process state is limited to bounded caches or test seams such as the compiled-schema caches in `src/modules/capability-contract/public.ts` and the test transport in `src/lib/server/convex-source.ts`.

## Key Abstractions

**Action:**
- Purpose: Canonical machine-operation contract spanning every host surface.
- Examples: `src/modules/common/action.ts`, `src/modules/actions/index.ts`, `src/modules/registry/operations.actions.ts`
- Pattern: Typed command with Zod input/output, effects, authority, retry semantics, explicit registration, and injected context.

**Capability Contract and Published Operation:**
- Purpose: Separate neutral input/output/effect/evidence semantics from supplier publication, transport, readiness, and commercial material.
- Examples: `src/modules/capability-contract/public.ts`, `src/modules/capability-supply/public.ts`
- Pattern: Immutable, digest-bound value objects projected through supply and registry ports.

**Source Port:**
- Purpose: Keep framework routes and domain logic independent of Convex function implementation details.
- Examples: `src/lib/server/convex-source.ts`, `src/modules/answer-thread/answer-thread.functions.ts`, `src/modules/capability-supply/operation-source.ts`
- Pattern: Typed `FunctionReference`/port wrappers with authenticated and public transports.

**Harness Run Loop:**
- Purpose: Apply one observable lifecycle to model/tool orchestration and durable evidence.
- Examples: `src/modules/harness/run-loop.ts`, `src/modules/harness/public.ts`, `src/modules/answer-thread/internal/answer-harness-operation.ts`
- Pattern: Generic phased state machine with tool policy, model accounting, gate, persist, and report hooks.

**Reservation, Lease, and Fence:**
- Purpose: Make retries safe and prevent stale workers from committing effects.
- Examples: `src/modules/answer-thread/internal/answer-turn-checkpoint.ts`, `convex/answerThreads.ts`, `src/modules/action-invocation/`, `convex/capabilityOperationInvocations.ts`
- Pattern: Deterministic identity plus generation/version checks and explicit replay/conflict/reconciliation outcomes.

**Exact Amount and Ledger:**
- Purpose: Represent money without floating-point ambiguity and separate internal accounting from external payment settlement.
- Examples: `src/modules/money/public.ts`, `src/modules/money/internal/exact-amount.ts`, `src/modules/money/internal/external-spend.ts`, `convex/moneyLedger.ts`
- Pattern: Currency/units/exponent values, append-oriented entries, idempotent transactions, and digest-bound evidence.

## Entry Points

**Web/SSR Application:**
- Location: `src/start.ts`, `src/router.tsx`, `src/routes/__root.tsx`
- Triggers: Vite/Nitro request or browser navigation.
- Responsibilities: Middleware, route tree, root providers, SSR document, global error/telemetry UI.

**File Routes and APIs:**
- Location: `src/routes/`, generated index at `src/routeTree.gen.ts`
- Triggers: Browser navigation, HTTP requests, webhooks, OAuth, agent discovery.
- Responsibilities: Boundary validation, admission, module dispatch, response projection.

**MCP Host:**
- Location: `src/routes/mcp.ts`, `src/lib/server/mcp-api.ts`
- Triggers: MCP Streamable HTTP GET/POST/DELETE.
- Responsibilities: Action discovery, authentication tiering, schema projection, tool execution.

**AE CLI:**
- Location: `tools/ae/cli.ts`
- Triggers: `npm run -s ae -- <command>`.
- Responsibilities: External-agent exercise of public HTTP and OAuth contracts.

**Convex Function Surface:**
- Location: `convex/*.ts`, schema at `convex/schema.ts`
- Triggers: Convex clients, server source transports, schedulers, workpool/workflow.
- Responsibilities: Transactional persistence, source authority, durable dispatch, background work.

**Scheduled Maintenance:**
- Location: `convex/crons.ts`
- Triggers: Convex intervals.
- Responsibilities: Supply readiness refresh and bounded cleanup of abuse buckets, source-write nonces, and OAuth grants.

## Product frontier strength (2026-08-15)

Cleanup must not hollow the market loop. Positive floor:

- Manifest: `.planning/evidence/product-frontier-baseline/product-frontier-manifest.json`
- Verifier: `npm run check:product-frontier`
- Protected proving ground: `src/modules/study/`, `src/modules/external-run/`, WorkTree re-entry via notification-outbox
- Single spines: `operation-invoke.ts`, `route-transport-runtime.ts`, `moneyLedger.ts`
- Deferred archaeology: routing-kernel history tables and project-spine code remain until hosted proof + successor characterization

## Architectural Constraints

- **Threading:** Web/server code uses the Node event loop; external work is asynchronous. Convex mutations are serializable transactions, actions perform I/O, and workpool/workflow provide durable background concurrency.
- **Global state:** Avoid mutable module state. Existing state is bounded and deliberate: compiled validator caches in `src/modules/capability-contract/public.ts`, observability SDK initialization in `src/lib/observability/`, and the test-only source transport in `src/lib/server/convex-source.ts`.
- **Circular imports:** No accepted domain cycle is documented. Import tests in `tests/imports/` enforce directional boundaries; use public/application seams rather than deep reciprocal imports.
- **Server/client split:** Node-only code stays behind `server.ts`, server functions, route handlers, or Convex Node actions. Dynamic imports in `src/routes/api.answer.turn.ts` prevent answer execution from entering the client route graph.
- **Convex runtime split:** Queries/mutations remain in the default runtime; Node actions such as `convex/capabilityOperationInvocationWorker.ts` carry `"use node"` and do not export queries/mutations.
- **Source authority:** Product projections must consume source-owned records. Components, transcripts, browser state, fixture state, and provider responses do not mint authority.
- **Bounded work:** Public bodies, result sets, thread lengths, schema/value depth, tool calls, cleanup batches, and retries have explicit caps.
- **Trust boundaries:** Caller identity is not authority. Clerk/agent access establishes identity, source-write admission authorizes source mutations, and operation/route mandates authorize effects.
- **Runtime ownership:** AE owns market, policy, invocation identity, evidence, metering, and reconciliation; supplier implementations remain supplier-hosted.
- **Generated files:** Never hand-edit `src/routeTree.gen.ts` or `convex/_generated/`.

## Anti-Patterns

### Route-Owned Persistence or Domain Logic

**What happens:** A route imports Convex schema/internals, creates a `ConvexHttpClient`, or reimplements a state transition.
**Why it's wrong:** It creates a second source of truth and bypasses authentication, admission, idempotency, and import-boundary tests.
**Do this instead:** Keep routes as adapters over `public.ts`, `server.ts`, `*.functions.ts`, or registered actions; use `src/lib/server/convex-source.ts` for source transport. The guardrail is `tests/imports/route-boundary.test.ts`.

### Parallel Action or Execution Plane

**What happens:** A new MCP/HTTP/CLI tool defines separate schemas or directly calls supplier transport.
**Why it's wrong:** Surface behavior, authority, retries, evidence, and output validation drift.
**Do this instead:** Define the contract with `defineAction` in the owning module, register it in `src/modules/actions/index.ts`, and route consequential execution through `src/modules/capability-execution/operation-invoke.ts`.

### Deep Imports Across Module Boundaries

**What happens:** A consumer imports another module's `internal/` files to reach persistence shapes or decision helpers.
**Why it's wrong:** Ownership becomes ambiguous and domain layers couple to transport/storage details.
**Do this instead:** Export the smallest necessary seam from the owner's `public.ts`, `server.ts`, or application index. Boundary examples are enforced by `tests/imports/capability-contract-boundaries.test.ts`, `tests/imports/capability-supply-boundaries.test.ts`, and `tests/imports/customer-request-boundaries.test.ts`.

### External Effect Before Durable Claim

**What happens:** Provider or payment I/O starts before reservation, authority, attempt identity, and release fencing commit.
**Why it's wrong:** A crash or retry can duplicate an irreversible effect or lose reconciliation identity.
**Do this instead:** Reserve and claim in Convex first, then invoke from `convex/capabilityOperationInvocationWorker.ts`; finish as completed, refused, or reconciliation-required.

### Projection as Authority

**What happens:** A public DTO, model response, prior transcript, fixture, or UI selection is trusted to authorize a write or effect.
**Why it's wrong:** Projections can be stale, partial, manipulated, or semantically insufficient.
**Do this instead:** Re-read current source records and verify digest/generation/ownership at the final mutation or worker boundary in `convex/`.

## Error Handling

**Strategy:** Validate at every trust boundary, return typed discriminated outcomes for expected domain refusal/replay/conflict states, use RFC 9457 responses at HTTP boundaries, and preserve uncertain external outcomes for reconciliation.

**Patterns:**
- Parse untrusted JSON as `unknown`, bound body size first, then validate with Zod or Convex validators (`src/routes/api.answer.turn.ts`, `src/lib/server/bounded-request-body.ts`).
- Return explicit `kind` unions for expected application outcomes such as `refused`, `pending`, `needs_authority`, `replayed`, `conflict`, and `reconciliation_required` (`src/modules/capability-execution/operation-invoke.ts`).
- Convert boundary failures to stable problem kinds/codes with safe detail and correlation identity (`src/lib/errors.ts`, `src/lib/server/problem.ts`, `src/lib/server/mcp-api.ts`).
- Do not expose raw provider/model/Convex errors to public projections; preserve private evidence and emit redacted public state (`src/modules/harness/evidence-envelope.ts`, `src/modules/answer-thread/internal/public-projection.ts`).
- Never retry an unknown consequential outcome as if no work occurred; require status/reconciliation (`src/modules/action-invocation/`, `convex/capabilityOperationInvocationWorker.ts`).
- Catch observability failures without changing product control flow (`src/start.ts`, `src/lib/observability/`).

## Cross-Cutting Concerns

**Logging:** Request correlation starts in `src/start.ts`/`src/lib/server/request-correlation.ts`; structured harness/runtime events, gateway telemetry, Sentry, and PostHog carry bounded/redacted evidence from `src/modules/harness/`, `src/lib/server/gateway-telemetry.ts`, and `src/lib/observability/`.
**Validation:** Zod owns TypeScript boundary contracts, Convex validators own persisted/function values, JSON Schema owns supplier capability I/O, and canonical digests bind immutable material in `src/modules/common/canonical-digest.ts`.
**Authentication:** Clerk protects human/operator routes and supplies Convex JWTs through `convex/auth.config.ts`; agent OAuth/API keys resolve to `AgentAccessPrincipal` in `src/modules/agent-access/`; source-write admission and mandates remain separate authorization layers.

---

*Architecture analysis: 2026-08-15*
