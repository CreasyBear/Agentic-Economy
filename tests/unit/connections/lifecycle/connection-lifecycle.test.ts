import { describe, expect, it } from 'vitest'

import {
  ConnectionLifecycleError,
  ConnectionLifecycleService,
  connectionEffectRef,
  connectionLeaseRef,
  connectionRef,
  connectionShareRef,
  type Connection,
  type ConnectionActionAuthority,
  type ConnectionActionRequest,
  type ConnectionActionSnapshot,
  type ConnectionEffectAdmission,
  type ConnectionEffectRef,
  type ConnectionLease,
  type ConnectionLeaseRef,
  type ConnectionLifecycleErrorCode,
  type ConnectionLifecycleStore,
  type ConnectionLifecycleTransaction,
  type ConnectionRef,
  type ConnectionShare,
  type ConnectionShareRef,
} from '../../../../src/modules/connections/lifecycle/public'
import {
  accountRef,
  principalRef,
  type AccountActionContext,
  type AccountRef,
  type PrincipalRef,
} from '../../../../src/modules/principal-account/public'

class MemoryStore implements ConnectionLifecycleStore {
  readonly connections = new Map<ConnectionRef, Connection>()
  readonly shares = new Map<ConnectionShareRef, ConnectionShare>()
  readonly leases = new Map<ConnectionLeaseRef, ConnectionLease>()
  readonly admissions = new Map<ConnectionEffectRef, ConnectionEffectAdmission>()
  dropLeaseAfterFirstRead = false
  leaseReads = 0

