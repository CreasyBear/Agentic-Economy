import type { ActionInvocationOrigin, InvocationActor } from '@/modules/action-invocation'
import type {
  DevelopmentBookingCancellationInput,
  DevelopmentBookingInput,
} from './development-booking.actions'
import type { DevelopmentAvailabilityObservation } from './development-booking-provider'

export const developmentBookingNowMs = Date.parse('2026-07-19T04:00:00.000Z')
export const developmentBookingNow = () => new Date(developmentBookingNowMs).toISOString()

export function bookingActor(origin: ActionInvocationOrigin): InvocationActor {
  return origin.kind === 'standalone'
    ? { callerRef: origin.callerRef, principalRef: origin.principalRef }
    : { callerRef: `request:${origin.requestRef}`, principalRef: `request-owner:${origin.requestRef}` }
}

export function bookingInput(
  slot: DevelopmentAvailabilityObservation,
  principalRef: string,
  operationKey: string,
  email = 'development@example.test',
): DevelopmentBookingInput {
  return {
    environment: 'MOCK/DEVELOPMENT ONLY',
    slot,
    customer: { principalRef, name: 'Development Customer', email },
    disclosure: {
      fields: ['customer.name', 'customer.email'],
      recipient: slot.providerRef,
      purpose: 'create_development_reservation',
    },
    operationKey,
  }
}

export function cancellationInput(input: Readonly<{
  reservationRef: string
  providerRef: string
  principalRef: string
  operationKey: string
  reason?: string
}>): DevelopmentBookingCancellationInput {
  return {
    environment: 'MOCK/DEVELOPMENT ONLY',
    reservationRef: input.reservationRef,
    providerRef: input.providerRef,
    principalRef: input.principalRef,
    reason: input.reason ?? 'Development customer requested cancellation.',
    operationKey: input.operationKey,
  }
}
