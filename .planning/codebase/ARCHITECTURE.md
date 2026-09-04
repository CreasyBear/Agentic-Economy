<!-- refreshed: 2026-09-04 -->
# Architecture

**Analysis Date:** 2026-09-04

## System Overview

```text
┌────────────────────────────────────────────────────────────┐
│                    Product Surfaces                           │
├─────────────────┼─────────────────┼───────────────────────┤
│ React web / UI  │ HTTP + MCP APIs │ CLI + webhooks       │
│ `src/routes/`   │ `src/routes/api*`│ `tools/ae/`, routes │
└────────┬────────┴────────┬────────┴──────────┬───────────┘
         │                 │                  │
         ▼                 ▼                  ▼
┌────────────────────────────────────────────────────────────┐
│        TanStack Start and server adapter boundary             │
│ `src/start.ts`, `src/lib/server/`, `src/modules/actions/`      │
└────────────────────────────┬────────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────────┐
│     Domain modules and application/runtime contracts          │
│ `src/modules/` — 27 modules governed by an explicit DAG       │
└────────────────────────────┬────────────────────────────────┘
                            │
                            ▼
┌───────────────────────────────────────────────────────────┐
│         Convex durable host and execution plane                │
│ `convex/`, composed schemas, actions, workpools, crons         │
└────────────────────────────┬────────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────────┐
│ Convex DB + external systems: Provider endpoints, Clerk, Stripe,│
│ Formance, x402/CDP, OpenRouter, Sentry/PostHog                 │
└────────────────────────────────────────────────────────────┘
```

Agentic Economy is a TypeScript modular monolith. TanStack Start supplies the web application and HTTP boundary in `src/routes/`, domain and application rules live in `src/modules/`, and durable state plus asynchronous work live in Convex under `convex/`. The code implements an Operation market: public discovery is read-only, while authenticated inspection creates an expiring Commitment and Invocation proceeds through a durable, idempotent worker path (`src/modules/capability-execution/`, `convex/capabilityOperationCommitments.ts`, `convex/capabilityOperationInvocations.ts`).

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| TanStack request pipeline | Correlation, API boundary checks, observability, security headers, content negotiation, CSRF, source-write admission, and Clerk middleware | `src/start.ts` |
| File router | Web pages, public APIs, authenticated APIs, OAuth endpoints, webhooks, MCP, and discovery files | `src/routes/`, `src/router.tsx`, `src/routeTree.gen.ts` |
| Server adapters | Authenticate callers, bound and validate requests, call Convex, and project protocol responses | `src/lib/server/` |
| Action registry | Defines one explicit machine-action catalogue reused by HTTP, MCP, CLI, chat, and agent JSON surfaces | `src/modules/actions/index.ts`, `src/modules/common/action.ts` |
| Domain module graph | Owns contracts, pure policy, projections, ports, and module-public entry surfaces | `src/modules/`, `src/modules/module-boundaries.ts` |
| Operation supply | Imports, admits, publishes, qualifies, exposes, withdraws, and routes Provider Operations | `src/modules/capability-supply/`, `convex/capabilitySupply*.ts` |
| Market and registry | Projects admitted current Operations into public list/search/detail/compare and market evidence | `src/modules/registry/`, `src/modules/market/`, `convex/capabilitySupplyOperations.ts` |
| Authority and agent access | Resolves Business Principal, Account, Agent Principal, credential, scopes, grant, and Mandate evidence | `src/modules/agent-access/`, `src/modules/authority/`, `src/modules/principal-account/`, `convex/authorityBoundary.ts` |
| Capability execution | Owns inspection, Commitment matching, Invocation admission, recovery contracts, and the Provider-call worker | `src/modules/capability-execution/`, `convex/capabilityOperationCommitments.ts`, `convex/capabilityOperationInvocationWorker.ts` |
| Durable effect kernel | Persists claim, attempt identity, release fence, terminal outcome, and reconciliation state before/around external effects | `src/modules/action-invocation/`, `convex/actionInvocationControl.ts` |
| Money | Owns exact amounts, prepaid funding, capacity, Charges, Provider obligations/earnings, refunds, Stripe, Formance, and treasury evidence | `src/modules/money/`, `convex/money*.ts` |
| Convex host | Composes tables, exposes typed query/mutation/action roots, schedules workpools and crons, and holds authoritative state | `convex/schema.ts`, `convex/convex.config.ts`, `convex/crons.ts` |
| React presentation | Renders public catalogue, operator workspace, provider supply, agent access, Calls, status, and chat surfaces | `src/components/ae/`, `src/routes/_operator/`, `src/routes/market.tsx` |
| CLI distribution | Wraps the same HTTP contracts for search, inspect, invoke, wait, status, cancel, reconcile, funding, and supply | `tools/ae/`, `packages/cli/` |

