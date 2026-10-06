import { describe, expect, it } from 'vitest'

import { api, internal } from '../../convex/_generated/api'
import { eligibleSupplyPorts } from '../../convex/capabilitySupplyEligiblePorts'
import { capabilitySupplyGraphPorts } from '../../convex/lib/capabilitySupply/graphPorts/ports'
import { capabilityContractV2, objectSchema } from '../fixtures/capability-contract-v2'
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
    await ownerAdmin(
      backend,
      'user_capability_publication_observer',
    )
    await registerProviderConnection(backend, first.businessId, 'graph-one')
    await registerProviderConnection(backend, second.businessId, 'graph-two')
    const firstInput = capabilityPublicationInput(first.businessId, 'graph-one')
    const secondInput = capabilityPublicationInput(second.businessId, 'graph-two')
    const sharedSchema = objectSchema({ request: { type: 'string', minLength: 1 } }, ['request'])
    for (const [input, suffix] of [[firstInput, 'graph-one'], [secondInput, 'graph-two']] as const) {
      input.source.documentJson = JSON.stringify(capabilityContractV2({
        capabilityId: `independent.${suffix}.lookup`, name: `${suffix} lookup`,
        inputSchema: sharedSchema, outputSchema: sharedSchema,
        customerAnnotations: [
          { annotationId: 'request', document: 'input', pointer: '/request', label: 'Request', role: 'request' },
          { annotationId: 'result', document: 'output', pointer: '/request', label: 'Result', role: 'completion_evidence' },
        ],
        evidence: [{ evidenceId: 'result', outputPointer: '/request', purpose: 'completion' }],
      }))
    }
    const firstPublished = await first.owner.mutation(
      api.capabilitySupply.publishPreparedCapability,
      await preparedPublicationArgs(
        backend,
        firstInput,
      ),
    )
    const secondPublished = await second.owner.mutation(
      api.capabilitySupply.publishPreparedCapability,
      await preparedPublicationArgs(
        backend,
        secondInput,
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
    expect(graph.nodes.every(node => node.admittedToolRef?.startsWith('operation:v1:'))).toBe(true)
    expect(graph.edges.filter(edge => edge.kind === 'schema_compatible')).toEqual([
      { kind: 'schema_compatible', from: firstPublished.publicationRef, to: secondPublished.publicationRef,
        inputMappings: [{ inputKey: 'request', outputPointer: '/request' }] },
      { kind: 'schema_compatible', from: secondPublished.publicationRef, to: firstPublished.publicationRef,
        inputMappings: [{ inputKey: 'request', outputPointer: '/request' }] },
    ])
    expect(JSON.stringify(graph)).not.toContain('credentialRef')
    expect(JSON.stringify(graph)).not.toContain('_KEY')
  })

  it('refuses a catalog access path belonging to another business on both supply reads', async () => {
    const backend = convexTestWithMarketComponents()
    const first = await publishedBusinessOwner(backend, 'graph-origin-first')
    const second = await publishedBusinessOwner(backend, 'graph-origin-second')
    await seedCatalogOffering(backend, first.businessId, 'graph-origin-first')
    await backend.run(async (ctx) => {
      const path = await ctx.db.query('offeringAccessPaths')
        .withIndex('by_accessPathRef', (query) => query.eq('accessPathRef', 'access:graph-origin-first:lookup'))
        .unique()
      if (path === null) throw new Error('catalog_access_path_fixture_missing')
      const origin = {
        kind: 'catalog_offering' as const,
        offeringRef: path.offeringRef,
        offeringRevision: path.offeringRevision,
        offeringSourceHash: path.offeringSourceHash,
        declaredAccessPathRef: path.accessPathRef,
        accessPathSourceHash: path.sourceHash,
      }
      expect(await eligibleSupplyPorts(ctx.db).catalogOriginIsCurrent(origin, String(first.businessId))).toBe(true)
      await ctx.db.patch(path._id, { businessId: second.businessId })
      expect(await capabilitySupplyGraphPorts(ctx.db).catalogOriginIsCurrent?.(origin, String(first.businessId))).toBe(false)
      expect(await eligibleSupplyPorts(ctx.db).catalogOriginIsCurrent(origin, String(first.businessId))).toBe(false)
    })
  })
})
