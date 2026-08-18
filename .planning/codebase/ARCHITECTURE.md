<!-- refreshed: 2026-08-18 -->
# Architecture

**Analysis Date:** 2026-08-18

[`PROMPT-DATA-FLOW.md`](PROMPT-DATA-FLOW.md) is the primary prompt and data-flow
map. Any change to prompt construction, model/tool orchestration, evidence,
persistence, replay, or projection boundaries MUST update it in the same batch.

## System Overview

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                     Distribution adapters (thin)                             │
├──────────────┬──────────────────┬─────────────────┬─────────────────────────┤
│  AE CLI      │  MCP host        │  HTTP routes    │  Answer / UI surfaces   │
│  `tools/ae/` │  `src/routes/    │  `src/routes/   │  `src/routes/api.       │
│              │   mcp.ts`        │   api.v1.*`     │   answer.*`, `_operator`│
└──────┬───────┴────────┬─────────┴────────┬────────┴────────────┬────────────┘
       │                │                  │                     │
       └────────────────┴──────────────────┴─────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                     Action plane (one registry)                              │
│                     `src/modules/actions/index.ts`                           │
│   registry.* · operation.execute · operation.invoke · operation.status/…   │
└────────────────────────────────────┬────────────────────────────────────────┘
                                     │
       ┌─────────────────────────────┼─────────────────────────────┐
       ▼                             ▼                             ▼
┌──────────────┐            ┌─────────────────┐           ┌──────────────────┐
│ Registry +   │            │ Capability      │           │ Agent access +   │
│ supply       │            │ execution       │           │ money + security │
│ projection   │            │ invoke/recover  │           │ admission        │
│ `registry`   │            │ `capability-    │           │ `agent-access`   │
│ `capability- │            │  execution`     │           │ `money`          │
│  supply`     │            │ `action-        │           │ `network-guard`  │
│              │            │  invocation`    │           │                  │
└──────┬───────┘            └────────┬────────┘           └────────┬─────────┘
       │                             │                             │
       └─────────────────────────────┴─────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                     Convex durable runtime                                   │
