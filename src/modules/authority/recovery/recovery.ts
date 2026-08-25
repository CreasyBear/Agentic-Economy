import {
  accountRef,
  type AccountActionContext,
  type AccountLifecycle,
  type AccountRef,
  type NoTransferRecoveryPolicy,
  type OwnershipLifecycle,
  type OwnershipRef,
  type ThresholdRecoveryPolicy,
} from '../../principal-account/account/public'
import {
  principalRef,
  type PrincipalRef,
} from '../../principal-account/principal/public'
import {
  delegationGrantRef,
  delegationSnapshotRef,
  type AdmitConsequenceRequest,
  type DelegationAuthoritySnapshot,
  type DelegationGrantRef,
  type DelegationSnapshotRef,
} from '../delegation/public'

const RECOVERY_ADMISSION_REF_PATTERN = /^rcv_[0-9a-f]{32}$/u
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u
const OPAQUE_REF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/u
export const RECOVERY_MAX_APPROVALS = 32

declare const recoveryAdmissionRefBrand: unique symbol
export type RecoveryAdmissionRef = string & Readonly<{ [recoveryAdmissionRefBrand]: 'RecoveryAdmissionRef' }>

export const RECOVERY_ACTIONS = ['freeze', 'isolate', 'inspect_secret_canary'] as const
export type RecoveryAction = typeof RECOVERY_ACTIONS[number]

export type RecoveryAccountFacts = Readonly<{
  account: Readonly<{
    accountRef: AccountRef
    lifecycle: AccountLifecycle
    recoveryPolicy: ThresholdRecoveryPolicy | NoTransferRecoveryPolicy
    revision: number
    updatedAt: number
    currentOwnershipRef: OwnershipRef
  }>
  ownership: Readonly<{
    ownershipRef: OwnershipRef
    accountRef: AccountRef
    ownerPrincipalRef: PrincipalRef
    lifecycle: OwnershipLifecycle
    revision: number
  }>
}>

export type VerifiedBreakGlassApproval = Readonly<{
  approvalRef: string
  accountRef: AccountRef
  subjectPrincipalRef: PrincipalRef
  operatorPrincipalRef: PrincipalRef
  action: RecoveryAction
  recoveryPolicyRevision: number
  frozenAccountRevision: number
  verificationRef: string
  lifecycle: 'verified' | 'revoked' | 'consumed'
  verifiedAt: number
  expiresAt: number
  consumedAt?: number
  consumedByAdmissionRef?: RecoveryAdmissionRef
}>

export type RecoveryAdmission = Readonly<{
  admissionRef: RecoveryAdmissionRef
  accountRef: AccountRef
  subjectPrincipalRef: PrincipalRef
  operatorPrincipalRef: PrincipalRef
  action: RecoveryAction
  recoveryPolicyKind: 'threshold' | 'no_transfer'
  recoveryPolicyRevision: number
  frozenAccountRevision: number
  authoritySnapshotRef: DelegationSnapshotRef
  grantRef: DelegationGrantRef
  grantGeneration: number
  approvalRefs: readonly string[]
  verificationRefs: readonly string[]
  availableAt: number
  admittedAt: number
  expiresAt: number
  lifecycle: 'consumed'
  context: AccountActionContext
}>

export type RecoveryApprovalReplacement = Readonly<{
  value: VerifiedBreakGlassApproval
  expectedLifecycle: 'verified'
}>

export type RecoveryCommit = Readonly<{
  admissionInsert: RecoveryAdmission
  approvalReplacements: readonly RecoveryApprovalReplacement[]
}>

export type RecoveryTransaction = Readonly<{
  getApproval(approvalRef: string): Promise<VerifiedBreakGlassApproval | undefined>
  getAdmissionByIdempotency(
    accountRef: AccountRef,
    operatorPrincipalRef: PrincipalRef,
    idempotencyRef: string,
  ): Promise<RecoveryAdmission | undefined>
  getAdmission(admissionRef: RecoveryAdmissionRef): Promise<RecoveryAdmission | undefined>
  commit(change: RecoveryCommit): Promise<void>
}>

export type RecoveryStore = Readonly<{
  transact<Result>(operation: (transaction: RecoveryTransaction) => Promise<Result>): Promise<Result>
}>

