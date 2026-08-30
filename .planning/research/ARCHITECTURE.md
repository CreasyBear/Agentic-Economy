# Architecture Patterns

**Project:** Agentic Economy Maturity Rebaseline  
**Domain:** Multi-principal capability invocation and operated control plane  
**Researched:** 2026-08-26  
**Confidence:** MEDIUM — project constraints and failure evidence are strong; the proposed composition still requires a planning-only ADR, registered-reference source tests, and hosted proof before implementation acceptance.

## Architecture Decision

Keep Agentic Economy as a **Convex-backed modular monolith** and rebuild maturity as a sequence of **real registered-endpoint vertical slices**. The unit of progress is not a domain interface, registrar, inventory row, or generated matrix. It is one named production registration driven through its real transport adapter, canonical authority resolution, domain decision, durable intent, external or durable effect, denial/no-effect behavior, observation, reconciliation, operator workflow, rollback, and independent acceptance.

Exactly one integration-owned Convex adapter must resolve and convert canonical Principal, Account, ownership, membership, Credential, and workload facts. Domain modules receive its typed result and never reconstruct canonical rows or independently re-query the chain. Convex remains the only writable system of record. Provider systems, payment facilitators, secret stores, log sinks, and stateless workers return observations; they do not become competing authorities for AE state.

This decision is a **candidate architecture**, not implementation authorization. A planning-only ADR/design packet with an exact endpoint, threat model, alternatives, state machine, failure matrix, rollback boundary, official version evidence, and independent design acceptance must be green before source, tests encoding the design, package/config, generated files, or migration manifests change.

## Sourced Facts and AE-Specific Inference

The distinction matters: official documentation constrains the runtime; it does not certify AE's business rules.

| Type | Finding | Architectural consequence |
|---|---|---|
| **Sourced fact — MEDIUM** | Convex mutations are transactional; reads see a consistent view and writes commit together. Mutations cannot call third-party APIs. | Canonical intent, budget reservation, attempt creation, audit event, and immediate scheduling should commit in one mutation. |
| **Sourced fact — MEDIUM** | Scheduling from a mutation is atomic with that mutation. Scheduled mutations are exactly-once; scheduled actions are at-most-once and are not automatically retried because they may cause side effects. | Use the mutation as an outbox-like intent boundary. Never infer that an external effect happened merely because an action was scheduled or started. |
| **Sourced fact — MEDIUM** | Authentication is not propagated to scheduled functions. Internal functions reduce public exposure but may still be invoked from other server functions, the dashboard, CLI, schedulers, and crons; official docs still recommend validating internal invariants. | A scheduled job receives stable identifiers, not trusted authority. It must reload current canonical facts and re-authorize at consequence time. |
| **Sourced fact — MEDIUM** | Convex actions are non-transactional, can call external services, and separate `runQuery`/`runMutation` calls are separate transactions. Convex recommends capturing intent in a mutation and scheduling an internal action. | Keep actions narrow: one pre-effect admission transaction, the external call, then one observation transaction. Do not assemble an authorization decision from several inconsistent action-side reads. |
| **Sourced fact — MEDIUM** | Convex custom functions can authenticate, validate, inject context, and replace a context field such as `db`. The current `convex-helpers` implementation merges the original context with additions; injection alone does not remove raw capabilities. | Custom builders are the discoverable entry seam, but least privilege requires an explicit wrapper object or proved membrane. Do not claim raw `db`, `scheduler`, or `run*` removal unless an actual handler test proves it. |
| **Sourced fact — MEDIUM** | Convex log streams expose request/function identifiers, execution outcomes, scheduler and concurrency statistics, but delivery is best-effort and may duplicate or drop events. | Durable business audit, effect state, and reconciliation cannot live only in logs. Telemetry is a projection of canonical Convex facts. |
| **Sourced fact — MEDIUM** | Mature retry guidance uses stable client request identifiers and idempotent APIs. Transactional-outbox guidance records state and intent atomically, while assuming duplicate delivery and idempotent consumers. | Every provider attempt needs a stable idempotency key and request digest. Unknown irreversible outcomes reconcile; they are not blindly retried. |
| **Sourced fact — MEDIUM** | Current secret-manager guidance supports machine identity, short-lived tokens, workload federation, JIT/dynamic credentials, lease/revocation, dual-phase rotation, and audit. | AE stores only secret metadata and generation pointers in Convex; material is fetched just before use, held in memory, and never written to AE logs or tables. |
| **Sourced fact — MEDIUM** | Current microservice guidance recommends coarse boundaries when uncertain and extraction only where a bounded context is cohesive, independently deployable, loosely coupled, and justified by nonfunctional needs. | Registration count and code size are not extraction triggers. Preserve the modular monolith until measured contention, scale, isolation, or release ownership proves otherwise. |
| **AE inference — MEDIUM** | The closest Convex-native analogue to an outbox is one mutation that writes canonical intent and schedules an internal action atomically. | Do not add a second queue database. The invocation/attempt row plus Convex scheduler is the durable handoff. |
| **AE inference — MEDIUM** | The accepted Principal/Account model is the authority foundation, while external identities, wallets, provider accounts, and vault identities are bindings or observations. | No external registry, provider, payment rail, or vault identity may mint or replace canonical Principal/Account ownership or membership facts. |
| **AE inference — MEDIUM** | Consequence-time authority means the last server decision before an effect, using current server time and current generations, not replaying the admission snapshot. | Every delayed path must have a `beginConsequence`-style internal mutation that either grants a short-lived attempt lease or denies without fetching a secret or calling a provider. |

