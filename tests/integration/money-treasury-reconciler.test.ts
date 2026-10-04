import { randomUUID } from 'node:crypto'
import type Stripe from 'stripe'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { eip3009ABI } from '@x402/evm'
import { encodeAbiParameters, encodeEventTopics, encodeFunctionData, erc20Abi, type Hex } from 'viem'
import { api, internal } from '../../convex/_generated/api'
import { reconcileTreasurySnapshot } from '../../convex/lib/money/treasury/snapshot'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { cdpX402CustodyBudgetRef, cdpX402CustodyConfigurationFromEnvironment } from '@/modules/capability-supply/convex'
import { createFormanceContext, installPackage4FormanceSchema, type FormanceContext } from '@/modules/money/formance'
import { bookFormanceTreasuryBatch, readFormanceTreasuryBalances } from '@/modules/money/formance-treasury'
import { bookFormanceFundingSettlement, reserveFormanceManagedCall, settleFormanceManagedCall, syncFormanceCapacity,
  capacityAccount } from '@/modules/money/formance-workflows'
import { isMoneyRefusal, quoteManagedX402BuyerAud, type CreditPaymentRequest } from '@/modules/money/public'
import { x402SpendPolicyFromEnvironment } from '@/modules/money/x402-spend-admission'
import type { TreasuryChainCheckpoint, TreasuryTransfer } from '@/modules/money/treasury'
import { mapStripeCheckoutSessionEvidence } from '../../src/lib/server/stripe-money-provider'
import { convexTestWithMarketComponents, ownerAdmin, type ConvexFixtureBackend } from '../helpers/convex-fixtures'
import { buildDevelopmentPublishedToolEvidence } from '../unit/capability-supply/fixtures/development-published-tool-evidence'

// Only external processor/RPC I/O is replaced. Formance SDK, builders, posting
// matchers, receipt decoding, controller and every Convex handler execute normally.
const external = vi.hoisted(() => ({ checkout: vi.fn(), intent: vi.fn(), charge: vi.fn(), refunds: vi.fn(), rpc: vi.fn() }))
vi.mock('stripe', async original => {
  const actual = await original<typeof import('stripe')>()
  return { default: class StripeBoundary {
    static API_VERSION = actual.default.API_VERSION
    static createFetchHttpClient = actual.default.createFetchHttpClient
    checkout = { sessions: { retrieve: external.checkout } }
    paymentIntents = { retrieve: external.intent }
    charges = { retrieve: external.charge }
    refunds = { list: external.refunds }
  } }
})
vi.mock('undici', async original => {
  const actual = await original<typeof import('undici')>()
  return { ...actual, fetch: (...args: Parameters<typeof actual.fetch>) =>
    String(args[0]).startsWith('https://8.8.8.8/') ? external.rpc(...args) : actual.fetch(...args) }
})

const PAYER: Hex = `0x${'1'.repeat(40)}`
const PAYEE: Hex = `0x${'2'.repeat(40)}`
const ASSET: Hex = '0x036cbd53842c5426634e7929541ec2318f3dcf7e'
const NETWORK = 'eip155:84532'
const digest = canonicalDigest('native-treasury-reconciler-fixture')
const hash = (n: number): Hex => `0x${n.toString(16).padStart(64, '0')}`
const PAYMENT_HASH = hash(501)
const NONCE = hash(502)
const CALL = 'call:native-reconciler'
const ATTEMPT = 'attempt:native-reconciler'
const ACCOUNT = 'account:native-reconciler'
const PRINCIPAL = 'principal:native-reconciler'
const LEGAL = 'legal:native-reconciler'
const sourceEnvironment = {
  AE_DEPLOYMENT_ENVIRONMENT: 'development', AE_X402_CUSTODY_ENABLED: 'true',
  AE_X402_CUSTODY_MAX_ATOMIC: '5000000', AE_X402_CUSTODY_DAILY_MAX_ATOMIC: '50000000',
  AE_X402_CUSTODY_PAYEE_DAILY_MAX_ATOMIC: '50000000', AE_X402_CUSTODY_NEW_PAYEE_MAX_ATOMIC: '5000000',
  CDP_API_KEY_ID: 'fixture-key', CDP_API_KEY_SECRET: 'fixture-secret', CDP_WALLET_SECRET: 'fixture-wallet-secret',
  AE_X402_CDP_ACCOUNT_NAME: 'fixture-wallet', AE_X402_CDP_EXPECTED_EVM_ADDRESS: PAYER,
  AE_X402_CDP_ACCOUNT_POLICY_ID: '11111111-1111-4111-8111-111111111111',
  AE_X402_CDP_PROJECT_POLICY_ID: '22222222-2222-4222-8222-222222222222',
  AE_X402_CDP_POLICY_RULES_DIGEST: digest, AE_X402_CDP_CREDENTIAL_GENERATION: '1',
  STRIPE_READBACK_KEY: 'rk_test_treasury_fixture',
  AE_X402_RPC_URLS_JSON: JSON.stringify({ [NETWORK]: ['https://8.8.8.8/rpc-one', 'https://8.8.8.8/rpc-two'] }),
}
const custody = cdpX402CustodyConfigurationFromEnvironment(sourceEnvironment)!
const custodyRef = cdpX402CustodyBudgetRef(custody, 'sandbox')
const policy = x402SpendPolicyFromEnvironment(sourceEnvironment, { environment: 'sandbox', network: NETWORK, asset: ASSET })!
const identity = { environment: 'sandbox' as const, custodyRef, custodyGeneration: 1,
  network: NETWORK, asset: ASSET, address: PAYER, bufferTargetUnits: '5000000' }
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs() })

