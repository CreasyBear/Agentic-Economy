# Ubiquitous Language

Status: dated proposal retained for migration history; not an active authority.
Owner: Joel, with the vocabulary-rationalisation task.
Prepared: 2026-09-05.

Accepted current glossary: [CONTEXT.md](../CONTEXT.md). Selected implementation
mappings, cutover boundaries and proof: [Mature vocabulary refactor —
implementation plan](../docs/designs/vocabulary-rationalisation.md). This file
is retained as the dated discussion asset and must not be treated as a second
evolving glossary.

This proposal covers the familiar Australian platform described in
[PRODUCT.md](../PRODUCT.md), not a new product model. [CONTEXT.md](../CONTEXT.md)
owns the accepted definitions following the 2026-09-05 decision. Migration
scope, implementation mappings and proof belong in the
[work record](../docs/workflow/work/WF-20260905-vocabulary.md) and subsequent
Wayfinder decisions, not in the domain definitions.

"Aliases to avoid" means avoid these as interchangeable product terms; it does
not authorise global replacement of legal language, third-party protocol names,
existing records or historical evidence. The definitions describe the intended
domain, not a claim that every capability is live.

## People and accounts

| Term | Definition | Aliases to avoid |
| --- | --- | --- |
| **Customer** | The person or legal entity buying through AE and bearing the economic result. | Business Principal, payer, User, Account |
| **User** | A human sign-in identity that can act for an authorised Customer. | Customer, Account, Agent |
| **Account** | The customer-owned boundary containing agent access, spending policies, prepaid credit and purchase records. | User, wallet, tenant when addressing customers |
| **Agent** | The durable software identity authorised to act through an Account. | Agent Principal, API key, wallet |
| **Provider** | The party offering and performing a Tool. | Supplier as a competing AE product name, Seller |
| **Seller** | The party responsible to the Customer for the sale and its stated remedy. | Provider, payment recipient |
| **Payment recipient** | The party receiving a particular payment. | Seller or Provider inferred from a wallet address |

## Catalogue and Provider setup

| Term | Definition | Aliases to avoid |
| --- | --- | --- |
| **Tool** | One versioned, callable contribution from one Provider, with defined inputs, outputs, price, terms and effects. | Operation, capability, Service as the same precise unit |
| **Tool version** | An identified revision of a Tool's contract and material terms. | Generic version without its subject |
| **Source** | The upstream API, MCP server, plugin or x402 resource from which tool definitions are obtained. | Tool, listing, connection |
| **Provider connection** | The authorised connection through which AE accesses a Provider's supported upstream service. | Source, credential, agent login |
| **Listing** | The catalogue presentation of a Tool and its current availability. | Tool execution, imported directory entry assumed purchasable |
| **Publication** | The recorded approval and release of a particular Tool version for use through AE. | Listing, import, Call |

**Tool** is the working choice following Joel's "tool probably" on 2026-09-05,
not final glossary or migration approval. The previous documentation pass chose
**Service**. "Service" can remain ordinary explanatory prose about
what a Provider offers; this proposal does not create a separate Service parent
record. **Listing** and **Publication** describe different facts, not necessarily
new storage objects or one-to-one renames of existing tables.

## Access and spending

| Term | Definition | Aliases to avoid |
| --- | --- | --- |
| **Credential** | A replaceable means of authenticating access for an authorised identity. | Agent, spending policy, budget owner |
| **Spending policy** | The versioned purchase permissions and limits granted to an Agent through its Account. | Mandate, balance, one-off approval |
| **Spending limit** | A maximum permitted amount for the named purchase, time period or customer scope. | Available balance, generic allowance without a scope |
| **Approval** | A person's recorded authorisation for a specific consequential action. | Quote, reusable spending policy, payment |
| **Quote** | An expiring, customer-bound price and terms decision for exact Tool inputs, including permission checks and retry conditions. | Commitment, estimate, reservation, completed purchase |

## Calls and outcomes

