# Marketplace pattern borrow — supply, demand, billing, and registry UX

Date: 2026-07-30. Source: MarketplacePatternScout (full transcript `history://MarketplacePatternScout`; verified findings relayed in `local://marketplace-findings.md`).

## 1. Apify — Actor monetization and Store publication

### Current pricing and monetization setup

- The current monetization documentation lists **pay per event (PPE)** and **pay per usage** as the pricing models: https://docs.apify.com/actors/publishing/monetize.md.
- Setup is in **Console → Development → My Actors → Actor → Publication → Monetization → Set up monetization**. The wizard has three steps:
  1. **Actor pricing** — configure the synthetic start/default-dataset events and custom event prices, optionally pass platform usage costs to users, and set the minimum/max run-cost control.
  2. **Primary event** — choose the event representing the Actor's main value.
  3. **Review** — verify the final pricing before confirming.
- A significant model change, price increase, or new paid event requires 14 days' notice and can be made at most once per month; price decreases and event removals take effect immediately. Source: https://docs.apify.com/actors/publishing/monetize.md.
- Actors become eligible for agentic payments automatically when they use PPE, request limited permissions, and do not use Standby. Rental and pay-per-usage Actors are excluded. Source: https://docs.apify.com/actors/publishing/monetize.md.

### PPE mechanics and publisher share

- PPE events are measurable actions such as creating a result, processing an item, or calling an external API. Apify supplies synthetic `apify-actor-start` and default-dataset-item events; publishers can define custom events and charge through the SDK or API. Source: https://docs.apify.com/actors/publishing/monetize/pay-per-event.md.
- A user sets a maximum cost per run. Apify enforces it; charging and result pushing stop near the limit and the run is aborted. The default synthetic start-event price is $0.00005. Source: https://docs.apify.com/actors/publishing/monetize/pay-per-event.md.
- Profit is `0.8 × revenue − platform costs`; the publisher receives **80% of event revenue**, with platform costs deducted. Source: https://docs.apify.com/actors/publishing/monetize/pay-per-event.md.

### Rental sunset and pay-per-result inconsistency

- Rental is explicitly being sunset: **April 1, 2026** — no new rental Actors or pricing changes; **October 1, 2026** — rental Actors fully retired and migrated to pay-per-usage. The legacy model used a seven-day trial and monthly flat fee, with an 80% share. Source: https://docs.apify.com/actors/publishing/monetize/rental.md.
- **FLAG — stale/transitioning pay-per-result documentation:** the Store Terms (last updated February 20, 2026) still define pay-per-result as `$X/1,000 results`, with no platform usage billed and an 80% share, in §10: https://docs.apify.com/legal/store-publishing-terms-and-conditions.md. Current monetization documentation no longer lists pay-per-result as a selectable current model. The old PPR concept remains in legal/API material (`ACTOR_MAX_PAID_DATASET_ITEMS`); do not treat it as currently selectable beyond the Terms definition.
- The Academy page says PPE can price per result through an event and that “most Store prices” are $1–10 per 1,000 results, but that is context rather than a universal price: https://docs.apify.com/academy/actor-marketing-playbook/store-basics/how-actor-monetization-works.
- **FLAG — UI documentation inconsistency:** the Academy calls profit tracking the Console **Monitoring** tab, while `monetize.md` places Actor Analytics under **Development → Insights → Analytics**. The latter dashboard covers revenue/cost/profit trends, paid and free users, cost per 1,000 results, run success, acquisition funnel, shared debug runs, and JSON export. Sources: https://docs.apify.com/academy/actor-marketing-playbook/store-basics/how-actor-monetization-works and https://docs.apify.com/actors/publishing/monetize.md.

### Payouts, KYC, and thresholds

