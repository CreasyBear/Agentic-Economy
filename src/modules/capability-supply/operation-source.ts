import { callPublicSourceQuery, sourceQuery } from '@/lib/server/convex-source'

import {
  compareCapabilityOperations,
  detailCapabilityOperation,
  inspectCapabilityOperationPlan,
  searchCapabilityOperations,
  deserializeOperationCompareResult,
  deserializeOperationDetailResult,
  deserializeOperationSearchResult,
  deserializeInspectPlanResult,
  type CapabilityOperationSourcePort,
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

let sourcePortForTests: CapabilityOperationSourcePort | undefined

export function setCapabilityOperationSourcePortForTests(port: CapabilityOperationSourcePort | undefined): () => void {
  const previous = sourcePortForTests
  sourcePortForTests = port
  return () => { sourcePortForTests = previous }
}

export function readCapabilityOperationSearch(input: OperationSearchInput): Promise<OperationSearchResult> {
  return sourcePortForTests === undefined
    ? callPublicSourceQuery(searchQuery, input).then(deserializeOperationSearchResult)
    : searchCapabilityOperations(sourcePortForTests, input)
}

export function readCapabilityOperationDetail(input: OperationDetailInput): Promise<OperationDetailResult> {
  return sourcePortForTests === undefined
    ? callPublicSourceQuery(detailQuery, input).then(deserializeOperationDetailResult)
    : detailCapabilityOperation(sourcePortForTests, input)
}

export function readCapabilityOperationCompare(input: OperationCompareInput): Promise<OperationCompareResult> {
  return sourcePortForTests === undefined
    ? callPublicSourceQuery(compareQuery, input).then(deserializeOperationCompareResult)
    : compareCapabilityOperations(sourcePortForTests, input)
}

export function readCapabilityOperationInspectPlan(input: InspectPlanInput): Promise<InspectPlanResult> {
  return sourcePortForTests === undefined
    ? callPublicSourceQuery(inspectPlanQuery, input).then(deserializeInspectPlanResult)
    : inspectCapabilityOperationPlan(sourcePortForTests, input)
}
