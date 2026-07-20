**Owner:** ActionPlanePlanner (design phase)
**Status:** Active
**Maturity:** Current evidence (source review) + Hypothesis (parity/effort claims to be proven by the eval)
**Question:** What is the lowest-blast-radius, source-grounded design that makes ADR-010's one-action-plane cross-surface parity buildable on top of Phase 1's Action Invocation identity — one chosen answer per axis, with the ten acceptance gates mapped to falsifiable tests?
**Decision affected:** None yet (records a recommendation; changes no ADR status; does not close #193)
**Evidence cutoff:** 2026-07-17
**Review by:** 2026-08-17
**Supersedes:** None
**Superseded by:** None

# Phase 2 — One action plane cross-surface parity: RESEARCH

Every material statement is tagged **OBSERVED** (cited source), **INFERRED**, **UNKNOWN**, or **HYPOTHESIS** per `.planning/records/README.md:100-103`.

**Personas adopted (all re-fetched 2026-07-17 from `msitarzewski/agency-agents/engineering/`; all 200 OK, no 404, no substitution):** Codebase Onboarding Engineer + Code Reviewer (current-source review + pattern map); Software Architect (parity contract + host-adapter boundary + system design); Frontend Developer + API Platform Engineer (generative-UI projection families + structured non-visual equivalent); Technical Writer (glossary + naming discipline).

**Boundary:** Design-only. No `src/`, `convex/`, or `tests/` edit. Consumes Phase 1 outputs (`01-SPEC.md`, `01-01-PLAN.md`, `01-RESEARCH.md`, `01-VALIDATION.md`); does not re-decide the seam, persistence, or authority binding.

---

## A. Current-source review of the parity / projection / host surfaces

### A.1 The existing cross-surface parity check (the thing to extend, replace, or sibling)

**OBSERVED.** `compareCustomerRequestSurfaces` (`src/modules/customer-request/cross-surface-parity.ts:24-49`) takes one human observation and one agent observation and returns a `pass`/`fail` verdict plus a typed `failures` list. What it actually compares:

- `requestRef`, `revision`, `state`, `evidenceState`, `resultDigest`, `businesses` — **6 terminal-outcome fields** (`:28-35`);
- plus one human liveness flag: `resumedAfterReload` → `human_reload_resume_not_proven` (`:36`).

**OBSERVED.** Its type surface is Request-scoped and terminal: `TerminalState = 'completed' | 'cancelled' | 'outcome_unknown'`, `EvidenceState` identical, `SurfaceObservation` keyed by `requestRef` (`:1-13`); the failure enum is the six mismatches + the reload flag (`:15-22`).

**INFERRED.** This function proves *terminal-outcome parity for a whole Customer Request*. It is not ADR-010's action-plane parity: it is keyed to `requestRef` (not an action/invocation), it omits the seven richer dimensions (available actions/required info, suitability/comparison rules, authority/data-use boundaries, attempt/idempotency/retry meaning, business info/source/freshness, allowed continuations), and its states are terminal only — it cannot express a paused, mid-lifecycle invocation.

### A.2 The customer-semantic projections (the generative-UI family analogs)

**OBSERVED.** `src/modules/customer-request/customer-projection.ts` builds every human view through one frozen assembler, `requestView` (`:757-830`), from typed inputs — it never fabricates a field; each optional block is spread only when its input is present (`:786-827`). The family-shaped projections:

- `projectCustomerRequest` (`:132-150`) — top-level dispatch; refusal → `needs_attention` (`:133-139`).
- `projectRequestEvaluation` (`:152-312`) — the branch tree. Two branches are the direct family analogs:
  - **material clarification family:** the `needs_information` branch (`:253-274`) emits `missingFields` + a typed `clarification` prompt — it asks only for a field that "changes which options can be considered now" (`:263`).
  - **bounded approval family:** the `needs_authorization` branch (`:275-288`) emits `disclosureReview` (purpose, `maximumRecipients`, data categories with classification) — a bounded, authoritative approval view.
- `projectOptionsReady` (`:364-395`) — the **candidate/option comparison family**; delegates to `projectCustomerOptionSet` (`src/modules/customer-request/customer-option-set.ts:6-36`) which computes cardinality, ordering, coverage counts, and per-option provenance `kind: 'provider_assertion'` (`:27-32`).
- `projectNeedsAttention` (`:397-404`) — the **contradiction/incident/recovery family** (state `needs_attention`, `nextAction: 'retry'`).

**INFERRED.** Four of ADR-010's six families already exist in Request-scoped form: material clarification, bounded approval, candidate/option comparison, and contradiction/recovery. The remaining two (current-objective/constraints/known-unknowns; progress/ownership/waiting) have partial analogs (`state` + `criteria`; `progress` block in `requestView:814-823`) but are not needed for the inquiry first slice. None is addressed to an `invocationRef` + version, and none is bounded by an explicit invent-nothing acceptance criterion.

### A.3 The single action definition + the harness that keeps hosts honest

**OBSERVED.** `ActionDefinition` (`src/modules/common/action.ts:88-102`) is the one shape; `ActionSurface = 'ui' | 'http' | 'agentJson' | 'answerThread'` (`:26`). `describeActionForAgent` (`:128-143`) emits a structured, machine-readable descriptor (id, name, summary, boundaries, readOnly, parameters, input/output JSON schema) — a non-visual form of one action.

**OBSERVED — the host-boundary analog already ships.** The harness derives a host's view of an action **from the action definition, not from the host**:

- `actionToHarnessToolContract` (`src/modules/harness/tool-contract.ts:130-154`) builds a contract whose `execute` is just `action.run({ data: input, context })` (`:148`) — the host runs the source-owned transition, it does not re-implement it.
- `exposureForAction` (`:288-301`) computes `surfaces`, `answerModel`, `publicProjection` from `action.readOnly` and the action id — the host cannot widen its own surface.
- `policyForAction` (`:303-332`) computes tier, approval mode, concurrency, interruptibility from the action (e.g. `inquiry.submit` → `public-qualified-write`, `write_requires_source_admission`, `:306-317`).
- `filterAnswerModelToolContracts` (`:279-286`) hands a host only the contracts whose exposure/policy the source declared.

**INFERRED.** The host-adapter boundary ADR-010 requires is *already honored by construction* in the harness: eligibility (exposure), approval (policy), and execution (`action.run`) are all source-owned. What is missing is an **enforcement test** — nothing today fails if a future host module imports a business-rule internal instead of the contract.

**OBSERVED — Code Reviewer note (carried from Phase 1 REC-02).** The `ae-actions-and-modules` skill still documents an `agentTools` surface; source has `answerThread` (`action.ts:26`), and `agentTools`-style gating is an allowlist concept (`AnswerModelToolIds` / `filterAnswerModelToolContracts`, `tool-contract.ts:24-27,279-286`), **not** an `ActionSurface` value. Design and any assistant-visible claim must cite source, not the skill.

### A.4 The two host surfaces + the negative control the parity eval exercises

**OBSERVED.** External-agent surface: `runHostedCustomerRequestJourney` (`src/modules/customer-request/hosted-agent-journey.ts:305`) drives the full journey over HTTP against a deployed surface, accumulating observed states via `observe()` (`:1763-1765`) and asserting execution-start replay (`:1999-2037`). It is Node-runtime (`import { randomUUID } from 'node:crypto'`, `:1`) — a transport/host concern, confirming the host adapter is the right home for runtime specifics, not business rules.

**OBSERVED.** External-agent admission: `issueCustomerRequestAgentKey` (`src/modules/customer-request/agent-access.ts:38-80`) issues a scoped, expiring agent key (`customer_requests:create`, `:1`); the external surface in the eval authenticates through this.

**OBSERVED.** Negative control: `runFrozenDirectAgentBaseline` (`src/modules/customer-request/direct-agent-baseline.ts:51-176`) runs a frozen direct-agent path with no AE invocation machinery and computes a `burden()` tuple (origins provided, discoveries, invocation calls, schema mappings) (`:219-230`). This is spec Testing suite 15 (direct-path negative control) and the measurable baseline for gate 10's "human effort" sub-metric.

**OBSERVED.** Assistant-visible claim boundary: `CUSTOMER_REQUEST_PUBLIC_COMPREHENSION` (`src/modules/customer-request/public-comprehension.ts:1-7`) fixes the copy boundary ("prove the workflow only—not independent supply, booking, payment, dispatch, or fulfilment", `:5`). Any parity wording that could surface stays inside this.

### A.5 What does not exist today

**OBSERVED.** The Phase 2 identifiers are absent from `src` + `convex` + `tests` (grep 2026-07-17): `compareActionInvocationSurfaces`, `structured invocation view`/`structuredInvocationView`, `host-adapter-boundaries`/`hostAdapterBoundary`, an action-scoped seven-dimension parity type, and an invent-nothing acceptance assertion. Phase 1's `ActionInvocation | invocationRef | invocationOrigin | awaiting_authority` also remain absent (consistent with `01-PATTERNS.md`). All Phase 2 elements are net-new shapes over existing analogs.

---

## B. Extend vs replace `compareCustomerRequestSurfaces` (the decision Requirement 1 demands)

**Persona:** Software Architect. Options scored on reuse, blast radius, and reversibility. SPEC D-01 explicitly permits "extending … or building an action-scoped sibling, over replacing it".

| Option | What it means | Reuse | Blast radius | Reversibility | Verdict |
|---|---|---|---|---|---|
| **Extend** `compareCustomerRequestSurfaces` in place | Overload the existing function to accept invocation-keyed observations and 7 dimensions | Reuses the verdict/failure-list shape | Forces the `requestRef`-keyed `SurfaceObservation` (`cross-surface-parity.ts:4-13`) to make `requestRef` optional and add 7 fields — mixes Request-terminal parity and action parity in one signature | Poor — every existing caller of the terminal check inherits the wider shape | Rejected |
| **Replace** it with an action-scoped check | Delete the Request-terminal check, keep only the action check | None | The terminal-outcome parity it proves for the whole Request is lost | One-way door | Rejected |
| **Sibling** — new `compareActionInvocationSurfaces`, keep the original | Add a net-new action/invocation-scoped check next to the untouched terminal check | Reuses the *pattern* (typed observations → verdict + failure list) | One new file; zero edits to the existing check or its callers | Two-way door — delete the sibling, nothing else changes | **CHOSEN** |

**Conclusion (OBSERVED + INFERRED).** Build a **sibling** (`compareActionInvocationSurfaces`), keyed to `invocationRef` + invocation version over the seven dimensions, and leave `compareCustomerRequestSurfaces` untouched to keep proving whole-Request terminal parity. This mirrors Phase 1's own reasoning: overloading a Request-keyed shape to serve a standalone/invocation scope would force optional Request lineage, which ADR-009 and spec §4 forbid (`01-RESEARCH.md:65`; `.planning/specs/ACTION-INVOCATION-ENGINEERING-SPEC.md:173-174`). The sibling is the lowest-blast-radius, only-two-way-door choice.

---

## C. ADR-010's seven parity dimensions → existing projection fields vs net-new

**Persona:** API Platform Engineer + Frontend Developer. Each dimension is encoded as a **semantic equality** (a value or digest that must be equal across the embedded and external observation for the same `invocationRef` + version), not a pixel/DOM check (ADR-010 `:40-55`, `:164`; SPEC Constraint `82`).

| # | ADR-010 dimension (`:44-50`) | Encoded equality | Existing field analog (`path:line`) | Net-new? |
|---|---|---|---|---|
| 1 | business information, source and freshness | `businessInfoDigest` + `sourceRef` + `freshness` | `businesses` in `requestView:807-809`; freshness = Phase 1 enum `current\|stale\|unreachable` (`01-01-PLAN.md:127`) | freshness net-new on invocation scope |
| 2 | available actions and required information | `availableActionIds` + `requiredFields` | `missingFields` / `clarification` `customer-projection.ts:253-274` | keyed to invocation: net-new |
| 3 | suitability and comparison rules | `suitabilityRuleDigest` (ordering + coverage) | `projectCustomerOptionSet` ordering/coverage `customer-option-set.ts:6-36` | digest over existing data: net-new |
| 4 | authority and data-use boundaries | `authorityScope` (bound fields + data-use limit) | Phase 1 authority reference bound fields (`01-01-PLAN.md:110`); disclosure categories `customer-projection.ts:283-287` | reuses Phase 1 authority; net-new equality |
| 5 | attempt, idempotency and retry meaning | `retryClass` + `attemptRef` | Phase 1 retry class + `attemptRef` (`01-01-PLAN.md:72-73`) | reuses Phase 1 |
| 6 | evidence, refusal, contradiction and unknown state | `observedResolution` (`none\|succeeded\|failed\|unknown`) + `refusalReason` | resolution union `convex-v2-schema.ts:1045-1049` (Phase 1); refusal taxonomy `preparation-authority.ts:17-34` (Phase 1) | reuses Phase 1 |
| 7 | allowed continuations and final outcome | `allowedContinuations` (next-action set) + `finalOutcome` | `nextAction` enum `customer-projection.ts:32-42` | keyed to invocation: net-new |

**INFERRED.** Three dimensions (4, 5, 6) reuse Phase 1's identity/authority/state vocabulary directly; four (1, 2, 3, 7) reuse existing Request projection *data* but must be re-expressed as equalities keyed to `invocationRef` + version. No dimension requires inventing a new business concept.

---

## D. ADR-amendment recommendation (recorded here, NOT applied)

Per `.planning/records/README.md:109-119`, a conclusion that would change an ADR is recorded as a recommendation, never an ADR edit. This phase changes **no** ADR `status` and closes **no** issue.

- **REC-03 (documentation, non-blocking).** ADR-010's structured-non-visual-equivalent requirement (`:103-105`) and its host-architecture rule (spec §10, `:243-255`) name "the same invocation and version" but the ADR's state block (`:90-96`) lists only three dimensions (desired / observed / freshness) and mentions `control` (`awaiting_authority`) elsewhere (`:75`). This is the same four-dimension alignment Phase 1 already flagged as REC-01. Recommend, at the 2026-08-17 ADR review, aligning ADR-010's state block with the four-dimension vocabulary Phase 1 defined. **Owner:** Founder. No status change now.
- **REC-04 (source-fact correction, non-blocking — reaffirms Phase 1 REC-02).** The `ae-actions-and-modules` skill's `agentTools` surface wording is stale; source is `answerThread` (`action.ts:26`) and answer-model gating is the `AnswerModelToolIds` allowlist (`tool-contract.ts:24-27,279-286`). Recommend refreshing the skill so no Phase 2 host-boundary claim cites a non-existent surface. Not an ADR change.
- **No supersession recommended.** ADR-010 remains accurate; the six-axis design fits inside its ten gates. The host-adapter boundary is already honored by the harness (§A.3); Phase 2 only makes it testable.

---

## E. Parity / effort claims that remain hypotheses (named per README:122-131)

- **HYPOTHESIS (parity achievable):** "One registered action (`inquiry.submit`) produces semantically equivalent results — equal on all seven dimensions — through the embedded AE agent and one external-agent surface." Decision it could change: whether ADR-010 moves proposed→accepted (`ADR-010:174`). Population: the first standalone action across two hosts. Comparison: embedded host view vs external-agent host view for the same `invocationRef` + version. Measurement/falsifier: `compareActionInvocationSurfaces` verdict `fail` on any dimension. Owner: Founder. Review by: 2026-08-17. Status: designed-only; proven by the eval in a later execute-phase.
- **HYPOTHESIS (effort reduced without worse control/privacy):** ADR-010 gate 10. Measurement is specified in the PLAN gate-10 row (correctness = parity verdict; control = zero effects without a bound authority reference; privacy = zero categories disclosed beyond the authority data-use limit; accessibility = structured equivalent complete for every first-slice rich projection; operator burden = zero host-owned business-rule paths; human effort = embedded burden tuple ≤ direct-agent baseline `direct-agent-baseline.ts:219-230`). Named, not asserted; live measurement deferred.

---

## F. Citation index (all verified to resolve at 2026-07-17)

1. `src/modules/customer-request/cross-surface-parity.ts:24-49` — `compareCustomerRequestSurfaces` (6 terminal dims + reload).
2. `src/modules/customer-request/cross-surface-parity.ts:1-22` — Request-scoped terminal types + failure enum.
3. `src/modules/customer-request/cross-surface-parity.ts:36` — `human_reload_resume_not_proven`.
4. `src/modules/customer-request/customer-projection.ts:132-150` — `projectCustomerRequest`.
5. `src/modules/customer-request/customer-projection.ts:253-274` — material-clarification (`needs_information`) branch.
6. `src/modules/customer-request/customer-projection.ts:275-288` — bounded-approval (`needs_authorization` / `disclosureReview`) branch.
7. `src/modules/customer-request/customer-projection.ts:364-395` — `projectOptionsReady` (candidate/option comparison).
8. `src/modules/customer-request/customer-projection.ts:397-404` — `projectNeedsAttention` (contradiction/recovery).
9. `src/modules/customer-request/customer-projection.ts:757-830` — `requestView` frozen structured assembler.
10. `src/modules/customer-request/customer-projection.ts:32-42` — `CustomerRequestNextAction` (allowed-continuations analog).
11. `src/modules/customer-request/customer-option-set.ts:6-36` — `projectCustomerOptionSet` (ordering/coverage/provenance).
12. `src/modules/common/action.ts:26` — `ActionSurface` (source truth vs stale skill).
13. `src/modules/common/action.ts:88-102` — `ActionDefinition` shape.
14. `src/modules/common/action.ts:128-143` — `describeActionForAgent` (structured non-visual descriptor).
15. `src/modules/harness/tool-contract.ts:130-154` — `actionToHarnessToolContract` (`execute` calls `action.run`).
16. `src/modules/harness/tool-contract.ts:288-301` — `exposureForAction` (surfaces derived from action).
17. `src/modules/harness/tool-contract.ts:303-332` — `policyForAction` (approval/tier derived from action).
18. `src/modules/harness/tool-contract.ts:279-286` — `filterAnswerModelToolContracts` (host gets filtered contracts).
19. `src/modules/customer-request/hosted-agent-journey.ts:305` — `runHostedCustomerRequestJourney` (external-agent surface).
20. `src/modules/customer-request/hosted-agent-journey.ts:1999-2037` — execution-start replay assertions.
21. `src/modules/customer-request/hosted-agent-journey.ts:1` — `node:crypto` (host-runtime concern).
22. `src/modules/customer-request/direct-agent-baseline.ts:51-176` — `runFrozenDirectAgentBaseline` (negative control).
23. `src/modules/customer-request/direct-agent-baseline.ts:219-230` — `burden()` (gate-10 effort baseline).
24. `src/modules/customer-request/agent-access.ts:38-80` — `issueCustomerRequestAgentKey` (external-agent admission).
25. `src/modules/customer-request/public-comprehension.ts:1-7` — assistant-visible claim boundary.
26. `package.json:46` — `test:imports` (import-boundary suite incl. `customer-request-boundaries.test.ts`).
27. `.planning/specs/ACTION-INVOCATION-ENGINEERING-SPEC.md:177-192` — state model (four dimensions).
28. `.planning/specs/ACTION-INVOCATION-ENGINEERING-SPEC.md:206-219` — preparation & authority binding.
29. `.planning/specs/ACTION-INVOCATION-ENGINEERING-SPEC.md:243-255` — host architecture + structured equivalent.
30. `.planning/specs/ACTION-INVOCATION-ENGINEERING-SPEC.md:308-329` — Testing Decisions suites 1-15.
31. `.planning/adr/ADR-010-one-action-plane-across-human-and-agent-experiences.md:40-55` — seven parity dimensions.
32. `.planning/adr/ADR-010-...md:103-105` — structured non-visual equivalent addressed to invocation + version.
33. `.planning/adr/ADR-010-...md:122-140` — generative-UI boundary + six families.
34. `.planning/adr/ADR-010-...md:172-192` — the ten acceptance gates.

*(34 citations; requirement was ≥10. Phase 1 anchors reused as upstream context are cited from `01-01-PLAN.md` / `01-RESEARCH.md`, not re-decided.)*
