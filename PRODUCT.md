# Product authority

**Status:** active product charter

**Last rebuilt:** 2026-09-02

## Purpose and category

Agentic Economy is the cross-harness market and commercial boundary for
just-in-time service procurement by software agents.

An agent begins work inside a harness owned by a person or company. When it
encounters a capability gap, it can use Agentic Economy to find, compare and buy
one bounded outside contribution. The exact Provider may become known only after
the work has begun. The buyer still receives one attributable purchase with a
defined Seller, authority, delivery condition and remedy.

The market is global. Australia is the first worked institutional environment.
The product must make agent-selected services intelligible to Australian
business, tax, audit, privacy and recordkeeping systems without pretending to
replace them.

The full argument is set out in
[Commercial closure for just-in-time service procurement](./AGENTIC_ECONOMY_AUSTRALIA_WHITEPAPER.md).

## Customer and job

The customer is a Business Principal: the person or organisation that owns the
objective, grants authority and bears the economic result. An Agent Principal
acts for that customer through an Account and with attributable authority
evidence. A Mandate is the formal, reusable form of that authority when Agentic
Economy controls a purchase; it is not required to reconstruct an acquisition
that has already occurred outside Agentic Economy.

The job is:

> I cannot complete my next step with the capabilities already available to me.
> Find a suitable outside service, let my agent choose within the authority I
> granted, acquire one bounded contribution, and leave a record my business can
> explain and remedy.

The Provider may be a software company, platform, specialist, data owner,
machine operator, human expert or another agent. Its internal work may be
complex. The purchased contribution must remain bounded enough to compare,
authorise, deliver and remedy.

The entry customer is an Australian business that wants its agents to use paid
x402 services without creating customer crypto wallets or losing control of
spend, evidence and accounting. Its immediate job is narrower:

> Let me fund one AUD balance, let an authorised agent buy a bounded x402
> service through Agentic Economy, and give me the result, exact Call history,
> usage, spend and invoice-ready record in ordinary business terms.

That managed purchase entry is defined by the
[Managed x402 Call start line](./START_LINE.md). It begins with one narrow
principal-reseller lane in which Agentic Economy can control the Invocation,
state the buyer-facing sale, settle the upstream x402 obligation and provide a
remedy.

## Active product

The product is an Operation market.

An **Operation** is one versioned, callable contribution offered by one Provider.
It states the input and output contract, price, terms, access, data use, external
effects, readiness and available evidence. One Invocation is one accepted use of
that Operation under one Commitment.

The Operation remains the only unit of supply. Agentic Economy does not turn the
buyer's project, task or workflow into a market object.

The market is open at selection. Commercial responsibility is progressive. An
outside service may first appear in a buyer record while the buyer continues to
contract and settle directly with its existing Seller. For supported purchases
in the principal-reseller mode, Agentic Economy becomes the buyer-facing Seller,
the Provider performs upstream for Agentic Economy and the payment recipient may
differ from either commercial role.

An observed outside acquisition is not canonical market supply merely because
Agentic Economy can reconstruct it. It becomes an Operation only after admission
and publication.

## The decision and purchase chain

For purchases it mediates, Agentic Economy preserves one chain of attributable
facts:

```text
capability gap
    -> market intent
    -> resolution
    -> commitment
    -> invocation
    -> delivery or uncertainty
    -> remedy if required
    -> commercial closure
    -> outcome evidence
    -> agent continues
```

A **Market intent** records the bounded missing contribution and hard constraints
without taking ownership of the larger project.

A **Resolution** records the exact Operation revisions considered, found viable
or excluded, with their provenance and caller-specific reasons.

A **Commitment** binds an expiring decision to the Business Principal, acting
Agent Principal, authority version, Operation revision, Provider, Seller,
normalised inputs, buyer consideration ceiling, terms, data use, effects,
evidence standard and retry rule. Discovery is reversible. Commitment is the
last point at which the full commercial choice can be inspected before money,
information or an external effect is released.

An **Invocation** owns one accepted command and effect identity. It records what
Agentic Economy asked the Provider to do and the observations returned by the
Provider and payment rail.

