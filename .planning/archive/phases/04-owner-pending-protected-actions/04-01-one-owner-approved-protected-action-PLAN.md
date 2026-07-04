---
phase: 04
plan: 01
type: execution
slug: one-owner-approved-protected-action
status: ready-after-p2-p3-evidence
wave: 04
autonomous: true
runtime_autonomy: forbidden
depends_on:
  - .planning/phases/02-human-inquiry-owner-inbox/02-01-human-inquiry-owner-inbox-production-PLAN.md
  - .planning/phases/03-standard-agent-builder-discovery/03-01-standard-agent-builder-discovery-production-PLAN.md
  - .planning/phases/04-owner-pending-protected-actions/04-SPEC.md
  - .planning/phases/04-owner-pending-protected-actions/04-CONTEXT.md
  - .planning/phases/04-owner-pending-protected-actions/04-UI-SPEC.md
  - .planning/phases/02-05-PRODUCTION-MATURITY-REVIEWS.md
  - .planning/SECURITY-SPEC.md
  - .planning/GTM-READINESS.md
requirements: [R1, R2, R3, R4, R5, R6, R7, R8]
files_modified:
  - .planning/phases/04-owner-pending-protected-actions/04-ACTION-SELECTION.md
  - .planning/phases/04-owner-pending-protected-actions/04-UI-SPEC.md
  - .planning/GTM-READINESS.md
  - .planning/SECURITY-SPEC.md
  - convex/schema.ts
  - convex/protectedActions.ts
  - src/modules/protected-action/public.ts
  - src/modules/protected-action/internal/selected-action-contract.ts
  - src/modules/protected-action/internal/policy.ts
  - src/modules/protected-action/internal/gateway.ts
  - src/modules/protected-action/internal/attempt-readback.ts
  - src/modules/protected-action/internal/reconstruction.ts
  - src/modules/protected-action/internal/retention.ts
  - src/modules/protected-action/internal/support.ts
  - src/modules/protected-action/internal/validators.ts
  - src/modules/observability/public.ts
  - src/modules/observability/internal/audit.ts
  - src/modules/observability/internal/funnel.ts
  - src/modules/observability/internal/operator-controls.ts
  - src/lib/ui/status-presentation.ts
  - src/lib/ui/contract-scans.ts
  - src/lib/ui/copy.ts
  - src/routes/owner.actions.tsx
  - src/routes/owner.actions.$proposalId.tsx
  - src/routes/owner.actions.$proposalId.receipt.tsx
  - src/routes/admin.protected-actions.tsx
  - src/routes/admin.protected-actions.$proposalId.tsx
  - tests/unit/protected-actions/selected-action-contract.test.ts
  - tests/unit/protected-actions/selected-action-policy.test.ts
  - tests/unit/protected-actions/selected-action-gateway.test.ts
  - tests/unit/protected-actions/selected-action-retention.test.ts
  - tests/integration/protected-actions/selected-action-attempt-readback.test.ts
  - tests/e2e/protected-actions/selected-action-owner-flow.spec.ts
  - tests/e2e/a11y/protected-actions/selected-action-a11y.spec.ts
  - tests/types/protected-actions-contracts.test.ts
  - tests/copy/phase4-protected-action-claims.test.ts
  - tests/ui-contract/protected-action-status-copy.test.ts
  - tests/seo/public-business-seo.test.ts
  - tests/imports/source-mining.test.ts
must_haves:
  truths:
    - statement: P4 ships exactly one observed, non-money, owner-approved protected action path.
      status: resolved
      verification: Objective, non-goals, action-selection dependency, and tasks 04-01-T01 through 04-01-T09 limit scope to one selected action.
    - statement: Owner approval, gateway admission, provider attempt, receipt/proof-gap, and reconstruction are source-owned and audit-backed.
      status: resolved
      verification: P4 task acceptance criteria require policy, gateway, proof, retry, retention, and operator reconstruction evidence.
  prohibitions:
    - statement: P4 must not add autonomous execution, broad action catalogs, hosted agents, request market, quote acceptance, booking guarantee, payment, wallet, or provider-as-authority behavior.
      status: resolved
      verification: P4 non-goals and negative claim/source scans reject those surfaces until later phases own them.
    - statement: P4 must not allow provider attempts without durable source-owned proposal, policy, owner decision, gateway, audit, and receipt/proof-gap chain.
      status: resolved
      verification: P4 stop conditions and action gateway tests reject direct provider authority.
  artifacts:
    - path: .planning/phases/04-owner-pending-protected-actions/04-SPEC.md
      provides: P4 one-owner-approved protected-action product and boundary requirements.
    - path: .planning/phases/04-owner-pending-protected-actions/04-UI-SPEC.md
      provides: P4 owner/operator surface contract before action selection.
  key_links:
    - from: .planning/phases/04-owner-pending-protected-actions/04-01-one-owner-approved-protected-action-PLAN.md
      to: exactly one observed, non-money
      via: P4 objective limits the protected-action slice.
    - from: .planning/SECURITY-SPEC.md
      to: protected_action.approved
      via: P4 audit events are governed by the shared security event union.
    - from: .planning/GTM-READINESS.md
      to: protected_action_proposed
      via: P4 funnel evidence uses GTM canonical protected-action events.
---

# Phase 4 Plan — One Owner-Approved Protected Action Production Slice

## Objective

Ship exactly one observed, non-money, owner-approved protected action class from Phase 2 or Phase 3 evidence. The slice must support proposal, policy classification, owner approve or reject, one-use gateway admission, provider or internal attempt, receipt or proof-gap readback, retention and delete posture, operator reconstruction, support kill rules, and public or developer wording that says approval required only when source state proves it.

## Operating rule

Phase 4 starts with a decision record. No route, gateway, provider attempt, public claim, or reusable action surface may be built until `04-ACTION-SELECTION.md` names the selected action, target object, allowed parameters, consequence, reversibility, deadline, proof expectation, provider or internal boundary, no-money assurance, and rejected alternatives.

The selected action controls the public seam names. Do not ship route-facing functions named `proposeAction`, `evaluateActionPolicy`, `consumeActionGatewayAdmission`, `retryActionAttempt`, or a generic `actionClass` registry. After the record exists, use action-specific exports such as `propose{SelectedActionPascal}`, `evaluate{SelectedActionPascal}Policy`, `decide{SelectedActionPascal}Proposal`, and `read{SelectedActionPascal}Reconstruction`.

