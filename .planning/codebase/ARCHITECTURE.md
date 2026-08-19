<!-- refreshed: 2026-08-19 -->
# Architecture

**Analysis Date:** 2026-08-19

## System Overview

AE is the market and controlled-transaction layer for authorized agents to discover, buy, and invoke admitted third-party Market Operations. AE owns operation identity/contract, authorization, exactly-once durable invocation, delivery evidence, and brokered money. Consuming agents own planning and orchestration. MCP, CLI, and chat are thin adapters over one market kernel.

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Surface adapters (thin)                             │
├──────────────────┬──────────────────┬──────────────────┬────────────────────┤
│  HTTP / TanStack │   MCP host       │   AE CLI         │  Chat / Answer     │
│  `src/routes/`   │  `src/routes/`   │  `tools/ae/`     │  `src/routes/`     │
│  `api.v1.*`      │  `mcp.ts`        │  `cli.ts`        │  `api.answer.*`    │
│  paid door:      │  `src/lib/`      │  commands call   │  AI SDK tool loop  │
│  `/api/v1/`      │  `server/`       │  the same HTTP   │  over read actions │
│  `operations/`   │  `mcp-api.ts`    │  action paths    │  + optional invoke │
│  `call`          │                  │                  │                    │
└────────┬─────────┴────────┬─────────┴────────┬─────────┴─────────┬──────────┘
         │                  │                  │                   │
         └──────────────────┴────────┬─────────┴───────────────────┘
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Public action registry (14 live ids)                     │
│         `src/modules/actions/index.ts`  (`listActions`)                     │
│  Discover: `registry.search` `registry.detail` `registry.operations.*`      │
│  Execute/invoke: `operation.execute` `operation.invoke` `operation.status`  │
│                  `operation.cancel` `operation.reconcile`                   │
│  Supply: `supply.publish` `supply.withdraw` `supply.earnings`               │
└────────────────────────────────────┬────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Market kernel (AE-owned)                            │
├──────────────────────┬──────────────────────┬───────────────────────────────┤
│ Identity / contract  │ Authorization        │ Durable exactly-once invoke   │
│ `capability-supply/` │ `agent-access/`      │ `capability-execution/`       │
│ `capability-`        │ `convex/authz.ts`    │ `action-invocation/`          │
│ `contract/`          │ `security/`          │ `convex/capabilityOperation`  │
│ `registry/`          │ `sourceWrite*`       │ `Invocations.ts`              │
├──────────────────────┼──────────────────────┼───────────────────────────────┤
│ Delivery evidence    │ Brokered money       │ Quarantine / tombstones       │
│ `qualifiedUse*`      │ `src/modules/money/` │ `product-frontier/`           │
│ `external-run/`      │ `convex/money*.ts`   │ Study + WorkTree modules stay │
│ invocation evidence  │ live money fail-     │ CR TypeScript module absent   │
│                      │ closed               │ RK HTTP 410 in `convex/http`  │
└──────────────────────┴──────────────────────┴───────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ Durable store — Convex (60 listed tables) + Workpool component              │
│ `convex/schema.ts` composes module `internal/*schema*`                      │
│ Inventory pin: `tests/unit/schema/convex-schema.test.ts` (`durableTables`)  │
│ Paid dispatch: `convex/marketDispatchWorkpool.ts`                           │
│ Clerk identity: `src/start.ts` + `convex/auth.config.ts`                    │
│ Production paid x402 lane refused: `capability-supply/internal/`            │
│ `x402-invocation-policy.ts` (`payment_lane_not_brokered`)                   │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| Public action registry | Explicit 14-id public inventory; MCP tool names; operation route descriptors; `findAction` still resolves quarantined tombstones | `src/modules/actions/index.ts` |
| Action contract | `defineAction` — one declaration for HTTP, MCP, CLI, UI, and answer-thread tools | `src/modules/common/action.ts` |
| Paid HTTP door | Canonical authenticated invoke at `POST /api/v1/operations/call` | `src/routes/api.v1.operations.call.ts` |
| Invoke HTTP adapter | Bearer auth, source-write admission, bounded body, RFC 9457 problems | `src/lib/server/operation-invoke-api.ts` |
| Invoke action | `operation.invoke` contract and run body | `src/modules/capability-execution/operation-invoke.actions.ts` |
| Invoke domain service | Grant, mandate, provider authority, durable invocation, evidence | `src/modules/capability-execution/operation-invoke.ts` |
| Keyless execute action | Anonymous read-only `operation.execute` (MCP); not the paid door | `src/modules/capability-execution/operation-execute-mcp.actions.ts` |
| Recovery actions | `operation.status` / `cancel` / `reconcile` | `src/modules/capability-execution/operation-recovery.actions.ts` |
| Route contract | Paths, versions, headers for invoke/status/cancel/reconcile; documents `/execute` as legacy path | `src/modules/capability-execution/operation-invoke-entry.ts` |
| Durable invocation host | Convex action `capabilityOperationInvocations:invoke` plus status/cancel/reconcile | `convex/capabilityOperationInvocations.ts` |
| Market workpool | Exactly-once dispatch retries for paid invoke | `convex/marketDispatchWorkpool.ts` |
| Invocation kernel | Fence, attempts, host projection, reconciliation evidence | `src/modules/action-invocation/` |
| Supply + admission | Publish/withdraw/earnings; admit publication; provider connections | `src/modules/capability-supply/` |
| Registry reads | Catalog/business search+detail and Market Operation search/detail/compare/inspectPlan | `src/modules/registry/` |
| Money | Brokered ledger, Qualified Use, payouts, live-money gate | `src/modules/money/` |
| Agent access | Principals, grants, OAuth, scopes (`market_operations:invoke`, `market_supply:manage`) | `src/modules/agent-access/` |
| MCP adapter | Streamable HTTP MCP over `listMcpActions`; anonymous read-only | `src/lib/server/mcp-api.ts` |
| CLI adapter | Same actions via public HTTP | `tools/ae/cli.ts` |
| Chat adapter | Bounded AI SDK tool loop over registered read actions | `src/modules/answer-thread/internal/turn-orchestrator.ts` |
| Problem model | RFC 9457 + google.rpc.Code kinds for HTTP and CLI | `src/lib/errors.ts` |
| Authz (Convex) | Clerk identity → business actor / admin authority | `convex/authz.ts` |
| Quarantine policy | Family prefixes, HTTP 410, inquiry customer-record keep | `src/modules/product-frontier/quarantine-write-admission.ts` |
| CR tombstones | Findable `customerRequest.*` actions that throw; HTTP 410 | `src/modules/product-frontier/quarantine-family-actions.ts` |
| RK retirement | Convex HTTP 410 for routing-kernel v1 paths | `src/modules/routing-kernel/retirement.ts` |
| Schema composition | Spreads module table maps into one Convex schema | `convex/schema.ts` |
| Listed-table freeze | Keep-60 `durableTables`; leftover 29 pruned; no shared throw layer | `tests/unit/schema/convex-schema.test.ts` |

