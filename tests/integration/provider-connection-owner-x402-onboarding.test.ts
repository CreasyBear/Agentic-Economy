import { convexTest } from 'convex-test'
import { RateLimiter } from '@convex-dev/rate-limiter'
import rateLimiterTest from '@convex-dev/rate-limiter/test'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { privateKeyToAccount } from 'viem/accounts'

import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import schema from '../../convex/schema'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  x402SellerClaimDigest,
  x402SellerClaimMessage,
} from '@/modules/capability-supply/public'
import { withSourceWrite } from '../helpers/source-write-admission'
import { convexModules } from '../helpers/convex-fixtures'
import { createPublishedBusinessOwner } from './capability-supply-owner-funnel-harness'

const ENDPOINT = 'https://provider.example/x402'
const SELLER = privateKeyToAccount(`0x${'31'.repeat(32)}`)

function connectionBackend() {
  const backend = convexTest(schema, convexModules)
  rateLimiterTest.register(backend)
  return backend
}

async function connectionCommand(
  businessId: Id<'businesses'>,
  operationKey: string,
  endpoint = ENDPOINT,
) {
  const claim = {
    businessId,
    endpointUrl: endpoint,
    method: 'POST' as const,
    observationDigest: canonicalDigest({ endpointUrl: endpoint, operationKey }),
    payTo: SELLER.address,
    expiresAt: Date.now() + 10 * 60_000,
  }
  return await withSourceWrite('catalog_publish', {
    businessId,
    resourceUrl: endpoint,
    commandId: operationKey,
    operationKey,
    correlationId: operationKey,
    method: claim.method,
    observationDigest: claim.observationDigest,
    payTo: claim.payTo,
    claimExpiresAt: claim.expiresAt,
    claimDigest: x402SellerClaimDigest(claim),
    claimSignature: await SELLER.signMessage({ message: x402SellerClaimMessage(claim) }),
    proof: {
      reverificationId: `rev_${canonicalDigest({ operationKey }).slice('sha256:'.length)}`,
      firstFactorAgeMinutes: 0,
      secondFactorAgeMinutes: -1,
    },
    evidenceRefs: [`x402-endpoint-inspection:${claim.observationDigest}`],
  })
}

