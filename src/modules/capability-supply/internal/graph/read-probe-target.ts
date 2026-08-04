import { bindingIntegrityIsValid } from '../binding'
import { readHttpJsonProbeConfiguration } from '../transport-adapters'
import { contractRefFromRow, offeringIntegrityIsValid } from '../offering'

import type { CapabilityGraphPorts } from './ports'
import { probeTargetDigest } from './probe-digest'

export type CapabilityProbeTarget = Readonly<{
  publicationRef: string
  revision: number
  bindingId: string
  capabilityId: string
  endpointUrl: string
  credentialRef: string
  adapterId: string
  probeKind: 'ae_quote' | 'openapi_http' | 'mcp' | 'x402'
  probeQuery: Array<{ parameter: string; value: string }>
  probeMethod: 'GET' | 'HEAD'
  targetDigest: string
}>

export type ReadCapabilityProbeTargetResult =
  | Readonly<{ kind: 'unavailable' }>
  | Readonly<{ kind: 'available'; target: CapabilityProbeTarget }>

export async function readCapabilityProbeTarget(
  ports: CapabilityGraphPorts,
  args: Readonly<{ publicationRef: string; expectedRevision: number }>,
): Promise<ReadCapabilityProbeTargetResult> {
  const publication = await ports.loadPublicationAtRevision(
    args.publicationRef,
    args.expectedRevision,
  )
  if (publication === null || publication.disposition !== 'current') {
    return { kind: 'unavailable' as const }
  }
  const [offering, binding, business, contract] = await Promise.all([
    ports.loadOfferingByOfferingId(publication.offeringId),
    ports.loadBindingByBindingId(publication.bindingId),
    ports.loadPublishedBusiness(publication.businessId),
    ports.getActiveExactCapabilityContract(contractRefFromRow(publication)),
  ])
  if (
    offering === null
    || binding === null
    || business === null
    || contract.kind !== 'found'
    || offering.status !== 'active'
    || binding.admission !== 'admitted'
    || binding.conformance !== 'conformant'
    || !offeringIntegrityIsValid(offering)
    || !bindingIntegrityIsValid(binding)
    || offering.offeringId !== publication.offeringId
    || binding.offeringId !== offering.offeringId
  ) {
    return { kind: 'unavailable' as const }
  }
  const probeConfiguration = readHttpJsonProbeConfiguration(binding.adapterId, binding.configJson)
  return {
    kind: 'available' as const,
    target: {
      publicationRef: publication.publicationRef,
      revision: publication.revision,
      bindingId: binding.bindingId,
      capabilityId: publication.capabilityId,
      endpointUrl: binding.endpointUrl,
      credentialRef: binding.credentialRef,
      adapterId: binding.adapterId,
      probeKind: publication.sourceKind === 'mcp' ? 'mcp' as const
        : publication.sourceKind === 'openapi_http' ? 'openapi_http' as const
        : publication.sourceKind === 'x402' ? 'x402' as const
        : 'ae_quote' as const,
      probeQuery: [...probeConfiguration.fixedQuery],
      probeMethod: probeConfiguration.method,
      targetDigest: probeTargetDigest(publication, offering, binding),
    },
  }
}
