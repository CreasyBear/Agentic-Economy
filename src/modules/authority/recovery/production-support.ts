import type { AccountRef } from '../../principal-account/account/public'
import type { PrincipalRef } from '../../principal-account/principal/public'
import {
  RECOVERY_ACTIONS,
  RecoveryCoordinator,
  RecoveryError,
  parsePersistedRecoveryAdmission,
  recoveryAdmissionRef,
  type AuthorizeRecoveryRequest,
  type RecoveryAccountFactsPort,
  type RecoveryAccountFacts,
  type RecoveryAction,
  type RecoveryAdmission,
  type RecoveryAdmissionRef,
  type RecoveryAuthorityPort,
  type RecoveryCommit,
  type RecoveryCoordinatorOptions,
  type RecoveryStore,
  type VerifiedBreakGlassApproval,
} from './recovery'
import { accountRef } from '../../principal-account/account/public'
import { principalRef } from '../../principal-account/principal/public'

const OPAQUE_REF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/u
const DEFAULT_RECOVERY_APPROVAL_TTL_MS = 5 * 60 * 1_000

/** Caller-selected recovery intent. Verification facts are deliberately absent. */
export type RecoveryApprovalIntent = Readonly<{
  /** Replay-resistant durable idempotency key for this approval intent. */
  approvalRef: string
  accountRef: AccountRef
  action: RecoveryAction
}>

/** Canonical request presented only to the trusted verifier boundary. */
export type RecoveryApprovalVerificationRequest = Readonly<{
  approvalRef: string
  accountRef: AccountRef
  subjectPrincipalRef: PrincipalRef
  action: RecoveryAction
  recoveryPolicyRevision: number
  frozenAccountRevision: number
  verifiedAt: number
  expiresAt: number
}>

/** Identity established by a trusted verifier, never by the approval caller. */
export type TrustedRecoveryApprovalAttestation = Readonly<{
  operatorPrincipalRef: PrincipalRef
  verificationRef: string
}>

export type RecoveryApprovalVerifierPort = Readonly<{
  verify(request: RecoveryApprovalVerificationRequest): Promise<TrustedRecoveryApprovalAttestation>
}>

export type DurableRecoverySession = Readonly<{
  getApproval(approvalRef: string): Promise<VerifiedBreakGlassApproval | undefined>
  getApprovalByVerification(verificationRef: string): Promise<VerifiedBreakGlassApproval | undefined>
  getAdmissionByIdempotency(
    accountRef: AccountRef,
    operatorPrincipalRef: PrincipalRef,
    idempotencyRef: string,
  ): Promise<RecoveryAdmission | undefined>
  getAdmission(admissionRef: RecoveryAdmissionRef): Promise<RecoveryAdmission | undefined>
  insertVerifiedApproval(approval: VerifiedBreakGlassApproval): Promise<void>
  /** One Convex mutation transaction must perform every conditional replacement and the insert. */
  commitRecoveryAtomically(change: RecoveryCommit): Promise<void>
}>

export type DurableRecoveryPersistence = Readonly<{
  transact<Result>(operation: (session: DurableRecoverySession) => Promise<Result>): Promise<Result>
}>

export type ProductionRecoveryServiceOptions = RecoveryCoordinatorOptions & Readonly<{
  persistence: DurableRecoveryPersistence
  accountFacts: RecoveryAccountFactsPort
  /** Required only for consequence authorization; approval recording never establishes authority. */
  authority?: RecoveryAuthorityPort
  approvalVerifier?: RecoveryApprovalVerifierPort
  approvalTtlMs?: number
}>

export class ProductionRecoveryService {
  readonly #persistence: DurableRecoveryPersistence
  readonly #accountFacts: RecoveryAccountFactsPort
  readonly #approvalVerifier: RecoveryApprovalVerifierPort | undefined
  readonly #approvalTtlMs: number
  readonly #now: () => number
  readonly #coordinator: RecoveryCoordinator | undefined

