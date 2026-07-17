# Phase 2: One action plane cross-surface parity — Specification

**Created:** 2026-07-17
**Ambiguity score:** 0.13 (gate: ≤ 0.20)
**Requirements:** 6 locked
**Phase kind:** Design/planning only — no source, test, or build edits. Deliverable is a decision-complete SPEC + RESEARCH + PLAN set, not running code.

## Goal

Turn ADR-010 (one action plane across human and agent experiences) into a buildable design in which **each of these is chosen exactly once, with rationale and source-grounded evidence, so an implementer who never saw this conversation can execute it without re-deciding**: (a) the semantic-outcome-parity contract between the embedded AE agent and at least one external-agent surface, (b) how the registered action stays the single interface and host adapters are prevented from implementing business rules, (c) the structured non-visual equivalent that every rich projection must have, (d) which generative-UI projection families are modelled first and their boundary, (e) the reconstruct-from-records rule that makes conversation and component state disposable, and (f) the parity eval that makes ADR-010's 10 acceptance gates falsifiable. This phase **consumes Phase 1's Action Invocation interface and state model — it does not re-decide the seam, persistence, or authority binding.** No source changes; the design stops at plan-checker green.

## Background

ADR-010 requires the embedded AE agent, external calling agents, and the human UI to call the **same** registered actions and authoritative work records, preserving **semantic outcome parity** (not identical presentation) across seven dimensions: business info/source/freshness; available actions/required info; suitability/comparison rules; authority/data-use boundaries; attempt/idempotency/retry meaning; evidence/refusal/contradiction/unknown state; allowed continuations/final outcome.

What exists today (source-confirmed):

- `src/modules/customer-request/cross-surface-parity.ts:24-49` `compareCustomerRequestSurfaces` compares only **6 terminal-state dimensions** (`requestRef`, `revision`, `state`, `evidenceState`, `resultDigest`, `businesses`) plus a human-reload-resume flag. It is **Request-scoped and outcome-focused** — it is not the ADR-010 action-plane parity across the seven richer dimensions, and it is keyed to `requestRef`, not to an action/invocation.
- `src/modules/customer-request/customer-projection.ts` holds the customer-semantic projection functions — `projectCustomerRequest` (line 132), `projectRequestEvaluation` (line 152), `projectPreparingOptions` (line 353), `projectOptionsReady` (line 364), `projectNeedsAttention` (line 397) — which map to ADR-010's generative-UI projection families, but are **Request-scoped** and have no declared structured-non-visual-equivalent contract tying each rich projection to an invocation + version.
- `src/modules/customer-request/public-comprehension.ts` and `hosted-agent-journey.ts`, `direct-agent-baseline.ts`, `agent-access.ts` provide the external-agent journey and the direct-agent negative control, but there is no single semantic-parity harness asserting the seven dimensions across the embedded and external surfaces for one registered action.
- `src/modules/common/action.ts` is the single action definition consumed by every host (`ActionSurface = 'ui' | 'http' | 'agentJson' | 'answerThread'`, line 26; `describeActionForAgent`, lines 118-142). There is no enforcement today that a host adapter cannot implement eligibility/authority/retry/evidence rules of its own.

What does NOT exist: an action/invocation-scoped seven-dimension parity contract; a rule that every rich projection has a structured non-visual equivalent addressed to the same invocation + version; a host-adapter boundary mechanism; a modelled set of generative-UI projection families with an invent-nothing boundary; a reconstruct-from-records guarantee independent of the transcript. ADR-010 states these as interaction hypotheses whose value/accessibility must be evaluated before implementation scope is accepted.

This phase does not implement any of it; it produces the buildable design and the falsifiable eval.

## Requirements

Each Acceptance is a check against the produced design artifacts, because this is a design-only phase.

