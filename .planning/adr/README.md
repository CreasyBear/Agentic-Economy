# ADR register

This register is reconciled against the files on disk (2026-08-09). ADR
numbers are historical identifiers, not a single-file sequence: ADR-002 and
ADR-004 each have two durable records, and both records are retained. New ADRs
must use the next unused number.

## Current product-conversion chain

| ADR | Status | Role |
| --- | --- | --- |
| ADR-009 | accepted | Action Invocation, discriminated lineage and authority/effect continuity |
| ADR-010 | accepted_narrowed | One action plane; Gate 10 payoff rejected for the measured class |
| ADR-019 | accepted | Inspect only, Approve each, Bounded mandate and Full autonomy destination |
| ADR-020 | Accepted; Phase 3A and Phase 3B closed at labelled local/mock evidence boundary | One reliable paid operation as the first product projection |
| ADR-035 | accepted | Single-Key Capability Gateway; one Clerk-issued key over many admitted operations |


## Filesystem inventory

Every ADR file currently present is listed below. Status is copied from that
file's status declaration; the filename disambiguates duplicate numbers.

| ADR | File | Status |
| --- | --- | --- |
| ADR-001 | `ADR-001-scope1-production-landing.md` | Proposed |
| ADR-002 | `ADR-002-capability-registry-agent-native-supply.md` | Superseded by ADR-026 (provenance retained) |
| ADR-002 | `ADR-002-governed-action-bounded-contexts.md` | Accepted |
| ADR-003 | `ADR-003-handshake-agent-identity-clearance.md` | Proposed |
| ADR-004 | `ADR-004-comms-rail-threads.md` | Proposed |
| ADR-004 | `ADR-004-evidence-ledger-vs-projections.md` | Accepted |
| ADR-005 | `ADR-005-transactions-receipts.md` | Accepted (defer) |
| ADR-006 | `ADR-006-agent-experience-audit-gate.md` | Proposed |
| ADR-007 | `ADR-007-canonical-governed-action-wire-format.md` | Accepted (K12 spike; integration not yet authorized) |
| ADR-009 | `ADR-009-partial-entry-without-request-ownership.md` | accepted |
| ADR-010 | `ADR-010-one-action-plane-across-human-and-agent-experiences.md` | accepted_narrowed |
| ADR-011 | `ADR-011-journal-write-plan-ports.md` | Accepted |
| ADR-012 | `ADR-012-route-cancel-problem-ports.md` | Accepted |
| ADR-013 | `ADR-013-route-dispatch-lifecycle-ports.md` | Accepted |
| ADR-014 | `ADR-014-customer-request-v2-write-ports.md` | Accepted |
| ADR-015 | `ADR-015-notification-outbox-operator-ports.md` | Accepted |
| ADR-016 | `ADR-016-customer-request-v2-preparation-ports.md` | Accepted |
| ADR-017 | `ADR-017-customer-request-v2-read-ports.md` | Accepted |
| ADR-018 | `ADR-018-route-mandate-issue-revoke-ports.md` | Accepted |
| ADR-019 | `ADR-019-authority-modes-and-consequential-operations-target.md` | accepted |
| ADR-020 | `ADR-020-product-projection-of-delegated-work.md` | Accepted; Phase 3A and Phase 3B closed at labelled local/mock evidence boundary |
| ADR-022 | `ADR-022-routeable-supply-onboarding-and-credential-custody.md` | proposed |
| ADR-023 | `ADR-023-rfq-evidence-comparison-and-quote-to-close-ownership.md` | proposed |
| ADR-024 | `ADR-024-business-account-and-customer-management-ownership.md` | Accepted as local planning authority |
| ADR-025 | `ADR-025-commercial-and-usage-ownership.md` | Accepted as Phase 4 planning authority |
| ADR-026 | `ADR-026-one-business-supply-graph.md` | Accepted |
| ADR-027 | `ADR-027-comparable-published-price.md` | Accepted |
| ADR-028 | `ADR-028-executable-capability-registry-admission.md` | Accepted |
| ADR-029 | `ADR-029-capability-publication-provenance-readiness.md` | Accepted |
| ADR-030 | `ADR-030-registry-engine-machine-contract.md` | Accepted |
| ADR-031 | `ADR-031-frankfurter-second-conformance-provider.md` | Accepted |
| ADR-032 | `ADR-032-founder-category-and-ownership.md` | Accepted |
| ADR-033 | `ADR-033-durable-answer-turn-lifecycle.md` | Accepted; implemented at source/local verification boundary |
| ADR-034 | `ADR-034-supplier-usage-qualified-use-and-payout-spine.md` | Accepted; owner readback implemented at source/local verification boundary, remaining sequence documented |
| ADR-035 | `ADR-035-single-key-capability-gateway.md` | Accepted; source implementation complete and locally verified; hosted certification blocked |


## Reconciled gaps and discrepancies

- ADR-008 is the registered-number gap identified by the prior review; it has no file on disk and no in-repository citation.
- ADR-021 has no file on disk and no in-repository citation.
- The two ADR-002 files and the two ADR-004 files are intentional duplicate
  historical numbers; they are preserved under the duplicate-number rule.
- ADR-002 capability registry is superseded by ADR-026, but ADR-026 explicitly
  cites it and the file records its provenance, so it is not deletable.
- The prior review's note that "ADR-002 is superseded by ADR-003" is not
  supported by disk: ADR-003 is Proposed and declares no supersession; the
  capability ADR-002 is superseded by ADR-026, while the governed-action ADR-002
  is Accepted.
- The former register listed only ADR-009, ADR-010, ADR-019, and ADR-020.
  ADR-001–007, ADR-011–018, and ADR-022–027 were therefore file-without-entry
  discrepancies; all are now registered above.
- The four former chain statuses were semantically correct; ADR-020's status
  is now expanded to match the file's closed local/mock evidence boundary.

No accepted ADR was deleted.
