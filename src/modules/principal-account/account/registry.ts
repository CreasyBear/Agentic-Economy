import {
  principalRef,
  type Principal,
  type PrincipalRef,
} from '../principal/public'

const ACCOUNT_REF_PATTERN = /^acc_[0-9a-f]{32}$/u
const OWNERSHIP_REF_PATTERN = /^own_[0-9a-f]{32}$/u
const MEMBERSHIP_REF_PATTERN = /^mem_[0-9a-f]{32}$/u
const SUCCESSION_AUTHORIZATION_REF_PATTERN = /^sau_[0-9a-f]{32}$/u
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u
const OPAQUE_REF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/u
const DISPLAY_NAME_MAX_LENGTH = 200

declare const accountRefBrand: unique symbol
declare const ownershipRefBrand: unique symbol
declare const membershipRefBrand: unique symbol

export type AccountRef = string & Readonly<{ [accountRefBrand]: 'AccountRef' }>
export type OwnershipRef = string & Readonly<{ [ownershipRefBrand]: 'OwnershipRef' }>
export type MembershipRef = string & Readonly<{ [membershipRefBrand]: 'MembershipRef' }>

export const ACCOUNT_LIFECYCLES = ['pending_activation', 'active', 'suspended', 'closed'] as const
export type AccountLifecycle = typeof ACCOUNT_LIFECYCLES[number]

export const OWNERSHIP_LIFECYCLES = ['active', 'ended'] as const
export type OwnershipLifecycle = typeof OWNERSHIP_LIFECYCLES[number]

export const MEMBERSHIP_LIFECYCLES = ['active', 'ended'] as const
export type MembershipLifecycle = typeof MEMBERSHIP_LIFECYCLES[number]

export type NoTransferRecoveryPolicy = Readonly<{
  kind: 'no_transfer'
  revision: number
}>

export type ThresholdRecoveryPolicy = Readonly<{
  kind: 'threshold'
  threshold: number
  participantCount: number
  delayMs: number
  freezeRequired: true
  revision: number
}>

export type RecoveryPolicy = NoTransferRecoveryPolicy | ThresholdRecoveryPolicy

export type AccountActionContext = Readonly<{
  actorPrincipalRef: PrincipalRef
  activeAccountRef: AccountRef
  correlationRef: string
  idempotencyRef: string
}>

export type Account = Readonly<{
  accountRef: AccountRef
  displayName: string
  lifecycle: AccountLifecycle
  recoveryPolicy: RecoveryPolicy
  creationActorPrincipalRef: PrincipalRef
  creationIdempotencyRef: string
  initialOwnershipRef: OwnershipRef
  currentOwnershipRef: OwnershipRef
  revision: number
  createdAt: number
  updatedAt: number
  lastAction: AccountActionContext
}>

export type OwnershipChangeKind = 'creation' | 'transfer' | 'succession'

export type AccountOwnership = Readonly<{
  ownershipRef: OwnershipRef
  accountRef: AccountRef
  ownerPrincipalRef: PrincipalRef
  lifecycle: OwnershipLifecycle
  changeKind: OwnershipChangeKind
  revision: number
  createdAt: number
  createdBy: AccountActionContext
  predecessorOwnershipRef?: OwnershipRef
  successionAuthorizationRef?: string
  endedAt?: number
  endedBy?: AccountActionContext
  successorOwnershipRef?: OwnershipRef
}>

export type Membership = Readonly<{
  membershipRef: MembershipRef
  accountRef: AccountRef
  memberPrincipalRef: PrincipalRef
  lifecycle: MembershipLifecycle
  revision: number
  createdAt: number
  createdBy: AccountActionContext
  endedAt?: number
  endedBy?: AccountActionContext
}>

export type VerifiedRecoveryParticipantApproval = Readonly<{
  approvalRef: string
  accountRef: AccountRef
  participantPrincipalRef: PrincipalRef
  incumbentOwnerPrincipalRef: PrincipalRef
  successorOwnerPrincipalRef: PrincipalRef
  recoveryPolicyRevision: number
  frozenAccountRevision: number
  frozenAt: number
  verifiedAt: number
  expiresAt: number
  verificationRef: string
  lifecycle: 'verified' | 'revoked'
  createdAt: number
  createdBy: AccountActionContext
}>

export type SuccessionAuthorizationParticipant = Readonly<{
  authorizationRef: string
  accountRef: AccountRef
  approvalRef: string
  participantPrincipalRef: PrincipalRef
  verificationRef: string
  verifiedAt: number
  recoveryPolicyRevision: number
  frozenAccountRevision: number
  createdAt: number
  createdBy: AccountActionContext
}>

export type SuccessionAuthorization = Readonly<{
  authorizationRef: string
  accountRef: AccountRef
  incumbentOwnerPrincipalRef: PrincipalRef
  successorOwnerPrincipalRef: PrincipalRef
  recoveryPolicyRevision: number
  frozenAccountRevision: number
  frozenAt: number
  availableAt: number
  authorizedAt: number
  expiresAt: number
  verifiedParticipantCount: number
  lifecycle: 'active' | 'consumed'
  revision: number
  createdAt: number
  createdBy: AccountActionContext
  consumedAt?: number
  consumedBy?: AccountActionContext
  successorOwnershipRef?: OwnershipRef
}>

export type ActiveAccountContext = Readonly<{
  accountRef: AccountRef
  actorPrincipalRef: PrincipalRef
  accountRevision: number
  correlationRef: string
  idempotencyRef: string
}>

export type CrossAccountAttribution = Readonly<{
  actorPrincipalRef: PrincipalRef
  activeAccountRef: AccountRef
  counterpartyAccountRef: AccountRef
  correlationRef: string
  idempotencyRef: string
  activeAccountRevision: number
  counterpartyAccountRevision: number
}>

