import type { MutationCtx } from '../../../_generated/server'
import { v, type Infer } from 'convex/values'

import { accountRef } from '../../../../src/modules/principal-account/account/public'
import { principalRef } from '../../../../src/modules/principal-account/principal/public'
import { checkWorkspaceFences } from './decommissionFences'
import { InteractiveAuthorityError, requireAccessFactForAccount, resolveActiveAccountRefForPrincipal } from '../../../interactiveAuthority'
import { assertStepUpForSensitiveAction, consumeWorkspaceActionProof, requireWorkspaceActionReplay, requireWorkspaceActionSource, workspaceActionDigest } from '../workspaceSecurity/stepUp'
import { clerkMfaConsequenceProofValue } from '../../authority/consequence/proof'
import { sourceWriteArgs } from '../../security/sourceWrite/contracts'
import { requireCurrentOwnership, type AccountActionContext } from './accountContext'
import { recordWorkspaceAuditEvent } from './audit'
import { mfaReverificationRefusalValue } from './contracts'
import { requireAccountInteractiveHumanPrincipal } from './identity'

const closeWorkspaceReceiptValue = v.union(
  mfaReverificationRefusalValue,
  v.object({
    kind: v.literal('closed'),
    accountRef: v.string(),
    accountRevision: v.number(),
  }),
  v.object({
    kind: v.literal('replayed'),
    accountRef: v.string(),
    accountRevision: v.number(),
  }),
)

export const closeWorkspaceArgs = v.object({
    expectedAccountRef: v.string(),
    confirmationName: v.string(),
    expectedAccountRevision: v.number(),
    expectedOwnershipRevision: v.number(),
    correlationRef: v.string(),
    idempotencyRef: v.string(),
    operationKey: v.string(),
    correlationId: v.string(),
    proof: v.optional(clerkMfaConsequenceProofValue),
    ...sourceWriteArgs,
  })

export const closeWorkspaceResult = closeWorkspaceReceiptValue

