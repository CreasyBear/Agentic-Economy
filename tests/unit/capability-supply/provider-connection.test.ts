import { describe, expect, it } from 'vitest'

import {
  beginProviderConnectionRevocation,
  createProviderConnection,
  projectProviderConnectionPublic,
  recordProviderConnectionCleanupResult,
  reauthorizeProviderConnection,
  resolveProviderConnectionCredentialRef,
  type CreateProviderConnectionCommand,
  type ProviderConnection,
} from '@/modules/capability-supply/provider-connection'

const baseCommand: CreateProviderConnectionCommand = {
  commandId: 'command:create:one',
  connectionRef: 'connection:one',
  businessId: 'business:one',
  providerRef: 'provider:one',
  providerAccountRef: 'account:one',
  adapterId: 'http-json:v1',
  credentialRef: 'env:PROVIDER_SECRET',
  requestedScopes: ['orders:read', 'profile:read'],
  grantedScopes: ['profile:read'],
  requestedResources: ['account:one', 'orders'],
  grantedResources: ['orders'],
  evidenceRefs: ['evidence:create'],
}

function create(now = 1_000): ProviderConnection {
  const result = createProviderConnection(baseCommand, now)
  if (result.kind !== 'applied') throw new Error(`create failed: ${result.kind}`)
  return result.connection
}

function cleanupCommand(current: ProviderConnection, outcome: 'succeeded' | 'failed', commandId: string) {
  return {
    commandId,
    expectedAuthorityGeneration: current.authorityGeneration,
    expectedAuthorityDigest: current.authorityDigest,
    outcome,
    evidenceRefs: [`evidence:${outcome}`],
  } as const
}

describe('provider connection domain', () => {
  it('narrows requested scopes/resources and stores sorted unique grants', () => {
    const result = createProviderConnection({
      ...baseCommand,
      commandId: 'command:create:narrowing',
      requestedScopes: ['z', 'a', 'z'],
      grantedScopes: ['z', 'z'],
      requestedResources: ['resource:b', 'resource:a'],
      grantedResources: ['resource:b', 'resource:b'],
    }, 1_000)

    expect(result).toMatchObject({ kind: 'applied' })
    if (result.kind !== 'applied') return
    expect(result.connection.grantedScopes).toEqual(['z'])
    expect(result.connection.grantedResources).toEqual(['resource:b'])
    expect(createProviderConnection({
      ...baseCommand,
      commandId: 'command:create:scope-widened',
      requestedScopes: ['profile:read'],
      grantedScopes: ['orders:write'],
    }, 1_000)).toEqual({ kind: 'refused', code: 'invalid_scope' })
  })

  it('increments generation and makes the prior authority stale on reauthorization', () => {
    const current = create()
    const result = reauthorizeProviderConnection(current, {
      ...baseCommand,
      commandId: 'command:reauthorize:one',
      credentialRef: 'env:PROVIDER_SECRET_V2',
      expectedAuthorityGeneration: current.authorityGeneration,
      expectedAuthorityDigest: current.authorityDigest,
      evidenceRefs: ['evidence:reauthorize'],
    }, 2_000)

    expect(result).toMatchObject({ kind: 'applied' })
    if (result.kind !== 'applied') return
    expect(result.connection.authorityGeneration).toBe(2)
    expect(result.connection.authorityDigest).not.toBe(current.authorityDigest)
    const expiringResult = createProviderConnection({
      ...baseCommand,
      commandId: 'command:create:expiring',
      expiresAt: 1_500,
    }, 1_000)
    if (expiringResult.kind !== 'applied') throw new Error('expiring_create_failed')
    const expiryCleared = reauthorizeProviderConnection(expiringResult.connection, {
      ...baseCommand,
      commandId: 'command:reauthorize:clears-expiry',
      expectedAuthorityGeneration: expiringResult.connection.authorityGeneration,
      expectedAuthorityDigest: expiringResult.connection.authorityDigest,
      evidenceRefs: [],
    }, 1_200)
    expect(expiryCleared).toMatchObject({ kind: 'applied' })
    if (expiryCleared.kind === 'applied') expect(expiryCleared.connection.expiresAt).toBeUndefined()

    expect(reauthorizeProviderConnection(result.connection, {
      ...baseCommand,
      commandId: 'command:reauthorize:stale',
      expectedAuthorityGeneration: current.authorityGeneration,
      expectedAuthorityDigest: current.authorityDigest,
      evidenceRefs: [],
    }, 3_000)).toEqual({ kind: 'refused', code: 'invalid_generation' })
  })

  it('removes active authority locally before remote cleanup', () => {
    const current = create()
    const result = beginProviderConnectionRevocation(current, {
      commandId: 'command:revoke:one',
      expectedAuthorityGeneration: current.authorityGeneration,
      expectedAuthorityDigest: current.authorityDigest,
      reasonCode: 'owner_requested',
      evidenceRefs: ['evidence:revoke'],
    }, 2_000)

    expect(result).toMatchObject({ kind: 'applied', connection: { lifecycle: 'revocation_pending' } })
    if (result.kind !== 'applied') return
    expect(result.connection.credentialRef).toBe(current.credentialRef)
    expect(resolveProviderConnectionCredentialRef(
      result.connection,
      result.connection.authorityGeneration,
      result.connection.authorityDigest,
      2_000,
    )).toEqual({ kind: 'unavailable', reason: 'inactive' })
  })

  it('retains credential custody after cleanup failure', () => {
    const current = create()
    const revoked = beginProviderConnectionRevocation(current, {
      commandId: 'command:revoke:failure',
      expectedAuthorityGeneration: current.authorityGeneration,
      expectedAuthorityDigest: current.authorityDigest,
      evidenceRefs: [],
    }, 2_000)
    if (revoked.kind !== 'applied') throw new Error('revocation failed')

    const result = recordProviderConnectionCleanupResult(revoked.connection, cleanupCommand(revoked.connection, 'failed', 'command:cleanup:failure'), 3_000)
    expect(result).toMatchObject({ kind: 'applied', connection: { lifecycle: 'cleanup_required' } })
    if (result.kind !== 'applied') return
    expect(result.connection.credentialRef).toBe('env:PROVIDER_SECRET')
  })

  it('clears credential custody only after explicit cleanup success', () => {
    const current = create()
    const revoked = beginProviderConnectionRevocation(current, {
      commandId: 'command:revoke:success',
      expectedAuthorityGeneration: current.authorityGeneration,
      expectedAuthorityDigest: current.authorityDigest,
      evidenceRefs: [],
    }, 2_000)
    if (revoked.kind !== 'applied') throw new Error('revocation failed')

    const result = recordProviderConnectionCleanupResult(revoked.connection, cleanupCommand(revoked.connection, 'succeeded', 'command:cleanup:success'), 3_000)
    expect(result).toMatchObject({ kind: 'applied', connection: { lifecycle: 'revoked', credentialRef: null } })
  })

  it('keeps public connection projection secret-free', () => {
    const projection = projectProviderConnectionPublic(create())
    expect(projection).toEqual({ lifecycle: 'active', available: true, reasonCode: null })
    expect('credentialRef' in projection).toBe(false)
    expect(JSON.stringify(projection)).not.toContain('PROVIDER_SECRET')
  })
})