export type AccountRegistryErrorCode =
  | 'account_context_access_denied'
  | 'account_context_mismatch'
  | 'account_cross_account_self_forbidden'
  | 'account_display_name_invalid'
  | 'account_idempotency_ref_invalid'
  | 'account_idempotency_conflict'
  | 'account_lifecycle_transition_forbidden'
  | 'account_not_found'
  | 'account_not_operational'
  | 'account_ref_conflict'
  | 'account_ref_invalid'
  | 'account_revision_conflict'
  | 'account_timestamp_invalid'
  | 'correlation_ref_invalid'
  | 'membership_account_mismatch'
  | 'membership_active_conflict'
  | 'membership_lifecycle_transition_forbidden'
  | 'membership_not_found'
  | 'membership_ref_conflict'
  | 'membership_ref_invalid'
  | 'membership_revision_conflict'
  | 'owner_context_required'
  | 'ownership_account_mismatch'
  | 'ownership_lifecycle_transition_forbidden'
  | 'ownership_not_found'
  | 'ownership_ref_conflict'
  | 'ownership_ref_invalid'
  | 'ownership_revision_conflict'
  | 'principal_inactive'
  | 'principal_not_found'
  | 'recovery_policy_invalid'
  | 'recovery_participant_approval_invalid'
  | 'recovery_participant_duplicate'
  | 'recovery_participant_threshold_unmet'
  | 'succession_authorization_expired'
  | 'succession_authorization_invalid'
  | 'succession_authorization_not_found'
  | 'succession_authorization_consumed'
  | 'succession_authorization_ref_conflict'
  | 'succession_forbidden_by_recovery_policy'
  | 'successor_same_as_incumbent'

export class AccountRegistryError extends Error {
  readonly code: AccountRegistryErrorCode

  constructor(code: AccountRegistryErrorCode) {
    super(code)
    this.name = 'AccountRegistryError'
    this.code = code
  }
}

export type RevisionedReplacement<Value> = Readonly<{
  value: Value
  expectedRevision: number
}>

export type AccountRegistryCommit = Readonly<{
  accountInsert?: Account
  accountReplacement?: RevisionedReplacement<Account>
  ownershipInserts?: readonly AccountOwnership[]
  ownershipReplacements?: readonly RevisionedReplacement<AccountOwnership>[]
  membershipInserts?: readonly Membership[]
  membershipReplacements?: readonly RevisionedReplacement<Membership>[]
  successionAuthorizationParticipantInserts?: readonly SuccessionAuthorizationParticipant[]
  successionAuthorizationInsert?: SuccessionAuthorization
  successionAuthorizationReplacement?: RevisionedReplacement<SuccessionAuthorization>
}>

export type AccountRegistryTransaction = Readonly<{
  getPrincipal(principalRef: PrincipalRef): Promise<Principal | undefined>
  getAccount(accountRef: AccountRef): Promise<Account | undefined>
  getAccountByCreationIdempotency(actorPrincipalRef: PrincipalRef, idempotencyRef: string): Promise<Account | undefined>
  getOwnership(ownershipRef: OwnershipRef): Promise<AccountOwnership | undefined>
  getMembership(membershipRef: MembershipRef): Promise<Membership | undefined>
  getActiveMembership(accountRef: AccountRef, memberPrincipalRef: PrincipalRef): Promise<Membership | undefined>
  getVerifiedRecoveryParticipantApproval(approvalRef: string): Promise<VerifiedRecoveryParticipantApproval | undefined>
  getSuccessionAuthorization(authorizationRef: string): Promise<SuccessionAuthorization | undefined>
  commit(change: AccountRegistryCommit): Promise<void>
}>

export type AccountRegistryStore = Readonly<{
  transact<Result>(operation: (transaction: AccountRegistryTransaction) => Promise<Result>): Promise<Result>
}>

export type AccountRegistryOptions = Readonly<{
  now?: () => number
  randomUuid?: () => string
}>

export function accountRef(value: string): AccountRef {
  if (!ACCOUNT_REF_PATTERN.test(value)) throw new AccountRegistryError('account_ref_invalid')
  return value as AccountRef
}

export function ownershipRef(value: string): OwnershipRef {
  if (!OWNERSHIP_REF_PATTERN.test(value)) throw new AccountRegistryError('ownership_ref_invalid')
  return value as OwnershipRef
}

export function membershipRef(value: string): MembershipRef {
  if (!MEMBERSHIP_REF_PATTERN.test(value)) throw new AccountRegistryError('membership_ref_invalid')
  return value as MembershipRef
}

export function generateAccountRef(randomUuid: () => string = () => globalThis.crypto.randomUUID()): AccountRef {
  return accountRef(generateStableRef('acc', randomUuid))
}

export function generateOwnershipRef(randomUuid: () => string = () => globalThis.crypto.randomUUID()): OwnershipRef {
  return ownershipRef(generateStableRef('own', randomUuid))
}

export function generateMembershipRef(randomUuid: () => string = () => globalThis.crypto.randomUUID()): MembershipRef {
  return membershipRef(generateStableRef('mem', randomUuid))
}

export class AccountRegistry {
  readonly #store: AccountRegistryStore
  readonly #now: () => number
  readonly #randomUuid: () => string

  constructor(store: AccountRegistryStore, options: AccountRegistryOptions = {}) {
    this.#store = store
    this.#now = options.now ?? (() => Date.now())
    this.#randomUuid = options.randomUuid ?? (() => globalThis.crypto.randomUUID())
  }

