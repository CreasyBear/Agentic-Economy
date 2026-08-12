import { isCanonicalDigest } from '@/modules/common/canonical-digest'
import { bindingIntegrityIsValid } from '../binding/integrity'
import {
  connectionAuthoritySnapshotMatches,
  connectionAuthoritySnapshotsEqual,
} from '../binding'
import { offeringIntegrityIsValid } from '../offering/integrity'
import { contractRefFromRow } from '../offering/registration'
import {
  publicationLifecycle,
  type CapabilityReadinessOutcome,
  type PublicationLifecycle,
} from '../publication/lifecycle'
import { validEvidenceRefs } from '../shared/command-envelope'

import type { CapabilityGraphPorts } from './ports'
import { probeTargetDigest } from './probe-digest'

export type ProbeOutcome = CapabilityReadinessOutcome

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
    requestDigest: string
    responseStatus?: number
    responseContentType?: string
    responseDigest?: string
    outcome: ProbeOutcome
    credentialState: 'ready' | 'unavailable'
    healthState: 'healthy' | 'unhealthy'
    observedAt: number
    validUntil: number
    evidenceRefs: readonly string[]
    now?: number
  }>,
): Promise<RecordCapabilityProbeResult> {
  const publication = await ports.loadPublicationAtRevision(args.publicationRef, args.expectedRevision)
  if (publication === null || publication.disposition !== 'current') {
    return { kind: 'refused', reason: 'revision_changed' }
  }
  const [binding, offering, business, contract] = await Promise.all([
    ports.loadBindingByBindingId(publication.bindingId),
    ports.loadOfferingByOfferingId(publication.offeringId),
    ports.loadPublishedBusiness(publication.businessId),
    ports.getActiveExactCapabilityContract(contractRefFromRow(publication)),
  ])
  const currentConnection = binding?.authority.kind === 'provider_connection'
    ? await ports.loadProviderConnection(binding.authority.connectionRef)
    : undefined
  const now = args.now ?? Date.now()
  const expectedHealthState = args.outcome === 'healthy' ? 'healthy' : 'unhealthy'
  const expectedCredentialState = args.outcome === 'credential_unavailable' || args.outcome === 'credential_rejected' ? 'unavailable' : 'ready'
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
    || args.healthState !== expectedHealthState
    || args.credentialState !== expectedCredentialState
    || !validEvidenceRefs(args.evidenceRefs)
    || (binding.authority.kind === 'provider_connection' && (
      !connectionAuthoritySnapshotMatches(binding.connectionAuthority, currentConnection, {
        businessId: String(offering.businessId),
        operationRef: publication.operationRef,
        adapterId: binding.adapterId,
        now,
      })
      || !connectionAuthoritySnapshotsEqual(publication.connectionAuthority, binding.connectionAuthority)
    ))
    || probeTargetDigest(publication, offering, binding) !== args.targetDigest
    || !isCanonicalDigest(args.targetDigest)
    || !isCanonicalDigest(args.requestDigest)
    || !Number.isSafeInteger(args.observedAt)
    || args.observedAt > now + 60_000
    || !Number.isSafeInteger(args.validUntil)
    || args.validUntil <= args.observedAt
    || args.validUntil > args.observedAt + 24 * 60 * 60_000
    || (args.responseStatus !== undefined
      && (!Number.isSafeInteger(args.responseStatus) || args.responseStatus < 100 || args.responseStatus > 599))
    || (args.responseContentType !== undefined && args.responseContentType.length > 200)
    || (args.responseDigest !== undefined && !isCanonicalDigest(args.responseDigest))
  ) {
    return { kind: 'refused', reason: 'target_changed' }
  }
  await ports.patchProbeReadiness(publication.id, {
    credentialState: args.credentialState,
    healthState: args.healthState,
    ...(binding.connectionAuthority === undefined
      ? {}
      : { connectionAuthority: binding.connectionAuthority }),
    readinessTargetDigest: args.targetDigest,
    readinessRequestDigest: args.requestDigest,
    ...(args.responseStatus === undefined ? {} : { readinessResponseStatus: args.responseStatus }),
    ...(args.responseContentType === undefined ? {} : { readinessResponseContentType: args.responseContentType }),
    ...(args.responseDigest === undefined ? {} : { readinessResponseDigest: args.responseDigest }),
    readinessOutcome: args.outcome,
    readinessObservedAt: args.observedAt,
    readinessValidUntil: args.validUntil,
    readinessEvidenceRefs: [...args.evidenceRefs],
    updatedAt: now,
  })
  const updated = {
    ...publication,
    credentialState: args.credentialState,
    healthState: args.healthState,
    readinessTargetDigest: args.targetDigest,
    readinessRequestDigest: args.requestDigest,
    ...(args.responseStatus === undefined ? {} : { readinessResponseStatus: args.responseStatus }),
    ...(args.responseContentType === undefined ? {} : { readinessResponseContentType: args.responseContentType }),
    ...(args.responseDigest === undefined ? {} : { readinessResponseDigest: args.responseDigest }),
    readinessOutcome: args.outcome,
    readinessObservedAt: args.observedAt,
    readinessValidUntil: args.validUntil,
  }
  return {
    kind: 'observed',
    publicationRef: publication.publicationRef,
    revision: publication.revision,
    lifecycle: publicationLifecycle(updated, offering, binding, now, currentConnection),
  }
}
