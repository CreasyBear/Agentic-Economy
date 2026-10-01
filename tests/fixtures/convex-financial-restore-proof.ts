import { Workpool, type WorkId } from '@convex-dev/workpool'
import { makeFunctionReference } from 'convex/server'
import { v } from 'convex/values'
import { action, internalMutation as mutation, internalQuery as query, type MutationCtx } from '../../convex/_generated/server'
import { components, internal } from '../../convex/_generated/api'
import { bookingFromRows } from '../../convex/lib/money/managedCall/booking'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { currentUtcDayBounds, currentUtcMonthBounds } from '@/modules/common/freshness'
import { quoteManagedX402BuyerAud } from '@/modules/money/public'
import { markPossiblySubmittedHandler, finalizeSettlementHandler } from '../../convex/lib/money/managedCall/transitions'
import { materializePurchaseResolutionRecord } from '../../convex/lib/capabilityExecution/callLifecycle/purchaseResolutionMaterialize'
import { upsertCallProjection } from '../../convex/lib/capabilityExecution/callLifecycle/dispatchProjection'

// Copied only into disposable deployments. Seed the original frozen booking;
// the test uses maintained native reservation and settlement producers afterward.
const ownerSegment = canonicalDigest({ proof: 'financial-restore-report-owner' }).slice(7, 39)
const ownerAccountRef = `acc_${ownerSegment}`
const ownerPrincipalRef = `prn_${ownerSegment}`
const ownerTokenIdentifier = 'https://release-proof.invalid|user_financial_restore'
const pool = new Workpool(components.workpool, { maxParallelism: 4 })
const noEffectRef = makeFunctionReference<'mutation', Record<string, never>, null>('financialRestoreProof:noEffect')
export const noEffect = mutation({ args: {}, returns: v.null(), handler: async () => null })

// User impersonation cannot invoke an internal registration directly. Preserve
// native auth propagation while stopping before the ordinary refund action.
export const admitReport = action({
  args: { callRef: v.string() }, returns: v.string(),
  handler: async (ctx, args): Promise<string> => JSON.stringify(await ctx.runMutation(internal.capabilityCallReports.admit, args)),
})

// Both report and promotional proofs use the same canonical synthetic owner.
async function seedOwner(ctx: MutationCtx, now: number): Promise<void> {
  const accountRef = ownerAccountRef
  const ownershipRef = `own_${ownerSegment}`, bindingRef = `eib_${ownerSegment}`
  const credentialRef = `crd_${ownerSegment}`
  const action = { actorPrincipalRef: ownerPrincipalRef, activeAccountRef: accountRef,
    correlationRef: 'financial-restore-owner', idempotencyRef: 'financial-restore-owner' }
  await ctx.db.insert('principals', { principalRef: ownerPrincipalRef, kind: 'human',
    displayName: 'Financial restore fixture owner', lifecycle: 'active', revision: 1, createdAt: now, updatedAt: now })
  await ctx.db.insert('accounts', { accountRef, displayName: 'Financial restore fixture Account',
    lifecycle: 'active', recoveryPolicy: { kind: 'no_transfer', revision: 1 },
    creationActorPrincipalRef: ownerPrincipalRef, creationIdempotencyRef: 'financial-restore-owner',
    initialOwnershipRef: ownershipRef, currentOwnershipRef: ownershipRef, revision: 1,
    createdAt: now, updatedAt: now, lastAction: action })
  await ctx.db.insert('accountOwnerships', { ownershipRef, accountRef, ownerPrincipalRef,
    lifecycle: 'active', changeKind: 'creation', revision: 1, createdAt: now, createdBy: action })
  await ctx.db.insert('externalIdentityBindings', { bindingRef, principalRef: ownerPrincipalRef,
    providerNamespace: 'clerk/user', providerIdentifier: ownerTokenIdentifier,
    providerState: { kind: 'known', value: 'active' }, lifecycle: 'active', credentialGeneration: 1,
    bindIdempotencyRef: 'financial-restore-owner', revision: 1, createdAt: now, updatedAt: now })
  await ctx.db.insert('credentials', { credentialRef, bindingRef, principalRef: ownerPrincipalRef,
    type: 'provider_token', lifecycle: 'active', generation: 1, issueIdempotencyRef: 'financial-restore-owner',
    revision: 1, issuedAt: now, expiresAt: (Math.floor(now / 1_000) + 86_400) * 1_000, updatedAt: now })
}