  async create(input: Readonly<{
    ownerPrincipalRef: PrincipalRef
    displayName: string
    recoveryPolicy: RecoveryPolicy
    correlationRef: string
    idempotencyRef: string
  }>): Promise<Readonly<{ account: Account; ownership: AccountOwnership }>> {
    const ownerRef = principalRef(input.ownerPrincipalRef)
    const displayName = validDisplayName(input.displayName)
    const recoveryPolicy = validRecoveryPolicy(input.recoveryPolicy)
    const correlation = validOpaqueRef(input.correlationRef, 'correlation_ref_invalid')
    const idempotency = validOpaqueRef(input.idempotencyRef, 'account_idempotency_ref_invalid')

    return await this.#store.transact(async (transaction) => {
      await requireActivePrincipal(transaction, ownerRef)
      const existing = await transaction.getAccountByCreationIdempotency(ownerRef, idempotency)
      if (existing !== undefined) {
        if (existing.displayName !== displayName || !recoveryPoliciesEqual(existing.recoveryPolicy, recoveryPolicy)) {
          throw new AccountRegistryError('account_idempotency_conflict')
        }
        const initialOwnership = await transaction.getOwnership(existing.initialOwnershipRef)
        if (initialOwnership === undefined) throw new AccountRegistryError('ownership_not_found')
        if (initialOwnership.accountRef !== existing.accountRef) {
          throw new AccountRegistryError('ownership_account_mismatch')
        }
        return Object.freeze({ account: existing, ownership: initialOwnership })
      }
      const timestamp = validTimestamp(this.#now())
      const newAccountRef = generateAccountRef(this.#randomUuid)
      const newOwnershipRef = generateOwnershipRef(this.#randomUuid)
      const action = validActionContext({
        actorPrincipalRef: ownerRef,
        activeAccountRef: newAccountRef,
        correlationRef: correlation,
        idempotencyRef: idempotency,
      })
      if (await transaction.getAccount(newAccountRef) !== undefined) {
        throw new AccountRegistryError('account_ref_conflict')
      }
      if (await transaction.getOwnership(newOwnershipRef) !== undefined) {
        throw new AccountRegistryError('ownership_ref_conflict')
      }
      const account = freezeAccount({
        accountRef: newAccountRef,
        displayName,
        lifecycle: 'pending_activation',
        recoveryPolicy,
        creationActorPrincipalRef: ownerRef,
        creationIdempotencyRef: idempotency,
        initialOwnershipRef: newOwnershipRef,
        currentOwnershipRef: newOwnershipRef,
        revision: 1,
        createdAt: timestamp,
        updatedAt: timestamp,
        lastAction: action,
      })
      const ownership = freezeOwnership({
        ownershipRef: newOwnershipRef,
        accountRef: newAccountRef,
        ownerPrincipalRef: ownerRef,
        lifecycle: 'active',
        changeKind: 'creation',
        revision: 1,
        createdAt: timestamp,
        createdBy: action,
      })
      await transaction.commit({ accountInsert: account, ownershipInserts: [ownership] })
      return Object.freeze({ account, ownership })
    })
  }

  async getAccount(ref: AccountRef): Promise<Account | undefined> {
    const validRef = accountRef(ref)
    return await this.#store.transact(async (transaction) => await transaction.getAccount(validRef))
  }

  async getOwnership(ref: OwnershipRef): Promise<AccountOwnership | undefined> {
    const validRef = ownershipRef(ref)
    return await this.#store.transact(async (transaction) => await transaction.getOwnership(validRef))
  }

  async getMembership(ref: MembershipRef): Promise<Membership | undefined> {
    const validRef = membershipRef(ref)
    return await this.#store.transact(async (transaction) => await transaction.getMembership(validRef))
  }

  async getSuccessionAuthorization(ref: string): Promise<SuccessionAuthorization | undefined> {
    const validRef = validSuccessionAuthorizationRef(ref)
    return await this.#store.transact(
      async (transaction) => await transaction.getSuccessionAuthorization(validRef),
    )
  }

