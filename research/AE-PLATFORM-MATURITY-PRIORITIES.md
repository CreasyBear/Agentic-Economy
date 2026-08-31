# Agentic Economy platform-maturity priorities from Locus and Whop

**Date:** 2026-08-31  
**Purpose:** Identify the largest improvements required to turn Agentic Economy (AE) from a well-built Operation MVP into a self-serve, operable, economically complete platform.  
**Product authority:** [`PRODUCT.md`](../PRODUCT.md)  
**Benchmark inputs:** [Locus maturity map](LOCUS-AE-MATURITY.md), [Locus parity ledger](../.planning/locus-docs/LOCUS-SCAVENGE-PAPERCUTS.md), [Whop maturity map](WHOP-AE-MATURITY.md), and [Whop papercuts ledger](../.planning/whop-docs/WHOP-SCAVENGE-PAPERCUTS.md).

**Implemented planning response:** [Agent operating contract](../docs/designs/agent-operating-contract.md), [rebaselined requirements](../.planning/REQUIREMENTS.md), and [agent-first roadmap](../.planning/ROADMAP.md).

## Executive judgment

AE is not primarily missing another invocation abstraction. It has a strong transaction kernel and three much larger platform gaps:

1. **The market is not yet proved.** There is no retained live chain from unfamiliar capability gap through comparison, paid useful result, and later repeat or supplier switch.
2. **The buyer and supplier loops are not yet fully self-serve.** Important identity, commitment, funding, publication, credential, payout, and recovery work still depends on partial flows or operator knowledge.
3. **The platform cannot yet operate itself at scale.** Event delivery, exception queues, joined fleet health, support actions, release evidence, SLOs, restore drills, and outcome-driven allocation are incomplete or unproved.

Locus and Whop expose complementary halves of the target:

- **Locus sets the agent-native execution standard:** caller-viable discovery, exact preflight, scoped credentials, one balance/one call, durable recovery, committed-spend controls, and supplier settlement.
- **Whop sets the multi-sided operating standard:** economic principals, lifecycle-rich commerce, supplier activation, payouts and risk states, signed continuation, developer distribution, reporting, and support history.
- **AE must add the market-learning layer neither benchmark proves for AE:** gap provenance, credible alternatives, allocation rationale, immediate usefulness, repeat demand, switching, bypass, and incremental supplier demand.

The target is not “more features.” A real AE platform lets buyers, suppliers, and operators complete their work without founder intervention while every authority, effect, payment, outcome, and recovery remains attributable and inspectable.

The system-level response is one linked abstraction tower—Operation, market
intent, resolution, commitment, authority grant, invocation, result, outcome
evidence, and role-safe projection—rather than eight independent feature tracks.
This preserves the priorities below while making each one a stage or control
plane of the same caller journey. The current roadmap also adopts a strict
buy-before-build policy for commodity identity, queue/workflow, rate-limit,
protocol, supplier KYC/payout, outbound event, telemetry, and secret machinery.

## The classification rule

“Non-core” must not mean “optional.” Use four classes:

| Class | AE obligation |
|---|---|
| `MARKET_CORE` | AE builds and owns the behavior because it is the reason the market exists. |
| `PLATFORM_BASELINE` | AE guarantees the outcome even when infrastructure is bought or partnered. |
| `PARTNER_CAPABILITY` | AE owns the bounded contract, identity continuity, evidence, and recovery; a partner owns the underlying rail. |
| `ADJACENT_PRODUCT` | AE neither owns nor promises the generalized product, though an embedded standard may still apply to an Operation. |

Wallet custody, PaaS, general merchant billing, CRM, ads, community, task boards, and project orchestration remain adjacent. Identity recovery, exact authorization, funding, settlement, supplier payout, event replay, audit, support, and operational recovery are platform baseline.

## Current platform heatmap