## Non-goals

- No autonomous protected execution.
- No broad action catalog, request market, skill marketplace, hosted agents, provider marketplace, generic action gateway, action DSL, or one-provider adapter built for future classes.
- No MCP, OpenAPI, SDK, plugin, or protocol mutation authority. Optional descriptors, if any, remain proposal-only and approval-required after server-enforced route tests.
- No money movement, billing, settlement, wallet, credits, balance, payment authorization, Stripe, Connect, x402, checkout, or `paymentRequired=true`.
- No physical-world proof claims beyond recorded provider or internal readback and explicit proof-gap posture.

## Review findings covered here

- H1: this file is rewritten as a GSD-executable plan with real YAML frontmatter, XML tasks, read-first lists, acceptance criteria, verification, must-haves, and produced artifacts.
- M1: P4 retention, export, delete, tombstone, private evidence access, and durable audit-hash behavior are explicit in Task 03 and must-haves. P2 and P5 retention remain owned by their phase plans.
- M3: Task 02 blocks route work until `04-UI-SPEC.md` is amended with selected-action-specific name, parameters, consequence, reversibility, deadline, proof, disabled, reject, no-repair, and public/developer approval-required wording.
- M5: Task 04 removes the generic gateway shape by requiring action-specific route-facing functions and keeping one-use gateway admission internal to the chosen action.
- M7: Task 07 adds P4 support-load rollups through `protected_action_retry_exhausted` and `protected_action_no_repair_marked` or source-equivalent audit-backed queries.
- M10: Task 07 adds `capabilityLaunchSupportRecord` before any P4 claim can go live.
- M12: `<verification>` includes `npm run test:types`, `npm run test:ts-standards`, and `npm run test:seo` from current `package.json`.
- H2, H7, H9, H10, and H11 are covered for P4 surfaces by Tasks 03, 06, 07, and 08. Cross-phase P2, P3, and P5 portions remain deferred to their phase plans.
- H3, H4, H5, H6, H8, H12, M2, M4, M6, M8, M9, M11, M13, and M14 are not P4 implementation work and must not expand this phase.

  <task id="04-01-T01" wave="1" title="Select one evidence-backed protected action and lock its identifiers">
    <name>Select one evidence-backed protected action and lock its identifiers</name>
    <read_first>
      .planning/phases/04-owner-pending-protected-actions/04-SPEC.md
      .planning/phases/04-owner-pending-protected-actions/04-CONTEXT.md
      .planning/phases/02-human-inquiry-owner-inbox/02-SPEC.md
      .planning/phases/02-human-inquiry-owner-inbox/02-CONTEXT.md
      .planning/phases/03-standard-agent-builder-discovery/03-SPEC.md
      .planning/phases/03-standard-agent-builder-discovery/03-CONTEXT.md
      .planning/phases/02-05-PRODUCTION-MATURITY-REVIEWS.md
      .planning/ROADMAP.md
      .planning/SECURITY-SPEC.md
      .planning/GTM-READINESS.md
    </read_first>
    <files>
      <item>Use phase frontmatter `files_modified` plus task-local action paths; do not edit files outside those lists.</item>
    </files>
    <action>
      Create `.planning/phases/04-owner-pending-protected-actions/04-ACTION-SELECTION.md`. The record must include `selectedActionName`, `selectedActionSlug`, `selectedActionPascal`, `targetObject`, `observedEvidenceRefs`, `allowedParameters`, `requiredContext`, `ownerDecisionModel`, `consequence`, `reversibility`, `deadline`, `proofExpectation`, `providerOrInternalBoundary`, `timeoutRetryNoRepairPosture`, `copyClaimsAllowedAfterSuccess`, `noMoneyAssurance`, and `rejectedActionClasses`.
      Select exactly one non-money action class from Phase 2 inquiry or Phase 3 discovery evidence. If evidence is insufficient, write a stop record instead of inventing a platform.
      The decision record must also name the action-specific source identifiers to use later: `propose{SelectedActionPascal}`, `evaluate{SelectedActionPascal}Policy`, `listOwner{SelectedActionPascal}Queue`, `read{SelectedActionPascal}Proposal`, `decide{SelectedActionPascal}Proposal`, `read{SelectedActionPascal}Receipt`, and `read{SelectedActionPascal}Reconstruction`.
    </action>
    <acceptance_criteria>
      `.planning/phases/04-owner-pending-protected-actions/04-ACTION-SELECTION.md` exists and contains all fields named in this task.
      `observedEvidenceRefs` points to at least one Phase 2 or Phase 3 source artifact and explains why the chosen action is the smallest evidence-backed action.
      `rejectedActionClasses` explicitly rejects broad catalogs, autonomous execution, provider marketplaces, booking guarantees, physical-world guarantees, money movement, and descriptor-as-authority.
      The record contains no selected action that needs Stripe, Connect, x402, wallet, credits, balance, settlement, checkout, or payment authorization.
      The record contains concrete action-specific function names and does not approve route-facing `proposeAction`, `evaluateActionPolicy`, `consumeActionGatewayAdmission`, `retryActionAttempt`, or an `actionClass` registry.
    </acceptance_criteria>
    <verify>
      <command>Run the plan closeout command block entries that cover this task and record exact output in closeout evidence.</command>
    </verify>
    <done>
      <criterion>Every acceptance criterion in this task is source-proven, tested, and free of stop-condition violations.</criterion>
    </done>
  </task>

  <task id="04-01-T02" wave="1" title="Amend the UI spec after selection and before route work">

    <name>Amend the UI spec after selection and before route work</name>
    <read_first>
      .planning/phases/04-owner-pending-protected-actions/04-ACTION-SELECTION.md
      .planning/phases/04-owner-pending-protected-actions/04-UI-SPEC.md
      .planning/phases/04-owner-pending-protected-actions/04-SPEC.md
      .planning/FRONTEND-DESIGN-FRAMEWORK.md
      DESIGN.md
      .impeccable/design.json
      src/components/ae/layout/AePublicShell.tsx
      src/components/ae/layout/AeAdminShell.tsx
      src/components/ae/forms/AeReviewBlock.tsx
      src/components/ae/status/AeStatusBadge.tsx
      src/lib/ui/status-presentation.ts
    </read_first>

    <files>

      <item>Use phase frontmatter `files_modified` plus task-local action paths; do not edit files outside those lists.</item>

    </files>
    <action>
      Update `04-UI-SPEC.md` before creating or editing any `src/routes/owner.actions*` or `src/routes/admin.protected-actions*` files. Replace generic selected-action copy with the chosen action name, target object, allowed parameters, consequence, reversibility, deadline, proof expectation, disabled reasons, reject reason copy, no-repair copy, and public/developer `approval required` wording from `04-ACTION-SELECTION.md`.
      Keep the existing route handles from the UI spec, but every visible label, CTA, state explanation, and rendered verification row must name or constrain the selected action rather than implying a reusable action platform.
    </action>
    <acceptance_criteria>
      `04-UI-SPEC.md` contains `selectedActionName`, `targetObject`, `allowedParameters`, `consequence`, `reversibility`, `deadline`, `proofExpectation`, `disabledApprovalCopy`, `rejectReasonCopy`, `noRepairCopy`, and `publicDeveloperApprovalRequiredCopy` values derived from `04-ACTION-SELECTION.md`.
      The copy table no longer relies on the phrases `this selected action` or `recorded provider or internal boundary` without also naming the chosen action and boundary.
      The rendered verification matrix includes compact 375px and wide evidence requirements for owner queue, owner detail, receipt/readback, operator reconstruction, and discovery/debug copy for the selected action.
      No route work starts unless the UI spec amendment is complete.
      The UI spec still forbids autonomous, direct-execute, callable, booking, payment, wallet, settled, guaranteed, provider marketplace, and broad action catalog wording.
    </acceptance_criteria>

    <verify>

      <command>Run the plan closeout command block entries that cover this task and record exact output in closeout evidence.</command>

    </verify>

    <done>

      <criterion>Every acceptance criterion in this task is source-proven, tested, and free of stop-condition violations.</criterion>

    </done>
  </task>

  <task id="04-01-T03" wave="2" title="Add source state, audit, retention, delete, and operator controls">

    <name>Add source state, audit, retention, delete, and operator controls</name>
    <read_first>
      .planning/phases/04-owner-pending-protected-actions/04-ACTION-SELECTION.md
      .planning/phases/04-owner-pending-protected-actions/04-SPEC.md
      .planning/SECURITY-SPEC.md
      .planning/ENGINEERING-STANDARDS.md
      src/modules/observability/public.ts
      src/modules/observability/internal/audit.ts
      src/modules/observability/internal/funnel.ts
      src/modules/observability/internal/operator-controls.ts
      src/modules/security/public.ts
      src/modules/common/stable-hash.ts
      src/modules/common/ids.ts
      convex/schema.ts
      convex/observability.ts
    </read_first>

    <files>

      <item>Use phase frontmatter `files_modified` plus task-local action paths; do not edit files outside those lists.</item>

    </files>
    <action>
      Add Phase 4 source state without creating future action classes. Required tables or equivalent Convex state are `protectedActionProposals`, `protectedActionPolicyDecisions`, `protectedActionOwnerDecisions`, `protectedActionGatewayAdmissions`, `protectedActionAttempts`, `protectedActionReceipts`, `protectedActionPrivateEvidenceRefs`, and `protectedActionSupportRecords`.
      Extend the existing observability unions, not a parallel log, with P4 audit events: `protected_action.proposed`, `protected_action.proposal_rejected`, `protected_action.policy_evaluated`, `protected_action.approved`, `protected_action.rejected`, `protected_action.expired`, `protected_action.gateway_admitted`, `protected_action.gateway_consumed`, `protected_action.gateway_replay_rejected`, `protected_action.attempted`, `protected_action.attempt_succeeded`, `protected_action.attempt_failed`, `protected_action.retry_attempted`, `protected_action.retry_exhausted`, `protected_action.receipt_recorded`, `protected_action.proof_gap_recorded`, `protected_action.no_repair_marked`, `protected_action.callback_received`, and `protected_action.callback_rejected`.
      Add operator controls `protected_actions_enabled` and `protected_action_attempts_enabled`. Disabling `protected_actions_enabled` blocks new proposals and public/action discovery claims while preserving existing queue readback, reject, close, no-repair, and audit. Disabling `protected_action_attempts_enabled` blocks gateway consumption, provider/internal attempts, and retries while preserving proposal, approval, receipt, proof-gap, and no-repair reconstruction.
      Define retention class for protected-action proposals, approvals, receipts, private evidence refs, and provider/internal attempts. Raw downstream responses must be discarded after hash and normalization unless a private evidence ref with explicit TTL exists. Export/delete must redact private payload refs and preserve lawful audit hashes, reason codes, proposal hash, policy hash, owner decision hash, gateway hash, attempt hash, receipt hash, and tombstone state for reconstruction.
    </action>
    <acceptance_criteria>
      `convex/schema.ts` has Phase 4 tables or fields for proposal, policy, owner decision, gateway admission, attempt, receipt/proof-gap, private evidence ref, support record, and audit correlation IDs.
      `src/modules/observability/public.ts` includes every P4 audit event named in this task and keeps them in the existing `AuditEventTypeValues` union.
      `src/modules/observability/public.ts` includes `protected_actions_enabled` and `protected_action_attempts_enabled` in `OperatorControlKeyValues`.
      Unit tests prove disabled operator controls block new proposals, claims, gateway consumption, provider/internal attempts, and retries while preserving readback, reject, close, no-repair, audit, and reconstruction.
      `src/modules/protected-action/internal/retention.ts` or equivalent module names retention class, TTL behavior for private evidence refs, export behavior, delete behavior, tombstone behavior, preserved audit hashes, and owner/admin/operator private evidence access policy.
      `tests/unit/protected-actions/selected-action-retention.test.ts` proves raw provider/internal evidence is not retained forever by default, delete redacts private refs, and reconstruction still shows tombstone plus audit hashes.
    </acceptance_criteria>

    <verify>

      <command>Run the plan closeout command block entries that cover this task and record exact output in closeout evidence.</command>

    </verify>

    <done>

      <criterion>Every acceptance criterion in this task is source-proven, tested, and free of stop-condition violations.</criterion>

    </done>
  </task>

  <task id="04-01-T04" wave="3" title="Implement the action-specific proposal and policy seam">

    <name>Implement the action-specific proposal and policy seam</name>
    <read_first>
      .planning/phases/04-owner-pending-protected-actions/04-ACTION-SELECTION.md
      .planning/phases/04-owner-pending-protected-actions/04-SPEC.md
      .planning/phases/04-owner-pending-protected-actions/04-CONTEXT.md
      .planning/ENGINEERING-STANDARDS.md
      src/modules/catalog/public.ts
      src/modules/business/public.ts
      src/modules/security/public.ts
      src/modules/observability/public.ts
      src/modules/common/result.ts
      src/modules/common/stable-hash.ts
      src/modules/common/ids.ts
      convex/protectedActions.ts
      convex/schema.ts
    </read_first>

    <files>

      <item>Use phase frontmatter `files_modified` plus task-local action paths; do not edit files outside those lists.</item>

    </files>
    <action>
      Create `src/modules/protected-action/public.ts` and internal files for the chosen action. Export only action-specific route-facing functions named from `04-ACTION-SELECTION.md`: `propose{SelectedActionPascal}`, `evaluate{SelectedActionPascal}Policy`, `listOwner{SelectedActionPascal}Queue`, `read{SelectedActionPascal}Proposal`, `decide{SelectedActionPascal}Proposal`, `read{SelectedActionPascal}Receipt`, and `read{SelectedActionPascal}Reconstruction`.
      The proposal contract must store actor principal, business or service target, owner context, canonical contract hash, idempotency key, correlation ID, allowed parameters, selected action slug, deadline, reversibility, proof expectation, and audit event. It must reject unknown action slug, invalid target, suppressed target, untrusted parameter key, duplicate same-key different-body, replay with mismatched hash, wrong actor, and missing required context.
      Policy evaluation must classify proposals as review-required, refused, expired, proof-gap, missing-proof, external-authority, or time-bound as applicable. Policy evaluation must have no provider or internal side effects.
    </action>
    <acceptance_criteria>
      No exported route-facing function is named `proposeAction`, `evaluateActionPolicy`, `listOwnerActionQueue`, `readActionProposal`, `decideActionProposal`, `consumeActionGatewayAdmission`, `recordActionAttemptReadback`, `retryActionAttempt`, or `markActionNoRepair`.
      The selected action module exposes exactly one selected action contract and no registry, DSL, provider plug-in surface, or multiple-action extension point.
      `tests/unit/protected-actions/selected-action-contract.test.ts` covers valid proposal, unknown action slug, invalid target, suppressed target, untrusted parameter key, duplicate same-key different-body, replay with mismatched hash, wrong actor, missing required context, idempotent same-body replay, and audit write.
      `tests/unit/protected-actions/selected-action-policy.test.ts` covers review-required, refused, expired, missing-proof, external-authority, time-bound, and proof-gap policy states and proves no attempt or provider/internal readback row is created before owner approval.
      Type tests prove selected action statuses and result codes are literal unions, validator-inferred types equal exported domain types, and route DTOs do not widen literals.
    </acceptance_criteria>

    <verify>

      <command>Run the plan closeout command block entries that cover this task and record exact output in closeout evidence.</command>

    </verify>

    <done>

      <criterion>Every acceptance criterion in this task is source-proven, tested, and free of stop-condition violations.</criterion>

    </done>
  </task>

  <task id="04-01-T05" wave="4" title="Add one-use gateway, attempt boundary, and reconstruction readback">

    <name>Add one-use gateway, attempt boundary, and reconstruction readback</name>
    <read_first>
      .planning/phases/04-owner-pending-protected-actions/04-ACTION-SELECTION.md
      .planning/phases/04-owner-pending-protected-actions/04-SPEC.md
      .planning/SECURITY-SPEC.md
      src/modules/protected-action/public.ts
      src/modules/protected-action/internal/selected-action-contract.ts
      src/modules/protected-action/internal/policy.ts
      src/modules/observability/public.ts
      src/modules/security/public.ts
      convex/protectedActions.ts
      convex/schema.ts
    </read_first>

    <files>

      <item>Use phase frontmatter `files_modified` plus task-local action paths; do not edit files outside those lists.</item>

    </files>
    <action>
      Keep gateway functions internal to the selected action. Implement `create{SelectedActionPascal}GatewayAdmission`, `consume{SelectedActionPascal}GatewayAdmission`, `record{SelectedActionPascal}AttemptReadback`, `retry{SelectedActionPascal}Attempt`, and `mark{SelectedActionPascal}NoRepair` as internal or operator-only functions, not public route-facing proposal APIs.
      Gateway admission must bind proposal hash, policy hash, contract hash, owner decision hash, expiration, idempotency key, selected action slug, and correlation ID. Admission is consumed atomically before a provider or internal attempt. Duplicate, stale, expired, concurrent, wrong-owner, disabled-control, and replay attempts become typed readback states.
      Provider or internal egress must be selected-action-specific, allowlisted, timeout-capped, body-capped, credential-redacted, and not owner-URL-driven. Callback support exists only if the selected provider supports signed callbacks; callbacks are evidence only and bind to existing attempt refs.
      Reconstruction readback must show actor, proposal, policy, owner decision, gateway, attempt, outcome, receipt/proof-gap, dispute or reversal posture, audit events, private evidence redaction state, retry availability, and no-repair reason without reading logs or provider dashboards.
    </action>
    <acceptance_criteria>
      `tests/unit/protected-actions/selected-action-gateway.test.ts` proves no attempt without valid owner approval, one-use admission, expired admission rejection, stale proposal rejection, duplicate replay rejection, concurrent consume race handling, disabled attempt control behavior, and hash-bound admission.
      `tests/integration/protected-actions/selected-action-attempt-readback.test.ts` covers selected provider/internal success, timeout, mismatch, provider failure, callback duplicate if callbacks exist, proof gap, bounded retry, retry exhausted, reversal or dispute posture, and no-repair.
      Attempt state never mutates source truth without proposal, policy, owner decision, gateway, audit, and receipt/proof-gap chain.
      Provider success is stored as evidence and cannot be presented as physical-world proof unless the selected action record named that proof and the source readback exists.
      Reconstruction readback returns every chain segment and explicit missing, stale, failed, proof-gap, successful, disputed/reversed, retry-available, retry-exhausted, and no-repair states.
    </acceptance_criteria>

    <verify>

      <command>Run the plan closeout command block entries that cover this task and record exact output in closeout evidence.</command>

    </verify>

    <done>

      <criterion>Every acceptance criterion in this task is source-proven, tested, and free of stop-condition violations.</criterion>

    </done>
  </task>

  <task id="04-01-T06" wave="5" title="Build owner and operator surfaces for the selected action">

    <name>Build owner and operator surfaces for the selected action</name>
    <read_first>
      .planning/phases/04-owner-pending-protected-actions/04-ACTION-SELECTION.md
      .planning/phases/04-owner-pending-protected-actions/04-UI-SPEC.md
      .planning/phases/04-owner-pending-protected-actions/04-SPEC.md
      src/modules/protected-action/public.ts
      src/components/ae/layout/AePublicShell.tsx
      src/components/ae/layout/AeAdminShell.tsx
      src/components/ae/layout/AePageHeader.tsx
      src/components/ae/forms/AeReviewBlock.tsx
      src/components/ae/feedback/AeEmptyState.tsx
      src/components/ae/status/AeStatusBadge.tsx
      src/components/ae/readback/AeAdminReadbackPanel.tsx
      src/lib/ui/status-presentation.ts
    </read_first>

    <files>

      <item>Use phase frontmatter `files_modified` plus task-local action paths; do not edit files outside those lists.</item>

    </files>
    <action>
      Add owner routes `src/routes/owner.actions.tsx`, `src/routes/owner.actions.$proposalId.tsx`, and `src/routes/owner.actions.$proposalId.receipt.tsx`. Add operator routes `src/routes/admin.protected-actions.tsx` and `src/routes/admin.protected-actions.$proposalId.tsx`.
      The owner queue must render empty, review-required, expiring, refused, expired, wrong-owner/not-found, duplicate/stale, and long selected-action names. The owner detail must show selected action name, target object, allowed parameters, consequence, reversibility, deadline, proof requirement, policy result, disabled reason, approve/reject controls, pending states, and validation errors before any approval is possible.
      The receipt and operator screens must render attempt pending, receipt recorded, proof gap, provider failure, timeout, mismatch, disputed, reversed, retry available, retry exhausted, no-repair, missing evidence, stale evidence, redacted evidence, correlation ID, and audit refs. Controls must be keyboard reachable, focus-managed, and accessible at 375px and wide widths.
    </action>
    <acceptance_criteria>
      Owner routes import only UI components, generated Convex client/hooks intended for routes, and `src/modules/protected-action/public.ts`; routes do not import provider SDKs, `convex/schema`, Convex internals, module private files, or browser-supplied owner/business authority.
      `src/lib/ui/status-presentation.ts` includes P4 statuses needed by the UI spec and exposes exhaustive presentation maps with plain-language labels.
      `tests/e2e/protected-actions/selected-action-owner-flow.spec.ts` covers queue empty/populated, detail, approve, reject, disabled, expired, wrong-owner/not-found, concurrent decision, receipt, proof gap, provider failure, no-repair, and public/developer approval-required copy.
      `tests/e2e/a11y/protected-actions/selected-action-a11y.spec.ts` covers mobile 375px, keyboard order, focus movement after approve/reject/retry/no-repair, aria-described disabled reasons, preserved form values after recoverable errors, and non-color-only state text.
      Screens show no future action catalog, no direct provider execute CTA, no payment UI, and no teaser nav for later autonomous or money products.
    </acceptance_criteria>

    <verify>

      <command>Run the plan closeout command block entries that cover this task and record exact output in closeout evidence.</command>

    </verify>

    <done>

      <criterion>Every acceptance criterion in this task is source-proven, tested, and free of stop-condition violations.</criterion>

    </done>
  </task>

  <task id="04-01-T07" wave="5" title="Add support record, funnel readbacks, operator kill rules, and claim disable path">

    <name>Add support record, funnel readbacks, operator kill rules, and claim disable path</name>
    <read_first>
      .planning/phases/04-owner-pending-protected-actions/04-ACTION-SELECTION.md
      .planning/GTM-READINESS.md
      .planning/SECURITY-SPEC.md
      src/modules/observability/public.ts
      src/modules/observability/internal/funnel.ts
      src/modules/observability/internal/operator-controls.ts
      src/modules/protected-action/public.ts
      src/modules/protected-action/internal/support.ts
      src/lib/ui/copy.ts
      src/lib/ui/contract-scans.ts
    </read_first>

    <files>

      <item>Use phase frontmatter `files_modified` plus task-local action paths; do not edit files outside those lists.</item>

    </files>
    <action>
      Add `capabilityLaunchSupportRecord` for the selected P4 action. It must name primary owner, backup owner, admin/operator contact, supported channels, launch stage, capacity threshold, backlog-age threshold, phase incidents considered blocking, claim-disable path, per-channel kill rules, and next review date.
      Add or bind P4 funnel/support events: `protected_action_proposed`, `protected_action_policy_denied`, `protected_action_approved`, `protected_action_rejected`, `protected_action_attempted`, `protected_action_receipt_viewed`, `protected_action_retry_exhausted`, and `protected_action_no_repair_marked`. If stored as audit variants instead of a separate funnel table, expose the same query keys and privacy rules before public claims.
      Update GTM readiness or source claim registry so the P4 allowed claim is exactly one named non-money action can be proposed, owner-approved or rejected, attempted once, and reconstructed. Public claims must be disabled when operator controls are off, support capacity is exceeded, backlog age exceeds the support record threshold, unresolved proof gaps exceed the threshold, or scans fail.
    </action>
    <acceptance_criteria>
      `capabilityLaunchSupportRecord` exists in source or planning closeout state and contains primary, backup, admin/operator, supported channels, stage, capacity threshold, backlog-age threshold, phase incidents, claim-disable path, per-channel kill rules, and next review date.
      Queryable support load includes selected-action proof gaps, failed attempts, retry exhausted, no-repair, unauthorized-action complaints, reversal/dispute posture, and backlog age.
      Public/developer P4 claims cannot render when `protected_actions_enabled` is disabled, `protected_action_attempts_enabled` is disabled for attempt claims, support capacity threshold is exceeded, backlog age threshold is exceeded, unresolved proof gaps exceed threshold, or the copy scan fails.
      `tests/unit/protected-actions/selected-action-policy.test.ts` or a dedicated support test proves kill rules suppress capability claims without hiding existing owner/operator readback.
      `GTM-READINESS.md` or the source claim registry contains the selected P4 claim, banned P4 claim list, and support-owner/kill-rule closeout gate.
    </acceptance_criteria>

    <verify>

      <command>Run the plan closeout command block entries that cover this task and record exact output in closeout evidence.</command>

    </verify>

    <done>

      <criterion>Every acceptance criterion in this task is source-proven, tested, and free of stop-condition violations.</criterion>

    </done>
  </task>

  <task id="04-01-T08" wave="6" title="Bind copy, discovery, protocol, SEO, and support claims to source readback">

    <name>Bind copy, discovery, protocol, SEO, and support claims to source readback</name>
    <read_first>
      .planning/phases/04-owner-pending-protected-actions/04-ACTION-SELECTION.md
      .planning/phases/04-owner-pending-protected-actions/04-UI-SPEC.md
      .planning/AI-SPEC.md
      .planning/SEO-AEO-SPEC.md
      .planning/GTM-READINESS.md
      src/lib/ui/contract-scans.ts
      src/lib/ui/copy.ts
      src/modules/discovery/public.ts
      src/modules/protected-action/public.ts
      tests/copy/claims-register.test.ts
      tests/copy/phase1-banned-copy.test.ts
      tests/seo/public-business-seo.test.ts
      tests/ui-contract/status-copy.test.ts
    </read_first>

    <files>

      <item>Use phase frontmatter `files_modified` plus task-local action paths; do not edit files outside those lists.</item>

    </files>
    <action>
      Extend copy and contract scans for P4. Positive P4 wording is allowed only for the selected action after route-tested source readback supports proposal, owner approval requirement, attempt state, receipt/proof gap, reconstruction, and support posture. Negative wording must explicitly tie negation to the matched capability: `no autonomous execution`, `actions require owner approval`, `payments unavailable`, `wallet out of scope`, `direct execute unavailable`, and equivalent exact forms.
      Public/developer discovery may say `approval required`, `owner-pending`, or `unsupported` only from source readback. It must not expose callable tool/action descriptors, mutation APIs, direct execute language, payment descriptors, marketplace language, or provider success claims.
      SEO/AEO assets and launch copy must not claim P4 unless the selected-action claim is source-readbacked and support record permits the channel.
    </action>
    <acceptance_criteria>
      `src/lib/ui/contract-scans.ts` rejects autonomous, auto-executed, agent executed, direct execute, callable, tool-call, action endpoint, provider confirmed, guaranteed, booked, paid, payment required, wallet, credits, settlement, Connect, x402, broad action catalog, provider marketplace, request market, hosted agents, and generic gateway wording for P4 public assets.
      `tests/copy/phase4-protected-action-claims.test.ts` includes positive fixtures for selected-action approval-required wording and negative fixtures for direct execution, autonomous execution, callable protocol action, payment, booking guarantee, provider marketplace, broad catalog, and unsupported negation such as `available unless payments are enabled`.
      Discovery/protocol output tests prove descriptor files never mint authority and any optional descriptor routes to proposal-only approval-required behavior.
      SEO tests prove P4 JSON-LD, metadata, llms/UCP/discovery files, email/social/partner copy, API docs, and launch assets either omit P4 claims or cite the selected action source readback and support record.
      Allowed claim rows are bound to evidence IDs or readback IDs, not prose-only planning assertions.
    </acceptance_criteria>

    <verify>

      <command>Run the plan closeout command block entries that cover this task and record exact output in closeout evidence.</command>

    </verify>

    <done>

      <criterion>Every acceptance criterion in this task is source-proven, tested, and free of stop-condition violations.</criterion>

    </done>
  </task>

  <task id="04-01-T09" wave="7" title="Add closeout tests and production-like smoke scenarios">

    <name>Add closeout tests and production-like smoke scenarios</name>
    <read_first>
      package.json
      .planning/phases/04-owner-pending-protected-actions/04-ACTION-SELECTION.md
      .planning/phases/04-owner-pending-protected-actions/04-UI-SPEC.md
      .planning/phases/04-owner-pending-protected-actions/04-SPEC.md
      src/modules/protected-action/public.ts
      src/routes/owner.actions.tsx
      src/routes/owner.actions.$proposalId.tsx
      src/routes/owner.actions.$proposalId.receipt.tsx
      src/routes/admin.protected-actions.tsx
      src/routes/admin.protected-actions.$proposalId.tsx
      tests/unit/protected-actions/selected-action-contract.test.ts
      tests/unit/protected-actions/selected-action-policy.test.ts
      tests/unit/protected-actions/selected-action-gateway.test.ts
      tests/integration/protected-actions/selected-action-attempt-readback.test.ts
      tests/e2e/protected-actions/selected-action-owner-flow.spec.ts
      tests/e2e/a11y/protected-actions/selected-action-a11y.spec.ts
      tests/copy/phase4-protected-action-claims.test.ts
    </read_first>

    <files>

      <item>Use phase frontmatter `files_modified` plus task-local action paths; do not edit files outside those lists.</item>

    </files>
    <action>
      Add or update tests so Phase 4 closeout proves duplicate, stale, concurrent, wrong-owner, expired, refused, proof-gap, downstream failure, successful receipt, callback duplicate if callbacks exist, retry exhausted, no-repair, deletion/tombstone, disabled controls, mobile, keyboard, focus, and copy-claim paths for the selected action.
      Add smoke documentation inside the closeout evidence or test names, not a new framework: owner queue to detail to reject; owner queue to detail to approve to attempt to receipt/proof-gap; operator reconstruction to retry or no-repair; operator control disabled to claim hidden; retention delete to tombstone readback; discovery copy says approval required only after source readback.
    </action>
    <acceptance_criteria>
      Unit, integration, E2E, a11y, type, copy, SEO, import/source-mining, ts-standards, UI-contract, Convex codegen, typecheck, and build commands in `<verification>` cover the selected action paths.
      Tests do not create mocks for source-owned authority, owner access, provider/internal readback, audit, or operator controls; fixtures may be deterministic source-owned records.
      Closeout evidence names the selected action, selected provider/internal boundary, decision record, UI spec amendment, support record, retention/delete behavior, smoke scenarios, and command outputs.
      Negative scans prove no hosted agents, broad action catalogs, request market, wallet/payment, MCP/OpenAPI/SDK mutation bloat, autonomous execution, or generic action gateway ships.
      The phase does not rely on `npm run test:all` as a replacement for E2E, a11y, or P4 smoke evidence.
    </acceptance_criteria>

    <verify>

      <command>Run the plan closeout command block entries that cover this task and record exact output in closeout evidence.</command>

    </verify>

    <done>

      <criterion>Every acceptance criterion in this task is source-proven, tested, and free of stop-condition violations.</criterion>

    </done>
  </task>

