# T43 — Human + agent framework parity specification

Labels: `wayfinder:spec`, `wayfinder:active`. Map: [Framework](../MAP-framework.md).

## Decision

**Locked 2026-08-01** under the founder's instruction to keep moving until the framework vision is externally usable. This specification converts T26–T30, T33–T37 and T40 into one vertical program. It supersedes ad-hoc horizontal implementation of those tickets; their source-grounded decisions remain inputs.

Agentic Economy will expose one durable WorkTree through two public seams:

1. **Human:** `/` — state an outcome, observe elaboration/study, act on the decision inbox, and reread receipts.
2. **Agent:** registered `workTree.*` actions projected through the existing authenticated HTTP/action host; MCP remains read-only until its identity/authority host can satisfy the same contract.

Convex WorkTree snapshot + append-only events own state. Customer Request remains the broader-outcome aggregate. Stream, transcript, components, email and reports are projections. There is no agent-only plan or second decision store.

## Concrete wedge and kill gate

The first externally observed wedge is **“Get my BAS lodged before the quarter.”** It is the source-backed J12 acquisition-to-paid candidate, not a market-size claim. Development may use labelled mock cohorts; customer-value evidence requires real Australian SMB participants and independently operated bookkeepers.

Freeze these numbers before admitting the first external run:

| Gate | Frozen threshold |
| --- | --- |
| Window | 30 calendar days |
| Cohort | 12 admitted, attributed BAS starts; no post-hoc exclusions |
| Supply | At least 3 independently operated bookkeeping/BAS-provider businesses |
| Decision-ready latency | At least 75% within 24 hours |
| Blind preference | At least 60% of paired evaluable cases prefer AE to the incumbent assistant |
| Outcome evidence | At least 50% of all admitted starts reach provider-backed completion or a customer-accepted next step |
| Truthfulness | 0 false success, fulfilment or payment claims |
| Refusal/unknown | At most 25% combined; every case remains in the denominator |
| Manual work | Median ≤1 and p90 ≤3 AE operator touches per admitted start |
| Commercial | At least 2 signed paid pilots and at least 1 settled real payment |
| Unit economics | Positive contribution margin on the observed paid cases, excluding founder labour but reporting it separately |

These are deliberately small proof thresholds, not scale claims. Missing data fails the affected gate. Thresholds may not move after the run starts. `N=3` remains only the decision-inbox display cap.

## User stories

### Person relying on AE

- As a person with an outcome, I can submit plain language at `/` and receive a durable project reference before model work begins.
- I can reload or change device and see the same WorkTree, generation, revision, five-dimension rollups, fog and evidence class.
- I can see no more than three decision-ready items, ordered by source-owned projection rules.
- I can Lock, Adjust or Park one exact current decision; stale or unauthorized actions refuse visibly.
- I can distinguish provider evidence, labelled mock evidence, refusal and unknown. AE never converts one class into another.
- I can reread a durable receipt containing the exact source transition and the next decision.
- I can inspect the whole tree behind progressive disclosure without treating the component tree as authority.
- I can receive a weekly memo/exception alert derived from the same journal, with a link back to public readback.
- I can grant, inspect and withdraw bounded repeat permission only for an eligible low-risk action; material widening requires a fresh decision.

### External calling agent

- As an authenticated agent, I can discover machine-readable `workTree.create`, `workTree.inspect`, `workTree.apply` and `workTree.decide` contracts.
- I can create or resume the same project the person sees, with a durable principal/owner binding.
- I can submit `elaborate`, `study` and `propose_decision` through one discriminated proposal contract.
- I receive the same generation/revision/proposal-digest fences and durable receipts as the human host.
- A retry with the same idempotency key returns the prior receipt; a conflicting replay or stale fence fails closed.
- I cannot use authority I was not granted, infer permission from a transcript, or bypass the decision inbox.
- Human action followed by agent readback, and agent action followed by human readback, expose the same semantic state.

### Business/provider and operator

- A listed provider can be cited as real supply only after identity, service readiness and evidence provenance are verified.
- A provider response, refusal, expiry or unknown result is appended to the Study/RFx journal and remains observable.
- AE records every manual operator touch for the external gate.
- No live debit, payout or fee/share promise proceeds until T52's role, GST, invoice, refund and privacy decisions are accepted and implemented.

## Public contracts

### WorkTree source

Reuse `ae.work-node:v1` and `ae.work-tree:v1` from `src/modules/work-tree/internal/contract.ts` with generation, revision, five dimensions, bounded fog/elaboration and status transition rules. Add a source-owned project initializer and principal binding; never seed source rows from UI/tests outside that API.

### Registered actions

