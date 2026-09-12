# Agentic Economy

## Commercial closure for just-in-time service procurement

### Australia as a worked institutional case

**Position paper, September 2026**

### Abstract

Software agents are gaining the ability to discover, select, pay for and use outside services after a task has begun. This changes more than the speed of software procurement. It changes when the provider becomes known. A business can delegate work before either the business or its software developer knows which outside contribution the work will require.

Machine-payment protocols make this sequence technically possible. They can quote a price, authorise a transfer and return settlement evidence inside an HTTP request. They do not, by themselves, complete the resulting business purchase. Settlement does not establish the legal buyer and seller, the statutory authority under which the software acted, the treatment of personal data across borders, the capital gains or sales tax position, the state of delivery, the legal remedy for failure, or the audit record on which a company's financial accounts can rely.

This paper calls the terminal, explainable state **commercial closure**. It argues that just-in-time service procurement requires a market institution that functions as a commercial and legal transformer: preserving open runtime provider selection above while presenting one accountable, closed-loop **Principal Reseller (Merchant of Record)** to the buyer. Its market unit is the **Operation**: one versioned, callable contribution with fixed inputs, price, terms, data destination, effects and evidence.

Australia supplies the worked jurisdictional case. Without an institutional intermediary, autonomous machine spending across crypto rails triggers fatal tax and corporate friction: s104-10 capital gains tax (CGT Event A1) on every machine call, Division 775 foreign currency realisation, and Australian Financial Services Licensing (AFSL) exposure for multi-party pooled balances under s763D. 

Agentic Economy resolves this through a specific institutional design: a closed-loop Merchant of Record exempt from financial services licensing under Corporations Regulations reg 7.1.07A, an Electronic Distribution Platform operator under ATO ruling LCR 2018/2, and an accountable seller whose statutory liability is bounded under s64A of the Australian Consumer Law. Its purpose is not to replace payment protocols, agent runtimes or accounting systems. It is to make an outside service chosen by software recognisable as an authorised, taxable and remediable business purchase.

## 1. Introduction

The internet is acquiring a native payment path for software. An HTTP request can encounter a price, produce a signed payment, obtain settlement confirmation and continue without a checkout page or a human buyer. x402 expressly supports an agent purchasing a paid resource during a task. Nevermined adds service catalogues, plans, credits, delegated spending, fiat and stablecoin rails, and records around that flow [1, 2].

These systems solve a real problem. They remove account creation, interactive checkout and much of the mechanical cost from small machine purchases. Their arrival exposes a second problem that is easy to mistake for payment reconciliation.

A business purchase is not merely a transfer of value. It is a claim about standing, authority and statutory responsibility. It says that a legal principal authorised an actor to acquire a defined supply from a recognised seller on accepted terms; that some result or effect followed; that failure has a legally enforceable treatment; and that the event can be explained later to finance, audit, tax, risk and the parties themselves. Payment is evidence within that claim. It is not the claim in full.

This distinction becomes urgent when software selects the provider during execution. Enterprise software has long used dynamic infrastructure, exchanges and routing systems. The novelty is the combination of five conditions:

1. the software is pursuing an objective rather than following a fully specified transaction path;
2. it discovers a missing contribution only after the task has begun;
3. it can compare providers that neither the buyer nor the developer selected in advance;
4. it can commit funds, disclose information or cause an outside effect without a new human procurement cycle; and
5. the business remains legally and financially responsible for the resulting purchase.

Call this **just-in-time service procurement**. The upstream provider and exact supply are selected after the need appears, then bound before the service is invoked. Under principal resale, the buyer-facing seller is already known. Just-in-time procurement allows software to reach beyond its installed capabilities while preserving one commercial counterparty. It also reverses the ordinary sequence in which provider approval, contract formation and purchasing authority precede consumption.

The question of this paper is therefore institutional:

> What commercial form allows a business to delegate the selection of an unknown outside service without delegating away its responsibility for the purchase?

The answer developed here has four parts:
1. The service must be represented as a bounded, callable unit (the **Operation**) rather than an amorphous agent identity or endpoint.
2. Authority must be granted as a policy mandate before the need is known and resolved into an exact, immutable **commitment** before invocation.
3. The payment, service, delivery, tax attribution and remedy records must close into one coherent commercial event (**commercial closure**).
4. The platform must step into the transaction as a **closed-loop Principal Reseller (Merchant of Record)**, absorbing upstream settlement complexity and presenting one domestic sale to the buyer.

