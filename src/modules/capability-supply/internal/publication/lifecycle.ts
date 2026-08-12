import {
  connectionAuthoritySnapshotMatches,
  connectionAuthoritySnapshotsEqual,
  type CapabilityBindingRow,
  type CapabilityConnectionAuthoritySnapshot,
} from '../binding'
import {
  bindingEligibilityIsValid,
  offeringEligibilityIsValid,
} from '../eligibility/integrity'
import type { PricingConfig } from '@/modules/money/public'
import type { ProviderConnection } from '../../provider-connection'
import type { CapabilityOfferingRow } from '../offering/registration'

export type PublicationLifecycle = Readonly<{
  state: 'inactive' | 'active' | 'withdrawn' | 'incompatible'
  reasons: readonly PublicationLifecycleReason[]
}>
export type PublicationLifecycleReason =
  | 'admission_unproven' | 'conformance_unproven' | 'credential_readiness_unobserved'
  | 'health_unobserved' | 'credential_unavailable' | 'health_unhealthy' | 'health_stale'
  | 'withdrawn' | 'incompatible_revision'
  | 'eligibility_integrity_failure'

export type CapabilityReadinessOutcome =
  | 'healthy' | 'credential_unavailable' | 'credential_rejected' | 'target_not_public'
  | 'transport_unreachable' | 'http_redirect' | 'http_4xx' | 'http_5xx'
  | 'response_content_type_invalid' | 'response_too_large' | 'response_invalid'
export type CapabilityPublicationLifecycleRow = Readonly<{
  disposition: 'current' | 'withdrawn' | 'incompatible' | 'superseded'
  credentialState: 'unobserved' | 'ready' | 'unavailable'
  healthState: 'unobserved' | 'healthy' | 'unhealthy'
  connectionAuthority?: CapabilityConnectionAuthoritySnapshot
  pricingConfig?: PricingConfig
  priceDigest?: string
  readinessTargetDigest?: string
  readinessRequestDigest?: string
  readinessResponseStatus?: number
  readinessResponseContentType?: string
  readinessResponseDigest?: string
  readinessOutcome?: CapabilityReadinessOutcome
  readinessValidUntil?: number | undefined
  readinessObservedAt?: number | undefined
}>

export type PublicationContractRef = Readonly<{
  capabilityId: string
  version: number
  contractDigest: string
}>

const MAX_READINESS_VALIDITY_MS = 24 * 60 * 60_000

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
  currentConnection?: ProviderConnection | null,
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
  if (binding.authority.kind === 'provider_connection'
    && (
      !connectionAuthoritySnapshotMatches(binding.connectionAuthority, currentConnection, {
        businessId: String(offering.businessId),
        operationRef: publication.connectionAuthority?.operationRef
          ?? binding.connectionAuthority?.operationRef
          ?? '',
        adapterId: binding.adapterId,
        now,
      })
      || !connectionAuthoritySnapshotsEqual(publication.connectionAuthority, binding.connectionAuthority)
    )) {
    return { state: 'inactive', reasons: ['eligibility_integrity_failure'] }
  }
  if (binding.admission !== 'admitted' || offering.status !== 'active') reasons.push('admission_unproven')
  if (binding.conformance !== 'conformant') reasons.push('conformance_unproven')
  if (publication.credentialState === 'unobserved') reasons.push('credential_readiness_unobserved')
  if (publication.credentialState === 'unavailable') reasons.push('credential_unavailable')
  if (publication.healthState === 'unobserved' || publication.readinessObservedAt === undefined) {
    reasons.push('health_unobserved')
  }
  if (publication.healthState === 'unhealthy') reasons.push('health_unhealthy')
  const validUntil = publication.readinessValidUntil
  if (publication.healthState === 'healthy'
    && (publication.readinessObservedAt === undefined || validUntil === undefined)) {
    reasons.push('health_stale')
  }
  if (validUntil !== undefined && (validUntil <= now || validUntil > now + MAX_READINESS_VALIDITY_MS)) {
    reasons.push('health_stale')
  }
  return { state: reasons.length === 0 ? 'active' as const : 'inactive' as const, reasons }
}