- `workTree.create` — creates/resumes one Customer-Request-owned or standalone project and returns its reference.
- `workTree.inspect` — inspect-only readback of the current tree, rollups, capped inbox and receipts.
- `workTree.apply` — applies exactly one `elaborate | study | propose_decision` proposal with expected generation/revision and proposal digest.
- `workTree.decide` — applies exactly one `lock | adjust | park` decision to one current inbox item with exact authority and fences.

All descriptors must declare consequence, retry, authority, uncertainty and evidence effects. Hosts are transport projections only.

### Study/RFx source

A Study stores scan inputs, candidate/provider observations, quote validity and evidence class, per-criterion scores/contributions, recommendation and RFx event chronology. XState controls the RFx lifecycle, but replayable source events — not an opaque serialized machine snapshot — are durable truth. Expired quotes cannot recommend or lock.

### Receipts and readback

Every accepted or refused write appends a bounded event and returns a receipt whose identity is stable across retry. Public readback exposes source class, operation/idempotency identity, generation/revision, disposition (`succeeded | refused | unknown`), evidence references and next decision. It never exposes secrets or internal reasoning.

## TDD seams

Tests are vertical tracer bullets, one public seam per cycle:

1. Human `/` action → public WorkTree readback → decision receipt.
2. Registered agent action → same WorkTree readback → same receipt semantics.
3. Study action → RFx journal/readback → inbox proposal.
4. Memo notification → public readback link → source event.
5. Hosted human + agent run against one deployed backend.

Do not assert Convex tables, React component state, transcript text or source structure when public readback can prove behavior. Use labelled source-owned fixtures only for development. No fallback model/provider may create fake success.

## Dependency-ordered tracer tickets

1. [T44](T44-green-release-baseline.md) — restore a trustworthy green release gate.
2. [T45](T45-project-identity-and-source-initialization.md) — bind durable project identity and initialize through the source API.
3. [T46](T46-human-root-worktree-loop.md) — human `/` outcome through WorkTree, inbox and receipt.
4. [T47](T47-agent-worktree-parity.md) — external agent actions over the same WorkTree.
5. [T48](T48-durable-study-rfx-journal.md) — durable Study/RFx and evidence-backed recommendation.
6. [T49](T49-shared-decision-receipts-and-memo.md) — Lock/Adjust/Park parity, trust ramp and memo projection.
7. [T50](T50-legacy-engine-clean-cutover.md) — remove the one-shot engine and duplicate decision authority.
8. [T51](T51-hosted-parity-release-proof.md) — exact-SHA hosted human/agent evidence.
9. [T52](T52-compliance-and-first-dollar-gate.md) — counsel-backed live-money/privacy gate.
10. [T53](T53-bas-wedge-external-kill-gate.md) — real BAS cohort, payment and PASS/FAIL/KILL decision.

`T35` playbook format remains deferred. Reopen it only if T46–T49 reveal repeated operator work that a playbook can remove; do not build a second workflow DSL.

## Retirement contract

After replacement tests pass, remove root callers and source ownership for `enginePlans`, `decisionMaps`, `AePlanWork`, `AeDecisionMapJourney`, the one-shot proposal path and embedded RFx snapshots. Keep Customer Request, Action Invocation, WorkTree, Study, inbox/tree projections, labelled sandbox fixtures and standalone actions. No aliases, shims or dual-write period after cutover.

## Evidence and end condition

Evidence classes remain exact: source/local, labelled mock, preview/hosted, independently operated provider, customer value and live money are not interchangeable.

This program ends only when:

- a cold person and a cold authenticated agent operate the same deployed WorkTree and reread matching receipts;
- stale, replayed and unauthorized writes refuse through public seams;
- the legacy engine/decision authority has no caller or table;
- the exact-SHA release gate is green and artifacts are retained without secrets;
- the frozen BAS run reports every admitted case and returns exactly `PASS` or `FAIL/KILL`;
- live money remains refused unless the compliance/counsel gate is accepted and executable.

## Source grounding

- `src/modules/work-tree/internal/contract.ts`, `rollup.ts`, `verbs.ts`
- `convex/workTrees.ts`, `convex/studies.ts`
- `src/modules/work-tree/internal/inbox-projection.ts`
- `src/components/ae/work-tree/AeDecisionInbox.tsx`, `AeWorkTreePanel.tsx`
- `src/routes/index.tsx`, `src/components/ae/chat/AeThreadTurnStreamSection.tsx`
- `src/modules/actions/index.ts`, `src/lib/server/customer-request-agent-api.ts`
- `.planning/adr/ADR-004-evidence-ledger-vs-projections.md`
- `.planning/adr/ADR-009-partial-entry-without-request-ownership.md`
- `.planning/adr/ADR-010-one-action-plane-across-human-and-agent-experiences.md`
- `.planning/wayfinder/JOURNEYS.md` J9–J12
- T26–T30, T33–T37 and T40 source tickets