  async registerSuccessionAuthorization(input: Readonly<{
    accountRef: AccountRef
    incumbentOwnerPrincipalRef: PrincipalRef
    successorOwnerPrincipalRef: PrincipalRef
    expectedAccountRevision: number
    expectedOwnershipRevision: number
    participantApprovalRefs: readonly string[]
    expiresAt: number
    context: AccountActionContext
  }>): Promise<Readonly<{
    authorization: SuccessionAuthorization
    participants: readonly SuccessionAuthorizationParticipant[]
  }>> {
    const ref = accountRef(input.accountRef)
    const incumbentRef = principalRef(input.incumbentOwnerPrincipalRef)
    const successorRef = principalRef(input.successorOwnerPrincipalRef)
    const context = validActionContext(input.context)
    const timestamp = validTimestamp(this.#now())
    const expiresAt = validTimestamp(input.expiresAt)
    const approvalRefs = input.participantApprovalRefs.map((approvalRef) => {
      if (!OPAQUE_REF_PATTERN.test(approvalRef)) {
        throw new AccountRegistryError('recovery_participant_approval_invalid')
      }
      return approvalRef
    })
    const authorizationRef = generateSuccessionAuthorizationRef(this.#randomUuid)

    return await this.#store.transact(async (transaction) => {
      const account = await requireAccount(transaction, ref)
      assertAccountContext(account, context)
      assertAccountRevision(account, input.expectedAccountRevision)
      assertLifecycle(account, 'suspended')
      if (context.actorPrincipalRef !== successorRef) {
        throw new AccountRegistryError('succession_authorization_invalid')
      }
      if (account.recoveryPolicy.kind === 'no_transfer') {
        throw new AccountRegistryError('succession_forbidden_by_recovery_policy')
      }
      const currentOwnership = await requireCurrentOwnership(transaction, account)
      assertOwnershipRevision(currentOwnership, input.expectedOwnershipRevision)
      if (currentOwnership.ownerPrincipalRef !== incumbentRef || incumbentRef === successorRef) {
        throw new AccountRegistryError('succession_authorization_invalid')
      }
      await requireActivePrincipal(transaction, successorRef)
      if (approvalRefs.length < account.recoveryPolicy.threshold) {
        throw new AccountRegistryError('recovery_participant_threshold_unmet')
      }
      if (approvalRefs.length > account.recoveryPolicy.participantCount) {
        throw new AccountRegistryError('recovery_participant_approval_invalid')
      }
      const availableAt = account.updatedAt + account.recoveryPolicy.delayMs
      if (!Number.isSafeInteger(availableAt) || expiresAt <= timestamp || expiresAt < availableAt) {
        throw new AccountRegistryError('succession_authorization_invalid')
      }

      const participantRefs = new Set<PrincipalRef>()
      const verificationRefs = new Set<string>()
      const approvalIdempotencyRefs = new Set<string>()
      const approvals: VerifiedRecoveryParticipantApproval[] = []
      for (const approvalRef of approvalRefs) {
        const approval = requireTrustedRecoveryApproval({
          approval: await transaction.getVerifiedRecoveryParticipantApproval(approvalRef),
          approvalRef,
          account,
          incumbentRef,
          successorRef,
          authorizationExpiresAt: expiresAt,
          timestamp,
        })
        if (participantRefs.has(approval.participantPrincipalRef)
          || verificationRefs.has(approval.verificationRef)
          || approvalIdempotencyRefs.has(approval.createdBy.idempotencyRef)) {
          throw new AccountRegistryError('recovery_participant_duplicate')
        }
        await requireActivePrincipal(transaction, approval.participantPrincipalRef)
        await requireActivePrincipal(transaction, approval.createdBy.actorPrincipalRef)
        participantRefs.add(approval.participantPrincipalRef)
        verificationRefs.add(approval.verificationRef)
        approvalIdempotencyRefs.add(approval.createdBy.idempotencyRef)
        approvals.push(approval)
      }
      if (await transaction.getSuccessionAuthorization(authorizationRef) !== undefined) {
        throw new AccountRegistryError('succession_authorization_ref_conflict')
      }

      const authorization = freezeSuccessionAuthorization({
        authorizationRef,
        accountRef: ref,
        incumbentOwnerPrincipalRef: incumbentRef,
        successorOwnerPrincipalRef: successorRef,
        recoveryPolicyRevision: account.recoveryPolicy.revision,
        frozenAccountRevision: account.revision,
        frozenAt: account.updatedAt,
        availableAt,
        authorizedAt: timestamp,
        expiresAt,
        verifiedParticipantCount: participantRefs.size,
        lifecycle: 'active',
        revision: 1,
        createdAt: timestamp,
        createdBy: context,
      })
      const participants = Object.freeze(approvals.map((approval) => Object.freeze({
        authorizationRef,
        accountRef: ref,
        approvalRef: approval.approvalRef,
        participantPrincipalRef: approval.participantPrincipalRef,
        verificationRef: approval.verificationRef,
        verifiedAt: approval.verifiedAt,
        recoveryPolicyRevision: approval.recoveryPolicyRevision,
        frozenAccountRevision: approval.frozenAccountRevision,
        createdAt: timestamp,
        createdBy: context,
      })))
      await transaction.commit({
        successionAuthorizationInsert: authorization,
        successionAuthorizationParticipantInserts: participants,
      })
      return Object.freeze({ authorization, participants })
    })
  }

  async activate(input: Readonly<{
    accountRef: AccountRef
    expectedRevision: number
    context: AccountActionContext
  }>): Promise<Account> {
    return await this.#transitionLifecycle(input, 'active', ['pending_activation', 'suspended'])
  }

  async suspend(input: Readonly<{
    accountRef: AccountRef
    expectedRevision: number
    context: AccountActionContext
  }>): Promise<Account> {
    return await this.#transitionLifecycle(input, 'suspended', ['active'])
  }

