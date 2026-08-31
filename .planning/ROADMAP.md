# Roadmap: Agent-First Operation Market

**Created:** 2026-08-31  
**Status:** candidate implementation roadmap; planning is authorized, source
implementation is not implied by this document  
**Mode:** vertical platform maturity  
**Product authority:** [`PRODUCT.md`](../PRODUCT.md)  
**System contract:** [`docs/designs/agent-operating-contract.md`](../docs/designs/agent-operating-contract.md)

## Milestone Definition

The milestone is complete when a fresh external agent can orient, resolve a
real gap, inspect and bind a choice, invoke a paid Operation, consume or recover
the result, and later return for a comparable need—across two harnesses and two
independent suppliers—without founder/database intervention. Suppliers receive
payouts, outbound events recover, and an operator can explain the entire chain
from one correlation reference.

The roadmap follows the agent's causal path. It does not build all identity,
then all payments, then all UI. Each phase must expose an externally usable
vertical slice, hostile denial/no-effect proof, operator projection, and exact-
revision evidence.

## Active execution order: boring baseline first

Before adding net-new ranking, allocation, or commitment behavior, complete the
small platform seams an agent should never have to reason around. This is a
forward-implementation tranche, not another architecture phase: implement one
producer and every immediate consumer, run the smallest dependency cone, then
move to the next seam.

1. **Funding preflight — implemented:** anonymous constraints and an exact,
   fee-inclusive, non-binding quote; visible payer UI breakdown; bounded input,
   rate limit, correlation ref, cache policy, and cold-manifest schemas. Checkout
   creation remains an owner-authorized action.
2. **HTTP contract hygiene — active next:** every public route returns the same
   problem language, `Allow` behavior, content-type/body limits, cache semantics,
   correlation identity, and retry facts. Fix proven inconsistencies; do not
   create a second transport framework.
3. **Account readback:** prove current identity, Account, scope, exact balance,
   bounded activity pagination, and funding continuation across HTTP/MCP/CLI.
4. **Credential housekeeping:** self-serve inspection, one-time secret display,
   bounded rotation overlap, immediate revocation, and fresh owner authority for
   enlargement. Use the selected identity provider rather than custom auth.
5. **Interrupted-work recovery:** authoritative funding, invocation, payout, and
   event status from stable refs, with safe retry or reconcile instructions.
6. **Operational continuation:** managed signed outbound events, attempt history,
   replay, role-safe audit timelines, and owned exception queues.

The easy tranche is items 1–3. Items 4–6 remain platform baseline and are
completed before their dependent consequential flow, but they do not block
read-only market-resolution work that cannot create authority, spend, or an
external effect. This prevents “boring first” from becoming a second big-bang
platform programme.

## Phase 1: System Contract and Buy-vs-Build Boundary

**Goal:** Implementation has one accepted abstraction tower, response language,
state-ownership map, threat model, and dependency policy before new platform
machinery is added.

**Owns:** NHRL-01..06  
**Depends on:** none

**Plans:**

1. `01-01` — freeze canonical artifact schemas, refs, digests, provenance classes,
   lifecycle owners, and cross-plane invariants;

2. `01-02` — freeze the shared envelope, reason taxonomy, next-action schema,
   compatibility/deprecation rules, and cross-surface conformance fixture;

3. `01-03` — make dependency decisions for Clerk, Convex components, Stripe
   Connect, managed secrets, Svix, Sentry/PostHog, and official SDKs, including
   failure/data ownership and fallback;

4. `01-04` — threat-model commitment drift, authority confusion, replay,
   irreversible ambiguity, event duplication, provider compromise, data leakage,
   and infrastructure-provider failure.

**Exit evidence:**

- one state owner per mutable lifecycle and no adapter-owned domain policy;
- an independently reviewed buy-vs-build record for every commodity concern;
- contract fixtures prove every surface can represent the same facts, unknowns,
  costs, states, problems, and next actions;

- no source implementation is accepted while a named invariant or failure owner
  remains ambiguous.

### Phase 01.1: Close ten low-hanging codebase concerns with bounded hardening changes (INSERTED)

**Goal:** [Urgent work - to be planned]
**Requirements**: TBD
**Depends on:** Phase 1
**Plans:** 0 plans

Plans:

- [ ] TBD (run /gsd-plan-phase 01.1 to break down)

## Phase 2: Orient → Viable Resolution

**Goal:** An external agent can understand AE in one cheap call and obtain compact,
caller-viable, evidence-explained Operations without causing any effect.

**Owns:** AGEX-01..10, MARK-01..06  
**Depends on:** Phase 1

**Plans:**

1. `02-01` — implement read-only orientation/doctor and machine-readable
   capability/version/limit discovery;

2. `02-02` — implement bounded market intent, resolution snapshot, fact
   provenance, and closed viability/exclusion reasons;