async function bookRange(backend: ConvexFixtureBackend, context: FormanceContext,
  previousCheckpoint: TreasuryChainCheckpoint | null, balanceUnits: string, transfers: TreasuryTransfer[] = []) {
  const at = Date.now()
  const blockNumber = previousCheckpoint === null ? 100 : Number(previousCheckpoint.blockNumber) + 10
  const checkpoint = { blockNumber: String(blockNumber), blockHash: hash(blockNumber), balanceUnits }
  const pending = await backend.mutation(internal.moneyTreasuryReconciliation.beginBatch, { previousCheckpoint,
    observation: { kind: 'observed', environment: 'sandbox', network: NETWORK, asset: ASSET, address: PAYER,
      fromBlock: previousCheckpoint === null ? '100' : String(Number(previousCheckpoint.blockNumber) + 1), checkpoint,
      blockTimestamp: at - 1_000, transfers, caughtUp: true, observedAt: at } })
  expect(pending.kind).toBe('pending')
  if (pending.kind !== 'pending') throw new Error('native_range_not_pending')
  const posted = await bookFormanceTreasuryBatch(context, pending.identity, pending.batch)
  expect(posted).toMatchObject({ kind: 'completed' })
  if (posted.kind !== 'completed') throw new Error('native_range_not_booked')
  expect(await backend.mutation(internal.moneyTreasuryReconciliation.finishBatch,
    { batchRef: pending.batch.batchRef, transactionRefs: [...posted.transactionRefs] })).toEqual({ kind: 'completed', replayed: false })
  return checkpoint
}