## Pattern Overview

**Overall:** Modular monolith with ports-and-adapters boundaries, a dependency-directed domain core, and a Convex-backed durable execution plane.

**Key Characteristics:**
- Treat `src/routes/` as protocol adapters. Route files delegate to `src/lib/server/` or declared module entry surfaces, and `tests/imports/route-boundary.test.ts` rejects route-owned Convex transport or schema coupling.
- Treat `src/modules/<module>/` as the unit of domain ownership. Cross-module imports must use a declared `entrySurfaces` file and follow `allowedDependencies` in `src/modules/module-boundaries.ts`.
- Keep the module graph acyclic. `tests/imports/module-boundaries.test.ts` verifies 27 modules, zero declared cycles, no runtime exceptions, and exact accounting of test-only white-box imports.
- Keep durable state in Convex. Module-owned table declarations are composed in `convex/schema.ts`; public/internal Convex roots in `convex/*.ts` adapt those module contracts to queries, mutations, actions, workpools, and crons.
- Define machine operations once. `defineAction` in `src/modules/common/action.ts` binds schemas, effect class, authority, retry semantics, evidence, and supported surfaces; `src/modules/actions/index.ts` explicitly registers each action so bundling cannot erase registration.
- Fence consequences. `src/modules/action-invocation/` and `src/modules/capability-execution/invocation-worker/` persist claim/release state and revalidate authority, Operation revision, and Provider connection before network or payment effects.
- Preserve product-role distinctions in records. Business Principal, Account, Agent Principal, Provider, Seller, payment recipient, buyer consideration, and Provider obligation remain separate concepts across `src/modules/principal-account/`, `src/modules/authority/`, `src/modules/capability-supply/`, and `src/modules/money/`.

## Layers

**Surface and Presentation Layer:**
- Purpose: Expose public catalogue, detail, chat, operator, supply, status, OAuth, API, MCP, webhook, and machine-discovery surfaces.
- Location: `src/routes/`, `src/components/ae/`, `src/components/ui/`, `src/components/ai-elements/`.
- Contains: TanStack file routes, route loaders/server functions, page compositions, domain UI components, and UI primitives.
- Depends on: `src/lib/`, declared surfaces in `src/modules/`, and generated Convex bindings only where a browser provider is required in `src/routes/__root.tsx`.
- Used by: Browser users, agents over HTTP/MCP, Clerk/Stripe callbacks, and the packaged CLI in `packages/cli/`.

**Request and Protocol Adapter Layer:**
- Purpose: Apply transport-specific authentication, request limits, method guards, correlation, response envelopes, and Convex transport.
- Location: `src/start.ts`, `src/lib/server/`, `src/lib/http/`, `src/lib/observability/`.
- Contains: `src/lib/server/operation-invoke-api.ts`, `src/lib/server/mcp-api.ts`, `src/lib/server/supply-action-api.ts`, `src/lib/server/convex-source.ts`, `src/lib/server/problem.ts`, and webhook adapters.
- Depends on: Clerk/TanStack APIs plus public module entry surfaces declared in `src/modules/module-boundaries.ts`.
- Used by: `src/routes/api.*`, `src/routes/oauth.*`, `src/routes/mcp.ts`, and route loaders/server functions.

**Action Contract Layer:**
- Purpose: Make a bounded product action reusable across machine surfaces with one schema and one effect/authority/retry declaration.
- Location: `src/modules/actions/`, `src/modules/common/action.ts`, and owning-module `*.actions.ts` files such as `src/modules/registry/operations.actions.ts` and `src/modules/capability-supply/supply-actions.ts`.
- Contains: Explicit action registry, action metadata, strict tool-schema projection, and surface-specific execution context.
- Depends on: Registry, capability execution, capability supply, agent access, market demand, money, security, and dependency-free common utilities as declared in `src/modules/module-boundaries.ts`.
- Used by: `src/lib/server/mcp-api.ts`, HTTP adapters, chat tooling, CLI adapters in `tools/ae/commands/action-adapters.ts`, and generated discovery material.