**Commercial closure** is the terminal, explainable state of the purchase. A
purchase may close as delivered, failed, adjusted or refunded. It remains open
while delivery, settlement or an external effect is uncertain. Closure does not
mean that cash settlement is final or that Agentic Economy has made the buyer's
accounting judgement. It means the service, authority, consideration, delivery
and remedy can be explained as one event.

**Outcome evidence** records what Agentic Economy can legitimately know about
use, repeat purchase, switching and recovery. Provider claims, Agentic Economy
observations and buyer reports remain distinct.

Commercial closure is not a second product or a new unit of supply. It is a
state derived from the linked market, authority, Invocation and economic
records around one Operation purchase.

Observe mode begins after an outside acquisition has occurred. It reconstructs
only the parts of this chain supported by source evidence and does not fabricate
a Market intent, Resolution, Commitment or authority decision that Agentic
Economy did not witness.

## Commercial model

Agentic Economy adopts commercial responsibility in four modes:

| Mode | Agentic Economy does | Commercial relationship |
| --- | --- | --- |
| Observe | Reconstructs the service, actor, parties, payment, evidence and proposed accounting destination | Buyer continues to buy and settle directly |
| Control | Applies buyer policy before an outside call | Buyer still buys directly from the existing Seller |
| Broker | Coordinates selection, Invocation, evidence and recovery | Seller identity and settlement responsibility are stated for the particular arrangement |
| Resell | Admits the Operation and accepts the buyer-facing sale and remedy | Agentic Economy is Seller and holds a separate upstream Provider arrangement |

The modes are a progression of responsibility, not four different products or
a mandatory implementation order. Agentic Economy begins with a narrow Resell
lane for admitted x402 Operations because it can control Invocation and
settlement there. Observe remains the later route for purchases made outside
Agentic Economy. Broader brokerage and resale remain limited to Operations for
which delivery control, margin and upstream recourse justify the responsibility.

Payment is necessary, but settlement alone does not make a purchase. Under
principal resale, Agentic Economy maintains two financial legs:

1. The Business Principal owes buyer consideration to Agentic Economy for the
   buyer-facing sale.
2. Agentic Economy separately owes the Provider under the upstream arrangement.

The legs may use different amounts, currencies, timing and payment rails. They
must remain separately attributable even when they settle in one technical
flow.

AUD prepaid credit is the selected funding model for the first managed x402
lane. Funding an Account creates available value, not permission to spend and
not an Operation purchase. A separately disclosed top-up service fee does not
reduce the credited amount. A Mandate creates bounded authority. A Commitment
binds one all-in AUD quote and reserves that authority and exposure. Delivery,
failure and remedy determine how the purchase closes.

Agentic Economy's pooled USDC is corporate treasury, not customer property or a
customer balance. The upstream x402 amount and buyer-facing AUD Charge remain
two linked but independent financial legs. Agentic Economy bears custody,
network, liquidity, depeg and exchange-rate risk within its stated price.

The commercial model follows a control-responsibility rule. Agentic Economy can
promise a common buyer-facing outcome only where it can admit the Provider,
state the sale, bind the Commitment, control Invocation, inspect enough delivery
evidence, suspend supply, issue an adjustment and pursue upstream recourse.
Operations outside that control boundary must not be represented as closed
principal-reseller purchases. Observed acquisitions can still be reconstructed,
but missing authority, Seller, tax, delivery or remedy evidence must remain
explicitly unresolved.

The topology for the principal-reseller mode is recorded in
[ADR 0001](./docs/adr/0001-principal-reseller-commercial-topology.md).

## Roles and accountability

| Role | Owns | Does not imply |
| --- | --- | --- |
| Business Principal | Objective, delegation, economic result and use of the contribution | Runtime execution or receipt of a payment |
| Agent Principal | Durable technical identity acting within delegated authority | Legal personhood or ownership of funds |
| Provider | Performance of the upstream Operation | Buyer-facing sale or receipt of every payment |
| Seller | Contract with the buyer, stated delivery condition and buyer remedy | Performance by its own systems |
| Payment recipient | Receipt of one settlement movement | Seller or Provider status |
| Agentic Economy | Customer Call and financial records; according to mode, market admission, resolution, Commitment, controlled Invocation, buyer-facing sale, evidence and remedy | Ownership of the buyer's project or final accounting treatment |

