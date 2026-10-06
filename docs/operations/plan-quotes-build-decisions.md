# Plan Quotes — build decisions (orchestrator, 2026-10-05). Binding.

Joel accepted D1–D5 as recommended. D1 is realised by AMENDING docs/adr/0006-mercator-capability-foundations.md (it already covers buyer Plans vs Provider packages); no new ADR. ADR 0005 is Datadog.

Worktree: /Users/joelchan/Documents/Coding/App-Dev/live/01. Pre-Implementation/aecon-plan-quotes (branch well-32/plan-quotes). No node_modules there yet.

## B1 Orchestration — @convex-dev/workflow 0.4.6 per Plan (supersedes RFC §8 reducer)
- Reuse the repo's existing WorkflowManager pattern (convex/capabilityProviderOffboarding.ts:1,44; convex/x402DirectoryIndexRefresh.ts:1,11).
- Workflow orchestrates only: per Node `step.runMutation(admitPlanNode)` → returns admitted{callRef} | noCall{outcome}; then `ctx.awaitEvent` keyed `${planRef}:${nodeId}`. Dependency-driven: a Node starts when its dependsOn Nodes succeed. Concurrency (≤3/Plan, ≤2/providerHost) enforced deterministically inside the workflow function.
- Paid dispatch stays in the existing Call lifecycle/workpool (dispatchEnqueue.ts). Workflow never dispatches or retries a purchase.
- Cancel = workflow cancel + stop admissions; in-flight Calls finish under their own lifecycle. Deadline = scheduled cancel at runDeadlineAt (use workflow/scheduler API, no sweep cron).
- Hold release + terminal Plan state in the workflow onComplete handler, gated by RFC §6 terminal gate.

## B2 Event bridge — convex-helpers Triggers (already installed and used)
- convex/usageTrackedMutation.ts:1-8 (customMutation/customCtx) and convex/lib/capabilityExecution/serviceUsage/sourceVersions.ts:3-40 (Triggers). Register a capabilityCalls trigger: when a doc with planRef transitions to financially conclusive (RFC §6:142 rule) → workflow.sendEvent. No per-writer edits. Verify every capabilityCalls writer is registered through the wrapper.

## B3 Money — capacity Hold (W0Money verdict FEASIBLE WITH CHANGE)
- Periods/account/legal availability are Formance balances (src/modules/money/formance-workflows.ts:474-506; formance-schema.ts:387-508). Plan Hold reserves the total ONCE across account, both spending periods and legal exposure (new Numscript template modelled on CALL_RESERVED_AUD, formance-transaction-templates.ts:146-209).
- Node Call reservation draws from the Hold with NO second capacity debit (new reserve variant); settle/release against original reserved capacity; Plan remainder release template.
- Chart: versioned branch `plans:<digest>:hold` (digest-segment convention, formance-schema.ts:107-139,526-540,608-646). Deterministic `ae-p4:<digest>:<stage>` refs + digest idempotency keys (templates.ts:720-760).
- Organization monthly fence (organization-monthly-spend-fence.ts:14-25) includes outstanding held exposure.
- Live proof: run the CI Formance docker compose locally (.github/workflows/kernel-release-gate.yml:51-79) with AE_FORMANCE_* on the local Convex deployment (convex/convex.config.ts:24-30). Unit fake exists: tests/unit/money/formance-treasury.test.ts:25-65.

## B4 Reuse, don't hand-roll
- JSON pointer: src/modules/common/json-pointer.ts:1-35; pointed sub-schema + validation: src/modules/capability-contract/internal/pointed-schema.ts:42-68 (@cfworker/json-schema).
- Digests: src/modules/common/canonical-digest.ts.
- Schema compatibility: conservative JSON-type-set check on pointed sub-schemas; anything else → untyped_ref (no new dependency).
- Cycle/stages: no installed package; one small pure Kahn function in plan/ is the only hand-written algorithm (flagged, ≤30 lines).
- Price class from existing fields only: publication pricingConfig `fixed_aud` → fixed; `managed_x402` exact → unknown unless cardinality_bounded (maxItems + unpaid worst-case probe via inputExamples); `upto_bounded` stays in the union but is unreachable until the importer admits `upto` (publication-importer-x402.ts:136-140).
- Action/route/MCP/CLI: existing defineAction pattern (quote.actions.ts, call.actions.ts, src/modules/actions/index.ts, mcp-toolsets.ts buy).
- UI: Arc items already vendored (DecisionPanel, Stepper, AgentRun) + Pro checkout-summary/payment-flow/timeline per docs/designs/arc-ui-refactor/protocol.md install convention.

## B5 Data
- One table capabilityPlans (RFC §4/§5) + capabilityCalls planRef?/planNodeId? + by_planRef index; plus workflowId on the plan.

## B6 Surprise bar (Joel: "surprise me") — acceptance targets, from PowerUser + StaffEng lenses
S1 Quote catches mistakes before spend: CLI/MCP/HTTP return identical digest/stages; cycle, bad pointer, schema mismatch refuse with no Hold.
S2 One exact AUD exposure: changed total refused on all surfaces; approval-required → awaiting_approval with no Hold, then reserve once.
S3 Survive a dead agent session: resume by planRef, watch/replay/cancel without re-buying; CLI watch = MCP get = HTTP GET.
S4 Keep good results on partial failure: receipts preserved, descendants skipped, no rollback claim; uncertain settlement blocks release.
S5 Bring Mercator plans over: serviceId/method/path resolves only to a unique admitted Tool, else fails closed.
S6 Cancellable Plans (Mercator: disconnect ≠ cancel, no MCP cancel tool).
S7 Typed edges fail closed (Mercator FlowPlan input schema is empty).
Guards: no stuck Hold (ambiguous → reconciliation_required), no double charge (node→Call identity, workflow never dispatches), no false success (Triggers → awaitEvent on financially conclusive only).

## B7 Process
Implementors = `task` (gpt-6-sol), ≤2 files each, exact acceptance, told not to typecheck; reviewers = `reviewer` (sol) read-only vs checklist; money/authority code additionally reviewed by `security-reviewer`. Orchestrator runs typecheck/lint once per wave. Real-use proof through ae CLI/MCP/HTTP on the local stack each wave.
