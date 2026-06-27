import { describe, expect, it } from 'vitest'

import { LifecyclePrimitiveValues } from '@/modules/lifecycle/public'
import { urgentTradeServiceDescriptor } from '@/modules/lifecycle/internal/reference-vertical'

describe('lifecycle descriptor contract', () => {
  it('exports descriptor-only primitives and a reference vertical', () => {
    expect(LifecyclePrimitiveValues).toEqual(['held_money', 'external_authority', 'time_bound', 'proof_gap'])
    expect(urgentTradeServiceDescriptor).toMatchObject({
      lifecycleClass: 'urgent_trade_service',
      descriptorOnly: true,
      primitives: {
        held_money: true,
        external_authority: true,
        time_bound: true,
        proof_gap: true,
      },
    })
    expect(Object.keys(urgentTradeServiceDescriptor)).not.toContain('execute')
  })
})