## Recommended Architecture

```text
Untrusted callers / platform triggers
HTTP · MCP · CLI · UI · callback · cron · scheduled job · worker · reconciler
                                │
                                ▼
              thin actual framework-registered endpoint
         exact args/returns · source admission · bounded parsing
                                │
                                ▼
             explicit least-privilege endpoint wrapper
           only capabilities required by this registration
                                │
                                ▼
       one integration-owned CanonicalAuthorityAdapter (Convex)
 Principal · Account · ownership · membership · Credential · workload
                                │
                                ▼
             domain policy / delegation / budget decision
        complete ancestry · monotonic narrowing · current generation
                                │
                                ▼
        transactional intent + reservation + audit + scheduling
              Convex canonical invocation/effect state machine
                                │
                                ▼
                   internal scheduled action / worker
                                │
                                ▼
             consequence-time internal mutation revalidation
 current server time · authority · delegation · budget · connection generation
                                │ grant short attempt lease
                                ▼
        JIT SecretStore read ──► production provider/payment adapter
          memory only                 stable idempotency key
                                │
                                ▼
             internal observation/finalization mutation
      known success · known failure · unknown · reconciliation due
                                │
                ┌───────────────┴────────────────┐
                ▼                                ▼
       operator/control plane             reconciliation loop
 inspect · cancel · retry-safe ·       provider lookup/callback/poll
 compensate · escalate · audit         never blind irreversible retry
```

The central architectural rule is **trust decreases across every asynchronous or external hop**. An internal reference, scheduled function ID, signed callback, or prior authorization decision is evidence about why work exists; none is current authority to cause a new consequence.

## Component Boundaries

| Component | Responsibility | May own/write | Must not do | Communicates with |
|---|---|---|---|---|
| **Transport adapters** | HTTP/TanStack, Convex HTTP, MCP, CLI, and UI protocol translation; body bounds; syntactic validation; rate/admission controls; source authentication appropriate to the transport. | Transport-local response and correlation metadata only. | Decide canonical Account authority, duplicate business rules, or access private module internals. | Registered endpoint wrappers and public Operation contracts. |
| **Registered endpoint wrappers** | Name the actual Convex registration, validate exact args/returns, select the one explicit authority mode, and construct a least-privilege handler context. | No independent canonical tables. | Hide authority behind generic middleware, pass raw full `ctx` into domain code, or choose a registrar dynamically. | CanonicalAuthorityAdapter, domain command handler. |
| **CanonicalAuthorityAdapter** | Sole Convex-owned read/conversion seam for Principal, Account, ownership, membership, Credential, workload, and external-identity binding facts. Resolve ambiguity fail-closed and return branded canonical context with provenance. | Reads canonical Phase 1 tables; any lifecycle writes remain with their accepted registries. | Reimplement delegation/business policy, expose raw documents, or be copied into endpoint families. | Accepted Principal/Account registries, AuthorityKernel. |
| **AuthorityKernel** | Apply resource intent, role separation, delegation ancestry, monotonic narrowing, cycle rejection, generation revocation, current-time validity, budgets, and complete attribution. Prefer pure TypeScript over typed inputs. | Authority decision records through an owning mutation, not direct storage from pure code. | Treat a Credential as owner, infer Account from an external provider, or trust a prior decision at consequence time. | CanonicalAuthorityAdapter, DelegationService, InvocationLedger. |
| **InvocationLedger / effect state machine** | Canonical command, reservation, attempt, idempotency, provider observation, reconciliation, compensation/refund, and audit transitions. Schedule initial work atomically with intent. | All AE invocation/effect/reconciliation facts in Convex. | Perform network calls inside mutations or let adapters write state directly. | AuthorityKernel, scheduler, ConsequenceCoordinator, operator projections. |
| **ConsequenceCoordinator** | Internal pre-effect revalidation, attempt leasing, digest binding, timeout policy, state transition validation, and finalization. | Attempt leases and transitions through internal mutations. | Trust scheduled args as authority, retry an unknown irreversible effect, or fetch secrets before admission. | CanonicalAuthorityAdapter, AuthorityKernel, SecretPlane, ProviderPorts. |
| **DelegationService** | Validate multi-hop grants, complete lineage, scope/budget/time narrowing, cycle rejection, generation-based revocation, and delegation lifecycle. | Canonical delegation records in Convex through its owning mutation. | Resolve Principal/Account rows independently or cache mutable authority as truth. | AuthorityKernel, canonical adapter result. |
| **ConnectionLifecycle / SecretPlane** | Connection ownership/sharing metadata, secret reference and generation lifecycle, JIT retrieval, validation, rotation, revocation, and vault-health classification. | Connection and secret-reference metadata in Convex; secret material only in SecretStore. | Store secret bytes in Convex, arguments, logs, durable jobs, or evidence. Advance a generation before validating it. | SecretStore port, production vault adapter, ConsequenceCoordinator. |
| **Provider/payment adapters** | Provider-neutral request mapping, x402/non-x402 protocol behavior, stable idempotency, response validation, bounded payloads, provider references, and lookup/compensation capabilities. | No AE canonical state. Provider/facilitator owns its external transaction. | Resolve AE identity/authority, write Convex directly, or convert timeouts into success/failure guesses. | ConsequenceCoordinator and reconciliation ports. |
| **Reconciliation kernel** | Turn callbacks, polls, scheduled scans, and operator requests into authenticated observations and monotonic state transitions. | Reconciliation observations and outcomes in Convex. | Blindly re-execute unknown effects, accept caller-supplied Account, or scan unbounded tables. | Provider adapters, InvocationLedger, operator plane. |
| **Operator/control plane** | Inspect, change, recover, escalate, dual-control, break-glass, and support workflows over canonical facts. Maintain one capability matrix across UI/CLI/MCP/API/staff/machine. | Commands and audit events through the same domain mutation seams. | Direct table editing as a normal workflow, misleading legacy terminology, or a shadow admin database. | Canonical read projections and registered command endpoints. |
| **Observability/evidence projection** | Correlated logs, metrics, alerts, exact-ref evidence packets, dashboards, and support-safe diagnostics. | External sinks may store projections; durable business facts remain in Convex. | Put secrets/credential material in telemetry or use best-effort logs as proof of durable effects. | All components via structured events and canonical IDs. |

