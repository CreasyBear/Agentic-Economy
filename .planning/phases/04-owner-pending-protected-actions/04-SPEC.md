# Phase 4: Owner-Pending Protected Actions — Specification

**Created:** 2026-06-27
**Ambiguity score:** 0.14 (gate: ≤ 0.20)
**Requirements:** 8 locked

## Goal

One observed consequential action can be proposed, policy-checked, approved or rejected by the owner, attempted through a provider, and reconstructed with receipt or proof-gap readback without autonomous execution or money movement.

## Background

Current repo state is planning-only and Phase 4 does not yet have a GSD phase directory. ROADMAP.md defines Phase 4 as owner-pending protected actions: proposeAction, policy check, owner approve/reject, provider attempt/proof gap, receipt/audit reconstruction, and a hard cut on autonomous protected execution. Phase 1 preserves lifecycle primitives as descriptor-only and bans protected action runtime. The action scout found useful backup patterns in exact action contracts, owner-pending review, idempotency/correlation, one-use gateway admission, proof-gap/receipt readbacks, and reconstruction; it also found broad action catalogs, hosted agents, MCP/OpenAPI/SDK mutations, request-market, wallet/payment, and progressive auto-resolve surfaces that must stay out.

## Requirements

1. **Single action-class decision**: Phase 4 selects exactly one non-money owner-approved action class from observed Phase 2 inquiry or Phase 3 discovery demand, records the decision, and rejects broad action catalogs or autonomous execution.
   - Current: No Phase 4 runtime or observed action demand exists yet; lifecycle is descriptor-only.
   - Target: A decision record names one action class, user/job, provider or internal attempt boundary, owner consequence, non-goals, and rollback/disable posture.
   - Acceptance: Verifier can point to Phase 2/3 evidence, the chosen action contract, and explicit rejection of broad catalogs, money movement, and autonomous execution.

2. **Proposal contract**: proposeAction creates a durable candidate action from an allowlisted contract with actor principal, business/service target, owner context, canonical contract hash, idempotency key, correlation ID, parameter allowlist, and typed rejection states.
   - Current: No proposal table, contract schema, or command exists.
   - Target: proposeAction is the only proposal seam and cannot execute providers; it stores exact candidate/proposal state and audit.
   - Acceptance: Tests prove valid proposal creates one candidate/audit; unknown action class, invalid target, untrusted parameter key, duplicate replay, same-key/different-body, suppressed target, and wrong actor authority are rejected.

3. **Policy and lifecycle classification**: Policy evaluation classifies each proposal using source-owned owner authority, action class, lifecycle primitive, risk, time-bound/external-authority/proof-gap requirements, and returns review_required, refused, expired, or proof_gap without provider side effects.
   - Current: Lifecycle primitives exist only as future descriptor contract.
   - Target: Policy result unions and literal states explain why owner review is required or why proposal cannot proceed.
   - Acceptance: Tests cover allowed, refused, expired, missing proof, external-authority, time-bound, and proof-gap paths and prove no provider attempt is recorded before owner approval.

4. **Owner decision UI**: Owner approve/reject UI shows exact object, scope, consequence, reversibility, deadline, proof requirements, and disabled reasons; approval/rejection requires source-owned owner access and writes audit before any provider attempt.
   - Current: Owner inbox is future Phase 2; no action queue/decision UI exists.
   - Target: Owner queue/action detail lets authorized owners approve or reject with reason, evidence, and visible consequence.
   - Acceptance: E2E/a11y tests cover owner queue empty/populated, approve, reject, disabled, expired, wrong-owner, mobile, keyboard, focus, and copy that says proposal/approval rather than autonomous execution.

5. **Provider attempt and proof gap**: Provider attempt execution occurs only after a valid owner approval and one-use gateway admission, records request/result/proof-gap/receipt refs, and converts downstream mismatch, timeout, or failure into typed proof_gap or failed readback without retry storms.
   - Current: No provider attempts, gateway, receipt, or proof-gap tables exist.
   - Target: A single provider/internal attempt boundary consumes one approval and persists attempt/readback/result state with idempotent retries.
   - Acceptance: Tests prove no attempt without approval, one-use admission, duplicate replay, timeout, mismatch, provider failure, proof-gap, successful receipt, and bounded retry behavior.

