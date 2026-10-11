import { describe, expect, it } from 'vitest'

import { api, internal } from '../../convex/_generated/api'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { providerToolStatusSchema } from '@/modules/capability-supply/provider-tool-status'
import { convexTestWithWorkers } from '../helpers/convex-fixtures'
import { withoutSourceWrite, withSourceWrite } from '../helpers/source-write-admission'
import {
  createPublishedBusinessOwner,
  openApiSource,
  prepareOwnerPublicationCommand,
  publishOwnerOpenApiCapability,
  seedCatalogOffering,
  seedSupplyAgentPrincipal,
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
    const { prepared, published: first } = await publishOwnerOpenApiCapability({
      backend,
      businessId,
      owner,
      offeringRef,
      sourceHash,
      capabilityId: 'owner.test.revision',
      operationKey: 'owner-supply:owner-test-revision:r1',
      catalogOrigin: {
        kind: 'catalog_offering',
        offeringRef,
        offeringRevision: 1,
        offeringSourceHash: sourceHash,
      },
    })

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
      toolRef: first.toolRef,
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
        toolRef: first.toolRef,
        taskDigest: 'owner-test-task:r1:missing-identity',
      }),
    ).rejects.toThrow('capability_call_event_publication_identity_invalid')
    await expect(
      owner.mutation(internal.capabilitySupply.recordCapabilityCallEvent, {
        ...ownerTestEventBase,
        eventRef: 'owner-supply-test:r1',
        publicationRevision: first.publicationRevision,
        toolRef: first.toolRef,
        taskDigest: 'owner-test-task:r1',
      }),
    ).resolves.toEqual({ kind: 'recorded' })
    await expect(
      owner.mutation(internal.capabilitySupply.recordCapabilityCallEvent, {
        ...ownerTestEventBase,
        eventRef: 'owner-supply-test:r1',
        publicationRevision: first.publicationRevision,
        toolRef: first.toolRef,
        taskDigest: 'owner-test-task:r1',
      }),
    ).resolves.toEqual({ kind: 'replayed' })
    await expect(
      owner.mutation(internal.capabilitySupply.recordCapabilityCallEvent, {
        ...ownerTestEventBase,
        eventRef: 'owner-supply-test:r1',
        publicationRevision: first.publicationRevision,
        toolRef: first.toolRef,
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
      toolRef: first.toolRef,
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
      toolRef: first.toolRef,
      publicationRef: first.publicationRef,
    })
    expect(firstReadback.activityTruncated).toBe(false)
    expect(firstReadback.callLog).toEqual([])
    const editorReadback = await owner.query(
      api.capabilitySupplyOwnerFunnel.readOwnerSupplyFunnel,
      { businessId, editorOfferingRef: offeringRef },
    )
    if (editorReadback.kind !== 'available')
      throw new Error(`owner_test_editor_readback_kind:${editorReadback.kind}`)
    expect(
      editorReadback.offerings.find(
        (offering) => offering.offeringRef === offeringRef,
      )?.sourceMaterial,
    ).toMatchObject({
      sourceKind: prepared.command.prepared.sourceKind,
      sourceSelector: prepared.command.prepared.sourceSelector,
      sourceDescriptorJson: prepared.command.prepared.sourceDescriptorJson,
      sourceRevision: prepared.command.prepared.sourceRevision,
      sourceDigest: prepared.command.prepared.sourceDigest,
      documentJson: prepared.command.prepared.documentJson,
      binding: {
        bindingId: prepared.command.prepared.binding.bindingId,
        authority: prepared.command.prepared.binding.authority,
      },
    })
    const publicationBeforeIntegrityFailure = await backend.run(async (ctx) =>
      ctx.db
        .query('capabilityPublications')
        .withIndex('by_publicationRef_and_revision', (query) =>
          query
            .eq('publicationRef', first.publicationRef)
            .eq('revision', first.publicationRevision),
        )
        .unique(),
    )
    if (publicationBeforeIntegrityFailure === null)
      throw new Error('owner_test_publication_missing')
    await backend.run(async (ctx) => {
      await ctx.db.patch(publicationBeforeIntegrityFailure._id, {
        sourceSelector: undefined,
      })
    })
    const refusedEditorReadback = await owner.query(
      api.capabilitySupplyOwnerFunnel.readOwnerSupplyFunnel,
      { businessId, editorOfferingRef: offeringRef },
    )
    if (refusedEditorReadback.kind !== 'available')
      throw new Error(`owner_test_refused_editor_readback_kind:${refusedEditorReadback.kind}`)
    expect(refusedEditorReadback.offerings[0]).not.toHaveProperty('sourceMaterial')
    await backend.run(async (ctx) => {
      await ctx.db.patch(publicationBeforeIntegrityFailure._id, {
        sourceSelector: publicationBeforeIntegrityFailure.sourceSelector,
      })
    })
    expect(firstReadback.offerings[0]).not.toHaveProperty('sourceMaterial')
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
    const frozenCaseId = await backend.run(async (ctx) => {
      const business = await ctx.db.get(businessId)
      return ctx.db.insert('capabilityProviderOffboardingCases', {
        caseRef: 'provider-offboarding:freeze', owningAccountRef: business!.owningAccountRef, businessId, providerRef: 'provider:freeze',
        requestedByPrincipalRef: 'principal:freeze',
        authorityRevision: { binding: 1, credential: 1, principal: 1, account: 1, access: 1, currentOwnership: 1, currentOwnerPrincipal: 1 },
        authorityProvenance: { providerNamespace: 'clerk/user', bindingRef: 'b', credentialRef: 'c', credentialGeneration: 1, accessKind: 'ownership', accessRef: 'a', currentOwnershipRef: 'o', resolvedAt: 1 },
        toolTargetCount: 0, offeringTargetCount: 0, connectionTargetCount: 0, targetSnapshotDigest: 'd',
        currentStep: 'freeze-routeability', state: 'freezing', retentionPolicyVersion: '',
        blockerCodes: [], evidenceRefs: [], revision: 1, lastCommandId: 'x', lastCommandDigest: 'x', requestedAt: 1, updatedAt: 1,
        routeabilityFrozenAt: 1,
      })
    })
    await expect(
      owner.mutation(
        api.capabilitySupplyOwnerFunnel.republishOwnerCapability,
        await withSourceWrite('catalog_publish', {
          ...maintenanceBase,
          operationKey: 'owner-test-republish-frozen',
          correlationId: 'owner-test-republish-frozen',
          proof: {
            reverificationId: 'test:owner-republish-frozen',
            firstFactorAgeMinutes: 0,
            secondFactorAgeMinutes: -1,
          },
        }),
      ),
    ).resolves.toEqual({ kind: 'refused', reason: 'authorization_denied' })
    await backend.run(async (ctx) => { await ctx.db.delete(frozenCaseId) })
    const republished = await owner.mutation(
      api.capabilitySupplyOwnerFunnel.republishOwnerCapability,
      await withSourceWrite('catalog_publish', {
        ...maintenanceBase,
        operationKey: 'owner-test-republish',
        correlationId: 'owner-test-republish',
        proof: {
          reverificationId: 'test:owner-republish',
          firstFactorAgeMinutes: 0,
          secondFactorAgeMinutes: -1,
        },
      }),
    )
    if (republished.kind === 'refused')
      throw new Error(`owner_test_republish_failed:${republished.reason}`)
    if (republished.kind !== 'republished')
      throw new Error(`owner_test_republish_unexpected:${republished.kind}`)
    expect(republished.revision).toBe(first.publicationRevision + 1)
    expect(republished.toolRef).not.toBe(first.toolRef)

    await observeReadiness(first.publicationRef, republished.revision, 'r2')
    await expect(
      owner.mutation(internal.capabilitySupply.recordCapabilityCallEvent, {
        ...ownerTestEventBase,
        eventRef: 'owner-supply-test:r1:stale-after-republish',
        publicationRevision: first.publicationRevision,
        toolRef: first.toolRef,
        taskDigest: 'owner-test-task:r1:stale-after-republish',
      }),
    ).rejects.toThrow('capability_call_event_publication_stale')
    await expect(
      owner.mutation(internal.capabilitySupply.recordCapabilityCallEvent, {
        ...ownerTestEventBase,
        eventRef: 'owner-supply-test:r2',
        publicationRevision: republished.revision,
        toolRef: republished.toolRef,
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

  it('admits Agent publish, withdraw, and republish through bounded delegation without Clerk proof', async () => {
    const backend = convexTestWithWorkers()
    const { businessId, canonicalAccountRef } = await createPublishedBusinessOwner(
      backend,
      'agent-publication-consequences',
    )
    const agentPrincipal = await seedSupplyAgentPrincipal(
      backend,
      canonicalAccountRef,
      'publication-consequences',
    )
    const offeringRef = 'catalog-offering:agent-publication-consequences'
    const sourceHash = 'catalog-source:agent-publication-consequences:v1'
    await seedCatalogOffering(backend, businessId, offeringRef, 1, 1, sourceHash)
    const prepared = await prepareOwnerPublicationCommand(
      backend,
      businessId,
      offeringRef,
      1,
      sourceHash,
      openApiSource('agent.publication.consequences'),
      'agent-publication:publish',
      {
        kind: 'catalog_offering',
        offeringRef,
        offeringRevision: 1,
        offeringSourceHash: sourceHash,
      },
    )
    if (prepared.kind === 'refused') {
      throw new Error(`agent_publication_prepare_failed:${prepared.reason}`)
    }
    const unsignedPrepared = withoutSourceWrite(prepared.command)
    const { proof: _ownerProof, ...agentPublishCommand } = unsignedPrepared
    const published = await backend.mutation(
      api.capabilitySupply.publishPreparedCapability,
      await withSourceWrite('catalog_publish', {
        ...agentPublishCommand,
        agentPrincipal,
      }),
    )
    if (published.kind === 'refused') {
      throw new Error(`agent_publication_failed:${published.reason}`)
    }
    expect(published.kind).toBe('published')

    const readback = await backend.query(
      api.capabilityProviderTools.readAgent,
      await withSourceWrite('catalog_publish', {
        businessId,
        toolRef: published.toolRef,
        agentPrincipal,
        operationKey: 'agent-publication:status',
        correlationId: 'agent-publication:status',
      }),
    )
    if (readback.kind !== 'available') throw new Error('agent_publication_status_unavailable')
    const status = providerToolStatusSchema.parse(JSON.parse(readback.statusJson) as unknown)
    expect(status.maintenance).toEqual({
      businessId: String(businessId),
      offeringRef,
      offeringRevision: 1,
      offeringSourceHash: sourceHash,
      publicationRef: published.publicationRef,
      publicationRevision: published.publicationRevision,
    })
    if (status.maintenance === undefined) throw new Error('agent_publication_maintenance_missing')
    const maintenanceBase = {
      ...status.maintenance,
      businessId,
      reasonCode: 'agent_publication_consequence',
      evidenceRefs: ['agent-publication:consequence'],
      agentPrincipal,
    }
    const withdrawn = await backend.mutation(
      api.capabilitySupplyOwnerFunnel.withdrawOwnerCapability,
      await withSourceWrite('catalog_publish', {
        ...maintenanceBase,
        operationKey: 'agent-publication:withdraw',
        correlationId: 'agent-publication:withdraw',
      }),
    )
    expect(withdrawn).toMatchObject({ kind: 'withdrawn' })

    const republished = await backend.mutation(
      api.capabilitySupplyOwnerFunnel.republishOwnerCapability,
      await withSourceWrite('catalog_publish', {
        ...maintenanceBase,
        operationKey: 'agent-publication:republish',
        correlationId: 'agent-publication:republish',
      }),
    )
    expect(republished).toMatchObject({
      kind: 'republished',
      revision: published.publicationRevision + 1,
    })

    if (republished.kind !== 'republished') throw new Error('agent_republication_failed')
    const refreshed = await backend.query(
      api.capabilityProviderTools.readAgent,
      await withSourceWrite('catalog_publish', {
        businessId,
        toolRef: republished.toolRef,
        agentPrincipal,
        operationKey: 'agent-publication:status-after-republish',
        correlationId: 'agent-publication:status-after-republish',
      }),
    )
    if (refreshed.kind !== 'available') throw new Error('agent_republication_status_unavailable')
    expect(providerToolStatusSchema.parse(JSON.parse(refreshed.statusJson) as unknown).maintenance).toEqual({
      ...status.maintenance,
      publicationRevision: republished.revision,
    })

    const evidence = await backend.run(async (ctx) => ({
      snapshots: await ctx.db.query('authorityDelegationSnapshots')
        .withIndex('by_accountRef_and_actorPrincipalRef_and_idempotencyRef', (query) => query
          .eq('accountRef', canonicalAccountRef)
          .eq('actorPrincipalRef', agentPrincipal.principalId))
        .collect(),
      proofUses: await ctx.db.query('consequenceProofUses').collect(),
    }))
    expect(evidence.snapshots.map((snapshot) => snapshot.idempotencyRef).sort()).toEqual([
      'agent-publication:publish',
      'agent-publication:republish',
      'agent-publication:withdraw',
    ])
    for (const snapshot of evidence.snapshots) {
      expect(snapshot).toMatchObject({
        actorPrincipalRef: agentPrincipal.principalId,
        accountRef: canonicalAccountRef,
        grantRef: expect.stringMatching(/^grt_/u),
        generation: 1,
        scopes: ['market_supply:manage'],
        budgetAmount: 0,
      })
      expect(snapshot.resourceRefs.every((ref) => (
        ref.startsWith('offering:') || ref.startsWith('publication:')
      ))).toBe(true)
    }
    expect(evidence.proofUses).toEqual([])
  })

  it('isolates accepted Calls across republish revisions and rejects material drift', async () => {
    const backend = convexTestWithWorkers()
    const { businessId, owner } = await createPublishedBusinessOwner(
      backend,
      'publication-republish-isolation',
    )
    const offeringRef = 'catalog-offering:publication-republish-isolation'
    const sourceHash = 'catalog-source:publication-republish-isolation:v1'
    await seedCatalogOffering(
      backend,
      businessId,
      offeringRef,
      1,
      1,
      sourceHash,
    )
    const { published: first } = await publishOwnerOpenApiCapability({
      backend,
      businessId,
      owner,
      offeringRef,
      sourceHash,
      capabilityId: 'publication.republish.isolation',
      operationKey: 'owner-supply:publication-r1',
      catalogOrigin: {
        kind: 'catalog_offering',
        offeringRef,
        offeringRevision: 1,
        offeringSourceHash: sourceHash,
      },
      observeReadiness: {
        operationKey: 'readiness-probe-r1',
        correlationId: 'readiness-probe-r1',
        evidenceRef: 'readiness:probe:r1',
      },
    })

    const acceptedCallRef = 'operation-invocation:publication-r1-accepted'
    const acceptedAt = Date.now()
    await backend.run(async (ctx) => {
      await ctx.db.insert('capabilityCalls', {
        quoteRef: 'operation-commitment:publication-r1-accepted',
        callRef: acceptedCallRef,
        principalId: 'principal:buyer-account',
        ownerId: 'account:buyer-account',
        credentialId: 'credential:buyer-account',
        applicationRef: 'agentic-economy',
        toolRef: first.toolRef,
        idempotencyKey: 'purchase:publication-r1-accepted',
        environment: 'production',
        grantRef: 'grant:publication-r1',
        grantGeneration: 1,
        policyDigest: canonicalDigest({ policy: 'publication-r1' }),
        grantExpiresAt: acceptedAt + 600_000,
        toolJson: '{}',
        inputJson: '{"request":"republish-isolation"}',
        inputDigest: canonicalDigest({ request: 'republish-isolation' }),
        requestDigest: canonicalDigest({ request: 'republish-isolation', toolRef: first.toolRef }),
        state: 'completed',
        createdAt: acceptedAt - 1_000,
        updatedAt: acceptedAt,
        result: {
          kind: 'completed',
          callRef: acceptedCallRef,
          toolRef: first.toolRef,
          output: { result: 'accepted-r1' },
          evidenceHash: canonicalDigest({ result: 'accepted-r1' }),
        },
      })
    })

    const maintenanceBase = {
      businessId,
      offeringRef,
      offeringRevision: 1,
      offeringSourceHash: sourceHash,
      publicationRef: first.publicationRef,
      publicationRevision: first.publicationRevision,
      reasonCode: 'lifecycle_withdraw',
      evidenceRefs: ['lifecycle:withdraw'],
    }
    await owner.mutation(
      api.capabilitySupplyOwnerFunnel.withdrawOwnerCapability,
      await withSourceWrite('catalog_publish', {
        ...maintenanceBase,
        operationKey: 'lifecycle-withdraw',
        correlationId: 'lifecycle-withdraw',
      }),
    )

    const publicationRow = await backend.run(async (ctx) => await ctx.db
      .query('capabilityPublications')
      .withIndex('by_publicationRef_and_revision', (query) => (
        query.eq('publicationRef', first.publicationRef)
          .eq('revision', first.publicationRevision)
      ))
      .unique())
    if (publicationRow === null) throw new Error('publication_missing')
    const originalPriceDigest = publicationRow.priceDigest
    const originalSourceDescriptor = publicationRow.sourceDescriptorJson

    await backend.run(async (ctx) => {
      await ctx.db.patch(publicationRow._id, {
        priceDigest: `sha256:${'b'.repeat(64)}`,
      })
    })
    await expect(
      owner.mutation(
        api.capabilitySupplyOwnerFunnel.republishOwnerCapability,
        await withSourceWrite('catalog_publish', {
          ...maintenanceBase,
          operationKey: 'publication-republish-drift',
          correlationId: 'publication-republish-drift',
          proof: {
            reverificationId: 'test:publication-republish-drift',
            firstFactorAgeMinutes: 0,
            secondFactorAgeMinutes: -1,
          },
        }),
      ),
    ).resolves.toEqual({ kind: 'refused', reason: 'pricing_config_invalid' })

    await backend.run(async (ctx) => {
      await ctx.db.patch(publicationRow._id, {
        priceDigest: originalPriceDigest,
        sourceDescriptorJson: `${originalSourceDescriptor} `,
      })
    })
    await expect(
      owner.mutation(
        api.capabilitySupplyOwnerFunnel.republishOwnerCapability,
        await withSourceWrite('catalog_publish', {
          ...maintenanceBase,
          operationKey: 'publication-republish-source-drift',
          correlationId: 'publication-republish-source-drift',
          proof: {
            reverificationId: 'test:publication-republish-source-drift',
            firstFactorAgeMinutes: 0,
            secondFactorAgeMinutes: -1,
          },
        }),
      ),
    ).resolves.toEqual({ kind: 'refused', reason: 'source_invalid' })

    await backend.run(async (ctx) => {
      await ctx.db.patch(publicationRow._id, {
        sourceDescriptorJson: originalSourceDescriptor,
      })
    })
    const republished = await owner.mutation(
      api.capabilitySupplyOwnerFunnel.republishOwnerCapability,
      await withSourceWrite('catalog_publish', {
        ...maintenanceBase,
        operationKey: 'lifecycle-republish',
        correlationId: 'lifecycle-republish',
        proof: {
          reverificationId: 'test:lifecycle-republish',
          firstFactorAgeMinutes: 0,
          secondFactorAgeMinutes: -1,
        },
      }),
    )
    if (republished.kind !== 'republished') {
      throw new Error(`lifecycle_republish_failed:${republished.kind}`)
    }
    expect(republished.revision).toBe(2)
    expect(republished.toolRef).not.toBe(first.toolRef)

    const r1Call = await backend.run(async (ctx) => await ctx.db
      .query('capabilityCalls')
      .withIndex('by_callRef', (query) => query.eq('callRef', acceptedCallRef))
      .unique())
    expect(r1Call).toMatchObject({
      callRef: acceptedCallRef,
      toolRef: first.toolRef,
      state: 'completed',
      result: {
        kind: 'completed',
        toolRef: first.toolRef,
      },
    })
    expect(r1Call?.toolRef).not.toBe(republished.toolRef)

    const r2Publication = await backend.run(async (ctx) => await ctx.db
      .query('capabilityPublications')
      .withIndex('by_publicationRef_and_revision', (query) => (
        query.eq('publicationRef', first.publicationRef).eq('revision', 2)
      ))
      .unique())
    expect(r2Publication?.disposition).toBe('current')
    expect(r2Publication?.toolRef).toBe(republished.toolRef)
  })
})

async function callReceipts(backend: ReturnType<typeof convexTestWithWorkers>) {
  return await backend.run(async (ctx) => await ctx.db
    .query('auditEvents')
    .filter((query) => query.eq(query.field('eventType'), 'protected_action.receipt_recorded'))
    .collect())
}
