import { describe, expect, it } from 'vitest'

import {
  beginProviderConnectionRevocation,
  createProviderConnection,
  createX402ProviderConnection,
  invalidateProviderConnectionLease,
  issueProviderConnectionLease,
  projectProviderConnectionOwner,
  projectProviderConnectionPublic,
  providerConnectionAuthorityProvenanceIsValid,
  providerConnectionCleanupRequestDigest,
  providerConnectionLeaseAuthoritySnapshot,
  recordProviderConnectionCleanupResult,
  reauthorizeProviderConnection,
  resolveProviderConnectionCredentialRef,
  resolveProviderConnectionCredentialRefForLease,
  validateProviderConnectionLeaseAuthority,
  withProviderConnectionAuthority,
  type CreateProviderConnectionCommand,
  type ProviderConnection,
  type ProviderConnectionCleanupOutcome,
  type ProviderConnectionLeaseApproval,
} from '@/modules/capability-supply/provider-connection'

const baseCommand: CreateProviderConnectionCommand = {
  commandId: 'command:create:one',
  connectionRef: 'connection:one',
  owningAccountRef: 'account:owner',
  installedByPrincipalRef: 'principal:owner',
  authorityGrantRef: 'grant:connection',
  authorityGrantGeneration: 1,
  secretRef: 'env:PROVIDER_SECRET',
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

const x402Authority = {
  owningAccountRef: 'account:owner',
  installedByPrincipalRef: 'principal:owner',
  authorityGrantRef: 'grant:connection',
  authorityGrantGeneration: 1,
} as const
function approvalFor(current: ProviderConnection, decision: ProviderConnectionLeaseApproval['decision'] = 'granted'): ProviderConnectionLeaseApproval {
  return {
    decisionRef: 'decision:provider:one',
    decisionDigest: `sha256:${'b'.repeat(64)}`,
    providerRef: current.providerRef,
    providerAccountRef: current.providerAccountRef,
    connectionRef: current.connectionRef,
    authorityGeneration: current.authorityGeneration,
    connectionAuthorityDigest: current.authorityDigest,
    decision,
    grantedScopes: [...current.grantedScopes],
    grantedResources: [...current.grantedResources],
  }
}

function leaseCommand(current: ProviderConnection, overrides: Partial<Parameters<typeof issueProviderConnectionLease>[1]> = {}) {
  return {
    commandId: 'command:lease:one',
    leaseRef: 'lease:one',
    invocationRef: 'invocation:one',
    operationRef: 'operation:one',
    connectionRef: current.connectionRef,
    providerRef: current.providerRef,
    providerAccountRef: current.providerAccountRef,
    adapterId: current.adapterId,
    expectedAuthorityGeneration: current.authorityGeneration,
    expectedAuthorityDigest: current.authorityDigest,
    requestedScopes: [...current.grantedScopes],
    grantedScopes: [...current.grantedScopes],
    requestedResources: [...current.grantedResources],
    grantedResources: [...current.grantedResources],
    approval: approvalFor(current),
    readinessValidUntil: 10_000,
    leaseMs: 1_000,
    evidenceRefs: ['evidence:lease'],
    activeAccountRef: current.owningAccountRef,
    actorPrincipalRef: 'principal:buyer',
    grantRef: 'grant:lease',
    grantGeneration: 1,
    ...overrides,
  } as Parameters<typeof issueProviderConnectionLease>[1]
}

function create(now = 1_000): ProviderConnection {
  const result = createProviderConnection(baseCommand, now)
  if (result.kind !== 'applied') throw new Error(`create failed: ${result.kind}`)
  return result.connection
}

function cleanupCommand(
  current: ProviderConnection,
  outcome: ProviderConnectionCleanupOutcome,
  commandId: string,
) {
  const revocationRef = current.revocationRef
  if (revocationRef === undefined) throw new Error('revocation_ref_missing')
  const cleanupAttempt = 1
  const workId = 'workpool:test'
  const requestDigest = providerConnectionCleanupRequestDigest({
    revocationRef,
    cleanupAttempt,
    connectionRef: current.connectionRef,
    expectedAuthorityGeneration: current.authorityGeneration,
    expectedAuthorityDigest: current.authorityDigest,
    adapterId: current.adapterId,
  })
  return {
    bound: {
      ...current,
      cleanupAttempt,
      cleanupWorkId: workId,
      cleanupWorkKind: 'cleanup' as const,
      cleanupCommandId: commandId,
      cleanupRequestDigest: requestDigest,
    },
    command: {
      commandId,
      expectedAuthorityGeneration: current.authorityGeneration,
      expectedAuthorityDigest: current.authorityDigest,
      cleanupAttempt,
      workId,
      requestDigest,
      outcome,
      evidenceRefs: [`evidence:${outcome}`],
    },
  } as const
}

describe('provider connection domain', () => {
  it('binds every authority-provenance field into the connection digest', () => {
    const current = create()
    const substitutions: Array<Partial<ProviderConnection>> = [
      { owningAccountRef: 'account:attacker' },
      { installedByPrincipalRef: 'principal:attacker' },
      { authorityGrantRef: 'grant:substituted' },
      { authorityGrantGeneration: 2 },
      { secretRef: 'env:PROVIDER_SECRET_V2', credentialRef: 'env:PROVIDER_SECRET_V2' },
    ]
    expect(providerConnectionAuthorityProvenanceIsValid(current)).toBe(true)
    for (const substitution of substitutions) {
      expect(providerConnectionAuthorityProvenanceIsValid({ ...current, ...substitution })).toBe(false)
    }
  })

  it('recomputes the authority digest whenever provenance is rebound', () => {
    const current = create()
    const rebound = withProviderConnectionAuthority(current, {
      owningAccountRef: current.owningAccountRef,
      installedByPrincipalRef: current.installedByPrincipalRef,
      authorityGrantRef: 'grant:replacement',
      authorityGrantGeneration: 2,
      secretRef: 'env:PROVIDER_SECRET',
    })
    expect(rebound.authorityDigest).not.toBe(current.authorityDigest)
    expect(providerConnectionAuthorityProvenanceIsValid(rebound)).toBe(true)
  })

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
      secretRef: 'env:PROVIDER_SECRET_V2',
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

  it('retains credential custody after an unknown cleanup outcome', () => {
    const current = create()
    const revoked = beginProviderConnectionRevocation(current, {
      commandId: 'command:revoke:failure',
      expectedAuthorityGeneration: current.authorityGeneration,
      expectedAuthorityDigest: current.authorityDigest,
      evidenceRefs: [],
    }, 2_000)
    if (revoked.kind !== 'applied') throw new Error('revocation failed')

    const cleanup = cleanupCommand(revoked.connection, 'outcome_unknown', 'command:cleanup:failure')
    const result = recordProviderConnectionCleanupResult(cleanup.bound, cleanup.command, 3_000)
    expect(result).toMatchObject({ kind: 'applied', connection: { lifecycle: 'cleanup_required' } })
    if (result.kind !== 'applied') return
    expect(result.connection.credentialRef).toBe('env:PROVIDER_SECRET')
  })

  it.each(['unsupported', 'provider_refused'] as const)('keeps %s cleanup outcomes actionable', (outcome) => {
    const revoked = beginProviderConnectionRevocation(create(), {
      commandId: `command:revoke:${outcome}`,
      expectedAuthorityGeneration: 1,
      expectedAuthorityDigest: create().authorityDigest,
      evidenceRefs: [],
    }, 2_000)
    if (revoked.kind !== 'applied') throw new Error('revocation failed')
    const cleanup = cleanupCommand(revoked.connection, outcome, `command:cleanup:${outcome}`)
    const result = recordProviderConnectionCleanupResult(cleanup.bound, cleanup.command, 3_000)
    expect(result).toMatchObject({ kind: 'applied', connection: { lifecycle: 'cleanup_required' } })
  })

  it('detaches credential-less x402 locally without remote revocation', () => {
    const created = createX402ProviderConnection({
      ...x402Authority,
      commandId: 'command:x402:cleanup',
      connectionRef: 'connection:x402:cleanup',
      businessId: 'business:one',
      providerRef: 'provider:x402:provider.example',
      providerAccountRef: 'x402:https://provider.example/paid',
      resourceUrl: 'https://provider.example/paid',
      evidenceRefs: [],
    }, 1_000)
    if (created.kind !== 'applied') throw new Error('x402 create failed')
    const revoked = beginProviderConnectionRevocation(created.connection, {
      commandId: 'command:revoke:x402',
      expectedAuthorityGeneration: created.connection.authorityGeneration,
      expectedAuthorityDigest: created.connection.authorityDigest,
      evidenceRefs: [],
    }, 2_000)
    if (revoked.kind !== 'applied') throw new Error('revocation failed')

    const cleanup = cleanupCommand(revoked.connection, 'detached', 'command:cleanup:x402')
    const result = recordProviderConnectionCleanupResult(cleanup.bound, cleanup.command, 3_000)
    expect(result).toMatchObject({ kind: 'applied', connection: { lifecycle: 'revoked', credentialRef: null } })
  })

  it('refuses local detach for a credential-bearing provider connection', () => {
    const revoked = beginProviderConnectionRevocation(create(), {
      commandId: 'command:revoke:credential-bearing',
      expectedAuthorityGeneration: 1,
      expectedAuthorityDigest: create().authorityDigest,
      evidenceRefs: [],
    }, 2_000)
    if (revoked.kind !== 'applied') throw new Error('revocation failed')

    const cleanup = cleanupCommand(revoked.connection, 'detached', 'command:cleanup:credential-bearing')
    expect(recordProviderConnectionCleanupResult(cleanup.bound, cleanup.command, 3_000)).toEqual({
      kind: 'refused',
      code: 'invalid_transition',
    })
  })

  it('replays exact cleanup callbacks and refuses stale, illegal, or malformed callbacks', () => {
    const revoked = beginProviderConnectionRevocation(create(), {
      commandId: 'command:revoke:fences',
      expectedAuthorityGeneration: 1,
      expectedAuthorityDigest: create().authorityDigest,
      evidenceRefs: [],
    }, 2_000)
    if (revoked.kind !== 'applied') throw new Error('revocation failed')
    const cleanup = cleanupCommand(revoked.connection, 'outcome_unknown', 'command:cleanup:fences')
    const applied = recordProviderConnectionCleanupResult(cleanup.bound, cleanup.command, 3_000)
    expect(applied.kind).toBe('applied')
    if (applied.kind !== 'applied') return
    expect(recordProviderConnectionCleanupResult(cleanup.bound, {
      ...cleanup.command,
      cleanupAttempt: 2,
    }, 3_000)).toEqual({ kind: 'refused', code: 'invalid_transition' })
    expect(recordProviderConnectionCleanupResult(cleanup.bound, {
      ...cleanup.command,
      workId: 'workpool:stale',
    }, 3_000)).toEqual({ kind: 'refused', code: 'invalid_transition' })

    expect(recordProviderConnectionCleanupResult(applied.connection, cleanup.command, 3_001).kind).toBe('duplicate')
    expect(recordProviderConnectionCleanupResult(cleanup.bound, {
      ...cleanup.command,
      expectedAuthorityDigest: 'sha256:stale',
    }, 3_000)).toEqual({ kind: 'refused', code: 'invalid_digest' })
    expect(recordProviderConnectionCleanupResult(applied.connection, {
      ...cleanup.command,
      outcome: 'detached',
    }, 3_000)).toEqual({ kind: 'refused', code: 'command_identity_conflict' })
    expect(recordProviderConnectionCleanupResult(cleanup.bound, {
      ...cleanup.command,
      workId: '',
    }, 3_000)).toEqual({ kind: 'refused', code: 'invalid_identity' })
  })

  it('issues a short-lived approval-bound lease and resolves only through its current snapshot', () => {
    const current = create()
    const command = leaseCommand(current)
    const result = issueProviderConnectionLease(current, command, 1_000)

    expect(result).toMatchObject({ kind: 'applied', lease: { state: 'active', expiresAt: 2_000 } })
    if (result.kind !== 'applied') return
    expect(result.lease).not.toHaveProperty('credentialRef')
    const resolved = resolveProviderConnectionCredentialRefForLease(
      current,
      result.lease,
      providerConnectionLeaseAuthoritySnapshot(result.lease),
      1_100,
      command.approval,
    )
    expect(resolved).toEqual({ kind: 'resolved', credentialRef: 'env:PROVIDER_SECRET' })
  })

  it('validates a credential-less x402 lease without reading provider credential custody', () => {
    const created = createX402ProviderConnection({
      ...x402Authority,
      commandId: 'command:x402:lease',
      connectionRef: 'connection:x402:lease',
      businessId: 'business:one',
      providerRef: 'provider:x402:lease',
      providerAccountRef: 'x402:https://provider.example/paid',
      resourceUrl: 'https://provider.example/paid',
      evidenceRefs: ['evidence:x402:lease'],
    }, 1_000)
    if (created.kind !== 'applied') throw new Error('x402_create_failed')
    const command = leaseCommand(created.connection)
    const issued = issueProviderConnectionLease(created.connection, command, 1_000)
    if (issued.kind !== 'applied') throw new Error('x402_lease_issue_failed')
    const snapshot = providerConnectionLeaseAuthoritySnapshot(issued.lease)

    expect(validateProviderConnectionLeaseAuthority(
      created.connection,
      issued.lease,
      snapshot,
      1_100,
      command.approval,
    )).toEqual({ kind: 'valid' })
    expect(resolveProviderConnectionCredentialRefForLease(
      created.connection,
      issued.lease,
      snapshot,
      1_100,
      command.approval,
    )).toEqual({ kind: 'unavailable', reason: 'credential_unavailable' })
  })
  it('accepts invocation_aborted when a live lease is abandoned before release', () => {
    const current = create()
    const issued = issueProviderConnectionLease(current, leaseCommand(current), 1_000)
    if (issued.kind !== 'applied') throw new Error('lease_issue_failed')

    const result = invalidateProviderConnectionLease(issued.lease, {
      commandId: 'command:invalidate:aborted',
      leaseRef: issued.lease.leaseRef,
      reasonCode: 'invocation_aborted',
      evidenceRefs: ['evidence:aborted'],
    }, 1_500)

    expect(result).toMatchObject({ kind: 'applied', lease: { state: 'invalidated', invalidatedAt: 1_500 } })
  })


  it('fails closed when the current approval is missing, refused, stale, or narrowed', () => {
    const current = create()
    const command = leaseCommand(current)
    const issued = issueProviderConnectionLease(current, command, 1_000)
    if (issued.kind !== 'applied') throw new Error('lease_issue_failed')
    const snapshot = providerConnectionLeaseAuthoritySnapshot(issued.lease)

    expect(resolveProviderConnectionCredentialRefForLease(current, issued.lease, snapshot, 1_100, null)).toEqual({
      kind: 'unavailable', reason: 'lease_digest_stale',
    })
    expect(resolveProviderConnectionCredentialRefForLease(
      current,
      issued.lease,
      snapshot,
      1_100,
      { ...command.approval, decision: 'refused' },
    )).toEqual({
      kind: 'unavailable', reason: 'lease_digest_stale',
    })
    expect(resolveProviderConnectionCredentialRefForLease(
      current,
      issued.lease,
      snapshot,
      1_100,
      { ...command.approval, decisionDigest: `sha256:${'c'.repeat(64)}` },
    )).toEqual({ kind: 'unavailable', reason: 'lease_digest_stale' })
    expect(resolveProviderConnectionCredentialRefForLease(
      current,
      issued.lease,
      snapshot,
      1_100,
      { ...command.approval, grantedScopes: [] },
    )).toEqual({ kind: 'unavailable', reason: 'lease_scope_mismatch' })
  })

  it('denies new leases and old credential resolution as soon as revocation begins', () => {
    const current = create()
    const command = leaseCommand(current)
    const issued = issueProviderConnectionLease(current, command, 1_000)
    if (issued.kind !== 'applied') throw new Error('lease_issue_failed')
    const revoked = beginProviderConnectionRevocation(current, {
      commandId: 'command:revoke:lease',
      expectedAuthorityGeneration: current.authorityGeneration,
      expectedAuthorityDigest: current.authorityDigest,
      evidenceRefs: ['evidence:revoke'],
    }, 1_100)
    if (revoked.kind !== 'applied') throw new Error('revocation_failed')

    expect(issueProviderConnectionLease(revoked.connection, leaseCommand(revoked.connection, {
      commandId: 'command:lease:after-revoke',
      leaseRef: 'lease:after-revoke',
    }), 1_101)).toEqual({ kind: 'refused', code: 'connection_not_active' })
    expect(resolveProviderConnectionCredentialRefForLease(
      revoked.connection,
      issued.lease,
      providerConnectionLeaseAuthoritySnapshot(issued.lease),
      1_101,
      command.approval,
    )).toEqual({ kind: 'unavailable', reason: 'connection_inactive' })
  })

  it('invalidates stale leases after a connection generation change', () => {
    const current = create()
    const command = leaseCommand(current)
    const issued = issueProviderConnectionLease(current, command, 1_000)
    if (issued.kind !== 'applied') throw new Error('lease_issue_failed')
    const rotated = reauthorizeProviderConnection(current, {
      ...baseCommand,
      commandId: 'command:reauthorize:lease',
      expectedAuthorityGeneration: current.authorityGeneration,
      expectedAuthorityDigest: current.authorityDigest,
      evidenceRefs: ['evidence:rotate'],
    }, 1_100)
    if (rotated.kind !== 'applied') throw new Error('reauthorize_failed')

    expect(resolveProviderConnectionCredentialRefForLease(
      rotated.connection,
      issued.lease,
      providerConnectionLeaseAuthoritySnapshot(issued.lease),
      1_101,
      command.approval,
    )).toEqual({ kind: 'unavailable', reason: 'lease_generation_stale' })
  })

  it('projects expiry against the supplied time and keeps owner readback redacted', () => {
    const current = create(1_000)
    const expiring = createProviderConnection({ ...baseCommand, commandId: 'command:create:expires', expiresAt: 1_500 }, 1_000)
    if (expiring.kind !== 'applied') throw new Error('expiring_create_failed')
    expect(projectProviderConnectionPublic(expiring.connection, 1_500)).toMatchObject({
      lifecycle: 'active', available: false,
    })
    const owner = projectProviderConnectionOwner(current, 1_000)
    expect(owner).toMatchObject({ credentialConfigured: true, available: true })
    expect(owner).not.toHaveProperty('credentialRef')
    expect(JSON.stringify(owner)).not.toContain('PROVIDER_SECRET')
  })
  it('creates non-secret x402 authority and refuses replay drift against the existing lifecycle row', () => {
    const command = {
      ...x402Authority,
      commandId: 'command:x402:one',
      connectionRef: 'connection:x402:one',
      businessId: 'business:one',
      providerRef: 'provider:x402:api.example.test',
      providerAccountRef: 'x402:https://api.example.test/quote',
      resourceUrl: 'https://api.example.test/quote',
      evidenceRefs: ['evidence:x402'],
    } as const
    const created = createX402ProviderConnection(command, 1_000)
    expect(created).toMatchObject({
      kind: 'applied',
      connection: { adapterId: 'x402-fetch:v2', credentialRef: null, lifecycle: 'active', grantedScopes: [] },
    })
    if (created.kind !== 'applied') return
    expect(createX402ProviderConnection(command, 1_001, created.connection)).toMatchObject({ kind: 'duplicate' })
    expect(createX402ProviderConnection({ ...command, commandId: 'command:x402:foreign', businessId: 'business:foreign' }, 1_001, created.connection)).toEqual({ kind: 'refused', code: 'invalid_transition' })
    expect(createX402ProviderConnection({ ...command, commandId: 'command:x402:bad-url', resourceUrl: 'http://localhost/quote' }, 1_001)).toEqual({ kind: 'refused', code: 'invalid_resource' })
  })
})
