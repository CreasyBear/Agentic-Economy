<!-- refreshed: 2026-07-14 -->
# Architecture

**Analysis Date:** 2026-07-14

## System Overview

```text
┌──────────────────────────────────────────────────────────────────────┐
│                         Product surfaces                             │
├──────────────────────┬──────────────────────┬────────────────────────┤
│ Public registry and  │ Customer Request     │ Answer Thread and      │
│ qualified inquiry    │ workspace and APIs   │ assistant discovery    │
│ `src/routes/$slug*`  │ `src/routes/engine*` │ `src/routes/t.*`       │
└──────────┬───────────┴──────────┬───────────┴────────────┬───────────┘
           │                      │                        │
           ▼                      ▼                        ▼
┌──────────────────────────────────────────────────────────────────────┐
│                    Thin web/application adapters                     │
│ `src/routes/` · `src/lib/server/` · `src/modules/*/*.functions.ts`   │
└───────────────────────────────┬──────────────────────────────────────┘
                                ▼
┌──────────────────────────────────────────────────────────────────────┐
│                    Source-owned domain modules                       │
│ actions · contracts · Request compiler · policies · projections      │
│ `src/modules/`                                                       │
└───────────────────────────────┬──────────────────────────────────────┘
                                ▼
┌──────────────────────────────────────────────────────────────────────┐
│                Convex transactions, state, and effects               │
│ `convex/` · schema fragments in `src/modules/*/internal/`            │
└──────────────────────────────────────────────────────────────────────┘
```

AE is a TanStack Start and Convex modular monolith. Its currently evidenced customer product is public business discovery plus qualified inquiry. The authenticated Customer Request system is the migration path toward the target Request → RoutePlan → Approve → Run → Inspect lifecycle, but current source stops short of that complete customer contract.

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| Start router | Loads the generated file-route tree and browser defaults | `src/router.tsx` |
| Request middleware | Composes security, source-write admission, Clerk, and observability | `src/start.ts` |
| Route adapters | Own HTTP/browser parsing and response mapping | `src/routes/` |
| Server adapters | Bind Start requests to authenticated/public Convex calls | `src/lib/server/` |
| Action registry | Registers reusable operations and their explicit surfaces | `src/modules/actions/index.ts` |
| Customer Request | Owns interpretation, compilation, projection, authority, and result rules | `src/modules/customer-request/` |
| Capability contracts | Defines the neutral contract and decision grammar | `src/modules/capability-contract/public.ts` |
| Capability supply | Owns offerings, bindings, publication, eligibility, and readiness | `src/modules/capability-supply/` |
| Request application | Coordinates durable Request commands and provider preparation | `convex/customerRequestApplication.ts` |
| Convex schema | Composes module-owned table fragments | `convex/schema.ts` |
| Registry/inquiries | Publishes discovery inventory and admission-gated qualified inquiries | `src/modules/registry/`, `src/modules/inquiries/` |

## Pattern Overview

**Overall:** Full-stack modular monolith with domain-owned façades, file-routed adapters, durable command processing, and explicit maturity boundaries.

**Key Characteristics:**
- Cross-module code imports supported contracts through `src/modules/<domain>/public.ts`; `internal/` remains private.
- Routes stay thin and delegate behavior to modules or server adapters.
- Convex owns durable state, transactions, scheduled work, and provider egress.
- Command keys, canonical digests, exact revisions, and immutable evidence make writes replay-safe.
- Registration, admission, readiness, dispatch support, and customer reachability are distinct states.
- Current evidenced behavior is reported separately from target product architecture.

## Layers

**Product presentation:**
- Purpose: Render public, authenticated customer, owner, and operator journeys.
- Location: `src/routes/`, `src/components/ae/`, `src/views/`
- Contains: TanStack route components, Astryx-backed UI, and client lifecycle state.
- Depends on: HTTP APIs and read-only projections; it must not own matching or authority decisions.
- Used by: Browser customers, business owners, and operators.

**Web/application adapters:**
- Purpose: Bound and validate HTTP input, resolve authentication, and map domain results to responses.
- Location: `src/routes/api.*`, `src/lib/server/`, `src/modules/*/*.functions.ts`
- Contains: TanStack handlers, bounded body parsing, Clerk/Convex token binding, and status mapping.
- Depends on: Public module contracts and Convex function references.
- Used by: Browser UI and authenticated external agents.

**Domain modules:**
- Purpose: Own stable schemas, deterministic transitions, policy, projections, and reusable operations.
- Location: `src/modules/`
- Contains: `public.ts` façades, `*.actions.ts`, contract types, command logic, and private `internal/` implementations.
- Depends on: Other modules only through supported public seams.
- Used by: Start adapters, Convex functions, tests, and machine descriptors.

