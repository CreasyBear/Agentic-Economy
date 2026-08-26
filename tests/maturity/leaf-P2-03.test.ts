import { describe, expect, it } from 'vitest'

import {
  ConnectionLifecycleService,
  type Connection,
  type ConnectionActionAuthority,
  type ConnectionActionRequest,
  type ConnectionActionSnapshot,
  type ConnectionEffectAdmission,
  type ConnectionLease,
  type ConnectionLifecycleCommand,
  type ConnectionLifecycleStore,
  type ConnectionLifecycleTransaction,
  type ConnectionShare,
} from '../../src/modules/connections/lifecycle/public'
import {
  accountRef,
  principalRef,
  type AccountActionContext,
  type AccountRef,
  type PrincipalRef,
} from '../../src/modules/principal-account/public'
import { delegationSnapshotRef } from '../../src/modules/authority/delegation/public'
import { secretRef } from '../../src/modules/secrets/public'

class ContractStore implements ConnectionLifecycleStore {
  readonly connections = new Map<string, Connection>()
  readonly shares = new Map<string, ConnectionShare>()
  readonly leases = new Map<string, ConnectionLease>()
  readonly admissions = new Map<string, ConnectionEffectAdmission>()
  readonly commands = new Map<string, ConnectionLifecycleCommand>()

  async transact<Result>(operation: (transaction: ConnectionLifecycleTransaction) => Promise<Result>): Promise<Result> {
    return await operation({
      getConnection: async (ref) => this.connections.get(ref),
      getConnectionByInstallIdempotency: async (account, idempotency) => [...this.connections.values()].find((connection) => connection.installAction.activeAccountRef === account && connection.installAction.idempotencyRef === idempotency),
      getShare: async (ref) => this.shares.get(ref),
      getActiveShare: async (connection, account) => [...this.shares.values()].find((share) => share.connectionRef === connection && share.granteeAccountRef === account && share.lifecycle === 'active'),
      getShareByIdempotency: async (account, idempotency) => this.find(this.shares, account, idempotency),
      getLease: async (ref) => this.leases.get(ref),
      getLeaseByIdempotency: async (account, idempotency) => this.find(this.leases, account, idempotency),
      getAdmission: async (ref) => this.admissions.get(ref),
      getAdmissionByIdempotency: async (account, idempotency) => this.find(this.admissions, account, idempotency),
      getLifecycleCommandByIdempotency: async (account, idempotency) => this.commands.get(`${account}:${idempotency}`),
      insertConnection: async (connection) => { this.connections.set(connection.connectionRef, connection) },
      replaceConnection: async (connection) => { this.connections.set(connection.connectionRef, connection) },
      insertShare: async (share) => { this.shares.set(share.shareRef, share) },
      insertLease: async (lease) => { this.leases.set(lease.leaseRef, lease) },
      insertAdmission: async (admission) => { this.admissions.set(admission.effectRef, admission) },
      insertLifecycleCommand: async (command) => {
        const key = `${command.action.activeAccountRef}:${command.action.idempotencyRef}`
        if (this.commands.has(key)) throw new Error('duplicate lifecycle command')
        this.commands.set(key, command)
      },
    })
  }

  private find<Value extends { action: { activeAccountRef: AccountRef; idempotencyRef: string } }>(
    values: Map<string, Value>,
    account: AccountRef,
    idempotency: string,
  ): Value | undefined {
    return [...values.values()].find((value) => value.action.activeAccountRef === account && value.action.idempotencyRef === idempotency)
  }
}

class ContractAuthority implements ConnectionActionAuthority {
  readonly generations = new Map<string, number>()
  readonly requests: ConnectionActionRequest[] = []

  async withCurrentAuthority<Result>(
    request: ConnectionActionRequest,
    consequence: (snapshot: ConnectionActionSnapshot) => Promise<Result>,
  ): Promise<Result> {
    this.requests.push(request)
    return await consequence(Object.freeze({
      snapshotRef: delegationSnapshotRef('das_00000000000000000000000000000001'),
      actorPrincipalRef: request.context.actorPrincipalRef,
      activeAccountRef: request.context.activeAccountRef,
      grantRef: request.grantRef,
      grantGeneration: this.generations.get(request.grantRef) ?? 1,
      grantExpiresAt: 100_000,
      resourceRefs: request.resourceRefs,
    }))
  }
}

