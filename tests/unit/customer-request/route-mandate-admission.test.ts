import { describe, expect, it } from 'vitest'

import { reserveRouteStepSpend } from '@/modules/customer-request/route-mandate-admission'

describe('RouteMandate step admission', () => {
  it('permits the exact cumulative ceiling and refuses one minor unit beyond it', () => {
    expect(reserveRouteStepSpend({
      maximumTotalSpend: { currency: 'AUD', amountMinor: 1_000 },
      priorReservations: [
        { currency: 'AUD', amountMinor: 250 },
        { currency: 'AUD', amountMinor: 350 },
      ],
      requestedReservation: { currency: 'AUD', amountMinor: 400 },
    })).toEqual({
      kind: 'reserved',
      cumulativeReservedSpend: { currency: 'AUD', amountMinor: 1_000 },
    })

    expect(reserveRouteStepSpend({
      maximumTotalSpend: { currency: 'AUD', amountMinor: 1_000 },
      priorReservations: [
        { currency: 'AUD', amountMinor: 250 },
        { currency: 'AUD', amountMinor: 350 },
      ],
      requestedReservation: { currency: 'AUD', amountMinor: 401 },
    })).toEqual({ kind: 'refused', reason: 'spend_limit_exceeded' })
  })

  it('fails closed on mixed currencies, negative values and unsafe integer overflow', () => {
    for (const input of [
      {
        maximumTotalSpend: { currency: 'AUD', amountMinor: 1_000 },
        priorReservations: [{ currency: 'USD', amountMinor: 100 }],
        requestedReservation: { currency: 'AUD', amountMinor: 100 },
      },
      {
        maximumTotalSpend: { currency: 'AUD', amountMinor: 1_000 },
        priorReservations: [{ currency: 'AUD', amountMinor: -1 }],
        requestedReservation: { currency: 'AUD', amountMinor: 100 },
      },
      {
        maximumTotalSpend: { currency: 'AUD', amountMinor: Number.MAX_SAFE_INTEGER },
        priorReservations: [{ currency: 'AUD', amountMinor: Number.MAX_SAFE_INTEGER }],
        requestedReservation: { currency: 'AUD', amountMinor: 1 },
      },
    ]) {
      expect(reserveRouteStepSpend(input)).toEqual({
        kind: 'refused', reason: 'spend_reservation_invalid',
      })
    }
  })
})
