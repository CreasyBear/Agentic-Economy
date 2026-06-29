---
phase: 04
slug: owner-pending-protected-actions
status: action-selected-contact-follow-up
created: 2026-06-27
mode: shape-harden
---

# Phase 04 — UI Design Contract

UI appendix for the first protected-action production slice. Phase 4 renders exactly one observed, non-money action class selected from Phase 2/3 evidence. The UI exists to keep owner approval informed and reconstructable; it must not imply autonomous execution, payments, or a broad action platform.

## Design Authorities

- `.planning/phases/04-owner-pending-protected-actions/04-SPEC.md` owns the locked P4 requirements, reachable states, and must-nots.
- `.planning/phases/04-owner-pending-protected-actions/04-CONTEXT.md` owns the authority lifecycle, provider/readback boundary, and deferred scope.
- `.planning/phases/04-owner-pending-protected-actions/04-01-one-owner-approved-protected-action-PLAN.md` owns the execution package, selected-action prep, and closeout proof.
- `.planning/phases/02-05-PRODUCTION-MATURITY-CONTEXT.md` and `.planning/phases/02-05-PRODUCTION-MATURITY-PLAN.md` own the cross-phase production spine and bloat cuts.
- `.planning/FRONTEND-DESIGN-FRAMEWORK.md`, `DESIGN.md`, and `.impeccable/design.json` own AE shells, tokens, component seams, state-as-brand rules, Geist typography, command-ink/cool-field/signal-cobalt palette, focus, spacing, and no-default-shadcn discipline.

## Scope and Mode

| Field | Value |
|---|---|
| Mode | Shape + Harden for future implementation |
| Primary product job | An authorized owner reviews one proposed consequential non-money action, approves or rejects it, and can later understand the attempt result. |
| Primary users | Source-owned owner/manager; source-owned operator for reconstruction and repair/no-repair. |
| Product object | `ActionProposal` plus policy result, owner decision, gateway admission, provider/internal attempt, receipt/proof-gap, and reconstruction readback. |
| Entry condition | `04-ACTION-SELECTION.md` selects `contact-follow-up`, an owner-approved customer contact follow-up request tied to one Phase 2 inquiry/source message. |
| Non-goals | No autonomous execution, no payment/checkout/billing, no broad action catalog, no provider marketplace, no hosted agents, no request market, no MCP/OpenAPI/SDK mutation UI, no hidden approval. |

## Selected Action UI Contract

| Field | Value |
|---|---|
| selectedActionName | Owner-approved customer contact follow-up request |
| targetObject | One Phase 2 inquiry/source message for one source-owned business or service. |
| allowedParameters | `contactName`, `contactChannel`, `messageSummary`, `sourceMessageRef`. |
| consequence | Approving lets AE record one contact follow-up attempt against the saved source message through the `source_owned_follow_up_outbox` boundary. It does not book work, quote, charge, guarantee response, or approve future actions. |
| reversibility | The owner can reject before attempt, close the related inquiry, or an operator can mark no-repair after failed/proof-gap readback. No physical-world reversal is claimed. |
| deadline | The proposal carries a visible deadline. Expired proposals cannot be approved or attempted. |
| proofExpectation | Expected proof is a source-owned receipt readback or explicit proof gap. Provider/internal success is evidence only. |
| disabledApprovalCopy | Approval is unavailable for this contact follow-up: {reason}. No follow-up attempt has been made. |
| rejectReasonCopy | Reject this contact follow-up request and record why the saved source message should not be followed up. |
| noRepairCopy | Mark no-repair and record why this contact follow-up cannot be safely completed from source-owned evidence. |
| publicDeveloperApprovalRequiredCopy | Contact follow-up is owner-pending: a source-owned owner must approve the proposal before AE records one follow-up attempt, receipt, or proof gap. |

## Information Architecture and Route Map

Route names are planning handles. Implementation may mount them under the existing owner/admin shell, but the jobs, states, and copy below must remain intact.

| Surface | Primary user | Job | Surface contract |
|---|---|---|---|
| `/owner/actions` | Owner | See proposals that require a decision. | Queue grouped by `Review required`, `Expiring soon`, `Blocked`, and `Recently decided`; no future action catalog. |
| `/owner/actions/:proposalId` | Owner | Understand one contact follow-up proposal and approve or reject. | Detail page shows saved source message, allowed contact-follow-up parameters, consequence, reversibility, deadline, proof requirement, policy result, disabled reason, and source-owned owner context before controls. |
| `/owner/actions/:proposalId/receipt` | Owner | Read outcome after approval and contact follow-up attempt. | Receipt/readback page or panel reconstructs proposal -> policy -> owner decision -> gateway -> attempt -> receipt/proof-gap; no raw provider payloads. |
| `/admin/protected-actions` | Operator | Reconstruct and repair/no-repair action attempts. | Queue grouped by failed, proof-gap, stale, mismatched, disputed/reversed, retry available, and no-repair. |
| `/admin/protected-actions/:proposalId` | Operator | Inspect the complete chain safely. | Redacted evidence chain with correlation IDs, source hashes, disabled repair reasons, retry/no-repair controls, and audit refs. |
| Public/developer readback output | Builder/agent/customer | Learn whether the selected action is owner-pending. | Not a styled action UI. May say `approval required` only after route-tested source readback exists. |

