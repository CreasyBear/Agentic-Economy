import { sameCapabilityContractRef } from '@/modules/capability-contract/public'

import { bindingIntegrityIsValid } from '../binding'
import { contractRefFromRow, offeringIntegrityIsValid } from '../offering'
import { publicationLifecycle } from '../publication'

import { bindingEligibilityIsValid, offeringEligibilityIsValid } from './integrity'
import {
  compareStableIdentifier,
  eligibleBindingProjection,
  eligibleOfferingProjection,
} from './projection'
import type { EligibleSupplyPorts } from './ports'

export const MAX_ELIGIBLE_SUPPLY = 256

export async function listIntegratedCapabilitySupply(
  ports: EligibleSupplyPorts,
  input: Readonly<{ networkId: string; limit: number; now?: number }>,
) {
  if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > MAX_ELIGIBLE_SUPPLY) {
    return { kind: 'unavailable' as const, reason: 'limit_invalid' as const }
  }
  const bindings = await ports.listAdmittedConformantBindingsByNetwork(
    input.networkId, input.limit + 1,
  )
  if (bindings.length > input.limit) {
    return { kind: 'unavailable' as const, reason: 'eligible_supply_limit_exceeded' as const }
  }
  const supplies: Array<{
    offering: ReturnType<typeof eligibleOfferingProjection>
    binding: ReturnType<typeof eligibleBindingProjection>
    publication?: Readonly<{ publicationRef: string; revision: number; readinessValidUntil: number }>
  }> = []
  const now = input.now ?? Date.now()
  for (const binding of bindings) {
    if (!bindingIntegrityIsValid(binding) || !bindingEligibilityIsValid(binding)) {
      return { kind: 'unavailable' as const, reason: 'supply_integrity_failure' as const }
    }
    const offering = await ports.loadOfferingByOfferingId(binding.offeringId)
    if (offering === null || offering.status !== 'active') continue
    if (!offeringIntegrityIsValid(offering) || !offeringEligibilityIsValid(offering)) {
      return { kind: 'unavailable' as const, reason: 'supply_integrity_failure' as const }
    }
    if (
      offering.networkId !== binding.networkId
      || !sameCapabilityContractRef(contractRefFromRow(offering), contractRefFromRow(binding))
    ) continue
    if (await ports.loadPublishedBusiness(offering.businessId) === null) continue
    const catalogOriginCurrent = offering.origin?.kind !== 'catalog_offering'
      || await ports.catalogOriginIsCurrent(offering.origin, offering.businessId)
    const contract = await ports.getActiveExactCapabilityContract(contractRefFromRow(binding))
    if (contract.kind === 'unavailable') {
      if (contract.reason === 'integrity_failure') {
        return { kind: 'unavailable' as const, reason: 'contract_integrity_failure' as const }
      }
      continue
    }
    const publication = await ports.loadCurrentPublicationByBindingId(binding.bindingId)
    const activePublication = catalogOriginCurrent && publication !== null
      && publication.readinessValidUntil !== undefined
      && publicationLifecycle(publication, offering, binding, now).state === 'active'
      ? {
          publicationRef: publication.publicationRef, revision: publication.revision,
          readinessValidUntil: publication.readinessValidUntil,
        }
      : undefined
    supplies.push({
      offering: eligibleOfferingProjection(offering), binding: eligibleBindingProjection(binding),
      ...(activePublication === undefined ? {} : { publication: activePublication }),
    })
  }
  supplies.sort((left, right) => (
    compareStableIdentifier(left.offering.offeringId, right.offering.offeringId)
    || compareStableIdentifier(left.binding.bindingId, right.binding.bindingId)
  ))
  return { kind: 'available' as const, supplies }
}

/**
 * Compatibility name for the pre-reconciliation integrated inventory.
 * New execution callers must use listRouteableCapabilitySupply.
 */
export const listEligibleCapabilitySupply = listIntegratedCapabilitySupply

export async function listRouteableCapabilitySupply(
  ports: EligibleSupplyPorts,
  input: Readonly<{ networkId: string; limit: number; now?: number }>,
) {
  if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > MAX_ELIGIBLE_SUPPLY) {
    return { kind: 'unavailable' as const, reason: 'limit_invalid' as const }
  }
  const integrated = await listIntegratedCapabilitySupply(ports, {
    ...input,
    limit: MAX_ELIGIBLE_SUPPLY,
  })
  if (integrated.kind === 'unavailable') return integrated
  return {
    kind: 'available' as const,
    supplies: integrated.supplies.filter((supply) => supply.publication !== undefined).slice(0, input.limit).map((supply) => ({
      ...supply,
      publication: supply.publication!,
    })),
  }
}