This produces a market that is open at the point of allocation and singular at the buyer's commercial boundary. Agentic Economy is the proposed name and implementation for that market institution.

### 1.1 Relation to prior work

The argument joins fields that usually stop at different boundaries. Research on tool-using agents explains how software can choose and invoke outside capabilities [21, 22]. Machine-payment protocols explain how a request can carry price and settlement. Transaction-cost and incomplete-contract theories explain why firms choose particular boundaries for exchange [4, 5, 16]. Work on intermediaries and two-sided markets explains how a common institution can coordinate dispersed buyers and providers [8, 17, 18]. Australian corporate and tax law determines how one jurisdiction attributes and records the resulting event [9-15, 23].

None of these fields alone asks how an outside service, selected by software after delegated work has begun, becomes one recognisable business purchase. That is the paper's claimed contribution. It defines the missing completed state, identifies the Operation and commitment needed to reach it, and derives a market form that can provide it.

The paper also makes an institutional inversion. Bitcoin showed how cryptographic proof could remove a trusted financial institution from electronic value transfer [20]. This proposal adds an accountable institution around the underlying purchase. The positions are compatible because settlement and commercial responsibility answer different questions. One concerns whether value moved. The other concerns what the principal authorised, received, accounted for and can remedy.

The method follows Berners-Lee's treatment of CERN as a model in miniature: start with a bounded setting in which a general structural problem is already visible, specify the missing relationships, and connect existing systems rather than replace them [19]. Australia serves that role here.

Current protocols move closer to the authority problem. AP2 defines signed Checkout and Payment Mandates and receipts that bind an agent's authority to a checkout and payment [26]. Its specification leaves catalogue, checkout update and other commerce APIs outside scope. x402 and Nevermined carry price, access and settlement. Smart contracts can execute encoded conditions. These systems can contribute authoritative evidence to commercial closure; none accepts the buyer-facing sale or joins it to upstream provider performance, statutory tax attribution and local statutory remedy.

The contribution claimed here is narrower than autonomous commerce and broader than settlement finality. It is a transaction model that binds runtime capability resolution, delegated authority, a versioned service commitment, invocation, buyer consideration, upstream settlement, attributed delivery and statutory remedy for a provider the principal did not select before work began.

## 2. The transaction that appears during work

### 2.1 Just-in-time selection

Let a principal's task begin at time \(t_0\). At \(t_g\), its agent encounters a capability gap \(g\): a bounded contribution that its installed capabilities cannot provide. The agent observes a set of candidate services \(\mathcal{O}(g)\), selects one at \(t_s\), commits at \(t_c\), and invokes it at \(t_i\):

\[
t_0 < t_g \leq t_s \leq t_c < t_i
\]

In a conventional integration, the commercial relationship with the provider is established before \(t_0\). In just-in-time procurement, the information needed to choose that provider does not exist until after \(t_g\). It may depend on the exact record the agent has found, a jurisdiction that becomes relevant, a failed prior attempt, current capacity, current price or the need for a particular form of evidence.

This does not imply that every capability should move into an open market. A predictable, frequent and strategically important service will usually justify a direct contract and permanent integration. The market for just-in-time procurement serves the other part of demand: contributions that are specialised, regional, temporary, newly available, contingent on runtime state or too infrequent to integrate in advance.

The economic territory is clearest when the value of the outside contribution exceeds its purchase price but does not justify the fixed human cost of approving a new provider. A three-dollar verification may be valuable to the task and still be impossible to buy through a conventional vendor process. Lowering the price to three cents does not remove this problem. It makes the fixed cost more dominant.

### 2.2 The unit of exchange: the Operation

A service market needs an object precise enough to compare, authorise, buy and remedy. A provider identity is too broad. An endpoint describes a technical network location but not a commercial promise. An agent identity may contain many disparate capabilities and may change its behaviour without changing its identifier.

This paper defines the **Operation** as the unit of exchange.

