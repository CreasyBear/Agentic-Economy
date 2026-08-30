import { v } from 'convex/values'

import { mutation, type MutationCtx } from './_generated/server'
import { canonicalDigest } from '../src/modules/common/canonical-digest'
import {
  type RecoveryApprovalIntent,
  type RecoveryApprovalVerificationRequest,
} from '../src/modules/authority/recovery/public'
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

const submitRecoveryApprovalArgs = {
  approvalRef: v.string(),
  accountRef: v.string(),
  action: recoveryActionValue,
} as const

const authorizeRecoveryOperationArgs = {
  action: recoveryActionValue,
  accountRef: v.string(),
  grantRef: v.string(),
  expectedGrantGeneration: v.number(),
  approvalRefs: v.array(v.string()),
  correlationRef: v.string(),
  idempotencyRef: v.string(),
} as const

export async function submitRecoveryApprovalHandler(
  ctx: MutationCtx,
  intent: RecoveryApprovalIntent,
): Promise<VerifiedBreakGlassApproval> {
  const now = Date.now()
  const facts = await resolveRecoveryAccountFacts(ctx, intent.accountRef)
  const operator = await resolveRecoveryOperator(ctx, intent.accountRef, now)
  return await new ProductionRecoveryService({
    persistence: createConvexRecoveryPersistence(ctx),
    accountFacts: { resolve: async () => facts },
    approvalVerifier: {
      verify: async (request) => trustedRecoveryApprovalAttestation(request, operator),
    },
    now: () => now,
  }).recordApproval(intent)
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
    accountFacts: { resolve: async (selectedAccountRef) =>
      await resolveRecoveryAccountFacts(ctx, selectedAccountRef) },
    authority: delegation,
    now: () => now,
  }).authorize(input)
}

async function resolveRecoveryAccountFacts(
  ctx: MutationCtx,
  selectedAccountRef: string,
) {
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
}

type RecoveryOperator = Readonly<{
  principalRef: ReturnType<typeof principalRef>
  credentialRef: string
  credentialGeneration: number
  membershipRef: string
  membershipRevision: number
}>

async function resolveRecoveryOperator(
  ctx: MutationCtx,
  selectedAccountRef: string,
  now: number,
): Promise<RecoveryOperator> {
  const identity = await ctx.auth.getUserIdentity()
  if (identity === null || typeof identity.tokenIdentifier !== 'string'
    || identity.tokenIdentifier.length === 0) {
    throw new RecoveryError('recovery_approval_unavailable')
  }
  const selected = accountRef(selectedAccountRef)
  const binding = await ctx.db.query('externalIdentityBindings')
    .withIndex('by_providerNamespace_and_providerIdentifier', (query) => query
      .eq('providerNamespace', 'clerk/user')
      .eq('providerIdentifier', identity.tokenIdentifier))
    .unique()
  if (binding === null || binding.lifecycle !== 'active'
    || binding.providerState.kind !== 'known' || binding.providerState.value !== 'active'
    || !Number.isSafeInteger(binding.credentialGeneration)
    || binding.credentialGeneration < 1) {
    throw new RecoveryError('recovery_approval_unavailable')
  }
  const [credential, principal, membership] = await Promise.all([
    ctx.db.query('credentials')
      .withIndex('by_bindingRef_and_generation_and_lifecycle', (query) => query
        .eq('bindingRef', binding.bindingRef)
        .eq('generation', binding.credentialGeneration)
        .eq('lifecycle', 'active'))
      .unique(),
    ctx.db.query('principals')
      .withIndex('by_principalRef', (query) => query.eq('principalRef', binding.principalRef))
      .unique(),
    ctx.db.query('memberships')
      .withIndex('by_accountRef_and_memberPrincipalRef_and_lifecycle', (query) => query
        .eq('accountRef', selected)
        .eq('memberPrincipalRef', binding.principalRef)
        .eq('lifecycle', 'active'))
      .unique(),
  ])
  if (credential === null || principal === null || membership === null
    || credential.principalRef !== binding.principalRef
    || credential.type !== 'provider_token'
    || credential.expiresAt <= now
    || credential.expiryMaterialization?.state !== 'scheduled'
    || credential.expiryMaterialization.credentialGeneration !== credential.generation
    || credential.expiryMaterialization.credentialExpiresAt !== credential.expiresAt
    || principal.lifecycle !== 'active'
    || !Number.isSafeInteger(membership.revision) || membership.revision < 1) {
    throw new RecoveryError('recovery_approval_unavailable')
  }
  return Object.freeze({
    principalRef: principalRef(principal.principalRef),
    credentialRef: credential.credentialRef,
    credentialGeneration: credential.generation,
    membershipRef: membership.membershipRef,
    membershipRevision: membership.revision,
  })
}

