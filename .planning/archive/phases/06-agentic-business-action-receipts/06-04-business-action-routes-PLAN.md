---
phase: 06-agentic-business-action-receipts
plan: "06-04"
type: execute
wave: 3
depends_on: ["06-02"]
files_modified:
  - src/routes/owner.business-actions.tsx
  - src/routes/owner.business-actions.$requestId.tsx
  - src/routes/owner.business-actions.$requestId.receipt.tsx
  - src/routes/admin.business-actions.tsx
  - src/routes/admin.business-actions.$requestId.tsx
  - tests/integration/business-action-route-readbacks.test.ts
autonomous: true
requirements: [P6-R4, P6-R8, P6-R9, P6-R10, P6-R13]
user_setup: []
execution_scope: source_local_hackathon_spike
production_executable: false
must_haves:
  truths:
    - id: p6-routes-source-owned
      statement: "Owner/admin routes derive readbacks from source-owned server seams and never mint authority or route-local truth."
    - id: p6-route-redaction
      statement: "Public-safe route output excludes raw prompts, traces, provider payloads, Stripe payloads, customer identifiers, private endpoint refs, API keys, and webhook secrets."
    - id: p6-route-evidence-separation
      statement: "Routes display GuardrailDecisionEvidence separately from post-checkpoint ExternalEvidenceEvent."
  artifacts:
    - path: src/routes/owner.business-actions.tsx
      provides: "Owner business-action queue/readback route."
    - path: src/routes/admin.business-actions.tsx
      provides: "Admin/operator reconstruction route."
    - path: tests/integration/business-action-route-readbacks.test.ts
      provides: "Owner/admin/private verifier route-readback tests."
  key_links:
    - from: route loaders
      to: src/modules/business-action/business-action.functions.ts
      via: "Routes use server seam only, not internal modules or fixtures."
---

<objective>
Add owner and admin route adapters for Phase 6 queue, checkpoint, receipt, and reconstruction readbacks.

Purpose: make the receipt chain inspectable without public production claims or route-local truth.
Output: owner/admin/private verifier route adapters and route-readback integration tests.
</objective>

<execution_context>
@/Users/skchan/Jcsyc_Projects/agentic-economy/.codex/gsd-core/workflows/execute-plan.md
@/Users/skchan/Jcsyc_Projects/agentic-economy/.codex/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/06-agentic-business-action-receipts/06-PATTERNS.md
@.planning/phases/06-agentic-business-action-receipts/06-02-SUMMARY.md
@src/modules/business-action/business-action.functions.ts
@src/routes/owner.actions.tsx
@src/routes/owner.actions.$proposalId.tsx
@src/routes/owner.actions.$proposalId.receipt.tsx
@src/routes/admin.protected-actions.tsx
</context>

<preflight_gates>
- Requires 06-02 source persistence summary.
- Public production route copy remains BLOCKED.
- No external provider proof is claimed.
</preflight_gates>

<hackathon_spike_exception>
This plan may expose owner/admin/private readbacks for local hackathon demonstration. It may not publish production autonomous/payment claims or public success copy.
</hackathon_spike_exception>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Add owner request checkpoint and receipt readbacks</name>
  <files>src/routes/owner.business-actions.tsx, src/routes/owner.business-actions.$requestId.tsx, src/routes/owner.business-actions.$requestId.receipt.tsx, tests/integration/business-action-route-readbacks.test.ts</files>
  <read_first>.planning/phases/06-agentic-business-action-receipts/06-PATTERNS.md, src/modules/business-action/business-action.functions.ts, src/routes/owner.actions.tsx, src/routes/owner.actions.$proposalId.tsx</read_first>
  <action>Add owner queue/detail/receipt routes that read source-owned server functions. Render checkpoint outcomes accepted, refused, clarification_required, proof_gap, and expired. Render result artifact state as endpoint descriptor, JSON schema, private ref present, or proof_gap. Wrong owner must fail closed. Routes must not import `src/modules/business-action/internal/*` or define route-local Business Action arrays.</action>
  <verify>npx vitest run tests/integration/business-action-route-readbacks.test.ts && npm run test:imports</verify>
  <acceptance_criteria>
    - Owner routes use server seams only.
    - Wrong-owner readbacks fail closed.
    - Private evidence refs are redacted from public-safe output.
  </acceptance_criteria>
  <done>Owner readbacks inspect source truth without minting authority.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Add admin/operator reconstruction readbacks</name>
  <files>src/routes/admin.business-actions.tsx, src/routes/admin.business-actions.$requestId.tsx, tests/integration/business-action-route-readbacks.test.ts</files>
  <read_first>src/routes/admin.protected-actions.tsx, src/modules/business-action/business-action.functions.ts, .planning/SECURITY-SPEC.md</read_first>
  <action>Add admin/operator reconstruction routes for request, checkpoint, guardrail decision, Hermes/external evidence, receipt, support/no-repair, and private evidence metadata. Display GuardrailDecisionEvidence separately from post-checkpoint ExternalEvidenceEvent. Do not expose raw prompts, traces, provider payloads, Stripe payloads, private endpoint refs, customer identifiers, API keys, or webhook secrets.</action>
  <verify>npx vitest run tests/integration/business-action-route-readbacks.test.ts</verify>
  <acceptance_criteria>
    - Admin route reconstructs success, refusal, and proof_gap states.
    - Guardrail allow/block/refusal is visibly separate from downstream evidence.
    - Redaction assertions cover every private evidence family.
  </acceptance_criteria>
  <done>Admin reconstruction is source-owned and redacted.</done>
</task>

</tasks>

<verification>
- [ ] npx vitest run tests/integration/business-action-route-readbacks.test.ts
- [ ] npm run test:imports
- [ ] npm run typecheck
</verification>

<success_criteria>
- Routes derive from source state.
- No route-local demo fixtures exist.
- No production/public proof is claimed.
- Closeout states `source/local proof only` and `production proof not claimed`.
</success_criteria>

<output>
After completion, create `.planning/phases/06-agentic-business-action-receipts/06-04-SUMMARY.md`.
</output>
