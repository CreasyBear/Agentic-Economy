import { v } from 'convex/values'

import { internalMutation, type MutationCtx } from './_generated/server'
import type { Doc } from './_generated/dataModel'
import {
  ProductionRecoveryService,
  RecoveryError,
  parsePersistedRecoveryAdmission,
  recoveryActionValue,
  recoveryAdmissionRef,
  recoveryAdmissionValue,
  recoveryApprovalValue,
  type AuthorizeRecoveryRequest,
  type DurableRecoveryPersistence,
  type DurableRecoverySession,
  type RecoveryAdmission,
  type RecoveryCommit,
  type VerifiedBreakGlassApproval,
} from '../src/modules/authority/recovery/public'
import {
  accountRef,
  ownershipRef,
  principalRef,
  type RecoveryPolicy,
} from '../src/modules/principal-account/public'
import {
  DelegationError,
  DelegationService,
  delegationGrantRef,
  delegationSnapshotRef,
  type DelegationContextPort,
} from '../src/modules/authority/delegation/public'
import { createConvexDelegationStore } from './lib/delegationPersistence'

const authorizeRecoveryArgs = {
  action: recoveryActionValue,
  accountRef: v.string(),
  subjectPrincipalRef: v.string(),
  grantRef: v.string(),
  expectedGrantGeneration: v.number(),
  approvalRefs: v.array(v.string()),
  context: v.object({
    actorPrincipalRef: v.string(),
    activeAccountRef: v.string(),
    correlationRef: v.string(),
    idempotencyRef: v.string(),
  }),
} as const

export async function recordVerifiedRecoveryApprovalHandler(
  ctx: MutationCtx,
  approval: VerifiedBreakGlassApproval,
): Promise<VerifiedBreakGlassApproval> {
  const unavailable = async (): Promise<never> => {
    throw new RecoveryError('recovery_approval_unavailable')
  }
  return await new ProductionRecoveryService({
    persistence: createConvexRecoveryPersistence(ctx),
    accountFacts: { resolve: unavailable },
    authority: { admitConsequence: unavailable },
  }).recordVerifiedApproval(approval)
}

export async function authorizeRecoveryHandler(
  ctx: MutationCtx,
  input: AuthorizeRecoveryRequest,
): Promise<RecoveryAdmission> {
  const now = Date.now()
  const actor = principalRef(input.context.actorPrincipalRef)
  const delegation = new DelegationService(
    createConvexDelegationStore(ctx),
    createRecoveryDelegationContextPort(ctx, actor, input.action, input.accountRef),
    { now: () => now },
  )
  return await new ProductionRecoveryService({
    persistence: createConvexRecoveryPersistence(ctx),
    accountFacts: {
      resolve: async (selectedAccountRef) => {
        const selected = accountRef(selectedAccountRef)
        const account = await ctx.db.query('accounts')
          .withIndex('by_accountRef', (query) => query.eq('accountRef', selected)).unique()
        if (account === null || account.currentOwnershipRef.length === 0) {
          throw new RecoveryError('recovery_account_facts_invalid')
        }
        const ownership = await ctx.db.query('accountOwnerships')
          .withIndex('by_ownershipRef', (query) => query.eq('ownershipRef', account.currentOwnershipRef)).unique()
        if (ownership === null) throw new RecoveryError('recovery_account_facts_invalid')
        return Object.freeze({
          account: Object.freeze({
            accountRef: selected,
            lifecycle: account.lifecycle,
            recoveryPolicy: Object.freeze({ ...account.recoveryPolicy }) as RecoveryPolicy,
            revision: account.revision,
            updatedAt: account.updatedAt,
            currentOwnershipRef: ownershipRef(account.currentOwnershipRef),
          }),
          ownership: Object.freeze({
            ownershipRef: ownershipRef(ownership.ownershipRef),
            accountRef: accountRef(ownership.accountRef),
            ownerPrincipalRef: principalRef(ownership.ownerPrincipalRef),
            lifecycle: ownership.lifecycle,
            revision: ownership.revision,
          }),
        })
      },
    },
    authority: delegation,
    now: () => now,
  }).authorize(input)
}