## Pattern Overview

**Overall:** Single market kernel with thin protocol adapters. Actions are the public machine contract. Convex is the durable source. Consuming agents plan; AE admits, invokes, evidences, and settles.

**Key Characteristics:**
- One paid HTTP path: `POST /api/v1/operations/call`. That path is the paid door and is not deprecated. `POST /api/v1/operations/execute` is HTTP 410 (`quarantine_surface_retired`).
- Fourteen live public actions from `listActions()` in `src/modules/actions/index.ts`, pinned by `.planning/evidence/product-frontier-baseline/product-frontier-manifest.json` `requiredActionIds`.
- MCP keeps separate tools for anonymous read-only `operation.execute` and paid/destructive `operation.invoke`. Tool names are derived (`ae_` + id with dots → underscores) in `mcpToolName` — never a hand-maintained map.
- Registration is an explicit array import in `src/modules/actions/index.ts`. Do not rely on module-eval side effects.
- Routes and server fns are adapters. Domain policy lives in `src/modules/<name>/`. Convex files in `convex/` call module functions; they do not own a second kernel.
- V1 money is AE-brokered only. Production refuses provider-direct x402 (`payment_lane_not_brokered` in `src/modules/capability-supply/internal/x402-invocation-policy.ts`). Live money stays fail-closed via `src/modules/money/internal/live-money-gate.ts`.
- Customer Request TypeScript module is absent. `customerRequest.*` tombstones remain so family HTTP stays 410. Study and WorkTree TypeScript modules remain quarantined (`study.` / `workTree.` prefixes). Inquiry twelve tables stay listed; `inquiry.readCustomerRecord` stays readable (`findAction`) and is not HTTP-410ed. Routing-kernel HTTP 410 stays in `convex/http.ts`.

