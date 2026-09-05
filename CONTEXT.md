# Agentic Economy

A familiar platform for Australian businesses to connect agents, use paid
services and manage spending through one account.

<a id="language"></a>

## Canonical product language

**Revised:** 2026-09-05

Mature and familiar comes before unique or differentiated at this stage. Follow
the Locus and Nevermined product patterns described in [PRODUCT.md](./PRODUCT.md).
Use ordinary language in product documents, the roadmap, navigation, onboarding,
help and agent instructions. Precise records do not require unusual vocabulary.

The terms below are the canonical product language, not optional UI aliases.
Older research and existing implementations retain their names through the
compatibility mapping. Do not create a second concept, record or lifecycle for
a renamed product term.

<a id="customer-language-and-internal-definitions"></a>

### Compatibility with current source and APIs

| Product term | Existing implementation or historical term | Meaning retained |
| --- | --- | --- |
| Customer | Business Principal | The person or legal entity buying and granting authority, not necessarily the signed-in administrator. |
| Agent | Agent Principal | Durable technical identity; replacing a credential does not replace the agent or reset its spending history. |
| Spending policy | Mandate | Versioned purchase permissions, permitted Tools and per-Call/aggregate limits; not the account balance or a one-off approval. |
| Tool | Callable Operation | One versioned, callable supply unit from a Provider, not the Provider's whole product, portfolio Service or an unverified directory entry. |
| Tool version | Operation revision | The identified revision of a Tool's contract and material terms. |
| Service request | Market intent | The outside contribution needed and its constraints, not the customer's larger task or a transport-level HTTP request. |
| Service comparison | Resolution | The considered Tool versions, exclusions and reasons, not an unexplained ranking. |
| Quote | Commitment | An expiring, customer-bound price and terms decision with spending checks, inputs, effects and retry rules; not merely a price estimate. |
| Call | Invocation | One accepted use of a Tool version and its stable identity, not a new execution record alongside Invocation. |
| Suggested next action | Continuation | The safe, supported action from the current state; not an invitation to retry a possibly dispatched purchase. |
| Outcome records | Outcome evidence | Attributed observations and any explicitly supported customer reports, not a universal quality score. |
| Purchase resolution | Commercial closure | The final explainable purchase outcome; not proof that payment, delivery and accounting finality are the same. |

During Phase 0, before the approved contract and storage cutover, current API
methods, payloads, enum values, events, database tables and source identifiers
still expose their existing compatibility names. The target contract will move
AE-owned names together; it will not add aliases or duplicate records. The
following is a current-not-yet-cut-over compatibility example: `operation.inspect`
returns the Quote under `commitmentRef`; `operation.invoke` accepts that
reference and an `idempotencyKey`; `invocationRef` identifies the Call. Use
these exact old names only when describing the current implementation, and use
the familiar target terms everywhere else.

Generic IAM `Principal`, `Account`, `Business`, `User`, `Credential` and
`DelegationGrant` remain distinct concepts; Customer and Agent are product roles,
not blanket replacements for every identity or business row. Offering,
Publication, Listing, Source and Provider connection records also remain
distinct. Portfolio Service records and APIs are not automatically callable
Tools. Provider, Seller and payment recipient remain separate, as do Charge,
Provider obligation, payable amount, Payout, delivery status and payment status.
Upstream OpenAPI `operationId`, MCP methods, OAuth standard fields and x402
payment fields, plus opaque identifier prefixes, canonical hash material,
signatures and external financial namespaces, retain their exact protocol or
evidence meaning.

An implementation rename must be a separately scoped change with affected
callers and stored data checked. Do not add speculative aliases, duplicate
endpoints or dual records. Until then, an old identifier is a compatibility
constraint, not a reason to reintroduce its vocabulary into ordinary prose.

<a id="market-roles"></a>

### Customers, agents and accounts

**Customer**:
The person or legal entity that owns the objective, grants permission and bears
the economic result of the purchase. A team member or administrator may act for
that customer; login identity does not by itself establish who is buying.

**Account**:
The durable customer boundary containing agents, spending policies, shared
prepaid credit, budgets and purchase records. A Call's account is resolved from
authentication; the calling agent cannot choose or override it in the request.
An account is not a wallet, credential or assumed organisation membership.

**Agent**:
The durable technical identity acting for a customer through an account.
Credentials and agent apps may change without changing that identity. An agent
is not a legal person and does not own the customer's funds.

**Spending policy**:
The versioned rules granting an agent permission to buy through the account,
including allowed Tools and hard per-Call and aggregate limits. Limits
survive credential rotation. A funded account does not grant spending
permission; one manual approval is not a reusable policy. Use "Spending
permissions" and "Spending limits" for the corresponding settings.

