# T12 — Metering, credit, rake, and payouts

## Context

Ticket `.planning/wayfinder/tickets/T12-metering-payouts.md` asks AE to implement the money loop: an agent operator buys prepaid credit, a paid service call consumes the business-set price, the business earns a disclosed net amount, AE retains a rake on paid calls only, and the business can withdraw through a payout rail. The destination is fixed in `.planning/wayfinder/MAP.md` Destination v2: businesses list free, set the per-call price (a free tier is allowed), agent operators pay from prepaid credit, and AE takes a rake only on paid calls.

The current source has no billing or Stripe module. The current money-adjacent source is the narrowly bounded outbound x402 provider transport. It is not customer-reachable payment or settlement, and T2 explicitly rejects inbound x402/USDC in favour of account credit/API-key metering. This plan does not turn outbound x402 into an inbound rail.

The identity and invocation seams are already source-owned:

- `src/lib/server/customer-request-agent-auth.ts` authenticates a Clerk API key, re-reads its current state, and returns `principalId: clerk_api_key:<key id>`, `ownerId`, `credentialId`, current scopes, and the derived authority mode. The `principalId` is the billing identity. Do not replace it with `ownerId`, a caller-supplied account id, or `authority.callIdentity.keyId`.
- `src/modules/customer-request/agent-contract.ts` owns the base `customer_requests:create` scope and the ranked `inspect_only`, `approve_each`, `bounded_mandate`, and `full_yolo` mode scopes. A mode scope is an authority ceiling, not payment authority. Existing RouteMandate, Action Attempt, principal, generation, spend, expiry, input, and idempotency checks remain mandatory.
- `src/modules/capability-supply/route-transport-runtime.ts` validates an admitted transport binding and exact `authority.maximumSpend`, then returns `succeeded`, `refused`, `partial`, or `unknown` observations with release/payment/settlement states. It owns provider transport, not AE customer credit.
- `src/modules/action-invocation/dynamic-published-adapter.ts` owns the paid published-operation action. Its `preReleaseCheck` validates the current source, prepares the route transport, and claims the semantic idempotency identity before `run` calls `executeDynamicPublishedTransport`. This is the metering seam. Metering must run after source requalification and semantic-claim admission, but before provider release. It must not be inserted into `route-transport-runtime.ts` or an adapter-specific branch.
- `src/modules/action-invocation/dynamic-published-execution.ts` already records x402 payment-attempt state and throws `published_operation_outcome_unknown:*` or `published_operation_payment_reconciliation_required:*` after release uncertainty. `src/modules/action-invocation/application-service.ts` already exposes `recoverPaidOperation` and `afterPaymentReconciliationPersist`; T12 must connect to those transitions rather than inventing retry or reversal semantics.
- `convex/schema.ts` is a composition root. New tables belong in a money module schema fragment and are spread into the root. Convex module rules require bounded indexed reads, module-owned schema, internal writes for sensitive state, explicit CAS/idempotency, and no unbounded `.collect()`.

Pattern grounding is mandatory. Pricing and prepaid-credit mechanics below borrow the OpenRouter credit/key/402 loop, Apify pay-per-event publication and payout stages, and the RapidAPI free hard-cap matrix documented in `.planning/research/2026-07-30-marketplace-pattern-borrow.md` §§1–3 and “Transferable shape for AE.” Real-time authorization deliberately follows that document’s verdict: Stripe Billing Meters are asynchronous and invoice-period/arrears oriented, so AE owns the live ledger and may export settled summaries later (§3, “Usage meters and Australia”; §“Metering ledger”). Gross → AE fee → provider net, Connect onboarding, KYC, webhook status, and threshold/hold handling follow its “Rake and payout rail” transfer. Rake remains an AE hypothesis: Gurley’s framework in `.planning/research/2026-07-30-flywheel-patterns.md` §2 says high rake creates supplier friction and that high volume plus a modest rake is the sustainable shape; it does not prescribe a number. The same document’s atomic-network/hard-side framing (§1 and §“Transferable shape for AE”) keeps this plan focused on one reliable provider call and real liquidity, not invented growth tactics.

## Decisions settled

1. **Module home and ownership.** Add a source-owned `money` module, not `billing`, `payments`, or a route-owned store:
   - `src/modules/money/public.ts` is the only cross-module seam for pricing types, ledger outcomes, charge/refund transitions, payout projections, and bounded query contracts.
   - `src/modules/money/internal/convex-schema.ts` exports `moneyTables`.
   - `src/modules/money/internal/pricing-config.ts` owns validation and price resolution.
   - `src/modules/money/internal/ledger.ts` owns pure balanced-journal and CAS/idempotency rules.
   - `src/modules/money/internal/payout-policy.ts` owns KYC/hold/threshold state transitions.
   - `src/modules/money/internal/ports.ts` defines provider-neutral Stripe/top-up/payout ports. No Stripe SDK enters a query/mutation module.
   - `convex/moneyLedger.ts` is the validator/authorization/transaction adapter. `convex/moneyStripe.ts` is a dedicated Node action file beginning with `"use node"`; it is the only Stripe SDK boundary. `convex/schema.ts` spreads `moneyTables`.
  The choice follows the module-owned schema rule and the project payment policy's requirement to keep a neutral AE contract separate from a provider transport.

2. **AE’s append-only ledger is the live authorization source of truth.** Do not use Stripe Billing Meters, Metronome, Lago, OpenMeter, a Stripe invoice, or a dashboard balance to authorize a call. Stripe’s documented meter aggregation is asynchronous and arrears-oriented, and Stripe now directs new real-time/prepaid builds toward Metronome; that is unsuitable for a synchronous debit (`marketplace-pattern-borrow.md` §3 and §“Metering ledger”). AE may export settled summary rows to Stripe after the fact, but an export never grants credit or changes an AE balance.

3. **Ledger identity and units are strict.** Amounts are non-negative safe integers in minor units. Every account has one ISO-4217 uppercase `currency`; there is no FX or cross-currency debit. An operator account is keyed by the exact T3 `principalId` plus currency: `clerk_api_key:<id>:<currency>`. A provider account is keyed by `business:<businessId>:<currency>`. The AE fee account is keyed by `ae:rake:<currency>`. A missing or malformed T3 principal returns `billing_identity_missing`; a currency mismatch returns `currency_mismatch`. No API body, MCP argument, operation input, or provider response can select another account.

