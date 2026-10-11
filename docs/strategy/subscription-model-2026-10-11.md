# Aecon subscription model: options and recommendation

Date: 2026-10-11. Status: proposal for Joel's decision. Nothing here is built. Everything sits behind the existing payments switch, which is off.

Evidence caveat: analogue prices are USD as published and checked 2026-10-11, several from competitor blogs. Tax and consumer-law points are unverified and need an accountant and Stripe's written view before launch.

## 1. Where aecon is today

Aecon has a prepaid-credit money model with a fee on loading and no subscription of any kind.

- Loading: Stripe Checkout in `mode: "payment"`, hosted page, `automatic_tax: {enabled:false}`. Line items are principal, service fee, then GST (`src/lib/server/stripe-checkout-evidence.ts:330-352`, session creation at `:62`). Amounts must sum exactly to the total (`:330`).
- GST: inclusive GST tax-rate ID from env `STRIPE_AU_INCLUSIVE_GST_TAX_RATE_ID` (`src/lib/server/stripe-money-provider-config.ts:21,60`). Fee and GST are basis points from commercial policy (`convex/moneyCommercialPolicy.ts:80-81`, `src/modules/money/internal/funding-quote.ts:34-35,95-107`). Both are defined only for one-off loads.
- Ledger: Formance chart in `src/modules/money/formance-schema.ts:118-150` (`processor.settlement`, `accounts.available`, `calls.buyer_reserved`, `agents.budget_*`, `legal_customers.exposure_*`, `provider_obligations.*`, `platform.revenue.sales`, `platform.tax.gst`). `FUNDING_SETTLED` (`:152`) and `FUNDING_REVERSED` (`:182`) split principal, fee and GST. The schema is versioned: v1.4 adds period accounts, v1.5 adds promotional grant accounts (`:537`, `:567`). That is the precedent for a new template version.
- Webhooks: `src/routes/api.stripe.webhook.ts` handles `checkout.session.completed` and `async_payment_succeeded` (`src/lib/server/stripe-money-webhook.ts:169-174`), `checkout.session.expired` (`convex/lib/money/funding/stripeEventPipeline.ts:190`) and `refund.failed` (`stripe-money-webhook.ts:75`). Fulfilment is at `convex/lib/money/funding/returnFulfillment.ts:60`. There are no `invoice.*` or `customer.subscription.*` handlers.
- Auto top-up: no backend. Only the `auto_topup_failed` notification type exists (`src/modules/principal-account/account/convex-schema.ts:157`, `convex/lib/principalAccount/notifications/enqueue.ts:23,31`). No saved-card or setup-intent flow.
- Spend caps: per-agent budget accounts and spending periods (`src/modules/money/managed-call-contracts.ts:16,46`, `convex/agentSpendingPeriods.ts`) and legal-customer exposure caps. Nothing per owner or per plan.
- Trial: admin-issued per email, `TRIAL_AMOUNT_UNITS = '10000000'` (`src/modules/money/trial-access-contracts.ts:3`, `convex/lib/money/trials/authority.ts:29-40`).
- Existing Stripe Billing: none. The only subscription hits are copy strings ("no subscription") and an Arc Pro UI component (`src/components/ae/shared/arc-pro/usage-billing/usage-billing.tsx`).

Blockers to any plan that includes monthly credit: recurring fee and GST treatment is undefined; the ledger has no plan liability account; Stripe has no recurring path or reconciliation; spend caps are not plan-shaped.

## 2. What comparable products do

