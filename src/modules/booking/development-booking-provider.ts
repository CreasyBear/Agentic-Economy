import { canonicalDigest } from '@/modules/common/canonical-digest'
import type {
  DevelopmentBookingCancellationInput,
  DevelopmentBookingCancellationResult,
  DevelopmentBookingInput,
  DevelopmentBookingResult,
} from './development-booking.actions'

export type DevelopmentAvailabilityObservation = DevelopmentBookingInput['slot']
export type DevelopmentBookingProviderSnapshot = Readonly<{
  options: Readonly<{ providerRef?: string; slotRef?: string; refusal?: 'terms_changed' | 'provider_refused' }>
  reservations: readonly Readonly<{ operationKey: string; digest: string; input: DevelopmentBookingInput; result: DevelopmentBookingResult }>[]
  cancellations: readonly Readonly<{ operationKey: string; digest: string; result: DevelopmentBookingCancellationResult }>[]
  effects: number
  cancellationEffects: number
}>

export function createDevelopmentBookingProvider(options: Readonly<{
  providerRef?: string
  slotRef?: string
  refusal?: 'terms_changed' | 'provider_refused'
  snapshot?: DevelopmentBookingProviderSnapshot
}> = {}) {
  const reservations = new Map<string, Readonly<{
    digest: string
    input: DevelopmentBookingInput
    result: DevelopmentBookingResult
  }>>(options.snapshot?.reservations.map(({ operationKey, ...record }) => [operationKey, record]))
  const cancellations = new Map<string, Readonly<{
    digest: string
    result: DevelopmentBookingCancellationResult
  }>>(options.snapshot?.cancellations.map(({ operationKey, ...record }) => [operationKey, record]))
  let effects = options.snapshot?.effects ?? 0
  let cancellationEffects = options.snapshot?.cancellationEffects ?? 0
  const availability: DevelopmentAvailabilityObservation = {
    slotRef: options.slotRef ?? 'mock:slot:2026-07-21T02:00Z',
    providerRef: options.providerRef ?? 'mock:provider:calendar',
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
      if (options.refusal !== undefined) {
        const result: DevelopmentBookingResult = {
          kind: 'reservation_refused',
          environment: 'MOCK/DEVELOPMENT ONLY',
          code: options.refusal,
          reason: 'The development provider refused under its current terms.',
        }
        reservations.set(input.operationKey, { digest, input: structuredClone(input), result })
        return result
      }
      const result: DevelopmentBookingResult = {
        kind: 'reservation_confirmed',
        environment: 'MOCK/DEVELOPMENT ONLY',
        reservationRef: `mock:reservation:${canonicalDigest(input.operationKey).slice(-12)}`,
        providerRef: input.slot.providerRef,
        slotRef: input.slot.slotRef,
        evidenceRef: `mock:reservation-evidence:${canonicalDigest(input.operationKey).slice(-12)}`,
      }
      reservations.set(input.operationKey, { digest, input: structuredClone(input), result })
      return result
    },
    checkCancellation: async (input: DevelopmentBookingCancellationInput) => {
      const reservation = [...reservations.values()].find(({ result }) =>
        result.kind === 'reservation_confirmed' && result.reservationRef === input.reservationRef)
      return reservation !== undefined
        && reservation.result.kind === 'reservation_confirmed'
        && reservation.result.providerRef === input.providerRef
        && reservation.input.customer.principalRef === input.principalRef
        ? { kind: 'current' as const }
        : { kind: 'refused' as const, reason: 'Provider reservation, provider, or principal ownership did not match.' }
    },
    cancel: async (
      input: DevelopmentBookingCancellationInput,
    ): Promise<DevelopmentBookingCancellationResult> => {
      const digest = canonicalDigest(input)
      const prior = cancellations.get(input.operationKey)
      if (prior !== undefined) {
        return prior.digest === digest ? prior.result : {
          kind: 'reservation_cancellation_refused',
          environment: 'MOCK/DEVELOPMENT ONLY',
          code: 'operation_key_conflict',
          reason: 'Cancellation operation key was already used with different material.',
        }
      }
      cancellationEffects += 1
      const suffix = canonicalDigest(input.operationKey).slice(-12)
      const result: DevelopmentBookingCancellationResult = {
        kind: 'reservation_cancellation_confirmed',
        environment: 'MOCK/DEVELOPMENT ONLY',
        reservationRef: input.reservationRef,
        cancellationRef: `mock:cancellation:${suffix}`,
        evidenceRef: `mock:cancellation-evidence:${suffix}`,
      }
      cancellations.set(input.operationKey, { digest, result })
      return result
    },
    effectCount: () => effects,
    cancellationEffectCount: () => cancellationEffects,
    inspect: (operationKey: string) => reservations.get(operationKey),
    inspectCancellation: (operationKey: string) => cancellations.get(operationKey),
    exportSnapshot: (): DevelopmentBookingProviderSnapshot => ({
      options: {
        ...(options.providerRef === undefined ? {} : { providerRef: options.providerRef }),
        ...(options.slotRef === undefined ? {} : { slotRef: options.slotRef }),
        ...(options.refusal === undefined ? {} : { refusal: options.refusal }),
      },
      reservations: [...reservations.entries()].map(([operationKey, record]) => ({ operationKey, ...record })),
      cancellations: [...cancellations.entries()].map(([operationKey, record]) => ({ operationKey, ...record })),
      effects,
      cancellationEffects,
    }),
  }
}
