<!-- refreshed: 2026-07-21 -->
# Architecture

**Analysis Date:** 2026-07-21
**last_mapped_commit:** `63a451f43edea453d0a1a8d8502504433acf76fb`
**last_mapped_tree:** `16fee2f5321d7917f7f0bccd5d59e3d6a018be64`

## System Overview

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ TanStack Start human and agent transports                                    │
│ React pages · file routes · JSON APIs · server functions                     │
│ `src/routes/` · `src/components/ae/` · `src/lib/server/`                      │
└───────────────┬────────────────────────┬─────────────────────────────────────┘
                │                        │
                ▼                        ▼
┌────────────────────────────┐  ┌──────────────────────────────────────────────┐
│ Public discovery / inquiry │  │ Authenticated work                           │
│ business → catalog →       │  │ Customer Request and standalone paid action │
│ registry → governed send   │  │ `customer-request/` · `action-invocation/`  │
│ `src/modules/{business,    │  └───────────────────┬──────────────────────────┘
│ catalog,registry,inquiries}`│                      │
└───────────────┬────────────┘                      │
                └────────────────────┬───────────────┘
                                     ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│ Domain contracts and application services                                   │
│ Registered actions · source functions · ports · state machines               │
│ `src/modules/actions/` · `src/modules/*/*.functions.ts` · domain modules      │
└────────────────────────────────────┬─────────────────────────────────────────┘
                                     ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│ Convex transport, authentication, transaction, worker and adapter layer      │
│ `convex/*.ts` · `src/lib/server/convex-source.ts`                             │
└────────────────────────────────────┬─────────────────────────────────────────┘
                                     ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│ Module-owned durable source and control records                              │
│ schema fragments in `src/modules/*/internal/*schema.ts`                      │
│ composed only by `convex/schema.ts`                                           │
└──────────────────────────────────────────────────────────────────────────────┘
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| Router | Builds the generated TanStack route tree and global navigation behavior | `src/router.tsx` |
| File routes | Parse HTTP/UI inputs, invoke server/application seams, set status/cache behavior, and render projections | `src/routes/` |
| Server adapters | Bind route requests to authenticated Convex source calls without owning business state | `src/lib/server/` |
| Action contract | Defines schemas, surfaces, consequence, authority, retry, evidence, continuation, and runner contracts | `src/modules/common/action.ts` |
| Action registry | Explicitly registers supported cross-surface operations; registration does not create a route | `src/modules/actions/index.ts` |
| Business source | Owns claimed business identity, context, visibility, trust tier, and ownership records | `src/modules/business/public.ts`, `src/modules/business/internal/schema.ts` |
| Catalog source | Owns business services and published non-callable capability descriptions | `src/modules/catalog/public.ts`, `src/modules/catalog/internal/schema.ts` |
| Registry projection | Builds public list, search, and detail DTOs from published business/catalog source | `src/modules/registry/registry.actions.ts`, `convex/registry.ts` |
| Inquiry source | Owns qualified-inquiry admission, governed send, thread/message ledger, receipts, privacy, and owner/customer projections | `src/modules/inquiries/`, `convex/inquiries.ts` |
| Capability contracts | Owns schema-driven capability meaning and decision-model validation | `src/modules/capability-contract/`, `src/modules/capability-contract-registry/` |
| Capability supply | Owns offering, binding, publication, eligibility, readiness, transport admission, and operation materialization | `src/modules/capability-supply/`, `convex/capabilitySupply*.ts` |
| Customer Request | Owns the broader customer outcome, revisions, comparison, confirmation, route execution, recovery, and customer projection | `src/modules/customer-request/`, `convex/customerRequest*.ts` |
| Action Invocation | Owns shared invocation continuity: preparation, bounded authority binding, attempt identity, leases, effect generations, uncertainty, and safe continuation | `src/modules/action-invocation/` |
| Hosted paid-operation source | Owns the labelled sandbox provider, prepared payment proposal, result delivery, evidence references, and trial admission aggregate | `src/modules/action-invocation/hosted-paid-operation-*.ts`, `convex/hostedPaidOperation.ts` |
| Paid-operation gateway | Derives the caller, accepts closed public intent, and coordinates internal source mutations/actions | `convex/hostedPaidOperationGateway.ts` |
| Paid-operation projections | Derive one semantic model, then human-rich and agent-structured views with equality-only semantic digests | `src/modules/action-invocation/paid-operation-semantics.ts`, `src/modules/action-invocation/paid-operation-card-contract.ts` |
| Schema composition root | Spreads module-owned table fragments into one Convex schema | `convex/schema.ts` |
| Evidence tooling | Separates development fixtures, exact-source verification, hosted journey collection, and proof-packet validation | `tools/dev/`, `tools/release/` |

