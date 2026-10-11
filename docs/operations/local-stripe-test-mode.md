# Local Stripe test mode: reaching tier 1

This guide covers the optional local Stripe test-mode funding path: owner checkout in a browser, a real webhook via the Stripe CLI, and a separate Base Sepolia x402 payment to an external Provider. The chosen alpha funding path uses admitted promotional credit and does not require Stripe. Either funding path still needs spending authority and genuine custody, treasury and Provider evidence to complete a paid Call. This guide does not establish that live acceptance; see Section 5.

## 1. Stripe test mode

Env read by `readStripeMoneyProviderConfig` (`src/lib/server/stripe-money-provider-config.ts:41-52`): `STRIPE_SECRET_KEY` (`sk_test_...`, required), `STRIPE_WEBHOOK_SECRET` (`whsec_...`, required), `STRIPE_V2_WEBHOOK_SECRET` (`whsec_...`, optional, accounts-v2 only), `STRIPE_AU_INCLUSIVE_GST_TAX_RATE_ID` (required for checkout), `STRIPE_CHECKOUT_HOST` (optional), `STRIPE_READBACK_KEY` (`rk_test_...`, optional, readback only).

`mode` derives from the secret key's prefix (`modeFromSecretKey`, same file:249-253); a `sk_test_` key yields `mode: "test"`. Webhook events are only mapped when `event.livemode` matches that mode (`sessionMatchesMode`, same file:179-184, used in `src/lib/server/stripe-money-webhook.ts:48,222`), so test events process only when a test key is configured.

Checkout refuses outright without a valid `inclusiveGstTaxRateId` (`src/lib/server/stripe-checkout-evidence.ts:306-312`): that tax rate must exist in Stripe **test mode** — 10%, inclusive, country AU (Products → Tax rates, test mode on) — with its `txr_...` id in `STRIPE_AU_INCLUSIVE_GST_TAX_RATE_ID`.

`STRIPE_READBACK_KEY`, `STRIPE_AU_INCLUSIVE_GST_TAX_RATE_ID`, `STRIPE_CHECKOUT_HOST` are optional Convex env (`convex/convex.config.ts:44-46`); `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_V2_WEBHOOK_SECRET` are required Convex env in production (`stripe-money` group, `src/lib/deployment/manifest.ts`, `requiredProduction`). Set all via Convex env, not the web server process:

```sh
npx convex env set STRIPE_SECRET_KEY sk_test_...
npx convex env set STRIPE_WEBHOOK_SECRET whsec_...
npx convex env set STRIPE_V2_WEBHOOK_SECRET whsec_...
npx convex env set STRIPE_AU_INCLUSIVE_GST_TAX_RATE_ID txr_...
```

Webhook route: `POST /api/stripe/webhook` (`src/routes/api.stripe.webhook.ts`). Point the Stripe CLI at the local dev port (3024):

```sh
stripe listen --forward-to http://127.0.0.1:3024/api/stripe/webhook
```

`stripe listen` prints `Ready! Your webhook signing secret is whsec_...` — that's `STRIPE_WEBHOOK_SECRET`; re-set it whenever a fresh `stripe listen` run mints a new one. The accounts-v2 webhook (`src/routes/api.stripe.webhook.accounts-v2.ts`) is a separate destination, not required for funding below.

## 2. Owner funding step

```sh
npm run dev:local
npm run connect:local
```

As the owner, open `http://127.0.0.1:3024/owner/credit` (`src/routes/_operator/owner.credit.tsx`). Enter an amount, click "Continue to Stripe" (`src/components/ae/console/AeCreditTopUpPanel.tsx:258`), pay with `4242 4242 4242 4242`, any future expiry, any CVC, and wait for `stripe listen` to relay `checkout.session.completed`.

The loading fee is 5% service fee (`fundingServiceFeeBps: 500`, `src/modules/money/internal/commercial-policy.ts`) plus 10% GST on the loaded amount and that cent-rounded fee (`serviceFeeTaxBps: 1_000`), added on top. `quoteAudAccountFunding` is the figure Checkout, the ledger, and the receipt use. An A$5.00 load is A$0.25 fee, A$0.53 GST, and A$5.78 payable.

Verify:

```sh
npm run --silent ae -- account --base-url http://127.0.0.1:3024 --json
npm run --silent ae -- doctor --base-url http://127.0.0.1:3024 --json
```

`ae doctor` reports three groups — `discovery`, `quoting`, `purchase` — each `pass`/`warn`/`fail`/`skipped` (`tools/ae/commands/doctor.ts`); see Section 4.

## 3. x402 testnet leg (provider payment)

