import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, internal } from '../../../convex/_generated/api'
import * as nativeGateway from '../../../convex/lib/money/formance/gateway'
import type { ProviderReversalArgs } from '../../../convex/lib/money/providerObligations/contracts'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { quoteManagedX402BuyerAud } from '@/modules/money/public'
import { buildDevelopmentPublishedToolEvidence } from '../capability-supply/fixtures/development-published-tool-evidence'
import { convexTestWithMarketComponents, publishedBusinessOwner } from '../../helpers/convex-fixtures'
import { withSourceWrite } from '../../helpers/source-write-admission'

afterEach(() => vi.restoreAllMocks())

// A current authenticated buyer and a syntactically valid, sealed instruction
// do not prove returned corporate USDC. Only an exact terminal receipt replays;
// refusals preserve the purchase and all unresolved historical evidence.
async function settledPurchase(suffix: string) {
  const backend = convexTestWithMarketComponents()
  const owner = await publishedBusinessOwner(backend, `independent-reversal-${suffix}`)
  const now = Date.now() - 10_000
  const callRef = `invocation:independent-reversal:${suffix}`
  const quoteRef = `operation-commitment:v1:independent-reversal:${suffix}`
  const toolRef = `operation:v1:${'d'.repeat(64)}`
  const tool = buildDevelopmentPublishedToolEvidence().tool
  const priced = quoteManagedX402BuyerAud({
    environment: 'sandbox', requiredUsdcAtomicUnits: '5000000', observedAt: now,
    referenceRate: { source: 'coinbase', base: 'USDC', quote: 'AUD', rate: '1.2', fetchedAt: now },
  })
  if (priced.kind !== 'quoted') throw new Error('fixture_rate_invalid')
  const digest = canonicalDigest({ format: 'independent-provider-reversal:v1', suffix })
  await backend.run(async ctx => {
    await ctx.db.insert('capabilityQuotes', {
      quoteRef, principalId: owner.canonicalPrincipalRef, accountRef: owner.canonicalAccountRef,
      credentialId: `credential:${suffix}`, applicationRef: `application:${suffix}`, environment: 'sandbox',
      grantRef: `grant:${suffix}`, grantGeneration: 1, grantPolicyDigest: digest, grantExpiresAt: now + 60_000,
      toolRef, toolVersion: tool.identity.publicationRevision, toolMaterialDigest: digest,
      currentToolDigest: digest, toolJson: JSON.stringify(tool), normalizedInputJson: '{}', inputDigest: digest,
      pricingJson: '{}', pricingDigest: digest, decisionAudUnits: '6000000', sourceUsdcUnits: '5000000',
      x402RequirementDigest: digest, x402RequirementJson: '{}', x402RequirementObservedAt: now - 1,
      rateEvidenceJson: JSON.stringify(priced.evidence), rateEvidenceDigest: priced.evidence.evidenceDigest,
      budgetPolicyRef: `budget:${suffix}`, budgetGeneration: 1, maximumSpendPerCallUnits: '6000000',
      // Historical accepted Calls remain readable without current period fields.
      formanceSchemaVersion: 'v1.3.0', policyGeneration: 1, legalCustomerRef: 'principal:legal-customer',
      legalCustomerGeneration: 1, buyerRevenueUnits: '5454545', buyerTaxUnits: '545455',
      accountAvailableUnits: '10000000', budgetAvailableUnits: '10000000', legalExposureAvailableUnits: '10000000',
      balanceUnits: '10000000', treasuryCustodyRef: `custody:sandbox:${suffix}`, treasuryCustodyGeneration: 1,
      treasuryVersion: 1, treasuryEvidenceRef: `treasury-observation:${suffix}`, treasuryEvidenceDigest: digest,
      treasurySpendableUnits: '10000000', commercialPolicyRefs: ['commercial-policy:sandbox'],
      commercialPolicyDigest: digest, evidenceDigest: digest, state: 'consumed', consumedCallRef: callRef,
      expiresAt: now + 30_000, createdAt: now - 1, updatedAt: now - 1,
    })
    await ctx.db.insert('capabilityCalls', {
      quoteRef, callRef, principalId: owner.canonicalPrincipalRef, ownerId: owner.canonicalAccountRef,
      credentialId: `credential:${suffix}`, applicationRef: `application:${suffix}`, toolRef,
      idempotencyKey: `idempotency:${suffix}`, environment: 'sandbox', grantRef: `grant:${suffix}`,
      grantGeneration: 1, policyDigest: digest, grantExpiresAt: now + 60_000, toolJson: JSON.stringify(tool),
      inputJson: '{}', inputDigest: digest, requestDigest: digest, formanceFinancialState: 'reservation_pending',
      state: 'pending', dispatchState: 'enqueued', createdAt: now, updatedAt: now,
    })
  })
  await backend.mutation(internal.moneyManagedCall.attachReservation, {
    callRef, transactionRefs: [`formance:reserve-aud:${suffix}`, `formance:reserve-usdc:${suffix}`, `formance:obligation:${suffix}`],
  })
  await backend.mutation(internal.moneyManagedCallLifecycle.markPossiblySubmitted, {
    callRef, evidenceDigest: digest, now: now + 1,
  })
  const settlementRefs = [`formance:settle-buyer:${suffix}`, `formance:settle-provider:${suffix}`]
  await backend.mutation(internal.moneyManagedCallLifecycle.finalizeSettlement, {
    callRef, transactionRefs: settlementRefs, now: now + 4,
  })
  // This positive control ensures a removed preparation guard can reach the
  // native action; an invalid or financially unsettled fixture cannot mask it.
  await expect(backend.query(internal.moneyManagedCall.readBooking, { callRef }))
    .resolves.toMatchObject({ kind: 'available', financialState: 'settled', settlementRefs })
  const obligationRef = `provider-obligation:${callRef}`
  const commandRef = `provider-reversal:${suffix}`
  const command = {
    obligationRef, callRef, settlementTransactionRef: settlementRefs[1]!,
    evidenceRef: `provider-reversal-evidence:${suffix}`, evidenceDigest: digest,
    expectedUpdatedAt: now + 4, confirmation: obligationRef, commandRef, idempotencyKey: commandRef,
    proof: { reverificationId: `reverification:${suffix}`, firstFactorAgeMinutes: 0, secondFactorAgeMinutes: 0 },
    operationKey: 'moneyProviderObligations:reverseOwnerSettlement', correlationId: commandRef,
  }
  const snapshot = async () => await backend.run(async ctx => ({
    obligation: await ctx.db.query('moneyProviderObligations')
      .withIndex('by_obligationRef', q => q.eq('obligationRef', obligationRef)).unique(),
    call: await ctx.db.query('capabilityCalls').withIndex('by_callRef', q => q.eq('callRef', callRef)).unique(),
    projection: await ctx.db.query('capabilityCallProjections').withIndex('by_callRef', q => q.eq('callRef', callRef)).unique(),
    proofs: await ctx.db.query('consequenceProofUses').collect(),
  }))
  const invoke = async (overrides: Partial<typeof command> = {}) => await owner.owner.action(
    api.moneyProviderObligations.reverseOwnerSettlement,
    await withSourceWrite('billing', { ...command, ...overrides }),
  )
  const native = vi.spyOn(nativeGateway, 'configuredContext').mockImplementation(() => {
    throw new Error('unsupported_provider_reversal_reached_native_ledger')
  })
  return { backend, command, obligationRef, snapshot, invoke, native }
}