**Domain and Application Layer:**
- Purpose: Own Operation contracts, admission, market resolution, authority, Invocation lifecycle, money policy, evidence, and projections independently of a particular transport.
- Location: `src/modules/`.
- Contains: Public entry surfaces (`public.ts`, `server.ts`, `schema.ts`, `*.actions.ts`, `*.functions.ts`), private `internal/` implementations, injected ports, Zod contracts, and pure transitions.
- Depends on: Only the allowed module DAG in `src/modules/module-boundaries.ts`; lower-level modules such as `src/modules/common/`, `src/modules/principal-account/`, `src/modules/capability-contract/`, and `src/modules/network-guard/` sit at the bottom.
- Used by: Server adapters in `src/lib/server/`, Convex host functions in `convex/`, React projections in `src/components/ae/`, CLI source in `tools/ae/`, and tests in `tests/`.

**Durable Host and Workflow Layer:**
- Purpose: Persist authoritative records, run transactional checks, enqueue external work, reconcile uncertainty, and schedule maintenance.
- Location: `convex/`.
- Contains: `convex/schema.ts`, feature roots such as `convex/capabilityOperationInvocations.ts`, helper subtrees such as `convex/lib/operationInvocations/`, workpool definitions, `convex/http.ts`, and `convex/crons.ts`.
- Depends on: Generated Convex APIs in `convex/_generated/` and declared module entry surfaces in `src/modules/`.
- Used by: The TanStack server through `src/lib/server/convex-source.ts`, browser chat through `ConvexProviderWithClerk` in `src/routes/__root.tsx`, Convex crons, and internal workpool callbacks.

**Infrastructure and Operations Layer:**
- Purpose: Build, deploy, verify, observe, and recover the Vercel/Convex application and Package 4 infrastructure.
- Location: `vite.config.ts`, `infra/`, `tools/dev/`, `tools/release/`, `scripts/`, `.github/`.
- Contains: Vercel Node serverless configuration, Terraform/OpenTofu, local-dev orchestration, evidence generators, deployment manifests, release smokes, and package builders.
- Depends on: Source contracts in `src/`, Convex deployment APIs, Vercel, Cloudflare, AWS, and local tooling configured in `package.json`.
- Used by: Developers and release workflows; it is not imported into the browser application.

## Data Flow

### Primary Request Path

The primary implemented consequential path is authenticated `operation.inspect` followed by `operation.invoke`.

1. An agent sends `POST /api/v1/operations/inspect`; `src/routes/api.v1.operations.inspect.ts:6` delegates to `handleOperationInspectPost` in `src/lib/server/operation-invoke-api.ts:440`.
2. The server adapter bounds the body, authenticates the API key, resolves the Agent Principal and Account authority, parses the action schema, creates a correlation ID, and constructs source-write evidence in `src/lib/server/operation-invoke-api.ts` and `src/lib/server/agent-access-auth.ts`.
3. `createOperationInvokeService` calls the public Convex action `capabilityOperationCommitments:inspect` through `src/lib/server/convex-source.ts` (`src/lib/server/operation-invoke-api.ts:60`, `src/lib/server/operation-invoke-api.ts:77`).
4. `convex/capabilityOperationCommitments.ts:633` reads the live x402 requirement, resolves current grant/Operation/commercial policy, synchronizes and reads Formance capacity, and issues an expiring Commitment through `issueCommitment` at `convex/capabilityOperationCommitments.ts:601`.
5. The committed response returns a single continuation to `POST /api/v1/operations/call`; the route at `src/routes/api.v1.operations.call.ts:9` delegates to `handleOperationInvokePost` at `src/lib/server/operation-invoke-api.ts:492`.
6. `canonicalAgentInvokeHandler` at `convex/lib/operationInvocations/authorityHandlers.ts:497` admits source-write evidence, loads and revalidates the Commitment, re-observes x402 material when required, resolves current Agent Principal authority, and enters `invokeHandler`.
7. `invokeHandler` at `convex/lib/operationInvocations/invokeActions.ts:402` checks the current published Operation, validates the grant/Mandate, reserves an idempotent Invocation and its money capacity, then enqueues the durable worker through `enqueueInvocationDispatch` at `convex/lib/operationInvocations/dispatch.ts:216`.
8. The workpool invokes `convex/capabilityOperationInvocationWorker.ts:92`; `prepareInvocationRun` at `src/modules/capability-execution/invocation-worker/runPreparation.ts:200` revalidates current grant, exact Operation revision, Provider connection authority, input, price, and economic rail before claim.
9. `releaseInvocationRun` at `src/modules/capability-execution/invocation-worker/runRelease.ts:56` persists the release fence, performs SSRF-safe Provider transport, coordinates brokered x402 settlement where applicable, validates output, and records the terminal or uncertain result.
10. A completed Invocation is projected as a Call/receipt. A non-terminal Invocation is retrieved or remedied through status, cancel, and reconcile routes in `src/routes/api.v1.operations.$invocationRef.ts`, `src/routes/api.v1.operations.$invocationRef.cancel.ts`, and `src/routes/api.v1.operations.$invocationRef.reconcile.ts`; scheduled reconciliation enters through `convex/crons.ts` and `convex/capabilityOperationInvocationWorker.ts:124`.