function trustedRecoveryApprovalAttestation(
  request: RecoveryApprovalVerificationRequest,
  operator: RecoveryOperator,
) {
  return Object.freeze({
    operatorPrincipalRef: operator.principalRef,
    verificationRef: `recovery-verification:${canonicalDigest({
      domain: 'ae/recovery-approval/v1',
      approvalRef: request.approvalRef,
      accountRef: request.accountRef,
      subjectPrincipalRef: request.subjectPrincipalRef,
      operatorPrincipalRef: operator.principalRef,
      credentialRef: operator.credentialRef,
      credentialGeneration: operator.credentialGeneration,
      membershipRef: operator.membershipRef,
      membershipRevision: operator.membershipRevision,
      action: request.action,
      recoveryPolicyRevision: request.recoveryPolicyRevision,
      frozenAccountRevision: request.frozenAccountRevision,
      verifiedAt: request.verifiedAt,
      expiresAt: request.expiresAt,
    })}`,
  })
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

export const submitRecoveryApproval = mutation({
  args: submitRecoveryApprovalArgs,
  returns: recoveryApprovalValue,
  handler: async (ctx, args) => approvalForStorage(await submitRecoveryApprovalHandler(ctx, {
    approvalRef: args.approvalRef,
    accountRef: accountRef(args.accountRef),
    action: args.action,
  })),
})

export const authorizeRecoveryOperation = mutation({
  args: authorizeRecoveryOperationArgs,
  returns: recoveryAdmissionValue,
  handler: async (ctx, args) => {
    const selectedAccountRef = accountRef(args.accountRef)
    const now = Date.now()
    const [operator, facts] = await Promise.all([
      resolveRecoveryOperator(ctx, selectedAccountRef, now),
      resolveRecoveryAccountFacts(ctx, selectedAccountRef),
    ])
    const admission = await authorizeRecoveryHandler(ctx, {
      action: args.action,
      accountRef: selectedAccountRef,
      subjectPrincipalRef: facts.ownership.ownerPrincipalRef,
      grantRef: delegationGrantRef(args.grantRef),
      expectedGrantGeneration: args.expectedGrantGeneration,
      approvalRefs: args.approvalRefs,
      context: {
        actorPrincipalRef: operator.principalRef,
        activeAccountRef: selectedAccountRef,
        correlationRef: args.correlationRef,
        idempotencyRef: args.idempotencyRef,
      },
    })
    await applyRecoveryEffect(ctx, admission)
    return admissionForStorage(admission)
  },
})

async function applyRecoveryEffect(ctx: MutationCtx, admission: RecoveryAdmission): Promise<void> {
  // Authorization resolved this canonical account earlier in the same Convex
  // mutation transaction, so it cannot disappear between admission and effect.
  const account = await ctx.db.query('accounts')
    .withIndex('by_accountRef', (query) => query.eq('accountRef', admission.accountRef))
    .unique()
  if (account === null) throw new RecoveryError('recovery_account_facts_invalid')
  if (admission.action === 'freeze') {
    if (account.lifecycle !== 'active') throw new RecoveryError('recovery_account_facts_invalid')
    await ctx.db.patch(account._id, {
      lifecycle: 'suspended',
      revision: account.revision + 1,
      updatedAt: admission.admittedAt,
    })
    return
  }
  if (account.lifecycle !== 'suspended') throw new RecoveryError('recovery_account_facts_invalid')
  if (admission.action === 'inspect_secret_canary') return
  const activeGrants = await ctx.db.query('authorityDelegationGrants')
    .withIndex('by_accountRef_and_lifecycle', (query) => query
      .eq('accountRef', admission.accountRef)
      .eq('lifecycle', 'active'))
    .take(65)
  if (activeGrants.length > 64) throw new RecoveryError('recovery_approval_unavailable')
  await Promise.all(activeGrants.map(async (grant) => await ctx.db.patch(grant._id, {
    lifecycle: 'revoked',
    generation: grant.generation + 1,
    revision: grant.revision + 1,
    revokedAt: admission.admittedAt,
    revokedBy: {
      actorPrincipalRef: admission.operatorPrincipalRef,
      activeAccountRef: admission.accountRef,
      correlationRef: admission.context.correlationRef,
      idempotencyRef: admission.context.idempotencyRef,
    },
  })))
}