| Term | Definition |
| --- | --- |
| Principal | The person or legal entity that owns the objective, delegates authority, bears the economic result and appears in the business record. |
| Agent | A software process that selects or invokes Operations under authority granted by a principal. The agent is a technical actor, not a separate legal person. |
| Capability gap | A bounded contribution that the agent cannot obtain from its installed capabilities. |
| Provider | The upstream party that performs an Operation and owes its performance obligations to the seller. |
| Seller | The party that contracts with the principal, makes the buyer-facing sale and owes the stated delivery condition and remedy. In this model, Agentic Economy is the fixed seller. |
| Operation | One versioned, callable contribution from one provider, specifying its required inputs, price, material terms, data handling, possible effects, proof class, readiness and available evidence. |
| Commitment | An expiring, cryptographically signed record that binds a principal's authority to one exact Operation revision, price ceiling and invocation context before money, data or external effect is released. |
| Invocation | One accepted attempt to execute an Operation under one commitment. |
| Commercial closure | A terminal state in which the parties, authority, Operation, attributed tax position, delivery outcome, remedy, payment and accounting references agree sufficiently for the principal to defend the purchase under corporate and tax law. |

The Operation does not promise the success of the principal's larger task. A court-record lookup promises a search of a named register under stated inputs and return conditions. It does not promise that the principal will win a litigation. A land-title search promises the retrieval of a registered folio from a state registry; it does not promise the property is a sound investment. 

This boundary is essential. The market can accept responsibility for the purchased contribution without becoming the insurer of every unbounded objective pursued by software that uses it.

### 2.3 Delegation before selection: mandates and commitments

The principal cannot approve the exact provider at \(t_0\) because the relevant state is not yet known. It can, however, define a **mandate** over the class of purchases the agent may later make. The mandate specifies:
- Maximum price per invocation and aggregate session budget;
- Permitted service categories and proof classes;
- Prohibited jurisdictions and data export boundaries (e.g., APP 8 compliance);
- Required evidence standards (e.g., cryptographic proof of origin);
- Permitted side effects (read-only queries vs. external state mutations).

At \(t_c\), the market resolves that prior mandate into one exact, immutable **commitment**. If the provider, price, terms, data treatment, effects or Operation revision changes before invocation, the commitment fails validation and execution is halted.

Grossman and Hart's account of incomplete contracts explains why this sequence is optimal [16]. The principal cannot specify every future service choice when work begins because the relevant need and candidate supply are unknown. The answer is not an impossible, infinitely detailed initial contract, nor is it an unconstrained wallet that surrenders control. It is a bounded allocation of authority followed by an exact, verifiable contract when runtime information appears.

## 3. Settlement is not commercial closure

### 3.1 What machine-payment protocols establish

x402 turns an HTTP endpoint into a paid resource. The seller returns payment requirements via a 402 status; the client constructs a payment payload; a facilitator verifies and settles it on-chain; the client receives access [1]. Nevermined extends this with registered services, delegated card and stablecoin spending, and access validation [2].

Their proper role is seen by defining a generic payment record \(P\):

\[
P = (payer, payee, amount, asset, timestamp, request\_id, settlement\_status)
\]

These additions improve settlement efficiency. They do not make payment settlement identical to completion of the underlying sale. Nevermined's published terms illustrate the distinction: they describe software that prepares or facilitates transactions, disclaim an intermediary or custodial role, and leave all legal, tax, and commercial responsibilities with the users [3]. That is a coherent boundary for global, non-custodial software infrastructure. It is also an institutional void for a commercial enterprise.

Principal resale creates two distinct financial legs:
1. The buyer-facing consideration record \(P_B\) states what the principal owes, has reserved, or has paid to the seller (Agentic Economy), or is due to receive back as an adjustment.
2. The upstream record \(P_U\) states what the seller owes, has paid to the provider, or is entitled to recover under non-performance.

Collapsing these two legs into one direct transfer between buyer and provider destroys the intermediary's ability to provide domestic invoicing, tax attribution and statutory warranty.

### 3.2 The closed commercial record

Commercial closure is the terminal state required to explain a purchase to auditors, corporate regulators and tax authorities. Let \(C\) be the linked record:

\[
\begin{aligned}
C =\ &(P_B, P_U) \\
&+ \text{legal principal, domestic seller of record, and upstream provider} \\
&+ \text{delegated authority version, mandate reference, and acting agent identity} \\
&+ \text{exact Operation revision, proof class, and accepted terms} \\
&+ \text{local currency price, GST attribution, and electronic invoice identifier} \\
&+ \text{cross-border data disclosures and recorded external effects} \\
&+ \text{delivery state, execution evidence, and applicable statutory remedy} \\
&+ \text{statutory record retention and general ledger reference}.
\end{aligned}
\]

