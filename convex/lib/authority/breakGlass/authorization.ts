import type { MutationCtx } from '../../../_generated/server'
import {
  ProductionRecoveryService,
  RecoveryError,
  type AuthorizeRecoveryRequest,
  type RecoveryAdmission,
} from '../../../../src/modules/authority/recovery/public'
import { accountRef, principalRef } from '../../../../src/modules/principal-account/public'
import { DelegationService, delegationGrantRef } from '../../../../src/modules/authority/delegation/public'
import { createConvexDelegationStore } from '../delegation/persistence'
import { resolveRecoveryAccountFacts } from './accountFacts'
import { resolveRecoveryOperator } from './operator'
import { createRecoveryDelegationContextPort } from './delegation'
import { admissionForStorage, createConvexRecoveryPersistence } from './persistence'
import type { AuthorizeRecoveryOperationInput } from './contracts'

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

export async function authorizeRecoveryOperationHandler(
  ctx: MutationCtx,
  args: AuthorizeRecoveryOperationInput,
) {
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
}

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
