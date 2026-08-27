import { describe, expect, it } from 'vitest'

import {
  canonicalLeaseContext,
  canonicalLeaseEffectFailureReason,
  issueCanonicalLease,
  readCanonicalLeaseForProjection,
} from '../../../convex/lib/providerConnections/leases'
import {
  installCanonicalProviderConnection,
  failClosedCanonicalLifecycleError,
  readCanonicalConnectionForProjection,
  resolveCanonicalBusinessOwner,
  shareCanonicalProviderConnection,
  toLeaseRow,
  toRow,
  transitionCanonicalProviderConnection,
} from '../../../convex/lib/providerConnections/lifecycle'

import {
  canonicalProviderConnectionProjection,
  canonicalProviderConnectionProjectionIsCurrent,
  canonicalProviderConnectionProjectionMatches,
  canonicalProviderLeaseProjection,
  canonicalProviderLeaseProjectionIsCurrent,
} from '@/modules/capability-supply/provider-connection'
import {
  normalizeEvidenceRefs,
  normalizeReasonCode,
  normalizeValues,
  stateIntegrity,
  withAuthorityDigest,
} from '@/modules/capability-supply/internal/provider-connection/shared'
import type { ProviderConnection } from '@/modules/capability-supply/internal/provider-connection/types'
import type { ProviderConnectionInvocationLease } from '@/modules/capability-supply/internal/provider-connection/lease'
import { accountRef, principalRef } from '@/modules/principal-account/public'
import { DelegationError } from '@/modules/authority/delegation/public'
import { ConnectionLifecycleError } from '@/modules/connections/lifecycle/public'

const canonicalConnection = {
  connectionRef: 'con_00000000000000000000000000000001',
  owningAccountRef: 'acc_00000000000000000000000000000001',
  installedByPrincipalRef: 'prn_00000000000000000000000000000001',
  secretRef: 'sec_00000000000000000000000000000001',
  lifecycle: 'active' as const,
  generation: 3,
  installAction: {
    grantRef: 'grt_00000000000000000000000000000001',
    grantGeneration: 2,
  },
}

const legacyConnection = {
  connectionRef: canonicalConnection.connectionRef,
  businessId: 'business:one',
  providerRef: 'provider:one',
  providerAccountRef: 'account:one',
  adapterId: 'http-json:v1',
  credentialRef: canonicalConnection.secretRef,
  grantedScopes: ['profile:read'],
  grantedResources: ['account:one'],
  authorityGeneration: 1,
  authorityDigest: `sha256:${'a'.repeat(64)}`,
  lifecycle: 'active' as const,
  observedAt: 1_000,
  evidenceRefs: [],
  createdAt: 1_000,
  updatedAt: 1_000,
}

