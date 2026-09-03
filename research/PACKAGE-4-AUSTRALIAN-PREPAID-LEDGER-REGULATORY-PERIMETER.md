# Package 4: Australian prepaid balance and settlement perimeter

**Status:** regulatory and accounting research baseline; not legal, tax or
accounting advice
**Prepared:** 2026-09-01
**Jurisdiction:** Australia
**Product authority:** [`PRODUCT.md`](../PRODUCT.md)
**Language authority:** [`CONTEXT.md`](../CONTEXT.md)
**Source policy:** Australian legislation and official ASIC, APRA, AUSTRAC,
RBA, Treasury, ATO, AASB and OAIC material. The legal conclusions below are
working perimeter assessments that require Australian professional advice.

## Decision

Create a distinct **Package 4 money foundation** before
Agentic Economy accepts prepaid money for live principal-reseller purchases.

The Package 4 money foundation should implement a deliberately narrow
commercial fact pattern:

1. An Australian Business Principal prepays Australian dollars to Agentic
   Economy.
2. The resulting Account balance is a contractual prepayment owed by Agentic
   Economy. It is not cash, a token, an investment, a wallet balance or a claim
   over Agentic Economy's USDC.
3. The balance can only pay Agentic Economy, as buyer-facing Seller, for
   supported Operations. It cannot be withdrawn, transferred, assigned, earn a
   return or be spent with another merchant.
4. Funding does not grant authority and does not buy an Operation. A Commitment
   reserves exposure; delivery and remedy determine commercial closure.
5. Agentic Economy separately buys the Provider's service and pays its own
   upstream obligation from its own USDC treasury. The customer does not choose
   a wallet, direct a token transfer, own USDC or receive crypto custody.
6. The customer receives funding receipts and periodic, itemised Australian
   tax invoices or adjustment documents according to the tax treatment
   confirmed by an Australian tax adviser.
7. A top-up may include a separately disclosed service fee in addition to the
   requested credit. The fee is its own amount and tax fact; it never reduces
   the AUD credited to the Account and is not represented as a card surcharge.

This structure removes substantial future debt because it makes the product
ledger express the same two-leg principal-reseller model as the product charter:

```text
buyer funding and buyer-facing sale             upstream procurement

Business Principal ── AUD ──> Agentic Economy ── owned USDC ──> Provider/payee
        │                         │                            │
        └── contract balance      ├── buyer-facing Seller     └── upstream supply
                                  └── separate obligations and evidence
```

It does **not** prove that the product is outside every financial-services or
payments law. In particular, the statutory purchased-payment-facility test and
the post-1 July 2026 AML/CTF stored-value test are broad enough to require
written Australian advice before launch.

## Scope assumptions and red lines

The working perimeter depends on all of these facts remaining true.

| Required fact | Product and engineering consequence |
| --- | --- |
| Agentic Economy is the sole legal payee and buyer-facing Seller for a prepaid purchase. | Terms, checkout, receipts, invoices, ledger entries and support must not describe the Provider as the party receiving customer credit. The Provider performs a separate upstream obligation. |
| Credit pays only amounts owed to Agentic Economy for admitted Operations. | No marketplace wallet, external merchant acceptance, customer-selected payment recipient or general-purpose checkout. |
| No cash redemption or withdrawal. | Refunds are remedies to the original AUD payment method or account according to contract and law, not an always-available cash-out feature. |
| No transfer, assignment, gift, secondary sale or Account-to-Account movement. | Enforce the restriction in both terms and storage; support staff must not bypass it. Mergers or legal-successor cases require controlled finance review rather than a generic transfer feature. |
| No interest, yield, staking return, appreciation promise or investment language. | The balance is denominated in AUD and remains equal to the contractual AUD amount, subject only to purchases, refunds, expiry/breakage treatment confirmed by advisers, and corrections. |
| No customer crypto entitlement. | Never expose an address, key, token quantity or redemption right as a customer asset. Do not market credit as USDC-backed or one-for-one convertible to USDC. |
| Agentic Economy owns and controls its upstream USDC. | Exchange and custody accounts name Agentic Economy as beneficial owner. Customer funds and USDC treasury movements are not represented as held on trust unless legal advice requires that structure. |
| No unfunded or on-demand Calls. | A Commitment cannot be accepted unless settled available credit covers the locked all-in AUD Call price. No negative balance or postpaid debt. |
| Business customers only at launch. | KYB and contracting enforce the segment. B2B positioning does not itself remove AFSL, payment-facility, AML/CTF, tax or privacy law. |
| The product ledger is authoritative for product balances but is not the statutory general ledger. | It produces complete, versioned accounting exports and reconciliations. The accountant owns chart-of-accounts mapping, tax codes and final classification. |
| A top-up service fee is separately priced. | Quote credit principal, service fee and total payable before authorisation. Credit the full principal. Apply the approved GST treatment to the fee and do not use the fee to relabel a payment-method surcharge. |