4. **The append-only journal has exactly these posting types.** A logical transaction may insert several immutable postings atomically, all sharing a `transactionRef`:
   - `topup`: credit the operator account only after a verified Stripe payment-success event.
   - `charge`: debit the operator account by the resolved gross service price.
   - `refund`: reverse a prior charge’s operator debit and its provider/rake credits when reconciliation proves that no provider release occurred or a refund is explicitly approved.
   - `payout_accrual`: credit the provider account with the provider net share on a paid call; a payout release appends a negative `payout_accrual` posting after Stripe confirms the transfer.
   - `rake`: credit AE’s fee account with the fee share on a paid call; a refund appends a negative `rake` posting.
   A paid call’s charge, provider accrual, and rake split are one atomic balanced journal transaction, not three independently retryable writes. A free call creates no `charge`, `payout_accrual`, or `rake` posting. This is the documented gross → fee → net shape from `marketplace-pattern-borrow.md` §“Rake and payout rail,” not an invented fee label.

5. **The exact ledger tables and immutable/control split are fixed.** `moneyLedgerEntries` is append-only. `moneyAccounts` is a bounded materialized head used only with the immutable entries and CAS version. `moneyTransactions` is command identity/control state, not a second balance source. `moneyUsageEvents` and `moneyFreeTierCounters` support bounded activity/quota reads; they never authorize paid spend independently. `moneyStripeEvents` deduplicates webhook event ids. `moneyPayoutAccounts` and `moneyPayouts` hold the external onboarding/transfer state machine. No parent document stores an unbounded child collection.

6. **Pricing configuration is business-owned, call-unit, and closed.** T12 exports this exact public contract for T11 and later supply writers:

   ```ts
   type PricingConfig = {
     version: 'pricing:v1'
     unit: 'call'
     currency: string             // uppercase ISO-4217
     paidAmountMinor: number      // safe non-negative integer
     freeTier?: {
       maxCalls: number           // positive integer
       window: 'day' | 'month'    // UTC window
     }
   }
   ```

   `pricingConfigSchema` is strict. `paidAmountMinor === 0` is an always-free call; otherwise `freeTier` is an optional hard cap per principal, offering, and UTC window, after which the published paid amount applies. The shape borrows RapidAPI’s free hard-cap plus paid-overage matrix and Apify PPE’s primary/custom event unit (`marketplace-pattern-borrow.md` §§1–3 and §“Pricing configuration”). It does not copy RapidAPI plan names, prices, or universal quotas, and it does not derive a price from display text. Existing capability-supply `presentation.price`/`PublishedOperation.identity.price` remains the published source and must bind to the same `priceDigest`.

   `resolveInvocationPrice({ config, freeCallsUsed, priceDigest })` returns exactly:

   ```ts
   | { kind: 'free'; reason: 'zero_price' | 'free_tier'; currency: string; amountMinor: 0; priceDigest: string }
   | { kind: 'paid'; currency: string; amountMinor: number; priceDigest: string }
   | { kind: 'refused'; code: 'price_unavailable' | 'pricing_config_invalid' | 'currency_mismatch' }
   ```

   The free-call counter is read and incremented inside the same Convex mutation; it is never supplied as trusted caller input. T11 imports `PricingConfig`/`pricingConfigSchema` only from `src/modules/money/public.ts`. If T11 lands first, it injects a clearly named `PricingConfigPort` with `stubPricingConfigPort` that validates/display-projects pricing but performs no ledger operation; the stub is a temporary dependency seam, not a second pricing authority.

7. **Rake is parameterized and is a founder HITL decision.** Store `rakeBps` as integer basis points (`0..10_000`) in a platform configuration record. Compute `rakeMinor = floor(grossAmountMinor * rakeBps / 10_000)` and `providerNetMinor = grossAmountMinor - rakeMinor`; reject overflow or a missing configuration with `rake_not_configured`. Use `application_fee_amount` semantics for a fixed per-call minor-unit split; if a future Stripe destination charge uses a percentage, use at most two decimal places as Stripe documents. Do not apply an application fee to a Stripe Transfer, and do not double-charge a prepaid top-up. The current prepaid flow charges the operator in AE’s ledger and transfers provider net later; the Stripe application-fee semantics are the auditable gross/fee/net mapping, not permission to charge the operator twice.

   **HITL — founder:** choose the production `rakeBps` after reviewing Gurley’s low/modest-rake framework. The research’s low-single-digit-to-10%-range examples are AE hypotheses, not a recommendation or a fact (`flywheel-patterns.md` §2 and §“Transferable shape for AE”). Until set, paid calls return `rake_not_configured`; no hidden default, Apify’s 80%, RapidAPI’s 20%, or “X%” public claim is permitted.

8. **Paid-call sequence and release boundary are fixed.** In `dynamic-published-adapter.ts` `preReleaseCheck`, after `requalifyDynamicPublishedSource`, `prepareDynamicPublishedTransport`, and semantic idempotency claim admission, call `money.authorizeInvocationCharge` with the already-admitted principal, invocation/attempt/effect-generation identity, operation key, capability contract digest, business id, exact `PricingConfig`/price digest, and exact amount. The call must be before `run` calls `executeDynamicPublishedTransport`; it must not be in `route-transport-runtime.ts`.

   - `free` resolution: increment the bounded free-tier counter and write a `moneyUsageEvents` row with `chargeState: 'free_tier'`; return no ledger transaction. No rake or provider accrual exists.
   - `paid` resolution: atomically CAS the operator account, insert the `charge`, `payout_accrual`, and `rake` postings, insert one `moneyTransactions` row, and write the usage row. The exact provider net and fee are recorded in the same transaction. If balance is insufficient, make no posting and return the exact refusal below.
   - Existing semantic idempotency replay returns the earlier operation result and does not create another charge. A same idempotency key with a different material digest returns `ledger_idempotency_conflict`.
   - The provider operation’s existing `authority.maximumSpend` remains the ceiling. T12 never increases it, chooses a recipient, chooses a credential, or trusts the caller’s amount. This is the exact admitted-action/payment boundary.