## Pattern Overview

**Overall:** Modular monolith with domain-owned source records, application services/state machines, thin ports-and-adapters transports, and Convex-backed durability.

**Key Characteristics:**
- Use `src/modules/<domain>/` as the ownership unit. Public contracts live in `public.ts` or deliberate top-level module files; implementation-only code lives under `internal/`.
- Keep route and UI code above source/application seams. Routes may transport identity and closed intent; they must not reproduce authority, retry, reconciliation, provider, or payment rules.
- Register reusable operations explicitly in `src/modules/actions/index.ts` and define their invocation semantics in `src/modules/common/action.ts`.
- Keep business truth in the domain aggregate that owns it. `actionInvocationControls` stores continuity and source references; paid-operation provider/result/payment truth is reconstructed from dedicated hosted records.
- Preserve discriminated invocation origin in `src/modules/action-invocation/contracts.ts`: `request_owned` keeps exact Request revision lineage; `standalone` carries caller and principal without fabricating a Request.
- Use typed ordinary outcomes for refusal, conflict, stale state, and unknown effects. Throw only for unexpected infrastructure or invariant failures.
- Compose Convex schema from module fragments in `convex/schema.ts`; do not define domain tables in the root.
- Treat development and hosted evidence as separate products of separate tooling. Source fixtures do not become deployment or provider proof.

## Layers

**Transport and Rendering:**
- Purpose: Authenticate callers, parse bounded input, return HTTP status/cache policy, and render source projections.
- Location: `src/routes/`, `src/components/ae/`, `src/lib/server/`
- Contains: TanStack routes, React UI, request handlers, Clerk adapters, Convex source transport.
- Depends on: Application services, action contracts, projection DTOs, authenticated source functions.
- Used by: Browser users, external agents, owner/admin operators, release journey tooling.

**Registered Action Seam:**
- Purpose: Give supported operations one schema, honest boundaries, invocation classification, and source runner.
- Location: `src/modules/common/action.ts`, `src/modules/actions/index.ts`, `src/modules/*/*.actions.ts`
- Contains: `ActionDefinition`, surface exposure, consequence/authority/retry classification, preparation and result hooks.
- Depends on: Domain source functions and Zod schemas.
- Used by: UI, HTTP, agent JSON, and Answer Thread where each action explicitly exposes that surface.

**Domain Source and Application:**
- Purpose: Own business facts, invariants, state transitions, and customer-semantic projections.
- Location: `src/modules/`
- Contains: Pure contracts, commands, state machines, source functions, application services, semantic ports.
- Depends on: `src/modules/common/` primitives and explicit sibling public seams.
- Used by: Convex hosts, server adapters, tests, development eval tooling.

**Convex Host and Persistence:**
- Purpose: Derive authenticated identity, run transactions/actions, implement domain ports, schedule bounded work, and persist records.
- Location: `convex/`, schema fragments under `src/modules/*/internal/`
- Contains: Queries, mutations, actions, workers, validators, table/index declarations.
- Depends on: Domain application contracts and generated Convex APIs.
- Used by: Authenticated and public server transports.

**Evidence and Evaluation:**
- Purpose: Demonstrate source contracts, development scenarios, exact-revision hosted behavior, and proof integrity without upgrading evidence classes.
- Location: `tests/`, `tools/dev/`, `tools/release/`, `eval/`
- Contains: Unit/integration/import/UI tests, labelled fixtures, provenance capture, hosted journey collectors and packet validators.
- Depends on: Public/application seams for behavior checks; release tooling additionally depends on hosted deployment and provider APIs.
- Used by: Development loops, release gates, architecture custody checks.

## Data Flow

