# Roadmap: AE Full-Maturity Phase 1

## Overview

This milestone establishes the canonical principal and account foundation from the
verified Phase 0 baseline. It delivers only the four frozen Phase 1 leaves—Principal
registry, Account lifecycle, identity bindings and credentials, and workload context
and reset—then closes on the authoritative Phase 1 integration gate. Phase 2 and later
maturity work remain explicitly out of scope.

## Phases

**Phase Numbering:**
- Integer phases are planned milestone work.
- Decimal phases are urgent insertions between planned phases.

- [ ] **Phase 1: Canonical principals and accounts** - Every actor has a credential-independent Principal and acts in one explicit Account context.

## Phase Details

### Phase 1: Canonical principals and accounts
**Goal**: Human, organization, agent, and workload actors participate through stable, credential-independent Principals and explicit Accounts, with the four frozen Phase 1 leaves integrated and proved by the Phase 1 gate.
**Depends on**: Verified maturity Phase 0 baseline
**Requirements**: P1PR-01, P1PR-02, P1AC-01, P1AC-02, P1AC-03, P1ID-01, P1ID-02, P1WK-01, P1WK-02, P1WK-03
**Success Criteria** (what must be TRUE):
  1. Human, organization, agent, and workload actors have stable Principal identities, and credential rotation cannot create, transfer, merge, or replace a Principal.
  2. Human, organization, and autonomous-agent Principals can own Accounts through explicit ownership records; membership remains separate and lifecycle-aware; and impossible creation, activation, suspension, closure, transfer, or succession transitions are rejected.
  3. External provider identities bind uniquely to Principals without owning resources, while independently lifecycle- and generation-bound credentials fail closed when stale or colliding.
  4. Jobs, crons, callbacks, and reconciliation run with an explicit workload Principal and exactly one active Account context, receive no implicit superuser authority, and can deterministically identify and remove legacy internal identity data without deleting canonical Principal or Account facts.
  5. All four leaf gates are independently met and composed through the integration-driver-owned surfaces; cross-leaf checks pass; contracts, errors, state transitions, and documentation agree; and an adversarial rerun finds no regression, bypass, placeholder, or silent failure.
**Plans**: TBD

## Progress

**Execution Order:** Phase 1 only. Stop after its independent integration gate; Phase 2 is outside this milestone.

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Canonical principals and accounts | 0/TBD | Not started | - |