### Locality and dependency rules

1. `CanonicalAuthorityAdapter` is integration-owned. Endpoint slices may request a reviewed contract delta but cannot create a local converter or resolver.
2. Domain modules import canonical public/server seams, never another domain's `internal/` implementation and never raw Convex schema types.
3. Provider SDKs and vault SDKs stay inside reviewed adapters. Their response types enter the domain only after runtime validation and size/depth bounds.
4. The CLI continues to call public HTTP contracts. MCP and UI adapt canonical Operation contracts; they do not bypass to private Convex state.
5. Shared infrastructure is added **just in time through the first consuming vertical slice**. It is not a separately green horizontal phase.
6. Static lint may confine raw builders/imports and require literal wrapper selection. It is never authority, dominance, alias, or dataflow proof.

## Trust Transitions and Data Flow

### T0 → T1: untrusted input to admitted source

The transport first bounds and validates the request, then authenticates its immediate source: Clerk/Convex identity for interactive humans, signed Credential proof for machine calls, provider signature for callbacks, or internal registration for schedulers/crons. Perform cheap admission before canonical graph lookup and return non-oracular failures where practical. In particular, do not query detailed canonical authority before rejecting an invalid public signature merely to provide a more specific error.

**Denial/no-effect gate:** malformed, unauthenticated, replayed, oversized, stale, or rate-denied requests make no invocation reservation, schedule no work, fetch no secret, and call no provider.

### T1 → T2: authenticated source to canonical Principal/Account context

Only the canonical adapter maps the admitted binding to a Principal and explicit Account, then loads current ownership, membership, Credential, and workload facts. Multiple possible Accounts require explicit selection or a defined fail-closed rule; “first row” and exact-one assumptions are not authority policy.

The adapter returns branded values plus stable provenance identifiers. It does not return raw documents or a reusable “authorized forever” object.

**Denial/no-effect gate:** missing, ambiguous, disabled, expired, generation-mismatched, cross-Account, or non-canonical bindings return a bounded denial before durable consequential intent.

### T2 → T3: canonical context to domain authorization

The authority kernel evaluates the exact resource and action, complete delegation ancestry, current server time, scope/budget narrowing, cycle absence, generation revocation, and role separation. A wallet, Credential, external identity, payer, beneficiary, or provider account never silently becomes the owning Principal.

The decision produces attribution sufficient to explain direct and delegated authority: initiating Principal, effective Principal, Account, Credential/workload, delegation chain IDs and generations, policy version, resource, action, budget decision, and request digest.

**Denial/no-effect gate:** every allowed scenario has a paired denial proving no reservation, schedule, secret retrieval, external call, or audit claim of success. Seven-shape authority tests may remain useful where applicable, but they must bind to the exact registration and effect path rather than a synthetic matrix.

### T3 → T4: authorized request to durable intent

One mutation atomically:

- deduplicates the client idempotency key within the Account and Operation scope;
- records immutable request and authority-at-admission attribution;
- reserves budget under current policy;
- creates an invocation and first attempt in a monotonic state machine;
- appends the durable domain audit event; and
- schedules an internal action with only stable IDs and digests.

This is the Convex-native durable handoff. The scheduled arguments are locators, never canonical truth.

**Rollback:** before an external effect begins, a cancel/revoke mutation can cancel pending scheduled work, release the reservation, and record the reason atomically.

### T4 → T5: scheduled work to consequence-time authority

The internal action has no inherited caller auth. Its first meaningful step is one internal mutation that loads the invocation by ID, checks expected version/digest, reloads current canonical facts through the one adapter, re-evaluates delegation and budget using current server time, validates Connection/secret generation state, and grants a short attempt lease.

The action does not compose this from multiple `runQuery` calls. One transaction makes the decision against one consistent snapshot. Revocation, expiry, freeze, Account isolation, budget exhaustion, stale attempt, or a mismatched request digest denies before a secret read or provider call.

**Consequence-time rule:** attribution from admission is retained for history, while permission to act is recomputed. Both are needed; one must not overwrite the other.

### T5 → T6: admitted attempt to secret material