export const closeWorkspaceHandler = async (ctx: MutationCtx, args: Infer<typeof closeWorkspaceArgs>) => {
    await requireWorkspaceActionSource(args)
    const identity = await ctx.auth.getUserIdentity()
    if (identity === null) throw new InteractiveAuthorityError('identity_invalid')
    const principal = await requireAccountInteractiveHumanPrincipal(ctx.db, identity)
    const canonicalPrincipalRef = principalRef(principal.principalRef)

    // A terminal retry names the original Account even if the caller has
    // since switched to another active workspace. It cannot authorize a close.
    const requestedAccount = await ctx.db.query('accounts')
      .withIndex('by_accountRef', q => q.eq('accountRef', args.expectedAccountRef)).unique()
    if (requestedAccount?.lifecycle === 'closed') {
      if (requestedAccount.lastAction?.actorPrincipalRef !== canonicalPrincipalRef) {
        throw new InteractiveAuthorityError('ownership_mismatch')
      }
      if (requestedAccount.lastAction.idempotencyRef !== args.idempotencyRef) {
        throw new InteractiveAuthorityError('workspace_already_closed')
      }
      if (args.confirmationName !== requestedAccount.displayName) throw new InteractiveAuthorityError('idempotency_conflict')
      const targetRef = accountRef(requestedAccount.accountRef)
      await requireWorkspaceActionReplay(ctx.db, { action: 'closed', idempotencyRef: args.idempotencyRef,
        commandDigest: workspaceActionDigest('close', args, canonicalPrincipalRef, targetRef),
        actorPrincipalRef: canonicalPrincipalRef, activeAccountRef: targetRef })
      return { kind: 'replayed' as const, accountRef: targetRef, accountRevision: requestedAccount.revision }
    }
    const { activeAccountRef } = await resolveActiveAccountRefForPrincipal(ctx.db, canonicalPrincipalRef, identity)
    const canonicalAccountRef = accountRef(activeAccountRef)
    if (args.expectedAccountRef !== canonicalAccountRef) throw new InteractiveAuthorityError('authority_mismatch')
    const account = requestedAccount
    if (account === null) throw new InteractiveAuthorityError('account_missing')
    const actionDigest = workspaceActionDigest('close', args, canonicalPrincipalRef, canonicalAccountRef)

    if (account.lifecycle !== 'active') throw new InteractiveAuthorityError('account_inactive')

    const access = await requireAccessFactForAccount(ctx.db, canonicalPrincipalRef, canonicalAccountRef)
    if (access.kind !== 'ownership') {
      throw new InteractiveAuthorityError('ownership_mismatch')
    }

    const currentOwnership = await requireCurrentOwnership(ctx.db, account)

    if (args.confirmationName !== account.displayName) {
      throw new InteractiveAuthorityError('workspace_confirmation_mismatch')
    }

    const stepUp = await assertStepUpForSensitiveAction(ctx.db, identity, {
      accountRef: canonicalAccountRef, ...(args.proof === undefined ? {} : { proof: args.proof }),
    })
    if (stepUp.kind === 'refused') return stepUp

    const fences = await checkWorkspaceFences(ctx, canonicalAccountRef)
    if (fences.length > 0) {
      throw new InteractiveAuthorityError('workspace_has_unsettled_obligations', { fences })
    }

    if (args.expectedAccountRevision !== account.revision) {
      throw new InteractiveAuthorityError('account_revision_conflict')
    }
    if (args.expectedOwnershipRevision !== currentOwnership.revision) {
      throw new InteractiveAuthorityError('ownership_revision_conflict')
    }

    const consumed = await consumeWorkspaceActionProof(ctx, identity, { ...(args.proof === undefined ? {} : { proof: args.proof }),
      actorPrincipalRef: canonicalPrincipalRef, activeAccountRef: canonicalAccountRef,
      commandDigest: actionDigest, correlationRef: args.correlationRef, idempotencyRef: args.idempotencyRef }, args)
    if (consumed.kind === 'refused') return consumed

    const now = Date.now()
    const actionContext: AccountActionContext = {
      actorPrincipalRef: canonicalPrincipalRef,
      activeAccountRef: canonicalAccountRef,
      correlationRef: args.correlationRef,
      idempotencyRef: args.idempotencyRef,
    }
    const nextAccountRevision = account.revision + 1

    await ctx.db.patch(account._id, {
      lifecycle: 'closed',
      revision: nextAccountRevision,
      updatedAt: now,
      lastAction: actionContext,
    })

    await ctx.db.patch(currentOwnership._id, {
      lifecycle: 'ended',
      revision: currentOwnership.revision + 1,
      endedAt: now,
      endedBy: actionContext,
    })

    const activeMemberships = await ctx.db
      .query('memberships')
      .withIndex('by_accountRef_and_lifecycle', (query) => query
        .eq('accountRef', canonicalAccountRef)
        .eq('lifecycle', 'active'))
      .collect()
    for (const membership of activeMemberships) {
      await ctx.db.patch(membership._id, { lifecycle: 'ended', endedAt: now })
    }

    const agentGrants = await ctx.db
      .query('agentAccessGrants')
      .withIndex('by_ownerId_and_updatedAt', (query) => query.eq('ownerId', canonicalAccountRef))
      .collect()
    for (const grant of agentGrants) {
      if (grant.lifecycle !== 'active') continue
      await ctx.db.patch(grant._id, { lifecycle: 'revoked', updatedAt: now })
    }

    const delegationGrants = await ctx.db
      .query('authorityDelegationGrants')
      .withIndex('by_accountRef_and_actorPrincipalRef_and_createdBy_idempotencyRef', (query) => query
        .eq('accountRef', canonicalAccountRef))
      .collect()
    for (const delegation of delegationGrants) {
      if (delegation.lifecycle !== 'active') continue
      await ctx.db.patch(delegation._id, { lifecycle: 'revoked' })
    }

    const orgBindings = await ctx.db
      .query('accountExternalOrganizationBindings')
      .withIndex('by_accountRef_and_lifecycle', (query) => query
        .eq('accountRef', canonicalAccountRef)
        .eq('lifecycle', 'active'))
      .collect()
    for (const binding of orgBindings) {
      await ctx.db.patch(binding._id, { lifecycle: 'revoked', updatedAt: now })
    }

    await recordWorkspaceAuditEvent(ctx.db, {
      eventType: 'account.workspace.closed',
      actorPrincipalRef: canonicalPrincipalRef,
      activeAccountRef: canonicalAccountRef,
      correlationRef: args.correlationRef,
      idempotencyRef: args.idempotencyRef,
      beforeState: 'active',
      outcome: 'closed',
      createdAt: now,
      redactedPayload: { actionDigest },
    })

    return {
      kind: 'closed' as const,
      accountRef: canonicalAccountRef,
      accountRevision: nextAccountRevision,
    }
  }