  async close(input: Readonly<{
    accountRef: AccountRef
    expectedAccountRevision: number
    expectedOwnershipRevision: number
    context: AccountActionContext
  }>): Promise<Readonly<{ account: Account; ownership: AccountOwnership }>> {
    const ref = accountRef(input.accountRef)
    const context = validActionContext(input.context)
    const timestamp = validTimestamp(this.#now())
    return await this.#store.transact(async (transaction) => {
      const account = await requireAccount(transaction, ref)
      assertAccountContext(account, context)
      assertAccountRevision(account, input.expectedAccountRevision)
      if (account.lifecycle !== 'suspended') {
        throw new AccountRegistryError('account_lifecycle_transition_forbidden')
      }
      const currentOwnership = await requireCurrentOwnership(transaction, account)
      await requireActiveOwnerContext(transaction, currentOwnership, context)
      assertOwnershipRevision(currentOwnership, input.expectedOwnershipRevision)
      assertMonotonicTimestamp(timestamp, Math.max(account.updatedAt, currentOwnership.createdAt))
      const closedAccount = freezeAccount({
        ...account,
        lifecycle: 'closed',
        revision: account.revision + 1,
        updatedAt: timestamp,
        lastAction: context,
      })
      const endedOwnership = freezeOwnership({
        ...currentOwnership,
        lifecycle: 'ended',
        revision: currentOwnership.revision + 1,
        endedAt: timestamp,
        endedBy: context,
      })
      await transaction.commit({
        accountReplacement: { value: closedAccount, expectedRevision: account.revision },
        ownershipReplacements: [{ value: endedOwnership, expectedRevision: currentOwnership.revision }],
      })
      return Object.freeze({ account: closedAccount, ownership: endedOwnership })
    })
  }

  async transferOwnership(input: Readonly<{
    accountRef: AccountRef
    successorOwnerPrincipalRef: PrincipalRef
    expectedAccountRevision: number
    expectedOwnershipRevision: number
    context: AccountActionContext
  }>): Promise<Readonly<{
    account: Account
    previousOwnership: AccountOwnership
    currentOwnership: AccountOwnership
  }>> {
    return await this.#changeOwnership(input, 'transfer')
  }

  async succeedOwnership(input: Readonly<{
    accountRef: AccountRef
    successorOwnerPrincipalRef: PrincipalRef
    expectedAccountRevision: number
    expectedOwnershipRevision: number
    authorizationRef: string
    context: AccountActionContext
  }>): Promise<Readonly<{
    account: Account
    previousOwnership: AccountOwnership
    currentOwnership: AccountOwnership
  }>> {
    return await this.#changeOwnership(input, 'succession')
  }

  async addMembership(input: Readonly<{
    accountRef: AccountRef
    memberPrincipalRef: PrincipalRef
    expectedAccountRevision: number
    context: AccountActionContext
  }>): Promise<Readonly<{ account: Account; membership: Membership }>> {
    const ref = accountRef(input.accountRef)
    const memberRef = principalRef(input.memberPrincipalRef)
    const context = validActionContext(input.context)
    const timestamp = validTimestamp(this.#now())
    const newMembershipRef = generateMembershipRef(this.#randomUuid)
    return await this.#store.transact(async (transaction) => {
      const account = await requireAccount(transaction, ref)
      assertAccountContext(account, context)
      assertAccountRevision(account, input.expectedAccountRevision)
      assertLifecycle(account, 'active')
      const currentOwnership = await requireCurrentOwnership(transaction, account)
      await requireActiveOwnerContext(transaction, currentOwnership, context)
      await requireActivePrincipal(transaction, memberRef)
      if (await transaction.getMembership(newMembershipRef) !== undefined) {
        throw new AccountRegistryError('membership_ref_conflict')
      }
      if (await transaction.getActiveMembership(ref, memberRef) !== undefined) {
        throw new AccountRegistryError('membership_active_conflict')
      }
      assertMonotonicTimestamp(timestamp, account.updatedAt)
      const updatedAccount = freezeAccount({
        ...account,
        revision: account.revision + 1,
        updatedAt: timestamp,
        lastAction: context,
      })
      const membership = freezeMembership({
        membershipRef: newMembershipRef,
        accountRef: ref,
        memberPrincipalRef: memberRef,
        lifecycle: 'active',
        revision: 1,
        createdAt: timestamp,
        createdBy: context,
      })
      await transaction.commit({
        accountReplacement: { value: updatedAccount, expectedRevision: account.revision },
        membershipInserts: [membership],
      })
      return Object.freeze({ account: updatedAccount, membership })
    })
  }

  async endMembership(input: Readonly<{
    accountRef: AccountRef
    membershipRef: MembershipRef
    expectedAccountRevision: number
    expectedMembershipRevision: number
    context: AccountActionContext
  }>): Promise<Readonly<{ account: Account; membership: Membership }>> {
    const ref = accountRef(input.accountRef)
    const memberRef = membershipRef(input.membershipRef)
    const context = validActionContext(input.context)
    const timestamp = validTimestamp(this.#now())
    return await this.#store.transact(async (transaction) => {
      const account = await requireAccount(transaction, ref)
      assertAccountContext(account, context)
      assertAccountRevision(account, input.expectedAccountRevision)
      assertLifecycle(account, 'active')
      await requireActiveOwnerContext(transaction, await requireCurrentOwnership(transaction, account), context)
      const membership = await requireMembership(transaction, memberRef)
      if (membership.accountRef !== ref) throw new AccountRegistryError('membership_account_mismatch')
      assertMembershipRevision(membership, input.expectedMembershipRevision)
      if (membership.lifecycle !== 'active') {
        throw new AccountRegistryError('membership_lifecycle_transition_forbidden')
      }
      assertMonotonicTimestamp(timestamp, Math.max(account.updatedAt, membership.createdAt))
      const updatedAccount = freezeAccount({
        ...account,
        revision: account.revision + 1,
        updatedAt: timestamp,
        lastAction: context,
      })
      const endedMembership = freezeMembership({
        ...membership,
        lifecycle: 'ended',
        revision: membership.revision + 1,
        endedAt: timestamp,
        endedBy: context,
      })
      await transaction.commit({
        accountReplacement: { value: updatedAccount, expectedRevision: account.revision },
        membershipReplacements: [{ value: endedMembership, expectedRevision: membership.revision }],
      })
      return Object.freeze({ account: updatedAccount, membership: endedMembership })
    })
  }

  async requireActiveContext(contextInput: AccountActionContext): Promise<ActiveAccountContext> {
    const context = validActionContext(contextInput)
    return await this.#store.transact(async (transaction) => {
      const account = await requireAccount(transaction, context.activeAccountRef)
      assertLifecycle(account, 'active', 'account_not_operational')
      await requireActivePrincipal(transaction, context.actorPrincipalRef)
      await requireAccountAccess(transaction, account, context.actorPrincipalRef)
      return Object.freeze({
        accountRef: account.accountRef,
        actorPrincipalRef: context.actorPrincipalRef,
        accountRevision: account.revision,
        correlationRef: context.correlationRef,
        idempotencyRef: context.idempotencyRef,
      })
    })
  }

  async attributeCrossAccountAction(input: Readonly<{
    context: AccountActionContext
    counterpartyAccountRef: AccountRef
  }>): Promise<CrossAccountAttribution> {
    const context = validActionContext(input.context)
    const counterpartyRef = accountRef(input.counterpartyAccountRef)
    if (context.activeAccountRef === counterpartyRef) {
      throw new AccountRegistryError('account_cross_account_self_forbidden')
    }
    return await this.#store.transact(async (transaction) => {
      const activeAccount = await requireAccount(transaction, context.activeAccountRef)
      const counterpartyAccount = await requireAccount(transaction, counterpartyRef)
      assertLifecycle(activeAccount, 'active', 'account_not_operational')
      assertLifecycle(counterpartyAccount, 'active', 'account_not_operational')
      await requireActivePrincipal(transaction, context.actorPrincipalRef)
      await requireAccountAccess(transaction, activeAccount, context.actorPrincipalRef)
      return Object.freeze({
        ...context,
        counterpartyAccountRef: counterpartyRef,
        activeAccountRevision: activeAccount.revision,
        counterpartyAccountRevision: counterpartyAccount.revision,
      })
    })
  }

  async #transitionLifecycle(
    input: Readonly<{
      accountRef: AccountRef
      expectedRevision: number
      context: AccountActionContext
    }>,
    lifecycle: 'active' | 'suspended',
    allowedFrom: readonly AccountLifecycle[],
  ): Promise<Account> {
    const ref = accountRef(input.accountRef)
    const context = validActionContext(input.context)
    const timestamp = validTimestamp(this.#now())
    return await this.#store.transact(async (transaction) => {
      const account = await requireAccount(transaction, ref)
      assertAccountContext(account, context)
      assertAccountRevision(account, input.expectedRevision)
      if (!allowedFrom.includes(account.lifecycle)) {
        throw new AccountRegistryError('account_lifecycle_transition_forbidden')
      }
      await requireActiveOwnerContext(transaction, await requireCurrentOwnership(transaction, account), context)
      assertMonotonicTimestamp(timestamp, account.updatedAt)
      const updated = freezeAccount({
        ...account,
        lifecycle,
        revision: account.revision + 1,
        updatedAt: timestamp,
        lastAction: context,
      })
      await transaction.commit({
        accountReplacement: { value: updated, expectedRevision: account.revision },
      })
      return updated
    })
  }

  async #changeOwnership(
    input: Readonly<{
      accountRef: AccountRef
      successorOwnerPrincipalRef: PrincipalRef
      expectedAccountRevision: number
      expectedOwnershipRevision: number
      authorizationRef?: string
      context: AccountActionContext
    }>,
    changeKind: 'transfer' | 'succession',
  ): Promise<Readonly<{
    account: Account
    previousOwnership: AccountOwnership
    currentOwnership: AccountOwnership
  }>> {
    const ref = accountRef(input.accountRef)
    const successorRef = principalRef(input.successorOwnerPrincipalRef)
    const context = validActionContext(input.context)
    const timestamp = validTimestamp(this.#now())
    const newOwnershipRef = generateOwnershipRef(this.#randomUuid)
    return await this.#store.transact(async (transaction) => {
      const account = await requireAccount(transaction, ref)
      assertAccountContext(account, context)
      assertAccountRevision(account, input.expectedAccountRevision)
      assertLifecycle(account, changeKind === 'transfer' ? 'active' : 'suspended')
      const currentOwnership = await requireCurrentOwnership(transaction, account)
      assertOwnershipRevision(currentOwnership, input.expectedOwnershipRevision)
      if (changeKind === 'transfer' && currentOwnership.ownerPrincipalRef === successorRef) {
        throw new AccountRegistryError('successor_same_as_incumbent')
      }
      let successionAuthorizationRef: string | undefined
      let trustedSuccessionAuthorization: SuccessionAuthorization | undefined
      if (changeKind === 'transfer') {
        await requireActiveOwnerContext(transaction, currentOwnership, context)
      } else {
        if (account.recoveryPolicy.kind !== 'threshold') {
          throw new AccountRegistryError('succession_forbidden_by_recovery_policy')
        }
        if (context.actorPrincipalRef !== successorRef) {
          throw new AccountRegistryError('succession_authorization_invalid')
        }
        const authorizationRef = validSuccessionAuthorizationRef(input.authorizationRef)
        const authorization = await transaction.getSuccessionAuthorization(authorizationRef)
        if (authorization === undefined) {
          throw new AccountRegistryError('succession_authorization_not_found')
        }
        assertSuccessionAuthorization(
          account,
          account.recoveryPolicy,
          currentOwnership,
          successorRef,
          authorization,
          timestamp,
        )
        successionAuthorizationRef = authorization.authorizationRef
        trustedSuccessionAuthorization = authorization
      }
      await requireActivePrincipal(transaction, successorRef)
      if (await transaction.getOwnership(newOwnershipRef) !== undefined) {
        throw new AccountRegistryError('ownership_ref_conflict')
      }
      assertMonotonicTimestamp(timestamp, Math.max(account.updatedAt, currentOwnership.createdAt))
      const nextOwnership = freezeOwnership({
        ownershipRef: newOwnershipRef,
        accountRef: ref,
        ownerPrincipalRef: successorRef,
        lifecycle: 'active',
        changeKind,
        revision: 1,
        createdAt: timestamp,
        createdBy: context,
        predecessorOwnershipRef: currentOwnership.ownershipRef,
        ...(successionAuthorizationRef === undefined ? {} : { successionAuthorizationRef }),
      })
      const endedOwnership = freezeOwnership({
        ...currentOwnership,
        lifecycle: 'ended',
        revision: currentOwnership.revision + 1,
        endedAt: timestamp,
        endedBy: context,
        successorOwnershipRef: nextOwnership.ownershipRef,
      })
      const updatedAccount = freezeAccount({
        ...account,
        currentOwnershipRef: nextOwnership.ownershipRef,
        revision: account.revision + 1,
        updatedAt: timestamp,
        lastAction: context,
      })
      await transaction.commit({
        accountReplacement: { value: updatedAccount, expectedRevision: account.revision },
        ownershipInserts: [nextOwnership],
        ownershipReplacements: [{ value: endedOwnership, expectedRevision: currentOwnership.revision }],
        ...(trustedSuccessionAuthorization === undefined
          ? {}
          : {
              successionAuthorizationReplacement: {
                value: freezeSuccessionAuthorization({
                  ...trustedSuccessionAuthorization,
                  lifecycle: 'consumed',
                  revision: trustedSuccessionAuthorization.revision + 1,
                  consumedAt: timestamp,
                  consumedBy: context,
                  successorOwnershipRef: nextOwnership.ownershipRef,
                }),
                expectedRevision: trustedSuccessionAuthorization.revision,
              },
            }),
      })
      return Object.freeze({
        account: updatedAccount,
        previousOwnership: endedOwnership,
        currentOwnership: nextOwnership,
      })
    })
  }
}

