---
phase: 06-agentic-business-action-receipts
plan: "06-05"
type: execute
wave: 3
depends_on: ["06-02"]
files_modified:
  - src/modules/observability/public.ts
  - src/modules/observability/internal/schema.ts
  - tests/unit/observability/business-action-events.test.ts
autonomous: true
requirements: [P6-R9, P6-R10, P6-R11, P6-R13]
user_setup: []
execution_scope: source_local_hackathon_spike
production_executable: false
must_haves:
  truths:
    - id: p6-observability-literals
      statement: "Phase 6 audit targets/events, funnel events, operator controls, support/no-repair states, and private evidence retention metadata validate through the existing observability modules."
    - id: p6-support-kill-rules
      statement: "Support kill rules disable public/demo claims for stale/disabled cards, revoked/expired mandates, wrong owner, rejected checkpoint, guardrail block/refusal, unbound evidence, missing artifacts, proof_gap, no-repair, or support capacity breach."
    - id: p6-no-repair
      statement: "No-repair is terminal, audited, reconstructable, and never rewrites provider evidence."
  artifacts:
    - path: src/modules/observability/public.ts
      provides: "Phase 6 audit/funnel/control literals."
    - path: tests/unit/observability/business-action-events.test.ts
      provides: "Validation, support, kill-rule, retention, and no-repair tests."
  key_links:
    - from: business_action.* events
      to: ActionReceipt reconstruction
      via: "Audit refs and operator next action."
    - from: business_actions_enabled
      to: public/demo claims
      via: "Support kill-rule gating."
---

<objective>
Plug Phase 6 into the existing observability spine with audit targets/events, funnel events, operator controls, support/kill-rule records, private evidence retention metadata, and no-repair reconstruction.

Purpose: prevent parallel logs and make public/demo claim safety source-owned.
Output: observability literals/schema updates and unit tests. Closeout must state `source/local proof only` and `production proof not claimed`.
</objective>

<execution_context>
@/Users/skchan/Jcsyc_Projects/agentic-economy/.codex/gsd-core/workflows/execute-plan.md
@/Users/skchan/Jcsyc_Projects/agentic-economy/.codex/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/SECURITY-SPEC.md
@.planning/GTM-READINESS.md
@.planning/phases/06-agentic-business-action-receipts/06-02-SUMMARY.md
@src/modules/observability/public.ts
@src/modules/observability/internal/schema.ts
@src/modules/billing/internal/schema.ts
@src/modules/protected-action/internal/contact-follow-up.ts
</context>

<preflight_gates>
- Requires 06-02 source persistence summary.
- Production claims remain BLOCKED.
- This plan creates no route UI and no provider proof.
</preflight_gates>

<hackathon_spike_exception>
This plan may enable internal/demo support and operator controls. It may not enable public production claims.
</hackathon_spike_exception>

<audit_controls_support_contract>
- Add `business_actions_enabled` and `business_action_attempts_enabled`.
- Add `business_action.*` audit events.
- Add support kill-rule behavior that disables public/demo claims without deleting readbacks.
- Preserve private evidence retention/access/export/delete/tombstone metadata.
</audit_controls_support_contract>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Add Phase 6 observability literals</name>
  <files>src/modules/observability/public.ts, src/modules/observability/internal/schema.ts, tests/unit/observability/business-action-events.test.ts</files>
  <read_first>.planning/SECURITY-SPEC.md, .planning/GTM-READINESS.md, src/modules/observability/public.ts</read_first>
  <action>Extend audit target types with business-action card, mandate, request, checkpoint, guardrail evidence, external evidence, result artifact, receipt, support, private evidence, and no-repair targets. Extend audit event types with `business_action.card_versioned`, `business_action.mandate_recorded`, `business_action.request_proposed`, `business_action.checkpoint_recorded`, `business_action.guardrail_allowed`, `business_action.guardrail_blocked`, `business_action.evidence_ingested`, `business_action.evidence_held`, `business_action.result_artifact_recorded`, `business_action.receipt_recorded`, `business_action.proof_gap_recorded`, and `business_action.no_repair_marked`. Extend funnel events with the Phase 6 names from GTM readiness.</action>
  <verify>npx vitest run tests/unit/observability/business-action-events.test.ts</verify>
  <acceptance_criteria>
    - Tests validate all new audit/funnel literals.
    - Existing P1-P5 observability tests remain compatible.
  </acceptance_criteria>
  <done>Phase 6 observability literals validate through the existing module.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Add operator controls support kill rules and no-repair validation</name>
  <files>src/modules/observability/public.ts, src/modules/observability/internal/schema.ts, tests/unit/observability/business-action-events.test.ts</files>
  <read_first>.planning/phases/06-agentic-business-action-receipts/06-CONTEXT.md, src/modules/billing/internal/schema.ts, src/modules/protected-action/internal/contact-follow-up.ts</read_first>
  <action>Add operator controls `business_actions_enabled` and `business_action_attempts_enabled`. Add tests proving support kill rules disable public/demo claims for stale/disabled card, revoked/expired mandate, wrong owner, rejected checkpoint, guardrail block/refusal, unbound evidence, missing artifact, proof_gap, no-repair, and support-capacity breach. Add tests proving no-repair is terminal, auditable, reconstructable, and never rewrites provider evidence.</action>
  <verify>npx vitest run tests/unit/observability/business-action-events.test.ts</verify>
  <acceptance_criteria>
    - Controls are source-owned and audited, not env-only.
    - Kill switches preserve historical readbacks.
    - No-repair preserves receipt reconstruction.
  </acceptance_criteria>
  <done>Phase 6 support/control behavior is source-owned and test-covered.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Validate private evidence retention metadata</name>
  <files>src/modules/observability/public.ts, src/modules/observability/internal/schema.ts, tests/unit/observability/business-action-events.test.ts</files>
  <read_first>.planning/SECURITY-SPEC.md, .planning/phases/06-agentic-business-action-receipts/06-02-business-action-convex-source-PLAN.md</read_first>
  <action>Add validation tests for retention class `business_action_private_evidence`, access policy `owner_admin_operator_only`, TTL/redaction metadata, export/delete/tombstone behavior, and public projection exclusions for raw prompts, traces, provider payloads, Stripe payloads, customer identifiers, private endpoint refs, API keys, and webhook secrets.</action>
  <verify>npx vitest run tests/unit/observability/business-action-events.test.ts</verify>
  <acceptance_criteria>
    - Retention/access metadata is required for private evidence refs.
    - Public projection exclusions are explicit and tested.
  </acceptance_criteria>
  <done>Private evidence policy is enforced by observability tests.</done>
</task>

</tasks>

<verification>
- [ ] npx vitest run tests/unit/observability/business-action-events.test.ts
- [ ] npm run typecheck
</verification>

<success_criteria>
- All tasks completed.
- Observability/support tests pass.
- No production/deployed proof is claimed.
- Closeout states `source/local proof only` and `production proof not claimed`.
</success_criteria>

<output>
After completion, create `.planning/phases/06-agentic-business-action-receipts/06-05-SUMMARY.md`.
</output>