**Durable backend and effect boundary:**
- Purpose: Persist aggregates, enforce transactional invariants, schedule work, and perform bounded external calls.
- Location: `convex/`
- Contains: Queries, mutations, actions, cron handlers, schema composition, and HTTP retirement responses.
- Depends on: Module-owned validators and deterministic domain logic.
- Used by: Start server adapters and internal Convex calls.

## Data Flow

### Current Human Customer Request Path

1. `/engine` mounts `AeCustomerRequestWorkspace` (`src/routes/engine.tsx`, `src/components/ae/customer-request/AeCustomerRequestWorkspace.tsx`).
2. The workspace posts a bounded command to `/api/requests` (`src/routes/api.requests.ts`).
3. `src/lib/server/customer-request-api.ts` resolves the Clerk/Convex context and invokes `customerRequestApplication:submit`.
4. `convex/customerRequestApplication.ts` loads up to 64 eligible bindings, interprets natural language against registered descriptors, compiles the Request, and commits the V2 aggregate.
5. `src/modules/customer-request/customer-projection.ts` returns the exact customer-visible state.
6. The workspace supports clarification, facts, option preparation, disclosure authorization, and resume.

The production source can project multi-step plans as `routes_ready` with `nextAction: 'inspect_routes'`. The current workspace has no `routes_ready` rendering branch, no route selection command, and no composite authority/execution path. RoutePlan projection is therefore committed substrate, not a proven customer decision lifecycle.

### Public Registry and Qualified Inquiry

1. `/registry` and `/$slug` read published catalog projections through `src/modules/registry/`.
2. `GET /api/businesses/search` and `GET /api/businesses/$slug` expose the same bounded public facts.
3. `/$slug/inquiry` submits the sole assistant-exposed write, `inquiry.submit`, through admission-gated inquiry functions.
4. `convex/inquiries.ts` persists the inquiry and `convex/notificationOutbox.ts` records delivery work and evidence.

Discovery inventory is not routeable supply. A route candidate additionally requires a current admitted business, exact contract, offering, conformant binding, publication, credentials, and readiness evidence.

### External-Agent Request Path

1. `/api/v1/requests*` receives authenticated external-agent commands.
2. `src/lib/server/customer-request-agent-auth.ts` enforces Clerk user API-key identity and exact scopes.
3. `src/lib/server/customer-request-agent-api.ts` signs the service assertion and calls the same Request application spine.
4. The surface supports create/resume, natural-language clarification, typed facts, and option preparation; it does not prove route choice, composite approval, execution, or fulfilment.

**State Management:**
- Durable Request authority lives in V2 heads, revisions, and command replay tables composed from `src/modules/customer-request/internal/convex-schema.ts`.
- Exact revision checks prevent stale writes; command digests distinguish safe replay from conflict.
- React state is a projection/lifecycle concern and is not domain authority.
- Provider egress records allocation and uncertain outcomes before customer projection; unknown outcomes are not blindly retried.

## Key Abstractions

**ActionDefinition:**
- Purpose: Define one operation once with schema, output, surfaces, read/write posture, summary, and boundaries.
- Examples: `src/modules/common/action.ts`, `src/modules/registry/registry.actions.ts`, `src/modules/inquiries/inquiry.actions.ts`
- Pattern: Explicit registration in `src/modules/actions/index.ts`; `agentTools` exposure additionally uses the quiet-door allowlist.

**Customer Request aggregate:**
- Purpose: Preserve interpreted intent, exact revision, evaluated candidates, plan, and evidence across commands.
- Examples: `src/modules/customer-request/compiler.ts`, `src/modules/customer-request/internal/convex-v2-schema.ts`, `convex/customerRequestV2.ts`
- Pattern: Immutable revisions plus a current head and idempotent command records.

**Capability contract and binding:**
- Purpose: Keep the compiler neutral while providers register exact operation, input/output, policy, price, data-use, effect, and evidence declarations.
- Examples: `src/modules/capability-contract/public.ts`, `src/modules/capability-supply/public.ts`
- Pattern: Domain behavior enters as registered data or provider adapters, never compiler branching.

**Customer projection:**
- Purpose: Translate internal aggregates into bounded, resumable human/machine states without leaking internal architecture.
- Examples: `src/modules/customer-request/customer-projection.ts`, `src/modules/customer-request/agent-contract.ts`
- Pattern: Discriminated state plus explicit `nextAction`; projection does not imply an action was reachable or completed.

## Entry Points

**TanStack application:**
- Location: `src/router.tsx`, `src/start.ts`, `src/routeTree.gen.ts`
- Triggers: Browser navigation and Start HTTP requests.
- Responsibilities: File-route dispatch, middleware, rendering, and API response handling.

**Convex backend:**
- Location: `convex/schema.ts`, `convex/*.ts`
- Triggers: Start server adapters, scheduled work, and internal Convex calls.
- Responsibilities: Durable commands, queries, transactions, effects, and evidence.

