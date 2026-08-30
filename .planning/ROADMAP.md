# Roadmap: Agentic Economy Maturity Rebaseline

> **Candidate canonical planning artifact.** This roadmap is pending a separate fresh engineering-plan review and Ox/red-team challenge. Initialization approval permits only these planning artifacts; it does not authorize phase discussion, phase planning, product edits, or implementation, and it must not auto-advance the lifecycle.

## Overview

This milestone preserves the accepted historical Phase 1 source and acceptance boundary (`ae284871d9d5bad40245182aefd6f2050d53b556`; handoff `d20d62d8255ee7a38ce7cb8f1c618b1e0393d4e0`) while treating historical Phase 2 as `INCOMPLETE_NOT_ACCEPTED_NOT_MATURE`. The new roadmap begins with a planning-only architecture, threat, and acceptance contract, then proves maturity through dependency-ordered Vertical MVP slices: a direct-authority consequence, delegated autonomous invocation, Connection/secret generation under use, paid commercial recovery, canonical supply and entry-family breadth, and operated release with measured scale. `.planning/maturity-execution/**` remains evidence only and is not the active lifecycle.

## Phases

- [ ] **Phase 1: Architecture, Threat, and Acceptance Contract** - Accept the planning contract that fixes trust, effect, operability, evidence, ownership, and stop semantics before product edits.
- [ ] **Phase 2: Direct-Authority Reference Consequence** - Prove one useful provider consequence end to end through an actual production registration and the sole canonical authority adapter.
- [ ] **Phase 3: Delegated Autonomous Invocation** - Prove that an autonomous-agent or workload Principal can invoke a real consequence through safe, revocable multi-hop delegation.
- [ ] **Phase 4: Connection and Secret Generation Under Use** - Operate a generation-safe Connection through a real control-plane registration and consume its secret JIT in an accepted consequence.
- [ ] **Phase 5: Paid Provider Truth and Commercial Recovery** - Complete one paid provider consequence with exact protocol evidence, immutable commercial truth, and operated unknown/refund/dispute recovery.
- [ ] **Phase 6: Canonical Supply and Entry-Family Breadth** - Let suppliers and operators manage canonical Operations while completing required transport and asynchronous entry families as independent vertical slices.
- [ ] **Phase 7: Operated Release, Recovery, and Measured Scale** - Demonstrate an exact-revision supported release, recovery drills, evidence ownership, and threshold-driven scaling without premature extraction.

## Locked Vertical MVP Execution Contract

Phase 1 owns this acceptance contract; Phases 2–7 inherit it without remapping its cross-cutting requirements. Every implementation slice must include an actual registered endpoint/reference, production adapter, domain logic, durable or external effect, hostile denial with proven no-effect, observability, rollback/recovery, an owned operator path, and independent exact-revision acceptance. Each phase requires an independent plan checker before execution, an independent post-execution verifier, and then fresh Ox/red-team acceptance in a separate task; the implementer cannot close the final semantic gate.

Each plan must predeclare exact production, test, planning, and shared-integration file ownership. Work is sequenced unless slices are genuinely independent and ownership is non-overlapping; out-of-scope writes stop the work. A slice stops after two repair passes and a phase stops after two `CHANGES_REQUIRED` verdicts. The same trust-defect class recurring, three consecutive repairs to a critical file, or any proof-property, runtime-seam, trust-source, or effect-boundary change triggers immediate architecture rebaseline. Lifecycle closure requires reachable refs, clean state, dispositioned evidence, archived tasks, and reconciled scratch/worktree and GSD records.

## Phase Details

