import {
  type ExposureOffsetRuleIdentity,
  type ExposureOffsetRuleMaterial,
} from '@/modules/action-invocation'
import { sealSourceOwnedExposureOffsetRules } from '../action-invocation/exposure-offset-rules'
import type { DevelopmentBookingProviderSnapshot } from './development-booking-provider'

export const developmentCancellationConfirmationRule: ExposureOffsetRuleIdentity = {
  evidenceRuleRef: 'development_booking.cancellation_confirmation',
  source: 'development_booking.provider_records',
  version: 'v1',
}

export function createDevelopmentBookingOffsetRuleTrust(
  snapshot: DevelopmentBookingProviderSnapshot,
) {
  return sealSourceOwnedExposureOffsetRules([{
    identity: developmentCancellationConfirmationRule,
    resolve: (material) => resolvesAuthoritativeCancellation(snapshot, material),
  }])
}

function resolvesAuthoritativeCancellation(
  snapshot: DevelopmentBookingProviderSnapshot,
  material: ExposureOffsetRuleMaterial,
) {
  const booking = snapshot.reservations.find(({ result }) =>
    result.kind === 'reservation_confirmed'
    && result.reservationRef === material.exposureResultRef
    && result.evidenceRef === material.exposureEvidenceRef)
  const cancellation = snapshot.cancellations.find(({ result }) =>
    result.kind === 'reservation_cancellation_confirmed'
    && result.cancellationRef === material.offsetResultRef
    && result.evidenceRef === material.offsetEvidenceRef)
  return booking?.result.kind === 'reservation_confirmed'
    && cancellation?.result.kind === 'reservation_cancellation_confirmed'
    && booking.input.customer.principalRef === material.principalRef
    && booking.result.providerRef === material.providerRef
    && booking.result.reservationRef === material.exposureSubjectRef
    && cancellation.input.principalRef === material.principalRef
    && cancellation.input.providerRef === material.providerRef
    && cancellation.input.reservationRef === booking.result.reservationRef
    && cancellation.result.reservationRef === booking.result.reservationRef
    && cancellation.result.reservationRef === material.offsetSubjectRef
}