### Public Operation Discovery Flow

1. `POST /api/v1/market-operations/search` enters at `src/routes/api.v1.market-operations.search.ts:14`; the adapter applies a 16 KiB body limit, correlation, public-read rate limiting, input validation, and output revalidation.
2. `registryOperationsSearchAction` in `src/modules/registry/operations.actions.ts:54` projects caller-facing choices from `readCapabilityOperationSearch` in `src/modules/capability-supply/operation-source.ts:24`.
3. `src/modules/capability-supply/operation-source.ts` calls `capabilitySupplyOperations:search`; `convex/capabilitySupplyOperations.ts:28` delegates to `searchHandler` in `convex/capabilitySupplyOperationQueries.ts`.
4. The Convex source port reads only current admitted `capabilityPublications`, materializes routeable Operation records, and serializes a stable `registry-operations:v1` result in `convex/capabilitySupplyOperationQueries.ts`.
5. The same action contract is reused by MCP through `src/lib/server/mcp-api.ts`, by chat tools through `src/modules/actions/index.ts`, by the web catalogue loader in `src/routes/market.tsx`, and by CLI commands under `tools/ae/commands/`.

### Provider Publication Flow

1. `POST /api/v1/supply/publish` enters at `src/routes/api.v1.supply.publish.ts`; `handleSupplyActionPost` in `src/lib/server/supply-action-api.ts` bounds JSON, requires `market_supply:manage`, resolves the Provider-side Agent Principal, and validates the `supply.publish:v2` contract.
2. `supplyPublishAction` in `src/modules/capability-supply/supply-actions.ts` prepares and validates source material, source authority, Provider claim, Operation contract, binding, price, and idempotency material.
3. The service calls Convex publication commands implemented across `convex/capabilitySupplyPublish.ts`, `convex/capabilitySupplyCommands.ts`, and module-owned publication code in `src/modules/capability-supply/internal/publication/`.
4. Publication writes sealed offerings/bindings/publications plus evidence, schedules readiness probing, and only exposes a canonical Operation after admission/current-publication conditions are met in `convex/capabilitySupplyCurrentOperation.ts` and `convex/capabilitySupplyOperations.ts`.

### Stripe Funding and Payout Evidence Flow

1. Stripe calls `POST /api/stripe/webhook` or `POST /api/stripe/webhook/accounts-v2`; the routes in `src/routes/api.stripe.webhook.ts` and `src/routes/api.stripe.webhook.accounts-v2.ts` delegate raw-body handling to `src/modules/money/server.ts`.
2. The money adapter verifies destination-specific signatures, normalizes events, and records them through `src/lib/server/stripe-money-webhook.ts` and Convex functions in `convex/moneyStripeWebhookInbox.ts`, `convex/moneyStripeWebhookWorker.ts`, and `convex/stripeWebhookWorkpool.ts`.
3. Durable money state and evidence are projected through `convex/moneyLedger.ts`, `convex/moneyAccountFunding.ts`, `convex/moneyConnect.ts`, and other `convex/money*.ts` roots; external Formance access remains isolated behind `src/modules/money/formance.ts` and `convex/moneyFormance.ts`.

