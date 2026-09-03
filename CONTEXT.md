# Agentic Economy

A cross-harness Operation market: agents procure one bounded outside contribution just in time, then continue in their own harness.

## Language

### Market roles

**Business Principal**:
The person or legal entity that owns the objective, grants authority, and bears the economic result of an agent's purchase.
_Avoid_: principal when the technical actor is meant, payer, wallet holder

**Account**:
The durable owner boundary in Agentic Economy to which Agent Principals, delegated authority, a shared Prepaid balance, budgets, and economic records belong. An Account is resolved from authenticated authority rather than selected by an Agent Principal during a Call.
_Avoid_: user, wallet, credential, organization

**Mandate**:
The versioned policy through which a Business Principal grants an Agent Principal bounded purchase authority for an Account. Its per-Call and aggregate limits belong to the Agent Principal and remain in force when credentials rotate.
_Avoid_: wallet limit, permission, approval, balance

**Agent Principal**:
The durable technical identity of an agent acting under authority from a Business Principal through an Account; credentials and harnesses may change without changing this identity.
_Avoid_: user, credential, wallet, Business Principal

**Provider**:
The upstream party that offers and performs an Operation and owes its bounded performance obligation to the Seller.
_Avoid_: supplier, merchant, endpoint

**Seller**:
The party that contracts with the Business Principal and owes the buyer-facing delivery condition and remedy; under the principal-reseller model, Agentic Economy is the Seller.
_Avoid_: Provider, payment recipient, platform

**Payment recipient**:
The party that receives one settlement movement; it may be the Seller, the Seller's payment agent, or the Provider depending on the financial leg and rail.
_Avoid_: Seller, Provider, payee when the commercial role matters

### Market decision

**Capability gap**:
The bounded outside contribution an agent needs because its installed model, context, tools, data, permissions, or physical reach cannot complete the next step.
_Avoid_: task, project, workflow, generic need

**Just-in-time service procurement**:
Selection and purchase of an outside Operation after a Capability gap appears during work, with the exact Provider and terms bound before Invocation.
_Avoid_: late-bound service procurement, dynamic procurement, runtime shopping

**Operation**:
The exact callable contribution one Provider offers: versioned input contract, price, terms, access, data use, effects, readiness, and evidence.
_Avoid_: listing, capability, service, product

**Market intent**:
The bounded missing contribution and hard constraints presented to the market without transferring ownership of the caller's project.
_Avoid_: task, tender, prompt, project brief

**Resolution**:
The attributable set of considered, viable, and excluded Operation revisions for one Market intent.
_Avoid_: search result, recommendation list, ranking snapshot

**Commitment**:
The expiring decision that binds a Business Principal, acting Agent Principal, Mandate, exact Operation revision, Provider, Seller, inputs, buyer consideration ceiling, terms, data use, effects, evidence, and retry rule before Invocation.
_Avoid_: quote, reservation, approval, checkout

**Invocation**:
One accepted use of one Operation under one Commitment and delegated authority.
_Avoid_: request, job, run, execution

**Call**:
The customer-facing projection of one Invocation, including its Operation, Provider, timing, usage, price, observed delivery/recovery state, payment state, and evidence. `Invocation` remains the stable lifecycle identity; `Call` is the familiar product language used in Logs, Usage, Spend, invoices, and support, not a second mutable record.
_Avoid_: acquisition record, purchase record, finance-ready purchase, receipt, payment

**Outcome evidence**:
AE-observed or, in a later explicitly justified contract, buyer-reported facts about use, completion, recovery, repeat purchase, and switching, with their provenance kept distinct. Package 4 records automatically observed delivery, payment, latency and recovery; it does not collect buyer-reported use.
_Avoid_: success score, review, telemetry, result

**Continuation**:
The single machine-executable next action permitted by a non-terminal state, bound to durable arguments and retry safety. A response may additionally carry one owner handoff when the Business Principal must act. It does not repeat the action manifest or offer Invocation after possible dispatch.
_Avoid_: suggestions, workflow, action menu, retry button