async function seedHistoricalReversal(
  fixture: Awaited<ReturnType<typeof settledPurchase>>,
  reversalState: 'pending' | 'outcome_unknown' | 'succeeded',
) {
  const before = await fixture.snapshot()
  if (before.obligation === null) throw new Error('fixture_obligation_missing')
  const reversalRef = `formance:historical-reversal:${fixture.command.commandRef}`
  await fixture.backend.run(async ctx => await ctx.db.patch(before.obligation!._id, {
    reversalState: reversalState === 'succeeded' ? 'pending' : reversalState,
    reversalCommandRef: fixture.command.commandRef,
    reversalIdempotencyKey: fixture.command.idempotencyKey,
    reversalEvidenceDigest: fixture.command.evidenceDigest,
    ...(reversalState === 'outcome_unknown' ? { reversalStatusRef: 'status:historical-reversal:unknown' } : {}),
  }))
  if (reversalState === 'succeeded') await expect(fixture.backend.mutation(
    internal.moneyProviderObligations.finalizeOwnerReversal, {
      obligationRef: fixture.obligationRef, callRef: fixture.command.callRef,
      commandRef: fixture.command.commandRef, idempotencyKey: fixture.command.idempotencyKey,
      evidenceRef: fixture.command.evidenceRef, evidenceDigest: fixture.command.evidenceDigest,
      settlementTransactionRef: fixture.command.settlementTransactionRef, reversalTransactionRef: reversalRef,
    },
  )).resolves.toEqual({ kind: 'completed', obligationRef: fixture.obligationRef, transactionRef: reversalRef })
  return reversalRef
}

