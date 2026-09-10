# Agentic Economy

## Commercial closure for just-in-time service procurement

### Australia as a worked institutional case

**Position paper, September 2026**

### Abstract

Software agents are gaining the ability to discover, select, pay for and use outside services after a task has begun. This changes more than the speed of software procurement. It changes when the provider becomes known. A business can delegate work before either the business or its software developer knows which outside contribution the work will require.

Payment protocols make this sequence technically possible. They can quote a price, authorise a transfer and return settlement evidence inside a machine request. They do not, by themselves, complete the resulting business purchase. Settlement does not establish the legal buyer and seller, the authority under which the software acted, the exact service and terms accepted, the treatment of data, the state of delivery, the remedy for failure or the record on which the buyer can later rely.

This paper calls the terminal, explainable state **commercial closure**. It argues that just-in-time service procurement requires a market institution that can preserve provider choice at the point of selection while presenting one accountable seller to the buyer. The proposed form is an accountable gateway operating a two-sided market for discovery and a principal-reseller relationship for the sale. Its market unit is the **Operation**: one versioned, callable contribution with fixed inputs, price, terms, effects and evidence.

Australia supplies the worked jurisdictional case. Its national business identity, goods and services tax, company-record, electronic invoicing and cross-border privacy systems impose overlapping obligations on the transaction. Joining those obligations into one explainable event is the proposed design response, not a claim that the legal structure has already been settled. Agentic Economy is the proposed implementation of this institution. Its purpose is not to replace payment protocols, agent runtimes or accounting systems. It is to make a service chosen by software during work recognisable as an authorised and remediable business purchase with a terminal delivery state.

## 1. Introduction

The internet is acquiring a native payment path for software. An HTTP request can encounter a price, produce a signed payment, obtain settlement confirmation and continue without a checkout page or a human buyer. x402 expressly supports an agent purchasing a paid resource during a task. Nevermined adds service catalogues, plans, credits, delegated spending, fiat and stablecoin rails, and records around that flow [1, 2].

These systems solve a real problem. They remove account creation, interactive checkout and much of the mechanical cost from small machine purchases. Their arrival exposes a second problem that is easy to mistake for payment reconciliation.

A business purchase is not merely a transfer of value. It is a claim about standing and responsibility. It says that a legal principal authorised an actor to acquire a defined supply from a recognised seller on accepted terms; that some result or effect followed; that failure has a treatment; and that the event can be explained later to finance, audit, tax, risk and the parties themselves. Payment is evidence within that claim. It is not the claim in full.

This distinction becomes important when software selects the provider during execution. Enterprise software has long used dynamic infrastructure, exchanges and routing systems. The novelty is not that software can call an endpoint whose operator changes. The novelty is the combination of five conditions:

1. the software is pursuing an objective rather than following a fully specified transaction path;
2. it discovers a missing contribution only after the task has begun;
3. it can compare providers that neither the buyer nor the developer selected in advance;
4. it can commit funds, disclose information or cause an outside effect without a new human procurement cycle; and
5. the business remains responsible for the resulting purchase.

Call this **just-in-time service procurement**. The upstream provider and exact supply are selected after the need appears, then bound before the service is invoked. Under principal resale, the buyer-facing seller is already known. Just-in-time procurement allows software to reach beyond its installed capabilities while preserving one commercial counterparty. It also reverses the ordinary sequence in which provider approval, contract formation and purchasing authority precede consumption.

The question of this paper is therefore institutional:

> What commercial form allows a business to delegate the selection of an unknown outside service without delegating away its responsibility for the purchase?

The answer developed here has four parts. First, the service must be represented as a bounded purchase rather than as a broad provider identity or endpoint. Second, authority must be granted as a policy before the need is known and resolved into an exact commitment before invocation. Third, the payment, service, delivery and remedy records must close into one commercial event. Fourth, a party must accept enough control and responsibility to present that event as one local sale to the buyer.

This produces a market that is open at the point of allocation and singular at the buyer's commercial boundary. Agentic Economy is the proposed name and implementation for that market.

### 1.1 Relation to prior work

The argument joins fields that usually stop at different boundaries. Research on tool-using agents explains how software can choose and invoke outside capabilities [21, 22]. Machine-payment protocols explain how a request can carry price and settlement. Transaction-cost and incomplete-contract theories explain why firms choose particular boundaries for exchange [4, 5, 16]. Work on intermediaries and two-sided markets explains how a common institution can coordinate dispersed buyers and providers [8, 17, 18]. Australian law determines how one jurisdiction attributes and records the resulting event [9-15].

None of these fields alone asks how an outside service, selected by software after delegated work has begun, becomes one recognisable business purchase. That is the paper's claimed contribution. It defines the missing completed state, identifies the Operation and commitment needed to reach it, and derives a market form that can provide it.

The paper also makes an institutional inversion. Bitcoin showed how cryptographic proof could remove a trusted financial institution from electronic value transfer [20]. This proposal adds an accountable institution around the underlying purchase. The positions are compatible because settlement and commercial responsibility answer different questions. One concerns whether value moved. The other concerns what the principal authorised, received and can remedy.

The method follows Berners-Lee's treatment of CERN as a model in miniature: start with a bounded setting in which a general structural problem is already visible, specify the missing relationships, and connect existing systems rather than replace them [19]. Australia serves that role here.