1. **Semantic-parity contract chosen once**: The design specifies exactly what must be equal across the embedded AE agent and one external-agent surface.
   - Current: `compareCustomerRequestSurfaces` (`cross-surface-parity.ts:24-49`) covers only 6 terminal dimensions, Request-scoped.
   - Target: SPEC + PLAN define the parity contract over ADR-010's seven dimensions, keyed to a registered action + invocation (not a whole Request), and state which existing parity code is extended vs replaced.
   - Acceptance: PLAN lists the seven dimensions as checkable equalities, cites the existing parity function it extends (`path:line`), and states the one first action the contract is proven against.

2. **Host-adapter boundary enforcement chosen once**: The design decides how host adapters are kept to transport/conversation/rendering and prevented from implementing eligibility/preparation/authority/execution/retry/evidence/recovery.
   - Current: The single action definition exists (`action.ts`) but nothing prevents a host from re-implementing business rules.
   - Target: PLAN commits to one enforcement mechanism (e.g. a typed host-adapter interface that can only call the registered action + read authoritative projections, with a lint/import boundary or test that fails if a host module imports business-rule internals).
   - Acceptance: PLAN names the enforcement mechanism, the boundary it draws (which imports/capabilities a host adapter may and may not have), and how a violation is detected — as a check an implementer can build.

3. **Structured non-visual equivalent contract chosen once**: The design specifies that every rich projection has a structured non-visual form addressed to the same invocation + version.
   - Current: Projection functions exist but are Request-scoped with no invocation-addressed structured-equivalent contract.
   - Target: SPEC + PLAN define the rule: for each generative-UI projection there is a structured (non-visual) representation carrying the same options/consequences/evidence/continuations, addressed to the same `invocationRef` + invocation version, so a UI decision and an external-agent decision resume the same paused invocation.
   - Acceptance: PLAN states the equivalence rule and one worked pair (a rich approval view ↔ its structured form) referencing the same invocation reference/version; a reader can name what "equivalent" means as a testable equality.

4. **Generative-UI projection families chosen once**: The design names which of ADR-010's six projection families are modelled first and states their invent-nothing boundary.
   - Current: `customer-projection.ts` functions approximate several families but are not organized as the ADR-010 family set nor bounded against inventing facts/controls/authority.
   - Target: PLAN selects the first-slice families (from: current objective/constraints/known-unknowns; candidate/option comparison; material clarification; bounded approval; progress/ownership/waiting; contradiction/incident/recovery), maps each to its existing projection analog (`path:line`), and states the boundary that a projection may only select/populate from registered actions + authoritative state and may not invent business facts, actions, controls, consequences, or authority.
   - Acceptance: PLAN lists the chosen families, their existing analogs, and the invent-nothing boundary as a negative acceptance criterion.

5. **Reconstruct-from-records rule chosen once**: The design specifies that the current view is reconstructable from authoritative records without replaying the transcript, and that conversation/component state is disposable cache.
   - Current: Human reload-resume is checked narrowly (`cross-surface-parity.ts:36`); there is no general rule tying reconstruction to Action Invocation/authority/attempt/evidence/result records.
   - Target: SPEC + PLAN state the rule and what a host cache may retain (transport cursors, presentation preferences, a pending-interaction reference) vs what it may never be the source of truth for.
   - Acceptance: PLAN states the reconstruction rule and the disposable-cache boundary as checkable assertions (reopen after restart → same view from records; transcript deletion → no lost work).

6. **Parity eval designed as a falsifiable suite (not run)**: The design specifies how ADR-010's 10 acceptance gates are proven.
   - Current: No cross-surface parity eval keyed to a registered action exists; existing tests are Request-lifecycle tests.
   - Target: PLAN maps each of ADR-010's 10 gates to a concrete behavior test (identical scenario through both hosts; approve in human host, resume from cold external agent; correction invalidates stale projection; non-visual fallback communicates same options/consequences/evidence/continuations; missing info gathered without over-interrogation; approval binds exact action and cannot be reused after material change; interruption/refusal/timeout/uncertain-effect/recovery parity; cold-agent continuation without hidden first-party context; human effort reduced without worsening correctness/control/privacy/accessibility/operator burden), and marks which are built in the first slice vs deferred.
   - Acceptance: PLAN carries a 10-row gate→test table; each row names an observable pass/fail; the "human effort without worsening…" gate names how correctness/control/privacy/accessibility are measured, not asserted.

