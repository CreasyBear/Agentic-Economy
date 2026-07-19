import { canonicalDigest } from '@/modules/common/canonical-digest'
import type {
  DevelopmentBookingInput,
  DevelopmentBookingResult,
} from './development-booking.actions'

export type DevelopmentAvailabilityObservation = DevelopmentBookingInput['slot']

export function createDevelopmentBookingProvider() {
  const reservations = new Map<string, Readonly<{
    digest: string
    result: DevelopmentBookingResult
  }>>()
  let effects = 0
  const availability: DevelopmentAvailabilityObservation = {
    slotRef: 'mock:slot:2026-07-21T02:00Z',
    providerRef: 'mock:provider:calendar',
    offeringRef: 'mock:offering:consultation',
    bindingRef: 'mock:binding:calendar-create-reservation',
    contractRef: 'calendar.create-reservation@1',
    actionVersion: 'v1',
    startsAt: '2026-07-21T02:00:00.000Z',
    freshAt: '2026-07-19T04:00:00.000Z',
    expiresAt: '2026-07-19T04:15:00.000Z',
    termsDigest: canonicalDigest({ cancellation: 'provider_supported_before_start', priceMinor: 0 }),
    provenance: {
      source: 'mock_provider_availability',
      observationRef: 'mock:availability-observation:001',
      observedBy: 'mock:provider:calendar',
    },
  }
  return {
    availability: async () => structuredClone(availability),
    check: async (input: DevelopmentBookingInput, now: number) => {
      const exact = canonicalDigest(input.slot) === canonicalDigest(availability)
      return exact && now < Date.parse(availability.expiresAt)
        ? { kind: 'current' as const }
        : { kind: 'stale' as const, reason: 'Provider slot identity, terms, provenance, or freshness changed.' }
    },
    reserve: async (input: DevelopmentBookingInput): Promise<DevelopmentBookingResult> => {
      const digest = canonicalDigest(input)
      const prior = reservations.get(input.operationKey)
      if (prior !== undefined) {
        if (prior.digest !== digest) {
          return {
            kind: 'reservation_refused',
            environment: 'MOCK/DEVELOPMENT ONLY',
            code: 'terms_changed',
            reason: 'The operation key was already used with different booking material.',
          }
        }
        return prior.result
      }
      effects += 1
      const result: DevelopmentBookingResult = {
        kind: 'reservation_confirmed',
        environment: 'MOCK/DEVELOPMENT ONLY',
        reservationRef: `mock:reservation:${canonicalDigest(input.operationKey).slice(-12)}`,
        providerRef: input.slot.providerRef,
        slotRef: input.slot.slotRef,
        evidenceRef: `mock:reservation-evidence:${canonicalDigest(input.operationKey).slice(-12)}`,
      }
      reservations.set(input.operationKey, { digest, result })
      return result
    },
    effectCount: () => effects,
    inspect: (operationKey: string) => reservations.get(operationKey),
  }
}