Agent-mediated electronic commerce is not new. Maes, Guttman and Moukas described software agents moving through product brokering, merchant brokering, negotiation, purchase and delivery in 1999 [25]. That work established automated market choice and bargaining. It did not address a principal reseller that converts a provider chosen during delegated business work into one locally attributable service purchase.

Current protocols move closer to the authority problem. AP2 defines signed Checkout and Payment Mandates and receipts that bind an agent's authority to a checkout and payment [26]. Its specification leaves catalogue, checkout update and other commerce APIs outside scope. x402 and Nevermined carry price, access and settlement. Smart contracts can execute encoded conditions. These systems can contribute authoritative evidence to commercial closure; none necessarily accepts the buyer-facing sale or joins it to upstream provider performance and local remedy.

Procure-to-pay systems join a purchase order, receipt and invoice, often through two-way or three-way matching. They assume an identified seller and an order already recognised by the firm. Electronic-contracting law establishes that agreements and signatures need not fail merely because they are electronic [27]. Cloud and API marketplaces consolidate procurement for offerings selected before use, often under one bill [24]. Merchant-of-record and principal-reseller services consolidate the buyer-facing sale, but are usually designed around a human selecting a known product or subscription. Electronic distribution platform law allocates tax responsibility within its statutory scope; it is not a general transaction model.

The contribution claimed here is narrower than autonomous commerce and broader than settlement finality. It is a transaction model that binds runtime capability resolution, delegated authority, a versioned service commitment, invocation, buyer consideration, upstream settlement, attributed delivery and remedy for a provider the principal did not select before work began.

## 2. The transaction that appears during work

### 2.1 Just-in-time selection

Let a principal's task begin at time \(t_0\). At \(t_g\), its agent encounters a capability gap \(g\): a bounded contribution that its installed capabilities cannot provide. The agent observes a set of candidate services \(\mathcal{O}(g)\), selects one at \(t_s\), commits at \(t_c\), and invokes it at \(t_i\):

\[
t_0 < t_g \leq t_s \leq t_c < t_i
\]

In a conventional integration, the commercial relationship with the provider is established before \(t_0\). In just-in-time procurement, the information needed to choose that provider does not exist until after \(t_g\). It may depend on the exact record the agent has found, a jurisdiction that becomes relevant, a failed prior attempt, current capacity, current price or the need for a particular form of evidence.

This does not imply that every capability should move into an open market. A predictable, frequent and strategically important service will usually justify a direct contract and permanent integration. The market for just-in-time procurement serves the other part of demand: contributions that are specialised, regional, temporary, newly available, contingent on runtime state or too infrequent to integrate in advance.

The economic territory is clearest when the value of the outside contribution exceeds its purchase price but does not justify the fixed human cost of approving a new provider. A three-dollar verification may be valuable to the task and still be impossible to buy through a conventional vendor process. Lowering the price to three cents does not remove this problem. It makes the fixed cost more dominant.

### 2.2 The unit of exchange

A service market needs an object precise enough to compare, authorise, buy and remedy. A provider is too broad. An endpoint describes a technical location but not a commercial promise. An agent identity may contain many capabilities and may change its behaviour without changing its name.

This paper uses the **Operation** as the unit of exchange.

| Term | Definition |
| --- | --- |
| Principal | The person or legal entity that owns the objective, delegates authority, bears the economic result and appears in the business record. |
| Agent | A software process that selects or invokes Operations under authority granted by a principal. The agent is a technical actor, not a separate legal person. |
| Capability gap | A bounded contribution that the agent cannot obtain from its installed capabilities. |
| Provider | The upstream party that performs an Operation and owes its performance obligations to the seller. The provider may be selected during execution. |
| Seller | The party that contracts with the principal, makes the buyer-facing sale and owes the stated delivery condition and remedy. Under the proposed model, Agentic Economy is the fixed seller. |
| Payment recipient | The party that receives a settlement movement. Depending on the rail and payment leg, this may be the seller, its payment agent or the provider. |
| Operation | One versioned, callable contribution from one provider, specifying its required inputs, price, material terms, data handling, possible effects, readiness and available evidence. |
| Commitment | An expiring record that binds a principal's authority to one exact Operation revision, price and invocation context before money, data or external effect is released. |
| Invocation | One accepted attempt to execute an Operation under one commitment. |
| Commercial closure | A proposed terminal state in which the parties, authority, Operation, attributed tax position and basis, delivery outcome, remedy, payment and accounting reference agree well enough for the principal to explain and defend the purchase. Delivered, failed, refunded and adjusted may be closed states; uncertain remains open. |

The Operation does not promise the success of the principal's larger task. A court-record lookup may promise a search of a named register under stated inputs and return conditions. It does not promise that the principal will win a case. A translation Operation may promise a translation under a stated quality and delivery rule. It does not promise that the recipient will accept the document. This boundary is essential. The market can accept responsibility for the purchased contribution without becoming the owner of every objective pursued by software that uses it.

### 2.3 Delegation before selection

The principal cannot approve the exact provider at \(t_0\) because the relevant state is not yet known. It can define a mandate over the class of purchases the agent may later make. The mandate may restrict maximum price, total exposure, service category, provider class, jurisdiction, data destination, external effect, expiry and evidence required. It need not name the final provider.