**State Management:**
- Durable business state is stored in Convex tables composed by `convex/schema.ts`; no client-side store is the authority for Operations, Commitments, Invocations, authority, or money.
- Public pages load server projections through TanStack loaders/server functions, as in `src/routes/market.tsx` and `src/routes/operations.$operationRef.tsx`.
- Chat routes opt into `ConvexProviderWithClerk` only for `/t/*` and `/s/*`; provider selection and interactive authority materialization live in `src/routes/__root.tsx`.
- Local UI state stays inside React components and URL search parameters; catalogue filter/comparison state is validated in `src/routes/market.tsx`.
- Idempotency and effect state are durable records, not process memory, across `src/modules/action-invocation/`, `convex/capabilityOperationInvocations.ts`, and `convex/moneyManagedCall.ts`.

## Key Abstractions

**Operation:**
- Purpose: The single versioned unit of supply, binding contract, Provider, price, access, data use, effects, readiness, and evidence.
- Examples: `src/modules/capability-supply/public.ts`, `src/modules/capability-supply/operation-projection.ts`, `convex/capabilitySupplyCurrentOperation.ts`.
- Pattern: Content-addressed/ref-stamped immutable material is admitted and published before it appears in the current market.

**Action Definition:**
- Purpose: One cross-surface contract for inputs, outputs, authority, consequences, retries, evidence, and safe continuations.
- Examples: `src/modules/common/action.ts`, `src/modules/actions/index.ts`, `src/modules/registry/operations.actions.ts`.
- Pattern: Explicit registry plus schema-first `defineAction`; adapters derive MCP and other descriptors instead of maintaining parallel contracts.

**Commitment:**
- Purpose: Bind an expiring caller-specific decision packet before money, information, or an external effect is released.
- Examples: `src/modules/capability-execution/operation-commitment.ts`, `src/modules/capability-execution/operation-commitment.actions.ts`, `convex/capabilityOperationCommitments.ts`.
- Pattern: Inspect current material, capacity, and authority; persist exact digests; require Invocation to match the Commitment.

**Invocation and Call Projection:**
- Purpose: Invocation is the durable lifecycle identity; Call is its customer-facing projection for Logs, Usage, Spend, delivery, and recovery.
- Examples: `src/modules/capability-execution/operation-invoke.ts`, `src/modules/capability-execution/invocation-receipt-view.ts`, `convex/capabilityOperationCalls.ts`.
- Pattern: Tagged result unions (`completed`, `pending`, `needs_authority`, `reconciliation_required`, `refused`) with at most one machine continuation.

**Canonical Claim and Release Fence:**
- Purpose: Ensure every consequential Provider attempt has one durable effect identity and that uncertainty is reconciled instead of blindly retried.
- Examples: `src/modules/action-invocation/canonical-claim.ts`, `src/modules/action-invocation/runtime.ts`, `src/modules/capability-execution/invocation-worker/runRelease.ts`.
- Pattern: Transactional claim before effect, persisted `possibly_released` fence before network/payment release, and terminal or reconciliation-required convergence.

**Convex Source Transport:**
- Purpose: Give TanStack server adapters typed query/mutation/action calls without importing Convex schema internals into routes.
- Examples: `src/lib/server/convex-source.ts`, `src/modules/capability-supply/operation-source.ts`, `src/lib/server/operation-invoke-api.ts`.
- Pattern: Typed function references plus authenticated or public `ConvexHttpClient` transports; tests replace one narrow transport seam.

**Module Boundary Manifest:**
- Purpose: Make module ownership and dependency direction executable architecture.
- Examples: `src/modules/module-boundaries.ts`, `tests/imports/module-boundaries.test.ts`, `tests/imports/private-imports.test.ts`.
- Pattern: Every module declares allowed public entry files and outgoing dependencies; runtime exceptions are empty and test-only exceptions are enumerated.