The coordinator asks the replaceable SecretStore for exactly the required secret reference/generation using workload identity where available. Material exists only in action memory for the bounded call and must be absent from Convex documents, function arguments, scheduled payloads, errors, logs, and test artifacts.

Vault authentication/fetch failure blocks new consequential work and records a non-secret operational classification. Rotation follows `candidate → externally validated → active pointer advanced → prior generation retired/revoked`. A failed candidate never displaces the active generation.

**Rollback:** before pointer advance, discard/revoke the candidate. After advance, roll back only to a still-valid prior generation under an explicit operator command and audit event; otherwise repair forward.

### T6 → T7: provider request to external consequence

The production adapter receives a validated provider-neutral command, a stable attempt idempotency key, request digest, timeout/deadline, and JIT secret. It validates provider responses as `unknown`, bounds payload size/depth, and maps them to discriminated observations.

For supported x402 calls, the provider's 402 requirements and facilitator verify/settle response are transaction evidence for that synchronous call. AE persists the selected requirements, signed-request digest, settlement reference, and returned resource observation; it does not invent speculative Quote/Order/Offer lifecycles merely to mirror a protocol that already supplies transactional artifacts. Non-x402 adapters implement the same AE port and state machine.

**Unknown outcome rule:** a timeout or lost response after an irreversible request is `outcome_unknown`. Automatic retry is allowed only when a documented provider idempotency contract or safe read-before-write reconciliation makes duplicate effect impossible. Otherwise schedule lookup/reconciliation and expose manual review.

### T7 → T9: observation, reconciliation, and compensation

An internal mutation validates the attempt lease, request digest, provider identity, observation shape, and legal state transition before committing `succeeded`, `failed_known`, or `outcome_unknown`. Provider callbacks authenticate the provider first, then locate the attempt and Account from Convex; caller-supplied Account values are never trusted.

Reconciliation is a first-class registered slice:

- an indexed bounded query selects due unknown attempts;
- a cron or operator command schedules an internal reconciliation action under an explicit workload Principal and Account context;
- the provider adapter performs a read/lookup, not an unqualified repeat of the effect;
- one mutation records the observation and next due time or terminal result;
- unresolved or contradictory observations enter manual review with an owner and deadline.

Compensation, refund, dispute, or provider cancellation is a new consequential command with its own authority, idempotency key, attempt, audit trail, and unknown-outcome handling. It is not a table edit that erases history.

## Durable State Model

Use a small monotonic state machine rather than booleans spread across adapters:

```text
requested
  ├─ denied
  └─ queued
       ├─ canceled_before_effect
       └─ attempt_leased
            ├─ denied_at_consequence
            └─ effect_started
                 ├─ succeeded
                 ├─ failed_known
                 └─ outcome_unknown
                      ├─ reconciling ──► succeeded | failed_known
                      └─ manual_review ──► reconciled | compensated | disputed
```

Recommended invariant fields include `invocationId`, `accountId`, initiating/effective Principal IDs, Credential/workload ID and generation, delegation-chain digest and member generations, Operation ref/version, request digest, client idempotency key, attempt number, provider adapter/version, provider idempotency key, secret reference/generation (never material), scheduler ID, attempt lease/version, provider transaction/reference, observation digest, reconciliation due/owner, and immutable audit timestamps.

The state model is **not event sourcing**. Current canonical rows plus append-only audit/observation history are sufficient until a separately accepted requirement proves event replay is needed.

## Explicit Least-Privilege Wrapper Pattern

Use one visible builder per authority mode only after the design identifies a real caller. A wrapper should expose a capability object shaped for the handler, for example:

```typescript
type ConsequentialMutationContext = {
  authority: CanonicalAuthorityContext;
  intent: {
    createInvocation(command: InvocationCommand): Promise<InvocationId>;
  };
  audit: {
    append(event: DomainAuditEvent): Promise<void>;
  };
};
```

The domain handler receives this object, not a full `MutationCtx`. If the wrapper internally uses `customMutation`, the test must prove the handler-visible value lacks raw `db`, `scheduler`, `runQuery`, `runMutation`, and `runAction` unless that exact registration requires one. An action wrapper similarly exposes only `beginConsequence`, one provider port, and `commitObservation`; it should not pass raw scheduling or arbitrary internal-reference execution into provider code.

Do not create eight speculative registrar modes. Start with the minimum modes consumed by accepted slices, likely:

- interactive/public read;
- interactive/public consequential command;
- authenticated provider callback;
- internal scheduled consequence;
- internal reconciliation/operator consequence; and
- development-only test registration, mechanically excluded from production imports.

Adding a mode requires an ADR amendment and a real production registration in the same slice.

## Registered-Reference Acceptance

A slice is not source-accepted unless its tests invoke the generated production reference and production module graph.

Minimum source evidence:

1. Call the real `api.<module>.<function>` or `internal.<module>.<function>` reference through `convex-test` with the production schema/modules; do not redefine a fixture registration that merely resembles it.
2. For HTTP/TanStack/MCP/CLI/UI entry, drive the built transport far enough to prove it reaches that exact Convex reference and canonical contract.
3. Exercise the production provider/vault adapter composition with a controlled transport at source-test level; separately classify live provider/vault execution as hosted evidence.
4. Prove denial by asserting both canonical state and adapter call count: no effect means no provider transport, no secret read, no scheduled work, and no success audit.
5. Exercise consequence-time revocation between admission and worker execution.
6. Exercise idempotent duplicate admission, duplicate observation, stale callback, and substituted registration/location.
7. Exercise known failure, timeout/unknown, reconciliation, cancellation before effect, and the supported compensation/rollback path.
8. Bind every artifact to exact Git ref, dependency/build digest, command, tool versions, time/freshness, evidence class, registration, and owner.