If any red line changes, pause the feature and obtain a fresh perimeter opinion.
The highest-risk changes are cash-out, transfers, multiple merchants/payees,
customer-directed USDC, customer token ownership, yield, consumer access or
credit/postpaid Calls.

## Legal-status snapshot

| Area | Status at 2026-09-01 | Working perimeter, not a legal conclusion |
| --- | --- | --- |
| AFSL and non-cash payment facilities | **Current law.** Section 763D of the *Corporations Act 2001* defines a non-cash payment facility and excludes a facility used to pay only one person. ASIC's current guidance applies substance over labels. ASIC Instrument 2026/167 provides conditional low-value relief. | A true prepayment usable only to discharge amounts owed to Agentic Economy has the strongest single-payee case. The customer must not be directing payment to Providers through the balance. Obtain written AFSL advice; do not rely on the word “credit.” |
| Purchased payment facilities | **Current law.** Sections 9 and 22 of the *Payment Systems (Regulation) Act 1998* regulate facilities under which value is purchased and the provider makes payments. RBA declarations exempt certain facilities with obligations of no more than $10 million or no more than 50 payees. | No cash-out materially reduces the APRA deposit-like risk, but does not answer the broader statutory PPF question. Whether the upstream Provider payment is legally a payment under the customer facility depends on the principal-reseller substance. Counsel should determine whether an RBA declaration applies or engagement/authority is needed. |
| AML/CTF — stored value | **Current law from 1 July 2026.** The amended *AML/CTF Act 2006* includes a broad “stored value card” concept that can include a virtual facility. Issuing or increasing a non-cash-out stored-value facility is a designated service at $5,000 or more. | Until AUSTRAC advice says otherwise, block a legal customer's total available, reserved and otherwise accessible value from reaching $5,000. This is a conservative product control, not a concluded exemption. Splitting value across Accounts or API keys is not an acceptable workaround. |
| AML/CTF — remittance and virtual assets | **Current law from 1 July 2026.** Transfers on behalf of a payer/payee, virtual-asset exchange and virtual-asset safekeeping are designated services; qualifying VASPs must register. A service that is reasonably incidental to another non-designated service can be excluded. | Buying USDC for Agentic Economy and using it to settle Agentic Economy's own upstream debt is likely corporate treasury activity rather than exchange, remittance or custody supplied to the customer. The contract, control and fund flows must match that substance. Obtain AUSTRAC advice on the x402 flow and incidental-transfer provision. |
| Digital asset platforms | **Enacted, not commenced.** The *Corporations Amendment (Digital Assets Framework) Act 2026* received assent on 8 April 2026 and ASIC states that the licensing regime starts on 9 April 2027. A digital asset platform includes possessing tokens for or on behalf of another person as trustee, bailee or under an obligation to follow that person's instructions. | Agentic Economy's own USDC treasury should remain outside customer-facing digital-asset-platform activity because no token is possessed for a customer. Reassess before 9 April 2027 and whenever wallet control or customer rights change. |
| Broader payments licensing reform | **Proposal, not enacted law.** Treasury has consulted on draft legislation for payment-service-provider licensing and safeguarding; APRA says timing remains subject to Government decisions. | Do not claim compliance with a regime that is not law. Build configurable balance limits, safeguarding/reconciliation capability, unclaimed-value reporting and complaints/export controls so a later migration does not require replacing the ledger. |
| GST and tax invoices | **Current law.** Ordinary advance payments can trigger GST attribution when consideration or an invoice is received/issued. Division 100 changes timing for qualifying face-value vouchers only. Tax invoices may cover multiple supplies but must identify the required supply and tax facts. | A monthly invoice for consumed Calls is a valid document pattern, but it does not by itself defer GST until consumption. Obtain written treatment of the balance under Division 100 and configure funding receipts, Call invoices and adjustments from that decision. |
| Card surcharges and other fees | **Current ACCC guidance.** Card-surcharge limits remain in force until 1 October 2026. From that date, Visa, Mastercard, American Express and eftpos scheme rules prohibit surcharging on their cards. A business may charge another genuine fee that is unrelated to payment method, but cannot simply relabel a card surcharge. | Price the top-up service fee as a genuine, consistently applied service price. Disclose principal, fee and total before payment. Reassess processor and payment-method presentation before launch and when scheme rules change. |
| Accounting and records | **Current standards and law.** AASB 15 treats advance payment as a contract liability until performance, subject to principal/agent and breakage analysis. Section 286 of the *Corporations Act* requires financial records that correctly explain transactions and retention for seven years. | Funding should normally create cash plus a customer contract liability, not revenue. Reservation is not revenue. Delivery/closure, Provider cost, USDC disposal, refunds and breakage remain separate facts and configurable accounting exports. |
| Client money/trust | **Current law, classification-dependent.** Part 7.8 of the *Corporations Act* imposes designated-account and trust consequences for client money received by an AFS licensee in connection with a financial service or product. | An ordinary prepayment to the Seller for its own supply is not automatically client money. If the balance or service is a financial product/service, this conclusion can change. Obtain advice before choosing an operating account, trust account or safeguarding representation. |
| Privacy and breach response | **Current law, entity and activity dependent.** APP coverage can apply by turnover or exception; AML/CTF reporting entities have specific Privacy Act coverage for their reporting activities. APP 8 addresses overseas disclosure, APP 11 security and deletion, and the NDB scheme requires assessment and notification of eligible breaches. | Separate identity/KYB data from the immutable financial ledger, minimise personal data in evidence, document overseas custody/cloud flows, apply access controls and legal holds, and implement a breach-assessment workflow. |

