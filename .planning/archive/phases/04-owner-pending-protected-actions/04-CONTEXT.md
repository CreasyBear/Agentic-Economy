# Phase 4: Owner-Pending Protected Actions - Context

**Gathered:** 2026-06-27
**Status:** Ready for production planning after P2/P3 evidence identifies the first action class

<domain>
## Phase Boundary

Phase 4 ships one production protected-action loop: a consequential non-money action is proposed, policy-checked, approved or rejected by the source-owned owner, attempted through one provider/internal boundary only after approval, and reconstructed with receipt/proof-gap/readback.

This phase is the authority spine for future autonomous and money work. It is not a generic action platform. It must be live for the selected action class: durable proposal, policy, owner decision, gateway admission, provider/internal attempt, receipt/proof-gap, audit, operator readback, repair/no-repair, UI evidence, deploy/readback smoke, and copy/protocol scans.

Phase 4 does not ship autonomous protected execution, broad action catalogs, request market, provider marketplace, hosted agents, skills marketplace, MCP/OpenAPI/SDK mutation surfaces, or money movement.

</domain>

<spec_lock>
## Requirements (locked via SPEC.md)

**8 requirements are locked.** See `04-SPEC.md` for full requirements, boundaries, and acceptance criteria.

Downstream agents MUST read `04-SPEC.md` before planning or implementing. Requirements are not duplicated here.

**In scope (from SPEC.md):**
- One non-money, owner-approved action class selected from Phase 2/3 evidence.
- Selected-action-specific proposal command, policy evaluation, owner decision, provider/internal attempt, proof-gap/receipt, and reconstruction readback.
- Source-owned action proposal, owner decision, gateway/attempt, proof-gap, receipt, audit, and repair/no-repair state.
- Owner queue/detail UI for approve/reject with consequence, reversibility, deadline, proof requirements, disabled reasons, and accessible states.
- Discovery copy/schema updates that describe owner-pending proposals only when true.
- Tests for stale, duplicate, concurrent, wrong-owner, expired, refused, proof-gap, provider failure, and success paths.

**Out of scope (from SPEC.md):**
- Autonomous protected execution.
- Multiple action classes, provider marketplaces, broad action catalogs, request market, skills, hosted agents, or generic action gateway.
- Money movement, billing, settlement, wallet, credits, payment authorization, Stripe, Connect, x402.
- MCP/OpenAPI/SDK/plugin mutation surfaces unless exact proposal-only authority is route-tested and server-enforced.
- LLM-generated consent, hidden approvals, progressive auto-resolve, or dark-pattern confirmations.
- Physical-world proof claims beyond recorded provider/internal readback and explicit proof-gap posture.

</spec_lock>

<decisions>
## Implementation Decisions

### Production posture
- **D-01:** Completed Phase 4 means one protected action works end-to-end in production scope. It is not a dormant generic action table or protocol descriptor.
- **D-02:** Action selection is a product decision made during Phase 4 planning from real P2/P3 evidence. The context does not fake a choice before evidence exists.
- **D-03:** If P2/P3 evidence is weak, Phase 4 planning must either pick the least risky evidence-backed action or explicitly stop and gather evidence. It must not invent a broad action platform to avoid the choice.

### Deep module seams
- **D-04:** External interface is small and selected-action-specific: `propose{SelectedActionPascal}`, `evaluate{SelectedActionPascal}Policy`, `listOwner{SelectedActionPascal}Queue`, `decide{SelectedActionPascal}Proposal`, `record{SelectedActionPascal}AttemptReadback`, and `read{SelectedActionPascal}Reconstruction`.
- **D-05:** Implementation owns exact contract hash, actor/target/owner context, idempotency, parameter allowlist, policy result, owner decision, gateway admission, provider/internal attempt, receipt/proof-gap, audit, repair/no-repair.
- **D-06:** Do not introduce generic action registry, marketplace, provider plug-in system, or action DSL. One exact contract earns the seam.

