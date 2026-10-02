# Money model

**Date:** 29 September 2026
**Lens:** What has to move for one Australian business to prepay AUD, buy one x402 Tool, and hold a receipt that a bookkeeper can trust.
**Sources:** `START_LINE.md`, `PRODUCT.md` (current implementation boundary), `AGENTIC_ECONOMY_AUSTRALIA_WHITEPAPER.md` §7, `src/modules/money`, `convex/lib/money`, Formance schema `v1.4.0`.

This is a reading of the source. It is not tax, licensing, or AML advice. `START_LINE.md` already says production funding stays off until a named adviser approves GST timing, tax invoices, the service fee, AFSL/non-cash-payment treatment, AML/CTF, and the bank-account treatment. `PRODUCT.md` says the same thing more sharply: being able to store a field is not compliance.

## The answer in one pass

The customer never holds USDC. They buy a closed-loop AUD balance from Agentic Economy. Agentic Economy is the seller they pay. When an agent accepts a Quote, Agentic Economy sets aside that AUD, pays the Provider in USDC from its own treasury, and only then turns the reserved AUD into a sale.

That spine is already the start line, and it is the right shape for alpha. It matches OpenRouter's prepaid credits on the buyer side, and it matches the part of AWS Marketplace that matters here: one seller on the buyer's paperwork, the supplier paid on a different rail. It should not copy Stripe usage billing, and it should not copy Marketplace's later fiat disbursement. x402 has already paid the Provider during the Call.

The source has grown past that spine. One top-up is written as five records. One Call can carry eight statuses. Provider payment exists twice: on-chain USDC at Call time, and a Stripe Connect payout machine that those Calls are hardcoded never to enter. GST is calculated two ways, and the call price is booked with a tax rate of zero while the whitepaper describes a 10% tax invoice.

Alpha should keep the spine and the safety rules that stop a double credit, a double on-chain payment, and a GST figure that changes between the quote and the receipt. It should drop the second payout business and the extra caps.

## The flow in plain words

**1. The customer adds credit.** An owner chooses an AUD amount. That amount is the credit, not the card charge. Sandbox policy takes a 5% service fee on the credit, then 10% GST on the fee only, and rounds the fee and the GST to the nearest cent. A$5.00 of credit becomes a A$0.25 fee and A$0.03 GST, so the card is charged A$5.28. The A$5.00 is not revenue. The ledger classifies it as a customer contract liability: money Agentic Economy owes the customer in the form of future Calls. The fee is sales revenue. The GST is a tax liability. The customer gets no crypto, no cash-out, and no right to send the balance to anyone but Agentic Economy.

Stripe Checkout takes the card. The return URL does not create the credit. A verified webhook does, once. The same event applied again is a replay. If Stripe's answer is lost, the funding command sits at `outcome_unknown` until someone looks it up. It does not guess.

**2. A rate is frozen before anyone spends.** The Provider's price is USDC. The buyer's price is AUD. A cron stores one Coinbase USDC/AUD observation. A new managed Quote is refused if that observation is missing or older than 24 hours. The Quote converts the USDC amount to AUD and rounds up to the next millionth of a dollar. Sandbox buyer margin is 0%, so the only markup in the conversion is that upward rounding. The rate, the USDC amount, the AUD amount, the Tool version, and the exact input are stored on the Quote. The Quote expires at the earliest of five minutes, the agent's authority, the Tool's readiness, the rate evidence, and the end of a spending period.

**3. The Quote is a promise, not a charge.** Issuing it checks that the Account can cover the AUD, that the agent's limits can cover it, that the legal-customer cap can cover it, and that the corporate USDC treasury can cover the Provider amount. Nothing is moved yet. If the balance is short, the buyer is offered a funding handoff. The agent does not get a Call.

**4. Accepting the Call reserves both purses before any payment is signed.** One Formance bulk does three things together:

- Move the quoted AUD from the Account's available credit to a hold for this Call. The same posting also holds the legal-customer exposure and the daily and monthly spending allowances.
- Move the Provider's USDC amount from treasury available to treasury committed.
- Accrue a Provider obligation for that USDC. The obligation is marked `ineligible_x402`: this money is not waiting for a later bank payout.