function createRecoveryDelegationContextPort(
  ctx: MutationCtx,
  trustedActor: ReturnType<typeof principalRef>,
  action: AuthorizeRecoveryRequest['action'],
  selectedAccountRef: AuthorizeRecoveryRequest['accountRef'],
): DelegationContextPort {
  return Object.freeze({
    resolveActiveContext: async (context) => {
      const selected = accountRef(context.activeAccountRef)
      const actor = principalRef(context.actorPrincipalRef)
      if (selected !== selectedAccountRef || actor !== trustedActor) {
        throw new DelegationError('delegation_actor_mismatch')
      }
      const [principal, account, membership] = await Promise.all([
        ctx.db.query('principals')
          .withIndex('by_principalRef', (query) => query.eq('principalRef', actor)).unique(),
        ctx.db.query('accounts')
          .withIndex('by_accountRef', (query) => query.eq('accountRef', selected)).unique(),
        ctx.db.query('memberships')
          .withIndex('by_accountRef_and_memberPrincipalRef_and_lifecycle', (query) => query
            .eq('accountRef', selected)
            .eq('memberPrincipalRef', actor)
            .eq('lifecycle', 'active'))
          .unique(),
      ])
      const expectedLifecycle = action === 'freeze' ? 'active' : 'suspended'
      if (principal?.lifecycle !== 'active'
        || account?.lifecycle !== expectedLifecycle
        || membership === null
        || !Number.isSafeInteger(account.revision)
        || account.revision < 1) {
        throw new DelegationError('delegation_actor_mismatch')
      }
      return Object.freeze({
        accountRef: selected,
        actorPrincipalRef: actor,
        accountRevision: account.revision,
        correlationRef: context.correlationRef,
        idempotencyRef: context.idempotencyRef,
      })
    },
    resolveRootIssuerContext: async () => {
      throw new DelegationError('delegation_actor_mismatch')
    },
    requireActivePrincipal: async (candidate) => {
      const selected = principalRef(candidate)
      const row = await ctx.db.query('principals')
        .withIndex('by_principalRef', (query) => query.eq('principalRef', selected)).unique()
      if (row?.lifecycle !== 'active') throw new DelegationError('delegation_actor_mismatch')
    },
  })
}

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
  const replacements = []
  const seen = new Set<string>()
  for (const replacement of change.approvalReplacements) {
    if (seen.has(replacement.value.approvalRef)) throw new RecoveryError('recovery_approval_duplicate')
    seen.add(replacement.value.approvalRef)
    const row = await ctx.db.query('recoveryBreakGlassApprovals')
      .withIndex('by_approvalRef', (query) => query.eq('approvalRef', replacement.value.approvalRef)).unique()
    if (row === null
      || row.lifecycle !== replacement.expectedLifecycle
      || replacement.value.lifecycle !== 'consumed'
      || replacement.value.consumedByAdmissionRef !== admission.admissionRef) {
      throw new RecoveryError('recovery_approval_unavailable')
    }
    replacements.push({ row, value: approvalForStorage(replacement.value) })
  }
  if (replacements.length !== admission.approvalRefs.length
    || replacements.some(({ value }) => !admission.approvalRefs.includes(value.approvalRef))) {
    throw new RecoveryError('recovery_approval_unavailable')
  }
  for (const replacement of replacements) await ctx.db.replace(replacement.row._id, replacement.value)
  await ctx.db.insert('recoveryBreakGlassAdmissions', admissionForStorage(admission))
}

function approvalForStorage(value: VerifiedBreakGlassApproval) {
  return {
    ...value,
    ...(value.consumedAt === undefined ? {} : { consumedAt: value.consumedAt }),
    ...(value.consumedByAdmissionRef === undefined
      ? {}
      : { consumedByAdmissionRef: value.consumedByAdmissionRef }),
  }
}

function admissionForStorage(value: RecoveryAdmission) {
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

export const recordVerifiedRecoveryApproval = internalMutation({
  args: { approval: recoveryApprovalValue },
  returns: recoveryApprovalValue,
  handler: async (ctx, args) => approvalForStorage(await recordVerifiedRecoveryApprovalHandler(
    ctx,
    canonicalApprovalInput(args.approval),
  )),
})

export const authorizeRecovery = internalMutation({
  args: authorizeRecoveryArgs,
  returns: recoveryAdmissionValue,
  handler: async (ctx, args) => admissionForStorage(await authorizeRecoveryHandler(ctx, {
    ...args,
    accountRef: accountRef(args.accountRef),
    subjectPrincipalRef: principalRef(args.subjectPrincipalRef),
    grantRef: delegationGrantRef(args.grantRef),
    context: {
      ...args.context,
      actorPrincipalRef: principalRef(args.context.actorPrincipalRef),
      activeAccountRef: accountRef(args.context.activeAccountRef),
    },
  })),
})
