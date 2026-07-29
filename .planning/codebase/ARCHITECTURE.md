---
last_mapped_commit: b1b105b1e07a46f637f4dcfb33537eaf4dca6bc0
last_mapped_at: 2026-07-29
last_mapped_tree: e6a09cd838ecd86ccb4b6693b5d25a58fc85bddf
worktree_dirty_files: 189
---
# Architecture

**Analysis Date:** 2026-07-29

## System Overview

The repository is a TanStack Start application whose HTTP and browser entry points sit above source-owned domain modules and Convex adapters. The active source tree is a modular monolith: public module exports and explicit action definitions form the seams, while `internal/` files hold module-private state, validators, schema fragments, and application mechanics.

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ TanStack Start request and rendering layer                                  │
│ `src/start.ts` · `src/router.tsx` · `src/routes/` · `src/components/ae/`    │
└───────────────────────────────┬────────────────────────────────────────────┘
                                │ thin transport and projections
                                ▼
┌────────────────────────────────────────────────────────────────────────────┐
│ Registered actions and source-owned domain modules                          │
│ `src/modules/actions/` · `src/modules/common/` · `src/modules/*/`           │
│ registry · inquiries · capability supply · Customer Request · invocation    │
└───────────────────────────────┬────────────────────────────────────────────┘
                                │ application functions and ports
                                ▼