A card charge or an on-chain transaction hash proves only that consideration moved. Neither proves what bounded service was authorised, whether the data conformed to the contract, whose personal information crossed a border, why a retry incurred a duplicate charge, or which party owes a refund if the payload is corrupted.

Closure does not require successful delivery: *Delivered*, *Failed*, *Refunded*, and *Adjusted* are each valid, terminal, explainable states. An invocation whose external effect remains unconfirmed is *Uncertain* and remains open.

**Claim 1: Settlement and commercial closure are independent states.** Either payment leg can settle while the business purchase remains open, and the purchase can close while a payment leg remains payable. Closure requires standing, authority, exact supply, consideration state, delivery outcome, tax attribution and the applicable legal remedy.

## 4. The economics of provider uncertainty and admission

### 4.1 The relationship-cost threshold

Coase established that using an open market entails transaction costs: discovering prices, negotiating terms, and inspecting performance [4]. Williamson showed that governance structures exist to protect against opportunism and contractual failure [5].

Consider one outside provider and \(n\) eligible buyers during a period. Let \(q\) be the probability that a buyer needs that provider. A direct relationship costs each buyer \(F\) in human procurement, vendor vetting, and billing setup. The expected cost of direct bilateral procurement across the market is:

\[
E[C_D] = nqF
\]

Now let a commercial gateway admit that provider once at cost \(A\). For each realised transaction, let \(m\) be the gateway margin, \(r\) the expected remedy and performance-risk cost absorbed by the gateway, and \(h\) the allocated cost of the buyer's single relationship with the gateway. The expected mediated cost is:

\[
E[C_G] = A[1-(1-q)^n] + nq(m+r+h)
\]

Intermediation has a structural economic advantage when:

\[
nq(F - m - r - h) > A[1 - (1 - q)^n]
\]

As the monetary price of an invocation falls toward cents, \(F\) (the human cost of approving a counterparty) dominates the economic decision. Direct procurement makes micro-capabilities unbuyable. A gateway unlocks them by amortising admission \(A\) across \(n\) buyers.

### 4.2 Controlling remedy exposure: proof classes and provider bonds

The central vulnerability of the gateway is \(r\): the risk of provider non-performance. If the gateway acts as Principal Reseller, an influx of low-quality or malicious providers will cause \(r\) to exceed the admission savings, collapsing the exchange.

Agentic Economy resolves this through **Proof Classes** and **Algorithmic Provider Bonding**:

1. **Class 1 (Deterministic / Verifiable Operations):** The Operation provides a mathematically or cryptographically verifiable output (e.g., hash-checked registry records, signed receipts, deterministic code execution). Delivery failure is binary and immediately detectable. The remedy is an automated, instant credit refund. The gateway's risk exposure \(r\) is zero.
2. **Class 2 (Heuristic / Community Operations):** The Operation involves unverified third-party code or generative computation. To list an Operation in Class 2, the provider must post a **micro-bond** (in stablecoin escrow or via rolling settlement reserves held by the gateway). If an invocation fails the contract schema or times out, the remedy is deducted directly from the provider's bond.

By matching admission standards to verifiable proof classes, the gateway scales supply without taking unhedged balance-sheet exposure.

**Claim 2: Just-in-time selection creates a relationship-cost threshold.** When the provider is selected during work and the fixed cost of direct onboarding exceeds the value created by a bounded contribution, otherwise useful exchanges do not occur. A gateway moves that threshold only when amortised admission savings exceed its margin, governance, and bonded remedy costs.

## 5. Institutional forms: why the Merchant of Record wins

Several commercial structures could attempt to close the purchase. They must be evaluated against the operational requirements:

| Arrangement | Choice during execution | Single buyer relationship | Authority before spend | Seller of record & remedy | Closed purchase record |
| --- | :---: | :---: | :---: | :---: | :---: |
| Direct provider onboarding | Delayed | No | Yes | Provider | Yes |
| Fixed approved catalogue | Limited to prior set | Yes | Yes | Catalogue owner | Yes |
| Neutral payment router (pure x402) | Broad | No (wallet per counterparty) | No | None | No |
| Disclosed agency (Broker) | Broad | Agency only | Yes | Provider | Fragmented across providers |
| Retrospective accounting sync | Broad | No | No | None | Partial and late |
| Accountable Commercial Gateway (aecon MoR) | **Broad within admitted supply** | **Yes (One ABN)** | **Yes (Mandate + Commitment)** | **aecon (Bounded s64A)** | **Yes (s286 Subledger)** |