Configure the isolated development custody bundle in Convex: `CDP_API_KEY_ID`, `CDP_API_KEY_SECRET`, `CDP_WALLET_SECRET`, `AE_X402_CDP_ACCOUNT_NAME`, `AE_X402_CDP_EXPECTED_EVM_ADDRESS`, `AE_X402_CDP_ACCOUNT_POLICY_ID`, `AE_X402_CDP_PROJECT_POLICY_ID`, `AE_X402_CDP_POLICY_RULES_DIGEST`, `AE_X402_CDP_CREDENTIAL_GENERATION`, and `AE_X402_CUSTODY_ENABLED=true`. Managed signing also requires all four positive USDC atomic-unit caps: `AE_X402_CUSTODY_MAX_ATOMIC`, `AE_X402_CUSTODY_DAILY_MAX_ATOMIC`, `AE_X402_CUSTODY_PAYEE_DAILY_MAX_ATOMIC`, and `AE_X402_CUSTODY_NEW_PAYEE_MAX_ATOMIC`. These requirements apply to sandbox signing too; missing limits refuse admission. The live account, attached account/project policies, address and policy digest must match this configuration (`src/modules/capability-supply/internal/x402-custody-configuration.ts`, `src/modules/money/x402-spend-admission.ts`). Sandbox uses Base Sepolia / USDC (`eip155:84532`, `0x036CbD53842c5426634e7929541eC2318f3dCF7e`; `src/modules/capability-supply/internal/x402-payment-profile.ts`).

Use `npm run dev:local` to declare `AE_DEPLOYMENT_ENVIRONMENT=development` in both runtimes. Configure `AE_X402_RPC_URLS_JSON` with one or two distinct public HTTPS Base Sepolia RPC endpoints, and fund the configured custody address with test USDC. The maintained `observe x402 treasury` workload runs every five minutes: `convex/moneyTreasuryObservation.ts` reads the official CDP balance API and records genuine observation evidence, then reconciles finalized on-chain deposits into the native ledger. It requires admitted workload authority and a provisioned sandbox Formance ledger configured by `AE_FORMANCE_ENVIRONMENT=sandbox`, `AE_FORMANCE_GATEWAY_URL`, and `AE_FORMANCE_LEDGER`; a non-loopback gateway also requires `AE_FORMANCE_ACCESS_CLIENT_ID` and `AE_FORMANCE_ACCESS_CLIENT_SECRET`. The local starter does not start or provision Formance. The separate `reconcile treasury balances` workload runs every fifteen minutes and publishes the treasury snapshot. Inspect `/admin/treasury` for source freshness and reconciliation state; configuration alone is not evidence of readiness. These producers are registered through `convex/crons.ts` and `convex/lib/platform/workloadCron/scheduled.ts`; do not fabricate balance evidence or invoke the internal observation mutation with hand-assembled values.

Every actual signature also requires a fresh recorded payee-screening clear. The real TRM Wallet Screening adapter currently returns unavailable until the tenant-entitled contract is connected (`src/modules/money/x402-payee-screening.server.ts`), so this configuration cannot yet establish a real paid-Call pass.

The local package5 reference provider has been removed. Paid sandbox Calls use an external Base Sepolia x402 endpoint named by `AE_PACKAGE5_FIXTURE_PUBLIC_ORIGIN` and `AE_PACKAGE5_FIXTURE_X402_PAY_TO`. Those values are deployment facts, not a server in this repo.

Base Sepolia test ETH/USDC come from the public Coinbase/Base faucet: https://portal.cdp.coinbase.com/products/faucet (manual, outside this repo).

## 4. Tiers

- **Tier 0** = loopback diagnostics without the paid-Call prerequisites: discovery can pass while quoting is skipped where a readiness probe cannot reach its endpoint. Diagnostics are not paid-Call evidence.
- **Tier 1 evidence** = an authenticated owner with spending authority and available Account credit, a ready treasury and screening provider, and a genuine external Base Sepolia Tool completing the Quote → Call → settlement → receipt flow. For this guide's optional Stripe path, fund the Account through test checkout and its webhook; the promo-only alpha uses admitted promotional credit instead.

The app's own `POST /api/v1/sandbox-reference` is an unpaid reference Tool, and its readiness probe requires a reachable hosted origin. The separate paid testnet Tool uses the external `AE_PACKAGE5_FIXTURE_PUBLIC_ORIGIN` and `AE_PACKAGE5_FIXTURE_X402_PAY_TO` facts above. An unpaid reference response cannot prove x402 settlement.

`ae doctor` does print a `tier:` line. Use `ae doctor --json` and read `groups` plus each check's `summary`/`nextCommand` for the tier name.

## 5. Known state

This guide describes local test-mode behavior. The [September preflight](../archive/2026-10-05/operations/vocabulary-cutover-preflight.md) is historical evidence, not current hosted configuration. Use the [deployment map](deployments.md) and actual provider readback before changing a hosted destination.

## 6. Hosted webhook destinations

The declarative webhook helper (`tools/release/stripe-webhook-destinations.ts`) has been removed. Create or replace the hosted Stripe v1 endpoint in the Stripe dashboard. Desired state is exactly one enabled endpoint for `https://<host>/api/stripe/webhook`, `api_version` pinned to the SDK constant (`Stripe.API_VERSION`, the same pin `createStripeMoneyClient` uses), and `enabled_events` equal to the nine events the worker consumes (`mapStripeMoneyWebhookEvent` in `src/lib/server/stripe-money-webhook.ts`): `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `refund.created`, `refund.updated`, `refund.failed`, `charge.dispute.created`, `charge.dispute.updated`, `charge.dispute.closed`. A dispute created or updated freezes the Account (open account-scope reconciliation case) and alerts the operator; closed is recorded only.

On create, store the signing secret as `STRIPE_WEBHOOK_SECRET`. The Accounts v2 destination (`/api/stripe/webhook/accounts-v2`) is a separate resource; its secret stays in `STRIPE_V2_WEBHOOK_SECRET`.
