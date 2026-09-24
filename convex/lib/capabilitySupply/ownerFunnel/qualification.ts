import { publicationLifecycle, qualifySuppliedCandidate } from '@/modules/capability-supply/public'
import { capabilitySupplyGraphPorts } from '../graphPorts/ports'
import type { QueryCtx } from '../../../_generated/server'
import type { Doc } from '../../../_generated/dataModel'

export async function qualifyOwnerSupplyOffering(
  db: QueryCtx['db'],
  input: Readonly<{
    publication: Doc<'capabilityPublications'> | undefined
    binding: Doc<'capabilityTransportBindings'> | undefined
    capabilityOffering: Doc<'capabilityOfferings'> | undefined
    businessId: string
    now: number
  }>,
) {
  const { publication, binding, capabilityOffering, businessId, now } = input
  if (
    publication === undefined
    || binding === undefined
    || capabilityOffering === undefined
  ) return undefined
  return qualifySuppliedCandidate(capabilitySupplyGraphPorts(db), {
    candidate: {
      publicationRef: publication.publicationRef,
      revision: publication.revision,
      networkId: publication.networkId,
      businessId,
      offeringId: capabilityOffering.offeringId,
      bindingId: binding.bindingId,
      contractRef: {
        capabilityId: binding.capabilityId,
        version: binding.version,
        contractDigest: binding.contractDigest,
      },
    },
    now,
  })
}

export function ownerSupplyLifecycle(
  input: Readonly<{
    publication: Doc<'capabilityPublications'> | undefined
    binding: Doc<'capabilityTransportBindings'> | undefined
    capabilityOffering: Doc<'capabilityOfferings'> | undefined
    currentConnection: Doc<'capabilityProviderConnections'> | null | undefined
    now: number
  }>,
) {
  const { publication, binding, capabilityOffering, currentConnection, now } = input
  if (
    publication === undefined
    || binding === undefined
    || capabilityOffering === undefined
  ) return undefined
  return publicationLifecycle(
    publication,
    capabilityOffering,
    binding,
    now,
    currentConnection,
  )
}