Navigation: add no public nav item for protected actions. Owner nav may show `Action proposals` only after the selected action can create reviewable proposals. Admin nav may show `Protected actions` only to authorized operators.

## Key Flows

### Flow A — Review one selected action proposal

1. A proposal appears only after `proposeContactFollowUpRequest` stores a durable candidate from the contact follow-up allowlisted contract.
2. Owner opens the queue and sees status text, target object, deadline, and why owner review is required.
3. Owner opens detail. The first screen names the contact follow-up request, saved source message, allowed parameters, `source_owned_follow_up_outbox` boundary, reversibility, proof requirement, and what will not happen.
4. Approve/reject controls remain disabled until policy and owner authority are readable. Disabled state explains the exact reason.
5. Approval writes an owner decision and admits a one-use gateway before any provider/internal attempt. Rejection records reason/evidence and stops the attempt.

### Flow B — Attempt and receipt/proof-gap readback

1. After approval, UI shows `Attempt pending` from source state. Provider success copy remains unavailable without source-owned receipt readback.
2. The result becomes `Receipt recorded`, `Proof gap`, `Attempt failed`, `Timed out`, `Mismatched`, `Disputed/reversed`, or `No repair` with plain-language next action.
3. Owner can see the reconstruction chain without logs or provider dashboards.
4. Provider success remains unavailable as public copy; recorded source readback is evidence only, not physical-world proof.

### Flow C — Operator reconstruction and repair/no-repair

1. Operator opens the protected-action queue grouped by next action.
2. Detail shows proposal, policy, decision, gateway, attempt, outcome, audit, and redacted provider/internal evidence in order.
3. Retry is available only when source state says it is safe and idempotent. No-repair requires a reason and remains visible to the owner/operator.

## Reachable UI States

| Surface | Required states |
|---|---|
| Owner queue | loading, empty, review required, expiring soon, refused by policy, expired, wrong-owner/not-found, duplicate/stale proposal, long action/provider names, mobile 375px. |
| Owner detail | authority loading, authorized, forbidden/not-found, policy review-required, refused, expired, missing proof, external-authority required, time-bound warning, disabled reason, approve pending, reject pending, validation error, concurrent decision already made. |
| Attempt/readback | gateway admitted, gateway expired, attempt pending, provider timeout, provider failure, mismatch, proof_gap, receipt recorded, disputed, reversed, repair available, retry pending, retry failed, no-repair. |
| Operator reconstruction | empty, stale, missing evidence, failed, proof-gap, duplicate admission, mismatched attempt, provider unavailable, retry available, retry exhausted, no-repair, redacted evidence, correlation/audit filters empty/populated. |
| Discovery copy | unsupported, approval-required, owner-pending, stale/degraded readback, absent when implementation is not route-tested. |

Every state must render text, not color alone. Raw enum labels are allowed only in admin diagnostics beside a plain-language label.

## Copy Table

| Element | Copy |
|---|---|
| Queue heading | Contact follow-up requests needing owner review |
| Queue empty | No contact follow-up requests need review. New proposals appear here only after the contact follow-up contract is safely policy-checked. |
| Detail heading | Review this contact follow-up request |
| Consequence summary | Approving lets AE record one contact follow-up attempt against the saved source message through the source-owned follow-up outbox. It does not approve future actions, bookings, payments, or autonomous execution. |
| Proof requirement | Expected proof: source-owned receipt or proof gap from the follow-up outbox readback. If proof is incomplete, AE will show a proof gap instead of claiming success. |
| Approve CTA | Approve contact follow-up |
| Reject CTA | Reject contact follow-up |
| Disabled approval | Approval is unavailable for this contact follow-up: {reason}. No follow-up attempt has been made. |
| Expired state | This proposal expired before approval. No action was attempted. |
| Refused state | Policy refused this proposal. No provider attempt was made. |
| Attempt pending | The approved contact follow-up is being attempted once. Keep this page open or return later for the receipt. |
| Receipt success | Receipt recorded from source-owned follow-up outbox readback. Review the reconstruction before relying on the outcome. |
| Proof gap | AE recorded the contact follow-up attempt, but proof is incomplete. Treat the outcome as unresolved until repaired or marked no-repair. |
| Provider failure | The follow-up outbox attempt failed. No autonomous retry will run without the recorded retry policy. |
| Operator no-repair | Mark no-repair and record why this contact follow-up cannot be safely completed. |

