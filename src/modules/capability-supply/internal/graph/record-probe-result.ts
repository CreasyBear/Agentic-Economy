import { bindingIntegrityIsValid } from '../binding/integrity'
import { contractRefFromRow } from '../offering/registration'
import { offeringIntegrityIsValid } from '../offering/integrity'
import { publicationLifecycle, type PublicationLifecycle } from '../publication/lifecycle'

import type { CapabilityGraphPorts } from './ports'
import { probeTargetDigest } from './probe-digest'

export type ProbeOutcome =
  | 'healthy'
  | 'credential_unavailable'
  | 'credential_rejected'
  | 'target_not_public'
  | 'transport_unreachable'
  | 'http_redirect'
  | 'http_4xx'
  | 'http_5xx'
  | 'response_content_type_invalid'
  | 'response_too_large'
  | 'response_invalid'

export type RecordCapabilityProbeResult =
  | Readonly<{
    kind: 'observed'
    publicationRef: string
    revision: number
    lifecycle: PublicationLifecycle
  }>
  | Readonly<{
    kind: 'refused'
    reason: 'revision_changed' | 'target_changed'
  }>

export async function recordCapabilityProbeResult(
  ports: CapabilityGraphPorts,
  args: Readonly<{
    publicationRef: string
    expectedRevision: number
    targetDigest: string
    outcome: ProbeOutcome
    now?: number
  }>,
): Promise<RecordCapabilityProbeResult> {
  const publication = await ports.loadPublicationAtRevision(
    args.publicationRef,
    args.expectedRevision,
  )
  if (publication === null || publication.disposition !== 'current') {
    return { kind: 'refused' as const, reason: 'revision_changed' as const }
  }
  const [binding, offering, business, contract] = await Promise.all([
    ports.loadBindingByBindingId(publication.bindingId),
    ports.loadOfferingByOfferingId(publication.offeringId),
    ports.loadPublishedBusiness(publication.businessId),
    ports.getActiveExactCapabilityContract(contractRefFromRow(publication)),
  ])
  if (
    binding === null
    || offering === null
    || business === null
    || contract.kind !== 'found'
    || offering.status !== 'active'
    || binding.admission !== 'admitted'
    || binding.conformance !== 'conformant'
    || !offeringIntegrityIsValid(offering)
    || !bindingIntegrityIsValid(binding)
    || probeTargetDigest(publication, offering, binding) !== args.targetDigest
  ) {
    return { kind: 'refused' as const, reason: 'target_changed' as const }
  }
  const now = args.now ?? Date.now()
  const healthy = args.outcome === 'healthy'
  const credentialState = args.outcome === 'credential_unavailable'
    || args.outcome === 'credential_rejected'
    ? 'unavailable' as const
    : 'ready' as const
  const healthState = healthy ? 'healthy' as const : 'unhealthy' as const
  const validUntil = now + (healthy ? 5 * 60_000 : 60_000)
  await ports.patchProbeReadiness(publication.id, {
    credentialState,
    healthState,
    readinessObservedAt: now,
    readinessValidUntil: validUntil,
    readinessEvidenceRefs: [`probe:${args.outcome}`],
    updatedAt: now,
  })
  return {
    kind: 'observed' as const,
    publicationRef: publication.publicationRef,
    revision: publication.revision,
    lifecycle: publicationLifecycle({
      ...publication,
      credentialState,
      healthState,
      readinessObservedAt: now,
      readinessValidUntil: validUntil,
    }, offering, binding, now),
  }
}