function generateStableRef(prefix: 'acc' | 'own' | 'mem' | 'sau', randomUuid: () => string): string {
  const uuid = randomUuid()
  if (!UUID_PATTERN.test(uuid)) {
    const code = prefix === 'acc'
      ? 'account_ref_invalid'
      : prefix === 'own'
        ? 'ownership_ref_invalid'
        : prefix === 'mem' ? 'membership_ref_invalid' : 'succession_authorization_invalid'
    throw new AccountRegistryError(code)
  }
  return `${prefix}_${uuid.replaceAll('-', '')}`
}

function validDisplayName(value: string): string {
  const normalized = value.trim()
  if (normalized.length === 0 || normalized.length > DISPLAY_NAME_MAX_LENGTH || /[\u0000-\u001f\u007f]/u.test(normalized)) {
    throw new AccountRegistryError('account_display_name_invalid')
  }
  return normalized
}

function validOpaqueRef(value: string, code: 'correlation_ref_invalid' | 'account_idempotency_ref_invalid'): string {
  if (!OPAQUE_REF_PATTERN.test(value)) throw new AccountRegistryError(code)
  return value
}

function validSuccessionAuthorizationRef(value: string | undefined): string {
  if (value === undefined || !SUCCESSION_AUTHORIZATION_REF_PATTERN.test(value)) {
    throw new AccountRegistryError('succession_authorization_invalid')
  }
  return value
}