### Public Business Discovery

1. `GET /api/businesses`, `/api/businesses/search`, or `/api/businesses/$slug` enters a thin file route (`src/routes/api.businesses.ts:6`, `src/routes/api.businesses.search.ts:9`, `src/routes/api.businesses.$slug.ts:7`).
2. The route parses action input and runs `registryListAction`, `registrySearchAction`, or `registryDetailAction` (`src/modules/registry/registry.actions.ts`).
3. Registry source functions call bounded Convex catalog queries through the server source seam (`src/modules/registry/registry.functions.ts`, `convex/registry.ts`).
4. The public DTO joins only published business/context/service/capability data sourced from `businesses`, `businessContexts`, `businessServices`, and `serviceCapabilities` (`src/modules/business/internal/schema.ts`, `src/modules/catalog/internal/schema.ts`).
5. The route returns a no-store JSON projection. This is discovery inventory, not routeable supply or an authorization grant (`src/routes/api.businesses.ts:35`).

### Qualified Inquiry

1. `/$slug/inquiry` loads the public catalog and selects a published inquiry target (`src/routes/$slug.inquiry.tsx:42`).
2. The route reads current target admission through `readPublicTargetAdmissionServer` and shows the exact governed-send review (`src/modules/inquiries/inquiry.functions.ts`).
3. Submission builds and digest-binds the canonical send intent before calling `submitPublicInquiryServer` (`src/routes/$slug.inquiry.tsx:136`).
4. Inquiry application code validates admission, identity, disclosed contact fields, idempotency, and policy before the source mutation (`src/modules/inquiries/internal/admission.ts`, `src/modules/inquiries/internal/governed-send.ts`).
5. Convex persists thread, message, customer access, notification, governed-send receipt, and integrity records (`src/modules/inquiries/internal/convex-schema.ts`, `convex/inquiries.ts`).
6. Customer, owner, operator, delivery, and export reads are projections over the inquiry ledger (`src/modules/inquiries/internal/projections/`). A receipt proves the recorded send event, not later provider acceptance or fulfilment.

### Capability Supply to Published Operation

1. Business-owned offering and transport-binding commands persist through `convex/capabilitySupply*.ts` into module-owned tables (`src/modules/capability-supply/internal/convex-schema.ts`).
2. Publication and readiness records are evaluated with exact contract, offering, binding, admission, eligibility, freshness, credential, and evidence links (`src/modules/capability-supply/internal/publication/`, `src/modules/capability-supply/internal/graph/`).
3. `materializePublishedOperation` rejects any mismatch across publication, contract, offering, binding, admitted transport, and qualification evidence (`src/modules/capability-supply/published-operation.ts:101`).
4. `materializeRuntimePublishedOperation` derives input/output validation, consequence, authority, retry, data-use, effect, and continuation semantics from that exact materialized operation (`src/modules/capability-supply/published-operation.ts:207`).
5. Development supplied-quote and dynamic-invocation scenarios consume this seam through labelled adapters; they do not create public reachability (`src/modules/capability-supply/supplied-quote.actions.ts`, `src/modules/capability-supply/development-*.ts`).

### Action Invocation Control

1. A registered action and exact input enter the Action Invocation application service (`src/modules/action-invocation/application-service.ts`).
2. Preparation records material-input digest, exact target, consequence, data-use limits, freshness, actor, and discriminated origin (`src/modules/action-invocation/contracts.ts:6`).
3. Authority acceptance binds the exact invocation/version, actor, origin, action contract, target, consequence, limits, and expiry (`src/modules/action-invocation/contracts.ts:245`).
4. Acquire creates an attributable attempt with stable idempotency meaning, a lease owner, and one effect generation (`src/modules/action-invocation/attempts.ts`, `src/modules/action-invocation/lease-control.ts`).
5. Execution publishes release state and business outcome through fenced transitions (`src/modules/action-invocation/fenced-execution.ts`, `src/modules/action-invocation/resolution-control.ts`).
6. Possible release or timeout moves to `reconciliation_required`; only verified source evidence can permit a safe retry or record released-but-unknown truth (`src/modules/action-invocation/reconciliation-evidence.ts`).
7. Durable control, attempts, and command history persist separately from the action-specific source result (`src/modules/action-invocation/internal/convex-schema.ts:129`, `convex/actionInvocationControl.ts`).