9. **Insufficient-credit refusal is exact and pre-release.** A paid preflight failure returns HTTP `402` from an HTTP host that maps the action result, with `Cache-Control: no-store` and this exact machine body:

   ```json
   {
     "kind": "refused",
     "code": "insufficient_credit",
     "retryable": false,
     "nextAction": "credit_topup_required",
     "currency": "USD",
     "requiredAmountMinor": 500,
     "availableAmountMinor": 0
   }
   ```

   The amount fields are the actual resolved currency/amount, not the illustrative values above. `nextAction` is a machine literal; human surfaces may explain “Add credit” at the decision point without widening the machine contract. No ledger posting, provider request, Stripe charge, or x402 payment starts. Other exact money refusal literals are:

   ```text
   billing_identity_missing
   price_unavailable
   pricing_config_invalid
   currency_mismatch
   price_changed
   rake_not_configured
   insufficient_credit
   ledger_idempotency_conflict
   ledger_cas_conflict
   charge_reconciliation_required
   credit_topup_amount_invalid
   credit_topup_required
   credit_topup_pending
   credit_topup_outcome_unknown
   stripe_setup_required
   payout_not_ready
   payout_below_threshold
   payout_outcome_unknown
   payout_reconciliation_required
   ```

   `insufficient_credit` is non-retryable until a top-up succeeds. `ledger_cas_conflict` is retryable only for the same admitted operation and idempotency identity. `charge_reconciliation_required` and all outcome-unknown codes are never automatic retries.

   `/api/v1/services` remains the listing/readiness projection, not a charge route. `/mcp` remains the distribution/registered-action host. For MCP, preserve the typed `insufficient_credit` result in the tool’s structured error path; do not pretend that a JSON-RPC tool error is an HTTP 402. No new anonymous tool or unauthenticated payment route is added. Projections and hosts transport the source-owned result and do not widen authority.

10. **Outcome-unknown and reconciliation semantics are explicit.** A charge is financially committed before provider release so concurrent calls cannot overspend the same balance. If provider release begins and the transport returns an ambiguous/network/unknown result, T12 marks the charge transaction `outcome_unknown`, leaves the debit/provider/rake split intact, returns `charge_reconciliation_required`, and blocks retry. The existing `published_operation_outcome_unknown:*` / `published_operation_payment_reconciliation_required:*` transitions govern this state.

    - A pre-release failure with `releaseStarted === false` appends one atomic `refund` reversal and permits a fresh operation key.
    - A release-started result that is not independently reconciled as “not released” remains charged; a provider receipt proves only the named provider event, not fulfilment.
    - Wire T12 into `dynamic-published-adapter.ts`’s `run`/resolution handling and `application-service.ts`’s `afterPaymentReconciliationPersist`/`recoverPaidOperation`. On `reconciled_not_released`, append one idempotent refund reversal. On `reconciled_released` or a settled provider observation, keep the original charge and provider/rake accrual. A missing or malformed reconciliation evidence record returns `payout_reconciliation_required`/`charge_reconciliation_required` as applicable; it never silently refunds or retries.
    - A refund never edits or deletes prior rows. It appends reverse postings that reference the original `transactionRef`, and a second refund request replays the first reversal.

11. **Credit purchase uses a Stripe top-up, not a meter or crypto wallet.** The OpenRouter-shaped controls are fixed: one-time credit purchase has a configured minimum and maximum, auto-recharge fires when balance falls below a configured threshold, and an insufficient-balance call is refused before release (`marketplace-pattern-borrow.md` §2). The first USD fixture uses the documented `$5` minimum and `$25,000` maximum (`500` and `2_500_000` minor units); production currency limits must be configured per supported ISO currency and never silently converted. No crypto/USDC top-up is supported.

    The source-owned flow is:

    1. An authenticated owner in T13’s demand console selects one of their exact T3 key identities, currency, and amount. The server verifies current Clerk key state and owner binding; the browser/agent never supplies a Stripe customer or payment-method authority.
    2. `money.beginCreditTopup` validates bounds, creates an idempotent `topup` command, and asks the server-held Stripe adapter for a PaymentIntent/checkout flow with the exact amount/currency. Secrets and payment-method material stay server-side.
    3. A signed Stripe success webhook, not a browser return, calls `money.applyCreditTopup`. It verifies event id and PaymentIntent id, input digest, currency, amount, and the target principal. It atomically inserts one `topup` posting and updates the transaction. Duplicate event delivery replays.
    4. A provider refusal before Stripe release returns `credit_topup_pending`/a typed failure with no credit. A network failure after intent creation/confirmation records `credit_topup_outcome_unknown` with the PaymentIntent id and requires a GET/webhook reconciliation before another attempt. Never create a second PaymentIntent because a response was lost.
    5. `autoRecharge` is `{ enabled, thresholdMinor, rechargeAmountMinor }`, with both amounts inside the same configured bounds. When a settled charge drops the account below threshold, create at most one in-flight auto-recharge command keyed by account head/version. A pending or unknown command suppresses another attempt; the owner must reconcile or disable it. The owner can update or cancel it. This is the OpenRouter mechanic, with AE’s payments-skill outcome-unknown boundary.

    Stripe account, product/payment-method configuration, webhook signing secret, supported countries/currencies, tax/refund policy, and production payment credentials are **HITL — Stripe account owner**. No real customer payment claim follows a fake or local Stripe adapter.

