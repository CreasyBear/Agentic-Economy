import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'

import { api, internal } from '../../convex/_generated/api'
import schema from '../../convex/schema'
import { convexModules as modules } from '../helpers/convex-fixtures'

describe('curated provider operation registry', () => {
  it('seeds, discovers, and inspects the exact Exa to Frankfurter scenario without authority', async () => {
    const backend = convexTest(schema, modules)
    const seeded = await backend.mutation(internal.curatedProviders.seed, {})
    expect(await backend.mutation(internal.curatedProviders.retireLegacyExaV1, {})).toEqual([
      { publicationRef: 'offering:agentic-market-exa:search:v1', status: 'already_retired' },
      { publicationRef: 'offering:agentic-market-exa:contents:v1', status: 'already_retired' },
    ])

    for (const publication of seeded.publications) {
      const observed = await backend.mutation(internal.capabilitySupply.observeCapabilityReadiness, {
        publicationRef: publication.publicationRef,
        expectedRevision: 1,
        credentialState: 'ready',
        healthState: 'healthy',
        validUntil: Date.now() + 300_000,
        operationKey: `test:curated-readiness:${publication.publicationRef}`,
        correlationId: 'test:curated-provider-registry',
        reasonCode: 'test_live_readiness_projection',
        evidenceRefs: ['test:curated-provider-readiness'],
      })
      expect(observed).toMatchObject({ kind: 'observed' })
    }

    const exa = await backend.query(api.capabilitySupplyOperations.search, {
      query: 'Research the latest official guidance on AI agent payments and summarize the sources',
      limit: 10,
    })
    const frankfurter = await backend.query(api.capabilitySupplyOperations.search, {
      query: 'Frankfurter ECB rate',
      limit: 10,
    })
    expect(exa).toMatchObject({ kind: 'ok', items: expect.arrayContaining([
      expect.objectContaining({ contract: expect.objectContaining({ capabilityId: 'exa.search' }) }),
      expect.objectContaining({ contract: expect.objectContaining({ capabilityId: 'exa.contents' }) }),
    ]) })
    if (exa.kind !== 'ok') throw new Error('curated_exa_search_failed')
    expect(exa.items.map(({ contract }) => contract.capabilityId).sort()).toEqual(['exa.contents', 'exa.search'])
    expect(frankfurter).toMatchObject({ kind: 'ok', items: [
      expect.objectContaining({ contract: expect.objectContaining({ capabilityId: 'frankfurter.single-rate' }) }),
    ] })

    if (exa.kind !== 'ok' || frankfurter.kind !== 'ok') throw new Error('curated_operation_search_failed')
    const searchOperationRef = exa.items.find(({ contract }) => contract.capabilityId === 'exa.search')?.operationRef
    const contentsOperationRef = exa.items.find(({ contract }) => contract.capabilityId === 'exa.contents')?.operationRef
    const rateOperationRef = frankfurter.items.find(({ contract }) => contract.capabilityId === 'frankfurter.single-rate')?.operationRef
    if (searchOperationRef === undefined || contentsOperationRef === undefined || rateOperationRef === undefined) {
      throw new Error('curated_operation_ref_missing')
    }
    const operationRefs = [searchOperationRef, contentsOperationRef, rateOperationRef]

    const inspected = await backend.query(api.capabilitySupplyOperations.inspectPlan, {
      operationRefs,
      mappingRefs: [seeded.mappingRef],
      expiresInMs: 300_000,
    })
    expect(inspected).toMatchObject({
      kind: 'ok',
      operationRefs,
      mappingRefs: [seeded.mappingRef],
      summary: {
        maximumCost: { kind: 'known', currency: 'USD', amountMinor: 2 },
        effects: expect.arrayContaining([
          expect.objectContaining({ class: 'data_release' }),
          expect.objectContaining({ class: 'financial_exposure' }),
        ]),
      },
    })
  })
})