### Hosted Paid-Operation

1. Human `/actions/paid/*` and agent `/api/v1/paid-operations*` routes authenticate through distinct adapters and pass only provider-fixture selection or a closed command (`src/routes/actions.paid.new.tsx`, `src/routes/api.v1.paid-operations.ts`).
2. `src/lib/server/hosted-paid-operation-runtime.ts` forwards intent to `convex/hostedPaidOperationGateway.ts`; the request cannot supply owner, provider facts, payment material, effect generation, or trusted reconciliation evidence.
3. `authenticatedCreate` derives the caller from Convex auth or a signed, scoped service assertion, atomically reserves trial admission, resolves provider A/B inside source, and persists the complete initial aggregate (`convex/hostedPaidOperationGateway.ts:159`).
4. The hosted source stores business truth in `hostedPaidOperationSources`, payment truth in `hostedPaidOperationPayments`, evidence references separately, and continuity in Action Invocation tables (`src/modules/action-invocation/internal/convex-schema.ts:197`).
5. `authorize`, `execute`, and `reconcile` enter `createPaidOperationApplicationService`; transaction commands compare invocation version, command digest, principal, effect generation, and trusted observation guards (`src/modules/action-invocation/paid-operation-application-service.ts:105`, `src/modules/action-invocation/hosted-paid-operation-port.ts`).
6. Before possible release, the payment attempt is persisted as submission started; the mock-effect observer records source evidence; post-command reads reload the committed aggregate (`convex/hostedPaidOperationGateway.ts`, `convex/hostedPaidOperation.ts`).
7. `derivePaidOperationSemantics` creates the canonical `agentic-paid-operation:v1` meaning, then human and agent views project it without inferring authority, payment, settlement, or provider results (`src/modules/action-invocation/paid-operation-semantics.ts:185`).
8. Routes return no-store readbacks. Transport ambiguity becomes `update_not_confirmed` and exposes inspect/reload rather than repeating a mutating command (`src/lib/server/hosted-paid-operation-human-api.ts`, `src/lib/server/hosted-paid-operation-agent-api.ts`).

### Customer Request

1. Authenticated external-agent routes enter through `src/routes/api.v1.requests*.ts` and `src/lib/server/customer-request-agent-api.ts`; browser lifecycle adapters use `src/lib/server/customer-request-browser-lifecycle-api.ts`.
2. Convex application functions derive identity/service assertions and call slices under `src/modules/customer-request/application/` (`convex/customerRequestApplication.ts`).
3. Customer Request owns intent, revisions, facts, evaluations, preparation, route plans, confirmations, execution, cancellation, evidence, problems, and durable resume (`src/modules/customer-request/internal/convex-schema.ts`).
4. Human and agent callers receive the same customer-semantic `CustomerRequestProjection` with permitted next actions (`src/modules/customer-request/customer-projection.ts`).
5. Request-owned Action Invocation lineage remains exact; standalone paid-operation lineage does not create or inherit a synthetic Customer Request (`src/modules/action-invocation/contracts.ts:6`).

**State Management:**
- Convex records are authoritative for durable state. React state tracks only interaction/rendering state and reloads source after mutations.
- Domain aggregates use explicit revisions, command/idempotency keys, digests, leases, and effect generations rather than process memory.
- Shared Action Invocation control is removable continuity state; source result records remain authoritative for provider, result, payment, and evidence facts.

## Key Abstractions

**ActionDefinition:**
- Purpose: One typed contract for an operation across explicitly supported surfaces.
- Examples: `src/modules/common/action.ts`, `src/modules/inquiries/inquiry.actions.ts`, `src/modules/capability-supply/supplied-quote.actions.ts`
- Pattern: Zod input/output + honest boundaries + invocation contract + source runner.

**PublishedOperation:**
- Purpose: Materialize exactly admitted supply into runtime action semantics.
- Examples: `src/modules/capability-supply/published-operation.ts`
- Pattern: Exact-source digest join; reject mismatched publication, contract, offering, binding, transport, readiness, or qualification.