async function fund(backend: ConvexFixtureBackend, context: FormanceContext) {
  const createdAt = Math.floor((Date.now() - 2_000) / 1_000) * 1_000
  const request: CreditPaymentRequest = {
    commandRef: 'funding:native-reconciler', principalId: PRINCIPAL, accountRef: ACCOUNT,
    amount: { currency: 'AUD', exponent: 6, units: '11100000' },
    principalAmount: { currency: 'AUD', exponent: 6, units: '10000000' },
    serviceFeeAmount: { currency: 'AUD', exponent: 6, units: '1000000' },
    taxAmount: { currency: 'AUD', exponent: 6, units: '100000' }, idempotencyKey: 'funding:native-reconciler:key', inputDigest: digest,
    successReturnRef: 'https://app.example.test/funding/return', cancelReturnRef: 'https://app.example.test/funding/cancel',
    providerRecoveryDeadlineAt: createdAt + 86_400_000, checkoutExpiresAt: createdAt + 3_600_000,
  }
  const session = { id: 'cs_test_native_treasury', object: 'checkout.session', amount_total: 1110, created: createdAt / 1_000,
    currency: 'aud', livemode: false, mode: 'payment', ui_mode: 'hosted_page', client_reference_id: request.commandRef,
    metadata: { ae_command_ref: request.commandRef, ae_contract: 'account_funding_v2' },
    payment_intent: { id: 'pi_test_native_treasury' }, status: 'complete', payment_status: 'paid',
    success_url: request.successReturnRef, cancel_url: request.cancelReturnRef, expires_at: request.checkoutExpiresAt! / 1_000,
    automatic_tax: { enabled: false }, total_details: { amount_tax: 0 }, url: null,
    line_items: { object: 'list', has_more: false, data: [
      { id: 'li_credit', quantity: 1, amount_total: 1000, amount_tax: 0, description: 'Agentic Economy Account credit', taxes: [] },
      { id: 'li_fee', quantity: 1, amount_total: 100, amount_tax: 0, description: 'Account funding service fee', taxes: [] },
      { id: 'li_tax', quantity: 1, amount_total: 10, amount_tax: 0, description: 'Australian GST', taxes: [] },
    ] },
  } as unknown as Stripe.Checkout.Session
  const evidence = mapStripeCheckoutSessionEvidence({ session,
    config: { secretKey: sourceEnvironment.STRIPE_READBACK_KEY, mode: 'test' }, expected: request })
  if (isMoneyRefusal(evidence)) throw new Error(`checkout_fixture:${evidence.code}`)
  const posted = await bookFormanceFundingSettlement(context, { commandRef: request.commandRef, idempotencyKey: request.idempotencyKey,
    accountRef: ACCOUNT, processorRef: session.id, principalUnits: '10000000', serviceFeeUnits: '1000000', taxUnits: '100000',
    totalUnits: '11100000', policyDigest: digest, externalEvidenceDigest: evidence.evidenceDigest })
  expect(posted).toMatchObject({ kind: 'completed' })
  if (posted.kind !== 'completed') throw new Error('native_funding_not_booked')
  const transactionRef = posted.transactionRefs[0]
  if (transactionRef === undefined) throw new Error('native_funding_reference_missing')
  await backend.run(ctx => ctx.db.insert('moneyFundingCommands', {
    commandRef: request.commandRef, idempotencyKey: request.idempotencyKey, accountRef: ACCOUNT, legalCustomerRef: LEGAL,
    actorPrincipalRef: PRINCIPAL, environment: 'sandbox', currency: 'AUD', exponent: 6,
    principalUnits: '10000000', serviceFeeUnits: '1000000', taxUnits: '100000', totalUnits: '11100000',
    commercialPolicyDigest: digest, commercialPolicyRefs: ['policy:native-reconciler'], inputDigest: digest,
    successReturnRef: request.successReturnRef,
    ...(request.cancelReturnRef === undefined ? {} : { cancelReturnRef: request.cancelReturnRef }),
    providerRecoveryDeadlineAt: request.providerRecoveryDeadlineAt,
    ...(request.checkoutExpiresAt === undefined ? {} : { checkoutExpiresAt: request.checkoutExpiresAt }),
    externalRef: session.id,
    ...(evidence.paymentId === undefined ? {} : { paymentId: evidence.paymentId }),
    ...(evidence.paymentIntentDigest === undefined ? {} : { paymentIntentDigest: evidence.paymentIntentDigest }),
    checkoutSessionDigest: evidence.checkoutSessionDigest, metadataDigest: evidence.metadataDigest,
    requestDigest: evidence.requestDigest, evidenceDigest: evidence.evidenceDigest, providerEvidenceRef: evidence.evidenceRef,
    appliedStripeEventId: 'evt_test_native_treasury', appliedPayloadDigest: digest, appliedTransactionRef: transactionRef,
    state: 'succeeded', providerStatus: 'succeeded', createdAt, updatedAt: Date.now(),
  }))
  const charge = { id: 'ch_test_native_treasury', object: 'charge', livemode: false, payment_intent: 'pi_test_native_treasury',
    currency: 'aud', status: 'succeeded', paid: true, captured: true, amount: 1110, amount_captured: 1110, amount_refunded: 0, refunded: false }
  external.checkout.mockResolvedValue(session)
  external.intent.mockResolvedValue({ id: 'pi_test_native_treasury', object: 'payment_intent', livemode: false,
    currency: 'aud', status: 'succeeded', amount: 1110, amount_received: 1110, latest_charge: charge })
  external.charge.mockResolvedValue(charge)
  external.refunds.mockResolvedValue({ object: 'list', has_more: false, data: [] })
}