These roles may coincide in a particular transaction. The system records them
independently and never derives one from a wallet address, credential, endpoint
or payment movement.

## Product surfaces

- The public catalogue exposes searchable canonical Operations.
- Thin chat translates natural-language needs into search, detail, comparison,
  inspection and eligible execution against the same market.
- HTTP, MCP and CLI expose the same canonical Operations to software agents.
- The authenticated purchase plane owns Commitment, controlled Invocation,
  idempotency, payment, receipts, status, cancellation and reconciliation.
- Customer money surfaces expose AUD funding, available and reserved credit,
  top-up service fees and recovery without presenting a crypto wallet.
- Calls expose familiar Logs, Usage and Spend views joined by Invocation rather
  than by a payment identifier.
- Treasury surfaces expose corporate USDC availability, committed exposure,
  coverage, replenishment and reconciliation only to authorised operators.
- Provider surfaces admit, publish, maintain and withdraw Operations.
- Customer records correlate outside service use, supplier
  documents, settlement evidence, business allocation and proposed accounting
  treatment without claiming to replace the general ledger.
- Buyer records expose authority use, Charges, delivery, recovery, evidence gaps
  and commercial state.
- The external registry discovers possible supply at metadata authority only. An
  imported record is not executable and becomes an Operation only after
  admission and publication.

A connected buyer may retain one bounded failed-search phrase as a private
market-gap signal. This is market demand memory, not project memory, a tender or
a message to Providers.

## Agent operating model

The agent-facing product is one deep managed-Call interface over the market,
authority, execution, economic and evidence planes. Its recommended managed-Call
path is deliberately short:

```text
registry.operations.search -> operation.inspect -> operation.invoke -> result
```

`operation.status` and `operation.reconcile` appear only when the Invocation
does not return a terminal result. Public detail, comparison,
`agentAccess.whoami` and `agentAccess.balance` remain available for browsing,
diagnosis and explicit accounting reads; they are not prerequisite calls. The
Agent Principal must not coordinate Agentic Economy's internal subsystems.

Authentication resolves the Business Principal, Account, Agent Principal,
credential and active Mandate. The caller never supplies an `accountRef` to a
Call. One Business Principal may make a shared AUD Prepaid balance available to
several Agent Principals, while each Agent Principal has hard per-Call and
aggregate limits that survive credential rotation. A credential is access and
audit evidence; it is not the budget owner.

Before a consequential Call, authenticated `operation.inspect` is the one
caller-specific decision packet. It combines the selected Operation's material
detail with its exact revision, normalised input, effects, data use, Provider,
Seller, exact or maximum all-in AUD price, expiry, current authority fit,
Agent Principal budget impact, permitted shared-balance viability, evidence and
material unknowns. A successful inspection returns an expiring Commitment.
Invocation revalidates the same facts at the consequence boundary. Drift fails
before reservation, signing or Provider effect.

Machine responses are action-specific tagged results rather than one universal
envelope. Each response contains only the facts required for its decision. A
non-terminal result returns at most one executable machine continuation and,
where a Business Principal must act, one optional owner handoff. Manifest-owned
descriptions and schemas are not repeated. Status accepts a previously observed
version and returns a bounded unchanged response or a current-state delta rather
than replaying full history. The Agent Principal never needs to interpret x402,
choose a treasury pool, calculate foreign exchange, construct ledger entries or
decide whether an uncertain payment can be retried.

The system becomes accretive through bounded evidence, not by absorbing the
agent's project. Package 4 retains automatically observed price, latency,
delivery, failure, recovery and settlement evidence. Buyer-reported use and
outcome-derived allocation aggregates remain a later capability that requires a
demonstrated selection consumer; they are not part of the managed x402 start
line. Later Resolutions must not turn payment or delivery into a universal
quality score.
The detailed contract is maintained in
[Agent operating contract](./docs/designs/agent-operating-contract.md).

