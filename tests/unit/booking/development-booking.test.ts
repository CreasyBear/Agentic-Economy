import { beforeAll, describe, expect, it } from 'vitest'

import { findAction } from '@/modules/actions'
import { runDevelopmentBookingEvidenceV2 } from '@/modules/booking/development-booking-evidence-v2'

describe('booking.createDevelopmentReservation', () => {
  let packet: Awaited<ReturnType<typeof runDevelopmentBookingEvidenceV2>>
  beforeAll(async () => {
    packet = await runDevelopmentBookingEvidenceV2()
  })

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

  it('binds each disclosed booking principal to the authority-bound principal before release', () => {
    expect(packet.origins.map((origin) => origin.kind)).toEqual(['request_owned', 'standalone'])
    expect(packet.principalRefusal).toMatchObject({
      outcome: { state: 'returned', execution: 'pre_release_refused', businessOutcome: 'refused' },
      effectCalls: 0,
    })
  })

  it('rechecks provider availability against trusted release time with zero stale effect', () => {
    expect(packet.expiryRefusal).toMatchObject({
      outcome: { state: 'returned', execution: 'pre_release_refused', businessOutcome: 'refused' },
      effectCalls: 0,
    })
  })

  it('derives the exact slot identity and terms from provider-owned availability', () => {
    expect(packet.availability).toMatchObject({
      providerRef: 'mock:provider:calendar',
      bindingRef: 'mock:binding:calendar-create-reservation',
      contractRef: 'calendar.create-reservation@1',
      actionVersion: 'v1',
      provenance: { source: 'mock_provider_availability' },
    })
  })

  it('deduplicates same operation material and conflicts changed material', () => {
    expect(packet.idempotency.first).toEqual(packet.idempotency.duplicate)
    expect(packet.idempotency.effectsAfterDuplicate).toBe(packet.idempotency.effectsBeforeDuplicate)
    expect(packet.idempotency.changedMaterial).toMatchObject({
      kind: 'reservation_refused',
      code: 'terms_changed',
    })
  })

  it('reconciles possible release through attributable observer evidence', () => {
    expect(packet.reconciliation).toMatchObject({
      before: { state: 'reconciliation_required' },
      release: { state: 'possibly_released' },
      after: { state: 'terminal' },
    })
  })

  it('executes pre-release stop and separate provider-confirmed cancellation without rewriting reservation', () => {
    expect(packet.cancellation).toMatchObject({
      beforeRelease: { state: 'cancelled', effect: 'not_released' },
      providerConfirmed: {
        state: 'returned',
        result: { kind: 'reservation_cancellation_confirmed' },
      },
      originalReservationAfterCancellation: {
        state: 'returned',
        result: { kind: 'reservation_confirmed' },
      },
    })
  })

  it('closes Gate 7 only for the labelled development class', () => {
    expect(packet.gate7).toBe('passes_for_declared_development_class')
    expect(packet.claimCeiling).toContain('No customer reachability')
  })
})
