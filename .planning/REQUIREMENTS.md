# Requirements: Agentic Economy Maturity Rebaseline

**Defined:** 2026-08-26  
**Core Value:** An autonomous agent can safely discover and invoke a useful capability with explicit Account-scoped authority, attributable effects, and enough human/operator visibility to understand, control, recover, and support the transaction.

## v1 Requirements

These requirements define the maturity milestone. They extend the accepted Phase 1 foundation and existing Operation product; they do not accept or continue the incomplete Phase 2 implementation.

### Principal and Account Authority

- [ ] **AUTH-01**: Every production authority decision resolves Principal, Account, ownership, membership, Credential, external binding, and workload facts through exactly one integration-owned canonical Convex adapter.
- [ ] **AUTH-02**: Every consequential HTTP, MCP, CLI, UI, callback, cron, job, worker, and reconciliation entry resolves an explicit Principal and Account or fails closed before any reservation, schedule, secret read, provider call, durable effect, or success audit.
- [ ] **AUTH-03**: A Credential authenticates a technical Principal but can never own an Account, Operation, Connection, invocation, resource, budget, or commercial fact.
- [ ] **AUTH-04**: Authority and attribution preserve distinct legal payer, beneficial owner, operator, supplier, beneficiary, tax subject, technical Principal, and Credential roles.
- [ ] **AUTH-05**: A Principal with access to multiple Accounts must explicitly select an Account; remembered UI state or a caller-supplied identifier is never server authority.
- [ ] **AUTH-06**: Consequential work revalidates current Principal, Account, resource relationship, policy, budget, delegation, Connection generation, and server time immediately before external or irreversible effect.
- [ ] **AUTH-07**: Internal functions, scheduled work, callbacks, workers, cron, and reconciliation treat carried context as attributed input rather than propagated authentication and independently revalidate durable authority.
- [ ] **AUTH-08**: A denied, ambiguous, expired, revoked, cross-Account, or stale-authority request produces the same externally safe denial class and no consequential side effect.
- [ ] **AUTH-09**: Registered Convex endpoints are thin over explicit least-privilege wrappers and domain commands; handlers cannot use raw database, scheduler, or `run*` capabilities where the accepted design says those capabilities are unavailable.
- [ ] **AUTH-10**: Static analysis is limited to locally decidable import, builder, and literal-category rules and is never treated as proof of runtime authority, dominance, alias flow, or effect coverage.

### Delegation and Autonomous Ownership

- [ ] **DELG-01**: A human, organization, autonomous agent, or workload Principal can directly own an Account and resources without being collapsed into a human operator or Credential.
- [ ] **DELG-02**: An authorized Principal can issue a multi-hop delegation whose Account, resource set, action scope, budget, time window, consequence class, and approval requirements are explicit and inspectable.
- [ ] **DELG-03**: Every delegation hop can only narrow its parent's authority; any widening of scope, resource, budget, duration, consequence class, or approval posture is rejected.
- [ ] **DELG-04**: Delegation creation rejects cycles, duplicate ancestry identities, invalid parent generations, and chains beyond the accepted bounded depth.
- [ ] **DELG-05**: Revoking or advancing any ancestor generation invalidates all affected descendants before their next consequence without rewriting historical attribution.
- [ ] **DELG-06**: Invocation and audit records preserve the initiating Principal, complete delegation ancestry, effective Principal, Account, Credential/workload context, decision time, and consequence-time revalidation result.
- [ ] **DELG-07**: Owners and authorized operators can inspect effective delegated authority and revoke or narrow it through canonical control-plane workflows.

### Operation Discovery and Supplier Lifecycle

- [ ] **DISC-01**: HTTP, MCP, CLI, UI, and the bounded chat adapter project the same canonical Operation reference, version, schemas, provider/source labels, commercial basis, authority needs, and consequence/retry classification.
- [ ] **DISC-02**: An agent can search, inspect, compare, and inspect-plan an Operation before invocation without acquiring authority, reserving budget, reading a secret, or creating an external effect.
- [ ] **DISC-03**: Inspect-plan returns applicable Account scope, budget, pricing, approval, Connection, and non-sensitive denial reason information while remaining explicitly non-binding until consequence-time admission.
- [ ] **SUPP-01**: An authorized supplier Principal can publish and version an Operation with endpoint ownership, schemas, commercial basis, Connection requirements, and consequence/retry semantics.
- [ ] **SUPP-02**: Supplier activation validates the real registered endpoint, contract compatibility, provider authentication boundary, network/SSRF policy, denial behavior, and reconciliation capability before discovery can select it.
- [ ] **SUPP-03**: Authorized supplier or staff workflows can suspend, reactivate, and retire an Operation version without erasing its historical invocation, payment, effect, or audit evidence.
- [ ] **SUPP-04**: Supplier and staff operators can inspect endpoint health, validation, compatibility, publication, suspension, retirement, and support status using canonical facts.
- [ ] **SUPP-05**: MasterKey, Bazaar, Whop, or another external discovery/provider input is source-labelled and freshness-bounded and can never replace AE Principal/Account identity, canonical Operation history, sole inventory, or authority.