async function reserveCall(backend: ConvexFixtureBackend, context: FormanceContext) {
  const createdAt = Date.now()
  const tool = buildDevelopmentPublishedToolEvidence().tool
  const toolRef = `operation:v1:${'d'.repeat(64)}`
  const rate = quoteManagedX402BuyerAud({ environment: 'sandbox', requiredUsdcAtomicUnits: '5000000', observedAt: createdAt,
    referenceRate: { source: 'coinbase', base: 'USDC', quote: 'AUD', rate: '1.2', fetchedAt: createdAt } })
  if (rate.kind !== 'quoted') throw new Error('fixture_rate_invalid')
  await backend.run(async ctx => {
    await ctx.db.insert('capabilityQuotes', {
      quoteRef: 'quote:native-reconciler', principalId: PRINCIPAL, accountRef: ACCOUNT, credentialId: 'credential:native',
      applicationRef: 'application:native', environment: 'sandbox', grantRef: 'grant:native', grantGeneration: 1,
      grantPolicyDigest: digest, grantExpiresAt: createdAt + 60_000, toolRef, toolVersion: tool.identity.publicationRevision,
      toolMaterialDigest: digest, currentToolDigest: digest, toolJson: JSON.stringify(tool), normalizedInputJson: '{}', inputDigest: digest,
      pricingJson: '{}', pricingDigest: digest, decisionAudUnits: '6000000', sourceUsdcUnits: '5000000',
      x402RequirementDigest: digest, x402RequirementJson: '{}', x402RequirementObservedAt: createdAt,
      rateEvidenceJson: JSON.stringify(rate.evidence), rateEvidenceDigest: rate.evidence.evidenceDigest,
      budgetPolicyRef: 'budget:native', budgetGeneration: 1, maximumSpendPerCallUnits: '6000000', formanceSchemaVersion: 'v1.3.0',
      policyGeneration: 1, legalCustomerRef: LEGAL, legalCustomerGeneration: 1, buyerRevenueUnits: '5454545', buyerTaxUnits: '545455',
      accountAvailableUnits: '10000000', budgetAvailableUnits: '10000000', legalExposureAvailableUnits: '10000000', balanceUnits: '10000000',
      treasuryCustodyRef: custodyRef, treasuryCustodyGeneration: 1, treasuryVersion: 1,
      treasuryEvidenceRef: 'treasury:native', treasuryEvidenceDigest: digest, treasurySpendableUnits: '10000000',
      commercialPolicyRefs: ['policy:native'], commercialPolicyDigest: digest, evidenceDigest: digest,
      state: 'consumed', consumedCallRef: CALL, expiresAt: createdAt + 30_000, createdAt, updatedAt: createdAt,
    })
    await ctx.db.insert('capabilityCalls', {
      callRef: CALL, quoteRef: 'quote:native-reconciler', principalId: PRINCIPAL, ownerId: ACCOUNT, credentialId: 'credential:native',
      applicationRef: 'application:native', toolRef, idempotencyKey: CALL, environment: 'sandbox', grantRef: 'grant:native',
      grantGeneration: 1, policyDigest: digest, grantExpiresAt: createdAt + 60_000, toolJson: JSON.stringify(tool), inputJson: '{}',
      inputDigest: digest, requestDigest: digest, attemptRef: ATTEMPT, state: 'pending', dispatchState: 'enqueued',
      formanceFinancialState: 'reservation_pending', createdAt, updatedAt: createdAt,
    })
  })
  const read = await backend.query(internal.moneyManagedCall.readBooking, { callRef: CALL })
  if (read.kind !== 'available') throw new Error('native_booking_fixture_invalid')
  for (const scope of [{ kind: 'agent_budget' as const, subjectRef: PRINCIPAL }, { kind: 'legal_customer_exposure' as const, subjectRef: LEGAL }]) {
    expect(await syncFormanceCapacity(context, { ...scope, generation: 1, targetUnits: '10000000',
      commandRef: `capacity:native:${scope.kind}`, idempotencyKey: `capacity:native:${scope.kind}`,
      policyDigest: digest, externalEvidenceDigest: digest })).toMatchObject({ kind: 'completed' })
  }
  const reserved = await reserveFormanceManagedCall(context, read.booking)
  expect(reserved).toMatchObject({ kind: 'completed' })
  if (reserved.kind !== 'completed') throw new Error('native_reservation_failed')
  expect(await backend.mutation(internal.moneyManagedCall.attachReservation, { callRef: CALL,
    transactionRefs: [...reserved.transactionRefs] })).toMatchObject({ kind: 'attached' })
  return { booking: read.booking, toolRef }
}