/** Trusted adapter over the Phase 1 Account and current ownership facts. */
export type RecoveryAccountFactsPort = Readonly<{
  resolve(accountRef: AccountRef): Promise<RecoveryAccountFacts>
}>

/** Adapter over P2-01 consequence admission; it must resolve current authority. */
export type RecoveryAuthorityPort = Readonly<{
  admitConsequence(request: AdmitConsequenceRequest): Promise<DelegationAuthoritySnapshot>
}>

export type RecoveryCoordinatorOptions = Readonly<{
  now?: () => number
  randomUuid?: () => string
}>

export type AuthorizeRecoveryRequest = Readonly<{
  action: RecoveryAction
  accountRef: AccountRef
  subjectPrincipalRef: PrincipalRef
  grantRef: DelegationGrantRef
  expectedGrantGeneration: number
  approvalRefs: readonly string[]
  context: AccountActionContext
}>

export type RecoveryErrorCode =
  | 'recovery_account_facts_invalid'
  | 'recovery_account_mismatch'
  | 'recovery_action_invalid'
  | 'recovery_admission_ref_conflict'
  | 'recovery_admission_ref_invalid'
  | 'recovery_approval_duplicate'
  | 'recovery_approval_expired'
  | 'recovery_approval_mismatch'
  | 'recovery_approval_not_found'
  | 'recovery_approval_unavailable'
  | 'recovery_authority_invalid'
  | 'recovery_delay_active'
  | 'recovery_generation_invalid'
  | 'recovery_idempotency_conflict'
  | 'recovery_operator_impersonation'
  | 'recovery_operator_unapproved'
  | 'recovery_persisted_admission_invalid'
  | 'recovery_request_invalid'
  | 'recovery_freeze_required'
  | 'recovery_threshold_unmet'

export class RecoveryError extends Error {
  readonly code: RecoveryErrorCode

  constructor(code: RecoveryErrorCode) {
    super(code)
    this.name = 'RecoveryError'
    this.code = code
  }
}

export function recoveryAdmissionRef(value: string): RecoveryAdmissionRef {
  if (!RECOVERY_ADMISSION_REF_PATTERN.test(value)) throw new RecoveryError('recovery_admission_ref_invalid')
  return value as RecoveryAdmissionRef
}

export function generateRecoveryAdmissionRef(
  randomUuid: () => string = () => globalThis.crypto.randomUUID(),
): RecoveryAdmissionRef {
  const value = randomUuid()
  if (!UUID_PATTERN.test(value)) throw new RecoveryError('recovery_admission_ref_invalid')
  return recoveryAdmissionRef(`rcv_${value.replaceAll('-', '')}`)
}

export class RecoveryCoordinator {
  readonly #store: RecoveryStore
  readonly #accounts: RecoveryAccountFactsPort
  readonly #authority: RecoveryAuthorityPort
  readonly #now: () => number
  readonly #randomUuid: () => string

  constructor(
    store: RecoveryStore,
    accounts: RecoveryAccountFactsPort,
    authority: RecoveryAuthorityPort,
    options: RecoveryCoordinatorOptions = {},
  ) {
    this.#store = store
    this.#accounts = accounts
    this.#authority = authority
    this.#now = options.now ?? (() => Date.now())
    this.#randomUuid = options.randomUuid ?? (() => globalThis.crypto.randomUUID())
  }

