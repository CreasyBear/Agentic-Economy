import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { internal } from '../../../convex/_generated/api'
import type { Doc } from '../../../convex/_generated/dataModel'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { cdpX402CustodyBudgetRef, cdpX402CustodyConfigurationFromEnvironment } from '@/modules/capability-supply/convex'
import { quoteManagedX402BuyerAud } from '@/modules/money/public'
import { x402SpendPolicyFromEnvironment, X402_SPEND_HISTORY_LIMIT, X402_SPEND_WINDOW_MS } from '@/modules/money/x402-spend-admission'
import { buildDevelopmentPublishedToolEvidence } from '../capability-supply/fixtures/development-published-tool-evidence'
import { convexTestWithMarketComponents, type ConvexFixtureBackend } from '../../helpers/convex-fixtures'

const NOW = Date.UTC(2026, 9, 1, 12)
const PAYER = `0x${'1'.repeat(40)}`
const PAYEE = `0x${'2'.repeat(40)}`
const ASSET = '0x036cbd53842c5426634e7929541ec2318f3dcf7e'
const NETWORK = 'eip155:84532'
const digest = canonicalDigest('treasury-source-fixture')
const hash = (n: number) => `0x${n.toString(16).padStart(64, '0')}`
const sourceEnvironment = {
  AE_DEPLOYMENT_ENVIRONMENT: 'development', AE_X402_CUSTODY_ENABLED: 'true',
  AE_X402_CUSTODY_MAX_ATOMIC: '5000000', AE_X402_CUSTODY_DAILY_MAX_ATOMIC: '50000000',
  AE_X402_CUSTODY_PAYEE_DAILY_MAX_ATOMIC: '50000000', AE_X402_CUSTODY_NEW_PAYEE_MAX_ATOMIC: '5000000',
  CDP_API_KEY_ID: 'fixture-key', CDP_API_KEY_SECRET: 'fixture-secret', CDP_WALLET_SECRET: 'fixture-wallet-secret',
  AE_X402_CDP_ACCOUNT_NAME: 'fixture-wallet', AE_X402_CDP_EXPECTED_EVM_ADDRESS: PAYER,
  AE_X402_CDP_ACCOUNT_POLICY_ID: '11111111-1111-4111-8111-111111111111',
  AE_X402_CDP_PROJECT_POLICY_ID: '22222222-2222-4222-8222-222222222222',
  AE_X402_CDP_POLICY_RULES_DIGEST: digest, AE_X402_CDP_CREDENTIAL_GENERATION: '1',
}
const custody = cdpX402CustodyConfigurationFromEnvironment(sourceEnvironment)!
const custodyRef = cdpX402CustodyBudgetRef(custody, 'sandbox')
const policy = x402SpendPolicyFromEnvironment(sourceEnvironment, { environment: 'sandbox', network: NETWORK, asset: ASSET })!
type WithoutSystemFields<Row> = Row extends object ? Omit<Row, '_id' | '_creationTime'> : never
type Stored<T extends 'moneyX402SpendReservations' | 'moneyX402PaymentAttempts' | 'moneyFundingCommands'> = WithoutSystemFields<Doc<T>>
beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(NOW)
  for (const [key, value] of Object.entries(sourceEnvironment)) vi.stubEnv(key, value)
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs() })

function reservation(suffix: string, state: 'liability' | 'settled' | 'unused' = 'liability', time = NOW - 1): Stored<'moneyX402SpendReservations'> {
  const common = {
    reservationRef: `spend:${suffix}`, platformBudgetRef: policy.platformBudgetRef, custodyBudgetRef: custodyRef,
    custodyRef: `authorization-custody:${suffix}`, custodyGeneration: 1, environment: 'sandbox' as const,
    network: NETWORK, asset: ASSET, currency: 'USDC' as const, exponent: 6 as const,
    dispatchRef: `call:${suffix}`, attemptRef: `attempt:${suffix}`, effectGeneration: 1,
    authorizationDigest: digest, paymentIdentityDigest: digest, paymentUnsignedMaterialDigest: digest,
    paymentSigningIdempotencyKey: '11111111-1111-4111-8111-111111111111', typedDataDigest: digest,
    normalizedPayTo: PAYEE, amountUnits: '10', reservedAt: time - 1_000,
    policyRevision: policy.policyRevision, initialScreeningCheckRef: `screening:${suffix}`,
  }
  return state === 'liability' ? { ...common, state }
    : state === 'settled' ? { ...common, state, settledAt: time, resolutionEvidenceDigest: digest }
      : { ...common, state, resolvedAt: time, resolutionEvidenceDigest: digest, unusedProof: 'definitively_not_signed' }
}

