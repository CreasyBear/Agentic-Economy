import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'

import schema from '../../../convex/schema'
import type { MutationCtx } from '../../../convex/_generated/server'
import {
  createDelegationBackedConnectionAuthority,
  createConvexConnectionLifecycleStore,
} from '../../../convex/lib/connectionLifecyclePersistence'
import {
  createConvexDelegationContextPort,
  createConvexDelegationStore,
} from '../../../convex/lib/delegationPersistence'
import {
  createConvexSecretPointerStore,
  initializeConvexSecretPointer,
  type SecretPointerAuthority,
} from '../../../convex/lib/secretPointerPersistence'
import {
  DelegationService,
  delegationGrantRef,
  delegationSnapshotRef,
  type DelegationAuthoritySnapshot,
  type DelegationGrant,
} from '../../../src/modules/authority/delegation/public'
import {
  connectionEffectRef,
  connectionLeaseRef,
  connectionRef,
  connectionShareRef,
  type Connection,
  type ConnectionAction,
  type ConnectionEffectAdmission,
  type ConnectionLease,
  type ConnectionLifecycleCommand,
  type ConnectionShare,
} from '../../../src/modules/connections/lifecycle/public'
import {
  accountRef,
  principalRef,
  type AccountActionContext,
} from '../../../src/modules/principal-account/public'
import { secretGeneration, secretRef } from '../../../src/modules/secrets/public'

const convexModules = Object.fromEntries(
  Object.entries(import.meta.glob('../../../convex/**/*.{ts,js}'))
    .map(([path, load]) => [path.replace('../../../convex/', './'), load]),
)

const ownerAccountRef = accountRef('acc_11111111111111111111111111111111')
const strangerAccountRef = accountRef('acc_22222222222222222222222222222222')
const actorPrincipalRef = principalRef('prn_33333333333333333333333333333333')
const pointerRef = secretRef('sec_44444444444444444444444444444444')
const firstGeneration = secretGeneration('sgn_55555555555555555555555555555555')
const secondGeneration = secretGeneration('sgn_66666666666666666666666666666666')
const subjectPrincipalRef = principalRef('prn_99999999999999999999999999999999')
const granteeAccountRef = accountRef('acc_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')
const rootGrantRef = delegationGrantRef('grt_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb')
const childGrantRef = delegationGrantRef('grt_cccccccccccccccccccccccccccccccc')
const snapshotRef = delegationSnapshotRef('das_dddddddddddddddddddddddddddddddd')
const canonicalConnectionRef = connectionRef('con_eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee')
const canonicalShareRef = connectionShareRef('csh_ffffffffffffffffffffffffffffffff')
const canonicalLeaseRef = connectionLeaseRef('cls_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')
const canonicalEffectRef = connectionEffectRef('cef_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb')

const baseContext: AccountActionContext = Object.freeze({
  actorPrincipalRef,
  activeAccountRef: ownerAccountRef,
  correlationRef: 'context:correlation',
  idempotencyRef: 'context:idempotency',
})

function grant(overrides: Partial<DelegationGrant> = {}): DelegationGrant {
  return {
    grantRef: rootGrantRef,
    accountRef: ownerAccountRef,
    actorPrincipalRef,
    subjectPrincipalRef: actorPrincipalRef,
    scopes: ['connection:install'],
    resourceRefs: ['connection-provider:github'],
    budgetLimit: 10,
    budgetUsed: 0,
    expiresAt: 1_000,
    generation: 1,
    revision: 1,
    lifecycle: 'active',
    createdAt: 10,
    createdBy: baseContext,
    ...overrides,
  }
}

function snapshot(overrides: Partial<DelegationAuthoritySnapshot> = {}): DelegationAuthoritySnapshot {
  return {
    snapshotRef,
    grantRef: rootGrantRef,
    generation: 1,
    accountRef: ownerAccountRef,
    accountRevision: 1,
    actorPrincipalRef,
    subjectPrincipalRef: actorPrincipalRef,
    scopes: ['connection:install'],
    resourceRefs: ['connection-provider:github'],
    budgetAmount: 0,
    admittedAt: 20,
    expiresAt: 1_000,
    correlationRef: 'snapshot:correlation',
    idempotencyRef: 'snapshot:idempotency',
    ancestry: [{
      grantRef: rootGrantRef,
      generation: 1,
      accountRef: ownerAccountRef,
      actorPrincipalRef,
      subjectPrincipalRef: actorPrincipalRef,
      scopes: ['connection:install'],
      resourceRefs: ['connection-provider:github'],
      budgetLimit: 10,
      budgetUsedBefore: 0,
      expiresAt: 1_000,
    }],
    ...overrides,
  }
}

function connectionAction(
  operation: ConnectionAction['operation'],
  overrides: Partial<ConnectionAction> = {},
): ConnectionAction {
  return {
    operation,
    snapshotRef,
    actorPrincipalRef,
    activeAccountRef: ownerAccountRef,
    grantRef: rootGrantRef,
    grantGeneration: 1,
    correlationRef: `connection:${operation}:correlation`,
    idempotencyRef: `connection:${operation}:idempotency`,
    resourceRefs: operation === 'install'
      ? ['connection-provider:github']
      : [`connection:${canonicalConnectionRef}`],
    occurredAt: operation === 'install' ? 10 : 20,
    ...overrides,
  }
}

function connection(overrides: Partial<Connection> = {}): Connection {
  const installAction = connectionAction('install')
  return {
    connectionRef: canonicalConnectionRef,
    owningAccountRef: ownerAccountRef,
    installedByPrincipalRef: actorPrincipalRef,
    providerNamespace: 'github',
    installedExternalState: { kind: 'known', value: 'ready' },
    externalState: { kind: 'known', value: 'ready' },
    lifecycle: 'active',
    generation: 1,
    revision: 1,
    createdAt: 10,
    updatedAt: 10,
    installAction,
    action: installAction,
    ...overrides,
  }
}

function refreshedConnection(overrides: Partial<Connection> = {}): Connection {
  return connection({
    externalState: { kind: 'unknown', value: 'provider-pending' },
    generation: 2,
    revision: 2,
    updatedAt: 20,
    action: connectionAction('refresh'),
    ...overrides,
  })
}

function share(overrides: Partial<ConnectionShare> = {}): ConnectionShare {
  return {
    shareRef: canonicalShareRef,
    connectionRef: canonicalConnectionRef,
    connectionGeneration: 1,
    owningAccountRef: ownerAccountRef,
    granteeAccountRef,
    lifecycle: 'active',
    createdAt: 20,
    action: connectionAction('share', {
      resourceRefs: [`connection:${canonicalConnectionRef}`, `account:${granteeAccountRef}`],
    }),
    ...overrides,
  }
}

function lease(overrides: Partial<ConnectionLease> = {}): ConnectionLease {
  return {
    leaseRef: canonicalLeaseRef,
    connectionRef: canonicalConnectionRef,
    connectionGeneration: 1,
    owningAccountRef: ownerAccountRef,
    activeAccountRef: ownerAccountRef,
    actorPrincipalRef,
    grantRef: rootGrantRef,
    grantGeneration: 1,
    expiresAt: 500,
    createdAt: 20,
    action: connectionAction('lease'),
    ...overrides,
  }
}