## Layers

**Surface adapters:**
- Purpose: Translate HTTP, MCP, CLI, and chat into the same action/kernel calls. Own transport, auth headers, rate limits, and RFC 9457 projection. Do not own market policy.
- Location: `src/routes/`, `src/lib/server/`, `tools/ae/`
- Contains: TanStack file routes, MCP host, CLI commands, answer-turn HTTP
- Depends on: `src/modules/actions`, capability-execution/supply/registry public seams, `src/lib/errors.ts`
- Used by: External agents, browsers, operator UI

**Public action contracts:**
- Purpose: One `defineAction` per machine operation; surfaces, schemas, boundaries, invocation contracts
- Location: `src/modules/common/action.ts`, `src/modules/**/*.actions.ts`, `src/modules/actions/index.ts`
- Contains: Zod input/output, `readOnly`, credential scopes, `invocationContract`
- Depends on: Domain modules' through-source runners
- Used by: Every adapter, including answer-thread tool runner

**Market kernel:**
- Purpose: AE-owned identity, authorization, durable invoke, evidence, brokered money
- Location: `src/modules/capability-execution/`, `src/modules/action-invocation/`, `src/modules/capability-supply/`, `src/modules/registry/`, `src/modules/agent-access/`, `src/modules/money/`, `src/modules/security/`
- Contains: Invoke/execute/recovery services, publication admission, grants, ledger, Qualified Use
- Depends on: Convex source via `src/lib/server/convex-source.ts`
- Used by: Adapters only through actions or documented server-fn exceptions

**Convex durable host:**
- Purpose: Transactions, indexes, workpool, source-write admission, schema
- Location: `convex/`
- Contains: Mutations/queries/actions named as `<module>:<fn>` source refs; `convex/schema.ts`; `convex/http.ts` RK tombstones
- Depends on: Module `internal/*schema*` and domain functions; Workpool/Workflow/RateLimiter/Aggregate components in `convex/convex.config.ts`
- Used by: Server via `callPublicSourceAction` / `callPublicSourceMutation` / `callPublicSourceQuery`

**Quarantined / retired families:**
- Purpose: Keep modules or HTTP doors from becoming a second market. HTTP/MCP family doors including inspect are 410 except `inquiry.readCustomerRecord`. Server-fns freeze as RFC 9457 403. Never 410 `/api/v1/operations/call`.
- Location: `src/modules/product-frontier/`, `src/modules/study/`, `src/modules/work-tree/`, `src/lib/server/customer-request-gone.ts`, `src/lib/server/quarantine-write.ts`
- Contains: Prefix list, tombstone actions, empty table maps for unlisted families
- Depends on: Problem helper `src/lib/server/problem.ts`
- Used by: Family HTTP routes and `listActions` filter

## Data Flow

### Primary Request Path

Paid invoke (the paid door):

1. `POST /api/v1/operations/call` — TanStack route dispatches POST (`src/routes/api.v1.operations.call.ts:12`)
2. `handleOperationInvokePost` authenticates bearer `market_operations:invoke`, bounds the body, parses JSON (`src/lib/server/operation-invoke-api.ts:356`)
3. `createOperationInvokeService` builds source-write admission and calls Convex `capabilityOperationInvocations:invoke` (`src/lib/server/operation-invoke-api.ts:58`)
4. `operationInvokeAction` is the public contract (`src/modules/capability-execution/operation-invoke.actions.ts:39`); path/version live in `OPERATION_INVOKE_ROUTE_CONTRACT.invoke` (`src/modules/capability-execution/operation-invoke-entry.ts:19`)
5. Convex `invoke` action runs grant/authority/durable reservation then enqueues `marketDispatchWorkpool` (`convex/capabilityOperationInvocations.ts:1450`, `convex/marketDispatchWorkpool.ts:5`)
6. Worker in `convex/capabilityOperationInvocationWorker.ts` executes provider transport through capability-supply bindings; results and evidence persist on `capabilityOperationInvocations` plus money/Qualified Use tables
7. HTTP returns the action output schema or `application/problem+json` (`src/lib/server/problem.ts`)

