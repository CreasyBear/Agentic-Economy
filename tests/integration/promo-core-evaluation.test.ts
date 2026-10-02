import { describe, expect, it } from 'vitest'
import { internal } from '../../convex/_generated/api'
import { buildDevelopmentPublishedToolEvidence } from '../unit/capability-supply/fixtures/development-published-tool-evidence'
import { convexTestWithMarketComponents, createTestAgentPrincipal } from '../helpers/convex-fixtures'
import { currentUtcDayBounds, currentUtcMonthBounds } from '../../src/modules/common/freshness'
import { canonicalDigest } from '../../src/modules/common/canonical-digest'

const toolRef = `operation:v1:${'a'.repeat(64)}`
const toolJson = JSON.stringify(buildDevelopmentPublishedToolEvidence().tool)
const callRef = (letter: string) => `operation-invocation:v1:${letter.repeat(64)}`
const quoteRef = (letter: string) => `operation-commitment:v1:${letter.repeat(64)}`

describe('transactional promotional Call admission', () => {
  it('stores exact allocation, avoids replay decrement and over-allocation, restores once only on definitive abandon', async () => {
    const backend = convexTestWithMarketComponents()
    const { principal: key, grantRef } = await createTestAgentPrincipal(backend, 'promo-probe', {
      environment: 'sandbox', spendUnits: '10000000', maximumConcurrentCalls: 3,
    })
    const grant = await backend.run(ctx => ctx.db.query('agentAccessGrants')
      .withIndex('by_grantRef', q => q.eq('grantRef', grantRef)).unique())
    if (grant?.spendingPolicyDigest === undefined) throw new Error('grant_missing')
    const policyDigest = grant.spendingPolicyDigest
    const now = Date.now()
    const day = { ...currentUtcDayBounds(now), revision: 1, limitUnits: '10000000' }
    const month = { ...currentUtcMonthBounds(now), revision: 1, limitUnits: '10000000' }
    const spendingPeriods = { version: 'ae.spending-periods:v1' as const, daily: day, monthly: month }
    await backend.run(async ctx => {
      for (const [kind, period] of [['day', day], ['month', month]] as const) {
        await ctx.db.insert('agentSpendingPeriods', {
          principalRef: key.principalId, periodKind: kind,
          periodStartAt: period.periodStartAt, periodEndAt: period.periodEndAt,
          appliedRevision: 1, appliedLimitUnits: '10000000', cutover: 'clean_period',
        })
      }
      await ctx.db.insert('moneyPromotionalGrants', {
        grantRef: 'promo:core-probe', accountRef: key.ownerId, environment: 'sandbox',
        amountUnits: '5000000', availableUnits: '5000000', expiresAt: now + 60000,
        createdAt: now, updatedAt: now, operationKey: 'promo:core-probe',
        actorRef: 'admin:test', correlationId: 'promo:core-probe', commandDigest: canonicalDigest('promo-probe'),
        reasonCode: 'onboarding', evidenceRefs: ['evidence:promo'], bookingState: 'booked', transactionRef: 'formance:promo-probe', expiryRevision: 0,
      })
      for (const letter of ['b', 'c']) {
        await ctx.db.insert('capabilityQuotes', {
          quoteRef: quoteRef(letter), principalId: key.principalId, accountRef: key.ownerId,
          credentialId: key.credentialId, applicationRef: key.applicationRef,
          environment: key.environment, grantRef, grantGeneration: grant.generation,
          grantPolicyDigest: policyDigest, grantExpiresAt: grant.expiresAt,
          toolRef, toolVersion: 1, toolMaterialDigest: 'sha256:tool',
          currentToolDigest: 'sha256:current', toolJson, normalizedInputJson: '{}',
          inputDigest: 'sha256:input', pricingJson: '{}', pricingDigest: 'sha256:pricing',
          decisionAudUnits: '4000000', budgetPolicyRef: grant.budgetPolicyRef,
          budgetGeneration: 1, maximumSpendPerCallUnits: '10000000',
          formanceSchemaVersion: 'v1.5.0', spendingPeriods, policyGeneration: 1,
          legalCustomerRef: key.ownerId, legalCustomerGeneration: 1,
          buyerRevenueUnits: '4000000', buyerTaxUnits: '0', accountAvailableUnits: '10000000',
          budgetAvailableUnits: '10000000', legalExposureAvailableUnits: '10000000', balanceUnits: '10000000',
          commercialPolicyRefs: [], commercialPolicyDigest: 'sha256:commercial',
          evidenceDigest: 'sha256:evidence', state: 'issued', expiresAt: now + 60000,
          createdAt: now, updatedAt: now,
        })
      }
    })
    const reservation = (letter: string) => ({
      quoteRef: quoteRef(letter), callRef: callRef(letter), principalId: key.principalId,
      ownerId: key.ownerId, credentialId: key.credentialId, applicationRef: key.applicationRef,
      grantRef, environment: key.environment, toolRef, idempotencyKey: `call-promo-${letter}`,
      inputDigest: 'sha256:input', requestDigest: 'sha256:request',
      grantGeneration: grant.generation, policyDigest,
      grantExpiresAt: grant.expiresAt, toolJson, inputJson: '{}', now,
    })
    const firstArgs = reservation('b')
    const secondArgs = reservation('c')
    const results = await Promise.all([
      backend.mutation(internal.capabilityCalls.reserve, firstArgs),
      backend.mutation(internal.capabilityCalls.reserve, secondArgs),
    ])
    expect(results.map(result => result.kind)).toEqual(['reserved', 'reserved'])
    const read = () => backend.run(async ctx => ({
      grant: await ctx.db.query('moneyPromotionalGrants').first(),
      calls: await ctx.db.query('capabilityCalls').collect(),
    }))
    const afterReserve = await read()
    expect(afterReserve.grant?.availableUnits).toBe('0')
    const allocations = afterReserve.calls.map(call => call.promotionalCreditAllocation)
    expect(allocations).toHaveLength(2)
    expect(allocations.reduce((total, allocation) => total + BigInt(allocation?.grants[0]?.amountUnits ?? '0'), 0n)).toBe(5000000n)
    expect(allocations.reduce((total, allocation) => total + BigInt(allocation?.purchasedUnits ?? '0'), 0n)).toBe(3000000n)
    expect(allocations.every(allocation => BigInt(allocation?.grants[0]?.amountUnits ?? '0') + BigInt(allocation?.purchasedUnits ?? '0') === 4000000n)).toBe(true)
    expect(await backend.mutation(internal.capabilityCalls.reserve, firstArgs)).toMatchObject({ kind: 'replayed' })
    expect((await read()).grant?.availableUnits).toBe('0')
    const { toolJson: _toolJson, inputJson: _inputJson, now: _now, ...abandonFirst } = firstArgs
    expect(await backend.mutation(internal.capabilityCalls.abandon, abandonFirst)).toEqual({ kind: 'abandoned' })
    const restored = await read()
    expect(restored.grant?.availableUnits).toBe(afterReserve.calls.find(call => call.callRef === firstArgs.callRef)?.promotionalCreditAllocation?.grants[0]?.amountUnits ?? '0')
    expect(await backend.mutation(internal.capabilityCalls.abandon, abandonFirst)).toEqual({ kind: 'not_found' })
    expect((await read()).grant?.availableUnits).toBe(restored.grant?.availableUnits)
    await backend.run(async ctx => {
      const call = await ctx.db.query('capabilityCalls').withIndex('by_callRef', q => q.eq('callRef', secondArgs.callRef)).unique()
      if (call === null) throw new Error('second_call_missing')
      await ctx.db.patch(call._id, { formanceFinancialState: 'outcome_unknown' })
    })
    const { toolJson: _toolJson2, inputJson: _inputJson2, now: _now2, ...abandonSecond } = secondArgs
    expect(await backend.mutation(internal.capabilityCalls.abandon, abandonSecond)).toEqual({ kind: 'dispatch_started' })
    const held = await read()
    expect(held.grant?.availableUnits).toBe(restored.grant?.availableUnits)
    expect(held.calls).toHaveLength(1)
    expect(held.calls[0]?.promotionalCreditAllocation).toEqual(afterReserve.calls.find(call => call.callRef === secondArgs.callRef)?.promotionalCreditAllocation)
  })
})
