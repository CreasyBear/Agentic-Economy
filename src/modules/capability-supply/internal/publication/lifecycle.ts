import {
  bindingEligibilityIsValid,
  offeringEligibilityIsValid,
} from '../eligibility/integrity'
import type { CapabilityBindingRow } from '../binding/registration'
import type { CapabilityOfferingRow } from '../offering/registration'

export type PublicationLifecycleReason =
  | 'admission_unproven' | 'conformance_unproven' | 'credential_readiness_unobserved'
  | 'health_unobserved' | 'credential_unavailable' | 'health_unhealthy' | 'health_stale'
  | 'withdrawn' | 'incompatible_revision'
  | 'eligibility_integrity_failure'

export type PublicationLifecycle = {
  state: 'inactive' | 'active' | 'withdrawn' | 'incompatible'
  reasons: PublicationLifecycleReason[]
}

export type CapabilityPublicationLifecycleRow = Readonly<{
  disposition: 'current' | 'withdrawn' | 'incompatible' | 'superseded'
  credentialState: 'unobserved' | 'ready' | 'unavailable'
  healthState: 'unobserved' | 'healthy' | 'unhealthy'
  readinessValidUntil?: number | undefined
  readinessObservedAt?: number | undefined
}>

export type PublicationContractRef = Readonly<{
  capabilityId: string
  version: number
  contractDigest: string
}>

export const INITIAL_PUBLICATION_LIFECYCLE: PublicationLifecycle = {
  state: 'inactive',
  reasons: [
    'admission_unproven',
    'conformance_unproven',
    'credential_readiness_unobserved',
    'health_unobserved',
  ],
}

export function publicationProjection(
  contractRef: PublicationContractRef,
  offeringId: string,
  bindingId: string,
  lifecycle: PublicationLifecycle = INITIAL_PUBLICATION_LIFECYCLE,
) {
  return {
    kind: 'published' as const,
    publicationRef: offeringId,
    contractRef,
    offeringId,
    bindingId,
    lifecycle,
  }
}

export function publicationLifecycle(
  publication: CapabilityPublicationLifecycleRow,
  offering: CapabilityOfferingRow,
  binding: CapabilityBindingRow,
  now: number,
): PublicationLifecycle {
  if (publication.disposition === 'withdrawn') {
    return { state: 'withdrawn' as const, reasons: ['withdrawn' as const] }
  }
  if (publication.disposition === 'incompatible') {
    return { state: 'incompatible' as const, reasons: ['incompatible_revision' as const] }
  }
  const reasons: PublicationLifecycleReason[] = []
  if (!offeringEligibilityIsValid(offering) || !bindingEligibilityIsValid(binding)) {
    return { state: 'inactive', reasons: ['eligibility_integrity_failure'] }
  }
  if (binding.admission !== 'admitted' || offering.status !== 'active') reasons.push('admission_unproven')
  if (binding.conformance !== 'conformant') reasons.push('conformance_unproven')
  if (publication.credentialState === 'unobserved') reasons.push('credential_readiness_unobserved')
  if (publication.credentialState === 'unavailable') reasons.push('credential_unavailable')
  if (publication.healthState === 'unobserved') reasons.push('health_unobserved')
  if (publication.healthState === 'unhealthy') reasons.push('health_unhealthy')
  if (publication.readinessValidUntil !== undefined && publication.readinessValidUntil <= now) {
    reasons.push('health_stale')
  }
  return { state: reasons.length === 0 ? 'active' as const : 'inactive' as const, reasons }
}