function attempt(callRef = 'call:orphan', attemptRef = 'attempt:orphan'): Stored<'moneyX402PaymentAttempts'> {
  return {
    dispatchRef: callRef, attemptRef, effectGeneration: 1, toolRef: 'tool:source', inputDigest: digest,
    paymentIdentifier: `payment:${attemptRef}`, operationKeyDigest: digest, challengeDigest: digest,
    challengeJson: '{}', selectedRequirementJson: '{}', providerEndpoint: 'https://provider.example/tool',
    credentialRef: 'credential:cdp', scheme: 'exact', network: NETWORK, asset: ASSET, payTo: PAYEE,
    amountUnits: '5000000', currency: 'USDC', exponent: 6, custodyRef: `authorization-custody:${attemptRef}`,
    custodyBudgetRef: custodyRef, custodyGeneration: 1, custodyDailyMaximumUnits: '50000000',
    authorizationDigest: digest, paymentIdentityDigest: digest, paymentUnsignedMaterialDigest: digest,
    paymentSigningIdempotencyKey: '11111111-1111-4111-8111-111111111111', paymentPayer: PAYER,
    paymentNonce: hash(1), state: 'prepared', preparedAt: NOW - 1_000, evidenceRefs: [],
  }
}

function funding(): Stored<'moneyFundingCommands'> {
  return {
    commandRef: 'funding:source', accountRef: 'account:source', legalCustomerRef: 'legal:source', actorPrincipalRef: 'principal:source',
    environment: 'sandbox', currency: 'AUD', exponent: 6, principalUnits: '100', serviceFeeUnits: '10', taxUnits: '1', totalUnits: '111',
    commercialPolicyDigest: digest, commercialPolicyRefs: ['policy:source'], idempotencyKey: 'funding:source', inputDigest: digest,
    successReturnRef: 'https://ae.example/complete', cancelReturnRef: 'https://ae.example/cancel',
    providerRecoveryDeadlineAt: NOW + 1_000, checkoutExpiresAt: NOW + 1_000,
    externalRef: 'checkout:source', paymentId: 'payment:source', requestDigest: digest, evidenceDigest: digest,
    appliedTransactionRef: 'formance:funding:source', requesterDisplayName: 'Unrelated private display name',
    state: 'succeeded', createdAt: NOW - 1_000, updatedAt: NOW - 200,
  }
}