At \(t_c\), the market resolves that prior mandate into one exact commitment. If the provider, price, terms, data treatment, effects or Operation revision changes before invocation, the commitment no longer matches and cannot be reused.

This two-stage structure follows the underlying information problem. Authority must exist before the agent can act, but precision can exist only after the need is known. Approval of every call preserves precision by destroying autonomy. An unrestricted wallet preserves autonomy by discarding the commercial scope of authority. A mandate followed by exact commitment preserves both.

Grossman and Hart's account of incomplete contracts helps explain why this sequence matters [16]. The principal cannot specify every future service choice when work begins because the relevant need, provider and state are not yet known. The answer is not an infinitely detailed initial contract. It is a bounded allocation of control followed by a precise contract when the missing information appears.

## 3. Settlement is not commercial closure

### 3.1 What machine-payment protocols establish

x402 turns a digital resource into a paid request. The seller returns payment requirements; the client constructs a payment payload; a facilitator can verify and settle it; the client receives access [1]. Nevermined extends this pattern with registered services and plans, delegated card and stablecoin spending, budgets, access validation and a payment ledger [2]. These are substantial pieces of machine commerce.

Their proper role is easiest to see by defining a generic payment record \(P\):

\[
P = (payer, payee, amount, asset, time, request, settlement\ status)
\]

Implementations may add identifiers, delegations, resource locations and receipts. These additions improve traceability. They do not make payment settlement identical to completion of the underlying sale. Nevermined's published terms illustrate the distinction. They describe software that prepares or facilitates transactions, disclaim an intermediary or custodial role, and leave relevant legal and tax responsibilities with users [3]. That is a coherent boundary for infrastructure designed to travel across jurisdictions.

Principal resale creates at least two financial legs. The buyer-facing consideration record \(P_B\) states what the principal owes, has reserved, has paid to the seller, or is due to receive back. The upstream record \(P_U\) states what the seller owes, has paid to the provider, or is entitled to recover. A funding movement may precede both. A rail can settle either leg, but the legs have different parties and obligations and must not be collapsed into one transfer.

The boundary also leaves an institutional layer open.

### 3.2 The closed commercial record

Commercial closure is an analytical state proposed by this paper, not a statutory category or a claim of legal finality. The purchase passes through distinct moments: commitment records buyer-facing contract formation; payment records track consideration and upstream obligations; operational resolution records delivery or failure; and accounting and tax reconciliation attributes the event on a stated basis. These moments may occur at different times and may later produce an adjustment.

Let \(C\) be the linked record required to explain the purchase in a terminal state:

\[
\begin{aligned}
C =\ &(P_B, P_U) \\
&+ \text{legal principal, recognised seller and upstream provider} \\
&+ \text{delegated authority and acting software identity} \\
&+ \text{exact Operation revision and accepted terms} \\
&+ \text{local price, currency basis, attributed tax position and basis} \\
&+ \text{information disclosure and external effects} \\
&+ \text{delivery, failure and remedy state} \\
&+ \text{accounting and evidentiary references}.
\end{aligned}
\]

The two payment records contribute facts to \(C\), but cannot produce \(C\) alone. Nor must both be cash-settled for the buyer-facing purchase to reach a terminal state. An Operation can be delivered, invoiced and closed while buyer consideration or the upstream provider payable remains due. The records must identify the state of each obligation rather than equate closure with cash movement. A transaction hash may prove that an asset moved between addresses. A card charge may prove that a merchant submitted a payment. Neither fact alone proves what bounded service was authorised, whether it was delivered, whose information was disclosed, why a retry produced a second charge or which party must provide an adjustment.

Closure does not mean successful delivery. Delivered, failed, refunded and adjusted can each be terminal and explainable. An invocation whose external effect remains uncertain is still open. A later tax or accounting correction creates a new attributed state without erasing the evidence on which the earlier state rested.

No single database needs to originate every part of \(C\). The payment provider should remain authoritative for raw settlement. The upstream provider should remain authoritative for its execution logs. The market should be authoritative for the Operation presented, the commitment and the invocation identity. The reseller should be authoritative for the buyer-facing sale, adjustment and remedy. The customer's accounting system should remain authoritative for its general ledger. Commercial closure links these records without pretending that one can substitute for another.

### 3.3 Evidence is part of the service

For machine-consumed work, the result alone may be insufficient. An agent needs to know whether a failed response means that the service did not run, ran without returning, or performed an outside action whose confirmation was lost. The next safe step differs in each case. Repeating a classification is wasteful. Repeating a booking, transfer or filing may be harmful.

The traded contribution therefore includes the evidence required to decide what happened and what remedy follows. Evidence quality is not an accounting afterthought. It is one dimension on which Operations compete.

This yields the paper's first claim.

**Claim 1: Settlement and commercial closure are independent states.** Either payment leg can settle while the business purchase remains open, and the purchase can close with one leg recorded as payable. Payment infrastructure is necessary for a machine service market, but it is not sufficient. Closure requires standing, authority, exact supply, consideration state, a terminal delivery state and the applicable remedy.

## 4. The economics of provider uncertainty

### 4.1 The cost that payment does not remove

