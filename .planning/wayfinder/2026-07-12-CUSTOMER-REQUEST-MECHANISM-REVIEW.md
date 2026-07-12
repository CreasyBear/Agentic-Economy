# Customer Request Mechanism — Inversion Premortem

Date: 2026-07-12  
Wayfinder decision: [Validate the customer Plan mechanism before product expansion](https://github.com/CreasyBear/Agentic-Economy/issues/116)  
Branch reviewed: `codex/engine-product-rebuild` at `39a35a54`

## Decision

**Redesign before persistence, capability expansion, API exposure, or customer UI.**

Keep the neutral routing kernel, atomic Action-to-RootRun boundary, output-to-input composition, and the idea of an inspectable proposed plan. Do not promote the current `CustomerPlanSnapshot` reducer into the product aggregate or authority boundary.

The durable customer aggregate is a **Request**. A **Plan revision** is an untrusted proposal for satisfying that Request. A **prepared action** contains exact kernel route-quote evidence. An **approval grant** is independently authenticated authority bound to that prepared action. An **Action attempt** owns dispatch and recovery. A **Request projection** is the customer and agent read model.

The smallest next mechanism is route-first preparation:

```text
untrusted request + plan revision
              |
              v
validate action against registered capability contract
              |
              v
kernel route ---------------------------------------------------+
              |                                                 |
              v                                                 |
persist exact PreparedAction with compare-and-swap              |
              |                                                 |
              v                                                 |
customer sees business, price, data, terms, expiry, rationale   |
              |                                                 |
              v                                                 |
authenticated approval binds exact prepared-action digest       |
              |                                                 |
              v                                                 |
kernel authorize + execute exact still-valid quote              |
              |                                                 |
              +--> dispatch pending: replay same execute --------+
              +--> outcome unknown: reconcile, never redispatch
              +--> completed/failed/cancelled: durable evidence
```

## Question Compiler

- **Raw ask:** Check the Plan mechanism success criteria and inversion-premortem it before AE builds further.
- **Artifact under review:** `src/modules/customer-plan/public.ts`, `kernel-adapter.ts`, their tests, and the intended customer product built above them.
- **Short-term gain:** Compose several atomic kernel runs behind one customer request and expose approval/recovery checkpoints.
- **Future pain risk:** Make an AI-authored workflow snapshot simultaneously become customer intent, commercial agreement, authority, execution truth, and support record.
- **Primary tape mode:** Full Council.
- **Secondary modes:** Architecture, Strategy, Design, Attack, Debt.
- **Compiled question:** This mechanism gets AE from one atomic run to multi-step customer work, but risks approving before commercial terms exist and hardening a forgeable orchestration snapshot into the product contract. If it succeeds, what false promise, authority bypass, coupling, and support burden do we own?
- **Non-question:** Whether to preserve the neutral routing kernel. The kernel remains the execution authority.

## What Already Exists

| Existing mechanism | Reuse decision |
|---|---|
| Neutral kernel route, immutable quote, authorization, execute, inspect, reconcile, cancel | Keep as the only provider-release authority. |
| Quote digest, caller binding, spend/data limits, expiry, idempotency | Reuse; approval must bind to the exact quote instead of preceding it. |
| Safe same-contract fallback and unknown-outcome hold | Keep; expose their customer meaning without protocol vocabulary. |
| RootRun and leaf evidence | Keep as execution evidence, not automatic proof of physical-world fulfillment. |
| Capability binding admission/conformance | Extend with contract-owned consequence and typed I/O semantics. |
| Current CustomerPlan composition tests | Keep as prototype regression evidence, then replace tests that bless forgeable events or pre-quote approval. |
| Existing Request/inquiry/thread concepts | Mine for lifecycle, actor, persistence, and projection patterns; do not graft old inquiry product semantics into the new engine. |

## Success Criteria Audit

Status values: **proven**, **partial**, **contradicted**, **missing**.

| Criterion | Current evidence | Status | Required evidence |
|---|---|---:|---|
| A customer approves the exact business action they will receive | Approval is created before kernel route/provider selection in `public.ts`; routing occurs afterward in `kernel-adapter.ts`. | **contradicted** | Prepared quote with selected binding/business, exact/max all-in price, terms, expiry, recipients, purposes, and digest before approval. |
| Material change invalidates approval | Approval binds Plan input/capability/max/data, not the later kernel quote/provider. | **contradicted** | Revision and prepared-action digest; re-quote/provider/price/data/term change yields `changes_need_approval`. |
| A model or client cannot authorize or assert provider effects | Exported `advanceCustomerPlan` accepts arbitrary approval/completion/reconciliation events and outputs. | **contradicted** | Separate authenticated command/evidence ports; reducer accepts verified grants and kernel evidence only. |
| Consequence policy is contract-owned | Proposal authors `effect: observation | consequential`. | **contradicted** | Registered versioned capability definition owns commitment, spend, disclosure, reversibility, and approval policy. |
| Data disclosure is independently controlled from provider-side effect | Observation auto-runs even when it sends data. | **contradicted** | Checkpoints derived independently from recipient/purpose/sensitivity, spend, commitment, and mandate. |
| Concurrent workers converge on one Plan truth | Snapshot has no revision, CAS store, command idempotency, lease, or outbox. | **missing** | Durable RequestStore with append/CAS, attempt identity, lease/outbox, and crash recovery tests. |
| Dispatch pending and outcome unknown recover differently | Both are pushed toward provider reconciliation; kernel pending recovery requires replaying exact execute. | **contradicted** | Separate states and recovery commands. Pending replays same execute; unknown reconciles and never redispatches. |
| Plan-wide spend and disclosure ceilings hold | Authority references are action-scoped only. | **missing** | Aggregate budget/data reservations across actions, retries, fallback, and parallel branches. |
| Typed outputs safely unlock dependencies | Inputs/outputs are arbitrary string maps; output references need not be declared dependencies. | **missing** | Versioned typed capability schemas and validated provider output evidence. |
| Independent actions can progress without global blocking | `decideCustomerPlan` returns the first incomplete action and running/unknown blocks the Plan. | **contradicted** | Deterministic runnable/checkpoint set plus explicit concurrency policy. |
| Failure, refusal, cancellation, expiry, partial completion, and dispute are durable | Current states are pending/approved/running/completed/outcome_unknown; adapter refusals are not persisted. | **missing** | Full lifecycle and append-only activity/evidence. |
| Customer UI can explain the decision without protocol knowledge | Current approval material is max spend, raw fields, and raw resolved inputs. | **missing** | Request/options/review/activity projection with plain-language commercial terms and recovery. |
| Agent and human surfaces share the same truth | No durable Request projection exists yet. | **missing** | Stable checkpoint/status/evidence objects projected to UI and machine surfaces. |
| Reference journey is a real business action | Tests use in-memory simulation and example artifacts. | **missing** | Hosted registered real provider, real low-value quote/action, artifact, replay, status, and cancellation/non-cancellable proof. |

The current mechanism proves two useful facts: atomic Actions can be composed, and unknown kernel outcomes can halt orchestration. It does **not** prove the production Plan contract.

## Required Domain Split

```text
CustomerRequest                         durable customer objective
├── request revision                    need, constraints, principal, delegated agent
├── clarification history
├── PlanRevision[]                      model-authored, untrusted proposal graph
│   └── ProposedAction[]                references registered capability definitions
├── PreparedAction[]                    exact persisted route-quote evidence
│   ├── selected business/binding
│   ├── alternatives and comparison basis
│   ├── expected + maximum all-in cost
│   ├── data recipients + purposes
│   ├── commitment/cancellation/material terms
│   ├── quote digest + expiry
│   └── prepared-action digest
├── ApprovalGrant[]                     authenticated, exact, expiring, one revision
├── ActionAttempt[]                     durable idempotency + dispatch/recovery identity
│   └── RootRun                         kernel execution evidence
├── ActivityEvent[]                     append-only customer/support reconstruction
└── RequestProjection                   customer/agent states and next safe action
```

The model may propose or revise a Plan. It may not classify consequence, grant authority, interpret provider evidence, or silently substitute a materially different route.

## Consequence Model

Delete the binary assumption that `observation` means safe. Each registered capability declares independent dimensions:

| Dimension | Examples | Checkpoint implication |
|---|---|---|
| Provider commitment | none, hold, reservation, purchase, cancellation | Explicit approval or standing mandate before commitment. |
| Spend | expected, maximum gross, provider price, AE fee, tax | Budget reservation and customer-visible all-in amount. |
| Disclosure | fields, named recipients, purposes, sensitivity, retention where supplied | Approval/mandate based on disclosure, even for reads. |
| Reversibility | reversible until, fee-bearing cancel, irreversible | Show exit conditions before approval. |
| Timing | synchronous, provider pending, asynchronous deadline | Honest waiting and timeout behavior. |
| Evidence strength | provider reported, artifact received, customer confirmed, named verification | Controls completion wording. |

## Lifecycle

Internal states must preserve evidence distinctions. Customer copy is a projection, not the storage enum.

```text
requested
  -> needs_information
  -> planning
  -> preparing_options
  -> review_required
       -> declined
       -> expired
       -> superseded
       -> authorized
  -> dispatch_pending
       -> provider_pending
       -> outcome_unknown
       -> definitely_failed
       -> committed
  -> partially_completed
  -> completed_evidence_received

From allowed states:
  -> cancellation_requested
       -> cancelled
       -> cancellation_rejected
       -> cancellation_unknown

After any reported problem:
  -> issue_reported -> under_review -> resolved | unresolved_terminal
```

Customer projections include “Finding options,” “Ready for your review,” “Changes need approval,” “Requested from <business>,” “We’re checking what happened — we won’t try again,” “Cancellation requested,” and “Needs your attention.” They must never translate `RootRun completed` into unqualified real-world fulfillment.

## Approval Contract

An approval grant binds at minimum:

- Request ID and Request revision.
- Plan revision and Action ID.
- Prepared-action digest and kernel quote ID/digest.
- Selected binding/business and allowed fallback recipients.
- Resolved input digest.
- Expected and maximum gross amount, currency, provider price, disclosed AE fee, and supplied taxes.
- Allowed data fields, named recipients, and purposes.
- Material execution, cancellation, and refund terms or an explicit unavailable/non-cancellable posture.
- Expiry and one-use/replay semantics.
- Authenticated approving principal or standing mandate reference.

Any change to those fields creates a new prepared action and invalidates the old grant.

## Engineering Test Diagram

```text
Request command
  |
  +-- invalid capability/effect metadata ------------> reject [contract test]
  +-- missing/invalid typed input --------------------> needs information [schema test]
  +-- valid ------------------------------------------> append PlanRevision [CAS test]
                                                            |
Prepare action ---------------------------------------------+
  +-- two workers race -------------------------------> one PreparedAction [concurrency]
  +-- no route ---------------------------------------> durable unsupported/refused [negative]
  +-- quote exceeds aggregate budget -----------------> refuse [budget]
  +-- quote widens recipient/data/purpose ------------> refuse [authority]
  +-- exact quote ------------------------------------> review_required [digest]
                                                            |
Approval ---------------------------------------------------+
  +-- wrong principal/signature ----------------------> refuse [auth]
  +-- stale revision / changed quote -----------------> refuse [tamper]
  +-- expired / replayed -----------------------------> refuse [replay]
  +-- exact grant ------------------------------------> authorize [positive]
                                                            |
Dispatch ---------------------------------------------------+
  +-- crash before kernel execute --------------------> lease retry [crash]
  +-- crash after release before persist -------------> replay same execute [idempotency]
  +-- execution pending ------------------------------> replay, never reconcile [recovery]
  +-- provider outcome unknown -----------------------> reconcile, never redispatch [safety]
  +-- effect not committed ---------------------------> safe fallback per exact quote [fallback]
  +-- completed evidence -----------------------------> append evidence [projection]
                                                            |
Cancel/replan ----------------------------------------------+
  +-- cancel supported --------------------------------> exact cancel lifecycle [cancel]
  +-- cancel unknown ----------------------------------> intervention, no false finality [unknown]
  +-- upstream output changes -------------------------> invalidate downstream prepared grants [revision]
  +-- independent branch unaffected ------------------> continue under concurrency policy [graph]
```

## Production Failure Modes

| Failure | Current handling | Required handling |
|---|---|---|
| Customer approves courier A, execution routes to courier B | Possible because approval precedes route and `providerQuoteRef` has no binding affinity. | Approval binds exact quote/binding; no reroute after approval. |
| Two workers prepare different quotes | No Plan concurrency boundary. | CAS one attempt; losing worker reads canonical prepared evidence. |
| Worker crashes after provider release | Kernel idempotency helps, Plan snapshot may not converge. | Durable attempt/outbox; replay exact execute command. |
| A purchase is labelled observation | Model-controlled effect can bypass checkpoint. | Capability registry owns consequence metadata. |
| Quote reads disclose address | Auto-runs as observation. | Disclosure policy independently triggers approval/mandate. |
| Provider says committed but physical service fails | “Completed” overstates reality. | Evidence-qualified status plus issue/reporting path. |
| Quote expires after approval | Current approval does not bind quote. | Expired PreparedAction requires re-prepare and reapproval. |
| Partial multi-action completion | No partial/support model. | Preserve completed history, expose remaining/recovery actions. |
| Adapter refuses execution | Refusal is returned but not persisted. | Durable failure/refusal with next safe action. |
| Cancellation cannot be confirmed | Adapter has no Plan cancellation lifecycle. | Cancel pending/unknown/rejected states and evidence. |

## Monte Carlo Futures

| Future | Likelihood if successful | Residue without redesign | Decision |
|---|---:|---|---|
| Base adoption | high | Customers approve ceilings while AE chooses businesses later. | redesign |
| Customers ask for more autonomous actions | high | “Observation” becomes a blanket bypass for paid/data-releasing reads. | redesign |
| Partial provider integration | high | Strings and optional behavior make capability conformance theatrical. | redesign |
| Concurrent hosted workers | high | Divergent snapshots, repeated routing, idempotency payload conflicts. | redesign |
| Async procurement/booking | high | Waiting and unknown collapse; wrong recovery operation is used. | split |
| Docs and fixture drift | medium | Simulation shipping fixtures become mistaken product proof. | narrow claims |
| Marketplace monetization | medium | Recommendation appears neutral while ranking economics are undeclared. | defer economics; require declared objective |
| Support incident months later | high | Latest snapshot cannot reconstruct who approved what business/terms/evidence. | redesign persistence |
| Scope pressure toward universal agents | medium | Plan becomes a generic workflow engine and consumes the product. | keep bounded capability graph |

## Council Synthesis

| Role | Strongest callout | Hard stop |
|---|---|---:|
| Engineering | Snapshot combines proposal, approval, orchestration, and evidence without durable concurrency. | yes |
| Product | Request is the durable customer object; Plan is a revision, not the commercial/support record. | yes |
| Customer | Current approval omits the selected business, actual price, recipient, terms, and cancellation. | yes |
| Security/authority | Matching principal strings and public events are not authenticated evidence. | yes |
| Architecture | Approval precedes the quote it must authorize; async recovery violates kernel semantics. | yes |
| Design | Rendering the graph as the product creates approval and completion theatre. | yes |
| Future maintainer | Tests will freeze pre-quote approval and simulation proof unless replaced now. | yes |

## Claim / Non-Claim Map

| Claim | Evidence required | Current evidence | Non-claim to preserve |
|---|---|---|---|
| AE can prepare a business action for review | Exact prepared quote persisted and rendered. | missing | AE has not yet shown an exact customer-ready business choice. |
| AE can execute an approved action without substitution | Approval binds exact quote/provider and hosted replay proves one release. | missing | Current tests prove composition only. |
| AE can coordinate multi-step work | Durable Request with typed dependencies and partial/recovery states. | prototype only | AE is not yet a general workflow engine. |
| AE completed the customer’s task | Named outcome verification or clearly qualified provider/artifact evidence. | missing | Kernel completion is execution evidence, not universal fulfillment proof. |
| AE compares options fairly | Multiple real eligible providers, declared basis, commercial influence disclosure. | missing | One connected option is not a comparison or “best.” |

## NOT In Scope For The Next Mechanism

- Customer UI implementation: the decision object is not yet trustworthy enough to render.
- Public brand claims about buying, booking, or completing: no hosted real-business proof exists.
- Generic query/quote/book/purchase vocabulary: prove the prepared-action invariant before standardizing breadth.
- Marketplace fees, settlement, escrow, refunds, disputes, or ranking monetization: these require explicit later decisions and evidence.
- Recursive or arbitrary workflow planning: Plan revisions remain bounded graphs of registered capability operations.
- Business onboarding and third-party account provisioning: still user-owned external work.

## Corrected Execution Sequence

1. Define the `CustomerRequest`, `PlanRevision`, registered capability definition, `PreparedAction`, `ApprovalGrant`, `ActionAttempt`, activity event, and projection boundaries.
2. Implement a durable RequestStore with revision/CAS and idempotent commands before hosted orchestration.
3. Implement **prepare only**: validate a proposed action against contract-owned semantics, route once, persist exact quote evidence, and return decision-ready customer material. Do not authorize or execute.
4. Prove concurrent preparation convergence and digest sensitivity to provider, fallback, price, fee, data, purpose, terms, input, and revision.
5. Add independently authenticated approval/mandate verification bound to the exact PreparedAction.
6. Add exact-quote dispatch with durable attempt identity, action/plan-wide budgets, crash recovery, and strict pending-vs-unknown behavior.
7. Add failure, expiry, cancellation, partial completion, replan, and issue-reporting transitions.
8. Prove one real hosted shipping-label journey; retain simulations only as contract fixtures.
9. Build the customer Request/options/review/activity/recovery UI and equivalent agent checkpoint/status/evidence objects.
10. Only then broaden capability contracts and public claims based on live coverage.

## The Uber / Airbnb Build Test

At every product decision, ask: **Would Uber or Airbnb expose this as machinery, or make it part of the customer’s durable commercial journey?**

Neither company asks a customer to approve an abstract dispatch or booking ceiling and chooses the counterparty and terms afterward. The durable pattern is:

| Product pattern | Uber / Airbnb shape | AE equivalent |
|---|---|---|
| Stable customer objective | Destination/trip need; stay/search need | `CustomerRequest` |
| Decision-ready supply | Actual ride class/upfront fare; actual property/price/terms | `PreparedAction` options from registered bindings |
| Consequential confirmation | Request this ride; reserve/book these exact terms | Approval bound to one exact PreparedAction |
| Fulfillment lifecycle | Driver assigned/arriving/trip; reservation pending/confirmed/stay | `ActionAttempt` plus evidence-qualified Request projection |
| Changes require a new decision | Revised fare/trip; changed dates/price/terms | New PreparedAction revision and readable reapproval diff |
| Support record | Receipt, cancellation fee, trip issue; reservation, cancellation, resolution | Append-only activity, cancellation, issue, and evidence record |

The lesson is not to copy travel UI. It is to preserve the commercial ordering: **need → real options and terms → exact confirmation → fulfillment state → receipt and recovery**. Routing remains hidden dispatch infrastructure.

## Product Decision Tree

```text
Customer or external AI states a need
  |
  +-- Are decisive constraints missing?
  |      +-- yes -> ask only the question that changes eligibility,
  |      |          price, disclosure, commitment, or timing
  |      +-- no  -> continue
  |
  +-- Is there a registered capability contract for the need?
  |      +-- no  -> unsupported honestly; preserve Request context
  |      +-- yes -> validate typed input and consequence semantics
  |
  +-- Can AE prepare a route without releasing a material effect?
  |      +-- no  -> do not route; require an admitted preparation contract
  |      +-- yes -> route once and persist exact PreparedAction evidence
  |
  +-- How many currently eligible options exist?
  |      +-- zero -> no connected option; say what is missing
  |      +-- one  -> show one connected option; never call it a comparison/best
  |      +-- many -> show a small set, declared comparison basis, and tradeoffs
  |
  +-- Does preparation cross any approval threshold?
  |      thresholds = commitment OR spend/reservation OR data recipient/purpose
  |                   OR irreversibility/cancellation cost OR policy mandate
  |      +-- yes -> show exact business, total/bound, data, purpose, terms,
  |      |          timing, expiry, rationale, alternatives, and Approve/Change/Decline
  |      +-- no  -> standing mandate may cover it, with visible policy provenance
  |
  +-- Did any material term change or expire?
  |      +-- yes -> invalidate grant; show readable diff; return to review
  |      +-- no  -> execute the exact quote; never reroute after approval
  |
  +-- What did the kernel/provider evidence establish?
         +-- dispatch pending -> replay the exact idempotent execute command
         +-- provider pending -> show who is waiting and expected next check
         +-- outcome unknown  -> freeze redispatch; reconcile and say AE is checking
         +-- definitely failed-> state what did not happen and safe alternatives
         +-- committed        -> qualify the evidence; return artifact/status
         +-- cancel requested -> pending / confirmed / rejected / unknown
         +-- issue reported   -> preserve claim, evidence, owner, deadline, resolution
```

This decision tree is the product vision in executable order. The UI, agent API, schemas, and tests must all project the same branches; none may skip directly from generic intent to provider execution.

## Chairman Synthesis

**Decision: redesign and split.**

The architecture insight is sound: a higher-level coordinator should compose atomic kernel runs. The current mechanism places approval on the wrong side of routing and gives one snapshot too many kinds of authority. Continuing would make the UI persuasive precisely where the evidence is weakest.

The smallest next mechanism is a durable, exact `PreparedAction`: route first, persist once, show the real commercial decision, and stop before authorization. If that object survives concurrency, tampering, expiry, and customer comprehension tests, it becomes the stable bridge to approval and execution.

## Play-The-Tape Review

### Question Compiler

- **Raw ask:** Validate the Plan mechanism before further build.
- **Artifact under review:** Current CustomerPlan source, tests, and intended customer product.
- **Short-term gain:** Multi-action orchestration above the kernel.
- **Future pain risk:** Pre-quote approval and a forgeable snapshot become permanent product doctrine.
- **Primary tape mode:** Full Council.
- **Secondary tape modes:** Architecture, Strategy, Design, Attack, Debt.
- **Compiled question:** If this succeeds, what false promise, authority bypass, coupling, and support burden does AE own?
- **Non-question:** Whether to preserve the neutral atomic kernel.

### Crystal Ball Setup

- **Depth:** Deep.
- **Success criteria:** The success-criteria audit in this document.
- **Source material:** Executable source, focused tests, Wayfinder map, and cited primary comparable research.
- **Council roles:** Engineering, Product, Customer, Security, Architecture, Design, Future Maintainer.
- **Uncertainty axes:** Adoption, provider diversity, concurrency, async work, partial integration, monetization, support incidents, and claim drift.

### If This Succeeds, We Own

- **Product/repo shape:** A durable Request aggregate, proposed Plan revisions, exact PreparedActions, verified grants, attempts, evidence, and projections.
- **New product claims:** AE can prepare and execute an exact approved business action only after hosted proof exists.
- **New API/protocol surface:** Stable checkpoint, status, and evidence projections; kernel protocol stays underneath.
- **New docs source of truth:** This Wayfinder decision plus the capability and Request contracts implemented in source.
- **New long-term maintenance burden:** Concurrency, expiry, cancellation, partial completion, recovery, evidence qualification, and support reconstruction.

### Monte Carlo Futures

| Future | Assumptions | Likelihood | Success-State Residue | Tail Risk |
|---|---|---:|---|---|
| Base success | Normal adoption and several providers | high | Approval precedes the actual choice | Customers authorize an unseen counterparty. |
| Concurrent success | Hosted workers prepare in parallel | high | Divergent Plan snapshots | Different quotes compete for one approval. |
| Async success | Providers return pending and unknown states | high | Recovery paths collapse | Duplicate dispatch or permanent stuck work. |
| Marketplace success | Ranking acquires commercial influence | medium | “Best” appears neutral | Trust collapses when incentives surface. |
| Support success | Customers expect AE to own recovery | high | Snapshot lacks reconstructable history | AE cannot explain or safely repair partial work. |

### Council Passes

| Role | Strongest Residue Callout | What It Would Cut Or Narrow | Hard Stop? |
|---|---|---|---:|
| Engineering | No durable concurrency or trusted evidence boundary | Current reducer as production aggregate | yes |
| Product | Request, not Plan, is the durable customer object | Plan as commercial/support record | yes |
| Customer | Approval lacks business, price, recipient, and terms | UI on current checkpoint | yes |
| Security | Client-authored events can assert authority and completion | Public event ingestion | yes |
| Architecture | Pending and unknown require different kernel recovery | Unified reconciliation path | yes |
| Design | Graph-shaped review creates approval theatre | Protocol-first Plan UI | yes |
| Future Maintainer | Simulation tests will become false proof | Fixture-derived claims | yes |

### Mode Artifact

| Tape mode | Artifact | Future pain exposed | Required adjustment |
|---|---|---|---|
| Architecture | Domain split and test diagram | Snapshot couples intent, authority, execution, evidence | Split Request, PlanRevision, PreparedAction, Grant, Attempt, Projection. |
| Strategy | Claim/non-claim map | Simulation and kernel evidence become customer completion claims | Gate claims on hosted real-business proof. |
| Design | Lifecycle and customer projections | Approval/completion theatre | Show exact decision material and evidence-qualified states. |
| Attack | Approval contract and failure modes | Model/client can forge authority/effects | Authenticated evidence ports and exact digest binding. |
| Debt | Corrected execution sequence | UI/persistence freeze the wrong aggregate | Redesign before those surfaces exist. |

### Convergent Residue

| Residue | Seen in futures | Seen by roles | Severity | Reversibility | Evidence | Decision |
|---|---:|---:|---|---|---|---|
| Approval before provider/quote | 8/9 | 7/7 | critical | expensive after UI/API | Source ordering | redesign |
| Forgeable snapshot events | 5/9 | 3/7 | critical | expensive after persistence | Public reducer API | split |
| No durable concurrency | 5/9 | 3/7 | high | expensive | Missing store/revision | redesign |
| Waiting conflated with unknown | 4/9 | 4/7 | critical | moderate | Kernel recovery semantics | split |
| Simulation treated as proof | 4/9 | 4/7 | high | moderate | Test fixtures only | narrow claims |

### Maintainer Traps

- **Trap:** Treat passing composition tests as product proof.
- **Why this exists after success:** The fixtures look end-to-end but use in-memory simulation and example artifacts.
- **Future cleanup trigger:** Replace product acceptance evidence only after the hosted real-provider tracer passes.

### Authority And Claim Risks

- **Claim that may exceed enforcement:** “AE completed the task” when the kernel only records provider-reported commitment or an artifact.
- **Boundary future readers may misunderstand:** Plan approval is not execution authority unless it binds and is verified against the exact prepared quote.
- **Non-claim to preserve:** AE is not yet a universal workflow engine or a proven broad business-action marketplace.

### Residue-Reducing Adjustments

| Adjustment | Residue reduced | Mechanism | Owner or trigger | Status |
|---|---|---|---|---|
| Route and persist before approval | Uninformed consent | PreparedAction digest | Next source slice | accepted |
| Split aggregate/evidence roles | Forgeable authority | Typed authenticated ports | Before persistence | accepted |
| Add RequestStore CAS and attempts | Divergent orchestration | Durable revision and idempotency | Before hosted workers | accepted |
| Separate dispatch pending from unknown | Duplicate effect risk | Exact replay versus reconcile commands | Before async support | accepted |
| Keep simulation as fixtures only | False proof | Hosted tracer gate | Before public claims | accepted |

### Chairman Synthesis

**Decision: redesign and split.**

The Plan concept remains useful as an inspectable proposal. The current snapshot cannot become the durable customer or authority object. Build the exact durable PreparedAction next and stop before authorization until its concurrency, digest, and comprehension gates pass.

**Smallest next mechanism:** persist one exact kernel route quote as a CAS-protected PreparedAction and return decision-ready review material; do not authorize or execute in that slice.