  async authorize(input: AuthorizeRecoveryRequest): Promise<RecoveryAdmission> {
    const request = validRequest(input)
    return await this.#store.transact(async (transaction) => {
      const existing = await transaction.getAdmissionByIdempotency(
        request.accountRef,
        request.context.actorPrincipalRef,
        request.context.idempotencyRef,
      )
      if (existing !== undefined) {
        const persisted = parsePersistedRecoveryAdmission(existing)
        if (matchesReplay(persisted, request)) return persisted
        throw new RecoveryError('recovery_idempotency_conflict')
      }

      const timestamp = validTimestamp(this.#now())
      const facts = await this.#accounts.resolve(request.accountRef)
      assertAccountFacts(facts, request)
      const policy = facts.account.recoveryPolicy
      const threshold = policy.kind === 'threshold' ? Math.max(2, policy.threshold) : 2
      if (request.approvalRefs.length < threshold
        || request.approvalRefs.length > RECOVERY_MAX_APPROVALS
        || (policy.kind === 'threshold' && request.approvalRefs.length > policy.participantCount)) {
        throw new RecoveryError('recovery_threshold_unmet')
      }
      const availableAt = request.action === 'freeze' || policy.kind === 'no_transfer'
        ? facts.account.updatedAt
        : safeAdd(facts.account.updatedAt, policy.delayMs)
      if (timestamp < availableAt) throw new RecoveryError('recovery_delay_active')

      const approvals = await loadApprovals(transaction, request, facts, timestamp)
      if (!approvals.some((approval) => approval.operatorPrincipalRef === request.context.actorPrincipalRef)) {
        throw new RecoveryError('recovery_operator_unapproved')
      }

      const requiredScope = `recovery:${request.action}`
      const resourceRef = `account:${request.accountRef}`
      const snapshot = await this.#authority.admitConsequence({
        grantRef: request.grantRef,
        expectedGeneration: request.expectedGrantGeneration,
        context: request.context,
        requiredScopes: [requiredScope],
        resourceRefs: [resourceRef],
        budgetAmount: 0,
      })
      assertAuthoritySnapshot(snapshot, request, facts, timestamp, requiredScope, resourceRef)

      const newAdmissionRef = generateRecoveryAdmissionRef(this.#randomUuid)
      if (await transaction.getAdmission(newAdmissionRef) !== undefined) {
        throw new RecoveryError('recovery_admission_ref_conflict')
      }
      const approvalRefs = Object.freeze(approvals.map((approval) => approval.approvalRef))
      const verificationRefs = Object.freeze(approvals.map((approval) => approval.verificationRef))
      const admission: RecoveryAdmission = Object.freeze({
        admissionRef: newAdmissionRef,
        accountRef: request.accountRef,
        subjectPrincipalRef: request.subjectPrincipalRef,
        operatorPrincipalRef: request.context.actorPrincipalRef,
        action: request.action,
        recoveryPolicyKind: policy.kind,
        recoveryPolicyRevision: policy.revision,
        frozenAccountRevision: facts.account.revision,
        authoritySnapshotRef: snapshot.snapshotRef,
        grantRef: snapshot.grantRef,
        grantGeneration: snapshot.generation,
        approvalRefs,
        verificationRefs,
        availableAt,
        admittedAt: timestamp,
        expiresAt: Math.min(snapshot.expiresAt, ...approvals.map((approval) => approval.expiresAt)),
        lifecycle: 'consumed',
        context: freezeContext(request.context),
      })
      const approvalReplacements = Object.freeze(approvals.map((approval) => Object.freeze({
        value: Object.freeze({
          ...approval,
          lifecycle: 'consumed' as const,
          consumedAt: timestamp,
          consumedByAdmissionRef: newAdmissionRef,
        }),
        expectedLifecycle: 'verified' as const,
      })))
      await transaction.commit(Object.freeze({ admissionInsert: admission, approvalReplacements }))
      return admission
    })
  }
}

function validRequest(input: AuthorizeRecoveryRequest): AuthorizeRecoveryRequest {
  if (!RECOVERY_ACTIONS.includes(input.action)) throw new RecoveryError('recovery_action_invalid')
  const selectedAccountRef = accountRef(input.accountRef)
  const subjectPrincipalRef = principalRef(input.subjectPrincipalRef)
  const actorPrincipalRef = principalRef(input.context.actorPrincipalRef)
  if (input.context.activeAccountRef !== selectedAccountRef) throw new RecoveryError('recovery_account_mismatch')
  if (actorPrincipalRef === subjectPrincipalRef) throw new RecoveryError('recovery_operator_impersonation')
  if (!Number.isSafeInteger(input.expectedGrantGeneration) || input.expectedGrantGeneration < 1) {
    throw new RecoveryError('recovery_generation_invalid')
  }
  if (!OPAQUE_REF_PATTERN.test(input.context.correlationRef)
    || !OPAQUE_REF_PATTERN.test(input.context.idempotencyRef)
    || input.approvalRefs.length === 0
    || input.approvalRefs.some((ref) => !OPAQUE_REF_PATTERN.test(ref))) {
    throw new RecoveryError('recovery_request_invalid')
  }
  if (new Set(input.approvalRefs).size !== input.approvalRefs.length) {
    throw new RecoveryError('recovery_approval_duplicate')
  }
  return Object.freeze({
    ...input,
    accountRef: selectedAccountRef,
    subjectPrincipalRef,
    grantRef: delegationGrantRef(input.grantRef),
    approvalRefs: Object.freeze([...input.approvalRefs]),
    context: freezeContext({ ...input.context, actorPrincipalRef }),
  })
}

