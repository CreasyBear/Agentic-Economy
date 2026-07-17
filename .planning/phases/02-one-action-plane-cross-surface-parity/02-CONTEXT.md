# Phase 2: One action plane cross-surface parity - Context

**Gathered:** 2026-07-17
**Status:** Ready for planning

<domain>
## Phase Boundary

This is a **design/planning phase only**. It turns ADR-010 (one action plane across human and agent experiences) into a decision-complete, source-grounded SPEC + RESEARCH + PLAN + pattern-map set. It chooses each of six axes exactly once — semantic-parity contract, host-adapter boundary enforcement, structured non-visual equivalent, generative-UI projection families, reconstruct-from-records rule, and the parity eval design — with rationale and evidence. It **consumes Phase 1's Action Invocation interface and state model and does not re-decide the seam, persistence, or authority binding.** It makes ZERO edits under `src/`, `convex/`, `tests/`, does not change ADR status or close #193, and stops at plan-checker green.
</domain>

<spec_lock>
## Requirements (locked via SPEC.md)

**6 requirements are locked.** See `02-SPEC.md` for full requirements, boundaries, and acceptance criteria.

Downstream agents MUST read `02-SPEC.md` before planning or implementing. Requirements are not duplicated here.

**In scope (from SPEC.md):** GSD planning artifacts (SPEC/CONTEXT/RESEARCH/PLAN + pattern map); read-only source review cited by `path:line`; one chosen answer per axis; ADR-010's 10 gates mapped to falsifiable tests; ADR-amendment *recommendation* (not edit) if warranted; ROADMAP/STATE updates.

**Out of scope (from SPEC.md):** Any `src/`/`convex/`/`tests/`/build edit; re-deciding Phase 1's seam/persistence/authority; changing ADR status or closing #193; running execute-phase; a component library or persisted generative-UI schema; universal channel/transfer/phone handoff; voice or extra channels beyond one external-agent surface + the embedded agent.
</spec_lock>

<decisions>
## Implementation Decisions

Preferences and constraints for research/planning. They do NOT pre-decide the six axes — the PLAN must still choose each once with rationale.

### Semantic-parity contract
- **D-01:** Express parity as **semantic equalities over ADR-010's seven dimensions** keyed to a registered action + invocation, not pixel/DOM. Prefer **extending** `compareCustomerRequestSurfaces` (`cross-surface-parity.ts:24-49`) or building an action-scoped sibling, over replacing it; RESEARCH decides extend-vs-replace with `path:line`.
- **D-02:** Prove the contract against the **same first action** Phase 1 selects (qualified inquiry `inquiry.submit`) so the two phases compose; do not introduce a different first action.

### Host-adapter boundary
- **D-03:** The registered action definition (`src/modules/common/action.ts`) stays the single interface. Prefer an **import/capability boundary** a host adapter cannot cross (a test or lint that fails when a host module imports business-rule internals) over convention alone. Host adapters own transport/conversation/rendering only.