3. `02-03` — implement compact/detail/compare disclosure, field groups, stable
   pagination, conditional/delta reads, and explicit resource ceilings;

4. `02-04` — implement inspectable deterministic allocation features and
   freshness-bounded background readiness projections;

5. `02-05` — prove HTTP/MCP/CLI/UI/chat semantic parity and prove every discovery
   path creates no reservation, secret read, provider call, charge, or effect.

**Exit evidence:**

- a fresh agent identifies identity, Account, grant, budget, health, versions,
  and limits in one read-only interaction;

- top candidates are `executable_now`, `setup_required`, or `unavailable`, with
  no later failure for a fact already knowable at resolution time;

- default response is compact and full evidence/schema expansion is lazy;
- the same request produces equivalent resolution semantics across all surfaces.

## Phase 3: Inspect → Commitment → Owner-Bound Authority

**Goal:** An owner can activate and control a durable agent, and the agent can
bind an inspected choice so the invoked effect cannot drift.

**Owns:** AUTH-01..09, CMIT-01..06  
**Depends on:** Phase 2

**Plans:**

1. `03-01` — establish owner-bound durable Principal, Account context, Credential
   binding, and separate payer/supplier/operator attribution;

2. `03-02` — use Clerk-supported OAuth/API-key primitives for self-serve direct
   grants, consent, inspection, revocation, rotation, overlap, and recovery;

3. `03-03` — implement exact Operation/capability scopes, per-call and aggregate
   committed-spend controls, rate/concurrency, approvals, and generation checks;

4. `03-04` — implement commitment creation and digest binding over caller,
   authority, Operation revision, inputs, price, terms, data use, effects,
   readiness, and expiry;

5. `03-05` — adversarially prove every drift, stale authority, wrong Account,
   enlargement, and expired commitment fails before any consequence.

**Exit evidence:**

- a new external runtime activates, receives a narrow direct grant, inspects it,
  loses/rotates its Credential, and continues as the same Principal without staff;

- inspect returns every currently knowable prerequisite and creates no effect;
- argument, price, revision, readiness, effect, caller, grant, or expiry drift
  produces zero reservation, secret read, provider effect, or charge;

- no active path treats an agent as an ownerless economic Account or implements
  a general delegation graph.

## Phase 4: Invoke → Result → Durable Continuation

**Goal:** A committed call progresses through explicit execution and payment
truth and always returns a usable result or a safe resumable recovery path.

**Owns:** INVK-01..10, EVNT-01..06  
**Depends on:** Phase 3

**Plans:**

1. `04-01` — bind commitment to atomic admission, invocation/effect identity,
   idempotency, reservation, audit, and Workpool handoff;

2. `04-02` — separate command, execution, provider observation, payment,
   settlement, result, cancellation, and reconciliation state machines;

3. `04-03` — implement literal result, pending/input/approval/connection handoff,
   status, safe cancellation, and fresh-process continuation contracts;

4. `04-04` — implement authenticated callback/bounded poll reconciliation and
   prove ambiguous irreversible effects never retry or fail over blindly;

5. `04-05` — integrate managed outbound delivery behind `EventDelivery`, publish
   event schemas, and expose scoped endpoint/attempt/replay self-service;

6. `04-06` — run disconnect, duplicate, out-of-order, timeout, malformed,
   callback, provider, payment, and event-delivery fault matrices.

**Exit evidence:**

- one committed consequential call produces exactly one effect identity;
- identical replay returns existing truth and conflicting replay fails;
- a literal result is immediately consumable, while every incomplete state is
  resumable by a fresh process from refs and next actions;

- unknown effects remain unknown until evidence converges or escalation owns them;
- event failure is independently recoverable and cannot alter canonical truth.

## Phase 5: Self-Serve Supplier and Economic Completion

**Goal:** Two suppliers can independently publish, operate, earn, remedy, and
receive payouts for canonical Operations without bespoke platform assembly.

**Owns:** SUPP-01..08, ECON-01..08  
**Depends on:** Phase 4

**Plans:**

1. `05-01` — implement guided native/OpenAPI/MCP/x402 draft import, validation,
   contract testing, admission feedback, and safe Credential connection;

2. `05-02` — implement version/publish/suspend/withdraw/replace/deprecate/retire
   lifecycle and freshness-based readiness/non-delivery enforcement;

3. `05-03` — implement fee-inclusive commitment, atomic committed exposure,
   buyer/provider/platform commercial correlation, and exact adjustments;

4. `05-04` — integrate Stripe Connect hosted/embedded onboarding and canonical
   accrued→matured→payable/held→paid/blocked/reversed payout state;

5. `05-05` — implement payer-safe funding handoff, refund/dispute, payout
   ambiguity, and buyer/supplier/operator economic projections;