6. **Reconstruction readback**: Owner and operator readbacks reconstruct actor, proposal, policy, owner decision, gateway admission, provider attempt, outcome, receipt/proof-gap, dispute/reversal posture, audit events, and repair or no-repair action from source state.
   - Current: Phase 1 audit/readback is planned; no protected-action reconstruction exists.
   - Target: Readbacks expose every step and disabled controls when evidence is missing or stale.
   - Acceptance: Given any candidate action ID, a verifier can reconstruct the whole chain and see missing, stale, failed, proof-gap, successful, disputed, reversed, and no-repair states without reading logs.

7. **Discovery wording for protected actions**: Agent/developer/public discovery may describe protected actions only as owner-pending proposals with unsupported or approval-required state, and no MCP/OpenAPI/SDK mutation surface appears unless server-enforced authority, audit, receipt, and readback exist.
   - Current: P1/P3 discovery defaults to unsupported/negative capability.
   - Target: Discovery outputs update only after action authority exists and remain explicit about owner approval requirements.
   - Acceptance: Copy/schema scans fail on autonomous, callable, direct-execute, payment, or provider-action claims; optional protocol descriptors, if present, route-test proposal-only behavior and approval-required metadata.

8. **Phase 4 closeout proof**: Phase 4 closeout proves duplicate, stale, concurrent, wrong-owner, expired, refused, proof-gap, downstream-failure, and successful owner-approved action paths without shipping autonomous protected execution or money movement.
   - Current: No Phase 4 runtime or directory exists.
   - Target: A cold clone can run proposal/policy/decision/attempt/receipt/readback tests for one chosen action class.
   - Acceptance: Closeout evidence includes chosen action decision record, contract tests, policy tests, owner UI E2E, provider attempt tests, readback reconstruction, source-mining scans, and no-money/no-autonomy copy scans.

## Boundaries

**In scope:**
- One non-money, owner-approved action class selected from Phase 2/3 evidence.
- proposeAction candidate contract, policy evaluation, owner decision, provider/internal attempt, proof-gap/receipt, and reconstruction readback.
- Source-owned action proposal, owner decision, gateway/attempt, proof-gap, receipt, audit, and repair/no-repair state.
- Owner queue/detail UI for approve/reject with consequence, reversibility, deadline, proof requirements, disabled reasons, and accessible states.
- Discovery copy/schema updates that describe owner-pending proposals only when true.
- Tests for stale, duplicate, concurrent, wrong-owner, expired, refused, proof-gap, provider failure, and success paths.

**Out of scope:**
- Autonomous protected execution — explicitly cut by roadmap.
- Multiple action classes, provider marketplaces, broad action catalogs, request market, skills, hosted agents, or generic action gateway.
- Money movement, billing, settlement, wallet, credits, payment authorization, Stripe, Connect, x402 — Phase 5 only.
- MCP/OpenAPI/SDK/plugin mutation surfaces unless the exact proposal-only authority is route-tested and server-enforced.
- LLM-generated consent, hidden approvals, progressive auto-resolve, or dark-pattern owner confirmations.
- Physical-world proof claims beyond recorded provider/internal readback and explicit proof-gap posture.

## Constraints

- Protected actions use handshake-protocol-kernel authority patterns where applicable; proposal contracts are exact and hash-bound.
- Every consequential transition is source-owned, idempotent, audited, and reconstructable.
- Provider attempt workers consume one-use approval/gateway admission and never infer authority from discovery/protocol files.
- Lifecycle primitives remain explanatory metadata unless and until policy/gateway code uses them explicitly for the chosen action class.
- Owner approval UI must name object, consequence, reversibility, deadline, proof requirement, and disabled reason.
- No money rails or payment fields may enter Phase 4 core/discovery state.
- Any protocol-facing descriptor follows server-enforced proposal behavior; descriptors never mint authority.

## Acceptance Criteria