12. **Payouts use Connect Accounts v2 for new integration; Express is not the default.** Stripe documents Accounts v2 as GA and warns that Express is legacy; use Accounts v2 configurations and the one-account API for the new integration. Borrow the Express flow’s resumable onboarding/link/status pattern only where Accounts v2’s current API requires it, and never silently downgrade to legacy Express (`marketplace-pattern-borrow.md` §§3 and “Rake and payout rail”).

    The internal payout state machine is:

    ```text
    not_started
      -> onboarding_started
      -> submitted
      -> restricted            (requirements/KYC incomplete or rejected)
      -> ready                 (required recipient capability active)
      -> review                (prior UTC month batch, owner may inspect)
      -> held_kyc | held_threshold
      -> transfer_pending
      -> paid | failed | outcome_unknown
    ```

    - Create the Accounts v2 connected account and onboarding link only from the server-held Stripe adapter. Returning from a link is not proof of KYC; normalize Stripe account/capability webhooks into `submitted`, `restricted`, and `ready`. This follows the documented `account.updated`/status readback requirement.
    - **HITL — Stripe account owner:** confirm platform country/profile, Accounts v2 configuration (`merchant`, `customer`, or `recipient` as supported), dashboard mode, recipient capability, webhook event set, and whether any v1-only recipient agreement/OAuth step is required. No Express fallback is permitted.
    - **HITL — payout policy owner with Stripe setup:** set `minimumPayoutMinorByCurrency`. A payout batch never transfers below its configured threshold; the exact production threshold is configuration, not an implementer guess. Local tests use `20_00` in a fixture currency only, reflecting Apify’s documented `$20` low-method threshold; do not claim the `$100` other-method threshold applies to Stripe (`marketplace-pattern-borrow.md` §1 “Payouts, KYC, and thresholds”). Below threshold remains `held_threshold` and rolls to the next batch.
    - Use the documented monthly settlement shape as the default batch policy: on the 11th UTC, create a bounded review batch for the prior month; allow review until the 14th; auto-approve at the end of that window, then apply KYC and threshold gates. Unpaid/unknown/refunded revenue is excluded or held until settled, matching the documented Apify payout pattern. Do not make a provider balance payable merely because a charge row exists.
    - At transfer release, atomically mark one `moneyPayouts` row `transfer_pending` with exact amount/currency, payoutRef, connected-account id, and Stripe idempotency key. The Stripe adapter uses a server-side transfer/create call for provider net. If the network fails after release, mark `payout_outcome_unknown` and reconcile by the exact Stripe transfer id/idempotency key before retry. A failed transfer that is proven not released returns the payout to `held_kyc`/`held_threshold` without changing historical accruals; a confirmed paid transfer appends the negative `payout_accrual` posting.
    - Present every provider balance as `gross paid-call accrual → AE rake → provider net → paid out/held`. This is the Stripe application-fee split vocabulary (`application_fee_amount` for exact per-call amounts, `application_fee_percent` only when Stripe calculates a final recurring amount), not a claim that a transfer itself accepts an application fee.

    Stripe onboarding, KYC, webhook, and transfer execution are **HITL — Stripe account owner**. Until those setup checks and sandbox readback pass, payout state can be recorded locally but must remain `stripe_setup_required`/`payout_not_ready` and no public copy may say that a business was paid.

13. **Billing identity and T13 query seams are explicit.** The authenticated action context must carry the T3 `principalId` into the money command. The ledger never derives identity from a raw API key secret, Clerk owner alone, `orgId`, `authority.callIdentity.keyId`, or a body field. A rotated/revoked key is a new principal until a separately approved identity migration exists; do not merge balances by `ownerId` in T12.

    Export these read seams from `src/modules/money/public.ts`; T13 consumes them through bounded Convex source queries/server functions and never reads `money*` tables directly:

    - `readCreditAccount({ principalId, currency })` → balance, pending top-up summary, auto-recharge settings (without payment-method secrets), and evidence/status.
    - `listCreditActivity({ principalId, credentialId?, currency?, from?, to?, cursor?, limit })` → bounded top-up, free-call, paid-call, refund, and refusal activity with service/offering label, operation/key identity, gross amount, currency, charge state, and observed time.
    - `readKeyUsage({ principalId, credentialId?, from?, to?, cursor?, limit })` → per-key call count, paid/free count, gross spend, and current/unknown/reconciled states. The key id is an attribution filter, not a substitute for principal binding.
    - `readProviderEarnings({ businessId, currency, cursor?, limit })` and `readPayoutStatus({ businessId, currency })` → T11 owner earnings/payout projection after the T12 ledger lands.

    These activity/read shapes borrow OpenRouter’s credits/activity/key loop (`marketplace-pattern-borrow.md` §2 and §“Demand console”) and use a16z’s named match/fill, time-to-match, and market-depth metrics only when actual invocation telemetry exists (`flywheel-patterns.md` §2 and §“Transferable shape for AE”). They do not claim causal network growth, supply quality, customer value, or payment settlement. All local/dev evidence remains labelled.

14. **No public claim or surface is widened by this plan.** `/api/v1/services` and `/mcp` continue to project/list the same capability supply; the metered invocation result is the source-owned action result transported through those hosts. Credit purchase and payout setup are authenticated owner surfaces, not anonymous discovery. The project’s public-copy and surface rules require exact effect, authority, refusal, and evidence wording. Do not add “paid,” “settled,” “automatic payout,” or “agents pay” to public copy until the named local/sandbox/hosted evidence level supports that exact claim.

## Approach

### 1. Freeze contracts and refusal vocabulary

- Add `src/modules/money/public.ts` with the exact `PricingConfig`, `PricingResolution`, `MoneyRefusalCode`, ledger entry, account, activity, payout, and query-result types from Decisions 5–7 and 13. Use strict Zod schemas for public command inputs; do not export Convex validators or internal table ids.
- Add `src/modules/money/internal/pricing-config.ts` with `pricingConfigSchema`, `normalizePricingConfig`, `pricingConfigDigest`, `resolveInvocationPrice`, and `computeRakeSplit`. Validate uppercase ISO-4217, safe minor units, UTC free-tier windows, and `0 <= rakeBps <= 10_000`. Never parse a price from human copy.
- Add focused tests under `tests/unit/money/pricing-config.test.ts`: zero-price free, free-tier before/at cap, day/month UTC rollover, paid resolution, invalid config, currency mismatch, digest change, exact floor rounding, zero rake, 100% rake, and overflow. Include the cited research pattern in the test description, not a public claim.

### 2. Add module-owned Convex schema and bounded indexes