describe('independent public Provider reversal treasury boundary', () => {
  it('refuses a current authenticated buyer with valid sealed evidence before any cash action', async () => {
    const fixture = await settledPurchase('new-cash')
    const before = await fixture.snapshot()
    expect(before.obligation).toMatchObject({ state: 'settled', payoutEligibility: 'ineligible_x402' })
    expect(before.obligation?.reversalState).toBeUndefined()
    await expect(fixture.invoke()).resolves.toEqual({
      kind: 'refused', code: 'provider_settlement_evidence_invalid', retryable: false,
    })
    expect(await fixture.snapshot()).toEqual(before)
    expect(fixture.native).not.toHaveBeenCalled()
  })

  it.each(['pending', 'outcome_unknown'] as const)('retains durable %s evidence and refuses cash replay', async reversalState => {
    const fixture = await settledPurchase(`legacy-${reversalState}`)
    await seedHistoricalReversal(fixture, reversalState)
    const before = await fixture.snapshot()
    await expect(fixture.invoke()).resolves.toEqual({
      kind: 'refused', code: 'provider_settlement_evidence_invalid', retryable: false,
    })
    expect(await fixture.snapshot()).toEqual(before)
    expect(fixture.native).not.toHaveBeenCalled()
  })

  it('replays the exact historical receipt and preserves it after conflicting sealed evidence', async () => {
    const fixture = await settledPurchase('historical-terminal')
    const transactionRef = await seedHistoricalReversal(fixture, 'succeeded')
    const before = await fixture.snapshot()
    const replay = { kind: 'replayed', obligationRef: fixture.obligationRef, transactionRef }
    await expect(fixture.invoke()).resolves.toEqual(replay)
    await expect(fixture.invoke({ evidenceDigest: canonicalDigest('conflicting-return-evidence') })).resolves.toEqual({
      kind: 'refused', code: 'provider_reversal_conflict', retryable: false,
    })
    await expect(fixture.invoke()).resolves.toEqual(replay)
    expect(await fixture.snapshot()).toEqual(before)
    expect(fixture.native).not.toHaveBeenCalled()
  })

  it('does not disclose a historical receipt to another current owner with a valid seal', async () => {
    const fixture = await settledPurchase('wrong-owner')
    await seedHistoricalReversal(fixture, 'succeeded')
    const other = await publishedBusinessOwner(fixture.backend, 'independent-reversal-other-owner')
    const before = await fixture.snapshot()
    const args: ProviderReversalArgs = await withSourceWrite('billing', fixture.command)
    await expect(other.owner.action(api.moneyProviderObligations.reverseOwnerSettlement, args)).resolves.toEqual({
      kind: 'refused', code: 'provider_obligation_not_found', retryable: false,
    })
    expect(await fixture.snapshot()).toEqual(before)
    expect(fixture.native).not.toHaveBeenCalled()
  })
})
