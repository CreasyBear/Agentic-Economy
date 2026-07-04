---
phase: 06-agentic-business-action-receipts
plan: "06-02"
type: execute
wave: 2
depends_on: ["06-01"]
files_modified:
  - convex/schema.ts
  - convex/businessActions.ts
  - convex/businessActionStore.ts
  - src/modules/business-action/business-action.functions.ts
  - tests/unit/convex/business-actions-runtime.test.ts
autonomous: true
requirements: [P6-R2, P6-R3, P6-R4, P6-R5, P6-R8, P6-R9, P6-R11, P6-R13]
user_setup: []
execution_scope: source_local_hackathon_spike
production_executable: false
must_haves:
  truths:
    - id: p6-convex-source-authority
      statement: "Convex business-action functions derive owner/admin authority server-side and reject browser-supplied authority, provider IDs, amount/currency, receipt status, and checkpoint result."
    - id: p6-guardrail-persistence
      statement: "GuardrailDecisionEvidence persists for allow and block/refusal without creating post-checkpoint ExternalEvidenceEvent rows on non-accepted checkpoints."
    - id: p6-private-evidence-retention
      statement: "Private evidence refs use retention class business_action_private_evidence, owner_admin_operator_only access, explicit TTL/redaction, export/delete/tombstone behavior, and public projection exclusions."
  artifacts:
    - path: convex/businessActions.ts
      provides: "Source-write gated Convex adapter for Phase 6 business actions."
    - path: convex/businessActionStore.ts
      provides: "Source-state slice load/persist helpers."
    - path: tests/unit/convex/business-actions-runtime.test.ts
      provides: "Runtime authority, persistence, retention, and readback tests."
  key_links:
    - from: convex/businessActions.ts
      to: src/modules/business-action/public.ts
      via: "Adapter delegates to public seam and never reimplements domain rules."
    - from: private evidence refs
      to: public verifier
      via: "Only hashes/statuses/non-sensitive refs are projected publicly."
---

<objective>
Persist Phase 6 source-owned cards, mandates, requests, checkpoints, guardrail decisions, Hermes evidence, result artifacts, receipts, support/no-repair refs, audit refs, and private evidence refs through Convex.

Purpose: make the pure domain durable with source-write admission, authority checks, retention policy, and redacted readbacks.
Output: Convex schema/store/adapter, server function seam, and focused runtime tests. Closeout must state `source/local proof only` and `production proof not claimed`.
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
@.planning/phases/06-agentic-business-action-receipts/06-SPEC.md
@.planning/phases/06-agentic-business-action-receipts/06-PATTERNS.md
@.planning/phases/06-agentic-business-action-receipts/06-01-SUMMARY.md
@src/modules/business-action/public.ts
@convex/protectedActions.ts
@convex/protectedActionStore.ts
@convex/schema.ts
</context>

<preflight_gates>
- Requires 06-01 summary and public business-action domain seam.
- Production launch remains BLOCKED.
- External provider proof is NOT USED in this plan.
</preflight_gates>

<hackathon_spike_exception>
This plan persists local/source contracts and deterministic evidence rows. It may not claim deployed provider proof or production support.
</hackathon_spike_exception>

