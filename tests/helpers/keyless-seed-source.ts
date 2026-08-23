import type {
  KeylessExecutableSourcePort,
  KeylessExecutableToolDescriptor,
  OperationExecutableDescriptor,
} from '../../src/modules/capability-execution'
import {
  isPublicOperationRef,
  rankOperationSearchText,
} from '../../src/modules/capability-supply/public'

/**
 * Product catalog is facilitator-admitted; the retired seed catalog is empty.
 * Tests that need a descriptor construct one locally.
 */
export async function deriveKeylessDescriptors(): Promise<OperationExecutableDescriptor[]> {
  return []
}

export async function seededKeylessSeeds(): Promise<KeylessExecutableToolDescriptor[]> {
  return []
}

export async function seededDescriptorFor(operationRef: string): Promise<OperationExecutableDescriptor | undefined> {
  void operationRef
  return undefined
}

export const seedKeylessExecutableSource: KeylessExecutableSourcePort = {
  list: seededKeylessSeeds,
  read: async (operationRef) => isPublicOperationRef(operationRef)
    ? await seededDescriptorFor(operationRef) ?? null
    : null,
  search: async (query, descriptors) => rankOperationSearchText(
    query,
    descriptors.map((descriptor) => ({
      value: descriptor.operationRef,
      operationRef: descriptor.operationRef,
      searchText: [descriptor.capabilityId, descriptor.name, descriptor.summary, ...descriptor.searchTerms],
    })),
  ),
}
