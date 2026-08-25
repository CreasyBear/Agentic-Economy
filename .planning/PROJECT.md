# Agentic Economy

## What This Is

Agentic Economy is an Operation market where people and software agents discover,
compare, and invoke callable capabilities through controlled contracts. Convex is
the sole writable primary, and all human, organization, agent, and workload actors
must participate through the same canonical principal and account model.

## Core Value

Every consequential operation is attributable to a stable principal acting in one
explicit account context, independent of credentials and external identity providers.

## Business Context

- **Customer**: Australian businesses and autonomous agents buying completed execution
- **Revenue model**: AUD B2B reseller margin on completed supplier execution
- **Success metric**: Reliable, attributable, non-duplicative paid invocations
- **Strategy notes**: `.planning/maturity-execution/PLAN.md` is the frozen maturity contract

## Current Milestone: v1.0 AE Full-Maturity Phase 1

**Goal:** Establish canonical principals and accounts from the verified Phase 0 baseline.

**Target features:**
- Credential-independent Principal registry for human, organization, agent, and workload actors
- Account ownership, membership, lifecycle, transfer, succession, and explicit active context
- External identity bindings, independent credentials, workload context, and clean internal-data reset

## Requirements

### Validated

- ✓ Trustworthy Phase 0 baseline with the exact Node 22 source release gate — maturity Phase 0

### Active

- [ ] Canonical Principal registry
- [ ] Account ownership, membership, and lifecycle
- [ ] External identity bindings and independent credentials
- [ ] Workload principals, explicit Account context, and internal-data reset

### Out of Scope

- Phase 2 authority, delegation, connections, and secrets — explicitly deferred to a later task
- Phase 3+ commercial, invocation, money, evidence, operations, and GA work — outside this task
- Reopening decisions frozen in `.planning/maturity-execution/PLAN.md` — the contract is authoritative

## Context

Phase 0 is independently verified. Phase 1 consists only of leaves P1-01 through
P1-04 and their phase integration gate. The implementation must preserve the frozen
domain ownership, identifier, account, authority, test, and shared-file contracts.

## Constraints

- **Runtime**: All checks use Node.js 22.22.0 from the pinned NVM path
- **Backend**: Convex project rules in `convex/_generated/ai/guidelines.md` take precedence
- **Ownership**: Feature leaves do not edit shared composition or generated files
- **Verification**: Exact Unlazy leaf/phase gates, independent reruns, and source release gate must pass
- **Scope**: Stop after Phase 1; do not begin Phase 2 or claim overall AE maturity

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Stable principals are independent of credentials and provider identifiers | Rotation and provider changes must not transfer resource ownership | — Pending Phase 1 proof |
| Every protected action has exactly one active Account context | Prevent implicit tenancy and cross-account ambiguity | — Pending Phase 1 proof |
| Convex is the sole writable primary | Preserve one source of truth | ✓ Locked |
| Integration driver exclusively owns shared surfaces | Prevent parallel leaf conflicts and contract drift | ✓ Locked |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `$gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `$gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-08-25 at AE Full-Maturity Phase 1 milestone start*
