# Architecture

**Analysis date:** 2026-07-14
**Inspected revision:** `59dbf7f6` plus the current shared dirty working tree

## Executive Architecture Read

Agentic Economy is a TanStack Start and Convex modular monolith with four substantial systems in one repository:

1. a public business registry and qualified-inquiry product;
2. an answer-thread retrieval experience over registered catalog actions;
3. a Customer Request application reached by `/engine` and `/api/v1/requests`;
4. a lower-level signed routing-kernel protocol exposed from Convex.

The capability-contract and capability-supply work has created a real neutral registration substrate. Contracts, offerings, bindings, publications, readiness, price, data use, effects, evidence, and lifecycle are represented as typed data. The Customer Request backend can interpret natural language against those registered contracts and persist resumable request state.

The customer-facing engine has not yet absorbed the full power of that substrate. `/engine` still exposes a single-action preparation journey. It does not display a `RoutePlan`, let the customer choose among multi-step routes, or carry a multi-step route through approval and execution. Multi-step `RoutePlan` compilation is committed production source at `59dbf7f6`, but its projection, decision, preparation and execution work remains downstream-incomplete. This is why a large amount of infrastructure work can coexist with an engine that feels materially unchanged when a customer enters a query.

## Architectural Pattern

**Overall pattern:** Full-stack modular monolith with file-routed web adapters, module-owned domain logic, Convex-owned durable state, and explicit machine-facing contracts.

**Primary boundaries:**

- `src/routes/` owns browser and HTTP entrypoints.
- `src/components/ae/` owns product presentation.
- `src/lib/server/` adapts TanStack requests to Convex functions.
- `src/modules/` owns domain contracts and deterministic logic.
- `convex/` owns deployed functions, transactions, persistence, background work, and provider egress.
- `convex/schema.ts` composes module-owned table fragments.
- `src/modules/*/public.ts` is the intended cross-module seam; `internal/` is private implementation.

## Runtime Layers

### Web presentation

- `src/routes/engine.tsx` mounts the customer request workspace.
- `src/components/ae/customer-request/AeCustomerRequestWorkspace.tsx` owns the entire current `/engine` interaction state in React.
- `src/routes/registry.tsx`, `src/routes/$slug.tsx`, and `src/routes/$slug.inquiry.tsx` own the published-business discovery and inquiry journey.
- `src/routes/__root.tsx` owns the document shell and Astryx providers. Clerk's React provider is installed only for sign-in, sign-up, owner, and admin paths; `/engine` itself uses server-side Clerk authentication through its API calls.

### TanStack HTTP adapters

- Human Request routes use `src/routes/api.requests*.ts` and `src/lib/server/customer-request-*.ts`.
- External-agent Request routes use `src/routes/api.v1.requests*.ts` and `src/lib/server/customer-request-agent-api.ts`.
- `src/lib/server/convex-source.ts` builds authenticated or public Convex HTTP clients and invokes named Convex functions.
- Request bodies are bounded before validation; Zod schemas in `src/modules/customer-request/agent-contract.ts` define the public JSON shapes.

### Customer Request application

- `convex/customerRequestApplication.ts` is the production application orchestrator for submit, refine, fact provision, resume, option preparation, preparation authorization, approval, and attempt admission.
- `src/modules/customer-request/semantic-interpreter.ts` constrains model output to registered capability descriptors and opaque selection/input keys.
- `src/modules/customer-request/openrouter-transport.ts` calls OpenRouter with JSON-only output; runtime requires `OPENROUTER_API_KEY` and optionally `AE_CUSTOMER_REQUEST_MODEL`.
- `src/modules/customer-request/compiler.ts` compiles request snapshots, evaluated candidates, actions, and plan revisions.
- `src/modules/customer-request/evaluation.ts` calculates missing decision-changing facts, candidate viability, disclosure preview, and completion requirements.
- `src/modules/customer-request/customer-projection.ts` maps internal aggregates into the customer-visible state machine.

### Neutral capability graph

