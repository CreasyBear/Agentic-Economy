# Product authority

**Status:** active product charter

**Last rebuilt:** 2026-09-02

**Direction and terminology revised:** 2026-09-05

## Purpose and category

Agentic Economy gives Australian businesses one account for their agents to
find and use paid tools and services, with AUD credit, spending controls, clear
usage records and help when a purchase goes wrong. x402 services are the first
supported supply.

The current brief is a mature Australian equivalent of the familiar Locus and
Nevermined experience. **Maturity, intuitiveness and enablement come before
uniqueness or differentiation.** The Australian market opportunity is the
accepted business direction, not a question each implementation package must
reopen.

An agent stays in its existing app or framework. When it needs an outside
service, it can find one, check its price and terms, and use it within the
customer's spending policy. Agentic Economy does not take over the larger task.

### Reference products are the default

- **Locus:** the reference for connecting agents, prepaid tool access, spending
  controls, usage and everyday account management.
- **Nevermined:** the reference for service publishing, pricing and access
  management, APIs and SDKs, reporting, events and the surrounding platform.
- **Whop:** a supporting reference for familiar business setup, billing, payout,
  support and account-management interactions.

Study complete behaviour, not screenshots or happy-path copy alone: setup,
normal use, changes, interruptions, failures, recovery and offboarding. Reuse
maintained components, official SDKs and established protocols. Do not handroll
equivalent behaviour or add concepts merely to make AE different.

Depart from a reference only for an applicable Australian requirement, an
existing correctness or safety constraint, or a demonstrated weakness in that
reference. State the practical reason and customer benefit. An internal model
or a desire for novelty is not sufficient justification.

The maturity comparison covers the whole supported platform: accounts and team
access, agents, spending policies, service discovery and publishing, pricing,
funding, usage, billing and documents, Provider earnings and payouts, connections,
events, support, APIs, SDKs and account offboarding. This is a coverage checklist,
not a claim that all features are implemented or a requirement to copy every
reference feature into the next package. Use the existing roadmap to sequence it.

### Australian adaptation

Make the familiar experience work for Australian business use: AUD funding and
pricing, appropriate business records, clear commercial responsibilities and
supported local operating arrangements. The relevant legal, tax, privacy and
financial approvals remain required; familiar UX does not establish compliance.

The service market can be global while the first customer experience is
Australian. The institutional thesis remains in the
[Australian whitepaper](./AGENTIC_ECONOMY_AUSTRALIA_WHITEPAPER.md). Its longer-term
arguments do not make a unique category, ranking model or data advantage a
current release requirement.

### Product language and compatibility

Use the familiar terms in [CONTEXT.md](./CONTEXT.md): customer, agent, account,
spending policy, Tool, Quote and Call. These are the canonical product terms,
not an optional translation of a required customer vocabulary. "Service" remains
ordinary explanatory language and the capitalised portfolio Service record is a
distinct concept.

The checked-in source now uses the accepted Tool/Quote/Call contract and its
spending-policy and recovery vocabulary. Historical evidence, protected
protocol/hash material, opaque reference encodings and document filenames may
still retain earlier names; those are not current AE API aliases. The source
receipts establish source behaviour only. Installed-package compatibility,
hosted deployment and production proof remain separate holds.