Coase's account of the firm begins with a fact that remains true on programmable payment rails: using a market has a cost [4]. Buyers must discover prices, reach agreements and organise exchange. Williamson later made the transaction the unit of analysis and treated governance as the means by which parties preserve value after commitment, including when performance fails or circumstances change [5].

Agent services lower the production and search cost of specialised contributions. They can also multiply the number and variety of exchanges a firm might make. A payment protocol can reduce the mechanical cost of quoting, credential exchange and settlement. It does not necessarily remove the fixed cost of accepting a provider, establishing terms, assigning authority, supporting records and arranging a remedy.

Consider one outside provider and \(n\) eligible buyers during a period. For this illustrative model, assume buyer needs are independent and identically distributed, and let \(q\) be the probability that each buyer first needs that provider during the period. A direct relationship costs each buyer \(F\) when the provider is first used. The expected fixed cost of direct procurement is therefore:

\[
E[C_D] = nqF
\]

Let the gateway pay admission cost \(A\) once if at least one buyer needs the provider. That event has probability \(1-(1-q)^n\). For each realised buyer-provider use, let \(m\) be the gateway margin, \(r\) the expected remedy and performance-risk cost, and \(h\) the allocated cost of the buyer's common gateway relationship. Ignoring the underlying service price, which both arrangements incur, expected mediated cost is:

\[
E[C_G] = A[1-(1-q)^n] + nq(m+r+h)
\]

Intermediation has a cost advantage when:

\[
nq(F-m-r-h) > A[1-(1-q)^n]
\]

The assumptions are explicit. Direct procurement pays a fixed cost only when a provider is actually first used. The gateway admits that provider once and can reuse the admission across buyers. It adds a margin and expected remedy cost to each exchange. Correlated demand changes the probability of reuse and should replace \(1-(1-q)^n\) with the observed probability that at least one buyer needs the provider. The model predicts a gateway advantage when reused admission savings exceed its margin, risk and governance costs. It predicts direct integration when demand is stable and frequent for one buyer, when admission cannot be reused, or when the provider relationship is too specific for a common contract.

Lower payment friction strengthens this argument. As the monetary price of an invocation falls, the fixed cost of forming a new commercial relationship becomes a larger share of the exchange. Micropayments do not abolish intermediation. They make a common commercial boundary more valuable.

**Claim 2: Just-in-time selection creates a relationship-cost threshold.** When the provider is selected during work and the fixed cost of direct onboarding exceeds the value created by a bounded contribution, otherwise useful exchanges do not occur. A gateway can move that threshold only when reused admission savings exceed its margin, risk and governance costs.

### 4.2 Delegated authority is the limiting resource

Jensen and Meckling define an agency relationship around delegated decision authority and the costs of monitoring, bonding and residual divergence [6]. Aghion and Tirole distinguish formal authority from real authority: the right to decide is not the same as effective control over a decision [7]. The distinction applies directly to software that can spend.

A principal may retain the formal right to approve purchases. If the economic benefit of the agent depends on many immediate choices, the software holds real authority unless constraints travel with each purchase. A wallet limit answers only whether funds may move. Purchase authority must also bind service scope, counterparty conditions, information use, external effects and the rule for failure.

The market's scarce input is therefore not funds. It is delegated authority that the principal can safely expand. Authority controls demand. A system that makes each state-contingent choice inspectable and attributable can support more autonomy than one that merely gives software a balance.

**Claim 3: Payment authority is narrower than purchase authority.** Where useful purchases depend on runtime information, a market can support autonomous demand only to the extent that principals can delegate state-contingent purchase authority without surrendering control over the resulting commercial events.

## 5. Which institution closes the purchase?

The need for commercial closure does not establish that a new company must provide it. Several arrangements can occupy the role. They should be compared against the same requirements.

| Arrangement | Choice during execution | One buyer relationship | Authority before spend | Seller and remedy | Closed purchase record |
| --- | ---: | ---: | ---: | ---: | ---: |
| Direct provider onboarding | Delayed | No | Yes | Yes | Yes |
| Fixed approved catalogue | Limited to prior set | No | Yes | Yes | Yes |
| Neutral payment router | Broad | Payment only | Sometimes | Usually no | No |
| Disclosed agency under standard provider terms | Broad | Agency relationship | Yes | Provider | Distributed across providers |
| Retrospective reconciliation | Broad | No | No | No | Partial and late |
| Agent platform as reseller | Possible | Yes | Possible | Possible | Possible |
| Accountable commercial gateway | Broad within admitted supply | Yes | Yes | Yes | Yes |

Direct onboarding remains the right arrangement for known, repeated providers. A fixed catalogue trades breadth for control. A neutral router preserves breadth and lowers settlement cost but leaves the underlying counterparties and remedies distributed. A disclosed agent can use standard provider terms and form purchases for the principal, but each provider remains the buyer's seller and the buyer retains a changing set of counterparties, tax positions and remedies. Retrospective accounting can classify a payment after the event, but it cannot recreate authority before disclosure or undo an external effect. An agent platform can become the reseller, although doing so requires it to accept a different legal, tax and operational role in each buyer jurisdiction.

The accountable gateway is not costless. It must admit providers, control what it sells, hold upstream agreements, state the buyer-facing terms, verify enough delivery to apply a remedy, issue records and carry fraud, refund and performance exposure. Those obligations limit the services it can responsibly offer and require a fee or margin.