**ActionInvocationView:**
- Purpose: Represent source-referenced continuity for one action version and one exact consequence lineage.
- Examples: `src/modules/action-invocation/contracts.ts`, `src/modules/action-invocation/internal/convex-schema.ts`
- Pattern: Discriminated origin + prepared input + bounded authority + attributable attempts + fenced currentness + explicit recovery.

**HostedPaidOperationAggregate:**
- Purpose: Reconstruct a complete paid-operation read model from bounded source, payment, evidence, and control records.
- Examples: `src/modules/action-invocation/hosted-paid-operation-port.ts`, `convex/hostedPaidOperation.ts`
- Pattern: Aggregate completeness checks + child caps + atomic CAS transaction + post-command durable reload.

**CustomerRequestProjection:**
- Purpose: Present the same customer-semantic Request state and continuations to human and machine transports.
- Examples: `src/modules/customer-request/customer-projection.ts`, `src/modules/customer-request/agent-contract.ts`
- Pattern: Projection over durable Request/application records; hosts do not recompute business choices.

**SourceWriteAdmission:**
- Purpose: Bind browser-originating business writes to method, origin, path, body digest, operation key, correlation, nonce, and scope.
- Examples: `src/modules/security/source-write-admission.ts`, `convex/sourceWriteAdmission.ts`
- Pattern: Signed request envelope + one-time nonce persistence + typed rejection.

## Entry Points

**TanStack Router:**
- Location: `src/router.tsx`
- Triggers: Server rendering and browser navigation.
- Responsibilities: Use the generated route tree, preload by intent, restore scroll, and provide the global not-found component.

**Public Registry APIs:**
- Location: `src/routes/api.businesses.ts`, `src/routes/api.businesses.search.ts`, `src/routes/api.businesses.$slug.ts`
- Triggers: Unauthenticated public GET requests.
- Responsibilities: Parse bounded query/path input and return public registry action projections.

**Qualified Inquiry:**
- Location: `src/routes/$slug.inquiry.tsx`, `src/modules/inquiries/inquiry.functions.ts`
- Triggers: Public review and explicit send.
- Responsibilities: Show the exact disclosure, admit the target, and submit one governed communication.

**Customer Request:**
- Location: `src/routes/api.v1.requests.ts`, `src/routes/api.requests.ts`
- Triggers: Authenticated agent or browser request creation and continuation.
- Responsibilities: Delegate into the canonical Customer Request application lifecycle.

**Hosted Paid Operation:**
- Location: `src/routes/actions.paid.new.tsx`, `src/routes/api.v1.paid-operations.ts`
- Triggers: Authenticated human session or scoped Clerk API key.
- Responsibilities: Create and continue one labelled hosted sandbox operation through the same source application seam.

**Convex Schema:**
- Location: `convex/schema.ts`
- Triggers: Convex deployment/code generation.
- Responsibilities: Compose every domain-owned table fragment.

## Architectural Constraints

- **Runtime:** TanStack Start/Nitro runs on Vercel Node serverless; Convex supplies durable query/mutation/action execution (`vite.config.ts`).
- **Threading:** Serverless request handlers and Convex functions are concurrent; correctness relies on transactional mutations, command digests, leases, revisions, and effect-generation fencing.
- **Global state:** Production truth must not rely on module-level maps. In-memory ports in `src/modules/action-invocation/in-memory*.ts` and development adapters are fixture/eval infrastructure only.
- **Authentication:** Human identity comes from Clerk session; agent identity comes from scoped Clerk API keys and current key-state readback; Convex public identity comes from `ctx.auth.getUserIdentity()` or signed service intent (`src/lib/server/hosted-paid-operation-agent-auth.ts`, `convex/hostedPaidOperationGateway.ts`).
- **Authority:** Identity and trial admission do not authorize consequence. Paid-operation authority is accepted against the prepared invocation, and Customer Request authority is derived from current source proposals.
- **Currentness:** Every mutating continuation carries expected invocation/request version; external-effect paths additionally fence on attempt and effect generation.
- **Recovery:** Once release may have occurred, retry is unavailable until trusted reconciliation. Cancellation cannot assert reversal without provider evidence.
- **Data growth:** Hosted aggregate child reads are capped (`HOSTED_PAID_OPERATION_CHILD_CAP` in `src/modules/action-invocation/hosted-paid-operation-port.ts`); Convex reads and schedulers must stay indexed and bounded.
- **Circular imports:** Module boundaries are structurally tested in `tests/imports/`; sibling modules should import supported public seams, not `internal/` paths.
- **Generated code:** `src/routeTree.gen.ts` and `convex/_generated/` are generated and must not become source owners.