describe('canonical provider-connection compatibility projection', () => {
  it('pins immutable Principal, Account, Grant, generation, Connection, and secret-pointer provenance', () => {
    const projected = canonicalProviderConnectionProjection(legacyConnection, canonicalConnection)

    expect(projected).toMatchObject({
      canonicalConnectionRef: canonicalConnection.connectionRef,
      owningAccountRef: canonicalConnection.owningAccountRef,
      installedByPrincipalRef: canonicalConnection.installedByPrincipalRef,
      authorityGrantRef: canonicalConnection.installAction.grantRef,
      authorityGrantGeneration: canonicalConnection.installAction.grantGeneration,
      canonicalConnectionGeneration: canonicalConnection.generation,
      secretRef: canonicalConnection.secretRef,
    })
    expect(canonicalProviderConnectionProjectionIsCurrent(projected, canonicalConnection)).toBe(true)
  })

  it.each([
    'canonicalConnectionRef',
    'owningAccountRef',
    'installedByPrincipalRef',
    'authorityGrantRef',
    'authorityGrantGeneration',
    'canonicalConnectionGeneration',
    'secretRef',
  ] as const)('fails closed when %s is missing or substituted', (field) => {
    const projected = canonicalProviderConnectionProjection(legacyConnection, canonicalConnection)
    expect(canonicalProviderConnectionProjectionIsCurrent({ ...projected, [field]: undefined }, canonicalConnection)).toBe(false)
    expect(canonicalProviderConnectionProjectionIsCurrent({ ...projected, [field]: field.includes('Generation') ? 999 : 'forged' }, canonicalConnection)).toBe(false)
  })

  it('rejects lifecycle divergence and preserves unknown external state as unavailable', () => {
    const projected = canonicalProviderConnectionProjection(legacyConnection, {
      ...canonicalConnection,
      lifecycle: 'revoked',
    })
    expect(canonicalProviderConnectionProjectionIsCurrent(projected, {
      ...canonicalConnection,
      lifecycle: 'revoked',
    })).toBe(false)
    expect(canonicalProviderConnectionProjectionIsCurrent(projected, {
      ...canonicalConnection,
      externalState: { kind: 'unknown', value: 'provider_timeout' },
    })).toBe(false)
    expect(canonicalProviderConnectionProjectionIsCurrent(projected, {
      ...canonicalConnection,
      externalState: { kind: 'known', value: 'unavailable' },
    })).toBe(false)
  })

  it('tracks the current action grant while retaining immutable installer attribution', () => {
    const { secretRef: _secretRef, ...credentiallessCanonical } = canonicalConnection
    const refreshed = {
      ...credentiallessCanonical,
      generation: 4,
      action: {
        grantRef: 'grt_00000000000000000000000000000002',
        grantGeneration: 3,
      },
    }
    const credentialless = { ...legacyConnection, credentialRef: null }
    const projected = canonicalProviderConnectionProjection(credentialless, refreshed)
    expect(projected).toMatchObject({
      installedByPrincipalRef: canonicalConnection.installedByPrincipalRef,
      authorityGrantRef: refreshed.action.grantRef,
      authorityGrantGeneration: refreshed.action.grantGeneration,
      canonicalConnectionGeneration: 4,
    })
    expect('secretRef' in projected).toBe(false)
    expect(canonicalProviderConnectionProjectionMatches(projected, refreshed)).toBe(true)
    expect(canonicalProviderConnectionProjectionMatches({ ...projected, credentialRef: SECRET_SUBSTITUTION }, refreshed)).toBe(false)
  })
})

const SECRET_SUBSTITUTION = 'sec_ffffffffffffffffffffffffffffffff'

type ScriptedDbOptions = Readonly<{
  gets?: readonly unknown[]
  uniques?: readonly unknown[]
  collects?: readonly unknown[][]
}>

function scriptedContext(options: ScriptedDbOptions) {
  const gets = [...(options.gets ?? [])]
  const uniques = [...(options.uniques ?? [])]
  const collects = [...(options.collects ?? [])]
  const builder = { eq: () => builder }
  const query = {
    withIndex: (_name: string, build: (value: typeof builder) => typeof builder) => {
      build(builder)
      return query
    },
    unique: async () => {
      const value = uniques.shift()
      if (value instanceof Error) throw value
      return value ?? null
    },
    collect: async () => collects.shift() ?? [],
    take: async () => collects.shift() ?? [],
  }
  return {
    db: {
      get: async () => gets.shift() ?? null,
      query: () => query,
    },
  }
}

