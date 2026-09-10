import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { api, internal } from '../../convex/_generated/api'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { probeRequestDigest } from '@/modules/capability-supply/public'
import { convexTestWithMarketComponents } from '../helpers/convex-fixtures'
import {
  createPublishedBusinessOwner,
  prepareOwnerPublicationCommand,
  seedCatalogOffering,
  x402Source,
} from './capability-supply-owner-funnel-harness'
import { installProviderConnectionFixture } from './capability-publication-harness'

describe('owner supply test', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('does not turn an exact fresh no-payment challenge into a paid canary or publication authority', async () => {
    const backend = convexTestWithMarketComponents()
    const { businessId, owner } = await createPublishedBusinessOwner(
      backend,
      'owner-x402-test',
    )
    const offeringRef = 'catalog-offering:owner-x402-test'
    const sourceHash = 'catalog-source:owner-x402-test:v1'
    const endpoint = 'https://provider.example/paid-lookup'
    await seedCatalogOffering(
      backend,
      businessId,
      offeringRef,
      1,
      1,
      sourceHash,
    )
    const now = Date.now()
    await expect(
      installProviderConnectionFixture(backend, {
        connectionRef: 'connection:owner:x402',
        businessId,
        providerRef: 'provider:owner:x402',
        providerAccountRef: 'account:owner:x402',
        adapterId: 'x402-fetch:v2',
        secretRef: null,
        scopes: ['payment:challenge'],
        resources: [endpoint],
        evidenceRefs: ['connection:owner:x402'],
        commandId: 'connection:owner:x402:create',
      }),
    ).resolves.toMatchObject({ kind: 'applied' })
    const prepared = await prepareOwnerPublicationCommand(
      backend,
      businessId,
      offeringRef,
      1,
      sourceHash,
      x402Source(),
      'owner-supply:owner-x402-test',
      {
        kind: 'catalog_offering',
        offeringRef,
        offeringRevision: 1,
        offeringSourceHash: sourceHash,
      },
    )
    if (prepared.kind === 'refused')
      throw new Error(`owner_x402_prepare_failed:${prepared.reason}`)
    const published = await owner.mutation(
      api.capabilitySupply.publishPreparedCapability,
      prepared.command,
    )
    if (published.kind !== 'published')
      throw new Error(`owner_x402_publish_failed:${published.kind}`)
    await backend.finishAllScheduledFunctions(vi.runAllTimers)
    const targetResult = await backend.query(
      internal.capabilitySupply.readCapabilityProbeTarget,
      {
        publicationRef: published.publicationRef,
        expectedRevision: published.publicationRevision,
        now: Date.now(),
      },
    )
    if (targetResult.kind !== 'available')
      throw new Error(`owner_x402_target_failed:${targetResult.reason}`)
    const observation = {
      publicationRef: published.publicationRef,
      expectedRevision: published.publicationRevision,
      targetDigest: targetResult.target.targetDigest,
      requestDigest: probeRequestDigest(targetResult.target),
      responseStatus: 402,
      responseDigest: canonicalDigest(''),
      outcome: 'healthy' as const,
      credentialState: 'ready' as const,
      healthState: 'healthy' as const,
      observedAt: now,
      validUntil: now + 60_000,
      evidenceRefs: [
        'probe:credential_not_required',
        'probe:target_public',
        'probe:x402_payment_required_valid',
      ],
      resourceAuthority: targetResult.target.resourceAuthority,
    }
    await expect(
      backend.mutation(
        internal.capabilitySupply.recordCapabilityProbeResult,
        observation,
      ),
    ).resolves.toMatchObject({ kind: 'observed' })
    await expect(
      backend.mutation(
        internal.capabilitySupply.recordCapabilityProbeResult,
        observation,
      ),
    ).resolves.toMatchObject({
      kind: 'observed',
      publicationRef: published.publicationRef,
      revision: published.publicationRevision,
    })
    const admissionCases = await backend.run(async (ctx) => (
      await ctx.db.query('capabilitySupplyAdmissionCases')
        .withIndex('by_publicationRef_and_revision', (query) => (
          query.eq('publicationRef', published.publicationRef)
            .eq('publicationRevision', published.publicationRevision)
        ))
        .collect()
    ))
    expect(admissionCases).toHaveLength(1)
    expect(admissionCases[0]).toMatchObject({
      state: 'completed',
      terminalDecision: 'published',
      blockerRefs: [],
      reviewStartedAt: expect.any(Number),
      completedAt: expect.any(Number),
    })

    const readTestState = async () => {
      const readback = await owner.query(
        api.capabilitySupplyOwnerFunnel.readOwnerSupplyFunnel,
        { businessId },
      )
      if (readback.kind !== 'available')
        throw new Error(`owner_x402_readback_failed:${readback.kind}`)
      return readback.offerings[0]?.stepStates.test
    }
    await expect(readTestState()).resolves.toBe('completed')
    await expect(
      owner.action(api.capabilitySupplyOwnerSupply.runOwnerSupplyTest, {
        businessId,
        offeringRef,
        offeringRevision: 1,
        offeringSourceHash: sourceHash,
        publicationRef: published.publicationRef,
        publicationRevision: published.publicationRevision,
        operationKey: 'owner-x402-test',
        correlationId: 'owner-x402-test:direct-action',
        input: {},
      }),
    ).resolves.toMatchObject({
      step: 'test',
      state: 'refused',
    })
    await expect(
      backend.run(async () => []),
    ).resolves.toEqual([])
  })
})