6. `05-06` — activate and pay two independent suppliers through sandbox and then
   separately authorized live exact-revision proof.

**Exit evidence:**

- source metadata never becomes callable before admission/publication;
- suppliers can fix every blocking validation/readiness issue without staff edits;
- KYC and bank data never transit AE-owned forms or records;
- buyer charge, supplier payable/payout, AE fee, tax, effect, refund/dispute, and
  ambiguity remain separately attributable;

- both suppliers complete activation-to-payout with no founder/database action.

## Phase 6: Outcome Accretion and Live Market Proof

**Goal:** Real use improves inspectable allocation, and one dense market cell
demonstrates return demand rather than a one-off invocation demo.

**Owns:** MARK-07..10  
**Depends on:** Phase 5

**Plans:**

1. `06-01` — implement qualified-use, buyer-reported outcome, repeat, switch,
   bypass-when-observable, and supplier-earnings evidence with provenance;

2. `06-02` — implement versioned allocation policy and offline replay/evaluation
   that explains every ranking change and protects cold-start alternatives;

3. `06-03` — implement privacy-thresholded supplier demand intelligence and
   data-minimization/retention enforcement;

4. `06-04` — run the live market-cell programme across two harnesses, capturing
   gap→resolution→commitment→paid result→qualified use→later repeat/switch;

5. `06-05` — review unit economics, failure/recovery cost, supplier incrementality,
   and whether demand still routes through AE on second use.

**Exit evidence:**

- provider completion, buyer opinion, AE observation, and inference never collapse;
- replay cannot inflate demand or reputation;
- a ranking change is reproducible from named evidence and policy version;
- supplier intelligence cannot identify a buyer/private workload;
- the milestone contains real repeat or justified switch, supplier earnings, and
  continued AE allocation—not catalogue size as a proxy.

## Phase 7: Operated Platform

**Goal:** Buyers, suppliers, and operators can run and recover the accepted market
under declared reliability, compatibility, security, and data-lifecycle proof.

**Owns:** OPER-01..09  
**Depends on:** Phase 6

**Plans:**

1. `07-01` — build joined role-safe timelines and owned exception queues from one
   correlation/state ref, including machine and human actions;

2. `07-02` — close all buyer/supplier/operator self-service gaps and implement
   scoped break-glass with immutable review;

3. `07-03` — establish safe Sentry/PostHog dimensions, SLOs, alerts, playbooks,
   support ownership, and market/economic dashboards;

4. `07-04` — automate exact-revision release manifests, contract compatibility,
   sandbox/live probes, rollback, and deprecation evidence;

5. `07-05` — execute capacity, hot-Account, retry-storm, isolation, retention/
   deletion, backup/restore, rollback, and incident drills;

6. `07-06` — complete independent platform acceptance against Locus/Whop parity
   maps and the agent operating contract's fresh-process driver's-seat test.

**Exit evidence:**

- any permitted actor can understand current state and safe actions from one ref;
- every exception has one owner and expiry/SLA;
- release, rollback, restore, incident, isolation, retention, and scale claims bind
  to observed evidence, not procedures alone;

- API/event compatibility and deprecation are machine-discoverable;
- the end-to-end market operates without hidden founder knowledge.

## Dependency Rationale

- Phase 1 prevents infrastructure and vocabulary from becoming a second product.
- Phase 2 makes the market legible before consequential authority is added.
- Phase 3 seals the decision and owner control before effects or money expand.
- Phase 4 proves one durable continuation before multiplying suppliers.
- Phase 5 makes both sides self-serve and economically complete.
- Phase 6 allows learning only after trustworthy outcome facts exist.
- Phase 7 scales and operates a proven loop rather than a speculative platform.

Work may parallelize only inside a phase when file ownership and state ownership
do not overlap. A changed product boundary, new market unit, new trust source,
or new irreversible-effect semantic stops the affected plan and returns to the
Phase 1 contract.

## Progress

| Phase | Plans | Status | Completed |
|---|---:|---|---|
| 1. System Contract and Buy-vs-Build Boundary | 0/4 | Candidate — review required | — |
| 2. Orient → Viable Resolution | 0/5 | Not started | — |
| 3. Inspect → Commitment → Owner-Bound Authority | 0/5 | Not started | — |
| 4. Invoke → Result → Durable Continuation | 0/6 | Not started | — |
| 5. Self-Serve Supplier and Economic Completion | 0/6 | Not started | — |
| 6. Outcome Accretion and Live Market Proof | 0/5 | Not started | — |
| 7. Operated Platform | 0/6 | Not started | — |

**Total:** 37 plans across 7 phases.  
**Next action:** independent engineering and adversarial review of Phase 1 and the
cross-phase requirement ownership before implementation planning begins.

---
*Candidate roadmap rebaselined: 2026-08-31.*