A neutral router preserves open choice but leaves statutory liability, tax reporting, and remedy distributed across anonymous web addresses. A disclosed agent or broker introduces thousands of foreign counterparties onto the buyer's books.

The **closed-loop Principal Reseller (Merchant of Record)** is the only form that completely reconciles open machine choice with corporate accounting:
- Upstream, the gateway operates a competitive, multi-sided market for capability discovery and allocation.
- Downstream, the gateway sells the completed Operation to the buyer as principal.

Hagiu and Wright distinguish a marketplace (where suppliers sell directly to buyers) from a reseller (which buys upstream and sells downstream) [8]. Agentic Economy unifies both at different boundaries: it is a marketplace for discovery and an MoR for the commercial sale.

**Claim 3: Open choice and commercial responsibility are compatible at different layers.** When a buyer values one counterparty, a single tax invoice, and an enforceable local remedy more than bilateral provider contracts, an agent can choose among competing providers while its principal transacts through one accountable Merchant of Record.

## 6. The architecture of Agentic Economy

Agentic Economy is not a general agent framework, a model orchestrator, a payment protocol, or an ERP. It is the commercial boundary and transactional clearinghouse for external capability procurement.

Its execution pipeline enforces structural separation:

```text
Capability Gap -> Resolution -> Commitment -> Controlled Invocation -> Result Verification -> Commercial Closure
```

### 6.1 Separation of funding, authority and purchase

Traditional payment gateways equate available balance with purchasing authority. In enterprise systems, this causes immediate failure: an agent given access to a funding source can drain it without restriction.

Agentic Economy enforces a strict state invariant:

\[
\text{funded balance} \neq \text{permission to buy} \neq \text{closed purchase}
\]

1. **Funding:** The buyer establishes an account with aecon in domestic fiat (AUD). This funds available credits or establishes a post-paid metered billing line. No money has moved to any provider; no purchase has occurred.
2. **Authority (Mandate):** The principal grants an immutable, signed policy setting the boundaries within which its agent may seek external capabilities.
3. **Reservation:** At runtime commitment, the platform reserves the exact agreed fee against the buyer's balance.
4. **Closure:** Upon verified delivery, the reservation converts into a recognized domestic sale, an itemized subledger entry is recorded, and an upstream payable to the provider is recognized for settlement.

### 6.2 The commitment as the constitutional event

Search is speculative and exploratory; invocation is irreversible. An invocation may reveal confidential client context, spend corporate funds, or trigger real-world actions.

The commitment is therefore the market's constitutional moment. It converts probabilistic model exploration into an immutable, attributable legal act. It captures the principal, authority version, acting agent, selected Operation hash, domestic price ceiling, data processing destination, proof class, retry rules, and expiry timestamp. 

Adjacent systems cannot supply this record:
- The payment rail sees only a transfer hash;
- The upstream provider sees only an isolated API call without the buyer's overarching mandate;
- The model harness sees prompt tokens but cannot issue a statutory tax invoice.

Agentic Economy is the sole entity situated to bind these layers.

## 7. Australia as a worked institutional case

Australia is not merely an illustrative testbed. It is an economy where the clash between advanced individual AI adoption and rigid corporate tax and regulatory law is most acute.

### 7.1 The tax and regulatory barrier to direct machine commerce

If an Australian enterprise attempts to let its agents procure tools directly via native x402 and crypto wallets, it encounters three fatal legal barriers:

1. **Capital Gains Tax (CGT Event A1) on Micro-Transactions:**
   Under s104-10 of the *Income Tax Assessment Act 1997* (ITAA 1997), digital assets such as USDC are CGT assets. Every machine disposal of USDC to pay for a query is a CGT Event A1. The taxpayer must calculate the capital gain or loss by comparing the AUD market value of the stablecoin at the instant of disposal against its cost base. For an enterprise running 20,000 automated research lookups a day, direct stablecoin expenditure creates an impossible compliance burden.