async function settleCall(backend: ConvexFixtureBackend, context: FormanceContext, reserved: Awaited<ReturnType<typeof reserveCall>>) {
  const settlementDigest = canonicalDigest({ format: 'ae.managed-x402-settlement:v1', callRef: CALL, settlementRef: PAYMENT_HASH })
  expect(await backend.mutation(internal.moneyManagedCallLifecycle.markPossiblySubmitted,
    { callRef: CALL, evidenceDigest: settlementDigest, now: Date.now() })).toMatchObject({ kind: 'accepted' })
  const settled = await settleFormanceManagedCall(context, { booking: reserved.booking, externalEvidenceDigest: settlementDigest })
  expect(settled).toMatchObject({ kind: 'completed' })
  if (settled.kind !== 'completed') throw new Error('native_settlement_failed')
  expect(await settleFormanceManagedCall(context, { booking: reserved.booking, externalEvidenceDigest: settlementDigest }))
    .toMatchObject({ kind: 'completed', replayed: true, transactionRefs: settled.transactionRefs })
  expect(await backend.mutation(internal.moneyManagedCallLifecycle.finalizeSettlement, { callRef: CALL,
    transactionRefs: [...settled.transactionRefs], now: Date.now() })).toMatchObject({ kind: 'accepted' })
  const at = Date.now()
  const signingKey = '11111111-1111-4111-8111-111111111111'
  await backend.run(async ctx => {
    await ctx.db.insert('moneyX402PaymentAttempts', {
      dispatchRef: CALL, attemptRef: ATTEMPT, effectGeneration: 1, toolRef: reserved.toolRef, inputDigest: digest,
      paymentIdentifier: 'payment:native', operationKeyDigest: digest, challengeDigest: digest, challengeJson: '{}',
      selectedRequirementJson: JSON.stringify({ scheme: 'exact', network: NETWORK, asset: ASSET, amount: '5000000', payTo: PAYEE }),
      providerEndpoint: 'https://provider.example/tool', credentialRef: 'credential:cdp', scheme: 'exact', network: NETWORK,
      asset: ASSET, payTo: PAYEE, amountUnits: '5000000', currency: 'USDC', exponent: 6,
      custodyRef: 'authorization-custody:native', custodyBudgetRef: custodyRef, custodyGeneration: 1, custodyDailyMaximumUnits: '50000000',
      authorizationDigest: digest, paymentIdentityDigest: digest, paymentUnsignedMaterialDigest: digest,
      paymentSigningIdempotencyKey: signingKey, paymentPayer: PAYER, paymentNonce: NONCE,
      spendReservationRef: 'spend:native', state: 'observed', preparedAt: at - 1, observedAt: at,
      settlementStatus: 'settled', reconciliationEvidenceDigest: settlementDigest,
      reconciliationEvidenceRef: `chain:${NETWORK}:${PAYMENT_HASH}`, evidenceRefs: [`chain:${NETWORK}:${PAYMENT_HASH}`],
    })
    await ctx.db.insert('moneyX402SpendReservations', {
      reservationRef: 'spend:native', platformBudgetRef: policy.platformBudgetRef, custodyBudgetRef: custodyRef,
      custodyRef: 'authorization-custody:native', custodyGeneration: 1, environment: 'sandbox', network: NETWORK, asset: ASSET,
      currency: 'USDC', exponent: 6, dispatchRef: CALL, attemptRef: ATTEMPT, effectGeneration: 1, authorizationDigest: digest,
      paymentIdentityDigest: digest, paymentUnsignedMaterialDigest: digest, paymentSigningIdempotencyKey: signingKey,
      typedDataDigest: digest, normalizedPayTo: PAYEE, amountUnits: '5000000', reservedAt: at - 1,
      policyRevision: policy.policyRevision, initialScreeningCheckRef: 'screening:native', state: 'settled',
      settledAt: at, resolutionEvidenceDigest: settlementDigest,
    })
  })
}