export const seed = mutation({
  args: { toolJson: v.string(), now: v.number(), unbound: v.boolean(), reportOwner: v.optional(v.boolean()),
    release: v.optional(v.boolean()) }, returns: v.null(),
  handler: async (ctx, { toolJson, now, unbound, reportOwner, release }): Promise<null> => {
    if (await ctx.db.query('capabilityCalls').first()) throw new Error('proof_already_seeded')
    const accountRef = reportOwner === true ? ownerAccountRef : 'account:financial-restore'
    if (reportOwner === true) {
      // Canonical owner facts are synthetic fixture data. Genuine report admission
      // still resolves this identity and arms its credential expiry itself.
      await seedOwner(ctx, now)
    }
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
      const workId = unbound ? undefined : await pool.enqueueMutation(ctx, noEffectRef, {}, { runAt: now + 86_400_000 })
      await ctx.db.insert('capabilityQuotes', {
        quoteRef, principalId: 'principal:financial-restore', accountRef,
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
        callRef, quoteRef, principalId: 'principal:financial-restore', ownerId: accountRef,
        credentialId: 'credential:financial-restore', applicationRef: 'application:financial-restore',
        toolRef, idempotencyKey: `key:${callRef}`, environment: 'sandbox', grantRef: 'grant:financial-restore',
        grantGeneration: 1, policyDigest: digest, grantExpiresAt: now + 86_400_000, toolJson, inputJson, inputDigest,
        requestDigest: digest, formanceFinancialState: 'reservation_pending', state: 'pending',
        result: { kind: 'pending', callRef, toolRef, retryAfterMs: 1000 },
        ...(workId === undefined ? {} : { workId, dispatchState: 'enqueued' as const }),
        promotionalCreditAllocation: { version: 'ae.promotional-credit-allocation:v1',
          purchasedUnits: label === 'promo' ? '0' : '300000', grants: [{ grantRef: `promo:${callRef}`,
            amountUnits: label === 'promo' ? '600000' : '300000', expiresAt: now + 86_400_000 }] },
        createdAt: now, updatedAt: now,
      })
      if (release === true) {
        const grantRef = `promo:${callRef}`
        const amountUnits = label === 'promo' ? '600000' : '300000'
        await ctx.db.insert('moneyPromotionalGrants', { grantRef, accountRef,
          environment: 'sandbox', amountUnits, availableUnits: '0', expiresAt: now + 86_400_000,
          createdAt: now, updatedAt: now, operationKey: grantRef, actorRef: 'principal:financial-restore',
          correlationId: 'financial-restore-promotional', commandDigest: canonicalDigest({ grantRef, accountRef }),
          reasonCode: 'onboarding', evidenceRefs: [callRef], bookingState: 'booked', expiryRevision: 0 })
      }
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
      if (quote === null) throw new Error('proof_material_missing')
      const booking = bookingFromRows(call, quote)
      if (booking === null) throw new Error('proof_booking_invalid')
      const obligation = await ctx.db.query('moneyProviderObligations')
        .withIndex('by_obligationRef', q => q.eq('obligationRef', `provider-obligation:${call.callRef}`)).unique()
      const grants = []
      for (const allocated of call.promotionalCreditAllocation?.grants ?? []) {
        const grant = await ctx.db.query('moneyPromotionalGrants').withIndex('by_grantRef', q => q.eq('grantRef', allocated.grantRef)).unique()
        if (grant !== null) grants.push(grant)
      }
      records.push({ call, quote, booking, obligation, grants,
        workState: call.workId === undefined ? 'absent' : (await pool.status(ctx, call.workId as WorkId)).state })
    }
    return JSON.stringify(records.sort((left, right) => left.call.callRef.localeCompare(right.call.callRef)))
  },
})

/** Requires all four original reservations and caller-supplied native settlement
 * references. Ensures synthetic completed delivery has canonical local settlement,
 * receipt, usage, resolution and depleted grant facts before genuine admission.
 * Invariant: never submit money or admit a report here. Any incompatible fixture
 * material throws and rolls back the whole preparation transaction. */