## Boundaries

**In scope:**
- GSD planning artifacts for phase `02-one-action-plane-cross-surface-parity`: `02-SPEC.md`, `02-CONTEXT.md`, `02-*-RESEARCH.md`, `02-*-PLAN.md`, and a codebase pattern-map artifact.
- Source-grounded (read-only) review of the existing parity/projection/host surfaces cited by `path:line`.
- One chosen answer per the six axes; ADR-010's 10 gates mapped to falsifiable tests.
- An ADR-amendment *recommendation* (if a conclusion would change an ADR), recorded inside RESEARCH per `.planning/records/README.md`.
- ROADMAP/STATE updates marking the phase registered and planned.

**Out of scope:**
- Any edit under `src/`, `convex/`, `tests/`, or build config (design phase).
- Re-deciding the Action Invocation seam, persistence, or authority binding — those are Phase 1's owned decisions; this phase consumes them.
- Changing an ADR's `status`, superseding an ADR, or closing GitHub #193.
- Running `execute-phase` / spawning `gsd-executor`.
- Building a component library or persisted generative-UI schema — ADR-010 §Generative-UI boundary treats the families as interaction hypotheses to evaluate first, not a mandated library.
- A universal channel/transfer/phone-handoff mechanism — ADR-010 §Session-and-channel boundary defers it.
- Voice or additional channels beyond one external-agent surface + the embedded agent for the first slice.

## Constraints

- Design must honor `skill://ae-actions-and-modules` (the registered action is the single interface; owner-only actions never reach agent surfaces; note the `agentTools`-vs-`answerThread` source truth at `action.ts:26` established in Phase 1 validation) and `skill://ae-convex-guardrails` if any persistence is proposed.
- Semantic parity means equal meaning, not equal presentation (ADR-010) — the contract must be expressed as semantic equalities, not pixel/DOM checks.
- Host adapters may own rendering and conversation style but not eligibility/recommendation/authority/attempt/evidence/recovery semantics (ADR-010 §Consequences).
- Public/assistant-visible copy rules from AGENTS.md apply to any wording that could surface.
- All `path:line` citations in RESEARCH must resolve against the working tree at design time.
- This phase depends on Phase 1 artifacts; where a decision needs a Phase 1 output, reference it rather than re-deciding.

## Acceptance Criteria

- [ ] `.planning/phases/02-one-action-plane-cross-surface-parity/02-SPEC.md` exists with all template sections and ambiguity ≤ 0.20.
- [ ] RESEARCH.md reviews the existing parity/projection/host surfaces with resolving `path:line` citations and states extend-vs-replace for `compareCustomerRequestSurfaces`.
- [ ] PLAN commits to exactly one answer for each of the six axes, each with rationale.
- [ ] PLAN carries the ADR-010 10-gate → falsifiable-test table.
- [ ] A codebase pattern-map artifact maps each new design element to its closest existing analog.
- [ ] At least 10 `path:line` citations in RESEARCH resolve to real code; zero fabricated anchors.
- [ ] `git status --porcelain` shows changes only under `.planning/`; nothing under `src/`, `convex/`, `tests/`.
- [ ] No ADR `status` changed, no ADR superseded, #193 not closed; any ADR-impacting conclusion recorded as an amendment recommendation.
- [ ] Every new name appears in the plain-language glossary; forbidden-token grep (`EconomicOperation|economic-action|adr11|-primitive|-kernel|wedge`) returns zero hits outside ADR-rejection quotes.
- [ ] The plan does not re-decide Phase 1's seam/persistence/authority; it references them.
- [ ] plan-checker (or manual plan-checker) passes; the phase stops before execute-phase.

## Edge Coverage

**Coverage:** 5/5 applicable edges resolved · 0 unresolved