`convex-test` is source/test-harness evidence. A genuine Clerk session, live vault token, real provider consequence, deployed callback, log-stream delivery, and exact deployed revision are distinct hosted/operational gates and cannot be inferred from injected identities or mocks.

## Vertical Slice Construction Contract

Every roadmap implementation phase must meet all rows below for at least one named production registration. These are phase gates, not optional workstreams.

| Gate | Required evidence |
|---|---|
| **Design acceptance before source** | Accepted ADR at an exact ref; official current docs and installed-version/source check; alternatives; threat model; state/failure diagrams; operability and rollback design; independent architecture and adversarial acceptance. |
| **Real entry** | Named HTTP, MCP, CLI, UI, callback, cron, job, worker, or reconciliation registration and its generated reference/build route. |
| **Production composition** | Real transport adapter, explicit wrapper, sole canonical adapter, domain module, InvocationLedger, production provider/vault adapter, and result path wired together. |
| **Authority** | Current Principal/Account context, exact resource intent, complete delegation attribution where applicable, and consequence-time revalidation. |
| **Durable/external effect** | A real canonical write or provider consequence with stable idempotency and monotonic state. Interface calls and reachability labels do not qualify. |
| **Denial/no-effect** | Hostile cases at every trust transition with state, scheduler, secret, and provider non-effects asserted. |
| **Unknown/reconciliation** | Timeout/ambiguous outcome retained as unknown, bounded reconciliation through a real internal reference, no blind irreversible retry. |
| **Observability** | Correlation through registration, request, invocation, attempt, scheduler, provider, and reconciliation; alert and evidence packet; no secrets. |
| **Operator path** | Named inspect, cancel/retry-safe, reconcile, compensate/escalate workflow and support ownership. |
| **Rollback/release** | Stop-new-work control, cancel-before-effect, compatible deploy rollback, forward recovery for unknown/irreversible work, and exact-revision smoke. |
| **Independent acceptance** | Implementer cannot close the final gate; separate checker/verifier plus fresh adversarial review drives the exact registered path. |

No horizontal interface leaf may close independently. A domain interface, adapter port, schema, registrar, or inventory can be a task inside a slice, but its acceptance is the slice's registered production consumption. Parallel work is limited to non-overlapping slices after the shared adapter/state contracts are accepted; shared integration files remain driver-owned.

## Suggested Build Order

This is dependency ordering for roadmap design, not a reuse of the historical Phase 3+ decomposition.

### 0. Planning-only architecture and acceptance gate

Accept the canonical adapter contract, wrapper capability shapes, invocation state machine, trust-transition threat model, operability matrix, evidence classes, rollback semantics, and exact first endpoint. Review the installed `convex@1.45.0`, `convex-helpers@0.1.123`, `convex-test@0.0.56`, and current official sources against the lockfile. No production edits occur here.

**Why first:** every later slice depends on the same trust and durable-effect spine. A material change returns to this gate.

### A. One direct-authority reference consequence

Use one existing canonical Operation call endpoint—prefer the least ambiguous real `POST /api/v1/operations/call` path with one production provider adapter—as the first slice. Install the sole canonical adapter, explicit wrapper, transactional intent/schedule, consequence-time revalidation, JIT secret read if required, effect state machine, one reconciliation path, structured observability, operator inspect/cancel/reconcile, rollback, and independent registered-reference acceptance.

**Why first:** it proves the smallest complete composition and becomes the executable pattern. It must not attempt repository-wide registration migration.

### B. Delegated autonomous invocation through machine surfaces

Extend the same proven spine through one real MCP or CLI call (the CLI remains over public HTTP), one autonomous-agent/workload Principal, and multi-hop delegation with narrowing, cycle rejection, generation revocation, budgets, and full attribution. Revoke between intent and consequence and prove no provider/secret effect. Add the paired operator delegation inspect/revoke workflow in the same slice.

**Why next:** delegation is meaningful only when it governs an actual consequence; it depends on the direct-authority spine and canonical adapter.

### C. Connection and secret-generation lifecycle under use

Drive one real operator/API connection-create or rotate registration through external validation and then consume the validated generation in the same provider invocation path. Prove vault outage fail-closed behavior, memory-only material, generation-safe pointer advance, old-generation retirement, reconciliation, audit, operator recovery, and rollback.

**Why next:** a standalone SecretPlane interface is not maturity. It becomes accepted only when a production endpoint and consequence use it.

### D. Paid/ambiguous provider consequence and reconciliation

Use one real paid provider endpoint. Where supported, capture x402 v2 payment requirements and verify/settle results; otherwise use the provider's native idempotency/status contract. Force a post-send timeout, retain `outcome_unknown`, and resolve it through a real callback/poll/reconciliation registration. Exercise refund/dispute/compensation as a new authorized command.

**Why next:** this is the hardest irreversible boundary and depends on stable authority, secrets, and state transitions. It closes the gap between “provider called” and operated transactional truth.

### E. Entry-family and operator breadth as repeated micro-slices

