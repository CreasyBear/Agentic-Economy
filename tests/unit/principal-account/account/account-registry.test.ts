import { describe, expect, it } from 'vitest'

import {
  ACCOUNT_LIFECYCLES,
  MEMBERSHIP_LIFECYCLES,
  OWNERSHIP_LIFECYCLES,
  AccountRegistry,
  AccountRegistryError,
  accountActionContextValue,
  accountLifecycleValue,
  accountOwnershipValue,
  accountRef,
  accountTables,
  accountValue,
  generateAccountRef,
  generateMembershipRef,
  generateOwnershipRef,
  membershipLifecycleValue,
  membershipRef,
  membershipValue,
  ownershipChangeKindValue,
  ownershipLifecycleValue,
  ownershipRef,
  recoveryPolicyValue,
  type Account,
  type AccountActionContext,
  type AccountOwnership,
  type AccountRef,
  type AccountRegistryCommit,
  type AccountRegistryStore,
  type AccountRegistryTransaction,
  type Membership,
  type MembershipRef,
  type OwnershipRef,
  type RecoveryPolicy,
  type SuccessionAuthorization,
} from '../../../../src/modules/principal-account/account/public'
import {
  principalRef,
  type Principal,
  type PrincipalKind,
  type PrincipalLifecycle,
  type PrincipalRef,
} from '../../../../src/modules/principal-account/principal/public'

class MemoryAccountStore implements AccountRegistryStore {
  readonly principals = new Map<PrincipalRef, Principal>()
  readonly accounts = new Map<AccountRef, Account>()
  readonly ownerships = new Map<OwnershipRef, AccountOwnership>()
  readonly memberships = new Map<MembershipRef, Membership>()
  readonly commits: AccountRegistryCommit[] = []

  async transact<Result>(operation: (transaction: AccountRegistryTransaction) => Promise<Result>): Promise<Result> {
    return await operation({
      getPrincipal: async (ref) => this.principals.get(ref),
      getAccount: async (ref) => this.accounts.get(ref),
      getAccountByCreationIdempotency: async (actor, idempotency) => [...this.accounts.values()].find(
        (account) => account.creationActorPrincipalRef === actor && account.creationIdempotencyRef === idempotency,
      ),
      getOwnership: async (ref) => this.ownerships.get(ref),
      getMembership: async (ref) => this.memberships.get(ref),
      getActiveMembership: async (account, principal) => [...this.memberships.values()].find(
        (membership) => membership.accountRef === account
          && membership.memberPrincipalRef === principal
          && membership.lifecycle === 'active',
      ),
      commit: async (change) => {
        this.assertCommit(change)
        this.commits.push(change)
        if (change.accountInsert !== undefined) this.accounts.set(change.accountInsert.accountRef, change.accountInsert)
        if (change.accountReplacement !== undefined) {
          this.accounts.set(change.accountReplacement.value.accountRef, change.accountReplacement.value)
        }
        for (const ownership of change.ownershipInserts ?? []) this.ownerships.set(ownership.ownershipRef, ownership)
        for (const replacement of change.ownershipReplacements ?? []) {
          this.ownerships.set(replacement.value.ownershipRef, replacement.value)
        }
        for (const membership of change.membershipInserts ?? []) this.memberships.set(membership.membershipRef, membership)
        for (const replacement of change.membershipReplacements ?? []) {
          this.memberships.set(replacement.value.membershipRef, replacement.value)
        }
      },
    })
  }

  seedPrincipal(
    suffix: string,
    kind: PrincipalKind = 'human',
    lifecycle: PrincipalLifecycle = 'active',
  ): PrincipalRef {
    const ref = principalRef(`prn_${suffix.padStart(32, '0')}`)
    this.principals.set(ref, Object.freeze({
      principalRef: ref,
      kind,
      displayName: `${kind}-${suffix}`,
      lifecycle,
      revision: 1,
      createdAt: 1,
      updatedAt: 1,
    }))
    return ref
  }

  private assertCommit(change: AccountRegistryCommit): void {
    if (change.accountInsert !== undefined && this.accounts.has(change.accountInsert.accountRef)) {
      throw new Error('test_account_insert_conflict')
    }
    if (change.accountReplacement !== undefined) {
      expect(this.accounts.get(change.accountReplacement.value.accountRef)?.revision)
        .toBe(change.accountReplacement.expectedRevision)
    }
    for (const ownership of change.ownershipInserts ?? []) {
      if (this.ownerships.has(ownership.ownershipRef)) throw new Error('test_ownership_insert_conflict')
    }
    for (const replacement of change.ownershipReplacements ?? []) {
      expect(this.ownerships.get(replacement.value.ownershipRef)?.revision).toBe(replacement.expectedRevision)
    }
    for (const membership of change.membershipInserts ?? []) {
      if (this.memberships.has(membership.membershipRef)) throw new Error('test_membership_insert_conflict')
    }
    for (const replacement of change.membershipReplacements ?? []) {
      expect(this.memberships.get(replacement.value.membershipRef)?.revision).toBe(replacement.expectedRevision)
    }
  }
}

const uuid = (suffix: number): string => `00000000-0000-4000-8000-${String(suffix).padStart(12, '0')}`

function setup(options: Readonly<{
  times?: readonly number[]
  uuids?: readonly string[]
}> = {}): Readonly<{
  registry: AccountRegistry
  store: MemoryAccountStore
  nextContext(account: AccountRef, actor: PrincipalRef, suffix?: string): AccountActionContext
}> {
  const store = new MemoryAccountStore()
  const times = [...(options.times ?? [100])]
  const uuids = [...(options.uuids ?? Array.from({ length: 20 }, (_, index) => uuid(index + 1)))]
  let timeIndex = 0
  let uuidIndex = 0
  return {
    registry: new AccountRegistry(store, {
      now: () => times[Math.min(timeIndex++, times.length - 1)] ?? -1,
      randomUuid: () => uuids[Math.min(uuidIndex++, uuids.length - 1)] ?? '',
    }),
    store,
    nextContext: (account, actor, suffix = '1') => ({
      actorPrincipalRef: actor,
      activeAccountRef: account,
      correlationRef: `correlation:${suffix}`,
      idempotencyRef: `idempotency:${suffix}`,
    }),
  }
}

