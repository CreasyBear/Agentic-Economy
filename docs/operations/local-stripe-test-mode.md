# Local Stripe test mode: reaching tier 1

Tier 1 = a funded sandbox Account that can complete a paid Call, on a local machine, with no scripts and no fixtures: real Stripe test mode driven by the owner in a browser, a real webhook via the Stripe CLI, and a real x402 testnet leg for the provider payment. Local only — see Section 5.

## 1. Stripe test mode

The local web/server consumer reads `STRIPE_SECRET_KEY` (required), `STRIPE_WEBHOOK_SECRET` (required), `STRIPE_V2_WEBHOOK_SECRET` (optional, accounts-v2 only), `STRIPE_AU_INCLUSIVE_GST_TAX_RATE_ID` (required for checkout), and `STRIPE_CHECKOUT_HOST` (optional) through `readStripeMoneyProviderConfig` (`src/lib/server/stripe-money-provider-config.ts:50-79`). `STRIPE_READBACK_KEY` is a separate Convex webhook-worker credential; it is read by `readStripeMoneyReadbackProviderConfig` (`src/lib/server/stripe-money-provider-config.ts:97-119`).

`mode` derives from either an `sk_` or `rk_` test/live prefix (`modeFromSecretKey`, same file:239-243); a `sk_test_` or `rk_test_` key yields `mode: "test"`. Webhook events are only mapped when `event.livemode` matches that mode (`sessionMatchesMode`, same file:169-174, used in `src/lib/server/stripe-money-webhook.ts:49,226`), so test events process only when a test-mode key is configured.

Checkout refuses outright without a valid `inclusiveGstTaxRateId` (`src/lib/server/stripe-checkout-evidence.ts:313-320`): that tax rate must exist in Stripe **test mode** — 10%, inclusive, country AU (Products → Tax rates, test mode on) — with its `txr_...` id in `STRIPE_AU_INCLUSIVE_GST_TAX_RATE_ID`.

These credentials have different consumers and locations. For local development, put the web/server values in the ignored `.env.development.local` file (the launcher loads it; `tools/dev/local-dev.ts:34-35`), and put the Convex worker values in the local Convex deployment environment. `convex/convex.config.ts:53-55` declares `STRIPE_READBACK_KEY`, `STRIPE_AU_INCLUSIVE_GST_TAX_RATE_ID`, and `STRIPE_CHECKOUT_HOST`; the worker specifically requires `STRIPE_READBACK_KEY` with an `rk_test_...` value for this run. Do not put the web/server values only in Convex: the loopback checkout and webhook routes read the server process environment (`src/lib/server/funding-handoff-api.ts:63-68`, `src/modules/money/server.ts:162-191`).

For a deployed `hosted_alpha`/sandbox release, the manifest validates both `STRIPE_SECRET_KEY` (the Vercel command consumer) and `STRIPE_READBACK_KEY` (the Convex worker) as restricted `rk_test_...` keys; a live production deployment requires `rk_live_...` (`src/lib/deployment/manifest.ts:289-310,455-480`). The deployment credential map records the same split (`docs/operations/credentials-and-access.md:35-37`).