┌────────────────────────────────────────────────────────────────────────────┐
│ Convex functions and persistence composition                                │
│ `convex/*.ts` · `convex/schema.ts` · module-owned schema fragments          │
└────────────────────────────────────────────────────────────────────────────┘
```

Public discovery and qualified inquiry are separate from the authenticated Customer Request route family. Capability-supply and action-invocation modules contain additional source and development seams, but their presence is not by itself evidence of public reachability or real-world completion.

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| Request middleware | Applies observability, security headers, agent-content negotiation, CSRF, source-write admission, and conditional Clerk middleware | `src/start.ts` |
| Router | Creates the TanStack router from the generated route tree and configures preload, transitions, not-found, and scroll behavior | `src/router.tsx` |
| File routes | Parse HTTP/UI inputs, select a supported action or server seam, set response behavior, and render projections | `src/routes/` |
| UI compositions | Render customer, owner, operator, listing, offering, and request projections | `src/components/ae/` |
| Shared primitives | Own genuinely cross-domain action contracts, result types, IDs, hashes, and Convex-safe literals | `src/modules/common/` |
| Action registry | Explicitly registers the supported action inventory and exposes lookup/descriptor helpers | `src/modules/actions/index.ts` |
| Business source | Owns business identity, claim, visibility, and source schema concerns | `src/modules/business/public.ts`, `src/modules/business/internal/schema.ts` |
| Catalog source | Owns business service/offering records and publication-facing catalog models | `src/modules/catalog/public.ts`, `src/modules/catalog/internal/schema.ts` |
| Registry projection | Builds public list, search, detail, and offering-supply projections from source queries | `src/modules/registry/registry.actions.ts`, `src/modules/registry/registry.functions.ts` |
| Inquiry source | Owns inquiry admission, governed communication, ledger, privacy, notification ports, and projections | `src/modules/inquiries/` |
| Capability contract | Defines provider-neutral capability and decision-model types | `src/modules/capability-contract/public.ts` |
| Capability supply | Owns offering, binding, publication, eligibility, readiness, transport admission, and published-operation materialization | `src/modules/capability-supply/` |
| Customer Request | Owns request intent, interpretation, facts, revisions, options, route decisions, authority, execution, problems, and customer projections | `src/modules/customer-request/` |
| Action Invocation | Owns shared continuity/control types, preparation, authority checks, attempts, leases, effect generations, and reconciliation state | `src/modules/action-invocation/` |
| Convex composition root | Spreads module-owned table fragments into the deployed schema | `convex/schema.ts` |
| Convex application hosts | Derive runtime identity, call application actions, and implement persistence/port boundaries | `convex/customerRequestApplication.ts`, `convex/registry.ts`, `convex/inquiries.ts` |
| Evidence tooling | Runs labelled development scenarios, integration checks, browser journeys, and release/readback checks | `tools/dev/`, `tools/release/`, `tests/`, `eval/` |

## Pattern Overview

**Overall:** Modular monolith with source-owned domain modules, thin route/server adapters, explicit registered-action contracts, and Convex-backed durable state.

**Key characteristics:**

- Each domain under `src/modules/` owns its public seam and keeps implementation details below `internal/` or responsibility-specific nested directories.
- `src/modules/actions/index.ts` is an explicit registry. Importing or evaluating a module does not make an operation publicly reachable; a route or host still needs a real adapter.
- Routes and UI project source-owned state. They do not own authority, retry, reconciliation, provider, or payment policy.
- Public discovery inventory is separate from admitted routeable supply. Registry results and catalog descriptions do not by themselves grant invocation authority.
- Customer Request state is projected into customer-semantic views. `src/modules/customer-request/customer-projection.ts` carries explicit states such as `needs_information`, `options_ready`, `needs_authorization`, `outcome_unknown`, and `needs_attention`.
- Action Invocation distinguishes `request_owned` and `standalone` origins in `src/modules/action-invocation/contracts.ts`; an invocation reference is continuity/control identity, not a substitute for business-result or authority records.
- Expected refusals, conflicts, stale state, and uncertain external effects are represented as typed results. Unexpected infrastructure failures remain transport/observability errors.
- Convex schema composition stays in `convex/schema.ts`; domain tables are declared by module fragments such as `src/modules/customer-request/internal/convex-schema.ts`.
- Development and evaluation evidence remains labelled. Source fixtures and local scenarios do not establish deployment, external fulfilment, customer value, or payment settlement.

## Layers

**Request middleware and rendering:**
- Purpose: Apply request-wide controls, serve HTML or negotiated agent content, parse transport input, and render projections.
- Location: `src/start.ts`, `src/routes/`, `src/components/ae/`, `src/lib/http/`, `src/lib/server/`.
- Contains: TanStack file routes, React pages, middleware, response helpers, server adapters, and UI compositions.
- Depends on: Action contracts, public module seams, application functions, and source transport adapters.
- Used by: Browser users, public machine clients, authenticated agents, owner/operator pages, and development journeys.

**Registered action seam:**
- Purpose: Provide one explicit operation contract where a domain operation is intentionally exposed.
- Location: `src/modules/common/action.ts`, `src/modules/actions/index.ts`, and action files such as `src/modules/registry/registry.actions.ts`.
- Contains: IDs, schemas, parameters, surfaces, consequence/authority/retry metadata, descriptors, and source runners.
- Depends on: Owning domain contracts and source/application functions.
- Used by: HTTP routes and other hosts that have a real adapter for the declared surface.

**Domain source and application:**
- Purpose: Own facts, invariants, state transitions, source projections, and customer-semantic meaning.
- Location: `src/modules/`.
- Contains: Public contracts, internal validators, commands, application use cases, state machines, projections, ports, and source adapters.
- Depends on: `src/modules/common/` and other modules' supported public seams.
- Used by: Convex functions, server adapters, routes, tests, and labelled development tooling.

**Convex host and persistence:**
- Purpose: Derive authenticated identity, run queries/mutations/actions, implement ports, schedule work, and persist durable records.
- Location: `convex/` and module-owned fragments under `src/modules/*/internal/`.
- Contains: Function entry points, validators, transaction code, worker/port adapters, and schema composition.
- Depends on: Generated Convex APIs and module application contracts.
- Used by: `src/lib/server/` adapters and route handlers.

**Evidence and evaluation:**
- Purpose: Exercise source contracts and preserve the evidence class of local, fixture, integration, browser, and release observations.
- Location: `tests/`, `tools/dev/`, `tools/release/`, and `eval/`.
- Contains: Unit/integration/import tests, browser specs, deployment-smoke checks, labelled fixtures, and evaluation datasets.
- Depends on: The same public/application seams used by product transports; release tooling additionally requires its named environment and deployment evidence.
- Used by: Focused development checks and release/readback workflows.

## Data Flow

### Public registry discovery

1. A public GET enters `src/routes/api.businesses.ts`, `src/routes/api.businesses.search.ts`, or `src/routes/api.businesses.$slug.ts`.
2. The route validates bounded input and delegates to registered actions from `src/modules/registry/registry.actions.ts`.
3. Registry source functions in `src/modules/registry/registry.functions.ts` select source queries and project the result through the registry public contract.
4. The Convex registry host in `convex/registry.ts` reads source-owned business/catalog data and returns the bounded projection.
5. The response is discovery inventory. It is not an authorization grant or proof that a provider will accept or complete work.

### Qualified inquiry

1. `src/routes/$slug.inquiry.tsx` loads a public catalog target and presents the inquiry review/send surface.
2. `src/modules/inquiries/inquiry.functions.ts` and `src/modules/inquiries/internal/admission.ts` resolve and validate target admission.
3. Submission is digest-bound and passes through `src/modules/inquiries/internal/governed-send.ts`.
4. `convex/inquiries.ts` persists the inquiry records through the schema fragment in `src/modules/inquiries/internal/convex-schema.ts`.
5. Customer, owner, operator, delivery, and export views are projections over inquiry records. A recorded receipt describes the recorded communication event, not later provider acceptance or real-world fulfilment.

### Capability supply and transport

1. Capability offerings and bindings are defined through `src/modules/capability-supply/public.ts` and persisted through the module fragment in `src/modules/capability-supply/internal/convex-schema.ts`.
2. Publication, eligibility, readiness, and operation materialization are implemented by focused files under `src/modules/capability-supply/internal/` and `src/modules/capability-supply/published-operation.ts`.
3. `src/modules/capability-supply/route-transport-runtime.ts` validates registered HTTP, MCP, and x402-shaped transport configurations and returns typed prepared, refused, or unknown observations.
4. `src/modules/capability-supply/internal/x402-payment-signer.ts` contains the x402 signing adapter. Its existence is a bounded transport implementation detail; it does not establish customer-facing payment, custody, settlement, or payouts.
5. Development supply and quote scenarios under `src/modules/capability-supply/` and `tools/dev/` remain labelled development evidence.

### Customer Request

1. The authenticated request entry is `src/routes/api.v1.requests.ts`, whose POST handler delegates to `src/lib/server/customer-request-agent-api.ts`; browser request routes use files under `src/routes/` and corresponding server adapters.
2. `convex/customerRequestApplication.ts` exposes application actions for submit, refine, facts, resume, compare, confirmation, route execution, cancellation, problem handling, evidence, and repeat-permission operations.
3. Durable request data is declared in `src/modules/customer-request/internal/convex-schema.ts` and related v2/route-mandate fragments.
4. `src/modules/customer-request/customer-projection.ts` projects durable request state into customer-semantic state and next actions.
5. Authenticated identity and authority remain distinct. Agent identity is admitted by the server/auth seams; preparation, approval, route mandate, or step controls are checked by the owning application path.

### Action Invocation control

1. Registered operation input enters `src/modules/action-invocation/application-service.ts` through a prepared invocation contract.
2. `src/modules/action-invocation/contracts.ts` binds invocation origin, actor, prepared input, refusal codes, attempts, and authority-related state.
3. Attempts, leases, fencing, resolution, and reconciliation are kept in focused files such as `src/modules/action-invocation/attempts.ts`, `src/modules/action-invocation/lease-control.ts`, `src/modules/action-invocation/fenced-execution.ts`, and `src/modules/action-invocation/reconciliation-evidence.ts`.
4. Durable invocation records are declared in `src/modules/action-invocation/internal/convex-schema.ts` and hosted by the matching Convex functions under `convex/`.
5. If an external effect may have occurred, the control path preserves unknown/reconciliation-required state rather than translating ambiguity into success or an automatic retry.

**State management:**
- Convex records are the durable source of state; React state is interaction/rendering state.
- Commands use revisions, idempotency identities, digests, leases, and effect generations instead of relying on process-local state.
- Source-specific business facts remain in their owning modules; shared invocation control does not become a substitute source for provider, result, evidence, or customer outcome facts.

## Key Abstractions

**ActionDefinition:**
- Purpose: Typed contract for a supported operation across explicitly declared surfaces.
- Examples: `src/modules/common/action.ts`, `src/modules/registry/registry.actions.ts`, `src/modules/inquiries/inquiry.actions.ts`.
- Pattern: Strict input/output schemas, parameters, read-only/consequence metadata, boundaries, and a source-owned runner.

**CustomerRequestProjection:**
- Purpose: Customer-semantic view of request state and permitted next actions.
- Examples: `src/modules/customer-request/customer-projection.ts`, `src/modules/customer-request/agent-contract.ts`.
- Pattern: Discriminated states with explicit information, comparison, authority, progress, uncertainty, recovery, and cancellation meanings.

**PublishedOperation:**
- Purpose: Materialize admitted capability supply into a runtime operation descriptor.
- Examples: `src/modules/capability-supply/published-operation.ts`, `src/modules/capability-supply/public.ts`.
- Pattern: Join exact contract, offering, binding, publication, eligibility, readiness, and transport facts before deriving runtime semantics.

**ActionInvocationView:**
- Purpose: Represent continuity/control for one action version and exact origin.
- Examples: `src/modules/action-invocation/contracts.ts`, `src/modules/action-invocation/internal/convex-schema.ts`.
- Pattern: Origin discriminator, prepared material input, actor/principal, attempt identity, version fencing, and explicit refusal/reconciliation codes.

**SourceWriteAdmission:**
- Purpose: Protect browser-originated source writes with request and operation context before a mutation is admitted.
- Examples: `src/lib/server/source-write-admission.ts`, `src/modules/security/source-write-admission.ts`.
- Pattern: Middleware/adapter admission is separate from domain ownership and does not replace domain authorization.

## Entry Points

**TanStack Start middleware:**
- Location: `src/start.ts`.
- Triggers: Every request handled by the Start runtime.
- Responsibilities: Request-wide observability, security headers, agent-content negotiation, CSRF filtering for server functions, source-write admission, and conditional Clerk middleware.

**TanStack router:**
- Location: `src/router.tsx`.
- Triggers: Server rendering and browser navigation.
- Responsibilities: Load the generated tree from `src/routeTree.gen.ts`, preload on intent, configure transitions, restore scroll, and provide not-found UI.

**Public registry APIs:**
- Location: `src/routes/api.businesses.ts`, `src/routes/api.businesses.search.ts`, `src/routes/api.businesses.$slug.ts`.
- Triggers: Unauthenticated public GET requests.
- Responsibilities: Validate bounded browse/search/detail inputs and return registry projections.

**Qualified inquiry page:**
- Location: `src/routes/$slug.inquiry.tsx`.
- Triggers: A person opening a published inquiry target and explicitly submitting the review form.
- Responsibilities: Present disclosure and invoke the governed inquiry source seam.

**Customer Request API:**
- Location: `src/routes/api.v1.requests.ts` and `src/lib/server/customer-request-agent-api.ts`.
- Triggers: Authenticated agent POST requests and returned navigation actions.
- Responsibilities: Authenticate the caller, pass closed commands into the Customer Request application seam, and serialize typed results.

**Discovery documents:**
- Location: `src/routes/[.]well-known/ucp.ts`, `src/routes/$slug.ucp.ts`, `src/routes/llms[.]txt.ts`, and `src/routes/SKILL[.]md.ts`.
- Triggers: Machine-readable discovery requests.
- Responsibilities: Project current discovery/action information; route presence is not proof of routeable supply or execution authority.

**Convex schema and functions:**
- Location: `convex/schema.ts` and the direct files under `convex/`.
- Triggers: Convex generation/deployment and server-source calls.
- Responsibilities: Compose module tables and execute source queries, mutations, actions, and port adapters.

## Architectural Constraints

- **Runtime:** TanStack Start and Vite provide the web runtime; Convex provides the durable function and schema boundary configured by the checked-in build files.
- **Threading:** Request handlers and Convex functions can run concurrently; revisions, transactional writes, leases, idempotency identities, and effect-generation fencing carry correctness.
- **Module ownership:** External code should import supported public seams such as `public.ts`; module-private files under `internal/` are not a second public API.
- **Authentication:** Middleware and server adapters establish caller identity, while source/application code makes the separate ownership and authority decisions.
- **Authority:** Possession of an action, route, request, or invocation reference does not itself authorize a consequential transition.
- **Currentness:** Mutating continuations must carry the expected request/invocation version and reject stale material inputs.
- **Recovery:** After a possible external release, ambiguity remains observable and requires reconciliation before another effect attempt; cancellation cannot assert reversal without evidence.
- **Bounded work:** Public reads, Convex queries, and scheduled work must use bounded/indexed operations. Module schema fragments are composed only at `convex/schema.ts`.
- **Generated files:** `src/routeTree.gen.ts` and `convex/_generated/` are generated artifacts, not source owners.
- **Evidence ceiling:** Local fixtures, tests, and development adapters prove only the declared local contract. They do not establish production reachability, provider fulfilment, customer value, booking, or payment settlement.

## Anti-Patterns

### Host-owned domain rules

**What happens:** A route, UI component, or server adapter recomputes candidates, authority, retry, reconciliation, or provider meaning.

**Why it's wrong:** Human and machine transports can diverge and bypass the source-owned currentness and refusal rules.

**Do this instead:** Keep transport thin and call the owning module/application seam, such as `src/lib/server/customer-request-agent-api.ts` into `convex/customerRequestApplication.ts`.

### Registry treated as routeable supply

**What happens:** A public list/detail or catalog record is treated as proof that a capability is admitted and executable.

**Why it's wrong:** Discovery inventory, offering description, binding admission, readiness evidence, and provider acceptance are distinct facts.

**Do this instead:** Keep public projections in `src/modules/registry/` and require the explicit capability-supply admission/materialization chain in `src/modules/capability-supply/` for any routeable-operation decision.

### Identity treated as authority

**What happens:** An authenticated agent key, session, request reference, or invocation reference is accepted as permission for a new consequence.

**Why it's wrong:** Identity attributes the caller; it does not establish exact scope, principal, material input, expiry, or retry semantics.

**Do this instead:** Enforce the action-specific authority in the Customer Request/application or Action Invocation seam, with relevant refusal codes from `src/modules/action-invocation/contracts.ts`.

### Payment language upgraded from transport code

**What happens:** x402 signer/transport code is described as customer-facing charging, custody, settlement, or payouts.

**Why it's wrong:** The current source shows a bounded adapter and typed refusal/unknown observations, not evidence of a customer payment product or completed external work.

**Do this instead:** Describe `src/modules/capability-supply/route-transport-runtime.ts` and `src/modules/capability-supply/internal/x402-payment-signer.ts` as guarded transport implementation, and preserve the refusal/unknown boundary.

## Error Handling

**Strategy:** Expected control outcomes are typed discriminated results; transports serialize them into stable responses. Unexpected infrastructure or invariant failures remain thrown/captured at the appropriate boundary.

**Patterns:**
- Public actions return explicit refused or not-found results rather than silently inventing data.
- Customer Request projections expose `needs_attention`, `outcome_unknown`, unsupported, cancellation, and retry-oriented states in `src/modules/customer-request/customer-projection.ts`.
- Action Invocation uses refusal codes for cross-principal, stale-version, authority, lease, generation, command-identity, and evidence failures in `src/modules/action-invocation/contracts.ts`.
- Route transport returns refused or unknown observations when an adapter cannot prove preparation or the external result is ambiguous in `src/modules/capability-supply/route-transport-runtime.ts`.
- HTTP server adapters such as `src/lib/server/customer-request-agent-api.ts` map authentication/ownership failures and source results to status-bearing JSON responses.
- Inquiry sends preserve admission/policy/refusal outcomes through `src/modules/inquiries/internal/admission.ts` and `src/modules/inquiries/internal/governed-send.ts`.

## Cross-Cutting Concerns

**Logging and observability:** Request middleware in `src/start.ts` dynamically loads `src/lib/observability/config.ts`, `src/lib/observability/posthog.server.ts`, and `src/lib/observability/sentry.server.ts`; command/audit state remains distinct from business truth.

**Validation:** Zod validates action and HTTP contracts; Convex validators protect function boundaries; digests and module state machines bind material input and currentness.

**Authentication:** Clerk middleware is installed conditionally by `src/start.ts`; Customer Request agent authentication is handled through `src/lib/server/customer-request-agent-auth.ts`; source-write admission remains a separate write boundary.

**Authority and identity:** Caller identity, ownership, preparation authority, route mandates, step grants, and invocation continuity are separate concepts. The owning module must enforce the exact consequence rather than a host inferring permission.

**Security:** Security headers and CSRF are request middleware concerns in `src/start.ts`; source-write admission and module-level validators provide additional boundary checks.

**Public claims:** Discovery and human projections should describe supplied/checked facts and supported next actions. Current source does not justify claims of booking, fulfilment, wallets, credits, custody, settlement, or payouts.

**Architecture verification:** Import and boundary tests under `tests/imports/`, domain tests under `tests/unit/`, and cross-module checks under `tests/integration/` are the executable guardrails for ownership and behavior.

---

*Architecture analysis: 2026-07-29*
