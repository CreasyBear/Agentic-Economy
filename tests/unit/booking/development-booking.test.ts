import { describe, expect, it } from 'vitest'

import { findAction } from '@/modules/actions'
import { runDevelopmentBookingEvidence } from '@/modules/booking/development-booking-evidence'

describe('booking.createDevelopmentReservation', () => {
  it('registers one consequential development-only action with no reachable surface', () => {
    const action = findAction('booking.createDevelopmentReservation')
    expect(action).toMatchObject({
      readOnly: false,
      surfaces: [],
      invocationContract: {
        version: 'v1',
        consequenceClass: 'external_effect',
        authorityRequirement: 'principal',
        retryClass: 'reconcile_before_retry',
      },
    })
  })

  it('MOCK/DEVELOPMENT ONLY: shares control across both origins and keeps possible release unretryable', async () => {
    const packet = await runDevelopmentBookingEvidence()
    expect(packet.origins.map((origin) => origin.kind)).toEqual(['request_owned', 'standalone'])
    expect(packet.observedTransitions.slice(0, 2).map((view) => view.control.state)).toEqual(['terminal', 'terminal'])
    expect(packet.replay).toEqual({ effectCalls: 1, disposition: 'invalid_control_state' })
    expect(packet.uncertainty).toMatchObject({
      control: { state: 'reconciliation_required' },
      release: { state: 'possibly_released' },
      retryDisposition: 'reconciliation_required',
    })
    expect(packet.proportionality.measurements.controlled).toMatchObject({
      controlRecords: 1,
      attributableAttempts: 1,
      effectCalls: 1,
      authorityDecisions: 1,
    })
    expect(packet.gate7).toBe('proportionality_passes_but_gate_remains_open_for_observed_provider_cancellation')
    expect(packet.claimCeiling).toContain('No customer reachability')
  })
})