export const completeSales = mutation({
  args: { settlements: v.array(v.object({ callRef: v.string(), transactionRefs: v.array(v.string()) })), now: v.number() },
  returns: v.null(),
  handler: async (ctx, { settlements, now }): Promise<null> => {
    if (settlements.length !== 4 || new Set(settlements.map(value => value.callRef)).size !== 4
      || !Number.isSafeInteger(now) || now < 0) throw new Error('proof_completion_invalid')
    for (const supplied of settlements) {
      const call = await ctx.db.query('capabilityCalls').withIndex('by_callRef', q => q.eq('callRef', supplied.callRef)).unique()
      const quoteRef = call?.quoteRef
      const quote = quoteRef === undefined ? null : await ctx.db.query('capabilityQuotes').withIndex('by_quoteRef', q => q.eq('quoteRef', quoteRef)).unique()
      if (call === null || quote === null || call.state !== 'pending' || call.ownerId !== ownerAccountRef
        || !['paid', 'promo', 'missing', 'conflict'].some(label => call.callRef === `call:financial-restore:${label}`)) {
        throw new Error('proof_completion_material_missing')
      }
      const booking = bookingFromRows(call, quote)
      if (booking === null) throw new Error('proof_booking_invalid')
      const marked = await markPossiblySubmittedHandler(ctx, { callRef: call.callRef, evidenceDigest: canonicalDigest(booking), now })
      if (marked.kind !== 'accepted') throw new Error(marked.code)
      const settled = await finalizeSettlementHandler(ctx, { callRef: call.callRef,
        transactionRefs: supplied.transactionRefs, expectedBookingDigest: canonicalDigest(booking), now })
      if (settled.kind !== 'accepted') throw new Error(settled.code)
      const transactionRef = supplied.transactionRefs[0]
      if (transactionRef === undefined) throw new Error('proof_completion_reference_missing')
      for (const grant of call.promotionalCreditAllocation?.grants ?? []) {
        const existing = await ctx.db.query('moneyPromotionalGrants').withIndex('by_grantRef', q => q.eq('grantRef', grant.grantRef)).unique()
        if (existing !== null) throw new Error('proof_promotional_grant_already_seeded')
        await ctx.db.insert('moneyPromotionalGrants', { grantRef: grant.grantRef, accountRef: call.ownerId,
          environment: call.environment, amountUnits: grant.amountUnits, availableUnits: '0', expiresAt: grant.expiresAt,
          createdAt: call.createdAt, updatedAt: now, operationKey: grant.grantRef, actorRef: ownerPrincipalRef,
          correlationId: 'financial-restore-promotional', commandDigest: canonicalDigest({ grant, accountRef: call.ownerId }),
          reasonCode: 'onboarding', evidenceRefs: [call.callRef], bookingState: 'booked', expiryRevision: 0 })
      }
      const amount = { currency: 'AUD', units: booking.buyerAmountUnits, exponent: 6 }
      const providerAmount = { currency: 'USDC', units: booking.providerAmountUnits, exponent: 6 }
      const evidenceHash = canonicalDigest({ proof: 'financial-restore-delivery', callRef: call.callRef })
      const usage = { usageRef: `usage:${call.callRef}`, observedAt: now, chargeState: 'paid' as const,
        amount, priceDigest: quote.pricingDigest, transactionRef, durationMs: 1 }
      const receipt = { commercialModel: 'account_aud' as const, receiptRef: `receipt:${call.callRef}`,
        state: 'settled' as const, buyerCharge: amount, serviceFee: { ...amount, units: '0' }, totalBuyerCharge: amount,
        providerObligation: { amount: providerAmount, settlementMethod: 'managed_x402' as const, payoutEligible: false as const },
        providerSettlement: { amount: providerAmount, network: 'eip155:84532' as const,
          asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as const },
        priceDigest: quote.pricingDigest, evidenceHash, issuedAt: new Date(now).toISOString(),
        refundState: 'not_applicable' as const, lossState: 'none' as const, transactionRef,
        accountingTransactionRefs: [...supplied.transactionRefs] }
      const result = { kind: 'completed' as const, callRef: call.callRef, toolRef: call.toolRef,
        output: { answer: `Synthetic delivery for ${call.callRef}` }, evidenceHash, usage, receipt }
      const projection = { state: 'completed' as const, dispatchState: 'completed' as const, result, usage }
      await ctx.db.patch(call._id, { ...projection, updatedAt: now })
      const completed = await ctx.db.get(call._id)
      if (completed === null) throw new Error('proof_completed_call_missing')
      await materializePurchaseResolutionRecord(ctx, completed, projection, now)
      const resolution = await ctx.db.query('purchaseResolutionRecords').withIndex('by_callRef', q => q.eq('callRef', call.callRef)).unique()
      if (resolution?.terminalState !== 'completed') throw new Error('proof_completed_resolution_missing')
      await upsertCallProjection(ctx, completed, projection, now)
    }
    return null
  },
})