- Payout eligibility requires completed billing details, a payment method, and identity/KYC verification. Source: https://docs.apify.com/actors/publishing/monetize/monthly-payouts.md.
- Payout invoices are generated automatically on the **11th** for the previous month. The publisher has three days to review; an unreviewed invoice is approved automatically on the **14th**. Only legitimate revenue from users who have paid is included; fraud and unpaid amounts are withheld. Sources: https://docs.apify.com/actors/publishing/monetize/monthly-payouts.md and https://docs.apify.com/legal/store-publishing-terms-and-conditions.md.
- Minimum monthly payout thresholds are **$20 for PayPal and Wise** and **$100 for other methods**. Amounts below the applicable threshold roll over to the next month. Source: https://docs.apify.com/actors/publishing/monetize/monthly-payouts.md.

### Publish flow

- README comes first because it becomes the Actor's public Store detail page. In **Console → Development → My Actors → Actor → Publication**, complete display information (logo and description), monetization, sample output, output schema (optionally dataset, key-value-store, and live-view schemas), and Actor permissions. Once all sections are complete, select **Publish on Store**; verify by searching the Store and opening the Actor card/detail page. Source: https://docs.apify.com/actors/publishing/publish.md.
- Apify's broader publication stages are **Development → Publication + monetization → Testing → Promotion**. Source: https://docs.apify.com/actors/publishing.md.

## 2. OpenRouter — prepaid credits, keys, limits, and demand console

### Credit top-up and pricing mechanics

- The flow is **sign up → Credits page → USD top-up**; request costs are deducted from the credit balance. Model/provider pricing is token-based and can include request, image, and reasoning costs; OpenRouter describes this as pass-through pricing with no inference markup. Source: https://openrouter.ai/docs/faq.md.
- Stripe top-ups carry a **5.5% fee with a $0.80 minimum**; crypto carries a 5% fee. Manual and automatic top-up are available. Source: https://openrouter.ai/docs/faq.md.
- Terms set a **$5 minimum and $25,000 maximum per credit purchase transaction**. Unused-credit refunds can be requested within 24 hours; platform fees are non-refundable and cryptocurrency payments are never refundable. Sources: https://openrouter.ai/terms and https://openrouter.ai/docs/faq.md.
- OpenRouter may expire unused credits **365 days after purchase**. Auto Recharge charges the chosen payment method when credits fall below the configured threshold and can be updated or cancelled from the account page. Source: https://openrouter.ai/terms.
- Free-model access is capped at 50 requests/day without a purchase and 1,000/day after at least $10 purchased. Source: https://openrouter.ai/docs/faq.md.

### Completion keys, management keys, limits, and errors

- Completion/API keys are created at `/keys` with a name and optional credit cap and are used as Bearer credentials. `GET /api/v1/key` exposes optional per-key limit, reset, remaining balance, lifetime/day/week/month usage, and BYOK usage. A 402 is returned for insufficient balance or a per-key cap; free-model limits include 20 RPM and 50/1,000 requests per day. Source: https://openrouter.ai/docs/api_reference/limits.md.
- Management keys are created in settings by an administrator and **cannot be used for completions**. They manage completion keys through `/api/v1/keys` (create/list/update/delete), including limits, disabled state, `includeByokInLimit`, and daily reset. The secret is returned only at creation. Source: https://openrouter.ai/docs/guides/overview/auth/management-api-keys.md.
- The credits API is a management-key-only endpoint: `GET /api/v1/credits` returns `total_credits` and `total_usage`. Source: https://openrouter.ai/docs/api/api-reference/credits/get-remaining-credits.md.

### Usage/activity and BYOK