| Product | Shape | Overage or limit behaviour | Source |
|---|---|---|---|
| OpenRouter | Prepaid credits, no subscription. 5.5% card fee ($0.80 min), 5% crypto. Auto top-up. | Stops at zero balance | openrouter.ai/docs/faq |
| Replicate | Pure pay-as-you-go | Billed per second or unit | replicate.com/pricing |
| Anthropic API | Prepaid credits, per-token. Consumer plans bundle credit (Max $100 and $200/month). | Spend tiers unclear, sources conflict | claude.com/pricing |
| OpenAI API | Prepaid credits, tiers unlock on cumulative purchase ($5, $100, $500) | Monthly caps per tier | developers.openai.com rate-limits guide |
| Vercel | $20/month per seat with $20 included usage | Uncapped overage, default $200 budget with pause option | vercel.com/pricing |
| Apify | Free $0 ($5 usage), Starter $19, Scale $199, Business $999 | Overage billed up to a set limit, free plan blocked | apify.com/pricing |
| Firecrawl | Hobby $16 to Scale $599, monthly credits | Pay-as-you-go on paid plans only, user-set monthly cap | firecrawl.dev/pricing |
| Browserbase | Developer $20, Startup $99, included hours | Per-unit overage ($0.12 or $0.10 per hour) | browserbase.com/pricing |
| Zapier | From $19.99/month annual, task quota | Overage 2.5x base, capped at 3x subscription | zapier.com/pricing |
| Make | $9/month for 5,000 credits | Hard stop until bundle bought | make.com/en/pricing |
| RapidAPI | Per-API provider plans (unverified, old docs) | Provider sets overage or 429 | docs.rapidapi.com |
| Hugging Face | PRO $9/month includes $2 inference credit, pay-as-you-go beyond | Overage metered | huggingface.co/docs/inference-providers |
| RapidAPI marketplace take | 20% or 25%, sources conflict | n/a | RapidAPI payouts doc, Geekflare |

Pattern: three shapes. Pure prepaid credit (OpenRouter, Replicate, API providers). Plan plus included usage plus overage (Vercel, Apify, Firecrawl, Browserbase, Zapier). Hard-stop quotas (Make, free tiers). The common overage defence is a user-set cap or budget. Aecon today matches shape one.

## 3. Options

### A: Credits plus loading fee, with auto top-up and owner spend cap

- Pros: matches OpenRouter and API-credit shape; reuses the live loading flow and the `auto_topup_failed` notification; no new ledger template (each reload runs the same `FUNDING_SETTLED` split); no subscription-law exposure, but off-session charges need customer consent, mandate records and failed-charge and chargeback budget; directly answers the overage-control pattern.
- Cons: no recurring revenue; small reloads can earn less than fixed Stripe cost, so it needs a minimum top-up.
- Customer impact: predictable spend via cap, no lock-in, nothing to cancel.
- GST and accounting: unchanged. Fee and GST on each load. Whether prepaid AUD credit is a voucher is open and affects timing of GST on the principal.
- Build cost: Stripe `setup_future_usage` on Checkout (confirm AU support) plus off-session PaymentIntents; extend `agentSpendingPeriods` to an owner-level period; handlers for off-session results. No new vendor.

### B: Subscription with monthly included credit, top-ups and overage

- Pros: recurring revenue, Vercel and Firecrawl shape, Hugging Face precedent at the small end.
- Cons: Stripe credit grants only draw on metered prices through Meters, and aecon calls are not billed through Stripe, so grants cannot pay for calls. Stripe's prohibited uses (stored value, credits usable for third-party payments) may conflict. Grants do not recur natively, so each cycle needs a webhook-issued grant. Needs recurring fee and GST rule, plan liability account, renewal webhooks.
- Customer impact: included credit expires or not (decision); brings subscription rules into scope.
- GST and accounting: plan fee is a taxable supply, priced GST-inclusive. Included credit is deferred liability; treatment depends on voucher status. Needs accountant.
- Build cost: Stripe Billing licensed price, `invoice.paid` and `customer.subscription.*` webhooks, Stripe Tax; Formance v1.6 template with a plan-credit liability account following the v1.5 promotional pattern; plan credit drawn before prepaid and expiring at period end. Avoid Stripe credit grants.

### C: Platform subscription for features, credits separate

- Pros: credits stay prepaid and separate, so no stored-value or grant issue; simple licensed price; a monthly fee billed in advance is a contract liability recognised over the period, so it needs a deferred-revenue account and an accountant-confirmed GST timing rule (build item 9).
- Cons: no team or seat model exists; no usage base yet to justify seats, analytics or priority routing; needs renewal webhooks and a plan entity.
- Customer impact: pay for features, not for spend; does not by itself give spend predictability.
- GST and accounting: flat fee is a taxable supply with GST on the fee only, not on pass-through provider payments.
- Build cost: Stripe Billing licensed price, Customer Portal for self-serve changes, smart retries and dunning, Stripe Tax; new plan entity in the principal account.

### D: Provider-side subscription (listing or promotion fee)