2. **Foreign Currency and Disclosure Rules:**
   Under Division 775 of the ITAA 1997, holding USD-denominated stablecoins requires tracking foreign exchange realisation events. Furthermore, the Australian company tax return mandates disclosure of whether the business "held or dealt in digital assets during the income year." Ticking this box increases regulatory inspection risk for non-crypto enterprises.

3. **Non-Cash Payment (NCP) Licensing:**
   Under s763D of the *Corporations Act 2001*, a facility through which a person makes payments to third parties is a Non-Cash Payment facility, requiring an Australian Financial Services Licence (AFSL). An agent marketplace that allows Australian buyers to deposit funds into pooled multi-party wallets to pay arbitrary developers requires an AFSL, bringing significant capital adequacy, compliance, and auditing overhead [23].

### 7.2 The Agentic Economy institutional response

Agentic Economy operates as an institutional shield that neutralizes each of these barriers for the buyer:

1. **The Closed-Loop MoR Exemption (Corporations Regs reg 7.1.07A):**
   Under Corporations Regulations 2001 reg 7.1.07A and ASIC Class Order CO 05/738, a facility is exempt from being an NCP facility if the funds can only be used to acquire goods or services **directly from the issuer**. Because aecon acts as the Principal Reseller, the buyer's account balance is closed-loop. aecon requires no AFSL to launch its core purchasing exchange.

2. **Electronic Distribution Platform (EDP) GST Statutory Supplier (LCR 2018/2):**
   Under Australian GST law and ATO ruling LCR 2018/2, an entity that operates an Electronic Distribution Platform, authorises the customer charge, and sets the terms of supply is treated as the statutory supplier for GST purposes [12]. aecon assumes this status deliberately. The buyer receives an Australian Tax Invoice showing aecon's ABN and 10% GST, claimable immediately as an input tax credit on the firm's Business Activity Statement (BAS).

3. **Statutory Record Keeping (Corporations Act s286):**
   Section 286 of the *Corporations Act 2001* requires companies to maintain financial records that correctly record and explain their transactions and financial position for seven years [9]. aecon provides an authoritative, exportable subledger that maps every individual machine call to its commitment hash, acting agent, business purpose, and resulting invoice.

4. **Australian Consumer Law Liability Capping (ACL s64A):**
   Under the ACL (Competition and Consumer Act 2010, Schedule 2), mandatory statutory guarantees of acceptable quality and due skill apply to B2B acquisitions under $100,000. Under s64A, liability for supplies not of a kind ordinarily acquired for personal use can be legally limited to resupplying the service or refunding the price paid. aecon's customer contract explicitly caps liability under s64A to credit reimbursement of the failed Operation, insulating the exchange from open-ended consequential damages arising from external provider data.

5. **Cross-Border Privacy Protection (APP 8):**
   Australian Privacy Principle 8 mandates that an entity disclosing personal information to an overseas recipient must take reasonable steps to ensure the recipient does not breach the APPs [13]. Through machine-readable mandates, an Australian principal can enforce geographic constraints at runtime, forbidding agents from sending inputs to operations hosted in non-compliant jurisdictions.

### 7.3 A worked transaction

Consider a mid-tier Australian engineering consultancy (50 staff) preparing a renewable energy grid-connection tender:

1. **Setup:** The consultancy establishes a post-paid metered account with aecon Pty Ltd under its corporate ABN. The Managing Director configures a spending mandate: maximum A$15 per query, Class 1 or bonded Class 2 operations only, data retention strictly within Australia, and mandatory source provenance.
2. **Need:** During a complex simulation, an engineering agent encounters a missing telemetry dataset for local substation feeder capacities.
3. **Resolution:** aecon returns two candidates: an unverified overseas provider ($0.20) and a registered Australian data service with cryptographic source signing ($1.80). The agent's mandate filter discards the first due to jurisdictional data export rules and selects the second.
4. **Commitment:** aecon creates an expiring commitment freezing the consultancy's identity, the provider revision, the A$1.80 price, the Australian data destination, and the cryptographic receipt requirement.
5. **Invocation & Upstream Settlement:** aecon invokes the provider. Upstream, aecon settles the provider's wholesale fee via an automated x402 USDC micropayment from aecon's corporate balance sheet. The provider returns the telemetry and a signed data receipt.
6. **Commercial Closure:** aecon records delivery, validates the receipt against the commitment, and registers an A$1.80 charge on the consultancy's account.
7. **Reconciliation:** At month's end, the consultancy receives one Australian Tax Invoice for all agent activity (A$342.10 + A$34.21 GST). The finance team enters one ABN payment into Xero, claims the full GST credit on the quarterly BAS, and logs the s286-compliant subledger in company archives.