### Phase 1: Architecture, Threat, and Acceptance Contract
**Goal:** Reviewers can accept one executable architecture, threat, operability, evidence, and acceptance contract before any product source is edited.
**Mode:** mvp
**Depends on:** Nothing (first roadmap phase; historical accepted source is preserved input, not a roadmap phase prerequisite to re-execute)
**Requirements:** EVID-02, EVID-03, GATE-01, GATE-02, GATE-03, GATE-04, GATE-05, GATE-06, GATE-07, GATE-08, GATE-09
**Success Criteria** (what must be TRUE):
  1. Reviewers can inspect an exact-ref ADR/design that cites current official documentation and mature examples, confirms installed-version behavior, names the first actual registered endpoint/reference and complete effect path, and makes no product edit.
  2. Reviewers can identify exactly one canonical Convex Principal/Account adapter contract, least-privilege wrapper shapes, consequence-time authority boundary, effect/unknown state machine, rollback meanings, operator routes, and threat counterexamples.
  3. Every threat, durable/external effect, operability duty, evidence class, and acceptance claim has an explicit owner plus exact artifact/ref/digest/tool/freshness metadata; evidence classes cannot substitute for one another.
  4. Every planned slice has exact file ownership, permitted parallel boundaries, predeclared hostile/no-effect gates, repair counters, lifecycle-close duties, and stop/rebaseline rules that reviewers can enforce mechanically.
  5. An independent plan checker and post-execution verifier approve the planning-only contract, followed by fresh Ox/red-team acceptance in a separate task; until a separate fresh engineering-plan review and Ox challenge accept this candidate roadmap, no phase planning or implementation is authorized.
**Plans:** TBD

### Phase 2: Direct-Authority Reference Consequence
**Goal:** A directly authorized Principal can invoke and recover one useful provider consequence through the actual registered production path with explicit Account authority and durable truth.
**Mode:** mvp
**Depends on:** Phase 1
**Requirements:** AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05, AUTH-06, AUTH-07, AUTH-08, AUTH-09, AUTH-10, INVK-01, INVK-02, INVK-03, INVK-04, INVK-05, INVK-06, INVK-07, INVK-08, POLI-01, POLI-02, POLI-03, POLI-04, EVID-01
**Success Criteria** (what must be TRUE):
  1. A Principal explicitly selects an authorized Account and completes one real provider consequence through the chosen registered HTTP Operation endpoint, while the sole canonical adapter preserves Principal, Account, Credential, workload, ownership, membership, and distinct commercial-role attribution.
  2. Repeating the same Account-scoped intent is replay-safe, conflicting reuse is rejected, and admission atomically records current policy/budget authority, audit, reservation, and asynchronous handoff before acknowledgement.
  3. Scheduled or internal work independently revalidates current server authority immediately before the effect; attempts, provider observations, unknown outcomes, reconciliation, cancellation, and compensation remain distinct monotonic facts.
  4. Wrong-Account, ambiguous, expired, revoked, stale, over-budget, or otherwise hostile requests receive a safe denial with no reservation, schedule, secret read, provider call, durable success, or existence leak, while callers and operators can inspect and safely cancel or reconcile the accepted invocation.
  5. The locked vertical contract is independently plan-checked and post-execution verified, then a fresh separate-task Ox/red-team acceptance proves the actual registered reference, production adapter, durable/external effect, no-effect denial, observability, rollback/recovery, operator path, and exact-revision evidence within the repair/stop budget.
**Plans:** TBD
**UI hint:** yes

### Phase 3: Delegated Autonomous Invocation
**Goal:** An autonomous-agent or workload Principal can exercise inspectable, monotonically narrowed multi-hop authority over a real consequence and lose that power immediately when an ancestor is revoked.
**Mode:** mvp
**Depends on:** Phase 2
**Requirements:** DELG-01, DELG-02, DELG-03, DELG-04, DELG-05, DELG-06, DELG-07
**Success Criteria** (what must be TRUE):
  1. A human, organization, autonomous-agent, or workload Principal can directly own an Account/resources and issue an inspectable delegation with explicit Account, resources, actions, budget, time window, consequence class, and approval posture.
  2. A real MCP or CLI-over-HTTP invocation by an autonomous-agent/workload Principal reaches the accepted provider consequence only when every delegation hop narrows its parent and the bounded chain is cycle-free and generation-current.
  3. Revoking or narrowing any ancestor after admission but before the exact registered worker effect denies the consequence with zero new secret/provider effect while preserving immutable historical and full initiating/effective-actor attribution.
  4. Owners and authorized operators can inspect effective delegated authority, ancestry, decision/consequence-time facts, and revoke or narrow it through a canonical recovery-capable control-plane path.
  5. The locked vertical contract is independently plan-checked and post-execution verified, then a fresh separate-task Ox/red-team acceptance proves the actual registered reference, production adapter, effect, hostile no-effect denial, observability, rollback/recovery, operator path, and exact-revision evidence within the repair/stop budget.
**Plans:** TBD
**UI hint:** yes

