import { describe, expect, it } from 'vitest'

import { reserveRouteStepSpend } from '@/modules/customer-request/route-mandate-admission'
import type { ExactAmount } from '@/modules/money/public'

describe('RouteMandate step admission', () => {
  it('permits the exact cumulative ceiling and refuses one minor unit beyond it', () => {
    expect(reserveRouteStepSpend({
      maximumTotalSpend: amount('1000'),
      priorReservations: [
        amount('250'),
        amount('350'),
      ],
      requestedReservation: amount('400'),
    })).toEqual({
      kind: 'reserved',
      cumulativeReservedSpend: amount('1000'),
    })

    expect(reserveRouteStepSpend({
      maximumTotalSpend: amount('1000'),
      priorReservations: [
        amount('250'),
        amount('350'),
      ],
      requestedReservation: amount('401'),
    })).toEqual({ kind: 'refused', reason: 'spend_limit_exceeded' })
  })

  it('fails closed on mixed currencies, negative values and malformed exact units', () => {
    for (const input of [
      {
        maximumTotalSpend: amount('1000'),
        priorReservations: [amount('100', 'USD')],
        requestedReservation: amount('100'),
      },
      {
        maximumTotalSpend: amount('1000'),
        priorReservations: [amount('-1')],
        requestedReservation: amount('100'),
      },
      {
        maximumTotalSpend: amount('1000'),
        priorReservations: [amount('9007199254740991.5')],
        requestedReservation: amount('100'),
      },
    ]) {
      expect(reserveRouteStepSpend(input)).toEqual({
        kind: 'refused', reason: 'spend_reservation_invalid',
      })
    }

    expect(reserveRouteStepSpend({
      maximumTotalSpend: amount('9007199254740991'),
      priorReservations: [amount('9007199254740991')],
      requestedReservation: amount('1'),
    })).toEqual({ kind: 'refused', reason: 'spend_limit_exceeded' })
  })
})

function amount(units: string, currency = 'AUD'): ExactAmount {
  return { currency, units, exponent: 2 }
}