## Practical perimeter matrix

| Question | Facts that keep the narrow perimeter | Facts that move the product outward | Required gate |
| --- | --- | --- | --- |
| Is the AUD balance an AFSL-regulated non-cash payment facility? | Only Agentic Economy can be paid; the balance discharges the customer's debt to Agentic Economy for Agentic Economy's own sale. | Providers are described as merchants paid by the customer; customer chooses recipient; multiple external sellers accept the balance; the platform acts as an agent for payment. | Australian financial-services counsel signs off the contracts and exact user/payment flow against s 763D and s 763E. |
| Can ASIC low-value relief be used as a fallback? | Each holder's facility is no more than $1,000; all facilities in the class total no more than $10 million; all instrument conditions and reporting obligations are met. | Any customer or aggregate balance exceeds the limit, or the facility is another financial product. Paid credit is not converted into a “loyalty scheme” merely by naming it points. | Treat relief as contingency only. If relied upon, encode a holder-level $1,000 ceiling, class-wide $10 million monitor and instrument compliance owner. |
| Is this a purchased payment facility? | Agentic Economy is genuinely Seller, with the customer balance applied internally against its receivable; a separate corporate purchase creates the Provider payment. | The facility is in substance an arrangement for Agentic Economy to pay third-party Providers at the customer's direction. | Written PSRA opinion; determine applicability of current RBA declarations and whether consultation or authority is required. Monitor total outstanding customer obligations as a conservative proxy. |
| Is there APRA deposit-taking risk? | No repayment on demand, no cash-out and no promise of a cash deposit; use is narrow. | Cash redemption, broad acceptance or deposit-like marketing. | Legal review of refund terms and product copy. No feature may create a general right to withdraw. |
| Is Agentic Economy issuing regulated stored value under AML/CTF law? | Conservative customer-level exposure remains below $5,000 while advice is pending. | Issuing or increasing a non-cash-out virtual stored-value facility at or above the statutory threshold; cash-out would change the threshold and risk. | AUSTRAC specialist advice. Aggregate by legal customer, not Account/API key. Reject a top-up that would breach the configured limit. |
| Is Agentic Economy a remittance provider or VASP? | It supplies an Operation as Seller, buys its own USDC, and pays its own upstream obligation. Customer neither receives nor directs a transfer or exchange. | Customer supplies AUD specifically to acquire USDC; Agentic Economy transmits value on the customer's behalf; customer chooses address/payee; customer can redeem tokens; Agentic Economy safeguards customer tokens. | Trace legal ownership, instructions and purpose through every rail. Written AML/CTF classification before production x402 settlement. Register and implement an AML/CTF program if advice finds a designated service. |
| Is Agentic Economy providing crypto custody under the 2027 regime? | Self-custody or third-party custody of Agentic Economy's beneficially owned treasury only. | Tokens held as trustee/bailee for customers or subject to customer instructions. | Record beneficial owner and control basis for every wallet/account; annual and change-triggered review before regime commencement. |
| When is GST attributable? | Adviser confirms ordinary advance-payment treatment or confirms that the precise instrument is a Division 100 voucher. | Product assumes “GST only at consumption” because invoices are monthly, without meeting the voucher rules. | Tax adviser memorandum and, if material uncertainty remains, consider an ATO private ruling. Tax engine has versioned treatment effective dates. |
| Is the monthly aggregate document a tax invoice? | It identifies Agentic Economy as supplier, ABN, issue date, customer identity where required, every taxable Call or adequately described grouping, price, GST and taxable extent, and links adjustments. | It is only an account statement, nets away Calls, omits supply/tax detail, presents the Provider as Seller, or duplicates GST already invoiced at funding. | Adviser-approved invoice and adjustment-note specimens, reconciliation test and immutable issued-document snapshot. |
| Is money required to be held on trust? | Payment is ordinary consideration prepaid to the Seller for its own supply and no financial service/product is involved. | Agentic Economy receives client money in connection with a financial service/product or contractually promises trust/safeguarding. | Written advice before bank-account architecture and customer representations. The ledger must support segregated cash if required without changing commercial events. |
| Does the product ledger replace accounting records? | It is a complete, reconcilable subledger and evidence source with versioned exports. | It makes final tax or chart-of-account judgments, loses source evidence, or combines both commercial legs into a net posting. | Australian accountant approves posting mappings, close process, breakage and crypto treatment. Finance can reproduce every balance and document from immutable entries. |

