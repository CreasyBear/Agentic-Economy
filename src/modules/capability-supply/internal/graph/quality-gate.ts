import type { CapabilityOfferingOrigin } from '@/modules/capability-supply/public'

import type { GraphCatalogAccessPath } from './ports'

/**
 * One routeability predicate for public catalog projection and direct
 * Tool loading. The caller supplies durable readback facts; this helper only
 * accepts a Tool when every identity edge is exact and current.
 */
export type CurrentCatalogToolInput = Readonly<{
  origin: CapabilityOfferingOrigin | undefined
  originCurrent: boolean
  accessPath: GraphCatalogAccessPath | null
  publicationToolRef: string
  expectedToolRef: string
  endpointUrl: string
  method: 'GET' | 'POST' | undefined
}>

export type RouteabilityQualityInput = CurrentCatalogToolInput & Readonly<{
  catalogToolCurrent: boolean
  businessCurrent: boolean
  publicationCurrent: boolean
  sellerCanaryAdmissionCurrent?: boolean
  contractCurrent: boolean
  offeringCurrent: boolean
  bindingCurrent: boolean
  pricingCurrent: boolean
  lifecycleActive: boolean
}>

export function exactCurrentCatalogToolIsRouteable(
  input: CurrentCatalogToolInput,
): boolean {
  const { origin, accessPath } = input
  if (
    !input.originCurrent
    || input.publicationToolRef !== input.expectedToolRef
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
    && input.sellerCanaryAdmissionCurrent !== false
    && input.contractCurrent
    && input.offeringCurrent
    && input.bindingCurrent
    && input.pricingCurrent
    && input.lifecycleActive
    && input.catalogToolCurrent
}