Copy rules:
- Say `proposal`, `owner review`, `approval required`, `attempt`, `receipt`, `proof gap`, `reconstruction`, and `no repair`.
- No autonomous, auto-executed, agent-executed, direct-execute, callable, booked, paid, payment-required, wallet, settled, guaranteed, or provider-confirmed copy is allowed unless the exact source readback supports that narrower word.
- Never hide consequence, reversibility, deadline, proof requirement, or disabled reason behind tooltip-only copy.

## Component Contract

| Pattern | Required component / behavior |
|---|---|
| Shells | Use `AeOwnerShell` and `AeAdminShell`; public shell gets no protected-action nav. |
| Page headers | `AePageHeader` with status-aware subtitle and one primary action area only. |
| Queues | `AeQueueList`/`AeQueueRow` grouped by next action; use `Table` only for dense operator comparison. |
| Status | `AeStatusBadge` plus description from `getStatusPresentation`; no color-only state. |
| Proposal detail | Full `Card` composition for summary, policy, consequence, owner decision, and evidence chain sections. |
| Consequence disclosure | `AeReviewBlock` or equivalent card before approve/reject; inline first, `AlertDialog` only if the selected action is not safely reversible. |
| Forms | Reject/no-repair reason fields use persistent labels, descriptions, `aria-invalid`, preserved values, and field-connected errors. |
| Attempt timeline | Use an ordered evidence chain built from audit/readback events; promote to shared `AeEvidenceChain` only if reused by P5/operator surfaces. |
| Feedback | `AeAlert`, `AeEmptyState`, `AeLoadingState`, and `AeErrorState`; no raw spinners or custom empty divs. |
| Buttons | `Button`; loading uses spinner plus stable label and disabled state. Approve and reject are actions, not links. |

Visual rules: use DESIGN.md tokens only; reserve signal cobalt for the current primary action/focus; command-ink panels are allowed for high-stakes reconstruction; no colored side stripes, fake dashboards, or decorative action cards.

## Accessibility and Responsive Contract

- 375px width is required for queue, detail, receipt, and operator reconstruction.
- Critical detail order on mobile: status, action name, target object, consequence, deadline, proof requirement, controls, reconstruction.
- Approve/reject controls have at least 44px hit area where practical and never below 40px.
- Keyboard order follows visual order; focus moves to the first changed status/error after approve, reject, retry, or no-repair.
- Disabled controls include visible reason text and `aria-describedby` linkage.
- Owner decision forms preserve input after recoverable errors and announce errors accessibly.
- Destructive or irreversible outcomes name object, scope, consequence, reversibility, and audit/no-repair impact before confirmation.
- Long action names, provider names, target names, reason text, and correlation IDs wrap without truncating required meaning; IDs use Geist Mono/tabular numbers.
- Reduced motion disables non-essential state transitions; loading labels remain stable.

## Rendered Verification Matrix

Implementation closeout must attach compact 375px and wide viewport evidence for these surfaces. Source inspection alone is not visual verification.

| Surface | Compact evidence | Wide evidence | States to show | Interaction proof |
|---|---|---|---|---|
| Owner queue | Required | Required | empty, populated review-required, expiring, forbidden/not-found | keyboard enter to detail, focus visible |
| Owner detail | Required | Required | review-required, refused, expired, disabled reason, approve pending, reject pending | tab order, approve/reject busy labels, error focus |
| Receipt/readback | Required | Required | attempt pending, receipt recorded, proof gap, provider failure | reconstruction landmarks, copy not overclaiming proof |
| Operator reconstruction | Required | Required | stale/missing, retry available, retry exhausted, no-repair, redacted provider evidence | retry/no-repair keyboard path, reason validation |
| Discovery/debug copy | If rendered | If rendered | unsupported, approval-required, stale/degraded | no direct-execute/payment/autonomy wording |

## Bloat and Prohibition Clauses

- No UI may list multiple action classes unless the selection record and phase scope change. One selected action class only.
- No `Run now`, `Execute automatically`, `Agent will handle it`, or direct provider-action CTA.
- No checkout, payment, wallet, credits, Stripe, Connect, x402, settlement, billing, or `paymentRequired` UI in Phase 4.
- No provider marketplace, action marketplace, broad action catalog, skills, hosted agents, request market, DSL, or generic action-builder screen.
- No MCP/OpenAPI/SDK/plugin mutation surface. Optional descriptors remain proposal-only and approval-required after server-enforced route tests.
- No future nav placeholders, disabled tabs, teaser banners, screenshots, or dashboard theatre for later autonomous/money products.

## Next Implementation Handoff

Before implementation, create the action-selection record from P2/P3 evidence. The first UI task should compose the owner queue/detail and operator reconstruction from existing AE shells and status/form/feedback primitives, install only imported official shadcn components, and keep every copy claim tied to source-owned readback.