## Package boundary

The Package 4 money foundation is a platform prerequisite, not merely an invoicing feature. It owns
the smallest coherent money boundary needed by the principal-reseller model.

### Classification and launch gates

Complete before accepting customer funds:

- Australian legal memorandum covering AFSL/non-cash payment, PPF/APRA/RBA,
  AML/CTF stored value, remittance/VASP, 2027 digital asset platform and client
  money;
- Australian tax memorandum covering GST timing, Division 100, refunds,
  breakage, non-resident Provider services, invoice and adjustment documents;
- accountant-approved subledger-to-general-ledger mapping, principal/gross
  presentation and USDC asset/expense treatment;
- final contracts and product copy that encode the red-line facts;
- nominated owners for threshold monitoring, regulatory change, reconciliation,
  tax documents, privacy and incident response.

### Product ledger and controls

Own:

- AUD funding, availability, reservation, capture, release, refund and
  adjustment;
- customer-level and platform-level regulatory limit controls;
- buyer consideration and the separate Provider obligation;
- Agentic Economy's USDC treasury acquisition, custody evidence, disposal and
  upstream settlement evidence;
- immutable invoice, adjustment and funding-receipt snapshots;
- reconciliation to payment processor, bank, custodian, x402 settlement,
  product balance and accounting export;
- privacy-aware evidence retention, access history and legal holds;
- finance and compliance exports.

Do not own:

- a customer wallet, token exchange, remittance product or general payment
  network;
- a general ledger or final customer accounting classification;
- postpaid credit, loans or on-demand unfunded Calls;
- general agent authority, planning, orchestration or memory;
- a second market object separate from the Operation.

## Ledger design

### Separate the two commercial legs

The ledger must never debit customer credit and directly credit a Provider as
one marketplace transfer. It records linked but legally distinct events:

```text
buyer leg
  customer contract liability -> buyer-facing sale / refund / adjustment

upstream leg
  Provider obligation -> Agentic Economy corporate USDC settlement
```

The legs may differ in amount, currency, timing, payee and remedy. Their link is
the Commitment/Invocation/Operation purchase identity, not a net money entry.

### Minimum account classes

The exact general-ledger codes remain accountant-owned. The product subledger
needs at least these economic classes:

| Class | Purpose |
| --- | --- |
| Customer AUD available liability | Funded amount still available to the Business Principal. |
| Customer AUD reserved liability | Amount held for an accepted Commitment; still a liability, not revenue. |
| Customer refund/adjustment position | Approved remedy and its settlement status. |
| Buyer sale and tax facts | Gross buyer consideration, discount, GST basis, taxable amount and recognition/closure status. |
| Provider obligation | Amount Agentic Economy owes for the upstream supply, independent of customer consideration. |
| AUD cash/processor clearing evidence | Funding and refund receipts pending bank or processor reconciliation. |
| Corporate USDC asset/treasury evidence | Units owned by Agentic Economy, custody location, AUD acquisition basis and disposal evidence. Never allocated as customer property. |
| Upstream settlement and network cost | Provider payment, facilitator fee, gas/network cost and settlement finality. |
| Revenue, cost and tax export classifications | Versioned proposed mappings for the accounting system, never silently rewritten in historical entries. |

### Event and posting lifecycle

Illustrative accounting directions below are not a chart-of-accounts decision.

