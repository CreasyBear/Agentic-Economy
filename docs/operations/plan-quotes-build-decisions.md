# Plan Quotes — build decisions (orchestrator, 2026-10-05). Binding.

Joel accepted D1–D5 as recommended. D1 is realised by AMENDING docs/adr/0006-mercator-capability-foundations.md (it already covers buyer Plans vs Provider packages); no new ADR. ADR 0005 is Datadog.

Worktree: /Users/joelchan/Documents/Coding/App-Dev/live/01. Pre-Implementation/aecon-plan-quotes (branch well-32/plan-quotes). Dependencies installed with the pinned Node/npm runtime.

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

## B8 Existing credit and Call consequences (2026-10-06 continuation)
- Joel authorized the current live funding for the final paid proof. The Account's current credit is promotional, so a purchased-only Hold cannot meet that requirement.
- Requires: exact authorized Plan, frozen original period/legal identity, and a valid purchased/promotional split claimed once in the admission transaction. Ensures: one aggregate capacity debit; node allocation draws only from the Hold; ordinary Provider obligation, treasury settlement and remedy controls remain atomic. Invariant: promotional credit stays attributed to its original grant and never becomes purchased sales revenue or GST. On violation or ambiguous ledger evidence, retain exposure and require reconciliation; never infer a refund or safe retry.
- Keep v1.7 unchanged. Grant Holds use existing `plans:<digest>:hold` leaves with a separate `plan_promotional_hold` digest domain. This adds no chart or template migration. Existing promotional transfer templates preserve grant identity on release; the existing expiry mechanism handles expired returns.
- Extend the existing frozen Call booking with optional Plan identity. Its absence retains exact legacy commands and hashes. Its presence selects the Plan AUD templates and original reserved periods while retaining Provider and promotional commands in the same atomic bulk. No separate dispatcher or financial lifecycle is added.
- Complexity decision: keep one Plan template module to isolate aggregate Hold accounting. Reuse the existing Call consequence functions and their readers/refund paths; a second Plan-specific Call lifecycle would duplicate uncertainty, recovery and Provider obligation logic. The added cost is a validated booking variant and grant-specific Hold addresses.
- Evidence so far: real local HTTP/CLI/MCP quote parity; required monthly exposure and transactional admission read; full `npm run check` passes. Execution, promotional Holds and terminal release still require behavioral and native-ledger proof before any production deployment.


## B9 Runtime boundaries and consistency (2026-10-06 continuation)
- Plan orchestration owns graph readiness, frozen aggregate authority and one-Call node attribution. The existing Call lifecycle owns all dispatch, Provider obligations, uncertainty and recovery. Money owns immutable ledger commands and grant accounting. A change to graph concurrency stays in Plans; a change to purchase recovery stays in Calls; a change to promotional grant accounting stays in Money.
- Requires exact approved total, matching persisted material and a current grant. Ensures at most one Hold and one ordinary Call per node. Invariant: no dependent admission or terminal release before financially conclusive evidence; cancellation persists intent before stopping the Workflow. On uncertainty retain the Hold and exposure for reconciliation.
- The external ledger spend read is bracketed by a Convex Plan-exposure digest. Admission rejects a changed digest or month and reads the current organization cap. This prevents a settlement between reads from disappearing from both settled spend and held exposure.
- Reuse the spending-period acknowledgement loop for Quotes and Plan Holds. The helper adds one shared call boundary and removes two implementations of externally observable revision acknowledgement; no new control state or retry service.
- Before Hold placement, refuse paid fixed-price Tools that the current Call booking cannot express with a Provider obligation. Free fixed-price and admitted managed-x402 Calls retain their implemented commercial paths. Do not manufacture a zero Provider obligation to make an unsupported purchase executable.
- A Plan run lasts at most 30 minutes and no longer than its grant. The scheduled deadline ends admission; admitted Calls retain their own recovery lifecycle.