function assertAccountFacts(facts: RecoveryAccountFacts, request: AuthorizeRecoveryRequest): void {
  const account = facts.account
  const ownership = facts.ownership
  if (account.accountRef !== request.accountRef
    || ownership.accountRef !== request.accountRef
    || ownership.ownershipRef !== account.currentOwnershipRef
    || ownership.lifecycle !== 'active'
    || ownership.ownerPrincipalRef !== request.subjectPrincipalRef
    || !Number.isSafeInteger(account.revision)
    || account.revision < 1
    || !Number.isSafeInteger(account.updatedAt)
    || account.updatedAt < 0) {
    throw new RecoveryError('recovery_account_facts_invalid')
  }
  const lifecycleValid = request.action === 'freeze'
    ? account.lifecycle === 'active'
    : account.lifecycle === 'suspended'
  if (!lifecycleValid) throw new RecoveryError('recovery_freeze_required')
}

async function loadApprovals(
  transaction: RecoveryTransaction,
  request: AuthorizeRecoveryRequest,
  facts: RecoveryAccountFacts,
  timestamp: number,
): Promise<readonly VerifiedBreakGlassApproval[]> {
  const approvals: VerifiedBreakGlassApproval[] = []
  const operators = new Set<PrincipalRef>()
  const verifications = new Set<string>()
  for (const approvalRef of request.approvalRefs) {
    const approval = await transaction.getApproval(approvalRef)
    if (approval === undefined) throw new RecoveryError('recovery_approval_not_found')
    if (approval.lifecycle !== 'verified') throw new RecoveryError('recovery_approval_unavailable')
    if (approval.expiresAt <= timestamp) throw new RecoveryError('recovery_approval_expired')
    if (approval.approvalRef !== approvalRef
      || approval.accountRef !== request.accountRef
      || approval.subjectPrincipalRef !== request.subjectPrincipalRef
      || approval.action !== request.action
      || approval.recoveryPolicyRevision !== facts.account.recoveryPolicy.revision
      || approval.frozenAccountRevision !== facts.account.revision
      || !OPAQUE_REF_PATTERN.test(approval.verificationRef)
      || !Number.isSafeInteger(approval.verifiedAt)
      || approval.verifiedAt > timestamp) {
      throw new RecoveryError('recovery_approval_mismatch')
    }
    if (operators.has(approval.operatorPrincipalRef) || verifications.has(approval.verificationRef)) {
      throw new RecoveryError('recovery_approval_duplicate')
    }
    operators.add(approval.operatorPrincipalRef)
    verifications.add(approval.verificationRef)
    approvals.push(approval)
  }
  return Object.freeze(approvals)
}

function assertAuthoritySnapshot(
  snapshot: DelegationAuthoritySnapshot,
  request: AuthorizeRecoveryRequest,
  facts: RecoveryAccountFacts,
  timestamp: number,
  requiredScope: string,
  resourceRef: string,
): void {
  if (snapshot.grantRef !== request.grantRef
    || snapshot.generation !== request.expectedGrantGeneration
    || snapshot.accountRef !== request.accountRef
    || snapshot.accountRevision !== facts.account.revision
    || snapshot.actorPrincipalRef !== request.context.actorPrincipalRef
    || snapshot.subjectPrincipalRef !== request.context.actorPrincipalRef
    || !snapshot.scopes.includes(requiredScope)
    || !snapshot.resourceRefs.includes(resourceRef)
    || snapshot.budgetAmount !== 0
    || snapshot.admittedAt !== timestamp
    || snapshot.expiresAt <= timestamp
    || snapshot.correlationRef !== request.context.correlationRef
    || snapshot.idempotencyRef !== request.context.idempotencyRef) {
    throw new RecoveryError('recovery_authority_invalid')
  }
}

