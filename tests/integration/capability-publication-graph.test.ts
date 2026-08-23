import { describe, expect, it } from 'vitest'

import { api, internal } from '../../convex/_generated/api'
import {
  convexTestWithMarketComponents,
  ownerAdmin,
  publishedBusinessOwner,
} from '../helpers/convex-fixtures'
import {
  admitPublication,
  capabilityPublicationInput,
  operationContext,
  preparedPublicationArgs,
  registerProviderConnection,
  seedCatalogOffering,
} from './capability-publication-harness'

describe('capability publication graph', () => {
  it('projects two independent publications through one generic graph path', async () => {
    const backend = convexTestWithMarketComponents()
    const first = await publishedBusinessOwner(backend, 'graph-one')
    const second = await publishedBusinessOwner(backend, 'graph-two')
    await seedCatalogOffering(backend, first.businessId, 'graph-one')
    await seedCatalogOffering(backend, second.businessId, 'graph-two')
    const observer = await ownerAdmin(
      backend,
      'user_capability_publication_observer',
    )
    await registerProviderConnection(backend, first.businessId, 'graph-one')
    await registerProviderConnection(backend, second.businessId, 'graph-two')
    const firstPublished = await first.owner.mutation(
      api.capabilitySupply.publishPreparedCapability,
      await preparedPublicationArgs(
        backend,
        capabilityPublicationInput(first.businessId, 'graph-one'),
      ),
    )
    const secondPublished = await second.owner.mutation(
      api.capabilitySupply.publishPreparedCapability,
      await preparedPublicationArgs(
        backend,
        capabilityPublicationInput(second.businessId, 'graph-two'),
      ),
    )
    if ('reason' in firstPublished)
      throw new Error('independent_publication_refused')
    if ('reason' in secondPublished)
      throw new Error('independent_publication_refused')

    await admitPublication(backend, firstPublished, 'graph-one')
    await admitPublication(backend, secondPublished, 'graph-two')
    for (const published of [firstPublished, secondPublished]) {
      await backend.mutation(
        internal.capabilitySupply.observeCapabilityReadiness,
        {
          publicationRef: published.publicationRef,
          expectedRevision: published.publicationRevision,
          credentialState: 'ready',
          healthState: 'healthy',
          validUntil: Date.now() + 60_000,
          ...operationContext(`observe-${published.publicationRef}`),
        },
      )
    }
    const graph = await first.owner.query(
      api.capabilitySupply.queryCapabilityGraph,
      {
        networkId: 'ae:public',
        includeInactive: false,
        limit: 10,
      },
    )
    expect(graph).toMatchObject({
      kind: 'available',
      nodes: expect.arrayContaining([
        expect.objectContaining({
          publicationRef: firstPublished.publicationRef,
          businessId: first.businessId,
          trust: expect.objectContaining({
            publicStatus: 'published',
            suppressed: false,
            currentlyPublished: true,
          }),
        }),
        expect.objectContaining({
          publicationRef: secondPublished.publicationRef,
          businessId: second.businessId,
          trust: expect.objectContaining({
            publicStatus: 'published',
            suppressed: false,
            currentlyPublished: true,
          }),
        }),
      ]),
    })
    if (graph.kind !== 'available')
      throw new Error(`capability_graph_unavailable:${graph.reason}`)
    expect(graph.nodes).toHaveLength(2)
    expect(JSON.stringify(graph)).not.toContain('credentialRef')
    expect(JSON.stringify(graph)).not.toContain('_KEY')
  })
})