describe('owner x402 connection onboarding', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('issues one endpoint-scoped owner grant and refreshes the same connection', async () => {
    const backend = connectionBackend()
    const fixture = await createPublishedBusinessOwner(backend, 'owner-x402-onboarding')

    const firstCommand = await connectionCommand(
      fixture.businessId,
      'owner-x402-connect:first',
    )
    const first = await fixture.owner.mutation(
      api.capabilityProviderConnections.connectX402Owner,
      firstCommand,
    )
    expect(first).toMatchObject({
      kind: 'applied',
      connection: {
        businessId: String(fixture.businessId),
        lifecycle: 'active',
        authorityGeneration: 1,
      },
    })
    if (first.kind !== 'applied') throw new Error('owner_x402_connect_failed')

    const healthCommand = await withSourceWrite('catalog_publish', {
      connectionRef: first.connection.connectionRef,
      commandId: 'owner-x402-health:first',
      operationKey: 'owner-x402-health:first',
      correlationId: 'owner-x402-health:first',
      expectedAuthorityGeneration: first.connection.authorityGeneration,
      expectedAuthorityDigest: first.connection.authorityDigest,
      method: 'POST' as const,
      resourceUrl: ENDPOINT,
      payee: SELLER.address,
      status: 'healthy' as const,
      checkedAt: Date.now(),
      observationDigest: canonicalDigest({ kind: 'test-health', endpoint: ENDPOINT }),
    })
    const {
      sourceWrite: _healthSourceWrite,
      sourceWriteRequest: _healthSourceWriteRequest,
      ...healthReplayMaterial
    } = healthCommand
    await expect(fixture.owner.mutation(
      api.capabilityProviderConnections.checkX402Owner,
      await withSourceWrite('catalog_publish', healthReplayMaterial),
    )).resolves.toMatchObject({
      kind: 'applied',
      connection: {
        authorityGeneration: 1,
        healthStatus: 'healthy',
        healthSubject: SELLER.address,
      },
    })
    await expect(fixture.owner.mutation(
      api.capabilityProviderConnections.checkX402Owner,
      healthCommand,
    )).resolves.toMatchObject({ kind: 'duplicate', connection: { authorityGeneration: 1 } })

    await expect(fixture.owner.mutation(
      api.capabilityProviderConnections.connectX402Owner,
      await withSourceWrite('catalog_publish', (() => {
        const {
          sourceWrite: _sourceWrite,
          sourceWriteRequest: _sourceWriteRequest,
          ...command
        } = firstCommand
        return command
      })()),
    )).resolves.toMatchObject({
      kind: 'duplicate',
      connection: { authorityGeneration: 1 },
    })

    const second = await fixture.owner.mutation(
      api.capabilityProviderConnections.connectX402Owner,
      await connectionCommand(fixture.businessId, 'owner-x402-connect:refresh'),
    )
    expect(second).toMatchObject({
      kind: 'applied',
      connection: {
        connectionRef: first.kind === 'applied' ? first.connection.connectionRef : '',
        lifecycle: 'active',
        authorityGeneration: 2,
      },
    })
    if (second.kind !== 'applied') throw new Error('owner_x402_reauthorize_failed')
    expect(second.connection).not.toHaveProperty('healthStatus')
    expect(second.connection).not.toHaveProperty('healthCheckedAt')
    expect(second.connection).not.toHaveProperty('healthSubject')
    expect(second.connection).not.toHaveProperty('healthReasonCode')

    const stored = await backend.run(async (ctx) => ({
      connections: await ctx.db.query('capabilityProviderConnections').collect(),
      grants: await ctx.db.query('authorityDelegationGrants').collect(),
      healthEvents: (await ctx.db.query('auditEvents').collect())
        .filter((row) => row.eventType === 'connection.health_checked'),
      lifecycleEvents: (await ctx.db.query('auditEvents').collect())
        .filter((row) => row.eventType === 'connection.connected' || row.eventType === 'connection.reauthorized'),
    }))
    expect(stored.connections).toHaveLength(1)
    expect(stored.connections[0]?.evidenceRefs.filter((ref) =>
      ref.startsWith('x402-endpoint-inspection:'))).toHaveLength(1)
    expect(stored.connections[0]?.evidenceRefs.filter((ref) =>
      ref.startsWith('x402-payee-claim:'))).toHaveLength(1)
    expect(stored.grants).toHaveLength(1)
    expect(stored.healthEvents).toHaveLength(1)
    expect(stored.healthEvents[0]).toMatchObject({
      activeAccountRef: fixture.canonicalAccountRef,
      sourceSystem: 'provider_observed',
      targetType: 'provider_connection',
      targetRef: first.connection.connectionRef,
      afterState: 'healthy',
      authorityGeneration: 1,
    })
    expect(stored.healthEvents[0]?.redactedPayloadJson).not.toMatch(/signature|private[_-]?key/iu)
    expect(stored.lifecycleEvents.map((event) => event.eventType).sort()).toEqual([
      'connection.connected',
      'connection.reauthorized',
    ])
    expect(JSON.stringify(stored.lifecycleEvents)).not.toMatch(/claimSignature|payment-required|private[_-]?key/iu)
    expect(stored.grants[0]).toMatchObject({
      accountRef: fixture.canonicalAccountRef,
      actorPrincipalRef: fixture.canonicalPrincipalRef,
      subjectPrincipalRef: fixture.canonicalPrincipalRef,
      lifecycle: 'active',
      scopes: [
        'connection:install',
        'connection:refresh',
        'connection:revoke',
      ],
      resourceRefs: expect.arrayContaining([
        'connection-provider:x402',
        `connection-provider:x402:${ENDPOINT}`,
        `connection:${stored.connections[0]?.connectionRef}`,
      ]),
    })
    expect(stored.grants[0]?.expiresAt).toBeGreaterThan(Date.now())
    expect(stored.grants[0]?.expiresAt).toBeLessThan(Date.now() + 61 * 24 * 60 * 60_000)
  })

  it('requires one strict proof before creating either a connection or its owner grant', async () => {
    const backend = connectionBackend()
    const fixture = await createPublishedBusinessOwner(backend, 'owner-x402-proof-required')
    const command = await connectionCommand(fixture.businessId, 'owner-x402-without-proof')
    const {
      proof: _proof,
      sourceWrite: _sourceWrite,
      sourceWriteRequest: _sourceWriteRequest,
      ...withoutProofMaterial
    } = command

    await expect(fixture.owner.mutation(
      api.capabilityProviderConnections.connectX402Owner,
      await withSourceWrite('catalog_publish', withoutProofMaterial),
    )).resolves.toEqual({ kind: 'refused', code: 'reauthentication_required' })

    const stored = await backend.run(async (ctx) => ({
      connections: await ctx.db.query('capabilityProviderConnections').collect(),
      grants: await ctx.db.query('authorityDelegationGrants').collect(),
      proofs: await ctx.db.query('consequenceProofUses').collect(),
      audits: await ctx.db.query('auditEvents').collect(),
    }))
    expect(stored).toMatchObject({ connections: [], grants: [], proofs: [], audits: [] })
  })

  it('fails closed with a correlation reference when rate-limit storage is unavailable', async () => {
    const backend = connectionBackend()
    const fixture = await createPublishedBusinessOwner(backend, 'owner-x402-rate-storage-outage')
    vi.spyOn(RateLimiter.prototype, 'limit')
      .mockRejectedValue(new Error('rate-limit component unavailable'))
    const command = await connectionCommand(fixture.businessId, 'owner-x402-rate-storage-outage')

    await expect(fixture.owner.mutation(
      api.capabilityProviderConnections.connectX402Owner,
      command,
    )).resolves.toEqual({
      kind: 'refused',
      code: 'security_control_unavailable',
      correlationRef: 'owner-x402-rate-storage-outage',
    })

    const stored = await backend.run(async (ctx) => ({
      connections: await ctx.db.query('capabilityProviderConnections').collect(),
      grants: await ctx.db.query('authorityDelegationGrants').collect(),
      proofs: await ctx.db.query('consequenceProofUses').collect(),
      audits: await ctx.db.query('auditEvents').collect(),
    }))
    expect(stored).toMatchObject({ connections: [], grants: [], proofs: [], audits: [] })
  })

  it('refuses reuse of a strict proof for a changed connection command', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
    const backend = connectionBackend()
    const fixture = await createPublishedBusinessOwner(backend, 'owner-x402-proof-command-binding')
    const firstCommand = await connectionCommand(fixture.businessId, 'owner-x402-proof:first')
    await expect(fixture.owner.mutation(
      api.capabilityProviderConnections.connectX402Owner,
      firstCommand,
    )).resolves.toMatchObject({ kind: 'applied', connection: { authorityGeneration: 1 } })

    const changedCommand = await connectionCommand(fixture.businessId, 'owner-x402-proof:changed')
    const {
      proof: _changedProof,
      sourceWrite: _sourceWrite,
      sourceWriteRequest: _sourceWriteRequest,
      ...changedMaterial
    } = changedCommand
    await expect(fixture.owner.mutation(
      api.capabilityProviderConnections.connectX402Owner,
      await withSourceWrite('catalog_publish', {
        ...changedMaterial,
        proof: firstCommand.proof,
      }),
    )).resolves.toEqual({ kind: 'refused', code: 'command_changed' })

    vi.advanceTimersByTime(1_000)
    const reusedCommandId = await connectionCommand(fixture.businessId, 'owner-x402-proof:first')
    const {
      proof: _reusedProof,
      sourceWrite: _reusedSourceWrite,
      sourceWriteRequest: _reusedSourceWriteRequest,
      ...reusedMaterial
    } = reusedCommandId
    await expect(fixture.owner.mutation(
      api.capabilityProviderConnections.connectX402Owner,
      await withSourceWrite('catalog_publish', {
        ...reusedMaterial,
        proof: firstCommand.proof,
      }),
    )).resolves.toEqual({ kind: 'refused', code: 'command_changed' })

    const stored = await backend.run(async (ctx) => ({
      connections: await ctx.db.query('capabilityProviderConnections').collect(),
      grants: await ctx.db.query('authorityDelegationGrants').collect(),
      proofs: await ctx.db.query('consequenceProofUses').collect(),
    }))
    expect(stored.connections).toHaveLength(1)
    expect(stored.connections[0]?.authorityGeneration).toBe(1)
    expect(stored.grants).toHaveLength(1)
    expect(stored.proofs).toHaveLength(1)
  })

  it('resolves the exact endpoint grant after more than 32 sibling grants exist', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
    const backend = connectionBackend()
    const fixture = await createPublishedBusinessOwner(backend, 'owner-x402-many-endpoints')
    const results = []
    for (let index = 0; index < 33; index += 1) {
      results.push(await fixture.owner.mutation(
        api.capabilityProviderConnections.connectX402Owner,
        await connectionCommand(
          fixture.businessId,
          `owner-x402-connect:${index}`,
          `https://provider-${index}.example/x402`,
        ),
      ))
      vi.advanceTimersByTime(11 * 60_000)
    }
    expect(results.every((result) => result.kind === 'applied')).toBe(true)

    await expect(fixture.owner.mutation(
      api.capabilityProviderConnections.connectX402Owner,
      await connectionCommand(
        fixture.businessId,
        'owner-x402-connect:first-refresh',
        'https://provider-0.example/x402',
      ),
    )).resolves.toMatchObject({
      kind: 'applied',
      connection: { authorityGeneration: 2 },
    })

    const stored = await backend.run(async (ctx) => ({
      connections: await ctx.db.query('capabilityProviderConnections').collect(),
      grants: await ctx.db.query('authorityDelegationGrants').collect(),
    }))
    expect(stored.connections).toHaveLength(33)
    expect(stored.grants).toHaveLength(33)
  })

  it('replays within a renewal window and rotates the grant on a later refresh', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-15T00:00:00.000Z'))
    const backend = connectionBackend()
    const fixture = await createPublishedBusinessOwner(backend, 'owner-x402-grant-renewal')
    const firstCommand = await connectionCommand(fixture.businessId, 'owner-x402-renew:first')
    const first = await fixture.owner.mutation(
      api.capabilityProviderConnections.connectX402Owner,
      firstCommand,
    )
    expect(first.kind).toBe('applied')
    const firstState = await backend.run(async (ctx) => ({
      connection: (await ctx.db.query('capabilityProviderConnections').collect())[0],
      grants: await ctx.db.query('authorityDelegationGrants').collect(),
    }))
    expect(firstState.grants).toHaveLength(1)

    await expect(fixture.owner.mutation(
      api.capabilityProviderConnections.connectX402Owner,
      await withSourceWrite('catalog_publish', (() => {
        const { sourceWrite: _sourceWrite, sourceWriteRequest: _sourceWriteRequest, ...command } = firstCommand
        return command
      })()),
    )).resolves.toMatchObject({ kind: 'duplicate' })
    expect((await backend.run(async (ctx) => ctx.db.query('authorityDelegationGrants').collect())))
      .toHaveLength(1)

    vi.setSystemTime(new Date('2026-02-15T00:00:00.000Z'))
    await expect(fixture.owner.mutation(
      api.capabilityProviderConnections.connectX402Owner,
      await connectionCommand(fixture.businessId, 'owner-x402-renew:refresh'),
    )).resolves.toMatchObject({
      kind: 'applied',
      connection: { authorityGeneration: 2 },
    })
    const renewed = await backend.run(async (ctx) => ({
      connection: (await ctx.db.query('capabilityProviderConnections').collect())[0],
      grants: await ctx.db.query('authorityDelegationGrants').collect(),
    }))
    expect(renewed.grants).toHaveLength(2)
    expect(renewed.connection?.authorityGrantRef).not.toBe(firstState.connection?.authorityGrantRef)
    expect(renewed.grants.every((grant) => grant.expiresAt < Number.MAX_SAFE_INTEGER)).toBe(true)
  })
})