- Add `src/modules/money/internal/convex-schema.ts` exporting `moneyTables` and only `defineTable`/`convex/values` declarations. Use these exact table shapes:

  - `moneyAccounts`: `accountRef`, `accountKind` (`operator_credit`/`provider_earnings`/`ae_rake`), optional `principalId`, optional `businessId`, `currency`, `balanceMinor`, `version`, `state` (`active`/`locked`), `createdAt`, `updatedAt`; indexes `by_accountRef`, `by_principalId_and_currency`, `by_businessId_and_currency`.
  - `moneyLedgerEntries`: immutable `entryRef`, `accountRef`, `entryType` (`topup`/`charge`/`refund`/`payout_accrual`/`rake`), `direction` (`credit`/`debit`), `amountMinor`, `currency`, `transactionRef`, `idempotencyKey`, optional `principalId`, optional `businessId`, optional `invocationRef`, optional `attemptRef`, `sourceDigest`, bounded `evidenceRefs`, `createdAt`; indexes `by_transactionRef`, `by_accountRef_and_createdAt`, `by_principalId_and_createdAt`, `by_businessId_and_createdAt`.
  - `moneyTransactions`: `transactionRef`, `kind`, `idempotencyKey`, `inputDigest`, `principalId`, `currency`, `state` (`pending`/`applied`/`outcome_unknown`/`reversed`), `expectedAccountVersion`, optional `externalRef`, optional `reversalOf`, `createdAt`, `updatedAt`; indexes `by_idempotencyKey`, `by_transactionRef`, `by_principalId_and_createdAt`, `by_externalRef`.
  - `moneyUsageEvents`: `usageRef`, `principalId`, `credentialId`, `currency`, `serviceRef`, `offeringRef`, `businessId`, `invocationRef`, `attemptRef`, `operationKey`, `priceDigest`, `chargeState` (`free_tier`/`paid`/`insufficient_credit`/`outcome_unknown`/`refunded`), `amountMinor`, optional `transactionRef`, `observedAt`; indexes `by_principalId_and_observedAt`, `by_principalId_and_credentialId_and_observedAt`, `by_businessId_and_observedAt`, `by_invocationRef`.
  - `moneyFreeTierCounters`: `counterRef`, `principalId`, `offeringRef`, `window`, `windowStart`, `callsUsed`, `version`, `updatedAt`; indexes `by_principalId_and_offeringRef_and_windowStart`, `by_offeringRef_and_windowStart`.
  - `moneyStripeEvents`: `stripeEventId`, `eventType`, `payloadDigest`, `status` (`received`/`applied`/`ignored`/`failed`), optional `appliedRef`, `receivedAt`, `appliedAt`; index `by_stripeEventId`.
  - `moneyPayoutAccounts`: `businessId`, `currency`, opaque `stripeAccountId`, `state` (`not_started`/`onboarding_started`/`submitted`/`restricted`/`ready`), `detailsSubmitted`, `recipientCapabilityActive`, `requirementsDigest`, optional `lastStripeEventId`, `createdAt`, `updatedAt`; index `by_businessId_and_currency`.
  - `moneyPayouts`: `payoutRef`, `businessId`, `currency`, `grossAccrualMinor`, `rakeMinor`, `providerNetMinor`, `minimumPayoutMinor`, `state` (`review`/`held_kyc`/`held_threshold`/`transfer_pending`/`paid`/`failed`/`outcome_unknown`), `periodStart`, `periodEnd`, optional `stripeTransferId`, `idempotencyKey`, optional `failureCode`, `createdAt`, `updatedAt`; indexes `by_businessId_and_currency_and_state`, `by_periodStart_and_state`, `by_stripeTransferId`.

- Add `...moneyTables` to `convex/schema.ts` at the module composition root. Do not add inline money tables to the root or to a route. Read `convex/_generated/ai/guidelines.md` before implementing the Convex files.
- Add `tests/unit/schema/money-schema.test.ts` (or extend the existing schema contract) to assert table names, validators, index field order, no raw secrets/payment methods, and no unbounded child arrays.

### 3. Implement pure ledger and CAS transitions

- Add `src/modules/money/internal/ledger.ts` functions `beginIdempotentTransaction`, `applyTopup`, `authorizePaidCharge`, `appendRefundReversal`, `markOutcomeUnknown`, `reconcileCharge`, and `releasePayoutAccrual`. Each returns an ordinary discriminated outcome with the exact refusal literals; unexpected faults throw with no false success.
- Define the charge journal as one Convex mutation: read the three account heads by indexed `accountRef`, verify all currencies, verify the expected operator version and non-negative resulting balance, insert the operator `charge` debit, provider `payout_accrual` credit, and AE `rake` credit with one `transactionRef`, advance all three account versions, insert `moneyTransactions`, and insert usage. There is no partial success path.
- Define idempotency as `(principalId, operationKey, attemptRef, effectGeneration)` plus `inputDigest`; the transaction index must replay the same result when digest matches and return `ledger_idempotency_conflict` when it differs. CAS version mismatch returns retryable `ledger_cas_conflict`; it never reads all ledger rows to recompute a balance.
- Use the same journal reversal operation for refunds and reconciliation-proven “not released” outcomes. Keep original entries immutable and link reverse postings with `reversalOf`.
- Add `tests/unit/money/ledger.test.ts` for atomic three-account posting, insufficient credit with zero writes, duplicate replay, digest conflict, concurrent CAS, free call no ledger postings, refund exactly once, unknown lock, reconciled-not-released refund, and reconciled-released keep.

### 4. Add Convex source adapters and authenticated query seams

- Add `convex/moneyLedger.ts` with typed internal mutations for `authorizeInvocationCharge`, `markChargeOutcomeUnknown`, `reconcileCharge`, `appendRefund`, and `releasePayoutAccrual`; typed authenticated queries for `readCreditAccount`, `listCreditActivity`, `readKeyUsage`, `readProviderEarnings`, and `readPayoutStatus`. Every growing read uses the named compound index plus `take`/cursor bounds; no `.collect()`.
- Derive human-console identity with `ctx.auth.getUserIdentity()` and require the caller to be an owner of the exact T3 key. For agent execution, accept only a source-owned service assertion that already contains the authenticated `principalId` and exact invocation authority; never expose the internal charge mutation as an anonymous public function.
- Add `src/modules/money/money.functions.ts` only for owner-console orchestration (`beginCreditTopup`, `setAutoRecharge`, `startPayoutOnboarding`, `requestPayout`), keeping Clerk session checks and route input translation outside pure ledger logic. Payment method ids, Stripe customer ids, and secrets never enter a browser result or public query.
- Add `tests/unit/money/query-projections.test.ts` for owner/principal cross-read refusal, cursor/limit bounds, per-key filters, no secrets, exact currency, and stable activity states. Add an integration test with two principals proving balances and usage cannot cross-read.

### 5. Insert metering at the action pre-release seam