- [ ] Decision record selects exactly one non-money action class from observed Phase 2/3 evidence and rejects broad catalogs/autonomy.
- [ ] proposeAction persists one candidate/audit with canonical hash, idempotency, correlation, actor principal, target, owner context, and parameter allowlist.
- [ ] Proposal rejects unknown action class, invalid/suppressed target, untrusted parameter key, duplicate-different-body, replay, wrong actor, and missing required context.
- [ ] Policy returns typed review_required, refused, expired, or proof_gap without provider side effects.
- [ ] Owner approval/rejection requires source-owned owner access, visible consequence, reason/evidence where required, and writes audit before provider attempt.
- [ ] Provider attempt occurs only after valid approval and one-use gateway admission; timeout/mismatch/failure becomes typed failed/proof-gap readback.
- [ ] Receipt/proof-gap/reconstruction readback shows actor, proposal, policy, decision, gateway, attempt, outcome, audit, dispute/reversal posture, and repair/no-repair action.
- [ ] Discovery/public/developer copy says owner-pending/approval-required only; autonomous/callable/direct-execute/payment claims fail scans.
- [ ] E2E/unit/integration tests cover duplicate, stale, concurrent, wrong-owner, expired, refused, proof-gap, downstream failure, success, mobile, keyboard, focus, and disabled states.
- [ ] Source-mining/import scans prove no hosted agents, broad action catalogs, request market, wallet/payment, MCP/OpenAPI/SDK mutation bloat, or autonomous execution ships.

## Product Design Pass

**Mode:** Shape/Harden for future implementation. This phase introduces consequential owner decisions, so interaction semantics and consequence clarity are safety requirements, not polish.

**Primary user/job/object/outcome:**
- User: owner/manager deciding on one proposed action, plus operator reconstructing provider/readback outcomes.
- Job: understand a proposed action, approve or reject it, and see whether the attempted outcome succeeded, failed, or has a proof gap.
- Object: candidate action, policy result, owner decision, gateway admission, provider/internal attempt, receipt/proof-gap, and audit chain.
- Outcome: no protected action happens without informed owner approval, and every result can be reconstructed.

**User-visible surfaces to design:** owner action queue, action detail/review panel, approve/reject controls, disabled/expired/refused states, consequence/reversibility/deadline/proof disclosure, attempt progress, receipt/proof-gap/failure readback, repair/no-repair action, and operator reconstruction.

**Product decisions locked:**
- One action class only; broad catalogs and autonomous execution stay out.
- Inline consequence disclosure is required before approval; do not hide it behind decorative modals or protocol copy.
- Approve/reject are actions, not navigation; controls must name object, scope, consequence, reversibility, deadline, and proof requirement.
- Proof gaps are honest terminal or repairable states, not silently successful execution.

**Reachable states that implementation must render:** no proposals, review required, refused, expired, missing proof, external-authority required, time-bound warning, disabled reason, wrong-owner/forbidden, duplicate/stale proposal, approve pending, reject pending, provider attempt pending, timeout, mismatch, failed, proof_gap, successful receipt, disputed/reversed, repair available, no-repair, mobile 375px, keyboard/focus path, and long action names/provider messages.

**Product-design acceptance:** Closeout must include rendered queue/detail/approval/rejection evidence at compact and wide widths, keyboard/focus proof, consequence-copy proof, disabled/expired/proof-gap/failed/success evidence, and scans proving no autonomous/direct-execute/payment wording ships.

## Edge Coverage

**Coverage:** 13/13 applicable edges resolved · 0 unresolved

| Category | Requirement | Status | Resolution / Reason |
|----------|-------------|--------|---------------------|
| unclassified | R1 | ⛔ dismissed | Decision-record requirement is verified by explicit acceptance; concrete edge behavior starts at proposal/policy requirements. |
| unclassified | R2 | ⛔ dismissed | Proposal contract edge cases are explicitly listed in acceptance: invalid target/class/key/replay/suppression/wrong actor. |
| boundary, adjacency, empty, ordering, precision | R3 | ✅ covered | Acceptance covers policy boundaries, adjacent states, missing proof, deterministic ordering, exact result states, and no provider side effects. |
| unclassified | R4 | ⛔ dismissed | UI/consequence requirement is covered by E2E/a11y acceptance and owner access tests. |
| idempotency, concurrency | R5 | ✅ covered | Acceptance covers one-use admission, duplicate replay, bounded retries, timeout/mismatch, and concurrent attempt races. |
| unclassified | R6 | ⛔ dismissed | Reconstruction readback is a verification/read model; acceptance enumerates missing/stale/failed/proof-gap/success/dispute/reversal states. |
| unclassified | R7 | ⛔ dismissed | Discovery wording is governed by copy/schema scans and prohibitions. |
| unclassified | R8 | ⛔ dismissed | Closeout bundle has explicit path coverage and excluded-surface tests. |