async function reservedCall(backend: ConvexFixtureBackend, suffix = 'native-reserved') {
  const callRef = `call:${suffix}`
  const quoteRef = `quote:${suffix}`
  const toolRef = `operation:v1:${'d'.repeat(64)}`
  const tool = buildDevelopmentPublishedToolEvidence().tool
  const createdAt = NOW - 1_000
  const rate = quoteManagedX402BuyerAud({ environment: 'sandbox', requiredUsdcAtomicUnits: '5000000', observedAt: createdAt,
    referenceRate: { source: 'coinbase', base: 'USDC', quote: 'AUD', rate: '1.2', fetchedAt: createdAt } })
  if (rate.kind !== 'quoted') throw new Error('fixture_rate_invalid')
  await backend.run(async ctx => {
    await ctx.db.insert('capabilityQuotes', {
      quoteRef, principalId: 'principal:source', accountRef: 'account:source', credentialId: 'credential:source',
      applicationRef: 'application:source', environment: 'sandbox', grantRef: 'grant:source', grantGeneration: 1,
      grantPolicyDigest: digest, grantExpiresAt: NOW + 60_000, toolRef, toolVersion: tool.identity.publicationRevision,
      toolMaterialDigest: digest, currentToolDigest: digest, toolJson: JSON.stringify(tool), normalizedInputJson: '{}', inputDigest: digest,
      pricingJson: '{}', pricingDigest: digest, decisionAudUnits: '6000000', sourceUsdcUnits: '5000000',
      x402RequirementDigest: digest, x402RequirementJson: '{}', x402RequirementObservedAt: createdAt,
      rateEvidenceJson: JSON.stringify(rate.evidence), rateEvidenceDigest: rate.evidence.evidenceDigest,
      budgetPolicyRef: 'budget:source', budgetGeneration: 1, maximumSpendPerCallUnits: '6000000', formanceSchemaVersion: 'v1.3.0',
      policyGeneration: 1, legalCustomerRef: 'legal:source', legalCustomerGeneration: 1, buyerRevenueUnits: '5454545', buyerTaxUnits: '545455',
      accountAvailableUnits: '10000000', budgetAvailableUnits: '10000000', legalExposureAvailableUnits: '10000000', balanceUnits: '10000000',
      treasuryCustodyRef: custodyRef, treasuryCustodyGeneration: 1, treasuryVersion: 1,
      treasuryEvidenceRef: 'treasury:source', treasuryEvidenceDigest: digest, treasurySpendableUnits: '10000000',
      commercialPolicyRefs: ['policy:source'], commercialPolicyDigest: digest, evidenceDigest: digest,
      state: 'consumed', consumedCallRef: callRef, expiresAt: NOW + 30_000, createdAt, updatedAt: createdAt,
    })
    await ctx.db.insert('capabilityCalls', {
      callRef, quoteRef, principalId: 'principal:source', ownerId: 'account:source', credentialId: 'credential:source', applicationRef: 'application:source',
      toolRef, idempotencyKey: callRef, environment: 'sandbox', grantRef: 'grant:source', grantGeneration: 1, policyDigest: digest,
      grantExpiresAt: NOW + 60_000, toolJson: JSON.stringify(tool), inputJson: '{}', inputDigest: digest, requestDigest: digest,
      state: 'pending', dispatchState: 'enqueued', formanceFinancialState: 'reservation_pending', createdAt, updatedAt: createdAt,
    })
  })
  const reservationRefs = ['formance:buyer-reserved', 'formance:treasury-reserved', 'formance:provider-obligation']
  await expect(backend.mutation(internal.moneyManagedCall.attachReservation, { callRef, transactionRefs: reservationRefs }))
    .resolves.toMatchObject({ kind: 'attached' })
  return { callRef, quoteRef, toolRef, reservationRefs }
}

