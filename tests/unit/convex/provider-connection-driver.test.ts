import { describe, expect, it, vi } from 'vitest'

import { api, internal } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { issueProviderApprovalDecision } from '@/modules/capability-supply/provider-approval'
import { beginProviderConnectionRevocation } from '@/modules/capability-supply/provider-connection'
import { accountRef, principalRef } from '@/modules/principal-account/public'
import {
  advanceLeaseDrainHandler,
  installCanonicalProviderConnection,
  enqueueCleanupWork,
  shareCanonicalProviderConnection,
  transitionCanonicalProviderConnection,
} from '../../../convex/capabilityProviderConnectionLifecycle'
import {
  convexTestWithMarketComponents,
  convexTestWithWorkers,
  publishedBusinessOwner,
  type ConvexFixtureBackend,
} from '../../helpers/convex-fixtures'

const SECRET_REF = 'sec_00000000000000000000000000000001'
const PROVIDER_ACCOUNT_REF = 'account:driver'
const PROVIDER_NAMESPACE = 'capability-provider/http-json:v1'

type CanonicalOwner = Readonly<{
  principalRef: string
  accountRef: string
}>

async function canonicalOwner(
  backend: ConvexFixtureBackend,
  businessId: Id<'businesses'>,
): Promise<CanonicalOwner> {
  return await backend.run(async (ctx) => {
    const business = await ctx.db.get(businessId)
    if (business === null) throw new Error('business_missing')
    const owner = await ctx.db.get(business.ownerId)
    if (owner?.canonicalPrincipalRef === undefined || owner.canonicalAccountRef === undefined) {
      throw new Error('canonical_owner_missing')
    }
    return { principalRef: owner.canonicalPrincipalRef, accountRef: owner.canonicalAccountRef }
  })
}

async function grant(
  backend: ConvexFixtureBackend,
  owner: CanonicalOwner,
  suffix: string,
  scope: string | readonly string[],
  resources: readonly string[],
) {
  const grantRef = `grt_${suffix.repeat(32)}`
  const expiresAt = Date.now() + 300_000
  await backend.run(async (ctx) => {
    await ctx.db.insert('authorityDelegationGrants', {
      grantRef,
      accountRef: owner.accountRef,
      actorPrincipalRef: owner.principalRef,
      subjectPrincipalRef: owner.principalRef,
      scopes: (typeof scope === 'string' ? [scope] : [...scope]).sort(),
      resourceRefs: [...resources].sort(),
      budgetLimit: 1,
      budgetUsed: 0,
      expiresAt,
      generation: 1,
      revision: 1,
      lifecycle: 'active',
      createdAt: 1,
      createdBy: {
        actorPrincipalRef: owner.principalRef,
        activeAccountRef: owner.accountRef,
        correlationRef: `create:${grantRef}`,
        idempotencyRef: `create:${grantRef}`,
      },
    })
  })
  return { grantRef, expiresAt }
}

async function install(
  backend: ConvexFixtureBackend,
  businessId: Id<'businesses'>,
  suffix: string,
) {
  return await backend.mutation(internal.capabilityProviderConnections.create, {
    commandId: `command:install:${suffix}`,
    connectionRef: `connection:${suffix}`,
    businessId,
    providerRef: `provider:${suffix}`,
    providerAccountRef: PROVIDER_ACCOUNT_REF,
    adapterId: 'http-json:v1',
    credentialRef: SECRET_REF,
    requestedScopes: ['profile:read'],
    grantedScopes: ['profile:read'],
    requestedResources: [PROVIDER_ACCOUNT_REF],
    grantedResources: [PROVIDER_ACCOUNT_REF],
    evidenceRefs: [`evidence:${suffix}`],
    now: 1,
  })
}

