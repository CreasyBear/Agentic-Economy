/// <reference types="vite/client" />
import { afterEach, describe, expect, it, vi } from 'vitest'

import { api, internal } from '../../../convex/_generated/api'
import { materializePurchaseResolutionRecord } from '../../../convex/lib/capabilityExecution/callLifecycle/purchaseResolutionMaterialize'
import { settledSaleRefundReferences } from '@/modules/money/public'
import { quoteManagedX402BuyerAud } from '@/modules/money/public'
import { currentUtcDayBounds, currentUtcMonthBounds } from '@/modules/common/freshness'
import { claimPromotionalCredit } from '../../../convex/lib/money/promotionalCredit/allocation'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { buildDevelopmentPublishedToolEvidence } from '../capability-supply/fixtures/development-published-tool-evidence'
import { convexTestWithMarketComponents, publishedBusinessOwner } from '../../helpers/convex-fixtures'

const now = Date.UTC(2026, 8, 30, 12)
const tool = buildDevelopmentPublishedToolEvidence().tool
const toolRef = `operation:v1:${'d'.repeat(64)}`

type Backend = ReturnType<typeof convexTestWithMarketComponents>

async function seedPaidCall(backend: Backend, accountRef: string, suffix: string, options: { receipt?: boolean; resolution?: boolean; promotional?: boolean } = {}) {
  const callRef = `invocation:report-${suffix}`
  const quoteRef = `operation-commitment:v1:report-${suffix}`
  const amount = { currency: 'AUD' as const, units: '6000000', exponent: 6 as const }
  const providerAmount = { currency: 'USDC' as const, units: '5000000', exponent: 6 as const }
  const priced = quoteManagedX402BuyerAud({ environment: 'sandbox', requiredUsdcAtomicUnits: '5000000', observedAt: now,
    referenceRate: { source: 'coinbase', base: 'USDC', quote: 'AUD', rate: '1.2', fetchedAt: now } })
  if (priced.kind !== 'quoted') throw new Error('report_rate_fixture_invalid')
  await backend.run(async ctx => {
    const promo = options.promotional ? { version: 'ae.promotional-credit-allocation:v1' as const, purchasedUnits: '1000000',
      grants: [{ grantRef: 'promo:report-expired', amountUnits: '5000000', expiresAt: now + 10 }] } : undefined
    if (promo !== undefined) await ctx.db.insert('moneyPromotionalGrants', {
      grantRef: promo.grants[0]!.grantRef, accountRef, environment: 'sandbox', amountUnits: '5000000', availableUnits: '0',
      expiresAt: now + 10, createdAt: now - 1000, updatedAt: now, operationKey: 'promo:report-expired', actorRef: 'admin:one',
      correlationId: 'correlation:promo-report', commandDigest: 'digest:promo-report', reasonCode: 'onboarding', evidenceRefs: ['evidence:promo'],
      bookingState: 'booked', transactionRef: 'transaction:promo-report', expiryRevision: 0,
    })
    await ctx.db.insert('capabilityQuotes', {
      quoteRef, principalId: `principal:report-${suffix}`, accountRef, credentialId: `credential:report-${suffix}`,
      applicationRef: 'application:report', environment: 'sandbox', grantRef: `grant:report-${suffix}`,
      grantGeneration: 1, grantPolicyDigest: 'sha256:grant', grantExpiresAt: now + 60_000,
      toolRef, toolVersion: tool.identity.publicationRevision, toolMaterialDigest: 'sha256:operation-material',
      currentToolDigest: 'sha256:current-operation', toolJson: JSON.stringify(tool), normalizedInputJson: '{}',
      inputDigest: 'sha256:input', pricingJson: '{}', pricingDigest: 'sha256:pricing', decisionAudUnits: '6000000',
      sourceUsdcUnits: '5000000', x402RequirementDigest: 'sha256:live-requirement', x402RequirementJson: '{}',
      x402RequirementObservedAt: now - 1, rateEvidenceJson: JSON.stringify(priced.evidence),
      rateEvidenceDigest: priced.evidence.evidenceDigest, budgetPolicyRef: 'budget:report', budgetGeneration: 1,
      maximumSpendPerCallUnits: '6000000', formanceSchemaVersion: promo === undefined ? 'v1.3.0' : 'v1.5.0', policyGeneration: 1,
      ...(promo === undefined ? {} : { spendingPeriods: { version: 'ae.spending-periods:v1' as const,
        daily: { ...currentUtcDayBounds(now), revision: 1, limitUnits: '10000000' },
        monthly: { ...currentUtcMonthBounds(now), revision: 1, limitUnits: '10000000' },
      } }),
      legalCustomerRef: 'principal:legal-report-customer', legalCustomerGeneration: 1,
      buyerRevenueUnits: '5454545', buyerTaxUnits: '545455', accountAvailableUnits: '10000000',
      budgetAvailableUnits: '10000000', legalExposureAvailableUnits: '10000000', balanceUnits: '10000000',
      treasuryCustodyRef: 'custody:sandbox:report', treasuryCustodyGeneration: 1, treasuryVersion: 1,
      treasuryEvidenceRef: 'treasury-observation:report', treasuryEvidenceDigest: 'sha256:treasury',
      treasurySpendableUnits: '10000000', commercialPolicyRefs: ['commercial-policy:sandbox'],
      commercialPolicyDigest: 'sha256:policy', evidenceDigest: 'sha256:commitment', state: 'consumed',
      consumedCallRef: callRef, expiresAt: now + 30_000, createdAt: now - 1, updatedAt: now - 1,
    })
    const receipt = {
      commercialModel: 'account_aud' as const, receiptRef: `receipt:report-${suffix}`,
      state: 'settled' as const, buyerCharge: amount, serviceFee: { ...amount, units: '0' }, totalBuyerCharge: amount,
      providerObligation: { amount: providerAmount, settlementMethod: 'managed_x402' as const, payoutEligible: false as const },
      providerSettlement: { amount: providerAmount, network: 'eip155:84532' as const,
        asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as const },
      priceDigest: `sha256:${'a'.repeat(64)}`, evidenceHash: `sha256:${'b'.repeat(64)}`,
      issuedAt: new Date(now).toISOString(), refundState: 'not_applicable' as const, lossState: 'none' as const,
      transactionRef: `formance:settle-buyer-${suffix}`,
      accountingTransactionRefs: [`formance:settle-buyer-${suffix}`, `formance:settle-provider-${suffix}`],
    }
    const result = { kind: 'completed' as const, callRef, toolRef, output: { answer: suffix },
      evidenceHash: `sha256:${'c'.repeat(64)}`, ...(options.receipt === false ? {} : { receipt }) }
    const id = await ctx.db.insert('capabilityCalls', {
      quoteRef, callRef, principalId: `principal:report-${suffix}`, ownerId: accountRef,
      credentialId: `credential:report-${suffix}`, applicationRef: 'application:report', toolRef,
      idempotencyKey: `idempotency:report-${suffix}`, environment: 'sandbox', grantRef: `grant:report-${suffix}`,
      grantGeneration: 1, policyDigest: 'sha256:grant', grantExpiresAt: now + 60_000,
      toolJson: JSON.stringify(tool), inputJson: '{}', inputDigest: 'sha256:input',
      requestDigest: canonicalDigest({ callRef }), formanceFinancialState: 'settled',
      formanceSettlementRefs: [`formance:settle-buyer-${suffix}`, `formance:settle-provider-${suffix}`, ...(promo === undefined ? [] : ['formance:promo-settled'])],
      ...(promo === undefined ? {} : { promotionalCreditAllocation: promo }),
      state: 'completed', dispatchState: 'completed', result, createdAt: now, updatedAt: now,
    })
    if (options.resolution !== false) {
      const row = await ctx.db.get(id)
      if (row === null) throw new Error('report_call_fixture_missing')
      await materializePurchaseResolutionRecord(ctx, row, { state: 'completed', dispatchState: 'completed', result }, now)
    }
  })
  return callRef
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

describe('paid Call reports', () => {
  it('requires the owning business and a settled receipt and completed resolution', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(now)
    vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', 'development')
    const backend = convexTestWithMarketComponents()
    const owner = await publishedBusinessOwner(backend, 'report-owner')
    const other = await publishedBusinessOwner(backend, 'report-other')
    const good = await seedPaidCall(backend, owner.canonicalAccountRef, 'eligible')
    const noReceipt = await seedPaidCall(backend, owner.canonicalAccountRef, 'no-receipt', { receipt: false })
    const noResolution = await seedPaidCall(backend, owner.canonicalAccountRef, 'no-resolution', { resolution: false })
    expect(await backend.query(api.capabilityCallReports.readOwner, { callRef: good })).toMatchObject({ kind: 'refused', code: 'owner_required' })
    expect(await other.owner.query(api.capabilityCallReports.readOwner, { callRef: good })).toMatchObject({ kind: 'refused', code: 'owner_required' })
    expect(await owner.owner.query(api.capabilityCallReports.readOwner, { callRef: noReceipt })).toMatchObject({ kind: 'refused', code: 'call_not_eligible' })
    expect(await owner.owner.query(api.capabilityCallReports.readOwner, { callRef: noResolution })).toMatchObject({ kind: 'refused', code: 'call_not_eligible' })
    expect(await owner.owner.query(api.capabilityCallReports.readOwner, { callRef: good })).toMatchObject({ kind: 'eligible', remainingToday: 3 })
  })

  it('claim honours its lease until 60s pass', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(now)
    vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', 'development')
    const backend = convexTestWithMarketComponents()
    const owner = await publishedBusinessOwner(backend, 'lease-owner')
    const callRef = await seedPaidCall(backend, owner.canonicalAccountRef, 'lease')
    await owner.owner.mutation(internal.capabilityCallReports.admit, { callRef })
    expect(await backend.mutation(internal.capabilityCallReports.claimWork, { callRef })).not.toBeNull()
    expect(await backend.mutation(internal.capabilityCallReports.claimWork, { callRef })).toBeNull()
    vi.setSystemTime(now + 60_001)
    expect(await backend.mutation(internal.capabilityCallReports.claimWork, { callRef })).not.toBeNull()
  })

  it('replays one report before quota and rejects the fourth distinct Call for one owner', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(now)
    vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', 'development')
    const backend = convexTestWithMarketComponents()
    const owner = await publishedBusinessOwner(backend, 'quota-owner')
    const refs = await Promise.all(['one', 'two', 'three', 'four'].map(suffix => seedPaidCall(backend, owner.canonicalAccountRef, suffix)))
    const attempts = await Promise.all(refs.map(callRef => owner.owner.mutation(internal.capabilityCallReports.admit, { callRef })))
    expect(attempts.filter(result => result.kind === 'pending')).toHaveLength(3)
    expect(attempts.filter(result => result.kind === 'refused')).toEqual([expect.objectContaining({ code: 'report_limit_reached' })])
    const replayRef = refs[attempts.findIndex(result => result.kind === 'pending')]!
    const first = attempts.find(result => result.kind === 'pending')!
    expect(await owner.owner.mutation(internal.capabilityCallReports.admit, { callRef: replayRef })).toEqual(first)
    const records = await backend.run(async ctx => ({ reports: await ctx.db.query('paidCallReports').collect(),
      facts: await ctx.db.query('marketEvidenceFacts').withIndex('by_kind_and_sourceRef', q => q.eq('kind', 'ae_answer_reported')).collect() }))
    expect(records.reports).toHaveLength(3)
    expect(records.facts).toHaveLength(3)
    const selection = await backend.query(internal.marketListingEvidence.selectionEvidenceInternal, { toolRefs: [toolRef] })
    expect(selection).toMatchObject([{ toolRef, reportedByBuyers30d: 1, aeCompleted: 4, aeFailed: 0 }])
    const row = records.reports.find(report => report.callRef === replayRef)
    if (row === undefined) throw new Error('report_fixture_missing')
    const correctRefs = settledSaleRefundReferences(row.booking)
    expect(await backend.mutation(internal.capabilityCallReports.finishWork, { callRef: replayRef, reportDigest: 'sha256:wrong', transactionRefs: correctRefs })).toBe(false)
    expect(await backend.mutation(internal.capabilityCallReports.finishWork, { callRef: replayRef, reportDigest: row.reportDigest, transactionRefs: ['formance:wrong'] })).toBe(false)
    expect(await backend.run(async ctx => (await ctx.db.query('paidCallReports').collect()).filter(report => report.state === 'posted'))).toHaveLength(0)
    const other = await publishedBusinessOwner(backend, 'quota-independent-owner')
    const otherRef = await seedPaidCall(backend, other.canonicalAccountRef, 'other-owner')
    expect(await other.owner.query(api.capabilityCallReports.readOwner, { callRef: otherRef })).toMatchObject({ kind: 'eligible', remainingToday: 3 })
    const refusedRef = refs[attempts.findIndex(result => result.kind === 'refused')]!
    vi.setSystemTime(currentUtcDayBounds(now).periodEndAt)
    expect(await owner.owner.query(api.capabilityCallReports.readOwner, { callRef: refusedRef })).toMatchObject({ kind: 'eligible', remainingToday: 3 })
  })
  it('finishes once after promotional expiry while preserving output and original receipt evidence', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(now)
    vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', 'development')
    const backend = convexTestWithMarketComponents()
    const owner = await publishedBusinessOwner(backend, 'expired-report-owner')
    const callRef = await seedPaidCall(backend, owner.canonicalAccountRef, 'expired-promo', { promotional: true })
    expect(await owner.owner.mutation(internal.capabilityCallReports.admit, { callRef })).toMatchObject({ kind: 'pending' })
    const row = await backend.run(ctx => ctx.db.query('paidCallReports').withIndex('by_callRef', q => q.eq('callRef', callRef)).unique())
    if (row === null) throw new Error('report_missing')
    vi.setSystemTime(now + 20)
    const args = { callRef, reportDigest: row.reportDigest, transactionRefs: settledSaleRefundReferences(row.booking) }
    expect(await backend.mutation(internal.capabilityCallReports.finishWork, args)).toBe(true)
    expect(await backend.mutation(internal.capabilityCallReports.finishWork, args)).toBe(true)
    expect(await owner.owner.query(api.capabilityCallReports.readOwner, { callRef })).toMatchObject({ kind: 'posted', expiredPromotionalUnits: '5000000' })
    const result = await backend.run(async ctx => ({
      grant: await ctx.db.query('moneyPromotionalGrants').withIndex('by_grantRef', q => q.eq('grantRef', 'promo:report-expired')).unique(),
      call: await ctx.db.query('capabilityCalls').withIndex('by_callRef', q => q.eq('callRef', callRef)).unique(),
      resolution: await ctx.db.query('purchaseResolutionRecords').withIndex('by_callRef', q => q.eq('callRef', callRef)).unique(),
    }))
    expect(result.grant).toMatchObject({ availableUnits: '5000000', expiresAt: now + 10, nextWorkAt: now + 20 })
    expect(result.call).toMatchObject({ state: 'completed', result: { output: { answer: 'expired-promo' },
      receipt: { state: 'refunded', issuedAt: new Date(now).toISOString(), evidenceHash: `sha256:${'b'.repeat(64)}` } } })
    expect(result.resolution).toMatchObject({ terminalState: 'refunded', deliveryState: 'delivered' })
    const allocation = await backend.run(ctx => claimPromotionalCredit(ctx, { accountRef: owner.canonicalAccountRef,
      environment: 'sandbox', amountUnits: '100', now: now + 20 }))
    expect(allocation).toMatchObject({ kind: 'claimed', allocation: { purchasedUnits: '100', grants: [] } })
  })

})
