import { callPublicSourceQuery, sourceQuery } from '@/lib/server/convex-source'

import {
  deserializeToolCompareResult,
  deserializeToolDetailResult,
  deserializeToolSearchResult,
  type CatalogOfferingToolMapEntry,
  type ToolCompareInput,
  type ToolCompareResult,
  type ToolCompareWireResult,
  type ToolDetailInput,
  type ToolDetailResult,
  type ToolDetailWireResult,
  type ToolSearchInput,
  type ToolSearchResult,
  type ToolSearchWireResult,
} from './tool-projection'

const searchQuery = sourceQuery<ToolSearchInput, ToolSearchWireResult>('capabilitySupplyTools:search')
const detailQuery = sourceQuery<ToolDetailInput, ToolDetailWireResult>('capabilitySupplyTools:detail')
const compareQuery = sourceQuery<ToolCompareInput, ToolCompareWireResult>('capabilitySupplyTools:compare')
const offeringToolMapQuery = sourceQuery<{ businessIds: string[] }, CatalogOfferingToolMapEntry[]>('capabilitySupplyTools:offeringToolMap')

export function readCapabilityToolSearch(input: ToolSearchInput): Promise<ToolSearchResult> {
  return callPublicSourceQuery(searchQuery, input).then(deserializeToolSearchResult)
}

export function readCapabilityToolDetail(input: ToolDetailInput): Promise<ToolDetailResult> {
  return callPublicSourceQuery(detailQuery, input).then(deserializeToolDetailResult)
}

export function readCapabilityToolCompare(input: ToolCompareInput): Promise<ToolCompareResult> {
  return callPublicSourceQuery(compareQuery, input).then(deserializeToolCompareResult)
}

/**
 * W1 origin seam: returns, per catalog offering, the single admitted capability
 * Tool surface linked via the capability offering's `catalog_offering`
 * origin for the given businesses. Only uniquely-resolved offeringRefs are
 * returned; an offering that maps to zero or multiple Tools is omitted so
 * the services surface never fabricates a link.
 */
export function readCatalogOfferingToolMap(
  businessIds: readonly string[],
): Promise<CatalogOfferingToolMapEntry[]> {
  return callPublicSourceQuery(offeringToolMapQuery, { businessIds: [...businessIds] })
}