| Product event | Product-ledger effect | Illustrative accounting export |
| --- | --- | --- |
| AUD funding settles | Increase customer available liability; attach processor/bank evidence. | Dr cash/clearing; Cr customer contract liability. |
| Commitment accepted | Move the exact locked AUD Call price from available to reserved. | Reclassification within the contract-liability control, or memorandum posting, as adviser specifies. No revenue. |
| Invocation fails before charge | Release the reservation atomically. | Reverse the reservation reclassification only. |
| Delivery is accepted and purchase closes | Capture actual buyer consideration, release any excess, attach supply and tax facts. | Dr contract liability; Cr revenue and GST payable according to the confirmed tax/accounting policy. |
| Provider obligation is established | Record upstream amount, currency, Provider/payee and evidence separately. | Dr cost/accrual; Cr Provider payable as approved. |
| USDC settles upstream | Reduce Provider obligation and corporate USDC; record asset units, AUD value, network fee and transaction evidence. | Dr Provider payable and fee/asset-disposal accounts; Cr USDC asset, with realised movement treatment as approved. |
| Purchase is adjusted or refunded | Create a linked reversal/adjustment, restore customer liability or return AUD according to remedy. | Reverse/adjust revenue and GST or settle liability/cash according to timing and advice. Never mutate the original posting. |
| Balance expires or becomes breakage | No automatic revenue job without approved legal and AASB 15 policy. | Recognise only under the approved breakage/limitation policy and with an audit trail. |

### Non-negotiable invariants

- Every monetary movement is a balanced, atomic, append-only entry. A cache is
  never the authoritative balance and an asynchronous journal is never the only
  record of a completed debit.
- External events use idempotency keys. A retry cannot fund, reserve, capture,
  refund or settle twice.
- Corrections are reversals and replacement entries. Issued tax documents and
  historical exchange-rate evidence are immutable.
- `available + reserved + other customer-accessible value` reconciles to the
  customer contract-liability control after every transaction.
- A debit cannot create a negative available balance. A Commitment cannot
  reserve more than the amount already settled and available.
- Amounts use integers with six-decimal AUD precision and exact asset-unit
  precision. Each
  conversion records rate, source, timestamp and purpose; displayed rounding
  never changes the ledger.
- Regulatory limits aggregate by stable legal-customer identity, not by user,
  agent, Account, Mandate, API key or wallet.
- One legal customer's shared Account balance remains one customer liability.
  Per-Agent Principal and principal-wide spend limits are authority and exposure
  controls, not sub-balances, customer wallets or separate holders. Credential
  rotation cannot create new regulatory headroom.
- Every entry carries actor, source, effective time, recorded time, sequence,
  correlation identity, reason and evidence references.
- Provider, Seller and payment recipient are separate fields. Neither a wallet
  address nor an x402 `payTo` value determines a commercial role.
- Commercial closure is stored separately from payment finality and accounting
  recognition. Uncertain delivery or settlement remains explicit.

### Limit controls to implement before launch

Thresholds must be configuration with a cited legal-policy version, not magic
numbers embedded in UI code.

| Control | Conservative implementation while advice is pending |
| --- | --- |
| AML/CTF non-cash-out stored value | Reject any funding event that would make a legal customer's total accessible, reserved or otherwise held value **$5,000 or more**. Obtain advice on the exact statutory aggregation and event test. |
| ASIC low-value NCP relief, only if relied upon | Reject a holder exposure above **$1,000** and stop the facility class before aggregate obligations exceed **$10 million**; implement every other instrument condition. |
| RBA PPF declaration monitoring | Continuously calculate total outstanding customer obligations as a conservative proxy and count possible payees under both the sole-Seller and look-through interpretations. Escalate well before **$10 million** or a relevant payee-count change. |
| No credit | Reject a Commitment if settled available balance is insufficient for the locked all-in AUD Call price. |
| Delegated agents | Reserve against both the stable legal-customer exposure and the durable Agent Principal's Mandate. An API credential may authenticate the action but cannot own credit, choose the Account, reset limits or direct the upstream USDC payment. |

The $1,000 and $5,000 figures are different legal tests. A product cannot select
the more convenient number without first establishing which regime and relief
apply.

## GST, invoices and accounting

### GST timing is a classification decision

An invoice that aggregates consumed Calls solves document volume; it does not
determine when GST arises. Under the ATO's ordinary attribution guidance, an
advance payment can cause GST to be attributable when consideration is
received. Division 100 can defer GST treatment for a qualifying face-value
voucher until redemption, but the ATO makes clear that not every stored value,
credit or article is such a voucher.

The product therefore needs one adviser-selected, effective-dated tax policy:

- **ordinary prepayment:** issue the correct funding tax document and avoid
  charging GST again on consumption; or