## Operating principles

- **One commercial spine.** Every mode preserves the same roles, service,
  authority, consideration, evidence and accounting relationships. Only facts
  Agentic Economy witnesses receive market lifecycle provenance; observed
  acquisitions retain their external provenance and unresolved gaps.
- **Decision continuity.** Invocation must match an unexpired, caller-bound
  Commitment. Drift fails before reservation, Charge, secret access or Provider
  effect.
- **Owner-bound agency.** The Agent Principal is durable across replaceable
  credentials and harnesses but remains bound to an Account and Business
  Principal.
- **Funding, authority and purchase remain separate.** A balance is not
  authority. Authority evidence is not a purchase. A Mandate is the formal
  reusable authority used when Agentic Economy gates spending. Settlement is not
  commercial closure.
- **Explicit truth.** Known, unknown, stale, Provider-claimed, Agentic
  Economy-observed, buyer-reported and derived facts remain distinguishable.
- **Resumability.** A fresh process can continue, cancel or reconcile from stable
  references without hidden conversation state.
- **Bounded evidence.** The market records the minimum facts needed for
  allocation, purchase and remedy. It does not capture arbitrary prompts,
  plans, files, conversations or chain of thought.
- **Common machinery, owned semantics.** Agentic Economy buys authentication,
  payment rails, queues, rate limiting, Provider onboarding, observability and
  secret storage. It owns the meaning of authority, Commitment, Invocation,
  commercial state and evidence.
- **Least-resource control.** Apply hard constraints first, then expose the
  evidence needed to choose among viable Operations by price, latency and
  recovery risk. Do not spend model tokens, make Provider calls or repeat full
  state reads when deterministic validation, stored evidence or a stable
  reference is sufficient.

## Ownership boundary

The Business Principal, Agent Principal and existing harness retain:

- the larger objective and user relationship;
- planning, reasoning, memory and context management;
- the decision that an outside contribution is needed;
- use of the returned contribution; and
- the downstream success of the larger project.

Agentic Economy owns, across all commercial modes:

- the attributable link between machine service use, commercial parties,
  authority evidence, consideration, business allocation and source documents;
- the provenance and unresolved state of every fact it records; and
- the customer Calls and Operation subledger needed to explain the service use
  and purchase.

As responsibility increases, Agentic Economy may additionally own discovery,
resolution, pre-purchase inspection, bounded authority, Commitment, controlled
Invocation and recovery. Only in the principal-reseller mode does it own the
buyer-facing sale, separate Provider obligation, adjustment and refund.

The Provider owns the upstream performance it promised. Payment rails own their
raw authorisation and settlement evidence. The buyer's accounting system owns
the general ledger, statutory accounts and final classification.

## Australia as the first institutional implementation

Australia gives the product one coherent environment in which identity, GST,
company records, electronic invoicing, cross-border data and stored-value design
must meet in the same purchase.

Agentic Economy must eventually make the following attributable for each
supported Australian purchase:

- the Business Principal, Agent Principal, Provider, Seller and payment
  recipient;
- the authority and exact terms accepted before Invocation;
- buyer consideration and the separate Provider obligation;
- the relevant Australian-dollar and tax facts;
- the delivery, failure, uncertainty and remedy history;
- data destinations and disclosed cross-border handling; and
- retained evidence suitable for export to ordinary business systems.

This is a product requirement, not a claim that the legal structure is already
settled. Electronic distribution platform treatment, GST consequences,
tax-invoice responsibility, privacy obligations and the treatment of prepaid
credit depend on the final contracts and operating facts. Agentic Economy must
not describe itself as compliant merely because its ledger can record the
fields.

## Current implementation boundary

The implemented foundation already supports canonical Operations, resolution,
Commitment, brokered Invocation, prepaid buyer credit, Charges, Provider
earnings, refunds, recovery and uncertain states.

It does not yet establish the complete Australian principal-reseller purchase
described in the whitepaper. In particular, buyer-facing Seller identity,
separate Provider obligation, tax position, business document issuance and
commercial closure are not yet one explicit production record. Source and tests
remain the authority for what works today.