- Update `src/modules/action-invocation/dynamic-published-adapter.ts` inside `createDynamicPublishedAction`’s `preReleaseCheck`, after source requalification, transport preparation, and semantic idempotency claim admission at the exact point before `preparedTransports.set(key, preparation.prepared)`/`run`.
- Pass an injected `MoneyInvocationPort` through the adapter factory. It must receive the actor `principalRef`, operation/business/offering refs, operation key, invocation/attempt/effect generation, capability contract digest, exact published pricing config/digest, and authority maximum spend. It returns either the typed free result, accepted charge reference, or a money refusal. It must not receive a caller-selected recipient, credential, amount above the admitted price, or Stripe secret.
- On accepted paid charge, persist the charge reference in the invocation source material so `run` and reconciliation use the exact command identity. On money refusal, clear the semantic claim if the source supports claim release for a pre-release refusal, return a typed `published_operation_refused` result with `failureCode: 'insufficient_credit'`/the exact money code, and do not call the transport.
- In `run`, call the existing `executeDynamicPublishedTransport` unchanged for transport behavior, then call the injected money settlement transition. A result with no release becomes an idempotent refund; a release-started unknown/error marks `charge_reconciliation_required`; a successful/settled result keeps the split. Do not catch and relabel `published_operation_outcome_unknown` as success.
- Update the `onExecutionResolved`/`afterPaymentReconciliationPersist` path to call `reconcileCharge` exactly once for the corresponding invocation/attempt/generation. Reuse `application-service.ts` `recoverPaidOperation`; do not add a second reconciliation UI or retry path.
- Extend `tests/unit/action-invocation/dynamic-published-adapter.test.ts` (or the existing dynamic published tests) for paid/free/insufficient, no-provider-request preflight, duplicate semantic replay, release-started unknown, not-released refund, reconciled release, and no charge on an invalidated/stale authority.

### 6. Add Stripe credit top-ups with a server-held adapter

- Add `src/modules/money/internal/ports.ts` interfaces for `createCreditPayment`, `readCreditPayment`, `createConnectAccount`, `createOnboardingLink`, `createProviderTransfer`, and `readProviderTransfer`. Each takes exact server-owned account/ref/idempotency material and returns attributable provider evidence; no port accepts a raw secret from a caller.
- Add `convex/moneyStripe.ts` beginning with `"use node"`. Import the Stripe SDK only here, keep credentials in deployment secrets, and expose actions that call the pure money module through internal mutations. Do not import Stripe from `src/routes/*`, `route-transport-runtime.ts`, or shared query modules. Add the `stripe` dependency only in the implementation change, after the Stripe HITL account decision.
- Add `src/routes/api.stripe.webhook.ts` as a thin raw-body adapter to the Node Stripe webhook action. Verify the signature before calling an internal mutation; use `moneyStripeEvents` event-id idempotency. The route must not apply balances or payout state itself.
- Add `tests/unit/money/stripe-adapter.test.ts` with injected provider-port fixtures for exact min/max, currency, PaymentIntent idempotency, signed-success-only top-up, duplicate webhook, missing webhook/outcome unknown, and no secret in result/log fixtures. Add a sandbox provider test only after the HITL Stripe account setup; label it `local/dev` or `sandbox`.

### 7. Implement Connect Accounts v2 onboarding, hold, and payout release

- Add `src/modules/money/internal/payout-policy.ts` with pure transitions for KYC state, monthly review/auto-approval, threshold hold, transfer pending, paid, failed, and outcome unknown. Require `detailsSubmitted` plus active recipient/payout capability for `ready`; never infer readiness from an onboarding redirect.
- Add internal mutations for signed account-status webhook application, monthly review-batch creation, owner review, payout begin, and transfer outcome. Monthly batch reads use `periodStart/state` indexes and bounded pages. A batch aggregates only settled provider accrual entries through indexed/provider account queries; it excludes unknown/refunded/unpaid rows.
- In the Node Stripe action, create Accounts v2 accounts and onboarding links according to the HITL-confirmed configuration, normalize status webhooks, and create one exact provider-net transfer per `payoutRef` with a stable Stripe idempotency key. Reconcile by transfer id before retry after any ambiguous response.
- Add `tests/unit/money/payout-policy.test.ts` for KYC-before-payout, status webhook not redirect, 11th/14th review window, below-threshold rollover, exact gross/fee/net, transfer idempotency, failed-before-release, unknown-after-release, and paid release posting. Use a fixture threshold only; do not claim a production threshold until HITL config exists.

### 8. Expose T13 demand-console read contracts and T11 pricing seam

- Export the five query functions in Decision 13 from `src/modules/money/public.ts` and implement them through `convex/moneyLedger.ts` with owner/principal checks and bounded pagination.
- T13 must consume `readCreditAccount`, `listCreditActivity`, and `readKeyUsage` for the selected exact T3 key identity. It must not merge keys by owner or read `money*` tables. Its add-credit flow calls the owner-only `beginCreditTopup` function and shows the returned hosted payment action; it never handles Stripe secrets.
- T11 must use `PricingConfig`/`pricingConfigSchema` for its publish monetization step and retain the `PricingConfigPort`/`stubPricingConfigPort` seam if T12 is not yet present. T11’s supply listing still uses the capability-supply public projection and `/api/v1/services`/`/mcp`; money is not a rival catalog.
- Add a contract test proving T13 query results use exact key principal, return bounded activity, and expose free/paid/unknown/refunded states without unsupported settlement claims.

### 9. Copy, action descriptors, and surface review

- Do not add a public discovery action for Stripe top-up or payout. These are authenticated owner operations, not anonymous `/mcp` tools. If a future registered action needs a credit check, declare its exact read/write/consequence/authority/retry metadata in its module action descriptor and register it in `src/modules/actions/index.ts`; registration alone does not expose a route.
- Keep the agent-visible refusal descriptor exact: `insufficient_credit` at the action seam, `nextAction: credit_topup_required`, no promise that the top-up already happened. Human copy says “Add credit” or “Your balance is below this service price” only where the owner can act; it does not expose `principalId`, ledger internals, or provider claims. Apply the project-owned copy rules and run the UI contract gate if any rendered copy changes.
- Keep `/api/v1/services` price/event unit deterministic and avoid flattened endpoint prices; the research explicitly flags that ambiguity (`marketplace-pattern-borrow.md` §5). No crypto rail, USDC, wallet, inbound x402, “guaranteed payout,” or “verified” payment claim is added.

