> **Archived 5 October 2026.** Dated evidence or proposal; not a current work queue or approval. See the [archive index](../README.md) for its successor and remaining limits.

# aecon operating model v1 (30 September 2026)

Decided by Joel. Consensus researched from primary sources (links inline). Stress test of the principal model, pricing, and evolution: `docs/commercial-model-stress-test.md`. Items marked **[confirm]** need a lawyer or accountant before open beta; alpha does not depend on them.

The investment thesis discusses [moat and defensibility](../../strategy/investment-thesis.md), including the unresolved dependence on x402 adoption.

## The model in one paragraph
aecon is a routing service for paid agent Tools, on the OpenRouter pattern. Users hold **AUD credits**, an account-based claim usable only on aecon's own service. Credits are not cash, not transferable, and never crypto held for the user. Each successful Call (settled, HTTP 200) draws credits at the displayed price. aecon, as principal, buys each seller's service by paying USDC from **its own** float in a business Coinbase CDP server wallet.

## Phases
| | Alpha | Open beta |
|---|---|---|
| Users | 20 invited | Anyone |
| Credits | A$10 **promotional** credit each, granted by admin | Bought by card (Stripe Checkout) plus any promo |
| Float funding | Joel funds the production CDP server wallet from his own crypto, recorded as a director loan or capital contribution **[confirm]** | Company-funded float; AUD revenue converted to USDC through an exchange |
| Stripe | Not used (no user payments) | Only after **written pre-approval** from Stripe |
| Max exposure | 20 × A$10 = A$200 of seller payments | Float policy and caps |

The code path is identical in both phases. Only the source of the float differs, so alpha genuinely validates beta.

## Pricing and operations (decided: operate like OpenRouter)
- **Tool prices pass through at the seller's list price**, converted from USDC to AUD at the reference rate and rounded up to the cent. No per-Call markup (`buyerPricingMarginBps = 0`, already the default in `commercial-policy.ts:139`).
- **Top-up fee: 5.5%, matching OpenRouter's standard rate** ([pricing](https://openrouter.ai/pricing)). It covers card fees, FX drift and margin.
  - Code: `fundingServiceFeeBps` is a commercial-policy control, today 500 (`commercial-policy.ts:138`). Set it to 550 through the admin commercial-policy proposal.
  - A business rate like OpenRouter's 8% can come later with invoiced billing.
- **GST** for Australian customers applies to the whole top-up (principal + fee), at top-up, as built. The accountant confirms before beta.
- **Chat is the acquisition channel and the showcase.** It is also a potential new service line and the sticky surface: saved jobs, history, recurring answers. Its model cost is treated as acquisition cost for now; revisit pricing once usage data exists.
- **Agents and developers** (API/MCP/CLI search → describe → call) are the volume line. They cost aecon little in model tokens.
- **"Report this answer" is on.** A clear failure on a paid Call can be reported, and the Call's credits come back.
  - Limited per user per day (suggested 3; admin-configurable).
  - Each report penalises the seller's ranking and is recorded as delivery evidence.
  - This is the consumer-law remedy, turned into a trust feature.
- **Beta geography:** Australian consumers plus Australian businesses. No overseas consumer sales, so no EU or UK VAT registration yet.
- **No category filters at launch.** Unlawful content is still removed on complaint, through the takedown and delisting process.
- **Evolution:** principal over the open directory now. Later, a marketplace lane for sellers who sign with aecon (seller of record, payouts). aecon's own services stay on the principal lane.