function generateSuccessionAuthorizationRef(randomUuid: () => string): string {
  return generateStableRef('sau', randomUuid)
}

function validActionContext(context: AccountActionContext): AccountActionContext {
  return Object.freeze({
    actorPrincipalRef: principalRef(context.actorPrincipalRef),
    activeAccountRef: accountRef(context.activeAccountRef),
    correlationRef: validOpaqueRef(context.correlationRef, 'correlation_ref_invalid'),
    idempotencyRef: validOpaqueRef(context.idempotencyRef, 'account_idempotency_ref_invalid'),
  })
}

function validRecoveryPolicy(policy: RecoveryPolicy): RecoveryPolicy {
  if (policy.kind === 'no_transfer') {
    if (!isPositiveRevision(policy.revision)) throw new AccountRegistryError('recovery_policy_invalid')
    return Object.freeze({ kind: 'no_transfer', revision: policy.revision })
  }
  if (policy.kind !== 'threshold'
    || !isPositiveRevision(policy.revision)
    || !Number.isSafeInteger(policy.threshold)
    || !Number.isSafeInteger(policy.participantCount)
    || policy.threshold < 1
    || policy.participantCount < policy.threshold
    || !Number.isSafeInteger(policy.delayMs)
    || policy.delayMs < 0
    || policy.freezeRequired !== true) {
    throw new AccountRegistryError('recovery_policy_invalid')
  }
  return Object.freeze({ ...policy })
}

function recoveryPoliciesEqual(left: RecoveryPolicy, right: RecoveryPolicy): boolean {
  return recoveryPolicyFingerprint(left) === recoveryPolicyFingerprint(right)
}

function recoveryPolicyFingerprint(policy: RecoveryPolicy): string {
  if (policy.kind === 'no_transfer') return `no_transfer:${policy.revision}`
  return `threshold:${policy.revision}:${policy.threshold}:${policy.participantCount}:${policy.delayMs}`
}

function validTimestamp(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new AccountRegistryError('account_timestamp_invalid')
  return value
}

function assertMonotonicTimestamp(value: number, prior: number): void {
  if (value < prior) throw new AccountRegistryError('account_timestamp_invalid')
}

function isPositiveRevision(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0
}

function assertAccountRevision(account: Account, expectedRevision: number): void {
  if (!isPositiveRevision(expectedRevision) || account.revision !== expectedRevision) {
    throw new AccountRegistryError('account_revision_conflict')
  }
}

function assertOwnershipRevision(ownership: AccountOwnership, expectedRevision: number): void {
  if (!isPositiveRevision(expectedRevision) || ownership.revision !== expectedRevision) {
    throw new AccountRegistryError('ownership_revision_conflict')
  }
}

function assertMembershipRevision(membership: Membership, expectedRevision: number): void {
  if (!isPositiveRevision(expectedRevision) || membership.revision !== expectedRevision) {
    throw new AccountRegistryError('membership_revision_conflict')
  }
}

function assertAccountContext(account: Account, context: AccountActionContext): void {
  if (account.accountRef !== context.activeAccountRef) {
    throw new AccountRegistryError('account_context_mismatch')
  }
}

function assertOwnerContext(ownership: AccountOwnership, context: AccountActionContext): void {
  if (ownership.ownerPrincipalRef !== context.actorPrincipalRef) {
    throw new AccountRegistryError('owner_context_required')
  }
}

async function requireActiveOwnerContext(
  transaction: AccountRegistryTransaction,
  ownership: AccountOwnership,
  context: AccountActionContext,
): Promise<void> {
  assertOwnerContext(ownership, context)
  await requireActivePrincipal(transaction, context.actorPrincipalRef)
}

async function requireAccountAccess(
  transaction: AccountRegistryTransaction,
  account: Account,
  actorPrincipalRef: PrincipalRef,
): Promise<void> {
  const ownership = await requireCurrentOwnership(transaction, account)
  if (ownership.ownerPrincipalRef === actorPrincipalRef) return
  const membership = await transaction.getActiveMembership(account.accountRef, actorPrincipalRef)
  if (membership === undefined) throw new AccountRegistryError('account_context_access_denied')
}

function assertLifecycle(
  account: Account,
  expected: AccountLifecycle,
  code: 'account_lifecycle_transition_forbidden' | 'account_not_operational' = 'account_lifecycle_transition_forbidden',
): void {
  if (account.lifecycle !== expected) throw new AccountRegistryError(code)
}

async function requireActivePrincipal(
  transaction: AccountRegistryTransaction,
  ref: PrincipalRef,
): Promise<Principal> {
  const principal = await transaction.getPrincipal(ref)
  if (principal === undefined) throw new AccountRegistryError('principal_not_found')
  if (principal.lifecycle !== 'active') throw new AccountRegistryError('principal_inactive')
  return principal
}