Reference entry points:
[Locus](https://paywithlocus.com/developers),
[Nevermined](https://nevermined.ai/docs/api-reference/introduction) and the
[Whop maturity record](./.planning/whop-docs/WHOP-SCAVENGE-PAPERCUTS.md).
Reference behaviour and limitations are recorded in the existing scavenger docs;
a reference's published feature is not proof of AE implementation.

## Customer and job

The customer is the person or organisation that owns the objective, grants
permission and bears the economic result. An agent acts for that customer
through an account with recorded permission. A spending policy holds the
reusable rules when AE controls a purchase; it is not required to reconstruct an acquisition
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
principal-reseller lane in which Agentic Economy can control the Call,
state the buyer-facing sale, settle the upstream x402 obligation and provide a
remedy.

## Active product

The product is a service marketplace.

A **Tool** is one versioned callable supply unit offered by one Provider. It
states the input and output contract, price, terms, access, data use, external
effects, readiness and available evidence. A portfolio **Service** record may
describe a broader offering and is not automatically a callable Tool. One Call
is one accepted use of a Tool version under one Quote.

The Tool remains the only callable unit of supply. Agentic Economy does not
turn the buyer's project, task or workflow into a market object.

The market is open at selection. Commercial responsibility is progressive. An
outside service may first appear in a buyer record while the buyer continues to
contract and settle directly with its existing Seller. For supported purchases
in the principal-reseller mode, Agentic Economy becomes the buyer-facing Seller,
the Provider performs upstream for Agentic Economy and the payment recipient may
differ from either commercial role.

An observed outside acquisition is not canonical market supply merely because
Agentic Economy can reconstruct it. It becomes a callable Tool only after
admission and publication.

## The decision and purchase chain

For purchases it mediates, Agentic Economy preserves one chain of attributable
facts:

```text
need a service
    -> describe the need
    -> compare services
    -> Quote and spending checks
    -> Call
    -> result or pending outcome
    -> recovery or refund if required
    -> resolved purchase
    -> outcome records
    -> agent continues
```

A **service request** records the bounded missing contribution and hard constraints
without taking ownership of the larger project.

A **service comparison** records the exact Tool versions considered, found viable
or excluded, with their provenance and caller-specific reasons.

A **Quote** binds an expiring purchase decision to the customer, acting
agent, authority version, Tool version, Provider, Seller,
normalised inputs, buyer consideration ceiling, terms, data use, effects,
evidence standard and retry rule. Discovery is reversible. The Quote is the
last point at which the full commercial choice can be inspected before money,
information or an external effect is released.

A **Call** owns one accepted command and effect identity. It records what
Agentic Economy asked the Provider to do and the observations returned by the
Provider and payment rail.

An **Action execution** is an administrative or runtime execution of an AE
action. Its controls, attempts and history remain distinct from a purchased
Call; it does not create another purchase record.

**Purchase resolution** is the terminal, explainable state of the purchase. A
purchase may close as delivered, failed, adjusted or refunded. It remains open
while delivery, settlement or an external effect is uncertain. Closure does not
mean that cash settlement is final or that Agentic Economy has made the buyer's
accounting judgement. It means the service, authority, consideration, delivery
and remedy can be explained as one event.

**Outcome records** retain what Agentic Economy can legitimately know about
use, repeat purchase, switching and recovery. Provider claims, Agentic Economy
observations and buyer reports remain distinct.

A **Suggested next action** is the one supported, machine-executable transition
permitted by a non-terminal response, with durable arguments and retry safety.
It must not offer a fresh Call after possible dispatch.

Purchase resolution is not a second product or a new unit of supply. It is a
state derived from the linked market, authority, Call and economic
records around one service purchase.

Observe mode begins after an outside acquisition has occurred. It reconstructs
only the parts of this chain supported by source evidence and does not fabricate
a service request, service comparison, Quote or authority decision that Agentic
Economy did not witness.

## Commercial model

Agentic Economy adopts commercial responsibility in four modes:

| Mode | Agentic Economy does | Commercial relationship |
| --- | --- | --- |
| Observe | Reconstructs the service, actor, parties, payment, evidence and proposed accounting destination | Buyer continues to buy and settle directly |
| Control | Applies buyer policy before an outside call | Buyer still buys directly from the existing Seller |
| Broker | Coordinates selection, Call, evidence and recovery | Seller identity and settlement responsibility are stated for the particular arrangement |
| Resell | Admits the Tool and accepts the buyer-facing sale and remedy | Agentic Economy is Seller and holds a separate upstream Provider arrangement |

The modes are a progression of responsibility, not four different products or
a mandatory implementation order. Agentic Economy begins with a narrow Resell
lane for admitted x402 Tools because it can control execution and
settlement there. Observe remains the later route for purchases made outside
Agentic Economy. Broader brokerage and resale remain limited to services for
which delivery control, margin and upstream recourse justify the responsibility.

Payment is necessary, but settlement alone does not make a purchase. Under
principal resale, Agentic Economy maintains two financial legs:

1. The customer owes buyer consideration to Agentic Economy for the
   buyer-facing sale.
2. Agentic Economy separately owes the Provider under the upstream arrangement.

The legs may use different amounts, currencies, timing and payment rails. They
must remain separately attributable even when they settle in one technical
flow.

AUD prepaid credit is the selected funding model for the first managed x402
lane. Funding an Account creates available value, not permission to spend and
not a service purchase. A separately disclosed top-up service fee does not
reduce the credited amount. A spending policy grants bounded permission. A Quote
binds one all-in AUD price and its terms. Accepting the Call reserves the
required spending capacity and funds before dispatch. Delivery,
failure and remedy determine how the purchase closes.

Agentic Economy's pooled USDC is corporate treasury, not customer property or a
customer balance. The upstream x402 amount and buyer-facing AUD Charge remain
two linked but independent financial legs. Agentic Economy bears custody,
network, liquidity, depeg and exchange-rate risk within its stated price.

The commercial model follows a control-responsibility rule. Agentic Economy can
promise a common buyer-facing outcome only where it can admit the Provider,
state the sale, bind the Quote, control execution, inspect enough delivery
evidence, suspend supply, issue an adjustment and pursue upstream recourse.
Tools outside that control boundary must not be represented as closed
principal-reseller purchases. Observed acquisitions can still be reconstructed,
but missing authority, Seller, tax, delivery or remedy evidence must remain
explicitly unresolved.

The topology for the principal-reseller mode is recorded in
[ADR 0001](./docs/adr/0001-principal-reseller-commercial-topology.md).

## Roles and accountability

| Role | Owns | Does not imply |
| --- | --- | --- |
| Customer | Objective, delegation, economic result and use of the contribution | Runtime execution or receipt of a payment |
| Agent | Durable technical identity acting within delegated authority | Legal personhood or ownership of funds |
| Provider | Performance of the upstream service | Buyer-facing sale or receipt of every payment |
| Seller | Contract with the buyer, stated delivery condition and buyer remedy | Performance by its own systems |
| Payment recipient | Receipt of one settlement movement | Seller or Provider status |
| Agentic Economy | Customer Call and financial records; according to mode, market admission, resolution, Quote, controlled Call, buyer-facing sale, evidence and remedy | Ownership of the buyer's project or final accounting treatment |

These roles may coincide in a particular transaction. The system records them
independently and never derives one from a wallet address, credential, endpoint
or payment movement.

## Product surfaces

- The public catalogue exposes searchable canonical Tools.
- Thin chat translates natural-language needs into search, detail, comparison,
  Quote and eligible execution against the same market.
- HTTP, MCP and CLI expose the same canonical Tools to software agents.
- The authenticated purchase interface owns quotes, controlled Calls,
  idempotency, payment, receipts, status, cancellation and reconciliation.
- Customer money surfaces expose AUD funding, available and reserved credit,
  top-up service fees and recovery without presenting a crypto wallet.
- Calls expose familiar Logs, Usage and Spend views joined by Call identity rather
  than by a payment identifier.
- Treasury surfaces expose corporate USDC availability, committed exposure,
  coverage, replenishment and reconciliation only to authorised operators.
- Provider surfaces admit, publish, maintain and withdraw Tools.
- Customer records correlate outside service use, Provider
  documents, settlement evidence, business allocation and proposed accounting
  treatment without claiming to replace the general ledger.
- Buyer records expose authority use, Charges, delivery, recovery, evidence gaps
  and commercial state.
- The external registry discovers possible supply at metadata authority only. An
  imported record is not executable and becomes a Tool only after admission and
  publication.

A connected buyer may retain one bounded failed-search phrase as a private
market-gap signal. This is market demand memory, not project memory, a tender or
a message to Providers.

## Agent operating model

The agent uses one managed interface for finding and using Tools. AE handles
permission checks, execution, money and records behind that interface. The
approved target path is deliberately short:

```text
registry.tools.search -> tool.quote -> tool.call -> result
```

This is the accepted source action path. Recovery uses `call.status`,
`call.cancel` and `call.reconcile` only when a Call does not return a terminal
result. Public detail, comparison, `agentAccess.whoami` and
`agentAccess.balance` remain available for browsing, diagnosis and explicit
accounting reads; they are not prerequisite calls. The agent must not coordinate
Agentic Economy's internal subsystems. These source contracts are not a hosted
deployment or installed-package acceptance claim.

Authentication resolves the customer, Account, agent,
credential and active spending policy. The caller never supplies an `accountRef` to a
Call. One customer may make a shared AUD Prepaid balance available to
several agents, while each agent has hard per-Call and
aggregate limits that survive credential rotation. A credential is access and
audit evidence; it is not the budget owner.

Before a consequential Call, the current authenticated source action,
`tool.quote`, is the one caller-specific decision packet. Its successful DTO
binds the `toolRef` and `toolVersion`, normalised input, expiring price,
Account reference and available balance, budget ceiling, applicable policy
references and an evidence digest. The current Tool material is checked through
the Tool reference, version and evidence projections; the DTO does not yet
establish explicit Provider or Seller fields or the complete buyer-facing
principal-reseller terms. A successful `tool.quote` request returns an expiring
Quote. Execution revalidates the same Tool, input, authority, budget, balance,
pricing and evidence-related facts before the Call takes effect. Drift fails
before reservation, signing or Provider effect. This is accepted source
behaviour; installed-package compatibility, hosted deployment and production
release are separate gates.

Machine responses are action-specific tagged results rather than one universal
envelope. Each response contains only the facts required for its decision. A
non-terminal result returns at most one executable Suggested next action and,
where a customer must act, one optional owner handoff. Manifest-owned
descriptions and schemas are not repeated. Status accepts a previously observed
version and returns a bounded unchanged response or a current-state delta rather
than replaying full history. The agent never needs to interpret x402,
choose a treasury pool, calculate foreign exchange, construct ledger entries or
decide whether an uncertain payment can be retried.

AE can learn from its own service records without absorbing the agent's project. Package 4 retains automatically observed price, latency,
delivery, failure, recovery and settlement evidence. Buyer-reported use and
outcome-derived allocation aggregates remain a later capability that requires a
demonstrated selection consumer; they are not part of the managed x402 start
line. Later service comparisons must not turn payment or delivery into a universal
quality score.
The detailed contract is maintained in
[Agent operating contract](./docs/designs/agent-operating-contract.md).

## Operating principles

- **Maturity before differentiation.** Default to the familiar reference
  behaviour across the whole supported platform. Unique language, extra setup
  or bespoke infrastructure must not be prerequisites for ordinary use.
- **One connected purchase record.** Every mode preserves the same roles, service,
  authority, consideration, evidence and accounting relationships. Only facts
  Agentic Economy witnesses receive market lifecycle provenance; observed
  acquisitions retain their external provenance and unresolved gaps.
- **Honour the Quote.** A Call must match an unexpired, caller-bound
  Quote. Drift fails before reservation, Charge, secret access or Provider
  effect.
- **Stable agent identity.** The agent is durable across replaceable
  credentials and harnesses but remains bound to an Account and customer.
- **Funding, authority and purchase remain separate.** A balance is not
  authority. Authority evidence is not a purchase. A spending policy is the formal
  reusable authority used when Agentic Economy gates spending. Settlement is not
  purchase resolution.
- **Explicit truth.** Known, unknown, stale, Provider-claimed, Agentic
  Economy-observed, buyer-reported and derived facts remain distinguishable.
- **Resumability.** A fresh process can continue, cancel or reconcile from stable
  references without hidden conversation state.
- **Bounded evidence.** The market records the minimum facts needed for
  allocation, purchase and remedy. It does not capture arbitrary prompts,
  plans, files, conversations or chain of thought.
- **Reuse proven components.** Agentic Economy buys authentication,
  payment rails, queues, rate limiting, Provider onboarding, observability and
  secret storage. It owns the meaning of authority, Quote, Call,
  commercial state and evidence.
- **Keep integration overhead low.** Apply hard constraints first, then expose the
  evidence needed to choose among viable services by price, latency and
  recovery risk. Do not spend model tokens, make Provider calls or repeat full
  state reads when deterministic validation, stored evidence or a stable
  reference is sufficient.

## Ownership boundary

The customer, agent and existing harness retain:

- the larger objective and user relationship;
- planning, reasoning, memory and context management;
- the decision that an outside contribution is needed;
- use of the returned contribution; and
- the downstream success of the larger project.

Agentic Economy owns, across all commercial modes:

- the attributable link between machine service use, commercial parties,
  authority evidence, consideration, business allocation and source documents;
- the provenance and unresolved state of every fact it records; and
- the customer Calls and service subledger needed to explain the service use
  and purchase.

As responsibility increases, Agentic Economy may additionally own discovery,
resolution, pre-purchase inspection, bounded authority, Quote, controlled
Calls and recovery. Only in the principal-reseller mode does it own the
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

- the customer, agent, Provider, Seller and payment
  recipient;
- the authority and exact terms accepted before Call;
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

The implemented foundation already supports canonical Tools, comparison,
quotes, brokered Calls, prepaid buyer credit, Charges, Provider
earnings, refunds, recovery and uncertain states.

It does not yet establish the complete Australian principal-reseller purchase
described in the whitepaper. In particular, buyer-facing Seller identity,
separate Provider obligation, tax position, business document issuance and
purchase resolution are not yet one explicit production record. Source and tests
remain the authority for what works today.

The complete agent operating contract remains a release target, not a claim of
hosted or production completion. The source has action descriptors, generated
machine discovery, authenticated self/balance reads, `tool.quote`,
Quote-based `tool.call`, Call recovery and Suggested next action metadata.
Installed-client compatibility, hosted route proof, and the remaining full
Australian principal-reseller record stay outside this source acceptance.

The next milestone is one complete managed x402 purchase: confirmed AUD
funding, an all-in AUD Quote, reserve-before-payment, corporate USDC settlement,
usable delivery, explicit recovery, customer-visible Calls and invoice-ready
records. Production money remains disabled until the Australian legal, AML/CTF,
tax and bank-account gates are approved. That proof is specified in
[START_LINE.md](./START_LINE.md).

<a id="strategic-advantage"></a>

## Later differentiation — not a current release goal

The following is a longer-term hypothesis, not the reason to invent different
behaviour now. First deliver the familiar reference experience reliably for
Australian customers. Investigate differentiation later when actual use
identifies a worthwhile improvement.

Connectors remain best for predictable, frequent and preselected capabilities.
The open market matters when needs are specialised, regional, temporary, newly
created, contingent on runtime state or too infrequent to integrate in advance.

Agentic Economy does not win by owning a payment protocol or listing the most
services. A possible later advantage is joining the records across the
full sequence:

```text
need -> Tools -> Quote -> Call -> delivery -> use -> recovery
```

Payment providers see transfers. Providers see their own calls. Harnesses see
the larger task. Accounting systems receive entries after the decision. At the
entry point, Agentic Economy connects machine use, business purpose, commercial
parties, payment and accounting evidence. As it moves through control, brokerage
and resale, it can add exact authority, comparable services, controlled
Calls, buyer-facing responsibility and remedy.

That joined record improves the market only when comparable needs recur,
evidence keeps its provenance, buyers permit its use and later purchases return
through the same boundary. Transaction volume alone is not an advantage.

The compounding loop is therefore operational rather than rhetorical:

```text
compact search -> Quote -> controlled Call -> bounded outcome records
       ^                                                   |
       |---------------------------------------------------|
```

Each completed or recovered Call can reduce uncertainty for the next comparable
choice without requiring Agentic Economy to retain the buyer's wider task,
prompt history or reasoning. This is how the market becomes easier and cheaper
for an agent to use over time while preserving the buyer's control of context.

## Evidence required

Current-stage acceptance is a familiar, complete experience for the supported
scope: customers and Providers can start, use, manage and leave the service;
integrators can use documented contracts; failures have safe recovery; money
and records reconcile. Validate those outcomes against the roadmap and maturity
references, including live proof where required. No unique market mechanism or
competitive differentiation is needed for closeout.

### Later market research — not an additional current release gate

The longer-term market thesis can be evaluated when:

- agents encounter valuable gaps their installed capabilities cannot close;
- they describe those gaps well enough to find useful services;
- comparison matters among credible Providers;
- delegated authority is sufficient to choose and spend;
- a Call returns a contribution the agent can use;
- similar gaps produce repeat purchases or Provider switching;
- Providers receive incremental demand and respond to it;
- the second purchase still passes through Agentic Economy; and
- the behaviour occurs across more than one agent or harness.

### Business records and accountability

The existing business-record and accountability requirements still need proof:

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
