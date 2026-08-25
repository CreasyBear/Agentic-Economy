# Phase 1: Canonical principals and accounts - Context

**Gathered:** 2026-08-25
**Status:** Ready for planning
**Source:** PRD Express Path (`.planning/REQUIREMENTS.md`)

<domain>
## Phase Boundary

Deliver and independently prove only P1-01 canonical Principals, P1-02 Account
ownership/membership/lifecycle, P1-03 external identity bindings and independent
credentials, and P1-04 workload Principals/Account context/internal-data reset.
Integrate those four leaves through the exact Phase 1 gate and stop before Phase 2.

</domain>

<decisions>
## Implementation Decisions

### Canonical Principal registry
- Human, organization, agent, and workload are variants of one stable Principal noun.
- Principal identity is independent of credentials and provider identifiers.
- Credential rotation cannot create, transfer, merge, or replace a Principal.

### Account ownership, membership, and lifecycle
- Human, organization, and autonomous-agent Principals may own Accounts through explicit ownership records.
- Membership is explicit and lifecycle-aware, and is not ownership.
- Account creation, activation, suspension, closure, transfer, and succession reject impossible transitions.
- Each protected action has exactly one active Account context; cross-account work is explicit and attributed.

### External identity and credentials
- External provider identities bind uniquely to Principals and never own resources.
- Credentials independently track lifecycle and generation; stale and colliding credentials fail closed.
- Convex authentication lookups prefer `identity.tokenIdentifier`; `identity.subject` alone is not a global identity key.

### Workload context and reset
- Jobs, crons, callbacks, and reconciliation require an explicit workload Principal and exactly one Account context.
- Internal workloads receive no implicit superuser authority.
- Reset tooling is deterministic, scoped, dry-runnable, and cannot delete canonical Principal or Account facts.

### Shared ownership and verification
- Leaves own only the disjoint paths frozen in `PHASE-1-BLAST-RADIUS.md`.
- Only the integration driver edits `convex/schema.ts`, generated Convex files, shared HTTP/composition surfaces, root scripts/configuration, or public cross-context barrels.
- Each executor completes the four Unlazy passes, runs its exact leaf checker, and commits atomically.
- The driver independently reruns every leaf check, cross-leaf isolation checks, and the exact Node 22 source release gate, then dispatches an independent verifier.
- All four leaf gates and the Phase 1 gate must report `ALL MET`; no `ABANDON` may exist.

### the agent's Discretion
- Context-local file decomposition, naming below the frozen public/domain nouns, and pure helper implementation details.
- The exact compatibility adapter shape that keeps legacy `owners`, `businesses`, and `agentAccessPrincipals` consumers stable without treating them as canonical.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Maturity contract and gates
- `.planning/maturity-execution/PLAN.md` — frozen public, domain, identity, account, test, and shared-file contract
- `.planning/maturity-execution/PHASE-1-BLAST-RADIUS.md` — measured legacy blast radius and exclusive file ownership
- `.planning/maturity-execution/gates/leaf-P1-01.md` — Principal leaf acceptance ledger
- `.planning/maturity-execution/gates/leaf-P1-02.md` — Account leaf acceptance ledger
- `.planning/maturity-execution/gates/leaf-P1-03.md` — identity/credential leaf acceptance ledger
- `.planning/maturity-execution/gates/leaf-P1-04.md` — workload/reset leaf acceptance ledger
- `.planning/maturity-execution/gates/phase-1.md` — parent integration ledger

### Project and backend rules
- `AGENTS.md` — repository-specific Convex instruction
- `convex/_generated/ai/guidelines.md` — project-specific Convex API and schema rules
- `.planning/ROADMAP.md` — exact Phase 1 goal and traceability
- `.planning/REQUIREMENTS.md` — ten atomic Phase 1 requirements

</canonical_refs>

<specifics>
## Specific Ideas

- New domain code lives below `src/modules/principal-account/`.
- Canonical tables expose context-local table fragments for driver composition.
- Existing legacy identity/owner tables remain compatibility consumers in this phase; mass migration is deferred.
- Checks run with `PATH=/Users/joelchan/.nvm/versions/node/v22.22.0/bin:$PATH`.

</specifics>

<deferred>
## Deferred Ideas

- Phase 2 authority generations, delegation, recovery, connections, and secrets.
- Phase 3+ commercial, invocation, money, evidence, operations, scale, support, and GA work.
- Public Agent API expansion and any claim that the overall platform is mature.

</deferred>

---

*Phase: 01-canonical-principals-and-accounts*
*Context gathered: 2026-08-25 via PRD Express Path*