**Composed Schema Ownership:**
- Purpose: Keep table definitions with the domain that owns their meaning while producing one Convex schema.
- Examples: `src/modules/money/schema.ts`, `src/modules/capability-supply/schema.ts`, `src/modules/authority/internal/convex-schema.ts`, `convex/schema.ts`.
- Pattern: Export table maps from modules and spread them into `defineSchema` at the Convex root.

## Entry Points

**Application Bootstrap:**
- Location: `src/start.ts`, `src/router.tsx`, `src/routes/__root.tsx`.
- Triggers: Vite/Nitro starts the TanStack application; browser hydration constructs the generated route tree.
- Responsibilities: Global request middleware, router defaults, HTML shell, Clerk/Convex providers, observability boot, error boundary, and toast surface.

**Public Website and Market:**
- Location: `src/routes/index.tsx`, `src/routes/market.tsx`, `src/routes/operations.$operationRef.tsx`, `src/routes/for-providers.tsx`.
- Triggers: Browser navigation and server rendering.
- Responsibilities: Public landing, Operation catalogue/search/compare, exact Operation detail, and Provider publication entrance.

**Operator Workspace:**
- Location: `src/routes/_operator.tsx`, `src/routes/_operator/`.
- Triggers: Authenticated browser navigation.
- Responsibilities: Shared operator shell plus owner, provider, agent-access, activity, status, settings, and admin projections.

**Agent HTTP API:**
- Location: `src/routes/api.v1.*`, especially `src/routes/api.v1.market-operations.search.ts`, `src/routes/api.v1.operations.inspect.ts`, and `src/routes/api.v1.operations.call.ts`.
- Triggers: External agent/CLI HTTP requests.
- Responsibilities: Public discovery, authenticated Account reads, funding handoff, supply management, inspection, Invocation, and Recovery.

**MCP:**
- Location: `src/routes/mcp.ts`, `src/lib/server/mcp-api.ts`.
- Triggers: Streamable HTTP MCP requests.
- Responsibilities: Derive tools from `src/modules/actions/index.ts`, admit anonymous read-only actions or authenticated scoped actions, and project structured errors.

**CLI:**
- Location: `tools/ae/cli.ts`, `tools/ae/commands/`, compiled by `scripts/build-cli.mjs` into `packages/cli/dist/ae.js`.
- Triggers: `npm run ae` in-repo or the distributed `ae` binary from `packages/cli/package.json`.
- Responsibilities: Machine-friendly discovery, OAuth connection, inspect/invoke/wait/recovery, account funding, market requests, and Provider supply commands.

**Convex Public/Internal API:**
- Location: `convex/*.ts`, `convex/http.ts`, `convex/crons.ts`.
- Triggers: TanStack server calls, browser Convex hooks, Convex HTTP requests, workpools, workflows, and schedules.
- Responsibilities: Transactional persistence, canonical queries, authenticated/public actions, background dispatch, webhook work, readiness, and reconciliation.

**External Webhooks:**
- Location: `src/routes/api.stripe.webhook.ts`, `src/routes/api.stripe.webhook.accounts-v2.ts`, `src/routes/api.clerk.webhook.ts`.
- Triggers: Stripe and Clerk webhook deliveries.
- Responsibilities: Verify raw signed payloads and hand durable, idempotent processing to money/security modules and Convex.

## Architectural Constraints