## Anti-Patterns

### Business Truth in Neutral Control

**What happens:** A shared lifecycle record is treated as authoritative for provider, payment, result, or evidence facts.
**Why it's wrong:** It lets a projection overwrite the action-specific source and makes control-state deletion destructive.
**Do this instead:** Store continuity and source references in `actionInvocationControls`; reconstruct business truth from `hostedPaidOperationSources`, `hostedPaidOperationPayments`, and evidence records as enforced by `tests/imports/hosted-paid-operation-boundaries.test.ts`.

### Host-Owned Consequence Logic

**What happens:** A route/UI adapter imports low-level attempt, payment, reconciliation, lease, or effect-generation machinery.
**Why it's wrong:** Human and agent hosts can diverge and bypass source currentness/authority checks.
**Do this instead:** Call the application/gateway seam in `src/lib/server/hosted-paid-operation-runtime.ts`; keep the forbidden dependency graph checked by `tests/imports/action-invocation-host-boundaries.test.ts`.

### Large Convex Host Accumulation

**What happens:** `convex/hostedPaidOperation.ts` combines aggregate persistence, admission counters, mock-effect observation, proof readback, and deployment-receipt behavior.
**Why it's wrong:** Independent changes share one deployment unit and make source ownership harder to audit.
**Do this instead:** Put new business meaning in `src/modules/action-invocation/`; add focused Convex port modules when a new responsibility has a distinct transaction and deletion boundary.

### Legacy/Durable Registry Parallelism

**What happens:** `src/routes/api.businesses*.ts` retains exported `legacyPublicRegistry*` handlers alongside the live durable action path.
**Why it's wrong:** Tests or future callers can accidentally validate a process-local projection rather than current Convex-backed source.
**Do this instead:** Use the durable `registry*Action.run` path for product behavior and label legacy helpers strictly as migration/test inventory.

## Error Handling

**Strategy:** Expected refusal and recovery states are typed discriminated outcomes; HTTP adapters map them to stable statuses and relations. Unexpected infrastructure/invariant failures are caught at transport boundaries or thrown for observability.

**Patterns:**
- Return `kind: 'refused'`, `kind: 'conflict'`, `kind: 'not_found'`, or `kind: 'update_not_confirmed'` for ordinary control outcomes.
- Return `409` with a fresh inspect relation on stale versions; do not silently retry a command (`src/lib/server/hosted-paid-operation-agent-api.ts`).
- Return non-enumerating `404` for missing and cross-principal paid-operation reads.
- Preserve `reconciliation_required` and `outcome_unknown` instead of converting ambiguity to success or safe retry.
- Use `ConvexSourceError` and bounded generic `503` responses at server transport boundaries (`src/lib/server/customer-request-api.ts`).

## Cross-Cutting Concerns

**Logging:** Application command observers are diagnostic only and cannot change command truth; durable audit/history records carry attributable command and transition evidence (`src/modules/action-invocation/application-service.ts`, `actionInvocationHistory`).

**Validation:** Zod validates HTTP/action contracts; Convex validators protect function boundaries; digests bind material source and command identity; module state machines revalidate invariants before transitions.

**Authentication:** Clerk authenticates human sessions and scoped agent API keys; Convex derives current principals; source-write admission protects business mutations; exact authority remains a separate domain decision.

**Caching:** Authenticated and changing execution responses use `Cache-Control: no-store`; public discovery currently also returns no-store through `src/routes/api.businesses.ts`.

**Evidence:** Development provenance is captured by `tools/dev/evidence-provenance.ts`; hosted proof is bound to exact Git/Vercel/Convex observations by `tools/release/paid-operation-hosted-*.ts`. Fixture, local, hosted, independent-provider, and customer evidence remain separate claim classes.

---

*Architecture analysis: 2026-07-21*