Expand endpoint-by-endpoint across the remaining required families: HTTP, MCP, CLI, UI/chat execution, provider callback, cron, scheduled job, worker, and reconciliation. Each addition repeats the complete slice gate with its actual reference and paired operator/support workflow. A breadth inventory tracks remaining scope but never substitutes for execution proof.

**Why after the reference slices:** broad migration is safe only after two or more complete patterns survive independent acceptance. This avoids another 298-registration mechanical migration.

### F. Operated reliability and measured scaling

Exercise recovery drills, scheduler backlog, provider rate limiting, reconciliation backlog, release rollback, vault outage, audit/log-stream failure, and support escalation against exact deployed revisions. Tune bounded queries, workpool concurrency, backoff, and load shedding inside the monolith. Extract only a stateless provider/compute worker if an explicit trigger below is breached; Convex remains the sole writer.

**Why last:** scale architecture should respond to measured bottlenecks in accepted flows, not projected registration counts.

## Operability Ownership

Every canonical capability must have a row assigning inspect/change/recover/escalate behavior across UI, CLI, MCP, API, staff/support, and machine-only automation. At minimum:

| Capability | Self-service / machine path | Staff / operator path | Dual-control or escalation |
|---|---|---|---|
| Principal and Account | inspect current canonical identity and select Account explicitly | diagnose binding/provenance without exposing secrets | ownership transfer/succession and ambiguous identity resolution |
| Membership/ownership | list and perform allowed lifecycle commands | investigate failed or orphaned relationships | transfer, recovery, or exceptional termination |
| Credential/workload | create/rotate/revoke within policy; inspect generation/status | correlate failures and disable compromised binding | break-glass restoration or disputed provenance |
| Delegation | create narrower grant; inspect ancestry; revoke generation | explain effective authority and stale work | high-risk grant approval and incident-wide revocation |
| Connection/secret | connect/rotate/revoke metadata; secret material never displayed | inspect generation, vault health, and reconciliation | rollback/advance pointer and emergency freeze |
| Invocation/effect | status/cancel before effect/reconcile safe unknowns | retry-safe action, provider investigation, evidence export | compensation/refund/dispute/manual resolution |
| Recovery/break-glass | bounded user recovery where policy permits | isolate/freeze/recover with immutable audit | explicit approval and post-event review |

Operator commands use the same canonical domain mutations as machine endpoints. Dashboard table editing is emergency diagnosis, not the product workflow. Support projections redact secret material and avoid resource-existence or cross-Account oracles.

## Observability Contract

Emit structured events at each trust transition with `requestId`, exact registered function/route, `invocationId`, `attemptId`, `accountId`, initiating/effective Principal IDs, delegation digest, Operation ref, scheduler ID, provider adapter, provider reference when safe, outcome class, reconciliation state, and source revision. Never emit secret bytes, raw Credential material, signed payment payloads, or unbounded provider bodies.

Maintain two evidence planes:

- **Durable domain evidence in Convex:** decisions, state transitions, provider observations, operator actions, and reconciliation. This is canonical.
- **Operational projection:** Convex logs/log streams, exception reporting, metrics, dashboards, alerts, and deployment audit. This is searchable and alerting-oriented but best-effort.

Minimum alerts include consequence-time denials after prior admission, vault/JIT failures, unknown-outcome age, reconciliation lag/backlog, scheduler lag, duplicate/stale callback rate, provider timeout/error rate, budget reservation leaks, failed compensation, break-glass use, and log-stream health. Each alert names an owner, runbook, severity, and freshness window.

## Rollback and Recovery Boundaries

“Rollback” has four different meanings and the plan must name which one applies:

1. **Code rollback:** deploy the previous compatible revision while retaining new durable rows and readers. Schema/data removal is a separate migration with export and typed confirmation.
2. **Before-effect cancellation:** cancel pending schedule/lease, release reservation, and record terminal cancellation.
3. **After known reversible effect:** issue an authorized, idempotent compensation/refund/cancel command and retain both histories.
4. **After unknown or irreversible effect:** stop new work, reconcile, escalate, and repair forward. Never rewrite unknown to failed merely to make rollback appear complete.

Each slice needs a “stop new work” control that leaves status, reconciliation, and operator inspection available. Vault outages should stop new secret-dependent effects without hiding existing unknown outcomes. Provider adapter rollback must not mutate canonical Principal/Account facts.

## Anti-Patterns to Avoid

### Horizontal interface leaves

**What:** build all registrars, ports, adapters, schemas, or inventories first and defer production composition to an integration phase.  
**Why bad:** interfaces can be green with zero real consumers; the hard authority/effect boundary arrives late.  
**Instead:** introduce a shared seam through one actual endpoint and accept only the complete slice.

### Capability/dataflow lint as a security boundary

**What:** infer runtime authority from aliases, destructuring, control flow, or a generated dominance matrix.  
**Why bad:** JavaScript syntax becomes a second authorization language and bypass repair never converges.  
**Instead:** runtime wrappers, narrow handler-visible capabilities, current authority checks, actual-reference tests; lint only local import/literal facts.

### Internal means trusted

**What:** treat an internal reference, scheduler, cron, callback, or worker as authorization.  
**Why bad:** scheduled auth is not propagated, internal functions have several server/operator callers, and authority may be revoked after admission.  
**Instead:** stable command IDs plus consequence-time canonical revalidation.

### Dual writes and optimistic success

