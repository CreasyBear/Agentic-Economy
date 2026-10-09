import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { encodePaymentRequiredHeader } from '@x402/core/http'
import { validatePaymentRequired } from '@x402/core/schemas'

import { api, internal } from '../../convex/_generated/api'
import { runCapabilityReadinessProbe } from '@/modules/capability-supply/server'
import { defaultDnsResolver } from '@/modules/network-guard/public'
import * as networkGuard from '@/modules/network-guard/server'
import { convexTestWithMarketComponents } from '../helpers/convex-fixtures'
import {
  createPublishedBusinessOwner,
  prepareOwnerPublicationCommand,
  seedCatalogOffering,
  x402Source,
} from './capability-supply-owner-funnel-harness'
import { installProviderConnectionFixture } from './capability-publication-harness'

describe('owner supply test', () => {
  let fixtureBackend: ReturnType<typeof convexTestWithMarketComponents> | undefined
  beforeEach(() => {
    vi.useFakeTimers()
    // The direct challenge probe below owns its send fixture. Registered owner
    // and scheduled probes must not depend on the live demo host or DNS.
    vi.spyOn(defaultDnsResolver, 'lookup').mockResolvedValue([{ address: '93.184.216.34', family: 4 }])
    vi.spyOn(networkGuard, 'sendGuardedHttpRequest').mockImplementation(async () => new Response(null, { status: 503 }))
  })
  afterEach(async () => {
    try {
      await fixtureBackend?.finishAllScheduledFunctions(() => vi.runOnlyPendingTimers())
    } finally {
      fixtureBackend = undefined
      vi.restoreAllMocks()
      vi.useRealTimers()
    }
  })

  it.each([false, true])('publishes an owner-authorized Tool only when the 402 payment challenge is valid: %s', async (validChallenge) => {
    const backend = convexTestWithMarketComponents()
    fixtureBackend = backend
    const { businessId, owner } = await createPublishedBusinessOwner(
      backend,
      'owner-x402-test',
    )
    const offeringRef = 'catalog-offering:owner-x402-test'
    const sourceHash = 'catalog-source:owner-x402-test:v1'
    const endpoint = 'https://agentic-economy-sandbox-tools.vercel.app/x402/execute'
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
      x402Source('sandbox', endpoint),
      'owner-supply:owner-x402-test',
      {
        kind: 'catalog_offering',
        offeringRef,
        offeringRevision: 1,
        offeringSourceHash: sourceHash,
      },
      'sandbox',
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
        now: Date.now(),
      },
    )
    if (targetResult.kind !== 'available')
      throw new Error(`owner_x402_target_failed:${targetResult.reason}`)
    const source = x402Source('sandbox', endpoint)
    if (typeof source.resource !== 'object' || source.resource === null
      || !('paymentRequired' in source.resource)) throw new Error('payment_challenge_missing')
    const paymentRequired = validatePaymentRequired(source.resource.paymentRequired)
    if (paymentRequired.x402Version !== 2) throw new Error('payment_challenge_v2_required')
    const send = vi.fn(async () => new Response(null, {
      status: 402,
      headers: validChallenge ? {
        'Payment-Required': encodePaymentRequiredHeader(
          paymentRequired as Parameters<typeof encodePaymentRequiredHeader>[0],
        ),
      } : {},
    }))
    const observed = await runCapabilityReadinessProbe(targetResult.target, {
      resolveProviderConnectionCredential: async () => undefined,
      validateTarget: async () => true,
      send,
      now: () => now,
    })
    expect(send).toHaveBeenCalledOnce()
    expect(observed.responseStatus).toBe(402)
    expect(observed.outcome).toBe(validChallenge ? 'healthy' : 'response_invalid')
    expect(observed.evidenceRefs).toContain(validChallenge
      ? 'probe:x402_payment_required_valid' : 'probe:x402_payment_required_invalid')
    expect(observed.evidenceRefs).not.toContain(validChallenge
      ? 'probe:x402_payment_required_invalid' : 'probe:x402_payment_required_valid')
    const observation = {
      publicationRef: published.publicationRef,
      expectedRevision: published.publicationRevision,
      ...observed,
      evidenceRefs: [...observed.evidenceRefs],
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
    expect(admissionCases[0]?.terminalDecision).toBe(validChallenge ? 'published' : 'action_required')

    const readTestState = async () => {
      const readback = await owner.query(
        api.capabilitySupplyOwnerFunnel.readOwnerSupplyFunnel,
        { businessId },
      )
      if (readback.kind !== 'available')
        throw new Error(`owner_x402_readback_failed:${readback.kind}`)
      return readback.offerings[0]?.stepStates.test
    }
    await expect(readTestState()).resolves.not.toBe(undefined)
    await expect(
      owner.action(internal.capabilitySupplyOwnerSupply.runOwnerSupplyTest, {
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
      refusal: 'health_unhealthy',
    })
    await expect(
      backend.run(async ctx => ({
        calls: await ctx.db.query('capabilityCalls').collect(),
        payments: await ctx.db.query('moneyX402PaymentAttempts').collect(),
      })),
    ).resolves.toEqual({ calls: [], payments: [] })
    expect(networkGuard.sendGuardedHttpRequest).toHaveBeenCalled()
  })
})