## B10 Owner review and status presentation (2026-10-06 continuation)
- Owner approval requires the canonical current Account owner, signed source command, and an exact echo of the displayed Plan digest and AUD total. Revalidate frozen Tool and grant material before recording authority. Denial, expiry and stale material produce no Hold. A repeated matching decision replays; a changed decision cannot replace it. Owner-chat keeps the existing MFA consequence proof requirement.
- Keep a bounded owner history query and a detail query separate from the Agent gateway: owner identity is resolved by the existing business-actor boundary, never supplied by the browser. A small server adapter and route expose those records; the view model supplies the existing DecisionPanel, AgentRun and Call timeline components. Cost: one owner read/write adapter and a page controller; benefit: no second financial lifecycle, frontend authority or reusable UI framework.
- Cognitive-load audit (source, before rendered QA): review has four groups—maximum total/expiry, node limits with Provider hosts, execution stages, and data flows—and two decision buttons. The exact amount and disclosures remain on screen; the owner does not copy IDs or remember earlier screens. Move digests and raw ToolRefs to details; preserve individual receipt links. Status refresh must not advance recorded progress or replace a pending approval while it is being read. Target sizes and visual salience require rendered verification.

## B11 Chat and draft boundaries

- Requires a live key-backed chat turn, its frozen Plan quote and exact approved total. Ensures either one Call or one Plan occupies the shared execute slot, claimed before asynchronous work. Chat derives the replay key; the model cannot override authority, graph or payment facts. A stopped turn or mismatched quote refuses before Hold admission.
- Reuse the existing Plan quote/run cores behind separate internal chat registrations. The public source-write checks stay mandatory on public registrations; no caller-controlled authentication bypass is introduced. Quote persistence rechecks the turn after external price probes.
- Draft suggestion/import reads produce editable input only. Graph compatibility stays explicitly untyped until the canonical quote validates it. A Mercator selector must resolve uniquely to current admitted supply; it cannot grant authority or purchase anything.
- Complexity: the chat adapter adds one internal entry module while sharing the existing Plan state machine. Extract the chat Tool ID/name table to keep the already-large card projection below its maintained file ceiling. Keep both; duplicating Plan financial or authority logic would create conflicting guarantees.
- Owner approval displays frozen inputs as well as exact ceilings, Provider hosts and data transfers. Provider outputs render as escaped text. Plan totals project confirmed Call financial evidence; individual Calls retain their receipts.

## B12 Review window, current supply and paid approval

- Requires: live scoped authority, unchanged admitted Tool metadata, exact Plan inputs and a bounded AUD maximum. Ensures: an unpaid inspection can establish readiness for an already admitted managed x402 Tool; persistence rechecks its inspection target, current publication and schemas. A withdrawal during inspection refuses without another Plan or Call. Readiness never admits an external registry entry by itself.
- Approval-required quotes use the existing persisted requirement binding and send no Provider request. They require current published readiness. After owner approval, the existing unpaid probe accepts only a live Plan node whose resolved input, Principal and Tool match the approved Plan. Before approval, after termination, or for changed input, it refuses. The native approval test exercises the owner decision, Hold and both paid ordinary Calls.
- Apply the accepted 50-basis-point FX allowance when an older operations policy omits the optional Plan field. Store and display that allowance per node. Existing policy revision, spending caps and payment audience remain unchanged.
- A stored Plan maximum lasts through the existing commercial commitment window (bounded by grant and Tool readiness), rather than expiring with the initial 15-second price observation. Each node still obtains a fresh ordinary Quote and cannot exceed its frozen ceiling. Native tests wait 20 seconds after Plan quote before starting.
- Remainder allocation comparisons use canonical digests: Convex property ordering cannot strand a proven unused Hold. Grant order and exact units remain significant. Native purchased/promotional tests prove one capacity debit, truthful partial delivery, exact unused release and same-key replay; ambiguous payment plus cancellation retains the Hold.
- Complexity: reuse existing inspection, persisted requirement binding, canonical digest and ordinary Call mechanisms. The one internal node-probe query enforces approved disclosure at the last external-send boundary; keep it to avoid bypassing the existing approval rule. No new service, dependency or financial model.
- Call writer audit: Call admission/dispatch/completion/recovery, managed reservation/settlement/release/remedy, x402 payment/expiry and paid report registrations use `usageTrackedMutation`. The measurement migration explicitly wraps its DB with `usageSourceTriggers`; the Provider consequence journal writes its own table. Actual Workflow tests exercise the trigger across paid and free Calls. A conclusive sibling cannot clear another sibling's uncertainty.
