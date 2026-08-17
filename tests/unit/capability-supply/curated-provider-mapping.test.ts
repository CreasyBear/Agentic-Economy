import { describe, expect, it } from 'vitest'

import {
  defineCapabilityContract,
  openCapabilityDecisionModel,
  type CapabilityContract,
} from '@/modules/capability-contract/public'
import {
  buildExaSearchContentsMapping,
  createPublicOperationRef,
  createRegisteredOperationMappingRef,
  normalizeCapabilityPublication,
  type CapabilityPublicationImport,
} from '@/modules/capability-supply/public'
import {
  exaContentsPublicationImport,
  exaSearchPublicationImport,
} from '@/modules/dev/public'
import { composeRequestActions } from '@/modules/customer-request/compiler'
import { exactContractRefKey } from '@/modules/customer-request/contract-ref-key'
import type { ProposedRequestAction } from '@/modules/customer-request/evaluation'

async function contractFor(publication: CapabilityPublicationImport): Promise<CapabilityContract> {
  const normalized = await normalizeCapabilityPublication(publication)
  if (normalized.kind !== 'normalized') throw new Error(`publication_refused:${normalized.reason}`)
  return defineCapabilityContract(JSON.parse(normalized.draft.documentJson))
}

describe('curated Exa search to contents mapping', () => {
  it('composes different registered source and target schemas through array projection', async () => {
    const search = openCapabilityDecisionModel(await contractFor(exaSearchPublicationImport))
    const contents = openCapabilityDecisionModel(await contractFor(exaContentsPublicationImport))
    const mapping = buildExaSearchContentsMapping(
      await contractFor(exaSearchPublicationImport),
      await contractFor(exaContentsPublicationImport),
      createRegisteredOperationMappingRef,
    )
    const query = search.inputs.find(({ inputPointer }) => inputPointer === '/query')
    if (query === undefined) throw new Error('exa_search_query_missing')

    const actions: readonly ProposedRequestAction[] = [
      {
        actionId: 'action:exa-search',
        operationRef: createPublicOperationRef({
          operationId: 'capability:exa.search',
          publicationRef: 'publication:exa-search',
          publicationRevision: 1,
          contractRef: search.contractRef,
        }),
        contractRef: search.contractRef,
        selectionKey: search.selectionKey,
        semanticDigest: `sha256:${'0'.repeat(64)}`,
        dependsOn: [],
        inputs: [{
          contractRef: search.contractRef,
          selectionKey: search.selectionKey,
          inputKey: query.key,
          inputPointer: query.inputPointer,
          schemaIdentity: query.schemaIdentity,
          value: 'current EUR to USD ECB reference rate',
          source: { kind: 'customer', assertionRef: 'assertion:query' },
        }],
        mappingRefs: [],
        inputMappings: [],
      },
      {
        actionId: 'action:exa-contents',
        operationRef: createPublicOperationRef({
          operationId: 'capability:exa.contents',
          publicationRef: 'publication:exa-contents',
          publicationRevision: 1,
          contractRef: contents.contractRef,
        }),
        contractRef: contents.contractRef,
        selectionKey: contents.selectionKey,
        semanticDigest: `sha256:${'1'.repeat(64)}`,
        dependsOn: [],
        inputs: [],
        mappingRefs: [],
        inputMappings: [],
      },
    ]
    const models = new Map([
      [exactContractRefKey(search.contractRef), search],
      [exactContractRefKey(contents.contractRef), contents],
    ])

    expect(mapping.sourceSchemaIdentity).not.toBe(mapping.targetSchemaIdentity)
    expect(composeRequestActions(actions, models, [mapping])?.[1]).toMatchObject({
      actionId: 'action:exa-contents',
      dependsOn: ['action:exa-search'],
      mappingRefs: [mapping.mappingRef],
      inputMappings: [{
        kind: 'array_project',
        sourceArrayPointer: '/results',
        sourceItemPointer: '/url',
        targetArrayPointer: '/urls',
        minItems: 1,
        maxItems: 10,
      }],
    })
  })
})
