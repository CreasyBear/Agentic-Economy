import type { Principal, PrincipalRef } from '../../principal/public'

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