- Pros: monetises supply.
- Cons: adds cost to supply acquisition in a cold marketplace; providers are paid in USDC over x402, so a second billing rail; take-rate evidence conflicts; does not help buyers.
- GST and accounting: separate supply to providers, possibly offshore.
- Build cost: second Billing flow for providers. Not recommended now.

### E: Staged hybrid (A now, one subscription later, B and D held)

- Pros: sequences work so stage 1 reuses existing primitives; keeps stored-value, voucher and ACL questions off the critical path.
- Cons: no recurring revenue until stage 2; stage 2 choice (C or B-lite) is still open.
- Build cost: sum of A, then C or B-lite.

Open-source billing engines considered: Lago (AGPLv3, replaces Stripe's billing engine, heavy, poor fit), Flexprice (AGPL, adds a second system of record next to Formance), Autumn (Apache-2.0, Stripe-native plan and entitlement layer, young, only worth evaluating if entitlements grow), Orb and Metronome (closed, enterprise). None is needed for the first version.

## 4. Recommendation

Adopt E. Build A now: owner monthly spend cap, then auto top-up with a minimum reload and a user-set monthly cap. Defer any subscription until the payments switch is on and the Stripe, GST and ACL answers are in. Hold B and D.

Reasoning:
- Hypothesis, untested: activation is the first receipted call on real credit, and a subscription does not help it; auto top-up and trial-to-paid conversion might. No activation or conversion data is attached yet.
- Pay-per-call prepaid credit is a proven base (OpenRouter, API providers) and avoids subscription law. The Unfair Trading Practices bill starts 1 July 2027 and adds subscription-trap and drip-pricing rules reaching small-business subscribers (date and scope unverified against the enacted text; not relied on for the decision, and it is unchecked whether aecon's own business customers fall in scope).
- Aecon credits pay third-party providers, which sits close to Stripe's prohibited-use wording. Keeping credits as Formance balances and using Stripe only for cash and licensed prices avoids relying on Stripe credit grants.

Where the panel disagreed (four members, all backing E):
- Stage 2 shape. Pricing strategist and customer voice favour C (flat platform or team plan, credits separate). Marketplace founder and billing engineer favour B-lite (small monthly plan with included credit, Hugging Face pattern, Formance plan liability). C is lower risk but has no seat model to sell; B-lite fits a usage product but carries the stored-value, voucher and ACL questions.
- Whether C is worth building at all yet. Founder rejects it (no usage base); billing engineer defers it until team accounts exist.
- Fee on recurring cash. Founder and billing engineer want a recurring fee and GST rule set before B-lite; pricing strategist treats the flat fee as a taxable supply with no loading fee.
- Agreement: D rejected by all; B not before the Stripe view and ACL check; auto top-up plus cap first.

## 5. First version

Stage 1 (ships first, no subscription; gated by the measurement step and written accountant answers in section 7):
- Plan: Pay as you go. Price: loading fee as today. Includes prepaid AUD credit, owner monthly cap, auto top-up, low-balance and cap-reached notices.
- Minimum reload: set from actual Stripe AU fees (to be measured).
- Refund and expiry rule for unused prepaid credit: must be written before any load goes live.

Stage 2 (hypotheses only, not scheduled until interview and waitlist results are in; price points below are untested hypotheses, not derived from cost or a stated FX rate):
- Pro (C): flat monthly fee, test A$20 to A$60 inclusive of GST. Includes team seats, higher caps, analytics, priority routing. Credits stay separate.
- Plus (B-lite): small monthly fee, test A$10 to A$30 including A$5 to A$20 of platform credit drawn before prepaid, expiring at period end. Only if Stripe, accountant and ACL answers allow.

How it shows:
- Pricing page: show only what can be bought today (Pay as you go). Pro and Plus appear only when purchasable, never as fake doors. Layout from the stock Arc pricing block; GST-inclusive prices, cap and cancellation terms stated up front (drip-pricing rule).
- `/for-agents`: one line on spend cap and auto top-up for agents acting on a budget; no plan upsell in the agent path.
- Credit page: auto top-up toggle, threshold, monthly cap, saved card; later, plan card with renewal date and cancel button.
- Emails: low balance, auto top-up succeeded, auto top-up failed (reuses `auto_topup_failed`), cap reached; later, renewal notice before each charge and cancellation confirmation.
- Receipts: tax invoice per reload, split principal, fee, GST as today (`convex/lib/money/documents/taxInvoices.ts`); later, a separate tax invoice for the plan fee. Plan fee and credit never share one line.

## 6. Build plan

All tasks behind the payments switch. Reference: OpenRouter auto top-up, Vercel spend budget, Stripe Billing.

Stage 0 (before any Stage 1 build): pull funded-account data (repeat reloads, zero-balance events, trial cohort) and measure Stripe AU fees including the fixed component, payout timing and USDC conversion cost; record both in this doc. Run 10 to 15 buyer interviews and a non-transacting waitlist. If repeat-reload data is thin, drop auto top-up and the owner cap from Stage 1 and spend the effort on first-call activation.

Stage 1:
1. Owner-level monthly cap: add an owner period to `agentSpendingPeriods` reusing period accounts (v1.4); enforce in managed-call reserve. Verify with an `ae` CLI call that is refused at the cap.
2. Minimum reload and fee floor in `funding-quote.ts` and `moneyCommercialPolicy.ts`, from measured Stripe AU fees.
3. Saved card: Checkout with `setup_future_usage: "off_session"`; store payment method id against the legal customer.
4. Auto top-up trigger: when Formance available balance falls below threshold and cap allows, create an off-session PaymentIntent that flows through the existing `FUNDING_SETTLED` path.
5. Off-session webhook handling: `payment_intent.succeeded` and `payment_intent.payment_failed` in `stripe-money-webhook.ts`; failure enqueues `auto_topup_failed`.
6. Notifications and emails: low balance, cap reached, top-up succeeded.
7. UI: credit page controls and pricing page copy, from stock Arc blocks.

Stage 2 (after decisions 1 to 4 below):
8. Stripe Billing setup: product and licensed price in AUD, Stripe Tax for AU GST, Customer Portal, smart retries.
9. Plan entity in principal account plus `customer.subscription.*` and `invoice.paid` webhook handlers through the existing inbox and workpool.
10. Plan commercial policy entry and tax invoice for the plan fee.
11. If B-lite: Formance v1.6 template with plan-credit liability account; webhook-issued monthly credit on `invoice.paid`; draw order and expiry.
12. Cancellation and renewal flow meeting the 2027 ACL rules: one-click cancel, renewal notice, total price shown.

## 7. Decisions Joel must make

1. Approve E and stage 1 now.
2. Stage 2 shape: C (Pro features) or B-lite (Plus with included credit), or neither until usage proves it.
3. Before Stage 1 ships, get written answers on: voucher status and GST timing of loaded principal; GST computed as 1/11 of the tax-inclusive amount (add a test case); principal versus agent for provider payments and so gross versus net revenue; fee timing, breakage and refund rules. Commission a written view from Stripe on stored value for credits that pay third-party providers, and an accountant view on voucher status of prepaid AUD credit and GST on recurring fees.
4. Should the loading fee apply to the plan fee, and should plan credit expire at period end.
5. Minimum reload amount and default cap once Stripe AU fees are measured.
6. Price ranges to test in section 5, and whether to run them as a waitlist or alpha cohort first.

## 8. Review notes

Two outside reviews (CFO, skeptical investor) were applied. Accepted: Stage 0 measurement gate, activation claim relabelled as hypothesis, auto top-up exposure corrected, Option C accounting corrected, pricing page limited to purchasable plans, Stage 2 price points labelled hypotheses and unscheduled, UTP bill relabelled unverified, GST, principal-or-agent, refund and expiry questions added to decision 3.

Rejected or deferred:
- Benchmark rows with conflicting sources (L28, L36, L38): kept as context, not used as anchors in the recommendation; per-source dated logs deferred to the pricing work.
- Full P&L, cash-flow forecast and AUD price ladder net of GST before decision 1: deferred. Inputs (Stripe AU fees, reload behaviour) do not exist yet; Stage 0 produces them, and a model built now would be invented numbers.
- Trial credit unit and accounting treatment (L17): the unit is micro-units of AUD in code; treatment goes to the accountant list in decision 3 rather than being specified here.
- Stored-value and payments-licensing legal view as a separate gate: already covered by decision 3 (Stripe written view); the legal view is added to the same commission, not a new decision.
- Dropping Stage 2 planning entirely: kept as labelled hypotheses, since the options analysis is the doc's purpose; only scheduling is withheld.
- Panel agreement as evidence: acknowledged as internal opinion only.