Its distinct property is that it preserves provider competition above a consolidated buyer-facing sale. Hagiu and Wright distinguish a marketplace, in which providers sell directly to buyers, from a reseller, which buys upstream and sells downstream [8]. Agentic Economy combines the two forms at different boundaries. It is a two-sided market for discovery, comparison and allocation. It is a principal reseller for the relationship with the buyer.

This form also follows Spulber's account of intermediation as the creation and governance of exchange, not merely the reduction of an existing cost [17]. A small Operation may never be purchased under bilateral contracting. By reusing admission, authority, evidence and remedy across many exchanges, the intermediary can make a previously uneconomic market exist. Rochet and Tirole's two-sided-market model then explains the participation effects: more suitable Operations raise buyer value; more authorised demand raises provider value; better evidence can improve both by increasing the probability of successful allocation [18].

The combination follows a control-responsibility rule:

> A party that promises a common commercial outcome must hold enough control to admit providers, define the sale, verify delivery, suspend supply, issue adjustments and provide a remedy.

Responsibility without these rights is unstable. Control without buyer-facing responsibility is gatekeeping. Principal resale is the cleanest form when the buyer values one seller and the intermediary must control delivery and remedy across changing providers. Agentic Economy controls admission and buyer-facing terms, promises the bounded delivery condition, determines the buyer's adjustment or refund, bears buyer-facing non-performance exposure, and holds upstream recourse against the provider. The provider performs the Operation and owes its upstream obligations to Agentic Economy. Neither party owns the principal's larger objective.

**Claim 4: Open choice and commercial responsibility are compatible at different layers.** When a buyer values one counterparty and common remedy more than direct control of each provider relationship, an agent can choose among competing providers while its principal buys through one accountable seller. Principal resale is justified when the seller's control over admission, commitment, evidence and remedy supports the bounded promise it makes.

## 6. The institutional design of Agentic Economy

Agentic Economy follows from the role just derived. It is not a general agent runtime, a planning system, a new payment protocol or a replacement general ledger. It is the market and commercial boundary for an Operation that an existing agent needs but cannot perform with its installed capabilities.

Its decision chain is:

```text
capability gap -> resolution -> commitment -> invocation -> result -> outcome evidence
```

Resolution turns a bounded need into comparable candidate Operations. Commitment freezes the exact provider, revision, price, terms, data treatment, effects and applicable authority. Invocation executes only that commitment. The commercial event closes as delivered, failed, adjusted or refunded. It remains open while delivery or an external effect is uncertain. Outcome evidence records what the market can legitimately know about usefulness without confusing a buyer report with an observed fact or a provider claim.

The responsibility boundary is equally important:

```text
principal and its agent
  own the larger objective, delegation and use of the result
          |
          v
Agentic Economy
  owns presentation, commitment, controlled invocation,
  buyer-facing sale, purchase evidence and remedy
          |
          v
upstream provider and payment rail
  provider performs under its contract with Agentic Economy
  payment rail owns raw settlement evidence
          |
          v
buyer accounting system
  owns the general ledger and statutory accounts
```

The Agentic Economy record is an authoritative subledger for purchased Operations. It does not decide the buyer's final accounting classification. It supplies the facts that classification requires and preserves their relationship to the actual invocation.

### 6.1 Funding is not authority and authority is not purchase

A prepaid account is a mature way to separate treasury from high-frequency purchasing. The buyer funds one balance through an ordinary financial process. That creates available funds, not an instruction to spend them. The principal separately grants a mandate. Each later commitment reserves an amount. A delivered Operation creates the buyer-facing sale and provider payable. Failure releases the reservation or creates the stated adjustment.

The states must remain distinct:

\[
\text{available funds} \neq \text{permission to buy} \neq \text{closed purchase}
\]

This structure allows card, bank, stablecoin, x402 and future rails to sit underneath the same commercial event. The rail can change without changing the buyer's authority model or purchase record.

The funded facility cannot be treated as a mere ledger choice. Custody, redemption, withdrawal, permitted payees and the rights attached to stored value can determine whether Australian financial-services or non-cash-payment rules apply. ASIC notes that facilities which let a client make non-cash payments to more than one person are generally financial products, subject to the exact arrangement and applicable exclusions [23]. A principal-reseller balance usable only for purchases from its issuer may produce a different analysis. The legal structure must be settled before the funding model is implemented.

### 6.2 The commitment is the constitutional moment

Discovery is reversible. A ranking can change and candidates can appear or disappear. Invocation is not always reversible: it may disclose information, incur cost or produce an external effect. The commitment between them is therefore the market's constitutional moment. It converts a search result into an attributable decision under standing authority.

The commitment must identify the facts that cannot be reconstructed safely after the event. At minimum these are the principal, acting agent, authority version, Operation revision, provider, fixed buyer-facing seller, local price ceiling, accepted terms, required inputs, disclosed destinations, possible effects, evidence standard, expiry and retry rule.

This is the part adjacent systems cannot recover independently. A payment rail sees settlement but not the considered supply or business purpose. An accounting system sees a posting but not the runtime choice. An agent harness sees the larger task but may not stand behind the commercial promise. A provider sees its own invocation but not the principal's full mandate or the alternatives rejected.

## 7. Australia as a worked institutional case