describe('canonical adapter helper boundaries', () => {
  const actor = {
    principalRef: principalRef('prn_00000000000000000000000000000001'),
    accountRef: accountRef('acc_00000000000000000000000000000001'),
  } as const

  it('fails closed for absent and malformed canonical Connection projections', async () => {
    await expect(readCanonicalConnectionForProjection(scriptedContext({}) as never, legacyConnection))
      .resolves.toBeNull()
    await expect(readCanonicalConnectionForProjection(scriptedContext({ uniques: [null] }) as never, {
      ...legacyConnection,
      canonicalConnectionRef: canonicalConnection.connectionRef,
    })).resolves.toBeNull()
    await expect(readCanonicalConnectionForProjection(scriptedContext({ uniques: [{
      _id: 'row',
      _creationTime: 1,
      connectionRef: 'malformed',
    }] }) as never, {
      ...legacyConnection,
      canonicalConnectionRef: canonicalConnection.connectionRef,
    })).resolves.toBeNull()
  })

  it.each([
    scriptedContext({ gets: [null] }),
    scriptedContext({ gets: [{ ownerId: 'owner' }, null] }),
    scriptedContext({ gets: [{ ownerId: 'owner' }, {}] }),
    scriptedContext({
      gets: [{ ownerId: 'owner' }, { canonicalPrincipalRef: actor.principalRef, canonicalAccountRef: actor.accountRef }],
      uniques: [null, { accountRef: actor.accountRef, lifecycle: 'active', currentOwnershipRef: 'own' }],
    }),
    scriptedContext({
      gets: [{ ownerId: 'owner' }, { canonicalPrincipalRef: actor.principalRef, canonicalAccountRef: actor.accountRef }],
      uniques: [{ principalRef: actor.principalRef, lifecycle: 'inactive' }, { accountRef: actor.accountRef, lifecycle: 'active', currentOwnershipRef: 'own' }],
    }),
    scriptedContext({
      gets: [{ ownerId: 'owner' }, { canonicalPrincipalRef: actor.principalRef, canonicalAccountRef: actor.accountRef }],
      uniques: [{ principalRef: actor.principalRef, lifecycle: 'active' }, null],
    }),
    scriptedContext({
      gets: [{ ownerId: 'owner' }, { canonicalPrincipalRef: actor.principalRef, canonicalAccountRef: actor.accountRef }],
      uniques: [{ principalRef: actor.principalRef, lifecycle: 'active' }, { accountRef: actor.accountRef, lifecycle: 'inactive', currentOwnershipRef: 'own' }],
    }),
    scriptedContext({
      gets: [{ ownerId: 'owner' }, { canonicalPrincipalRef: actor.principalRef, canonicalAccountRef: actor.accountRef }],
      uniques: [{ principalRef: actor.principalRef, lifecycle: 'active' }, { accountRef: actor.accountRef, lifecycle: 'active', currentOwnershipRef: 'own' }, null],
    }),
    scriptedContext({
      gets: [{ ownerId: 'owner' }, { canonicalPrincipalRef: actor.principalRef, canonicalAccountRef: actor.accountRef }],
      uniques: [{ principalRef: actor.principalRef, lifecycle: 'active' }, { accountRef: actor.accountRef, lifecycle: 'active', currentOwnershipRef: 'own' }, { lifecycle: 'inactive' }],
    }),
    scriptedContext({
      gets: [{ ownerId: 'owner' }, { canonicalPrincipalRef: actor.principalRef, canonicalAccountRef: actor.accountRef }],
      uniques: [{ principalRef: actor.principalRef, lifecycle: 'active' }, { accountRef: actor.accountRef, lifecycle: 'active', currentOwnershipRef: 'own' }, { lifecycle: 'active', accountRef: 'other', ownerPrincipalRef: actor.principalRef }],
    }),
    scriptedContext({
      gets: [{ ownerId: 'owner' }, { canonicalPrincipalRef: actor.principalRef, canonicalAccountRef: actor.accountRef }],
      uniques: [{ principalRef: actor.principalRef, lifecycle: 'active' }, { accountRef: actor.accountRef, lifecycle: 'active', currentOwnershipRef: 'own' }, { lifecycle: 'active', accountRef: actor.accountRef, ownerPrincipalRef: 'other' }],
    }),
    scriptedContext({
      gets: [{ ownerId: 'owner' }, { canonicalPrincipalRef: 'invalid', canonicalAccountRef: actor.accountRef }],
      uniques: [{ principalRef: 'invalid', lifecycle: 'active' }, { accountRef: actor.accountRef, lifecycle: 'active', currentOwnershipRef: 'own' }, { lifecycle: 'active', accountRef: actor.accountRef, ownerPrincipalRef: 'invalid' }],
    }),
  ])('rejects an incomplete or inconsistent canonical business-owner chain', async (ctx) => {
    await expect(resolveCanonicalBusinessOwner(ctx as never, 'business' as never)).resolves.toBeNull()
  })

  it('rejects absent grants before canonical install, transition, and share consequences', async () => {
    await expect(installCanonicalProviderConnection(scriptedContext({ collects: [[]] }) as never, {
      actor,
      commandId: 'install:no-grant',
      providerNamespace: 'provider/test',
      credentialRef: null,
    })).resolves.toBeNull()
    await expect(installCanonicalProviderConnection(scriptedContext({ collects: [[]] }) as never, {
      actor,
      commandId: 'install:bad-secret',
      providerNamespace: 'provider/test',
      providerLocator: 'locator',
      credentialRef: 'env:NOT_A_POINTER',
    })).resolves.toBeNull()
    await expect(transitionCanonicalProviderConnection(scriptedContext({ collects: [[]] }) as never, {
      actor,
      commandId: 'refresh:no-grant',
      connection: canonicalConnection as never,
      operation: 'refresh',
      externalState: { kind: 'known', value: 'ready' },
    })).resolves.toBeNull()
    await expect(shareCanonicalProviderConnection(scriptedContext({ collects: [[]] }) as never, {
      actor,
      commandId: 'share:no-grant',
      connection: canonicalConnection as never,
      granteeAccountRef: 'acc_00000000000000000000000000000002' as never,
    })).resolves.toBeNull()
    await expect(installCanonicalProviderConnection(scriptedContext({
      collects: [Array.from({ length: 33 }, () => ({}))],
    }) as never, {
      actor,
      commandId: 'install:ambiguous-grant-set',
      providerNamespace: 'provider/test',
      credentialRef: null,
    })).resolves.toBeNull()
  })

  it('fails closed for declared lifecycle errors and never masks unexpected faults', () => {
    const connectionError = new ConnectionLifecycleError('connection_not_active')
    const delegationError = new DelegationError('delegation_revoked')
    expect(failClosedCanonicalLifecycleError(connectionError)).toBeNull()
    expect(failClosedCanonicalLifecycleError(delegationError)).toBeNull()
    expect(() => failClosedCanonicalLifecycleError(new Error('unexpected'))).toThrow('unexpected')
    expect(canonicalLeaseEffectFailureReason(connectionError)).toBe('connection_not_active')
    expect(canonicalLeaseEffectFailureReason(delegationError)).toBe('delegation_revoked')
    expect(() => canonicalLeaseEffectFailureReason(new Error('unexpected'))).toThrow('unexpected')
  })

  it('fails closed for absent, malformed, and disconnected canonical leases', async () => {
    const lease = {
      leaseRef: 'lease', invocationRef: 'invocation', operationRef: 'operation', connectionRef: legacyConnection.connectionRef,
      providerRef: legacyConnection.providerRef, providerAccountRef: legacyConnection.providerAccountRef, adapterId: legacyConnection.adapterId,
      authorityGeneration: legacyConnection.authorityGeneration, authorityDigest: legacyConnection.authorityDigest,
      grantedScopes: [], grantedResources: [], approvalDecisionRef: 'decision', approvalDecisionDigest: 'digest',
      readinessValidUntil: 2_000, state: 'active' as const, issuedAt: 1_000, expiresAt: 2_000,
      evidenceRefs: [], createdAt: 1_000, updatedAt: 1_000, lastCommandId: 'command', lastCommandDigest: 'digest',
    }
    await expect(readCanonicalLeaseForProjection(scriptedContext({}) as never, lease, canonicalConnection as never))
      .resolves.toBeNull()
    await expect(readCanonicalLeaseForProjection(scriptedContext({ uniques: [null] }) as never, {
      ...lease,
      canonicalLeaseRef: 'clease_00000000000000000000000000000001',
    }, canonicalConnection as never)).resolves.toBeNull()
    await expect(readCanonicalLeaseForProjection(scriptedContext({ uniques: [{ _id: 'row', _creationTime: 1 }] }) as never, {
      ...lease,
      canonicalLeaseRef: 'clease_00000000000000000000000000000001',
    }, canonicalConnection as never)).resolves.toBeNull()
    await expect(canonicalLeaseContext(scriptedContext({}) as never, lease, legacyConnection))
      .resolves.toBeNull()
  })

  it('rejects lease issuance when durable invocation authority is stale or malformed', async () => {
    const args = {
      commandId: 'command:lease', leaseRef: 'lease', invocationRef: 'invocation', operationRef: 'operation',
      connectionRef: canonicalConnection.connectionRef, providerRef: 'provider', providerAccountRef: 'provider-account',
      adapterId: 'http-json:v1', expectedAuthorityGeneration: 1, expectedAuthorityDigest: `sha256:${'a'.repeat(64)}`,
      requestedScopes: [], grantedScopes: [], requestedResources: [], grantedResources: [],
      approvalDecisionRef: 'decision', readinessValidUntil: Date.now() + 10_000, leaseMs: 1_000, evidenceRefs: [], now: 0,
    }
    const invocation = {
      invocationRef: args.invocationRef, operationRef: args.operationRef, grantRef: 'grt_00000000000000000000000000000001',
      grantGeneration: 1, grantExpiresAt: Date.now() + 10_000, principalId: actor.principalRef,
    }
    const grant = {
      grantRef: invocation.grantRef, generation: 1, expiresAt: invocation.grantExpiresAt, lifecycle: 'active',
      subjectPrincipalRef: actor.principalRef, accountRef: actor.accountRef,
      scopes: ['connection:lease'], resourceRefs: [args.operationRef, `connection:${canonicalConnection.connectionRef}`],
    }
    await expect(issueCanonicalLease(scriptedContext({ uniques: [null] }) as never, args, canonicalConnection as never))
      .resolves.toBeNull()
    await expect(issueCanonicalLease(scriptedContext({ uniques: [invocation, { ...grant, resourceRefs: [args.operationRef] }] }) as never, args, canonicalConnection as never))
      .resolves.toBeNull()
    await expect(issueCanonicalLease(scriptedContext({ uniques: [invocation, { ...grant, accountRef: 'invalid' }] }) as never, args, canonicalConnection as never))
      .resolves.toBeNull()
    await expect(issueCanonicalLease(scriptedContext({ uniques: [invocation, grant] }) as never, {
      ...args,
      leaseMs: -1,
    }, canonicalConnection as never)).resolves.toBeNull()
    await expect(issueCanonicalLease(scriptedContext({ uniques: [invocation, grant] }) as never, args, canonicalConnection as never))
      .resolves.toBeNull()
  })

  it('serializes staged canonical fields and rejects missing command receipts', () => {
    const projected = canonicalProviderConnectionProjection(legacyConnection, canonicalConnection)
    expect(() => toRow(projected, 'fallback', 'digest')).toThrow('provider_connection_command_receipt_missing')
    const withReceipt = { ...projected, lastCommandId: 'command', lastCommandDigest: 'digest' }
    expect(toRow(withReceipt, 'fallback', 'fallback-digest')).toMatchObject({
      canonicalConnectionRef: canonicalConnection.connectionRef,
      lastCommandId: 'command',
    })
    const lease = {
      leaseRef: 'lease', invocationRef: 'invocation', operationRef: 'operation', connectionRef: projected.connectionRef,
      providerRef: projected.providerRef, providerAccountRef: projected.providerAccountRef, adapterId: projected.adapterId,
      authorityGeneration: projected.authorityGeneration, authorityDigest: projected.authorityDigest,
      grantedScopes: [], grantedResources: [], approvalDecisionRef: 'decision', approvalDecisionDigest: 'digest',
      readinessValidUntil: 2_000, state: 'active', issuedAt: 1_000, expiresAt: 2_000,
      evidenceRefs: [], createdAt: 1_000, updatedAt: 1_000,
    } satisfies ProviderConnectionInvocationLease
    expect(() => toLeaseRow(lease, 'fallback', 'digest')).toThrow('provider_connection_lease_command_receipt_missing')
    expect(toLeaseRow({ ...lease, lastCommandId: 'command', lastCommandDigest: 'digest' }, 'fallback', 'fallback-digest'))
      .not.toHaveProperty('canonicalLeaseRef')
    expect(toLeaseRow({
      ...lease,
      canonicalLeaseRef: 'lease-canonical',
      canonicalConnectionRef: canonicalConnection.connectionRef,
      canonicalConnectionGeneration: 3,
      owningAccountRef: canonicalConnection.owningAccountRef,
      activeAccountRef: canonicalConnection.owningAccountRef,
      actorPrincipalRef: canonicalConnection.installedByPrincipalRef,
      grantRef: canonicalConnection.installAction.grantRef,
      grantGeneration: canonicalConnection.installAction.grantGeneration,
      readinessDigest: 'readiness',
      consumedAt: 1_500,
      invalidatedAt: 1_600,
      lastCommandId: 'command',
      lastCommandDigest: 'digest',
    }, 'fallback', 'fallback-digest')).toMatchObject({
      canonicalLeaseRef: 'lease-canonical',
      readinessDigest: 'readiness',
      consumedAt: 1_500,
      invalidatedAt: 1_600,
    })
  })
})

