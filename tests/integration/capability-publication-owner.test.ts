import { describe, expect, it } from 'vitest'

import { api, internal } from '../../convex/_generated/api'
import { OPERATION_INVOKE_ROUTE_CONTRACT } from '@/modules/capability-execution/operation-invoke-entry'
import {
  convexTestWithMarketComponents,
  ownerAdmin,
  publishedBusinessOwner,
} from '../helpers/convex-fixtures'
import { withSourceWrite } from '../helpers/source-write-admission'
import {
  admitPublication,
  capabilityPublicationInput,
  installCanonicalProviderConnectionFixture,
  operationContext,
  ownerMaintenanceArgs,
  preparedPublicationArgs,
  providerAuthority,
  seedCatalogOffering,
} from './capability-publication-harness'

async function installCurrentProviderConnection(
  backend: ReturnType<typeof convexTestWithMarketComponents>,
  businessId: Parameters<typeof installCanonicalProviderConnectionFixture>[1]['businessId'],
  suffix: string,
) {
  const authority = providerAuthority(suffix)
  const result = await installCanonicalProviderConnectionFixture(backend, {
    businessId,
    ...authority,
    providerAccountRef: `account:capability-publication:${suffix}`,
    adapterId: 'http-json:v1',
    secretRef: null,
    scopes: [`capability:capability-publication:${suffix}`],
    resources: [`resource:capability-publication:${suffix}`],
    evidenceRefs: [`test:provider-connection:${suffix}`],
    commandId: `command:create:capability-publication:${suffix}`,
  })
  if (result.kind !== 'applied') {
    throw new Error(`provider_connection_fixture_${result.kind}`)
  }
  return result.connection
}