### MCP / CLI / chat adapters

1. MCP: `GET|POST|DELETE /mcp` (`src/routes/mcp.ts:10`) → `handleMcpRequest` (`src/lib/server/mcp-api.ts:330`) → `listMcpActions()` (`src/modules/actions/index.ts:120`). Anonymous tier is read-only. Authenticated tools include `ae_operation_invoke` and supply tools. Quarantine family ids tombstone in-tool; the host itself is not HTTP 410.
2. CLI: `npm run ae -- invoke` (`tools/ae/cli.ts`, `tools/ae/commands/invoke.ts`) posts to `OPERATION_INVOKE_ROUTE_CONTRACT.invoke.path` (`/api/v1/operations/call`). Search/inspect/compare/inspect-plan are anonymous HTTP reads of `/api/v1/market-operations/*`.
3. Chat: `POST /api/answer/turn` (`src/routes/api.answer.turn.ts:36`) → `streamAnswerTurn` / turn orchestrator (`src/modules/answer-thread/internal/turn-orchestrator.ts`) → `runAnswerToolCall` (`src/modules/answer-thread/internal/tool-runner.ts:64`) which only runs `findAnswerReadToolAction` (`src/modules/answer-thread/internal/answer-tool-registry.ts:31`). Chat does not become a second market; paid work still goes through `operation.invoke` / `/call`.

### Discovery and supply

1. Anonymous Market Operation reads: `src/routes/api.v1.market-operations.search.ts` (and detail/compare/inspect-plan) → `src/modules/registry/operations.actions.ts` → `src/modules/capability-supply/operation-source`.
2. Supplier publish/withdraw/earnings: MCP/CLI authenticated actions in `src/modules/capability-supply/supply-actions.ts` (`supply.publish`, `supply.withdraw`, `supply.earnings`).
3. Businesses/services HTTP URLs stay measured and frozen (`src/modules/product-frontier/business-services-policy.ts`); they project Offering/registry reads, not a second catalog kernel.

### Retired and quarantined HTTP

1. `/api/v1/operations/execute` returns 410 for every method (`src/routes/api.v1.operations.execute.ts:13`).
2. Customer Request HTTP (`src/routes/api.v1.requests.ts` and `src/routes/api.requests*.ts`) calls `retiredCustomerRequestResponse` (`src/lib/server/customer-request-gone.ts:4`) → 410 `quarantine_surface_retired`.
3. WorkTree HTTP (`src/routes/api.v1.work-tree.$operation.ts`) wraps dispatch with RFC 9745 notice and 410 via `quarantineWriteResponse` (`src/lib/server/work-tree-agent-api.ts:118`, `src/lib/server/quarantine-write.ts:7`).
4. Routing-kernel Convex HTTP (`convex/http.ts:8`) returns 410 `routing_v1_retired` (`src/modules/routing-kernel/retirement.ts:15`) for `/v1/route|authorize|execute|reconcile|inspect|cancel`, Convex `/mcp`, and `/.well-known/ae-routing.json`. App MCP remains `src/routes/mcp.ts`.

**State Management:**
- Durable market state is Convex documents (60 listed tables). UI/chat session cookies are not write authority.
- Exactly-once paid invoke uses invocation identity + idempotency key + workpool retries (`retryClass: reconcile_before_retry` on `operation.invoke`).
- Answer turns checkpoint in `answerThreads` / `answerTurns` / `answerTurnReservations` (`src/modules/answer-thread/internal/convex-schema.ts`).
- Source writes require `SourceWriteAdmission` (`src/lib/server/source-write-admission.ts`, `convex/sourceWriteAdmission.ts`).
- Prompt/chat data-flow traces live in `.planning/codebase/PROMPT-DATA-FLOW.md` (do not duplicate that map here).

## Key Abstractions

**Action (`defineAction`):**
- Purpose: Public machine-operation contract. One id, one schema, declared surfaces, invocation contract.
- Examples: `src/modules/common/action.ts`, `src/modules/capability-execution/operation-invoke.actions.ts`, `src/modules/registry/operations.actions.ts`, `src/modules/capability-supply/supply-actions.ts`
- Pattern: Export a const action from `<module>/<module>.actions.ts`, then add an explicit import + array entry in `src/modules/actions/index.ts`. Filter quarantined family ids from `listActions` via `isQuarantineFamilyActionId`. Keep tombstones `findAction`-able.