### Phase 4: Connection and Secret Generation Under Use
**Goal:** Authorized users can operate a Connection safely while a real accepted consequence consumes only its validated active secret generation JIT and fails closed during vault or rotation faults.
**Mode:** mvp
**Depends on:** Phase 3
**Requirements:** SECR-01, SECR-02, SECR-03, SECR-04, SECR-05, SECR-06
**Success Criteria** (what must be TRUE):
  1. An authorized owner/operator can create, validate, share or lease where permitted, rotate, revoke, reconcile, and delete a Connection through an actual registered control-plane path with complete attribution.
  2. Rotation validates a candidate generation against the intended target before atomic pointer advance; failure preserves the prior active generation, and revoked, stale, orphaned, inactive, or superseded generations cannot start or resume new work.
  3. The accepted provider consequence retrieves secret material JIT through a replaceable production SecretStore adapter, keeps it memory-only for the bounded operation, and exposes no secret in Convex, jobs, interfaces, logs, traces, errors, evidence, or normal CI output.
  4. Vault authentication, retrieval, validation, audit, or availability failure starts no new secret-dependent consequence and leaves operators a redacted health, outage, rollback, and reconciliation path.
  5. The locked vertical contract is independently plan-checked and post-execution verified, then a fresh separate-task Ox/red-team acceptance proves the actual registered reference, production adapter, effect, hostile no-effect denial, observability, rollback/recovery, operator path, and exact-revision evidence within the repair/stop budget.
**Plans:** TBD
**UI hint:** yes

### Phase 5: Paid Provider Truth and Commercial Recovery
**Goal:** Buyers, suppliers, and operators can complete and support one paid provider consequence without confusing protocol observations, external effect truth, or immutable AE commercial records.
**Mode:** mvp
**Depends on:** Phase 4
**Requirements:** INVK-09, INVK-10, COMM-01, COMM-02, COMM-03, COMM-04, COMM-05, COMM-06, OPER-03
**Success Criteria** (what must be TRUE):
  1. One real paid endpoint completes through a version-pinned x402 flow where supported or an explicit non-x402 production adapter, while AE records exact payment requirements, signed identity, verification, settlement/provider observations, finality limits, authority, and effect truth separately.
  2. A fault after provider acceptance but before the response causes exactly one irreversible request and an owned unknown/reconciliation record; callback, bounded poll, or operator evidence converges, compensates, or escalates without blind retry or destructive history edits.
  3. Buyers, suppliers, and staff can inspect separately attributed buyer charge, provider cost/payable, AE fee/margin, GST/tax, settlement, effect, variance, refund, cancellation, dispute, and compensation facts, and authorized adjustments create immutable new commands with evidence and deadlines.
  4. Canonical invoices, adjustment evidence, and exports reflect independently accepted Australian legal/accounting treatment and expose no deposit, withdrawal, transferable balance, reusable stored value, customer-wallet ledger, or collapsed payer/owner/operator/supplier/beneficiary/tax roles.
  5. The locked vertical contract is independently plan-checked and post-execution verified, then a fresh separate-task Ox/red-team acceptance proves the paid registered reference, production adapter, durable/external effect, hostile no-effect denial, observability, rollback/recovery, operator queues, and exact-revision hosted evidence within the repair/stop budget.
**Plans:** TBD
**UI hint:** yes

### Phase 6: Canonical Supply and Entry-Family Breadth
**Goal:** Suppliers, buyers, autonomous agents, operators, and support can discover and operate the same canonical Operations across required entry families without transport-specific authority or business-logic forks.
**Mode:** mvp
**Depends on:** Phase 5
**Requirements:** DISC-01, DISC-02, DISC-03, SUPP-01, SUPP-02, SUPP-03, SUPP-04, SUPP-05, OPER-01, OPER-02, OPER-04, OPER-05, OPER-08, OPER-09
**Success Criteria** (what must be TRUE):
  1. Agents can search, compare, inspect, and inspect-plan the same source-labelled, versioned canonical Operation across HTTP, MCP, CLI, UI, and bounded chat without acquiring authority, reserving budget, reading secrets, or creating effects; inspect-plan remains explicitly non-binding.
  2. Authorized suppliers can publish/version an Operation and staff can validate its actual endpoint, contract, provider authentication, SSRF/network policy, denial, and reconciliation behavior before activation, then suspend/reactivate/retire it without erasing historical evidence.
  3. Authorized users and staff can inspect and change canonical identity/Account continuity, ownership/membership, Credentials, delegations, Connections, policy/budgets, and Operation lifecycle through classified self-service, approval/dual-control, staff-only, machine-only, or prohibited paths with identical authorization semantics.
  4. Required HTTP, MCP, CLI, UI/chat, callback, cron, scheduled-job, worker, and reconciliation registrations each close as an independently accepted production-consumer micro-slice; dangerous human actions identify Account/effect scope, require typed confirmation, remain accessible, and website chat stays limited to five canonical tools.
  5. Each slice inherits the locked contract and is independently plan-checked and post-execution verified, then fresh separate-task Ox/red-team accepted on its actual registered reference, production adapter, effect, hostile no-effect denial, observability, rollback/recovery, operator/support path, and exact-revision evidence; parallel work occurs only across exact non-overlapping ownership.
