import type { MutationCtx } from '../../_generated/server'
import { v, type Infer } from 'convex/values'

import { InteractiveAuthorityError, requireAccessFactForAccount } from '../../interactiveAuthority'
import { requireAuthenticatedAccountContext } from './accountContext'
import { recordWorkspaceAuditEvent } from './audit'

export const renameUnboundWorkspaceArgs = v.object({
    name: v.string(),
    expectedRevision: v.number(),
    correlationRef: v.string(),
    idempotencyRef: v.string(),
  })

export const renameUnboundWorkspaceResult = v.object({
    kind: v.union(v.literal('updated'), v.literal('replayed'), v.literal('unchanged')),
    name: v.string(),
  })

export const renameUnboundWorkspaceHandler = async (ctx: MutationCtx, args: Infer<typeof renameUnboundWorkspaceArgs>) => {
    const identity = await ctx.auth.getUserIdentity()
    if (identity === null) throw new InteractiveAuthorityError('identity_invalid')
    const { canonicalPrincipalRef, canonicalAccountRef, account } =
      await requireAuthenticatedAccountContext(ctx.db, identity)
    const access = await requireAccessFactForAccount(ctx.db, canonicalPrincipalRef, canonicalAccountRef)
    if (access.kind !== 'ownership') throw new InteractiveAuthorityError('ownership_mismatch')
    const bindings = await ctx.db.query('accountExternalOrganizationBindings')
      .withIndex('by_accountRef_and_lifecycle', (query) => query
        .eq('accountRef', canonicalAccountRef)
        .eq('lifecycle', 'active'))
      .collect()
    if (bindings.some((binding) => binding.providerNamespace === 'clerk/organization')) {
      throw new InteractiveAuthorityError('ownership_mismatch')
    }
    const name = args.name.trim()
    if (name.length === 0 || name.length > 200 || !/^[\p{L}\p{N}\p{P}\p{S}\p{Zs}]+$/u.test(name)) {
      throw new InteractiveAuthorityError('workspace_confirmation_mismatch')
    }
    if (account.lastAction.idempotencyRef === args.idempotencyRef) {
      if (account.displayName !== name) throw new InteractiveAuthorityError('idempotency_conflict')
      return { kind: 'replayed' as const, name }
    }
    if (account.revision !== args.expectedRevision) throw new InteractiveAuthorityError('account_revision_conflict')
    if (account.displayName === name) return { kind: 'unchanged' as const, name }
    const now = Date.now()
    await ctx.db.patch(account._id, {
      displayName: name,
      revision: account.revision + 1,
      updatedAt: now,
      lastAction: {
        actorPrincipalRef: canonicalPrincipalRef,
        activeAccountRef: canonicalAccountRef,
        correlationRef: args.correlationRef,
        idempotencyRef: args.idempotencyRef,
      },
    })
    await recordWorkspaceAuditEvent(ctx.db, {
      eventType: 'account.workspace_profile.updated',
      actorPrincipalRef: canonicalPrincipalRef,
      activeAccountRef: canonicalAccountRef,
      correlationRef: args.correlationRef,
      idempotencyRef: args.idempotencyRef,
      beforeState: account.displayName,
      outcome: name,
      createdAt: now,
    })
    return { kind: 'updated' as const, name }
  }