**Operation invoke application:**
- Purpose: Standalone durable invocation over grant, connection generation, transport, money, and evidence.
- Examples: `src/modules/capability-execution/operation-invoke.ts`, `src/modules/action-invocation/application-service.ts`, `src/modules/action-invocation/dynamic-published-adapter.ts`
- Pattern: Inject `OperationInvokeService` into HTTP and MCP adapters (`createOperationInvokeService` in `src/lib/server/operation-invoke-api.ts`). Do not fork a second state machine in the adapter.

**Published operation / supply graph:**
- Purpose: Admitted, versioned, priced capability identity. Callers pass `operationRef` + input; AE resolves provider, endpoint, credentials, and price server-side.
- Examples: `src/modules/capability-supply/public.ts`, `src/modules/capability-supply/internal/publication/admit.ts`, `convex/capabilitySupplyOperations.ts`
- Pattern: Publication → binding → readiness → registry projection. Caller cannot supply transport or credentials.

**Agent-access principal:**
- Purpose: Organization/account owns funds and aggregate budget; API keys receive narrower grants. Keys identify the caller and never grant provider authority.
- Examples: `src/modules/agent-access/agent-access.ts`, `src/lib/server/agent-access-auth.ts`, `src/modules/agent-access/contract.ts`
- Pattern: Authenticate at the adapter; pass `agentAccessPrincipal` in `ActionContext`. Never accept caller-supplied authority.

**RFC 9457 problem:**
- Purpose: Single error model for HTTP, MCP tool failures, and CLI envelopes.
- Examples: `src/lib/errors.ts`, `src/lib/server/problem.ts`
- Pattern: `buildProblem` / `problem()` with `kind` + stable `code`. Do not invent per-route JSON error shapes.

**Quarantine family:**
- Purpose: Keep Study, WorkTree, inquiry writes, and CR HTTP from competing with `/call`.
- Examples: `src/modules/product-frontier/quarantine-write-admission.ts`, `src/modules/product-frontier/quarantine-family-actions.ts`
- Pattern: Prefix membership (`customerRequest.`, `inquiry.`, `study.`, `workTree.`). HTTP/MCP 410 except `inquiry.readCustomerRecord`. Server-fn writes 403 `quarantine_writes_frozen`. Convex mutations for those families may remain callable internally; public doors stay closed.

## Entry Points

**Paid Market Operation invoke:**
- Location: `src/routes/api.v1.operations.call.ts`
- Triggers: HTTP `POST` with `Authorization` bearer key (`market_operations:invoke`); MCP `ae_operation_invoke`; CLI `ae invoke`
- Responsibilities: Authenticate, admit source-write, durable invoke, return result or problem. Not deprecated.

**Keyless execute (observation):**
- Location: MCP tool `ae_operation_execute` from `src/modules/capability-execution/operation-execute-mcp.actions.ts`
- Triggers: Anonymous MCP (read-only admission in `src/lib/server/mcp-api.ts`)
- Responsibilities: Run admitted keyless http-json GET/POST with no financial_exposure. HTTP `/api/v1/operations/execute` is 410 and must not be revived as the paid door.

**MCP host:**
- Location: `src/routes/mcp.ts`
- Triggers: MCP clients over streamable HTTP
- Responsibilities: Project `listMcpActions()`; enforce anonymous read-only vs authenticated scopes

**CLI:**
- Location: `tools/ae/cli.ts`
- Triggers: `npm run ae -- <command>`
- Responsibilities: One mental model over the same actions; labelled local evidence against `--base-url`

**Chat / Answer:**
- Location: `src/routes/api.answer.turn.ts`, `src/routes/index.tsx`, `src/routes/t.$threadId.tsx`
- Triggers: Browser POST `/api/answer/turn`
- Responsibilities: Bounded AI SDK tool loop over registered read actions; no deterministic intent router; no chat-only market capability

**Operator / owner UI:**
- Location: `src/routes/_operator.tsx` and children
- Triggers: Clerk-authenticated browser
- Responsibilities: Offerings, supply funnel, inquiries inbox, agent-access, admin. Owner writes use TanStack server fns with source-write admission — not new public actions unless they belong in the 14-id inventory.