### Authority lifecycle
- **D-07:** The selected-action proposal command cannot execute providers. It only creates a candidate proposal and audit state.
- **D-08:** Policy evaluation has no side effects and returns exact typed states: review-required/refused/expired/proof-gap/missing-proof/external-authority/time-bound as applicable.
- **D-09:** Owner approval/rejection requires source-owned owner access and visible object, scope, consequence, reversibility, deadline, proof requirement, disabled reason, and audit.
- **D-10:** Provider/internal attempt occurs only after valid approval plus one-use gateway admission. Replay, duplicate, stale, timeout, mismatch, failure, and concurrent races are typed and reconstructable.

### Provider/readback boundary
- **D-11:** Provider success is evidence, not source authority. Internal reconstruction ties proposal, policy, owner decision, gateway, attempt, provider readback, receipt/proof-gap, audit, dispute/reversal posture, and repair/no-repair action.
- **D-12:** Physical-world proof beyond provider/internal evidence is never claimed. Proof gaps are honest product states.
- **D-13:** Bounded retries are allowed only with idempotent attempt state and visible retry/no-repair readback.

### Discovery and copy
- **D-14:** Discovery may describe the selected action only as owner-pending/approval-required after server behavior exists.
- **D-15:** Copy/protocol scans fail on autonomous, callable direct execute, guaranteed provider success, payment, or hidden approval claims.

### the agent's Discretion
- The planner may choose the selected action only after reading P2/P3 evidence and documenting the tradeoff. Candidate selection must favor the smallest action that proves the authority spine.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Production spine
- `.planning/phases/02-05-PRODUCTION-MATURITY-CONTEXT.md` — cross-phase production posture, module seams, and evidence standard.

### Phase requirements
- `.planning/phases/04-owner-pending-protected-actions/04-SPEC.md` — locked Phase 4 requirements, boundaries, acceptance, prohibitions.
- `.planning/ROADMAP.md` — Phase 4 objective and bloat relapse detector.
- `.planning/STATE.md` — current Phase 1 execution state.

### Upstream evidence
- `.planning/phases/02-human-inquiry-owner-inbox/02-SPEC.md` and `.planning/phases/02-human-inquiry-owner-inbox/02-CONTEXT.md` — human owner/inquiry demand and owner-access patterns.
- `.planning/phases/03-standard-agent-builder-discovery/03-SPEC.md` and `.planning/phases/03-standard-agent-builder-discovery/03-CONTEXT.md` — discovery demand and protocol non-authority posture.
- `.planning/PROJECT.md` — authority seams, audit, idempotency, durable model.
- `.planning/SECURITY-SPEC.md` — owner/admin authority, CSRF, redaction, prompt-injection, provider URL quarantine.
- `.planning/AI-SPEC.md` — protocol output follows server-enforced capability.
- `.planning/ENGINEERING-STANDARDS.md` — TypeScript/Convex/test standards.
- `.planning/SOURCE-MINING.md` and `.planning/source-mining/phase-1-ledger.md` — source-mining discipline and banned backup imports/symbols.
- `../Agentic-Economy-Backup/.planning/retro/FULL-MATURITY-GAP-REGISTER.md` — alpha maturity failures around advisory kernel, process-local greenlight, fake action taxonomy, receipt/proof conflation, and admin authority drift.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Phase 1 will supply owner/admin authority, audit, idempotency, operator controls, suppression, and public projection posture.
- Phase 2 will supply owner inbox/access/reply and private message/readback patterns.
- Phase 3 will supply read-only discovery/protocol honesty patterns.

### Established Patterns
- Route/server functions adapt; Convex/domain modules own behavior.
- Provider/protocol artifacts never mint authority.
- Receipts must distinguish policy/gateway evidence from downstream success.

### Integration Points
- Uses P2 owner identity and owner queue UI patterns.
- Uses P3 discovery only to advertise approval-required state after route-tested behavior exists.
- Feeds P5 by proving authority, receipt, reversal/dispute posture, and operator reconstruction before money.

</code_context>

<specifics>
## Specific Ideas

The first protected action should be boring and evidence-backed. Good candidates are actions owners already attempt manually after inquiries or builder discovery. Bad candidates are broad booking/payment/provider marketplaces.

</specifics>

<deferred>
## Deferred Ideas

- Autonomous protected execution, multi-action catalogs, provider marketplace, request market, skills, hosted agents, MCP/OpenAPI/SDK mutation, and money movement stay out.

</deferred>

---

*Phase: 04-owner-pending-protected-actions*
*Context gathered: 2026-06-27*