function installRpc() {
  const input = encodeFunctionData({ abi: eip3009ABI, functionName: 'transferWithAuthorization',
    args: [PAYER, PAYEE, 5_000_000n, 0n, 9_999_999_999n, NONCE, 27, hash(3), hash(4)] })
  const topics = encodeEventTopics({ abi: erc20Abi, eventName: 'Transfer', args: { from: PAYER, to: PAYEE } })
  external.rpc.mockImplementation(async (_target: URL, init: RequestInit) => {
    const { method } = JSON.parse(String(init.body)) as { method: string }
    const block = { number: '0x78', hash: hash(120), parentHash: hash(119), timestamp: `0x${Math.floor(Date.now() / 1_000).toString(16)}`,
      nonce: '0x0000000000000000', sha3Uncles: hash(0), logsBloom: `0x${'0'.repeat(512)}`, transactionsRoot: hash(0),
      stateRoot: hash(0), receiptsRoot: hash(0), miner: `0x${'0'.repeat(40)}`, difficulty: '0x0', totalDifficulty: '0x0',
      extraData: '0x', size: '0x1', gasLimit: '0x1', gasUsed: '0x1', transactions: [], uncles: [], mixHash: hash(0) }
    const result = method === 'eth_blockNumber' ? '0x78' : method === 'eth_call' ? `0x${'0'.repeat(63)}1`
      : method === 'eth_getBlockByNumber' ? block : method === 'eth_getTransactionReceipt' ? {
        transactionHash: PAYMENT_HASH, transactionIndex: '0x0', blockHash: hash(105), blockNumber: '0x69', from: PAYER, to: ASSET,
        cumulativeGasUsed: '0x1', gasUsed: '0x1', logsBloom: `0x${'0'.repeat(512)}`, status: '0x1', effectiveGasPrice: '0x1', type: '0x2',
        logs: [{ address: ASSET, data: encodeAbiParameters([{ type: 'uint256' }], [5_000_000n]), topics,
          transactionHash: PAYMENT_HASH, transactionIndex: '0x0', blockHash: hash(105), blockNumber: '0x69', logIndex: '0x0', removed: false }],
      } : method === 'eth_getTransactionByHash' ? {
        hash: PAYMENT_HASH, blockHash: hash(105), blockNumber: '0x69', transactionIndex: '0x0', from: PAYER, to: ASSET, input,
        value: '0x0', gas: '0x1', gasPrice: '0x1', nonce: '0x0', v: '0x1', r: hash(3), s: hash(4), type: '0x0',
      } : undefined
    if (result === undefined) throw new Error(`unexpected_rpc_method:${method}`)
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result }), { headers: { 'content-type': 'application/json' } })
  })
}