### 10. Complete local labelled journey before any provider smoke

- Exercise anonymous `/api/v1/services` and `/mcp` reads first; prove they remain free and unchanged.
- Issue a T3 scoped key in the local Clerk-bypass fixture. Use a seeded free and paid operation. Verify free invocation records usage with no ledger posting/rake; paid invocation with zero balance returns exact `insufficient_credit` before provider `send` is called; top-up fixture applies once; a paid call creates the atomic three-account split; duplicate operation replay creates no second charge; a provider release-unknown transitions to reconciliation required; reconciliation-not-released appends one refund; reconciliation-released keeps the original split.
- Exercise Connect with an injected Stripe fixture: onboarding return remains `submitted`/`restricted` until a status event, payout below threshold is held, KYC-not-ready is held, paid transfer appends the negative payout accrual, and unknown transfer is not retried. Record all output as `labelled local/dev` or `sandbox`.
- Only after Stripe and Clerk HITL setup, run a Stripe test-mode readback with test credentials. A sandbox receipt proves the provider event it names; it does not prove live customer payment, business fulfilment, or marketplace liquidity.

## Critical files & anchors

- `.planning/wayfinder/tickets/T12-metering-payouts.md:1-13` — ticket scope, T2 extension, no crypto, HITL.
- `.planning/wayfinder/MAP.md:6-17,29-31,42-57` — Destination v2, T3 identity, T5 sentinel, `/mcp` and `/api/v1/services`, evidence boundary, T11/T13 dependency.
- `.planning/research/2026-07-30-marketplace-pattern-borrow.md:41-63,65-86,128-147` — OpenRouter credits/keys/402/auto-recharge, Stripe Accounts v2 and asynchronous meters, pricing/free-tier/rake/payout transfer, and AE’s own-ledger verdict.
- `.planning/research/2026-07-30-flywheel-patterns.md:5-18,47-55` — atomic network/hard side, payment-flow position, modest-rake hypothesis, a16z liquidity metrics, and no-crypto/high-rake skip list.
- `src/lib/server/customer-request-agent-auth.ts:28-87` — T3 principal construction and current-key Clerk verification.
- `src/modules/customer-request/agent-contract.ts:3-43,55-62` — exact base/mode scope literals and rank.
- `src/modules/capability-supply/internal/convex-schema.ts:17-25,39-130` — current fixed/range/on-request price and capability-supply schema ownership.
- `src/modules/capability-supply/route-transport-runtime.ts:28-48,98-145,235-246,318-455` — exact authority maximum spend, preparation, transport observations, and release boundary; do not put ledger logic here.
- `src/modules/action-invocation/dynamic-published-adapter.ts:255-350,352-386,404-447,625-670` — `preReleaseCheck`, semantic idempotency, `run`, resolution callback, and action execution attribution; the metering hook lives here.
- `src/modules/action-invocation/dynamic-published-execution.ts:75-167,169-300` — existing payment attempt/outcome-unknown/reconciliation transitions.
- `src/modules/action-invocation/application-service.ts:75-86,249-386` — `beforeExecute`, `recoverPaidOperation`, and `afterPaymentReconciliationPersist`; reuse the existing recovery seam.
- `src/modules/action-invocation/contracts.ts:32-50,53-86,117-135` — refusal and attempt outcome vocabulary, release/uncertainty states.
- `convex/schema.ts:1-39` — composition root; spread `moneyTables` here only.
- `src/modules/action-invocation/internal/convex-schema.ts:110-177` — bounded table/index style and durable `reconciliation_required` control states.
- `src/modules/actions/index.ts` — explicit registered-action seam if a future money action is intentionally exposed.
- `src/lib/server/convex-source.ts` and `convex/*` source adapters — use source query/mutation/action ports; routes stay thin and never import internal tables or Stripe.
- `src/components/ae/action-invocation/AePaidOperationCard.tsx:37-40,210-260` — existing customer-facing separation of payment evidence, result evidence, and outcome-unknown recovery; reuse its truth boundary if T13 renders paid activity.
- `package.json:7-53,55-88` — current scripts and absence of Stripe; add the provider dependency only as part of the HITL-gated implementation.
- Project-owned cross-cutting rules: authority, surface, copy, provider, schema, bounded work, and evidence.

## Verification

Run from the repository root. Do not report any local or fixture result as hosted, independent provider, real customer, settlement, or fulfilment evidence.

1. **Pure pricing and ledger contract:**

   ```sh
   npx vitest run \
     tests/unit/money/pricing-config.test.ts \
     tests/unit/money/ledger.test.ts \
     tests/unit/money/query-projections.test.ts
   ```

   Required checks: exact pricing discriminant; zero/free cap/paid transition; exact basis-point rounding; atomic charge split; no writes on insufficient credit; idempotency replay/conflict; CAS conflict; refund reversal; unknown lock; bounded query cursors; principal/currency isolation.

2. **Invocation and reconciliation contract:**

   ```sh
   npx vitest run \
     tests/unit/action-invocation/dynamic-published-adapter.test.ts \
     tests/unit/action-invocation/dynamic-published-execution.test.ts \
     tests/unit/action-invocation/application-service.test.ts \
     tests/unit/money/metering-seam.test.ts
   ```

   Required checks: source requalification and semantic claim happen before metering; insufficient credit calls no provider; free calls bypass ledger; paid charge uses exact authority price; duplicate operation does not debit twice; release-started unknown blocks retry; reconciled-not-released refunds once; reconciled-released keeps the original split.

3. **Stripe adapter and payout policy fixtures:**

   ```sh
   npx vitest run \
     tests/unit/money/stripe-adapter.test.ts \
     tests/unit/money/payout-policy.test.ts \
     tests/unit/money/stripe-webhook.test.ts
   ```

   Required checks: exact configured min/max and currency, PaymentIntent/transfer idempotency, success webhook only, duplicate webhook replay, unknown external result blocks retry, Accounts v2 status does not infer KYC from redirect, 11th/14th review, KYC/threshold holds, exact gross/fee/net, and payout release posting.

