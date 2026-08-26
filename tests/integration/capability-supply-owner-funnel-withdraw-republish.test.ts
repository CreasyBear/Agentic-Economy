import { describe, expect, it } from 'vitest'

import { api, internal } from '../../convex/_generated/api'
import { convexTestWithWorkers } from '../helpers/convex-fixtures'
import { withSourceWrite } from '../helpers/source-write-admission'
import {
  createPublishedBusinessOwner,
  openApiSource,
  prepareOwnerPublicationCommand,
  seedCatalogOffering,
} from './capability-supply-owner-funnel-harness'

describe('owner capability withdraw and republish', () => {
  it('does not reuse owner test evidence across publication revisions', async () => {
    const backend = convexTestWithWorkers()
    const { businessId, owner } = await createPublishedBusinessOwner(
      backend,
      'owner-test-revision',
    )
    const offeringRef = 'catalog-offering:owner-test-revision'
    const sourceHash = 'catalog-source:owner-test-revision:v1'
    await seedCatalogOffering(
      backend,
      businessId,
      offeringRef,
      1,
      1,
      sourceHash,
    )
    const prepared = await prepareOwnerPublicationCommand(
      backend,
      businessId,
      offeringRef,
      1,
      sourceHash,
      openApiSource('owner.test.revision'),
      'owner-supply:owner-test-revision:r1',
      {
        kind: 'catalog_offering',
        offeringRef,
        offeringRevision: 1,
        offeringSourceHash: sourceHash,
      },
    )
    if (prepared.kind === 'refused')
      throw new Error(
        `owner_test_publication_prepare_failed:${prepared.reason}`,
      )
    const first = await owner.mutation(
      api.capabilitySupply.publishPreparedCapability,
      prepared.command,
    )
    if (first.kind === 'refused')
      throw new Error(`owner_test_publication_failed:${first.reason}`)
    if (first.kind !== 'published')
      throw new Error('owner_test_publication_replayed_unexpectedly')

    const observeReadiness = async (
      publicationRef: string,
      revision: number,
      suffix: string,
    ) => {
      await expect(
        backend.mutation(internal.capabilitySupply.observeCapabilityReadiness, {
          publicationRef,
          expectedRevision: revision,
          credentialState: 'ready',
          healthState: 'healthy',
          validUntil: Date.now() + 60_000,
          operationKey: `owner-test-readiness:${suffix}`,
          correlationId: `owner-test-readiness:${suffix}`,
          reasonCode: 'owner_test_readiness',
          evidenceRefs: [`owner-test:readiness:${suffix}`],
        }),
      ).resolves.toMatchObject({ kind: 'observed', revision })
    }

    await observeReadiness(
      first.publicationRef,
      first.publicationRevision,
      'r1',
    )
    const ownerTestEventBase = {
      businessId,
      offeringRef,
      publicationRef: first.publicationRef,
      eventKind: 'supply_owner_test_observed' as const,
      outcome: 'filled' as const,
      taskStartedAt: 1,
      successfulAt: 2,
      durationMs: 1,
      observedAt: 2,
      evidenceRefs: ['owner-test:evidence:r1'],
      environment: 'development' as const,
    }
    const fullOwnerTestEvent = {
      ...ownerTestEventBase,
      publicationRevision: first.publicationRevision,
      operationRef: first.operationRef,
      taskDigest: 'owner-test-task:hostile',
    }
    await expect(owner.mutation(internal.capabilitySupply.recordCapabilityCallEvent, {
      ...fullOwnerTestEvent,
      eventRef: ' ',
    })).rejects.toThrow('capability_call_event_invalid')
    await expect(backend.mutation(internal.capabilitySupply.recordCapabilityCallEvent, {
      ...fullOwnerTestEvent,
      eventRef: 'owner-supply-test:anonymous',
    })).rejects.toThrow('capability_call_event_authorization_denied')
    const other = await createPublishedBusinessOwner(backend, 'owner-test-substitution')
    await expect(other.owner.mutation(internal.capabilitySupply.recordCapabilityCallEvent, {
      ...fullOwnerTestEvent,
      eventRef: 'owner-supply-test:cross-owner',
    })).rejects.toThrow('capability_call_event_authorization_denied')
    await backend.run(async (ctx) => ctx.db.delete(other.businessId))
    await expect(owner.mutation(internal.capabilitySupply.recordCapabilityCallEvent, {
      ...fullOwnerTestEvent,
      businessId: other.businessId,
      eventRef: 'owner-supply-test:deleted-business',
    })).rejects.toThrow('capability_call_event_authorization_denied')
    await expect(owner.mutation(internal.capabilitySupply.recordCapabilityCallEvent, {
      ...fullOwnerTestEvent,
      eventRef: 'owner-supply-test:missing-publication',
      publicationRef: 'publication:missing',
    })).rejects.toThrow('capability_call_event_publication_identity_invalid')
    const publicationRow = await backend.run(async (ctx) => {
      const publication = await ctx.db.query('capabilityPublications')
        .withIndex('by_publicationRef_and_revision', (query) => query
          .eq('publicationRef', first.publicationRef)
          .eq('revision', first.publicationRevision))
        .unique()
      if (publication === null) throw new Error('owner_test_publication_missing')
      return { id: publication._id, offeringId: publication.offeringId }
    })
    await backend.run(async (ctx) => ctx.db.patch(publicationRow.id, { offeringId: 'offering:missing' }))
    await expect(owner.mutation(internal.capabilitySupply.recordCapabilityCallEvent, {
      ...fullOwnerTestEvent,
      eventRef: 'owner-supply-test:missing-offering',
    })).rejects.toThrow('capability_call_event_publication_identity_invalid')
    await backend.run(async (ctx) => ctx.db.patch(publicationRow.id, {
      offeringId: publicationRow.offeringId,
      credentialState: 'unavailable',
    }))
    await expect(owner.mutation(internal.capabilitySupply.recordCapabilityCallEvent, {
      ...fullOwnerTestEvent,
      eventRef: 'owner-supply-test:stale-readiness',
    })).rejects.toThrow('capability_call_event_publication_stale')
    await backend.run(async (ctx) => ctx.db.patch(publicationRow.id, { credentialState: 'ready' }))
    await expect(
      owner.mutation(internal.capabilitySupply.recordCapabilityCallEvent, {
        ...ownerTestEventBase,
        eventRef: 'owner-supply-test:r1:missing-identity',
        operationRef: first.operationRef,
        taskDigest: 'owner-test-task:r1:missing-identity',
      }),
    ).rejects.toThrow('capability_call_event_publication_identity_invalid')
    await expect(
      owner.mutation(internal.capabilitySupply.recordCapabilityCallEvent, {
        ...ownerTestEventBase,
        eventRef: 'owner-supply-test:r1',
        publicationRevision: first.publicationRevision,
        operationRef: first.operationRef,
        taskDigest: 'owner-test-task:r1',
      }),
    ).resolves.toEqual({ kind: 'recorded' })
    await expect(
      owner.mutation(internal.capabilitySupply.recordCapabilityCallEvent, {
        ...ownerTestEventBase,
        eventRef: 'owner-supply-test:r1',
        publicationRevision: first.publicationRevision,
        operationRef: first.operationRef,
        taskDigest: 'owner-test-task:r1',
      }),
    ).resolves.toEqual({ kind: 'replayed' })
    await expect(
      owner.mutation(internal.capabilitySupply.recordCapabilityCallEvent, {
        ...ownerTestEventBase,
        eventRef: 'owner-supply-test:r1',
        publicationRevision: first.publicationRevision,
        operationRef: first.operationRef,
        taskDigest: 'owner-test-task:r1:forged-replay',
      }),
    ).rejects.toThrow('capability_call_event_identity_conflict')
    await expect(callReceipts(backend)).resolves.toHaveLength(1)
    await expect(owner.mutation(internal.capabilitySupply.recordCapabilityCallEvent, {
      businessId,
      offeringRef,
      publicationRef: first.publicationRef,
      eventRef: 'owner-supply-test:zero-depth',
      publicationRevision: first.publicationRevision,
      operationRef: first.operationRef,
      taskDigest: 'owner-test-task:zero-depth',
      eventKind: 'supply_liquidity_depth_observed',
      outcome: 'zero',
      zeroReason: 'no_routeable_supply',
      eligibleDepth: 0,
      observedAt: 2,
      evidenceRefs: ['owner-test:evidence:zero-depth'],
      environment: 'development',
    })).resolves.toEqual({ kind: 'recorded' })
    await expect(callReceipts(backend)).resolves.toHaveLength(2)
    const firstReadback = await owner.query(
      api.capabilitySupplyOwnerFunnel.readOwnerSupplyFunnel,
      { businessId },
    )
    if (firstReadback.kind !== 'available')
      throw new Error(`owner_test_readback_kind:${firstReadback.kind}`)
    expect(firstReadback.offerings).toHaveLength(1)
    expect(firstReadback.offerings[0]).toMatchObject({
      offeringRef,
      operationRef: first.operationRef,
      publicationRef: first.publicationRef,
    })
    expect(firstReadback.activityTruncated).toBe(false)
    expect(firstReadback.callLog).toEqual([])
    expect(
      firstReadback.offerings.find(
        (offering) => offering.offeringRef === offeringRef,
      )?.stepStates.test,
    ).toBe('in_progress')

    const maintenanceBase = {
      businessId,
      offeringRef,
      offeringRevision: 1,
      offeringSourceHash: sourceHash,
      publicationRef: first.publicationRef,
      publicationRevision: first.publicationRevision,
      reasonCode: 'owner_test_lifecycle',
      evidenceRefs: ['owner-test:lifecycle'],
    }
    await expect(
      owner.mutation(
        api.capabilitySupplyOwnerFunnel.withdrawOwnerCapability,
        await withSourceWrite('catalog_publish', {
          ...maintenanceBase,
          operationKey: 'owner-test-withdraw',
          correlationId: 'owner-test-withdraw',
        }),
      ),
    ).resolves.toMatchObject({
      kind: 'withdrawn',
      revision: first.publicationRevision,
    })
    const republished = await owner.mutation(
      api.capabilitySupplyOwnerFunnel.republishOwnerCapability,
      await withSourceWrite('catalog_publish', {
        ...maintenanceBase,
        operationKey: 'owner-test-republish',
        correlationId: 'owner-test-republish',
      }),
    )
    if (republished.kind === 'refused')
      throw new Error(`owner_test_republish_failed:${republished.reason}`)
    if (republished.kind !== 'republished')
      throw new Error(`owner_test_republish_unexpected:${republished.kind}`)
    expect(republished.revision).toBe(first.publicationRevision + 1)
    expect(republished.operationRef).not.toBe(first.operationRef)

    await observeReadiness(first.publicationRef, republished.revision, 'r2')
    await expect(
      owner.mutation(internal.capabilitySupply.recordCapabilityCallEvent, {
        ...ownerTestEventBase,
        eventRef: 'owner-supply-test:r1:stale-after-republish',
        publicationRevision: first.publicationRevision,
        operationRef: first.operationRef,
        taskDigest: 'owner-test-task:r1:stale-after-republish',
      }),
    ).rejects.toThrow('capability_call_event_publication_stale')
    await expect(
      owner.mutation(internal.capabilitySupply.recordCapabilityCallEvent, {
        ...ownerTestEventBase,
        eventRef: 'owner-supply-test:r2',
        publicationRevision: republished.revision,
        operationRef: republished.operationRef,
        taskDigest: 'owner-test-task:r2',
        evidenceRefs: ['owner-test:evidence:r2'],
      }),
    ).resolves.toEqual({ kind: 'recorded' })
    await expect(callReceipts(backend)).resolves.toHaveLength(3)
    const afterSecondTest = await owner.query(
      api.capabilitySupplyOwnerFunnel.readOwnerSupplyFunnel,
      { businessId },
    )
    if (afterSecondTest.kind !== 'available')
      throw new Error(`owner_test_r2_completion_kind:${afterSecondTest.kind}`)
    expect(
      afterSecondTest.offerings.find(
        (offering) => offering.offeringRef === offeringRef,
      )?.stepStates.test,
    ).toBe('in_progress')
    expect(afterSecondTest.callLog).toEqual([])
  })
})

async function callReceipts(backend: ReturnType<typeof convexTestWithWorkers>) {
  return await backend.run(async (ctx) => await ctx.db
    .query('auditEvents')
    .filter((query) => query.eq(query.field('eventType'), 'protected_action.receipt_recorded'))
    .collect())
}