```sh
# .env.development.local (mode 0600; values supplied from protected custody)
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_V2_WEBHOOK_SECRET=whsec_...  # optional
STRIPE_AU_INCLUSIVE_GST_TAX_RATE_ID=txr_...

# Local Convex worker: send the restricted key over stdin from its 0600 file.
npx convex env set STRIPE_READBACK_KEY < /path/to/stripe-readback.key
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

The loading fee is 5% service fee (`fundingServiceFeeBps: 500`, `src/modules/money/internal/commercial-policy.ts:136`) plus 10% GST on that fee (`serviceFeeTaxBps: 1_000`, same file:100), computed by `calculateAudFundingFinancials` (`src/modules/money/internal/aud-funding.ts:47-70`).

Verify:

```sh
npm run --silent ae -- account --base-url http://127.0.0.1:3024 --json
npm run --silent ae -- doctor --base-url http://127.0.0.1:3024 --json
```

`ae doctor` reports three groups — `discovery`, `quoting`, `purchase` — each `pass`/`warn`/`fail`/`skipped` (`tools/ae/commands/doctor.ts`); see Section 4.

## 3. x402 testnet leg (provider payment)

CDP custody env, read in `convex/capabilityQuotes.ts:204-215` and declared in `src/modules/capability-supply/internal/x402-custody-configuration.ts:9-19`: `CDP_API_KEY_ID`, `CDP_API_KEY_SECRET`, `CDP_WALLET_SECRET`, `AE_X402_CDP_ACCOUNT_NAME`, `AE_X402_CDP_EXPECTED_EVM_ADDRESS`, `AE_X402_CDP_ACCOUNT_POLICY_ID`, `AE_X402_CDP_PROJECT_POLICY_ID`, `AE_X402_CDP_POLICY_RULES_DIGEST`, `AE_X402_CDP_CREDENTIAL_GENERATION`, `AE_X402_CUSTODY_ENABLED`, `AE_X402_CUSTODY_MAX_ATOMIC`, `AE_X402_CUSTODY_DAILY_MAX_ATOMIC`, plus `AE_X402_RPC_URLS_JSON` — all optional Convex env (`convex/convex.config.ts:24-38`), required together in production (`x402-payment` manifest group). Sandbox network is Base Sepolia / USDC (`base-sepolia-usdc-exact`, `eip155:84532`, `0x036CbD53842c5426634e7929541eC2318f3dCF7e`, `src/modules/capability-supply/internal/x402-payment-profile.ts:2-16,34-40`).

Provider spend is gated on a `moneyTreasuryObservations` row (`convex/moneyTreasury.ts:9-68`, read back by `treasurySpendableUnits`, `convex/capabilityQuotes.ts:219`). The official observer in `convex/moneyTreasuryObservation.ts:77-160` uses the CDP SDK token-balance API and records canonical evidence through that mutation. The `observe x402 treasury` workload is wired through `convex/workloadCron.ts:517-523`, registered by `convex/crons.ts:9-40`, and scheduled every 15 minutes (`src/lib/deployment/scheduled-workloads.ts:16-32`) unless recurring workloads are explicitly disabled. Configure the CDP custody bundle and let this workload populate observations; do not call `moneyTreasury:recordObservation` directly or hand-assemble its evidence. A local runtime observation still requires a running Convex deployment, valid CDP credentials, and recurring workloads enabled; this document does not claim that runtime proof.

The reference provider (`tools/release/package5-reference-provider/core.ts`, no README) needs `AE_PACKAGE5_FIXTURE_PUBLIC_ORIGIN` (credential-free HTTPS, `core.ts:281`), `AE_PACKAGE5_FIXTURE_X402_PAY_TO` (EVM address, `core.ts:68`), and `AE_PACKAGE5_FIXTURE_X402_FACILITATOR_URL` (`api/fixture.ts:37,42-43`). It's a Vercel fixture, not a plain `localhost` server, so local use needs an HTTPS tunnel in front of it (manual, outside this repo).

Base Sepolia test ETH/USDC come from the public Coinbase/Base faucet: https://portal.cdp.coinbase.com/products/faucet (manual, outside this repo).

## 4. Tiers

- **Tier 0** = loopback, no credentials: discovery pass, quoting skipped (readiness probe cannot reach loopback), purchase names the missing Stripe setup.
- **Tier 1** = hosted HTTPS origin plus Stripe test keys and the CDP/x402 bundle: full loop.

The sandbox counterparty is the app's own `POST /api/v1/sandbox-reference`; the hourly readiness probe observes it on hosted origins.

`ae doctor` does print a `tier:` line. Use `ae doctor --json` and read `groups` plus each check's `summary`/`nextCommand` for the tier name.

## 5. Known state

The September 4 webhook snapshot in the preflight (`docs/operations/vocabulary-cutover-preflight.md:64-72`) is historical and does not establish the current hosted state. Before operating on a hosted destination, consult the [current hosted alpha assessment](deployment-maturity.md#hosted-alpha-assessment--12-september-2026) and the [deployment registry](deployment-registry.yaml) (`hostedAlphaReadback`). This runbook is local-only.

## 6. Managing the hosted webhook destinations

`npm run stripe:webhooks` (`tools/release/stripe-webhook-destinations.ts`) manages the hosted Stripe v1 `webhookEndpoints` declaratively, in both modes, so the section 5 state is fixable as code rather than by hand in the dashboard.

```
npm run stripe:webhooks -- --mode test --url https://<host>/api/stripe/webhook            # dry run, prints the plan
npm run stripe:webhooks -- --mode test --url https://<host>/api/stripe/webhook --apply
npm run stripe:webhooks -- --mode live --url https://<host>/api/stripe/webhook --apply --confirm-live
```

Desired state is exactly one enabled endpoint for the URL, `api_version` pinned to the SDK constant (`Stripe.API_VERSION`, the same pin `createStripeMoneyClient` uses at `src/lib/server/stripe-money-client.ts:26-30`), and `enabled_events` equal to the six events the worker consumes (the `switch (event.type)` in `mapStripeMoneyWebhookEvent`, `src/lib/server/stripe-money-webhook.ts:53-63`): `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `refund.created`, `refund.updated`, `refund.failed`. `tests/unit/release/stripe-webhook-destinations.test.ts` fails if that worker switch drifts from the tool's list.

- Default is a dry run: it lists and prints an action table and performs no writes. `--apply` is required to write; live `--apply` additionally requires `--confirm-live`.
- The hosted-destination manager is an operator-side consumer and accepts only `sk_test_` / `sk_live_` in `STRIPE_SECRET_KEY` (`modeOfSecretKey`, `tools/release/stripe-webhook-destinations.ts:291-295`); a mismatch exits `2` before any API call. This is separate from the deployed Vercel/Convex consumers, whose manifest key contract is the restricted `rk_*` contract described in Section 1.
- `api_version` is immutable on an existing endpoint, so a version mismatch creates a replacement and **disables** (never deletes) the old one. Superseded duplicates and the enabled legacy unpinned destination on the same host are disabled the same way, preserving delivery history.
- On create the signing secret is printed exactly once — store it as `STRIPE_WEBHOOK_SECRET`. It is never logged again and `--json` redacts it to `<printed once above>`.
- Only v1 `webhookEndpoints` are managed. The Accounts v2 destination (`/api/stripe/webhook/accounts-v2`, id prefix `ed_`) is a v2 core event destination on a separate API resource; the tool never touches it and its secret stays in `STRIPE_V2_WEBHOOK_SECRET`.

Run `npx tsx tools/release/stripe-webhook-destinations.ts --help` for the full flag reference.
