import { callPublicSourceQuery, sourceQuery, callPublicSourceAction, sourceAction, type CreatePublicSourceActionOptions } from '@/lib/server/convex-source'

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

const searchAction = sourceAction<ToolSearchInput, ToolSearchWireResult>('capabilityToolCatalog:search')
const detailAction = sourceAction<ToolDetailInput, ToolDetailWireResult>('capabilityToolCatalog:detail')
const compareAction = sourceAction<ToolCompareInput, ToolCompareWireResult>('capabilityToolCatalog:compare')
const offeringToolMapQuery = sourceQuery<{ businessIds: string[] }, CatalogOfferingToolMapEntry[]>('capabilitySupplyTools:offeringToolMap')

export function readCapabilityToolSearch(input: ToolSearchInput, options?: CreatePublicSourceActionOptions): Promise<ToolSearchResult> {
  return callPublicSourceAction(searchAction, input, options).then(deserializeToolSearchResult)
}

export async function readCapabilityToolDetail(input: ToolDetailInput, options?: CreatePublicSourceActionOptions): Promise<ToolDetailResult> {
  options?.signal?.throwIfAborted()
  const result = options === undefined ? await callPublicSourceAction(detailAction, input) : await callPublicSourceAction(detailAction, input, options)
  options?.signal?.throwIfAborted()
  return deserializeToolDetailResult(result)
}

export function readCapabilityToolCompare(input: ToolCompareInput): Promise<ToolCompareResult> {
  return callPublicSourceAction(compareAction, input).then(deserializeToolCompareResult)
}

/**
 * W1 origin seam: returns, per catalog offering, the single admitted capability
 * Tool surface linked via the capability offering's `catalog_offering`
 * origin for the given businesses. Only uniquely-resolved offeringRefs are
 * returned; an offering that maps to zero or multiple Tools is omitted so
 * the services surface never fabricates a link.
 */
export async function readCatalogOfferingToolMap(
  businessIds: readonly string[],
  options?: CreatePublicSourceActionOptions,
): Promise<CatalogOfferingToolMapEntry[]> {
  options?.signal?.throwIfAborted()
  const args = { businessIds: [...businessIds] }
  const result = options === undefined ? await callPublicSourceQuery(offeringToolMapQuery, args) : await callPublicSourceQuery(offeringToolMapQuery, args, options)
  options?.signal?.throwIfAborted()
  return result
}