describe('legacy projection integrity fails closed before canonical use', () => {
  const base = withAuthorityDigest({
    connectionRef: 'connection:integrity',
    businessId: 'business:integrity',
    providerRef: 'provider:integrity',
    providerAccountRef: 'account:integrity',
    adapterId: 'http-json:v1',
    credentialRef: SECRET_SUBSTITUTION,
    grantedScopes: ['profile:read'],
    grantedResources: ['account:integrity'],
    authorityGeneration: 1,
    lifecycle: 'active',
    observedAt: 1_000,
    evidenceRefs: ['evidence:integrity'],
    createdAt: 1_000,
    updatedAt: 1_000,
  })

  function current(overrides: Partial<ProviderConnection>): ProviderConnection {
    const { authorityDigest: _digest, ...material } = { ...base, ...overrides }
    return withAuthorityDigest(material)
  }

  it('rejects malformed normalization inputs', () => {
    expect(normalizeValues([''], 'invalid_scope')).toEqual({ kind: 'refused', code: 'invalid_scope' })
    expect(normalizeEvidenceRefs([''])).toEqual({ kind: 'refused', code: 'invalid_identity' })
    expect(normalizeReasonCode('')).toEqual({ kind: 'refused', code: 'invalid_identity' })
  })

  it.each([
    ['invalid_time', base, -1],
    ['invalid_time', current({ createdAt: 2_000 }), 2_000],
    ['invalid_identity', current({ credentialRef: 'caller-secret' }), 2_000],
    ['invalid_transition', current({ lifecycle: 'parallel_truth' as never }), 2_000],
    ['invalid_generation', current({ authorityGeneration: 0 }), 2_000],
    ['invalid_digest', { ...base, authorityDigest: `sha256:${'0'.repeat(64)}` }, 2_000],
    ['invalid_scope', current({ grantedScopes: ['z', 'a'] }), 2_000],
    ['invalid_resource', current({ grantedResources: ['z', 'a'] }), 2_000],
    ['invalid_time', current({ expiresAt: -1 }), 2_000],
    ['invalid_time', current({ revokedAt: 999 }), 2_000],
    ['invalid_identity', current({ reasonCode: '' }), 2_000],
    ['invalid_identity', current({ revocationRef: '' }), 2_000],
    ['invalid_transition', current({ cleanupAttempt: -1 }), 2_000],
    ['invalid_identity', current({ cleanupWorkId: '' }), 2_000],
    ['invalid_transition', current({ cleanupWorkKind: 'parallel_truth' as never }), 2_000],
    ['invalid_identity', current({ cleanupCommandId: '' }), 2_000],
    ['invalid_digest', current({ cleanupRequestDigest: 'not-a-digest' }), 2_000],
    ['invalid_time', current({ cleanupCallbackGraceUntil: -1 }), 2_000],
    ['invalid_transition', current({ cleanupWorkKind: 'cleanup' }), 2_000],
    ['invalid_identity', current({ evidenceRefs: [''] }), 2_000],
    ['invalid_transition', current({ revokedAt: 1_500, updatedAt: 1_500 }), 2_000],
    ['invalid_transition', current({ lifecycle: 'revoked' }), 2_000],
  ] as const)('returns %s for a hostile stored row', (expected, connection, now) => {
    expect(stateIntegrity(connection as ProviderConnection, now)).toBe(expected)
  })
})