describe('canonical provider-connection driver', () => {
  it('installs idempotently and makes the legacy row a fail-closed canonical projection', async () => {
    const backend = convexTestWithWorkers({ pauseWorkpool: true })
    const fixture = await publishedBusinessOwner(backend, 'connection-driver-install')
    const owner = await canonicalOwner(backend, fixture.businessId)
    await grant(backend, owner, '1', 'connection:install', [
      `connection-provider:${PROVIDER_NAMESPACE}`,
      `connection-provider:${PROVIDER_NAMESPACE}:${PROVIDER_ACCOUNT_REF}`,
      `secret:${SECRET_REF}`,
    ])

    const first = await install(backend, fixture.businessId, 'driver')
    expect(first).toMatchObject({
      kind: 'applied',
      connection: {
        owningAccountRef: owner.accountRef,
        installedByPrincipalRef: owner.principalRef,
        authorityGrantRef: `grt_${'1'.repeat(32)}`,
        authorityGrantGeneration: 1,
        canonicalConnectionGeneration: 1,
        secretRef: SECRET_REF,
      },
    })
    if (first.kind === 'refused') throw new Error(first.code)
    expect(first.connection.canonicalConnectionRef).toMatch(/^con_[0-9a-f]{32}$/u)

    await expect(install(backend, fixture.businessId, 'driver')).resolves.toMatchObject({
      kind: 'duplicate',
      connection: { canonicalConnectionRef: first.connection.canonicalConnectionRef },
    })

    await backend.run(async (ctx) => {
      const row = await ctx.db.query('capabilityProviderConnections')
        .withIndex('by_connectionRef', (query) => query.eq('connectionRef', 'connection:driver'))
        .unique()
      if (row === null) throw new Error('legacy_projection_missing')
      await ctx.db.patch(row._id, { owningAccountRef: 'acc_000000000000000000000000000000ff' })
    })
    await expect(backend.query(internal.capabilityProviderConnections.read, {
      connectionRef: 'connection:driver',
    })).resolves.toBeNull()
    await backend.run(async (ctx) => {
      const row = await ctx.db.query('capabilityProviderConnections')
        .withIndex('by_connectionRef', (query) => query.eq('connectionRef', 'connection:driver'))
        .unique()
      if (row === null) throw new Error('legacy_projection_missing')
      await ctx.db.patch(row._id, { owningAccountRef: owner.accountRef })
    })

    if (first.connection.canonicalConnectionRef === undefined) throw new Error('canonical_connection_ref_missing')
    await expect(backend.query(internal.capabilityProviderConnections.read, {
      connectionRef: first.connection.connectionRef,
    })).resolves.toMatchObject({ canonicalConnectionRef: first.connection.canonicalConnectionRef })
    await expect(backend.query(internal.capabilityProviderConnections.readAtGeneration, {
      connectionRef: first.connection.connectionRef,
      authorityGeneration: first.connection.authorityGeneration,
    })).resolves.toMatchObject({ canonicalConnectionRef: first.connection.canonicalConnectionRef })
    await expect(backend.query(internal.capabilityProviderConnections.listByBusinessLifecycle, {
      businessId: fixture.businessId,
      lifecycle: 'active',
      limit: 0,
    })).resolves.toHaveLength(1)
    await expect(backend.query(internal.capabilityProviderConnections.listByProviderLifecycle, {
      providerRef: first.connection.providerRef,
      lifecycle: 'active',
      limit: 101,
    })).resolves.toHaveLength(1)
    await expect(backend.query(internal.capabilityProviderConnections.resolveCredentialRef, {
      connectionRef: first.connection.connectionRef,
      expectedAuthorityGeneration: first.connection.authorityGeneration,
      expectedAuthorityDigest: first.connection.authorityDigest,
      now: 0,
    })).resolves.toEqual({ kind: 'unavailable', reason: 'inactive' })
    await expect(backend.query(internal.capabilityProviderConnections.validateAuthority, {
      connectionRef: first.connection.connectionRef,
      expectedAuthorityGeneration: first.connection.authorityGeneration,
      expectedAuthorityDigest: first.connection.authorityDigest,
      now: 0,
    })).resolves.toEqual({ kind: 'unavailable', reason: 'inactive' })
    await expect(fixture.owner.query(api.capabilityProviderConnections.listOwner, {})).resolves.toHaveLength(1)
    await expect(fixture.owner.query(api.capabilityProviderConnections.readOwner, {
      connectionRef: first.connection.connectionRef,
    })).resolves.toMatchObject({ connectionRef: first.connection.connectionRef })
    await backend.run(async (ctx) => {
      const row = await ctx.db.query('capabilityProviderConnections')
        .withIndex('by_connectionRef', (query) => query.eq('connectionRef', first.connection.connectionRef))
        .unique()
      if (row === null) throw new Error('legacy_projection_missing')
      await ctx.db.patch(row._id, { canonicalConnectionGeneration: 999 })
    })
    await expect(fixture.owner.query(api.capabilityProviderConnections.readOwner, {
      connectionRef: first.connection.connectionRef,
    })).resolves.toBeNull()
    await backend.run(async (ctx) => {
      const row = await ctx.db.query('capabilityProviderConnections')
        .withIndex('by_connectionRef', (query) => query.eq('connectionRef', first.connection.connectionRef))
        .unique()
      if (row === null) throw new Error('legacy_projection_missing')
      await ctx.db.patch(row._id, { canonicalConnectionGeneration: first.connection.canonicalConnectionGeneration })
    })
    const granteeFixture = await publishedBusinessOwner(backend, 'connection-driver-grantee')
    const grantee = await canonicalOwner(backend, granteeFixture.businessId)
    await grant(backend, owner, '9', 'connection:share', [
      `account:${grantee.accountRef}`,
      `connection:${first.connection.canonicalConnectionRef}`,
    ])
    const shareArgs = {
      connectionRef: 'connection:driver',
      granteeAccountRef: grantee.accountRef,
      commandId: 'command:share:driver',
    }
    const shared = await fixture.owner.mutation(internal.capabilityProviderConnections.shareOwner, shareArgs)
    expect(shared).toMatchObject({
      kind: 'shared',
      owningAccountRef: owner.accountRef,
      granteeAccountRef: grantee.accountRef,
      actorPrincipalRef: owner.principalRef,
      grantRef: `grt_${'9'.repeat(32)}`,
    })
    await expect(fixture.owner.mutation(internal.capabilityProviderConnections.shareOwner, shareArgs)).resolves.toEqual(shared)

    await grant(backend, owner, '8', 'connection:refresh', [
      `connection:${first.connection.canonicalConnectionRef}`,
    ])
    const rotateArgs = {
      connectionRef: 'connection:driver',
      commandId: 'command:refresh:driver',
      expectedAuthorityGeneration: first.connection.authorityGeneration,
      expectedAuthorityDigest: first.connection.authorityDigest,
      evidenceRefs: ['evidence:refresh:driver'],
    }
    await expect(fixture.owner.mutation(api.capabilityProviderConnections.rotateOwner, rotateArgs))
      .resolves.toMatchObject({ kind: 'applied', connection: { lifecycle: 'active', authorityGeneration: 2 } })
    await expect(fixture.owner.mutation(api.capabilityProviderConnections.rotateOwner, rotateArgs))
      .resolves.toMatchObject({ kind: 'duplicate', connection: { lifecycle: 'active', authorityGeneration: 2 } })
    const refreshed = await backend.run(async (ctx) => {
      const row = await ctx.db.query('capabilityProviderConnections')
        .withIndex('by_connectionRef', (query) => query.eq('connectionRef', 'connection:driver'))
        .unique()
      if (row === null) throw new Error('refreshed_projection_missing')
      return row
    })
    expect(refreshed).toMatchObject({
      authorityGrantRef: `grt_${'8'.repeat(32)}`,
      canonicalConnectionGeneration: 2,
    })

    await grant(backend, owner, '2', 'connection:revoke', [
      `connection:${first.connection.canonicalConnectionRef}`,
    ])
    const revoked = await fixture.owner.mutation(api.capabilityProviderConnections.revokeOwner, {
      connectionRef: 'connection:driver',
      commandId: 'command:revoke:driver',
      expectedAuthorityGeneration: refreshed.authorityGeneration,
      expectedAuthorityDigest: refreshed.authorityDigest,
      evidenceRefs: ['evidence:revoke:driver'],
    })
    expect(revoked).toMatchObject({
      kind: 'applied',
      connection: {
        lifecycle: 'revocation_pending',
      },
    })
    await expect(backend.run(async (ctx) => {
      const row = await ctx.db.query('connections')
        .withIndex('by_connectionRef', (query) => query.eq('connectionRef', first.connection.canonicalConnectionRef as never))
        .unique()
      const legacy = await ctx.db.query('capabilityProviderConnections')
        .withIndex('by_connectionRef', (query) => query.eq('connectionRef', 'connection:driver'))
        .unique()
      return row === null || legacy === null ? null : {
        lifecycle: row.lifecycle,
        externalState: row.externalState,
        authorityGrantRef: legacy.authorityGrantRef,
        canonicalConnectionGeneration: legacy.canonicalConnectionGeneration,
      }
    })).resolves.toEqual({
      lifecycle: 'revoked',
      externalState: { kind: 'unknown', value: 'revocation_pending' },
      authorityGrantRef: `grt_${'2'.repeat(32)}`,
      canonicalConnectionGeneration: 3,
    })

    const cleanup = await backend.run(async (ctx) => {
      const row = await ctx.db.query('capabilityProviderConnections')
        .withIndex('by_connectionRef', (query) => query.eq('connectionRef', first.connection.connectionRef))
        .unique()
      if (row?.cleanupWorkId === undefined || row.cleanupCommandId === undefined
        || row.cleanupRequestDigest === undefined || row.cleanupAttempt === undefined) {
        throw new Error('cleanup_binding_missing')
      }
      return row
    })
    const cleanupCommandId = cleanup.cleanupCommandId
    const cleanupRequestDigest = cleanup.cleanupRequestDigest
    const cleanupAttempt = cleanup.cleanupAttempt
    const cleanupWorkId = cleanup.cleanupWorkId
    if (cleanupCommandId === undefined || cleanupRequestDigest === undefined || cleanupAttempt === undefined
      || cleanupWorkId === undefined) {
      throw new Error('cleanup_binding_missing')
    }
    const cleanupArgs = {
      connectionRef: cleanup.connectionRef,
      commandId: cleanupCommandId,
      expectedAuthorityGeneration: cleanup.authorityGeneration,
      expectedAuthorityDigest: cleanup.authorityDigest,
      requestDigest: cleanupRequestDigest,
      cleanupAttempt,
    }
    const cleanupTarget = await backend.query(
      internal.capabilityProviderConnections.readCleanupTarget,
      cleanupArgs,
    )
    expect(cleanupTarget).toMatchObject({
      connectionRef: cleanup.connectionRef,
      credentialRef: 'redacted',
      resourceAuthority: {
        canonicalConnectionRef: first.connection.canonicalConnectionRef,
        connectionGeneration: 3,
        owningAccountRef: owner.accountRef,
        actorPrincipalRef: owner.principalRef,
        grantRef: `grt_${'2'.repeat(32)}`,
        grantGeneration: 1,
      },
    })
    if (cleanupTarget === null) throw new Error('cleanup_target_missing')
    const cleanupAuthority = cleanupTarget.resourceAuthority
    await expect(backend.run(async (ctx) => await advanceLeaseDrainHandler(ctx, {
      ...cleanupArgs,
      workId: cleanupWorkId,
      resourceAuthority: cleanupAuthority,
      now: Date.now(),
    }))).resolves.toBeNull()
    await expect(backend.run(async (ctx) => await advanceLeaseDrainHandler(ctx, {
      ...cleanupArgs,
      workId: cleanupWorkId,
      resourceAuthority: { ...cleanupAuthority, grantGeneration: cleanupAuthority.grantGeneration + 1 },
      now: Date.now(),
    }))).resolves.toBeNull()
    const revokeGrant = await backend.run(async (ctx) => {
      const row = await ctx.db.query('authorityDelegationGrants')
        .withIndex('by_grantRef', (query) => query.eq('grantRef', cleanupAuthority.grantRef))
        .unique()
      if (row === null) throw new Error('cleanup_grant_missing')
      return row
    })
    await backend.run(async (ctx) => {
      await ctx.db.patch(revokeGrant._id, { expiresAt: Date.now() - 1 })
    })
    await expect(backend.query(internal.capabilityProviderConnections.readCleanupTarget, cleanupArgs))
      .resolves.toBeNull()
    await backend.run(async (ctx) => {
      await ctx.db.patch(revokeGrant._id, { expiresAt: revokeGrant.expiresAt, generation: 2, revision: 2 })
    })
    await expect(backend.query(internal.capabilityProviderConnections.readCleanupTarget, cleanupArgs))
      .resolves.toBeNull()
    await backend.run(async (ctx) => {
      const foreignAccountRef = `acc_${'9'.repeat(32)}`
      await ctx.db.patch(revokeGrant._id, {
        generation: revokeGrant.generation,
        revision: revokeGrant.revision,
        accountRef: foreignAccountRef,
        createdBy: { ...revokeGrant.createdBy, activeAccountRef: foreignAccountRef },
      })
    })
    await expect(backend.query(internal.capabilityProviderConnections.readCleanupTarget, cleanupArgs))
      .resolves.toBeNull()
    await backend.run(async (ctx) => {
      await ctx.db.patch(revokeGrant._id, {
        accountRef: revokeGrant.accountRef,
        createdBy: revokeGrant.createdBy,
        generation: revokeGrant.generation,
        revision: revokeGrant.revision,
        lifecycle: 'revoked',
        revokedAt: Date.now(),
        revokedBy: {
          actorPrincipalRef: owner.principalRef,
          activeAccountRef: owner.accountRef,
          correlationRef: 'test:cleanup:revoke',
          idempotencyRef: 'test:cleanup:revoke',
        },
      })
    })
    await expect(backend.query(internal.capabilityProviderConnections.readCleanupTarget, cleanupArgs))
      .resolves.toBeNull()
    await backend.run(async (ctx) => {
      await ctx.db.replace(revokeGrant._id, {
        grantRef: revokeGrant.grantRef,
        accountRef: revokeGrant.accountRef,
        actorPrincipalRef: revokeGrant.actorPrincipalRef,
        subjectPrincipalRef: revokeGrant.subjectPrincipalRef,
        ...(revokeGrant.parentGrantRef === undefined ? {} : { parentGrantRef: revokeGrant.parentGrantRef }),
        ...(revokeGrant.parentGeneration === undefined ? {} : { parentGeneration: revokeGrant.parentGeneration }),
        scopes: revokeGrant.scopes,
        resourceRefs: revokeGrant.resourceRefs,
        budgetLimit: revokeGrant.budgetLimit,
        budgetUsed: revokeGrant.budgetUsed,
        expiresAt: revokeGrant.expiresAt,
        generation: revokeGrant.generation,
        revision: revokeGrant.revision,
        lifecycle: revokeGrant.lifecycle,
        createdAt: revokeGrant.createdAt,
        createdBy: revokeGrant.createdBy,
      })
    })
    await backend.run(async (ctx) => await ctx.db.patch(revokeGrant._id, {
      subjectPrincipalRef: `prn_${'8'.repeat(32)}`,
    }))
    await expect(backend.query(internal.capabilityProviderConnections.readCleanupTarget, cleanupArgs))
      .resolves.toBeNull()
    await backend.run(async (ctx) => await ctx.db.patch(revokeGrant._id, {
      subjectPrincipalRef: revokeGrant.subjectPrincipalRef,
      scopes: ['connection:delete'],
    }))
    await expect(backend.query(internal.capabilityProviderConnections.readCleanupTarget, cleanupArgs))
      .resolves.toBeNull()
    await backend.run(async (ctx) => await ctx.db.patch(revokeGrant._id, {
      scopes: revokeGrant.scopes,
      resourceRefs: ['connection:wrong-resource'],
    }))
    await expect(backend.query(internal.capabilityProviderConnections.readCleanupTarget, cleanupArgs))
      .resolves.toBeNull()
    await backend.run(async (ctx) => await ctx.db.patch(revokeGrant._id, {
      resourceRefs: revokeGrant.resourceRefs,
    }))
    const currentOwnerRows = await backend.run(async (ctx) => {
      const principal = await ctx.db.query('principals')
        .withIndex('by_principalRef', (query) => query.eq('principalRef', owner.principalRef as never)).unique()
      const account = await ctx.db.query('accounts')
        .withIndex('by_accountRef', (query) => query.eq('accountRef', owner.accountRef as never)).unique()
      if (principal === null || account === null) throw new Error('cleanup_owner_rows_missing')
      const ownership = await ctx.db.query('accountOwnerships')
        .withIndex('by_ownershipRef', (query) => query.eq('ownershipRef', account.currentOwnershipRef)).unique()
      if (ownership === null) throw new Error('cleanup_ownership_missing')
      return { principalId: principal._id, accountId: account._id, ownershipId: ownership._id }
    })
    await backend.run(async (ctx) => await ctx.db.patch(currentOwnerRows.accountId, { revision: 0 }))
    await expect(backend.query(internal.capabilityProviderConnections.readCleanupTarget, cleanupArgs))
      .resolves.toBeNull()
    await expect(backend.run(async (ctx) => await advanceLeaseDrainHandler(ctx, {
      ...cleanupArgs,
      workId: cleanupWorkId,
      resourceAuthority: cleanupAuthority,
      now: Date.now(),
    }))).resolves.toBeNull()
    await expect(backend.run(async (ctx) => await enqueueCleanupWork(
      ctx,
      cleanup._id,
      cleanup as never,
      { ...cleanupArgs, workKind: 'cleanup' },
      Date.now(),
    ))).rejects.toThrow('provider_cleanup_resource_authority_invalid')
    await expect(backend.mutation(internal.capabilityProviderConnections.recordCleanupResult, {
      ...cleanupArgs,
      resourceAuthority: cleanupAuthority,
      workId: cleanupWorkId,
      outcome: 'unsupported' as const,
      evidenceRefs: ['evidence:cleanup:stale-account'],
      now: 0,
    })).resolves.toEqual({ kind: 'refused', code: 'invalid_transition' })
    await backend.run(async (ctx) => await ctx.db.patch(currentOwnerRows.accountId, { revision: 1 }))
    await backend.run(async (ctx) => await ctx.db.patch(currentOwnerRows.ownershipId, {
      ownerPrincipalRef: `prn_${'9'.repeat(32)}`,
    }))
    await expect(backend.query(internal.capabilityProviderConnections.readCleanupTarget, cleanupArgs))
      .resolves.toBeNull()
    await backend.run(async (ctx) => await ctx.db.patch(currentOwnerRows.ownershipId, {
      ownerPrincipalRef: owner.principalRef,
    }))
    await backend.run(async (ctx) => await ctx.db.patch(currentOwnerRows.principalId, { lifecycle: 'suspended' }))
    await expect(backend.query(internal.capabilityProviderConnections.readCleanupTarget, cleanupArgs))
      .resolves.toBeNull()
    await backend.run(async (ctx) => await ctx.db.patch(currentOwnerRows.principalId, { lifecycle: 'active' }))
    const ancestry = await backend.run(async (ctx) => {
      const parentIds: Array<Id<'authorityDelegationGrants'>> = []
      const parentRefs = Array.from({ length: 32 }, (_, index) =>
        `grt_${(100 + index).toString(16).padStart(32, '0')}`)
      for (let index = 0; index < parentRefs.length; index += 1) {
        const parentRef = parentRefs[index] as string
        const nextRef = parentRefs[index + 1]
        parentIds.push(await ctx.db.insert('authorityDelegationGrants', {
          grantRef: parentRef,
          accountRef: owner.accountRef,
          actorPrincipalRef: owner.principalRef,
          subjectPrincipalRef: owner.principalRef,
          ...(nextRef === undefined ? {} : { parentGrantRef: nextRef, parentGeneration: 1 }),
          scopes: ['connection:revoke'],
          resourceRefs: [`connection:${first.connection.canonicalConnectionRef}`],
          budgetLimit: 1,
          budgetUsed: 0,
          expiresAt: revokeGrant.expiresAt + (index + 1) * 1_000,
          generation: 1,
          revision: 1,
          lifecycle: 'active',
          createdAt: 1,
          createdBy: {
            actorPrincipalRef: owner.principalRef,
            activeAccountRef: owner.accountRef,
            correlationRef: `test:cleanup:parent:${index}`,
            idempotencyRef: `test:cleanup:parent:${index}`,
          },
        }))
      }
      await ctx.db.patch(revokeGrant._id, {
        parentGrantRef: parentRefs[0],
        parentGeneration: 1,
      })
      return { parentIds, parentRefs }
    })
    await expect(backend.query(internal.capabilityProviderConnections.readCleanupTarget, cleanupArgs))
      .resolves.toBeNull()
    await backend.run(async (ctx) => {
      const boundedRoot = ancestry.parentIds[30]
      if (boundedRoot === undefined) throw new Error('cleanup_bounded_root_missing')
      await ctx.db.patch(boundedRoot, { parentGrantRef: undefined, parentGeneration: undefined })
    })
    await expect(backend.query(internal.capabilityProviderConnections.readCleanupTarget, cleanupArgs))
      .resolves.toMatchObject({ resourceAuthority: cleanupAuthority })

    const firstParent = ancestry.parentIds[0]
    if (firstParent === undefined) throw new Error('cleanup_parent_missing')
    await backend.run(async (ctx) => await ctx.db.patch(firstParent, { scopes: ['connection:delete'] }))
    await expect(backend.query(internal.capabilityProviderConnections.readCleanupTarget, cleanupArgs))
      .resolves.toBeNull()
    await backend.run(async (ctx) => await ctx.db.patch(firstParent, { scopes: ['connection:revoke'] }))
    await backend.run(async (ctx) => await ctx.db.patch(firstParent, {
      subjectPrincipalRef: `prn_${'8'.repeat(32)}`,
    }))
    await expect(backend.query(internal.capabilityProviderConnections.readCleanupTarget, cleanupArgs))
      .resolves.toBeNull()
    await backend.run(async (ctx) => await ctx.db.patch(firstParent, {
      subjectPrincipalRef: owner.principalRef,
      resourceRefs: ['connection:wrong-resource'],
    }))
    await expect(backend.query(internal.capabilityProviderConnections.readCleanupTarget, cleanupArgs))
      .resolves.toBeNull()
    await backend.run(async (ctx) => await ctx.db.patch(firstParent, {
      resourceRefs: [`connection:${first.connection.canonicalConnectionRef}`],
    }))
    await backend.run(async (ctx) => await ctx.db.patch(revokeGrant._id, { budgetLimit: 2 }))
    await expect(backend.query(internal.capabilityProviderConnections.readCleanupTarget, cleanupArgs))
      .resolves.toBeNull()
    await backend.run(async (ctx) => await ctx.db.patch(revokeGrant._id, { budgetLimit: 1 }))
    await backend.run(async (ctx) => await ctx.db.patch(firstParent, { expiresAt: revokeGrant.expiresAt }))
    await expect(backend.query(internal.capabilityProviderConnections.readCleanupTarget, cleanupArgs))
      .resolves.toBeNull()
    await backend.run(async (ctx) => await ctx.db.patch(firstParent, {
      expiresAt: revokeGrant.expiresAt + 1_000,
    }))
    await backend.run(async (ctx) => await ctx.db.patch(revokeGrant._id, {
      parentGrantRef: `grt_${'f'.repeat(32)}`,
      parentGeneration: 1,
    }))
    await expect(backend.query(internal.capabilityProviderConnections.readCleanupTarget, cleanupArgs))
      .resolves.toBeNull()
    await backend.run(async (ctx) => await ctx.db.patch(revokeGrant._id, {
      parentGrantRef: revokeGrant.grantRef,
      parentGeneration: revokeGrant.generation,
    }))
    await expect(backend.query(internal.capabilityProviderConnections.readCleanupTarget, cleanupArgs))
      .resolves.toBeNull()
    await backend.run(async (ctx) => await ctx.db.patch(revokeGrant._id, {
      parentGrantRef: ancestry.parentRefs[0],
      parentGeneration: 1,
    }))
    const cleanupResultArgs = {
      ...cleanupArgs,
      resourceAuthority: cleanupAuthority,
      workId: cleanupWorkId,
      outcome: 'unsupported' as const,
      reasonCode: 'cleanup_adapter_unsupported',
      evidenceRefs: ['evidence:cleanup'],
      now: 0,
    }
    const { resourceAuthority: _resourceAuthority, ...unboundCleanupResultArgs } = cleanupResultArgs
    await expect(backend.mutation(
      internal.capabilityProviderConnections.recordCleanupResult,
      unboundCleanupResultArgs,
    )).resolves.toEqual({ kind: 'refused', code: 'invalid_transition' })
    await expect(backend.mutation(internal.capabilityProviderConnections.recordCleanupResult, {
      ...cleanupResultArgs,
      resourceAuthority: { ...cleanupAuthority, grantGeneration: cleanupAuthority.grantGeneration + 1 },
    })).resolves.toEqual({ kind: 'refused', code: 'invalid_transition' })
    await expect(backend.mutation(internal.capabilityProviderConnections.recordCleanupResult, cleanupResultArgs))
      .resolves.toMatchObject({ kind: 'applied' })
    await expect(backend.mutation(internal.capabilityProviderConnections.recordCleanupResult, cleanupResultArgs))
      .resolves.toMatchObject({ kind: 'duplicate' })
  })

  it('denies authenticated owner reads of an unmapped legacy connection', async () => {
    const backend = convexTestWithMarketComponents()
    const fixture = await publishedBusinessOwner(backend, 'connection-driver-unmapped')
    await backend.run(async (ctx) => {
      await ctx.db.insert('capabilityProviderConnections', {
        connectionRef: 'connection:unmapped',
        businessId: fixture.businessId,
        providerRef: 'provider:unmapped',
        providerAccountRef: 'account:unmapped',
        adapterId: 'x402-fetch:v2',
        credentialRef: null,
        grantedScopes: [],
        grantedResources: ['https://provider.example/unmapped'],
        authorityGeneration: 1,
        authorityDigest: `sha256:${'a'.repeat(64)}`,
        lifecycle: 'active',
        observedAt: 1,
        evidenceRefs: [],
        createdAt: 1,
        updatedAt: 1,
        lastCommandId: 'legacy',
        lastCommandDigest: `sha256:${'b'.repeat(64)}`,
      })
    })

    await expect(fixture.owner.query(api.capabilityProviderConnections.readOwner, {
      connectionRef: 'connection:unmapped',
    })).resolves.toBeNull()
    await expect(fixture.owner.query(api.capabilityProviderConnections.listOwner, {})).resolves.toEqual([])
    await expect(backend.query(internal.capabilityProviderConnections.listByBusinessLifecycle, {
      businessId: fixture.businessId,
      lifecycle: 'active',
      limit: 10,
    })).resolves.toEqual([])
    await expect(backend.query(internal.capabilityProviderConnections.listByProviderLifecycle, {
      providerRef: 'provider:unmapped',
      lifecycle: 'active',
      limit: 10,
    })).resolves.toEqual([])
    await expect(backend.query(internal.capabilityProviderConnections.readAtGeneration, {
      connectionRef: 'connection:unmapped',
      authorityGeneration: 1,
    })).resolves.toBeNull()
  })

  it('binds X402 and owner command adapters to canonical Account authority', async () => {
    const backend = convexTestWithWorkers({ pauseWorkpool: true })
    const fixture = await publishedBusinessOwner(backend, 'connection-driver-x402')
    const owner = await canonicalOwner(backend, fixture.businessId)
    const resourceUrl = 'https://provider.example/resource'
    const foreign = await publishedBusinessOwner(backend, 'connection-driver-x402-foreign')

    await expect(fixture.owner.mutation(api.capabilityProviderConnections.connectX402Owner, {
      businessId: foreign.businessId,
      resourceUrl,
      commandId: 'command:x402:foreign-business',
      evidenceRefs: [],
    })).resolves.toEqual({ kind: 'refused', code: 'invalid_identity' })

    await expect(fixture.owner.mutation(api.capabilityProviderConnections.connectX402Owner, {
      businessId: fixture.businessId,
      resourceUrl: 'not-a-url',
      commandId: 'command:x402:invalid-url',
      evidenceRefs: [],
    })).resolves.toEqual({ kind: 'refused', code: 'invalid_identity' })
    await expect(fixture.owner.mutation(api.capabilityProviderConnections.connectX402Owner, {
      businessId: fixture.businessId,
      resourceUrl: `${resourceUrl}#fragment`,
      commandId: 'command:x402:fragment',
      evidenceRefs: [],
    })).resolves.toEqual({ kind: 'refused', code: 'invalid_identity' })
    await expect(fixture.owner.mutation(api.capabilityProviderConnections.connectX402Owner, {
      businessId: fixture.businessId,
      resourceUrl,
      commandId: '',
      evidenceRefs: [],
    })).resolves.toMatchObject({ kind: 'refused' })
    await expect(fixture.owner.mutation(api.capabilityProviderConnections.connectX402Owner, {
      businessId: fixture.businessId,
      resourceUrl,
      commandId: 'command:x402:no-grant',
      evidenceRefs: [],
    })).resolves.toEqual({ kind: 'refused', code: 'invalid_transition' })

    await grant(backend, owner, 'd', 'connection:install', [
      'connection-provider:x402',
      `connection-provider:x402:${resourceUrl}`,
    ])
    const connected = await fixture.owner.mutation(api.capabilityProviderConnections.connectX402Owner, {
      businessId: fixture.businessId,
      resourceUrl,
      commandId: 'command:x402:connect',
      evidenceRefs: ['evidence:x402'],
    })
    expect(connected).toMatchObject({ kind: 'applied', connection: { lifecycle: 'active' } })
    if (connected.kind === 'refused') throw new Error(connected.code)
    await expect(fixture.owner.mutation(api.capabilityProviderConnections.connectX402Owner, {
      businessId: fixture.businessId,
      resourceUrl,
      commandId: 'command:x402:connect',
      evidenceRefs: ['evidence:x402'],
    })).resolves.toMatchObject({ kind: 'duplicate', connection: { lifecycle: 'active' } })
    await expect(backend.run(async (ctx) => await ctx.db.query('capabilityProviderConnections')
      .withIndex('by_connectionRef', (query) => query.eq('connectionRef', connected.connection.connectionRef))
      .unique())).resolves.toMatchObject({ owningAccountRef: owner.accountRef })

    await expect(fixture.owner.mutation(api.capabilityProviderConnections.rotateOwner, {
      connectionRef: 'connection:missing',
      commandId: 'command:x402:rotate-missing',
      expectedAuthorityGeneration: 1,
      expectedAuthorityDigest: `sha256:${'a'.repeat(64)}`,
      evidenceRefs: [],
    })).resolves.toEqual({ kind: 'refused', code: 'invalid_transition' })
    await expect(fixture.owner.mutation(api.capabilityProviderConnections.rotateOwner, {
      connectionRef: connected.connection.connectionRef,
      commandId: 'command:x402:rotate-no-grant',
      expectedAuthorityGeneration: connected.connection.authorityGeneration,
      expectedAuthorityDigest: connected.connection.authorityDigest,
      evidenceRefs: [],
    })).resolves.toEqual({ kind: 'refused', code: 'invalid_transition' })
    await expect(fixture.owner.mutation(api.capabilityProviderConnections.revokeOwner, {
      connectionRef: 'connection:missing',
      commandId: 'command:x402:revoke-missing',
      expectedAuthorityGeneration: 1,
      expectedAuthorityDigest: `sha256:${'a'.repeat(64)}`,
      evidenceRefs: [],
    })).resolves.toMatchObject({ kind: 'refused' })
    await expect(fixture.owner.mutation(api.capabilityProviderConnections.revokeOwner, {
      connectionRef: connected.connection.connectionRef,
      commandId: 'command:x402:revoke-no-grant',
      expectedAuthorityGeneration: connected.connection.authorityGeneration,
      expectedAuthorityDigest: connected.connection.authorityDigest,
      evidenceRefs: [],
    })).resolves.toEqual({ kind: 'refused', code: 'invalid_transition' })
    await expect(fixture.owner.mutation(internal.capabilityProviderConnections.shareOwner, {
      connectionRef: 'connection:missing',
      granteeAccountRef: owner.accountRef,
      commandId: 'command:share:missing',
    })).resolves.toEqual({ kind: 'refused', code: 'invalid_transition' })
    await expect(fixture.owner.mutation(internal.capabilityProviderConnections.shareOwner, {
      connectionRef: connected.connection.connectionRef,
      granteeAccountRef: 'invalid-account',
      commandId: 'command:share:invalid-account',
    })).resolves.toEqual({ kind: 'refused', code: 'invalid_transition' })
    await expect(fixture.owner.mutation(internal.capabilityProviderConnections.shareOwner, {
      connectionRef: connected.connection.connectionRef,
      granteeAccountRef: 'acc_00000000000000000000000000000002',
      commandId: 'command:share:no-grant',
    })).resolves.toEqual({ kind: 'refused', code: 'invalid_transition' })

    const canonicalConnectionRef = await backend.run(async (ctx) => {
      const row = await ctx.db.query('capabilityProviderConnections')
        .withIndex('by_connectionRef', (query) => query.eq('connectionRef', connected.connection.connectionRef))
        .unique()
      if (row?.canonicalConnectionRef === undefined) throw new Error('canonical_connection_missing')
      return row.canonicalConnectionRef
    })
    await grant(backend, owner, 'e', 'connection:revoke', [`connection:${canonicalConnectionRef}`])
    const revoked = await fixture.owner.mutation(api.capabilityProviderConnections.revokeOwner, {
      connectionRef: connected.connection.connectionRef,
      commandId: 'command:x402:revoke',
      expectedAuthorityGeneration: connected.connection.authorityGeneration,
      expectedAuthorityDigest: connected.connection.authorityDigest,
      evidenceRefs: [],
    })
    expect(revoked).toMatchObject({ kind: 'applied' })
    const cleanupGrace = await backend.run(async (ctx) => {
      const row = await ctx.db.query('capabilityProviderConnections')
        .withIndex('by_connectionRef', (query) => query.eq('connectionRef', connected.connection.connectionRef))
        .unique()
      if (row?.cleanupCallbackGraceUntil === undefined) throw new Error('cleanup_grace_missing')
      return row.cleanupCallbackGraceUntil
    })
    vi.useFakeTimers()
    vi.setSystemTime(cleanupGrace)
    try {
      await expect(fixture.owner.mutation(api.capabilityProviderConnections.retryOwnerCleanup, {
        connectionRef: connected.connection.connectionRef,
        commandId: 'command:x402:retry',
      })).resolves.toMatchObject({ kind: 'duplicate' })
    } finally {
      vi.useRealTimers()
    }
  })

  it('fails closed across missing, anonymous, and unmapped adapter surfaces', async () => {
    const backend = convexTestWithMarketComponents()
    const fixture = await publishedBusinessOwner(backend, 'connection-driver-negative')
    const missingConnection = 'connection:missing'

    await expect(backend.query(internal.capabilityProviderConnections.read, {
      connectionRef: missingConnection,
    })).resolves.toBeNull()
    await expect(backend.query(internal.capabilityProviderConnections.readAtGeneration, {
      connectionRef: missingConnection,
      authorityGeneration: 1,
    })).resolves.toBeNull()
    await expect(backend.query(internal.capabilityProviderConnections.resolveCredentialRef, {
      connectionRef: missingConnection,
      expectedAuthorityGeneration: 1,
      expectedAuthorityDigest: `sha256:${'a'.repeat(64)}`,
      now: 0,
    })).resolves.toEqual({ kind: 'unavailable', reason: 'inactive' })
    await expect(backend.query(internal.capabilityProviderConnections.validateAuthority, {
      connectionRef: missingConnection,
      expectedAuthorityGeneration: 1,
      expectedAuthorityDigest: `sha256:${'a'.repeat(64)}`,
      now: 0,
    })).resolves.toEqual({ kind: 'unavailable', reason: 'inactive' })
    await expect(backend.query(internal.capabilityProviderConnections.readCleanupTarget, {
      connectionRef: missingConnection,
      commandId: 'cleanup:missing',
      expectedAuthorityGeneration: 1,
      expectedAuthorityDigest: `sha256:${'a'.repeat(64)}`,
      requestDigest: `sha256:${'b'.repeat(64)}`,
      cleanupAttempt: 1,
    })).resolves.toBeNull()
    await expect(backend.query(internal.capabilityProviderConnections.listByBusinessLifecycle, {
      businessId: fixture.businessId,
      lifecycle: 'active',
      limit: 10,
    })).resolves.toEqual([])
    await expect(backend.query(internal.capabilityProviderConnections.listByProviderLifecycle, {
      providerRef: 'provider:missing',
      lifecycle: 'active',
      limit: 10,
    })).resolves.toEqual([])

    await expect(backend.query(internal.capabilityProviderConnections.readLease, {
      leaseRef: 'lease:missing',
    })).resolves.toBeNull()
    await expect(backend.query(internal.capabilityProviderConnections.readLeaseByInvocation, {
      invocationRef: 'invocation:missing',
    })).resolves.toBeNull()
    await expect(backend.mutation(internal.capabilityProviderConnections.beginLeaseEffect, {
      leaseRef: 'lease:missing',
      invocationRef: 'invocation:missing',
      operationRef: 'operation:missing',
      commandId: 'command:effect:missing',
    })).resolves.toEqual({ kind: 'unavailable', reason: 'lease_inactive' })
    await expect(backend.mutation(internal.capabilityProviderConnections.consumeLease, {
      leaseRef: 'lease:missing',
      commandId: 'command:consume:missing',
      expectedAuthorityGeneration: 1,
      expectedAuthorityDigest: `sha256:${'a'.repeat(64)}`,
      readinessValidUntil: Date.now() + 1_000,
      evidenceRefs: [],
      now: 0,
    })).resolves.toEqual({ kind: 'refused', code: 'lease_inactive' })
    await expect(backend.mutation(internal.capabilityProviderConnections.expireLease, {
      leaseRef: 'lease:missing',
      commandId: 'command:expire:missing',
      evidenceRefs: [],
      now: 0,
    })).resolves.toEqual({ kind: 'refused', code: 'lease_not_found' })
    await expect(backend.mutation(internal.capabilityProviderConnections.invalidateLease, {
      leaseRef: 'lease:missing',
      commandId: 'command:invalidate:missing',
      reasonCode: 'invocation_aborted',
      evidenceRefs: [],
      now: 0,
    })).resolves.toEqual({ kind: 'refused', code: 'lease_not_found' })

    await expect(backend.query(api.capabilityProviderConnections.readOwner, {
      connectionRef: missingConnection,
    })).resolves.toBeNull()
    await expect(backend.query(api.capabilityProviderConnections.listOwner, {})).resolves.toEqual([])
    await expect(backend.mutation(api.capabilityProviderConnections.retryOwnerCleanup, {
      connectionRef: missingConnection,
      commandId: 'command:retry:missing',
    })).resolves.toEqual({ kind: 'refused', code: 'invalid_identity' })
    await expect(backend.mutation(api.capabilityProviderConnections.connectX402Owner, {
      businessId: fixture.businessId,
      resourceUrl: 'https://provider.example/resource',
      commandId: 'command:x402:anonymous',
      evidenceRefs: [],
    })).resolves.toEqual({ kind: 'refused', code: 'invalid_identity' })
  })

  it('revalidates every internal lifecycle command against current canonical authority', async () => {
    const backend = convexTestWithWorkers({ pauseWorkpool: true })
    const fixture = await publishedBusinessOwner(backend, 'connection-driver-internal')
    const owner = await canonicalOwner(backend, fixture.businessId)
    await grant(backend, owner, 'a', 'connection:install', [
      `connection-provider:${PROVIDER_NAMESPACE}`,
      `connection-provider:${PROVIDER_NAMESPACE}:${PROVIDER_ACCOUNT_REF}`,
      `secret:${SECRET_REF}`,
    ])
    const installed = await install(backend, fixture.businessId, 'internal')
    if (installed.kind === 'refused' || installed.connection.canonicalConnectionRef === undefined) {
      throw new Error('canonical_install_failed')
    }
    await backend.run(async (ctx) => {
      const row = await ctx.db.query('capabilityProviderConnections')
        .withIndex('by_connectionRef', (query) => query.eq('connectionRef', installed.connection.connectionRef))
        .unique()
      if (row === null) throw new Error('legacy_projection_missing')
      await ctx.db.patch(row._id, { canonicalConnectionGeneration: 999 })
    })
    await expect(install(backend, fixture.businessId, 'internal'))
      .resolves.toEqual({ kind: 'refused', code: 'invalid_transition' })
    await backend.run(async (ctx) => {
      const row = await ctx.db.query('capabilityProviderConnections')
        .withIndex('by_connectionRef', (query) => query.eq('connectionRef', installed.connection.connectionRef))
        .unique()
      if (row === null) throw new Error('legacy_projection_missing')
      await ctx.db.patch(row._id, { canonicalConnectionGeneration: installed.connection.canonicalConnectionGeneration })
    })
    const reauthorizeArgs = {
      commandId: 'command:refresh:internal',
      connectionRef: installed.connection.connectionRef,
      businessId: fixture.businessId,
      providerRef: installed.connection.providerRef,
      providerAccountRef: installed.connection.providerAccountRef,
      adapterId: installed.connection.adapterId,
      credentialRef: installed.connection.credentialRef,
      requestedScopes: [...installed.connection.grantedScopes],
      grantedScopes: [...installed.connection.grantedScopes],
      requestedResources: [...installed.connection.grantedResources],
      grantedResources: [...installed.connection.grantedResources],
      evidenceRefs: ['evidence:refresh'],
      expectedAuthorityGeneration: installed.connection.authorityGeneration,
      expectedAuthorityDigest: installed.connection.authorityDigest,
      now: 0,
    }
    await expect(backend.mutation(internal.capabilityProviderConnections.reauthorize, {
      ...reauthorizeArgs,
      connectionRef: 'connection:missing',
    })).resolves.toEqual({ kind: 'refused', code: 'invalid_transition' })
    await expect(backend.mutation(internal.capabilityProviderConnections.reauthorize, {
      ...reauthorizeArgs,
      expectedAuthorityGeneration: 999,
    })).resolves.toEqual({ kind: 'refused', code: 'invalid_generation' })
    await backend.run(async (ctx) => {
      const row = await ctx.db.query('capabilityProviderConnections')
        .withIndex('by_connectionRef', (query) => query.eq('connectionRef', installed.connection.connectionRef))
        .unique()
      if (row === null) throw new Error('legacy_projection_missing')
      await ctx.db.patch(row._id, { canonicalConnectionGeneration: 999 })
    })
    await expect(backend.mutation(internal.capabilityProviderConnections.reauthorize, reauthorizeArgs))
      .resolves.toEqual({ kind: 'refused', code: 'invalid_identity' })
    await backend.run(async (ctx) => {
      const row = await ctx.db.query('capabilityProviderConnections')
        .withIndex('by_connectionRef', (query) => query.eq('connectionRef', installed.connection.connectionRef))
        .unique()
      if (row === null) throw new Error('legacy_projection_missing')
      await ctx.db.patch(row._id, { canonicalConnectionGeneration: installed.connection.canonicalConnectionGeneration })
    })
    await expect(backend.mutation(internal.capabilityProviderConnections.reauthorize, reauthorizeArgs))
      .resolves.toEqual({ kind: 'refused', code: 'invalid_transition' })

    await grant(backend, owner, 'b', 'connection:refresh', [
      `connection:${installed.connection.canonicalConnectionRef}`,
    ])
    const refreshed = await backend.mutation(internal.capabilityProviderConnections.reauthorize, reauthorizeArgs)
    expect(refreshed).toMatchObject({ kind: 'applied', connection: { canonicalConnectionGeneration: 2 } })
    if (refreshed.kind === 'refused') throw new Error(refreshed.code)
    await expect(backend.mutation(internal.capabilityProviderConnections.reauthorize, reauthorizeArgs))
      .resolves.toMatchObject({ kind: 'duplicate' })

    const revokeArgs = {
      connectionRef: refreshed.connection.connectionRef,
      commandId: 'command:revoke:internal',
      expectedAuthorityGeneration: refreshed.connection.authorityGeneration,
      expectedAuthorityDigest: refreshed.connection.authorityDigest,
      evidenceRefs: ['evidence:revoke'],
      now: 0,
    }
    await expect(backend.mutation(internal.capabilityProviderConnections.beginRevocation, {
      ...revokeArgs,
      connectionRef: 'connection:missing',
    })).resolves.toEqual({ kind: 'refused', code: 'invalid_transition' })
    await expect(backend.mutation(internal.capabilityProviderConnections.beginRevocation, {
      ...revokeArgs,
      expectedAuthorityGeneration: 999,
    })).resolves.toEqual({ kind: 'refused', code: 'invalid_generation' })
    await expect(backend.mutation(internal.capabilityProviderConnections.beginRevocation, revokeArgs))
      .resolves.toEqual({ kind: 'refused', code: 'invalid_transition' })
    await grant(backend, owner, 'c', 'connection:revoke', [
      `connection:${installed.connection.canonicalConnectionRef}`,
    ])
    const revoked = await backend.mutation(internal.capabilityProviderConnections.beginRevocation, revokeArgs)
    expect(revoked).toMatchObject({ kind: 'applied', connection: { lifecycle: 'revocation_pending' } })
    await expect(backend.mutation(internal.capabilityProviderConnections.beginRevocation, revokeArgs))
      .resolves.toEqual({ kind: 'refused', code: 'invalid_identity' })

    await expect(backend.mutation(internal.capabilityProviderConnections.recordCleanupResult, {
      connectionRef: 'connection:missing',
      commandId: 'cleanup:missing',
      expectedAuthorityGeneration: 1,
      expectedAuthorityDigest: `sha256:${'d'.repeat(64)}`,
      cleanupAttempt: 1,
      workId: 'work:missing',
      requestDigest: `sha256:${'e'.repeat(64)}`,
      outcome: 'outcome_unknown',
      evidenceRefs: [],
      now: 0,
    })).resolves.toEqual({ kind: 'refused', code: 'invalid_transition' })

    await expect(backend.mutation(internal.capabilityProviderConnections.advanceLeaseDrain, {
      connectionRef: 'connection:missing',
      commandId: 'cleanup:missing',
      expectedAuthorityGeneration: 1,
      expectedAuthorityDigest: `sha256:${'d'.repeat(64)}`,
      requestDigest: `sha256:${'e'.repeat(64)}`,
      cleanupAttempt: 1,
      workId: 'work:missing',
      now: 0,
    })).resolves.toBeNull()

    await expect(backend.mutation(internal.capabilityProviderConnections.recordCleanupResult, {
      connectionRef: revoked.kind === 'refused' ? 'unreachable' : revoked.connection.connectionRef,
      commandId: 'cleanup:not-bound',
      expectedAuthorityGeneration: revoked.kind === 'refused' ? 1 : revoked.connection.authorityGeneration,
      expectedAuthorityDigest: revoked.kind === 'refused' ? `sha256:${'d'.repeat(64)}` : revoked.connection.authorityDigest,
      cleanupAttempt: 1,
      workId: 'work:not-bound',
      requestDigest: `sha256:${'e'.repeat(64)}`,
      outcome: 'outcome_unknown',
      evidenceRefs: [],
      now: 0,
    })).resolves.toMatchObject({ kind: 'refused' })

    if (revoked.kind === 'refused') throw new Error(revoked.code)
    const cleanupIdentity = {
      commandId: 'cleanup:bound',
      requestDigest: `sha256:${'e'.repeat(64)}`,
      cleanupAttempt: 1,
      workId: 'work:bound',
    }
    await backend.run(async (ctx) => {
      const row = await ctx.db.query('capabilityProviderConnections')
        .withIndex('by_connectionRef', (query) => query.eq('connectionRef', revoked.connection.connectionRef))
        .unique()
      if (row === null) throw new Error('revoked_projection_missing')
      await ctx.db.patch(row._id, {
        cleanupWorkKind: 'lease_drain',
        cleanupCommandId: cleanupIdentity.commandId,
        cleanupRequestDigest: cleanupIdentity.requestDigest,
        cleanupAttempt: cleanupIdentity.cleanupAttempt,
        cleanupWorkId: cleanupIdentity.workId,
      })
    })
    await expect(backend.mutation(internal.capabilityProviderConnections.advanceLeaseDrain, {
      connectionRef: revoked.connection.connectionRef,
      expectedAuthorityGeneration: revoked.connection.authorityGeneration,
      expectedAuthorityDigest: revoked.connection.authorityDigest,
      now: 0,
      ...cleanupIdentity,
    })).resolves.toBeNull()

    const invalidCreate = {
      commandId: 'command:create:invalid',
      connectionRef: 'connection:invalid',
      businessId: fixture.businessId,
      providerRef: 'provider:invalid',
      providerAccountRef: 'account:invalid',
      adapterId: 'http-json:v1',
      credentialRef: 'caller-shaped-secret',
      requestedScopes: ['profile:read'],
      grantedScopes: ['profile:read'],
      requestedResources: ['account:invalid'],
      grantedResources: ['account:invalid'],
      evidenceRefs: [],
      now: 0,
    }
    await expect(backend.mutation(internal.capabilityProviderConnections.create, invalidCreate))
      .resolves.toMatchObject({ kind: 'refused' })
    await expect(backend.mutation(internal.capabilityProviderConnections.create, {
      ...invalidCreate,
      commandId: 'command:create:no-grant',
      connectionRef: 'connection:no-grant',
      credentialRef: SECRET_REF,
    })).resolves.toEqual({ kind: 'refused', code: 'invalid_transition' })

    await expect(backend.query(internal.capabilityProviderConnections.resolveCredentialRef, {
      connectionRef: revoked.connection.connectionRef,
      expectedAuthorityGeneration: revoked.connection.authorityGeneration,
      expectedAuthorityDigest: revoked.connection.authorityDigest,
      now: 0,
    })).resolves.toEqual({ kind: 'unavailable', reason: 'inactive' })
    await expect(backend.query(internal.capabilityProviderConnections.validateAuthority, {
      connectionRef: revoked.connection.connectionRef,
      expectedAuthorityGeneration: revoked.connection.authorityGeneration,
      expectedAuthorityDigest: revoked.connection.authorityDigest,
      now: 0,
    })).resolves.toEqual({ kind: 'unavailable', reason: 'inactive' })
  })

  it('keeps cleanup and duplicate revocation fail closed until canonical revocation', async () => {
    const backend = convexTestWithMarketComponents()
    const fixture = await publishedBusinessOwner(backend, 'connection-driver-cleanup-guard')
    const owner = await canonicalOwner(backend, fixture.businessId)
    await grant(backend, owner, '5', 'connection:install', [
      `connection-provider:${PROVIDER_NAMESPACE}`,
      `connection-provider:${PROVIDER_NAMESPACE}:${PROVIDER_ACCOUNT_REF}`,
      `secret:${SECRET_REF}`,
    ])
    const installed = await install(backend, fixture.businessId, 'cleanup-guard')
    if (installed.kind === 'refused') throw new Error(installed.code)
    const activeLegacy = await backend.run(async (ctx) => await ctx.db.query('capabilityProviderConnections')
      .withIndex('by_connectionRef', (query) => query.eq('connectionRef', installed.connection.connectionRef))
      .unique())
    if (activeLegacy === null) throw new Error('active_projection_missing')
    const revocationArgs = {
      commandId: 'command:synthetic-revoke',
      expectedAuthorityGeneration: activeLegacy.authorityGeneration,
      expectedAuthorityDigest: activeLegacy.authorityDigest,
      evidenceRefs: [] as string[],
    }
    const synthetic = beginProviderConnectionRevocation(activeLegacy, revocationArgs, Date.now())
    if (synthetic.kind !== 'applied') throw new Error('synthetic_revocation_failed')
    const syntheticLastCommandId = synthetic.connection.lastCommandId
    const syntheticLastCommandDigest = synthetic.connection.lastCommandDigest
    if (syntheticLastCommandId === undefined || syntheticLastCommandDigest === undefined) {
      throw new Error('synthetic_revocation_receipt_missing')
    }
    const cleanupIdentity = {
      commandId: revocationArgs.commandId,
      requestDigest: `sha256:${'f'.repeat(64)}`,
      cleanupAttempt: 1,
      workId: 'work:active-canonical',
    }
    await backend.run(async (ctx) => await ctx.db.replace(activeLegacy._id, {
      ...synthetic.connection,
      businessId: fixture.businessId,
      grantedScopes: [...synthetic.connection.grantedScopes],
      grantedResources: [...synthetic.connection.grantedResources],
      evidenceRefs: [...synthetic.connection.evidenceRefs],
      lastCommandId: syntheticLastCommandId,
      lastCommandDigest: syntheticLastCommandDigest,
      cleanupWorkKind: 'cleanup',
      cleanupCommandId: cleanupIdentity.commandId,
      cleanupRequestDigest: cleanupIdentity.requestDigest,
      cleanupAttempt: cleanupIdentity.cleanupAttempt,
      cleanupWorkId: cleanupIdentity.workId,
    }))
    await expect(backend.mutation(internal.capabilityProviderConnections.beginRevocation, {
      connectionRef: activeLegacy.connectionRef,
      ...revocationArgs,
      now: 0,
    })).resolves.toEqual({ kind: 'refused', code: 'invalid_identity' })
    await expect(backend.mutation(internal.capabilityProviderConnections.advanceLeaseDrain, {
      connectionRef: activeLegacy.connectionRef,
      expectedAuthorityGeneration: activeLegacy.authorityGeneration,
      expectedAuthorityDigest: activeLegacy.authorityDigest,
      now: 0,
      ...cleanupIdentity,
    })).resolves.toBeNull()
    await expect(backend.mutation(internal.capabilityProviderConnections.recordCleanupResult, {
      connectionRef: activeLegacy.connectionRef,
      commandId: cleanupIdentity.commandId,
      expectedAuthorityGeneration: activeLegacy.authorityGeneration,
      expectedAuthorityDigest: activeLegacy.authorityDigest,
      cleanupAttempt: cleanupIdentity.cleanupAttempt,
      workId: cleanupIdentity.workId,
      requestDigest: cleanupIdentity.requestDigest,
      outcome: 'outcome_unknown',
      evidenceRefs: [],
      now: 0,
    })).resolves.toEqual({ kind: 'refused', code: 'invalid_transition' })
    await backend.run(async (ctx) => await ctx.db.patch(activeLegacy._id, {
      owningAccountRef: 'acc_000000000000000000000000000000ff',
    }))
    await expect(backend.query(internal.capabilityProviderConnections.readCleanupTarget, {
      connectionRef: activeLegacy.connectionRef,
      commandId: cleanupIdentity.commandId,
      expectedAuthorityGeneration: activeLegacy.authorityGeneration,
      expectedAuthorityDigest: activeLegacy.authorityDigest,
      requestDigest: cleanupIdentity.requestDigest,
      cleanupAttempt: cleanupIdentity.cleanupAttempt,
    })).resolves.toBeNull()

    await grant(backend, owner, '6', 'connection:install', ['connection-provider:provider/no-locator'])
    const direct = await backend.run(async (ctx) => await installCanonicalProviderConnection(ctx, {
      actor: { principalRef: principalRef(owner.principalRef), accountRef: accountRef(owner.accountRef) },
      commandId: 'command:direct-install',
      providerNamespace: 'provider/no-locator',
      credentialRef: null,
    }))
    if (direct === null) throw new Error('direct_install_failed')
    await grant(backend, owner, 'f', 'connection:install', ['connection-provider:'])
    await expect(backend.run(async (ctx) => await installCanonicalProviderConnection(ctx, {
      actor: { principalRef: principalRef(owner.principalRef), accountRef: accountRef(owner.accountRef) },
      commandId: 'command:invalid-provider-install',
      providerNamespace: '',
      credentialRef: null,
    }))).resolves.toBeNull()
    const granteeAccountRef = accountRef('acc_0000000000000000000000000000000a')
    await grant(backend, owner, '0', 'connection:share', [
      `account:${granteeAccountRef}`,
      `connection:${direct.connectionRef}`,
    ])
    await expect(backend.run(async (ctx) => await shareCanonicalProviderConnection(ctx, {
      actor: { principalRef: principalRef(owner.principalRef), accountRef: accountRef(owner.accountRef) },
      commandId: 'command:stale-share',
      connection: { ...direct, generation: 999 },
      granteeAccountRef,
    }))).resolves.toMatchObject({ owningAccountRef: owner.accountRef })
    const missingAncestorGrantee = accountRef('acc_0000000000000000000000000000000b')
    const missingAncestorGrant = await grant(backend, owner, '1', 'connection:share', [
      `account:${missingAncestorGrantee}`,
      `connection:${direct.connectionRef}`,
    ])
    await backend.run(async (ctx) => {
      const row = await ctx.db.query('authorityDelegationGrants')
        .withIndex('by_grantRef', (query) => query.eq('grantRef', missingAncestorGrant.grantRef))
        .unique()
      if (row === null) throw new Error('share_grant_missing')
      await ctx.db.patch(row._id, {
        parentGrantRef: 'grt_ffffffffffffffffffffffffffffffff',
        parentGeneration: 1,
      })
    })
    await expect(backend.run(async (ctx) => await shareCanonicalProviderConnection(ctx, {
      actor: { principalRef: principalRef(owner.principalRef), accountRef: accountRef(owner.accountRef) },
      commandId: 'command:share-after-budget',
      connection: direct,
      granteeAccountRef: missingAncestorGrantee,
    }))).resolves.toBeNull()
    await grant(backend, owner, '7', 'connection:revoke', [`connection:${direct.connectionRef}`])
    await expect(backend.run(async (ctx) => await transitionCanonicalProviderConnection(ctx, {
      actor: { principalRef: principalRef(owner.principalRef), accountRef: accountRef(owner.accountRef) },
      commandId: 'command:stale-revoke',
      connection: { ...direct, generation: 999 },
      operation: 'revoke',
      externalState: { kind: 'known', value: 'ready' },
    }))).resolves.toBeNull()
    await backend.run(async (ctx) => {
      const staleGrant = await ctx.db.query('authorityDelegationGrants')
        .withIndex('by_grantRef', (query) => query.eq('grantRef', `grt_${'7'.repeat(32)}`))
        .unique()
      if (staleGrant === null) throw new Error('stale_revoke_grant_missing')
      await ctx.db.patch(staleGrant._id, { lifecycle: 'revoked' })
    })
    await grant(backend, owner, '8', 'connection:revoke', [`connection:${direct.connectionRef}`])
    const directRevoked = await backend.run(async (ctx) => await transitionCanonicalProviderConnection(ctx, {
      actor: { principalRef: principalRef(owner.principalRef), accountRef: accountRef(owner.accountRef) },
      commandId: 'command:direct-revoke',
      connection: direct,
      operation: 'revoke',
      externalState: { kind: 'known', value: 'ready' },
    }))
    if (directRevoked === null) throw new Error('direct_revoke_failed')
    await grant(backend, owner, '9', 'connection:delete', [`connection:${direct.connectionRef}`])
    await expect(backend.run(async (ctx) => await transitionCanonicalProviderConnection(ctx, {
      actor: { principalRef: principalRef(owner.principalRef), accountRef: accountRef(owner.accountRef) },
      commandId: 'command:direct-delete',
      connection: directRevoked,
      operation: 'delete',
      externalState: { kind: 'known', value: 'deleted' },
    }))).resolves.toMatchObject({ lifecycle: 'deleted' })

    await backend.run(async (ctx) => {
      const business = await ctx.db.get(fixture.businessId)
      if (business === null) throw new Error('business_missing')
      await ctx.db.patch(business.ownerId, { canonicalPrincipalRef: undefined, canonicalAccountRef: undefined })
    })
    await expect(backend.mutation(internal.capabilityProviderConnections.create, {
      commandId: 'command:create:no-actor',
      connectionRef: 'connection:no-actor',
      businessId: fixture.businessId,
      providerRef: 'provider:no-actor',
      providerAccountRef: PROVIDER_ACCOUNT_REF,
      adapterId: 'http-json:v1',
      credentialRef: SECRET_REF,
      requestedScopes: ['profile:read'],
      grantedScopes: ['profile:read'],
      requestedResources: [PROVIDER_ACCOUNT_REF],
      grantedResources: [PROVIDER_ACCOUNT_REF],
      evidenceRefs: [],
      now: 0,
    })).resolves.toEqual({ kind: 'refused', code: 'invalid_identity' })
  })

  it('admits a lease effect only at trusted consequence time and ignores legacy owner identity', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(10_000)
    try {
      const backend = convexTestWithMarketComponents()
      const fixture = await publishedBusinessOwner(backend, 'connection-driver-lease')
      const owner = await canonicalOwner(backend, fixture.businessId)
      await grant(backend, owner, '3', 'connection:install', [
        `connection-provider:${PROVIDER_NAMESPACE}`,
        `connection-provider:${PROVIDER_NAMESPACE}:${PROVIDER_ACCOUNT_REF}`,
        `secret:${SECRET_REF}`,
      ])
      const installed = await install(backend, fixture.businessId, 'lease')
      if (installed.kind === 'refused' || installed.connection.canonicalConnectionRef === undefined) {
        throw new Error('canonical_install_failed')
      }
      const operationRef = 'operation:driver:lease'
      const invocationRef = 'invocation:driver:lease'
      const leaseGrant = await grant(backend, owner, '4', ['connection:begin_effect', 'connection:lease'], [
        operationRef,
        `connection:${installed.connection.canonicalConnectionRef}`,
      ])
      const approval = issueProviderApprovalDecision({
        commandId: 'command:approval:driver',
        decisionRef: 'decision:approval:driver',
        providerRef: installed.connection.providerRef,
        providerAccountRef: installed.connection.providerAccountRef,
        connectionRef: installed.connection.connectionRef,
        authorityGeneration: installed.connection.authorityGeneration,
        connectionAuthorityDigest: installed.connection.authorityDigest,
        requestedScopes: [...installed.connection.grantedScopes],
        grantedScopes: [...installed.connection.grantedScopes],
        requestedResources: [...installed.connection.grantedResources],
        grantedResources: [...installed.connection.grantedResources],
        decision: 'granted',
        decisionMakerAuthorityRef: 'authority:test',
        reasonCode: 'test',
        evidenceRefs: ['evidence:approval'],
      }, Date.now(), {
        connectionRef: installed.connection.connectionRef,
        providerRef: installed.connection.providerRef,
        providerAccountRef: installed.connection.providerAccountRef,
        authorityGeneration: installed.connection.authorityGeneration,
        authorityDigest: installed.connection.authorityDigest,
      })
      if (approval.kind === 'refused') throw new Error(approval.code)
      await backend.run(async (ctx) => {
        await ctx.db.insert('capabilityProviderApprovals', {
          ...approval.decision,
          requestedScopes: [...approval.decision.requestedScopes],
          grantedScopes: [...approval.decision.grantedScopes],
          requestedResources: [...approval.decision.requestedResources],
          grantedResources: [...approval.decision.grantedResources],
          evidenceRefs: [...approval.decision.evidenceRefs],
        })
        await ctx.db.insert('capabilityOperationInvocations', {
          invocationRef,
          principalId: owner.principalRef,
          ownerId: 'legacy-owner-deliberately-not-an-account',
          credentialId: 'credential:driver',
          applicationRef: 'application:driver',
          operationRef,
          idempotencyKey: 'idempotency:driver:lease',
          environment: 'production',
          grantRef: leaseGrant.grantRef,
          grantGeneration: 1,
          policyDigest: `sha256:${'5'.repeat(64)}`,
          grantExpiresAt: leaseGrant.expiresAt,
          inputDigest: `sha256:${'6'.repeat(64)}`,
          requestDigest: `sha256:${'7'.repeat(64)}`,
          state: 'pending',
          updatedAt: Date.now(),
          createdAt: Date.now(),
        })
      })

      const args = {
        commandId: 'command:lease:driver',
        leaseRef: 'lease:driver',
        invocationRef,
        operationRef,
        connectionRef: installed.connection.connectionRef,
        providerRef: installed.connection.providerRef,
        providerAccountRef: installed.connection.providerAccountRef,
        adapterId: installed.connection.adapterId,
        expectedAuthorityGeneration: installed.connection.authorityGeneration,
        expectedAuthorityDigest: installed.connection.authorityDigest,
        requestedScopes: [...installed.connection.grantedScopes],
        grantedScopes: [...installed.connection.grantedScopes],
        requestedResources: [...installed.connection.grantedResources],
        grantedResources: [...installed.connection.grantedResources],
        approvalDecisionRef: approval.decision.decisionRef,
        readinessValidUntil: Date.now() + 120_000,
        leaseMs: 60_000,
        evidenceRefs: ['evidence:lease'],
        now: 1,
      }
      await expect(backend.mutation(internal.capabilityProviderConnections.issueLease, {
        ...args,
        approvalDecisionRef: 'decision:missing',
      })).resolves.toEqual({ kind: 'refused', code: 'approval_missing' })
      await expect(backend.mutation(internal.capabilityProviderConnections.issueLease, {
        ...args,
        connectionRef: 'connection:missing',
      })).resolves.toEqual({ kind: 'refused', code: 'connection_not_found' })
      await backend.run(async (ctx) => {
        const row = await ctx.db.query('capabilityProviderConnections')
          .withIndex('by_connectionRef', (query) => query.eq('connectionRef', args.connectionRef))
          .unique()
        if (row === null) throw new Error('legacy_connection_missing')
        await ctx.db.patch(row._id, { canonicalConnectionGeneration: 999 })
      })
      await expect(backend.mutation(internal.capabilityProviderConnections.issueLease, args))
        .resolves.toEqual({ kind: 'refused', code: 'connection_not_active' })
      await backend.run(async (ctx) => {
        const row = await ctx.db.query('capabilityProviderConnections')
          .withIndex('by_connectionRef', (query) => query.eq('connectionRef', args.connectionRef))
          .unique()
        if (row === null) throw new Error('legacy_connection_missing')
        await ctx.db.patch(row._id, { canonicalConnectionGeneration: installed.connection.canonicalConnectionGeneration })
      })
      await expect(backend.mutation(internal.capabilityProviderConnections.issueLease, {
        ...args,
        expectedAuthorityGeneration: 999,
      })).resolves.toEqual({ kind: 'refused', code: 'invalid_generation' })
      await backend.run(async (ctx) => {
        const row = await ctx.db.query('capabilityOperationInvocations')
          .withIndex('by_invocationRef', (query) => query.eq('invocationRef', invocationRef))
          .unique()
        if (row === null) throw new Error('invocation_missing')
        await ctx.db.patch(row._id, { operationRef: 'operation:mismatch' })
      })
      await expect(backend.mutation(internal.capabilityProviderConnections.issueLease, args))
        .resolves.toEqual({ kind: 'refused', code: 'invalid_lease' })
      await backend.run(async (ctx) => {
        const row = await ctx.db.query('capabilityOperationInvocations')
          .withIndex('by_invocationRef', (query) => query.eq('invocationRef', invocationRef))
          .unique()
        if (row === null) throw new Error('invocation_missing')
        await ctx.db.patch(row._id, { operationRef })
      })
      const issued = await backend.mutation(internal.capabilityProviderConnections.issueLease, args)
      expect(issued).toMatchObject({
        kind: 'applied',
        lease: {
          owningAccountRef: owner.accountRef,
          activeAccountRef: owner.accountRef,
          actorPrincipalRef: owner.principalRef,
          grantRef: leaseGrant.grantRef,
          grantGeneration: 1,
        },
      })
      if (issued.kind === 'refused'
        || issued.lease.canonicalLeaseRef === undefined
        || issued.lease.canonicalConnectionGeneration === undefined) throw new Error('lease_issue_failed')
      await expect(backend.mutation(internal.capabilityProviderConnections.issueLease, args)).resolves.toMatchObject({
        kind: 'duplicate',
        lease: { canonicalLeaseRef: issued.lease.canonicalLeaseRef },
      })

      await expect(backend.query(internal.capabilityProviderConnections.readLease, {
        leaseRef: args.leaseRef,
      })).resolves.toMatchObject({ canonicalLeaseRef: issued.lease.canonicalLeaseRef })
      await expect(backend.query(internal.capabilityProviderConnections.readLeaseByInvocation, {
        invocationRef,
      })).resolves.toMatchObject({ canonicalLeaseRef: issued.lease.canonicalLeaseRef })

      await expect(backend.query(internal.capabilityProviderConnections.resolveLeaseCredentialRef, {
        leaseRef: args.leaseRef,
        connectionRef: args.connectionRef,
        invocationRef,
        operationRef,
        providerRef: args.providerRef,
        providerAccountRef: args.providerAccountRef,
        adapterId: args.adapterId,
        authorityGeneration: args.expectedAuthorityGeneration,
        authorityDigest: args.expectedAuthorityDigest,
        grantedScopes: args.grantedScopes,
        grantedResources: args.grantedResources,
        readinessValidUntil: args.readinessValidUntil,
        now: 1,
      })).resolves.toEqual({ kind: 'unavailable', reason: 'lease_inactive' })
      await expect(backend.query(internal.capabilityProviderConnections.validateLeaseAuthority, {
        leaseRef: args.leaseRef,
        connectionRef: args.connectionRef,
        invocationRef,
        operationRef,
        providerRef: args.providerRef,
        adapterId: args.adapterId,
        authorityGeneration: args.expectedAuthorityGeneration,
        authorityDigest: args.expectedAuthorityDigest,
        grantedScopes: args.grantedScopes,
        grantedResources: args.grantedResources,
        readinessValidUntil: args.readinessValidUntil,
        now: 1,
      })).resolves.toEqual({ kind: 'unavailable', reason: 'lease_inactive' })

      await backend.run(async (ctx) => {
        const row = await ctx.db.query('capabilityProviderConnectionLeases')
          .withIndex('by_leaseRef', (query) => query.eq('leaseRef', args.leaseRef))
          .unique()
        if (row === null) throw new Error('legacy_lease_missing')
        await ctx.db.patch(row._id, { canonicalConnectionGeneration: 999 })
      })
      await expect(backend.mutation(internal.capabilityProviderConnections.issueLease, args))
        .resolves.toEqual({ kind: 'refused', code: 'invalid_lease' })
      await expect(backend.query(internal.capabilityProviderConnections.readLease, {
        leaseRef: args.leaseRef,
      })).resolves.toBeNull()
      await expect(backend.query(internal.capabilityProviderConnections.readLeaseByInvocation, {
        invocationRef,
      })).resolves.toBeNull()
      await expect(backend.mutation(internal.capabilityProviderConnections.consumeLease, {
        leaseRef: args.leaseRef,
        commandId: 'command:consume:stale',
        expectedAuthorityGeneration: args.expectedAuthorityGeneration,
        expectedAuthorityDigest: args.expectedAuthorityDigest,
        readinessValidUntil: args.readinessValidUntil,
        evidenceRefs: [],
        now: 1,
      })).resolves.toEqual({ kind: 'refused', code: 'lease_inactive' })
      await expect(backend.mutation(internal.capabilityProviderConnections.expireLease, {
        leaseRef: args.leaseRef,
        commandId: 'command:expire:stale',
        evidenceRefs: [],
        now: 1,
      })).resolves.toEqual({ kind: 'refused', code: 'lease_inactive' })
      await expect(backend.mutation(internal.capabilityProviderConnections.invalidateLease, {
        leaseRef: args.leaseRef,
        commandId: 'command:invalidate:stale',
        reasonCode: 'generation_changed',
        evidenceRefs: [],
        now: 1,
      })).resolves.toEqual({ kind: 'refused', code: 'lease_inactive' })
      await expect(backend.mutation(internal.capabilityProviderConnections.beginLeaseEffect, {
        leaseRef: args.leaseRef,
        invocationRef,
        operationRef,
        commandId: 'command:effect:stale-projection',
      })).resolves.toEqual({ kind: 'unavailable', reason: 'canonical_mapping_invalid' })
      await backend.run(async (ctx) => {
        const row = await ctx.db.query('capabilityProviderConnectionLeases')
          .withIndex('by_leaseRef', (query) => query.eq('leaseRef', args.leaseRef))
          .unique()
        if (row === null) throw new Error('legacy_lease_missing')
        await ctx.db.patch(row._id, { canonicalConnectionGeneration: issued.lease.canonicalConnectionGeneration })
      })

      await backend.run(async (ctx) => {
        const row = await ctx.db.query('capabilityProviderConnectionLeases')
          .withIndex('by_leaseRef', (query) => query.eq('leaseRef', args.leaseRef))
          .unique()
        if (row === null) throw new Error('legacy_lease_missing')
        await ctx.db.patch(row._id, { connectionRef: 'connection:missing' })
      })
      await expect(backend.query(internal.capabilityProviderConnections.readLease, {
        leaseRef: args.leaseRef,
      })).resolves.toBeNull()
      await expect(backend.query(internal.capabilityProviderConnections.readLeaseByInvocation, {
        invocationRef,
      })).resolves.toBeNull()
      await expect(backend.mutation(internal.capabilityProviderConnections.expireLease, {
        leaseRef: args.leaseRef,
        commandId: 'command:expire:missing-connection',
        evidenceRefs: [],
        now: 1,
      })).resolves.toEqual({ kind: 'refused', code: 'lease_inactive' })
      await expect(backend.mutation(internal.capabilityProviderConnections.invalidateLease, {
        leaseRef: args.leaseRef,
        commandId: 'command:invalidate:missing-connection',
        reasonCode: 'generation_changed',
        evidenceRefs: [],
        now: 1,
      })).resolves.toEqual({ kind: 'refused', code: 'lease_inactive' })
      await expect(backend.mutation(internal.capabilityProviderConnections.beginLeaseEffect, {
        leaseRef: args.leaseRef,
        invocationRef,
        operationRef,
        commandId: 'command:effect:missing-connection',
      })).resolves.toEqual({ kind: 'unavailable', reason: 'connection_not_found' })
      await backend.run(async (ctx) => {
        const row = await ctx.db.query('capabilityProviderConnectionLeases')
          .withIndex('by_leaseRef', (query) => query.eq('leaseRef', args.leaseRef))
          .unique()
        if (row === null) throw new Error('legacy_lease_missing')
        await ctx.db.patch(row._id, { connectionRef: args.connectionRef })
        const invocation = await ctx.db.query('capabilityOperationInvocations')
          .withIndex('by_invocationRef', (query) => query.eq('invocationRef', invocationRef))
          .unique()
        if (invocation === null) throw new Error('invocation_missing')
        await ctx.db.patch(invocation._id, { principalId: 'prn_000000000000000000000000000000ff' })
      })
      await expect(backend.mutation(internal.capabilityProviderConnections.beginLeaseEffect, {
        leaseRef: args.leaseRef,
        invocationRef,
        operationRef,
        commandId: 'command:effect:invocation-mismatch',
      })).resolves.toEqual({ kind: 'unavailable', reason: 'invocation_authority_mismatch' })
      await backend.run(async (ctx) => {
        const invocation = await ctx.db.query('capabilityOperationInvocations')
          .withIndex('by_invocationRef', (query) => query.eq('invocationRef', invocationRef))
          .unique()
        if (invocation === null) throw new Error('invocation_missing')
        await ctx.db.patch(invocation._id, { principalId: owner.principalRef })
      })

      await expect(backend.mutation(internal.capabilityProviderConnections.beginLeaseEffect, {
        leaseRef: args.leaseRef,
        invocationRef,
        operationRef,
        commandId: 'command:effect:driver',
      })).resolves.toMatchObject({
        kind: 'admitted',
        canonicalLeaseRef: issued.lease.canonicalLeaseRef,
        secretRef: SECRET_REF,
        owningAccountRef: owner.accountRef,
      })

      await expect(backend.mutation(internal.capabilityProviderConnections.consumeLease, {
        leaseRef: args.leaseRef,
        commandId: 'command:consume:driver',
        expectedAuthorityGeneration: args.expectedAuthorityGeneration,
        expectedAuthorityDigest: args.expectedAuthorityDigest,
        readinessValidUntil: args.readinessValidUntil,
        evidenceRefs: ['evidence:consume'],
        now: 1,
      })).resolves.toMatchObject({ kind: 'applied', lease: { state: 'consumed' } })

      await backend.run(async (ctx) => {
        const row = await ctx.db.query('capabilityProviderConnectionLeases')
          .withIndex('by_leaseRef', (query) => query.eq('leaseRef', args.leaseRef))
          .unique()
        if (row === null) throw new Error('legacy_lease_missing')
        await ctx.db.patch(row._id, { state: 'active', consumedAt: undefined })
      })
      await expect(backend.mutation(internal.capabilityProviderConnections.invalidateLease, {
        leaseRef: args.leaseRef,
        commandId: 'command:invalidate:driver',
        reasonCode: 'invocation_aborted',
        evidenceRefs: ['evidence:invalidate'],
        now: 1,
      })).resolves.toMatchObject({ kind: 'applied', lease: { state: 'invalidated' } })

      await backend.run(async (ctx) => {
        const row = await ctx.db.query('capabilityProviderConnectionLeases')
          .withIndex('by_leaseRef', (query) => query.eq('leaseRef', args.leaseRef))
          .unique()
        if (row === null) throw new Error('legacy_lease_missing')
        await ctx.db.patch(row._id, { state: 'active', invalidatedAt: undefined })
      })

      vi.setSystemTime(issued.lease.expiresAt)
      await expect(backend.mutation(internal.capabilityProviderConnections.beginLeaseEffect, {
        leaseRef: args.leaseRef,
        invocationRef,
        operationRef,
        commandId: 'command:effect:expired',
      })).resolves.toEqual({ kind: 'unavailable', reason: 'connection_lease_expired' })
      await expect(backend.mutation(internal.capabilityProviderConnections.expireLease, {
        leaseRef: args.leaseRef,
        commandId: 'command:expire:driver',
        evidenceRefs: ['evidence:expire'],
        now: 1,
      })).resolves.toMatchObject({ kind: 'applied', lease: { state: 'expired' } })
    } finally {
      vi.useRealTimers()
    }
  })
})