If any leg fails, none of them post. The on-chain payment is not signed until that hold exists.

**5. Settlement follows what actually happened.**

- The Provider was not contacted, or the signed authorisation expired unused: put the AUD back, release the USDC hold, and reverse the obligation.
- Delivery is known and usable: the held AUD becomes the sale. With sandbox `callTaxBps` at 0, the entire AUD amount is posted to sales and the GST leg is zero. The committed USDC is marked paid to that Provider, and the obligation becomes `settled`.
- USDC was paid and the buyer cannot be given a usable result: give the AUD back, and still settle the Provider. The ledger comment is explicit that this must not pretend the on-chain payment was reversed. The loss sits with Agentic Economy.
- Submission, settlement, or delivery is uncertain: keep the hold. Do not offer a fresh Call as a retry. Reconcile the same Call.

**6. The receipt is a view of that Call.** It is supposed to show the outcome, the AUD charged, and the separate USDC settlement. A funding receipt is a different document: credit, fee, GST on the fee, and total. Tax invoices are withheld. Sandbox policy is `disabled_pending_approval`, and even after that flag flips, issuance still requires a valid ABN and a GST-registered customer.

## How many things are moving

Counting rule: a moving part is a stored record or an outside system that can change on its own. A state machine is a stored status with its own allowed transitions. A projection that copies another status is counted separately, because it can disagree.

### Outside systems: 6

| Rail | What it is allowed to decide |
| --- | --- |
| Stripe Checkout | Whether the card payment for a top-up succeeded, failed, or is still unknown |
| Stripe Customer and mandate | Whether a saved card can be charged again (auto-recharge) |
| Formance Ledger v2.4.12, schema v1.4.0 | The balances. Convex displays them. It does not invent them |
| Coinbase | The USDC/AUD observation. A Quote pins one observation. It does not call Coinbase live |
| x402 on Base | Whether corporate USDC reached the Provider. Mainnet asset `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` on `eip155:8453`. Testnet asset `0x036CbD53842c5426634e7929541eC2318f3dCF7e` on `eip155:84532` |
| Stripe Connect | A second way to pay a Provider, in fiat, later. The managed x402 path never uses it |

Document files in Convex storage are a seventh store, but they are rendered from the records above. They should not become a new balance.

### Convex money tables: 23

`moneyReferenceRates`, `agentSpendingPeriods`, `moneyStripeWebhookInbox`, `moneyCommercialPolicies`, `moneyReconciliationCases`, `moneyDocuments`, `moneyDocumentSnapshotPages`, `moneyFundingCommands`, `moneyLegalCustomerBindings`, `moneyCustomerTaxFacts`, `moneyAutoRechargeSettings`, `moneyMonthlySpendBudgets`, `moneySupplierPreferences`, `moneyStripeCustomerBindings`, `moneyTreasuryObservations`, `moneyProviderObligations`, `moneyUsageEvents`, `qualifiedUseReceipts`, `moneyConnectAccountCommands`, `moneyStripeEvents`, `moneyPayoutAccounts`, `moneyPayouts`, `moneyPayoutAllocations`.

The purchase itself also lives on `capabilityQuotes`, `capabilityCalls`, and `capabilityCallProjections`.

Implementation surface around those tables: 30 `convex/money*.ts` entry files, 91 files under `convex/lib/money`, 60 files under `src/modules/money`.

### Formance: 14 templates, 12 account families

Templates in schema v1.4.0: `FUNDING_SETTLED`, `FUNDING_REVERSED`, `CALL_RESERVED_AUD`, `CALL_RESERVED_USDC`, `CALL_RELEASED_AUD`, `CALL_RELEASED_USDC`, `BUYER_SALE_SETTLED`, `BUYER_ADJUSTED`, `TREASURY_CAPACITY_SYNCED`, `PROVIDER_OBLIGATION_ACCRUED`, `PROVIDER_SETTLED`, `PROVIDER_REVERSED`, `SPENDING_PERIOD_INCREASED`, `SPENDING_PERIOD_DECREASED`.