export function parsePersistedRecoveryAdmission(value: RecoveryAdmission): RecoveryAdmission {
  try {
    const admissionRef = recoveryAdmissionRef(value.admissionRef)
    const selectedAccountRef = accountRef(value.accountRef)
    const subjectPrincipalRef = principalRef(value.subjectPrincipalRef)
    const operatorPrincipalRef = principalRef(value.operatorPrincipalRef)
    const authoritySnapshotRef = delegationSnapshotRef(value.authoritySnapshotRef)
    const grantRef = delegationGrantRef(value.grantRef)
    const actionValid = RECOVERY_ACTIONS.includes(value.action)
    const policyValid = value.recoveryPolicyKind === 'threshold' || value.recoveryPolicyKind === 'no_transfer'
    const approvalsValid = value.approvalRefs.length >= 2
      && value.approvalRefs.length <= RECOVERY_MAX_APPROVALS
      && value.approvalRefs.length === value.verificationRefs.length
      && new Set(value.approvalRefs).size === value.approvalRefs.length
      && new Set(value.verificationRefs).size === value.verificationRefs.length
      && value.approvalRefs.every((ref) => OPAQUE_REF_PATTERN.test(ref))
      && value.verificationRefs.every((ref) => OPAQUE_REF_PATTERN.test(ref))
    const numbersValid = positiveInteger(value.recoveryPolicyRevision)
      && positiveInteger(value.frozenAccountRevision)
      && positiveInteger(value.grantGeneration)
      && validPersistedTimestamp(value.availableAt)
      && validPersistedTimestamp(value.admittedAt)
      && validPersistedTimestamp(value.expiresAt)
      && value.availableAt <= value.admittedAt
      && value.admittedAt < value.expiresAt
    const contextValid = value.context.actorPrincipalRef === operatorPrincipalRef
      && value.context.activeAccountRef === selectedAccountRef
      && OPAQUE_REF_PATTERN.test(value.context.correlationRef)
      && OPAQUE_REF_PATTERN.test(value.context.idempotencyRef)
    if (!actionValid
      || !policyValid
      || !approvalsValid
      || !numbersValid
      || !contextValid
      || value.lifecycle !== 'consumed'
      || subjectPrincipalRef === operatorPrincipalRef) {
      throw new RecoveryError('recovery_persisted_admission_invalid')
    }
    return Object.freeze({
      admissionRef,
      accountRef: selectedAccountRef,
      subjectPrincipalRef,
      operatorPrincipalRef,
      action: value.action,
      recoveryPolicyKind: value.recoveryPolicyKind,
      recoveryPolicyRevision: value.recoveryPolicyRevision,
      frozenAccountRevision: value.frozenAccountRevision,
      authoritySnapshotRef,
      grantRef,
      grantGeneration: value.grantGeneration,
      approvalRefs: Object.freeze([...value.approvalRefs]),
      verificationRefs: Object.freeze([...value.verificationRefs]),
      availableAt: value.availableAt,
      admittedAt: value.admittedAt,
      expiresAt: value.expiresAt,
      lifecycle: 'consumed',
      context: freezeContext(value.context),
    })
  } catch {
    throw new RecoveryError('recovery_persisted_admission_invalid')
  }
}

function matchesReplay(existing: RecoveryAdmission, request: AuthorizeRecoveryRequest): boolean {
  return existing.accountRef === request.accountRef
    && existing.subjectPrincipalRef === request.subjectPrincipalRef
    && existing.operatorPrincipalRef === request.context.actorPrincipalRef
    && existing.action === request.action
    && existing.grantRef === request.grantRef
    && existing.grantGeneration === request.expectedGrantGeneration
    && existing.context.correlationRef === request.context.correlationRef
    && existing.context.idempotencyRef === request.context.idempotencyRef
    && arraysEqual(existing.approvalRefs, request.approvalRefs)
}

function arraysEqual(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

function validTimestamp(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new RecoveryError('recovery_request_invalid')
  return value
}

function positiveInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0
}

function validPersistedTimestamp(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0
}

function safeAdd(left: number, right: number): number {
  const result = left + right
  if (!Number.isSafeInteger(result)) throw new RecoveryError('recovery_account_facts_invalid')
  return result
}

function freezeContext(context: AccountActionContext): AccountActionContext {
  return Object.freeze({
    actorPrincipalRef: context.actorPrincipalRef,
    activeAccountRef: context.activeAccountRef,
    correlationRef: context.correlationRef,
    idempotencyRef: context.idempotencyRef,
  })
}