### Structured non-visual equivalent
- **D-04:** Every rich projection has a structured non-visual form **addressed to the same `invocationRef` + invocation version** (Phase 1's identity), so a UI decision and an external-agent decision resume the same paused invocation; neither host recomputes business inputs.

### Generative-UI families
- **D-05:** Model a **small first-slice subset** of ADR-010's six families (bounded approval + candidate/option comparison are the highest-value pair for the inquiry slice), mapped to existing `customer-projection.ts` analogs, with a hard invent-nothing boundary (select/populate from registered actions + authoritative state only).

### Reconstruction
- **D-06:** The current view is reconstructable from Action Invocation / authority / attempt / evidence / result records; conversation and component state are disposable caches (may hold transport cursors, presentation prefs, a pending-interaction reference only).

### Naming and engineering roles
- **D-07:** Plain-English verb+object names; reuse Phase 1's `actionInvocation`/`invocationRef`/`invocationOrigin` rather than coining new ones; forbidden coined tokens only in ADR-rejection quotes; every new name glossed.
- **D-08:** Analysis/design steps adopt named engineering personas from `msitarzewski/agency-agents` (software-architect for the parity contract + host boundary; frontend-developer + api-platform-engineer for generative-UI families and the structured equivalent; technical-writer for glossary; code-reviewer + codebase-onboarding for the current-source review), noting any 404 substitution.

### Claude's Discretion
- Plan-file decomposition, the exact parity-dimension encoding, and the pattern-map format are the planner's, provided each of the six axes lands one chosen answer and the 10-gate table is complete.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Locked decision input
- `.planning/adr/ADR-010-one-action-plane-across-human-and-agent-experiences.md` — the phase's WHAT/WHY; §Decision, §Interaction boundary, §Generative UI boundary, §Session and channel boundary, 10 acceptance gates, §Consequences.

### Upstream context (locked, do not re-decide)
- `.planning/phases/01-action-invocation-decomposition/01-SPEC.md`, `01-01-PLAN.md`, `01-RESEARCH.md`, `01-VALIDATION.md` — Phase 1's Action Invocation interface, four-dimension state model, per-action authority binding, and the validation caveats (VAL-04 authority is net-new grant fields; VAL-05 ActionDefinition fields must be optional; `agentTools` is an allowlist gate not a surface).
- `.planning/adr/ADR-009-partial-entry-without-request-ownership.md` — partial-entry lineage the action plane rides on.
- `.planning/specs/ACTION-INVOCATION-ENGINEERING-SPEC.md` §5 (state model), §10 (host architecture), §Testing Decisions (the 15 behavior suites the parity eval reuses).

### Prior-art research
- `.planning/research/2026-07-17-adr-010-inverse-premortem.md` — one-action-plane failure modes.
- `.planning/research/2026-07-17-conversational-agentic-workspace-patterns.md` — generative-UI / conversational workspace patterns.
- `.planning/research/2026-07-17-capability-to-composable-work-crosswalk.md` — capability → composable work mapping.
- `.planning/research/2026-07-17-production-agent-execution-patterns.md` — reconstruction, host adapters, durable state.

### AE guardrail skills
- `skill://ae-actions-and-modules` — registered action as single interface; owner-only actions never reach agent surfaces (note the `agentTools`/`answerThread` source correction from Phase 1 validation REC-02).
- `skill://ae-convex-guardrails` — if any persistence is proposed.
- `skill://ae-verification-gates` — how the eventual verification is chosen.
- `.planning/records/README.md` — where an ADR-amendment recommendation is recorded.
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/modules/customer-request/cross-surface-parity.ts:24-49` `compareCustomerRequestSurfaces` — the existing (narrow, Request-scoped) parity check to extend or supersede.
- `src/modules/customer-request/customer-projection.ts` — `projectCustomerRequest` (132), `projectRequestEvaluation` (152), `projectPreparingOptions` (353), `projectOptionsReady` (364), `projectNeedsAttention` (397): analogs for the generative-UI projection families.
- `src/modules/customer-request/hosted-agent-journey.ts`, `direct-agent-baseline.ts`, `agent-access.ts`, `public-comprehension.ts` — external-agent journey + direct-agent negative control the parity eval exercises.
- `src/modules/common/action.ts` — the single action definition (`ActionSurface` :26, `describeActionForAgent` :118-142) consumed by every host.

### Established Patterns
- Customer-semantic projections already separate "way forward / recommendation / options / needs-attention" — the family taxonomy is partly present but Request-scoped.
- Parity is currently proven at terminal outcome, not across the seven ADR-010 dimensions per action.

### Integration Points
- Phase 1's Action Invocation interface/state model is the identity the structured non-visual equivalent and reconstruction rules address; this phase attaches parity + projection families to that identity.
</code_context>

<specifics>
## Specific Ideas

- Prove parity for the same first action across the embedded AE agent and one external-agent surface (ADR-010 gate 1), reusing the spec §Testing Decisions behavior suites rather than cloning them.
- Worked pair to carry into the PLAN: a rich bounded-approval view ↔ its structured non-visual form, both addressed to the same `invocationRef` + invocation version, resuming one paused invocation.
- Gate 10 ("human experience reduces effort without worsening correctness/control/privacy/accessibility/operator burden") must name HOW each of those is measured, not assert it.

</specifics>

<deferred>
## Deferred Ideas

- A generative-UI component library or persisted projection schema — ADR-010 keeps the families as hypotheses to evaluate first.
- Universal channel/transfer/phone-handoff — ADR-010 §Session-and-channel boundary defers it.
- Voice and additional channels beyond one external-agent surface + the embedded agent.
- Any Phase 1 decision (seam/persistence/authority) — owned upstream.

None of these expand this design phase's scope.
</deferred>

---

*Phase: 2-one-action-plane-cross-surface-parity*
*Context gathered: 2026-07-17*