Australia does not create the problem. It lets the paper work through the institutional requirements within one coherent national setting. The claim is not that Australia is the first country to face it or that the final legal structure has already been determined.

Australian companies must keep financial records that correctly record and explain their transactions and financial position and performance. Section 286 of the *Corporations Act 2001* requires those records to be retained for seven years [9]. GST records must support the amounts reported and credits claimed [10]. These provisions do not prescribe an agent-authority record. They do make unexplained transfers an inadequate foundation for the proposed system. A high-volume purchasing subledger should preserve how a payment connects to a supply, seller, authority and adjustment so that the company's records can explain the transaction.

Australian GST law also distinguishes the payment mechanism from the supply. GSTR 2003/5 explains, in the context of customer accounts, that money credited for later acquisitions need not itself be consideration for a taxable supply; the later acquisition receives its own treatment [11]. The exact outcome depends on the legal rights and terms of the facility. The broader design consequence is firm: funding, reservation, supply, failure, refund and forfeiture cannot be collapsed into one balance movement.

The electronic distribution platform rules provide a second distinction. LCR 2018/2 examines whether a supply is made through a platform and, in relevant cases, whether the operator authorises the charge, authorises delivery or sets the terms [12]. Authorising the charge is not the same as mechanically collecting payment. Authorising delivery is not the same as performing delivery. Australian tax attribution can therefore follow control over the commercial event rather than the location of the payment button.

An electronic distribution platform is not simply another name for a merchant of record or principal reseller. The statutory result depends on the type of supply, the parties, agreements and actual conduct. Agentic Economy's proposed status as buyer-facing principal seller must rest on its contracts and operations, with the GST consequences determined from the final structure. The ruling supports the paper's institutional point, not a blanket legal classification.

Cross-border data adds another part of the purchase. Under Australian Privacy Principle 8, an APP entity that discloses personal information to an overseas recipient generally must take reasonable steps in relation to the recipient's handling and may remain accountable for it, subject to the Act's exceptions [13]. A local reseller does not remove that obligation. A runtime selection can change more than price. It can change where information goes and which controls apply. The Operation and commitment should make that destination visible before invocation, when the decision can still be prevented.

Australia also offers a coherent route into ordinary business systems. The Australian Business Number gives a common business identifier. The ATO acts as the Australian Peppol Authority and maintains local requirements for structured electronic invoices [14, 15]. One federal GST and one company-record regime make it possible to specify a complete transaction path without first reconciling several domestic tax systems.

### 7.1 A worked purchase

Consider an Australian engineering consultancy. It funds an Agentic Economy account in Australian dollars and grants a research agent authority to spend up to A$20 per task on information services. The mandate prohibits personal information from leaving Australia and requires a source receipt.

During a task, the agent discovers that an equipment record is available only through a specialist overseas provider. The market returns three candidate Operations. One is cheaper but processes inputs in a prohibited jurisdiction. One lacks source evidence. The third meets the mandate.

Before invocation, Agentic Economy creates a commitment binding the consultancy, authority version, selected Operation revision, upstream provider, fixed buyer-facing seller, Australian-dollar price, processing location, input digest, evidence requirement and retry rule. The consultancy's funded balance is payable only to Agentic Economy for the buyer-facing sale. Agentic Economy separately incurs a payable to the upstream provider and uses its payment rail or payment agent to settle that obligation. The provider returns the record and receipt. Agentic Economy records delivery, recognises the local sale, releases the provider payable and makes the purchase evidence available to the consultancy's accounts.

If the provider charges but does not return the promised evidence, the payment remains true and the sale remains unresolved. The remedy rule determines whether Agentic Economy retries safely, substitutes another Operation, refunds the buyer or disputes the upstream charge. Finance does not need to infer the answer from two wallet transfers and an application log.

This example shows why Australia is a model in miniature. The relevant event joins delegated authority, provider allocation, service terms, cross-border information, settlement, delivery, an attributed GST position, remedy and retained records. Existing systems each hold part of it. The commercial gateway binds the parts.

**Claim 5: The market may be global while commercial closure remains local.** Operations and performance evidence can travel across borders. A buyer-facing seller can apply a jurisdictional interpretation to the same transaction core, including an attributed identity, tax, data and record position, without claiming to determine the buyer's final legal or accounting treatment.

## 8. Market structure and accumulated advantage

The durable position in this market does not arise from inventing a payment rail or listing the largest number of services. Protocols can standardise, providers can publish to several catalogues and models can search more broadly. The scarce record sits across the full allocation and purchase sequence:

\[
\text{need} \rightarrow \text{candidates} \rightarrow \text{authorised choice} \rightarrow \text{invocation} \rightarrow \text{delivery} \rightarrow \text{use} \rightarrow \text{remedy}
\]

No adjacent role necessarily both observes this sequence and accepts buyer-facing responsibility for it. Payment providers observe transfers. Upstream providers observe their own calls. Agent runtimes observe the surrounding task and could choose to become resellers, but do not accept that role by default. Accounting systems receive classified entries after the decision. The gateway can observe the considered Operations, exact commitment, controlled invocation, delivery state, recovery history and, where the buyer permits it, whether the result was used or purchased again.