| Term | Definition | Aliases to avoid |
| --- | --- | --- |
| **Call** | One accepted use of one Tool version under a Quote and Spending policy. | Invocation, HTTP request, payment, generic action execution |
| **Attempt** | One recorded execution attempt belonging to an existing Call. | New Call, new purchase |
| **Result** | The output returned for a Call. | Payment receipt, proof of the customer's larger task succeeding |
| **Delivery status** | The recorded state of the Provider's delivery for a Call. | Payment status, purchase status |
| **Payment status** | The recorded state of a specified payment movement. | Delivery status, purchase status |
| **Purchase status** | The combined state of a Call's purchase, including delivery, money and any outstanding remedy. | Commercial closure as a separate object, universal success flag |
| **Recovery** | The supported process for checking or resolving an interrupted, failed or uncertain Call. | Blind retry, another purchase |
| **Next action** | The safe supported action permitted by the current state. | Continuation in customer explanations, arbitrary retry |
| **Outcome records** | Attributed observations about delivery, usage and recovery, plus customer reports only where explicitly supported. | Universal quality score, payment proof treated as usefulness |

"Purchase" describes the commercial aspect of a Call, not a proposed second
Order or Purchase record. A final Purchase status replaces the product phrase
"commercial closure"; uncertainty must remain visible until resolved.

## Money and business records

| Term | Definition | Aliases to avoid |
| --- | --- | --- |
| **Top-up** | A payment to add prepaid credit to an Account. | Tool purchase, revenue from a Call, spending permission |
| **Prepaid balance** | The Account's AUD credit for future supported AE purchases. | Wallet, bank balance, customer USDC |
| **Available balance** | The part of prepaid credit currently available for new Calls. | Spending limit, cash balance |
| **Reserved balance** | The part of prepaid credit set aside for accepted Calls and unavailable for another purchase. | Charge, completed payment, escrow |
| **Top-up fee** | The separately disclosed service fee additional to the credit amount requested. | Deducted credit, hidden spread |
| **Call price** | The exact or maximum all-in AUD amount bound by a Quote for the specified Call. | Upstream token amount, later exchange estimate |
| **Charge** | The recorded amount billed to the Customer's Account for a Call. | Top-up, invoice, Provider payment |
| **Provider payable** | The amount AE owes the Provider for the upstream service under the applicable arrangement. | Customer charge, completed payout |
| **Refund** | A linked reversal of some or all of an original Charge. | Chargeback, unconditional cash withdrawal |
| **Payout** | A transfer of amounts owed to a Provider. | Buyer charge, unpaid earnings, generic settlement |
| **Receipt** | Evidence recording the specified payment or charge. | Delivered result, tax invoice by default |
| **Statement** | A period summary of an Account's financial activity. | Tax invoice by default, mutable ledger |
| **Tax invoice** | A business document issued under the applicable approved tax requirements for the stated sale. | Receipt, proof that AE is compliant |
| **Treasury** | AE-owned funds used to meet its upstream obligations and operating requirements. | Customer wallet or customer token balance |

## Relationships

- An **Account** belongs to one **Customer** and can authorise multiple **Agents**.
- An **Agent** acts through its **Account**; changing a **Credential** does not reset its spending history or limits.
- A **Provider** can offer multiple **Tools**, and a **Tool** has identified **Tool versions**.
- A **Source** can describe multiple **Tools**; importing it does not establish a **Publication** for each one.
- A managed **Call** references one **Tool version** and one **Quote** and can have multiple **Attempts** under the same purchase identity.
- A **Quote** is not a **Call**, and an unaccepted or expired Quote is not a completed purchase.
- A **Call** links delivery and financial records; its **Delivery status** and **Payment status** can differ.
- A **Charge** and **Provider payable** belong to different financial obligations even when they relate to the same **Call**.
- A **Refund** refers to an original **Charge**; it is not automatically a transfer to the Customer's bank.
- A **Statement** can cover multiple **Calls**; its existence does not imply issuance of a **Tax invoice**.
- In supported resale purchases, AE is the **Seller**, the upstream party is the **Provider**, and the **Payment recipient** is recorded separately.