| Platform surface | Current maturity | Combined benchmark signal | Judgment |
|---|---|---|---|
| **Canonical market unit and supply authority** | Strong in source | Locus `001–003`, `014`, `020`; Whop `012`, `017–018`, `063`, `088`, `101–102` | Preserve. Operation identity, publication, readiness, and metadata-versus-callable truth are already platform-shaped. |
| **Invocation, idempotency, money hold, and recovery kernel** | Strong in source; incompletely proved live | Locus `011`, `017`, `023–025`, `040–043`, `047`; Whop `009–010`, `016`, `020`, `030–031`, `089`, `103` | Preserve and prove. This is AE's strongest foundation. |
| **Discovery, comparison, and allocation** | MVP-level | Locus `004–005`, `022`, `039`, `044`, `049`; Whop `014`, `055`, `075–080`, `083`, `098` | Largest product-depth gap. Search and comparison do not yet behave like a learning market. |
| **Inspect-to-invoke commitment** | Partial | Locus `006`, `014`, `038`; Whop `014`, `020`, `085`, `103` | Platform blocker. The caller cannot prove that the exact inspected decision is the invocation released. |
| **Principal, account, credential, and governance control plane** | Partial | Locus `008–009`, `015–016`, `026`, `030–031`, `035`; Whop `001`, `004–008`, `101` | Platform blocker. Strong pieces exist, but headless activation/recovery, exact Operation scopes, principal-wide limits, rotation, renewal, and fresh human control are incomplete. |
| **Supplier activation and lifecycle** | MVP-level | Locus `002`, `020`, `029`, `045`; Whop `017–018`, `039–040`, `060–063`, `075`, `077` | Too operator-heavy. Correctness is strong, but activation, testing, publication, remedy, and payout are not yet a low-friction self-serve loop. |
| **Economic operations** | Partial | Locus `023–029`, `034`, `036`, `043`, `047–048`; Whop `016`, `020`, `027–041`, `055`, `090` | Strong ledger, incomplete platform operation. Funding preflight, principal-wide exposure, maturity/payable states, payout proof, exception handling, and unit economics remain open. |
| **Asynchronous continuation and support operations** | Partial | Locus `012`, `017`, `019`, `032–033`, `040–041`; Whop `010–011`, `054`, `059`, `100`, `103–104` | Platform blocker. Durable invocation state exists, but signed outbound events, attempts, retention, replay, and a joined intervention surface do not. |
| **Developer platform and contract lifecycle** | Good core; partial lifecycle | Locus `003`, `016`, `018`, `021`, `037`, `046`; Whop `012–015`, `063–068`, `101–102`, `105` | API/MCP/CLI foundations are good. Versioning, compatibility promises, sandbox truth, generated clients, deprecation, and live contract probes need a single operating policy. |
| **Reliability, security, data lifecycle, and scale** | Weakly evidenced as an operated platform | Locus `018`, `032–033`, `035`; Whop `013`, `015`, `031`, `086`, `096`, `100`, `103`, `105` | The maps expose controls, not a complete SRE program. SLOs, capacity envelopes, isolation, restore drills, retention/deletion, incident response, and release rollback need owned proof. |
| **Market behavior and economics** | Unproved | Locus `022`, `036`, `044`; Whop `013`, `059`, `061`, `076`, `079–080`, `090` | Existential gate. Safe machinery is not evidence that a market or viable business exists. |

## The eight biggest improvement areas

### 1. Prove one dense live market cell

**Class:** `MARKET_CORE`  
**Why it is first:** A technically mature platform without repeat allocation is an invocation service, not a market.

AE needs one narrow capability cell with:

- a recurring unfamiliar gap that installed tools do not reliably solve;
- at least two independent, currently routeable and meaningfully comparable suppliers;
- an immediately usable paid result;
- a second comparable need that returns through AE, including at least one supplier switch or justified repeat selection;
- measurable supplier earnings and workable net economics; and
- use from more than one external harness.

**Exit test:** retain an exact-revision evidence chain for `gap → viable candidates → inspected choice → authorized paid call → literal usable result → caller continuation → later repeat/switch`, with no replay counted as repeat demand and no provider completion substituted for usefulness.

### 2. Turn search into caller-specific allocation

**Class:** `MARKET_CORE`  
**Why it matters:** This is the actual reason to use AE instead of a connector, browser search, direct API, or the model's own answer.

The platform should combine canonical market truth with a caller-specific viability projection:

- `executable_now`, `setup_required`, or `unavailable`;
- exact bounded reason and next action;
- balance, authority, Operation/capability scope, required connection, location, price, effects, and readiness;
- considered suppliers, provenance, budget ceiling, selection reason, and selected Operation revision; and
- verified outcome, recency, sample size, latency, failure, repeat, and switching evidence.

Ranking must graduate from lexical relevance to expected fit without hiding evidence or claiming false comparability.

**Exit test:** for one live category, top-ranked viable results do not fail later for facts already knowable at search; only verified-use evidence affects reputation; every selection joins back to the original gap and eventual outcome.

### 3. Seal decision continuity and least-privilege execution

**Class:** `PLATFORM_BASELINE`  
**Why it matters:** A real platform must prove that the thing approved is the thing executed.

Inspect should produce a caller-bound, expiring commitment over:

- caller/account and authority generation;
- exact Operation revision and arguments;
- exact total price or hard maximum;
- material terms, effects, data use, provider authority, and readiness; and
- expiry and idempotency identity.