### Invocation, Effects, and Reconciliation

- [ ] **INVK-01**: A caller supplies or receives an Account-scoped invocation/effect identity that remains stable across HTTP, MCP, CLI, registered Convex work, provider dispatch, callbacks, reconciliation, and operator recovery.
- [ ] **INVK-02**: Repeating the same idempotency identity with materially identical intent returns the existing invocation, while reuse with different Account, Operation version, input digest, authority, budget, provider target, or consequence intent is rejected.
- [ ] **INVK-03**: Admission durably records validated intent, authority attribution, policy/budget reservation, audit, and asynchronous handoff atomically before acknowledging consequential work.
- [ ] **INVK-04**: A caller or operator can inspect invocation state and request cancellation only while the accepted effect state proves cancellation is still safe.
- [ ] **INVK-05**: AE durably correlates attempt, dispatch, provider acknowledgement, observed consequence, payment/settlement evidence, callback/poll result, reconciliation, and compensation as distinct monotonic facts.
- [ ] **INVK-06**: A timeout, disconnect, malformed response, or additive/irreversible ambiguity remains `unknown` and cannot trigger blind retry or transparent provider failover.
- [ ] **INVK-07**: Reconciliation observes provider or settlement truth through an authenticated callback, bounded poll, or operator-supplied evidence and converges, compensates, or escalates without overwriting history.
- [ ] **INVK-08**: Provider resolution is adapter-neutral, Account/policy constrained, source-labelled, and recorded; no registry, provider, facilitator, or settlement rail becomes AE authority or canonical history.
- [ ] **INVK-09**: For a supported synchronous x402 call, AE records the exact 402 requirements, signed payment identity, verification, settlement response, provider observation, and finality limitations as transactional evidence.
- [ ] **INVK-10**: A non-x402 provider implements the same AE authority, intent, effect, unknown, reconciliation, audit, and operator contracts through a protocol-specific adapter.

### Policy and Budgets

- [ ] **POLI-01**: Consequence admission evaluates Account, Principal/delegation, Operation version, resource/action, amount, currency or asset, time, prior consumption, rate/concurrency limits, approvals, and bounded input against current policy.
- [ ] **POLI-02**: Budget reservations and consumption are Account-scoped, durable, attributable, replay-safe, and reconciled with the actual commercial/effect outcome.
- [ ] **POLI-03**: Policy changes, Account freeze, membership/ownership changes, delegation revocation, provider suspension, or Connection revocation deterministically block new affected work and are rechecked for admitted-but-not-yet-effected work.
- [ ] **POLI-04**: Denial and limit information is structured and supportable without leaking secret values, unrelated Account facts, internal policy details, or a resource-existence oracle.

### Connections and Secrets

- [ ] **SECR-01**: An authorized owner or operator can create, validate, share or lease where policy allows, rotate, revoke, reconcile, and delete a Connection through canonical domain commands.
- [ ] **SECR-02**: Secret material is retrieved just in time behind a replaceable `SecretStore` port, remains memory-only for the bounded provider operation, and is never returned or persisted in Convex, jobs, UI/API/MCP/CLI output, logs, traces, errors, or evidence.
- [ ] **SECR-03**: Vault authentication, retrieval, validation, audit, or availability failure blocks new secret-dependent consequential work and produces an owned, redacted operational state.
- [ ] **SECR-04**: Rotation creates and validates a candidate generation against the intended target before an atomic active-pointer advance; failure preserves the prior active generation and an attributable reconciliation path.
- [ ] **SECR-05**: Revoked, stale, inactive, orphaned, or superseded secret generations cannot authorize or resume new work, while in-flight ambiguity follows the invocation reconciliation policy.
- [ ] **SECR-06**: Operators can inspect Connection and secret generation status, freshness, health, rotation, revocation, outage, and recovery without access to secret material.

### Commercial Records and Recovery