4. **Convex schema/codegen/type boundaries:**

   ```sh
   npx vitest run tests/unit/schema/convex-schema.test.ts tests/unit/schema/money-schema.test.ts
   npm run typecheck
   npm run test:imports
   npm run test:ts-standards
   npm run check:convex-codegen
   ```

   Run `check:convex-codegen` only when the Convex environment/control-plane authorization is configured. If it fails first on missing deployment/env, record that as environment evidence; do not convert it into a source failure. Confirm no route imports Stripe, Convex internals, or money internals; no query uses unbounded `.collect()`; and no secret/payment-method field enters a public validator or fixture.

5. **Surface and copy gates:**

   ```sh
   npm run test:ui-contract
   npm run test:seo
   npm run audit:actions
   ```

   `test:seo` is required only if T12/T13 changes discovery metadata, `/SKILL.md`, or `llms.txt`; `test:ui-contract` is required for rendered credit/refusal/payout copy. Inspect the serialized `/api/v1/services` and local `/mcp` outputs. Assert listing remains read-only, price unit is explicit, anonymous tools remain unchanged, and `insufficient_credit` is not translated into a paid/settled claim.

6. **Labelled local end-to-end smoke:**

   ```sh
   VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E=true npm run dev -- --port 3020 --strictPort --host 127.0.0.1
   ```

   With a local fixture key whose authenticated principal is `clerk_api_key:<id>`: list services, call a free operation, call a paid operation with zero balance, apply a fake signed top-up through the real webhook adapter, call the paid operation, replay it, force a post-release unknown, reconcile it, and inspect the T13 query projections. Then exercise fake Connect onboarding/KYC/threshold/paid/unknown payout transitions. Label every result `labelled local/dev`; do not run real money without the HITL gates.

7. **HITL-gated Stripe sandbox smoke:**

   After the Stripe account owner confirms Accounts v2, supported currency, webhook signing, test credentials, payout policy, and refund/tax treatment, run the smallest Stripe test-mode top-up, webhook, Connect onboarding, status webhook, and transfer/reconciliation path. Record the exact deployed revision and provider evidence. A successful test-mode event remains sandbox/provider evidence and is not real customer or production settlement proof. Clerk Dashboard API-key enablement, production instance/domain, secrets, and key-scope readback are also **HITL** per T3; without them, use the labelled local fixture only.

## Assumptions & contingencies

- **T3 not fully deployed:** test with an injected `principalId` matching `clerk_api_key:<id>` and the existing auth port. Do not invent owner-based fallback. When Clerk API-key verification is unavailable, fail closed with `billing_identity_missing`; do not accept a raw key string.
- **T11 lands before T12:** keep `PricingConfigPort` and explicitly named `stubPricingConfigPort` in T11. The stub may validate/display a business price but must not debit, accrue, or expose a fake balance. Cut over to `src/modules/money/public.ts` without a second schema or alias once T12 is present.
- **Existing capability supply exposes only fixed prices:** map its fixed `price` to `PricingConfig` with `unit: 'call'`; a non-fixed/range/on-request operation is not executable for metering and returns `price_unavailable`. Do not estimate a range or charge from copy.
- **Stripe Accounts v2 capability/API mismatch:** stop at `stripe_setup_required`/`payout_not_ready` and keep accrued balances held. Do not silently use Express because Express is documented as legacy. A future deliberate Stripe decision can add an adapter revision without changing the AE ledger contract.
- **Stripe webhook or provider response is lost:** persist `pending`/`outcome_unknown` with the exact external id and idempotency key; reconcile by provider readback before another attempt. Never credit on a browser redirect, retry a transfer, or refund an unknown call without evidence.
- **Rake HITL is not complete:** return `rake_not_configured` for paid calls and do not publish an `X%` promise. A local fixture may use a named test BPS value; it is not the AE production rake decision.
- **Threshold/hold policy is not configured:** keep payouts `held_threshold` or `held_kyc`; do not choose a hidden default. The local fixture threshold only exercises the state machine and is labelled as such.
- **Multiple currencies:** maintain separate account heads and reject cross-currency operations. Do not add FX, stablecoins, USDC, wallet balances, or inbound x402. The outbound `x402-fetch:v2` transport remains a provider-side adapter with its existing payment-attempt reconciliation only.
- **Convex deployment/codegen unavailable:** complete pure module/unit tests and source inspection, then report the exact environment blocker. Do not claim deployed schema, hosted cost containment, scheduled payout cessation, or real payment.
- **Provider fulfillment remains outside evidence:** an applied ledger entry proves AE recorded the financial event named by the command. It does not prove the provider completed work, that a business accepted a job, or that customers received value.

## Five riskiest calls

1. **AE owns live authorization in an append-only journal instead of Stripe Meters.** This is the core correctness call. A bad account-head/CAS or duplicate reversal can overspend or double-pay; the atomic three-account transaction and exact idempotency contract are non-negotiable. Grounding: `marketplace-pattern-borrow.md` §“Metering ledger” and the AE ledger contract.
2. **Charging before provider release while freezing outcome-unknown.** This prevents concurrent overspend but means an ambiguous provider result holds customer credit and provider accrual until reconciliation. The existing Action Invocation release/recovery states must remain authoritative; no automatic retry or silent refund. Grounding: the existing Action Invocation transitions and payment-reconciliation contract.
3. **Binding balance to `principalId: clerk_api_key:<id>`.** It is the T2/T3 contract, but key rotation creates a new billing identity unless a future migration is explicitly approved. Any owner fallback would let one key spend another key’s credit. Grounding: T2 resolution and `customer-request-agent-auth.ts`.
4. **Choosing the production rake and payout threshold.** Gurley supplies a low/modest-rake hypothesis, not a number; Stripe setup and payout thresholds vary by account/currency/method. Founder/Stripe HITL must set `rakeBps` and `minimumPayoutMinorByCurrency`; no hidden default or copied marketplace percentage is allowed. Grounding: `flywheel-patterns.md` §2 and `marketplace-pattern-borrow.md` §§1/3.
5. **Using Stripe Connect Accounts v2 without pretending Express/destination-charge semantics are interchangeable.** Accounts v2 is GA and Express is legacy; a Transfer does not take `application_fee_amount`. AE must keep the prepaid customer charge in its own ledger, calculate gross/fee/net once, transfer provider net, and reconcile every ambiguous Stripe effect. Grounding: `marketplace-pattern-borrow.md` §§3 and “Rake and payout rail”.