Invoke should require that commitment and fail before dispatch on any drift. Execution grants should support exact Operation or bounded capability scopes rather than only `all_admitted`.

**Exit test:** adversarial changes to arguments, price, Operation revision, readiness, effects, provider authority, caller grant, or expiry produce no provider effect, reservation, or charge.

### 4. Build a self-serve buyer and agent control plane

**Class:** `PLATFORM_BASELINE`  
**Why it matters:** Platform adoption cannot depend on a founder issuing keys, repairing identity, or explaining authority state.

Required behavior:

- owner-bound headless activation, consent, self-inspection, recovery, and secret replacement;
- durable principal identity separated from credentials and sessions;
- explicit buyer/account, agent, credential, grant, payer, and operator roles;
- exact Operation/capability scopes, per-call and aggregate committed-spend controls;
- bounded credential overlap/cutover, immediate revocation, and rotating OAuth renewal;
- short/proof-bound execution identity where risk warrants it;
- fresh human authorization for authority enlargement, funding controls, payout changes, and root credential rotation; and
- a payer-safe funding handoff with authoritative constraints, fee-inclusive quote, status, and recovery.

The current product authority says the consuming agent acts for a person or organization. The older platform-maturity proposal for an unowned autonomous-agent economic account should therefore not be treated as current product direction. Durable machine identity is required; legal/economic ownerlessness is not.

**Exit test:** a new external runtime can connect, receive narrow authority, fund, invoke, lose its secret, recover the same owner-bound identity, rotate credentials, and continue without founder or database intervention.

### 5. Make supplier participation self-serve and economically complete

**Class:** `PLATFORM_BASELINE`  
**Why it matters:** A market cannot scale if every Operation requires bespoke operator assembly.

The supplier platform needs:

- guided contract import or authoring with machine validation;
- effect, data-use, price, remedy, capacity, and evidence declaration;
- safe provider credential connection and test execution;
- review/admission feedback with exact blocking requirements;
- version, publish, suspend, withdraw, replace, and deprecate lifecycle;
- live readiness and non-delivery enforcement;
- buyer-safe public facts separated from private supplier economics;
- accrued → matured → payable/held → paid/blocked payout states; and
- durable payout onboarding, status, ambiguity recovery, reversal, and support.

Human or composite suppliers fit when they publish one exact bounded contribution with price, delivery window, acceptance evidence, remedy, and status. AE need not own their internal staffing workflow.

**Exit test:** a credible supplier can onboard, publish a verified Operation, serve a paid call, handle a failed delivery, see exact earnings, and receive the expected payout without a founder editing production state.

### 6. Complete the economic operating system

**Class:** `PLATFORM_BASELINE` with `PARTNER_CAPABILITY` rails  
**Why it matters:** A ledger is necessary but insufficient. A platform must operate funding, exposure, exceptions, settlement, and payouts end to end.

Close these gaps:

- one principal-wide committed-spend ceiling across credentials and payment routes;
- preserve the implemented fee-inclusive funding preflight and bind it to payer-safe checkout creation/status;
- explicit buyer charge, provider cost, AE fee, held exposure, loss, refund, dispute, and reconciliation facts;
- supplier maturity, reserves/holdbacks, payout readiness, and payout recovery;
- operator queues for unknown payment/effect state, refunds, disputes, shortfalls, and payout failures;
- route-level unit economics including payment, custody, provider, model, support, fraud, dispute, tax, FX, and payout cost; and
- partner abstraction so rail replacement does not change the Operation, receipt, or recovery contract.

**Exit test:** one live paid Operation reconciles quote, authorization, hold, provider effect, settlement, literal result, refund/dispute paths, supplier maturity, real payout, and platform margin under one auditable identity.

### 7. Add a real operational control plane

**Class:** `PLATFORM_BASELINE`  
**Why it matters:** Correct backend state is not enough when customers and money are stuck.

AE needs one joined fleet view over the golden journey:

- failed searches and empty market cells;
- stale or failed supplier readiness;
- pending/stuck invocations and uncertain effects;
- money holds, settlement discrepancies, refund/dispute state, and payout failures;
- event delivery attempts and consumer lag;
- exact correlation, actor/account, release, Operation revision, and evidence freshness; and
- safe, least-privilege intervention with reason, before/after state, audit, and review.

Signed outbound events need stable IDs and sequence, at-least-once semantics, endpoint verification, attempt history, bounded response capture, retention, secret overlap, retry schedule, and manual replay. Human-required actions should be durable continuations, not lost instructions.

**Exit test:** support can diagnose and resolve every declared stuck state using product surfaces and runbooks, without raw database mutation, blind retry, or loss of attribution.

### 8. Establish the reliability, trust, and developer-platform contract

