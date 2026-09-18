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
  recoveryParticipantApprovalLifecycleValue,
  successionAuthorizationLifecycleValue,
  successionAuthorizationParticipantValue,
  successionAuthorizationValue,
  verifiedRecoveryParticipantApprovalValue,
  type Account,
  type AccountActionContext,
  type AccountOwnership,
  type AccountRef,
  type MembershipRef,
  type OwnershipRef,
  type RecoveryPolicy,
  type SuccessionAuthorization,
  type VerifiedRecoveryParticipantApproval,
} from '../../../../src/modules/principal-account/account/public'
import { principalRef, type PrincipalRef } from '../../../../src/modules/principal-account/principal/public'

import {
  MemoryAccountStore,
  NO_TRANSFER_REV1,
  SuccessionPrep,
  activateAccount,
  activateAccountRevision,
  activeAccountBundle,
  addMembershipFor,
  attemptRegisteredSuccession,
  corr,
  corruptOwnership,
  createAccount,
  createRequest,
  endMembershipFor,
  expectCode,
  expectRegistryCreate,
  idem,
  prepareRegisteredSuccession,
  prepareSuspendedSuccession,
  primaryCreateRequest,
  registerSuccession,
  setup,
  suspendAccountRevision,
  suspendedAccountBundle,
  uuid,
} from './account-registry.harness'

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
      recoveryParticipantApprovalLifecycleValue,
      successionAuthorizationLifecycleValue,
      successionAuthorizationParticipantValue,
      successionAuthorizationValue,
      verifiedRecoveryParticipantApprovalValue,
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
    const replay = await fixture.registry.create(primaryCreateRequest(created.owner))
    expect(replay).toEqual({ account: created.account, ownership: created.ownership })
    expect(fixture.store.commits).toHaveLength(commitsBeforeReplay)
    await expectCode(fixture.registry.create(primaryCreateRequest(created.owner, { displayName: 'Different name', recoveryPolicy: created.account.recoveryPolicy })), 'account_idempotency_conflict')
    await expectCode(fixture.registry.create(primaryCreateRequest(created.owner, { recoveryPolicy: NO_TRANSFER_REV1 })), 'account_idempotency_conflict')

    const noTransfer = setup()
    const declared = await createAccount(noTransfer, 'human', { kind: 'no_transfer', revision: 4 })
    await expect(noTransfer.registry.create(primaryCreateRequest(declared.owner, { recoveryPolicy: { kind: 'no_transfer', revision: 4 } })))
      .resolves.toEqual({ account: declared.account, ownership: declared.ownership })
  })

  it('fails closed when an idempotent creation replay finds corrupt initial ownership', async () => {
    for (const [mode, code] of [
      ['delete', 'ownership_not_found'] as const,
      ['account-mismatch', 'ownership_account_mismatch'] as const,
    ]) {
      const fixture = setup()
      const created = await createAccount(fixture)
      corruptOwnership(fixture.store, created.ownership, mode)
      await expectCode(fixture.registry.create(primaryCreateRequest(created.owner, { recoveryPolicy: created.account.recoveryPolicy })), code)
    }
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
      await expectRegistryCreate(fixture.registry, fixture.store.seedPrincipal('1'), 'recovery_policy_invalid', { recoveryPolicy: policy })
    }

    const invalidName = setup()
    const owner = invalidName.store.seedPrincipal('1')
    for (const displayName of ['', 'a'.repeat(201), 'line\nbreak']) {
      await expectRegistryCreate(invalidName.registry, owner, 'account_display_name_invalid', { displayName })
    }
    for (const times of [[-1], [Number.NaN]] as const) {
      const fixture = setup({ times })
      await expectRegistryCreate(fixture.registry, fixture.store.seedPrincipal('1'), 'account_timestamp_invalid')
    }

    const absent = setup()
    await expectRegistryCreate(absent.registry, principalRef('prn_ffffffffffffffffffffffffffffffff'), 'principal_not_found')
    const inactive = setup()
    await expectRegistryCreate(inactive.registry, inactive.store.seedPrincipal('1', 'human', 'suspended'), 'principal_inactive')
  })

  it('rejects malformed action attribution before writes', async () => {
    const fixture = setup()
    const owner = fixture.store.seedPrincipal('1')
    await expectRegistryCreate(fixture.registry, owner, 'correlation_ref_invalid', { correlationRef: '' })
    await expectRegistryCreate(fixture.registry, owner, 'account_idempotency_ref_invalid', { idempotencyRef: 'has space' })
    await expectRegistryCreate(fixture.registry, owner, 'correlation_ref_invalid', { correlationRef: 'a'.repeat(201) })
  })

  it('rejects generated Account and ownership collisions before an atomic insert', async () => {
    const collisionUuid = uuid(1)
    const accountCollision = setup({ uuids: [collisionUuid, uuid(2)] })
    const owner = accountCollision.store.seedPrincipal('1')
    accountCollision.store.accounts.set(accountRef('acc_00000000000040008000000000000001'), {} as Account)
    await expectRegistryCreate(accountCollision.registry, owner, 'account_ref_conflict')
    expect(accountCollision.store.commits).toHaveLength(0)

    const ownershipCollision = setup({ uuids: [uuid(1), uuid(2)] })
    const secondOwner = ownershipCollision.store.seedPrincipal('1')
    ownershipCollision.store.ownerships.set(ownershipRef('own_00000000000040008000000000000002'), {} as AccountOwnership)
    await expectRegistryCreate(ownershipCollision.registry, secondOwner, 'ownership_ref_conflict')
    expect(ownershipCollision.store.commits).toHaveLength(0)
  })

  it('enforces the complete Account lifecycle graph and closes ownership atomically', async () => {
    const fixture = setup({ times: [10, 20, 30, 40, 50] })
    const created = await createAccount(fixture)
    const activateContext = fixture.nextContext(created.account.accountRef, created.owner, 'activate')
    const active = await activateAccountRevision(fixture, created.account, created.owner, 1, 'activate')
    expect(active.lifecycle).toBe('active')
    await expectCode(fixture.registry.activate({ accountRef: active.accountRef, expectedRevision: 2, context: activateContext }), 'account_lifecycle_transition_forbidden')
    const suspended = await suspendAccountRevision(fixture, active, created.owner, 2, 'suspend')
    await expectCode(suspendAccountRevision(fixture, active, created.owner, 3, 'suspend-again'), 'account_lifecycle_transition_forbidden')
    const reactivated = await activateAccountRevision(fixture, active, created.owner, 3, 'reactivate')
    await expectCode(fixture.registry.close({ accountRef: active.accountRef, expectedAccountRevision: 4, expectedOwnershipRevision: 1, context: fixture.nextContext(active.accountRef, created.owner, 'close-active') }), 'account_lifecycle_transition_forbidden')
    const suspendedAgain = await suspendAccountRevision(fixture, active, created.owner, 4, 'suspend-again')
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
    const lifecycleCreated = await createAccount(lifecycleFixture)
    await expectCode(activateAccountRevision(lifecycleFixture, lifecycleCreated.account, lifecycleCreated.owner, 1, 'activate'), 'account_timestamp_invalid')

    const closeFixture = setup({ times: [20, 30, 40, 10] })
    const { created: closeCreated, active: closeActive } = await activeAccountBundle(closeFixture)
    await suspendAccountRevision(closeFixture, closeActive, closeCreated.owner, 2, 'suspend')
    await expectCode(closeFixture.registry.close({ accountRef: closeActive.accountRef, expectedAccountRevision: 3, expectedOwnershipRevision: 1, context: closeFixture.nextContext(closeActive.accountRef, closeCreated.owner, 'close') }), 'account_timestamp_invalid')
  })

  it('creates and ends Membership facts without altering the ownership fact', async () => {
    const fixture = setup({ times: [10, 20, 30, 40] })
    const { created, active } = await activeAccountBundle(fixture, 'agent')
    const member = fixture.store.seedPrincipal('2', 'workload')
    const added = await addMembershipFor(fixture, active, created.owner, member, 2, 'add-member')
    expect(added.membership).toMatchObject({
      accountRef: active.accountRef,
      memberPrincipalRef: member,
      lifecycle: 'active',
      revision: 1,
    })
    expect(await fixture.registry.getMembership(added.membership.membershipRef)).toBe(added.membership)
    expect(fixture.store.ownerships.get(created.ownership.ownershipRef)).toBe(created.ownership)
    expect(created.owner).not.toBe(member)
    const ended = await endMembershipFor(fixture, active, created.owner, added.membership.membershipRef, 3, 1, 'end-member')
    expect(ended.membership).toMatchObject({ lifecycle: 'ended', revision: 2, endedAt: 40 })
    expect(Object.isFrozen(ended.membership)).toBe(true)
    expect(fixture.store.ownerships.get(created.ownership.ownershipRef)).toBe(created.ownership)
  })

  it('rejects duplicate, inactive, missing and colliding Memberships', async () => {
    const fixture = setup({ uuids: [uuid(1), uuid(2), uuid(3), uuid(3)] })
    const { created, active } = await activeAccountBundle(fixture)
    const member = fixture.store.seedPrincipal('2')
    const first = await addMembershipFor(fixture, active, created.owner, member, 2, 'add')
    await expectCode(addMembershipFor(fixture, active, created.owner, member, 3, 'duplicate'), 'membership_ref_conflict')

    const duplicateFixture = setup()
    const { created: duplicateCreated, active: duplicateActive } = await activeAccountBundle(duplicateFixture)
    const duplicateMember = duplicateFixture.store.seedPrincipal('2')
    await addMembershipFor(duplicateFixture, duplicateActive, duplicateCreated.owner, duplicateMember, 2, 'add')
    await expectCode(addMembershipFor(duplicateFixture, duplicateActive, duplicateCreated.owner, duplicateMember, 3, 'duplicate'), 'membership_active_conflict')
    await expectCode(addMembershipFor(duplicateFixture, duplicateActive, duplicateCreated.owner, principalRef('prn_ffffffffffffffffffffffffffffffff'), 3, 'missing'), 'principal_not_found')
    await expectCode(addMembershipFor(duplicateFixture, duplicateActive, duplicateCreated.owner, duplicateFixture.store.seedPrincipal('3', 'human', 'retired'), 3, 'inactive'), 'principal_inactive')
    expect(first.membership.lifecycle).toBe('active')
  })

  it('rejects invalid Membership endings and changes while suspended', async () => {
    const fixture = setup({ times: [10, 20, 30, 40] })
    const { created, active } = await activeAccountBundle(fixture)
    const member = fixture.store.seedPrincipal('2')
    const added = await addMembershipFor(fixture, active, created.owner, member, 2, 'add')
    const stranger = fixture.store.seedPrincipal('3')
    await expectCode(endMembershipFor(fixture, active, created.owner, added.membership.membershipRef, 3, 2, 'stale-member'), 'membership_revision_conflict')
    await expectCode(endMembershipFor(fixture, active, stranger, added.membership.membershipRef, 3, 1, 'stranger'), 'owner_context_required')
    await expectCode(endMembershipFor(fixture, active, created.owner, membershipRef('mem_ffffffffffffffffffffffffffffffff'), 3, 1, 'missing'), 'membership_not_found')
    const suspended = await suspendAccountRevision(fixture, active, created.owner, 3, 'suspend')
    await expectCode(addMembershipFor(fixture, active, created.owner, stranger, suspended.revision, 'add-suspended'), 'account_lifecycle_transition_forbidden')
    await expectCode(endMembershipFor(fixture, active, created.owner, added.membership.membershipRef, suspended.revision, 1, 'end-suspended'), 'account_lifecycle_transition_forbidden')
    await expect(fixture.registry.getMembership(membershipRef('mem_ffffffffffffffffffffffffffffffff'))).resolves.toBeUndefined()
  })

  it('rejects a Membership belonging to another Account and a second ending', async () => {
    const fixture = setup({ times: [10, 11, 20, 21, 30, 40] })
    const first = await activeAccountBundle(fixture)
    const second = await activeAccountBundle(fixture)
    const member = fixture.store.seedPrincipal('3')
    const added = await addMembershipFor(fixture, first.active, first.created.owner, member, 2, 'add')
    await expectCode(endMembershipFor(fixture, second.active, second.created.owner, added.membership.membershipRef, 2, 1, 'wrong-account'), 'membership_account_mismatch')
    const ended = await endMembershipFor(fixture, first.active, first.created.owner, added.membership.membershipRef, 3, 1, 'end')
    await expectCode(endMembershipFor(fixture, first.active, first.created.owner, ended.membership.membershipRef, 4, 2, 'end-again'), 'membership_lifecycle_transition_forbidden')
  })

  it('transfers ownership atomically while preserving Account identity and Membership facts', async () => {
    const fixture = setup({ times: [10, 20, 30, 40] })
    const { created, active } = await activeAccountBundle(fixture, 'agent')
    const member = fixture.store.seedPrincipal('2')
    const added = await addMembershipFor(fixture, active, created.owner, member, 2, 'member')
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
    await expectCode(suspendAccountRevision(fixture, active, created.owner, 4, 'old-owner'), 'owner_context_required')
    await expect(suspendAccountRevision(fixture, active, successor, 4, 'new-owner')).resolves.toMatchObject({ lifecycle: 'suspended' })
  })

  it('rejects unsafe transfers and corrupt ownership pointers deterministically', async () => {
    const fixture = setup()
    const { created, active } = await activeAccountBundle(fixture)
    const successor = fixture.store.seedPrincipal('2')
    const transfer = (successorRef: PrincipalRef, accountRevision: number, ownershipRevision: number, suffix: string) => fixture.registry.transferOwnership({
      accountRef: active.accountRef,
      successorOwnerPrincipalRef: successorRef,
      expectedAccountRevision: accountRevision,
      expectedOwnershipRevision: ownershipRevision,
      context: fixture.nextContext(active.accountRef, created.owner, suffix),
    })
    await expectCode(transfer(created.owner, 2, 1, 'same'), 'successor_same_as_incumbent')
    await expectCode(transfer(successor, 2, 0, 'stale'), 'ownership_revision_conflict')
    await expectCode(transfer(principalRef('prn_ffffffffffffffffffffffffffffffff'), 2, 1, 'missing'), 'principal_not_found')
    await suspendAccountRevision(fixture, active, created.owner, 2, 'suspend')
    await expectCode(transfer(successor, 3, 1, 'suspended'), 'account_lifecycle_transition_forbidden')

    for (const [mode, code] of [
      ['delete', 'ownership_not_found'] as const,
      ['account-mismatch', 'ownership_account_mismatch'] as const,
      ['ended', 'ownership_lifecycle_transition_forbidden'] as const,
    ]) {
      const corruptFixture = setup()
      const created = await createAccount(corruptFixture)
      corruptOwnership(corruptFixture.store, created.ownership, mode)
      await expectCode(activateAccountRevision(corruptFixture, created.account, created.owner, 1, 'activate'), code)
    }
  })

  it('rejects a generated ownership collision during transfer without partial changes', async () => {
    const fixture = setup({ uuids: [uuid(1), uuid(2), uuid(3)] })
    const { created, active } = await activeAccountBundle(fixture)
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
    const participants = [fixture.store.seedPrincipal('3'), fixture.store.seedPrincipal('4')]
    participants.forEach((participantPrincipalRef, index) => fixture.store.seedRecoveryApproval({
      approvalRef: `approval:${index + 1}`,
      accountRef: active.accountRef,
      participantPrincipalRef,
      incumbentOwnerPrincipalRef: created.owner,
      successorOwnerPrincipalRef: successor,
      recoveryPolicyRevision: 1,
      frozenAccountRevision: suspended.revision,
      frozenAt: suspended.updatedAt,
      verifiedAt: 35 + index,
      expiresAt: 50,
      verificationRef: `trusted-verification:${index + 1}`,
      lifecycle: 'verified',
      createdAt: 35 + index,
      createdBy: fixture.nextContext(active.accountRef, participantPrincipalRef, `approve-recovery-${index + 1}`),
    }))
    const authorizationContext = fixture.nextContext(active.accountRef, successor, 'authorize-succession')
    const registered = await fixture.registry.registerSuccessionAuthorization({
      accountRef: active.accountRef,
      incumbentOwnerPrincipalRef: created.owner,
      successorOwnerPrincipalRef: successor,
      expectedAccountRevision: suspended.revision,
      expectedOwnershipRevision: 1,
      participantApprovalRefs: ['approval:1', 'approval:2'],
      expiresAt: 50,
      context: authorizationContext,
    })
    const successionInput = {
      accountRef: active.accountRef,
      successorOwnerPrincipalRef: successor,
      expectedAccountRevision: suspended.revision,
      expectedOwnershipRevision: 1,
      authorizationRef: registered.authorization.authorizationRef,
      context: fixture.nextContext(active.accountRef, successor, 'succession'),
    } as const
    const commitsBeforeSuccession = fixture.store.commits.length
    const outcomes = await Promise.allSettled([
      fixture.registry.succeedOwnership(successionInput),
      fixture.registry.succeedOwnership(successionInput),
    ])
    const fulfilled = outcomes.filter((outcome): outcome is PromiseFulfilledResult<Awaited<ReturnType<AccountRegistry['succeedOwnership']>>> => outcome.status === 'fulfilled')
    const rejected = outcomes.filter((outcome): outcome is PromiseRejectedResult => outcome.status === 'rejected')
    expect(fulfilled).toHaveLength(1)
    expect(rejected).toHaveLength(1)
    expect(rejected[0]?.reason).toMatchObject({ code: 'account_revision_conflict' })
    const succeeded = fulfilled[0]!.value
    expect(fixture.store.commits).toHaveLength(commitsBeforeSuccession + 1)
    expect(fixture.store.ownerships).toHaveLength(2)
    expect(succeeded.account.lifecycle).toBe('suspended')
    expect(succeeded.currentOwnership).toMatchObject({
      changeKind: 'succession',
      ownerPrincipalRef: successor,
      successionAuthorizationRef: registered.authorization.authorizationRef,
    })
    expect(registered.authorization).toMatchObject({
      accountRef: active.accountRef,
      incumbentOwnerPrincipalRef: created.owner,
      successorOwnerPrincipalRef: successor,
      recoveryPolicyRevision: 1,
      frozenAccountRevision: suspended.revision,
      frozenAt: suspended.updatedAt,
      availableAt: 35,
      authorizedAt: 40,
      expiresAt: 50,
      verifiedParticipantCount: 2,
      lifecycle: 'active',
      revision: 1,
      createdBy: authorizationContext,
    })
    expect(registered.participants.map((participant) => participant.participantPrincipalRef)).toEqual(participants)
    expect(registered.participants).toEqual(expect.arrayContaining([
      expect.objectContaining({
        recoveryPolicyRevision: 1,
        frozenAccountRevision: suspended.revision,
        createdBy: authorizationContext,
      }),
    ]))
    expect(fixture.store.successionAuthorizations.get(registered.authorization.authorizationRef)).toMatchObject({
      lifecycle: 'consumed',
      revision: 2,
      successorOwnershipRef: succeeded.currentOwnership.ownershipRef,
    })
    await expectCode(fixture.registry.succeedOwnership({
      accountRef: active.accountRef,
      successorOwnerPrincipalRef: successor,
      expectedAccountRevision: succeeded.account.revision,
      expectedOwnershipRevision: succeeded.currentOwnership.revision,
      authorizationRef: registered.authorization.authorizationRef,
      context: fixture.nextContext(active.accountRef, successor, 'replay'),
    }), 'succession_authorization_consumed')
    const reactivated = await fixture.registry.activate({ accountRef: active.accountRef, expectedRevision: 4, context: fixture.nextContext(active.accountRef, successor, 'reactivate') })
    expect(reactivated.lifecycle).toBe('active')
  })

  it('enforces the declared no-transfer recovery policy', async () => {
    const fixture = setup({ times: [10, 20, 30, 40] })
    const { active, suspended } = await suspendedAccountBundle(fixture, 'human', NO_TRANSFER_REV1)
    const successor = fixture.store.seedPrincipal('2')
    await expectCode(fixture.registry.succeedOwnership({
      accountRef: active.accountRef,
      successorOwnerPrincipalRef: successor,
      expectedAccountRevision: suspended.revision,
      expectedOwnershipRevision: 1,
      authorizationRef: 'sau_ffffffffffffffffffffffffffffffff',
      context: fixture.nextContext(active.accountRef, successor, 'succession'),
    }), 'succession_forbidden_by_recovery_policy')
  })

  it('rejects an authorization that expires at the registration instant', async () => {
    const prep = await prepareSuspendedSuccession({ times: [10, 20, 30, 40], suspendSuffix: 'suspend' })
    for (const [index, ref] of prep.approvalRefs.entries()) {
      const approval = prep.fixture.store.recoveryApprovals.get(ref)!
      prep.fixture.store.seedRecoveryApproval({
        ...approval,
        approvalRef: `strict-expiry-approval:${index + 1}`,
        verificationRef: `strict-expiry-verification:${index + 1}`,
        verifiedAt: 35,
        expiresAt: 40,
        createdAt: 35,
        createdBy: prep.fixture.nextContext(prep.active.accountRef, approval.participantPrincipalRef, `strict-expiry-approval-${index + 1}`),
      })
    }
    await expectCode(registerSuccession(prep, {
      participantApprovalRefs: ['strict-expiry-approval:1', 'strict-expiry-approval:2'],
      expiresAt: 40,
    }, 'strict-expiry'), 'succession_authorization_invalid')
  })

  it('fails closed while registering untrusted, duplicate, below-threshold, stale or wrongly bound recovery approvals', async () => {
    const expectRegisterFails = async (
      code: string,
      options: Parameters<typeof prepareSuspendedSuccession>[0] = {},
      overrides: Readonly<Record<string, unknown>> = {},
      beforeRegister?: (prep: SuccessionPrep) => void,
    ) => {
      const prep = await prepareSuspendedSuccession(options)
      beforeRegister?.(prep)
      await expectCode(registerSuccession(prep, overrides), code)
    }
    const mutateFirst = (
      mutate: (approval: VerifiedRecoveryParticipantApproval) => VerifiedRecoveryParticipantApproval,
    ): NonNullable<Parameters<typeof prepareSuspendedSuccession>[0]>['mutate'] =>
      (approval: VerifiedRecoveryParticipantApproval, index: number) => (index === 0 ? mutate(approval) : approval)
    const approvalPair = (prep: SuccessionPrep) => {
      const first = prep.fixture.store.recoveryApprovals.get(prep.approvalRefs[0]!)!
      const second = prep.fixture.store.recoveryApprovals.get(prep.approvalRefs[1]!)!
      return { first, second }
    }

    await expectRegisterFails('recovery_participant_approval_invalid', {}, { participantApprovalRefs: ['bad proof', 'trusted-approval:2'] })
    const wrongActor = await prepareSuspendedSuccession()
    await expectCode(registerSuccession(wrongActor, { context: wrongActor.fixture.nextContext(wrongActor.active.accountRef, wrongActor.created.owner, 'wrong-actor') }), 'succession_authorization_invalid')
    await expectRegisterFails('succession_forbidden_by_recovery_policy', { policy: NO_TRANSFER_REV1 })
    const wrongIncumbent = await prepareSuspendedSuccession()
    await expectCode(registerSuccession(wrongIncumbent, { incumbentOwnerPrincipalRef: wrongIncumbent.fixture.store.seedPrincipal('9') }), 'succession_authorization_invalid')
    await expectCode(registerSuccession(wrongIncumbent, { incumbentOwnerPrincipalRef: wrongIncumbent.successor }), 'succession_authorization_invalid')
    await expectRegisterFails('recovery_participant_threshold_unmet', { approvalCount: 1 })
    await expectRegisterFails('recovery_participant_approval_invalid', { approvalCount: 4 })
    await expectRegisterFails('recovery_participant_approval_invalid', {}, {}, (prep) => { prep.fixture.store.recoveryApprovals.delete(prep.approvalRefs[0]!) })
    await expectRegisterFails('recovery_participant_approval_invalid', { mutate: mutateFirst((approval) => ({ ...approval, accountRef: accountRef('acc_ffffffffffffffffffffffffffffffff') })) })
    await expectRegisterFails('recovery_participant_approval_invalid', { mutate: mutateFirst((approval) => ({
      ...approval,
      createdBy: { ...approval.createdBy, activeAccountRef: accountRef('acc_ffffffffffffffffffffffffffffffff') },
    })) })
    await expectRegisterFails('recovery_participant_approval_invalid', { mutate: mutateFirst((approval) => ({
      ...approval,
      createdBy: { ...approval.createdBy, actorPrincipalRef: approval.incumbentOwnerPrincipalRef },
    })) })
    await expectRegisterFails('recovery_participant_approval_invalid', { mutate: mutateFirst((approval) => ({ ...approval, createdAt: approval.verifiedAt + 1 })) })
    await expectRegisterFails('recovery_participant_approval_invalid', { mutate: mutateFirst((approval) => ({ ...approval, createdAt: 1.5 })) })
    await expectRegisterFails('recovery_participant_approval_invalid', { mutate: mutateFirst((approval) => ({ ...approval, createdAt: approval.frozenAt - 1 })) })
    await expectRegisterFails('recovery_participant_approval_invalid', { mutate: mutateFirst((approval) => ({
      ...approval,
      createdBy: undefined as unknown as AccountActionContext,
    })) })
    await expectRegisterFails('recovery_participant_approval_invalid', { mutate: mutateFirst((approval) => ({ ...approval, successorOwnerPrincipalRef: approval.incumbentOwnerPrincipalRef })) })
    await expectRegisterFails('recovery_participant_approval_invalid', { mutate: mutateFirst((approval) => ({ ...approval, recoveryPolicyRevision: 99 })) })
    await expectRegisterFails('recovery_participant_approval_invalid', { mutate: mutateFirst((approval) => ({ ...approval, frozenAt: approval.frozenAt - 1 })) })
    await expectRegisterFails('recovery_participant_approval_invalid', { mutate: mutateFirst((approval) => ({ ...approval, lifecycle: 'revoked' })) })
    await expectRegisterFails('recovery_participant_duplicate', {}, {}, (prep) => {
      const { first, second } = approvalPair(prep)
      prep.fixture.store.seedRecoveryApproval({
        ...second,
        participantPrincipalRef: first.participantPrincipalRef,
        createdBy: { ...second.createdBy, actorPrincipalRef: first.participantPrincipalRef },
      })
    })
    await expectRegisterFails('recovery_participant_duplicate', {}, {}, (prep) => {
      const { first, second } = approvalPair(prep)
      prep.fixture.store.seedRecoveryApproval({ ...second, verificationRef: first.verificationRef })
    })
    await expectRegisterFails('recovery_participant_duplicate', {}, {}, (prep) => {
      const { first, second } = approvalPair(prep)
      prep.fixture.store.seedRecoveryApproval({
        ...second,
        createdBy: { ...second.createdBy, idempotencyRef: first.createdBy.idempotencyRef },
      })
    })
    await expectRegisterFails('succession_authorization_ref_conflict', {}, {}, (prep) => {
      prep.fixture.store.successionAuthorizations.set('sau_00000000000040008000000000000003', {} as SuccessionAuthorization)
    })
    await expectRegisterFails('succession_authorization_invalid', { uuids: [uuid(1), uuid(2), 'invalid'] })
  })

  it('resolves only canonical authorizations and rejects stale, mutated, premature and expired records', async () => {
    const resolved = await prepareRegisteredSuccession()
    await expect(resolved.fixture.registry.getSuccessionAuthorization(resolved.registered.authorization.authorizationRef))
      .resolves.toBe(resolved.registered.authorization)
    await expectCode(resolved.fixture.registry.getSuccessionAuthorization('not-canonical'), 'succession_authorization_invalid')

    const wrongActor = await prepareRegisteredSuccession()
    await expectCode(attemptRegisteredSuccession(wrongActor, wrongActor.created.owner), 'succession_authorization_invalid')

    for (const mutate of [
      (authorization: SuccessionAuthorization): SuccessionAuthorization => ({ ...authorization, accountRef: accountRef('acc_ffffffffffffffffffffffffffffffff') }),
      (authorization: SuccessionAuthorization): SuccessionAuthorization => ({ ...authorization, incumbentOwnerPrincipalRef: authorization.successorOwnerPrincipalRef }),
      (authorization: SuccessionAuthorization): SuccessionAuthorization => ({ ...authorization, successorOwnerPrincipalRef: authorization.incumbentOwnerPrincipalRef }),
      (authorization: SuccessionAuthorization): SuccessionAuthorization => ({ ...authorization, recoveryPolicyRevision: 99 }),
      (authorization: SuccessionAuthorization): SuccessionAuthorization => ({ ...authorization, frozenAccountRevision: authorization.frozenAccountRevision - 1 }),
      (authorization: SuccessionAuthorization): SuccessionAuthorization => ({ ...authorization, frozenAt: authorization.frozenAt - 1 }),
      (authorization: SuccessionAuthorization): SuccessionAuthorization => ({ ...authorization, verifiedParticipantCount: 1 }),
    ]) {
      const corrupted = await prepareRegisteredSuccession()
      corrupted.fixture.store.successionAuthorizations.set(
        corrupted.registered.authorization.authorizationRef,
        Object.freeze(mutate(corrupted.registered.authorization)),
      )
      await expectCode(attemptRegisteredSuccession(corrupted), 'succession_authorization_invalid')
    }

    const stalePolicy = await prepareRegisteredSuccession()
    stalePolicy.fixture.store.accounts.set(stalePolicy.active.accountRef, Object.freeze({
      ...stalePolicy.suspended,
      recoveryPolicy: { ...stalePolicy.suspended.recoveryPolicy, revision: 2 },
    }))
    await expectCode(attemptRegisteredSuccession(stalePolicy), 'succession_authorization_invalid')

    const premature = await prepareRegisteredSuccession({ delayMs: 20 })
    await expectCode(attemptRegisteredSuccession(premature), 'succession_authorization_invalid')

    const expired = await prepareRegisteredSuccession({ expiresAt: 45 })
    await expectCode(attemptRegisteredSuccession(expired), 'succession_authorization_expired')
  })

  it('rejects missing, malformed and untrusted succession authorization references', async () => {
    const fixture = setup({ times: [10, 20, 30, 40, 40, 40, 40, 40, 40, 40, 40, 40] })
    const { active, suspended } = await suspendedAccountBundle(fixture)
    const successor = fixture.store.seedPrincipal('2')
    const attempt = async (authorizationRef: string | undefined): Promise<unknown> => await fixture.registry.succeedOwnership({
      accountRef: active.accountRef,
      successorOwnerPrincipalRef: successor,
      expectedAccountRevision: suspended.revision,
      expectedOwnershipRevision: 1,
      authorizationRef: authorizationRef as string,
      context: fixture.nextContext(active.accountRef, successor, 'succession'),
    })
    await expectCode(attempt(undefined), 'succession_authorization_invalid')
    await expectCode(attempt('bad proof'), 'succession_authorization_invalid')
    await expectCode(attempt('sau_ffffffffffffffffffffffffffffffff'), 'succession_authorization_not_found')
  })

  it('requires suspension for succession and active state for voluntary transfer', async () => {
    const fixture = setup({ times: [10, 20, 30] })
    const { active } = await activeAccountBundle(fixture)
    const successor = fixture.store.seedPrincipal('2')
    await expectCode(fixture.registry.succeedOwnership({ accountRef: active.accountRef, successorOwnerPrincipalRef: successor, expectedAccountRevision: 2, expectedOwnershipRevision: 1, authorizationRef: 'sau_ffffffffffffffffffffffffffffffff', context: fixture.nextContext(active.accountRef, successor, 'succession') }), 'account_lifecycle_transition_forbidden')
  })

  it('proves exactly one active Account context and explicit cross-Account attribution', async () => {
    const fixture = setup({ times: [10, 11, 20, 21, 30] })
    const first = await activeAccountBundle(fixture, 'agent')
    const second = await activeAccountBundle(fixture, 'organization')
    const context = fixture.nextContext(first.active.accountRef, first.created.owner, 'cross-account')
    const activeStranger = fixture.store.seedPrincipal('3')
    await expectCode(
      fixture.registry.requireActiveContext(fixture.nextContext(first.active.accountRef, activeStranger, 'stranger')),
      'account_context_access_denied',
    )
    await expect(fixture.registry.requireActiveContext(context)).resolves.toEqual({
      accountRef: first.active.accountRef,
      actorPrincipalRef: first.created.owner,
      accountRevision: first.active.revision,
      correlationRef: 'correlation:cross-account',
      idempotencyRef: 'idempotency:cross-account',
    })
    await expect(fixture.registry.attributeCrossAccountAction({ context, counterpartyAccountRef: second.active.accountRef })).resolves.toMatchObject({
      activeAccountRef: first.active.accountRef,
      counterpartyAccountRef: second.active.accountRef,
      actorPrincipalRef: first.created.owner,
      activeAccountRevision: first.active.revision,
      counterpartyAccountRevision: second.active.revision,
    })
    expect([...fixture.store.memberships.values()].some(
      (membership) => membership.accountRef === second.active.accountRef
        && membership.memberPrincipalRef === first.created.owner,
    )).toBe(false)
    await expectCode(fixture.registry.attributeCrossAccountAction({ context, counterpartyAccountRef: first.active.accountRef }), 'account_cross_account_self_forbidden')
  })

  it('accepts an active Membership as Account-context access without conflating it with ownership', async () => {
    const fixture = setup({ times: [10, 20, 30] })
    const { created, active } = await activeAccountBundle(fixture)
    const member = fixture.store.seedPrincipal('2', 'agent')
    const added = await addMembershipFor(fixture, active, created.owner, member, active.revision, 'add-member')

    await expect(fixture.registry.requireActiveContext(
      fixture.nextContext(active.accountRef, member, 'member-work'),
    )).resolves.toMatchObject({
      accountRef: active.accountRef,
      actorPrincipalRef: member,
      accountRevision: added.account.revision,
    })
    expect(fixture.store.ownerships.get(created.ownership.ownershipRef)?.ownerPrincipalRef).toBe(created.owner)
  })

  it('rejects inactive actors and non-operational counterparties for protected context proofs', async () => {
    const fixture = setup({ times: [10, 11, 20, 21, 30] })
    const first = await activeAccountBundle(fixture)
    const second = await activeAccountBundle(fixture)
    const inactive = fixture.store.seedPrincipal('3', 'human', 'suspended')
    await expectCode(fixture.registry.requireActiveContext(fixture.nextContext(first.active.accountRef, inactive, 'inactive')), 'principal_inactive')
    await suspendAccountRevision(fixture, second.active, second.created.owner, 2, 'suspend')
    await expectCode(fixture.registry.attributeCrossAccountAction({ context: fixture.nextContext(first.active.accountRef, first.created.owner, 'cross'), counterpartyAccountRef: second.active.accountRef }), 'account_not_operational')
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
    const created = await registry.create(createRequest(owner, { displayName: 'Default factories', correlationRef: corr('default'), idempotencyRef: idem('default') }))
    expect(created.account.accountRef).toMatch(/^acc_[0-9a-f]{32}$/u)
    expect(created.ownership.ownershipRef).toMatch(/^own_[0-9a-f]{32}$/u)
    expect(created.account.createdAt).toBeGreaterThan(0)
  })
})
