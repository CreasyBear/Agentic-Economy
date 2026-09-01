# Agentic Economy

## The commercial infrastructure for a market of machine-purchased services

**Whitepaper**

**September 2026**

> This paper presents a market thesis and proposed commercial model. It is not
> legal, tax, accounting or financial-product advice.

## Abstract

AI agents are moving from generating answers to completing work. As they do,
they will encounter tasks that exceed their installed models, tools, data,
permissions and physical reach. They will need to acquire outside services in
real time.

The technical foundations for this market are emerging. Protocols such as x402
allow software to quote and settle machine payments. Agent-payment platforms
provide credits, metering, wallets and spending controls. These systems make it
possible for an agent to pay a service. They do not make the resulting exchange
a complete business purchase.

A business must still know who supplied the service, what was authorized, what
was delivered, how the price was determined, how the expense should be treated,
and what happens when the result fails or settlement is uncertain. Without that
commercial context, agent autonomy produces a growing reconciliation problem.

Agentic Economy is proposed as the market and commercial layer between agents
and outside service providers. Its market unit is the **Operation**: one exact,
bounded contribution offered by one supplier under explicit inputs, price,
terms, effects and delivery evidence.

Beginning in Australia, Agentic Economy would give buyers one accountable
commercial counterparty, one Australian-dollar purchasing relationship,
delegated controls, consolidated documentation and a traceable record of every
purchased Operation. Suppliers would gain access to machine demand without
building separate commercial infrastructure for every agent, payment method and
buyer jurisdiction.

Agentic Economy is not a new payment rail. It is the institution that turns an
agent's payment into an authorized, deliverable, recoverable and accountable
purchase.

## 1. Agents are becoming economic actors

Most software has historically acted within fixed commercial boundaries. A
company chooses a vendor, negotiates access, receives credentials and pays a
subscription. Software then consumes the approved service within that existing
relationship.

Agents change this pattern. An agent can recognize that its current environment
cannot complete the next step. It can search for an unfamiliar capability,
compare alternatives and select a service at the moment of need. As payment and
delegation protocols mature, it can also authorize the purchase without stopping
for a human checkout.

This changes the economic unit of software consumption.

A company no longer needs to purchase every capability in advance. It can buy a
small, bounded contribution when the need arises:

- a specialist dataset for one analysis;
- a registry or verification lookup;
- a simulation, model or compute job;
- a translation, inspection or expert judgement;
- access to a machine, sensor or proprietary system;
- a physical action in a remote location; or
- another agent's specialised work.

The result is a market for **last-mile agent services**. These are outside
contributions acquired when an agent reaches the boundary of what its current
models, context, tools, data or permissions can do.

This market is broader than APIs and narrower than outsourced projects. The
buyer does not need to adopt another platform or hand over its work. It needs one
usable contribution so that its existing agent can continue.

## 2. The missing institution

Payment protocols solve value transfer. Marketplaces solve discovery and
comparison. Accounting systems record recognised commercial events. Agentic
service purchases sit between all three.

Consider an autonomous agent that calls hundreds of paid services across a
month. Each service may use a different identity system, currency, network,
pricing convention and delivery standard. Some providers may be Australian
companies. Others may be offshore companies, individual developers, agents or
wallet addresses. Some calls will complete. Others will fail after payment,
return invalid output or remain uncertain.

The business behind the agent must reconstruct the commercial meaning of those
events:

```text
Who authorized the purchase?
        |
What exact service and terms were accepted?
        |
Who was the supplier?
        |
What did it cost in the buyer's reporting currency?
        |
Was a valid result delivered?
        |
Was the charge settled, refunded or disputed?
        |
What tax and accounting treatment applies?
```

A wallet history cannot answer these questions. A payment receipt proves that
money moved. It does not necessarily prove the identity of the legal supplier,
the business purpose, the agreed service contract, the validity of the result or
the appropriate tax treatment.

This is the gap Agentic Economy fills.

> The world is making payments agent-native. Agentic Economy makes agent-native
> purchases business-native.

## 3. The Operation as the market unit

An open market needs a unit that agents can understand and businesses can stand
behind. A vendor profile is too broad. An API endpoint is too technical. An
agent is too unpredictable. A payment is too narrow.

Agentic Economy defines the market around an **Operation**.

An Operation is one exact contribution offered by one supplier. It states:

- what the service does;
- the inputs it accepts;
- the output it promises;
- the supplier responsible for it;
- its current price and price limits;
- the permissions and data it requires;
- the external effects it may cause;
- the terms under which it is supplied;
- its readiness and expected timing; and
- the evidence available after execution.

This definition makes services comparable without pretending they are
identical. An agent can inspect two competing Operations, understand the
trade-offs and choose within its owner's constraints.

The market loop becomes:

```text
capability gap
    -> search
    -> compare
    -> inspect
    -> authorize
    -> purchase and invoke
    -> receive a usable result or recoverable receipt
    -> continue work
```

Agentic Economy does not own the agent's project, planning, memory or runtime.
Those remain with the person, company and agent harness. Agentic Economy owns
the boundary at which an outside service becomes a market purchase.

## 4. Why payment infrastructure is necessary but insufficient

The agent-payment sector is developing quickly.

[Nevermined](https://nevermined.ai/) supports credits, metering, delegated card
spending, fiat and stablecoin payments, dynamic pricing and x402 settlement.
[Fireblocks](https://www.fireblocks.com/products/agentic-payments) provides
wallet delegation, compliance controls, x402 facilitation and structured
settlement evidence. Mastercard and Visa are bringing authenticated agent
transactions to Australian card networks. [Mastercard](https://www.mastercard.com/news/ap/en/newsroom/press-releases/en/2026/mastercard-accelerates-ai-powered-commerce-with-australia-s-first-authenticated-agentic-transactions-using-agent-pay/)
and [Visa](https://www.visa.com.au/about-visa/newsroom/press-releases/visa-welcomes-partners-into-agentic-ready-program-to-unlock-agentic-commerce.html).

These developments validate agent-mediated purchasing. They also show why
Agentic Economy should not compete as another wallet, facilitator or payment
protocol.

Payment infrastructure answers:

- Can this agent spend?
- Is the payment authorized?
- Can the service meter usage?
- Did settlement occur?

Agentic Economy must answer a different set of questions:

- Should this service be admitted to the market?
- Which Operation is suitable for this need?
- What exact commercial commitment did the buyer approve?
- Did the supplier deliver the promised contribution?
- What recourse applies if it did not?
- How does the purchase enter the buyer's commercial records?
- Which supplier should receive the next comparable unit of demand?

The two layers complement each other. Agentic Economy should use mature payment,
custody, conversion and payout providers wherever they satisfy the market's
authority and evidence requirements. It should concentrate on the commercial
semantics that those providers do not own.

## 5. Why begin in Australia

Australia is a useful starting market because local business purchasing depends
on clear supplier identity, documented tax treatment and defensible records.

For purchases above A$82.50 including GST, a GST-registered buyer generally
needs a valid tax invoice before claiming an input tax credit. Lower-value
purchases still require supporting evidence. Tax invoices identify the supplier
and ABN, describe what was supplied and state the relevant GST information.
[Australian Government invoicing
guidance](https://business.gov.au/finance/payments-and-invoicing/how-to-invoice)

This does not mean every offshore or wallet-based purchase causes a lost GST
credit. If Australian GST was not charged, there may be no credit to claim. Nor
does the absence of a tax invoice automatically deny an income-tax deduction.
The deeper problem is uncertainty. The business still needs to determine the
supplier, nature, purpose, value and treatment of the purchase.

As the number of machine purchases grows, this uncertainty becomes operational
cost. Finance teams face fragmented statements, foreign currencies, wallet
transactions, missing supplier details and service records disconnected from
payment records. Autonomous purchasing can save human time at the point of
execution while creating manual work at month end.

Agentic Economy can remove that trade-off by becoming the Australian commercial
counterparty.

The intended structure is a **principal-reseller model**. Agentic Economy buys
an upstream service and supplies the selected Operation to its customer under
its own terms and retail price. The customer buys from Agentic Economy rather
than directing Agentic Economy to transmit money to many third-party payees.

```text
Upstream supplier -> wholesale service -> Agentic Economy
Agentic Economy    -> retail Operation  -> Australian buyer
```

This is a substantive commercial role. It means Agentic Economy must stand
behind the customer contract, support failures and refunds, account for its own
supply, and manage supplier, treasury and settlement risk.

The Australian statutory concept of an **electronic distribution platform** is
not simply another name for merchant of record or principal reseller. Its GST
application depends on the parties, supply, controls and agreements involved.
[ATO Law Companion Ruling LCR
2018/2](https://www.ato.gov.au/law/view/pdf/pbr/lcr2018-002.pdf) Agentic Economy's
final structure must therefore be designed and confirmed with Australian legal
and tax specialists.

## 6. The Agentic Economy proposition

Agentic Economy presents one commercial interface to the buyer and connects to
many supplier and payment interfaces behind it.

```text
Australian business
        |
owner-defined authority and budget
        |
business agent
        |
        v
Agentic Economy
  Operation market
  Australian-dollar pricing
  commercial counterparty
  controlled invocation
  evidence and recourse
  consolidated documentation
        |
        +-------------------+-------------------+
        |                   |                   |
        v                   v                   v
   x402 service         MCP/API service    human or hybrid service
        |                   |                   |
        +-------------------+-------------------+
                            |
              specialist payment and payout rails
```

### For buyers

Agentic Economy offers:

- one purchasing relationship across independent service providers;
- prices and limits expressed in Australian dollars;
- delegated spending by agent, project, team and cost centre;
- comparison of exact Operations before commitment;
- protection against price drift and unauthorized retries;
- a usable result or durable recovery path;
- consolidated commercial documentation; and
- a detailed record that reconciles each charge to authority and delivery.

The buyer's agent gains reach without receiving an unrestricted wallet or a
collection of supplier credentials. The finance team gains a bounded record of
what the agent purchased and why the charge exists.

### For suppliers

Agentic Economy offers:

- distribution across multiple agent harnesses;
- a standard way to publish a bounded service;
- support for conventional APIs, MCP, x402 and future protocols;
- metering and settlement through appropriate providers;
- clear success, failure and refund rules;
- payment in supported fiat or digital-asset rails; and
- evidence of qualified use, repeat demand and performance.

The supplier does not need to become an Australian billing platform or negotiate
separately with every small buyer. It can focus on delivering the Operation.

## 7. The commercial evidence layer

Each purchased Operation creates a **Commercial Invocation Record**. This record
connects the business decision to the technical execution and financial outcome.

It contains five classes of evidence:

1. **Authority:** the buyer account, agent, delegated owner, policy and approved
   spending ceiling.
2. **Contract:** the supplier, exact Operation revision, inputs, price, terms,
   data use and external effects.
3. **Execution:** a unique invocation, timestamps, attempts and retry identity.
4. **Delivery:** result validation, artifact or response integrity, failure and
   buyer-reported usefulness.
5. **Money:** reservation, charge, upstream settlement, refund, tax treatment and
   accounting allocation.

These facts must remain distinct. A payment does not prove delivery. A response
hash does not prove usefulness. A supplier claim does not become an observed
fact. An agent's evaluation is evidence from the buyer, not an objective verdict.

This disciplined record supports three outcomes:

- the buyer can understand and substantiate the purchase;
- Agentic Economy can resolve failures without duplicate payment or invocation;
  and
- future agents can compare suppliers using observed performance rather than
  catalogue claims alone.

Agentic Economy becomes a system of record only for paid Operation purchases.
It does not replace Xero, MYOB, NetSuite, SAP or another general ledger. It sends
those systems clean, categorized commercial events instead of raw machine
transactions.

## 8. Australian-dollar accounts and consolidated documentation

Agents need purchasing authority that persists across calls. Requiring a human
checkout for every small Operation defeats the purpose of autonomous execution.

The proposed customer experience uses an Australian-dollar usage account with
owner-defined limits. The balance is intended to be non-transferable, non-yielding
and usable only for Operations supplied by Agentic Economy. The customer does not
own or control Agentic Economy's upstream wallets or digital assets.

Account funding and service supply must remain correctly distinguished. ATO
guidance states that adding money to a customer account for future supplies is
generally not itself a supply. [ATO GSTR
2003/5](https://www.ato.gov.au/law/view/print?DocID=GST%2FGSTR20035%2FNAT%2FATO%2F00001&PiT=20140423000001)

A likely commercial flow is:

1. The customer funds its account and receives a funding receipt.
2. The agent commits to and consumes individual Operations.
3. Agentic Economy records completed, failed, refunded and uncertain outcomes.
4. Agentic Economy issues a consolidated tax invoice for supplies made during
   the accounting period, with adjustments where required.
5. The customer exports summarized expense lines and retains the underlying
   invocation statement for audit and internal allocation.

The exact GST attribution and invoice design require professional approval. The
principle is more important than the final format: the account exists to enable
bounded purchasing, while the commercial record follows the actual supply.

The product should never promise “zero regulatory risk.” Stored value,
digital-asset settlement and payment facilities can attract regulatory
obligations depending on their design. [ASIC digital-assets
guidance](https://www.asic.gov.au/regulatory-resources/digital-transformation/digital-assets-financial-products-and-services)
Agentic Economy must constrain customer rights, use licensed or specialist
providers where appropriate and ensure that its contracts match the real flow of
funds and services.

## 9. Nevermined as a benchmark, not the destination

Nevermined demonstrates that agent-native payment infrastructure is becoming a
real category. Its platform combines service registration, payment plans,
credits, usage metering, delegated cards, fiat and stablecoin payments, x402
verification and programmable settlement. [Nevermined payment
models](https://nevermined.ai/docs/integrate/patterns/payment-models)

Agentic Economy should model several product patterns on it:

- one integration across payment methods and protocols;
- verify authority before execution;
- settle against successful usage;
- support fixed, dynamic and credit-based pricing;
- apply per-agent and per-period spending limits;
- expose transaction status and recovery; and
- calculate retail price from cost plus margin.

The strategic distinction is the commercial role.

Nevermined's published terms describe a non-custodial software provider that is
not an intermediary or custodian and places tax responsibility on the user.
[Nevermined terms](https://nevermined.ai/legal/terms/) Agentic Economy proposes
to become the buyer-facing Australian principal reseller for admitted
Operations.

| Nevermined model | Agentic Economy model |
| --- | --- |
| Agent-payment and monetization infrastructure | Market and commercial purchasing institution |
| Seller publishes payment plans | Supplier publishes comparable Operations |
| User or seller retains tax responsibility | AE accounts for its own Australian retail supply |
| Settlement and usage record | Connected authority, contract, delivery, settlement and accounting record |
| Global, protocol-oriented infrastructure | Australian commercial starting point with cross-harness reach |
| Provider of rails and controls | Accountable counterparty with recourse |

This distinction also creates more risk for Agentic Economy. The company must
earn enough margin to support customer service, refunds, supplier diligence,
treasury, tax and regulatory work. It cannot claim the upside of principal
status while contracting away every principal obligation.

## 10. Market entry

Agentic Economy should begin by constructing both sides of one narrow market.

### Initial buyers: Australian AI consultancies and development shops

Consultancies already combine services from multiple model, data and API
providers. They must allocate those costs to projects and often rebill them to
clients. They are technically capable enough to adopt early agent-service
infrastructure and commercially exposed enough to judge whether the evidence is
useful.

For these buyers, Agentic Economy offers a simple proposition:

> Let your agents acquire bounded outside services without establishing a new
> supplier, credential and payment relationship for every capability. Receive
> one Australian-dollar purchasing relationship and a defensible record for each
> client project.

### Initial supply: Australian and global service vendors

The corresponding supply comes from vendors with useful, bounded services but
limited distribution into agent workflows. These may include data providers,
specialist APIs, verification services, compute providers, professional experts
and x402-native developers.

For these suppliers, the proposition is:

> Publish one exact Operation, let Agentic Economy bring authorized demand, and
> receive settlement without building separate procurement and accounting
> infrastructure for every buyer.

Australia already contains early adjacent examples. [Milysec/Milypay](https://milysec.com/developers)
offers Australian data services over x402. [Central AI](https://centralai.app/legal/developer-payouts)
handles client billing, wallet-metered usage and developer payouts in an
Australian agent marketplace. These companies show that the local market is not
empty. They do not remove the opportunity for a cross-harness principal-reseller
market built around outside Operations.

### Expansion: Australian enterprise AI teams

Enterprise is the destination, not the starting assumption.

Once Agentic Economy proves repeated delivery, supplier quality and accepted
commercial records, it can serve enterprise teams that need:

- one master services agreement;
- approved supplier and jurisdiction policies;
- team, agent and cost-centre controls;
- audit retention and accounting integration;
- service-level support and dispute handling; and
- assurance that an agent cannot exceed its delegated commercial authority.

Starting with consultancies and suppliers creates transaction evidence before
enterprise procurement cycles begin. It also exposes the real requirements that
an enterprise product must meet.

## 11. Business model

Agentic Economy earns money by accepting commercial responsibility around a
completed Operation.

The primary revenue source is the spread between the retail Australian-dollar
price charged to the buyer and the landed wholesale cost of the service. Landed
cost includes:

- the supplier price;
- payment and payout fees;
- foreign exchange and digital-asset conversion;
- failed execution and refund exposure;
- fraud and chargebacks;
- customer support;
- compliance and supplier diligence; and
- the cost of funding settlement timing differences.

Enterprise buyers may also pay a subscription for advanced policy, allocation,
accounting integration, evidence retention and support. Suppliers may fund
clearly disclosed distribution programs tied to qualified use, but payment
must never buy admission or distort undisclosed ranking.

Gross transaction value is not revenue. A healthy business requires positive
contribution margin after the full cost of delivery and recourse.

## 12. Why the market may become defensible

The payment handshake is not the moat. Neither is a large catalogue of
unverified endpoints.

The potential defence is a market that learns from completed purchases.

```text
more useful demand
    -> attracts better suppliers
    -> creates more comparable Operations
    -> produces more delivery and outcome evidence
    -> improves selection and recourse
    -> earns buyer trust
    -> creates more useful demand
```

Over time, Agentic Economy can accumulate assets that a payment provider or
individual agent harness does not naturally possess:

- wholesale relationships across independent service providers;
- normalized contracts for comparable Operations;
- observed failure-adjusted prices and delivery performance;
- evidence of repeat purchase and supplier switching across harnesses;
- buyer trust in controls, documentation and recourse; and
- concentrated demand in service categories too fragmented for direct
  integration.

This defence exists only if the evidence changes allocation. Recording millions
of low-value calls does not create a market if buyers do not compare, suppliers
do not compete and agents do not return.

## 13. What must be true

The case for Agentic Economy depends on six linked premises:

1. Agents increasingly need useful services outside their installed tools and
   existing vendor contracts.
2. Buyers allow agents to make bounded purchases under delegated authority.
3. Service supply remains fragmented enough for independent comparison to
   matter.
4. Australian buyers value one accountable commercial relationship and its
   supporting evidence.
5. Suppliers accept Agentic Economy as a wholesale buyer or reseller and leave
   enough margin to fund its obligations.
6. The principal-reseller and account structure can operate within Australian
   tax, payments and financial-services requirements.

These premises are not yet proven by the growth of x402 or agentic-commerce
announcements. Protocol adoption validates technical possibility. Only repeated
commercial behaviour validates the institution.

The decisive proof is one complete loop:

```text
a real buyer encounters a capability gap
  -> compares independent suppliers
  -> purchases one Operation through AE
  -> receives a useful result
  -> accepts the commercial record
  -> returns to AE for the next comparable need
```

If external service purchasing remains rare, stays inside existing cloud
contracts, or creates too little accounting pain to alter buyer behaviour, the
Australian wedge is weak. If suppliers cannot support identity, delivery and
recourse, the principal-reseller model becomes too costly. Agentic Economy must
earn its existence through observed use, not category rhetoric.

## 14. The future commercial layer

In a mature agent-service economy, a business should be able to grant an agent a
clear mandate:

> Spend up to A$200 this week on approved research and verification Operations.
> Do not send personal data outside Australia. Do not accept a price above A$5
> per call. Prefer suppliers with verified delivery above 99%. Escalate any
> irreversible effect. Allocate every purchase to Project Atlas.

The agent should then be able to discover unfamiliar supply, compare exact
terms, purchase within those limits and return a useful result. The business
should receive a clean commercial record without holding digital assets,
reconciling anonymous wallets or onboarding every upstream provider.

The supplier should be able to publish once, meet a defined market contract and
receive qualified demand from agents operating in many environments.

This is the commercial infrastructure Agentic Economy seeks to create.

## Conclusion

Agentic Economy does not need to exist because agents require another way to
move money. The world is already building wallets, payment protocols, cards,
facilitators and settlement systems for them.

Agentic Economy needs to exist if agents begin buying services across those
systems and businesses require someone to make sense of the result.

An open market of agent services needs more than payment. It needs comparable
units of supply, delegated authority, accountable counterparties, delivery
evidence, failure recovery, commercial records and a mechanism that directs
future demand toward better suppliers.

Australia is a practical place to build that institution. Its requirements make
the gap visible, its market is bounded enough for a focused entrant, and its
businesses can benefit from a local commercial bridge to global machine supply.

Agentic Economy's role is therefore precise:

> Agentic Economy is the Australian market and commercial layer through which
> agents discover, compare and buy bounded outside services. It turns fragmented
> machine transactions into authorized business purchases and returns both a
> usable result and an accountable record.

If that loop repeats, Agentic Economy becomes more than agent-payment
infrastructure. It becomes the institution through which agents participate in
an open service economy.