**Class:** `PLATFORM_BASELINE`  
**Why it matters:** Stable integrations and recoverable operations are what let third parties build on AE rather than merely try it.

Required platform commitments:

- versioned API/action inventory, ownership, compatibility, and deprecation policy;
- schema, docs, CLI/MCP, generated examples, and machine-readable exact-Operation parity;
- sandbox contracts that state precisely what cannot be proved there;
- live contract probes for contradictory or drifting upstream truth;
- universal fail-closed audit coverage for consequential mutations;
- data classification, minimization, payload/evidence retention, redaction, export, and deletion;
- critical-journey SLIs/SLOs, actionable alerts, incident roles, runbooks, and postmortems;
- tested backup/restore and declared RPO/RTO;
- load, retry-storm, dependency-failure, hot-account, rate-limit, and noisy-neighbor tests; and
- exact-revision canary, rollback, migration rehearsal, and release evidence.

**Exit test:** an external integrator can build against a declared supported contract, operators can detect and recover a failed release or dependency, and AE can restore and reconcile consequential state inside declared objectives.

## Recommended dependency order

This is not a feature backlog. It is a maturity sequence with two coupled tracks.

### Track A — Prove the market before multiplying machinery

1. Choose one narrow category and two credible suppliers.
2. Finish caller-viable discovery and inspect-to-invoke commitment for that category.
3. Run and retain the full paid production canary and failure matrix.
4. Record useful continuation, repeat/switch, supplier earnings, and net economics.

### Track B — Remove founder intervention from the proved loop

1. Productize buyer activation, authority, funding, rotation, and recovery.
2. Productize supplier onboarding, publication, readiness, earnings, and payout.
3. Productize event delivery, exception queues, support interventions, and audit.
4. Add SLOs, restores, release controls, load/isolation proof, and contract lifecycle.

Track B should harden the exact live loop being proved in Track A. It should not defer market proof until after a generalized multi-year platform build.

## Implications for the current roadmap

The current [maturity roadmap](../.planning/ROADMAP.md) contains valuable vertical-proof discipline, especially its direct consequence, paid recovery, canonical supply, and operated-release phases. The combined Locus/Whop map suggests five changes before treating it as a platform roadmap:

1. **Add market behavior as an explicit acceptance spine.** Every relevant phase should preserve gap, candidates, allocation, useful continuation, repeat/switch, and supplier-demand evidence—not only authority and effect proof.
2. **Pull inspect-to-invoke continuity and caller viability forward.** A live call without decision continuity or viable discovery proves execution, not the complete customer contract.
3. **Replace autonomous economic owner assumptions with owner-bound machine identity unless `PRODUCT.md` changes.** Agent principal, credential, and delegation maturity do not require an unowned agent account.
4. **Add two-sided self-service gates.** Supplier activation/payout and buyer activation/funding/recovery should each have a “no founder magic” acceptance test.
5. **Make operations a product surface.** Event attempts, exception queues, support actions, SLOs, restore, release evidence, and exact-revision diagnostics should not appear only at the final phase.

## Platform definition of done

AE is no longer merely an MVP when all of the following are true:

1. A new external agent can discover value before connecting, then connect, fund, inspect, invoke, and recover without founder help.
2. The exact inspected commitment is the only thing execution can release.
3. Search returns caller-specific viable choices and records why one Operation was selected.
4. A new supplier can publish, test, operate, and get paid without production-state intervention.
5. Buyers and suppliers can understand every payment, hold, refund, dispute, earning, and payout state.
6. Support can resolve stuck work through safe audited product actions.
7. External consumers receive signed, retained, replayable continuation events.
8. APIs and machine surfaces have explicit compatibility, sandbox, version, and deprecation contracts.
9. Critical journeys have SLOs, alerts, restore drills, rollback, load/isolation proof, and exact-release evidence.
10. One live market cell demonstrates useful results, repeat allocation or switching, workable net economics, incremental supplier demand, and recurrence across more than one harness.

The first nine make AE an operable platform. The tenth proves it is an operable **market platform**, rather than excellent infrastructure waiting for a market.

## What not to build

Platform maturity does not require AE to own:

- wallet custody, general transfers, cards, on-ramp, or FX inventory;
- general PaaS, hosting, databases, DNS, or domains;
- merchant checkout, subscription billing, invoicing SaaS, or treasury;
- CRM, ads, affiliates, community, courses, or general notifications;
- tender boards, task management, human procurement, or project workflow; or
- general agent planning, memory, sessions, or orchestration.

Use partners for sensitive rails and let suppliers encapsulate complex delivery. AE still owns the bounded market contract, authority, evidence, economic truth, and recovery wherever those capabilities touch an Operation.