function fixture() {
  const store = new ContractStore()
  const authority = new ContractAuthority()
  let now = 1_000
  let sequence = 0
  const service = new ConnectionLifecycleService(store, authority, {
    now: () => now,
    randomUuid: () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`,
  })
  const ownerAccountRef = accountRef('acc_00000000000000000000000000000001')
  const ownerPrincipalRef = principalRef('prn_00000000000000000000000000000001')
  const context = (account: AccountRef, actor: PrincipalRef, operation: string): AccountActionContext => ({
    actorPrincipalRef: actor,
    activeAccountRef: account,
    correlationRef: `correlation:${operation}`,
    idempotencyRef: `idempotency:${operation}`,
  })
  return {
    authority,
    ownerAccountRef,
    ownerPrincipalRef,
    service,
    setNow: (value: number) => { now = value },
    store,
    context,
  }
}

describe('P2-03 canonical Connection lifecycle contract', () => {
  it('installs a stable Account-owned Connection and admits an attributed generation-pinned lease', async () => {
    const setup = fixture()
    const installedSecretRef = secretRef('sec_00000000000000000000000000000001')
    const installed = await setup.service.install({
      context: setup.context(setup.ownerAccountRef, setup.ownerPrincipalRef, 'install'),
      grantRef: 'grant:owner', expectedGrantGeneration: 1,
      providerNamespace: 'oauth/acme',
      providerLocator: 'provider-connection-42',
      secretRef: installedSecretRef,
      externalState: { kind: 'known', value: 'ready' },
    })
    const lease = await setup.service.lease({
      connectionRef: installed.connectionRef,
      context: setup.context(setup.ownerAccountRef, setup.ownerPrincipalRef, 'lease'),
      grantRef: 'grant:owner', expectedGrantGeneration: 1,
      expiresAt: 10_000,
    })
    const admission = await setup.service.beginEffect({
      leaseRef: lease.leaseRef,
      context: setup.context(setup.ownerAccountRef, setup.ownerPrincipalRef, 'effect'),
    })

    expect(installed.connectionRef).toMatch(/^con_[0-9a-f]{32}$/u)
    expect(installed).toMatchObject({
      owningAccountRef: setup.ownerAccountRef,
      installedByPrincipalRef: setup.ownerPrincipalRef,
      generation: 1,
      lifecycle: 'active',
      secretRef: installedSecretRef,
    })
    expect(setup.authority.requests[0]?.resourceRefs).toEqual([
      'connection-provider:oauth/acme',
      'connection-provider:oauth/acme:provider-connection-42',
      `secret:${installedSecretRef}`,
    ])
    expect(setup.authority.requests[0]?.expectedGrantGeneration).toBe(1)
    expect(installed.action).toMatchObject({
      snapshotRef: 'das_00000000000000000000000000000001',
      resourceRefs: setup.authority.requests[0]?.resourceRefs,
    })
    expect(lease).toMatchObject({
      connectionRef: installed.connectionRef,
      connectionGeneration: 1,
      owningAccountRef: setup.ownerAccountRef,
      activeAccountRef: setup.ownerAccountRef,
      actorPrincipalRef: setup.ownerPrincipalRef,
      grantRef: 'grant:owner',
      grantGeneration: 1,
      expiresAt: 10_000,
    })
    expect(admission).toMatchObject({
      leaseRef: lease.leaseRef,
      connectionRef: installed.connectionRef,
      owningAccountRef: setup.ownerAccountRef,
      activeAccountRef: setup.ownerAccountRef,
      actorPrincipalRef: setup.ownerPrincipalRef,
      connectionGeneration: 1,
      grantGeneration: 1,
    })
    expect(JSON.stringify(installed)).not.toMatch(/credential|ownerId|userId|clerk/iu)
  })

  it('requires an explicit share before another Account can lease without transferring ownership', async () => {
    const setup = fixture()
    const granteeAccountRef = accountRef('acc_00000000000000000000000000000002')
    const granteePrincipalRef = principalRef('prn_00000000000000000000000000000002')
    const strangerAccountRef = accountRef('acc_00000000000000000000000000000003')
    const installed = await setup.service.install({
      context: setup.context(setup.ownerAccountRef, setup.ownerPrincipalRef, 'install-share'),
      grantRef: 'grant:owner', expectedGrantGeneration: 1,
      providerNamespace: 'oauth/acme',
      externalState: { kind: 'known', value: 'ready' },
    })

    await expect(setup.service.lease({
      connectionRef: installed.connectionRef,
      context: setup.context(strangerAccountRef, granteePrincipalRef, 'stranger'),
      grantRef: 'grant:stranger', expectedGrantGeneration: 1,
      expiresAt: 10_000,
    })).rejects.toMatchObject({ code: 'connection_access_denied' })

    const share = await setup.service.share({
      connectionRef: installed.connectionRef,
      granteeAccountRef,
      context: setup.context(setup.ownerAccountRef, setup.ownerPrincipalRef, 'share'),
      grantRef: 'grant:owner', expectedGrantGeneration: 1,
    })
    const lease = await setup.service.lease({
      connectionRef: installed.connectionRef,
      context: setup.context(granteeAccountRef, granteePrincipalRef, 'shared-lease'),
      grantRef: 'grant:grantee', expectedGrantGeneration: 1,
      expiresAt: 10_000,
    })

    expect(share).toMatchObject({
      connectionRef: installed.connectionRef,
      owningAccountRef: setup.ownerAccountRef,
      granteeAccountRef,
      connectionGeneration: 1,
      lifecycle: 'active',
    })
    expect(lease).toMatchObject({ owningAccountRef: setup.ownerAccountRef, activeAccountRef: granteeAccountRef })
    expect(installed.owningAccountRef).toBe(setup.ownerAccountRef)
  })

  it('advances generation on refresh before any stale lease can start a new effect', async () => {
    const setup = fixture()
    const installed = await setup.service.install({
      context: setup.context(setup.ownerAccountRef, setup.ownerPrincipalRef, 'install-refresh'),
      grantRef: 'grant:owner', expectedGrantGeneration: 1,
      providerNamespace: 'oauth/acme',
      externalState: { kind: 'known', value: 'ready' },
    })
    const staleLease = await setup.service.lease({
      connectionRef: installed.connectionRef,
      context: setup.context(setup.ownerAccountRef, setup.ownerPrincipalRef, 'lease-before-refresh'),
      grantRef: 'grant:owner', expectedGrantGeneration: 1,
      expiresAt: 10_000,
    })
    setup.setNow(2_000)
    const refreshed = await setup.service.refresh({
      connectionRef: installed.connectionRef,
      expectedGeneration: 1,
      externalState: { kind: 'known', value: 'ready' },
      context: setup.context(setup.ownerAccountRef, setup.ownerPrincipalRef, 'refresh'),
      grantRef: 'grant:owner', expectedGrantGeneration: 1,
    })

    expect(refreshed).toMatchObject({ generation: 2, revision: 2, lifecycle: 'active' })
    await expect(setup.service.beginEffect({
      leaseRef: staleLease.leaseRef,
      context: setup.context(setup.ownerAccountRef, setup.ownerPrincipalRef, 'stale-effect-after-refresh'),
    })).rejects.toMatchObject({ code: 'connection_lease_stale' })
  })

  it('revokes and tombstones a Connection while preserving ambiguous external state as unknown', async () => {
    const setup = fixture()
    const installed = await setup.service.install({
      context: setup.context(setup.ownerAccountRef, setup.ownerPrincipalRef, 'install-revoke'),
      grantRef: 'grant:owner', expectedGrantGeneration: 1,
      providerNamespace: 'oauth/acme',
      externalState: { kind: 'known', value: 'ready' },
    })
    const lease = await setup.service.lease({
      connectionRef: installed.connectionRef,
      context: setup.context(setup.ownerAccountRef, setup.ownerPrincipalRef, 'lease-before-revoke'),
      grantRef: 'grant:owner', expectedGrantGeneration: 1,
      expiresAt: 10_000,
    })
    setup.setNow(2_000)
    const revoked = await setup.service.revoke({
      connectionRef: installed.connectionRef,
      expectedGeneration: 1,
      externalState: { kind: 'unknown', value: 'provider_timeout' },
      context: setup.context(setup.ownerAccountRef, setup.ownerPrincipalRef, 'revoke'),
      grantRef: 'grant:owner', expectedGrantGeneration: 1,
    })

    expect(revoked).toMatchObject({ lifecycle: 'revoked', generation: 2, externalState: { kind: 'unknown', value: 'provider_timeout' } })
    await expect(setup.service.beginEffect({
      leaseRef: lease.leaseRef,
      context: setup.context(setup.ownerAccountRef, setup.ownerPrincipalRef, 'effect-after-revoke'),
    })).rejects.toMatchObject({ code: 'connection_not_active' })

    setup.setNow(3_000)
    const deleted = await setup.service.delete({
      connectionRef: installed.connectionRef,
      expectedGeneration: 2,
      externalState: { kind: 'unknown', value: 'provider_timeout' },
      context: setup.context(setup.ownerAccountRef, setup.ownerPrincipalRef, 'delete'),
      grantRef: 'grant:owner', expectedGrantGeneration: 1,
    })
    expect(deleted).toMatchObject({ lifecycle: 'deleted', generation: 3, externalState: { kind: 'unknown', value: 'provider_timeout' } })
    await expect(setup.service.beginEffect({
      leaseRef: lease.leaseRef,
      context: setup.context(setup.ownerAccountRef, setup.ownerPrincipalRef, 'effect-after-delete'),
    })).rejects.toMatchObject({ code: 'connection_not_active' })
    await expect(setup.service.lease({
      connectionRef: installed.connectionRef,
      context: setup.context(setup.ownerAccountRef, setup.ownerPrincipalRef, 'lease-after-delete'),
      grantRef: 'grant:owner', expectedGrantGeneration: 1,
      expiresAt: 10_000,
    })).rejects.toMatchObject({ code: 'connection_not_active' })
  })

  it('revalidates server time and current Grant generation before every effect and makes replay one effect', async () => {
    const setup = fixture()
    const installed = await setup.service.install({
      context: setup.context(setup.ownerAccountRef, setup.ownerPrincipalRef, 'install-live-check'),
      grantRef: 'grant:owner', expectedGrantGeneration: 1,
      providerNamespace: 'oauth/acme',
      externalState: { kind: 'known', value: 'ready' },
    })
    const lease = await setup.service.lease({
      connectionRef: installed.connectionRef,
      context: setup.context(setup.ownerAccountRef, setup.ownerPrincipalRef, 'live-lease'),
      grantRef: 'grant:owner', expectedGrantGeneration: 1,
      expiresAt: 3_000,
    })
    setup.setNow(2_000)
    const effectContext = setup.context(setup.ownerAccountRef, setup.ownerPrincipalRef, 'replay-safe-effect')
    const first = await setup.service.beginEffect({ leaseRef: lease.leaseRef, context: effectContext })
    const replay = await setup.service.beginEffect({ leaseRef: lease.leaseRef, context: effectContext })
    expect(replay).toEqual(first)
    expect(setup.store.admissions).toHaveLength(1)

    setup.authority.generations.set('grant:owner', 2)
    await expect(setup.service.beginEffect({ leaseRef: lease.leaseRef, context: effectContext })).rejects.toMatchObject({ code: 'connection_grant_stale' })

    setup.authority.generations.set('grant:owner', 1)
    setup.setNow(3_000)
    await expect(setup.service.beginEffect({
      leaseRef: lease.leaseRef,
      context: setup.context(setup.ownerAccountRef, setup.ownerPrincipalRef, 'expiry-race'),
    })).rejects.toMatchObject({ code: 'connection_lease_expired' })
  })

  it('never treats provider metadata or caller-shaped share and lease proofs as provenance', async () => {
    const setup = fixture()
    const otherAccountRef = accountRef('acc_00000000000000000000000000000002')
    const otherPrincipalRef = principalRef('prn_00000000000000000000000000000002')
    const providerLocator = 'same-provider-identifier'
    const ownerConnection = await setup.service.install({
      context: setup.context(setup.ownerAccountRef, setup.ownerPrincipalRef, 'owner-install'),
      grantRef: 'grant:owner', expectedGrantGeneration: 1,
      providerNamespace: 'oauth/acme',
      providerLocator,
      externalState: { kind: 'known', value: 'ready' },
      owningAccountRef: otherAccountRef,
    } as Parameters<typeof setup.service.install>[0] & { owningAccountRef: AccountRef })
    const otherConnection = await setup.service.install({
      context: setup.context(otherAccountRef, otherPrincipalRef, 'other-install'),
      grantRef: 'grant:other', expectedGrantGeneration: 1,
      providerNamespace: 'oauth/acme',
      providerLocator,
      externalState: { kind: 'known', value: 'ready' },
    })

    expect(ownerConnection.owningAccountRef).toBe(setup.ownerAccountRef)
    expect(otherConnection.owningAccountRef).toBe(otherAccountRef)
    expect(otherConnection.connectionRef).not.toBe(ownerConnection.connectionRef)
    await expect(setup.service.lease({
      connectionRef: ownerConnection.connectionRef,
      context: setup.context(otherAccountRef, otherPrincipalRef, 'forged-share-proof'),
      grantRef: 'grant:other', expectedGrantGeneration: 1,
      expiresAt: 10_000,
      shareRef: 'csh_ffffffffffffffffffffffffffffffff',
    } as Parameters<typeof setup.service.lease>[0] & { shareRef: string })).rejects.toMatchObject({ code: 'connection_access_denied' })
    await expect(setup.service.beginEffect({
      leaseRef: 'cls_ffffffffffffffffffffffffffffffff' as ConnectionLease['leaseRef'],
      context: setup.context(setup.ownerAccountRef, setup.ownerPrincipalRef, 'forged-lease-proof'),
    })).rejects.toMatchObject({ code: 'connection_lease_not_found' })
  })
})
