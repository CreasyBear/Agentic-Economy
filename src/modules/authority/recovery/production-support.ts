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
  authority: RecoveryAuthorityPort
}>

export class ProductionRecoveryService {
  readonly #persistence: DurableRecoveryPersistence
  readonly #coordinator: RecoveryCoordinator

  constructor(options: ProductionRecoveryServiceOptions) {
    this.#persistence = options.persistence
    const coordinatorOptions: RecoveryCoordinatorOptions = Object.freeze({
      ...(options.now === undefined ? {} : { now: options.now }),
      ...(options.randomUuid === undefined ? {} : { randomUuid: options.randomUuid }),
    })
    this.#coordinator = new RecoveryCoordinator(
      createDurableRecoveryStore(options.persistence),
      options.accountFacts,
      options.authority,
      coordinatorOptions,
    )
  }

  async recordVerifiedApproval(input: VerifiedBreakGlassApproval): Promise<VerifiedBreakGlassApproval> {
    const approval = canonicalApproval(input)
    if (approval.lifecycle !== 'verified') throw new RecoveryError('recovery_approval_unavailable')
    if (approval.subjectPrincipalRef === approval.operatorPrincipalRef) {
      throw new RecoveryError('recovery_operator_impersonation')
    }
    try {
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

  async authorize(input: AuthorizeRecoveryRequest): Promise<RecoveryAdmission> {
    return await this.#coordinator.authorize(input)
  }
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
    && left.consumedAt === right.consumedAt
    && left.consumedByAdmissionRef === right.consumedByAdmissionRef
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