// Requires: explicit native integration opt-in and a fresh isolated sandbox ledger.
// Ensures: zero checks follow real posting/readback, a reserved Call is visible
// before an attempt exists, and settled cash needs exact independent chain proof.
// Invariant: an unexplained native credit remains critical during a later outage.
// On violation: assertions expose the actual producer report and durable records.
describe.runIf(process.env.AE_FORMANCE_INTEGRATION === 'true')('native treasury reconciler publication', () => {
  it('reconciles complete observation history beyond a single-value digest bound and refuses concurrent changes', async () => {
    for (const [key, value] of Object.entries(sourceEnvironment)) vi.stubEnv(key, value)
    const context = createFormanceContext({ environment: 'sandbox', ledger: `ae-history-${randomUUID().replaceAll('-', '')}`,
      gatewayUrl: process.env.AE_FORMANCE_GATEWAY_URL ?? 'http://127.0.0.1:3069', requestTimeoutMs: 30_000 })
    expect(await installPackage4FormanceSchema(context)).toMatchObject({ kind: 'completed' })
    const backend = convexTestWithMarketComponents()
    const admin = await ownerAdmin(backend, 'user_native-history-owner')
    const controller = { runQuery: backend.query.bind(backend), runMutation: backend.mutation.bind(backend) } as unknown as Parameters<typeof reconcileTreasurySnapshot>[0]
    let previous = await bookRange(backend, context, null, '15000000')
    for (let index = 0; index < 340; index++) previous = await bookRange(backend, context, previous, '15000000')
    const publish = async () => {
      await new Promise(resolve => setTimeout(resolve, 10))
      expect(await reconcileTreasurySnapshot(controller, { formance: context, admit: async () => true, now: Date.now() }))
        .toMatchObject({ kind: 'published' })
      const view = await admin.query(api.adminConsoleTreasury.read, {})
      if (view.kind !== 'ready' || view.snapshot === null) throw new Error('native_history_snapshot_missing')
      return view.snapshot
    }
    for (let attempt = 0; attempt < 2; attempt++) {
      expect(await publish()).toMatchObject({ rawCashDifferenceUnits: '0', depositsComplete: true,
        checks: { cash: { kind: 'matched', differenceUnits: '0' }, settlements: { kind: 'matched' },
          reservations: { kind: 'matched' }, funding: { kind: 'matched' } } })
    }
    const readBalances = context.sdk.ledger.v2.getBalancesAggregated.bind(context.sdk.ledger.v2)
    let changed = false
    vi.spyOn(context.sdk.ledger.v2, 'getBalancesAggregated').mockImplementation(async (...args) => {
      const result = await readBalances(...args)
      if (!changed) {
        changed = true
        previous = await bookRange(backend, context, previous, '15000000')
      }
      return result
    })
    expect(await publish()).toMatchObject({ checks: {
      cash: { kind: 'unavailable', code: 'treasury_sources_changed_during_audit' },
      settlements: { kind: 'unavailable' }, reservations: { kind: 'unavailable' }, funding: { kind: 'unavailable' },
    } })
    expect(await readFormanceTreasuryBalances(context, identity)).toMatchObject({ availableUnits: '10000000', committedUnits: '0', bufferUnits: '5000000' })
  }, 180_000)

  it('reconciles real funding and a paid Call, then retains orphan drift across native read unavailability', async () => {
    for (const [key, value] of Object.entries(sourceEnvironment)) vi.stubEnv(key, value)
    vi.clearAllMocks()
    installRpc()
    const context = createFormanceContext({ environment: 'sandbox', ledger: `ae-reconciler-${randomUUID().replaceAll('-', '')}`,
      gatewayUrl: process.env.AE_FORMANCE_GATEWAY_URL ?? 'http://127.0.0.1:3069', requestTimeoutMs: 30_000 })
    expect(await installPackage4FormanceSchema(context)).toMatchObject({ kind: 'completed' })
    const backend = convexTestWithMarketComponents()
    const admin = await ownerAdmin(backend, 'user_native-treasury-owner')
    const controller = { runQuery: backend.query.bind(backend), runMutation: backend.mutation.bind(backend) } as unknown as Parameters<typeof reconcileTreasurySnapshot>[0]
    const opening = await bookRange(backend, context, null, '15000000')
    await fund(backend, context)
    await backend.run(async ctx => {
      await ctx.db.insert('moneyReferenceRates', { pair: 'USDC/AUD', rate: '1.2', fetchedAt: Date.now() })
      await ctx.db.insert('moneyTreasuryObservations', { observationRef: 'observation:native', environment: 'sandbox',
        custodyRef, custodyGeneration: 1, network: NETWORK, asset: 'USDC', exponent: 6, totalUnits: '15000000', bufferUnits: '5000000',
        evidenceRef: 'evidence:native-observation', evidenceDigest: digest, observedAt: Date.now(), recordedAt: Date.now() })
    })
    const publish = async (ledger = context) => {
      // Native insertion clocks and historical PIT must precede the chosen cutoff.
      await new Promise(resolve => setTimeout(resolve, 10))
      expect(await reconcileTreasurySnapshot(controller, { formance: ledger, admit: async () => true, now: Date.now() }))
        .toMatchObject({ kind: 'published' })
      const view = await admin.query(api.adminConsoleTreasury.read, {})
      if (view.kind !== 'ready' || view.snapshot === null) throw new Error('published_native_snapshot_missing')
      return view
    }
    const healthy = await publish()
    expect(healthy.snapshot).toMatchObject({ rawCashDifferenceUnits: '0', cashTimingAdjustmentUnits: '0', depositsComplete: true,
      ledger: { kind: 'available', availableUnits: '10000000', bufferUnits: '5000000', purchasedAvailableAudUnits: '10000000' },
      checks: { cash: { kind: 'matched', differenceUnits: '0' }, funding: { kind: 'matched', checkedCount: 1, differenceUnits: '0' },
        settlements: { kind: 'matched', checkedCount: 0 }, reservations: { kind: 'matched', differenceUnits: '0' } } })
    expect(healthy.alerts.filter(alert => alert.severity === 'critical')).toEqual([])
    const reserved = await reserveCall(backend, context)
    const inFlight = await publish()
    expect(inFlight.snapshot).toMatchObject({ inFlight: { kind: 'available', count: 0, amountUnits: '0', calls: [] },
      ledger: { committedUnits: '5000000', purchasedReservedAudUnits: '6000000' },
      checks: { cash: { kind: 'matched' }, reservations: { kind: 'matched', differenceUnits: '0' } } })
    expect(await backend.query(internal.moneyTreasuryReconciliation.readAttemptSources, { cutoffAt: Date.now() }))
      .toMatchObject({ kind: 'available', rows: [] })
    await settleCall(backend, context, reserved)
    const material = { transactionHash: PAYMENT_HASH, logIndex: 0, blockNumber: '105', blockHash: hash(105),
      payer: PAYER, recipient: PAYEE, amountUnits: '5000000' }
    await bookRange(backend, context, opening, '10000000', [{ ...material,
      evidenceDigest: canonicalDigest({ kind: 'ae.treasury-transfer:v1', network: NETWORK, asset: ASSET, ...material }) }])
    const paid = await publish()
    expect(paid.snapshot).toMatchObject({ rawCashDifferenceUnits: '0', cashTimingAdjustmentUnits: '0',
      ledger: { availableUnits: '5000000', committedUnits: '0', bufferUnits: '5000000', payments24hUnits: '5000000',
        purchasedAvailableAudUnits: '4000000', purchasedReservedAudUnits: '0' },
      spending: { kind: 'available', settledUnits: '5000000', liabilityUnits: '0' }, inFlight: { count: 0 },
      checks: { cash: { kind: 'matched', differenceUnits: '0' }, settlements: { kind: 'matched', checkedCount: 1,
        expectedUnits: '5000000', observedUnits: '5000000', differenceUnits: '0' }, funding: { kind: 'matched' }, reservations: { kind: 'matched' } } })
    expect(external.rpc.mock.calls.map(([target]) => String(target))).toEqual(expect.arrayContaining([
      'https://8.8.8.8/rpc-one', 'https://8.8.8.8/rpc-two']))
    expect(external.intent).toHaveBeenCalledWith('pi_test_native_treasury', { expand: ['latest_charge'] })
    const orphanRef = 'fixture:orphan-treasury-credit'
    await context.sdk.ledger.v2.createTransaction({ ledger: context.configuration.ledger, idempotencyKey: orphanRef,
      v2PostTransaction: { reference: orphanRef, metadata: {}, postings: [{ source: 'world',
        destination: capacityAccount('treasury_usdc', custodyRef, 1), asset: 'USDC/6', amount: 10001n }] } })
    const drift = await publish()
    expect(drift.snapshot).toMatchObject({ rawCashDifferenceUnits: '-10001', checks: { cash: { kind: 'mismatch',
      code: 'treasury_cash_movement_unattributed', evidenceRefs: [orphanRef] } } })
    const critical = drift.alerts.find(alert => alert.code === 'cash_difference')
    expect(critical).toMatchObject({ severity: 'critical', evidenceRefs: [orphanRef] })
    const deadGateway = createFormanceContext({ ...context.configuration, gatewayUrl: 'http://127.0.0.1:1', requestTimeoutMs: 500 })
    const outage = await publish(deadGateway)
    expect(outage.snapshot).toMatchObject({ ledger: { kind: 'unavailable' }, checks: { cash: { kind: 'unavailable' } } })
    expect(outage.alerts.find(alert => alert.code === 'cash_difference')).toEqual(critical)
    const durable = await backend.run(async ctx => ({ snapshots: await ctx.db.query('moneyTreasurySnapshots').collect(),
      alerts: await ctx.db.query('moneyTreasuryAlerts').collect() }))
    expect(durable.snapshots).toHaveLength(5)
    expect(durable.alerts.filter(alert => alert.code === 'cash_difference')).toMatchObject([
      { alertRef: critical!.alertRef, state: 'open', evidenceRefs: [orphanRef] },
    ])
    expect(await readFormanceTreasuryBalances(context, identity)).toMatchObject({ availableUnits: '5010001', committedUnits: '0', bufferUnits: '5000000' })
  }, 180_000)
})
