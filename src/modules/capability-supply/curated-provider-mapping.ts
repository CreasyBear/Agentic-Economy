import {
  openCapabilityDecisionModel,
  type CapabilityContract,
} from '@/modules/capability-contract/public'

import type {
  RegisteredOperationMapping,
  RegisteredOperationMappingRef,
} from './public'

type ArrayProjectMapping = Extract<RegisteredOperationMapping, Readonly<{ kind: 'array_project' }>>
type ArrayProjectMappingMaterial = Omit<ArrayProjectMapping, 'mappingRef'>
type MappingRefFactory = (mapping: ArrayProjectMappingMaterial) => RegisteredOperationMappingRef

const WEB_URLS_SEMANTIC_IDENTITY = 'ae.public-web-urls:v1'

export function buildExaSearchContentsMapping(
  searchContract: CapabilityContract,
  contentsContract: CapabilityContract,
  createMappingRef: MappingRefFactory,
): ArrayProjectMapping {
  if (searchContract.ref.capabilityId !== 'exa.search' || contentsContract.ref.capabilityId !== 'exa.contents') {
    throw new Error('curated_exa_mapping_contract_mismatch')
  }

  const searchModel = openCapabilityDecisionModel(searchContract)
  const contentsModel = openCapabilityDecisionModel(contentsContract)
  const source = searchModel.evidence.find((candidate) => (
    candidate.outputPointer === '/results'
    && candidate.semanticIdentity === WEB_URLS_SEMANTIC_IDENTITY
  ))
  const target = contentsModel.inputs.find((candidate) => (
    candidate.inputPointer === '/urls'
    && candidate.semanticIdentity === WEB_URLS_SEMANTIC_IDENTITY
  ))
  if (source === undefined || target === undefined) {
    throw new Error('curated_exa_mapping_semantics_missing')
  }

  const material = {
    kind: 'array_project',
    sourceContractRef: searchModel.contractRef,
    targetContractRef: contentsModel.contractRef,
    sourceSchemaIdentity: source.schemaIdentity,
    targetSchemaIdentity: target.schemaIdentity,
    authority: 'registered_contract_semantics',
    sourceArrayPointer: '/results',
    sourceItemPointer: '/url',
    targetArrayPointer: '/urls',
    minItems: 1,
    maxItems: 10,
  } as const satisfies ArrayProjectMappingMaterial

  return Object.freeze({ ...material, mappingRef: createMappingRef(material) })
}