The complete agent operating contract is also a target, not an implementation
claim. The source already has action descriptors, generated machine discovery,
authenticated self/balance reads, Invocation recovery and safe-continuation
metadata. Package 4 must still add authenticated `operation.inspect`,
Commitment-based invoke, Agent Principal-level budget aggregation,
action-specific compact results, version-aware status and permitted Call
projections.

The next milestone is one complete managed x402 purchase: confirmed AUD
funding, an all-in AUD quote, reserve-before-payment, corporate USDC settlement,
usable delivery, explicit recovery, customer-visible Calls and invoice-ready
records. Production money remains disabled until the Australian legal, AML/CTF,
tax and bank-account gates are approved. That proof is specified in
[START_LINE.md](./START_LINE.md).

## Strategic advantage

Connectors remain best for predictable, frequent and preselected capabilities.
The open market matters when needs are specialised, regional, temporary, newly
created, contingent on runtime state or too infrequent to integrate in advance.

Agentic Economy does not win by owning a payment protocol or listing the most
services. Its advantage comes from occupying the decision boundary across the
full sequence:

```text
need -> candidates -> authorised choice -> invocation -> delivery -> use -> remedy
```

Payment providers see transfers. Providers see their own calls. Harnesses see
the larger task. Accounting systems receive entries after the decision. At the
entry point, Agentic Economy connects machine use, business purpose, commercial
parties, payment and accounting evidence. As it moves through control, brokerage
and resale, it can add exact authority, comparable Operations, controlled
Invocation, buyer-facing responsibility and remedy.

That joined record improves the market only when comparable needs recur,
evidence keeps its provenance, buyers permit its use and later purchases return
through the same boundary. Transaction volume alone is not an advantage.

The compounding loop is therefore operational rather than rhetorical:

```text
compact search -> inspected choice -> controlled Call -> bounded outcome evidence
       ^                                                   |
       |---------------------------------------------------|
```

Each completed or recovered Call can reduce uncertainty for the next comparable
choice without requiring Agentic Economy to retain the buyer's wider task,
prompt history or reasoning. This is how the market becomes easier and cheaper
for an agent to use over time while preserving the buyer's control of context.

## Evidence required

The market thesis becomes real when:

- agents encounter valuable gaps their installed capabilities cannot close;
- they describe those gaps well enough to find useful Operations;
- comparison matters among credible Providers;
- delegated authority is sufficient to choose and spend;
- an Invocation returns a contribution the agent can use;
- similar gaps produce repeat purchases or Provider switching;
- Providers receive incremental demand and respond to it;
- the second purchase still passes through Agentic Economy; and
- the behaviour occurs across more than one agent or harness.

The institutional thesis becomes real when:

- a finance team can explain an agent-selected purchase without reconstructing
  it from application logs and wallet transfers;
- buyer consideration, Provider obligation, delivery and remedy remain linked
  but distinct;
- uncertain outcomes stay open until reconciled;
- a failed purchase produces the promised adjustment or refund; and
- the resulting record can enter Australian business systems without asserting
  facts Agentic Economy does not know.

## Non-goals

Agentic Economy is not:

- a general agent, harness or orchestration engine;
- a project, task, planning or memory system;
- a tender board or human procurement workflow;
- a universal agent wallet or ownerless agent bank;
- a general ledger, accounting package or tax engine;
- a legal, tax or accounting adviser;
- a guarantee of the buyer's larger business outcome;
- a directory that treats imported metadata as callable truth; or
- a custom identity provider, payment network, custody system, queue,
  observability backend or secret vault.

## Interpretation rules

- This file defines the active product and accepted commercial direction.
- The whitepaper defines the institutional argument behind that direction.
- `CONTEXT.md` defines canonical domain language.
- Current source and tests define what is implemented.
- `START_LINE.md` defines the next proof, not the category.
- Dated research and execution ledgers provide evidence and history. They do not
  override this charter.
- Git history records previous systems and migrations. It is not current product
  context.