// Full durable evidence, not a manufactured success summary. The report's
// originalResolution is the maintained stripped record; resolution below is
// the full current Doc so archive/replay comparisons include stored clocks.
export const inspectReports = query({
  args: {}, returns: v.string(),
  handler: async (ctx): Promise<string> => {
    const calls = await ctx.db.query('capabilityCalls').collect()
    const records = []
    for (const call of calls) {
      const quoteRef = call.quoteRef
      const quote = quoteRef === undefined ? null : await ctx.db.query('capabilityQuotes').withIndex('by_quoteRef', q => q.eq('quoteRef', quoteRef)).unique()
      if (quote === null) throw new Error('proof_material_missing')
      const booking = bookingFromRows(call, quote)
      if (booking === null) throw new Error('proof_booking_invalid')
      const report = await ctx.db.query('paidCallReports').withIndex('by_callRef', q => q.eq('callRef', call.callRef)).unique()
      const obligation = await ctx.db.query('moneyProviderObligations').withIndex('by_callRef', q => q.eq('callRef', call.callRef)).unique()
      const resolution = await ctx.db.query('purchaseResolutionRecords').withIndex('by_callRef', q => q.eq('callRef', call.callRef)).unique()
      const projection = await ctx.db.query('capabilityCallProjections').withIndex('by_callRef', q => q.eq('callRef', call.callRef)).unique()
      const grants = []
      for (const allocated of call.promotionalCreditAllocation?.grants ?? []) {
        grants.push(await ctx.db.query('moneyPromotionalGrants').withIndex('by_grantRef', q => q.eq('grantRef', allocated.grantRef)).unique())
      }
      const marketFacts = report === null ? [] : await ctx.db.query('marketEvidenceFacts')
        .withIndex('by_kind_and_sourceRef', q => q.eq('kind', 'ae_answer_reported').eq('sourceRef', report.reportRef)).collect()
      records.push({ call, quote, booking, obligation, report, grants, resolution, projection,
        usage: call.usage ?? null, marketFacts })
    }
    return JSON.stringify(records.sort((left, right) => left.call.callRef.localeCompare(right.call.callRef)))
  },
})


export const seedPromotionalOwner = mutation({
  args: {}, returns: v.string(),
  handler: async (ctx): Promise<string> => {
    if (await ctx.db.query('accounts').first()) throw new Error('proof_already_seeded')
    await seedOwner(ctx, Date.now())
    await ctx.db.insert('adminMemberships', { clerkUserId: 'user_financial_restore',
      tokenIdentifier: ownerTokenIdentifier, role: 'owner_admin', state: 'active',
      grantedBy: 'disposable-restore-proof', grantedAt: Date.now() })
    return ownerAccountRef
  },
})

export const inspectPromotional = query({
  args: {}, returns: v.string(),
  handler: async (ctx): Promise<string> => JSON.stringify({
    grants: (await ctx.db.query('moneyPromotionalGrants').collect()).sort((a, b) => a.grantRef.localeCompare(b.grantRef)),
    operations: (await ctx.db.query('operationKeys').collect()).sort((a, b) => a.key.localeCompare(b.key)),
    audits: (await ctx.db.query('auditEvents').collect()).sort((a, b) => a.eventId.localeCompare(b.eventId)),
  }),
})

// Deliberate lost-history falsifier, available only in this disposable fixture.
export const removePromotionalApproval = mutation({
  args: { grantRef: v.string() }, returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const grant = await ctx.db.query('moneyPromotionalGrants').withIndex('by_grantRef', q => q.eq('grantRef', args.grantRef)).unique()
    if (!grant?.auditEventRef) throw new Error('proof_grant_missing')
    const audit = await ctx.db.query('auditEvents').withIndex('by_eventId', q => q.eq('eventId', grant.auditEventRef!)).unique()
    if (audit === null) throw new Error('proof_audit_missing')
    await ctx.db.delete(audit._id)
    return null
  },
})