That history can improve allocation, but only under stated conditions. Comparable needs must recur. Evidence must distinguish provider claims, market observations and buyer reports. The market must resist manipulation and preserve confidential business context. An outcome in one task cannot be treated as a universal quality score. Where those conditions hold, accumulated evidence can improve later matching among Operations for comparable capability gaps and mandates.

This creates a specific reinforcing process. More closed purchases add evidence about fit, delivery, failure and remedy. Better evidence improves future selection and may permit principals to delegate broader authority. Broader authority creates more qualified demand. Qualified demand attracts providers willing to publish precise Operations and accept common evidence rules. The return compounds only if comparable demand recurs, buyers permit the relevant evidence to be used, and later needs pass through the same commitment and closure boundary.

The resulting advantage is institutional rather than merely technical. It consists of accepted buyer authority, admitted supply, versioned commercial promises, linked performance and remedy history, and records that already enter ordinary business systems. A rival can reproduce an invoice template or payment integration. Reproducing the joined history requires it to have occupied the decision boundary across many prior purchases.

**Claim 6: The market can compound through allocation evidence, not transaction volume alone.** Closed purchases improve the market only when comparable demand recurs and their authority, alternatives, exact promise, delivery and later use remain connected with clear provenance and buyer permission.

## 9. Predictions, limits and research questions

The argument produces observable predictions.

First, machine-payment protocols will become interchangeable beneath higher-level purchasing systems. The differentiated control point will move from settlement toward the system that holds buyer authority, exact commitment, delivery state and remedy.

Second, providers will describe bounded work rather than advertise broad agent identities alone. Price, inputs, effects, evidence and retry behaviour will become part of the service's competitive surface.

Third, enterprise spend controls will move from lists of named providers toward state-contingent mandates. The most useful rules will bind not only amount but also service class, data destination, effect and evidence.

Fourth, accounting records for machine purchases will gain invocation and delivery references. A summary invoice may remain the financial document, but it will link to a subledger capable of explaining each underlying supply.

Fifth, open and closed service markets will coexist. Closed ecosystems will dominate predictable, repeated and tightly integrated capabilities. Open markets will matter where provider variety and runtime information are worth more than the cost of intermediation.

Sixth, the service market can become global while the accountable commercial boundary federates by jurisdiction. Expansion will add local interpretations of identity, tax, invoice, data and remedy to a stable transaction core.

These predictions also define where the thesis can fail. If agents rarely need capabilities outside installed tools, direct integration wins. If principals refuse meaningful delegated purchase authority, the market remains human-gated. If service outcomes cannot be bounded or evidenced, the Operation is the wrong market unit. If provider admission and reseller risk cannot be amortised across buyers, the gateway's margin will exceed its value. If payment or agent platforms accept the complete local seller role, they may occupy the institution themselves. If common protocols eventually carry enforceable identity, authority, tax, delivery and remedy across jurisdictions, a separate gateway may become unnecessary.

The scope is deliberately narrower than autonomous commerce in general. The proposed institution concerns business-to-business, digitally requested contributions with definable inputs, results and evidence, bought by an authorised software actor for an identifiable principal. Consumer transactions, physical goods, regulated financial services, employment, professional duties that cannot be transferred, and bespoke contracts requiring negotiation remain outside this first model.

The immediate research questions follow from the boundary: how Operations should express evidence and side effects; how mandates can preserve useful discretion without hiding material choices; which delivery claims can be verified independently; how retries and uncertain external effects should allocate risk; how provider admission scales without reproducing bilateral procurement; how commercial event records map into Peppol and accounting systems; how outcome evidence can improve allocation without disclosing buyer context; and which parts of the transaction core remain stable across jurisdictions.

These are not requirements for commercial validation before the thesis can be stated. They are the research programme implied by the thesis.

## 10. Conclusion

Software agents change the timing of market choice. They can encounter a capability gap, inspect outside supply and choose a contribution after the principal's work has begun. Machine-payment protocols make the resulting transfer immediate. They do not make the resulting purchase institutionally complete.

The missing state is commercial closure: the binding of a legal principal, delegated authority, exact Operation, recognised seller, price and tax treatment, data and effects, delivery, payment, remedy and accounting reference into one defensible event.

Direct provider onboarding can provide closure but cannot support a long tail of small, unpredictable purchases. Neutral payment can preserve choice but does not provide the buyer-facing sale. Closed catalogues preserve control by limiting the market. An accountable commercial gateway can preserve open selection within admitted supply while consolidating responsibility at the buyer's boundary. It does so by operating a market upstream and acting as principal reseller downstream.

The Australian case makes each part of the event legible and allows the proposed boundary to be worked through in one jurisdiction: the service lands in a legal business, under delegated authority, with an explainable record, an attributed tax position, a known information path and a party responsible for the buyer-facing remedy. The analysis leaves the final reseller, GST and funded-facility structures to the contracts, conduct and applicable law. The same transaction core can travel, with local commercial interpretation added country by country.

Agentic Economy is the proposed institution. It does not exist because software needs another way to pay. It exists because software is beginning to choose who performs part of a business's work before that business has a direct commercial relationship with the chosen provider.

The payment layer makes the exchange possible. Commercial closure makes it belong to an economy.

## References