## Example dialogue

> **Dev:** "A customer connects an agent and tops up $100. Can it start buying?"
> **Domain expert:** "Only within its spending policy; credit and permission are separate."

> **Dev:** "The agent chooses a tool and gets a quote. Has it been charged?"
> **Domain expert:** "No. The quote fixes the price and terms; accepting the Call starts execution and reserves the required capacity."

> **Dev:** "Payment went through, but the tool result timed out. Do we mark the Call complete?"
> **Domain expert:** "No. Record payment separately, keep the purchase unresolved, and check the existing Call before retrying."

> **Dev:** "The agent's credential was replaced. Does recovery create another purchase?"
> **Domain expert:** "No. It is the same agent and Call, with the same spending history and permitted recovery actions."

This dialogue illustrates the proposal; it is not a transcript of Joel approving
the terms or a claim that all scenarios have been verified live.

## Flagged ambiguities

1. **Service versus Tool:** current PRODUCT and CONTEXT define Service as one callable unit. Joel's tentative working choice is **Tool** for that callable catalogue unit, without adding a Service grouping object; final glossary agreement remains open.
2. **Agent as buyer versus product for sale:** Nevermined also calls monetised services agents; reserve **Agent** for the authorised caller in AE and describe a purchased agent-backed capability as a Tool.
3. **Customer, User and Account:** a legal customer, a human login and the owned account boundary are different; do not globally rename every principal or business row to Customer.
4. **Policy versus approval:** the current mandate families include standing and request-specific authority; map reusable rules to Spending policy, but inspect one-off authorisations before naming them Approval.
5. **Quote versus permission:** Quote includes bound inputs, effects, terms, expiry and authority evidence; keep those facts even though the familiar name sounds price-oriented.
6. **Call versus action execution:** the general action-execution machinery also uses invocation names; only customer tool executions are Calls, so a blanket invocation-to-call replacement is unsafe.
7. **Tool, Offering, Publication and Listing:** source contains separate identifiers and records for these stages; preserve their relationships until an evidence review determines which are lifecycle records, projections or genuine duplicates.
8. **Request versus Call:** a search need, HTTP exchange, support request and accepted tool execution are not one thing; qualify Request by its purpose rather than adopting it as the universal replacement.
9. **Budget versus available credit:** a permitted spending amount can be smaller than the funded balance; use a named Spending limit and retain the relevant period and scope.
10. **Payment, charge, payable and payout:** each describes a different financial fact; familiar wording must not merge the customer's charge with AE's upstream obligation.
11. **Receipt versus result:** financial evidence is not useful tool output or proof of delivery; identify what a receipt records, including third-party protocol receipts.
12. **Purchase status versus delivery:** final purchase status can reflect failure, adjustment or refund as well as delivery; do not turn every terminal state into success.
13. **Immutable and third-party names:** signed payloads, hashes, identifier prefixes, x402 fields, OAuth scopes, accounting accounts and old events may contain old words; retain exact external or historical names unless a specific migration is proved safe.
14. **Glossary ownership:** the current CONTEXT also contains implementation guidance; after approval, keep the accepted domain glossary there and move migration-specific mappings to the selected plan rather than maintaining two live vocabularies.

## Reference basis

- [Locus developer experience](https://paywithlocus.com/developers): familiar tools, agents, accounts, spending controls and per-call usage.
- [Nevermined core concepts](https://nevermined.ai/docs/getting-started/core-concepts): services, payment plans, access, metering and settlement; its Agent naming is not copied into AE's buyer identity.
- [MCP tools specification](https://modelcontextprotocol.io/specification/2025-06-18/server/tools): callable tools with defined inputs and outputs; an AE administrative MCP tool is not automatically catalogue supply.
- Current [product authority](../PRODUCT.md) and [accepted language](../CONTEXT.md): the commercial distinctions and implementation boundary retained by this proposal.

References were read on 2026-09-05; they are design evidence, not proof of AE
feature parity, deployed behaviour or approval of this draft.
