# Treasury and money operating model: blind spots (30 September 2026)

Companion to `docs/production-north-star.md`. Sources: code facts from the ledger, settlement and custody paths (path:line below). Items marked **[legal]** or **[accountant]** need professional advice. This document names the question, not the answer.

## The model as the code implements it
1. A buyer tops up AUD through Stripe Checkout. The ledger books `world → processor → accounts:{a}:available` (principal), plus the service fee to `platform:revenue:sales` and GST to `platform:tax:gst`. GST is computed on principal + fee at top-up (`formance-schema.ts:121-149`, `aud-funding.ts:21-77`).
2. A Call reserves the buyer's AUD, commits USDC treasury capacity (`treasury:corporate:{t}:available → committed`), and accrues a provider obligation (`formance-schema.ts:367-399`).
3. aecon signs an EIP-3009 authorization with a CDP server wallet (`cdp.evm.signTypedData`). The seller or facilitator broadcasts it; aecon never submits a transaction and holds no ETH for gas (`cdp-x402-payment-signing.ts:203-212`). aecon verifies the transfer on 2 Base RPCs with 12 confirmations.
4. The buyer is charged only with a verified settlement, a valid output and `disposition === 'succeeded'`. The reserved AUD then moves to sales revenue, and committed USDC moves to provider settlement (`brokeredX402.ts:198-231`, `transitions.ts:91-128`).
5. aecon is the **merchant of record**: `buyerCharge` is the full price, `serviceFee = 0`, revenue is `platform:revenue:sales`, and the seller is a provider cost (`brokeredX402.ts:76-99`). Call tax is set to zero (`issueQuote.ts:154-156`).
6. There is no withdrawal of unused balance and no expiry. A full Stripe refund reverses principal, fee and GST; partial refunds open reconciliation (`stripeRefundPipeline.ts:89-105`).
7. Nothing in code pays AUD out of Stripe or buys USDC. One CDP wallet address serves both Base Sepolia and Base mainnet (`moneyTreasuryObservation.ts:31-40`).

## What we aren't saying out loud

### A. The AUD side and the USDC side are not connected by anything
- **No on-ramp.** Customer AUD settles into Stripe, then the bank on Stripe's schedule. USDC must be bought separately through an exchange and sent to the CDP wallet. None of that is in code or in a runbook. Somebody has to do it, on time, with a counterparty.
- **Working capital.** USDC leaves instantly, while AUD reaches the bank days later (and new Stripe accounts may get reserves). aecon pre-funds every Call from its own float, and float size is effectively a limit on growth.
- **How does on-chain USDC become ledger capacity?** The ledger has `treasury:corporate:{t}:available`, and the treasury observation reads the on-chain balance. What books a USDC deposit into ledger capacity, and what reconciles the ledger against the chain? If they drift, Quotes either refuse wrongly or overspend the wallet. **Verify, then build the booking and the reconciler.**
- **FX exposure.** Balances are AUD, obligations are USD. Between top-up and spend, and between spend and the next USDC purchase, currency moves fall on aecon. Pricing uses a public Coinbase USDC/AUD rate (refused if older than 24 hours) plus a round-up to the cent. There is no explicit spread or FX buffer policy.
- **Depeg.** The float is held in USDC. A depeg (it happened in March 2023) directly changes what the float is worth against AUD liabilities.

### B. What the code does contradicts what we decided
- **"A paid 200 is a success" is not what the code does.** The buyer is charged only when the output is valid. A seller that settles on-chain and returns an invalid body leaves aecon having paid USDC with no AUD sale. The call sits in reconciliation, and the remedy path needs quarantined response bytes this branch lacks (`brokeredX402.ts:198-206`, `moneyManagedCallRemedyActions.ts:50-58`). Choose one rule and make the code match it.
- **Seller errors after settlement.** Verified settlement plus a non-2xx response leaves the Call in `reconciliation_required` with the buyer uncharged (`route-transport-http-json.ts:257-275`). That is an aecon loss, and nothing drains that queue today.
- **Settled but never broadcast.** aecon signs; the seller broadcasts. If the seller never broadcasts, the authorization is valid until `validBefore`. The AUD stays reserved and the capacity stays committed. What releases them, and when?

