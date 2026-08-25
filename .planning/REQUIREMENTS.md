# Requirements: AE Full-Maturity Phase 1

**Defined:** 2026-08-25
**Core Value:** Every consequential operation is attributable to a stable principal acting in one explicit account context, independent of credentials and external identity providers.

## v1 Requirements

### Canonical Principals

- [ ] **P1PR-01**: Human, organization, agent, and workload actors have credential-independent stable Principal identities.
- [ ] **P1PR-02**: Credential rotation cannot create, transfer, merge, or replace a Principal.

### Accounts

- [ ] **P1AC-01**: Human, organization, and autonomous-agent Principals can own Accounts through explicit ownership records.
- [ ] **P1AC-02**: Account membership is explicit, lifecycle-aware, and separate from ownership.
- [ ] **P1AC-03**: Account creation, activation, suspension, closure, transfer, and succession reject impossible transitions.

### Identity and Credentials

- [ ] **P1ID-01**: External provider identities bind uniquely to Principals without becoming resource owners.
- [ ] **P1ID-02**: Credentials have independent lifecycle and generation state, and stale or colliding credentials fail closed.

### Workload Context and Reset

- [ ] **P1WK-01**: Jobs, crons, callbacks, and reconciliation execute with an explicit workload Principal and exactly one active Account context.
- [ ] **P1WK-02**: Internal workloads receive no implicit superuser authority.
- [ ] **P1WK-03**: A deterministic reset contract identifies and removes legacy internal identity data without erasing canonical Principal or Account facts.

## Future Requirements

### Phase 2+

- **P2AU-01**: Generation-bound grants, delegation, recovery, connections, and secret rotation are deferred to the separately gated Phase 2 task.
- **P3PL-01**: Commercial, invocation, money, evidence, operated-platform, distribution, scale, support, and GA requirements remain governed by later maturity phases.

## Out of Scope

| Feature | Reason |
|---------|--------|
| Phase 2 authority, connections, and secrets | Explicit hard stop after Phase 1 |
| Phase 3+ maturity work | Requires later independently gated tasks |
| Public agent API changes | Phase 1 is canonical domain foundation; shared public HTTP work belongs to later phases |
| Reinterpretation of locked maturity decisions | `.planning/maturity-execution/PLAN.md` is authoritative |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| P1PR-01 | Phase 1 | Pending |
| P1PR-02 | Phase 1 | Pending |
| P1AC-01 | Phase 1 | Pending |
| P1AC-02 | Phase 1 | Pending |
| P1AC-03 | Phase 1 | Pending |
| P1ID-01 | Phase 1 | Pending |
| P1ID-02 | Phase 1 | Pending |
| P1WK-01 | Phase 1 | Pending |
| P1WK-02 | Phase 1 | Pending |
| P1WK-03 | Phase 1 | Pending |

**Coverage:**
- v1 requirements: 10 total
- Mapped to phases: 10
- Unmapped: 0

---
*Requirements defined: 2026-08-25*
*Last updated: 2026-08-25 when the Phase 1 roadmap established 10/10 traceability*
