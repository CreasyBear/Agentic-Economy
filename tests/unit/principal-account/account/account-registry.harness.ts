import { expect } from 'vitest'

import {
  AccountRegistry,
  accountRef,
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
  type SuccessionAuthorizationParticipant,
  type VerifiedRecoveryParticipantApproval,
} from '../../../../src/modules/principal-account/account/public'
import {
  principalRef,
  type Principal,
  type PrincipalKind,
  type PrincipalLifecycle,
  type PrincipalRef,
} from '../../../../src/modules/principal-account/principal/public'

export class MemoryAccountStore implements AccountRegistryStore {
  readonly principals = new Map<PrincipalRef, Principal>()
  readonly accounts = new Map<AccountRef, Account>()
  readonly ownerships = new Map<OwnershipRef, AccountOwnership>()
  readonly memberships = new Map<MembershipRef, Membership>()
  readonly recoveryApprovals = new Map<string, VerifiedRecoveryParticipantApproval>()
  readonly successionAuthorizations = new Map<string, SuccessionAuthorization>()
  readonly successionAuthorizationParticipants: SuccessionAuthorizationParticipant[] = []
  readonly commits: AccountRegistryCommit[] = []
  #transactionTail: Promise<void> = Promise.resolve()

  async transact<Result>(operation: (transaction: AccountRegistryTransaction) => Promise<Result>): Promise<Result> {
    const previous = this.#transactionTail
    let release: (() => void) | undefined
    this.#transactionTail = new Promise<void>((resolve) => {
      release = resolve
    })
    await previous
    try {
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
      getVerifiedRecoveryParticipantApproval: async (ref) => this.recoveryApprovals.get(ref),
      getSuccessionAuthorization: async (ref) => this.successionAuthorizations.get(ref),
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
        for (const participant of change.successionAuthorizationParticipantInserts ?? []) {
          this.successionAuthorizationParticipants.push(participant)
        }
        if (change.successionAuthorizationInsert !== undefined) {
          this.successionAuthorizations.set(change.successionAuthorizationInsert.authorizationRef, change.successionAuthorizationInsert)
        }
        if (change.successionAuthorizationReplacement !== undefined) {
          this.successionAuthorizations.set(
            change.successionAuthorizationReplacement.value.authorizationRef,
            change.successionAuthorizationReplacement.value,
          )
        }
      },
      })
    } finally {
      release?.()
    }
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

  seedRecoveryApproval(approval: VerifiedRecoveryParticipantApproval): void {
    this.recoveryApprovals.set(approval.approvalRef, Object.freeze(approval))
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
    if (change.successionAuthorizationInsert !== undefined
      && this.successionAuthorizations.has(change.successionAuthorizationInsert.authorizationRef)) {
      throw new Error('test_succession_authorization_insert_conflict')
    }
    if (change.successionAuthorizationReplacement !== undefined) {
      expect(this.successionAuthorizations.get(change.successionAuthorizationReplacement.value.authorizationRef)?.revision)
        .toBe(change.successionAuthorizationReplacement.expectedRevision)
    }
  }
}

export const uuid = (suffix: number): string => `00000000-0000-4000-8000-${String(suffix).padStart(12, '0')}`