- [ ] **COMM-01**: Each commercial invocation links distinct buyer charge, provider cost/payable, AE fee or margin, GST/tax treatment, payment/settlement reference, effect observation, and Account attribution.
- [ ] **COMM-02**: AE exposes no deposit, withdrawal, transferable balance, reusable stored value, or customer wallet ledger and does not collapse payer, owner, operator, supplier, beneficiary, or tax-subject roles.
- [ ] **COMM-03**: Refund, credit, cancellation, dispute, variance, and compensation are new attributable commands and immutable adjustments rather than destructive edits to prior transaction truth.
- [ ] **COMM-04**: Buyer, supplier, and staff operators can inspect commercial and reconciliation state and submit or resolve an eligible refund/dispute with explicit reason, evidence, deadlines, and authority.
- [ ] **COMM-05**: Account-scoped tax invoices, adjustment evidence, GST calculation records, and commercial exports are generated from canonical transaction facts subject to independently owned Australian legal/accounting acceptance.
- [ ] **COMM-06**: Commercial reconciliation detects and owns differences among buyer charge, provider observation, facilitator/settlement result, payable, refund/dispute, and AE records without manufacturing a successful state.

### Operability and Support

- [ ] **OPER-01**: Account-aware UI and equivalent structured CLI/API/MCP workflows let authorized users inspect canonical Principal continuity, Accounts, ownership, membership, external bindings, Credentials, autonomous-agent/workload ownership, and effective authority.
- [ ] **OPER-02**: Canonical workflows let authorized users change ownership/membership, rotate or revoke Credentials, manage delegations, Connections, policy/budgets, and Operation lifecycle with complete attribution.
- [ ] **OPER-03**: Owners, operators, and staff can inspect and act on invocation, unknown-effect, reconciliation, refund/dispute, provider, vault, and audit queues through explicitly owned recovery paths.
- [ ] **OPER-04**: Every control-plane action is classified self-service, approval or dual-control, staff-only, machine-only, or prohibited, with the same authorization semantics across adapters.
- [ ] **OPER-05**: Dangerous or irreversible human actions show Account and effect scope, require explicit typed confirmation, and produce a durable audit and post-action verification.
- [ ] **OPER-06**: Break-glass authority is purpose-, scope-, time-, and Principal-bound, requires dual control where policy says so, never uses a shared permanent credential, and always triggers review.
- [ ] **OPER-07**: Support projections expose stable correlation IDs, status, safe reason codes, evidence freshness, and escalation ownership while redacting secrets and unrelated Account information.
- [ ] **OPER-08**: UI workflows preserve keyboard access, landmarks, labelled controls, live status, error recovery, and touch-target accessibility, and CLI/MCP/API workflows remain bounded and non-interactive where appropriate.
- [ ] **OPER-09**: Website chat remains a thin adapter limited to its five canonical Operation tools and cannot acquire arbitrary URL, generic invoke, payment, recovery, supply, secret, or control-plane powers.

### Audit, Evidence, and Release

- [ ] **EVID-01**: Account-scoped audit timelines correlate request, Principal/delegation ancestry, policy decision, invocation, attempt, provider/payment observation, callback/job, reconciliation, operator action, and outcome with stable identifiers.
- [ ] **EVID-02**: Every durable evidence claim records the exact artifact, Git ref, relevant lock/build/deployment digest, command, tool/runtime version, generation time, freshness/expiry rule, evidence class, owner, and owning gate.
- [ ] **EVID-03**: Source, test-harness, hosted/external, operational, legal, and commercial evidence have separate owners and cannot substitute for one another.
- [ ] **EVID-04**: Audit or evidence-sink failure alerts an explicit owner and fails closed wherever continuing would erase attribution for a consequential effect.
- [ ] **EVID-05**: Hosted smoke uses separately authorized identity, provider, vault, payment, and spend access against an exact deployed revision and never promotes mocks, injected identities, local fixtures, or ignored output to hosted proof.
- [ ] **EVID-06**: Rollback, reconciliation, backup/restore, retention/disposal, and destructive-operation evidence identifies the exact deployment and requires typed human confirmation where consequences are irreversible.

### Execution and Maturity Gates