<verification>
  <commands>
    npm run check:convex-codegen
    npm run typecheck
    npm run test:unit
    npm run test:integration
    npm run test:e2e
    npm run test:a11y
    npm run test:types
    npm run test:imports
    npm run test:source-mining
    npm run test:ts-standards
    npm run test:copy
    npm run test:seo
    npm run test:ui-contract
    npm run build
  </commands>
  <smoke>
    Smoke 1: selected action proposal appears in owner queue, owner opens detail, rejects with reason, and reconstruction shows no provider/internal attempt.
    Smoke 2: owner opens selected action detail, sees consequence/reversibility/deadline/proof, approves, one-use gateway admits once, attempt records receipt or proof gap, and duplicate attempt is rejected.
    Smoke 3: operator opens reconstruction, sees proposal, policy, owner decision, gateway, attempt, receipt/proof gap, audit refs, private evidence redaction, retry state, and marks no-repair with reason when repair is unsafe.
    Smoke 4: disabling `protected_actions_enabled` hides new proposals and public/action discovery claims while preserving readback and no-repair. Disabling `protected_action_attempts_enabled` blocks gateway consumption, attempts, and retries while preserving reconstruction.
    Smoke 5: retention delete redacts private evidence refs, preserves audit hashes and tombstone state, and owner/operator readback remains reconstructable without raw provider payloads.
    Smoke 6: public/developer discovery says `approval required` only after source readback and support record permit the selected action claim.
  </smoke>