export function setup(options: Readonly<{
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

export const THRESHOLD_POLICY: RecoveryPolicy = {
  kind: 'threshold',
  threshold: 2,
  participantCount: 3,
  delayMs: 5,
  freezeRequired: true,
  revision: 1,
}
export const NO_TRANSFER_REV1: RecoveryPolicy = { kind: 'no_transfer', revision: 1 }

export type Harness = ReturnType<typeof setup>
export type CreatedBundle = Readonly<{ account: Account; ownership: AccountOwnership; owner: PrincipalRef }>

export const corr = (suffix: string): string => `correlation:${suffix}`
export const idem = (suffix: string): string => `idempotency:${suffix}`

export function createRequest(
  owner: PrincipalRef,
  overrides: Readonly<{
    displayName?: string
    recoveryPolicy?: RecoveryPolicy
    correlationRef?: string
    idempotencyRef?: string
  }> = {},
) {
  return {
    ownerPrincipalRef: owner,
    displayName: overrides.displayName ?? 'Account',
    recoveryPolicy: overrides.recoveryPolicy ?? NO_TRANSFER_REV1,
    correlationRef: overrides.correlationRef ?? corr('1'),
    idempotencyRef: overrides.idempotencyRef ?? idem('1'),
  }
}

export function primaryCreateRequest(
  owner: PrincipalRef,
  overrides: Readonly<{ displayName?: string; recoveryPolicy?: RecoveryPolicy }> = {},
) {
  return createRequest(owner, {
    displayName: overrides.displayName ?? 'Primary tenancy',
    recoveryPolicy: overrides.recoveryPolicy ?? THRESHOLD_POLICY,
    correlationRef: corr('retry'),
    idempotencyRef: idem('create'),
  })
}

export async function expectRegistryCreate(
  registry: AccountRegistry,
  owner: PrincipalRef,
  code: string,
  overrides?: Parameters<typeof createRequest>[1],
): Promise<void> {
  await expectCode(registry.create(createRequest(owner, overrides)), code)
}

export async function activateAccountRevision(
  fixture: Harness,
  account: Account,
  owner: PrincipalRef,
  expectedRevision: number,
  contextSuffix: string,
): Promise<Account> {
  return await fixture.registry.activate({
    accountRef: account.accountRef,
    expectedRevision,
    context: fixture.nextContext(account.accountRef, owner, contextSuffix),
  })
}

export async function suspendAccountRevision(
  fixture: Harness,
  account: Account,
  owner: PrincipalRef,
  expectedRevision: number,
  contextSuffix: string,
): Promise<Account> {
  return await fixture.registry.suspend({
    accountRef: account.accountRef,
    expectedRevision,
    context: fixture.nextContext(account.accountRef, owner, contextSuffix),
  })
}

export async function activeAccountBundle(
  fixture: Harness,
  ownerKind: PrincipalKind = 'human',
  recoveryPolicy?: RecoveryPolicy,
): Promise<{ created: CreatedBundle; active: Account }> {
  const created = await createAccount(fixture, ownerKind, recoveryPolicy)
  return { created, active: await activateAccount(fixture, created) }
}

export async function suspendedAccountBundle(
  fixture: Harness,
  ownerKind: PrincipalKind = 'human',
  recoveryPolicy?: RecoveryPolicy,
  suspendSuffix = 'suspend',
): Promise<{ created: CreatedBundle; active: Account; suspended: Account }> {
  const { created, active } = await activeAccountBundle(fixture, ownerKind, recoveryPolicy)
  return {
    created,
    active,
    suspended: await suspendAccountRevision(fixture, active, created.owner, active.revision, suspendSuffix),
  }
}

export async function addMembershipFor(
  fixture: Harness,
  account: Account,
  owner: PrincipalRef,
  member: PrincipalRef,
  expectedAccountRevision: number,
  contextSuffix: string,
) {
  return await fixture.registry.addMembership({
    accountRef: account.accountRef,
    memberPrincipalRef: member,
    expectedAccountRevision,
    context: fixture.nextContext(account.accountRef, owner, contextSuffix),
  })
}

export async function endMembershipFor(
  fixture: Harness,
  account: Account,
  owner: PrincipalRef,
  membershipRef: MembershipRef,
  expectedAccountRevision: number,
  expectedMembershipRevision: number,
  contextSuffix: string,
) {
  return await fixture.registry.endMembership({
    accountRef: account.accountRef,
    membershipRef,
    expectedAccountRevision,
    expectedMembershipRevision,
    context: fixture.nextContext(account.accountRef, owner, contextSuffix),
  })
}

export function corruptOwnership(
  store: MemoryAccountStore,
  ownership: AccountOwnership,
  mode: 'delete' | 'account-mismatch' | 'ended',
): void {
  if (mode === 'delete') {
    store.ownerships.delete(ownership.ownershipRef)
    return
  }
  if (mode === 'account-mismatch') {
    store.ownerships.set(
      ownership.ownershipRef,
      Object.freeze({ ...ownership, accountRef: accountRef('acc_ffffffffffffffffffffffffffffffff') }),
    )
    return
  }
  store.ownerships.set(ownership.ownershipRef, Object.freeze({ ...ownership, lifecycle: 'ended' }))
}

export type SuccessionPrep = Readonly<{
  fixture: Harness
  created: CreatedBundle
  active: Account
  suspended: Account
  successor: PrincipalRef
  approvalRefs: readonly string[]
}>

export async function prepareSuspendedSuccession(
  options: Readonly<{
    times?: readonly number[] | undefined
    uuids?: readonly string[] | undefined
    policy?: RecoveryPolicy | undefined
    approvalCount?: number | undefined
    mutate?: ((approval: VerifiedRecoveryParticipantApproval, index: number) => VerifiedRecoveryParticipantApproval) | undefined
    suspendSuffix?: string | undefined
    successorKind?: PrincipalKind | undefined
  }> = {},
): Promise<SuccessionPrep> {
  const fixture = setup({
    times: options.times ?? [10, 20, 30, 40, 40, 40],
    ...(options.uuids === undefined ? {} : { uuids: options.uuids }),
  })
  const created = await createAccount(fixture, 'human', options.policy ?? THRESHOLD_POLICY)
  const active = await activateAccount(fixture, created)
  const suspended = await suspendAccountRevision(fixture, active, created.owner, 2, options.suspendSuffix ?? 'freeze')
  const successor = fixture.store.seedPrincipal('2', options.successorKind ?? 'human')
  const approvalRefs = seedRecoveryApprovals(fixture, suspended, created.owner, successor, {
    ...(options.approvalCount === undefined ? {} : { count: options.approvalCount }),
    ...(options.mutate === undefined ? {} : { mutate: options.mutate }),
  })
  return { fixture, created, active, suspended, successor, approvalRefs }
}

export async function registerSuccession(
  prepared: SuccessionPrep,
  overrides: Readonly<Record<string, unknown>> = {},
  contextSuffix = 'authorize',
) {
  return await prepared.fixture.registry.registerSuccessionAuthorization({
    accountRef: prepared.active.accountRef,
    incumbentOwnerPrincipalRef: prepared.created.owner,
    successorOwnerPrincipalRef: prepared.successor,
    expectedAccountRevision: prepared.suspended.revision,
    expectedOwnershipRevision: 1,
    participantApprovalRefs: prepared.approvalRefs,
    expiresAt: 100,
    context: prepared.fixture.nextContext(prepared.active.accountRef, prepared.successor, contextSuffix),
    ...overrides,
  })
}

export async function prepareRegisteredSuccession(
  options: Readonly<{ delayMs?: number; expiresAt?: number }> = {},
): Promise<SuccessionPrep & { registered: Awaited<ReturnType<typeof registerSuccession>> }> {
  const prep = await prepareSuspendedSuccession({
    times: [10, 20, 30, 40, 45, 60],
    policy: {
      kind: 'threshold',
      threshold: 2,
      participantCount: 3,
      delayMs: options.delayMs ?? 5,
      freezeRequired: true,
      revision: 1,
    },
    mutate: (approval) => ({ ...approval, expiresAt: 200 }),
  })
  const registered = await registerSuccession(prep, { expiresAt: options.expiresAt ?? 100 })
  return { ...prep, registered }
}

export async function attemptRegisteredSuccession(
  prepared: SuccessionPrep & { registered: Awaited<ReturnType<typeof registerSuccession>> },
  actor?: PrincipalRef,
) {
  return await prepared.fixture.registry.succeedOwnership({
    accountRef: prepared.active.accountRef,
    successorOwnerPrincipalRef: prepared.successor,
    expectedAccountRevision: prepared.suspended.revision,
    expectedOwnershipRevision: 1,
    authorizationRef: prepared.registered.authorization.authorizationRef,
    context: prepared.fixture.nextContext(prepared.active.accountRef, actor ?? prepared.successor, 'succeed'),
  })
}

export async function createAccount(
  fixture: ReturnType<typeof setup>,
  ownerKind: PrincipalKind = 'human',
  recoveryPolicy: RecoveryPolicy = THRESHOLD_POLICY,
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

export async function activateAccount(
  fixture: ReturnType<typeof setup>,
  created: Awaited<ReturnType<typeof createAccount>>,
): Promise<Account> {
  return await activateAccountRevision(fixture, created.account, created.owner, created.account.revision, 'activate')
}

export function seedRecoveryApprovals(
  fixture: ReturnType<typeof setup>,
  account: Account,
  incumbentOwnerPrincipalRef: PrincipalRef,
  successorOwnerPrincipalRef: PrincipalRef,
  options: Readonly<{
    count?: number
    mutate?: (approval: VerifiedRecoveryParticipantApproval, index: number) => VerifiedRecoveryParticipantApproval
  }> = {},
): readonly string[] {
  const approvalRefs: string[] = []
  for (let index = 0; index < (options.count ?? 2); index += 1) {
    const participantPrincipalRef = fixture.store.seedPrincipal(String(100 + index))
    const approval: VerifiedRecoveryParticipantApproval = {
      approvalRef: `trusted-approval:${index + 1}`,
      accountRef: account.accountRef,
      participantPrincipalRef,
      incumbentOwnerPrincipalRef,
      successorOwnerPrincipalRef,
      recoveryPolicyRevision: account.recoveryPolicy.revision,
      frozenAccountRevision: account.revision,
      frozenAt: account.updatedAt,
      verifiedAt: account.updatedAt + 1,
      expiresAt: account.updatedAt + 100,
      verificationRef: `trusted-verification:${index + 1}`,
      lifecycle: 'verified',
      createdAt: account.updatedAt + 1,
      createdBy: fixture.nextContext(account.accountRef, participantPrincipalRef, `approve-recovery-${index + 1}`),
    }
    const stored = options.mutate?.(approval, index) ?? approval
    fixture.store.seedRecoveryApproval(stored)
    approvalRefs.push(stored.approvalRef)
  }
  return approvalRefs
}

export async function expectCode(promise: Promise<unknown>, code: string): Promise<void> {
  await expect(promise).rejects.toMatchObject({ name: 'AccountRegistryError', message: code, code })
}