- `src/modules/capability-contract/public.ts` owns the mandatory function-agnostic contract grammar and decision model.
- `src/modules/capability-contract-registry/` owns immutable exact contract registration and lookup.
- `src/modules/capability-supply/public.ts` owns neutral offering and binding registrations.
- `src/modules/capability-supply/internal/publication-importers.ts` normalizes AE envelopes, OpenAPI 3.1 POST operations, MCP tools, and x402 resources into the same contract/offering/binding shape.
- `src/modules/capability-supply/internal/transport-adapters.ts` admits registered transport configurations. It currently admits `http-json:v1` and `mcp-jsonrpc:v1`.
- `convex/capabilitySupply.ts` persists publications, offerings, bindings, eligibility, and graph readback.
- `convex/capabilitySupplyReadiness.ts` performs guarded, bounded readiness probes and schedules renewed observations.

### Provider preparation and effects

- `convex/customerRequestV2Preparation.ts` projects an exact action into disclosure and authority requirements.
- `convex/customerRequestV2PreparationEgress.ts` and `convex/customerRequestV2PreparationEgressState.ts` allocate, dispatch, persist, and reconcile option-preparation calls.
- Production egress dispatch currently implements only `http-json:v1`. `mcp-jsonrpc:v1` can be admitted and probed but is not in the preparation egress dispatcher map.
- `convex/customerRequestV2PreparedAction.ts` validates provider responses and constructs a selected prepared action plus alternatives.
- `convex/customerRequestV2ApprovalGrant.ts`, `convex/customerRequestV2ActionAttempt.ts`, `convex/customerRequestV2ProviderExecution.ts`, and `convex/customerRequestV2ProviderReconciliation.ts` implement exact approval, cumulative authority, execution, and unknown-outcome recovery below the current human UI.

### Routing kernel

- `src/modules/routing-kernel/internal/kernel.ts` owns a separate neutral route/authorize/execute/reconcile lifecycle.
- `convex/http.ts` exposes the routing descriptor, signed routing endpoints, and `/mcp` from Convex HTTP.
- `convex/routingKernelStoreAdapter.ts` and adjacent `convex/routingKernel*.ts` files persist kernel state, grants, bindings, evidence, incident controls, and reconciliation.
- This kernel is production-deployable machine infrastructure, but `/engine` does not call these endpoints. The Customer Request application has its own preparation and provider-execution path.

## Exact `/engine` Human Query Path

```text
GET /engine
  -> src/routes/engine.tsx
  -> src/components/ae/customer-request/AeCustomerRequestWorkspace.tsx

Customer submits text
  -> POST /api/requests
  -> src/routes/api.requests.ts
  -> src/lib/server/customer-request-api.ts
  -> authenticated Convex action customerRequestApplication:submit
  -> convex/customerRequestApplication.ts
  -> loadRequestGraph()
  -> internal capabilitySupply:listEligible
  -> exact active capability contracts + eligible offerings/bindings
  -> OpenRouter semantic interpreter
  -> compileCustomerRequest()
  -> customerRequestV2:commitAggregate
  -> CustomerRequestView JSON
  -> React renders clarification, disclosure, comparison status, or refusal
```

### What the first query actually requires

- A valid Clerk browser session. `callSourceAction()` in `src/lib/server/customer-request-api.ts` obtains a Convex token through `src/lib/server/convex-source.ts`; an anonymous query receives a 401.
- `CONVEX_URL` or `VITE_CONVEX_URL` in the TanStack server environment.
- An available `OPENROUTER_API_KEY` in the Convex action environment.
- At least one published business with an active exact contract, active offering, admitted/conformant binding, and current eligible supply in `ae:public`.
- In the dirty working-tree version, `loadRequestGraph()` additionally discards supply without an active, non-stale capability publication/readiness record.

### Clarification and comparison

1. Natural-language clarification posts to `/api/requests/:requestRef/messages` and appends the answer to the stored intent.
2. Typed contract facts post to `/api/requests/:requestRef/facts` and are bound only to the current requirement.
3. `GET /api/requests/:requestRef` resumes durable state, but the React workspace does not encode `requestRef` into the URL or automatically resume after reload.
4. `POST /api/requests/:requestRef/options` invokes `customerRequestApplication:compare`.
5. `prepareCurrentAction()` in `convex/customerRequestApplication.ts` explicitly requires `plan.actions.length === 1`. Any multi-action request becomes `needs_attention` with an action-choice message.
6. Preparation may require a human disclosure authorization through `/api/requests/:requestRef/authorization` before provider data release.
7. HTTP provider responses are validated and projected as options or a prepared action.

### Human journey stop line

`AeCustomerRequestWorkspace.tsx` calls submit, clarify, facts, options, preparation authorization, and resume. It does **not** call:

