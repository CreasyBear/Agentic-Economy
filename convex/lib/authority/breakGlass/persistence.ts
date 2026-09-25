import type { Doc } from '../../../_generated/dataModel'
import type { MutationCtx } from '../../../_generated/server'
import {
  RecoveryError,
  parsePersistedRecoveryAdmission,
  recoveryAdmissionRef,
  type DurableRecoveryPersistence,
  type DurableRecoverySession,
  type RecoveryAdmission,
  type RecoveryCommit,
  type VerifiedBreakGlassApproval,
} from '../../../../src/modules/authority/recovery/public'
import { accountRef, principalRef } from '../../../../src/modules/principal-account/public'
import { delegationGrantRef, delegationSnapshotRef } from '../../../../src/modules/authority/delegation/public'

export function createConvexRecoveryPersistence(ctx: MutationCtx): DurableRecoveryPersistence {
  return Object.freeze({
    transact: async <Result>(operation: (session: DurableRecoverySession) => Promise<Result>) =>
      await operation(createRecoverySession(ctx)),
  })
}

function createRecoverySession(ctx: MutationCtx): DurableRecoverySession {
  return Object.freeze({
    getApproval: async (approvalRef) => approvalFromRow(await ctx.db
      .query('recoveryBreakGlassApprovals')
      .withIndex('by_approvalRef', (query) => query.eq('approvalRef', approvalRef)).unique()),
    getApprovalByVerification: async (verificationRef) => approvalFromRow(await ctx.db
      .query('recoveryBreakGlassApprovals')
      .withIndex('by_verificationRef', (query) => query.eq('verificationRef', verificationRef)).unique()),
    getAdmissionByIdempotency: async (account, operator, idempotencyRef) => admissionFromRow(await ctx.db
      .query('recoveryBreakGlassAdmissions')
      .withIndex('by_accountRef_and_operatorPrincipalRef_and_idempotencyRef', (query) => query
        .eq('accountRef', account)
        .eq('operatorPrincipalRef', operator)
        .eq('context.idempotencyRef', idempotencyRef))
      .unique()),
    getAdmission: async (admissionRef) => admissionFromRow(await ctx.db
      .query('recoveryBreakGlassAdmissions')
      .withIndex('by_admissionRef', (query) => query.eq('admissionRef', admissionRef)).unique()),
    insertVerifiedApproval: async (approval) => {
      if (await ctx.db.query('recoveryBreakGlassApprovals')
        .withIndex('by_approvalRef', (query) => query.eq('approvalRef', approval.approvalRef)).unique() !== null
        || await ctx.db.query('recoveryBreakGlassApprovals')
          .withIndex('by_verificationRef', (query) => query.eq('verificationRef', approval.verificationRef)).unique() !== null) {
        throw new RecoveryError('recovery_approval_duplicate')
      }
      await ctx.db.insert('recoveryBreakGlassApprovals', approvalForStorage(approval))
    },
    commitRecoveryAtomically: async (change) => await commitRecovery(ctx, change),
  })
}

async function commitRecovery(ctx: MutationCtx, change: RecoveryCommit): Promise<void> {
  const admission = parsePersistedRecoveryAdmission(change.admissionInsert)
  if (await ctx.db.query('recoveryBreakGlassAdmissions')
    .withIndex('by_admissionRef', (query) => query.eq('admissionRef', admission.admissionRef)).unique() !== null) {
    throw new RecoveryError('recovery_admission_ref_conflict')
  }
  const seen = new Set<string>()
  for (const replacement of change.approvalReplacements) {
    if (seen.has(replacement.value.approvalRef)) throw new RecoveryError('recovery_approval_duplicate')
    seen.add(replacement.value.approvalRef)
  }
  const replacements = await Promise.all(change.approvalReplacements.map(async (replacement) => {
    const row = await ctx.db.query('recoveryBreakGlassApprovals')
      .withIndex('by_approvalRef', (query) => query.eq('approvalRef', replacement.value.approvalRef)).unique()
    if (row === null
      || row.lifecycle !== replacement.expectedLifecycle
      || replacement.value.lifecycle !== 'consumed'
      || replacement.value.consumedByAdmissionRef !== admission.admissionRef) {
      throw new RecoveryError('recovery_approval_unavailable')
    }
    return { row, value: approvalForStorage(replacement.value) }
  }))
  const admissionApprovalRefs = new Set(admission.approvalRefs)
  if (replacements.length !== admission.approvalRefs.length
    || replacements.some(({ value }) => !admissionApprovalRefs.has(value.approvalRef))) {
    throw new RecoveryError('recovery_approval_unavailable')
  }
  await Promise.all(replacements.map(async (replacement) =>
    await ctx.db.replace(replacement.row._id, replacement.value)))
  await ctx.db.insert('recoveryBreakGlassAdmissions', admissionForStorage(admission))
}

export function approvalForStorage(value: VerifiedBreakGlassApproval) {
  return {
    ...value,
    ...(value.consumedAt === undefined ? {} : { consumedAt: value.consumedAt }),
    ...(value.consumedByAdmissionRef === undefined
      ? {}
      : { consumedByAdmissionRef: value.consumedByAdmissionRef }),
  }
}

export function admissionForStorage(value: RecoveryAdmission) {
  return {
    ...value,
    approvalRefs: [...value.approvalRefs],
    verificationRefs: [...value.verificationRefs],
    context: { ...value.context },
  }
}

function approvalFromRow(row: Doc<'recoveryBreakGlassApprovals'> | null): VerifiedBreakGlassApproval | undefined {
  if (row === null) return undefined
  const { _id, _creationTime, ...value } = row
  void _id
  void _creationTime
  return canonicalApprovalInput(value)
}

function canonicalApprovalInput(
  input: Omit<Doc<'recoveryBreakGlassApprovals'>, '_id' | '_creationTime'>,
): VerifiedBreakGlassApproval {
  const { consumedAt, consumedByAdmissionRef, ...value } = input
  return Object.freeze({
    ...value,
    accountRef: accountRef(value.accountRef),
    subjectPrincipalRef: principalRef(value.subjectPrincipalRef),
    operatorPrincipalRef: principalRef(value.operatorPrincipalRef),
    ...(consumedAt === undefined ? {} : { consumedAt }),
    ...(consumedByAdmissionRef === undefined
      ? {}
      : { consumedByAdmissionRef: recoveryAdmissionRef(consumedByAdmissionRef) }),
  })
}

function admissionFromRow(row: Doc<'recoveryBreakGlassAdmissions'> | null): RecoveryAdmission | undefined {
  if (row === null) return undefined
  const { _id, _creationTime, ...value } = row
  void _id
  void _creationTime
  return parsePersistedRecoveryAdmission({
    ...value,
    admissionRef: recoveryAdmissionRef(value.admissionRef),
    accountRef: accountRef(value.accountRef),
    subjectPrincipalRef: principalRef(value.subjectPrincipalRef),
    operatorPrincipalRef: principalRef(value.operatorPrincipalRef),
    authoritySnapshotRef: delegationSnapshotRef(value.authoritySnapshotRef),
    grantRef: delegationGrantRef(value.grantRef),
    approvalRefs: Object.freeze([...value.approvalRefs]),
    verificationRefs: Object.freeze([...value.verificationRefs]),
    context: Object.freeze({
      ...value.context,
      actorPrincipalRef: principalRef(value.context.actorPrincipalRef),
      activeAccountRef: accountRef(value.context.activeAccountRef),
    }),
  })
}