</verification>

## must_haves.truths and must_haves.prohibitions

must_haves:
  truths:
    - id: P4-R1-selection-record
      statement: "A decision record selects exactly one non-money action class from observed Phase 2 or Phase 3 evidence and rejects broad catalogs, money movement, and autonomous execution."
      verification: "04-ACTION-SELECTION.md plus copy/source-mining scans."
    - id: P4-R2-proposal-contract
      statement: "The selected action proposal persists canonical hash, idempotency key, correlation ID, actor principal, target, owner context, selected action slug, allowed parameters, deadline, reversibility, proof expectation, and audit."
      verification: "tests/unit/protected-actions/selected-action-contract.test.ts"
    - id: P4-R2-proposal-rejections
      statement: "Proposal rejects unknown action slug, invalid target, suppressed target, untrusted parameter key, duplicate same-key different-body, mismatched replay, wrong actor, and missing required context."
      verification: "tests/unit/protected-actions/selected-action-contract.test.ts"
    - id: P4-R3-covered-policy-edges
      statement: "Policy covers boundary, adjacency, empty, ordering, and precision edges: review-required, refused, expired, missing-proof, external-authority, time-bound, proof-gap, exact result states, deterministic ordering, and no provider side effects."
      verification: "tests/unit/protected-actions/selected-action-policy.test.ts"
    - id: P4-R4-owner-decision-ui
      statement: "Owner approval/rejection requires source-owned owner access, visible object, scope, selected action, consequence, reversibility, deadline, proof requirement, disabled reason, reason/evidence where required, and audit before provider/internal attempt."
      verification: "tests/e2e/protected-actions/selected-action-owner-flow.spec.ts and tests/e2e/a11y/protected-actions/selected-action-a11y.spec.ts"
    - id: P4-R5-covered-gateway-edges
      statement: "Gateway and attempt cover idempotency and concurrency edges: one-use admission, duplicate replay, stale proposal, expired admission, concurrent consume race, bounded retry, timeout, mismatch, provider/internal failure, proof-gap, retry exhausted, no-repair, and successful receipt."
      verification: "tests/unit/protected-actions/selected-action-gateway.test.ts and tests/integration/protected-actions/selected-action-attempt-readback.test.ts"
    - id: P4-R6-reconstruction-readback
      statement: "Readback reconstructs actor, proposal, policy, owner decision, gateway admission, provider/internal attempt, outcome, receipt/proof-gap, audit events, dispute/reversal posture, private evidence redaction, repair, and no-repair without logs."
      verification: "tests/integration/protected-actions/selected-action-attempt-readback.test.ts and operator E2E smoke."
    - id: P4-R7-discovery-wording
      statement: "Public, developer, SEO/AEO, llms/UCP/discovery, API docs, launch, email/social, and partner copy describe the selected action only as owner-pending or approval-required when source readback supports it."
      verification: "tests/copy/phase4-protected-action-claims.test.ts and tests/seo/public-business-seo.test.ts"
    - id: P4-R8-closeout-edge-proof
      statement: "Closeout proves duplicate, stale, concurrent, wrong-owner, expired, refused, proof-gap, downstream-failure, successful action, mobile 375px, keyboard, focus, disabled states, support kill rules, retention delete, and operator no-repair paths."
      verification: "Full `<verification>` command list plus smoke evidence."
    - id: P4-retention-delete
      statement: "Protected-action private evidence has named retention class, export/delete behavior, tombstone behavior, private evidence access policy, raw evidence discard rule, and preserved audit hashes."
      verification: "tests/unit/protected-actions/selected-action-retention.test.ts"
    - id: P4-support-record
      statement: "`capabilityLaunchSupportRecord` names primary and backup support owners, admin/operator contact, channels, stage, capacity threshold, backlog-age threshold, incidents, claim-disable path, per-channel kill rules, and next review date before P4 claims go live."
      verification: "Task 07 tests and closeout evidence."
  prohibitions:
    - statement: "MUST NOT execute a protected action autonomously or directly from an agent/developer/protocol request without owner approval."
      status: resolved
      verification: "Gateway/provider attempt denial tests plus copy/schema scans."
    - statement: "MUST NOT ship broad action catalogs, request-market, hosted-agent, skill marketplace, or generic action gateway topology before one action class proves demand."
      status: resolved
      verification: "Action-selection record, source-mining scans, and absence of registry/DSL/multiple-action exports."
    - statement: "MUST NOT treat MCP/OpenAPI/SDK/plugin descriptors as action authority."
      status: resolved
      verification: "Descriptor scans and route authority tests proving proposal-only approval-required behavior."
    - statement: "MUST NOT include money movement, payment authorization, wallet/credits/balance, Stripe/x402/Connect, settlement, or paymentRequired=true behavior in Phase 4."
      status: resolved
      verification: "Import/source-mining/copy/SEO scans."
    - statement: "MUST NOT hide consequence, reversibility, deadline, proof requirements, or disabled reasons from the approving owner."
      status: resolved
      verification: "Owner UI E2E, a11y tests, compact/wide rendered evidence, and product-design review."
    - statement: "MUST NOT let provider success/failure be unreconstructable or mutate state without a proposal, policy, owner decision, gateway, audit, and receipt/proof-gap chain."
      status: resolved
      verification: "Reconstruction and provider-attempt state tests."

