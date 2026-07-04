---
phase: 06-agentic-business-action-receipts
plan: "06-06"
type: execute
wave: 4
depends_on: ["06-01", "06-05"]
files_modified:
  - package.json
  - src/lib/ui/contract-scans.ts
  - tests/copy/phase6-business-action-claims.test.ts
  - tests/copy/claims-register.test.ts
  - tests/copy/phase1-banned-copy.test.ts
  - tests/fixtures/bad-copy/overclaim.fixture
  - tests/seo/business-action-claims.test.ts
  - tests/imports/source-mining.test.ts
  - tests/deploy-smoke/phase6-business-action-stripe-smoke.spec.ts
autonomous: true
requirements: [P6-R1, P6-R2, P6-R6, P6-R7, P6-R10, P6-R11, P6-R13]
user_setup: []
execution_scope: source_local_hackathon_spike
production_executable: false
must_haves:
  truths:
    - id: p6-copy-claim-gate
      statement: "Phase 6 copy/source/SEO scans reject unsupported autonomous/payment/marketplace/wallet/custody/settlement/API-commerce language."
    - id: p6-owned-contexts
      statement: "Receipt-backed business operation terms are allowed only in Phase 6-owned or source-proven contexts."
    - id: p6-fail-loud-smoke
      statement: "Phase 6 Stripe provider smoke fails loudly without configured deployed evidence and cannot be counted as external proof unless it passes."
    - id: p6-closeout-wording
      statement: "Every summary must state source/local proof only, production proof not claimed, and provider-smoke status not counted as external proof unless configured evidence passes."
  artifacts:
    - path: src/lib/ui/contract-scans.ts
      provides: "Phase 6 copy/source drift rules."
    - path: tests/deploy-smoke/phase6-business-action-stripe-smoke.spec.ts
      provides: "Fail-loud provider smoke."
    - path: tests/copy/phase6-business-action-claims.test.ts
      provides: "Phase 6 claim and overclaim coverage."
  key_links:
    - from: GTM claim row
      to: copy scanner
      via: "Allowed phrase requires source-owned receipt chain and support/kill-rule proof."
    - from: provider smoke
      to: closeout
      via: "Fail-loud absence cannot count as external proof."
---

<objective>
Add Phase 6 copy/source/SEO scans and fail-loud provider smoke gates so the receipt-backed business operation proof cannot become a production autonomous/payment/marketplace claim by accident.

Purpose: preserve truth between source-local hackathon proof and public/deployed production claims.
Output: scanner updates, copy/SEO/source tests, fail-loud provider smoke, package script.
</objective>

<execution_context>
@/Users/skchan/Jcsyc_Projects/agentic-economy/.codex/gsd-core/workflows/execute-plan.md
@/Users/skchan/Jcsyc_Projects/agentic-economy/.codex/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/GTM-READINESS.md
@.planning/SECURITY-SPEC.md
@.planning/phases/06-agentic-business-action-receipts/06-PATTERNS.md
@.planning/phases/06-agentic-business-action-receipts/06-01-SUMMARY.md
@.planning/phases/06-agentic-business-action-receipts/06-05-SUMMARY.md
@src/lib/ui/contract-scans.ts
@tests/copy/claims-register.test.ts
@tests/deploy-smoke/phase5-paid-activation-provider-smoke.spec.ts
</context>

<preflight_gates>
- Requires 06-01 domain summary and 06-05 support/control summary.
- Production public claims remain BLOCKED.
- Provider smoke may exist but cannot count as proof unless configured evidence passes.
</preflight_gates>

<hackathon_spike_exception>
This plan may allow tightly scoped hackathon/demo wording only in source-owned Phase 6 contexts. It must reject production autonomous/payment/marketplace claims.
</hackathon_spike_exception>