async function createAccount(
  fixture: ReturnType<typeof setup>,
  ownerKind: PrincipalKind = 'human',
  recoveryPolicy: RecoveryPolicy = { kind: 'threshold', threshold: 2, participantCount: 3, delayMs: 5, freezeRequired: true, revision: 1 },
): Promise<Readonly<{ account: Account; ownership: AccountOwnership; owner: PrincipalRef }>> {
  const owner = fixture.store.seedPrincipal(String(fixture.store.principals.size + 1), ownerKind)
  const created = await fixture.registry.create({
    ownerPrincipalRef: owner,
    displayName: '  Primary tenancy  ',
    recoveryPolicy,
    correlationRef: 'correlation:create',
    idempotencyRef: 'idempotency:create',
  })
  return { ...created, owner }
}

async function activateAccount(
  fixture: ReturnType<typeof setup>,
  created: Awaited<ReturnType<typeof createAccount>>,
): Promise<Account> {
  return await fixture.registry.activate({
    accountRef: created.account.accountRef,
    expectedRevision: created.account.revision,
    context: fixture.nextContext(created.account.accountRef, created.owner, 'activate'),
  })
}

async function expectCode(promise: Promise<unknown>, code: string): Promise<void> {
  await expect(promise).rejects.toMatchObject({ name: 'AccountRegistryError', message: code, code })
}

