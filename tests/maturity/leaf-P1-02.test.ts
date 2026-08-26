import { describe, expect, it } from 'vitest'

import {
  AccountRegistry,
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
  type SuccessionAuthorization,
  type VerifiedRecoveryParticipantApproval,
} from '../../src/modules/principal-account/account/public'
import {
  principalRef,
  type Principal,
  type PrincipalKind,
  type PrincipalRef,
} from '../../src/modules/principal-account/principal/public'

class ContractStore implements AccountRegistryStore {
  readonly principals = new Map<PrincipalRef, Principal>()
  readonly accounts = new Map<AccountRef, Account>()
  readonly ownerships = new Map<OwnershipRef, AccountOwnership>()
  readonly memberships = new Map<MembershipRef, Membership>()
  readonly recoveryApprovals = new Map<string, VerifiedRecoveryParticipantApproval>()
  readonly successionAuthorizations = new Map<string, SuccessionAuthorization>()
  commits = 0

  async transact<Result>(operation: (transaction: AccountRegistryTransaction) => Promise<Result>): Promise<Result> {
    return await operation({
      getPrincipal: async (ref) => this.principals.get(ref),
      getAccount: async (ref) => this.accounts.get(ref),
      getAccountByCreationIdempotency: async (actor, idempotency) => [...this.accounts.values()].find(
        (account) => account.creationActorPrincipalRef === actor && account.creationIdempotencyRef === idempotency,
      ),
      getOwnership: async (ref) => this.ownerships.get(ref),
      getMembership: async (ref) => this.memberships.get(ref),
      getActiveMembership: async (accountRef, memberPrincipalRef) => [...this.memberships.values()].find(
        (membership) => membership.accountRef === accountRef
          && membership.memberPrincipalRef === memberPrincipalRef
          && membership.lifecycle === 'active',
      ),
      getVerifiedRecoveryParticipantApproval: async (ref) => this.recoveryApprovals.get(ref),
      getSuccessionAuthorization: async (ref) => this.successionAuthorizations.get(ref),
      commit: async (change) => this.apply(change),
    })
  }

  principal(suffix: number, kind: PrincipalKind): PrincipalRef {
    const ref = principalRef(`prn_${String(suffix).padStart(32, '0')}`)
    this.principals.set(ref, Object.freeze({ principalRef: ref, kind, displayName: `${kind}-${suffix}`, lifecycle: 'active', revision: 1, createdAt: 1, updatedAt: 1 }))
    return ref
  }

  recoveryApproval(approval: VerifiedRecoveryParticipantApproval): void {
    this.recoveryApprovals.set(approval.approvalRef, Object.freeze(approval))
  }

  private apply(change: AccountRegistryCommit): void {
    this.commits += 1
    if (change.accountInsert !== undefined) this.accounts.set(change.accountInsert.accountRef, change.accountInsert)
    if (change.accountReplacement !== undefined) this.accounts.set(change.accountReplacement.value.accountRef, change.accountReplacement.value)
    for (const ownership of change.ownershipInserts ?? []) this.ownerships.set(ownership.ownershipRef, ownership)
    for (const replacement of change.ownershipReplacements ?? []) this.ownerships.set(replacement.value.ownershipRef, replacement.value)
    for (const membership of change.membershipInserts ?? []) this.memberships.set(membership.membershipRef, membership)
    for (const replacement of change.membershipReplacements ?? []) this.memberships.set(replacement.value.membershipRef, replacement.value)
    if (change.successionAuthorizationInsert !== undefined) this.successionAuthorizations.set(change.successionAuthorizationInsert.authorizationRef, change.successionAuthorizationInsert)
    if (change.successionAuthorizationReplacement !== undefined) this.successionAuthorizations.set(change.successionAuthorizationReplacement.value.authorizationRef, change.successionAuthorizationReplacement.value)
  }
}

function fixture(): Readonly<{
  registry: AccountRegistry
  store: ContractStore
  context(accountRef: AccountRef, actorPrincipalRef: PrincipalRef, operation: string): AccountActionContext
}> {
  const store = new ContractStore()
  let clock = 0
  let uuidSequence = 0
  return {
    registry: new AccountRegistry(store, {
      now: () => (clock += 1_000),
      randomUuid: () => `00000000-0000-4000-8000-${String(++uuidSequence).padStart(12, '0')}`,
    }),
    store,
    context: (accountRef, actorPrincipalRef, operation) => ({
      actorPrincipalRef,
      activeAccountRef: accountRef,
      correlationRef: `correlation:${operation}`,
      idempotencyRef: `idempotency:${operation}`,
    }),
  }
}

