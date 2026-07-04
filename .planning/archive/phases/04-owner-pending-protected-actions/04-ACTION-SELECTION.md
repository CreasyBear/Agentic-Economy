---
phase: 04
plan: 01
selectedActionSlug: contact-follow-up
status: selected
source: phase-2-inquiry-owner-inbox
---

# Phase 4 Action Selection

## Decision

| Field | Value |
|---|---|
| selectedActionName | Owner-approved customer contact follow-up request |
| selectedActionSlug | contact-follow-up |
| selectedActionPascal | ContactFollowUp |
| targetObject | One Phase 2 inquiry/source message for one source-owned business or service. |
| observedEvidenceRefs | `.planning/phases/02-human-inquiry-owner-inbox/02-SPEC.md` R2-R5 and R7; `.planning/phases/02-human-inquiry-owner-inbox/02-VERIFICATION.md` rows 2-7 and 15-18; `src/modules/inquiries/public.ts`; `src/modules/notification-outbox/public.ts`; `src/routes/owner.inquiries.$threadId.tsx`; `src/routes/admin.inquiries.tsx`. |
| allowedParameters | `contactName`, `contactChannel`, `messageSummary`, `sourceMessageRef`. No value, billing, booking, provider-market, or physical-world completion fields are part of the selected action. |
| requiredContext | Authenticated source-owned owner authority, business target, optional service target, inquiry/source message ref, source evidence ref, idempotency key, correlation ID, deadline, selected action slug, contract hash, policy hash, and owner consequence acknowledgement. |
| ownerDecisionModel | Owner must approve or reject the proposal after seeing target, scope, consequence, reversibility, deadline, proof expectation, and disabled reason. Rejection stops the attempt. Approval admits one gateway for one attempt only. |
| consequence | AE may record one contact follow-up attempt against the saved source message through the selected source-owned follow-up outbox boundary. No booking, quote, charge, response guarantee, or future-action authority is granted. |
| reversibility | Owner can reject before attempt, close the related inquiry, or an operator can mark no-repair after a failed/proof-gap attempt. No physical-world state is claimed as reversed. |
| deadline | Proposal carries a source-owned deadline; expired proposals cannot be approved or attempted. Current implementation fixtures use explicit `deadlineAt` values and policy classifies `expired` and `time_bound`. |
| proofExpectation | Source-owned receipt readback or explicit proof gap. Provider/internal result readback is evidence only and is not physical-world proof. |
| providerOrInternalBoundary | `source_owned_follow_up_outbox`: the Phase 2 notification/outbox style boundary records redacted readback, stable refs, payload hashes, and proof gaps. It is not owner-supplied URL egress and not provider authority. |
| timeoutRetryNoRepairPosture | Timeout, mismatch, provider unavailable, duplicate replay, expired gateway, disabled attempts, retry exhausted, and no-repair are typed readback states. Retries are bounded and idempotency/hash-bound. No autonomous retry storm is permitted. |
| copyClaimsAllowedAfterSuccess | "Owner-approved contact follow-up can be proposed, approved or rejected, attempted once, and reconstructed with a source-owned receipt or proof gap." Public/developer copy may say approval required only when source readback and support record permit it. |
| noMoneyAssurance | No Phase 5 money rail, checkout, billing rail, value balance, paid-priority, invoice, price, or money movement is part of this action. Those surfaces remain unavailable and out of scope for Phase 4. |

## Why This Action

Phase 2 already proves the product demand and source boundaries around human inquiries, owner review, notification/outbox readback, and operator reconstruction. A contact follow-up is the smallest consequential next action because it is adjacent to an existing customer message and can be attempted through source-owned readback. No booking, quote, money movement, provider-market, or provider authority is granted.

Phase 3 source evidence is non-mutating and explicitly withholds protected-action descriptors. It supports the "approval required" posture but does not provide a better first protected action class.

## Source Identifiers

| Purpose | Identifier |
|---|---|
| Propose selected action | `proposeContactFollowUpRequest` |
| Evaluate policy | `evaluateContactFollowUpPolicy` |
| List owner queue | `listOwnerContactFollowUpQueue` |
| Read proposal | `readContactFollowUpProposal` |
| Decide proposal | `decideContactFollowUpProposal` |
| Read receipt | `readContactFollowUpReceipt` |
| Read reconstruction | `readContactFollowUpReconstruction` |
| Create gateway admission | `createContactFollowUpGatewayAdmission` |
| Consume gateway admission | `consumeContactFollowUpGatewayAdmission` |
| Record attempt readback | `recordContactFollowUpAttemptReadback` |
| Retry attempt | `retryContactFollowUpAttempt` |
| Mark no-repair | `markContactFollowUpNoRepair` |
| Apply retention delete | `applyContactFollowUpRetentionDelete` |

These are selected-action-specific identifiers. This selection does not approve route-facing `proposeAction`, `evaluateActionPolicy`, `consumeActionGatewayAdmission`, `retryActionAttempt`, or an `actionClass` registry.

## Rejected Action Classes

| Rejected class | Reason |
|---|---|
| Broad action catalog | More than one action class would hide the Phase 4 authority proof behind platform shape. |
| Autonomous execution | Phase 4 requires owner approval before any attempt. |
| Provider market | No supply-side/provider-market evidence exists, and it would expand beyond one source-owned boundary. |
| Booking guarantee or quote acceptance | Phase 2 explicitly keeps inquiry separate from booking, quote acceptance, and response guarantee authority; those surfaces remain unavailable. |
| Physical-world guarantee | Source readback can record a receipt or proof gap only; it cannot prove the customer was reached or a job happened. |
| Money movement | No money rail, value balance, checkout, billing, or payment authorization is in scope. These surfaces remain unavailable in Phase 4. |
| Descriptor-as-authority | Phase 3 discovery files are read-only and cannot mint mutation authority. |
| Future request/provider surfaces | Request markets, hosted-agent systems, skill markets, generic gateways, action DSLs, and mutation protocols remain out of scope without source-owned one-action proof. |

## Stop Record

Evidence is sufficient for the narrow `contact-follow-up` slice above. If implementation discovers that source-owned owner authority, gateway admission, attempt readback, retention, support record, or public claim gating cannot be completed without broadening the action class, Phase 4 must stop instead of inventing a generic action platform.