1. Coinbase Developer Platform. [“x402 overview.”](https://docs.cdp.coinbase.com/x402/welcome) Accessed September 2026.
2. Nevermined. [“Monetize Your AI.”](https://nevermined.ai/docs/solutions/agent-to-agent-monetization) Accessed September 2026.
3. Nevermined AG. [“Terms and Conditions of Use.”](https://nevermined.ai/legal/terms/) Accessed September 2026.
4. Coase, Ronald H. [“The Nature of the Firm.”](https://doi.org/10.1111/j.1468-0335.1937.tb00002.x) *Economica* 4, no. 16 (1937): 386-405.
5. Williamson, Oliver E. [“Transaction Cost Economics: The Natural Progression.”](https://www.nobelprize.org/uploads/2018/06/williamson_lecture.pdf) Nobel Prize Lecture, 2009.
6. Jensen, Michael C., and William H. Meckling. [“Theory of the Firm: Managerial Behavior, Agency Costs and Ownership Structure.”](https://doi.org/10.1016/0304-405X%2876%2990026-X) *Journal of Financial Economics* 3, no. 4 (1976): 305-360.
7. Aghion, Philippe, and Jean Tirole. [“Formal and Real Authority in Organizations.”](https://doi.org/10.1086/262063) *Journal of Political Economy* 105, no. 1 (1997): 1-29.
8. Hagiu, Andrei, and Julian Wright. [“Marketplace or Reseller?”](https://doi.org/10.1287/mnsc.2014.2042) *Management Science* 61, no. 1 (2015): 184-203.
9. Commonwealth of Australia. [*Corporations Act 2001*, section 286.](https://www.legislation.gov.au/C2004A00818/latest/text)
10. Australian Taxation Office. [“Record keeping for GST.”](https://www.ato.gov.au/api/public/content/0-9354073c-055a-4d41-bd51-b7d9e6b4e834)
11. Australian Taxation Office. [*GSTR 2003/5: Vouchers and customer accounts*, paragraphs 49-52.](https://www.ato.gov.au/law/view/print?DocID=GST%2FGSTR20035%2FNAT%2FATO%2F00001&PiT=20140423000001)
12. Australian Taxation Office. [*LCR 2018/2: GST on supplies made through electronic distribution platforms.*](https://www.ato.gov.au/law/view/document?DocID=COG/LCR20182/NAT/ATO/00001)
13. Office of the Australian Information Commissioner. [“APP 8: Cross-border disclosure of personal information.”](https://www.oaic.gov.au/privacy/australian-privacy-principles/australian-privacy-principles-guidelines/chapter-8-app-8-cross-border-disclosure-of-personal-information)
14. Australian Taxation Office. [“eInvoicing.”](https://softwaredevelopers.ato.gov.au/eInvoicing)
15. Australian Government. [“Register for an Australian Business Number.”](https://business.gov.au/registrations/register-for-an-australian-business-number-abn)
16. Grossman, Sanford J., and Oliver D. Hart. [“The Costs and Benefits of Ownership: A Theory of Vertical and Lateral Integration.”](https://doi.org/10.1086/261404) *Journal of Political Economy* 94, no. 4 (1986): 691-719.
17. Spulber, Daniel F. [“Market Microstructure and Intermediation.”](https://doi.org/10.1257/jep.10.3.135) *Journal of Economic Perspectives* 10, no. 3 (1996): 135-152.
18. Rochet, Jean-Charles, and Jean Tirole. [“Platform Competition in Two-Sided Markets.”](https://doi.org/10.1162/154247603322493212) *Journal of the European Economic Association* 1, no. 4 (2003): 990-1029.
19. Berners-Lee, Tim. [“Information Management: A Proposal.”](https://www.w3.org/History/1989/proposal.html) CERN, 1989.
20. Nakamoto, Satoshi. [“Bitcoin: A Peer-to-Peer Electronic Cash System.”](https://bitcoin.org/bitcoin.pdf) 2008.
21. Yao, Shunyu, et al. [“ReAct: Synergizing Reasoning and Acting in Language Models.”](https://arxiv.org/abs/2210.03629) *International Conference on Learning Representations*, 2023.
22. Schick, Timo, et al. [“Toolformer: Language Models Can Teach Themselves to Use Tools.”](https://arxiv.org/abs/2302.04761) *Advances in Neural Information Processing Systems* 36 (2023).
23. Australian Securities and Investments Commission. [“RG 185: Non-cash payment facilities.”](https://www.asic.gov.au/regulatory-resources/find-a-document/regulatory-guides/rg-185-non-cash-payment-facilities)
24. Amazon Web Services. [“AWS Marketplace: Buyer FAQ.”](https://aws.amazon.com/marketplace/resources/faqs) Accessed September 2026.
25. Maes, Pattie, Robert H. Guttman, and Alexandros G. Moukas. [“Agents That Buy and Sell: Transforming Commerce as We Know It.”](https://agents.media.mit.edu/publications.html) *Communications of the ACM* 42, no. 3 (1999): 81-91.
26. Google Agentic Commerce. [“Agent Payments Protocol v0.2 specification.”](https://github.com/google-agentic-commerce/AP2/blob/main/docs/ap2/specification.md) Accessed September 2026.
27. United Nations Commission on International Trade Law. [“UNCITRAL Model Law on Electronic Commerce.”](https://uncitral.un.org/en/texts/ecommerce/modellaw/electronic_commerce) 1996.
