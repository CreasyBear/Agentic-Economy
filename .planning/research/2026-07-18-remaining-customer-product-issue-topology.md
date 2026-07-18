# Remaining customer-product issue topology after the #132 development comparisons

**Owner:** Product
**Status:** Active
**Maturity:** Current evidence
**Question:** After the procurement and itinerary development comparisons in #132, which remaining customer-product issues should AE work through, in what order, and what evidence unlocks each investment?
**Decision affected:** D-005, D-006, D-007
**Evidence cutoff:** 2026-07-18
**Review by:** 2026-07-25
**Supersedes:** None
**Superseded by:** None

## Executive finding

The next decision is whether AE should finish the truth-agreement and cold-comprehension proof already claimed in [#132](https://github.com/CreasyBear/Agentic-Economy/issues/132), then pause product engineering until real field evidence selects one valuable task and participating cohorts. The evidence supports **yes**.

Confidence is high on issue ordering because it comes from live issue bodies, their explicit blockers, current authority documents, and live source inspection. Confidence is low on the first commercial task because the project records correctly say the required interviews, observed baselines, independent provider participation, and fact-decay evidence do not exist.

The portfolio contains **19 open customer-product issues inspected here**: six in the existing customer-product map (`#112`, `#115`, `#132`, `#137`–`#139`) and thirteen in the task-first map (`#181`–`#193`). Only **#132** is the presently claimed execution thread. Its procurement and itinerary comparisons satisfy Gate 3's declared labelled sandbox/development class, so Gate 4 may begin. They do not establish independently operated supply, real fulfilment, production readiness, or customer value.

## Observations

- **OBSERVED:** Live GitHub state on 2026-07-18 shows the 19 issues above remain open. `#132` is labelled `wayfinder:prototype, ready-for-agent`; `#193` is also labelled `ready-for-agent`; the other task-first issues carry Wayfinder map, research, or grilling labels. Command: `gh issue list --state open --limit 200 --json number,title,url,labels,milestone,createdAt,updatedAt` plus `gh issue view` for all 19 issue bodies. [Open issues](https://github.com/CreasyBear/Agentic-Economy/issues)

- **OBSERVED:** The live #132 record requires six ordered gates. Gate 3 requires both procurement and itinerary comparisons; Gate 4 requires one exact-revision agreement eval across `/`, `/SKILL.md`, `/llms.txt`, agent discovery, Request schemas, action descriptors, human and agent projections, and executed runtime behavior. Gate 5 requires five cold humans and three isolated external-agent sessions. Gate 6 requires explicit user authorization and begins only after Gates 1–5 pass. [Issue #132](https://github.com/CreasyBear/Agentic-Economy/issues/132)

- **OBSERVED:** #132's two latest live comments record procurement at revision `71fac1887b43b7529653fda97b7344e1e99c1b00` and itinerary at revision `ce452f2286d97d9892ef00099d32245da9c8c367`, both with `pass_for_declared_class`, exact matching direct/AE cost, durable resume, replay and integrity evidence, and an explicit sandbox/development-only boundary. The exact proof branch still resolves to `ce452f2286d97d9892ef00099d32245da9c8c367`. Commands: `gh issue view 132 --json ...`; `git show-ref --verify refs/heads/codex/issue-132-customer-product-proof`. [Procurement evidence](https://github.com/CreasyBear/Agentic-Economy/issues/132#issuecomment-5010271098), [itinerary evidence](https://github.com/CreasyBear/Agentic-Economy/issues/132#issuecomment-5010505792)

- **OBSERVED:** Current source already contains useful Gate 4 components—`src/modules/customer-request/cross-surface-parity.ts`, `tools/dev/customer-request-development-surface-parity.ts`, discovery routes/files, action descriptors, hosted journey evidence, human lifecycle smoke, and exact-revision release smoke—but no single source-owned eval was found that binds all Gate 4 surfaces and an executed Request from one revision. Command: `rg --files src tests tools | rg 'surface|parity|agreement|discovery|public-origin|hosted-agent-journey|development.*smoke'` and focused symbol search.

- **OBSERVED:** `PRODUCT.md` says the customer-reachable product remains published business information, comparison, qualified inquiry, and exact authenticated Request states. It explicitly says the sandbox agent journey does not prove useful real supply or human parity, and that customer-reachable composite approval, execution, booking, payment, dispatch, and fulfilment remain absent. [Product authority](../../PRODUCT.md)

- **OBSERVED:** D-005 says to prove depth in one request family before broad supply expansion. The first request family remains an open decision. Q-001 requires primary field evidence, an incumbent baseline, recruitable supply, fact decay, and a safe useful next step; its status is `INTERVIEWS REQUIRED`. Q-003 and Q-010 also require business/owner fieldwork. [Project records](../records/PROJECT-RECORDS.md), [research queue](../records/RESEARCH-QUEUE.md)

- **OBSERVED:** The Product Foundry defines four independent gates: customer value, provider value, operational leverage, and platform leverage. It requires at least five recent real cases, an incumbent baseline before preregistering improvement, provider and backstage work measurement, and cross-wedge replay. The portfolio remains `evidence_pending` until field observations exist. [Product Foundry](2026-07-17-product-foundry-primitive-refinery-program.md)

- **OBSERVED:** The same Foundry record says issues #181–#187 remain dormant and may be rewritten only after a selected commercial cohort, observed baseline, primitive coverage matrix, promotion dispositions, product proof design, and transfer test exist. Live GitHub nevertheless leaves those issues open, and #193 is marked `ready-for-agent`.

- **OBSERVED:** The task-first issue dependencies are explicit:

  | Issue | Explicit blockers |
  |---|---|
  | [#185](https://github.com/CreasyBear/Agentic-Economy/issues/185) | #182, #183 |
  | [#186](https://github.com/CreasyBear/Agentic-Economy/issues/186) | #182, #185 |
  | [#187](https://github.com/CreasyBear/Agentic-Economy/issues/187) | #183, #184 |
  | [#188](https://github.com/CreasyBear/Agentic-Economy/issues/188) | #183, #185, #187 |
  | [#189](https://github.com/CreasyBear/Agentic-Economy/issues/189) | #184, #185, #187, #188 |
  | [#190](https://github.com/CreasyBear/Agentic-Economy/issues/190) | #182, #186, #188 |
  | [#191](https://github.com/CreasyBear/Agentic-Economy/issues/191) | #186, #189, #190 |
  | [#192](https://github.com/CreasyBear/Agentic-Economy/issues/192) | #184, #187 |

- **OBSERVED:** #189 says source changes wait until its architecture decision and ADR-009 acceptance gates resolve. #191 is the handoff gate into implementation. Yet #193 already proposes implementing the Action Invocation seam. Live source inspection found the Action Invocation names in planning documents but not implemented in `src/`, `convex/`, or tests; `.planning/STATE.md` also labels both related phases design-only and not executed.

- **OBSERVED:** In the older customer-product map, #137 is information-architecture consolidation, #138 is downstream claim/remedy machinery, #139 requires independently owned live supply, a route-value falsifier, pricing, a named supply owner, and mechanically honest claims, while #115 is the final closeout/premortem. [Map #112](https://github.com/CreasyBear/Agentic-Economy/issues/112), [#115](https://github.com/CreasyBear/Agentic-Economy/issues/115), [#137](https://github.com/CreasyBear/Agentic-Economy/issues/137), [#138](https://github.com/CreasyBear/Agentic-Economy/issues/138), [#139](https://github.com/CreasyBear/Agentic-Economy/issues/139)

## Inferences

- **INFERRED:** Gate 4 is the earliest valid next transition because Gate 3's two required cohorts now pass their declared development class, issue #132 remains open and claimed, and its specification orders Gate 4 next.

- **INFERRED:** Gate 4 should extend the existing parity/discovery/journey seams into one fail-closed agreement eval, not create another product model. The smallest blast radius is test/eval orchestration plus only the earliest source correction exposed by that eval.

- **INFERRED:** Gate 5 is the last authorized #132 development gate. It tests comprehension and unsupported-claim resistance, not customer value. Gate 6 must remain blocked unless the user separately authorizes a production wave.

- **INFERRED:** After Gate 5, the portfolio should stop adding platform substrate and run the field-evidence unlock: reconstruct at least five real recent cases in the top candidate cohort, measure the incumbent burden, recruit independent participating businesses, test which facts/actions they maintain, and preregister customer/provider/operator thresholds. This is the evidence needed to select or reject the first task.

- **INFERRED:** #193 is not execution-ready despite its label. Its implementation would front-run #189's architecture decision, #191's handoff gate, ADR-009 acceptance, the Foundry dormancy rule, and the missing commercial cohort. Treating its label as authorization would convert a proposed design into source before customer and provider value are known.

- **INFERRED:** Security issue #192 should become a native blocker of #191 even though #191's body does not list it, because #191 requires a security review and protected-action model. This is a proposed dependency correction, not an adopted issue change.

## Prioritized remaining-issue topology

| Order | Portfolio loop | Issues | Entry eval | Exit / decision |
|---:|---|---|---|---|
| 1 | Finish the claimed development proof | #132 Gate 4 | One exact-revision public-surface/runtime agreement eval starts red | All advertised actions reachable; human/agent/runtime meaning agrees; stale supply fails closed |
| 2 | Prove cold comprehension | #132 Gate 5 | Five cold humans + three isolated external-agent sessions, no teaching or source access | 8/8 complete or truthfully stop; all six human prompts correct; zero evidence-class inflation; no release blocker |
| 3 | Reconcile overlap, do not deploy | #137 audit against #132 Gates 1–4; #112 status | Requirement-by-requirement overlap audit | Close/update only what executable evidence actually satisfies; Gate 6 remains unauthorized |
| 4 | Field-evidence unlock | Product Foundry prerequisites; then rewrite/activate #182–#184 as warranted | At least five real cases, incumbent baseline, independent provider participation, fact-decay and operator-work measures | Select/reject first task and cohorts; unlock a truthful provider contract and source map |
| 5 | Decide task, provider contract, and continuation | #182 + #183 + #184 → #185 + #187 + #192 | Real cases plus current-source constraint map | One valuable task, realistic provider contract, portable continuation, and accepted security invariants |
| 6 | Falsify and specify | #186 + #188 → #189 + #190 → #191 | Task prototype, contrasting transfer/direct control, paired scorecards | Approve, narrow, refine, service-operate, or stop; only an approved spec may enter implementation |
| 7 | Implement only after handoff | #193, rewritten to the accepted #191 specification | Red contract/evals through the approved seam | Source implementation with no synthetic Request, parallel lifecycle, or universal task object |
| 8 | Market/remedy/closeout downstream | #138 + #139 + #115 | Real independently operated supply, customer/provider/operator evidence, pricing/ownership, production authorization | Exact bounded market claims or explicit no-launch/stop decision |

## Unknowns

- **UNKNOWN:** Whether #132's exact proof branch can be reconciled with the concurrently changing main branch without altering the Gate 3 evidence seam. This requires a scoped integration check, not a merge assumption.

- **UNKNOWN:** Whether the Gate 4 red eval will first fail on public-origin consistency, action reachability, authority metadata, live supply readiness, or human/agent runtime parity.

- **UNKNOWN:** Which first task and cohort create enough customer and provider value. Desk-review ranking of low-risk events is not field selection.

- **UNKNOWN:** Whether real businesses will maintain the facts and supported actions required for comparison, and at what decay interval.

- **UNKNOWN:** Whether #181–#187's dormant status or their current open issue bodies are the intended governance truth. The conflict should be resolved before claiming one of those issues.

## Hypotheses and falsifiers

| ID | Hypothesis | Baseline | Measurement | Falsifier | Owner | Review by |
|---|---|---|---|---|---|---|
| H-RI-01 | Existing source seams can satisfy Gate 4 without a new lifecycle or projection model | Current separate parity, discovery and journey evals | New production-source files/types and duplicated semantics | Gate 4 requires a second authority, recovery, recommendation, or Request model | Engineering | 2026-07-25 |
| H-RI-02 | Cold reviewers understand the supported boundary after Gates 1–4 | Uncoached first exposure | Gate 5's eight completions and six comprehension prompts | Any authority/recovery failure, operator choreography, or evidence-class inflation | Product | 2026-07-31 |
| H-RI-03 | One field-observed task removes at least 30% of a primary coordination burden without worse correctness, time, cost, privacy, control, or operator work | Measured incumbent cases | Paired incumbent/AE-assisted cohort | Threshold missed, provider re-keying persists, or backstage work erases the gain | Product | 2026-08-17 |
| H-RI-04 | Action Invocation is needed after the task/provider/continuation evidence resolves | Existing registered action and Request-owned execution seams | #189 alternatives against two contrasting tasks and direct control | Existing references plus task-local records satisfy continuity without the new control record | Engineering | 2026-08-17 |

## Decision impact

Adopt the portfolio order above as the working plan: finish #132 Gate 4 and Gate 5; do not start production Gate 6; then require field evidence before task-first platform implementation.

Proposed record updates after founder review:

1. Record the portfolio sequencing decision in `PROJECT-RECORDS.md`.
2. Reconcile the Foundry dormancy rule with open issues #181–#187.
3. Remove or suspend #193's execution-ready status until #189, #191, ADR-009 and the field-evidence gate resolve.
4. Add #192 as an explicit #191 blocker.

No ADR or authority update is authorized by this research alone.

## Current-versus-target check

- **Current evidenced behavior:** Labelled sandbox/development procurement and itinerary comparisons passed their declared class. Current customer reachability remains the narrower behavior stated in `PRODUCT.md`.
- **Target behavior informed by this research:** One truthful product surface, independently useful business tasks, safe continuation and optional composition, backed by real participating businesses and paired customer/provider/operator evidence.
- **Claims this research does not authorize:** Independently operated supply, real procurement or itinerary fulfilment, production readiness, customer value, provider value, launch readiness, booking, payment, dispatch, guarantees, or a production deployment.

## Sources

- [Issue #132 executable closeout and live evidence](https://github.com/CreasyBear/Agentic-Economy/issues/132)
- [Customer-product map #112](https://github.com/CreasyBear/Agentic-Economy/issues/112)
- [Task-first map #181](https://github.com/CreasyBear/Agentic-Economy/issues/181)
- [Task-first specification gate #191](https://github.com/CreasyBear/Agentic-Economy/issues/191)
- [Action Invocation implementation proposal #193](https://github.com/CreasyBear/Agentic-Economy/issues/193)
- [`PRODUCT.md`](../../PRODUCT.md)
- [`PROJECT-RECORDS.md`](../records/PROJECT-RECORDS.md)
- [`RESEARCH-QUEUE.md`](../records/RESEARCH-QUEUE.md)
- [Product Foundry and Primitive Refinery program](2026-07-17-product-foundry-primitive-refinery-program.md)
- [Workflow substitution candidate review](2026-07-17-workflow-substitution-candidate-review.md)
- [Partial-entry premortem](2026-07-17-partial-entry-premortem.md)