**What:** write AE state and call/signal an external system as two uncoordinated operations, or label timeout as failure and retry.  
**Why bad:** creates lost work, duplicate effects, and false accounting.  
**Instead:** transactional intent/schedule, stable idempotency, explicit unknown, lookup/reconciliation.

### Secret synchronization into application storage

**What:** copy provider secrets into Convex, queues, evidence, or environment-shaped records for convenience.  
**Why bad:** multiplies standing secret copies and makes rotation/revocation ambiguous.  
**Instead:** Convex metadata pointer, JIT SecretStore retrieval, memory-only use, generation-safe rotation.

### External identity or payment as AE identity

**What:** treat Clerk, wallet, provider account, x402 facilitator, vault identity, or registry as the canonical Principal/Account.  
**Why bad:** collapses legal payer, owner, operator, beneficiary, Credential, and technical Principal roles.  
**Instead:** explicit bindings resolved by the one canonical adapter; external systems remain evidence/providers.

### Best-effort telemetry as audit truth

**What:** infer durable success or operator action from logs alone.  
**Why bad:** Convex log streams are best-effort and may duplicate or drop events.  
**Instead:** durable domain audit in Convex plus external telemetry projection.

### Premature service extraction

**What:** split by module count, registrations, team preference, or hypothetical scale.  
**Why bad:** adds distributed consistency and operational failure modes before a stable boundary exists.  
**Instead:** modular monolith with measured extraction triggers and Convex as sole writer.

## Scalability Considerations and Extraction Triggers

User count alone does not trigger extraction. Evaluate measured workload behavior on accepted endpoint slices.

| Concern | Early operated load | Sustained growth | Extraction threshold |
|---|---|---|---|
| Canonical authority reads | Indexed bounded reads through one adapter; no cache as authority. | Measure latency, read volume, and repeated graph resolution; add safe request-local reuse and targeted indexes. | Do **not** extract canonical facts under this milestone. Revisit only if a separately accepted architecture can preserve Convex as sole writer and consequence-time consistency. |
| Mutation contention | One transaction per intent/transition; account-scoped idempotency and budget rows. | Partition hot budget/reservation aggregates by Account/policy window if metrics show conflicts. | Persistent conflict/retry or transaction-limit SLO breach after schema/index/partition tuning and with a stable bounded context. |
| Scheduler/workpool | Atomic scheduling; bounded concurrency; indexed due work. | Measure scheduler lag, queue depth, attempt age, provider rate limits, and reconciliation backlog; tune concurrency/backoff/load shedding. | Sustained SLO breach isolated to stateless external-call compute, requiring independent scale or runtime. Extract only the worker; it receives signed commands and writes results through Convex internal endpoints. |
| Provider adapters | One provider call per leased attempt with adapter-specific limits. | Per-provider bulkheads, rate limits, timeouts, and circuit/open-state observations. | Independent security/network/runtime or deploy cadence repeatedly blocks the core release and the adapter contract has proven stable across multiple accepted slices. |
| Reconciliation | Indexed scan by state/due time, small batches, explicit owner. | Shard scheduling by provider/Account and monitor oldest unknown age. | Separate stateless reconciler compute only if lag remains outside SLO after bounded-query and concurrency tuning; canonical state stays in Convex. |
| Observability | Structured logs plus durable audit. | External log stream, dashboards, alert routing, sampling for non-audit events. | Never extract canonical audit to a best-effort sink. A warehouse may receive read-only projections for analysis. |
| Team/release ownership | One integration owner for shared adapter/state contracts; slice owners for endpoints. | Measure cross-team blocking and coordinated release frequency. | Extraction requires independent deployability, no shared transaction, stable versioned API, clear on-call ownership, and a demonstrated benefit greater than distributed-operability cost. |

Explicit non-triggers: lines of code, number of Convex registrations, test count, generated inventory size, one slow local test, or an unmeasured forecast. An extracted component may be stateless compute or a read-only projection; it cannot introduce a second writable canonical store without changing the locked architecture and receiving new design acceptance.

## Architecture Acceptance Checklist

- [ ] Planning-only ADR accepted before source and tests encoding the design.
- [ ] Exact first and subsequent registered references named; no synthetic substitute.
- [ ] Exactly one integration-owned canonical Principal/Account adapter and zero production duplicates.
- [ ] Handler-visible least-privilege capabilities proved, not inferred from helper injection.
- [ ] Public admission precedes detailed canonical lookup where needed to avoid an oracle.
- [ ] Admission attribution and consequence-time current authority are both preserved.
- [ ] Intent, reservation, audit, and scheduling commit atomically in Convex.
- [ ] Internal action reloads authority in one transaction immediately before secrets/effect.
- [ ] Stable idempotency and explicit unknown/reconciliation exist for every external effect.
- [ ] Secret material is JIT, memory-only, generation-bound, and absent from durable evidence.
- [ ] Operator inspect/change/recover/escalate and rollback are part of every slice.
- [ ] Durable audit is distinct from best-effort operational logs.
- [ ] Source, test-harness, hosted/external, operational, legal, and commercial evidence remain separate.
- [ ] Independent checker/verifier and fresh adversarial acceptance close each phase.
- [ ] Extraction occurs only after a documented measured trigger; Convex remains sole writer.

## Sources

### Current primary technical sources