- **qualifying Division 100 voucher:** issue the correct funding receipt and
  recognise/invoice the taxable supply on redemption; or
- another treatment documented for the precise contracts and supply facts.

Do not hard-code “GST occurs on top-up” or “GST occurs on Calls” before that
decision. Consider an ATO private ruling if the commercial amount or residual
uncertainty warrants it.

### Periodic aggregate invoice requirements

A periodic tax invoice may cover multiple supplies. The immutable issued
document and its machine-readable export should include, as applicable:

- Agentic Economy's identity and ABN as supplier, a unique document number and
  issue date;
- the Business Principal's identity or ABN where required;
- each Call/Operation supply, or an adviser-approved grouping that still
  identifies what was supplied, quantity/time and price;
- gross and net buyer consideration, discounts, taxable extent, GST and total;
- Commitment, Invocation, Operation revision, Account and business-allocation
  references without exposing private prompt/result content;
- links to funding applied, prior invoices, credit/adjustment notes and refunds;
- the Provider and payment recipient as attributed upstream facts, not as a
  substitute for Agentic Economy's Seller identity.

The account statement may additionally show opening balance, funding,
reservations, Calls, releases, adjustments and closing balance. Label it a tax
invoice only when it satisfies the statutory requirements for the selected tax
treatment.

### Upstream and USDC accounting

The tax and accounting treatment depends on facts outside the ledger:

- whether Agentic Economy controls the promised service before transfer and is
  principal rather than agent under AASB 15;
- Provider jurisdiction, GST registration and whether an imported-service
  reverse charge can apply where acquisitions are not fully creditable;
- whether USDC is held as trading stock or another crypto asset and how disposal
  movements and network fees are recognised;
- expected breakage, expiry enforceability and the pattern in which any breakage
  can be recognised;
- the remedy point at which revenue and GST are reversed or adjusted.

Package 4 must store the raw facts needed for these judgments and export a
versioned proposed mapping. It must not silently turn product terminology into
the customer's or Agentic Economy's final accounting answer.

## Record retention, privacy and operational evidence

### Retention baseline

Implement record classes rather than one blanket deletion rule:

| Record | Baseline |
| --- | --- |
| Company financial records | Seven years under s 286 of the *Corporations Act 2001*. |
| GST and tax substantiation | Generally five years under ATO guidance, subject to the event and any dispute/review period. |
| Crypto transactions | ATO guidance requires transaction date, AUD value, purpose/counterparty, address and exchange/wallet records, generally for five years. |
| AML/CTF records, if the product supplies a designated service | The Act includes seven-year retention duties for relevant customer, transaction, program and due-diligence records. Confirm the exact record class with the AML/CTF program. |
| Product evidence | Retain for the longest applicable financial, tax, AML/CTF, contractual, dispute or legal-hold period; then delete or de-identify personal data where APP 11 requires it. |

Retention policies need effective dates, legal-hold overrides and deletion
evidence. A record must not be deleted merely because one shorter clock has
expired.

### Privacy architecture

- Store stable pseudonymous party and actor references in immutable journal
  entries. Keep names, contact details, KYB documents and beneficial-owner data
  in a separately controlled identity store.
- Do not put prompts, results, secrets or unnecessary personal data into payment
  descriptions, blockchains, x402 evidence, invoice lines or ledger metadata.
- Encrypt sensitive data in transit and at rest, apply least-privilege roles,
  separate finance/support/security access and audit all privileged access.
- Map every overseas disclosure to a custodian, exchange, Provider or cloud
  service. Apply APP 8 analysis and contractual/security diligence rather than
  assuming a processor label removes accountability.
- Maintain a data-breach response plan. Where the NDB scheme applies, promptly
  assess suspected eligible breaches within the statutory assessment period and
  notify the OAIC and affected people when required.
- Reassess Privacy Act coverage if turnover, AML/CTF reporting-entity status,
  health/credit data or another exception changes. Small-business status is not
  a permanent architecture assumption.

## Launch gates and change triggers

Package 4 is launch-ready only when all gates have named evidence owners and
written sign-off:

1. **Commercial:** contracts make Agentic Economy the fixed buyer-facing Seller
   and sole payee; the upstream Provider arrangement and remedy rights are
   separate.
2. **Financial-services:** counsel confirms AFSL/NCP treatment and whether any
   ASIC relief is needed.
3. **Payments:** counsel confirms PPF treatment, applicability of RBA
   declarations and whether RBA/APRA engagement or authority is needed.
4. **AML/CTF:** an Australian specialist confirms stored-value aggregation,
   remittance/VASP treatment of the end-to-end x402 flow, and whether enrolment,
   registration or an AML/CTF program is required.