<private_evidence_retention_and_access>
- Retention class: `business_action_private_evidence`.
- Access policy: `owner_admin_operator_only`.
- TTL/redaction: implementation must define an explicit TTL constant and record expiry/redaction metadata.
- Export/delete: owner/admin export may include redacted refs and hashes; raw private payload refs are redacted/tombstoned while lawful audit hashes, reason codes, and receipt reconstruction remain.
- Public projection exclusions: raw prompts, traces, provider payloads, Stripe payloads, customer identifiers, private endpoint refs, API keys, and webhook secrets never appear in public output.
</private_evidence_retention_and_access>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Add business-action Convex tables and store helpers</name>
  <files>convex/schema.ts, convex/businessActionStore.ts, tests/unit/convex/business-actions-runtime.test.ts</files>
  <read_first>convex/protectedActionStore.ts, convex/schema.ts, src/modules/business-action/public.ts, .planning/phases/06-agentic-business-action-receipts/06-PATTERNS.md</read_first>
  <action>Add module-owned business action tables and compose them in `convex/schema.ts`. Implement load/persist helpers for cards, mandates, requests, checkpoints, guardrail decisions, Hermes/external evidence, result artifacts, receipts, support/no-repair, audit refs, operation keys, and private evidence refs. Use indexed reads and upsert-style persistence matching protected-action store patterns.</action>
  <verify>npx vitest run tests/unit/convex/business-actions-runtime.test.ts</verify>
  <acceptance_criteria>
    - `convex/businessActionStore.ts` exists and has no route/UI concerns.
    - Schema includes private evidence retention/access fields.
    - Tests cover persistence replay/conflict and redacted readbacks.
  </acceptance_criteria>
  <done>Business-action source state persists without leaking private evidence.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Add source-write gated Convex adapter and server seam</name>
  <files>convex/businessActions.ts, src/modules/business-action/business-action.functions.ts, tests/unit/convex/business-actions-runtime.test.ts</files>
  <read_first>convex/protectedActions.ts, convex/authz.ts, convex/sourceWriteAdmission.ts, src/modules/business-action/public.ts</read_first>
  <action>Implement exact validators, `requireSourceWrite`, source-owned owner/admin authority resolution, pure-domain delegation, persistence, and redacted return contracts. Reject caller-supplied owner/admin/business/provider authority, amount/currency/provider IDs, receipt status, and checkpoint result. Add server functions as adapters only; they must not own domain rules.</action>
  <verify>npx vitest run tests/unit/convex/business-actions-runtime.test.ts && npm run check:convex-codegen</verify>
  <acceptance_criteria>
    - Adapter calls the public business-action seam rather than importing internals from routes.
    - Wrong owner/admin and caller-supplied authority tests fail closed.
    - Convex codegen passes.
  </acceptance_criteria>
  <done>Convex runtime enforces source-owned authority and exact result contracts.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Persist guardrail evidence and private evidence policy</name>
  <files>convex/businessActions.ts, convex/businessActionStore.ts, tests/unit/convex/business-actions-runtime.test.ts</files>
  <read_first>.planning/SECURITY-SPEC.md, .planning/phases/06-agentic-business-action-receipts/06-RESEARCH.md, src/modules/business-action/public.ts</read_first>
  <action>Persist `GuardrailDecisionEvidence` for allow and block/refusal even when checkpoint outcome is refused or proof_gap. Non-accepted checkpoints must create no post-checkpoint `ExternalEvidenceEvent` rows. Persist private evidence refs with retention class `business_action_private_evidence`, access policy `owner_admin_operator_only`, TTL/redaction metadata, export/delete/tombstone behavior, and public projection exclusions.</action>
  <verify>npx vitest run tests/unit/convex/business-actions-runtime.test.ts</verify>
  <acceptance_criteria>
    - Tests prove guardrail block/refusal persists without downstream consequence.
    - Tests prove private evidence refs are exportable as redacted hashes and tombstoned on delete.
  </acceptance_criteria>
  <done>Guardrail and private evidence policies survive persistence.</done>
</task>

</tasks>

<verification>
- [ ] npx vitest run tests/unit/convex/business-actions-runtime.test.ts
- [ ] npm run check:convex-codegen
- [ ] npm run typecheck
</verification>

<success_criteria>
- All tasks completed.
- Persistence and authority tests pass.
- No production/deployed proof is claimed.
- Closeout states `source/local proof only` and `production proof not claimed`.
</success_criteria>

<output>
After completion, create `.planning/phases/06-agentic-business-action-receipts/06-02-SUMMARY.md`.
</output>