- [Convex function types and transaction boundary](https://docs.convex.dev/functions/overview) — mutations transactional; actions for external services. **Sourced fact confidence: MEDIUM.**
- [Convex mutations and transaction semantics](https://docs.convex.dev/functions/mutation-functions) — consistent reads and atomic writes. **Sourced fact confidence: MEDIUM.**
- [Convex actions](https://docs.convex.dev/functions/actions) — non-transactional external effects, intent-first scheduling pattern, no automatic retry, and action-side consistency cautions. **Sourced fact confidence: MEDIUM.**
- [Convex scheduled functions](https://docs.convex.dev/scheduling/scheduled-functions) — atomic mutation scheduling, exactly-once scheduled mutations, at-most-once scheduled actions, auth non-propagation, status/cancellation. **Sourced fact confidence: MEDIUM.**
- [Convex internal functions](https://docs.convex.dev/functions/internal-functions) — internal visibility and continuing invariant validation. **Sourced fact confidence: MEDIUM.**
- [Convex best practices](https://docs.convex.dev/understanding/best-practices/) — schedule and `ctx.run*` internal references; share plain helpers where public and internal functions differ. **Sourced fact confidence: MEDIUM.**
- [Convex authorization in practice](https://stack.convex.dev/authorization) and [custom functions](https://stack.convex.dev/custom-functions) — explicit discoverable function customization and colocated authorization. **Sourced fact confidence: MEDIUM.**
- [Official convex-helpers custom-function source](https://github.com/get-convex/convex-helpers/blob/main/packages/convex-helpers/server/customFunctions.ts) — context/argument customization implementation; checked against the current upstream source. **Sourced fact confidence: MEDIUM.**
- [Convex row-level security pattern](https://stack.convex.dev/row-level-security) — database wrapping and deny-by-default option where row-level rules fit. **Sourced fact confidence: MEDIUM.**
- [Convex testing with `convex-test`](https://docs.convex.dev/testing/convex-test) — calling generated public/internal references in the test backend. **Sourced fact confidence: MEDIUM.**
- [Convex production integrations](https://docs.convex.dev/production/integrations/) and [log-stream schema/guarantees](https://docs.convex.dev/production/integrations/log-streams) — exception/log integrations, scheduler/concurrency events, request IDs, and best-effort delivery. **Sourced fact confidence: MEDIUM.**
- [AWS Builders' Library: Making retries safe with idempotent APIs](https://aws.amazon.com/builders-library/making-retries-safe-with-idempotent-APIs/) and [AWS transactional outbox guidance](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html) — stable request intent, safe retries, atomic state/intent, duplicate handling. **Sourced fact confidence: MEDIUM.**
- [Infisical machine identities](https://infisical.com/docs/documentation/platform/identities/machine-identities), [Universal Auth](https://infisical.com/docs/documentation/platform/identities/universal-auth), and [secret rotation](https://infisical.com/docs/documentation/platform/secret-rotation/overview) — short-lived machine access and rotation models. **Sourced fact confidence: MEDIUM.**
- [HashiCorp Vault leases](https://developer.hashicorp.com/vault/docs/concepts/lease), [workload identity](https://developer.hashicorp.com/vault/docs/about-vault/why-use-vault/identities), and [audit devices](https://developer.hashicorp.com/vault/docs/audit) — JIT/dynamic credentials, expiry/revocation, workload federation, and audited fail-closed behavior. **Sourced fact confidence: MEDIUM.**
- [Coinbase x402 client/server flow](https://docs.cdp.coinbase.com/x402/core-concepts/client-server), [v2 migration/spec pointer](https://docs.cdp.coinbase.com/x402/migration-guide), and [facilitator API](https://docs.cdp.coinbase.com/api-reference/v2/rest-api/x402-facilitator/x402-facilitator) — payment-required, verify, settle, and v2 protocol boundaries. **Sourced fact confidence: MEDIUM.**
- [Azure guidance on identifying microservice boundaries](https://learn.microsoft.com/en-us/azure/architecture/microservices/model/microservice-boundaries) and [microservices readiness](https://learn.microsoft.com/en-us/azure/architecture/guide/technology-choices/microservices-assessment) — coarse initial boundaries, cohesion, independent deployability, consistency, and measured nonfunctional drivers. **Sourced fact confidence: MEDIUM.**

### AE project evidence

- `.planning/PROJECT.md` — locked product, identity, Account, vertical-execution, evidence, and modular-monolith constraints. **Project evidence confidence: HIGH.**
- `.planning/codebase/ARCHITECTURE.md`, `STRUCTURE.md`, and `CONVENTIONS.md` — current Operation product boundary, machine surfaces, module ownership, and Convex conventions. **Project evidence confidence: HIGH.**
- `.planning/forensics/report-20260826-190606.md` — accepted Phase 1 value, horizontal-leaf failure, late runtime architecture, repair churn, and enforceable rebaseline rules. **Project evidence confidence: HIGH.**
- `.planning/maturity-execution/reviews/phase-2-foundation-checkpoint-assessment.md` and `PHASE-2-FOUNDATION-CHECKPOINT.md` — Phase 2 remains incomplete; registration inventory is static only; load-bearing analyzer is unsound; one canonical adapter and actual-reference slices are required. **Project evidence confidence: HIGH.**

---

*This document recommends roadmap architecture only. It authorizes no product source, tests, package/config, generated files, or deployment changes.*
