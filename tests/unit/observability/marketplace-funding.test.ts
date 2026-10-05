import { describe, expect, it } from 'vitest'
import { classifyCallFunding } from '@/modules/observability/public'

const usage = { chargeState: 'paid', amount: { currency: 'AUD', exponent: 6, units: '1000000' } }
describe('marketplace funding evidence', () => {
  it('separates purchased and promotional amounts exactly', () => {
    expect(classifyCallFunding({ usage, promotionalCreditAllocation: {
      purchasedUnits: '700000', grants: [{ amountUnits: '300000' }],
    } })).toEqual({ kind: 'settled', purchasedUnits: '700000', promotionalUnits: '300000' })
  })
  it('preserves fully promotional and refunded funding without implying a customer sale', () => {
    const allocation = { purchasedUnits: '0', grants: [{ amountUnits: '1000000' }] }
    expect(classifyCallFunding({ usage, promotionalCreditAllocation: allocation }))
      .toEqual({ kind: 'settled', purchasedUnits: '0', promotionalUnits: '1000000' })
    expect(classifyCallFunding({ usage: { ...usage, chargeState: 'refunded' },
      promotionalCreditAllocation: { purchasedUnits: '1000000', grants: [] },
    })).toEqual({ kind: 'refunded', purchasedUnits: '1000000', promotionalUnits: '0' })
  })
  it('withholds classification when the original funding evidence is absent or inconsistent', () => {
    expect(classifyCallFunding({ usage })).toEqual({ kind: 'unclassified' })
    for (const purchasedUnits of ['-1', '1000001', 'NaN', '01', '9007199254740992']) {
      expect(classifyCallFunding({ usage, promotionalCreditAllocation: { purchasedUnits, grants: [] } }))
        .toEqual({ kind: 'unclassified' })
    }
    expect(classifyCallFunding({ usage: { ...usage, amount: { ...usage.amount, exponent: 2 } },
      promotionalCreditAllocation: { purchasedUnits: '1000000', grants: [] },
    })).toEqual({ kind: 'unclassified' })
  })
  it('keeps free and unresolved usage distinct from settled money', () => {
    expect(classifyCallFunding({})).toEqual({ kind: 'unsettled' })
    expect(classifyCallFunding({ usage: { ...usage, chargeState: 'outcome_unknown' } })).toEqual({ kind: 'unsettled' })
    expect(classifyCallFunding({ usage: { ...usage, chargeState: 'free_tier' } })).toEqual({ kind: 'free' })
  })
})