describe('capability publication owner', () => {
  it('preserves canonical owner catalog and editor reads', async () => {
    const backend = convexTestWithMarketComponents()
    const { businessId, owner } = await publishedBusinessOwner(
      backend,
      'canonical-owner-reads',
    )
    await seedCatalogOffering(backend, businessId, 'canonical-owner-reads')

    await expect(
      owner.query(api.catalog.getCurrentOwnerPublicCatalog, {}),
    ).resolves.toMatchObject({ kind: 'available' })
    await expect(
      owner.query(api.catalog.getCurrentOwnerOfferingSupply, {}),
    ).resolves.not.toMatchObject({ kind: 'error', code: 'unauthenticated' })
  })

  it('fails closed across readiness, stale health, and withdrawal transitions', async () => {
    const backend = convexTestWithMarketComponents()
    const { businessId, owner } = await publishedBusinessOwner(
      backend,
      'lifecycle-one',
    )
    await seedCatalogOffering(backend, businessId, 'lifecycle-one')
    await ownerAdmin(
      backend,
      'user_capability_publication_observer',
    )
    const input = capabilityPublicationInput(businessId, 'lifecycle-one')
    await installCurrentProviderConnection(backend, businessId, 'lifecycle-one')
    const published = await owner.mutation(
      api.capabilitySupply.publishPreparedCapability,
      await preparedPublicationArgs(backend, input),
    )
    if ('reason' in published)
      throw new Error(`publication_refused:${published.reason}`)
    const observed = await backend.mutation(
      internal.capabilitySupply.observeCapabilityReadiness,
      {
        publicationRef: published.publicationRef,
        expectedRevision: published.publicationRevision,
        credentialState: 'ready',
        healthState: 'healthy',
        validUntil: Date.now() + 60_000,
        ...operationContext('observe-ready'),
      },
    )
    expect(observed).toMatchObject({
      kind: 'observed',
      lifecycle: { state: 'inactive' },
    })

    await admitPublication(backend, published, 'lifecycle-one')
    await expect(
      owner.query(api.capabilitySupply.readCapabilityPublication, {
        publicationRef: published.publicationRef,
      }),
    ).resolves.toMatchObject({ lifecycle: { state: 'active', reasons: [] } })
    const operationDetail = await owner.query(
      api.capabilitySupplyOperations.detail,
      {
        operationRef: published.operationRef,
      },
    )
    expect(operationDetail.kind).toBe('found')
    if (operationDetail.kind !== 'found')
      throw new Error(`operation_detail_unavailable:${operationDetail.kind}`)
    expect(operationDetail.operation).toMatchObject({
      callVia: OPERATION_INVOKE_ROUTE_CONTRACT.invoke.path,
      paymentLane: 'brokered',
    })
    expect(operationDetail.operation.commercial.priceEvidence).toEqual(
      expect.objectContaining({
        priceDigest: expect.any(String),
      }),
    )
    expect(
      operationDetail.operation.commercial.priceEvidence,
    ).not.toHaveProperty('observedAt')
    expect(
      operationDetail.operation.commercial.priceEvidence,
    ).not.toHaveProperty('validUntil')

    await backend.run(async (ctx) => {
      const publication = await ctx.db
        .query('capabilityPublications')
        .withIndex('by_publicationRef_and_revision', (index) =>
          index
            .eq('publicationRef', published.publicationRef)
            .eq('revision', published.publicationRevision),
        )
        .unique()
      if (publication === null) throw new Error('publication_missing')
      await ctx.db.patch(publication._id, {
        readinessValidUntil: Date.now() - 1,
      })
    })
    const staleLifecycle = await owner.query(
      api.capabilitySupply.readCapabilityPublication,
      {
        publicationRef: published.publicationRef,
      },
    )
    expect(staleLifecycle).toMatchObject({ lifecycle: { state: 'inactive' } })
    expect(staleLifecycle?.lifecycle.reasons).toEqual(
      expect.arrayContaining(['health_stale']),
    )

    const withdrawn = await owner.mutation(
      api.capabilitySupplyOwnerFunnel.withdrawOwnerCapability,
      await ownerMaintenanceArgs(
        backend,
        businessId,
        published.offeringId,
        published.publicationRef,
        published.publicationRevision,
        'withdraw',
      ),
    )
    expect(withdrawn).toMatchObject({
      kind: 'withdrawn',
      lifecycle: { state: 'withdrawn', reasons: ['withdrawn'] },
    })
    await expect(
      owner.query(api.capabilitySupply.readCapabilityPublication, {
        publicationRef: published.publicationRef,
      }),
    ).resolves.toMatchObject({ lifecycle: { state: 'withdrawn' } })
  })
  it('replays owner maintenance responses and schedules refresh once', async () => {
    const backend = convexTestWithMarketComponents()
    const { businessId, owner } = await publishedBusinessOwner(
      backend,
      'maintenance-replay',
    )
    await seedCatalogOffering(backend, businessId, 'maintenance-replay')
    await installCurrentProviderConnection(backend, businessId, 'maintenance-replay')
    const published = await owner.mutation(
      api.capabilitySupply.publishPreparedCapability,
      await preparedPublicationArgs(
        backend,
        capabilityPublicationInput(businessId, 'maintenance-replay'),
      ),
    )
    if ('reason' in published)
      throw new Error(`publication_refused:${published.reason}`)

    const readinessProbeCount = async () =>
      await backend.run(async (ctx) => {
        const db = ctx.db as unknown as {
          system: {
            query: (tableName: string) => {
              take: (limit: number) => Promise<Array<{ name?: string }>>
            }
          }
        }
        const rows = await db.system.query('_scheduled_functions').take(1000)
        return rows.filter(
          (row) => row.name === 'capabilitySupplyReadiness:probe',
        ).length
      })

    const refreshArgs = await ownerMaintenanceArgs(
      backend,
      businessId,
      published.offeringId,
      published.publicationRef,
      published.publicationRevision,
      'maintenance-refresh',
    )
    const scheduledBefore = await readinessProbeCount()
    const refreshed = await owner.mutation(
      api.capabilitySupplyOwnerFunnel.refreshOwnerCapability,
      refreshArgs,
    )
    expect(refreshed).toEqual({
      kind: 'refreshed',
      publicationRef: published.publicationRef,
      revision: published.publicationRevision,
      disposition: 'current',
      lifecycle: { state: 'inactive', reasons: ['health_unobserved'] },
    })
    const scheduledAfterFirstRefresh = await readinessProbeCount()
    expect(scheduledAfterFirstRefresh).toBeGreaterThan(scheduledBefore)

    const refreshReplay = await owner.mutation(
      api.capabilitySupplyOwnerFunnel.refreshOwnerCapability,
      await ownerMaintenanceArgs(
        backend,
        businessId,
        published.offeringId,
        published.publicationRef,
        published.publicationRevision,
        'maintenance-refresh',
      ),
    )
    expect(refreshReplay).toEqual(refreshed)
    await expect(readinessProbeCount()).resolves.toBe(
      scheduledAfterFirstRefresh,
    )

    const refreshConflict = await owner.mutation(
      api.capabilitySupplyOwnerFunnel.refreshOwnerCapability,
      await withSourceWrite('catalog_publish', {
        ...refreshArgs,
        reasonCode: 'changed_payload',
      }),
    )
    expect(refreshConflict).toEqual({
      kind: 'refused',
      reason: 'operation_key_conflict',
    })

    const withdrawArgs = await ownerMaintenanceArgs(
      backend,
      businessId,
      published.offeringId,
      published.publicationRef,
      published.publicationRevision,
      'maintenance-withdraw',
    )
    const withdrawn = await owner.mutation(
      api.capabilitySupplyOwnerFunnel.withdrawOwnerCapability,
      withdrawArgs,
    )
    expect(withdrawn).toEqual({
      kind: 'withdrawn',
      publicationRef: published.publicationRef,
      revision: published.publicationRevision,
      lifecycle: { state: 'withdrawn', reasons: ['withdrawn'] },
    })
    const withdrawReplay = await owner.mutation(
      api.capabilitySupplyOwnerFunnel.withdrawOwnerCapability,
      await ownerMaintenanceArgs(
        backend,
        businessId,
        published.offeringId,
        published.publicationRef,
        published.publicationRevision,
        'maintenance-withdraw',
      ),
    )
    expect(withdrawReplay).toEqual(withdrawn)

    const withdrawConflict = await owner.mutation(
      api.capabilitySupplyOwnerFunnel.withdrawOwnerCapability,
      await withSourceWrite('catalog_publish', {
        ...withdrawArgs,
        reasonCode: 'changed_payload',
      }),
    )
    expect(withdrawConflict).toEqual({
      kind: 'refused',
      reason: 'operation_key_conflict',
    })
  })
})