- `POST /api/requests/:requestRef/approval`;
- `POST /api/requests/:requestRef/attempts`;
- any routing-kernel route;
- any multi-step `RoutePlan` selection or execution endpoint.

Those approval and attempt APIs are source-real, but they are not reachable from the current `/engine` UI.

## External-Agent Request Path

```text
POST /api/v1/requests
  -> src/routes/api.v1.requests.ts
  -> src/lib/server/customer-request-agent-api.ts
  -> Clerk user API-key authentication
  -> required scope customer_requests:create
  -> signed AE service assertion
  -> public Convex action customerRequestApplication:submit
  -> same interpreter, graph loader, compiler, persistence, and projection as /engine
```

The v1 agent routes support submit, message clarification, typed facts, option preparation, and resume. `src/modules/customer-request/hosted-agent-journey.ts` is a release/verification client for that surface, not runtime ownership. The agent surface deliberately omits customer approval and effect admission; those remain owner-authenticated human APIs.

## Capability Graph and RoutePlan State

### Source-real and production-reachable

- `convex/capabilitySupply.ts:publishCapability` imports and stores one normalized publication, exact contract, offering, and binding.
- `convex/capabilitySupply.ts:queryCapabilityGraph` returns active graph nodes with semantic, policy, cost, trust, liveness, routability, and evidence projections.
- `convex/capabilitySupply.ts:listEligible` supplies current Request compilation and preparation.
- `convex/capabilitySupplyReadiness.ts` can establish readiness for supported probe types.
- The Customer Request submit path consumes `listEligible`; it does not consume `queryCapabilityGraph`.

### Committed RoutePlan compilation

Commit `59dbf7f6` adds `CustomerRequestRoutePlan`, `compileRoutePlans()`, registered semantic input/output composition, cost aggregation, route expiry, data/effect/evidence counts, and persisted `plan.routes` in:

- `src/modules/customer-request/compiler.ts`;
- `src/modules/customer-request/evaluation.ts`;
- `src/modules/customer-request/internal/convex-v2-schema.ts`;
- `convex/customerRequestV2.ts`;
- `convex/customerRequestApplication.ts`.

The compiler and persistence proof is source-real. Its current product boundary is still narrower:

- `CustomerRequestView` in `src/modules/customer-request/agent-contract.ts` has no route-plan projection;
- `/engine` has no route-plan UI or route choice;
- `prepareCurrentAction()` refuses plans containing more than one action;
- preparation/execution remains keyed to one action rather than a selected route;
- `compileRoutePlans()` ranks only by maximum known cost, with route ID as the tie-breaker; its comparison metrics are descriptive, not a multi-objective ranker;
- `fallbacks` is always empty;
- mixed-currency combinations are dropped and `on_request` becomes `requires_preparation`;
- graph `schema_compatible` edges compare whole input/output schema digests, while Request composition uses registered matching semantic identities plus exact pointed schema identities. These are two different edge models.

The RoutePlan compiler is therefore meaningful committed kernel source, not a customer-reachable engine capability yet.

## Convex Persistence

`convex/schema.ts` composes table fragments owned under `src/modules/*/internal/`.

**Capability graph state:**

- `capabilityContractDocuments` and related contract registry tables;
- `capabilityPublications`;
- `capabilityOfferings`;
- `capabilityTransportBindings`.

**Customer Request aggregate state:**

- V2 heads, revisions, and command replays in the customer-request schema;
- immutable aggregate digests and registry snapshot digests;
- preparation records, disclosure reviews, approval evidence, authority reservations, and egress operations;
- prepared actions, approval grants, attempt reservations, provider runs, result evidence, and reconciliation observations.

**Persistence invariants:**

- exact request revision and principal identity are checked on writes;
- command keys and command digests provide idempotent replay or explicit conflict;
- contract, offering, binding, publication, and aggregate hashes are revalidated on read/use;
- provider dispatch records `allocated`, `dispatching`, `released`, `not_released`, or `uncertain` before projecting customer state;
- uncertain network outcomes do not automatically retry and require reconciliation.

Legacy V1 request tables and `src/modules/customer-request/legacy-*` remain for historical read/migration compatibility. Current submission is V2 through `convex/customerRequestApplication.ts`.

## Production Reachability Matrix

