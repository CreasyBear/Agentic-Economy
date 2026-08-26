import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'

import { api, internal } from '../../convex/_generated/api'
import schema from '../../convex/schema'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { probeRequestDigest } from '@/modules/capability-supply/public'
import { convexModules as modules } from '../helpers/convex-fixtures'
import {
  createPublishedBusinessOwner,
  prepareOwnerPublicationCommand,
  seedCatalogOffering,
  x402Source,
} from './capability-supply-owner-funnel-harness'
import { installCanonicalProviderConnectionFixture } from './capability-publication-harness'

describe('owner supply test', () => {
  it('completes x402 Test only from the exact fresh no-payment challenge', async () => {
    const backend = convexTest(schema, modules)
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
      installCanonicalProviderConnectionFixture(backend, {
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
    const targetResult = await backend.query(
      internal.capabilitySupply.readCapabilityProbeTarget,
      {
        publicationRef: published.publicationRef,
        expectedRevision: published.publicationRevision,
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
      }),
    ).resolves.toMatchObject({
      step: 'test',
      state: 'completed',
      message: expect.stringContaining('No payment was sent'),
    })
    await expect(
      backend.run(async () => []),
    ).resolves.toEqual([])

    const patchReadiness = async (patch: Record<string, unknown>) => {
      await backend.run(async (ctx) => {
        const publication = await ctx.db
          .query('capabilityPublications')
          .withIndex('by_publicationRef_and_revision', (q) =>
            q
              .eq('publicationRef', published.publicationRef)
              .eq('revision', published.publicationRevision),
          )
          .unique()
        if (publication === null)
          throw new Error('owner_x402_publication_missing')
        await ctx.db.patch(publication._id, patch)
      })
    }
    await patchReadiness({
      readinessTargetDigest: canonicalDigest('mismatched-target'),
    })
    await expect(readTestState()).resolves.toBe('in_progress')
    await patchReadiness({
      readinessTargetDigest: observation.targetDigest,
    })
    await patchReadiness({
      readinessRequestDigest: canonicalDigest('mismatched-request'),
    })
    await expect(readTestState()).resolves.toBe('in_progress')
    await patchReadiness({
      readinessRequestDigest: observation.requestDigest,
      readinessEvidenceRefs: ['probe:x402_payment_required_mismatch'],
    })
    await expect(readTestState()).resolves.toBe('in_progress')
    await patchReadiness({
      readinessEvidenceRefs: observation.evidenceRefs,
      readinessValidUntil: now - 1,
    })
    await expect(readTestState()).resolves.toBe('not_started')
    await patchReadiness({ publisherRef: 'credential:forged-readiness-publisher' })
    await expect(backend.query(internal.capabilitySupply.readCapabilityProbeTarget, {
      publicationRef: published.publicationRef,
      expectedRevision: published.publicationRevision,
    })).resolves.toEqual({
      kind: 'unavailable',
      reason: 'authority_stale',
      evidenceRefs: ['probe-target:authority-stale'],
    })
  })
})
