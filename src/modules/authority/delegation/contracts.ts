import type {
  AccountActionContext,
  AccountRef,
  ActiveAccountContext,
} from '../../principal-account/account/public'
import type { PrincipalRef } from '../../principal-account/principal/public'

export const DELEGATION_MAX_SCOPES = 64
export const DELEGATION_MAX_RESOURCES = 64
export const DELEGATION_MAX_ANCESTRY_GRANTS = 32

declare const delegationGrantRefBrand: unique symbol
declare const delegationSnapshotRefBrand: unique symbol

export type DelegationGrantRef = string & Readonly<{ [delegationGrantRefBrand]: 'DelegationGrantRef' }>
export type DelegationSnapshotRef = string & Readonly<{ [delegationSnapshotRefBrand]: 'DelegationSnapshotRef' }>

export type DelegationGrantLifecycle = 'active' | 'revoked'

export type DelegationGrant = Readonly<{
  grantRef: DelegationGrantRef
  accountRef: AccountRef
  actorPrincipalRef: PrincipalRef
  subjectPrincipalRef: PrincipalRef
  parentGrantRef?: DelegationGrantRef
  parentGeneration?: number
  scopes: readonly string[]
  resourceRefs: readonly string[]
  budgetLimit: number
  budgetUsed: number
  expiresAt: number
  generation: number
  revision: number
  lifecycle: DelegationGrantLifecycle
  createdAt: number
  createdBy: AccountActionContext
  revokedAt?: number
  revokedBy?: AccountActionContext
}>

export type DelegationAuthorityAncestor = Readonly<{
  grantRef: DelegationGrantRef
  generation: number
  accountRef: AccountRef
  actorPrincipalRef: PrincipalRef
  subjectPrincipalRef: PrincipalRef
  scopes: readonly string[]
  resourceRefs: readonly string[]
  budgetLimit: number
  budgetUsedBefore: number
  expiresAt: number
}>

export type DelegationAuthoritySnapshot = Readonly<{
  snapshotRef: DelegationSnapshotRef
  grantRef: DelegationGrantRef
  generation: number
  accountRef: AccountRef
  accountRevision: number
  actorPrincipalRef: PrincipalRef
  subjectPrincipalRef: PrincipalRef
  scopes: readonly string[]
  resourceRefs: readonly string[]
  budgetAmount: number
  admittedAt: number
  expiresAt: number
  correlationRef: string
  idempotencyRef: string
  ancestry: readonly DelegationAuthorityAncestor[]
}>

export type DelegationGrantReplacement = Readonly<{
  value: DelegationGrant
  expectedRevision: number
}>

export type DelegationCommit = Readonly<{
  grantInsert?: DelegationGrant
  grantReplacements?: readonly DelegationGrantReplacement[]
  snapshotInsert?: DelegationAuthoritySnapshot
}>

export type DelegationTransaction = Readonly<{
  getGrant(grantRef: DelegationGrantRef): Promise<DelegationGrant | undefined>
  getGrantByCreationIdempotency(
    accountRef: AccountRef,
    actorPrincipalRef: PrincipalRef,
    idempotencyRef: string,
  ): Promise<DelegationGrant | undefined>
  getSnapshotByAdmissionIdempotency(
    accountRef: AccountRef,
    actorPrincipalRef: PrincipalRef,
    idempotencyRef: string,
  ): Promise<DelegationAuthoritySnapshot | undefined>
  getSnapshot(snapshotRef: DelegationSnapshotRef): Promise<DelegationAuthoritySnapshot | undefined>
  commit(change: DelegationCommit): Promise<void>
}>

export type DelegationStore = Readonly<{
  transact<Result>(operation: (transaction: DelegationTransaction) => Promise<Result>): Promise<Result>
}>

/**
 * Trusted adapter over the canonical Principal/Account registry. Request fields
 * are only selectors; this port establishes membership and root-issuer authority.
 */
export type DelegationContextPort = Readonly<{
  resolveActiveContext(context: AccountActionContext): Promise<ActiveAccountContext>
  resolveRootIssuerContext(context: AccountActionContext): Promise<ActiveAccountContext>
  requireActivePrincipal(principalRef: PrincipalRef): Promise<void>
}>

export type DelegationServiceOptions = Readonly<{
  now?: () => number
  randomUuid?: () => string
}>

export type DelegationErrorCode =
  | 'delegation_actor_mismatch'
  | 'delegation_ancestry_account_mismatch'
  | 'delegation_ancestry_cycle'
  | 'delegation_ancestry_generation_stale'
  | 'delegation_ancestry_invalid'
  | 'delegation_budget_denied'
  | 'delegation_budget_invalid'
  | 'delegation_budget_widened'
  | 'delegation_expired'
  | 'delegation_expiry_invalid'
  | 'delegation_expiry_not_strictly_narrower'
  | 'delegation_generation_stale'
  | 'delegation_grant_not_found'
  | 'delegation_grant_ref_conflict'
  | 'delegation_grant_ref_invalid'
  | 'delegation_idempotency_conflict'
  | 'delegation_limit_exceeded'
  | 'delegation_request_invalid'
  | 'delegation_resource_denied'
  | 'delegation_resource_invalid'
  | 'delegation_resource_widened'
  | 'delegation_revoked'
  | 'delegation_scope_denied'
  | 'delegation_scope_invalid'
  | 'delegation_scope_widened'
  | 'delegation_snapshot_ref_conflict'
  | 'delegation_snapshot_ref_invalid'
  | 'delegation_snapshot_invalid'

export class DelegationError extends Error {
  readonly code: DelegationErrorCode

  constructor(code: DelegationErrorCode) {
    super(code)
    this.name = 'DelegationError'
    this.code = code
  }
}

export type IssueRootGrantRequest = Readonly<{
  context: AccountActionContext
  subjectPrincipalRef: PrincipalRef
  scopes: readonly string[]
  resourceRefs: readonly string[]
  budgetLimit: number
  expiresAt: number
}>

export type DelegateGrantRequest = IssueRootGrantRequest & Readonly<{
  parentGrantRef: DelegationGrantRef
  parentGeneration: number
}>

export type AdmitConsequenceRequest = Readonly<{
  grantRef: DelegationGrantRef
  expectedGeneration: number
  context: AccountActionContext
  requiredScopes: readonly string[]
  resourceRefs: readonly string[]
  budgetAmount: number
}>

export type RevokeGrantRequest = Readonly<{
  grantRef: DelegationGrantRef
  expectedGeneration: number
  context: AccountActionContext
}>