- [ ] **GATE-01**: Before product source edits for a phase, an architecture ADR/design acceptance cites current official documentation and mature examples, names exact production registrations/effect paths, defines operability and rollback, and receives independent engineering and adversarial acceptance.
- [ ] **GATE-02**: Every implementation phase consists of real registered-endpoint vertical slices with a production adapter, domain logic, durable/external effect, hostile denial/no-effect behavior, observability, rollback/recovery, operator path, and exact-revision acceptance.
- [ ] **GATE-03**: Semantic and adversarial gates predeclare the domain invariant, attacker-controlled and trusted inputs, exact registration/effect path, substitution counterexamples, oracle/no-effect assertions, evidence class, owner, and rerun command before implementation.
- [ ] **GATE-04**: An independent plan checker must approve each phase plan and an independent post-execution verifier must verify requirements and production composition before phase acceptance.
- [ ] **GATE-05**: Every phase receives a fresh Ox/red-team acceptance in a separate task after execution and verification; the implementer cannot mark the final semantic gate.
- [ ] **GATE-06**: A slice stops after two repair passes; a phase stops after two `CHANGES_REQUIRED` verdicts; recurrence of the same trust-defect class, three consecutive repairs to a critical file, or any proof-property/runtime-seam/trust-source/effect-boundary change forces architecture rebaseline.
- [ ] **GATE-07**: Every plan declares exact production, test, planning, and shared-integration file ownership; parallel work is allowed only for genuinely independent slices with non-overlapping ownership, and out-of-scope writes stop the work.
- [ ] **GATE-08**: The canonical GSD ROADMAP, STATE, phase artifacts, and lifecycle are the only active execution authority; the historical custom maturity tree remains evidence and cannot contradict current phase/ref/gate state.
- [ ] **GATE-09**: Every task and phase closes with a terminal task/goal state, exact reachable refs, clean tracked/staged/untracked state, committed or dispositioned evidence, removed or explicitly retained scratch/worktrees, archived task, and reconciled lifecycle records.
- [ ] **GATE-10**: Scaling or service extraction occurs only after accepted flows produce measured sustained SLO, queue, retry, storage, deployment, or isolation pressure that breaches a predeclared threshold after monolith tuning.

## v2 Requirements

Deferred differentiators require a measured trigger and explicit roadmap amendment; they are not part of the current candidate roadmap.

### Evidence and Policy Enhancements

- **ENHA-01**: Export a portable, selectively disclosed consequence evidence packet when buyer, supplier, or support demand exceeds canonical audit/export views.
- **ENHA-02**: Simulate Account policy with safe, non-binding “why denied” output when denial and support telemetry demonstrate a usability problem.

### Discovery and Supply Enhancements

- **ENHA-03**: Federate source-labelled provider discovery when AE's canonical catalogue provenance is accepted and a measurable supply gap exists.
- **ENHA-04**: Select among compatible providers using inspectable evidence when multiple validated providers, reliable health/cost data, and safe non-effect/failover proof exist.
- **ENHA-05**: Offer suppliers a digest-bound conformance kit when onboarding volume makes manual conformance a measured bottleneck; AE still performs independent activation proof.

## Out of Scope

| Feature | Reason |
|---------|--------|
| Regulated custody, deposits, withdrawals, transferable stored value, reusable balances, or wallets-as-ledgers | Conflicts with the locked Australian B2B reseller posture and materially expands regulatory and safeguarding obligations. |
| Speculative Quote, Order, or Offer resources for synchronous x402 | No independent lifecycle has been proven beyond Operation, payment requirements, invocation, settlement evidence, and reconciliation. |
| SAML, SCIM, nested enterprise organizations, or customer-managed keys | No current evidence of need; extension seams are sufficient for this milestone. |
| Active-active regional writes, dedicated tenant deployments, or self-hosted Infisical | No measured availability, isolation, or deployment trigger. |
| Hosted app runtime/app store, cards, ads, BNPL, company formation, or tax remittance | Unrelated platform/financial-product expansion outside the Core Value. |
| Microservices or a second writable system of record | No measured extraction trigger; distributed consistency would make authority and effect truth harder to prove. |
| Composite reputation | Deferred until defensible sample sizes, dimensions, and manipulation thresholds exist. |
| Arbitrary URL or generic tool execution | Bypasses canonical Operation contracts, SSRF policy, pricing/authority inspection, and bounded adapter behavior. |
| Blanket human approval for every consequence | Prevents autonomous agents from operating as first-class Principals; use Account policy, delegation, budgets, consequence classes, thresholds, and selective dual control. |
| Permanent or shared break-glass credentials | Violates least privilege and independent attribution; use purpose- and time-bound dual-controlled elevation. |
| MasterKey, Bazaar, Whop, or another external platform as AE identity, sole registry, sole inventory, or sole settlement rail | External platforms are labelled comparative inputs only; AE retains canonical identity, Operation history, authority, and reconciliation. |
| Dynamic website-chat power beyond the five canonical tools | Chat is a bounded adapter, not a second orchestration, payment, recovery, supply, or control-plane platform. |
| Automatic retry or transparent provider failover after an unknown irreversible effect | Risks duplicate consequences; observe, reconcile, compensate, or escalate first. |
| Universal exactly-once external-effect guarantee | AE cannot control every provider, network, callback, and timeout boundary; it guarantees replay-safe admission, explicit outcomes, and reconciliation instead. |
| Preserving the historical Phase 3+ decomposition or accepting static inventory/interface leaves as maturity | Current phases must be re-derived as actual endpoint vertical slices with production composition and independent acceptance. |