- **Threading:** TanStack/Nitro runs request handlers on Vercel Node serverless; Convex mutations/queries are transactional function executions, while external I/O is isolated to Convex actions and workpool jobs in `convex/capabilityOperationInvocationWorker.ts`, `convex/moneyFormance.ts`, and `convex/stripeWebhookWorkpool.ts`.
- **Global state:** Production authority and business state must not depend on module globals. Narrow replaceable test seams exist in `src/lib/server/convex-source.ts` (`publicSourceTransportForTests`) and `src/modules/registry/registry.functions.ts` (`publicRegistrySourcePortForTests`); tests must restore them after use.
- **Circular imports:** The declared cross-module graph must remain acyclic; `tests/imports/module-boundaries.test.ts` calls `declaredGraphCycles` and currently expects `[]` for `src/modules/module-boundaries.ts`.
- **Module privacy:** Cross-module, route, component, lib, and Convex consumers may import only declared entry surfaces; `tests/imports/private-imports.test.ts`, `tests/imports/module-boundaries.test.ts`, and `src/modules/module-boundaries.ts` enforce this.
- **Route thinness:** Routes must not own Convex schema or transport logic; `tests/imports/route-boundary.test.ts` enforces adapter-only route behavior.
- **Runtime boundaries:** Browser-safe module surfaces must not accidentally pull Node-only code. Node action files use `"use node"`, including `src/modules/capability-execution/invocation-runtime.ts` and `convex/capabilityOperationInvocationWorker.ts`.
- **External effects:** Provider I/O must pass public-target/SSRF checks in `src/modules/network-guard/` and the release-fence path in `src/modules/capability-execution/invocation-worker/runRelease.ts`.
- **Money isolation:** Import the Formance SDK only through `src/modules/money/formance.ts`; `tests/imports/module-boundaries.test.ts` explicitly fixes that single integration boundary, used by `convex/moneyFormance.ts`.
- **Deployment:** `vite.config.ts` fixes Nitro to Vercel Node `nodejs22.x`, not edge, because raw webhook bodies and Node/WebCrypto signature paths are required.
- **Generated code:** Do not hand-edit `src/routeTree.gen.ts` or `convex/_generated/`; regenerate through Vite/TanStack and `npm run generate:convex` from `package.json`.
- **Product boundary:** Do not add orchestration, project memory, or general agent-runtime state to these layers; the owned lifecycle remains the bounded Operation/Commitment/Invocation/Call chain defined in `PRODUCT.md` and `CONTEXT.md`.

## Anti-Patterns

### Deep Imports Across Domain Modules

**What happens:** A route, component, Convex root, or another module imports `src/modules/<owner>/internal/*` or an undeclared module file.
**Why it's wrong:** It bypasses ownership, creates reverse dependencies, and makes internal refactors externally breaking; `tests/imports/private-imports.test.ts` and `tests/imports/module-boundaries.test.ts` reject it.
**Do this instead:** Add behavior behind an existing declared entry surface such as `src/modules/capability-supply/public.ts`; add a new entry to `src/modules/module-boundaries.ts` only when it is a deliberate supported seam.

### Business Logic in Route Files

**What happens:** A `src/routes/api.*` file creates Convex clients, knows table/schema details, or duplicates domain validation and error mapping.
**Why it's wrong:** HTTP, MCP, chat, and CLI diverge, and `tests/imports/route-boundary.test.ts` rejects route-owned Convex transport.
**Do this instead:** Keep the route as method dispatch, put protocol work in `src/lib/server/`, and invoke a declared action or module service such as `src/lib/server/operation-invoke-api.ts` plus `src/modules/capability-execution/operation-invoke.actions.ts`.

### Provider or Payment I/O Before a Durable Fence

**What happens:** Code calls a Provider endpoint or releases x402/payment material directly from a route, mutation, or unfenced helper.
**Why it's wrong:** Retries can duplicate an irreversible effect and an ambiguous timeout cannot be reconciled to one attempt identity.
**Do this instead:** Reserve the Invocation, enqueue through `convex/lib/operationInvocations/dispatch.ts`, claim and persist a release fence through `src/modules/action-invocation/runtime.ts`, then perform guarded I/O in `src/modules/capability-execution/invocation-worker/runRelease.ts`.

### Treating Imported Metadata as Canonical Supply

**What happens:** External registry data is returned as an executable Operation merely because it has an endpoint or x402 metadata.
**Why it's wrong:** Metadata does not prove Provider authority, contract, readiness, price, or current publication and violates the market boundary in `PRODUCT.md`.
**Do this instead:** Import into the source/admission path in `src/modules/capability-supply/internal/`, seal a Publication through `convex/capabilitySupplyPublish.ts`, and expose it only through current-operation projection in `convex/capabilitySupplyOperations.ts`.

### Parallel Action Registries

**What happens:** A new MCP, CLI, or HTTP tool is declared independently of `src/modules/actions/index.ts`.
**Why it's wrong:** Surface schemas, authority requirements, retry rules, and action IDs drift.
**Do this instead:** Define the action in its owning module using `defineAction` from `src/modules/common/action.ts`, register it explicitly in `src/modules/actions/index.ts`, then adapt that registry at the protocol edge.

### Direct SDK Sprawl