**App start:**
- Location: `src/start.ts`, `src/router.tsx`, `src/routes/__root.tsx`
- Triggers: Vite/Nitro HTTP server (`vite.config.ts`)
- Responsibilities: Clerk middleware, CSRF on server fns, source-write middleware, security headers, request correlation, observability

**Convex HTTP (RK only):**
- Location: `convex/http.ts`
- Triggers: Direct Convex HTTP to retired routing-kernel paths
- Responsibilities: Permanent 410 `routing_v1_retired`. Do not add new market HTTP here.

## Architectural Constraints

- **Threading:** Node/Vite request event loop on the app host. Durable paid work runs on Convex actions + `@convex-dev/workpool` (`convex/marketDispatchWorkpool.ts`, maxParallelism 32). Do not add raw scheduler hops for market dispatch.
- **Global state:** Action registry is a module-level const array in `src/modules/actions/index.ts`. Live-money policy is source-owned in `LIVE_MONEY_GATE_POLICY` (`src/modules/money/internal/live-money-gate.ts`) — do not replace it with an environment flag. Rate limiter and aggregate are Convex components (`convex/convex.config.ts`).
- **Circular imports:** Registry operation actions currently dynamic-import `capability-supply/operation-source` inside `run` (`src/modules/registry/operations.actions.ts`). Prefer top-level imports. Do not add new inline imports to break cycles; extract a leaf module under `internal/` instead.
- **Import boundaries:** Routes import module `public.ts` / `convex.ts` / documented server helpers, not `internal/`. Guard: `tests/imports/private-imports.test.ts`, `tests/imports/route-boundary.test.ts`, `src/lib/ui/contract-scans.ts`. `convex/schema.ts` is the allowed composer of `internal/*schema*`.
- **Public inventory cap:** `listActions()` is the 14-id set. Adding a public action requires registry entry plus frontier manifest update (`.planning/evidence/product-frontier-baseline/product-frontier-manifest.json`) and tests in `tests/imports/product-frontier-manifest.test.ts`.
- **Listed tables cap:** 60 names in `durableTables` (`tests/unit/schema/convex-schema.test.ts`). Study/WorkTree/RK/project-spine table maps are empty objects. Leftover unlisted writers copy a sibling fail-closed in that file — do not add a shared throw or no-op helper.
- **No second kernel:** Do not add a second token verifier, registry, ledger, transport, or execution state machine. Reuse `agent-access`, `action-invocation`, `capability-execution`, `money`, `convex/lib/rateLimit.ts`.
- **Planning/orchestration:** Consuming agents own multi-step plans. AE does not grow a Customer Request planner. Chat is a tool loop over market actions, not an intent router.

## Anti-Patterns

### Second paid HTTP door

**What happens:** A new route such as `/api/v1/operations/execute` (or `/run`, `/invoke`) is treated as the paid invoke path.
**Why it's wrong:** The paid door is `/api/v1/operations/call`. `/execute` is 410 (`src/routes/api.v1.operations.execute.ts`). A second door splits idempotency, grants, and evidence.
**Do this instead:** Add adapters that call `handleOperationInvokePost` / `operationInvokeAction` and keep `OPERATION_INVOKE_ROUTE_CONTRACT.invoke.path` as the only paid HTTP path.

### Side-effect action registration

**What happens:** A module registers itself by importing for side effects.
**Why it's wrong:** Production bundlers tree-shake those imports; the action disappears from MCP/CLI/HTTP.
**Do this instead:** Export an action const and list it in the explicit array in `src/modules/actions/index.ts` (see file header comments there).

### Domain logic in routes or MCP host

**What happens:** Grant, pricing, or provider selection is implemented in `src/routes/` or `src/lib/server/mcp-api.ts`.
**Why it's wrong:** MCP, CLI, and chat must stay thin or they diverge.
**Do this instead:** Put policy in `src/modules/capability-execution/operation-invoke.ts` (or the owning module) and have every adapter call the action/service.

### Importing `internal/` from routes or other modules

**What happens:** `src/routes/foo.ts` imports `@/modules/money/internal/ledger`.
**Why it's wrong:** Breaks the public seam; `tests/imports/private-imports.test.ts` fails.
**Do this instead:** Export through `src/modules/<name>/public.ts` or `convex.ts`. Schema composition is only allowed from `convex/schema.ts`.