## Credit terms (OpenRouter-style, adapted for Australia)
- **Name:** "credits". The balance shows purchased and promotional credits separately. Promotional credits are drawn first.
- **Promotional credits:** no cash value, non-transferable, non-refundable, with an expiry date stated when granted. Precedent: OpenRouter and Anthropic promo terms ([OpenRouter terms §4-5](https://openrouter.ai/terms), [Anthropic credit terms](https://www.anthropic.com/legal/credit-terms)).
- **Purchased credits:**
  - **No expiry initially.** US products use 12 months; in Australia, expiry and non-refundability can be unfair contract terms ([ACCC](https://www.accc.gov.au/business/selling-products-and-services/contracts)).
  - **Unused purchased credit is refunded to the original card on account closure**, net of any disputed amounts.
  - Gift-card rules exclude reloadable credit ([reg 89A](https://www.legislation.gov.au/F1996B01420/2026-05-20/2026-05-20/text/original/epub/OEBPS/document_1/document_1.html)). **[confirm]**
- **What draws credits:** a Call with verified on-chain settlement and a 2xx response. aecon does not judge output quality. A seller error or a non-response is not charged; aecon writes off any USDC already settled and demotes the seller.
- **Liability:** aecon doesn't verify sellers or outputs. Liability is capped at the greater of fees paid in the last 12 months or A$100, subject to non-excludable consumer guarantees (the OpenRouter and treg pattern). **[confirm]**
- **Auto top-up:** off. Opt-in only, if it's ever added.

## Tax
- **Credits are prepaid usage credits, not vouchers.** GSTR 2003/5 ¶¶49-54 agrees: account credit for unspecified future services is not a Division 100 face-value voucher ([ATO ruling](https://www.ato.gov.au/law/view/document?DocID=GST/GSTR20035/NAT/ATO/00001#P49)).
- **Timing is the only question.** Either the top-up is payment for aecon's service, with GST attributed at top-up (the attribution rules put GST in the period consideration is received), or the top-up is a deposit into an account, with GST on each credit draw.
  - The Anthropic API charges tax when credits are added. OpenAI and OpenRouter don't publish their timing.
  - The current code uses GST at top-up on principal + fee (`formance-schema.ts:121-149`).
- **Default: keep GST at top-up (decision R2 stands).** It is simplest, matches market practice, and is what the code does. Consequences:
  - A refund of unused credit needs a GST adjustment.
  - Promotional credits carry no GST: no consideration at grant or on use.
  - The accountant confirms the timing before beta. **[confirm]**
- **aecon is the principal.** It supplies its own routing service to the user. Sellers are aecon's suppliers. Customer-facing wording must never say aecon buys or pays "on the user's behalf": that framing points toward payments or remittance (AUSTRAC "for a person"; Stripe's "purchase from third parties" restriction).
- **USDC float** is likely trading stock (held to pay suppliers in ordinary business). Each payment is a disposal: record the AUD value per transfer ([ATO crypto in business](https://www.ato.gov.au/businesses-and-organisations/income-deductions-and-concessions/income-and-deductions-for-business/crypto-assets-and-business/crypto-assets-used-in-business)). **[confirm]**
- **Founder-funded alpha float:** Joel's transfer disposes of his personal crypto. Record the date, amount, AUD value and purpose, and book it as a director loan or capital contribution. **[confirm]**

## Regulatory position (as researched; counsel to confirm)
- **AUSTRAC:** from 31 March 2026, the virtual asset service is exchanging "for a person". aecon buying USDC for its own use to pay its suppliers is not that service by itself. There is no express safe harbour, so aecon must never take customer orders for crypto, hold crypto for users, or move crypto on their behalf ([AUSTRAC](https://www.austrac.gov.au/new-austrac/designated-services-newly-regulated-entities/virtual-asset-designated-services)). **[confirm]**
- **ASIC:** credits that can only pay aecon fall within the single-payee exclusion (Corporations Act s763D(2)(a)(i)) and the issuer-only exemption (reg 7.6.01(1)(lb)). The PSRA purchased-payment-facility test and the Treasury payments licensing reforms are still open. **[confirm]**
- **Privacy:** queries are sent to sellers, and the terms must say so.

## Stripe (open beta)
- The Australian Services Agreement §1.2(a)(ix) requires **written pre-approval** for restricted businesses. "Virtual credits" and seller-maintained stored value are restricted categories ([restricted list](https://stripe.com/au/legal/restricted-businesses)).
- **Do not use Stripe Billing's credits feature.** Billing terms §4.1 forbid using it to "enable the purchase of products or services from third parties" ([Billing terms](https://stripe.com/au/legal/ssa-service-terms#stripe-billing)). Use aecon's own ledger funded through ordinary Checkout.
- **Ask Stripe for approval** with the full funds flow, checkout wording, credit terms and refund policy attached.
- **Fraud:** Radar with risk-based 3DS, CAPTCHA and rate limits against card testing, credit granted only on confirmed payment, usage evidence kept for disputes, and an aecon cap on new-account purchases ([disputes](https://docs.stripe.com/disputes/prevention/best-practices)).
- **No Stripe route turns AUD into USDC in Australia.** Treasury stablecoins exclude AU, Onramp is for customers and is US/EU only, and Connect USDC payouts are US-platform only ([Treasury](https://docs.stripe.com/treasury/stablecoins#availability)). The on-ramp is an exchange runbook.

## Custody and payments (CDP server wallet)
- **A separate production CDP project, wallet and policies.** Nothing is shared with sandbox. Secrets live in a secret manager with named holders, and are rotated on exposure and on a schedule ([CDP security](https://docs.cdp.coinbase.com/wallets/security-and-policies/security-overview)).
- **CDP's OFAC screening and policy engine do not cover x402.** x402 signs EIP-3009 typed data off-chain, and CDP documents no daily cap on `signEvmTypedData`. So aecon enforces its own controls before signing:
  - **Sanctions screening of `payTo` before every signature**, on current OFAC data plus a blockchain screening provider. Screen fresh each time; Chainalysis forbids caching its data ([OFAC FAQ 562](https://ofac.treasury.gov/faqs/562), [Chainalysis AUP](https://www.chainalysis.com/acceptable-use-policy/)).
  - **aecon-side caps:** per Call, per rolling day, and per payee.
- **Float policy:** keep the forecast 24-48 hours of payouts hot and top up daily from a separate reserve. Coinbase keeps ≤2% of customer assets hot, as a benchmark only ([10-K](https://www.sec.gov/Archives/edgar/data/1679788/000167978826000015/coin-20251231.htm)). Managed on `/admin/treasury` (`docs/designs/2026-09-30-admin-treasury.md`).
- **Depeg circuit breaker:** pause payments on a material USDC/USD deviation or a Circle redemption disruption, and resume only after checks and human approval. In March 2023 USDC traded near 90¢ ([Fed note](https://www.federalreserve.gov/econres/notes/feds-notes/in-the-shadow-of-bank-run-lessons-from-the-silicon-valley-bank-failure-and-its-impact-on-stablecoins-accessible-20251217.htm)).
- **Unbroadcast authorizations:** after `validBefore`, check `authorizationState(from, nonce)` together with receipts and events. If unused, release the credits reservation and the capacity ([EIP-3009](https://eips.ethereum.org/EIPS/eip-3009)).

## Engineering backlog from this model
| # | Change | Milestone |
|---|---|---|
| 1 | Promotional credit grant (admin action; separate promo ledger account; drawn first; expiry) | Alpha |
| 2 | Charge on settled 2xx (paid-200 rule); seller errors written off | Alpha |
| 3 | GST timing confirmed by the accountant (default: at top-up, as built); GST adjustment on refunds of unused credit | Before beta **[confirm]** |
| 4 | Separate production CDP wallet; `/admin/treasury`; deposit booking; reconciler | Alpha |
| 5 | Screen `payTo` before signing; aecon-side per-Call, rolling-day and per-payee caps | Alpha |
| 6 | Release unbroadcast authorizations after `validBefore` | Alpha |
| 7 | Depeg circuit breaker | Beta |
| 8 | Stripe Checkout funding of own-ledger credits with Radar; refund of unused purchased credit on closure | Beta (after Stripe approval) |
| 9 | Credits terms page and trust centre | Before alpha invites |
| 10 | Set `fundingServiceFeeBps` to 550 through the commercial-policy proposal | Before beta |
| 11 | "Report this answer": refund the Call's credits, with a daily limit per user, a seller ranking penalty and a delivery-evidence record | Alpha |
| 12 | Beta signup limited to Australian customers (country at signup, billing country on Stripe Checkout) | Beta |