Account families: `world`, `processor`, `accounts`, `calls`, `agents`, `legal_customers`, `spending_periods`, `provider_obligations`, `providers`, `adjustments`, `treasury`, and `platform` split into expense, sales, and GST.

v1.3 is still in the tree. Its AUD reserve posts an agent generation budget. v1.4 keeps that chart and replaces the AUD reserve, release, and settlement scripts with daily and monthly period accounts. A period-aware Call does not also post the generation budget. Old Calls still have to replay against the old script. New Calls use the new one. One ledger, two schemas.

### Caps checked before a paid Quote: 7

1. Per-call maximum on the agent's grant.
2. Account available AUD.
3. Legal-customer exposure available. Sandbox cap is `4999999999` micro-AUD, just under A$5,000, while a single top-up principal may be as high as A$25,000. These are not the same number.
4. Corporate USDC treasury available for the Provider amount.
5. Daily spending-period available.
6. Monthly spending-period available.
7. Organisation monthly ceiling, when enabled.

The first six can be held inside the Formance reserve. The organisation ceiling is only a check at quote time (`evaluateOrganizationMonthlySpendFence`). Two quotes issued together can both pass it. The grant's daily and monthly maximums are also read at quote time, and the period accounts are reserved again at Call time. The agent limit is enforced twice, in two stores.

### State machines: 16

| # | Machine | States |
| --- | --- | --- |
| 1 | Funding command | `pending`, `succeeded`, `failed`, `outcome_unknown`, `reversed` |
| 2 | Stripe webhook inbox | `queued`, `applied`, `ignored`, `reconciliation_required`, `failed` |
| 3 | Stripe event log | `received`, `applied`, `ignored`, `failed` |
| 4 | Commercial policy | `active`, `superseded`, `suspended` across six policy families |
| 5 | Reconciliation case | `open`, `resolved` |
| 6 | Money document | `building`, `adjusting`, `rendering`, `awaiting_signature`, `issued`, `failed` |
| 7 | Legal-customer binding | `active`, `locked` |
| 8 | Saved-card mandate | `missing`, `ready`, `authentication_required`, `failed` |
| 9 | Quote | `issued`, `consumed`, `expired` |
| 10 | Call money | `reservation_pending`, `reserved`, `possibly_submitted`, `outcome_unknown`, `released`, `settled` |
| 11 | x402 payment attempt | `prepared`, `possibly_submitted`, `observed`, `reconciliation_required`, plus settlement `settled` / `not_settled` / `unknown` |
| 12 | Provider obligation | `accrued`, `held`, `payable`, `settled`, `reversed`, `disputed` |
| 13 | Usage charge | `free_tier`, `paid`, `insufficient_credit`, `outcome_unknown`, `refunded` |
| 14 | Connect account command | `pending`, `succeeded`, `failed`, `outcome_unknown` |
| 15 | Payout account | `not_started`, `onboarding_started`, `submitted`, `restricted`, `ready` |
| 16 | Payout | `review`, `held_kyc`, `held_threshold`, `transfer_pending`, `paid`, `reversed`, `failed`, `outcome_unknown` |

`payable` is on the obligation type and is not written by the managed-call path. Accrual, hold, settle, reverse, and dispute are.

The Call execution status (`pending`, `completed`, `refused`, `reconciliation_required`, `cancelled`) and the dispatch status (`enqueued`, `running`, `completed`, `failed`, `reconciliation_required`) are two more machines. They are not balances, but money will not move until they say what happened.

### One purchase, many statuses

A single top-up is five records: the funding command (its checkout status sits on that row), a webhook-inbox row, a stripe-event row, a Formance posting, and a rendered document.

A single Call can be an execution state, a dispatch state, a Formance financial state, an x402 attempt, a Provider obligation, a usage charge, a call projection (outcome, delivery, payment, and a copy of the obligation), and a receipt (`settled`, `refunded`, `reconciliation_required`).