**Request authorization**:
An authorization bound to one specific customer request and its consequential
action. It does not grant standing permission for unrelated requests; existing
retry, expiry and recovery conditions for that request still apply. It may be
represented by a recorded Approval; unlike a Spending policy, it does not grant
reusable permissions or limits.

**Approval**:
A person's recorded authorization for one specific consequential request or
action, with the approving identity and evidence retained. An Approval is not a
Quote or a reusable Spending policy.

**Provider**:
The party offering and performing the service. For supported resale purchases,
it owes the upstream performance to AE. An endpoint alone does not establish
the Provider's identity.

**Seller**:
The party contracting with the customer and responsible for the stated delivery
condition and buyer remedy. AE is the Seller for supported principal-reseller
purchases; that does not make AE the party performing the upstream service.

**Payment recipient**:
The party receiving a particular payment. It may differ from both Provider and
Seller. Do not infer a commercial role from a wallet address or payment.

<a id="market-decision"></a>

### Finding and using services

**Service**:
A portfolio record or broader offering that a Provider manages. It may describe
multiple Tools or an offering around them, but it is not automatically a
callable Tool. Only admitted and published Tools are available to buy; importing
a directory entry does not make one executable.

**Tool**:
The exact, versioned callable supply unit with defined inputs, outputs, price,
terms, access, data use, external effects, readiness and evidence. An API or
other interface may expose a Tool. A Tool is not a portfolio Service, Offering,
Publication, Listing, Source or Provider connection.

**Tool version**:
The identified revision of a Tool's contract and material terms. It is the
version bound by a Quote and used by a Call.

An Offering, Publication, Listing and Source describe distinct catalogue or
admission facts, and a Provider connection describes the authorised upstream
access path. None is silently merged with a Tool or portfolio Service record.

**Service request**:
The outside contribution an agent needs and the constraints it must satisfy.
The agent's larger project, planning and memory remain outside AE. Finding and
buying a service when needed does not require a new customer-facing procurement
workflow.

**Service comparison**:
The exact Tool versions considered, which are viable or excluded, and why.
Keep the source of the facts and caller-specific restrictions visible.

**Quote**:
The expiring decision returned by inspection for one Customer's Agent, Account,
applicable authorization version, Tool version and normalised input. It binds
the Provider, Seller, exact or maximum all-in AUD price, terms, data use,
effects, evidence requirements and retry rule. A price estimate alone is not
this Quote. Execution rechecks the bound facts before reserving funds, signing
or releasing an external effect. The Quote is not a Call or a completed
purchase.

**SuppliedQuote**:
A qualified quote supplied by an upstream Provider or source for upstream
service terms. It remains distinct from the customer-facing Quote issued by AE;
it may be linked as evidence or input without becoming that Quote.

**Call**:
One accepted use of a Tool version under a Quote and the applicable supported
authorization path. That path is commonly a Spending policy, but a supported
request authorization/Approval may apply without making a standing policy a
universal prerequisite. The Call retains the existing execution identity and
links attempts, Provider observations, output, usage, Charge, delivery, payment
and recovery. Logs, Usage and Spend are views of the same Call, not independent
records that can disagree about its identity.

**Action execution**:
An administrative or runtime execution of an AE action. Its controls, attempts
and history remain distinct from a purchased Call and do not create a second
purchase record.

**Suggested next action**:
The single machine-executable next step permitted by a non-terminal response,
with durable arguments and retry safety. A response may also include one
customer handoff if a person must act. After possible dispatch, a Suggested next
action must not offer a fresh Call as a retry.

**Outcome records**:
AE observations and, only where explicitly supported later, customer reports
about delivery, payment, latency, use and recovery. Preserve their sources.
Package 4 records automatic observations; it does not collect customer-reported
use or convert delivery into a universal quality score.

**Purchase resolution**:
The final, explainable outcome joining the Tool, customer and agent,
permissions, quote, price, delivery and any remedy. Delivered, failed, adjusted
or refunded purchases can be resolved; uncertainty keeps the purchase open.
Resolution does not imply final cash settlement or the customer's accounting
judgement. Show "Purchase status" and the actual outcome rather than requiring
customers to learn the internal closure model.

### Interaction rules

- Use direct actions: connect, add credit, set spending limits, publish, pause,
  check status and contact support.
- Follow familiar reference behaviour for setup, normal use, changes, failure,
  recovery and offboarding. Do not expose internal records as additional setup.