│  `convex/schema.ts` · `convex/capabilityOperationInvocations.ts`            │
│  `convex/capabilityOperationInvocationWorker.ts` · domain *Ports.ts files   │
└─────────────────────────────────────────────────────────────────────────────┘
```

Program context (2026-08-18): Phases 0–4 of the **atomic operation market reset** are accepted on `main`. Phase 5 has a product-frontier v2 artifact (`ae-product-frontier:v2` in `.planning/evidence/product-frontier-baseline/product-frontier-manifest.json`) but freeze/deprecation cards are not started. AE owns operation identity, authorization, exactly-once durable invocation, delivery evidence, and brokered money. Consuming agents own planning and orchestration. MCP, CLI, and chat are thin adapters over one market kernel. See `.planning/reset/OPERATING-MODEL.md` and `.planning/codebase/CAPABILITY-MAP.md`.

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| Action registry | Single list of machine operations fanning out to HTTP, MCP, CLI, Answer | `src/modules/actions/index.ts` |
| Capability contract | Typed schemas, effects, evidence grammar (transport-neutral) | `src/modules/capability-contract/` |
| Capability supply | Import → publish → bind → eligibility → readiness → route transport | `src/modules/capability-supply/` |
| Registry projection | Search / detail / compare / inspect-plan over published operations | `src/modules/registry/` + `src/modules/capability-supply/operation-projection.ts` |
| Operation invoke | Paid/auth durable invocation, idempotency, authority, recovery | `src/modules/capability-execution/operation-invoke.ts` |
| Operation execute | Keyless read-only execution (MCP + Answer only) | `src/modules/capability-execution/operation-execute.server.ts` |
| Action invocation | Canonical claim, terminal outcome, durable invocation tracer | `src/modules/action-invocation/` |
| Convex invoke runtime | Persist reservations, dispatch worker, reconcile/cancel | `convex/capabilityOperationInvocations.ts` |
| Convex dispatch worker | Outbound provider transport, x402 settlement hooks, evidence | `convex/capabilityOperationInvocationWorker.ts` |
| Agent access | Bearer keys, scopes, OAuth device flow, rate limits | `src/modules/agent-access/` + `src/lib/server/agent-access-auth.ts` |
| Money ledger | Exact charges, budgets, external spend identity | `src/modules/money/` |
| Answer runtime | Bounded AI SDK tool loop over registry + keyless/invoke actions | `src/modules/answer/internal/answer-tool-use-agent.ts` |
| Answer turn path | Lease/checkpoint persistence wrapping `agentTurnPath` | `src/modules/answer-thread/internal/turn-orchestrator.ts`, `src/modules/answer-thread/internal/turns/agent.ts` |
| Customer Request | Outcome → plan → mandate → route execution (proving ground) | `src/modules/customer-request/` |
| AE CLI | External-agent terminal over anonymous reads + authenticated invoke | `tools/ae/cli.ts` |
| MCP adapter | Read-only anonymous + authenticated action projection | `src/lib/server/mcp-api.ts` |
| HTTP invoke gateway | Canonical paid path `/api/v1/operations/call` | `src/lib/server/operation-invoke-api.ts` |

## Pattern Overview

**Overall:** Modular monolith — TanStack Start SSR app with Convex backend, domain modules under `src/modules/`, and a unified **action plane** that all agent surfaces call.

**Key Characteristics:**
- **One kernel, many adapters:** CLI (`tools/ae/`), MCP (`src/routes/mcp.ts`), HTTP (`src/routes/api.v1.*`), and Answer (`src/routes/api.answer.turn.ts`) all resolve to the same registered actions in `src/modules/actions/index.ts`.
- **Public contract surfaces:** Each domain module exposes `public.ts` (and sometimes `server.ts` for Node-only). Cross-module imports go through `public.ts`, not `internal/`.
- **Convex as durable spine:** Mutations, queries, actions, and `"use node"` workers in `convex/` implement exactly-once invocation, route execution, and ledger writes. Module schemas compose into `convex/schema.ts`.
- **Fail-closed money and auth:** Live invoke paths require agent-access principal, source-write admission, and explicit authority modes. Organization/account owns funds; API keys receive narrower grants.
- **Separation of execute vs invoke:** `operation.execute` is keyless read-only (MCP + Answer). `operation.invoke` is paid/destructive with durable recovery (HTTP `/api/v1/operations/call`, CLI `invoke`, MCP when authenticated).

## Layers

**Distribution adapter layer:**
- Purpose: Translate wire protocols (HTTP, MCP, CLI stdout, SSE) into action calls
- Location: `src/routes/`, `src/lib/server/`, `tools/ae/`
- Contains: Route handlers, auth middleware glue, problem+json responses, CLI command runners
- Depends on: Action registry, module `*.actions.ts`, Convex source bridge (`src/lib/server/convex-source.ts`)
- Used by: External agents, browser UI, operator consoles

**Action plane layer:**
- Purpose: Define machine-operation contracts once (`defineAction` in `src/modules/common/action.ts`)
- Location: `src/modules/actions/index.ts`, per-module `*.actions.ts`
- Contains: Action IDs (`operation.invoke`, `registry.operations.search`, …), JSON schemas, surface tags (`http`, `mcp`, `cli`, `answerThread`)
- Depends on: Domain services in modules, route contracts like `src/modules/capability-execution/operation-invoke-entry.ts`
- Used by: All adapters; MCP tool naming via `mcpToolName()` in `src/modules/actions/index.ts`

**Market kernel layer (Layer 0):**
- Purpose: Operation identity, supply admission, registry projection, durable invoke, money, network guard
- Location: `src/modules/capability-contract/`, `capability-supply/`, `capability-execution/`, `registry/`, `action-invocation/`, `money/`, `agent-access/`, `network-guard/`
- Contains: Pure/domain logic, Zod contracts, transport runtime, invoke service orchestration
- Depends on: `capability-contract` grammar only at the bottom; supply reads/writes via Convex ports
- Used by: Action runners, Convex mutations/actions, Answer tool loop

**First-party demand layer (Layer 2 — proving ground):**
- Purpose: Prove the kernel under real Principal UX (Answer chat, Customer Request mandate flow, WorkTree/Study)
- Location: `src/modules/answer/`, `answer-thread/`, `customer-request/`, `work-tree/`, `study/`
- Contains: Turn agents, route-execution machines, harness operations
- Depends on: Market kernel actions and Convex tables
- Used by: `/api/answer/*`, `/api/v1/requests/*`, operator UI routes under `src/routes/_operator/`

**Owner / supplier layer (Layer 3):**
- Purpose: Claim, publish, connections, earnings, invocation recovery UI
- Location: `src/modules/storefront/`, `src/routes/claim*`, `src/routes/_operator/owner.*`, `src/routes/operations.invocations.$invocationRef.tsx`
- Depends on: Supply funnel, agent-access console, capability execution recovery actions
- Used by: Human operators and suppliers

**Convex runtime layer:**
- Purpose: Durable state, scheduled workers, HTTP router stubs, authz
- Location: `convex/`
- Contains: Table definitions (via module `internal/convex-schema.ts`), `*Ports.ts` dependency injection, `*Worker.ts` Node actions
- Depends on: Module logic imported from `src/modules/` (allowed pattern for Convex in this repo)
- Used by: Server routes via `callPublicSourceAction` / `sourceAction` in `src/lib/server/convex-source.ts`

## Data Flow

### Primary invoke path (paid / auth)

1. Client hits canonical gateway: `POST /api/v1/operations/call` (`src/routes/api.v1.operations.call.ts`) — legacy alias remains at `/api/v1/operations/execute` (`src/routes/api.v1.operations.execute.ts`).
2. Handler authenticates bearer principal (`src/lib/server/operation-invoke-api.ts` → `authenticateAgentAccess` in `src/lib/server/agent-access-auth.ts`).
3. Request body validated against `operationInvokeInputSchema` (`src/modules/capability-execution/operation-invoke-contracts.ts`).
4. Source-write admission computed (`src/lib/server/source-write-admission.ts`) for exactly-once command identity.
5. Convex public action invoked: `capabilityOperationInvocations:invoke` (`convex/capabilityOperationInvocations.ts`).
6. Domain orchestration runs in `createOperationInvokeApplication` (`src/modules/capability-execution/operation-invoke.ts`): grant check → authority → idempotency reservation → dispatch scheduling.
7. Worker executes outbound transport: `convex/capabilityOperationInvocationWorker.ts` uses `route-transport-runtime` (`src/modules/capability-supply/route-transport-runtime.ts`), `action-invocation` canonical claim/outcome, and money settlement hooks.
8. Client receives `OperationInvokeResult` (`operation-invoke-contracts.ts`); recovery via `GET /api/v1/operations/$invocationRef`, cancel/reconcile subroutes.

### Registry discovery path (anonymous read)

1. HTTP: `POST /api/v1/market-operations/search|detail|compare|inspect-plan` (`src/routes/api.v1.market-operations.*.ts`) or CLI: `tools/ae/commands/search.ts`, `inspect.ts`, `compare.ts`.
2. Action runner resolves `registry.operations.*` from `src/modules/registry/operations.actions.ts`.
3. Projection logic reads published operations via `src/modules/capability-supply/public.ts` and registry internal search (`src/modules/registry/internal/search.ts`, `search-documents.ts`).
4. Wire DTOs returned; no agent-access key required for anonymous registry reads.

### Keyless execute path (read-only)

1. MCP anonymous tier or Answer tool loop calls `operation.execute` (`src/modules/capability-execution/operation-execute-mcp.actions.ts`).
2. Server execution: `executeKeylessOperation` in `src/modules/capability-execution/operation-execute.server.ts`.
3. No HTTP route exposes `operation.execute`; import boundary tests enforce this (`tests/imports/action-invocation-host-boundaries.test.ts`).

### Answer turn path

1. `POST /api/answer/turn` (`src/routes/api.answer.turn.ts`) admits rate limit and parses `answerTurnRequestSchema` (`src/modules/answer-thread/public.ts`).
2. `streamAnswerTurn` (`src/modules/answer-thread/server.ts`) delegates to `src/modules/answer-thread/internal/turn-orchestrator.ts` for reservation, lease, checkpoint, and harness finalization.
3. Safe turns run `agentTurnPath` (`src/modules/answer-thread/internal/turns/agent.ts`) as one bounded AI SDK tool loop via `answer-tool-use-agent.ts`. Eval tags `model-chosen-tool-loop` and `bounded-tool-loop` in `eval/answer/lib/cases.ts` specify that behavior. Files `intent-router.ts` and `effective-answer-route.ts` do not exist.
4. Tools map from registered actions (`actionToOpenRouterTool` in `src/modules/answer/internal/action-to-tool-spec.ts`); invoke context wired through `createOperationInvokeService`.
5. Turn frames persisted in Convex answer-thread tables; share/read routes under `src/routes/api.answer.threads.*`.

### CLI invoke path

1. `npm run ae -- invoke` (`tools/ae/commands/invoke.ts`) reads OAuth/API key via `tools/ae/commands/connect.ts` helpers.
2. Posts to same `/api/v1/operations/call` contract as HTTP gateway (`OPERATION_INVOKE_ROUTE_CONTRACT` in `operation-invoke-entry.ts`).
3. `status` / `recover` (reconcile) commands mirror `operation.status` and `operation.reconcile` actions.

**State Management:**
- **Browser/session:** Clerk auth for operator UI (`src/start.ts` middleware); guest session cookies for Answer (`src/lib/server/browser-guest-session.ts`).
- **Agent identity:** Agent-access principals stored in Convex (`convex/agentAccessPrincipals.ts`, `agentAccessPolicy.ts`); OAuth device flow routes under `src/routes/oauth.*`.
- **Durable invocation:** `capabilityOperationInvocationTables` in `src/modules/capability-execution/internal/convex-schema.ts`; worker state machine in `convex/capabilityOperationInvocations.ts`.
- **Money:** Ledger tables from `src/modules/money/internal/convex-schema.ts`; charges during worker settlement in `capabilityOperationInvocationWorker.ts`.

## Key Abstractions

**Action (`defineAction`):**
- Purpose: Single machine-operation contract with surfaces, schemas, and admission metadata
- Examples: `src/modules/capability-execution/operation-invoke.actions.ts`, `src/modules/registry/operations.actions.ts`
- Pattern: Register explicitly in `src/modules/actions/index.ts`; never rely on side-effect imports

**Published operation:**
- Purpose: Discoverable market operation with contract ref, pricing, transport binding
- Examples: `src/modules/capability-supply/published-operation.ts`, `src/modules/capability-supply/public.ts`
- Pattern: Materialize runtime descriptor via `materializeRuntimePublishedOperation()` before invoke

**Operation invoke service:**
- Purpose: Orchestrate grant, authority, idempotency, and Convex persistence for `operation.invoke`
- Examples: `src/modules/capability-execution/operation-invoke.ts`, `createOperationInvokeService()` in `operation-invoke-api.ts`
- Pattern: Inject readers for current operation, grant, authority; keep invoke and status/recovery wire parsing in `operation-invoke-contracts.ts` and `operation-recovery-contracts.ts`

**Invocation outcome and recovery status:**
- `result.kind` is the only operation outcome when present, from `operation-invoke-contracts.ts`: `completed | pending | needs_authority | reconciliation_required | refused`
- `found.state` is a recovery diagnostic, not an extra operation outcome, from `operation-recovery-contracts.ts` and `src/modules/action-invocation/`: `gathering_information | awaiting_authority | authorized | leased | in_progress | retryable | reconciliation_required | terminal | cancelled | invalidated`
- Preserve the existing wire envelopes; CLI status/recovery and `invoke --wait` may expose the status envelope
**Route contract:**
- Purpose: Bind action ID to HTTP method, path, required headers, media types
- Examples: `src/modules/capability-execution/operation-invoke-entry.ts`
- Pattern: Use `OPERATION_INVOKE_ROUTE_CONTRACT` for invoke/status/cancel/reconcile; list via `listOperationRouteDescriptors()`

**Convex port file:**
- Purpose: Wire module logic into Convex handlers without circular imports
- Examples: `convex/capabilitySupplyOperationPorts.ts`, `convex/customerRequestRouteExecutionDispatchPorts.ts`
- Pattern: `*Ports.ts` files export adapter functions consumed by mutations/actions/workers

**Source-write admission:**
- Purpose: Exactly-once, scope-bound write authorization for protected actions
- Examples: `src/lib/server/source-write-admission.ts`, `convex/sourceWriteAdmission.ts`
- Pattern: Compute admission at HTTP boundary; pass `sourceWrite` payload into Convex commands

**Registry projection:**
- Purpose: Turn supply rows into search documents and public descriptors
- Examples: `src/modules/registry/internal/projection-attempts.ts`, `src/modules/capability-supply/operation-projection.ts`
- Pattern: Registry re-exports supply search helpers from `src/modules/registry/public.ts`

## Entry Points

**TanStack Start server:**
- Location: `src/start.ts`
- Triggers: Vite/Nitro deploy (`vite.config.ts` with `@tanstack/react-start` + `nitro`)
- Responsibilities: Request middleware chain (correlation, CSRF, source-write, Clerk, security headers, agent markdown negotiation)

**Router:**
- Location: `src/router.tsx`, file routes in `src/routes/`, generated `src/routeTree.gen.ts`
- Triggers: HTTP requests to app host
- Responsibilities: SSR pages, API route handlers with `server.handlers`

**Convex deployment:**
- Location: `convex/schema.ts`, `convex/crons.ts`, `convex/http.ts` (retired routing stubs only)
- Triggers: Convex scheduler, internal/public function calls from TanStack server
- Responsibilities: Durable mutations, Node workers, authz (`convex/authz.ts`)

**AE CLI:**
- Location: `tools/ae/cli.ts` (npm script `ae`)
- Triggers: `npm run ae -- <command>`
- Responsibilities: Manifest-driven commands in `tools/ae/commands/`, JSON/human output via `tools/ae/lib/output.ts`

**MCP host:**
- Location: `src/routes/mcp.ts` → `src/lib/server/mcp-api.ts`
- Triggers: MCP clients over HTTP streamable transport
- Responsibilities: Project `listMcpActions()` to tools; enforce anonymous read-only vs authenticated invoke

**Action registry bootstrap:**
- Location: `src/modules/actions/index.ts`
- Triggers: Module import at server startup
- Responsibilities: `listActions()`, `findAction()`, `listMcpActionDescriptors()`, unique ID assertion

## Architectural Constraints

- **Threading:** Node workers run in Convex `"use node"` actions (`capabilityOperationInvocationWorker.ts`, customer-request route workers). TanStack route handlers are async request-scoped; no shared mutable process state for invoke identity.
- **Global state:** Action registry is a module-level const array in `src/modules/actions/index.ts` (immutable after load). Avoid adding mutable singletons outside Convex.
- **Circular imports:** Keep contracts in `*-contracts.ts` files (e.g. `operation-invoke-contracts.ts`, `projection-contracts.ts`). Domain modules must not import from `src/routes/`.
- **Import boundaries:** `internal/` is module-private; `public.ts` is the cross-module API. Enforced by `tests/imports/*-boundaries.test.ts`.
- **Legacy routing kernel:** `src/modules/routing-kernel/` and `convex/http.ts` return retired responses; do not build new features on `/v1/route` paths.
- **Execute vs invoke naming:** `/api/v1/operations/execute` is legacy path for **`operation.invoke`**, not keyless `operation.execute`. Canonical paid path is `/api/v1/operations/call`.

## Anti-Patterns

### Bypassing the action registry for agent-visible operations

**What happens:** A new HTTP route calls Convex or module internals directly without a registered action.
**Why it's wrong:** CLI, MCP, and Answer will not see the operation; surfaces diverge and import tests may not catch runtime gaps.
**Do this instead:** Add `*.actions.ts`, register in `src/modules/actions/index.ts`, wire route handler to the same runner MCP/CLI use (see `operation-invoke-api.ts`).

### Importing `internal/` from another module

**What happens:** Cross-module import from `src/modules/foo/internal/bar.ts`.
**Why it's wrong:** Breaks encapsulation; boundary tests in `tests/imports/private-imports.test.ts` fail.
**Do this instead:** Export through `src/modules/foo/public.ts` or add a narrow port type to `public.ts`.

### Adding business vocabulary to capability-contract

**What happens:** Provider, booking, or transport terms appear in `src/modules/capability-contract/`.
**Why it's wrong:** Contract layer must stay transport-neutral grammar; tests in `tests/imports/capability-contract-boundaries.test.ts` forbid this.
**Do this instead:** Put orchestration in `capability-supply` or `capability-execution`.

### Self-generated idempotency keys on invoke

**What happens:** Client or CLI invents a new idempotency key on retry after timeout.
**Why it's wrong:** Breaks exactly-once semantics; duplicate charges or twin invocations.
**Do this instead:** Require caller-supplied stable key (`tools/ae/commands/invoke.ts` documents `--idempotency-key`; never auto-generate on retry).

## Error Handling

**Strategy:** RFC 9457 problem+json at HTTP boundaries (`src/lib/server/problem.ts`, `src/lib/errors.ts`); structured refusal codes in invoke results (`OperationInvokeRefusalCode` in `operation-invoke-contracts.ts`); CLI failures via `CliFailure` in `tools/ae/lib/output.ts`.

**Patterns:**
- Gateway maps Convex/source errors through `gatewayFailureToProblem` (`operation-invoke-api.ts`).
- Invoke refusals return typed `kind: 'refused'` with `retryable` and `nextAction` fields rather than throwing for expected denials.
- MCP uses JSON-RPC error codes via `@modelcontextprotocol/sdk` wrappers in `mcp-api.ts`.
- Answer turn errors stream as problem frames via `answerTurnSourceErrorResponse` (`src/lib/server/answer-source-error.ts`).
- Exhaustive `switch` over discriminated unions must use a `never` default (workspace rule).

## Cross-Cutting Concerns

**Logging:**
- Request correlation IDs via `src/lib/server/request-correlation.ts` (middleware in `src/start.ts`).
- Gateway telemetry events in `src/lib/server/gateway-telemetry.ts`.
- Sentry + PostHog in `src/lib/observability/` (server middleware in `src/start.ts`).

**Validation:**
- Zod at action boundaries (`*.actions.ts` input/output schemas).
- JSON Schema for capability contracts (`src/modules/capability-contract/public.ts`).
- Bounded request bodies (`src/lib/server/bounded-request-body.ts`) on invoke and MCP routes.

**Authentication:**
- Operator UI: Clerk (`@clerk/tanstack-react-start` in `src/start.ts`, `src/routes/sign-in.$.tsx`).
- Agent access: Bearer tokens + OAuth device flow (`src/lib/server/agent-access-auth.ts`, `src/routes/oauth.*`).
- Source-write admission for protected writes (`src/lib/server/source-write-admission.ts`).

**Rate limiting:**
- HTTP buckets in `src/lib/server/rate-limit.ts`; Convex-side agent-access limits in `convex/lib/rateLimit.ts`.

**Network egress:**
- Outbound fetches guarded via `network-guard` and `undici` Agent in workers (`capabilityOperationInvocationWorker.ts`).

---

*Architecture analysis: 2026-08-18*