### Recreating the Customer Request TypeScript module

**What happens:** New files under `src/modules/customer-request/` or live `customerRequest.*` run bodies.
**Why it's wrong:** The CR module is absent. Tombstones exist so HTTP stays 410. Planning belongs to consuming agents.
**Do this instead:** Point agents at `/api/v1/operations/call`. Keep tombstones in `src/modules/product-frontier/quarantine-family-actions.ts`.

### Live x402 or live money in production

**What happens:** Production admits `provider_direct_x402` or bypasses `evaluateLiveMoneyGate`.
**Why it's wrong:** V1 money is AE-brokered; counsel signoffs in `LIVE_MONEY_GATE_POLICY` are open; Stripe live readiness is unavailable.
**Do this instead:** Keep `paymentLaneAdmission` production refusal (`src/modules/capability-supply/internal/x402-invocation-policy.ts`) and the source-owned live-money gate (`src/modules/money/internal/live-money-gate.ts`).

### Expanding businesses/services URL family

**What happens:** New `/api/v1/services*` or `/api/businesses*` routes.
**Why it's wrong:** `businessServicesPolicy.expansion` is frozen (`src/modules/product-frontier/business-services-policy.ts`).
**Do this instead:** Use Market Operation routes under `/api/v1/market-operations/*` or the 14 public actions. Existing measured URLs stay; do not add siblings.

### Listing a Convex table without the inventory pin

**What happens:** A table is spread into `convex/schema.ts` but omitted from `durableTables`.
**Why it's wrong:** `tests/unit/schema/convex-schema.test.ts` pins exactly 60 listed names. Do not re-list leftover families or restore a shared throw helper.
**Do this instead:** Add the table to the module schema, `convex/schema.ts`, and `durableTables` only when the listed cap is intentionally raised. For leftover unlisted surfaces, copy an existing local fail-closed in that file or delete the unused export.

## Error Handling

**Strategy:** Fail closed. Named refusal codes on action results; RFC 9457 problems on HTTP; MCP maps failures to problem details without leaking internals.

**Patterns:**
- Action results use discriminated `kind` (`ok` / `refused` / `error` / `needs_authority`) parsed by Zod output schemas (example: `src/modules/capability-execution/operation-invoke-contracts.ts`).
- HTTP errors go through `problem()` (`src/lib/server/problem.ts`) from `buildProblem` (`src/lib/errors.ts`). Status follows `DEFAULT_STATUS` unless overridden (410 for retired surfaces).
- Quarantine HTTP uses `quarantine_surface_retired` (410) or `quarantine_writes_frozen` (403). Never apply those codes to `/api/v1/operations/call`.
- Convex source failures surface as `ConvexSourceError` (`src/lib/server/convex-source.ts`) and map to UNAVAILABLE / authentication problems at the gateway.
- CLI wraps the same problem kinds (`tools/ae/lib/output.ts`).
- Exhaustive `switch` with `never` on unions (workspace rule); see `paymentLaneAdmission` in `src/modules/capability-supply/internal/x402-invocation-policy.ts`.

## Cross-Cutting Concerns

**Logging:** Request correlation in `src/lib/server/request-correlation.ts` (middleware in `src/start.ts`). Gateway telemetry in `src/lib/server/gateway-telemetry.ts`. Sentry/PostHog via `src/lib/observability/` with private-route sanitization (`src/lib/observability/private-route-safety.ts`). Do not log supplier credentials or raw PII.

**Validation:** Zod at action boundaries (`defineAction.schema` / `outputSchema`). Bounded request bodies (`src/lib/server/bounded-request-body.ts`). Convex `v` validators on source functions. Strict JSON-schema diagnostics for MCP/tools (`src/modules/actions/strict-schema.ts`).

**Authentication:** Clerk session for humans (`src/start.ts`, `src/lib/server/require-clerk-server-session.ts`). Agent bearer keys and OAuth for machines (`src/lib/server/agent-access-auth.ts`, `src/routes/oauth.authorize.ts`, `src/routes/[.]well-known/oauth-authorization-server.ts`). Convex `ctx.auth.getUserIdentity()` in `convex/authz.ts`. Source-write admission is separate from login and is required for protected writes.

---

*Architecture analysis: 2026-08-19*
