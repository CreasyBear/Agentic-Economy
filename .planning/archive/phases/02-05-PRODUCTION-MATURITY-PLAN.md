---
phase: 02-05
plan: production-maturity
type: execution
slug: production-maturity-cross-phase-execution
status: ready-for-execution-after-p1-closeout
wave: 0
depends_on:
  - .planning/phases/01-ten-star-spine-foundation/01-09-deploy-readback-closeout-PLAN.md
  - .planning/SECURITY-SPEC.md
  - .planning/GTM-READINESS.md
  - .planning/phases/02-05-PRODUCTION-MATURITY-CONTEXT.md
files_modified:
  - .planning/SECURITY-SPEC.md
  - .planning/GTM-READINESS.md
  - .planning/SEO-AEO-SPEC.md
  - .planning/AI-SPEC.md
  - src/modules/observability/public.ts
  - src/modules/observability/internal/audit.ts
  - src/modules/observability/internal/schema.ts
  - src/modules/observability/internal/operator-controls.ts
  - src/modules/observability/internal/funnel.ts
  - src/lib/ui/status-presentation.ts
  - src/components/ae/status/AeStatusBadge.tsx
  - src/lib/ui/contract-scans.ts
  - convex/schema.ts
  - tests/unit/observability/*
  - tests/types/*
  - tests/unit/ui-status-presentation.test.ts
  - tests/ui-contract/*
  - tests/copy/phase1-banned-copy.test.ts
  - tests/copy/claims-register.test.ts
  - tests/fixtures/bad-copy/overclaim.fixture
  - tests/imports/source-mining.test.ts
  - tests/imports/scan-targets.ts
autonomous: false
requirements: [P2-R1, P2-R2, P2-R3, P2-R4, P2-R5, P2-R6, P2-R7, P2-R8, P3-R1, P3-R2, P3-R3, P3-R4, P3-R5, P3-R6, P3-R7, P3-R8, P4-R1, P4-R2, P4-R3, P4-R4, P4-R5, P4-R6, P4-R7, P4-R8, P5-R1, P5-R2, P5-R3, P5-R4, P5-R5, P5-R6, P5-R7, P5-R8]
must_haves:
  truths:
    - statement: P2-P5 execute in order as one production system, not as future-surface placeholders.
      status: resolved
      verification: Shared plan objective, phase dependencies, and closeout command block keep P2 -> P3 -> P4 -> P5.
    - statement: Existing observability, source-owned modules, and scan fixtures are extended instead of creating phase-local parallel systems.
      status: resolved
      verification: 02-05-A and package commands require shared audit, status, copy, source-mining, and import scans.
  prohibitions:
    - statement: No unsupported future surface becomes route-visible, copy-visible, schema-visible, or source-visible before its owning phase proves it.
      status: resolved
      verification: Stop conditions and scan fixtures reject unsupported P2-P5 claims.
  artifacts:
    - path: .planning/phases/02-05-PRODUCTION-MATURITY-REVIEWS.md
      provides: Internal review findings H1-H12 and M1-M14 with actionable disposition.
    - path: tests/copy/phase1-banned-copy.test.ts
      provides: Public-copy claim scanner coverage for P2-P5 future-surface overclaims.
  key_links:
    - from: .planning/phases/02-05-PRODUCTION-MATURITY-REVIEWS.md
      to: CYCLE_SUMMARY: current_high=0 current_actionable=0
      via: Review artifact records the resolved blocker state after this plan incorporated the findings.
    - from: .planning/SECURITY-SPEC.md
      to: P2-P5 security expansion
      via: Shared security expansion is source authority for P2-P5 controls.
    - from: .planning/GTM-READINESS.md
      to: P2-P5 GTM expansion
      via: Shared GTM expansion is source authority for claim gates.
created: 2026-06-27
updated: 2026-06-28
---

# Phases 2-5 Production Maturity Execution Frame

## Objective

Make P2-P5 executable as one production system without runtime theatre: P2 human inquiry + owner inbox, P3 read-only builder/agent discovery, P4 one owner-approved non-money action, and P5 one Autumn Cloud + Stripe PSP paid-activation rail. Each phase executes in order and is complete only with source-owned state, real env/dependency setup where needed, route behavior, UI evidence, tests, provider/deploy readback, operator recovery, and copy-clean public claims.

## Decision

Default execution order is P2 -> P3 -> P4 -> P5.

`No gates` means no theatre. It does not mean no proof. Proof is live behavior plus source-owned readback, not dashboards, screenshots, env vars, or provider emails.

## Shared constraints

- Build the smallest production slice that proves the phase. Delete backup breadth unless one current flow needs it.
- Use deep modules: route-facing seams stay small; modules own authorization, state, idempotency, audit, redaction, provider binding, and projection rules.
- Current route target is `src/routes/*` and current TanStack Start structure. Do not plan `apps/web/*` unless a separate migration plan owns the move.
- P2-P5 source-owned proof must extend the existing P1 modules and tests rather than adding parallel logs, route-local authority, or provider-owned truth.
- No AI runtime/library lands in P2-P5. Agent-readable outputs are deterministic public projections, not LLM features.
- P5 default is one Autumn Cloud + Stripe PSP rail. Direct Stripe subscription authority is fallback only after an evidence-backed Autumn blocker record. Connect, x402, wallet/credits/balance, custody, split payouts, request-market settlement, and multi-rail platform work stay out.

  <task id="02-05-A" title="Repair shared audit, operation, and funnel substrate before P2">
    <name>Repair shared audit, operation, and funnel substrate before P2</name>
    <read_first>
      - `.planning/phases/02-05-PRODUCTION-MATURITY-REVIEWS.md` H2, H7, H8, M7, M12
      - `.planning/SECURITY-SPEC.md` sections `P2-P5 security expansion`, `Audit event extension`, and `Operator kill, retry, and no-repair controls`
      - `.planning/GTM-READINESS.md` sections `P2-P5 GTM expansion` and `Additional funnel events`
      - `src/modules/observability/public.ts`
      - `src/modules/observability/internal/audit.ts`
      - `src/modules/observability/internal/schema.ts`
      - `src/modules/observability/internal/funnel.ts`
      - `src/modules/observability/internal/operation-keys.ts`
      - `convex/schema.ts`
      - `tests/unit/observability/*`
      - `tests/types/*`
    </read_first>
    <files>
      <item>Use phase frontmatter `files_modified` plus task-local action paths; do not edit files outside those lists.</item>
    </files>
    <action>
      Extend the existing observability seam before P2 code depends on it. Add the P2-P5 event names from `SECURITY-SPEC.md` to `AuditEventTypeValues`, add required target kinds to `AuditTargetTypeValues`, extend the hard-coded `stateChangingEvents` set for every event that changes inquiry, notification, discovery, protected-action, or billing state, extend `OperatorControlKeyValues` with `inquiries_enabled`, `inquiry_owner_replies_enabled`, `notification_dispatch_enabled`, `notification_webhooks_enabled`, `developer_discovery_publish_enabled`, `discovery_api_keys_enabled`, `protected_actions_enabled`, `protected_action_attempts_enabled`, `paid_activation_enabled`, `billing_webhooks_enabled`, and `billing_reconciliation_enabled`, extend `FunnelEventTypeValues` for the P2-P5 funnel names that are not conditional, update Convex schema/codegen callers, and add tests proving state-changing events require before/after state and operator controls persist/read back.
    </action>
    <acceptance_criteria>
      - `src/modules/observability/public.ts` exports all required P2-P5 audit event, audit target, operator control, and non-conditional funnel event literal values.
      - `src/modules/observability/internal/audit.ts` treats P2-P5 state-changing events as requiring before/after state.
      - `src/modules/observability/internal/schema.ts` and `convex/schema.ts` validate the extended unions.
      - Tests prove `notification.webhook_held`, `billing.provider_event_held`, retry-exhausted, and no-repair events are audit-worthy.
      - Closeout command block includes `npm run test:types`, `npm run test:ts-standards`, and `npm run test:seo`.
    </acceptance_criteria>
    <verify>
      <command>Run the plan closeout command block entries that cover this task and record exact output in closeout evidence.</command>
    </verify>
    <done>
      <criterion>Every acceptance criterion in this task is source-proven, tested, and free of stop-condition violations.</criterion>
    </done>
  </task>

  <task id="02-05-B" title="Add shared status presentation before user-facing P2-P5 UI">

    <name>Add shared status presentation before user-facing P2-P5 UI</name>
    <read_first>
      - `.planning/phases/02-05-PRODUCTION-MATURITY-REVIEWS.md` H7
      - `.planning/FRONTEND-DESIGN-FRAMEWORK.md`
      - `DESIGN.md`
      - `src/lib/ui/status-presentation.ts`
      - `src/components/ae/status/AeStatusBadge.tsx`
      - `tests/unit/ui-status-presentation.test.ts`
      - `tests/ui-contract/*`
    </read_first>

    <files>

      <item>Use phase frontmatter `files_modified` plus task-local action paths; do not edit files outside those lists.</item>

    </files>
    <action>
      Extend `statusPresentation` with every P2-P5 state that can reach page/admin/operator UI: notification bounced, complained, delivery_delayed, retry_exhausted, no_repair, provider_missing; discovery stale, degraded, unavailable, parity_failed; protected-action review_required, refused, expired, proof_gap, gateway_consumed, attempt_failed, disputed, reversed, no_repair; billing pending, started, returned, cancelled, failed, paid, past_due, required_action, refund, dispute, chargeback, provider_event_held, reconciliation_mismatch, no_repair. Each entry names label, tone, description, next action, audience/publicness, disabled reason where applicable, and `AeStatusBadge` compatibility.
    </action>
    <acceptance_criteria>
      - No P2-P5 route/UI spec can render a raw provider enum for a reachable status.
      - `statusPresentation` maps all listed states to label, tone, description, next action, and public/private audience.
      - Tests cover compact and long labels plus at least one state per phase.
    </acceptance_criteria>

    <verify>

      <command>Run the plan closeout command block entries that cover this task and record exact output in closeout evidence.</command>

    </verify>

    <done>

      <criterion>Every acceptance criterion in this task is source-proven, tested, and free of stop-condition violations.</criterion>

    </done>
  </task>

  <task id="02-05-C" title="Expand copy, source-mining, and claim-evidence guardrails">

    <name>Expand copy, source-mining, and claim-evidence guardrails</name>
    <read_first>
      - `.planning/phases/02-05-PRODUCTION-MATURITY-REVIEWS.md` H9, H10, H11, M8, M9, M13
      - `.planning/GTM-READINESS.md`
      - `.planning/SEO-AEO-SPEC.md`
      - `.planning/AI-SPEC.md`
      - `src/lib/ui/contract-scans.ts`
      - `tests/copy/phase1-banned-copy.test.ts`
      - `tests/copy/claims-register.test.ts`
      - `tests/fixtures/bad-copy/overclaim.fixture`
      - `tests/imports/source-mining.test.ts`
      - `tests/imports/scan-targets.ts`
    </read_first>

    <files>

      <item>Use phase frontmatter `files_modified` plus task-local action paths; do not edit files outside those lists.</item>

    </files>
    <action>
      Add a claim evidence register path before any P2-P5 public asset can claim a capability. The register fields are `claimId`, `phase`, `exactPublicCopy`, `publicAsset`, `requiredRoute`, `requiredReadback`, `requiredFunnelEvent`, `evidenceStatus`, `supportOwner`, and `validLaunchStage`. Expand copy scans to cover launch/protocol assets separately from phase-owned planning docs. Expand protocol rules for `.well-known`, merchant-origin UCP, MCP tool, OpenAPI service/action descriptor, action endpoint, payment handler, callable/tool-call, and agent-callable live claims. Expand money rules for standalone wallet, credits, balance, custody, crypto/x402, Connect marketplace, split payouts, settlement, and direct Stripe authority variants. Tighten negative-only allowance so positive `live`, `ready`, or `available` claims with `unless`/`without` still fail unless the matched capability is explicitly negated as `no`, `not available`, `unavailable`, `deferred`, or `out of scope`. Add Autumn/provider-ref quarantine to source-mining scans before P5 decision smoke.
    </action>
    <acceptance_criteria>
      - Public asset review fails an allowed P2-P5 claim without a matching claim evidence register row and live readback.
      - Copy fixtures prove `MCP tools available`, `standard merchant-origin UCP is live`, `agent-callable endpoint`, `wallet is ready`, `credits are live`, `Connect marketplace`, `split payouts`, `direct Stripe rail`, and `wallet/credits are live unless disabled` are violations outside valid phase/test contexts.
      - Phase-owned planning docs can still discuss future capabilities without making public claims.
      - Source-mining scans reject unapproved `autumn`, `AUTUMN_`, `stripe`, `x402`, wallet/credits/balance, payment-handler, and provider-ref fields in core catalog/registry/discovery source before the selected P5 implementation owns them.
    </acceptance_criteria>

    <verify>

      <command>Run the plan closeout command block entries that cover this task and record exact output in closeout evidence.</command>

    </verify>

    <done>

      <criterion>Every acceptance criterion in this task is source-proven, tested, and free of stop-condition violations.</criterion>

    </done>
  </task>

  <task id="02-05-D" title="Add capability support and kill records to every closeout">

    <name>Add capability support and kill records to every closeout</name>
    <read_first>
      - `.planning/phases/02-05-PRODUCTION-MATURITY-REVIEWS.md` M10
      - `.planning/GTM-READINESS.md` sections `Channel kill rules`, `Support capacity requirements`, and `P2-P5 claim acceptance`
      - `.planning/SECURITY-SPEC.md` section `Operator kill, retry, and no-repair controls`
      - `src/modules/observability/public.ts`
      - P2-P5 phase `*-PLAN.md` files
    </read_first>

    <files>

      <item>Use phase frontmatter `files_modified` plus task-local action paths; do not edit files outside those lists.</item>

    </files>
    <action>
      Require each phase to write or update a `capabilityLaunchSupportRecord` before the capability can be claimed live. The record must include primary owner, backup owner, admin/operator role, supported channels/stage, support capacity threshold, backlog age threshold, current phase incidents, claim-disable path, per-channel kill rule, and source-owned readback used by support.
    </action>
    <acceptance_criteria>
      - P2 closeout names support handling for spam, wrong recipient, owner cannot reply, bounce/complaint, provider outage, suppression, and privacy request.
      - P3 closeout names support handling for stale docs/schema, route parity failure, accidental private data exposure, bot abuse/rate limits, and key revoke/rotate if keys ship.
      - P4 closeout names support handling for unauthorized-action claims, provider attempt failure, proof gap, reversal/dispute posture, and no-repair.
      - P5 closeout names support handling for checkout failure, cancelled return, duplicate webhook, unbound provider event, receipt mismatch, refund/dispute/cancellation, and reconciliation no-repair.
    </acceptance_criteria>

    <verify>

      <command>Run the plan closeout command block entries that cover this task and record exact output in closeout evidence.</command>

    </verify>

    <done>

      <criterion>Every acceptance criterion in this task is source-proven, tested, and free of stop-condition violations.</criterion>

    </done>
  </task>

  <task id="02-05-E" title="Verify no phase overclaims or outruns prerequisites">

    <name>Verify no phase overclaims or outruns prerequisites</name>
    <read_first>
      - `.planning/phases/02-05-PRODUCTION-MATURITY-REVIEWS.md`
      - `.planning/ROADMAP.md`
      - `.planning/MANIFEST.md`
      - P2-P5 `*-SPEC.md`, `*-CONTEXT.md`, `*-UI-SPEC.md`, and `*-PLAN.md` files
    </read_first>

    <files>

      <item>Use phase frontmatter `files_modified` plus task-local action paths; do not edit files outside those lists.</item>

    </files>
    <action>
      Before P2 implementation starts, verify each P2-P5 plan is GSD-executable and every current review finding is either incorporated as a task, acceptance criterion, verification command, must-have, prohibition, or explicit deferral inside the relevant plan. Do not execute P3 before P2 produces either a P2 closeout artifact or an explicit P2-unavailable status-contract artifact. Do not execute P4 before the action-selection record and amended `04-UI-SPEC.md` exist. Do not execute P5 before the Autumn/Stripe money decision record and provider-secret/readback posture are accepted.
    </action>
    <acceptance_criteria>
      - Every P2-P5 plan has YAML frontmatter, XML `<task>` blocks, `<read_first>`, `<acceptance_criteria>`, `<verification>`, `must_haves.truths`, `must_haves.prohibitions`, and `Artifacts this phase produces`.
      - Every plan closeout command block includes `npm run typecheck`, `npm run check:convex-codegen`, `npm run test:unit`, `npm run test:integration`, `npm run test:e2e`, `npm run test:a11y`, `npm run test:types`, `npm run test:imports`, `npm run test:source-mining`, `npm run test:ts-standards`, `npm run test:copy`, `npm run test:seo`, `npm run test:ui-contract`, and `npm run build` unless the plan documents a source-grounded replacement.
      - Rerun plan review after this revision; execution starts only after current high/actionable findings are zero or explicitly accepted as deferrals in plan text.
    </acceptance_criteria>

    <verify>

      <command>Run the plan closeout command block entries that cover this task and record exact output in closeout evidence.</command>

    </verify>

    <done>

      <criterion>Every acceptance criterion in this task is source-proven, tested, and free of stop-condition violations.</criterion>

    </done>
  </task>

<verification>
  <command>npm run typecheck</command>
  <command>npm run check:convex-codegen</command>
  <command>npm run test:unit</command>
  <command>npm run test:integration</command>
  <command>npm run test:e2e</command>
  <command>npm run test:a11y</command>
  <command>npm run test:types</command>
  <command>npm run test:imports</command>
  <command>npm run test:source-mining</command>
  <command>npm run test:ts-standards</command>
  <command>npm run test:copy</command>
  <command>npm run test:seo</command>
  <command>npm run test:ui-contract</command>
  <command>npm run build</command>
</verification>

## must_haves

truths:
  - statement: P2-P5 plans execute in order by default: P2 -> P3 -> P4 -> P5.
    verification: Frontmatter and dependencies prevent P3/P4/P5 from starting before their explicit prerequisite artifacts exist.
  - statement: Observability, idempotency, audit, funnel, operator controls, and status presentation are shared substrate, not phase-local duplicates.
    verification: Source imports and tests use `src/modules/observability/*`, `src/modules/common/*`, and `src/lib/ui/status-presentation.ts` rather than parallel phase-only implementations.
  - statement: Public claims are allowed only with source-owned route behavior, readback, funnel evidence, support owner, and copy scans.
    verification: Claim evidence register rows are required before public assets mention P2-P5 live capability.
  - statement: Provider events are evidence, not authority.
    verification: Tests prove provider success/failure cannot create inquiry truth, action truth, or paid entitlement without source-owned command/binding/reconciliation state.
  - statement: P5 uses one Autumn Cloud + Stripe PSP rail by default.
    verification: Money decision record rejects direct Stripe subscription authority unless an evidence-backed Autumn blocker exists; all other rails remain out of scope.

prohibitions:
  - statement: MUST NOT create parallel audit, idempotency, support, or status systems per phase.
    status: resolved
    verification: Source-mining/import/type tests and code review verify modules use shared seams.
  - statement: MUST NOT treat dashboard screenshots, env vars, provider emails, or logs as production proof.
    status: resolved
    verification: Closeout requires route behavior, source state, readback, funnel events, and tests.
  - statement: MUST NOT add AI runtime, autonomous agents, hosted MCP/BYO proxy, SDK/CLI/plugin, request-market, or broad developer-platform surfaces in P2-P5.
    status: resolved
    verification: Copy/source-mining/protocol scans reject these terms unless a later phase owns a decision record and source proof.
  - statement: MUST NOT leak private inquiry, owner, protected-action, provider, or payment evidence into public catalog, registry, API, UCP, llms, sitemap, SEO, docs, logs, or launch copy.
    status: resolved
    verification: Projection allowlist, redaction, SEO, docs, and copy tests cover private payload absence.
  - statement: MUST NOT let P5 expand into wallet, credits, balance, custody, Connect, x402, split payouts, request-market settlement, or direct Stripe subscription authority by default.
    status: resolved
    verification: P5 plan, P5 spec, source scans, and money decision record enforce the Autumn + Stripe PSP boundary.

## Artifacts this phase produces

- Plan files: `.planning/phases/02-human-inquiry-owner-inbox/02-01-human-inquiry-owner-inbox-production-PLAN.md`, `.planning/phases/03-standard-agent-builder-discovery/03-01-standard-agent-builder-discovery-production-PLAN.md`, `.planning/phases/04-owner-pending-protected-actions/04-01-one-owner-approved-protected-action-PLAN.md`, `.planning/phases/05-paid-activation-money-rails/05-01-autumn-stripe-paid-activation-PLAN.md`.
- Shared source symbols planned before P2: `AuditEventTypeValues`, `AuditTargetTypeValues`, `stateChangingEvents`, `OperatorControlKeyValues`, `FunnelEventTypeValues`, `statusPresentation` entries, `capabilityLaunchSupportRecord`, and `claimEvidenceRegister`.
- Shared scan/test artifacts planned before public claims: expanded `copyClaimRules`, tightened `isNegativeCapabilityContext`, expanded source-mining future-surface/provider-ref patterns, public-asset scan targets, and bad-copy fixtures.

## Stop conditions

- Phase 1 closeout is not green or current runtime still has only stubs for claim/catalog/discovery/admin authority.
- Any plan omits XML tasks, read_first, acceptance_criteria, verification, must_haves, or artifact lists.
- Any P2-P5 implementation depends on env vars, screenshots, provider dashboards, or public copy as proof.
- Any unsupported future surface becomes route-visible, copy-visible, schema-visible, or source-visible before its owning phase proves it.
- Any current review finding remains neither incorporated nor explicitly deferred in the relevant plan.
