import { describe, expect, it, vi } from 'vitest'

vi.mock('../../../../src/modules/capability-supply/public', () => ({
  parsePublishedToolSnapshot: () => ({ identity: { businessId: 'biz' } }),
}))
vi.mock('../../../../src/modules/money/public', async importOriginal => ({
  ...(await importOriginal<object>()),
  validateExecutableRateEvidenceIntegrity: () => true,
}))

import { bookingFromRows } from './booking'

const alloc = { planRef: 'p', planDigest: 'd', approvedTotalUnits: '9', nodeId: 'n', nodeCeilingUnits: '100' }
const spendingPeriods = undefined
function rows(decision: string, perCall: string, node?: string) {
  const call = {
    callRef: 'c', quoteRef: 'q', ownerId: 'a', principalId: 'pr', toolRef: 't', environment: 'sandbox',
    idempotencyKey: 'k',
    ...(node === undefined ? {} : { planRef: 'p', planNodeId: 'n', planAllocation: { ...alloc, nodeCeilingUnits: node } }),
  }
  const quote = {
    quoteRef: 'q', accountRef: 'a', principalId: 'pr', toolRef: 't', environment: 'sandbox', toolJson: '{}',
    planRef: call.planRef, planNodeId: call.planNodeId, spendingPeriods,
    formanceSchemaVersion: 'v1.3.0', sourceUsdcUnits: '1', x402RequirementDigest: 'x', rateEvidenceDigest: 'r',
    treasuryCustodyRef: 'tr', treasuryCustodyGeneration: 1, treasuryEvidenceDigest: 'te',
    decisionAudUnits: decision, maximumSpendPerCallUnits: perCall,
    rateEvidenceJson: JSON.stringify({ evidenceDigest: 'r', sourceAmount: { units: decision }, version: 'other' }),
  }
  return [call, quote] as never as Parameters<typeof bookingFromRows>
}

describe('bookingFromRows ceilings', () => {
  it('refuses above per-call ceiling, books at it', () => {
    expect(bookingFromRows(...rows('101', '100'))).toBeNull()
    expect(bookingFromRows(...rows('100', '100'))).not.toBeNull()
  })
})
