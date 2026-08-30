import { principalRef, type Principal, type PrincipalRef } from '../../principal/public'
import {
  AccountRegistryError,
  type AccountRef,
  type OwnershipRef,
  type MembershipRef,
  type AccountLifecycle,
  type ThresholdRecoveryPolicy,
  type RecoveryPolicy,
  type AccountActionContext,
  type Account,
  type AccountOwnership,
  type Membership,
  type VerifiedRecoveryParticipantApproval,
  type SuccessionAuthorization,
  type AccountRegistryTransaction,
} from './contracts'

const ACCOUNT_REF_PATTERN = /^acc_[0-9a-f]{32}$/u
const OWNERSHIP_REF_PATTERN = /^own_[0-9a-f]{32}$/u
const MEMBERSHIP_REF_PATTERN = /^mem_[0-9a-f]{32}$/u
const SUCCESSION_AUTHORIZATION_REF_PATTERN = /^sau_[0-9a-f]{32}$/u
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u
const OPAQUE_REF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/u
const DISPLAY_NAME_MAX_LENGTH = 200

const all = (facts: readonly boolean[]): boolean => facts.every(Boolean)


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

export function generateStableRef(prefix: 'acc' | 'own' | 'mem' | 'sau', randomUuid: () => string): string {
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

export function validDisplayName(value: string): string {
  const normalized = value.trim()
  if (normalized.length === 0 || normalized.length > DISPLAY_NAME_MAX_LENGTH || /[\u0000-\u001f\u007f]/u.test(normalized)) {
    throw new AccountRegistryError('account_display_name_invalid')
  }
  return normalized
}

export function validOpaqueRef(value: string, code: 'correlation_ref_invalid' | 'account_idempotency_ref_invalid'): string {
  if (!OPAQUE_REF_PATTERN.test(value)) throw new AccountRegistryError(code)
  return value
}

export function validRecoveryApprovalRef(value: string): string {
  if (!OPAQUE_REF_PATTERN.test(value)) {
    throw new AccountRegistryError('recovery_participant_approval_invalid')
  }
  return value
}

export function validSuccessionAuthorizationRef(value: string | undefined): string {
  if (value === undefined || !SUCCESSION_AUTHORIZATION_REF_PATTERN.test(value)) {
    throw new AccountRegistryError('succession_authorization_invalid')
  }
  return value
}

export function generateSuccessionAuthorizationRef(randomUuid: () => string): string {
  return generateStableRef('sau', randomUuid)
}

export function validActionContext(context: AccountActionContext): AccountActionContext {
  return Object.freeze({
    actorPrincipalRef: principalRef(context.actorPrincipalRef),
    activeAccountRef: accountRef(context.activeAccountRef),
    correlationRef: validOpaqueRef(context.correlationRef, 'correlation_ref_invalid'),
    idempotencyRef: validOpaqueRef(context.idempotencyRef, 'account_idempotency_ref_invalid'),
  })
}

export function validRecoveryPolicy(policy: RecoveryPolicy): RecoveryPolicy {
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

export function recoveryPoliciesEqual(left: RecoveryPolicy, right: RecoveryPolicy): boolean {
  return recoveryPolicyFingerprint(left) === recoveryPolicyFingerprint(right)
}

export function recoveryPolicyFingerprint(policy: RecoveryPolicy): string {
  if (policy.kind === 'no_transfer') return `no_transfer:${policy.revision}`
  return `threshold:${policy.revision}:${policy.threshold}:${policy.participantCount}:${policy.delayMs}`
}

export function validTimestamp(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new AccountRegistryError('account_timestamp_invalid')
  return value
}

export function assertMonotonicTimestamp(value: number, prior: number): void {
  if (value < prior) throw new AccountRegistryError('account_timestamp_invalid')
}

export function isPositiveRevision(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0
}

export function assertAccountRevision(account: Account, expectedRevision: number): void {
  if (!isPositiveRevision(expectedRevision) || account.revision !== expectedRevision) {
    throw new AccountRegistryError('account_revision_conflict')
  }
}

export function assertOwnershipRevision(ownership: AccountOwnership, expectedRevision: number): void {
  if (!isPositiveRevision(expectedRevision) || ownership.revision !== expectedRevision) {
    throw new AccountRegistryError('ownership_revision_conflict')
  }
}

export function assertMembershipRevision(membership: Membership, expectedRevision: number): void {
  if (!isPositiveRevision(expectedRevision) || membership.revision !== expectedRevision) {
    throw new AccountRegistryError('membership_revision_conflict')
  }
}

export function assertAccountContext(account: Account, context: AccountActionContext): void {
  if (account.accountRef !== context.activeAccountRef) {
    throw new AccountRegistryError('account_context_mismatch')
  }
}

export function assertOwnerContext(ownership: AccountOwnership, context: AccountActionContext): void {
  if (ownership.ownerPrincipalRef !== context.actorPrincipalRef) {
    throw new AccountRegistryError('owner_context_required')
  }
}

export async function requireActiveOwnerContext(
  transaction: AccountRegistryTransaction,
  ownership: AccountOwnership,
  context: AccountActionContext,
): Promise<void> {
  assertOwnerContext(ownership, context)
  await requireActivePrincipal(transaction, context.actorPrincipalRef)
}

export async function requireAccountAccess(
  transaction: AccountRegistryTransaction,
  account: Account,
  actorPrincipalRef: PrincipalRef,
): Promise<void> {
  const ownership = await requireCurrentOwnership(transaction, account)
  if (ownership.ownerPrincipalRef === actorPrincipalRef) return
  const membership = await transaction.getActiveMembership(account.accountRef, actorPrincipalRef)
  if (membership === undefined) throw new AccountRegistryError('account_context_access_denied')
}

export function assertLifecycle(
  account: Account,
  expected: AccountLifecycle,
  code: 'account_lifecycle_transition_forbidden' | 'account_not_operational' = 'account_lifecycle_transition_forbidden',
): void {
  if (account.lifecycle !== expected) throw new AccountRegistryError(code)
}

export async function requireActivePrincipal(
  transaction: AccountRegistryTransaction,
  ref: PrincipalRef,
): Promise<Principal> {
  const principal = await transaction.getPrincipal(ref)
  if (principal === undefined) throw new AccountRegistryError('principal_not_found')
  if (principal.lifecycle !== 'active') throw new AccountRegistryError('principal_inactive')
  return principal
}

export async function requireAccount(
  transaction: AccountRegistryTransaction,
  ref: AccountRef,
): Promise<Account> {
  const account = await transaction.getAccount(ref)
  if (account === undefined) throw new AccountRegistryError('account_not_found')
  return account
}

export async function requireCurrentOwnership(
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

export async function requireMembership(
  transaction: AccountRegistryTransaction,
  ref: MembershipRef,
): Promise<Membership> {
  const membership = await transaction.getMembership(ref)
  if (membership === undefined) throw new AccountRegistryError('membership_not_found')
  return membership
}

export function requireTrustedRecoveryApproval(input: Readonly<{
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
  if (!all([
    approval.approvalRef === input.approvalRef,
    OPAQUE_REF_PATTERN.test(approval.approvalRef),
    OPAQUE_REF_PATTERN.test(approval.verificationRef),
    approval.lifecycle === 'verified',
    Number.isSafeInteger(approval.createdAt),
    approval.createdAt >= approval.frozenAt,
    approval.createdAt <= approval.verifiedAt,
    createdBy.activeAccountRef === account.accountRef,
    createdBy.actorPrincipalRef === approval.participantPrincipalRef,
    approval.accountRef === account.accountRef,
    approval.incumbentOwnerPrincipalRef === incumbentRef,
    approval.successorOwnerPrincipalRef === successorRef,
    approval.participantPrincipalRef !== incumbentRef,
    approval.participantPrincipalRef !== successorRef,
    approval.recoveryPolicyRevision === account.recoveryPolicy.revision,
    approval.frozenAccountRevision === account.revision,
    approval.frozenAt === account.updatedAt,
    Number.isSafeInteger(approval.verifiedAt),
    Number.isSafeInteger(approval.expiresAt),
    approval.verifiedAt >= approval.frozenAt,
    approval.verifiedAt <= input.timestamp,
    approval.expiresAt > approval.verifiedAt,
    approval.expiresAt >= input.authorizationExpiresAt,
  ])) {
    throw new AccountRegistryError('recovery_participant_approval_invalid')
  }
  return approval
}

export function assertSuccessionAuthorization(
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
  if (!all([
    SUCCESSION_AUTHORIZATION_REF_PATTERN.test(authorization.authorizationRef),
    authorization.accountRef === account.accountRef,
    authorization.incumbentOwnerPrincipalRef === currentOwnership.ownerPrincipalRef,
    authorization.successorOwnerPrincipalRef === successorRef,
    authorization.recoveryPolicyRevision === recoveryPolicy.revision,
    authorization.frozenAccountRevision === account.revision,
    authorization.frozenAt === account.updatedAt,
    authorization.availableAt === authorization.frozenAt + recoveryPolicy.delayMs,
    Number.isSafeInteger(authorization.availableAt),
    Number.isSafeInteger(authorization.authorizedAt),
    Number.isSafeInteger(authorization.expiresAt),
    authorization.authorizedAt >= authorization.frozenAt,
    authorization.authorizedAt <= timestamp,
    authorization.expiresAt >= authorization.authorizedAt,
    authorization.verifiedParticipantCount >= recoveryPolicy.threshold,
    authorization.verifiedParticipantCount <= recoveryPolicy.participantCount,
    isPositiveRevision(authorization.revision),
    authorization.createdAt === authorization.authorizedAt,
  ])) {
    throw new AccountRegistryError('succession_authorization_invalid')
  }
  if (timestamp < authorization.availableAt) {
    throw new AccountRegistryError('succession_authorization_invalid')
  }
  if (authorization.expiresAt <= timestamp) {
    throw new AccountRegistryError('succession_authorization_expired')
  }
}

export function freezeSuccessionAuthorization(value: SuccessionAuthorization): SuccessionAuthorization {
  return Object.freeze({
    ...value,
    ...(value.consumedBy === undefined ? {} : { consumedBy: Object.freeze(value.consumedBy) }),
  })
}

export function freezeAccount(value: Account): Account {
  return Object.freeze({ ...value, recoveryPolicy: Object.freeze(value.recoveryPolicy), lastAction: Object.freeze(value.lastAction) })
}

export function freezeOwnership(value: AccountOwnership): AccountOwnership {
  return Object.freeze(value)
}

export function freezeMembership(value: Membership): Membership {
  return Object.freeze(value)
}
