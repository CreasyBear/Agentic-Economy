import type { CapabilityOfferingOrigin } from '@/modules/capability-supply/public'

import type { GraphCatalogAccessPath } from './ports'

/**
 * One routeability predicate for public catalog projection and direct
 * operation loading. The caller supplies durable readback facts; this helper
 * only accepts an operation when every identity edge is exact and current.
 */
export type CurrentCatalogOperationInput = Readonly<{
  origin: CapabilityOfferingOrigin | undefined
  originCurrent: boolean
  accessPath: GraphCatalogAccessPath | null
  publicationOperationRef: string
  expectedOperationRef: string
  endpointUrl: string
  method: 'GET' | 'POST' | undefined
}>

export type RouteabilityQualityInput = CurrentCatalogOperationInput & Readonly<{
  businessCurrent: boolean
  publicationCurrent: boolean
  contractCurrent: boolean
  offeringCurrent: boolean
  bindingCurrent: boolean
  pricingCurrent: boolean
  lifecycleActive: boolean
}>

export function exactCurrentCatalogOperationIsRouteable(
  input: CurrentCatalogOperationInput,
): boolean {
  const { origin, accessPath } = input
  if (
    !input.originCurrent
    || input.publicationOperationRef !== input.expectedOperationRef
    || origin?.kind !== 'catalog_offering'
    || origin.declaredAccessPathRef === undefined
    || origin.accessPathSourceHash === undefined
    || accessPath === null
    || accessPath.status !== 'published'
    || accessPath.accessPathRef !== origin.declaredAccessPathRef
    || accessPath.offeringRef !== origin.offeringRef
    || accessPath.offeringRevision !== origin.offeringRevision
    || accessPath.offeringSourceHash !== origin.offeringSourceHash
    || accessPath.sourceHash !== origin.accessPathSourceHash
    || accessPath.descriptor.kind !== 'external_operation'
    || accessPath.descriptor.url !== input.endpointUrl
  ) return false

  return input.method !== undefined
    && accessPath.descriptor.method?.trim().toUpperCase() === input.method
}

export function routeabilityQualityGate(input: RouteabilityQualityInput): boolean {
  return input.businessCurrent
    && input.publicationCurrent
    && input.contractCurrent
    && input.offeringCurrent
    && input.bindingCurrent
    && input.pricingCurrent
    && input.lifecycleActive
    && exactCurrentCatalogOperationIsRouteable(input)
}