<copy_and_public_truth>
Allowed phrase `receipt-backed autonomous business operation` requires source-owned readback, receipt verifier, support/kill rule, and scan coverage. It must not imply production support, self-approval, live money, wallet, custody, settlement, product marketplace, or generic API marketplace.
</copy_and_public_truth>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Extend copy and source scanners for Phase 6</name>
  <files>src/lib/ui/contract-scans.ts, tests/copy/phase6-business-action-claims.test.ts, tests/copy/claims-register.test.ts, tests/copy/phase1-banned-copy.test.ts, tests/fixtures/bad-copy/overclaim.fixture, tests/imports/source-mining.test.ts</files>
  <read_first>.planning/phases/06-agentic-business-action-receipts/06-PATTERNS.md, .planning/GTM-READINESS.md, src/lib/ui/contract-scans.ts</read_first>
  <action>Extend `PhaseNumber` to include 6. Add Phase 6-owned contexts for planning docs, `src/modules/business-action/`, `convex/businessActions.ts`, `convex/businessActionStore.ts`, owner/admin business-action routes, and Phase 6 tests. Allow Business Action Card, Capability Request, authorization checkpoint, GuardrailDecisionEvidence, ExternalEvidenceEvent, Action Receipt, receipt-backed software operation, and Hermes-run paid intake provisioning only in owned/proven contexts. Fail on self-approving agent, unbounded autonomous spend, instant purchase, agent checkout, AE wallet, AE credits, AE custody, seller payout, marketplace settlement, Connect, x402, product marketplace, generic API marketplace, production autonomous payment support, generic `executeAction`, broad `proposeAction`, `actionSlug: string`, provider `other`, `paymentRequired: true`, `callable: true`, route-local Business Action arrays, and client-supplied money/provider fields.</action>
  <verify>npx vitest run tests/copy/phase6-business-action-claims.test.ts tests/copy/claims-register.test.ts tests/copy/phase1-banned-copy.test.ts tests/imports/source-mining.test.ts && npm run test:copy && npm run test:source-mining</verify>
  <acceptance_criteria>
    - Phase 6 allowed phrases are scoped to owned/proven contexts.
    - Forbidden marketplace/payment/wallet/autonomous/runtime terms fail scans.
    - Source-mining scan rejects generic action and route-local fixture drift.
  </acceptance_criteria>
  <done>Copy/source scans protect Phase 6 public truth.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Add SEO claim tests and closeout wording gate</name>
  <files>tests/seo/business-action-claims.test.ts, tests/copy/phase6-business-action-claims.test.ts, tests/copy/claims-register.test.ts</files>
  <read_first>.planning/GTM-READINESS.md, .planning/phases/06-agentic-business-action-receipts/06-DISCUSSION-LOG.md, tests/seo/paid-activation-claims.test.ts</read_first>
  <action>Add SEO/copy tests proving demo copy may say `receipt-backed autonomous business operation` only when source-owned Phase 6 evidence, support/kill-rule proof, and scan context are present. Add a test or fixture rule requiring closeout summaries to state `source/local proof only`, `production proof not claimed`, and that provider-smoke status is not external proof unless configured evidence passes.</action>
  <verify>npx vitest run tests/seo/business-action-claims.test.ts tests/copy/phase6-business-action-claims.test.ts tests/copy/claims-register.test.ts</verify>
  <acceptance_criteria>
    - SEO/copy tests reject production autonomous/payment phrasing.
    - Closeout wording rule is test-covered.
  </acceptance_criteria>
  <done>SEO and closeout copy cannot overclaim Phase 6 proof.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Add fail-loud Phase 6 provider smoke</name>
  <files>package.json, tests/deploy-smoke/phase6-business-action-stripe-smoke.spec.ts</files>
  <read_first>tests/deploy-smoke/phase5-paid-activation-provider-smoke.spec.ts, .planning/phases/06-agentic-business-action-receipts/06-MONEY-EVIDENCE-DECISION.md</read_first>
  <action>Add `npm run test:provider-smoke:business-action-stripe`. The smoke must fail loudly without deployed base URL, test-mode Stripe evidence refs, request/checkpoint/receipt IDs, support/kill-rule row, and redacted operator next action. It must reject screenshots, return URLs, dashboards, env vars, or webhook arrival alone as proof.</action>
  <verify>npm run test:provider-smoke:business-action-stripe</verify>
  <acceptance_criteria>
    - Missing env/evidence produces a clear failure listing all required inputs.
    - Passing smoke requires source-owned request/checkpoint/receipt/support evidence.
    - Local source closeout records fail-loud smoke as not external proof.
  </acceptance_criteria>
  <done>Provider smoke cannot silently skip or create false deployed proof.</done>
</task>

</tasks>

<verification>
- [ ] npx vitest run tests/copy/phase6-business-action-claims.test.ts tests/copy/claims-register.test.ts tests/copy/phase1-banned-copy.test.ts tests/seo/business-action-claims.test.ts tests/imports/source-mining.test.ts
- [ ] npm run test:copy
- [ ] npm run test:source-mining
- [ ] npm run test:seo
- [ ] npm run test:provider-smoke:business-action-stripe
</verification>

<success_criteria>
- All tasks completed.
- Copy/source/SEO scans pass.
- Provider smoke fails loudly unless configured evidence passes.
- Closeout states `source/local proof only` and `production proof not claimed`.
</success_criteria>

<output>
After completion, create `.planning/phases/06-agentic-business-action-receipts/06-06-SUMMARY.md`.
</output>