**Machine discovery:**
- Location: `src/routes/llms[.]txt.ts`, `src/routes/SKILL[.]md.ts`, `src/routes/api.businesses*.ts`, `src/modules/harness/tool-contract.ts`
- Triggers: Assistant/tool clients and public reads.
- Responsibilities: Advertise only explicitly exposed operations and boundary-honest public facts. The current route tree contains discovery and catalog JSON routes but no `api.agent.tools` route file, so the retained quiet-door contract code is not by itself proof of a reachable HTTP surface.

**Retired routing endpoints:**
- Location: `convex/http.ts`, `src/modules/routing-kernel/retirement.ts`
- Triggers: Requests to `/v1/route`, `/v1/authorize`, `/v1/execute`, `/v1/reconcile`, `/v1/inspect`, `/v1/cancel`, `/mcp`, and `/.well-known/ae-routing.json`.
- Responsibilities: Return the explicit routing-v1 retirement response. Do not treat the remaining routing-kernel source as a live public plane.

## Architectural Constraints

- **Threading:** JavaScript event-loop execution; Convex transactions serialize durable mutations while actions own external effects.
- **Global state:** The action registry is module-level immutable state in `src/modules/actions/index.ts`; formatter/config singletons must remain pure and bounded.
- **Circular imports:** Avoided through public façades and import tests; module internals must not be cross-imported.
- **Authority:** Authentication, data disclosure, approval, spend reservation, and effect admission are separate gates.
- **Neutrality:** Adding a conformant provider must not change compiler, Request API, customer projection, or UI choreography.
- **Visual authority:** `DESIGN.md` and Astryx own UI decisions; Tailwind utilities are layout glue.
- **Convex authority:** Read `convex/_generated/ai/guidelines.md` before any Convex change.
- **Maturity:** Sandbox behavior, internal persistence, tests, or closed issues do not prove production customer reachability.

## Anti-Patterns

### Parallel customer intent domains

**What happens:** New recommendation, history, compiler, or recovery semantics are added to Answer Thread.
**Why it's wrong:** Conversation must compile into and resume the canonical Customer Request; a second domain creates divergent truth and replay behavior.
**Do this instead:** Put customer intent and lifecycle behavior in `src/modules/customer-request/` and use conversation only as an input/presentation adapter.

### Treating registration as execution readiness

**What happens:** A published business page or admitted transport is described as routeable and executable.
**Why it's wrong:** Registration does not prove current publication, eligibility, credentials, readiness, dispatcher support, or customer reachability.
**Do this instead:** Preserve each explicit gate in `src/modules/capability-supply/`, `convex/capabilitySupply.ts`, and the Request application.

### Routes owning domain behavior

**What happens:** Matching, authority, idempotency, or provider-result rules are implemented directly in `src/routes/`.
**Why it's wrong:** Human and machine surfaces drift and retries become nondeterministic.
**Do this instead:** Keep routes as bounded adapters and place behavior in the owning module or Convex application command.

### Aspirational surface claims

**What happens:** Persisted RoutePlans or retained routing-kernel code are described as customer-available routing/execution.
**Why it's wrong:** Current HTTP routing endpoints are retired and the customer workspace cannot inspect, choose, approve, or run composite routes.
**Do this instead:** State the exact source-real substrate and separately name missing intended-surface evidence.

## Error Handling

**Strategy:** Fail closed at authority and validation boundaries; preserve typed domain outcomes and distinguish retryable, terminal, conflicted, and unknown states.

**Patterns:**
- Zod and bounded request-body helpers reject malformed or oversized HTTP input before domain work.
- Convex validators and exact revision checks reject invalid durable commands.
- Discriminated results use `refused`, `conflict`, `needs_attention`, `proof_gap`, and customer states instead of generic success booleans.
- Provider uncertainty is persisted and reconciled; it is never converted into an automatic retry.
- Public copy states that AE does not book, charge, dispatch, or guarantee external fulfilment.

## Cross-Cutting Concerns

**Logging:** Observability uses Sentry/PostHog adapters under `src/lib/observability/`; domain audit evidence remains separate from telemetry.
**Validation:** Zod bounds HTTP/domain JSON, Convex validators bound stored values, and canonical digests bind immutable command/evidence material.
**Authentication:** Clerk authenticates humans and scoped external-agent API keys; source-write admission and domain authority checks remain additional gates.
**Security:** `src/modules/network-guard/` and server helpers bound external targets, response sizes, redirects, secrets, and timing-sensitive comparisons.
**Verification:** `tests/imports/`, `tests/ui-contract/`, domain unit/integration tests, codegen, typecheck, and hosted readback prove different layers; none alone proves customer value.

---

*Architecture analysis: 2026-07-14*