## Artifacts this phase produces

- `.planning/phases/04-owner-pending-protected-actions/04-ACTION-SELECTION.md`
- `selectedActionName`, `selectedActionSlug`, `selectedActionPascal`, `targetObject`, `allowedParameters`, `consequence`, `reversibility`, `deadline`, `proofExpectation`, `providerOrInternalBoundary`, `noMoneyAssurance`, and `rejectedActionClasses` fields in the action-selection record.
- `protectedActionProposals`, `protectedActionPolicyDecisions`, `protectedActionOwnerDecisions`, `protectedActionGatewayAdmissions`, `protectedActionAttempts`, `protectedActionReceipts`, `protectedActionPrivateEvidenceRefs`, and `protectedActionSupportRecords` source tables or equivalent Convex state.
- Audit events: `protected_action.proposed`, `protected_action.proposal_rejected`, `protected_action.policy_evaluated`, `protected_action.approved`, `protected_action.rejected`, `protected_action.expired`, `protected_action.gateway_admitted`, `protected_action.gateway_consumed`, `protected_action.gateway_replay_rejected`, `protected_action.attempted`, `protected_action.attempt_succeeded`, `protected_action.attempt_failed`, `protected_action.retry_attempted`, `protected_action.retry_exhausted`, `protected_action.receipt_recorded`, `protected_action.proof_gap_recorded`, `protected_action.no_repair_marked`, `protected_action.callback_received`, and `protected_action.callback_rejected`.
- Operator controls: `protected_actions_enabled` and `protected_action_attempts_enabled`.
- Funnel/support events: `protected_action_proposed`, `protected_action_policy_denied`, `protected_action_approved`, `protected_action_rejected`, `protected_action_attempted`, `protected_action_receipt_viewed`, `protected_action_retry_exhausted`, and `protected_action_no_repair_marked`.
- `capabilityLaunchSupportRecord`.
- Module files under `src/modules/protected-action/` for the selected action contract, policy, gateway, attempt readback, reconstruction, retention, support, and validators.
- Route-facing action-specific exports named by the selection record: `propose{SelectedActionPascal}`, `evaluate{SelectedActionPascal}Policy`, `listOwner{SelectedActionPascal}Queue`, `read{SelectedActionPascal}Proposal`, `decide{SelectedActionPascal}Proposal`, `read{SelectedActionPascal}Receipt`, and `read{SelectedActionPascal}Reconstruction`.
- Internal selected-action functions: `create{SelectedActionPascal}GatewayAdmission`, `consume{SelectedActionPascal}GatewayAdmission`, `record{SelectedActionPascal}AttemptReadback`, `retry{SelectedActionPascal}Attempt`, `mark{SelectedActionPascal}NoRepair`, and `apply{SelectedActionPascal}RetentionDelete`.
- Owner routes: `src/routes/owner.actions.tsx`, `src/routes/owner.actions.$proposalId.tsx`, and `src/routes/owner.actions.$proposalId.receipt.tsx`.
- Operator routes: `src/routes/admin.protected-actions.tsx` and `src/routes/admin.protected-actions.$proposalId.tsx`.
- P4 status presentations in `src/lib/ui/status-presentation.ts`.
- P4 copy and claim scan patterns in `src/lib/ui/contract-scans.ts` and `src/lib/ui/copy.ts`.
- Tests listed in frontmatter `files_modified`, including selected-action unit, integration, E2E, a11y, type, copy, UI-contract, import/source-mining, and SEO coverage.

## Stop conditions

- Phase 2 and Phase 3 evidence do not justify one selected non-money action class.
- The selected action requires money movement, booking guarantees, provider marketplace settlement, physical-world proof claims, or autonomous execution.
- Owner approval lacks selected-action-specific consequence, reversibility, deadline, proof requirement, or disabled reason copy.
- A descriptor, protocol file, API doc, SDK, plugin, or route parameter becomes action authority.
- Provider/internal attempt can happen without durable source-owned proposal, policy, owner decision, gateway, audit, and receipt/proof-gap chain.
- Support owner, capacity threshold, backlog-age threshold, kill rules, retention/delete behavior, and claim-disable path are missing.

## Acceptance

Phase 4 is complete only when exactly one non-money protected action can be proposed, policy-checked, owner-approved or rejected, admitted once, attempted through the selected provider/internal boundary, read back as receipt or proof gap, reconstructed by owner/operator, deleted or tombstoned according to retention policy, supported with named kill rules, and honestly described as owner-pending/approval-required with no autonomy, generic action, protocol authority, or payment overclaim.