- The Activity dashboard filters activity by model, provider, and API key; the credits API supplies live balance. Source: https://openrouter.ai/docs/faq.md.
- The Analytics TypeScript SDK's `getUserActivity` is management-key-only, groups activity by endpoint, and covers the last 30 completed UTC days. Source: https://openrouter.ai/docs/client-sdks/typescript/sdks/analytics/README.md.
- BYOK provider keys are encrypted and configured at workspace level. Routing supports prioritized versus fallback keys, an “Always use” option, and model/API-key/member filters. The first 1M BYOK requests per month are free, after which 5% of normal OpenRouter cost is deducted from credits. Source: https://openrouter.ai/docs/guides/overview/auth/byok.md.
- **FLAG — BYOK pricing-page discrepancy:** the pricing page presents a $25,000 list-price inference/month no-fee threshold (and a $200,000 Enterprise threshold), while the FAQ/BYOK documentation frames the threshold as 1M requests/month. Source: https://openrouter.ai/pricing.
- The pricing page also confirms PAYG's 5.5% platform fee and the breadth of the catalog (400+ models and 70+ providers). Source: https://openrouter.ai/pricing.

## 3. Stripe Connect + usage billing — onboarding, rake, meters, and AU

### Express onboarding (legacy pattern)

- Stripe's Express flow is documented as **legacy**; the docs warn that new integrations should use Accounts v2. The platform must be in a supported country (including Australia), complete its platform profile/brand, create an Express account (prefilling country and capabilities), then create a single-use Account Link with `refresh_url`, `return_url`, and `type=account_onboarding`. Redirect the authenticated account holder to that link. Source: https://docs.stripe.com/connect/express-accounts.md.
- Returning from the Account Link does not prove onboarding is complete. The platform must check `account.updated`, `details_submitted`, and `charges_enabled`; it should refresh expired, reused, or rejected links. Prefill KYC before the first link and let the user resume with a new link. Source: https://docs.stripe.com/connect/express-accounts.md.

### Accounts v2 for new integrations

- Accounts v2 is GA for Connect and uses configurations (merchant, customer, and recipient), centralized identity, one Account API, `dashboard:"full"`, identity/country/entity information, and `configuration.capabilities`. v1 remains required for OAuth, recipient agreements, and some capabilities. Source: https://docs.stripe.com/connect/accounts-v2.md.
- **Verdict:** use the Express sequence as the onboarding pattern, but treat Express as legacy and use Accounts v2 for a new AE integration. Source: https://docs.stripe.com/connect/accounts-v2.md.

### Rake/application fees

- For destination charges, use `transfer_data[destination]` with `application_fee_percent`. The fee is 0–100% (at most two decimal places), calculated from the final invoice including invoice items, discounts, and balance, charged once per billing period, and deducted before Stripe fees. The destination platform is the merchant of record. Source: https://docs.stripe.com/connect/subscriptions.md.
- A flat `application_fee_amount` cannot recur directly on a subscription; set it per invoice via the `invoice.created` webhook, with the amount capped by the final charge. Source: https://docs.stripe.com/connect/subscriptions.md.

### Usage meters and Australia

- Stripe now directs **new** usage-billing builds toward Metronome for real-time usage, prepaid credits, contracts, dimensional pricing, and high volume. Direct Stripe Billing Meters are positioned for existing/simple cases. Source: https://docs.stripe.com/billing/subscriptions/usage-based/implementation-guide.md.
- The legacy/direct flow is **meter (`sum`/`count`/`last`) → metered Price and Product → Customer → Subscription → `POST /v1/billing/meter_events`**. Aggregation is asynchronous, summaries may lag, and usage is billed on the period-end invoice. Source: https://docs.stripe.com/billing/subscriptions/usage-based/implementation-guide.md.
- Australia is supported. Stripe's Australian Billing page positions usage-based billing through Metronome while continuing to support basic Billing Meters, with up to 100M events/month included and 0.7% Billing-volume PAYG pricing. Source: https://stripe.com/au/billing/pricing. Australia's supported-country listing is at https://stripe.com/global.

## 4. RapidAPI — plan matrix and health caveat

### Current status

- RapidAPI's docs were updated in June 2025 and the marketplace is reachable at https://rapidapi.com (API Hub). No first-party public status page was found in the research. **FLAG: alive/reachable, but health and uptime are unverifiable; do not claim healthy.**

### Consumer plan behavior