| Capability | Canonical source | Deployed entrypoint | Used by `/engine` | Current limit |
|---|---|---|---|---|
| Natural-language interpretation | `semantic-interpreter.ts`, `openrouter-transport.ts` | `customerRequestApplication:submit/refine` | Yes | Fails closed when model/config/registered descriptors are unavailable |
| Neutral contract registration | `capability-contract/public.ts`, `capabilityContractDocuments.ts` | Convex mutations/queries | Indirectly | No customer-facing registration route |
| Publication normalization | `publication-importers.ts` | `capabilitySupply:publishCapability` | Indirectly | Requires supplied AE contract annotations and commercial metadata |
| Capability graph readback | `capabilitySupply:queryCapabilityGraph` | Public Convex query | No | Not exposed as the Request compiler's canonical graph input |
| Eligible supply discovery | `capabilitySupply:listEligible` | Internal Convex query | Yes | Bounded to 64 in Request loading; active business/contract/binding required |
| Single-action preparation | `customerRequestV2Preparation*.ts` | `/api/requests/:ref/options` | Yes | Explicitly rejects plans with action count other than one |
| HTTP provider option call | `customerRequestV2PreparationEgress.ts` | Internal Convex action | Yes, after compare/authorization | `http-json:v1` only |
| MCP registration/probe | `transport-adapters.ts`, `capabilitySupplyReadiness.ts` | Convex publication/readiness | Indirectly | No MCP preparation egress dispatcher |
| x402 import | `publication-importers.ts` | `publishCapability` | Indirectly | Normalizes to HTTP JSON; payment execution is not implemented here |
| Multi-step RoutePlan compilation | `compiler.ts`, V2 schema and `customerRequestV2.ts` | Customer Request submit/commit internals | No | Committed and persisted, but not projected/selected/prepared/executed |
| Exact effect approval/admission | approval/attempt Convex modules and human APIs | `/api/requests/:ref/approval`, `/attempts` | No | APIs exist; workspace has no controls |
| Signed routing kernel | `routing-kernel/`, `convex/http.ts` | Convex HTTP routes | No | Separate protocol plane, not the customer Request engine |

## Why the Engine Can Feel Unchanged

The architecture has deepened below the interface, but the `/engine` interaction contract has not expanded with it:

- the page is still one textarea followed by clarification/status cards;
- the UI sees only `CustomerRequestView`, not graph nodes or RoutePlans;
- the compiler's internal plan is flattened into generic `ready_to_compare`, `needs_information`, or `unsupported` states;
- comparison can advance only a one-action plan;
- the UI cannot choose, approve, or execute a prepared action;
- reload does not restore a request from URL state;
- unsupported or unavailable supply collapses to short generic messages;
- the registration graph may be healthy while the required model key, API-key scope, credential environment, publication readiness, or provider adapter is missing.

The next architectural inflection is not more schema around the same journey. It is joining the already-built neutral supply graph, RoutePlan compiler, customer projection, route choice, authority, and resumable execution into one production-reachable vertical path.

## Cross-Cutting Boundaries

**Authentication and authority:** Clerk authenticates humans; Clerk user API keys authenticate external agents; service assertions bind agent operations before public Convex calls. Data release, effect approval, cumulative spend, and attempt admission are separate authority stages.

**Validation:** Zod bounds web and domain JSON; Convex validators bound persisted/function values; capability contracts validate exact JSON Schema-compatible shapes; stable canonical digests bind identities and replay.

**Network safety:** `src/modules/network-guard/` and guarded Undici dispatch prevent private-target access, bound response size, forbid redirects, and record unknown outcomes.

**Observability:** `src/start.ts` composes Sentry/PostHog request isolation and security middleware; domain evidence and receipts live separately from telemetry.

**Architecture enforcement:** `tests/imports/` guards private imports, route boundaries, and domain dependencies. `tests/ui-contract/` guards presentation and copy rules. These tests prove source structure, not hosted customer usefulness.

## Source Authority and Proof Rules

- Runtime authority is TypeScript/TSX in `src/`, Convex source in `convex/`, and deployment configuration.
- `.planning/`, `docs/`, `examples/`, `eval/`, `tools/release/`, and tests may describe or prove behavior but do not own it.
- `src/modules/customer-request/hosted-agent-journey.ts` is an executable verifier, not the Request engine.
- `convex/devSeed.ts`, `convex/sandboxAcceptanceSupply.ts`, and `src/routes/api.sandbox.capability.ts` are sandbox/support paths and cannot prove real business supply.
- Uncommitted shared-tree changes are current development state, not exact-revision deployment evidence.