async function requireAccount(
  transaction: AccountRegistryTransaction,
  ref: AccountRef,
): Promise<Account> {
  const account = await transaction.getAccount(ref)
  if (account === undefined) throw new AccountRegistryError('account_not_found')
  return account
}

async function requireCurrentOwnership(
  transaction: AccountRegistryTransaction,
  account: Account,
): Promise<AccountOwnership> {
  const ownership = await transaction.getOwnership(account.currentOwnershipRef)
  if (ownership === undefined) throw new AccountRegistryError('ownership_not_found')
  if (ownership.accountRef !== account.accountRef) throw new AccountRegistryError('ownership_account_mismatch')
  if (ownership.lifecycle !== 'active') {
    throw new AccountRegistryError('ownership_lifecycle_transition_forbidden')
  }
  return ownership
}

async function requireMembership(
  transaction: AccountRegistryTransaction,
  ref: MembershipRef,
): Promise<Membership> {
  const membership = await transaction.getMembership(ref)
  if (membership === undefined) throw new AccountRegistryError('membership_not_found')
  return membership
}

function requireTrustedRecoveryApproval(input: Readonly<{
  approval: VerifiedRecoveryParticipantApproval | undefined
  approvalRef: string
  account: Account
  incumbentRef: PrincipalRef
  successorRef: PrincipalRef
  authorizationExpiresAt: number
  timestamp: number
}>): VerifiedRecoveryParticipantApproval {
  const { approval, account, incumbentRef, successorRef } = input
  if (approval === undefined) {
    throw new AccountRegistryError('recovery_participant_approval_invalid')
  }
  let createdBy: AccountActionContext
  try {
    createdBy = validActionContext(approval.createdBy)
  } catch {
    throw new AccountRegistryError('recovery_participant_approval_invalid')
  }
  if (approval.approvalRef !== input.approvalRef
    || !OPAQUE_REF_PATTERN.test(approval.approvalRef)
    || !OPAQUE_REF_PATTERN.test(approval.verificationRef)
    || approval.lifecycle !== 'verified'
    || !Number.isSafeInteger(approval.createdAt)
    || approval.createdAt < approval.frozenAt
    || approval.createdAt > approval.verifiedAt
    || createdBy.activeAccountRef !== account.accountRef
    || createdBy.actorPrincipalRef !== approval.participantPrincipalRef
    || approval.accountRef !== account.accountRef
    || approval.incumbentOwnerPrincipalRef !== incumbentRef
    || approval.successorOwnerPrincipalRef !== successorRef
    || approval.participantPrincipalRef === incumbentRef
    || approval.participantPrincipalRef === successorRef
    || approval.recoveryPolicyRevision !== account.recoveryPolicy.revision
    || approval.frozenAccountRevision !== account.revision
    || approval.frozenAt !== account.updatedAt
    || !Number.isSafeInteger(approval.verifiedAt)
    || !Number.isSafeInteger(approval.expiresAt)
    || approval.verifiedAt < approval.frozenAt
    || approval.verifiedAt > input.timestamp
    || approval.expiresAt <= approval.verifiedAt
    || approval.expiresAt < input.authorizationExpiresAt) {
    throw new AccountRegistryError('recovery_participant_approval_invalid')
  }
  return approval
}

function assertSuccessionAuthorization(
  account: Account,
  recoveryPolicy: ThresholdRecoveryPolicy,
  currentOwnership: AccountOwnership,
  successorRef: PrincipalRef,
  authorization: SuccessionAuthorization,
  timestamp: number,
): void {
  if (authorization.lifecycle !== 'active') {
    throw new AccountRegistryError('succession_authorization_consumed')
  }
  if (!SUCCESSION_AUTHORIZATION_REF_PATTERN.test(authorization.authorizationRef)
    || authorization.accountRef !== account.accountRef
    || authorization.incumbentOwnerPrincipalRef !== currentOwnership.ownerPrincipalRef
    || authorization.successorOwnerPrincipalRef !== successorRef
    || authorization.recoveryPolicyRevision !== recoveryPolicy.revision
    || authorization.frozenAccountRevision !== account.revision
    || authorization.frozenAt !== account.updatedAt
    || authorization.availableAt !== authorization.frozenAt + recoveryPolicy.delayMs
    || !Number.isSafeInteger(authorization.availableAt)
    || !Number.isSafeInteger(authorization.authorizedAt)
    || !Number.isSafeInteger(authorization.expiresAt)
    || authorization.authorizedAt < authorization.frozenAt
    || authorization.authorizedAt > timestamp
    || authorization.expiresAt < authorization.authorizedAt
    || authorization.verifiedParticipantCount < recoveryPolicy.threshold
    || authorization.verifiedParticipantCount > recoveryPolicy.participantCount
    || !isPositiveRevision(authorization.revision)
    || authorization.createdAt !== authorization.authorizedAt) {
    throw new AccountRegistryError('succession_authorization_invalid')
  }
  if (timestamp < authorization.availableAt) {
    throw new AccountRegistryError('succession_authorization_invalid')
  }
  if (authorization.expiresAt <= timestamp) {
    throw new AccountRegistryError('succession_authorization_expired')
  }
}

function freezeSuccessionAuthorization(value: SuccessionAuthorization): SuccessionAuthorization {
  return Object.freeze({
    ...value,
    ...(value.consumedBy === undefined ? {} : { consumedBy: Object.freeze(value.consumedBy) }),
  })
}

function freezeAccount(value: Account): Account {
  return Object.freeze({ ...value, recoveryPolicy: Object.freeze(value.recoveryPolicy), lastAction: Object.freeze(value.lastAction) })
}

function freezeOwnership(value: AccountOwnership): AccountOwnership {
  return Object.freeze(value)
}

function freezeMembership(value: Membership): Membership {
  return Object.freeze(value)
}