**Commercial closure**:
The terminal, explainable state of an Operation purchase linking roles, authority, Commitment, consideration, delivery, remedy, and accounting evidence. Delivered, failed, refunded, and adjusted may be closed; uncertain remains open, and closure does not imply cash settlement or legal finality.
_Avoid_: payment settlement, successful delivery, accounting finality, completed call

### Economic record

**Funding**:
Value made available to an Account for later purchases; it is neither permission to spend nor consideration for a specific Operation.
_Avoid_: purchase, Mandate, revenue, Charge

**Prepaid balance**:
The AUD-denominated contractual value available to an Account for future Agentic Economy sales. It is not cash, a bank account, a token, a crypto wallet, or authority to spend.
_Avoid_: customer wallet, USDC balance, stored token, bank balance

**Available balance**:
The part of the Prepaid balance that can be reserved for a new Call.
_Avoid_: cash balance, spend authority

**Reserved balance**:
The part of the Prepaid balance atomically set aside for an accepted Commitment and unavailable to concurrent Calls until it is captured or released.
_Avoid_: payment, revenue, escrow, authorisation hold

**Top-up service fee**:
A separately disclosed fee charged when an Account adds prepaid credit. It is additional to the requested credit and never reduces the amount credited to the Prepaid balance.
_Avoid_: card surcharge, hidden spread, deducted fee

**AUD Call price**:
The expiring, all-in AUD amount locked before a paid Call. It covers the quoted Operation under the stated terms; the customer does not bear a later foreign-exchange adjustment for that Call.
_Avoid_: exchange estimate, USD balance, pass-through USDC amount

**Buyer consideration**:
The amount the Business Principal owes the Seller for the buyer-facing Operation sale.
_Avoid_: Provider obligation, Funding, payment movement

**Provider obligation**:
The amount Agentic Economy owes the Provider under the upstream arrangement for an Operation; it remains distinct from buyer consideration and from its eventual Payout.
_Avoid_: buyer Charge, Provider earnings balance, Payout

**Charge**:
The buyer-facing ledger event that bills the caller's Account for one Invocation.
_Avoid_: payment, invoice, debit

**Ledger transaction**:
One immutable business event recorded as balanced postings within a single currency or asset. Corrections use linked reversals and replacement transactions rather than mutation.
_Avoid_: mutable balance row, event log

**Posting**:
One debit or credit line within a Ledger transaction. A posting never converts or balances one currency against another.
_Avoid_: event, payment, mutable balance

**Ledger digest**:
A content-addressed seal computed from an ordered set of loaded Ledger transactions and Postings.
_Avoid_: inputDigest, preparedMaterialDigest, commandDigest

**Charge identity**:
Facts already on durable Invocation and control rows after claim: Operation ref, input digest, attempt, grant, and authority decision.
_Avoid_: reserved Operation JSON, cloned authority proof

**Charge liveness**:
Facts that must be true at Charge time: Operation still active, published price still matches, authority not expired, grant generation current, budget remaining, and Account compare-and-set succeeds.
_Avoid_: billing digest, leased billing digest

**Refund**:
The ledger reversal of a Charge.
_Avoid_: chargeback, clawback

**Payout**:
The transfer of accrued Provider earnings off the ledger.
_Avoid_: withdrawal, settlement when meaning a payout transfer

**Corporate USDC treasury**:
USDC owned and controlled by Agentic Economy for settling its upstream obligations. It is operational treasury, not customer property and not the backing unit of the Prepaid balance.
_Avoid_: customer wallet, customer USDC, custodial customer balance

### Supply and recovery

**Publication**:
The Provider act of admitting and sealing a callable Operation.
_Avoid_: listing, registry import

**Recovery**:
Caller-facing status, cancel, and reconcile of an Invocation.
_Avoid_: expire_authorization, sweep, expiry as Recovery modes

**Expiry sweep**:
Background x402 authorization expiry that observes the control plane and queues expiry; it is not a Recovery mode.
_Avoid_: recover mode, OperationInvokeRecoveryPort