- Calls within granted permissions do not require an extra human approval just
  to mirror an internal transition.
- Show delivery and payment separately whenever their states differ. Do not
  simplify an uncertain result into "complete".
- Keep the distinction between funding, permission, purchase, delivery and
  payment. Simplify the explanation, not the controls.

<a id="economic-record"></a>

### Economic and implementation reference

These precise financial and implementation terms remain available where the
subject requires them; they are not a vocabulary checklist for onboarding.

**Funding**:
Value made available to an Account for later purchases; it is neither permission to spend nor consideration for a specific Tool.
_Do not confuse with_: purchase, spending policy, revenue, Charge

**Prepaid balance**:
The AUD-denominated contractual value available to an Account for future Agentic Economy sales. It is not cash, a bank account, a token, a crypto wallet, or authority to spend.
_Do not confuse with_: customer wallet, USDC balance, stored token, bank balance

**Available balance**:
The part of the Prepaid balance that can be reserved for a new Call.
_Do not confuse with_: cash balance, spend authority

**Reserved balance**:
The part of the Prepaid balance atomically set aside for an accepted quote and unavailable to concurrent Calls until it is captured or released.
_Do not confuse with_: payment, revenue, escrow, authorisation hold

**Top-up service fee**:
A separately disclosed fee charged when an Account adds prepaid credit. It is additional to the requested credit and never reduces the amount credited to the Prepaid balance.
_Do not confuse with_: card surcharge, hidden spread, deducted fee

**AUD Call price**:
The expiring, all-in AUD amount locked before a paid Call. It covers the quoted service under the stated terms; the customer does not bear a later foreign-exchange adjustment for that Call.
_Do not confuse with_: exchange estimate, USD balance, pass-through USDC amount

**Buyer consideration**:
The amount the customer owes the Seller for the buyer-facing service sale.
_Do not confuse with_: Provider obligation, Funding, payment movement

**Provider obligation**:
The amount Agentic Economy owes the Provider under the upstream arrangement for a Tool; it remains distinct from buyer consideration and from its eventual Payout.
_Do not confuse with_: buyer Charge, Provider earnings balance, Payout

**Charge**:
The buyer-facing ledger event that bills the caller's Account for one Call.
_Do not confuse with_: payment, invoice, debit

**Ledger transaction**:
One immutable business event recorded as balanced postings within a single currency or asset. Corrections use linked reversals and replacement transactions rather than mutation.
_Do not confuse with_: mutable balance row, event log

**Posting**:
One debit or credit line within a Ledger transaction. A posting never converts or balances one currency against another.
_Do not confuse with_: event, payment, mutable balance

**Ledger digest**:
A content-addressed seal computed from an ordered set of loaded Ledger transactions and Postings.
_Do not confuse with_: inputDigest, preparedMaterialDigest, commandDigest

**Charge identity**:
Facts already on durable Call and control rows after claim: Tool ref, input digest, attempt, grant, and authority decision.
_Do not confuse with_: reserved Tool JSON, cloned authority proof

**Charge liveness**:
Facts that must be true at Charge time: Tool still active, published price still matches, authority not expired, grant generation current, budget remaining, and Account compare-and-set succeeds.
_Do not confuse with_: billing digest, leased billing digest

**Refund**:
The ledger reversal of a Charge.
_Do not confuse with_: chargeback, clawback

**Payout**:
The transfer of accrued Provider earnings off the ledger.
_Do not confuse with_: withdrawal, settlement when meaning a payout transfer

**Corporate USDC treasury**:
USDC owned and controlled by Agentic Economy for settling its upstream obligations. It is operational treasury, not customer property and not the backing unit of the Prepaid balance.
_Do not confuse with_: customer wallet, customer USDC, custodial customer balance

### Supply and recovery

**Publication**:
The Provider act of admitting and sealing a callable Tool version.
_Do not confuse with_: listing, registry import

**Recovery**:
Caller-facing status, cancel, and reconcile of a Call.
_Do not confuse with_: expire_authorization, sweep, expiry as Recovery modes

**Expiry sweep**:
Background x402 authorization expiry that observes the control plane and queues expiry; it is not a Recovery mode.
_Do not confuse with_: recover mode, `OperationInvokeRecoveryPort` (the current
pre-cutover source port), expiry as Recovery modes

### Design references

Reference entry points reviewed 2026-09-05:
[Locus developer experience](https://paywithlocus.com/developers) and
[Nevermined API introduction](https://nevermined.ai/docs/api-reference/introduction).
Use the repository's scavenger records for detailed evidence and limitations.
Published reference features are not claims of AE parity or live verification.
