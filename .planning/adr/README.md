# ADR Register

Reconciled 2026-08-23. Only decisions that still constrain the market,
transaction boundary, or surviving product surfaces remain in the working
tree. Superseded and abandoned records remain available in Git history.

| ADR | Status | Current boundary |
| --- | --- | --- |
| ADR-002 governed action | Accepted | Neutral governed-action encoding boundary |
| ADR-004 evidence | Accepted | Evidence ledger and projection ownership |
| ADR-005 | Accepted, deferred portions explicit | Transaction and receipt semantics |
| ADR-007 | Accepted within implemented uses | Canonical governed-action wire format |
| ADR-009 | Accepted | Standalone Action Invocation and lineage |
| ADR-010 | Accepted, narrowed | One action plane across hosts |
| ADR-019 | Accepted | Delegated authority modes |
| ADR-025 | Accepted where not superseded by ADR-034/036 | Commercial and usage separation |
| ADR-026 | Accepted | One supply graph from catalog source to execution |
| ADR-027 | Accepted | Exact comparable published price |
| ADR-028 | Accepted | Operation registry admission boundary |
| ADR-029 | Accepted | Publication, provenance, readiness, and withdrawal |
| ADR-030 | Accepted for registry/execution contract only | Machine contract; old engine destination superseded |
| ADR-033 | Accepted | Durable answer-turn lifecycle for the surviving adapter |
| ADR-034 | Accepted | Qualified Use and supplier settlement spine |
| ADR-035 | Accepted | One caller key over admitted Operations |
| ADR-036 | Accepted | Agent tool market foundation and product reset |

## Retired records

ADR-036 supersedes the product destinations or implementation hosts recorded by
ADR-001, the capability-registry ADR-002, the communications ADR-004, ADR-003,
ADR-006, ADR-011–018, ADR-020, ADR-022–024, ADR-031, and ADR-032. Those files
were removed from the working tree rather than maintained as false current
authority.

ADR numbers are historical identifiers. ADR-008 and ADR-021 were never used.
New decisions use the next unused number and must state what they supersede.