describe('canonical provider-connection lease projection', () => {
  const canonicalLease = {
    leaseRef: 'cls_00000000000000000000000000000001',
    connectionRef: canonicalConnection.connectionRef,
    connectionGeneration: canonicalConnection.generation,
    owningAccountRef: canonicalConnection.owningAccountRef,
    activeAccountRef: canonicalConnection.owningAccountRef,
    actorPrincipalRef: canonicalConnection.installedByPrincipalRef,
    grantRef: canonicalConnection.installAction.grantRef,
    grantGeneration: canonicalConnection.installAction.grantGeneration,
  }

  const legacyLease = {
    canonicalLeaseRef: canonicalLease.leaseRef,
    canonicalConnectionRef: canonicalLease.connectionRef,
    canonicalConnectionGeneration: canonicalLease.connectionGeneration,
    owningAccountRef: canonicalLease.owningAccountRef,
    activeAccountRef: canonicalLease.activeAccountRef,
    actorPrincipalRef: canonicalLease.actorPrincipalRef,
    grantRef: canonicalLease.grantRef,
    grantGeneration: canonicalLease.grantGeneration,
  }

  it('rejects stale generation, cross-Account substitution, and missing mappings', () => {
    expect(canonicalProviderLeaseProjectionIsCurrent(legacyLease, canonicalLease, canonicalConnection)).toBe(true)
    expect(canonicalProviderLeaseProjectionIsCurrent({ ...legacyLease, canonicalConnectionGeneration: 2 }, canonicalLease, canonicalConnection)).toBe(false)
    expect(canonicalProviderLeaseProjectionIsCurrent({ ...legacyLease, activeAccountRef: 'acc_00000000000000000000000000000002' }, canonicalLease, canonicalConnection)).toBe(false)
    const { canonicalLeaseRef: _missing, ...withoutCanonicalLeaseRef } = legacyLease
    expect(canonicalProviderLeaseProjectionIsCurrent(withoutCanonicalLeaseRef, canonicalLease, canonicalConnection)).toBe(false)
    expect(canonicalProviderLeaseProjectionIsCurrent(legacyLease, canonicalLease, { ...canonicalConnection, lifecycle: 'revoked' })).toBe(false)
    expect(canonicalProviderLeaseProjectionIsCurrent(legacyLease, canonicalLease, { ...canonicalConnection, generation: 4 })).toBe(false)
    expect(canonicalProviderLeaseProjectionIsCurrent({ ...legacyLease, state: 'invalidated' }, canonicalLease, canonicalConnection)).toBe(false)
  })

  it('projects every canonical lease authority field without accepting legacy provenance', () => {
    const projected = canonicalProviderLeaseProjection({ leaseRef: 'legacy:lease', state: 'active' }, canonicalLease)
    expect(projected).toEqual({
      leaseRef: 'legacy:lease',
      state: 'active',
      canonicalLeaseRef: canonicalLease.leaseRef,
      canonicalConnectionRef: canonicalLease.connectionRef,
      canonicalConnectionGeneration: canonicalLease.connectionGeneration,
      owningAccountRef: canonicalLease.owningAccountRef,
      activeAccountRef: canonicalLease.activeAccountRef,
      actorPrincipalRef: canonicalLease.actorPrincipalRef,
      grantRef: canonicalLease.grantRef,
      grantGeneration: canonicalLease.grantGeneration,
    })
  })
})