describe('registered treasury audit source behavior', () => {
  it('pages 26 exact retained batches at 25 and binds continuation to cutoff, category and current custody identity', async () => {
    const backend = convexTestWithMarketComponents()
    await backend.run(async ctx => {
      for (let index = 0; index < 28; index += 1) await ctx.db.insert('moneyTreasuryBatches', {
        batchRef: `batch:${index}`, custodyRef, custodyGeneration: index === 26 ? 2 : 1,
        previousCheckpoint: null, previousBufferUnits: '0', bufferIncreaseUnits: '1', createdAt: index === 27 ? NOW + 1 : NOW - 100 + index,
        observation: { kind: 'observed', environment: 'sandbox', network: NETWORK, asset: ASSET, address: PAYER,
          fromBlock: String(index), checkpoint: { blockNumber: String(index), blockHash: hash(index), balanceUnits: '100' },
          blockTimestamp: NOW - 200, transfers: [], caughtUp: true, observedAt: NOW - 100 },
        state: { kind: 'booked', completedAt: NOW - 1, transactionRefs: [`formance:batch:${index}`] },
      })
    })
    const first = await backend.query(internal.moneyTreasuryReconciliation.readBatchSources, { cutoffAt: NOW })
    expect(first).toMatchObject({ kind: 'available', isDone: false })
    if (first.kind !== 'available' || first.cursor === null) throw new Error('fixture_first_page_invalid')
    expect(first.rows).toHaveLength(25)
    expect(first.rows[0]).toMatchObject({ batchRef: 'batch:0', state: { transactionRefs: ['formance:batch:0'] } })
    const second = await backend.query(internal.moneyTreasuryReconciliation.readBatchSources, { cutoffAt: NOW, cursor: first.cursor })
    expect(second).toMatchObject({ kind: 'available', isDone: true, cursor: null, rows: [{ batchRef: 'batch:25' }] })
    await expect(backend.query(internal.moneyTreasuryReconciliation.readBatchSources, { cutoffAt: NOW - 1, cursor: first.cursor }))
      .resolves.toMatchObject({ kind: 'unavailable', code: 'treasury_source_cursor_invalid' })
    await expect(backend.query(internal.moneyTreasuryReconciliation.readFundingSources, { cutoffAt: NOW, cursor: first.cursor }))
      .resolves.toMatchObject({ kind: 'unavailable', code: 'treasury_source_cursor_invalid' })
    vi.stubEnv('AE_X402_CDP_CREDENTIAL_GENERATION', '2')
    await expect(backend.query(internal.moneyTreasuryReconciliation.readBatchSources, { cutoffAt: NOW, cursor: first.cursor }))
      .resolves.toMatchObject({ kind: 'unavailable', code: 'treasury_source_cursor_invalid' })
  })

  it('projects only funding audit material and refuses a mutable post-cutoff command instead of partial totals', async () => {
    const backend = convexTestWithMarketComponents()
    const id = await backend.run(ctx => ctx.db.insert('moneyFundingCommands', funding()))
    const args = { cutoffAt: NOW - 100 }
    const baseline = await backend.query(internal.moneyTreasuryReconciliation.readFundingSources, args)
    expect(baseline).toMatchObject({ kind: 'available', rows: [{ commandRef: 'funding:source', actorPrincipalRef: 'principal:source',
      totalUnits: '111', principalUnits: '100', serviceFeeUnits: '10', taxUnits: '1', appliedTransactionRef: 'formance:funding:source' }] })
    if (baseline.kind !== 'available') throw new Error('funding_baseline_unavailable')
    expect(baseline.rows[0]).not.toHaveProperty('requesterDisplayName')
    expect(baseline.rows[0]).not.toHaveProperty('_id')
    await backend.run(ctx => ctx.db.patch(id, { updatedAt: NOW - 99, state: 'reversed', reversalTransactionRef: 'formance:funding-refund' }))
    await expect(backend.query(internal.moneyTreasuryReconciliation.readFundingSources, args))
      .resolves.toEqual({ kind: 'unavailable', code: 'treasury_source_cutoff_changed' })
    await expect(backend.query(internal.moneyTreasuryReconciliation.readFundingSources, { cutoffAt: NOW }))
      .resolves.toMatchObject({ kind: 'available', rows: [{ state: 'reversed', reversalTransactionRef: 'formance:funding-refund' }] })
    await expect(backend.query(internal.moneyTreasuryReconciliation.readFundingSources, { cutoffAt: NOW, limit: 26 }))
      .resolves.toEqual({ kind: 'unavailable', code: 'treasury_source_input_invalid' })
  })

  it('counts current exposure without imposing a lifetime ceiling on settled or unused history', async () => {
    const backend = convexTestWithMarketComponents()
    await backend.run(async ctx => {
      for (let index = 0; index <= X402_SPEND_HISTORY_LIMIT; index += 1) {
        await ctx.db.insert('moneyX402SpendReservations', reservation(`old-unused:${index}`, 'unused', NOW - 2 * X402_SPEND_WINDOW_MS))
        await ctx.db.insert('moneyX402SpendReservations', reservation(`old-settled:${index}`, 'settled', NOW - 2 * X402_SPEND_WINDOW_MS))
      }
      await ctx.db.insert('moneyX402SpendReservations', reservation('liability'))
      await ctx.db.insert('moneyX402SpendReservations', reservation('settled', 'settled'))
      await ctx.db.insert('moneyX402SpendReservations', { ...reservation('new-after-cutoff'), reservedAt: NOW + 1 })
    })
    await expect(backend.query(internal.moneyTreasuryReconciliation.readSpendExposure, { cutoffAt: NOW }))
      .resolves.toEqual({ kind: 'available', cutoffAt: NOW, platformBudgetRef: policy.platformBudgetRef,
        liabilityUnits: '10', settledLast24hUnits: '10', totalExposureUnits: '20', liabilityRefs: ['spend:liability'], settledRefs: ['spend:settled'] })
  })

  it.each(['settled', 'unused'] as const)('detects a liability that moved to %s after cutoff in exposure and source pages', async state => {
    const backend = convexTestWithMarketComponents()
    const initial = reservation(`moving:${state}`)
    const id = await backend.run(ctx => ctx.db.insert('moneyX402SpendReservations', initial))
    const cutoffAt = NOW - 100
    await expect(backend.query(internal.moneyTreasuryReconciliation.readSpendExposure, { cutoffAt }))
      .resolves.toMatchObject({ kind: 'available', liabilityUnits: '10' })
    const terminal = { ...reservation(`moving:${state}`, state, NOW - 99), reservedAt: initial.reservedAt }
    await backend.run(ctx => ctx.db.replace(id, terminal))
    await expect(backend.query(internal.moneyTreasuryReconciliation.readSpendExposure, { cutoffAt }))
      .resolves.toEqual({ kind: 'unavailable', code: 'treasury_source_cutoff_changed' })
    await expect(backend.query(internal.moneyTreasuryReconciliation.readSpendReservationSources, { cutoffAt, state: 'liability' }))
      .resolves.toEqual({ kind: 'unavailable', code: 'treasury_source_cutoff_changed' })
    await expect(backend.query(internal.moneyTreasuryReconciliation.readSpendExposure, { cutoffAt: NOW }))
      .resolves.toMatchObject({ kind: 'available', liabilityUnits: '0', settledLast24hUnits: state === 'settled' ? '10' : '0' })
  })

  it('exposes a real native reservation before any payment-attempt row exists', async () => {
    const backend = convexTestWithMarketComponents()
    const fixture = await reservedCall(backend)
    await expect(backend.query(internal.moneyTreasuryReconciliation.readAttemptSources, { cutoffAt: NOW }))
      .resolves.toMatchObject({ kind: 'available', rows: [], isDone: true })
    const calls = await backend.query(internal.moneyTreasuryReconciliation.readCallSources, { cutoffAt: NOW })
    expect(calls).toMatchObject({ kind: 'available', rows: [{ call: { callRef: fixture.callRef, financialState: 'reserved',
      reservationRefs: fixture.reservationRefs, settlementRefs: [] }, native: { kind: 'available', booking: { providerAmountUnits: '5000000', treasuryRef: custodyRef } }, joinIssues: [] }] })
  })

  it('retains an orphan attempt as explicit incomplete joined evidence', async () => {
    const backend = convexTestWithMarketComponents()
    await backend.run(ctx => ctx.db.insert('moneyX402PaymentAttempts', attempt()))
    const result = await backend.query(internal.moneyTreasuryReconciliation.readAttemptSources, { cutoffAt: NOW })
    expect(result).toMatchObject({ kind: 'available', rows: [{ material: { dispatchRef: 'call:orphan', paymentPayer: PAYER, paymentNonce: hash(1) },
      call: null, quote: null, native: { kind: 'not_found' }, joinIssues: expect.arrayContaining(['missing_call', 'missing_quote', 'native_booking_unavailable']) }] })
  })

  it('joins paid-remedy Provider expense even when buyer funds are released and the Provider ref is the sole settlement ref', async () => {
    const backend = convexTestWithMarketComponents()
    const fixture = await reservedCall(backend, 'paid-remedy')
    const payment = { ...attempt(fixture.callRef, 'attempt:paid-remedy'), toolRef: fixture.toolRef,
      reservationRef: fixture.reservationRefs[1]!, submissionStartedAt: NOW - 900,
      state: 'reconciliation_required' as const }
    const transactionHash = hash(99)
    await backend.run(async ctx => {
      const call = await ctx.db.query('capabilityCalls').withIndex('by_callRef', q => q.eq('callRef', fixture.callRef)).unique()
      if (call === null) throw new Error('fixture_call_missing')
      const aud = { currency: 'AUD', exponent: 6, units: '6000000' }
      const usdc = { currency: 'USDC', exponent: 6, units: '5000000' }
      await ctx.db.patch(call._id, { attemptRef: payment.attemptRef, state: 'reconciliation_required', formanceFinancialState: 'outcome_unknown',
        result: { kind: 'reconciliation_required', callRef: fixture.callRef, toolRef: fixture.toolRef,
          evidence: { attemptRef: payment.attemptRef, effectGeneration: 1, evidenceSource: 'provider:source', requiredAt: new Date(NOW - 800).toISOString(), retry: 'reconcile_before_retry' },
          receipt: { commercialModel: 'account_aud', receiptRef: 'receipt:source', state: 'reconciliation_required',
            buyerCharge: aud, serviceFee: { ...aud, units: '0' }, totalBuyerCharge: aud,
            providerObligation: { amount: usdc, settlementMethod: 'managed_x402', payoutEligible: false },
            providerSettlement: { amount: usdc, network: 'eip155:84532', asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e' },
            priceDigest: digest, evidenceHash: digest, issuedAt: new Date(NOW - 800).toISOString(), refundState: 'unknown', lossState: 'unknown' },
        } })
      await ctx.db.insert('moneyX402PaymentAttempts', payment)
    })
    await expect(backend.mutation(internal.moneyManagedCallRemedy.claim, { callRef: fixture.callRef, transactionHash }))
      .resolves.toMatchObject({ kind: 'claimed' })
    await expect(backend.mutation(internal.moneyManagedCallRemedy.finish, { callRef: fixture.callRef, transactionHash,
      evidenceDigest: digest, transactionRefs: ['formance:buyer-restored', 'formance:provider-paid'] }))
      .resolves.toEqual({ kind: 'completed' })
    for (const ref of [internal.moneyTreasuryReconciliation.readCallSources, internal.moneyTreasuryReconciliation.readAttemptSources]) {
      await expect(backend.query(ref, { cutoffAt: NOW })).resolves.toMatchObject({ kind: 'available', rows: [{
        call: { callRef: fixture.callRef, financialState: 'released', settlementRefs: ['formance:provider-paid'],
          evidenceHash: digest, externalSettlementRef: transactionHash, lossState: 'unknown' },
        obligation: { state: 'settled', settlementTransactionRef: 'formance:provider-paid', providerAmountUnits: '5000000', evidenceRefs: expect.arrayContaining([digest]) },
        native: { kind: 'available', booking: { providerAmountUnits: '5000000' } }, joinIssues: [],
      }] })
    }
    await expect(backend.query(internal.moneyTreasuryReconciliation.readCallSources, { cutoffAt: NOW - 1 }))
      .resolves.toEqual({ kind: 'unavailable', code: 'treasury_source_cutoff_changed' })
  })

  it('pins observation and FX cutoff independently of intentionally current treasury controls', async () => {
    const backend = convexTestWithMarketComponents()
    await backend.run(async ctx => {
      for (const [suffix, generation, observedAt, totalUnits] of [
        ['matching', 1, NOW - 100, '100'], ['newer', 1, NOW + 1, '999'], ['other-generation', 2, NOW - 1, '999'],
      ] as const) await ctx.db.insert('moneyTreasuryObservations', {
        observationRef: `observation:${suffix}`, environment: 'sandbox', custodyRef, custodyGeneration: generation,
        network: NETWORK, asset: 'USDC', exponent: 6, totalUnits, bufferUnits: '1', evidenceRef: `evidence:${suffix}`,
        evidenceDigest: digest, observedAt, recordedAt: observedAt,
      })
      await ctx.db.insert('moneyReferenceRates', { pair: 'USDC/AUD', rate: '1.2', fetchedAt: NOW - 100 })
      await ctx.db.insert('moneyTreasurySettings', { environment: 'sandbox', thresholds: { kind: 'fixed', lowWaterUnits: '10', targetFloatUnits: '100' }, revision: 2, updatedAt: NOW + 1 })
    })
    await expect(backend.query(internal.moneyTreasuryReconciliation.readSnapshotContext, { cutoffAt: NOW }))
      .resolves.toMatchObject({ kind: 'available', identity: { custodyRef, custodyGeneration: 1 },
        policyRevision: policy.policyRevision,
        observation: { observedAt: NOW - 100, totalUnits: '100', evidenceRef: 'evidence:matching' },
        referenceRate: { kind: 'available', observedAt: NOW - 100, usdcToAudRate: '1.2' },
        thresholds: { kind: 'fixed', lowWaterUnits: '10', targetFloatUnits: '100' },
      })
    await backend.run(async ctx => {
      const rate = await ctx.db.query('moneyReferenceRates').first()
      if (rate === null) throw new Error('fixture_rate_missing')
      await ctx.db.patch(rate._id, { fetchedAt: NOW + 1 })
    })
    await expect(backend.query(internal.moneyTreasuryReconciliation.readSnapshotContext, { cutoffAt: NOW }))
      .resolves.toMatchObject({ kind: 'available', referenceRate: { kind: 'unavailable', code: 'reference_rate_stale' },
        observation: { totalUnits: '100' } })
  })

  it('pins audit progress while a validated post-cutoff cursor advances and retained sources stay unchanged', async () => {
    const backend = convexTestWithMarketComponents()
    const checkpoint = (blockNumber: string) => ({ blockNumber, blockHash: hash(Number(blockNumber)), balanceUnits: '0' })
    const open = checkpoint('100')
    vi.mocked(Date.now).mockReturnValue(NOW - 10)
    const opening = await backend.mutation(internal.moneyTreasuryReconciliation.beginBatch, { previousCheckpoint: null,
      observation: { kind: 'observed', environment: 'sandbox', network: NETWORK, asset: ASSET, address: PAYER,
        fromBlock: '100', checkpoint: open, observedAt: NOW - 10, blockTimestamp: NOW - 1_000, transfers: [], caughtUp: true } })
    if (opening.kind !== 'pending') throw new Error('fixture_opening_batch_missing')
    vi.mocked(Date.now).mockReturnValue(NOW - 9)
    expect(await backend.mutation(internal.moneyTreasuryReconciliation.finishBatch, { batchRef: opening.batch.batchRef, transactionRefs: [] }))
      .toEqual({ kind: 'completed', replayed: false })
    vi.mocked(Date.now).mockReturnValue(NOW)
    const before = await backend.query(internal.moneyTreasuryReconciliation.readSnapshotContext, { cutoffAt: NOW })
    const retained = await backend.query(internal.moneyTreasuryReconciliation.readBatchSources, { cutoffAt: NOW })
    expect(before).toMatchObject({ kind: 'available', progress: { kind: 'ready', checkpoint: open } })
    // A normal observer completes after reconciliation has chosen its cutoff.
    vi.mocked(Date.now).mockReturnValue(NOW + 1)
    const advanced = checkpoint('110')
    const pending = await backend.mutation(internal.moneyTreasuryReconciliation.beginBatch, { previousCheckpoint: open,
      observation: { kind: 'observed', environment: 'sandbox', network: NETWORK, asset: ASSET, address: PAYER,
        fromBlock: '101', checkpoint: advanced, observedAt: NOW + 1, blockTimestamp: NOW - 1_000, transfers: [], caughtUp: true } })
    if (pending.kind !== 'pending') throw new Error('fixture_advanced_batch_missing')
    expect(await backend.query(internal.moneyTreasuryReconciliation.readSnapshotContext, { cutoffAt: NOW })).toEqual(before)
    vi.mocked(Date.now).mockReturnValue(NOW + 2)
    await backend.mutation(internal.moneyTreasuryReconciliation.finishBatch, { batchRef: pending.batch.batchRef, transactionRefs: [] })
    expect(await backend.query(internal.moneyTreasuryReconciliation.readBatchSources, { cutoffAt: NOW })).toEqual(retained)
    const after = await backend.query(internal.moneyTreasuryReconciliation.readSnapshotContext, { cutoffAt: NOW })
    expect(after).toEqual(before)
    expect(await backend.query(internal.moneyTreasuryReconciliation.readProgress, {}))
      .toMatchObject({ kind: 'ready', checkpoint: advanced })
    expect(await backend.query(internal.moneyTreasuryReconciliation.readBatchSources, { cutoffAt: NOW + 2 }))
      .toMatchObject({ kind: 'available', rows: [expect.any(Object), { observation: { checkpoint: advanced } }] })
  })

  it('refuses a retained pending range that finishes after cutoff, then exposes it at a new cutoff', async () => {
    const backend = convexTestWithMarketComponents()
    vi.mocked(Date.now).mockReturnValue(NOW - 1)
    const pending = await backend.mutation(internal.moneyTreasuryReconciliation.beginBatch, { previousCheckpoint: null,
      observation: { kind: 'observed', environment: 'sandbox', network: NETWORK, asset: ASSET, address: PAYER,
        fromBlock: '100', checkpoint: { blockNumber: '100', blockHash: hash(100), balanceUnits: '0' },
        observedAt: NOW - 1, blockTimestamp: NOW - 1_000, transfers: [], caughtUp: true } })
    if (pending.kind !== 'pending') throw new Error('fixture_pending_batch_missing')
    vi.mocked(Date.now).mockReturnValue(NOW)
    expect(await backend.query(internal.moneyTreasuryReconciliation.readSnapshotContext, { cutoffAt: NOW }))
      .toMatchObject({ progress: { kind: 'pending' } })
    vi.mocked(Date.now).mockReturnValue(NOW + 1)
    await backend.mutation(internal.moneyTreasuryReconciliation.finishBatch, { batchRef: pending.batch.batchRef, transactionRefs: [] })
    expect(await backend.query(internal.moneyTreasuryReconciliation.readSnapshotContext, { cutoffAt: NOW }))
      .toMatchObject({ progress: { kind: 'unavailable', code: 'treasury_source_cutoff_changed' } })
    expect(await backend.query(internal.moneyTreasuryReconciliation.readBatchSources, { cutoffAt: NOW }))
      .toEqual({ kind: 'unavailable', code: 'treasury_source_cutoff_changed' })
    expect(await backend.query(internal.moneyTreasuryReconciliation.readSnapshotContext, { cutoffAt: NOW + 1 }))
      .toMatchObject({ progress: { kind: 'ready', checkpoint: pending.batch.observation.checkpoint } })
  })

  it.each(['cursor_checkpoint', 'cursor_buffer', 'broken_predecessor', 'missing_retained', 'missing_live'] as const)(
    'does not classify %s as a benign post-cutoff advance', async fault => {
      const backend = convexTestWithMarketComponents()
      const checkpoints = [100, 110].map(n => ({ blockNumber: String(n), blockHash: hash(n), balanceUnits: '0' }))
      for (const [index, at] of [NOW - 10, NOW + 1].entries()) {
        vi.mocked(Date.now).mockReturnValue(at)
        const pending = await backend.mutation(internal.moneyTreasuryReconciliation.beginBatch, {
          previousCheckpoint: index === 0 ? null : checkpoints[0]!,
          observation: { kind: 'observed', environment: 'sandbox', network: NETWORK, asset: ASSET, address: PAYER,
            fromBlock: index === 0 ? '100' : '101', checkpoint: checkpoints[index]!, observedAt: at,
            blockTimestamp: at - 1_000, transfers: [], caughtUp: true },
        })
        if (pending.kind !== 'pending') throw new Error('fixture_bridge_batch_missing')
        vi.mocked(Date.now).mockReturnValue(at + 1)
        await backend.mutation(internal.moneyTreasuryReconciliation.finishBatch, { batchRef: pending.batch.batchRef, transactionRefs: [] })
      }
      expect(await backend.query(internal.moneyTreasuryReconciliation.readSnapshotContext, { cutoffAt: NOW }))
        .toMatchObject({ progress: { kind: 'ready', checkpoint: checkpoints[0] } })
      await backend.run(async ctx => {
        const cursor = await ctx.db.query('moneyTreasuryCursors').first()
        const batches = await ctx.db.query('moneyTreasuryBatches').withIndex('by_custody_and_createdAt', q => q.eq('custodyRef', custodyRef)).order('asc').take(2)
        if (cursor === null || batches.length !== 2) throw new Error('fixture_bridge_missing')
        if (fault === 'cursor_checkpoint') await ctx.db.patch(cursor._id, { state: {
          kind: 'ready', checkpoint: { ...checkpoints[1]!, balanceUnits: '1' }, blockTimestamp: NOW - 999,
        } })
        if (fault === 'cursor_buffer') await ctx.db.patch(cursor._id, { bufferUnits: '1' })
        if (fault === 'broken_predecessor') await ctx.db.patch(batches[1]!._id, { previousCheckpoint: null })
        if (fault === 'missing_retained') await ctx.db.delete(batches[0]!._id)
        if (fault === 'missing_live') await ctx.db.delete(batches[1]!._id)
      })
      expect(await backend.query(internal.moneyTreasuryReconciliation.readSnapshotContext, { cutoffAt: NOW }))
        .toMatchObject({ progress: { kind: 'unavailable' } })
    },
  )
})