### C. Custody is a hot wallet with keys in environment variables
- **CDP server wallet.** Anyone holding `CDP_API_KEY_*` and `CDP_WALLET_SECRET` can sign within policy caps. The caps (per-Call and daily max) are the whole blast radius. Who holds these secrets, where do they live, how are they rotated, and what is the break-glass procedure?
- **One address for both networks.** Test and real money share an address. Separate them. Production should have its own CDP account and policy.
- **Float concentration.** All customers' spending power sits in one hot wallet. Keep only operating float hot, with the rest in a separate, cold or multisig wallet refilled on schedule.
- **Single vendor.** A CDP outage or account action stops all payments. There is no second signer or exit plan.

### D. Paying arbitrary addresses
- **Sanctions screening.** aecon pays whatever `payTo` a listing declares. Paying a sanctioned address is unlawful. There is no screening in code; the only mention is a clause in the terms (`terms.contracts.ts:83`). Screen `payTo` before paying (for example Chainalysis or TRM), and refuse on a hit. **[legal]**
- **Seller identity.** aecon doesn't know who it pays. That is fine for the product (directory first), but it matters for AML: the directory makes aecon the payer to unknown counterparties. Per-seller velocity limits and exposure caps reduce the fraud-and-cash-out pattern.

### E. Regulation and tax
- **AML/CTF.** Customer AUD becomes USDC payments to third parties. That may make aecon a digital currency exchange or remitter under AUSTRAC. **[legal]**
- **Stored value.** A prepaid AUD balance with no withdrawal may be a purchased payment facility. Being unable to cash out unused balance may conflict with consumer law or unfair-terms rules. **[legal]**
- **Customer funds commingled.** Prepaid balances sit in aecon's Stripe or bank account alongside operating money. Is a segregated or trust account required? **[legal]**
- **GST.** aecon is merchant of record and charges GST on principal + fee at top-up, which is before any supply exists. Unused balance, refunds and foreign sellers (imported services) all need a position. **[accountant]**
- **Crypto tax.** Every USDC payment disposes of a crypto asset. Each micro-payment is a potential CGT or trading-stock event measured in AUD. At thousands of Calls a day this is an accounting system, not a spreadsheet. **[accountant]**
- **Accounting.** Balances are a liability. Revenue is recognised on the Call (`platform:revenue:sales`). USDC float valuation and breakage (balances that are never spent) need a policy. **[accountant]**

### F. Stripe
- **Terms of service.** Stripe restricts businesses tied to virtual currency. Card top-ups whose spending turns into crypto payments may trip Stripe's restricted-business rules, and a terminated account stops all funding. Confirm aecon's use case with Stripe before alpha.
- **Chargebacks.** Card top-ups can be reversed; USDC already sent can't. Use Radar and 3DS, cap first top-ups, and set a policy for accounts with a disputed top-up (freeze the balance).
- **Payouts.** None in code. The payout schedule and any reserves decide the working-capital gap in A.

### G. Operations
- **Who refills the float, how often, and what happens at 2am on a weekend** when it runs low? Quotes refuse with `treasury_capacity_unavailable`, which is fail closed and correct, but for users it's an outage.
- **The reconciliation queue has no owner.** Unknown outcomes keep AUD reserved and obligations held (`transitions.ts:35-54`). Someone must work that queue, within a time bound.
- **Three ledgers, no reconciler.** Stripe, Formance and the chain can each be right on its own and wrong together. The reconciler (L4 in the measurement doc) is the only thing that will tell you.

## What to do (maps to milestones)
| Milestone | Action |
|---|---|
| M1 | Separate the production CDP account and address from sandbox. Choose the paid-200 rule and make the charge logic match it. |
| M2 | A deposit booking (on-chain USDC in → ledger capacity), a Formance↔chain↔Stripe reconciler, a float runway alert, and a secrets custody and rotation runbook. |
| M3 | Sanctions screening of `payTo` before signing. Per-seller velocity limits and exposure caps. Drain the reconciliation queue within a time bound. Release capacity for unbroadcast authorizations after `validBefore`. |
| M4 | Legal: AUSTRAC, stored value and withdrawals, segregation of customer funds, consumer terms. Accountant: GST as merchant of record, crypto disposals, liability and breakage. Stripe: use-case confirmation. |
| M5 | A float policy (hot vs cold, target runway in days), an on-ramp runbook (exchange, cadence, owner), and an FX spread or buffer policy. |
| M6 | A second signer or custody exit plan. Revisit a withdrawal of unused balance based on legal advice. |
