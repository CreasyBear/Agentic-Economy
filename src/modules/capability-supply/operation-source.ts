import { callPublicSourceQuery, sourceQuery } from '@/lib/server/convex-source'

import {
  deserializeOperationCompareResult,
  deserializeOperationDetailResult,
  deserializeOperationSearchResult,
  deserializeInspectPlanResult,
  type CatalogOfferingOperationMapEntry,
  type InspectPlanInput,
  type InspectPlanResult,
  type InspectPlanWireResult,
  type OperationCompareInput,
  type OperationCompareResult,
  type OperationCompareWireResult,
  type OperationDetailInput,
  type OperationDetailResult,
  type OperationDetailWireResult,
  type OperationSearchInput,
  type OperationSearchResult,
  type OperationSearchWireResult,
} from './operation-projection'

const searchQuery = sourceQuery<OperationSearchInput, OperationSearchWireResult>('capabilitySupplyOperations:search')
const detailQuery = sourceQuery<OperationDetailInput, OperationDetailWireResult>('capabilitySupplyOperations:detail')
const compareQuery = sourceQuery<OperationCompareInput, OperationCompareWireResult>('capabilitySupplyOperations:compare')
const inspectPlanQuery = sourceQuery<InspectPlanInput, InspectPlanWireResult>('capabilitySupplyOperations:inspectPlan')
const offeringOperationMapQuery = sourceQuery<{ businessIds: string[] }, CatalogOfferingOperationMapEntry[]>('capabilitySupplyOperations:offeringOperationMap')

export function readCapabilityOperationSearch(input: OperationSearchInput): Promise<OperationSearchResult> {
  return callPublicSourceQuery(searchQuery, input).then(deserializeOperationSearchResult)
}

export function readCapabilityOperationDetail(input: OperationDetailInput): Promise<OperationDetailResult> {
  return callPublicSourceQuery(detailQuery, input).then(deserializeOperationDetailResult)
}

export function readCapabilityOperationCompare(input: OperationCompareInput): Promise<OperationCompareResult> {
  return callPublicSourceQuery(compareQuery, input).then(deserializeOperationCompareResult)
}

export function readCapabilityOperationInspectPlan(input: InspectPlanInput): Promise<InspectPlanResult> {
  return callPublicSourceQuery(inspectPlanQuery, input).then(deserializeInspectPlanResult)
}

/**
 * W1 origin seam: returns, per catalog offering, the single admitted capability
 * operation surface linked via the capability offering's `catalog_offering`
 * origin for the given businesses. Only uniquely-resolved offeringRefs are
 * returned; an offering that maps to zero or multiple operations is omitted so
 * the services surface never fabricates a link.
 */
export function readCatalogOfferingOperationMap(
  businessIds: readonly string[],
): Promise<CatalogOfferingOperationMapEntry[]> {
  return callPublicSourceQuery(offeringOperationMapQuery, { businessIds: [...businessIds] })
}