## Traceability

Every v1 requirement maps to exactly one phase. Cross-cutting execution controls are owned by Phase 1, which establishes their acceptance contract; Phases 2–7 inherit those controls in their success criteria without duplicate requirement mappings.

| Requirement | Phase | Status |
|-------------|-------|--------|
| AUTH-01 | Phase 2 | Pending |
| AUTH-02 | Phase 2 | Pending |
| AUTH-03 | Phase 2 | Pending |
| AUTH-04 | Phase 2 | Pending |
| AUTH-05 | Phase 2 | Pending |
| AUTH-06 | Phase 2 | Pending |
| AUTH-07 | Phase 2 | Pending |
| AUTH-08 | Phase 2 | Pending |
| AUTH-09 | Phase 2 | Pending |
| AUTH-10 | Phase 2 | Pending |
| DELG-01 | Phase 3 | Pending |
| DELG-02 | Phase 3 | Pending |
| DELG-03 | Phase 3 | Pending |
| DELG-04 | Phase 3 | Pending |
| DELG-05 | Phase 3 | Pending |
| DELG-06 | Phase 3 | Pending |
| DELG-07 | Phase 3 | Pending |
| DISC-01 | Phase 6 | Pending |
| DISC-02 | Phase 6 | Pending |
| DISC-03 | Phase 6 | Pending |
| SUPP-01 | Phase 6 | Pending |
| SUPP-02 | Phase 6 | Pending |
| SUPP-03 | Phase 6 | Pending |
| SUPP-04 | Phase 6 | Pending |
| SUPP-05 | Phase 6 | Pending |
| INVK-01 | Phase 2 | Pending |
| INVK-02 | Phase 2 | Pending |
| INVK-03 | Phase 2 | Pending |
| INVK-04 | Phase 2 | Pending |
| INVK-05 | Phase 2 | Pending |
| INVK-06 | Phase 2 | Pending |
| INVK-07 | Phase 2 | Pending |
| INVK-08 | Phase 2 | Pending |
| INVK-09 | Phase 5 | Pending |
| INVK-10 | Phase 5 | Pending |
| POLI-01 | Phase 2 | Pending |
| POLI-02 | Phase 2 | Pending |
| POLI-03 | Phase 2 | Pending |
| POLI-04 | Phase 2 | Pending |
| SECR-01 | Phase 4 | Pending |
| SECR-02 | Phase 4 | Pending |
| SECR-03 | Phase 4 | Pending |
| SECR-04 | Phase 4 | Pending |
| SECR-05 | Phase 4 | Pending |
| SECR-06 | Phase 4 | Pending |
| COMM-01 | Phase 5 | Pending |
| COMM-02 | Phase 5 | Pending |
| COMM-03 | Phase 5 | Pending |
| COMM-04 | Phase 5 | Pending |
| COMM-05 | Phase 5 | Pending |
| COMM-06 | Phase 5 | Pending |
| OPER-01 | Phase 6 | Pending |
| OPER-02 | Phase 6 | Pending |
| OPER-03 | Phase 5 | Pending |
| OPER-04 | Phase 6 | Pending |
| OPER-05 | Phase 6 | Pending |
| OPER-06 | Phase 7 | Pending |
| OPER-07 | Phase 7 | Pending |
| OPER-08 | Phase 6 | Pending |
| OPER-09 | Phase 6 | Pending |
| EVID-01 | Phase 2 | Pending |
| EVID-02 | Phase 1 | Pending |
| EVID-03 | Phase 1 | Pending |
| EVID-04 | Phase 7 | Pending |
| EVID-05 | Phase 7 | Pending |
| EVID-06 | Phase 7 | Pending |
| GATE-01 | Phase 1 | Pending |
| GATE-02 | Phase 1 | Pending |
| GATE-03 | Phase 1 | Pending |
| GATE-04 | Phase 1 | Pending |
| GATE-05 | Phase 1 | Pending |
| GATE-06 | Phase 1 | Pending |
| GATE-07 | Phase 1 | Pending |
| GATE-08 | Phase 1 | Pending |
| GATE-09 | Phase 1 | Pending |
| GATE-10 | Phase 7 | Pending |

**Coverage:**
- v1 requirements: 76 total
- Mapped to phases: 76
- Unmapped: 0
- Duplicate mappings: 0

---
*Requirements defined: 2026-08-26*
*Last updated: 2026-08-26 after initial definition from locked brief and project research*