  constructor(options: ProductionRecoveryServiceOptions) {
    this.#persistence = options.persistence
    this.#accountFacts = options.accountFacts
    this.#approvalVerifier = options.approvalVerifier
    this.#approvalTtlMs = options.approvalTtlMs ?? DEFAULT_RECOVERY_APPROVAL_TTL_MS
    this.#now = options.now ?? (() => Date.now())
    if (!positiveInteger(this.#approvalTtlMs)) {
      throw new RecoveryError('recovery_approval_unavailable')
    }
    const coordinatorOptions: RecoveryCoordinatorOptions = Object.freeze({
      ...(options.now === undefined ? {} : { now: options.now }),
      ...(options.randomUuid === undefined ? {} : { randomUuid: options.randomUuid }),
    })
    this.#coordinator = options.authority === undefined
      ? undefined
      : new RecoveryCoordinator(
          createDurableRecoveryStore(options.persistence),
          options.accountFacts,
          options.authority,
          coordinatorOptions,
        )
  }

  async recordApproval(input: RecoveryApprovalIntent): Promise<VerifiedBreakGlassApproval> {
    const intent = canonicalApprovalIntent(input)
    try {
      const facts = canonicalApprovalFacts(await this.#accountFacts.resolve(intent.accountRef), intent)
      const replay = await this.#persistence.transact(async (session) =>
        await session.getApproval(intent.approvalRef))
      if (this.#approvalVerifier === undefined) {
        throw new RecoveryError('recovery_approval_unavailable')
      }
      if (replay !== undefined) {
        const existing = canonicalApproval(replay)
        if (!matchesApprovalIntent(existing, intent, facts)) {
          throw new RecoveryError('recovery_approval_duplicate')
        }
        const replayAttestation = trustedApprovalAttestation(await this.#approvalVerifier.verify(
          verificationRequestFor(intent, facts, existing.verifiedAt, existing.expiresAt),
        ))
        if (replayAttestation.operatorPrincipalRef !== existing.operatorPrincipalRef
          || replayAttestation.verificationRef !== existing.verificationRef) {
          throw new RecoveryError('recovery_approval_duplicate')
        }
        return existing
      }
      const verifiedAt = nonnegativeTimestamp(this.#now())
      const expiresAt = safeAdd(verifiedAt, this.#approvalTtlMs)
      const verificationRequest = verificationRequestFor(intent, facts, verifiedAt, expiresAt)
      const attestation = await this.#approvalVerifier.verify(verificationRequest)
      const canonicalAttestation = trustedApprovalAttestation(attestation)
      const operatorPrincipalRef = canonicalAttestation.operatorPrincipalRef
      if (operatorPrincipalRef === facts.ownership.ownerPrincipalRef) {
        throw new RecoveryError('recovery_operator_impersonation')
      }
      const approval = canonicalApproval(Object.freeze({
        ...verificationRequest,
        operatorPrincipalRef,
        verificationRef: canonicalAttestation.verificationRef,
        lifecycle: 'verified' as const,
      }))

      return await this.#persistence.transact(async (session) => {
        const [byRef, byVerification] = await Promise.all([
          session.getApproval(approval.approvalRef),
          session.getApprovalByVerification(approval.verificationRef),
        ])
        if (byRef !== undefined || byVerification !== undefined) {
          const existing = byRef ?? byVerification
          if (existing !== undefined && approvalsEqual(canonicalApproval(existing), approval)) return approval
          throw new RecoveryError('recovery_approval_duplicate')
        }
        try {
          await session.insertVerifiedApproval(approval)
        } catch {
          throw new RecoveryError('recovery_approval_duplicate')
        }
        return approval
      })
    } catch (error) {
      if (error instanceof RecoveryError) throw error
      throw new RecoveryError('recovery_approval_unavailable')
    }
  }

  /** Legacy verified-object intake is fail-closed until its driver migrates to recordApproval. */
  async recordVerifiedApproval(_input: unknown): Promise<never> {
    throw new RecoveryError('recovery_approval_unavailable')
  }

