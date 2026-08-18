import { describe, expect, it } from 'vitest'

import {
  defineCapabilityContract,
  openCapabilityDecisionModel,
  type CapabilityContract,
} from '@/modules/capability-contract/public'
import {
  buildExaSearchContentsMapping,
  createRegisteredOperationMappingRef,
  normalizeCapabilityPublication,
  type CapabilityPublicationImport,
} from '@/modules/capability-supply/public'
import {
  exaContentsPublicationImport,
  exaSearchPublicationImport,
} from '@/modules/dev/public'

async function contractFor(publication: CapabilityPublicationImport): Promise<CapabilityContract> {
  const normalized = await normalizeCapabilityPublication(publication)
  if (normalized.kind !== 'normalized') throw new Error(`publication_refused:${normalized.reason}`)
  return defineCapabilityContract(JSON.parse(normalized.draft.documentJson))
}

describe('curated Exa search to contents mapping', () => {
  it('registers different source and target schemas through array projection', async () => {
    const search = openCapabilityDecisionModel(await contractFor(exaSearchPublicationImport))
    const contents = openCapabilityDecisionModel(await contractFor(exaContentsPublicationImport))
    const mapping = buildExaSearchContentsMapping(
      await contractFor(exaSearchPublicationImport),
      await contractFor(exaContentsPublicationImport),
      createRegisteredOperationMappingRef,
    )
    const query = search.inputs.find(({ inputPointer }) => inputPointer === '/query')
    if (query === undefined) throw new Error('exa_search_query_missing')
    expect(contents.inputs.length).toBeGreaterThan(0)
    expect(mapping.sourceSchemaIdentity).not.toBe(mapping.targetSchemaIdentity)
    expect(mapping).toMatchObject({
      kind: 'array_project',
      sourceArrayPointer: '/results',
      sourceItemPointer: '/url',
      targetArrayPointer: '/urls',
      minItems: 1,
      maxItems: 10,
    })
  })
})
