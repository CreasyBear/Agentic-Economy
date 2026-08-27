import { principalRef, type PrincipalRef } from '../principal/public'
import {
  AccountRegistryError,
  type AccountRef,
  type OwnershipRef,
  type MembershipRef,
  type AccountLifecycle,
  type RecoveryPolicy,
  type AccountActionContext,
  type Account,
  type AccountOwnership,
  type Membership,
  type VerifiedRecoveryParticipantApproval,
  type SuccessionAuthorizationParticipant,
  type SuccessionAuthorization,
  type ActiveAccountContext,
  type CrossAccountAttribution,
  type AccountRegistryStore,
  type AccountRegistryOptions,
} from './registry/contracts'
import {
  accountRef,
  ownershipRef,
  membershipRef,
  generateAccountRef,
  generateOwnershipRef,
  generateMembershipRef,
  validDisplayName,
  validOpaqueRef,
  validRecoveryApprovalRef,
  validSuccessionAuthorizationRef,
  generateSuccessionAuthorizationRef,
  validActionContext,
  validRecoveryPolicy,
  recoveryPoliciesEqual,
  validTimestamp,
  assertMonotonicTimestamp,
  assertAccountRevision,
  assertOwnershipRevision,
  assertMembershipRevision,
  assertAccountContext,
  requireActiveOwnerContext,
  requireAccountAccess,
  assertLifecycle,
  requireActivePrincipal,
  requireAccount,
  requireCurrentOwnership,
  requireMembership,
  requireTrustedRecoveryApproval,
  assertSuccessionAuthorization,
  freezeSuccessionAuthorization,
  freezeAccount,
  freezeOwnership,
  freezeMembership,
} from './registry/validation'

export * from './registry/contracts'
export {
  accountRef,
  ownershipRef,
  membershipRef,
  generateAccountRef,
  generateOwnershipRef,
  generateMembershipRef,
} from './registry/validation'

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
    const approvalRefs = input.participantApprovalRefs.map(validRecoveryApprovalRef)
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