| Category | Requirement | Status | Resolution / Reason |
|----------|-------------|--------|---------------------|
| Parity (presentation vs meaning) | R1 | ✅ covered | Contract expressed as semantic equalities, not pixel/DOM checks (Constraints). |
| Boundary (host re-implements rules) | R2 | ✅ covered | Enforcement mechanism + violation detection required (AC on R2). |
| Non-visual fallback (host cannot render) | R3 | ✅ covered | Structured equivalent addressed to same invocation+version; ADR-010 gate 4. |
| Reconstruction (transcript loss) | R5 | ✅ covered | Reopen-after-restart and transcript-deletion assertions required. |
| Generative UI (model invents controls/authority) | R4 | ✅ covered | Invent-nothing boundary as a negative acceptance criterion. |

## Prohibitions (must-NOT)

**Coverage:** 6/6 applicable prohibitions resolved · 0 unresolved

| Prohibition (must-NOT statement) | Requirement | Status | Verification / Reason |
|----------------------------------|-------------|--------|------------------------|
| MUST NOT edit `src/`, `convex/`, `tests/`, or build config | R1–R6 | resolved / test | `git status --porcelain` shows only `.planning/` changes. |
| MUST NOT re-decide Phase 1 seam/persistence/authority | R1–R6 | resolved / judgment | PLAN references Phase 1 outputs; no competing decision. |
| MUST NOT let a host adapter own eligibility/authority/evidence/recovery | R2 | resolved / test | Boundary check detects a host importing business internals. |
| MUST NOT let a generative-UI projection invent facts/controls/authority | R4 | resolved / test | Invent-nothing negative acceptance criterion. |
| MUST NOT treat the transcript or component state as durable truth | R5 | resolved / test | Reconstruction-from-records assertion. |
| MUST NOT change ADR status, supersede an ADR, or close #193 | R1–R6 | resolved / judgment | ADR frontmatter unchanged; recommendation recorded in RESEARCH. |

## Ambiguity Report

| Dimension          | Score | Min  | Status | Notes                                                        |
|--------------------|-------|------|--------|--------------------------------------------------------------|
| Goal Clarity       | 0.88  | 0.75 | ✓      | Six axes explicit; measurable as design artifacts.           |
| Boundary Clarity   | 0.92  | 0.70 | ✓      | Design-only; Phase 1 decisions excluded; ADR/#193 untouched. |
| Constraint Clarity | 0.80  | 0.65 | ✓      | Semantic-not-pixel parity; host-adapter boundary; guardrails.|
| Acceptance Criteria| 0.85  | 0.70 | ✓      | Each requirement resolves to a checkable artifact condition. |
| **Ambiguity**      | 0.13  | ≤0.20| ✓      | Locked by ADR-010 + Phase 1 as bounded inputs.               |

## Interview Log

| Round | Perspective     | Question summary                                    | Decision locked                                                                        |
|-------|-----------------|----------------------------------------------------|-----------------------------------------------------------------------------------------|
| 1     | Researcher      | What parity exists today?                           | Only `compareCustomerRequestSurfaces` (6 terminal dims, Request-scoped) — not ADR-010.   |
| 2     | Simplifier      | Irreducible core of this design phase?             | Six ADR-010 axes chosen once + 10-gate test map; no source edits; no Phase 1 re-decision.|
| 3     | Boundary Keeper | What is explicitly NOT this phase?                 | Source edits, Phase 1 decisions, component library, channel handoff, voice, ADR changes. |
| 4     | Failure Analyst | What makes a verifier reject the output?           | Pixel-parity thinking, a host owning business rules, invented controls, transcript-truth.|
| 5     | Seed Closer     | What is the hardest gate to make falsifiable?      | Gate 10 (human effort without worsening correctness/control/privacy/accessibility).      |

*(--auto equivalent: ADR-010 and Phase 1 lock WHAT/WHY; rounds recorded as the perspectives applied while authoring against those locked inputs.)*

---

*Phase: 02-one-action-plane-cross-surface-parity*
*Spec created: 2026-07-17*
*Next step: /gsd-discuss-phase 2 — implementation-context decisions (how to build what's specified above)*
