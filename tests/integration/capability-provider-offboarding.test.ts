import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { api, internal } from '../../convex/_generated/api'
import { convexTestWithMarketComponents } from '../helpers/convex-fixtures'
import { withSourceWrite } from '../helpers/source-write-admission'
import {
  createPublishedBusinessOwner,
  openApiSource,
  prepareOwnerPublicationCommand,
  seedCatalogOffering,
  seedSupplyAgentPrincipal,
} from './capability-supply-owner-funnel-harness'

describe('durable Provider offboarding', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('retires only after the official workflow proves every child authority complete', async () => {
    const backend = convexTestWithMarketComponents()
    const fixture = await createPublishedBusinessOwner(backend, 'provider-offboarding-owner')
    const command = {
      businessId: fixture.businessId,
      idempotencyKey: 'provider-offboarding:happy-path',
      operationKey: 'provider-offboarding:happy-path',
      correlationId: 'provider-offboarding:happy-path',
      retentionPolicyVersion: 'retention-policy:2026-09',
      proof: {
        reverificationId: 'rev_provider_offboarding_happy_path',
        firstFactorAgeMinutes: 0,
        secondFactorAgeMinutes: -1,
      },
    }
    const started = await fixture.owner.mutation(
      api.capabilityProviderOffboarding.startCase,
      await withSourceWrite('catalog_publish', command),
    )
    expect(started).toMatchObject({
      kind: 'available',
      status: { state: 'Freezing', routeabilityFrozen: false },
    })

    await backend.finishAllScheduledFunctions(vi.runAllTimers)
    await expect(fixture.owner.query(
      api.capabilityProviderOffboarding.readStatus,
      { businessId: fixture.businessId },
    )).resolves.toMatchObject({
      kind: 'available',
      status: {
        state: 'Retired',
        routeabilityFrozen: true,
        blockerCodes: [],
        retentionPolicyVersion: 'retention-policy:2026-09',
      },
    })
  })

  it('hides another Business owner’s offboarding case', async () => {
    const backend = convexTestWithMarketComponents()
    const fixture = await createPublishedBusinessOwner(backend, 'provider-offboarding-private')
    const foreign = await createPublishedBusinessOwner(backend, 'provider-offboarding-foreign')
    await fixture.owner.mutation(
      api.capabilityProviderOffboarding.startCase,
      await withSourceWrite('catalog_publish', {
        businessId: fixture.businessId,
        idempotencyKey: 'provider-offboarding:private',
        operationKey: 'provider-offboarding:private',
        correlationId: 'provider-offboarding:private',
        retentionPolicyVersion: 'retention-policy:2026-09',
        proof: {
          reverificationId: 'rev_provider_offboarding_private',
          firstFactorAgeMinutes: 0,
          secondFactorAgeMinutes: -1,
        },
      }),
    )
    await expect(foreign.owner.query(
      api.capabilityProviderOffboarding.readStatus,
      { businessId: fixture.businessId },
    )).resolves.toEqual({ kind: 'not_found' })
  })

  it('lets a bound supply Agent read status but hides another Account’s case', async () => {
    const backend = convexTestWithMarketComponents()
    const fixture = await createPublishedBusinessOwner(backend, 'provider-offboarding-agent-read')
    const foreign = await createPublishedBusinessOwner(backend, 'provider-offboarding-agent-foreign')
    const principal = await seedSupplyAgentPrincipal(backend, fixture.canonicalAccountRef, 'offboarding-agent-read')
    const foreignPrincipal = await seedSupplyAgentPrincipal(backend, foreign.canonicalAccountRef, 'offboarding-agent-foreign')
    await fixture.owner.mutation(
      api.capabilityProviderOffboarding.startCase,
      await withSourceWrite('catalog_publish', {
        businessId: fixture.businessId,
        idempotencyKey: 'provider-offboarding:agent-read',
        operationKey: 'provider-offboarding:agent-read',
        correlationId: 'provider-offboarding:agent-read',
        retentionPolicyVersion: 'retention-policy:2026-09',
        proof: {
          reverificationId: 'rev_provider_offboarding_agent_read',
          firstFactorAgeMinutes: 0,
          secondFactorAgeMinutes: -1,
        },
      }),
    )
    const readCommand = {
      businessId: fixture.businessId,
      operationKey: 'provider-offboarding:agent-status',
      correlationId: 'provider-offboarding:agent-status',
    }
    await expect(backend.mutation(
      api.capabilityProviderOffboarding.readAgentStatus,
      await withSourceWrite('catalog_publish', { ...readCommand, agentPrincipal: principal }),
    )).resolves.toMatchObject({ kind: 'available', status: { businessRef: String(fixture.businessId) } })
    await expect(backend.mutation(
      api.capabilityProviderOffboarding.readAgentStatus,
      await withSourceWrite('catalog_publish', { ...readCommand, agentPrincipal: foreignPrincipal }),
    )).resolves.toEqual({ kind: 'not_found' })
  })

  it('lets the Business owner cancel only before routeability freeze wins', async () => {
    const backend = convexTestWithMarketComponents()
    const fixture = await createPublishedBusinessOwner(backend, 'provider-offboarding-cancel')
    const started = await fixture.owner.mutation(
      api.capabilityProviderOffboarding.startCase,
      await withSourceWrite('catalog_publish', {
        businessId: fixture.businessId,
        idempotencyKey: 'provider-offboarding:cancel:start',
        operationKey: 'provider-offboarding:cancel:start',
        correlationId: 'provider-offboarding:cancel:start',
        retentionPolicyVersion: 'retention-policy:2026-09',
        proof: {
          reverificationId: 'rev_provider_offboarding_cancel_start',
          firstFactorAgeMinutes: 0,
          secondFactorAgeMinutes: -1,
        },
      }),
    )
    if (started.kind !== 'available') throw new Error('expected offboarding case')

    const cancelled = await fixture.owner.mutation(
      api.capabilityProviderOffboarding.cancelCase,
      await withSourceWrite('catalog_publish', {
        caseRef: started.status.caseRef,
        expectedRevision: started.status.revision,
        idempotencyKey: 'provider-offboarding:cancel:confirm',
        operationKey: 'provider-offboarding:cancel:confirm',
        correlationId: 'provider-offboarding:cancel:confirm',
        proof: {
          reverificationId: 'rev_provider_offboarding_cancel_confirm',
          firstFactorAgeMinutes: 0,
          secondFactorAgeMinutes: -1,
        },
      }),
    )
    expect(cancelled).toMatchObject({
      kind: 'available',
      status: { state: 'Cancelled', routeabilityFrozen: false },
    })

    await backend.finishAllScheduledFunctions(vi.runAllTimers)
    await expect(fixture.owner.query(
      api.capabilityProviderOffboarding.readStatus,
      { businessId: fixture.businessId },
    )).resolves.toMatchObject({
      kind: 'available',
      status: { state: 'Cancelled', routeabilityFrozen: false },
    })
  })

  it('refuses cancellation after the transactional routeability freeze wins', async () => {
    const backend = convexTestWithMarketComponents()
    const fixture = await createPublishedBusinessOwner(backend, 'provider-offboarding-freeze-wins')
    const started = await fixture.owner.mutation(
      api.capabilityProviderOffboarding.startCase,
      await withSourceWrite('catalog_publish', {
        businessId: fixture.businessId,
        idempotencyKey: 'provider-offboarding:freeze-wins:start',
        operationKey: 'provider-offboarding:freeze-wins:start',
        correlationId: 'provider-offboarding:freeze-wins:start',
        retentionPolicyVersion: 'retention-policy:2026-09',
        proof: {
          reverificationId: 'rev_provider_offboarding_freeze_wins_start',
          firstFactorAgeMinutes: 0,
          secondFactorAgeMinutes: -1,
        },
      }),
    )
    if (started.kind !== 'available') throw new Error('expected offboarding case')
    await backend.mutation(internal.capabilityProviderOffboarding.freezeRouteability, {
      caseRef: started.status.caseRef,
    })

    await expect(fixture.owner.mutation(
      api.capabilityProviderOffboarding.cancelCase,
      await withSourceWrite('catalog_publish', {
        caseRef: started.status.caseRef,
        expectedRevision: started.status.revision + 1,
        idempotencyKey: 'provider-offboarding:freeze-wins:cancel',
        operationKey: 'provider-offboarding:freeze-wins:cancel',
        correlationId: 'provider-offboarding:freeze-wins:cancel',
        proof: {
          reverificationId: 'rev_provider_offboarding_freeze_wins_cancel',
          firstFactorAgeMinutes: 0,
          secondFactorAgeMinutes: -1,
        },
      }),
    )).resolves.toEqual({ kind: 'refused', reason: 'routeability_freeze_accepted' })
  })

  it('refuses a new publication after Provider routeability is frozen', async () => {
    const backend = convexTestWithMarketComponents()
    const fixture = await createPublishedBusinessOwner(backend, 'provider-offboarding-publish-freeze')
    const offeringRef = 'catalog-offering:provider-offboarding-publish-freeze'
    const sourceHash = 'catalog-source:provider-offboarding-publish-freeze:v1'
    await seedCatalogOffering(backend, fixture.businessId, offeringRef, 1, 1, sourceHash)
    const prepared = await prepareOwnerPublicationCommand(
      backend,
      fixture.businessId,
      offeringRef,
      1,
      sourceHash,
      openApiSource('provider.offboarding.publish-freeze'),
      'provider-offboarding:publish-after-freeze',
      {
        kind: 'catalog_offering',
        offeringRef,
        offeringRevision: 1,
        offeringSourceHash: sourceHash,
      },
    )
    if (prepared.kind === 'refused') throw new Error(`publication preparation failed: ${prepared.reason}`)
    const started = await fixture.owner.mutation(
      api.capabilityProviderOffboarding.startCase,
      await withSourceWrite('catalog_publish', {
        businessId: fixture.businessId,
        idempotencyKey: 'provider-offboarding:publish-freeze:start',
        operationKey: 'provider-offboarding:publish-freeze:start',
        correlationId: 'provider-offboarding:publish-freeze:start',
        retentionPolicyVersion: 'retention-policy:2026-09',
        proof: {
          reverificationId: 'rev_provider_offboarding_publish_freeze_start',
          firstFactorAgeMinutes: 0,
          secondFactorAgeMinutes: -1,
        },
      }),
    )
    if (started.kind !== 'available') throw new Error('expected offboarding case')
    await backend.mutation(internal.capabilityProviderOffboarding.freezeRouteability, {
      caseRef: started.status.caseRef,
    })

    await expect(fixture.owner.mutation(
      api.capabilitySupply.publishPreparedCapability,
      prepared.command,
    )).resolves.toEqual({ kind: 'refused', reason: 'authorization_denied' })
  })

  it('retires more than the former 100-Operation ceiling in bounded workflow pages', async () => {
    const backend = convexTestWithMarketComponents()
    const fixture = await createPublishedBusinessOwner(backend, 'provider-offboarding-large-fleet')
    const offeringRef = 'catalog-offering:provider-offboarding-large-fleet'
    const sourceHash = 'catalog-source:provider-offboarding-large-fleet:v1'
    await seedCatalogOffering(backend, fixture.businessId, offeringRef, 1, 1, sourceHash)
    const prepared = await prepareOwnerPublicationCommand(
      backend,
      fixture.businessId,
      offeringRef,
      1,
      sourceHash,
      openApiSource('provider.offboarding.large-fleet'),
      'provider-offboarding:large-fleet:publish',
      {
        kind: 'catalog_offering',
        offeringRef,
        offeringRevision: 1,
        offeringSourceHash: sourceHash,
      },
    )
    if (prepared.kind === 'refused') throw new Error(`publication preparation failed: ${prepared.reason}`)
    await fixture.owner.mutation(api.capabilitySupply.publishPreparedCapability, prepared.command)
    await backend.run(async (ctx) => {
      const existing = await ctx.db.query('capabilityPublications')
        .withIndex('by_businessId_and_disposition', (index) => index
          .eq('businessId', fixture.businessId)
          .eq('disposition', 'current'))
        .unique()
      if (existing === null) throw new Error('expected fixture publication')
      const { _id: _existingId, _creationTime: _existingCreationTime, ...template } = existing
      for (let index = 1; index <= 100; index += 1) {
        await ctx.db.insert('capabilityPublications', {
          ...template,
          publicationRef: `${template.publicationRef}:offboarding:${index}`,
          createdAt: template.createdAt + index,
          updatedAt: template.updatedAt + index,
        })
      }
    })

    const started = await fixture.owner.mutation(
      api.capabilityProviderOffboarding.startCase,
      await withSourceWrite('catalog_publish', {
        businessId: fixture.businessId,
        idempotencyKey: 'provider-offboarding:large-fleet',
        operationKey: 'provider-offboarding:large-fleet',
        correlationId: 'provider-offboarding:large-fleet',
        retentionPolicyVersion: 'retention-policy:2026-09',
        proof: {
          reverificationId: 'rev_provider_offboarding_large_fleet',
          firstFactorAgeMinutes: 0,
          secondFactorAgeMinutes: -1,
        },
      }),
    )
    expect(started).toMatchObject({ kind: 'available', status: { state: 'Freezing' } })

    await backend.finishAllScheduledFunctions(vi.runAllTimers)
    await expect(fixture.owner.query(
      api.capabilityProviderOffboarding.readStatus,
      { businessId: fixture.businessId },
    )).resolves.toMatchObject({
      kind: 'available',
      status: { state: 'Retired', routeabilityFrozen: true },
    })
    await expect(backend.run(async (ctx) => await ctx.db.query('capabilityPublications')
      .withIndex('by_businessId_and_disposition', (index) => index
        .eq('businessId', fixture.businessId)
        .eq('disposition', 'current'))
      .take(1))).resolves.toHaveLength(0)
  })
})