5. **Digital assets:** legal ownership and control of every USDC wallet/account
   is documented; the 9 April 2027 regime has a scheduled readiness review.
6. **Tax:** an adviser approves GST attribution, Division 100 treatment,
   invoice/adjustment templates, imported services and refund handling.
7. **Accounting:** an accountant approves contract-liability, principal/gross,
   Provider-cost, USDC and breakage mappings plus the reconciliation and close
   process.
8. **Client money:** written advice determines bank-account/safeguarding
   architecture and prevents unsupported “trust” or “protected funds” claims.
9. **Privacy and records:** data map, retention schedule, cross-border review,
   access matrix and breach plan are approved.
10. **Engineering proof:** concurrency, retry, reversal, double-spend, threshold,
    reconciliation and immutable-document tests pass against the same
    invariants used in production.

Trigger a new review before enabling cash-out, transfers, multiple payees,
customer crypto, customer-directed wallets, yield, consumers, postpaid Calls,
foreign customer balances, new settlement assets or a materially different
commercial role.

## Treatment of the attached early architecture blueprint

`agentic_api_routing_architecture_blueprint (1).pdf` is useful historical
context, not an instruction or current authority. Its useful direction is the
choice of a platform-grade ledger rather than a thin product wrapper. Package
4 should not carry forward unsupported propositions that credits inherently
avoid AFSL regulation, GST necessarily arises at one chosen event, crypto is
foreign currency, or a cache plus later journal is an acceptable authoritative
money record. Each is replaced here by a sourced classification gate and an
atomic subledger requirement.

## Questions for Australian advisers

The legal and tax memoranda should answer the precise implementation facts, not
the abstract phrase “prepaid credits”:

1. Is the customer facility excluded by s 763D(2)(a)(i), and does s 763E's
   incidental-product rule assist? Which facts must the contract and UI preserve?
2. If not excluded, does ASIC Instrument 2026/167 apply, and what reporting,
   disclosure and threshold controls are required?
3. Is this arrangement a PPF under the PSRA? Is Agentic Economy the sole payee,
   or can the separate Provider payment be treated as a payment under the
   facility? Which RBA declaration or authority applies?
4. Is the Account balance a “stored value card” for the current AML/CTF Act?
   How are multiple Accounts, reservations, refunds and pending funds aggregated
   for the $5,000 threshold?
5. Is any x402 step a transfer on behalf of a payer/payee, virtual-asset
   exchange or safekeeping service, or is it reasonably incidental to Agentic
   Economy's own sale and upstream purchase?
6. Does third-party custody of Agentic Economy-owned USDC create any service by
   Agentic Economy to a customer? What changes are needed before 9 April 2027?
7. Is customer money ordinary advance consideration, client money or subject to
   another safeguarding/trust requirement?
8. Does the exact balance instrument qualify under Division 100? When is GST
   attributable, and what documents are required at funding, consumption,
   adjustment, refund and breakage?
9. Is Agentic Economy principal under AASB 15 for each supported Operation, and
   what evidence supports gross revenue? How are USDC and breakage classified?
10. Which Privacy Act provisions apply at launch, including overseas cloud,
    custodian and Provider disclosures, and which record classes may be
    de-identified after their legal holds expire?

## Primary sources

### Financial services, payment facilities and reforms