Those copies exist so screens can read without calling Formance. They are also how a receipt can disagree with the ledger. The start line already forbids that: a displayed balance has to be rebuildable from postings, and a replay must not create a second credit, reservation, payment, charge, or invoice line.

## Where the model disagrees with itself

**The whitepaper's worked example is post-paid. The product that was built is prepaid.** Section 7.3 of the whitepaper has the consultancy on a metered account and, at month end, one tax invoice of A$342.10 plus A$34.21 GST. `START_LINE.md` forbids post-paid and negative balances, and the code follows the start line. Both documents are in the repo. Only one of them can be alpha.

**GST is not on the supply the whitepaper invoices.** Funding GST is 10% of the service fee, rounded to the cent, and that split is what `FUNDING_SETTLED` posts. Call tax in the sandbox controls is 0 basis points, so a settled Call posts the whole buyer amount to sales and nothing to GST. The whitepaper's invoice is 10% on the Calls. LCR 2018/2 is cited there for Agentic Economy as the GST supplier. GSTR 2003/5 is cited for vouchers. The code's `customer_contract_liability` classification fits a deposit or face-value credit, which is a reason to keep GST off the principal at top-up. It is not a reason to book the redemption as untaxed. Which moment is the taxable supply is the open adviser question in the start line. Alpha should not answer it by storing zero and describing 10%.

**Two GST formulas already exist.** `quoteAudAccountFunding` taxes the fee. `calculateAudGstSplit` and `splitInclusiveAudTax` treat a gross amount as GST-inclusive. One eleventh of A$5.28 is A$0.48. The fee-only GST on that same top-up is A$0.03. A live sweep on 29 September 2026 saw the receipt list and the CSV export show A$0.48 GST on both A$5.28 top-ups, while the funding quote and Stripe Checkout showed A$0.03. The receipt view now prints the funding command's stored `taxUnits`. Either those stored rows used the inclusive-gross split, or the screen did. A bookkeeper cannot have both.

**Providers are paid twice in the model and once in the Call.** Managed obligations are `settlementMethod: managed_x402` and `payoutEligibility: ineligible_x402`. The receipt says `payoutEligible: false`. Alongside that sits the full Connect path: account onboarding, a daily payout with gross, rake, and net, allocations back to `qualifiedUseReceipts`, review windows, KYC holds, and transfer reversals. The qualified-use row is insert-once and is described as evidence, with the ledger still the economic authority. The payout tables are a second economic authority waiting for a different commercial model. Alpha has one model.

**A second buyer model shares the receipt.** `account_aud` is the prepaid reseller sale. `seller_canary_x402` is a canary whose accounting policy records no buyer usage, no provider earnings, no rake, and no qualified use. They are different products in one union.

**Auto-recharge exists.** The live launch cap in the start line says no automatic replenishment and no automatic limit increase, and at most A$25 of cumulative live customer funding including every fee and tax. `moneyAutoRechargeSettings` can charge a saved card when the balance falls through a threshold.

## Three models people already understand

| | OpenRouter credits | Stripe usage billing | AWS Marketplace | This codebase today |
| --- | --- | --- | --- | --- |
| What the buyer holds | A prepaid credit balance | A card on file and an invoice at period end | An AWS account. The charge lands on the AWS bill | A prepaid AUD balance, plus seven caps in front of it |
| Who the buyer pays | OpenRouter | The Stripe merchant | AWS, when AWS is merchant of record | Agentic Economy, via Stripe |
| When the supplier is paid | OpenRouter pays the model vendor from its own account. The buyer does not see that rail | There is no separate supplier in the billing product | Accrued, then disbursed in fiat after a holding period, minus the listing fee | USDC on Base during the Call, from Agentic Economy's treasury. A Connect disbursement machine also exists and the x402 obligation refuses it |
| What stops an overspend | The credit balance, and a limit on the key | The invoice, after the usage, unless you add a credit grant or a pre-authorisation | The AWS account limit | A Formance reserve of AUD, exposure, day, month, and USDC, plus quote-time checks that are not all in that reserve |
| Tax document | A receipt for the credit purchase, in OpenRouter's selling entity | Stripe Tax on the invoice | Tax on the AWS bill, collected by the marketplace in many countries | A funding quote with GST on the fee, call revenue with GST at 0, tax invoices withheld |
| What "unknown" means | Do not credit the same payment twice | Webhook replay and dunning | Metering disputes and disbursement holds | `outcome_unknown` on funding, Calls, attempts, and payouts. The hold stays. A blind retry is refused |