function admission(overrides: Partial<ConnectionEffectAdmission> = {}): ConnectionEffectAdmission {
  return {
    effectRef: canonicalEffectRef,
    leaseRef: canonicalLeaseRef,
    connectionRef: canonicalConnectionRef,
    connectionGeneration: 1,
    owningAccountRef: ownerAccountRef,
    activeAccountRef: ownerAccountRef,
    actorPrincipalRef,
    grantRef: rootGrantRef,
    grantGeneration: 1,
    admittedAt: 20,
    action: connectionAction('begin_effect'),
    ...overrides,
  }
}

function lifecycleCommand(overrides: Partial<ConnectionLifecycleCommand> = {}): ConnectionLifecycleCommand {
  return {
    operation: 'refresh',
    connectionRef: canonicalConnectionRef,
    expectedGeneration: 1,
    requestedExternalState: { kind: 'unknown', value: 'provider-pending' },
    action: connectionAction('refresh'),
    result: refreshedConnection(),
    ...overrides,
  }
}

function storedGrant(value: DelegationGrant = grant()) {
  return {
    ...value,
    scopes: [...value.scopes],
    resourceRefs: [...value.resourceRefs],
    createdBy: { ...value.createdBy },
    ...(value.revokedBy === undefined ? {} : { revokedBy: { ...value.revokedBy } }),
  }
}

function storedSnapshotHeader(value: DelegationAuthoritySnapshot, ancestryCount: number) {
  const { ancestry, ...header } = value
  void ancestry
  return {
    ...header,
    scopes: [...header.scopes],
    resourceRefs: [...header.resourceRefs],
    ancestryCount,
  }
}

function storedSnapshotAncestor(value: DelegationAuthoritySnapshot['ancestry'][number], position: number) {
  return {
    snapshotRef,
    position,
    ...value,
    scopes: [...value.scopes],
    resourceRefs: [...value.resourceRefs],
  }
}

function storedAction(value: ConnectionAction) {
  return { ...value, resourceRefs: [...value.resourceRefs] }
}

function storedConnection(value: Connection) {
  return {
    ...value,
    installedExternalState: { ...value.installedExternalState },
    externalState: { ...value.externalState },
    installAction: storedAction(value.installAction),
    action: storedAction(value.action),
  }
}

function storedShare(value: ConnectionShare) {
  return { ...value, action: storedAction(value.action) }
}

function storedLease(value: ConnectionLease) {
  return { ...value, action: storedAction(value.action) }
}

function storedAdmission(value: ConnectionEffectAdmission) {
  return { ...value, action: storedAction(value.action) }
}

function storedLifecycleCommand(value: ConnectionLifecycleCommand) {
  return {
    ...value,
    requestedExternalState: { ...value.requestedExternalState },
    action: storedAction(value.action),
    result: storedConnection(value.result),
  }
}

async function insertPrincipal(
  ctx: MutationCtx,
  ref = actorPrincipalRef,
  lifecycle: 'active' | 'suspended' = 'active',
): Promise<void> {
  await ctx.db.insert('principals', {
    principalRef: ref,
    kind: 'human',
    displayName: 'Persistence actor',
    lifecycle,
    revision: 1,
    createdAt: 1,
    updatedAt: 1,
  })
}

async function insertAccount(
  ctx: MutationCtx,
  lifecycle: 'active' | 'suspended' = 'active',
  revision = 1,
): Promise<void> {
  await ctx.db.insert('accounts', {
    accountRef: ownerAccountRef,
    displayName: 'Persistence account',
    lifecycle,
    recoveryPolicy: { kind: 'no_transfer', revision: 1 },
    creationActorPrincipalRef: actorPrincipalRef,
    creationIdempotencyRef: 'account:create',
    initialOwnershipRef: 'own_persistence_owner',
    currentOwnershipRef: 'own_persistence_owner',
    revision,
    createdAt: 1,
    updatedAt: 1,
    lastAction: baseContext,
  })
}

async function insertOwnership(
  ctx: MutationCtx,
  overrides: Partial<{
    lifecycle: 'active' | 'ended'
    accountRef: typeof ownerAccountRef
    ownerPrincipalRef: typeof actorPrincipalRef
  }> = {},
): Promise<void> {
  await ctx.db.insert('accountOwnerships', {
    ownershipRef: 'own_persistence_owner',
    accountRef: ownerAccountRef,
    ownerPrincipalRef: actorPrincipalRef,
    lifecycle: 'active',
    changeKind: 'creation',
    revision: 1,
    createdAt: 1,
    createdBy: baseContext,
    ...overrides,
  })
}

async function insertMembership(ctx: MutationCtx, lifecycle: 'active' | 'ended' = 'active'): Promise<void> {
  await ctx.db.insert('memberships', {
    membershipRef: 'mem_persistence_member',
    accountRef: ownerAccountRef,
    memberPrincipalRef: actorPrincipalRef,
    lifecycle,
    revision: 1,
    createdAt: 1,
    createdBy: baseContext,
  })
}

function authority(
  operation: SecretPointerAuthority['operation'],
  overrides: Partial<SecretPointerAuthority> = {},
): SecretPointerAuthority {
  return {
    operation,
    snapshotRef: delegationSnapshotRef('das_77777777777777777777777777777777'),
    accountRef: ownerAccountRef,
    actorPrincipalRef,
    grantRef: 'grt_88888888888888888888888888888888',
    grantGeneration: 1,
    correlationRef: `secret:${operation}`,
    idempotencyRef: `secret:${operation}`,
    occurredAt: 100,
    ...overrides,
  }
}

