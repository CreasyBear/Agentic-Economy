import type { MutationCtx } from '../../../_generated/server'
import { v, type Infer } from 'convex/values'

import { accountRef } from '../../../../src/modules/principal-account/account/public'
import { principalRef } from '../../../../src/modules/principal-account/principal/public'
import { checkWorkspaceFences } from './decommissionFences'
import { InteractiveAuthorityError, requireAccessFactForAccount, resolveActiveAccountRefForPrincipal } from '../../../interactiveAuthority'
import { assertStepUpForSensitiveAction } from '../../../workspaceSecurity'
import { requireCurrentOwnership, resolveClosedWorkspaceActorAccountRef, type AccountActionContext } from './accountContext'
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
    confirmationName: v.string(),
    expectedAccountRevision: v.number(),
    expectedOwnershipRevision: v.number(),
    correlationRef: v.string(),
    idempotencyRef: v.string(),
  })

export const closeWorkspaceResult = closeWorkspaceReceiptValue

export const closeWorkspaceHandler = async (ctx: MutationCtx, args: Infer<typeof closeWorkspaceArgs>) => {
    const identity = await ctx.auth.getUserIdentity()
    if (identity === null) throw new InteractiveAuthorityError('identity_invalid')
    const principal = await requireAccountInteractiveHumanPrincipal(ctx.db, identity)
    const canonicalPrincipalRef = principalRef(principal.principalRef)

    let canonicalAccountRef: ReturnType<typeof accountRef>
    try {
      const { activeAccountRef } = await resolveActiveAccountRefForPrincipal(
        ctx.db,
        canonicalPrincipalRef,
        identity,
        'require',
      )
      canonicalAccountRef = accountRef(activeAccountRef)
    } catch (error) {
      if (!(error instanceof InteractiveAuthorityError) || error.code !== 'account_access_missing') {
        throw error
      }
      const closedAccountRef = await resolveClosedWorkspaceActorAccountRef(ctx.db, canonicalPrincipalRef)
      if (closedAccountRef === null) throw error
      canonicalAccountRef = closedAccountRef
    }

    const account = await ctx.db
      .query('accounts')
      .withIndex('by_accountRef', (query) => query.eq('accountRef', canonicalAccountRef))
      .unique()
    if (account === null) throw new InteractiveAuthorityError('account_missing')

    if (account.lifecycle === 'closed') {
      if (account.lastAction?.idempotencyRef === args.idempotencyRef) {
        if (args.confirmationName === account.displayName) {
          return {
            kind: 'replayed' as const,
            accountRef: canonicalAccountRef,
            accountRevision: account.revision,
          }
        }
        throw new InteractiveAuthorityError('idempotency_conflict')
      }
      throw new InteractiveAuthorityError('workspace_already_closed')
    }

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
      accountRef: canonicalAccountRef,
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

    const sessionSelections = await ctx.db
      .query('interactiveSessionSelections')
      .filter((filter) => filter.eq(filter.field('activeAccountRef'), canonicalAccountRef))
      .collect()
    for (const row of sessionSelections) {
      await ctx.db.delete(row._id)
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
    })

    return {
      kind: 'closed' as const,
      accountRef: canonicalAccountRef,
      accountRevision: nextAccountRevision,
    }
  }