OpenRouter is the buyer product: put money in first, spend it down, never let the agent create a receivable. Stripe usage billing is the whitepaper's month-end invoice. It is a bad alpha for an agent that chooses the supplier mid-task, because the Call happens before the card is captured. A failed invoice becomes credit risk, and the start line already bans unfunded Calls. Stripe Billing Credits are prepaid inside that invoicing system. They are closer to OpenRouter than to pure meters, and they still do not reserve a treasury or settle USDC.

AWS Marketplace is the institution: the buyer has one seller, one bill, and a tax invoice from the marketplace; the supplier is a payable, not a party on the buyer's card statement. That split of buyer sale and provider obligation is the part worth keeping. Marketplace's payout calendar is the part that does not fit. An x402 Provider is paid inside the HTTP request. Waiting a month to pay them would be a different protocol.

## What alpha has to keep

Money safety, from the start line's proof contract:

- One Stripe success creates the quoted credit once. The fee never reduces the credit. A refund reverses principal, fee, and GST together.
- An unknown funding or Call outcome is stored and held. It is not retried into a second payment.
- The Quote is the only price. It pins Tool version, input, USDC amount, AUD amount, rate evidence, and expiry. Drift refuses the Call before a reservation or a signature.
- The AUD hold and the USDC hold are one atomic posting, and they happen before the payment is signed. Concurrent Calls cannot spend the same credit or the same USDC.
- If the chain payment happened, the ledger does not unwind it. Buyer remedy and Provider settlement are separate legs. The paid-call remedy already says this.
- The customer balance is closed loop. No cash-out, no transfer, no yield, no crypto entitlement. That is what the start line is relying on for the non-cash-payment perimeter, pending the adviser.
- Amounts are integer strings with a scale. AUD and USDC are both scale 6. They are never netted into one leg.
- The number on the screen is the Formance balance, or it is labelled as not the balance.
- Replay of funding, reserve, settle, release, and document commands is idempotent.

Australian tax, which is narrower than a tax engine:

- The funding quote, the Stripe charge, the ledger, and the receipt use one GST figure. For the current fee policy that figure is 10% of the fee, rounded to the cent once, at quote time.
- The Call stores buyer consideration as revenue units and tax units from the policy that admitted it, even when an adviser later says the tax units are zero. `callTaxBps: 0` may remain as an explicit sandbox control. It must not be described as the whitepaper's 10% invoice.
- No tax invoice is issued while `taxInvoiceIssuance` is `disabled_pending_approval`, or while the ABN is missing, invalid, or the customer is not GST-registered. That gate is already the right one.
- The receipt names the seller, the amount, the GST treatment that was actually applied, and the Call or funding reference. It does not say "GST included" for a line whose tax units are zero.
- Customer tax facts are an ABN, GST registration, legal name, and an Australian address. They are not a second ledger.
- Seven-year retention is a policy number (`evidenceRetentionDays` is 2,557). It does not require a signed daily close in alpha.

One spending limit, reserved with the credit:

- The shared Account balance is the purse.
- One agent cap, below that purse, reserved in the same posting, and not reset when the credential is rotated. The start line requires this.
- The legal-customer cap stays only as long as one legal customer can have more than one Account, or as long as it is lower than the Account and is the number an adviser is holding the business to. It should be one cap, not also an organisation fence checked outside the ledger.
- Day and month together are two caps. Alpha needs one period. A monthly cap matches "how much this agent may spend" better than a UTC day plus a UTC month plus a generation budget that v1.4 already refuses to post.

## The simplest correct alpha

