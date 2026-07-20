# Phase 1: Action invocation decomposition — Specification

**Created:** 2026-07-17
**Ambiguity score:** 0.12 (gate: ≤ 0.20)
**Requirements:** 7 locked
**Phase kind:** Design/planning only — no source, test, or build edits. Deliverable is a decision-complete SPEC + RESEARCH + PLAN set, not running code.

## Goal

Turn the qualitative decisions in ADR-009 (partial entry without Customer Request ownership), ADR-010 (one action plane across human and agent experiences), and the Action Invocation engineering specification (`.planning/specs/ACTION-INVOCATION-ENGINEERING-SPEC.md`, GitHub #193) into a buildable design in which **each of these is chosen exactly once, with rationale and blast-radius evidence, so an implementer who never saw this conversation can execute it without re-deciding**: (a) the seam-attachment shape, (b) the first standalone action, (c) the persistence decision, (d) the per-action authority binding, (e) the desired/observed/freshness/control state model, and (f) the barrier-hypothesis experiment. No source changes; the design stops at plan-checker green.

## Background

AE's current durable trust controls — preparation authority, idempotency, provider release, evidence, and recovery — are attached to a Customer Request aggregate. Confirmed in source:

- `src/modules/customer-request/agent-contract.ts` defines `customerRoutePlanSchema` (line 364) and `customerRoutePlanDecisionSchema` (line 508); route-level authority and repeat permission live in `customerRequestRepeatPermission*` schemas (lines 95, 793).
- `src/lib/server/customer-request-*-api.ts` (14 files: `customer-request-api.ts`, `-authorization-api.ts`, `-confirmation-api.ts`, `-route-action-api.ts`, `-recovery-api.ts`, `-inspect-api.ts`, etc.) route every step through the Request-owned lifecycle.
- `src/modules/customer-request/` carries the step handlers: `action-preparation.ts`, `preparation-authority.ts`, `preparation.ts`, `route-mandate-admission.ts`, `route-mandate.ts`, `route-plan-generation.ts`, `customer-projection.ts`, `option-inspection.ts`, `problem-tracking.ts`, `release-readback.ts`.
- `src/modules/actions/index.ts` is the single action registry; it already registers `customerRequestConfirmAction`, `customerRequestRunAction`, `customerRequestCancelAction`, `submitInquiryAction`, `registrySearchAction`, etc., each defined in a `<module>/<module>.actions.ts` file and typed `AnyAction` from `@/modules/common/action`.

What does NOT exist today: a durable control record for **one** independently resumable call to one registered action that can begin without a Customer Request; a discriminated invocation-origin tag (`request_owned | standalone`); a per-action paused authority gate addressed by an invocation reference; and a separated desired/observed/freshness/control state projection independent of the RoutePlan. ADR-009 explicitly rejects introducing an `EconomicOperation` schema; the engineering spec proposes `Action Invocation` as the narrow control identity and leaves the persistence choice to source-mapped, blast-radius-scored analysis.

The claimed barrier — "approving a whole route is too high a barrier, so a caller should authorize individually useful tasks one at a time" — is an admitted **hypothesis, not evidenced** (ADR-009 §Product journey; the ADR gates require evals, not assertion). This phase designs the experiment; it does not run it.

## Requirements

Each requirement's Acceptance is a check against the produced design artifacts (SPEC/RESEARCH/PLAN + pattern map), because this is a design-only phase.

1. **Seam-attachment decision is chosen once**: The design selects exactly one seam shape for how a standalone call attaches to the existing pipeline.
   - Current: The engineering spec §1/§12 names the registered-action module as the single seam but does not choose among (i) an adapter over existing Request-owned step handlers carrying discriminated `request_owned | standalone` origin, (ii) a new `action-invocation` module, or (iii) an extracted shared step-core reused by both Request and standalone callers.
   - Target: RESEARCH scores all three options on files×callsites touched, reversibility (two-way vs one-way door), and reuse of existing `src/modules/customer-request/` handlers + `src/modules/actions/index.ts`; PLAN commits to one with a written rationale and a lowest-blast-radius justification per spec §12 ("in-memory adapter for evals" first).
   - Acceptance: PLAN contains exactly one selected seam option with a rationale paragraph, a blast-radius table, and the rejected options recorded; a reader can name the chosen seam and why in one sentence.

2. **First standalone action is chosen once**: The design names the single consequential registered action used for slice one, and proves it can express a paused authority gate.
   - Current: Spec §12 prefers qualified inquiry (`submitInquiryAction` in `src/modules/inquiries/inquiry.actions.ts`) if its contract can express a paused authority gate and attributable delivery without implying booking/fulfilment; otherwise a provider-simulated action.
   - Target: RESEARCH checks the current `submitInquiryAction` contract and admission path against AGENTS.md boundaries (no booking/payment/dispatch/autonomy) and the paused-authority requirement; PLAN selects inquiry or the provider-simulated action and records the deciding evidence.
   - Acceptance: PLAN names one first action, cites the source contract it inspected (`path:line`), and states whether the paused-authority gate is expressible in the current contract or requires the simulator — with the reason.

3. **Persistence decision is chosen once under Convex guardrails**: The design decides whether the invocation control record reuses an existing source-owned record or needs a new Convex table.
   - Current: ADR-009 permits a new table only when the source map shows an existing record would mix incompatible meanings or force optional Request lineage; the engineering spec §9 keeps a current projection + append-only transition/attempt/authority/evidence records; `skill://ae-convex-guardrails` governs schema-fragment composition and the `node:` import trap.
   - Target: RESEARCH maps candidate existing records (Action Attempt / prepared-action / run) and shows whether any can carry standalone origin without weakening Request fields; PLAN commits to reuse-or-new-table with the additive-schema rule (`v.optional()` on new fields) and the schema-fragment composition location.
   - Acceptance: PLAN states one persistence choice, cites the existing record(s) it evaluated (`path:line`), and — if a new table — justifies it against ADR-009's "new table only when…" rule and names the schema fragment file that would own it.

4. **Per-action authority binding is specified as falsifiable rules**: The design specifies how authority binds one invocation and invalidates on material change.
   - Current: Route-level authority today binds a whole RoutePlan (`customerRoutePlanDecisionSchema`, repeat-permission). ADR-010 §Interaction/Generative-UI boundaries require approval bound to exact inputs/target/consequence/freshness and no cross-task authority inheritance; spec §7 lists the exact bound fields.
   - Target: SPEC + PLAN state the authority-reference binding fields (invocation reference, invocation version, prepared-input digest, principal, target, allowed effect, spend/data limits, expiry) and the exact set of material changes that invalidate the reference.
   - Acceptance: PLAN enumerates the bound fields and the invalidation triggers as a list an implementer can turn into assertions; it states explicitly that approval of one action grants no authority to any other action (ADR-009 gate 10, ADR-010 gate 7).

5. **Desired/observed/freshness/control state model is defined**: The design defines the four-dimension state model and forbids collapsing it into one enum.
   - Current: Current customer-facing state is projected from the RoutePlan generation; there is no invocation-scoped separation of desired vs observed vs freshness vs control state.
   - Target: SPEC defines each dimension, its allowed values (including `unknown` external effect and `reconcile_before_retry`), and the rule that no single status enum may collapse them (spec §5).
   - Acceptance: PLAN carries a table with the four dimensions, example values per dimension, and one worked example (e.g. inquiry sent-but-unacknowledged → desired=sent, observed=unknown, freshness=stale, control=reconciling); the "no collapsing enum" prohibition appears as a negative acceptance criterion.

6. **Barrier hypothesis is designed as an explicit, falsifiable experiment (not run)**: The design specifies how the "whole-route approval is too high a barrier" claim would be measured.
   - Current: The barrier is asserted in ADR-009 as motivation but has no measurement design; no A/B or funnel change is authorized here.
   - Target: SPEC + PLAN specify the experiment as a deliverable: the comparison (per-action authorization vs whole-route approval), the observable metric(s), the pass/fail threshold, and the explicit note that running it needs live-funnel changes + separate authorization.
   - Acceptance: PLAN contains an "experiment design" section naming the two arms, the metric, a predeclared threshold, and a sentence stating the experiment is designed-only and unbuilt in this phase.

7. **Naming discipline and plain-language glossary hold across all artifacts**: Every new name is plain-English and glossed.
   - Current: ADR-009 rejects `EconomicOperation`; the plan forbids coined nouns (`*-primitive`, `*-kernel`, `wedge`, `adr11-*`, `economic-action-*`).
   - Target: SPEC/RESEARCH/PLAN use verb+object names (`actionInvocation`, `invocationOrigin`, `attemptRef`) and carry a glossary defining every new term in one jargon-free sentence.
   - Acceptance: A grep of the three artifacts for `EconomicOperation`, `economic-action`, `adr11`, `-primitive`, `-kernel`, `wedge` returns zero hits except where quoting the ADR's own rejection; every new name in the artifacts appears in the glossary.

## Boundaries

**In scope:**
- GSD planning artifacts for phase `01-action-invocation-decomposition`: `01-SPEC.md`, `01-RESEARCH.md`, `01-*-PLAN.md`, and a codebase pattern-map artifact.
- Source-grounded current-state review (read-only) of the Customer Request pipeline, action registry, and authority path, cited by `path:line`.
- A blast-radius comparison of the three seam options and one chosen answer for each of the six decision axes.
- An ADR-amendment *recommendation* (if a conclusion would change an ADR), recorded inside the RESEARCH output per `.planning/records/README.md`.
- ROADMAP.md / STATE.md updates marking the phase registered and planned.

**Out of scope:**
- Any edit under `src/`, `convex/`, `tests/`, or build config — read-only on all code (design phase).
- Changing an ADR's `status`, superseding an ADR, or closing GitHub #193 — this phase records recommendations, not decisions on the ADRs themselves.
- Running `execute-phase` / spawning `gsd-executor` — source implementation is a separate, explicitly-authorized phase.
- Running the barrier A/B experiment — designed only; needs live-funnel changes + separate authorization.
- Selecting a commercial wedge, introducing a universal Task/EconomicOperation schema, or replacing Customer Request / RoutePlan / RouteMandate (spec §Out of Scope).
- Bundle-owned lineage implementation — spec §4 reserves it until reference-only composition passes its eval; the design may name it as future but must not build it.

## Constraints

- Design must honor `skill://ae-actions-and-modules` (ActionDefinition/surfaces pattern; owner-only actions never reach `agentTools`) and `skill://ae-convex-guardrails` (schema-fragment composition; no `node:` import in a Convex-reachable module graph; additive `v.optional()` schema changes).
- Public/assistant-visible copy language rules from AGENTS.md apply to any wording that could surface: no `wallet`, `credits`, booking/payment/dispatch/autonomy claims; no internal architecture words on human surfaces.
- Existing Request-owned traces must remain valid — the design must use discriminated lineage at the seam and an adapter for historical records; it must not make existing Request fields broadly optional (spec §Further Notes, ADR-009).
- All `path:line` citations in RESEARCH must resolve against the working tree at design time.

## Acceptance Criteria

- [ ] `.planning/phases/01-action-invocation-decomposition/01-SPEC.md` exists with all template sections and ambiguity ≤ 0.20.
- [ ] RESEARCH.md exists and scores the three seam options on files×callsites, reversibility, and reuse, with a blast-radius table.
- [ ] PLAN commits to exactly one answer for each of the six decision axes (seam, first action, persistence, authority binding, state model, barrier experiment), each with rationale.
- [ ] A codebase pattern-map artifact exists mapping new design elements to their closest existing analogs.
- [ ] At least 10 `path:line` citations in RESEARCH resolve to real code; zero fabricated anchors.
- [ ] `git status --porcelain` shows changes only under `.planning/`; nothing under `src/`, `convex/`, `tests/`.
- [ ] No ADR `status` changed, no ADR superseded, #193 not closed; any ADR-impacting conclusion recorded as an amendment recommendation in RESEARCH.
- [ ] Every new name appears in the plain-language glossary; forbidden-token grep returns zero hits outside ADR-rejection quotes.
- [ ] plan-checker (or manual plan-checker per the AE GSD skill) passes; the phase stops before execute-phase.

## Edge Coverage

**Coverage:** 5/5 applicable edges resolved · 0 unresolved

| Category | Requirement | Status | Resolution / Reason |
|----------|-------------|--------|---------------------|
| Boundary (contract expressiveness) | R2 | ✅ covered | If inquiry contract cannot express a paused authority gate, PLAN selects the provider-simulated action and records why (AC on R2). |
| State (uncertain external effect) | R5 | ✅ covered | Four-dimension model must represent `unknown` observed + `reconcile_before_retry` control; worked example required. |
| Authority (cross-task leakage) | R4 | ✅ covered | Negative acceptance criterion: approval of one action grants no authority to another. |
| Migration (historical records) | R3 | ✅ covered | Design must keep existing Request fields non-optional; adapter for historical Request-owned records. |
| Naming (coined jargon regression) | R7 | ✅ covered | Forbidden-token grep is an acceptance criterion. |

## Prohibitions (must-NOT)

**Coverage:** 6/6 applicable prohibitions resolved · 0 unresolved

| Prohibition (must-NOT statement) | Requirement | Status | Verification / Reason |
|----------------------------------|-------------|--------|------------------------|
| MUST NOT edit `src/`, `convex/`, `tests/`, or build config | R1–R6 | resolved / test | `git status --porcelain` shows only `.planning/` changes. |
| MUST NOT change ADR status, supersede an ADR, or close #193 | R7 | resolved / judgment | Review ADR frontmatter unchanged; recommendation recorded in RESEARCH. |
| MUST NOT introduce a universal `EconomicOperation`/Task schema | R3, R7 | resolved / test | Forbidden-token grep; PLAN chooses reuse-or-narrow-record. |
| MUST NOT make existing Request lineage fields broadly optional | R3 | resolved / judgment | RESEARCH states discriminated-lineage + adapter approach. |
| MUST NOT treat approval of one action as authority for another | R4 | resolved / test | Negative acceptance criterion enumerated in PLAN. |
| MUST NOT run the barrier A/B or any live-funnel change | R6 | resolved / judgment | Experiment marked designed-only; no funnel edits in `.planning/` scope. |

## Ambiguity Report

| Dimension          | Score | Min  | Status | Notes                                                        |
|--------------------|-------|------|--------|--------------------------------------------------------------|
| Goal Clarity       | 0.90  | 0.75 | ✓      | Six decision axes are explicit and measurable as artifacts.  |
| Boundary Clarity   | 0.92  | 0.70 | ✓      | Explicit design-only in/out lists; ADR/#193 untouched.       |
| Constraint Clarity | 0.80  | 0.65 | ✓      | AE guardrail skills + copy rules + discriminated-lineage.    |
| Acceptance Criteria| 0.85  | 0.70 | ✓      | Each requirement resolves to a checkable artifact condition. |
| **Ambiguity**      | 0.12  | ≤0.20| ✓      | Locked by ADR-009/010 + engineering spec as bounded inputs.  |

## Interview Log

| Round | Perspective     | Question summary                                    | Decision locked                                                                 |
|-------|-----------------|----------------------------------------------------|----------------------------------------------------------------------------------|
| 1     | Researcher      | What exists today for partial entry?               | Nothing standalone; controls bound to Customer Request aggregate (source-cited). |
| 2     | Simplifier      | Irreducible core of this design phase?             | Six decisions each chosen once with rationale; no source edits.                  |
| 3     | Boundary Keeper | What is explicitly NOT this phase?                 | Source edits, ADR status changes, #193 closure, running the A/B, bundle lineage. |
| 4     | Failure Analyst | What makes a verifier reject the output?           | Undecided axes, fabricated `path:line`, coined jargon, source-tree changes.      |
| 5     | Seed Closer     | Is the barrier a fact or hypothesis?               | Hypothesis — designed as a falsifiable experiment, not run.                      |

*(--auto equivalent: ADR-009, ADR-010, and the engineering spec lock WHAT/WHY; rounds recorded as the perspectives applied while authoring against those locked inputs.)*

---

*Phase: 01-action-invocation-decomposition*
*Spec created: 2026-07-17*
*Next step: /gsd-discuss-phase 1 — implementation-context decisions (how to build what's specified above)*
