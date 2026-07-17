# Phase 1: Action invocation decomposition - Context

**Gathered:** 2026-07-17
**Status:** Ready for planning

<domain>
## Phase Boundary

This is a **design/planning phase only**. It turns ADR-009, ADR-010, and the Action Invocation engineering spec (#193) into a decision-complete, source-grounded SPEC + RESEARCH + PLAN + pattern-map set. It chooses each of six axes exactly once — seam, first standalone action, persistence, per-action authority binding, four-dimension state model, and the barrier experiment design — with rationale and blast-radius evidence. It makes ZERO edits under `src/`, `convex/`, or `tests/`, does not change ADR status or close #193, and stops at plan-checker green. Source implementation is a separate, explicitly-authorized execute-phase.
</domain>

<spec_lock>
## Requirements (locked via SPEC.md)

**7 requirements are locked.** See `01-SPEC.md` for full requirements, boundaries, and acceptance criteria.

Downstream agents MUST read `01-SPEC.md` before planning or implementing. Requirements are not duplicated here.

**In scope (from SPEC.md):** GSD planning artifacts (SPEC/RESEARCH/PLAN + pattern map); read-only source review cited by `path:line`; blast-radius comparison of three seam options with one chosen answer per decision axis; ADR-amendment *recommendation* (not edit) if a conclusion would change an ADR; ROADMAP/STATE updates.

**Out of scope (from SPEC.md):** Any `src/`/`convex/`/`tests/`/build edit; changing ADR status, superseding an ADR, or closing #193; running execute-phase or the barrier A/B; universal Task/EconomicOperation schema; replacing Customer Request/RoutePlan/RouteMandate; Bundle-owned lineage implementation.
</spec_lock>

<decisions>
## Implementation Decisions

These are preferences and constraints for research/planning. They do NOT pre-decide the six axes — the PLAN must still choose each once with rationale (decision-completeness is a plan-phase acceptance criterion).

### Seam-attachment bias
- **D-01:** Favor the **lowest-blast-radius, most reversible** option. Per engineering spec §12, the first concrete artifact is an in-memory adapter for evals before any persistence; RESEARCH must score the three options (adapter-over-handlers with discriminated origin / new `action-invocation` module / extracted shared step-core) on files×callsites, reversibility, and reuse of `src/modules/customer-request/` + `src/modules/actions/index.ts`.
- **D-02:** Discriminated lineage (`request_owned | standalone`) lives **at the seam**, not as broadly-optional fields on existing Request-owned records. Historical Request-owned traces are adapted, never migrated flag-day.

### First standalone action
- **D-03:** Prefer **qualified inquiry** (`submitInquiryAction`) as slice-one action if its current contract can express a paused authority gate and attributable delivery without implying booking/payment/dispatch/fulfilment (AGENTS.md safe contract). If it cannot exercise uncertain-effect reconciliation, use a **provider simulator** for that fault path without expanding any public claim. The PLAN records which, and why, with a `path:line` citation.

### Persistence
- **D-04:** Bias toward **reuse of an existing source-owned record** (Action Attempt / prepared-action / run) over a new table. A new Convex table is justified only when the source map shows an existing record would mix incompatible meanings or force optional Request lineage (ADR-009). Any schema change is additive (`v.optional()`), composed through the module-owned schema fragment per `skill://ae-convex-guardrails`; no `node:` import may leak into a Convex-reachable graph.

### Authority binding
- **D-05:** Authority binds one invocation by exact fields (invocation reference, invocation version, prepared-input digest, principal, target, allowed effect, spend/data limits, expiry) and invalidates on any material input/target/action-version/freshness change. Approval of one action grants authority to no other action.

### State model
- **D-06:** Keep desired / observed / freshness / control as **four separate dimensions**; no single status enum may collapse them. `unknown` external effect and `reconcile_before_retry` must be representable.

### Naming and engineering roles
- **D-07:** Plain-English verb+object names only (`actionInvocation`, `invocationOrigin`, `attemptRef`). Forbidden coined tokens (`EconomicOperation`, `*-primitive`, `*-kernel`, `wedge`, `economic-action`, `adr11`) appear only when quoting the ADR's own rejection. Every new name is glossed in one jargon-free sentence.
- **D-08:** Analysis/design steps adopt named engineering personas from `msitarzewski/agency-agents` (onboarding/codebase, software architect, backend/database, minimal-change, api-platform, technical-writer), not generic worker agents; substitutions noted if a persona file 404s.

### Claude's Discretion
- Exact plan-file decomposition (single PLAN vs multiple wave plans), the precise blast-radius scoring rubric weights, and the pattern-map format are left to the planner, provided each of the six axes lands one chosen answer with rationale.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Locked decision inputs
- `.planning/adr/ADR-009-partial-entry-without-request-ownership.md` — partial entry without Request ownership; 11 acceptance gates; rejects `EconomicOperation`; discriminated lineage; three retry classes.
- `.planning/adr/ADR-010-one-action-plane-across-human-and-agent-experiences.md` — one action plane; semantic outcome parity; awaiting-authority control state; 10 acceptance gates; generative-UI boundary.
- `.planning/specs/ACTION-INVOCATION-ENGINEERING-SPEC.md` §1-12 — external seam, action contract, durable identity, lineage, state model, concurrency, preparation/authority, attempts/retry, projection, host architecture, composition, initial slice ordering; #193.

### Prior-art research (do not re-derive the literature)
- `.planning/research/2026-07-17-partial-entry-lifecycle-crosswalk.md` — OCDS/UBL/Peppol/FAR separately-meaningful interactions (supporting evidence for ADR-009 shape).
- `.planning/research/2026-07-17-partial-workflow-entry-models.md` — partial-entry model options.
- `.planning/research/2026-07-17-partial-entry-premortem.md` — failure modes of partial entry.
- `.planning/research/2026-07-17-adr-010-inverse-premortem.md` — one-action-plane inverse premortem.
- `.planning/research/2026-07-17-conversational-agentic-workspace-patterns.md` — generative-UI / conversational workspace patterns.
- `.planning/research/2026-07-17-capability-to-composable-work-crosswalk.md` — capability → composable work mapping.
- `.planning/research/2026-07-17-production-agent-execution-patterns.md` — durable execution, leases, generation fences, reconciliation.
- `.planning/research/2026-07-17-workflow-substitution-candidate-review.md` — workflow substitution candidates.
- `.planning/research/2026-07-17-product-foundry-primitive-refinery-program.md` — program framing.

### AE guardrail skills (constraints on the design)
- `skill://ae-actions-and-modules` — ActionDefinition/surfaces pattern; owner-only actions never reach `agentTools`.
- `skill://ae-convex-guardrails` — schema-fragment composition; `node:` import trap; additive `v.optional()` schema changes.
- `skill://ae-verification-gates` — how the eventual implementation's verification is chosen.
- `.planning/records/README.md` — where an ADR-amendment recommendation is recorded.

### Naming authority
- ADR-009 §"deliberately does not introduce an EconomicOperation schema" — the naming-discipline anchor.
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/modules/actions/index.ts`: single action registry; already registers `customerRequestConfirmAction`, `customerRequestRunAction`, `customerRequestCancelAction`, `submitInquiryAction`, `registrySearchAction`, etc. The one-action-plane design extends this seam rather than adding a parallel registry.
- `src/modules/customer-request/` step handlers: `action-preparation.ts`, `preparation-authority.ts`, `preparation.ts`, `route-mandate-admission.ts`, `route-mandate.ts`, `route-plan-generation.ts`, `option-inspection.ts`, `release-readback.ts`, `problem-tracking.ts` — candidate shared step-core for the "extracted shared step-core" seam option.
- `src/modules/inquiries/inquiry.actions.ts`: `submitInquiryAction` — the preferred first standalone action.

### Established Patterns
- Action definitions live in `<module>/<module>.actions.ts`, typed `AnyAction` from `@/modules/common/action`, imported into `src/modules/actions/index.ts`. No module-eval side effects (tree-shaking safe).
- Route-level authority binds a whole RoutePlan today: `agent-contract.ts` `customerRoutePlanDecisionSchema` (line 508), repeat-permission (line 793). The per-action authority binding must not inherit that whole-route granularity.

### Integration Points
- `src/lib/server/customer-request-*-api.ts` (14 files) route the Request-owned lifecycle; the seam decision determines whether a standalone caller reuses these handlers via an adapter or a shared step-core.
</code_context>

<specifics>
## Specific Ideas

- The barrier hypothesis ("whole-route approval is too high a barrier") is designed as a two-arm experiment (per-action authorization vs whole-route approval) with a predeclared metric and threshold — designed only, not run; running it needs live-funnel changes + separate authorization.
- Worked state-model example to carry into the PLAN: inquiry sent-but-unacknowledged → desired=sent, observed=unknown, freshness=stale, control=reconciling.
</specifics>

<deferred>
## Deferred Ideas

- Bundle-owned lineage (`bundle_owned(bundleRef, nodeRef)`) — reserved by spec §4 until reference-only composition passes its eval; name as future, do not build.
- Migrating additional registered actions beyond slice one — spec §Out of Scope.
- Any commercial-wedge selection — spec §Out of Scope.
- Running the barrier A/B or any live-funnel change — separate, explicitly-authorized work.

None of these expand this design phase's scope.
</deferred>

---

*Phase: 1-action-invocation-decomposition*
*Context gathered: 2026-07-17*