  async transact<Result>(operation: (transaction: ConnectionLifecycleTransaction) => Promise<Result>): Promise<Result> {
    return await operation({
      getConnection: async (ref) => this.connections.get(ref),
      getConnectionByInstallIdempotency: async (account, idempotency) => this.find(this.connections, account, idempotency),
      getShare: async (ref) => this.shares.get(ref),
      getActiveShare: async (connection, account) => [...this.shares.values()].find((share) => share.connectionRef === connection && share.granteeAccountRef === account && share.lifecycle === 'active'),
      getShareByIdempotency: async (account, idempotency) => this.find(this.shares, account, idempotency),
      getLease: async (ref) => {
        this.leaseReads += 1
        if (this.dropLeaseAfterFirstRead && this.leaseReads >= 2) return undefined
        return this.leases.get(ref)
      },
      getLeaseByIdempotency: async (account, idempotency) => this.find(this.leases, account, idempotency),
      getAdmission: async (ref) => this.admissions.get(ref),
      getAdmissionByIdempotency: async (account, idempotency) => this.find(this.admissions, account, idempotency),
      insertConnection: async (connection) => { this.connections.set(connection.connectionRef, connection) },
      replaceConnection: async (connection) => { this.connections.set(connection.connectionRef, connection) },
      insertShare: async (share) => { this.shares.set(share.shareRef, share) },
      insertLease: async (lease) => { this.leases.set(lease.leaseRef, lease) },
      insertAdmission: async (admission) => { this.admissions.set(admission.effectRef, admission) },
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

class MemoryAuthority implements ConnectionActionAuthority {
  generation = 1
  expiresAt = Number.MAX_SAFE_INTEGER
  override?: (request: ConnectionActionRequest, snapshot: ConnectionActionSnapshot) => ConnectionActionSnapshot

  async withCurrentAuthority<Result>(
    request: ConnectionActionRequest,
    consequence: (snapshot: ConnectionActionSnapshot) => Promise<Result>,
  ): Promise<Result> {
    const snapshot = Object.freeze({
      actorPrincipalRef: request.context.actorPrincipalRef,
      activeAccountRef: request.context.activeAccountRef,
      grantRef: request.grantRef,
      grantGeneration: this.generation,
      grantExpiresAt: this.expiresAt,
    })
    return await consequence(this.override?.(request, snapshot) ?? snapshot)
  }
}

function uuid(suffix: number): `${string}-${string}-${string}-${string}-${string}` {
  return `00000000-0000-4000-8000-${String(suffix).padStart(12, '0')}`
}

function harness(options: Readonly<{ now?: number; uuids?: readonly string[] }> = {}) {
  const store = new MemoryStore()
  const authority = new MemoryAuthority()
  let now = options.now ?? 1_000
  let sequence = 0
  const configuredUuids = options.uuids
  const service = new ConnectionLifecycleService(store, authority, {
    now: () => now,
    randomUuid: () => {
      const index = sequence++
      return configuredUuids?.[index] ?? uuid(index + 1)
    },
  })
  const ownerAccountRef = accountRef('acc_00000000000000000000000000000001')
  const ownerPrincipalRef = principalRef('prn_00000000000000000000000000000001')
  const otherAccountRef = accountRef('acc_00000000000000000000000000000002')
  const otherPrincipalRef = principalRef('prn_00000000000000000000000000000002')
  const context = (
    operation: string,
    account: AccountRef = ownerAccountRef,
    actor: PrincipalRef = ownerPrincipalRef,
  ): AccountActionContext => ({
    activeAccountRef: account,
    actorPrincipalRef: actor,
    correlationRef: `correlation:${operation}`,
    idempotencyRef: `idempotency:${operation}`,
  })
  return {
    authority,
    context,
    otherAccountRef,
    otherPrincipalRef,
    ownerAccountRef,
    ownerPrincipalRef,
    service,
    setNow: (value: number) => { now = value },
    store,
  }
}

async function install(setup: ReturnType<typeof harness>, operation = 'install'): Promise<Connection> {
  return await setup.service.install({
    context: setup.context(operation),
    grantRef: 'grant:owner',
    providerNamespace: 'oauth/acme',
    providerLocator: 'provider-locator',
    externalState: { kind: 'known', value: 'ready' },
  })
}

async function lease(setup: ReturnType<typeof harness>, connection: Connection, operation = 'lease'): Promise<ConnectionLease> {
  return await setup.service.lease({
    connectionRef: connection.connectionRef,
    context: setup.context(operation),
    grantRef: 'grant:owner',
    expiresAt: 10_000,
  })
}

async function expectCode(promise: Promise<unknown>, code: ConnectionLifecycleErrorCode): Promise<void> {
  await expect(promise).rejects.toMatchObject({ code })
}

describe('Connection lifecycle validation and references', () => {
  it('validates stable public references and errors', () => {
    expect(connectionRef('con_00000000000000000000000000000001')).toBe('con_00000000000000000000000000000001')
    expect(connectionShareRef('csh_00000000000000000000000000000001')).toBe('csh_00000000000000000000000000000001')
    expect(connectionLeaseRef('cls_00000000000000000000000000000001')).toBe('cls_00000000000000000000000000000001')
    expect(connectionEffectRef('cef_00000000000000000000000000000001')).toBe('cef_00000000000000000000000000000001')
    expect(() => connectionRef('provider-id')).toThrowError(ConnectionLifecycleError)
    expect(() => connectionShareRef('share-id')).toThrowError(ConnectionLifecycleError)
    expect(() => connectionLeaseRef('lease-id')).toThrowError(ConnectionLifecycleError)
    expect(() => connectionEffectRef('effect-id')).toThrowError(ConnectionLifecycleError)
  })

  it('uses default server time and UUID sources when no options are supplied', async () => {
    const setup = harness()
    const service = new ConnectionLifecycleService(setup.store, setup.authority)
    const connection = await service.install({
      context: setup.context('defaults'),
      grantRef: 'grant:owner',
      providerNamespace: 'oauth/acme',
      externalState: { kind: 'known', value: 'ready' },
    })
    expect(connection.createdAt).toBeGreaterThan(0)
    expect(connection.connectionRef).toMatch(/^con_[0-9a-f]{32}$/u)
  })

  it('rejects malformed timestamps, metadata, external states, generations and UUIDs', async () => {
    const negativeTime = harness({ now: -1 })
    await expectCode(install(negativeTime), 'connection_timestamp_invalid')

    const invalidUuid = harness({ uuids: ['not-a-uuid'] })
    await expectCode(install(invalidUuid), 'connection_ref_invalid')

    for (const providerNamespace of ['', 'bad value']) {
      const setup = harness()
      await expectCode(setup.service.install({ context: setup.context('metadata'), grantRef: 'grant:owner', providerNamespace, externalState: { kind: 'known', value: 'ready' } }), 'connection_provider_metadata_invalid')
    }
    const badLocator = harness()
    await expectCode(badLocator.service.install({ context: badLocator.context('locator'), grantRef: 'grant:owner', providerNamespace: 'oauth/acme', providerLocator: '', externalState: { kind: 'known', value: 'ready' } }), 'connection_provider_metadata_invalid')

    for (const externalState of [
      { kind: 'known', value: 'new-provider-state' },
      { kind: 'unknown', value: '' },
      { kind: 'unknown', value: 'ready' },
      { kind: 'other', value: 'provider_state' },
    ]) {
      const setup = harness()
      await expectCode(setup.service.install({ context: setup.context('state'), grantRef: 'grant:owner', providerNamespace: 'oauth/acme', externalState: externalState as never }), 'connection_external_state_invalid')
    }

    const installed = await install(harness())
    const invalidGeneration = harness()
    invalidGeneration.store.connections.set(installed.connectionRef, installed)
    await expectCode(invalidGeneration.service.refresh({ connectionRef: installed.connectionRef, expectedGeneration: 0, externalState: { kind: 'known', value: 'ready' }, context: invalidGeneration.context('generation'), grantRef: 'grant:owner' }), 'connection_generation_stale')
  })
})

describe('Connection install and authority provenance', () => {
  it('replays an identical install but rejects every conflicting replay dimension', async () => {
    const setup = harness()
    const firstInput = { context: setup.context('install-replay'), grantRef: 'grant:owner', providerNamespace: 'oauth/acme', providerLocator: 'provider-locator', externalState: { kind: 'known', value: 'ready' } as const }
    const first = await setup.service.install(firstInput)
    await expect(setup.service.install(firstInput)).resolves.toBe(first)
    await expectCode(setup.service.install({ ...firstInput, providerNamespace: 'oauth/other' }), 'connection_idempotency_conflict')
    await expectCode(setup.service.install({ ...firstInput, providerLocator: 'other' }), 'connection_idempotency_conflict')
    await expectCode(setup.service.install({ ...firstInput, externalState: { kind: 'known', value: 'unavailable' } }), 'connection_idempotency_conflict')
  })

  it('detects generated Connection reference collisions and accepts omitted provider locator', async () => {
    const setup = harness({ uuids: [uuid(1), uuid(1)] })
    const first = await install(setup, 'first')
    expect(first.providerLocator).toBe('provider-locator')
    await expectCode(setup.service.install({ context: setup.context('second'), grantRef: 'grant:owner', providerNamespace: 'oauth/acme', externalState: { kind: 'known', value: 'ready' } }), 'connection_ref_conflict')
  })

  it('does not let another actor or Grant reuse an Account-scoped idempotency key', async () => {
    const setup = harness()
    const context = setup.context('authority-bound-replay')
    await setup.service.install({ context, grantRef: 'grant:owner', providerNamespace: 'oauth/acme', externalState: { kind: 'known', value: 'ready' } })
    await expectCode(setup.service.install({ context: { ...context, actorPrincipalRef: setup.otherPrincipalRef }, grantRef: 'grant:owner', providerNamespace: 'oauth/acme', externalState: { kind: 'known', value: 'ready' } }), 'connection_idempotency_conflict')
    await expectCode(setup.service.install({ context, grantRef: 'grant:other', providerNamespace: 'oauth/acme', externalState: { kind: 'known', value: 'ready' } }), 'connection_idempotency_conflict')
    setup.authority.generation = 2
    await expectCode(setup.service.install({ context, grantRef: 'grant:owner', providerNamespace: 'oauth/acme', externalState: { kind: 'known', value: 'ready' } }), 'connection_idempotency_conflict')
  })

  it('rejects forged authority snapshots, invalid authority fields and strict Grant expiry', async () => {
    const cases: readonly Readonly<{
      mutate: (setup: ReturnType<typeof harness>, snapshot: ConnectionActionSnapshot) => ConnectionActionSnapshot
      code: ConnectionLifecycleErrorCode
    }>[] = [
      { mutate: (setup, snapshot) => ({ ...snapshot, actorPrincipalRef: setup.otherPrincipalRef }), code: 'connection_authority_invalid' },
      { mutate: (setup, snapshot) => ({ ...snapshot, activeAccountRef: setup.otherAccountRef }), code: 'connection_authority_invalid' },
      { mutate: (_setup, snapshot) => ({ ...snapshot, grantRef: 'grant:forged' }), code: 'connection_authority_invalid' },
      { mutate: (_setup, snapshot) => ({ ...snapshot, grantGeneration: 0 }), code: 'connection_authority_invalid' },
      { mutate: (_setup, snapshot) => ({ ...snapshot, grantExpiresAt: -1 }), code: 'connection_timestamp_invalid' },
      { mutate: (_setup, snapshot) => ({ ...snapshot, grantExpiresAt: 1_000 }), code: 'connection_grant_expired' },
    ]
    for (const testCase of cases) {
      const setup = harness()
      setup.authority.override = (_request, snapshot) => testCase.mutate(setup, snapshot)
      await expectCode(install(setup), testCase.code)
    }

    const invalidContext = harness()
    await expectCode(invalidContext.service.install({ context: { ...invalidContext.context('bad-context'), correlationRef: '' }, grantRef: 'grant:owner', providerNamespace: 'oauth/acme', externalState: { kind: 'known', value: 'ready' } }), 'connection_authority_invalid')
    await expectCode(invalidContext.service.install({ context: invalidContext.context('bad-grant'), grantRef: '', providerNamespace: 'oauth/acme', externalState: { kind: 'known', value: 'ready' } }), 'connection_authority_invalid')
  })
})

describe('Connection sharing and leasing', () => {
  it('rejects missing, inactive, wrong-owner and self shares', async () => {
    const setup = harness()
    const missing = connectionRef('con_ffffffffffffffffffffffffffffffff')
    await expectCode(setup.service.share({ connectionRef: missing, granteeAccountRef: setup.otherAccountRef, context: setup.context('missing'), grantRef: 'grant:owner' }), 'connection_not_found')
    const connection = await install(setup)
    setup.store.connections.set(connection.connectionRef, { ...connection, lifecycle: 'revoked' })
    await expectCode(setup.service.share({ connectionRef: connection.connectionRef, granteeAccountRef: setup.otherAccountRef, context: setup.context('inactive'), grantRef: 'grant:owner' }), 'connection_not_active')
    setup.store.connections.set(connection.connectionRef, connection)
    await expectCode(setup.service.share({ connectionRef: connection.connectionRef, granteeAccountRef: setup.otherAccountRef, context: setup.context('wrong-owner', setup.otherAccountRef, setup.otherPrincipalRef), grantRef: 'grant:other' }), 'connection_access_denied')
    await expectCode(setup.service.share({ connectionRef: connection.connectionRef, granteeAccountRef: setup.ownerAccountRef, context: setup.context('self'), grantRef: 'grant:owner' }), 'connection_access_denied')
  })

  it('replays, deduplicates and collision-checks explicit shares', async () => {
    const setup = harness({ uuids: [uuid(1), uuid(2), uuid(2)] })
    const connection = await install(setup)
    const input = { connectionRef: connection.connectionRef, granteeAccountRef: setup.otherAccountRef, context: setup.context('share'), grantRef: 'grant:owner' }
    const shared = await setup.service.share(input)
    await expect(setup.service.share(input)).resolves.toBe(shared)
    await expectCode(setup.service.share({ ...input, granteeAccountRef: accountRef('acc_00000000000000000000000000000003') }), 'connection_idempotency_conflict')
    await expect(setup.service.share({ ...input, context: setup.context('dedupe') })).resolves.toBe(shared)
    setup.store.shares.set(shared.shareRef, { ...shared, granteeAccountRef: accountRef('acc_00000000000000000000000000000003') })
    await expectCode(setup.service.share({ ...input, context: setup.context('collision') }), 'connection_share_ref_conflict')
  })

  it('keeps explicit Account sharing live across refresh while invalidating old leases', async () => {
    const setup = harness()
    const connection = await install(setup)
    await setup.service.share({
      connectionRef: connection.connectionRef,
      granteeAccountRef: setup.otherAccountRef,
      context: setup.context('share-before-refresh'),
      grantRef: 'grant:owner',
    })
    const refreshed = await setup.service.refresh({
      connectionRef: connection.connectionRef,
      expectedGeneration: 1,
      externalState: { kind: 'known', value: 'ready' },
      context: setup.context('refresh-after-share'),
      grantRef: 'grant:owner',
    })

    await expect(setup.service.lease({
      connectionRef: refreshed.connectionRef,
      context: setup.context('shared-after-refresh', setup.otherAccountRef, setup.otherPrincipalRef),
      grantRef: 'grant:other',
      expiresAt: 10_000,
    })).resolves.toMatchObject({ activeAccountRef: setup.otherAccountRef, connectionGeneration: 2 })
  })

  it('rejects unusable, inaccessible, expired, conflicting and colliding leases', async () => {
    const setup = harness({ uuids: [uuid(1), uuid(2), uuid(2)] })
    setup.authority.expiresAt = 100_000
    const connection = await install(setup)
    await expectCode(setup.service.lease({ connectionRef: connection.connectionRef, context: setup.context('expired-now'), grantRef: 'grant:owner', expiresAt: 1_000 }), 'connection_lease_expired')
    await expectCode(setup.service.lease({ connectionRef: connection.connectionRef, context: setup.context('after-grant'), grantRef: 'grant:owner', expiresAt: 100_001 }), 'connection_lease_expired')
    setup.store.connections.set(connection.connectionRef, { ...connection, externalState: { kind: 'unknown', value: 'timeout' } })
    await expectCode(setup.service.lease({ connectionRef: connection.connectionRef, context: setup.context('unknown'), grantRef: 'grant:owner', expiresAt: 10_000 }), 'connection_external_state_untrusted')
    setup.store.connections.set(connection.connectionRef, { ...connection, externalState: { kind: 'known', value: 'unavailable' } })
    await expectCode(setup.service.lease({ connectionRef: connection.connectionRef, context: setup.context('unavailable'), grantRef: 'grant:owner', expiresAt: 10_000 }), 'connection_external_state_untrusted')
    setup.store.connections.set(connection.connectionRef, connection)
    await expectCode(setup.service.lease({ connectionRef: connection.connectionRef, context: setup.context('stranger', setup.otherAccountRef, setup.otherPrincipalRef), grantRef: 'grant:other', expiresAt: 10_000 }), 'connection_access_denied')

    const input = { connectionRef: connection.connectionRef, context: setup.context('lease-replay'), grantRef: 'grant:owner', expiresAt: 10_000 }
    const first = await setup.service.lease(input)
    await expect(setup.service.lease(input)).resolves.toBe(first)
    await expectCode(setup.service.lease({ ...input, expiresAt: 9_000 }), 'connection_idempotency_conflict')
    setup.store.leases.set(first.leaseRef, { ...first, activeAccountRef: setup.otherAccountRef, action: { ...first.action, activeAccountRef: setup.otherAccountRef } })
    await expectCode(setup.service.lease({ ...input, context: setup.context('lease-collision') }), 'connection_lease_ref_conflict')
  })
})

describe('Connection generation transitions and effect admission', () => {
  it('rejects refresh by the wrong Account, inactive state, stale generation and backwards server time', async () => {
    const setup = harness()
    const connection = await install(setup)
    const base = { connectionRef: connection.connectionRef, expectedGeneration: 1, externalState: { kind: 'known', value: 'ready' } as const, grantRef: 'grant:owner' }
    await expectCode(setup.service.refresh({ ...base, context: setup.context('wrong', setup.otherAccountRef, setup.otherPrincipalRef) }), 'connection_access_denied')
    setup.store.connections.set(connection.connectionRef, { ...connection, lifecycle: 'revoked' })
    await expectCode(setup.service.refresh({ ...base, context: setup.context('inactive') }), 'connection_not_active')
    setup.store.connections.set(connection.connectionRef, connection)
    await expectCode(setup.service.refresh({ ...base, expectedGeneration: 2, context: setup.context('stale') }), 'connection_generation_stale')
    setup.store.connections.set(connection.connectionRef, { ...connection, updatedAt: 2_000 })
    await expectCode(setup.service.refresh({ ...base, context: setup.context('backwards') }), 'connection_timestamp_invalid')
  })

  it('replays only an identical refresh and rejects action-idempotency conflicts', async () => {
    const setup = harness()
    const connection = await install(setup)
    const input = { connectionRef: connection.connectionRef, expectedGeneration: 1, externalState: { kind: 'unknown', value: 'provider_timeout' } as const, context: setup.context('refresh'), grantRef: 'grant:owner' }
    const refreshed = await setup.service.refresh(input)
    await expect(setup.service.refresh(input)).resolves.toBe(refreshed)
    await expectCode(setup.service.refresh({ ...input, externalState: { kind: 'unknown', value: 'different' } }), 'connection_idempotency_conflict')
  })

  it('guards revoke/delete ownership, lifecycle, generation, time and replay', async () => {
    const setup = harness()
    const connection = await install(setup)
    const base = { connectionRef: connection.connectionRef, expectedGeneration: 1, externalState: { kind: 'known', value: 'revoked' } as const, grantRef: 'grant:owner' }
    await expectCode(setup.service.revoke({ ...base, context: setup.context('wrong', setup.otherAccountRef, setup.otherPrincipalRef) }), 'connection_access_denied')
    await expectCode(setup.service.revoke({ ...base, expectedGeneration: 2, context: setup.context('stale') }), 'connection_generation_stale')
    setup.store.connections.set(connection.connectionRef, { ...connection, updatedAt: 2_000 })
    await expectCode(setup.service.revoke({ ...base, context: setup.context('backwards') }), 'connection_timestamp_invalid')
    setup.store.connections.set(connection.connectionRef, connection)

    const revokeInput = { ...base, context: setup.context('revoke') }
    const revoked = await setup.service.revoke(revokeInput)
    await expect(setup.service.revoke(revokeInput)).resolves.toBe(revoked)
    await expectCode(setup.service.revoke({ ...revokeInput, externalState: { kind: 'unknown', value: 'timeout' } }), 'connection_idempotency_conflict')
    await expectCode(setup.service.revoke({ ...base, expectedGeneration: 2, context: setup.context('already-revoked') }), 'connection_not_active')

    const deleteInput = { ...base, expectedGeneration: 2, externalState: { kind: 'known', value: 'deleted' } as const, context: setup.context('delete') }
    const deleted = await setup.service.delete(deleteInput)
    await expect(setup.service.delete(deleteInput)).resolves.toBe(deleted)
    await expectCode(setup.service.delete({ ...deleteInput, externalState: { kind: 'unknown', value: 'timeout' } }), 'connection_idempotency_conflict')
    await expectCode(setup.service.delete({ ...deleteInput, expectedGeneration: 3, context: setup.context('already-deleted') }), 'connection_not_active')
  })

  it('rejects missing, raced, expired, stale, wrong-context, stale-Grant and conflicting effect proofs', async () => {
    const setup = harness()
    const connection = await install(setup)
    const activeLease = await lease(setup, connection)
    const missingLease = connectionLeaseRef('cls_ffffffffffffffffffffffffffffffff')
    await expectCode(setup.service.beginEffect({ leaseRef: missingLease, context: setup.context('missing') }), 'connection_lease_not_found')

    setup.store.dropLeaseAfterFirstRead = true
    setup.store.leaseReads = 0
    await expectCode(setup.service.beginEffect({ leaseRef: activeLease.leaseRef, context: setup.context('raced') }), 'connection_lease_not_found')
    setup.store.dropLeaseAfterFirstRead = false
    setup.store.leaseReads = 0

    setup.setNow(10_000)
    await expectCode(setup.service.beginEffect({ leaseRef: activeLease.leaseRef, context: setup.context('expired') }), 'connection_lease_expired')
    setup.setNow(1_000)
    setup.store.leases.set(activeLease.leaseRef, { ...activeLease, connectionGeneration: 2 })
    await expectCode(setup.service.beginEffect({ leaseRef: activeLease.leaseRef, context: setup.context('generation') }), 'connection_lease_stale')
    setup.store.leases.set(activeLease.leaseRef, { ...activeLease, owningAccountRef: setup.otherAccountRef })
    await expectCode(setup.service.beginEffect({ leaseRef: activeLease.leaseRef, context: setup.context('owner') }), 'connection_lease_stale')
    setup.store.leases.set(activeLease.leaseRef, activeLease)
    await expectCode(setup.service.beginEffect({ leaseRef: activeLease.leaseRef, context: setup.context('wrong-account', setup.otherAccountRef, setup.otherPrincipalRef) }), 'connection_access_denied')
    setup.authority.generation = 2
    await expectCode(setup.service.beginEffect({ leaseRef: activeLease.leaseRef, context: setup.context('grant') }), 'connection_grant_stale')
    setup.authority.generation = 1

    const first = await setup.service.beginEffect({ leaseRef: activeLease.leaseRef, context: setup.context('effect') })
    const otherLease = { ...activeLease, leaseRef: connectionLeaseRef('cls_eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee') }
    setup.store.leases.set(otherLease.leaseRef, otherLease)
    await expectCode(setup.service.beginEffect({ leaseRef: otherLease.leaseRef, context: setup.context('effect') }), 'connection_idempotency_conflict')
    await expect(setup.service.beginEffect({ leaseRef: activeLease.leaseRef, context: setup.context('effect') })).resolves.toBe(first)
  })

  it('detects effect reference collisions', async () => {
    const setup = harness({ uuids: [uuid(1), uuid(2), uuid(3)] })
    const connection = await install(setup)
    const activeLease = await lease(setup, connection)
    const collidingRef = 'cef_00000000000040008000000000000003' as ConnectionEffectRef
    setup.store.admissions.set(collidingRef, {
      effectRef: collidingRef,
      leaseRef: activeLease.leaseRef,
      connectionRef: connection.connectionRef,
      connectionGeneration: 1,
      owningAccountRef: setup.ownerAccountRef,
      activeAccountRef: setup.ownerAccountRef,
      actorPrincipalRef: setup.ownerPrincipalRef,
      grantRef: 'grant:owner',
      grantGeneration: 1,
      admittedAt: 1,
      action: connection.action,
    })
    await expectCode(setup.service.beginEffect({ leaseRef: activeLease.leaseRef, context: setup.context('collision') }), 'connection_effect_ref_conflict')
  })
})