describe('P1-02 Account ownership and lifecycle contract', () => {
  it('lets an autonomous agent directly own and activate a credential-independent Account', async () => {
    const setup = fixture()
    const agent = setup.store.principal(1, 'agent')
    const created = await setup.registry.create({
      ownerPrincipalRef: agent,
      displayName: 'Autonomous operating account',
      recoveryPolicy: { kind: 'threshold', threshold: 2, participantCount: 3, delayMs: 86_400_000, freezeRequired: true, revision: 1 },
      correlationRef: 'correlation:create',
      idempotencyRef: 'idempotency:create',
    })
    const active = await setup.registry.activate({
      accountRef: created.account.accountRef,
      expectedRevision: 1,
      context: setup.context(created.account.accountRef, agent, 'activate'),
    })

    expect(active.lifecycle).toBe('active')
    expect(created.ownership.ownerPrincipalRef).toBe(agent)
    expect(created.account.accountRef).toMatch(/^acc_[0-9a-f]{32}$/u)
    expect(JSON.stringify({ account: active, ownership: created.ownership })).not.toMatch(/credential|provider|clerk|subject/iu)
  })

  it('proves impossible lifecycle transitions are deterministic and closed Accounts cannot protect work', async () => {
    const setup = fixture()
    const owner = setup.store.principal(1, 'human')
    const created = await setup.registry.create({ ownerPrincipalRef: owner, displayName: 'Lifecycle', recoveryPolicy: { kind: 'no_transfer', revision: 1 }, correlationRef: 'correlation:create', idempotencyRef: 'idempotency:create' })
    await expect(setup.registry.suspend({ accountRef: created.account.accountRef, expectedRevision: 1, context: setup.context(created.account.accountRef, owner, 'suspend-pending') })).rejects.toMatchObject({ code: 'account_lifecycle_transition_forbidden' })
    const active = await setup.registry.activate({ accountRef: created.account.accountRef, expectedRevision: 1, context: setup.context(created.account.accountRef, owner, 'activate') })
    await expect(setup.registry.close({ accountRef: active.accountRef, expectedAccountRevision: 2, expectedOwnershipRevision: 1, context: setup.context(active.accountRef, owner, 'close-active') })).rejects.toMatchObject({ code: 'account_lifecycle_transition_forbidden' })
    const suspended = await setup.registry.suspend({ accountRef: active.accountRef, expectedRevision: 2, context: setup.context(active.accountRef, owner, 'suspend') })
    const closed = await setup.registry.close({ accountRef: active.accountRef, expectedAccountRevision: suspended.revision, expectedOwnershipRevision: 1, context: setup.context(active.accountRef, owner, 'close') })
    await expect(setup.registry.activate({ accountRef: active.accountRef, expectedRevision: closed.account.revision, context: setup.context(active.accountRef, owner, 'reopen') })).rejects.toMatchObject({ code: 'account_lifecycle_transition_forbidden' })
    await expect(setup.registry.requireActiveContext(setup.context(active.accountRef, owner, 'protected-work'))).rejects.toMatchObject({ code: 'account_not_operational' })
  })

  it('keeps ownership and membership independent through transfer', async () => {
    const setup = fixture()
    const owner = setup.store.principal(1, 'agent')
    const member = setup.store.principal(2, 'workload')
    const successor = setup.store.principal(3, 'agent')
    const created = await setup.registry.create({ ownerPrincipalRef: owner, displayName: 'Separated facts', recoveryPolicy: { kind: 'no_transfer', revision: 1 }, correlationRef: 'correlation:create', idempotencyRef: 'idempotency:create' })
    const active = await setup.registry.activate({ accountRef: created.account.accountRef, expectedRevision: 1, context: setup.context(created.account.accountRef, owner, 'activate') })
    expect(setup.store.memberships).toHaveLength(0)
    const added = await setup.registry.addMembership({ accountRef: active.accountRef, memberPrincipalRef: member, expectedAccountRevision: 2, context: setup.context(active.accountRef, owner, 'member') })
    const transferred = await setup.registry.transferOwnership({ accountRef: active.accountRef, successorOwnerPrincipalRef: successor, expectedAccountRevision: 3, expectedOwnershipRevision: 1, context: setup.context(active.accountRef, owner, 'transfer') })

    expect(transferred.currentOwnership.ownerPrincipalRef).toBe(successor)
    expect(transferred.previousOwnership.ownerPrincipalRef).toBe(owner)
    expect(setup.store.memberships.get(added.membership.membershipRef)).toBe(added.membership)
    expect(added.membership.memberPrincipalRef).toBe(member)
  })

  it('requires suspension and a recovery-policy-bound proof for succession', async () => {
    const setup = fixture()
    const owner = setup.store.principal(1, 'human')
    const successor = setup.store.principal(2, 'agent')
    const created = await setup.registry.create({ ownerPrincipalRef: owner, displayName: 'Succession', recoveryPolicy: { kind: 'threshold', threshold: 2, participantCount: 3, delayMs: 1_000, freezeRequired: true, revision: 7 }, correlationRef: 'correlation:create', idempotencyRef: 'idempotency:create' })
    const active = await setup.registry.activate({ accountRef: created.account.accountRef, expectedRevision: 1, context: setup.context(created.account.accountRef, owner, 'activate') })
    const suspended = await setup.registry.suspend({ accountRef: active.accountRef, expectedRevision: 2, context: setup.context(active.accountRef, owner, 'freeze') })
    for (const [index, participant] of [setup.store.principal(3, 'human'), setup.store.principal(4, 'organization')].entries()) {
      setup.store.recoveryApproval({
        approvalRef: `trusted-approval:${index + 1}`,
        accountRef: active.accountRef,
        participantPrincipalRef: participant,
        incumbentOwnerPrincipalRef: owner,
        successorOwnerPrincipalRef: successor,
        recoveryPolicyRevision: 7,
        frozenAccountRevision: suspended.revision,
        frozenAt: suspended.updatedAt,
        verifiedAt: 3_500 + index,
        expiresAt: 6_000,
        verificationRef: `independent-verification:${index + 1}`,
        lifecycle: 'verified',
        createdAt: 3_500 + index,
        createdBy: setup.context(active.accountRef, participant, `approve-recovery-${index + 1}`),
      })
    }
    const registered = await setup.registry.registerSuccessionAuthorization({ accountRef: active.accountRef, incumbentOwnerPrincipalRef: owner, successorOwnerPrincipalRef: successor, expectedAccountRevision: suspended.revision, expectedOwnershipRevision: 1, participantApprovalRefs: ['trusted-approval:1', 'trusted-approval:2'], expiresAt: 6_000, context: setup.context(active.accountRef, successor, 'authorize-succession') })
    const succeeded = await setup.registry.succeedOwnership({ accountRef: active.accountRef, successorOwnerPrincipalRef: successor, expectedAccountRevision: suspended.revision, expectedOwnershipRevision: 1, authorizationRef: registered.authorization.authorizationRef, context: setup.context(active.accountRef, successor, 'succession') })

    expect(succeeded.currentOwnership).toMatchObject({
      ownerPrincipalRef: successor,
      changeKind: 'succession',
      successionAuthorizationRef: registered.authorization.authorizationRef,
    })
    expect(succeeded.account.lifecycle).toBe('suspended')
  })

  it('binds protected and cross-Account work to one explicit active Account context', async () => {
    const setup = fixture()
    const actor = setup.store.principal(1, 'agent')
    const counterparty = setup.store.principal(2, 'organization')
    const first = await setup.registry.create({ ownerPrincipalRef: actor, displayName: 'Actor tenancy', recoveryPolicy: { kind: 'no_transfer', revision: 1 }, correlationRef: 'correlation:first', idempotencyRef: 'idempotency:first' })
    const firstActive = await setup.registry.activate({ accountRef: first.account.accountRef, expectedRevision: 1, context: setup.context(first.account.accountRef, actor, 'activate-first') })
    const second = await setup.registry.create({ ownerPrincipalRef: counterparty, displayName: 'Counterparty tenancy', recoveryPolicy: { kind: 'no_transfer', revision: 1 }, correlationRef: 'correlation:second', idempotencyRef: 'idempotency:second' })
    const secondActive = await setup.registry.activate({ accountRef: second.account.accountRef, expectedRevision: 1, context: setup.context(second.account.accountRef, counterparty, 'activate-second') })
    const context = setup.context(firstActive.accountRef, actor, 'cross-account')
    const stranger = setup.store.principal(3, 'human')

    await expect(setup.registry.requireActiveContext(context)).resolves.toMatchObject({ accountRef: firstActive.accountRef, actorPrincipalRef: actor })
    await expect(setup.registry.requireActiveContext(setup.context(firstActive.accountRef, stranger, 'stranger'))).rejects.toMatchObject({ code: 'account_context_access_denied' })
    await expect(setup.registry.attributeCrossAccountAction({ context, counterpartyAccountRef: secondActive.accountRef })).resolves.toMatchObject({ activeAccountRef: firstActive.accountRef, counterpartyAccountRef: secondActive.accountRef, actorPrincipalRef: actor })
    expect([...setup.store.memberships.values()].some((membership) => membership.accountRef === secondActive.accountRef && membership.memberPrincipalRef === actor)).toBe(false)
    await expect(setup.registry.attributeCrossAccountAction({ context, counterpartyAccountRef: firstActive.accountRef })).rejects.toMatchObject({ code: 'account_cross_account_self_forbidden' })
  })
})