The engineering consultancy never touched a crypto wallet, never calculated a capital gain on a three-cent transfer, never maintained an unvetted vendor account, and never violated APP 8. The transaction was ordinary commerce.

**Claim 4: The market may be global while commercial closure remains domestic.** Operations, models and settlement protocols cross borders seamlessly. The commercial boundary must federate by jurisdiction, anchoring transactions in domestic corporate law, local tax regimes, and domestic consumer protections.

## 8. Market structure and compounding advantage

The enduring moat in machine-to-machine commerce does not belong to the payment rail, nor does it belong to generic service directories:
- Payment protocols are commodities that compete transaction fees toward zero.
- Tool directories are public indices easily replicated by open-source crawlers.

The defensible position belongs to the entity that sits across the complete allocation and execution lifecycle:

\[
\text{need} \rightarrow \text{resolution} \rightarrow \text{mandate check} \rightarrow \text{commitment} \rightarrow \text{invocation} \rightarrow \text{verification} \rightarrow \text{closure} \rightarrow \text{remedy}
\]

This sequence generates an asset that cannot be scraped or faked: **empirical execution provenance**. 

Accumulated across millions of closed purchases, the gateway observes:
- Which Operations consistently satisfy real tasks without triggering remedy claims;
- Actual latency, variance, and schema stability under live production conditions;
- Real provider performance across specific proof classes.

This creates a powerful institutional flywheel:
1. More closed purchases yield richer execution and delivery evidence;
2. Better evidence enables buyers to safely delegate broader mandates to software;
3. Broader buyer demand attracts top-tier providers willing to accept performance bonds and standardized contracts;
4. Higher-quality supply drives increased institutional adoption.

A competitor can copy an API schema or clone an invoice template. It cannot reconstruct the historical performance record of a hundred thousand machine purchases it was not present to clear.

**Claim 5: Compounding market advantage is driven by allocation evidence, not payment volume.** Value accrues to the institution that binds runtime tool selection to verified delivery, statutory compliance, and historical counterparty performance.

## 9. Predictions and limits

This framework yields specific, testable predictions:

1. **Payment rails will become invisible commodities.** x402, AP2, and stablecoin networks will standardize as low-level settlement pipes. Value will consolidate in the commercial layer that governs authority, identity, tax attribution, and remedy.
2. **Tool marketing will shift from agent identities to bounded Operations.** Providers will compete on machine-readable contracts: input schemas, execution latencies, cryptographic proof classes, and bonded failure guarantees.
3. **Corporate spend management will become policy-driven and programmatic.** Static vendor whitelists will be replaced by cryptographic purchase mandates enforced at runtime.
4. **Tax authorities will enforce platform-operator rules on agent spend.** Tax offices will not audit millions of anonymous machine micropayments; they will hold domestic platforms accountable under electronic distribution platform regimes.

### Boundaries of the model

The model presented here is deliberately scoped. It addresses **business-to-business, digitally requested, deterministic or bounded computational services** bought by authorized software actors. 

It explicitly excludes:
- Consumer retail purchases;
- Physical logistics and physical asset transfers;
- Regulated personal financial advice or legal counsel requiring non-delegable fiduciary standing;
- Highly bespoke enterprise contracts requiring bilateral negotiation.

## 10. Conclusion

Software agents are beginning to choose who performs critical business work while that work is underway. Payment protocols allow them to transfer value in milliseconds. But payment alone cannot complete a business transaction.

Without an accountable institution, just-in-time procurement is trapped between two unworkable extremes: the administrative paralysis of bilateral vendor onboarding, and the legal and tax chaos of unvetted, permissionless machine wallets.

The missing state is **commercial closure**: the binding of a legal principal, delegated authority, an exact Operation, a domestic Seller of Record, an attributed tax position, verified delivery, and an enforceable remedy into one defensible record.

Agentic Economy is the commercial gateway that provides closure. By operating an open market for capability discovery upstream and acting as a closed-loop Merchant of Record downstream, it bridges the gap between autonomous software and the real economy.

The payment rails provide the wire. Agentic Economy builds the market.

---

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