- [*Corporations Act 2001*, ss 763D–763E, Part 7.8 and s 286](https://www.legislation.gov.au/C2004A00818/latest/text)
- [ASIC: Digital assets — financial products and services](https://www.asic.gov.au/regulatory-resources/digital-transformation/digital-assets-financial-products-and-services)
- [ASIC Regulatory Guide 185: Non-cash payment facilities](https://www.asic.gov.au/regulatory-resources/find-a-document/regulatory-guides/rg-185-non-cash-payment-facilities)
- [ASIC Corporations (Non-cash Payment Facilities) Instrument 2026/167](https://www.legislation.gov.au/F2026L00318/latest/text)
- [ASIC: remade non-cash payment facilities instrument](https://www.asic.gov.au/about-asic/news-centre/news-items/asic-remakes-non-cash-payment-facilities-instrument)
- [*Payment Systems (Regulation) Act 1998*, ss 9 and 22](https://www.legislation.gov.au/C2004A00318/latest/text)
- [RBA: declarations and exemptions for purchased payment facilities](https://www.rba.gov.au/payments-and-infrastructure/payments-system-regulation/declarations-and-exemptions-for-purchased-payment-facilities/)
- [RBA Declaration No 2 of 2006 — $10 million and 50-payee classes](https://www.rba.gov.au/media-releases/2006/pdf/mr-06-02-purchased-payment-facilities-dec-2.pdf)
- [RBA/APRA: division of responsibilities for purchased payment facilities](https://www.rba.gov.au/media-releases/2000/jmr-rba-apra.html)
- [Treasury: Payments Licensing Reforms](https://treasury.gov.au/policy-topics/banking-and-finance/payments-licensing-reforms)
- [APRA Corporate Plan 2026–27 — payments licensing remains subject to Government](https://www.apra.gov.au/apra-corporate-plan-2026-27/our-strategic-objectives)

### AML/CTF and digital assets

- [*Anti-Money Laundering and Counter-Terrorism Financing Act 2006* — current text](https://www.legislation.gov.au/C2006A00169/latest/text)
- [AUSTRAC: who and what we regulate from 1 July 2026](https://www.austrac.gov.au/new-austrac/who-and-what-we-regulate)
- [AUSTRAC: virtual asset designated services](https://www.austrac.gov.au/new-austrac/designated-services-newly-regulated-entities/virtual-asset-designated-services)
- [AUSTRAC: reasonably incidental transfers and the travel rule](https://www.austrac.gov.au/industry-and-business/obligations-and-guidance/additional-guidance/travel-rule/when-travel-rule-doesnt-apply)
- [*Corporations Amendment (Digital Assets Framework) Act 2026*](https://www.legislation.gov.au/C2026A00038/latest/text)
- [ASIC implementation roadmap — new regime commences 9 April 2027](https://www.asic.gov.au/about-asic/news-centre/news-items/asics-roadmap-for-digital-assets-law-reform-implementation)

### GST, accounting and records

- [ACCC: Card surcharges](https://www.accc.gov.au/business/pricing/card-surcharges)
- [ATO GSTR 2000/35: supplies and payments made on a progressive or periodic basis](https://www.ato.gov.au/law/view/document?LocID=%22GST%2FGSTR200035%2FNAT%2FATO%22)
- [ATO GSTR 2003/5: vouchers under Division 100](https://www.ato.gov.au/law/view/document?DocID=GST%2FGSTR20035%2FNAT%2FATO%2F00001)
- [ATO GSTR 2013/1: tax invoices](https://www.ato.gov.au/law/view/document?LocID=%22GST%2FGSTR20131%2FNAT%2FATO%22)
- [*A New Tax System (Goods and Services Tax) Act 1999*, s 29-70](https://www.ato.gov.au/law/view/document?LocID=%22PAC%2F19990055%2F29-70%22)
- [ATO GSTR 2000/24: Division 84 imported services](https://www.ato.gov.au/law/view/document?LocID=%22GST%2FGSTR200024%2FNAT%2FATO%22)
- [ATO: crypto assets used in business](https://www.ato.gov.au/api/public/content/0-5849db46-e794-42d2-b4f8-15527fde95ea)
- [ATO: keeping crypto records](https://www.ato.gov.au/individuals-and-families/investments-and-assets/crypto-asset-investments/keeping-crypto-records)
- [ATO: business record-keeping requirements](https://www.ato.gov.au/businesses-and-organisations/preparing-lodging-and-paying/record-keeping-for-business/overview-of-record-keeping-rules-for-business)
- [AASB 15: Revenue from Contracts with Customers](https://standards.aasb.gov.au/aasb-15-dec-2022)

### Privacy

- [OAIC: Privacy Act coverage for small businesses](https://www.oaic.gov.au/privacy/privacy-guidance-for-organisations-and-government-agencies/organisations/small-business)
- [OAIC: privacy guidance for AML/CTF reporting entities](https://www.oaic.gov.au/privacy/privacy-guidance-for-organisations-and-government-agencies/organisations/privacy-guidance-for-reporting-entities-under-the-anti-money-laundering-and-counter-terrorism-financing-act)
- [OAIC APP 8: cross-border disclosure](https://www.oaic.gov.au/privacy/australian-privacy-principles/australian-privacy-principles-guidelines/chapter-8-app-8-cross-border-disclosure-of-personal-information)
- [OAIC APP 11: security, destruction and de-identification](https://www.oaic.gov.au/privacy/australian-privacy-principles/australian-privacy-principles-guidelines/chapter-11-app-11-security-of-personal-information)
- [OAIC: Notifiable Data Breaches scheme](https://www.oaic.gov.au/privacy/notifiable-data-breaches/preventing-preparing-for-and-responding-to-data-breaches/data-breach-preparation-and-response/part-4-notifiable-data-breach-ndb-scheme)
