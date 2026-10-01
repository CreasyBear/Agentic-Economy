import { Workpool, type WorkId } from '@convex-dev/workpool'
import { makeFunctionReference } from 'convex/server'
import { v } from 'convex/values'
import { internalMutation as mutation, internalQuery as query } from '../../convex/_generated/server'
import { components } from '../../convex/_generated/api'
import { bookingFromRows } from '../../convex/lib/money/managedCall/booking'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { currentUtcDayBounds, currentUtcMonthBounds } from '@/modules/common/freshness'
import { quoteManagedX402BuyerAud } from '@/modules/money/public'

// Copied only into disposable deployments. Seed the original frozen booking;
// the test uses maintained native reservation and settlement producers afterward.
const pool = new Workpool(components.workpool, { maxParallelism: 4 })
const noEffectRef = makeFunctionReference<'mutation', Record<string, never>, null>('financialRestoreProof:noEffect')
export const noEffect = mutation({ args: {}, returns: v.null(), handler: async () => null })

export const seed = mutation({
  args: { toolJson: v.string(), now: v.number() }, returns: v.null(),
  handler: async (ctx, { toolJson, now }): Promise<null> => {
    if (await ctx.db.query('capabilityCalls').first()) throw new Error('proof_already_seeded')
    const priced = quoteManagedX402BuyerAud({ environment: 'sandbox', requiredUsdcAtomicUnits: '500000',
      observedAt: now, referenceRate: { source: 'coinbase', base: 'USDC', quote: 'AUD', rate: '1.2', fetchedAt: now } })
    if (priced.kind !== 'quoted') throw new Error('proof_price_invalid')
    for (const label of ['paid', 'promo', 'missing', 'conflict']) {
      const callRef = `call:financial-restore:${label}`
      const quoteRef = `quote:financial-restore:${label}`
      const digest = canonicalDigest({ proof: 'financial-restore', label })
      const toolRef = `operation:v1:${'d'.repeat(64)}`
      const inputJson = JSON.stringify({ label })
      const inputDigest = canonicalDigest({ label })
      const workId = await pool.enqueueMutation(ctx, noEffectRef, {}, { runAt: now + 86_400_000 })
      await ctx.db.insert('capabilityQuotes', {
        quoteRef, principalId: 'principal:financial-restore', accountRef: 'account:financial-restore',
        credentialId: 'credential:financial-restore', applicationRef: 'application:financial-restore',
        environment: 'sandbox', grantRef: 'grant:financial-restore', grantGeneration: 1,
        grantPolicyDigest: digest, grantExpiresAt: now + 86_400_000, toolRef, toolVersion: 1,
        toolMaterialDigest: digest, currentToolDigest: digest, toolJson, normalizedInputJson: inputJson,
        inputDigest, pricingJson: '{}', pricingDigest: digest, decisionAudUnits: priced.evidence.sourceAmount.units,
        sourceUsdcUnits: '500000', x402RequirementDigest: digest, x402RequirementJson: '{}',
        x402RequirementObservedAt: now, rateEvidenceJson: JSON.stringify(priced.evidence),
        rateEvidenceDigest: priced.evidence.evidenceDigest, budgetPolicyRef: 'budget:financial-restore',
        budgetGeneration: 1, maximumSpendPerCallUnits: '600000', formanceSchemaVersion: 'v1.5.0',
        spendingPeriods: { version: 'ae.spending-periods:v1',
          daily: { ...currentUtcDayBounds(now), revision: 1, limitUnits: '5000000' },
          monthly: { ...currentUtcMonthBounds(now), revision: 1, limitUnits: '20000000' } },
        policyGeneration: 1, legalCustomerRef: 'legal:financial-restore', legalCustomerGeneration: 1,
        buyerRevenueUnits: priced.evidence.sourceAmount.units, buyerTaxUnits: '0', accountAvailableUnits: '10000000',
        budgetAvailableUnits: '5000000', legalExposureAvailableUnits: '10000000', balanceUnits: '10000000',
        treasuryCustodyRef: 'custody:financial-restore', treasuryCustodyGeneration: 1, treasuryVersion: 1,
        treasuryEvidenceRef: 'treasury:financial-restore', treasuryEvidenceDigest: digest, treasurySpendableUnits: '10000000',
        commercialPolicyRefs: ['policy:financial-restore'], commercialPolicyDigest: digest, evidenceDigest: digest,
        state: 'consumed', consumedCallRef: callRef, expiresAt: now + 60_000, createdAt: now, updatedAt: now,
      })
      await ctx.db.insert('capabilityCalls', {
        callRef, quoteRef, principalId: 'principal:financial-restore', ownerId: 'account:financial-restore',
        credentialId: 'credential:financial-restore', applicationRef: 'application:financial-restore',
        toolRef, idempotencyKey: `key:${callRef}`, environment: 'sandbox', grantRef: 'grant:financial-restore',
        grantGeneration: 1, policyDigest: digest, grantExpiresAt: now + 86_400_000, toolJson, inputJson, inputDigest,
        requestDigest: digest, formanceFinancialState: 'reservation_pending', state: 'pending', dispatchState: 'enqueued',
        result: { kind: 'pending', callRef, toolRef, retryAfterMs: 1000 }, workId,
        promotionalCreditAllocation: { version: 'ae.promotional-credit-allocation:v1',
          purchasedUnits: label === 'promo' ? '0' : '300000', grants: [{ grantRef: `promo:${callRef}`,
            amountUnits: label === 'promo' ? '600000' : '300000', expiresAt: now + 86_400_000 }] },
        createdAt: now, updatedAt: now,
      })
    }
    return null
  },
})

export const inspect = query({
  args: {}, returns: v.string(),
  handler: async (ctx): Promise<string> => {
    const calls = await ctx.db.query('capabilityCalls').collect()
    const records = []
    for (const call of calls) {
      const quote = await ctx.db.query('capabilityQuotes').withIndex('by_quoteRef', q => q.eq('quoteRef', call.quoteRef!)).unique()
      if (quote === null || call.workId === undefined) throw new Error('proof_material_missing')
      const booking = bookingFromRows(call, quote)
      if (booking === null) throw new Error('proof_booking_invalid')
      const obligation = await ctx.db.query('moneyProviderObligations')
        .withIndex('by_obligationRef', q => q.eq('obligationRef', `provider-obligation:${call.callRef}`)).unique()
      records.push({ call, quote, booking, obligation, workState: (await pool.status(ctx, call.workId as WorkId)).state })
    }
    return JSON.stringify(records.sort((left, right) => left.call.callRef.localeCompare(right.call.callRef)))
  },
})