## Prohibitions (must-NOT)

**Coverage:** 6/6 applicable prohibitions resolved · 0 unresolved

| Prohibition (must-NOT statement) | Requirement | Status | Verification / Reason |
|----------------------------------|-------------|--------|------------------------|
| MUST NOT execute a protected action autonomously or directly from an agent/developer/protocol request without owner approval. | R1, R4, R5, R7, R8 | resolved | test: gateway/provider attempt denial plus copy/schema scans. |
| MUST NOT ship broad action catalogs, request-market, hosted-agent, skill marketplace, or generic action gateway topology before one action class proves demand. | R1, R8 | resolved | test + judgment: decision record and source-mining scans. |
| MUST NOT treat MCP/OpenAPI/SDK/plugin descriptors as action authority. | R7 | resolved | test: descriptor scans and route authority tests. |
| MUST NOT include money movement, payment authorization, wallet/credits/balance, Stripe/x402/Connect, settlement, or paymentRequired=true behavior in Phase 4. | R1, R5, R7, R8 | resolved | test: import/source-mining/copy scans. |
| MUST NOT hide consequence, reversibility, deadline, proof requirements, or disabled reasons from the approving owner. | R4 | resolved | test + judgment: owner UI E2E and product-design review. |
| MUST NOT let provider success/failure be unreconstructable or mutate state without a proposal, policy, owner decision, gateway, audit, and receipt/proof-gap chain. | R5, R6 | resolved | test: reconstruction and provider-attempt state tests. |

Canon security/compliance items such as CSRF, injection, SSRF, generic OWASP controls, cookie/session handling, provider-secret hygiene, and privacy law baselines remain owned by SECURITY-SPEC.md, secure-phase/code review, and implementation tests. This section records only phase-specific product and architecture prohibitions.

## Ambiguity Report

| Dimension          | Score | Min  | Status | Notes |
|--------------------|-------|------|--------|-------|
| Goal Clarity       | 0.86  | 0.75 | ✓      | One owner-approved action outcome is measurable. |
| Boundary Clarity   | 0.90  | 0.70 | ✓      | Single action class, no autonomy, no money, no broad catalog are explicit. |
| Constraint Clarity | 0.82  | 0.65 | ✓      | Handshake/proposal/gateway/readback constraints are specified. |
| Acceptance Criteria| 0.86  | 0.70 | ✓      | Criteria cover proposal, policy, owner decision, attempt, reconstruction, scans, and edge paths. |
| **Ambiguity**      | 0.14  | ≤0.20| ✓      | Gate passed from roadmap, Phase 1 context, and phase-specific source-mining scouts. |

Status: ✓ = met minimum, ⚠ = below minimum.

## Interview Log

| Round | Perspective | Question summary | Decision locked |
|-------|-------------|------------------|-----------------|
| 0 | Researcher | Current state scout | P4 is roadmap-only; Phase 1 carries lifecycle descriptors but no action runtime. |
| 1 | Simplifier | What is the smallest safe P4? | Exactly one non-money owner-approved action class, selected from observed P2/P3 demand. |
| 1 | Boundary Keeper | What is forbidden? | No autonomous execution, broad catalogs, hosted agents, request market, money, or descriptor-as-authority. |
| 2 | Edge Probe | Resolve 13 applicable edge probes | Policy and provider idempotency/concurrency edges specified; non-data decision/readback rows dismissed with reasons. |
| 3 | Prohibition Probe | Resolve Phase 4 must-NOTs | Six action-specific prohibitions are resolved into tests or judgment review. |

---

*Phase: 04-owner-pending-protected-actions*
*Spec created: 2026-06-27*
*Next step: /gsd:discuss-phase 4 — implementation decisions (how to build what is specified above)*