- Free APIs require no card. Freemium APIs provide a BASIC free tier and require a card for overage; paid APIs use monthly subscriptions plus overage. Plans can define daily/monthly quotas and custom billing objects. Source: https://docs.rapidapi.com/v1.0/docs/api-pricing.md.
- Consumers receive email alerts at 85% and 100% usage. The Billing → Subscriptions & Usage dashboard exposes subscriptions, usage, transaction history, and analytics. Quota headers use `X-RapidAPI-<object>-limit` and `X-RapidAPI-<object>-remaining`. The page's BASIC example is 500 requests/month plus $0.01 overage; this is an example, not a universal price. Source: https://docs.rapidapi.com/v1.0/docs/api-pricing.md.

### Provider plan matrix and limits

- Provider defaults include a free BASIC plan; rapidapi.com's default BASIC example is 1M requests/month, while Enterprise is unlimited. Providers can publish up to four public plans — BASIC, PRO, ULTRA, and MEGA — plus private plans. Source: https://docs.rapidapi.com/v2.0.0/docs/hub-listing-monetize-tab.md.
- Plans can be monthly subscriptions or pay-per-use. Providers can set per-second, per-minute, and per-hour rate limits (excess returns 429), gate features/endpoints, and define up to four custom quota objects. Hard limits block requests; soft limits permit overage. Existing subscribers retain old plans labelled “Deprecated Plan.” Source: https://docs.rapidapi.com/v2.0.0/docs/hub-listing-monetize-tab.md.

### Payouts

- RapidAPI charges a **20% flat marketplace fee**. Providers are paid after final collection; monthly charges are consolidated, with payment at the end of the following month or during the first week thereafter. PayPal is the only payout method, PayPal fees are extra, and chargebacks/refunds are offset. Source: https://rapidapi-enterprise-hub.readme.io/docs/payouts-and-finance.md.

## 5. agentic.market — x402 directory and service-card pricing

- At research time, the directory reported **1,978 services**. It is an x402-enabled service directory with no registration, API keys, or rate limits; services are paid per request in USDC across networks including Base and Solana. Sources: https://agentic.market/ and https://agentic.market/llms.txt.
- Machine endpoints include `GET https://api.agentic.market/v1/services` and `/search`. The service-card JSON shape contains `id`, `name`, `description`, `category`, `networks`, and `endpoints[]`; each endpoint includes `url`, `method`, `description`, and `pricing` with `amount` and `currency`. `llms.txt` also claims quality metrics. Source: https://agentic.market/llms.txt.
- The website table displays **Service, Description, Price, Networks**. **FLAG: price is often a flattened list of endpoint prices, which is ambiguous** without an explicit endpoint/event unit. Source: https://agentic.market/.
- The documented quickstart is `npx skills add coinbase/agentic-wallet-skills`. Source: https://agentic.market/llms.txt.
- No provider payout, platform rake, or quality-assessment method was observed in the sources. Do not copy unobserved claims. Sources: https://agentic.market/ and https://agentic.market/llms.txt.

## 6. Smithery — registry cards, install, configuration, and auth UX

### Registry card fields

- Registry search supports full-text/semantic `q`, pagination (`page`/`pageSize`), and filters for remote, deployed, verified, and ownership state. Search summaries include `id`, `qualifiedName`, `displayName`, `description`, `iconUrl`, `verified`, `useCount`, `remote`, `isDeployed`, `createdAt`, `homepage`, `bySmithery`, `owner`, and `score`. Source: https://smithery.ai/docs/api-reference/servers/list-all-servers.md.
- Server details include HTTP deployment or stdio bundle/runtime connections, `configSchema`, `security.scanPassed`, tools with names/descriptions/input and output schemas, plus resources and prompts. Source: https://smithery.ai/docs/api-reference/servers/get-a-server.md.

### Install, configuration, and authentication UX