describe('Phase 2 Wave 1 persistence boundaries', () => {
  it('binds trusted Principal and canonical owner/member Account facts', async () => {
    const ownerBackend = convexTest(schema, convexModules)
    await ownerBackend.run(async (ctx) => {
      await insertPrincipal(ctx)
      await insertPrincipal(ctx, subjectPrincipalRef)
      await insertAccount(ctx)
      await insertOwnership(ctx)
      const port = createConvexDelegationContextPort(ctx, actorPrincipalRef)

      await expect(port.resolveActiveContext(baseContext)).resolves.toEqual({
        accountRef: ownerAccountRef,
        actorPrincipalRef,
        accountRevision: 1,
        correlationRef: baseContext.correlationRef,
        idempotencyRef: baseContext.idempotencyRef,
      })
      await expect(port.resolveRootIssuerContext(baseContext)).resolves.toMatchObject({
        accountRef: ownerAccountRef,
        actorPrincipalRef,
      })
      await expect(port.requireActivePrincipal(subjectPrincipalRef)).resolves.toBeUndefined()
    })

    const memberBackend = convexTest(schema, convexModules)
    await memberBackend.run(async (ctx) => {
      await insertPrincipal(ctx)
      await insertAccount(ctx)
      await insertMembership(ctx)
      const port = createConvexDelegationContextPort(ctx, actorPrincipalRef)
      await expect(port.resolveActiveContext(baseContext)).resolves.toMatchObject({
        accountRef: ownerAccountRef,
        actorPrincipalRef,
      })
      await expect(port.resolveRootIssuerContext(baseContext)).rejects.toMatchObject({
        code: 'delegation_actor_mismatch',
      })
    })
  })

  it('rejects caller-shaped context and missing or inactive canonical facts', async () => {
    const scenarios: ReadonlyArray<{
      seed(ctx: MutationCtx): Promise<void>
      context?: AccountActionContext
      operation?: 'active' | 'root' | 'require'
    }> = [
      {
        seed: async () => undefined,
        context: { ...baseContext, actorPrincipalRef: subjectPrincipalRef },
      },
      {
        seed: async () => undefined,
        context: { ...baseContext, correlationRef: '' },
      },
      {
        seed: async () => undefined,
        context: { ...baseContext, idempotencyRef: '' },
      },
      { seed: async (ctx) => await insertAccount(ctx) },
      {
        seed: async (ctx) => {
          await insertPrincipal(ctx, actorPrincipalRef, 'suspended')
          await insertAccount(ctx)
        },
      },
      { seed: async (ctx) => await insertPrincipal(ctx) },
      {
        seed: async (ctx) => {
          await insertPrincipal(ctx)
          await insertAccount(ctx, 'suspended')
        },
      },
      {
        seed: async (ctx) => {
          await insertPrincipal(ctx)
          await insertAccount(ctx, 'active', 0)
        },
      },
      {
        seed: async (ctx) => {
          await insertPrincipal(ctx)
          await insertAccount(ctx)
        },
      },
      {
        seed: async (ctx) => {
          await insertPrincipal(ctx)
          await insertAccount(ctx)
          await insertOwnership(ctx, { lifecycle: 'ended' })
        },
      },
      {
        seed: async (ctx) => {
          await insertPrincipal(ctx)
          await insertAccount(ctx)
          await insertOwnership(ctx, { accountRef: strangerAccountRef })
        },
      },
      {
        seed: async (ctx) => {
          await insertPrincipal(ctx)
          await insertAccount(ctx)
          await insertOwnership(ctx, { ownerPrincipalRef: subjectPrincipalRef })
        },
      },
      { seed: async () => undefined, operation: 'require' },
      {
        seed: async (ctx) => await insertPrincipal(ctx, actorPrincipalRef, 'suspended'),
        operation: 'require',
      },
      {
        seed: async (ctx) => {
          await insertPrincipal(ctx)
          await insertAccount(ctx)
          await insertMembership(ctx, 'ended')
        },
      },
    ]

    for (const scenario of scenarios) {
      const backend = convexTest(schema, convexModules)
      await backend.run(async (ctx) => {
        await scenario.seed(ctx)
        const port = createConvexDelegationContextPort(ctx, actorPrincipalRef)
        const result = scenario.operation === 'require'
          ? port.requireActivePrincipal(actorPrincipalRef)
          : scenario.operation === 'root'
            ? port.resolveRootIssuerContext(scenario.context ?? baseContext)
            : port.resolveActiveContext(scenario.context ?? baseContext)
        await expect(result).rejects.toMatchObject({ code: expect.stringMatching(/^delegation_/) })
      })
    }
  })

  it('persists, retrieves, replaces and rejects conflicting delegation facts', async () => {
    const backend = convexTest(schema, convexModules)
    await backend.run(async (ctx) => {
      const store = createConvexDelegationStore(ctx)
      await store.transact(async (transaction) => {
        expect(await transaction.getGrant(rootGrantRef)).toBeUndefined()
        expect(await transaction.getGrantByCreationIdempotency(
          ownerAccountRef,
          actorPrincipalRef,
          baseContext.idempotencyRef,
        )).toBeUndefined()
        expect(await transaction.getSnapshot(snapshotRef)).toBeUndefined()
        expect(await transaction.getSnapshotByAdmissionIdempotency(
          ownerAccountRef,
          actorPrincipalRef,
          'snapshot:idempotency',
        )).toBeUndefined()
        await transaction.commit({})
        await transaction.commit({ grantInsert: grant() })
      })

      await store.transact(async (transaction) => {
        await expect(transaction.getGrant(rootGrantRef)).resolves.toMatchObject({ grantRef: rootGrantRef })
        await expect(transaction.getGrantByCreationIdempotency(
          ownerAccountRef,
          actorPrincipalRef,
          baseContext.idempotencyRef,
        )).resolves.toMatchObject({ grantRef: rootGrantRef })
        await expect(transaction.commit({ grantInsert: grant() })).rejects.toMatchObject({
          code: 'delegation_grant_ref_conflict',
        })
        await transaction.commit({ snapshotInsert: snapshot() })
      })

      await store.transact(async (transaction) => {
        await expect(transaction.getSnapshot(snapshotRef)).resolves.toMatchObject({
          snapshotRef,
          ancestry: [{ grantRef: rootGrantRef }],
        })
        await expect(transaction.getSnapshotByAdmissionIdempotency(
          ownerAccountRef,
          actorPrincipalRef,
          'snapshot:idempotency',
        )).resolves.toMatchObject({ snapshotRef })
        await expect(transaction.commit({ snapshotInsert: snapshot() })).rejects.toMatchObject({
          code: 'delegation_snapshot_ref_conflict',
        })

        const revoked = grant({
          lifecycle: 'revoked',
          generation: 2,
          revision: 2,
          revokedAt: 30,
          revokedBy: { ...baseContext, idempotencyRef: 'grant:revoke' },
        })
        await transaction.commit({
          grantReplacements: [{ value: revoked, expectedRevision: 1 }],
        })
        await expect(transaction.getGrant(rootGrantRef)).resolves.toMatchObject({
          lifecycle: 'revoked',
          revokedBy: { idempotencyRef: 'grant:revoke' },
        })
        await expect(transaction.commit({
          grantReplacements: [{ value: revoked, expectedRevision: 1 }],
        })).rejects.toMatchObject({ code: 'delegation_generation_stale' })
        await expect(transaction.commit({
          grantReplacements: [{ value: grant({ grantRef: childGrantRef }), expectedRevision: 1 }],
        })).rejects.toMatchObject({ code: 'delegation_generation_stale' })
      })
    })
  })

  it('rolls back grant replacement when snapshot reconstruction fails', async () => {
    const backend = convexTest(schema, convexModules)
    await backend.run(async (ctx) => {
      await createConvexDelegationStore(ctx).transact(async (transaction) => {
        await transaction.commit({ grantInsert: grant() })
        let caught: unknown
        try {
          await transaction.commit({
            grantReplacements: [{
              expectedRevision: 1,
              value: grant({ revision: 2, budgetUsed: 1 }),
            }],
            snapshotInsert: snapshot({ ancestry: [] }),
          })
        } catch (error) {
          caught = error
        }
        expect(caught).toMatchObject({ code: 'delegation_snapshot_invalid' })
        await expect(transaction.getGrant(rootGrantRef)).resolves.toMatchObject({
          revision: 1,
          budgetUsed: 0,
        })
      })
      expect(await ctx.db.query('authorityDelegationSnapshots').collect()).toHaveLength(0)
      expect(await ctx.db.query('authorityDelegationSnapshotAncestors').collect()).toHaveLength(0)
    })
  })

  it('rejects duplicate grant replacements before the first write', async () => {
    const backend = convexTest(schema, convexModules)
    await backend.run(async (ctx) => {
      const store = createConvexDelegationStore(ctx)
      await store.transact(async (transaction) => {
        await transaction.commit({ grantInsert: grant() })
        await expect(transaction.commit({
          grantReplacements: [
            { expectedRevision: 1, value: grant({ revision: 2 }) },
            { expectedRevision: 1, value: grant({ revision: 2 }) },
          ],
        })).rejects.toMatchObject({ code: 'delegation_generation_stale' })
        await expect(transaction.getGrant(rootGrantRef)).resolves.toMatchObject({ revision: 1 })
      })
    })
  })

  it('rejects duplicate and malformed persisted delegation rows', async () => {
    const duplicateGrantBackend = convexTest(schema, convexModules)
    await duplicateGrantBackend.run(async (ctx) => {
      await ctx.db.insert('authorityDelegationGrants', storedGrant())
      await ctx.db.insert('authorityDelegationGrants', storedGrant())
      const store = createConvexDelegationStore(ctx)
      await expect(store.transact(async (transaction) => await transaction.getGrant(rootGrantRef))).rejects.toThrow()
    })

    const malformedGrantBackend = convexTest(schema, convexModules)
    await malformedGrantBackend.run(async (ctx) => {
      await ctx.db.insert('authorityDelegationGrants', storedGrant(grant({ budgetLimit: 0 })))
      await expect(createConvexDelegationStore(ctx).transact(
        async (transaction) => await transaction.getGrant(rootGrantRef),
      )).rejects.toMatchObject({ code: 'delegation_ancestry_invalid' })
    })

    for (const ancestryCount of [-1, 0, 2]) {
      const malformedSnapshotBackend = convexTest(schema, convexModules)
      await malformedSnapshotBackend.run(async (ctx) => {
        const valid = snapshot()
        const { ancestry } = valid
        await ctx.db.insert('authorityDelegationSnapshots', storedSnapshotHeader(valid, ancestryCount))
        if (ancestryCount === 2) {
          await ctx.db.insert('authorityDelegationSnapshotAncestors', storedSnapshotAncestor(ancestry[0]!, 0))
        }
        await expect(createConvexDelegationStore(ctx).transact(
          async (transaction) => await transaction.getSnapshot(snapshotRef),
        )).rejects.toMatchObject({ code: 'delegation_snapshot_invalid' })
      })
    }

    const wrongOrderBackend = convexTest(schema, convexModules)
    await wrongOrderBackend.run(async (ctx) => {
      const valid = snapshot()
      const { ancestry } = valid
      await ctx.db.insert('authorityDelegationSnapshots', storedSnapshotHeader(valid, 1))
      await ctx.db.insert('authorityDelegationSnapshotAncestors', storedSnapshotAncestor(ancestry[0]!, 1))
      await expect(createConvexDelegationStore(ctx).transact(
        async (transaction) => await transaction.getSnapshot(snapshotRef),
      )).rejects.toMatchObject({ code: 'delegation_snapshot_invalid' })
    })

    const malformedAncestryBackend = convexTest(schema, convexModules)
    await malformedAncestryBackend.run(async (ctx) => {
      const valid = snapshot()
      const { ancestry } = valid
      await ctx.db.insert('authorityDelegationSnapshots', storedSnapshotHeader(valid, 1))
      await ctx.db.insert('authorityDelegationSnapshotAncestors', {
        ...storedSnapshotAncestor(ancestry[0]!, 0),
        accountRef: strangerAccountRef,
      })
      await expect(createConvexDelegationStore(ctx).transact(
        async (transaction) => await transaction.getSnapshotByAdmissionIdempotency(
          ownerAccountRef,
          actorPrincipalRef,
          valid.idempotencyRef,
        ),
      )).rejects.toMatchObject({ code: 'delegation_snapshot_invalid' })
    })
  })

  it('maps delegation admission into the exact Connection consequence authority', async () => {
    type AdmissionRequest = Parameters<DelegationService['admitConsequence']>[0]
    let captured: AdmissionRequest | undefined
    const delegation = {
      admitConsequence: async (request: AdmissionRequest) => {
        captured = request
        return snapshot({
          snapshotRef,
          scopes: ['connection:lease'],
          resourceRefs: [`connection:${canonicalConnectionRef}`],
          expiresAt: 900,
        })
      },
    } as unknown as DelegationService
    const authority = createDelegationBackedConnectionAuthority(delegation)
    const result = await authority.withCurrentAuthority({
      operation: 'lease',
      context: baseContext,
      grantRef: rootGrantRef,
      expectedGrantGeneration: 1,
      connectionRef: canonicalConnectionRef,
      resourceRefs: [`connection:${canonicalConnectionRef}`],
      now: 100,
    }, async (consequence) => {
      expect(Object.isFrozen(consequence)).toBe(true)
      return consequence
    })

    expect(captured).toEqual({
      grantRef: rootGrantRef,
      expectedGeneration: 1,
      context: baseContext,
      requiredScopes: ['connection:lease'],
      resourceRefs: [`connection:${canonicalConnectionRef}`],
      budgetAmount: 0,
    })
    expect(result).toEqual({
      snapshotRef,
      actorPrincipalRef,
      activeAccountRef: ownerAccountRef,
      grantRef: rootGrantRef,
      grantGeneration: 1,
      grantExpiresAt: 900,
      resourceRefs: [`connection:${canonicalConnectionRef}`],
    })
  })

  it('covers every Connection store getter, insert, replacement and conflict', async () => {
    const backend = convexTest(schema, convexModules)
    await backend.run(async (ctx) => {
      const store = createConvexConnectionLifecycleStore(ctx)
      await store.transact(async (transaction) => {
        expect(await transaction.getConnection(canonicalConnectionRef)).toBeUndefined()
        expect(await transaction.getConnectionByInstallIdempotency(
          ownerAccountRef,
          'connection:install:idempotency',
        )).toBeUndefined()
        expect(await transaction.getShare(canonicalShareRef)).toBeUndefined()
        expect(await transaction.getActiveShare(canonicalConnectionRef, granteeAccountRef)).toBeUndefined()
        expect(await transaction.getShareByIdempotency(
          ownerAccountRef,
          'connection:share:idempotency',
        )).toBeUndefined()
        expect(await transaction.getLease(canonicalLeaseRef)).toBeUndefined()
        expect(await transaction.getLeaseByIdempotency(
          ownerAccountRef,
          'connection:lease:idempotency',
        )).toBeUndefined()
        expect(await transaction.getAdmission(canonicalEffectRef)).toBeUndefined()
        expect(await transaction.getAdmissionByIdempotency(
          ownerAccountRef,
          'connection:begin_effect:idempotency',
        )).toBeUndefined()
        expect(await transaction.getLifecycleCommandByIdempotency(
          ownerAccountRef,
          'connection:refresh:idempotency',
        )).toBeUndefined()

        await transaction.insertConnection(connection())
        await transaction.insertShare(share())
        await transaction.insertLease(lease())
        await transaction.insertAdmission(admission())
        await transaction.insertLifecycleCommand(lifecycleCommand())
      })

      await store.transact(async (transaction) => {
        await expect(transaction.getConnection(canonicalConnectionRef)).resolves.toMatchObject({
          connectionRef: canonicalConnectionRef,
        })
        await expect(transaction.getConnectionByInstallIdempotency(
          ownerAccountRef,
          'connection:install:idempotency',
        )).resolves.toMatchObject({ connectionRef: canonicalConnectionRef })
        await expect(transaction.getShare(canonicalShareRef)).resolves.toMatchObject({ shareRef: canonicalShareRef })
        await expect(transaction.getActiveShare(
          canonicalConnectionRef,
          granteeAccountRef,
        )).resolves.toMatchObject({ shareRef: canonicalShareRef })
        await expect(transaction.getShareByIdempotency(
          ownerAccountRef,
          'connection:share:idempotency',
        )).resolves.toMatchObject({ shareRef: canonicalShareRef })
        await expect(transaction.getLease(canonicalLeaseRef)).resolves.toMatchObject({ leaseRef: canonicalLeaseRef })
        await expect(transaction.getLeaseByIdempotency(
          ownerAccountRef,
          'connection:lease:idempotency',
        )).resolves.toMatchObject({ leaseRef: canonicalLeaseRef })
        await expect(transaction.getAdmission(canonicalEffectRef)).resolves.toMatchObject({ effectRef: canonicalEffectRef })
        await expect(transaction.getAdmissionByIdempotency(
          ownerAccountRef,
          'connection:begin_effect:idempotency',
        )).resolves.toMatchObject({ effectRef: canonicalEffectRef })
        await expect(transaction.getLifecycleCommandByIdempotency(
          ownerAccountRef,
          'connection:refresh:idempotency',
        )).resolves.toMatchObject({ operation: 'refresh' })

        await expect(transaction.insertConnection(connection())).rejects.toMatchObject({
          code: 'connection_ref_conflict',
        })
        await expect(transaction.insertShare(share())).rejects.toMatchObject({
          code: 'connection_share_ref_conflict',
        })
        await expect(transaction.insertLease(lease())).rejects.toMatchObject({
          code: 'connection_lease_ref_conflict',
        })
        await expect(transaction.insertAdmission(admission())).rejects.toMatchObject({
          code: 'connection_effect_ref_conflict',
        })
        await expect(transaction.insertLifecycleCommand(lifecycleCommand())).rejects.toMatchObject({
          code: 'connection_idempotency_conflict',
        })

        const absent = connection({
          connectionRef: connectionRef('con_11111111111111111111111111111111'),
        })
        await expect(transaction.replaceConnection(absent, 1)).rejects.toMatchObject({
          code: 'connection_generation_stale',
        })
        await expect(transaction.replaceConnection(refreshedConnection(), 9)).rejects.toMatchObject({
          code: 'connection_generation_stale',
        })
        await transaction.replaceConnection(refreshedConnection(), 1)
        await expect(transaction.getConnection(canonicalConnectionRef)).resolves.toMatchObject({
          generation: 2,
          revision: 2,
          externalState: { kind: 'unknown', value: 'provider-pending' },
        })
      })
    })
  })

  it('rejects malformed persisted rows from every Connection store getter', async () => {
    const scenarios: ReadonlyArray<{
      insert(ctx: MutationCtx): Promise<void>
      read(ctx: MutationCtx): Promise<unknown>
    }> = [
      {
        insert: async (ctx) => {
          await ctx.db.insert('connections', storedConnection(connection({ providerNamespace: '' })))
        },
        read: async (ctx) => await createConvexConnectionLifecycleStore(ctx).transact(
          async (transaction) => await transaction.getConnection(canonicalConnectionRef),
        ),
      },
      {
        insert: async (ctx) => {
          await ctx.db.insert('connectionShares', storedShare(share({ granteeAccountRef: ownerAccountRef })))
        },
        read: async (ctx) => await createConvexConnectionLifecycleStore(ctx).transact(
          async (transaction) => await transaction.getShare(canonicalShareRef),
        ),
      },
      {
        insert: async (ctx) => {
          await ctx.db.insert('connectionLeases', storedLease(lease({ expiresAt: 10 })))
        },
        read: async (ctx) => await createConvexConnectionLifecycleStore(ctx).transact(
          async (transaction) => await transaction.getLease(canonicalLeaseRef),
        ),
      },
      {
        insert: async (ctx) => {
          await ctx.db.insert('connectionEffectAdmissions', storedAdmission(admission({
            action: connectionAction('lease'),
          })))
        },
        read: async (ctx) => await createConvexConnectionLifecycleStore(ctx).transact(
          async (transaction) => await transaction.getAdmission(canonicalEffectRef),
        ),
      },
      {
        insert: async (ctx) => {
          await ctx.db.insert('connectionLifecycleCommands', storedLifecycleCommand(lifecycleCommand({
            expectedGeneration: 2,
          })))
        },
        read: async (ctx) => await createConvexConnectionLifecycleStore(ctx).transact(
          async (transaction) => await transaction.getLifecycleCommandByIdempotency(
            ownerAccountRef,
            'connection:refresh:idempotency',
          ),
        ),
      },
    ]

    for (const scenario of scenarios) {
      const backend = convexTest(schema, convexModules)
      await backend.run(async (ctx) => {
        await scenario.insert(ctx)
        await expect(scenario.read(ctx)).rejects.toMatchObject({ code: 'connection_persistence_invalid' })
      })
    }
  })

  it('does not treat a provision command as proof that its pointer exists', async () => {
    const backend = convexTest(schema, convexModules)
    const provision = authority('provision')
    await backend.run(async (ctx) => {
      await ctx.db.insert('secretPointerCommands', {
        secretRef: pointerRef,
        operation: 'provision',
        newGeneration: firstGeneration,
        previousRevision: 0,
        newRevision: 1,
        action: provision,
      })

      await expect(initializeConvexSecretPointer(ctx, provision, {
        secretRef: pointerRef,
        activeGeneration: firstGeneration,
      })).rejects.toMatchObject({ code: 'secret_pointer_advance_failed' })
    })
  })

  it('does not treat an advance command as proof of missing pointer post-state', async () => {
    const backend = convexTest(schema, convexModules)
    const rotation = authority('rotate')
    await backend.run(async (ctx) => {
      await ctx.db.insert('secretPointerCommands', {
        secretRef: pointerRef,
        operation: 'rotate',
        previousGeneration: firstGeneration,
        newGeneration: secondGeneration,
        previousRevision: 1,
        newRevision: 2,
        action: rotation,
      })
      const store = createConvexSecretPointerStore(ctx, rotation)

      await expect(store.advanceActive({
        secretRef: pointerRef,
        expectedActiveGeneration: firstGeneration,
        expectedRevision: 1,
        newGeneration: secondGeneration,
      })).rejects.toMatchObject({ code: 'secret_pointer_advance_failed' })
    })
  })

  it('covers the defensive absent snapshot value during delegation conflict lookup', async () => {
    const backend = convexTest(schema, convexModules)
    await backend.run(async (ctx) => {
      let reads = 0
      const dynamicChange = Object.defineProperty({}, 'snapshotInsert', {
        enumerable: true,
        get: () => {
          reads += 1
          return reads === 1 ? snapshot() : undefined
        },
      })
      await createConvexDelegationStore(ctx).transact(async (transaction) => {
        await transaction.commit(dynamicChange)
      })
      expect(reads).toBeGreaterThanOrEqual(3)
      expect(await ctx.db.query('authorityDelegationSnapshots').collect()).toHaveLength(0)
    })
  })

  it('provisions, rotates, reconciles and exactly replays coherent secret pointers', async () => {
    const backend = convexTest(schema, convexModules)
    const provision = authority('provision')
    const rotation = authority('rotate', {
      correlationRef: 'secret:rotate:coherent',
      idempotencyRef: 'secret:rotate:coherent',
      occurredAt: 110,
    })
    const thirdGeneration = secretGeneration('sgn_77777777777777777777777777777777')
    const reconciliation = authority('reconcile', {
      correlationRef: 'secret:reconcile:coherent',
      idempotencyRef: 'secret:reconcile:coherent',
      occurredAt: 120,
    })

    await backend.run(async (ctx) => {
      const empty = createConvexSecretPointerStore(ctx, rotation)
      await expect(empty.getActive(pointerRef)).resolves.toBeUndefined()
      expect(() => createConvexSecretPointerStore(ctx, provision)).toThrowError()
      await expect(initializeConvexSecretPointer(ctx, rotation, {
        secretRef: pointerRef,
        activeGeneration: firstGeneration,
      })).rejects.toMatchObject({ code: 'secret_pointer_advance_failed' })

      const initialized = await initializeConvexSecretPointer(ctx, provision, {
        secretRef: pointerRef,
        activeGeneration: firstGeneration,
      })
      expect(initialized).toEqual({
        secretRef: pointerRef,
        activeGeneration: firstGeneration,
        revision: 1,
      })
      await expect(initializeConvexSecretPointer(ctx, provision, {
        secretRef: pointerRef,
        activeGeneration: firstGeneration,
      })).resolves.toEqual(initialized)
      await expect(initializeConvexSecretPointer(ctx, authority('provision', {
        correlationRef: 'secret:provision:duplicate',
        idempotencyRef: 'secret:provision:duplicate',
      }), {
        secretRef: pointerRef,
        activeGeneration: firstGeneration,
      })).rejects.toMatchObject({ code: 'secret_pointer_advance_failed' })

      const rotationStore = createConvexSecretPointerStore(ctx, rotation)
      const rotationRequest = {
        secretRef: pointerRef,
        expectedActiveGeneration: firstGeneration,
        expectedRevision: 1,
        newGeneration: secondGeneration,
      }
      await rotationStore.advanceActive(rotationRequest)
      await expect(rotationStore.advanceActive(rotationRequest)).resolves.toBeUndefined()

      const reconciliationStore = createConvexSecretPointerStore(ctx, reconciliation)
      const reconciliationRequest = {
        secretRef: pointerRef,
        expectedActiveGeneration: secondGeneration,
        expectedRevision: 2,
        newGeneration: thirdGeneration,
      }
      await reconciliationStore.advanceActive(reconciliationRequest)
      await expect(reconciliationStore.advanceActive(reconciliationRequest)).resolves.toBeUndefined()
      await expect(reconciliationStore.advanceActive({
        ...reconciliationRequest,
        newGeneration: secretGeneration('sgn_88888888888888888888888888888888'),
      })).rejects.toMatchObject({ code: 'secret_pointer_advance_failed' })
      await expect(rotationStore.advanceActive(rotationRequest)).resolves.toBeUndefined()
      await expect(reconciliationStore.getActive(pointerRef)).resolves.toEqual({
        secretRef: pointerRef,
        activeGeneration: thirdGeneration,
        revision: 3,
      })

      const rows = {
        pointers: await ctx.db.query('secretPointers').collect(),
        commands: await ctx.db.query('secretPointerCommands').collect(),
      }
      expect(rows.pointers).toHaveLength(1)
      expect(rows.commands).toHaveLength(3)
      expect(JSON.stringify(rows)).not.toMatch(/material|plaintext|credential|token|canary-secret/i)
    })
  })

  it('rejects invalid secret authority and pointer request values', async () => {
    const invalidAuthorities: SecretPointerAuthority[] = [
      authority('rotate', { operation: 'invalid' as SecretPointerAuthority['operation'] }),
      authority('rotate', { grantRef: '' }),
      authority('rotate', { correlationRef: '' }),
      authority('rotate', { idempotencyRef: '' }),
      authority('rotate', { snapshotRef: 'bad' as SecretPointerAuthority['snapshotRef'] }),
      authority('rotate', { accountRef: 'bad' as SecretPointerAuthority['accountRef'] }),
      authority('rotate', { actorPrincipalRef: 'bad' as SecretPointerAuthority['actorPrincipalRef'] }),
      authority('rotate', { grantGeneration: 0 }),
      authority('rotate', { grantGeneration: Number.NaN }),
      authority('rotate', { occurredAt: -1 }),
      authority('rotate', { occurredAt: Number.NaN }),
    ]
    const backend = convexTest(schema, convexModules)
    await backend.run(async (ctx) => {
      for (const invalid of invalidAuthorities) {
        expect(() => createConvexSecretPointerStore(ctx, invalid)).toThrowError()
      }
      await initializeConvexSecretPointer(ctx, authority('provision'), {
        secretRef: pointerRef,
        activeGeneration: firstGeneration,
      })
      const store = createConvexSecretPointerStore(ctx, authority('rotate'))
      for (const expectedRevision of [0, Number.NaN]) {
        await expect(store.advanceActive({
          secretRef: pointerRef,
          expectedActiveGeneration: firstGeneration,
          expectedRevision,
          newGeneration: secondGeneration,
        })).rejects.toMatchObject({ code: 'secret_pointer_advance_failed' })
      }
      await expect(store.advanceActive({
        secretRef: pointerRef,
        expectedActiveGeneration: firstGeneration,
        expectedRevision: 1,
        newGeneration: firstGeneration,
      })).rejects.toMatchObject({ code: 'secret_pointer_advance_failed' })
    })
  })

  it('rejects missing, cross-Account, stale, future and malformed pointer CAS state', async () => {
    const scenarios: ReadonlyArray<{
      mutate(row: {
        owningAccountRef: typeof ownerAccountRef
        activeGeneration: typeof firstGeneration
        revision: number
        updatedAt: number
      }): void
      request?: Partial<{
        expectedActiveGeneration: typeof firstGeneration
        expectedRevision: number
        newGeneration: typeof secondGeneration
      }>
      omitPointer?: boolean
    }> = [
      { mutate: () => undefined, omitPointer: true },
      { mutate: (row) => { row.owningAccountRef = strangerAccountRef } },
      { mutate: (row) => { row.activeGeneration = secondGeneration } },
      { mutate: (row) => { row.revision = 2 } },
      { mutate: (row) => { row.updatedAt = 101 } },
    ]

    for (const [index, scenario] of scenarios.entries()) {
      const backend = convexTest(schema, convexModules)
      await backend.run(async (ctx) => {
        if (!scenario.omitPointer) {
          const row = {
            secretRef: pointerRef,
            owningAccountRef: ownerAccountRef,
            activeGeneration: firstGeneration,
            revision: 1,
            createdAt: 100,
            updatedAt: 100,
            lastAction: authority('provision'),
          }
          scenario.mutate(row)
          await ctx.db.insert('secretPointers', row)
        }
        const store = createConvexSecretPointerStore(ctx, authority('rotate', {
          correlationRef: `secret:cas:${index}`,
          idempotencyRef: `secret:cas:${index}`,
        }))
        await expect(store.advanceActive({
          secretRef: pointerRef,
          expectedActiveGeneration: firstGeneration,
          expectedRevision: 1,
          newGeneration: secondGeneration,
          ...scenario.request,
        })).rejects.toMatchObject({ code: 'secret_pointer_advance_failed' })
      })
    }

    const malformedReadBackend = convexTest(schema, convexModules)
    await malformedReadBackend.run(async (ctx) => {
      await ctx.db.insert('secretPointerCommands', {
        secretRef: pointerRef,
        operation: 'provision',
        newGeneration: firstGeneration,
        previousRevision: 0,
        newRevision: 0,
        action: authority('provision'),
      })
      await ctx.db.insert('secretPointers', {
        secretRef: pointerRef,
        owningAccountRef: ownerAccountRef,
        activeGeneration: 'malformed',
        revision: 0,
        createdAt: 100,
        updatedAt: 100,
        lastAction: authority('provision'),
      })
      const store = createConvexSecretPointerStore(ctx, authority('rotate'))
      await expect(store.getActive(pointerRef)).rejects.toThrow()
    })
  })

  it('rejects provision and advance idempotency mismatches', async () => {
    const backend = convexTest(schema, convexModules)
    await backend.run(async (ctx) => {
      const provision = authority('provision')
      await initializeConvexSecretPointer(ctx, provision, {
        secretRef: pointerRef,
        activeGeneration: firstGeneration,
      })
      await expect(initializeConvexSecretPointer(ctx, provision, {
        secretRef: pointerRef,
        activeGeneration: secondGeneration,
      })).rejects.toMatchObject({ code: 'secret_pointer_advance_failed' })

      const rotation = authority('rotate', { occurredAt: 110 })
      const store = createConvexSecretPointerStore(ctx, rotation)
      await store.advanceActive({
        secretRef: pointerRef,
        expectedActiveGeneration: firstGeneration,
        expectedRevision: 1,
        newGeneration: secondGeneration,
      })
      await expect(store.advanceActive({
        secretRef: pointerRef,
        expectedActiveGeneration: firstGeneration,
        expectedRevision: 1,
        newGeneration: secretGeneration('sgn_88888888888888888888888888888888'),
      })).rejects.toMatchObject({ code: 'secret_pointer_advance_failed' })
    })
  })

  it('rejects incoherent equal and advanced replay post-state', async () => {
    const equalRevisionBackend = convexTest(schema, convexModules)
    const rotation = authority('rotate')
    await equalRevisionBackend.run(async (ctx) => {
      await ctx.db.insert('secretPointerCommands', {
        secretRef: pointerRef,
        operation: 'rotate',
        previousGeneration: firstGeneration,
        newGeneration: secondGeneration,
        previousRevision: 1,
        newRevision: 2,
        action: rotation,
      })
      await ctx.db.insert('secretPointers', {
        secretRef: pointerRef,
        owningAccountRef: ownerAccountRef,
        activeGeneration: firstGeneration,
        revision: 2,
        createdAt: 100,
        updatedAt: 100,
        lastAction: rotation,
      })
      await expect(createConvexSecretPointerStore(ctx, rotation).advanceActive({
        secretRef: pointerRef,
        expectedActiveGeneration: firstGeneration,
        expectedRevision: 1,
        newGeneration: secondGeneration,
      })).rejects.toMatchObject({ code: 'secret_pointer_advance_failed' })
    })

    const advancedRevisionBackend = convexTest(schema, convexModules)
    await advancedRevisionBackend.run(async (ctx) => {
      await ctx.db.insert('secretPointerCommands', {
        secretRef: pointerRef,
        operation: 'rotate',
        previousGeneration: firstGeneration,
        newGeneration: secondGeneration,
        previousRevision: 1,
        newRevision: 2,
        action: rotation,
      })
      await ctx.db.insert('secretPointers', {
        secretRef: pointerRef,
        owningAccountRef: ownerAccountRef,
        activeGeneration: secretGeneration('sgn_99999999999999999999999999999999'),
        revision: 3,
        createdAt: 100,
        updatedAt: 100,
        lastAction: rotation,
      })
      await expect(createConvexSecretPointerStore(ctx, rotation).advanceActive({
        secretRef: pointerRef,
        expectedActiveGeneration: firstGeneration,
        expectedRevision: 1,
        newGeneration: secondGeneration,
      })).rejects.toMatchObject({ code: 'secret_pointer_advance_failed' })
    })
  })

  it('rejects fabricated equal and advanced pointer provenance', async () => {
    const original = authority('rotate')
    const fabricated = authority('rotate', {
      actorPrincipalRef: subjectPrincipalRef,
      snapshotRef: delegationSnapshotRef('das_eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'),
      grantRef: childGrantRef,
    })

    for (const advanced of [false, true]) {
      const backend = convexTest(schema, convexModules)
      await backend.run(async (ctx) => {
        await ctx.db.insert('secretPointerCommands', {
          secretRef: pointerRef,
          operation: 'rotate',
          previousGeneration: firstGeneration,
          newGeneration: secondGeneration,
          previousRevision: 1,
          newRevision: 2,
          action: original,
        })
        if (advanced) {
          await ctx.db.insert('secretPointerCommands', {
            secretRef: pointerRef,
            operation: 'reconcile',
            previousGeneration: secondGeneration,
            newGeneration: secretGeneration('sgn_99999999999999999999999999999999'),
            previousRevision: 2,
            newRevision: 3,
            action: authority('reconcile'),
          })
        }
        await ctx.db.insert('secretPointers', {
          secretRef: pointerRef,
          owningAccountRef: ownerAccountRef,
          activeGeneration: advanced
            ? secretGeneration('sgn_99999999999999999999999999999999')
            : secondGeneration,
          revision: advanced ? 3 : 2,
          createdAt: 90,
          updatedAt: 100,
          lastAction: fabricated,
        })

        await expect(createConvexSecretPointerStore(ctx, original).advanceActive({
          secretRef: pointerRef,
          expectedActiveGeneration: firstGeneration,
          expectedRevision: 1,
          newGeneration: secondGeneration,
        })).rejects.toMatchObject({ code: 'secret_pointer_advance_failed' })
      })
    }
  })

  it('rejects advanced replay whose later generation is disconnected', async () => {
    const backend = convexTest(schema, convexModules)
    const original = authority('rotate')
    const later = authority('reconcile', {
      correlationRef: 'secret:disconnected-later',
      idempotencyRef: 'secret:disconnected-later',
      occurredAt: 110,
    })
    const thirdGeneration = secretGeneration('sgn_99999999999999999999999999999999')
    await backend.run(async (ctx) => {
      await ctx.db.insert('secretPointerCommands', {
        secretRef: pointerRef,
        operation: 'rotate',
        previousGeneration: firstGeneration,
        newGeneration: secondGeneration,
        previousRevision: 1,
        newRevision: 2,
        action: original,
      })
      await ctx.db.insert('secretPointerCommands', {
        secretRef: pointerRef,
        operation: 'reconcile',
        previousGeneration: secretGeneration('sgn_88888888888888888888888888888888'),
        newGeneration: thirdGeneration,
        previousRevision: 2,
        newRevision: 3,
        action: later,
      })
      await ctx.db.insert('secretPointers', {
        secretRef: pointerRef,
        owningAccountRef: ownerAccountRef,
        activeGeneration: thirdGeneration,
        revision: 3,
        createdAt: 90,
        updatedAt: 110,
        lastAction: later,
      })

      await expect(createConvexSecretPointerStore(ctx, original).advanceActive({
        secretRef: pointerRef,
        expectedActiveGeneration: firstGeneration,
        expectedRevision: 1,
        newGeneration: secondGeneration,
      })).rejects.toMatchObject({ code: 'secret_pointer_advance_failed' })
    })

    const malformedBackend = convexTest(schema, convexModules)
    await malformedBackend.run(async (ctx) => {
      await ctx.db.insert('secretPointerCommands', {
        secretRef: pointerRef,
        operation: 'rotate',
        previousGeneration: firstGeneration,
        newGeneration: secondGeneration,
        previousRevision: 1,
        newRevision: 2,
        action: original,
      })
      await ctx.db.insert('secretPointerCommands', {
        secretRef: pointerRef,
        operation: 'reconcile',
        previousGeneration: secondGeneration,
        newGeneration: 'malformed',
        previousRevision: 2,
        newRevision: 3,
        action: later,
      })
      await ctx.db.insert('secretPointers', {
        secretRef: pointerRef,
        owningAccountRef: ownerAccountRef,
        activeGeneration: thirdGeneration,
        revision: 3,
        createdAt: 90,
        updatedAt: 110,
        lastAction: later,
      })
      await expect(createConvexSecretPointerStore(ctx, original).advanceActive({
        secretRef: pointerRef,
        expectedActiveGeneration: firstGeneration,
        expectedRevision: 1,
        newGeneration: secondGeneration,
      })).rejects.toMatchObject({ code: 'secret_pointer_advance_failed' })
    })
  })

  it('preflights pointer-command revision conflicts before changing pointer state', async () => {
    const backend = convexTest(schema, convexModules)
    await backend.run(async (ctx) => {
      await initializeConvexSecretPointer(ctx, authority('provision'), {
        secretRef: pointerRef,
        activeGeneration: firstGeneration,
      })
      await ctx.db.insert('secretPointerCommands', {
        secretRef: pointerRef,
        operation: 'rotate',
        previousGeneration: firstGeneration,
        newGeneration: secretGeneration('sgn_99999999999999999999999999999999'),
        previousRevision: 1,
        newRevision: 2,
        action: authority('rotate', {
          correlationRef: 'secret:collision',
          idempotencyRef: 'secret:collision',
        }),
      })

      let caught: unknown
      try {
        await createConvexSecretPointerStore(ctx, authority('rotate')).advanceActive({
          secretRef: pointerRef,
          expectedActiveGeneration: firstGeneration,
          expectedRevision: 1,
          newGeneration: secondGeneration,
        })
      } catch (error) {
        caught = error
      }
      expect(caught).toMatchObject({ code: 'secret_pointer_advance_failed' })
      const [stored] = await ctx.db.query('secretPointers').collect()
      expect(stored).toMatchObject({ activeGeneration: firstGeneration, revision: 1 })
    })
  })

  it('preflights provision-command revision conflicts before creating a pointer', async () => {
    const backend = convexTest(schema, convexModules)
    await backend.run(async (ctx) => {
      await ctx.db.insert('secretPointerCommands', {
        secretRef: pointerRef,
        operation: 'provision',
        newGeneration: secondGeneration,
        previousRevision: 0,
        newRevision: 1,
        action: authority('provision', {
          correlationRef: 'secret:provision-collision',
          idempotencyRef: 'secret:provision-collision',
        }),
      })
      await expect(initializeConvexSecretPointer(ctx, authority('provision'), {
        secretRef: pointerRef,
        activeGeneration: firstGeneration,
      })).rejects.toMatchObject({ code: 'secret_pointer_advance_failed' })
      expect(await ctx.db.query('secretPointers').collect()).toHaveLength(0)
    })
  })

  it('rejects malformed stored authority during idempotency comparison', async () => {
    const backend = convexTest(schema, convexModules)
    const provision = authority('provision')
    await backend.run(async (ctx) => {
      await ctx.db.insert('secretPointerCommands', {
        secretRef: pointerRef,
        operation: 'provision',
        newGeneration: firstGeneration,
        previousRevision: 0,
        newRevision: 1,
        action: { ...provision, grantRef: '' },
      })
      await ctx.db.insert('secretPointers', {
        secretRef: pointerRef,
        owningAccountRef: ownerAccountRef,
        activeGeneration: firstGeneration,
        revision: 1,
        createdAt: 100,
        updatedAt: 100,
        lastAction: provision,
      })
      await expect(initializeConvexSecretPointer(ctx, provision, {
        secretRef: pointerRef,
        activeGeneration: firstGeneration,
      })).rejects.toMatchObject({ code: 'secret_pointer_advance_failed' })
    })
  })





  it('denies a different Account access to an existing secret pointer', async () => {
    const backend = convexTest(schema, convexModules)

    await backend.run(async (ctx) => {
      await initializeConvexSecretPointer(ctx, authority('provision'), {
        secretRef: pointerRef,
        activeGeneration: firstGeneration,
      })

      const strangerStore = createConvexSecretPointerStore(ctx, authority('rotate', {
        accountRef: strangerAccountRef,
        correlationRef: 'secret:stranger-read',
        idempotencyRef: 'secret:stranger-read',
      }))
      await expect(strangerStore.getActive(pointerRef)).rejects.toMatchObject({
        code: 'secret_pointer_advance_failed',
      })
    })
  })

  it('rejects pointer advancement whose trusted occurrence time moves backwards', async () => {
    const backend = convexTest(schema, convexModules)

    await backend.run(async (ctx) => {
      await initializeConvexSecretPointer(ctx, authority('provision'), {
        secretRef: pointerRef,
        activeGeneration: firstGeneration,
      })
      const store = createConvexSecretPointerStore(ctx, authority('rotate', {
        occurredAt: 99,
      }))

      await expect(store.advanceActive({
        secretRef: pointerRef,
        expectedActiveGeneration: firstGeneration,
        expectedRevision: 1,
        newGeneration: secondGeneration,
      })).rejects.toMatchObject({ code: 'secret_pointer_advance_failed' })
    })
  })
})