describe('Account registry contract', () => {
  it('exports canonical constants, Convex validators and table fragments', () => {
    expect(ACCOUNT_LIFECYCLES).toEqual(['pending_activation', 'active', 'suspended', 'closed'])
    expect(OWNERSHIP_LIFECYCLES).toEqual(['active', 'ended'])
    expect(MEMBERSHIP_LIFECYCLES).toEqual(['active', 'ended'])
    expect([
      accountActionContextValue,
      accountLifecycleValue,
      accountOwnershipValue,
      accountValue,
      membershipLifecycleValue,
      membershipValue,
      ownershipChangeKindValue,
      ownershipLifecycleValue,
      recoveryPolicyValue,
      accountTables.accounts,
      accountTables.accountOwnerships,
      accountTables.memberships,
    ].every((value) => value !== undefined)).toBe(true)
  })

  it('parses and generates opaque stable references independently of providers and credentials', () => {
    expect(accountRef('acc_00000000000040008000000000000001')).toBe('acc_00000000000040008000000000000001')
    expect(ownershipRef('own_00000000000040008000000000000001')).toBe('own_00000000000040008000000000000001')
    expect(membershipRef('mem_00000000000040008000000000000001')).toBe('mem_00000000000040008000000000000001')
    expect(generateAccountRef(() => uuid(1))).toBe('acc_00000000000040008000000000000001')
    expect(generateOwnershipRef(() => uuid(2))).toBe('own_00000000000040008000000000000002')
    expect(generateMembershipRef(() => uuid(3))).toBe('mem_00000000000040008000000000000003')
    expect(generateAccountRef()).toMatch(/^acc_[0-9a-f]{32}$/u)
    expect(generateOwnershipRef()).toMatch(/^own_[0-9a-f]{32}$/u)
    expect(generateMembershipRef()).toMatch(/^mem_[0-9a-f]{32}$/u)
    expect(() => accountRef('clerk:user_1')).toThrowError(AccountRegistryError)
    expect(() => ownershipRef('provider:owner')).toThrowError(/ownership_ref_invalid/u)
    expect(() => membershipRef('credential:member')).toThrowError(/membership_ref_invalid/u)
    expect(() => generateAccountRef(() => 'invalid')).toThrowError(/account_ref_invalid/u)
    expect(() => generateOwnershipRef(() => 'invalid')).toThrowError(/ownership_ref_invalid/u)
    expect(() => generateMembershipRef(() => 'invalid')).toThrowError(/membership_ref_invalid/u)
  })

  it('creates a pending Account and a distinct active ownership fact for every Principal kind including agents', async () => {
    for (const kind of ['human', 'organization', 'agent', 'workload'] as const) {
      const fixture = setup()
      const created = await createAccount(fixture, kind)
      expect(created.account).toMatchObject({
        displayName: 'Primary tenancy',
        lifecycle: 'pending_activation',
        revision: 1,
        currentOwnershipRef: created.ownership.ownershipRef,
      })
      expect(created.ownership).toMatchObject({
        accountRef: created.account.accountRef,
        ownerPrincipalRef: created.owner,
        lifecycle: 'active',
        changeKind: 'creation',
        revision: 1,
      })
      expect(fixture.store.memberships.size).toBe(0)
      expect(Object.isFrozen(created.account)).toBe(true)
      expect(Object.isFrozen(created.account.recoveryPolicy)).toBe(true)
      expect(Object.isFrozen(created.account.lastAction)).toBe(true)
      expect(Object.isFrozen(created.ownership)).toBe(true)
      await expect(fixture.registry.getAccount(created.account.accountRef)).resolves.toBe(created.account)
      await expect(fixture.registry.getOwnership(created.ownership.ownershipRef)).resolves.toBe(created.ownership)
    }
  })

  it('supports an explicit no-transfer recovery declaration without granting recovery authority', async () => {
    const fixture = setup()
    const created = await createAccount(fixture, 'agent', { kind: 'no_transfer', revision: 4 })
    expect(created.account.recoveryPolicy).toEqual({ kind: 'no_transfer', revision: 4 })
  })

  it('replays Account creation idempotently and rejects reuse with a different payload', async () => {
    const fixture = setup()
    const created = await createAccount(fixture)
    const commitsBeforeReplay = fixture.store.commits.length
    const replay = await fixture.registry.create({
      ownerPrincipalRef: created.owner,
      displayName: 'Primary tenancy',
      recoveryPolicy: { kind: 'threshold', threshold: 2, participantCount: 3, delayMs: 5, freezeRequired: true, revision: 1 },
      correlationRef: 'correlation:retry',
      idempotencyRef: 'idempotency:create',
    })
    expect(replay).toEqual({ account: created.account, ownership: created.ownership })
    expect(fixture.store.commits).toHaveLength(commitsBeforeReplay)
    await expectCode(fixture.registry.create({
      ownerPrincipalRef: created.owner,
      displayName: 'Different name',
      recoveryPolicy: created.account.recoveryPolicy,
      correlationRef: 'correlation:retry',
      idempotencyRef: 'idempotency:create',
    }), 'account_idempotency_conflict')
    await expectCode(fixture.registry.create({
      ownerPrincipalRef: created.owner,
      displayName: 'Primary tenancy',
      recoveryPolicy: { kind: 'no_transfer', revision: 1 },
      correlationRef: 'correlation:retry',
      idempotencyRef: 'idempotency:create',
    }), 'account_idempotency_conflict')

    const noTransfer = setup()
    const declared = await createAccount(noTransfer, 'human', { kind: 'no_transfer', revision: 4 })
    await expect(noTransfer.registry.create({
      ownerPrincipalRef: declared.owner,
      displayName: 'Primary tenancy',
      recoveryPolicy: { kind: 'no_transfer', revision: 4 },
      correlationRef: 'correlation:retry',
      idempotencyRef: 'idempotency:create',
    })).resolves.toEqual({ account: declared.account, ownership: declared.ownership })
  })

  it('fails closed when an idempotent creation replay finds corrupt initial ownership', async () => {
    const missing = setup()
    const missingCreated = await createAccount(missing)
    missing.store.ownerships.delete(missingCreated.ownership.ownershipRef)
    await expectCode(missing.registry.create({ ownerPrincipalRef: missingCreated.owner, displayName: 'Primary tenancy', recoveryPolicy: missingCreated.account.recoveryPolicy, correlationRef: 'correlation:retry', idempotencyRef: 'idempotency:create' }), 'ownership_not_found')

    const mismatched = setup()
    const mismatchedCreated = await createAccount(mismatched)
    mismatched.store.ownerships.set(mismatchedCreated.ownership.ownershipRef, Object.freeze({ ...mismatchedCreated.ownership, accountRef: accountRef('acc_ffffffffffffffffffffffffffffffff') }))
    await expectCode(mismatched.registry.create({ ownerPrincipalRef: mismatchedCreated.owner, displayName: 'Primary tenancy', recoveryPolicy: mismatchedCreated.account.recoveryPolicy, correlationRef: 'correlation:retry', idempotencyRef: 'idempotency:create' }), 'ownership_account_mismatch')
  })

  it('rejects invalid creation data and non-active or absent owner Principals', async () => {
    const invalidCases: readonly [string, RecoveryPolicy][] = [
      ['zero revision', { kind: 'no_transfer', revision: 0 }],
      ['zero threshold', { kind: 'threshold', threshold: 0, participantCount: 1, delayMs: 0, freezeRequired: true, revision: 1 }],
      ['fractional threshold', { kind: 'threshold', threshold: 1.5, participantCount: 2, delayMs: 0, freezeRequired: true, revision: 1 }],
      ['fractional participants', { kind: 'threshold', threshold: 1, participantCount: 1.5, delayMs: 0, freezeRequired: true, revision: 1 }],
      ['too few participants', { kind: 'threshold', threshold: 2, participantCount: 1, delayMs: 0, freezeRequired: true, revision: 1 }],
      ['fractional delay', { kind: 'threshold', threshold: 1, participantCount: 1, delayMs: 0.5, freezeRequired: true, revision: 1 }],
      ['negative delay', { kind: 'threshold', threshold: 1, participantCount: 1, delayMs: -1, freezeRequired: true, revision: 1 }],
      ['false freeze', { kind: 'threshold', threshold: 1, participantCount: 1, delayMs: 0, freezeRequired: false as true, revision: 1 }],
      ['invalid revision', { kind: 'threshold', threshold: 1, participantCount: 1, delayMs: 0, freezeRequired: true, revision: Number.NaN }],
      ['invalid kind', { kind: 'unknown' } as never],
    ]
    for (const [, policy] of invalidCases) {
      const fixture = setup()
      const owner = fixture.store.seedPrincipal('1')
      await expectCode(fixture.registry.create({ ownerPrincipalRef: owner, displayName: 'Account', recoveryPolicy: policy, correlationRef: 'correlation:1', idempotencyRef: 'idempotency:1' }), 'recovery_policy_invalid')
    }

    const invalidName = setup()
    const owner = invalidName.store.seedPrincipal('1')
    for (const displayName of ['', 'a'.repeat(201), 'line\nbreak']) {
      await expectCode(invalidName.registry.create({ ownerPrincipalRef: owner, displayName, recoveryPolicy: { kind: 'no_transfer', revision: 1 }, correlationRef: 'correlation:1', idempotencyRef: 'idempotency:1' }), 'account_display_name_invalid')
    }
    const negativeTime = setup({ times: [-1] })
    const negativeTimeOwner = negativeTime.store.seedPrincipal('1')
    await expectCode(negativeTime.registry.create({ ownerPrincipalRef: negativeTimeOwner, displayName: 'Account', recoveryPolicy: { kind: 'no_transfer', revision: 1 }, correlationRef: 'correlation:1', idempotencyRef: 'idempotency:1' }), 'account_timestamp_invalid')
    const invalidTime = setup({ times: [Number.NaN] })
    const invalidTimeOwner = invalidTime.store.seedPrincipal('1')
    await expectCode(invalidTime.registry.create({ ownerPrincipalRef: invalidTimeOwner, displayName: 'Account', recoveryPolicy: { kind: 'no_transfer', revision: 1 }, correlationRef: 'correlation:1', idempotencyRef: 'idempotency:1' }), 'account_timestamp_invalid')

    const absent = setup()
    await expectCode(absent.registry.create({ ownerPrincipalRef: principalRef('prn_ffffffffffffffffffffffffffffffff'), displayName: 'Account', recoveryPolicy: { kind: 'no_transfer', revision: 1 }, correlationRef: 'correlation:1', idempotencyRef: 'idempotency:1' }), 'principal_not_found')
    const inactive = setup()
    const suspended = inactive.store.seedPrincipal('1', 'human', 'suspended')
    await expectCode(inactive.registry.create({ ownerPrincipalRef: suspended, displayName: 'Account', recoveryPolicy: { kind: 'no_transfer', revision: 1 }, correlationRef: 'correlation:1', idempotencyRef: 'idempotency:1' }), 'principal_inactive')
  })

  it('rejects malformed action attribution before writes', async () => {
    const fixture = setup()
    const owner = fixture.store.seedPrincipal('1')
    const base = { ownerPrincipalRef: owner, displayName: 'Account', recoveryPolicy: { kind: 'no_transfer', revision: 1 } as const }
    await expectCode(fixture.registry.create({ ...base, correlationRef: '', idempotencyRef: 'idempotency:1' }), 'correlation_ref_invalid')
    await expectCode(fixture.registry.create({ ...base, correlationRef: 'correlation:1', idempotencyRef: 'has space' }), 'account_idempotency_ref_invalid')
    await expectCode(fixture.registry.create({ ...base, correlationRef: 'a'.repeat(201), idempotencyRef: 'idempotency:1' }), 'correlation_ref_invalid')
  })

  it('rejects generated Account and ownership collisions before an atomic insert', async () => {
    const collisionUuid = uuid(1)
    const accountCollision = setup({ uuids: [collisionUuid, uuid(2)] })
    const owner = accountCollision.store.seedPrincipal('1')
    accountCollision.store.accounts.set(accountRef('acc_00000000000040008000000000000001'), {} as Account)
    await expectCode(accountCollision.registry.create({ ownerPrincipalRef: owner, displayName: 'Account', recoveryPolicy: { kind: 'no_transfer', revision: 1 }, correlationRef: 'correlation:1', idempotencyRef: 'idempotency:1' }), 'account_ref_conflict')
    expect(accountCollision.store.commits).toHaveLength(0)

    const ownershipCollision = setup({ uuids: [uuid(1), uuid(2)] })
    const secondOwner = ownershipCollision.store.seedPrincipal('1')
    ownershipCollision.store.ownerships.set(ownershipRef('own_00000000000040008000000000000002'), {} as AccountOwnership)
    await expectCode(ownershipCollision.registry.create({ ownerPrincipalRef: secondOwner, displayName: 'Account', recoveryPolicy: { kind: 'no_transfer', revision: 1 }, correlationRef: 'correlation:1', idempotencyRef: 'idempotency:1' }), 'ownership_ref_conflict')
    expect(ownershipCollision.store.commits).toHaveLength(0)
  })

  it('enforces the complete Account lifecycle graph and closes ownership atomically', async () => {
    const fixture = setup({ times: [10, 20, 30, 40, 50] })
    const created = await createAccount(fixture)
    const activateContext = fixture.nextContext(created.account.accountRef, created.owner, 'activate')
    const active = await fixture.registry.activate({ accountRef: created.account.accountRef, expectedRevision: 1, context: activateContext })
    expect(active.lifecycle).toBe('active')
    await expectCode(fixture.registry.activate({ accountRef: active.accountRef, expectedRevision: 2, context: activateContext }), 'account_lifecycle_transition_forbidden')
    const suspended = await fixture.registry.suspend({ accountRef: active.accountRef, expectedRevision: 2, context: fixture.nextContext(active.accountRef, created.owner, 'suspend') })
    await expectCode(fixture.registry.suspend({ accountRef: active.accountRef, expectedRevision: 3, context: fixture.nextContext(active.accountRef, created.owner, 'suspend-again') }), 'account_lifecycle_transition_forbidden')
    const reactivated = await fixture.registry.activate({ accountRef: active.accountRef, expectedRevision: 3, context: fixture.nextContext(active.accountRef, created.owner, 'reactivate') })
    await expectCode(fixture.registry.close({ accountRef: active.accountRef, expectedAccountRevision: 4, expectedOwnershipRevision: 1, context: fixture.nextContext(active.accountRef, created.owner, 'close-active') }), 'account_lifecycle_transition_forbidden')
    const suspendedAgain = await fixture.registry.suspend({ accountRef: active.accountRef, expectedRevision: 4, context: fixture.nextContext(active.accountRef, created.owner, 'suspend-again') })
    const closed = await fixture.registry.close({ accountRef: active.accountRef, expectedAccountRevision: 5, expectedOwnershipRevision: 1, context: fixture.nextContext(active.accountRef, created.owner, 'close') })
    expect([suspended.lifecycle, reactivated.lifecycle, suspendedAgain.lifecycle, closed.account.lifecycle]).toEqual(['suspended', 'active', 'suspended', 'closed'])
    expect(closed.ownership).toMatchObject({ lifecycle: 'ended', revision: 2, endedAt: 50 })
    expect(fixture.store.commits.at(-1)).toMatchObject({
      accountReplacement: { expectedRevision: 5 },
      ownershipReplacements: [{ expectedRevision: 1 }],
    })
    await expectCode(fixture.registry.activate({ accountRef: active.accountRef, expectedRevision: 6, context: fixture.nextContext(active.accountRef, created.owner, 'after-close') }), 'account_lifecycle_transition_forbidden')
    await expectCode(fixture.registry.requireActiveContext(fixture.nextContext(active.accountRef, created.owner, 'work')), 'account_not_operational')
  })

  it('rejects stale revisions, wrong active context and non-owner lifecycle actions', async () => {
    const fixture = setup({ times: [10, 20, 30] })
    const created = await createAccount(fixture)
    const stranger = fixture.store.seedPrincipal('2')
    const other = accountRef('acc_ffffffffffffffffffffffffffffffff')
    await expectCode(fixture.registry.activate({ accountRef: created.account.accountRef, expectedRevision: 0, context: fixture.nextContext(created.account.accountRef, created.owner) }), 'account_revision_conflict')
    await expectCode(fixture.registry.activate({ accountRef: created.account.accountRef, expectedRevision: 2, context: fixture.nextContext(created.account.accountRef, created.owner) }), 'account_revision_conflict')
    await expectCode(fixture.registry.activate({ accountRef: created.account.accountRef, expectedRevision: 1, context: fixture.nextContext(other, created.owner) }), 'account_context_mismatch')
    await expectCode(fixture.registry.activate({ accountRef: created.account.accountRef, expectedRevision: 1, context: fixture.nextContext(created.account.accountRef, stranger) }), 'owner_context_required')
    await expect(fixture.registry.getAccount(other)).resolves.toBeUndefined()
    await expectCode(fixture.registry.requireActiveContext(fixture.nextContext(other, created.owner)), 'account_not_found')
    await expect(fixture.registry.getAccount(created.account.accountRef)).resolves.toBe(created.account)
  })

  it('rejects account administration by an owner Principal that is no longer active', async () => {
    const fixture = setup()
    const created = await createAccount(fixture)
    const owner = fixture.store.principals.get(created.owner)
    expect(owner).toBeDefined()
    fixture.store.principals.set(created.owner, Object.freeze({ ...owner!, lifecycle: 'suspended' }))
    await expectCode(fixture.registry.activate({
      accountRef: created.account.accountRef,
      expectedRevision: 1,
      context: fixture.nextContext(created.account.accountRef, created.owner),
    }), 'principal_inactive')
  })

  it('refuses backwards server time on lifecycle changes and closure', async () => {
    const lifecycleFixture = setup({ times: [20, 10] })
    const created = await createAccount(lifecycleFixture)
    await expectCode(lifecycleFixture.registry.activate({ accountRef: created.account.accountRef, expectedRevision: 1, context: lifecycleFixture.nextContext(created.account.accountRef, created.owner) }), 'account_timestamp_invalid')

    const closeFixture = setup({ times: [20, 30, 40, 10] })
    const closeCreated = await createAccount(closeFixture)
    const active = await activateAccount(closeFixture, closeCreated)
    await closeFixture.registry.suspend({ accountRef: active.accountRef, expectedRevision: 2, context: closeFixture.nextContext(active.accountRef, closeCreated.owner, 'suspend') })
    await expectCode(closeFixture.registry.close({ accountRef: active.accountRef, expectedAccountRevision: 3, expectedOwnershipRevision: 1, context: closeFixture.nextContext(active.accountRef, closeCreated.owner, 'close') }), 'account_timestamp_invalid')
  })

  it('creates and ends Membership facts without altering the ownership fact', async () => {
    const fixture = setup({ times: [10, 20, 30, 40] })
    const created = await createAccount(fixture, 'agent')
    const active = await activateAccount(fixture, created)
    const member = fixture.store.seedPrincipal('2', 'workload')
    const added = await fixture.registry.addMembership({
      accountRef: active.accountRef,
      memberPrincipalRef: member,
      expectedAccountRevision: 2,
      context: fixture.nextContext(active.accountRef, created.owner, 'add-member'),
    })
    expect(added.membership).toMatchObject({
      accountRef: active.accountRef,
      memberPrincipalRef: member,
      lifecycle: 'active',
      revision: 1,
    })
    expect(await fixture.registry.getMembership(added.membership.membershipRef)).toBe(added.membership)
    expect(fixture.store.ownerships.get(created.ownership.ownershipRef)).toBe(created.ownership)
    expect(created.owner).not.toBe(member)
    const ended = await fixture.registry.endMembership({
      accountRef: active.accountRef,
      membershipRef: added.membership.membershipRef,
      expectedAccountRevision: 3,
      expectedMembershipRevision: 1,
      context: fixture.nextContext(active.accountRef, created.owner, 'end-member'),
    })
    expect(ended.membership).toMatchObject({ lifecycle: 'ended', revision: 2, endedAt: 40 })
    expect(Object.isFrozen(ended.membership)).toBe(true)
    expect(fixture.store.ownerships.get(created.ownership.ownershipRef)).toBe(created.ownership)
  })

  it('rejects duplicate, inactive, missing and colliding Memberships', async () => {
    const fixture = setup({ uuids: [uuid(1), uuid(2), uuid(3), uuid(3)] })
    const created = await createAccount(fixture)
    const active = await activateAccount(fixture, created)
    const member = fixture.store.seedPrincipal('2')
    const first = await fixture.registry.addMembership({ accountRef: active.accountRef, memberPrincipalRef: member, expectedAccountRevision: 2, context: fixture.nextContext(active.accountRef, created.owner, 'add') })
    await expectCode(fixture.registry.addMembership({ accountRef: active.accountRef, memberPrincipalRef: member, expectedAccountRevision: 3, context: fixture.nextContext(active.accountRef, created.owner, 'duplicate') }), 'membership_ref_conflict')

    const duplicateFixture = setup()
    const duplicateCreated = await createAccount(duplicateFixture)
    const duplicateActive = await activateAccount(duplicateFixture, duplicateCreated)
    const duplicateMember = duplicateFixture.store.seedPrincipal('2')
    await duplicateFixture.registry.addMembership({ accountRef: duplicateActive.accountRef, memberPrincipalRef: duplicateMember, expectedAccountRevision: 2, context: duplicateFixture.nextContext(duplicateActive.accountRef, duplicateCreated.owner, 'add') })
    await expectCode(duplicateFixture.registry.addMembership({ accountRef: duplicateActive.accountRef, memberPrincipalRef: duplicateMember, expectedAccountRevision: 3, context: duplicateFixture.nextContext(duplicateActive.accountRef, duplicateCreated.owner, 'duplicate') }), 'membership_active_conflict')

    const missing = principalRef('prn_ffffffffffffffffffffffffffffffff')
    await expectCode(duplicateFixture.registry.addMembership({ accountRef: duplicateActive.accountRef, memberPrincipalRef: missing, expectedAccountRevision: 3, context: duplicateFixture.nextContext(duplicateActive.accountRef, duplicateCreated.owner, 'missing') }), 'principal_not_found')
    const inactive = duplicateFixture.store.seedPrincipal('3', 'human', 'retired')
    await expectCode(duplicateFixture.registry.addMembership({ accountRef: duplicateActive.accountRef, memberPrincipalRef: inactive, expectedAccountRevision: 3, context: duplicateFixture.nextContext(duplicateActive.accountRef, duplicateCreated.owner, 'inactive') }), 'principal_inactive')
    expect(first.membership.lifecycle).toBe('active')
  })

  it('rejects invalid Membership endings and changes while suspended', async () => {
    const fixture = setup({ times: [10, 20, 30, 40] })
    const created = await createAccount(fixture)
    const active = await activateAccount(fixture, created)
    const member = fixture.store.seedPrincipal('2')
    const added = await fixture.registry.addMembership({ accountRef: active.accountRef, memberPrincipalRef: member, expectedAccountRevision: 2, context: fixture.nextContext(active.accountRef, created.owner, 'add') })
    const stranger = fixture.store.seedPrincipal('3')
    await expectCode(fixture.registry.endMembership({ accountRef: active.accountRef, membershipRef: added.membership.membershipRef, expectedAccountRevision: 3, expectedMembershipRevision: 2, context: fixture.nextContext(active.accountRef, created.owner, 'stale-member') }), 'membership_revision_conflict')
    await expectCode(fixture.registry.endMembership({ accountRef: active.accountRef, membershipRef: added.membership.membershipRef, expectedAccountRevision: 3, expectedMembershipRevision: 1, context: fixture.nextContext(active.accountRef, stranger, 'stranger') }), 'owner_context_required')
    await expectCode(fixture.registry.endMembership({ accountRef: active.accountRef, membershipRef: membershipRef('mem_ffffffffffffffffffffffffffffffff'), expectedAccountRevision: 3, expectedMembershipRevision: 1, context: fixture.nextContext(active.accountRef, created.owner, 'missing') }), 'membership_not_found')
    const suspended = await fixture.registry.suspend({ accountRef: active.accountRef, expectedRevision: 3, context: fixture.nextContext(active.accountRef, created.owner, 'suspend') })
    await expectCode(fixture.registry.addMembership({ accountRef: active.accountRef, memberPrincipalRef: stranger, expectedAccountRevision: suspended.revision, context: fixture.nextContext(active.accountRef, created.owner, 'add-suspended') }), 'account_lifecycle_transition_forbidden')
    await expectCode(fixture.registry.endMembership({ accountRef: active.accountRef, membershipRef: added.membership.membershipRef, expectedAccountRevision: suspended.revision, expectedMembershipRevision: 1, context: fixture.nextContext(active.accountRef, created.owner, 'end-suspended') }), 'account_lifecycle_transition_forbidden')
    await expect(fixture.registry.getMembership(membershipRef('mem_ffffffffffffffffffffffffffffffff'))).resolves.toBeUndefined()
  })

  it('rejects a Membership belonging to another Account and a second ending', async () => {
    const fixture = setup({ times: [10, 11, 20, 21, 30, 40] })
    const first = await createAccount(fixture)
    const firstActive = await activateAccount(fixture, first)
    const second = await createAccount(fixture)
    const secondActive = await activateAccount(fixture, second)
    const member = fixture.store.seedPrincipal('3')
    const added = await fixture.registry.addMembership({ accountRef: firstActive.accountRef, memberPrincipalRef: member, expectedAccountRevision: 2, context: fixture.nextContext(firstActive.accountRef, first.owner, 'add') })
    await expectCode(fixture.registry.endMembership({ accountRef: secondActive.accountRef, membershipRef: added.membership.membershipRef, expectedAccountRevision: 2, expectedMembershipRevision: 1, context: fixture.nextContext(secondActive.accountRef, second.owner, 'wrong-account') }), 'membership_account_mismatch')
    const ended = await fixture.registry.endMembership({ accountRef: firstActive.accountRef, membershipRef: added.membership.membershipRef, expectedAccountRevision: 3, expectedMembershipRevision: 1, context: fixture.nextContext(firstActive.accountRef, first.owner, 'end') })
    await expectCode(fixture.registry.endMembership({ accountRef: firstActive.accountRef, membershipRef: ended.membership.membershipRef, expectedAccountRevision: 4, expectedMembershipRevision: 2, context: fixture.nextContext(firstActive.accountRef, first.owner, 'end-again') }), 'membership_lifecycle_transition_forbidden')
  })

  it('transfers ownership atomically while preserving Account identity and Membership facts', async () => {
    const fixture = setup({ times: [10, 20, 30, 40] })
    const created = await createAccount(fixture, 'agent')
    const active = await activateAccount(fixture, created)
    const member = fixture.store.seedPrincipal('2')
    const added = await fixture.registry.addMembership({ accountRef: active.accountRef, memberPrincipalRef: member, expectedAccountRevision: 2, context: fixture.nextContext(active.accountRef, created.owner, 'member') })
    const successor = fixture.store.seedPrincipal('3', 'agent')
    const transferred = await fixture.registry.transferOwnership({
      accountRef: active.accountRef,
      successorOwnerPrincipalRef: successor,
      expectedAccountRevision: 3,
      expectedOwnershipRevision: 1,
      context: fixture.nextContext(active.accountRef, created.owner, 'transfer'),
    })
    expect(transferred.account).toMatchObject({ accountRef: active.accountRef, revision: 4 })
    expect(transferred.previousOwnership).toMatchObject({ lifecycle: 'ended', successorOwnershipRef: transferred.currentOwnership.ownershipRef })
    expect(transferred.currentOwnership).toMatchObject({
      ownerPrincipalRef: successor,
      lifecycle: 'active',
      changeKind: 'transfer',
      predecessorOwnershipRef: created.ownership.ownershipRef,
    })
    expect(fixture.store.memberships.get(added.membership.membershipRef)).toBe(added.membership)
    await expectCode(fixture.registry.suspend({ accountRef: active.accountRef, expectedRevision: 4, context: fixture.nextContext(active.accountRef, created.owner, 'old-owner') }), 'owner_context_required')
    await expect(fixture.registry.suspend({ accountRef: active.accountRef, expectedRevision: 4, context: fixture.nextContext(active.accountRef, successor, 'new-owner') })).resolves.toMatchObject({ lifecycle: 'suspended' })
  })

  it('rejects unsafe transfers and corrupt ownership pointers deterministically', async () => {
    const fixture = setup()
    const created = await createAccount(fixture)
    const active = await activateAccount(fixture, created)
    const successor = fixture.store.seedPrincipal('2')
    await expectCode(fixture.registry.transferOwnership({ accountRef: active.accountRef, successorOwnerPrincipalRef: created.owner, expectedAccountRevision: 2, expectedOwnershipRevision: 1, context: fixture.nextContext(active.accountRef, created.owner, 'same') }), 'successor_same_as_incumbent')
    await expectCode(fixture.registry.transferOwnership({ accountRef: active.accountRef, successorOwnerPrincipalRef: successor, expectedAccountRevision: 2, expectedOwnershipRevision: 0, context: fixture.nextContext(active.accountRef, created.owner, 'stale') }), 'ownership_revision_conflict')
    const missing = principalRef('prn_ffffffffffffffffffffffffffffffff')
    await expectCode(fixture.registry.transferOwnership({ accountRef: active.accountRef, successorOwnerPrincipalRef: missing, expectedAccountRevision: 2, expectedOwnershipRevision: 1, context: fixture.nextContext(active.accountRef, created.owner, 'missing') }), 'principal_not_found')
    await fixture.registry.suspend({ accountRef: active.accountRef, expectedRevision: 2, context: fixture.nextContext(active.accountRef, created.owner, 'suspend') })
    await expectCode(fixture.registry.transferOwnership({ accountRef: active.accountRef, successorOwnerPrincipalRef: successor, expectedAccountRevision: 3, expectedOwnershipRevision: 1, context: fixture.nextContext(active.accountRef, created.owner, 'suspended') }), 'account_lifecycle_transition_forbidden')

    const missingOwnership = setup()
    const missingCreated = await createAccount(missingOwnership)
    missingOwnership.store.ownerships.delete(missingCreated.ownership.ownershipRef)
    await expectCode(missingOwnership.registry.activate({ accountRef: missingCreated.account.accountRef, expectedRevision: 1, context: missingOwnership.nextContext(missingCreated.account.accountRef, missingCreated.owner) }), 'ownership_not_found')

    const mismatched = setup()
    const mismatchedCreated = await createAccount(mismatched)
    mismatched.store.ownerships.set(mismatchedCreated.ownership.ownershipRef, Object.freeze({ ...mismatchedCreated.ownership, accountRef: accountRef('acc_ffffffffffffffffffffffffffffffff') }))
    await expectCode(mismatched.registry.activate({ accountRef: mismatchedCreated.account.accountRef, expectedRevision: 1, context: mismatched.nextContext(mismatchedCreated.account.accountRef, mismatchedCreated.owner) }), 'ownership_account_mismatch')

    const ended = setup()
    const endedCreated = await createAccount(ended)
    ended.store.ownerships.set(endedCreated.ownership.ownershipRef, Object.freeze({ ...endedCreated.ownership, lifecycle: 'ended' }))
    await expectCode(ended.registry.activate({ accountRef: endedCreated.account.accountRef, expectedRevision: 1, context: ended.nextContext(endedCreated.account.accountRef, endedCreated.owner) }), 'ownership_lifecycle_transition_forbidden')
  })

  it('rejects a generated ownership collision during transfer without partial changes', async () => {
    const fixture = setup({ uuids: [uuid(1), uuid(2), uuid(3)] })
    const created = await createAccount(fixture)
    const active = await activateAccount(fixture, created)
    const successor = fixture.store.seedPrincipal('2')
    fixture.store.ownerships.set(ownershipRef('own_00000000000040008000000000000003'), {} as AccountOwnership)
    const commitsBefore = fixture.store.commits.length
    await expectCode(fixture.registry.transferOwnership({ accountRef: active.accountRef, successorOwnerPrincipalRef: successor, expectedAccountRevision: 2, expectedOwnershipRevision: 1, context: fixture.nextContext(active.accountRef, created.owner) }), 'ownership_ref_conflict')
    expect(fixture.store.commits).toHaveLength(commitsBefore)
    expect(fixture.store.accounts.get(active.accountRef)).toBe(active)
  })

  it('succeeds ownership only from suspension with a current, exactly bound recovery authorization', async () => {
    const fixture = setup({ times: [10, 20, 30, 40] })
    const created = await createAccount(fixture)
    const active = await activateAccount(fixture, created)
    const suspended = await fixture.registry.suspend({ accountRef: active.accountRef, expectedRevision: 2, context: fixture.nextContext(active.accountRef, created.owner, 'suspend') })
    const successor = fixture.store.seedPrincipal('2', 'agent')
    const authorization: SuccessionAuthorization = {
      authorizationRef: 'recovery-proof:1',
      accountRef: active.accountRef,
      incumbentOwnerPrincipalRef: created.owner,
      successorOwnerPrincipalRef: successor,
      recoveryPolicyRevision: 1,
      verifiedAt: 35,
      expiresAt: 50,
    }
    const succeeded = await fixture.registry.succeedOwnership({
      accountRef: active.accountRef,
      successorOwnerPrincipalRef: successor,
      expectedAccountRevision: suspended.revision,
      expectedOwnershipRevision: 1,
      authorization,
      context: fixture.nextContext(active.accountRef, successor, 'succession'),
    })
    expect(succeeded.account.lifecycle).toBe('suspended')
    expect(succeeded.currentOwnership).toMatchObject({
      changeKind: 'succession',
      ownerPrincipalRef: successor,
      successionAuthorizationRef: 'recovery-proof:1',
    })
    const reactivated = await fixture.registry.activate({ accountRef: active.accountRef, expectedRevision: 4, context: fixture.nextContext(active.accountRef, successor, 'reactivate') })
    expect(reactivated.lifecycle).toBe('active')
  })

  it('enforces the declared no-transfer recovery policy', async () => {
    const fixture = setup({ times: [10, 20, 30, 40] })
    const created = await createAccount(fixture, 'human', { kind: 'no_transfer', revision: 1 })
    const active = await activateAccount(fixture, created)
    const suspended = await fixture.registry.suspend({ accountRef: active.accountRef, expectedRevision: 2, context: fixture.nextContext(active.accountRef, created.owner, 'suspend') })
    const successor = fixture.store.seedPrincipal('2')
    await expectCode(fixture.registry.succeedOwnership({
      accountRef: active.accountRef,
      successorOwnerPrincipalRef: successor,
      expectedAccountRevision: suspended.revision,
      expectedOwnershipRevision: 1,
      authorization: { authorizationRef: 'proof:1', accountRef: active.accountRef, incumbentOwnerPrincipalRef: created.owner, successorOwnerPrincipalRef: successor, recoveryPolicyRevision: 1, verifiedAt: 25, expiresAt: 50 },
      context: fixture.nextContext(active.accountRef, successor, 'succession'),
    }), 'succession_forbidden_by_recovery_policy')
  })

  it('rejects missing, malformed, mismatched, premature and expired succession proofs', async () => {
    const fixture = setup({ times: [10, 20, 30, 40, 40, 40, 40, 40, 40, 40, 40, 40] })
    const created = await createAccount(fixture)
    const active = await activateAccount(fixture, created)
    const suspended = await fixture.registry.suspend({ accountRef: active.accountRef, expectedRevision: 2, context: fixture.nextContext(active.accountRef, created.owner, 'suspend') })
    const successor = fixture.store.seedPrincipal('2')
    const other = fixture.store.seedPrincipal('3')
    const valid: SuccessionAuthorization = { authorizationRef: 'proof:1', accountRef: active.accountRef, incumbentOwnerPrincipalRef: created.owner, successorOwnerPrincipalRef: successor, recoveryPolicyRevision: 1, verifiedAt: 35, expiresAt: 50 }
    const attempt = async (authorization: SuccessionAuthorization | undefined, actor = successor): Promise<unknown> => await fixture.registry.succeedOwnership({
      accountRef: active.accountRef,
      successorOwnerPrincipalRef: successor,
      expectedAccountRevision: suspended.revision,
      expectedOwnershipRevision: 1,
      authorization: authorization as SuccessionAuthorization,
      context: fixture.nextContext(active.accountRef, actor, 'succession'),
    })
    await expectCode(attempt(undefined), 'succession_authorization_invalid')
    await expectCode(attempt({ ...valid, authorizationRef: 'bad proof' }), 'succession_authorization_invalid')
    await expectCode(attempt({ ...valid, accountRef: accountRef('acc_ffffffffffffffffffffffffffffffff') }), 'succession_authorization_invalid')
    await expectCode(attempt({ ...valid, incumbentOwnerPrincipalRef: other }), 'succession_authorization_invalid')
    await expectCode(attempt({ ...valid, successorOwnerPrincipalRef: other }), 'succession_authorization_invalid')
    await expectCode(attempt({ ...valid, recoveryPolicyRevision: 2 }), 'succession_authorization_invalid')
    await expectCode(attempt({ ...valid, verifiedAt: -1 }), 'succession_authorization_invalid')
    await expectCode(attempt({ ...valid, expiresAt: 20 }), 'succession_authorization_invalid')
    await expectCode(attempt({ ...valid, verifiedAt: 41, expiresAt: 50 }), 'succession_authorization_invalid')
    await expectCode(attempt({ ...valid, verifiedAt: Number.NaN }), 'succession_authorization_invalid')
    await expectCode(attempt({ ...valid, expiresAt: Number.NaN }), 'succession_authorization_invalid')
    await expectCode(attempt({ ...valid, verifiedAt: 34 }), 'succession_authorization_invalid')
    await expectCode(attempt({ ...valid, expiresAt: 39 }), 'succession_authorization_expired')
    await expectCode(attempt(valid, other), 'succession_authorization_invalid')
  })

  it('requires suspension for succession and active state for voluntary transfer', async () => {
    const fixture = setup({ times: [10, 20, 30] })
    const created = await createAccount(fixture)
    const active = await activateAccount(fixture, created)
    const successor = fixture.store.seedPrincipal('2')
    const authorization: SuccessionAuthorization = { authorizationRef: 'proof:1', accountRef: active.accountRef, incumbentOwnerPrincipalRef: created.owner, successorOwnerPrincipalRef: successor, recoveryPolicyRevision: 1, verifiedAt: 20, expiresAt: 50 }
    await expectCode(fixture.registry.succeedOwnership({ accountRef: active.accountRef, successorOwnerPrincipalRef: successor, expectedAccountRevision: 2, expectedOwnershipRevision: 1, authorization, context: fixture.nextContext(active.accountRef, successor, 'succession') }), 'account_lifecycle_transition_forbidden')
  })

  it('proves exactly one active Account context and explicit cross-Account attribution', async () => {
    const fixture = setup({ times: [10, 11, 20, 21, 30] })
    const first = await createAccount(fixture, 'agent')
    const firstActive = await activateAccount(fixture, first)
    const second = await createAccount(fixture, 'organization')
    const secondActive = await activateAccount(fixture, second)
    const context = fixture.nextContext(firstActive.accountRef, first.owner, 'cross-account')
    await expect(fixture.registry.requireActiveContext(context)).resolves.toEqual({
      accountRef: firstActive.accountRef,
      actorPrincipalRef: first.owner,
      accountRevision: firstActive.revision,
      correlationRef: 'correlation:cross-account',
      idempotencyRef: 'idempotency:cross-account',
    })
    await expect(fixture.registry.attributeCrossAccountAction({ context, counterpartyAccountRef: secondActive.accountRef })).resolves.toMatchObject({
      activeAccountRef: firstActive.accountRef,
      counterpartyAccountRef: secondActive.accountRef,
      actorPrincipalRef: first.owner,
      activeAccountRevision: firstActive.revision,
      counterpartyAccountRevision: secondActive.revision,
    })
    await expectCode(fixture.registry.attributeCrossAccountAction({ context, counterpartyAccountRef: firstActive.accountRef }), 'account_cross_account_self_forbidden')
  })

  it('rejects inactive actors and non-operational counterparties for protected context proofs', async () => {
    const fixture = setup({ times: [10, 11, 20, 21, 30] })
    const first = await createAccount(fixture)
    const firstActive = await activateAccount(fixture, first)
    const second = await createAccount(fixture)
    const secondActive = await activateAccount(fixture, second)
    const inactive = fixture.store.seedPrincipal('3', 'human', 'suspended')
    await expectCode(fixture.registry.requireActiveContext(fixture.nextContext(firstActive.accountRef, inactive, 'inactive')), 'principal_inactive')
    await fixture.registry.suspend({ accountRef: secondActive.accountRef, expectedRevision: 2, context: fixture.nextContext(secondActive.accountRef, second.owner, 'suspend') })
    await expectCode(fixture.registry.attributeCrossAccountAction({ context: fixture.nextContext(firstActive.accountRef, first.owner, 'cross'), counterpartyAccountRef: secondActive.accountRef }), 'account_not_operational')
  })

  it('reports malformed lookup references', async () => {
    const fixture = setup()
    await expectCode(fixture.registry.getAccount('bad' as AccountRef), 'account_ref_invalid')
    await expectCode(fixture.registry.getOwnership('bad' as OwnershipRef), 'ownership_ref_invalid')
    await expectCode(fixture.registry.getMembership('bad' as MembershipRef), 'membership_ref_invalid')
  })

  it('uses secure platform defaults when optional factories are omitted', async () => {
    const store = new MemoryAccountStore()
    const owner = store.seedPrincipal('1', 'agent')
    const registry = new AccountRegistry(store)
    const created = await registry.create({ ownerPrincipalRef: owner, displayName: 'Default factories', recoveryPolicy: { kind: 'no_transfer', revision: 1 }, correlationRef: 'correlation:default', idempotencyRef: 'idempotency:default' })
    expect(created.account.accountRef).toMatch(/^acc_[0-9a-f]{32}$/u)
    expect(created.ownership.ownershipRef).toMatch(/^own_[0-9a-f]{32}$/u)
    expect(created.account.createdAt).toBeGreaterThan(0)
  })
})