- Install the CLI with `npm install -g smithery@latest` (Node 20+), authenticate with `smithery auth login`, search with `smithery mcp search`, and add a server with `smithery mcp add <server> --client claude|cursor` or a remote URL. The CLI supports tool listing and calls. Sources: https://smithery.ai/docs/concepts/cli.md and https://smithery.ai/docs/use/connect.md.
- Configuration can be supplied as headers (for example API keys) or URL query parameters. Missing configuration produces `input_required` with the configuration schema; OAuth produces `auth_required` with a hosted setup URL. Credentials are encrypted and write-only, tokens are scoped, and refresh is automatic. Source: https://smithery.ai/docs/use/connect.md.

## Transferable shape for AE

**Supply offer sentence — COPY:** Use the clarity of Apify and agentic.market: **“List your API service; agents discover it and pay per successful call from prepaid AE credit; you set the price (free tier allowed); AE meters each call and pays you less a disclosed rake.”** Sources: https://docs.apify.com/actors/publishing/monetize.md and https://agentic.market/.

**Publish/onboarding — COPY:** Use Apify's sequence — README/description/logo/sample output/output schema/permissions → monetization → test → publish — and add Stripe KYC/payout state. Make onboarding resumable and show explicit completion status. Sources: https://docs.apify.com/actors/publishing/publish.md, https://docs.apify.com/actors/publishing.md, and https://docs.stripe.com/connect/express-accounts.md.

**Pricing configuration — COPY:** Borrow RapidAPI's matrix shape: a free hard-cap tier plus optional paid tiers, with each row showing unit, quota, rate limit, and overage. Do **not** copy RapidAPI's universal tier names or prices. Borrow Apify PPE's primary-event/custom-event model and maximum run-cost cap. Sources: https://docs.rapidapi.com/v2.0.0/docs/hub-listing-monetize-tab.md and https://docs.apify.com/actors/publishing/monetize/pay-per-event.md.

**Pricing configuration — SKIP:** Do not build around Apify rental; it is retired on October 1, 2026. Source: https://docs.apify.com/actors/publishing/monetize/rental.md.

**Demand console — COPY:** Use OpenRouter's loop: add credit with an Auto Recharge threshold; issue a scoped key with optional cap/reset; show Activity by service/key/date; make BYOK optional. Copy the 402 preflight-balance behavior and hard per-key limits, and distinguish management keys from completion keys. Sources: https://openrouter.ai/terms, https://openrouter.ai/docs/api_reference/limits.md, https://openrouter.ai/docs/guides/overview/auth/management-api-keys.md, https://openrouter.ai/docs/client-sdks/typescript/sdks/analytics/README.md, and https://openrouter.ai/docs/guides/overview/auth/byok.md.

**Metering ledger — COPY/ADAPT:** For real-time prepaid per-call debit, AE should keep its **own append-only ledger as the authorization source of truth**. Stripe Billing Meters are asynchronous/arrears-oriented, and Stripe points new builds toward Metronome; neither should authorize a real-time debit. AE may export settled summaries to Stripe afterward. Source: https://docs.stripe.com/billing/subscriptions/usage-based/implementation-guide.md.

**Rake and payout rail — COPY:** Present **gross → AE fee → provider net** explicitly, using Stripe `application_fee_percent`/`application_fee_amount` split semantics. Use Connect onboarding, webhooks/account status, KYC before payouts, and hold/rollover thresholds. Sources: https://docs.stripe.com/connect/subscriptions.md, https://docs.stripe.com/connect/accounts-v2.md, and https://docs.stripe.com/connect/express-accounts.md.

**Rake and payout rail — SKIP:** Do not copy RapidAPI's PayPal-only, month-lag payout rail. Do not copy Apify's 80% as gospel; set AE's rake deliberately. Sources: https://rapidapi-enterprise-hub.readme.io/docs/payouts-and-finance.md and https://docs.apify.com/actors/publishing/monetize/pay-per-event.md.

**Pricing display — SKIP:** Do not copy agentic.market's flattened price list; expose an endpoint/event unit and a deterministic example instead. Source: https://agentic.market/.