**Plans:** TBD
**UI hint:** yes

### Phase 7: Operated Release, Recovery, and Measured Scale
**Goal:** Operators can release, observe, support, recover, and scale the accepted vertical flows using exact-revision evidence and measured thresholds while Convex remains the sole writable modular monolith.
**Mode:** mvp
**Depends on:** Phase 6
**Requirements:** OPER-06, OPER-07, EVID-04, EVID-05, EVID-06, GATE-10
**Success Criteria** (what must be TRUE):
  1. Operators can bind a release to exact source, lock/build/deployment digests and run separately authorized hosted Clerk, provider, vault, payment, callback, audit/telemetry, and spend smokes without treating mocks, fixtures, injected identities, or ignored output as hosted proof.
  2. Owners and support can use redacted stable correlation IDs, safe reason codes, evidence freshness, alert ownership, and escalation routes; audit/evidence-sink failure alerts an owner and fails closed wherever continuing would erase consequence attribution.
  3. Operators can complete and evidence stop-new-work, rollback, reconciliation-backlog, backup/restore, retention/disposal, and destructive-operation drills against an exact deployment, with typed confirmation for irreversible actions and purpose/scope/time/Principal-bound reviewed break-glass authority.
  4. Accepted flows expose measured SLO, queue, retry, rate, storage, deployment, and isolation pressure with load shedding and recovery budgets; service extraction occurs only after a predeclared sustained threshold is breached after modular-monolith tuning.
  5. The locked vertical contract is independently plan-checked and post-execution verified, then a fresh separate-task Ox/red-team acceptance proves the hosted actual registered references, production adapters, effects, hostile no-effect denial, observability, rollback/recovery, operator/support paths, and exact-revision evidence within the repair/stop budget.
**Plans:** TBD
**UI hint:** yes

## Dependency and Parallelism Rationale

- Phase 1 fixes the authority/effect and proof contract before any implementation edits.
- Phase 2 proves direct authority before Phase 3 can safely extend it with delegation.
- Phase 4 follows consequence-time authority so secret retrieval occurs only after accepted admission, and precedes paid flows that require production credentials.
- Phase 5 binds payment and commercial recovery to actual provider/effect facts before breadth multiplies the paths.
- Phase 6 expands only independently accepted vertical patterns; its micro-slices may run in parallel solely when exact production, test, planning, and shared-integration ownership does not overlap.
- Phase 7 closes hosted operation and measured scaling after representative flows exist. Any new trust boundary or proof/effect seam discovered earlier stops work and returns to Phase 1 rebaseline rather than being patched forward.

## Progress

**Candidate status:** No phase is active. Separate fresh engineering-plan review and Ox challenge must accept this roadmap before any lifecycle advance.

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Architecture, Threat, and Acceptance Contract | 0/TBD | Candidate — review required | - |
| 2. Direct-Authority Reference Consequence | 0/TBD | Not authorized | - |
| 3. Delegated Autonomous Invocation | 0/TBD | Not authorized | - |
| 4. Connection and Secret Generation Under Use | 0/TBD | Not authorized | - |
| 5. Paid Provider Truth and Commercial Recovery | 0/TBD | Not authorized | - |
| 6. Canonical Supply and Entry-Family Breadth | 0/TBD | Not authorized | - |
| 7. Operated Release, Recovery, and Measured Scale | 0/TBD | Not authorized | - |

---
*Candidate canonical roadmap created: 2026-08-26; Standard granularity; Vertical MVP mode; pending separate fresh engineering-plan review and Ox challenge.*