  async authorize(input: AuthorizeRecoveryRequest): Promise<RecoveryAdmission> {
    if (this.#coordinator === undefined) throw new RecoveryError('recovery_authority_invalid')
    return await this.#coordinator.authorize(input)
  }
}

function verificationRequestFor(
  intent: RecoveryApprovalIntent,
  facts: RecoveryAccountFacts,
  verifiedAt: number,
  expiresAt: number,
): RecoveryApprovalVerificationRequest {
  return Object.freeze({
    approvalRef: intent.approvalRef,
    accountRef: intent.accountRef,
    subjectPrincipalRef: facts.ownership.ownerPrincipalRef,
    action: intent.action,
    recoveryPolicyRevision: facts.account.recoveryPolicy.revision,
    frozenAccountRevision: facts.account.revision,
    verifiedAt,
    expiresAt,
  })
}

function trustedApprovalAttestation(
  attestation: TrustedRecoveryApprovalAttestation,
): TrustedRecoveryApprovalAttestation {
  try {
    return Object.freeze({
      operatorPrincipalRef: principalRef(attestation.operatorPrincipalRef),
      verificationRef: opaqueRef(attestation.verificationRef),
    })
  } catch {
    throw new RecoveryError('recovery_approval_mismatch')
  }
}

function canonicalApprovalIntent(input: RecoveryApprovalIntent): RecoveryApprovalIntent {
  try {
    if (!RECOVERY_ACTIONS.includes(input.action)) {
      throw new RecoveryError('recovery_approval_mismatch')
    }
    return Object.freeze({
      approvalRef: opaqueRef(input.approvalRef),
      accountRef: accountRef(input.accountRef),
      action: input.action,
    })
  } catch (error) {
    if (error instanceof RecoveryError) throw error
    throw new RecoveryError('recovery_approval_mismatch')
  }
}

function canonicalApprovalFacts(
  facts: RecoveryAccountFacts,
  intent: RecoveryApprovalIntent,
): RecoveryAccountFacts {
  try {
    const selectedAccountRef = accountRef(facts.account.accountRef)
    const ownershipAccountRef = accountRef(facts.ownership.accountRef)
    const ownerPrincipalRef = principalRef(facts.ownership.ownerPrincipalRef)
    const lifecycleValid = intent.action === 'freeze'
      ? facts.account.lifecycle === 'active'
      : facts.account.lifecycle === 'suspended'
    const policy = facts.account.recoveryPolicy
    const policyValid = (policy.kind === 'no_transfer'
      || (policy.kind === 'threshold'
        && positiveInteger(policy.threshold)
        && positiveInteger(policy.participantCount)
        && policy.threshold <= policy.participantCount
        && nonnegativeInteger(policy.delayMs)
        && policy.freezeRequired))
      && positiveInteger(policy.revision)
    if (selectedAccountRef !== intent.accountRef
      || ownershipAccountRef !== intent.accountRef
      || facts.ownership.ownershipRef !== facts.account.currentOwnershipRef
      || facts.ownership.lifecycle !== 'active'
      || !positiveInteger(facts.ownership.revision)
      || !positiveInteger(facts.account.revision)
      || !nonnegativeInteger(facts.account.updatedAt)
      || !lifecycleValid
      || !policyValid) {
      throw new RecoveryError('recovery_account_facts_invalid')
    }
    return Object.freeze({
      account: Object.freeze({ ...facts.account, accountRef: selectedAccountRef }),
      ownership: Object.freeze({
        ...facts.ownership,
        accountRef: ownershipAccountRef,
        ownerPrincipalRef,
      }),
    })
  } catch (error) {
    if (error instanceof RecoveryError) throw error
    throw new RecoveryError('recovery_account_facts_invalid')
  }
}

function matchesApprovalIntent(
  approval: VerifiedBreakGlassApproval,
  intent: RecoveryApprovalIntent,
  facts: RecoveryAccountFacts,
): boolean {
  return approval.approvalRef === intent.approvalRef
    && approval.accountRef === intent.accountRef
    && approval.subjectPrincipalRef === facts.ownership.ownerPrincipalRef
    && approval.operatorPrincipalRef !== facts.ownership.ownerPrincipalRef
    && approval.action === intent.action
    && approval.recoveryPolicyRevision === facts.account.recoveryPolicy.revision
    && approval.frozenAccountRevision === facts.account.revision
}

export function createDurableRecoveryStore(persistence: DurableRecoveryPersistence): RecoveryStore {
  return Object.freeze({
    transact: async <Result>(operation: Parameters<RecoveryStore['transact']>[0]): Promise<Result> => {
      try {
        return await persistence.transact(async (session) => await operation({
        getApproval: async (approvalRef) => {
          const value = await session.getApproval(approvalRef)
          return value === undefined ? undefined : canonicalApproval(value)
        },
        getAdmissionByIdempotency: async (account, operator, idempotency) => {
          const value = await session.getAdmissionByIdempotency(account, operator, idempotency)
          return value === undefined ? undefined : parsePersistedRecoveryAdmission(value)
        },
        getAdmission: async (admissionRef) => {
          const value = await session.getAdmission(admissionRef)
          return value === undefined ? undefined : parsePersistedRecoveryAdmission(value)
        },
        commit: async (change) => {
          try {
            await session.commitRecoveryAtomically(canonicalCommit(change))
          } catch (error) {
            if (error instanceof RecoveryError) throw error
            throw new RecoveryError('recovery_approval_unavailable')
          }
        },
        })) as Promise<Result>
      } catch (error) {
        if (error instanceof RecoveryError) throw error
        throw new RecoveryError('recovery_approval_unavailable')
      }
    },
  })
}

function canonicalCommit(change: RecoveryCommit): RecoveryCommit {
  const admissionInsert = parsePersistedRecoveryAdmission(change.admissionInsert)
  const approvalReplacements = Object.freeze(change.approvalReplacements.map((replacement) => {
    const value = canonicalApproval(replacement.value)
    if (replacement.expectedLifecycle !== 'verified'
      || value.lifecycle !== 'consumed'
      || value.consumedByAdmissionRef !== admissionInsert.admissionRef) {
      throw new RecoveryError('recovery_approval_unavailable')
    }
    return Object.freeze({ value, expectedLifecycle: 'verified' as const })
  }))
  return Object.freeze({ admissionInsert, approvalReplacements })
}

function canonicalApproval(input: VerifiedBreakGlassApproval): VerifiedBreakGlassApproval {
  try {
    const approvalRef = opaqueRef(input.approvalRef)
    const selectedAccountRef = accountRef(input.accountRef)
    const subjectPrincipalRef = principalRef(input.subjectPrincipalRef)
    const operatorPrincipalRef = principalRef(input.operatorPrincipalRef)
    const actionValid = RECOVERY_ACTIONS.includes(input.action)
    const lifecycleValid = input.lifecycle === 'verified'
      || input.lifecycle === 'revoked'
      || input.lifecycle === 'consumed'
    const revisionsValid = positiveInteger(input.recoveryPolicyRevision)
      && positiveInteger(input.frozenAccountRevision)
    const timestampsValid = nonnegativeInteger(input.verifiedAt)
      && positiveInteger(input.expiresAt)
      && input.verifiedAt < input.expiresAt
    const consumedValid = input.lifecycle === 'consumed'
      ? input.consumedAt !== undefined
        && nonnegativeInteger(input.consumedAt)
        && input.consumedAt >= input.verifiedAt
        && input.consumedAt < input.expiresAt
        && input.consumedByAdmissionRef !== undefined
      : input.consumedAt === undefined && input.consumedByAdmissionRef === undefined
    if (!actionValid || !lifecycleValid || !revisionsValid || !timestampsValid || !consumedValid) {
      throw new RecoveryError('recovery_approval_mismatch')
    }
    return Object.freeze({
      approvalRef,
      accountRef: selectedAccountRef,
      subjectPrincipalRef,
      operatorPrincipalRef,
      action: input.action,
      recoveryPolicyRevision: input.recoveryPolicyRevision,
      frozenAccountRevision: input.frozenAccountRevision,
      verificationRef: opaqueRef(input.verificationRef),
      lifecycle: input.lifecycle,
      verifiedAt: input.verifiedAt,
      expiresAt: input.expiresAt,
      ...(input.consumedAt === undefined ? {} : { consumedAt: input.consumedAt }),
      ...(input.consumedByAdmissionRef === undefined
        ? {}
        : { consumedByAdmissionRef: recoveryAdmissionRef(input.consumedByAdmissionRef) }),
    })
  } catch (error) {
    if (error instanceof RecoveryError) throw error
    throw new RecoveryError('recovery_approval_mismatch')
  }
}

function approvalsEqual(left: VerifiedBreakGlassApproval, right: VerifiedBreakGlassApproval): boolean {
  return left.approvalRef === right.approvalRef
    && left.accountRef === right.accountRef
    && left.subjectPrincipalRef === right.subjectPrincipalRef
    && left.operatorPrincipalRef === right.operatorPrincipalRef
    && left.action === right.action
    && left.recoveryPolicyRevision === right.recoveryPolicyRevision
    && left.frozenAccountRevision === right.frozenAccountRevision
    && left.verificationRef === right.verificationRef
    && left.lifecycle === right.lifecycle
    && left.verifiedAt === right.verifiedAt
    && left.expiresAt === right.expiresAt
}

function opaqueRef(value: string): string {
  if (!OPAQUE_REF_PATTERN.test(value)) throw new RecoveryError('recovery_approval_mismatch')
  return value
}

function positiveInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0
}

function nonnegativeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0
}

function nonnegativeTimestamp(value: number): number {
  if (!nonnegativeInteger(value)) throw new RecoveryError('recovery_approval_unavailable')
  return value
}

function safeAdd(left: number, right: number): number {
  const result = left + right
  if (!Number.isSafeInteger(result)) throw new RecoveryError('recovery_approval_unavailable')
  return result
}