Keep OpenRouter's buyer. Keep Marketplace's split between the buyer's sale and the supplier's payment. Pay the supplier the way x402 requires, at Call time, from one corporate USDC pool. Leave Stripe usage billing and Connect disbursement for a later product that is actually post-paid or actually fiat-payout.

Concretely, the alpha purchase is:

1. **Funding.** One hosted AUD Checkout. States: `pending`, `succeeded`, `failed`, `outcome_unknown`, `reversed`. One inbox for the webhook. Principal to the liability account. Fee to revenue. GST on the fee to the tax account. One receipt that shows those three numbers and the total.
2. **Quote.** `issued`, then `consumed` or `expired`. Price from the persisted USDC/AUD rate or not at all.
3. **Call money.** `reserved`, `possibly_submitted`, then `settled`, `released`, or `outcome_unknown`. Release only when the payment was not made. Settle the buyer and the Provider together when delivery is known. If the payment was made and delivery failed, return the buyer's AUD and keep the Provider settlement.
4. **x402 attempt.** `prepared`, `possibly_submitted`, `observed`, or `reconciliation_required`. One attempt per Call effect. Unknown settlement does not sign a second payment.
5. **Obligation.** `accrued`, then `settled` or `reversed`. `held` only while the Call is unknown. `disputed` only when a person marks a real dispute. Delete `payable`. It has no writer on this path.
6. **One monthly agent allowance**, reserved in the same bulk as the AUD. Drop the daily ledger period, the v1.3 generation budget for new Calls, and the quote-time organisation fence.
7. **Treasury.** One pool, available and committed. A stale or short pool refuses the Call before the buyer is charged and before anything is signed.
8. **Documents.** A funding receipt and a Call receipt, `building` then `issued` or `failed`. No signature step, no daily close, no statement-rounding journal until an adviser asks for a periodic tax invoice. The invoice-ready export the start line asks for is a list of those receipts plus the policy digest that priced them.

That is seven machines (funding, quote, call money, x402 attempt, obligation, the monthly allowance adjustment, and the receipt). The Call execution status stays, because something has to say whether the Tool ran. It should not grow its own copy of the balance.

Formance stays. It is the thing that makes the reserve atomic and the replay safe. What shrinks is the chart: processor clearing, customer available, call reserved, one period available/reserved/spent, legal-customer exposure only if the cap is still real, treasury available/committed, obligation accrued/settled, provider settlement, sales, GST. Agent generation budgets, buyer adjustment accounts, and payout accounts are not on the alpha chart.

## What to leave out of this alpha

- Stripe Connect onboarding, transfers, rake, payout review, and `moneyPayoutAllocations`.
- `qualifiedUseReceipts` as a payable subledger. A Call receipt can carry the evidence refs.
- `seller_canary_x402` on the buyer receipt. A canary can exist. It cannot be a second way to charge the Account.
- Auto-recharge, until the live campaign's "no automatic replenishment" is deliberately replaced.
- Six live commercial-policy families. Pin one versioned policy document: reseller, business customers only, no crypto entitlement, fee and GST rates, funding bounds, quote TTL, ledger schema version. Suspending a family independently is an operator product.
- The second Stripe event table. One inbox, one applied result.
- `payable`, daily period accounts, and v1.3 agent-budget postings for any new Call. Keep v1.3 readable so old rows still replay.
- A general tax engine, Peppol, and a monthly GST invoice. Those wait on the adviser question the start line already names: GST timing, tax-invoice, adjustment, and service-fee treatment.

## The question

For alpha, is the money model the start-line prepaid balance: one AUD purse, one agent cap reserved with it, one pinned USDC/AUD Quote, one corporate USDC payment, and receipts that show the GST that was actually calculated?

Or is alpha the whitepaper's post-paid month-end invoice, which means dropping the purse and accepting credit risk the start line forbids?

The source is currently a third thing: the prepaid purse, plus a Connect payout company, plus a zero GST rate on the sale the whitepaper says is taxable. That third thing is the one to stop extending. The first is the simplest model that is still correct for money safety and for the tax facts an adviser will need. The second is a different product.