**What happens:** Feature code imports Formance, Stripe, x402/CDP, or Provider transport SDKs throughout domain modules.
**Why it's wrong:** External protocols leak into owned commercial semantics and make testing/error containment difficult.
**Do this instead:** Keep SDK calls behind the existing adapters: `src/modules/money/formance.ts`, `src/lib/server/stripe-money-provider.ts`, `src/modules/capability-supply/internal/`, and `src/modules/capability-execution/invocation-worker/`.

## Error Handling

**Strategy:** Use typed domain/action result unions internally and project protocol failures to a canonical RFC 9457 envelope at HTTP boundaries.

**Patterns:**
- Use stable tagged results such as `completed`, `pending`, `refused`, and `reconciliation_required` in `src/modules/capability-execution/operation-invoke-contracts.ts`; do not throw for expected business outcomes.
- Convert HTTP failures through `gatewayFailureToProblem`/`buildProblem` in `src/lib/errors.ts` and `problem()` in `src/lib/server/problem.ts`; responses are `application/problem+json`, `no-store`, and correlation-stamped.
- Bound request bodies before JSON parsing through `src/lib/server/bounded-request-body.ts`; route-specific caps are declared next to adapters such as `src/routes/api.v1.market-operations.search.ts` and `src/lib/server/operation-invoke-api.ts`.
- Register unsupported methods explicitly with `methodNotAllowed` from `src/lib/server/method-guard.ts` so API paths do not fall through to the SPA.
- Treat post-release uncertainty as durable reconciliation, not a generic retry, through `src/modules/action-invocation/`, `src/modules/capability-execution/invocation-worker/recover.ts`, and `convex/capabilityOperationInvocationWorker.ts`.
- Sanitize untrusted and telemetry-visible errors before logging through `src/lib/observability/private-route-safety.ts` and `src/start.ts`.

## Cross-Cutting Concerns

**Logging:** Request correlation is established in `src/start.ts` and propagated by `src/lib/server/request-correlation.ts`; Sentry/PostHog adapters live in `src/lib/observability/`, while durable audit/evidence records live in `src/modules/observability/` and `convex/marketEvidence.ts`.

**Validation:** Use Zod at application/HTTP/action boundaries (`src/modules/common/action.ts`, `src/modules/capability-execution/operation-invoke-contracts.ts`) and Convex validators at durable function boundaries (`convex/capabilityOperationInvocations.ts`, `convex/capabilityOperationCommitments.ts`); bounded JSON and canonical digests come from `src/modules/capability-contract/public.ts` and `src/modules/common/canonical-digest.ts`.

**Authentication:** Browser/operator identity uses Clerk middleware and Clerk-to-Convex tokens in `src/start.ts`, `src/routes/__root.tsx`, and `src/lib/server/convex-source.ts`; agent Calls use Clerk API keys plus scope/current-key checks and durable principal/grant resolution in `src/lib/server/agent-access-auth.ts` and `convex/authorityBoundary.ts`; writes additionally require source-write admission through `src/lib/server/source-write-admission.ts` and `convex/sourceWriteAdmission.ts`.

**Authorization:** Funding is separate from authority. Grant/Mandate evaluation and current-generation checks span `src/modules/agent-access/policy.ts`, `src/modules/authority/`, `convex/lib/operationInvocations/authorityHandlers.ts`, and Invocation preparation in `src/modules/capability-execution/invocation-worker/runPreparation.ts`.

**Idempotency:** Canonical digests, operation keys, stable Invocation refs, transaction keys, and attempt/effect generations are applied in `src/modules/common/canonical-digest.ts`, `src/modules/capability-execution/operation-invoke.ts`, `src/modules/action-invocation/`, and `convex/lib/operationInvocations/`.

**Network Safety:** Outbound Provider calls resolve through public-target validation and guarded DNS/fetch in `src/modules/network-guard/` and `src/modules/capability-execution/invocation-worker/runRelease.ts`; credentials and x402 payment material remain server-side in `src/modules/secrets/` and `src/modules/capability-supply/server.ts`.

**Observability and Recovery:** Non-health requests run in isolated Sentry scope in `src/start.ts`; background reconciliation, readiness refresh, market refresh, and nonce/OAuth cleanup are scheduled in `convex/crons.ts` and attributed through `convex/workloadCron.ts`.

---

*Architecture analysis: 2026-09-04*
