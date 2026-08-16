import { describe, expect, it } from 'vitest'

import { paymentLaneAdmission } from '@/modules/capability-supply/server'

const environments = ['sandbox', 'development', 'production'] as const

describe('payment lane admission', () => {
  it('admits the AE-brokered rail in every environment', () => {
    for (const environment of environments) {
      expect(paymentLaneAdmission({ rail: 'ae_internal', environment })).toEqual({
        kind: 'admitted',
        lane: 'brokered',
      })
    }
  })

  it('admits the provider-direct x402 rail outside production', () => {
    for (const environment of ['sandbox', 'development'] as const) {
      expect(paymentLaneAdmission({ rail: 'provider_direct_x402', environment })).toEqual({
        kind: 'admitted',
        lane: 'brokered',
      })
    }
  })

  it('refuses the provider-direct x402 rail in production', () => {
    expect(paymentLaneAdmission({ rail: 'provider_direct_x402', environment: 'production' })).toEqual({
      kind: 'refused',
      lane: 'provider_direct_x402',
      code: 'payment_lane_not_brokered',
    })
  })
})
