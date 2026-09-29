import type { MutationCtx } from '../../../_generated/server'
import { v, type Infer } from 'convex/values'

import { accountRef, generateMembershipRef, generateOwnershipRef } from '../../../../src/modules/principal-account/account/public'
import { principalRef } from '../../../../src/modules/principal-account/principal/public'
import { InteractiveAuthorityError, requireAccessFactForAccount, resolveActiveAccountRefForPrincipal } from '../../../interactiveAuthority'
import { assertStepUpForSensitiveAction } from '../workspaceSecurity/stepUp'
import { requireCurrentOwnership, type AccountActionContext } from './accountContext'
import { recordWorkspaceAuditEvent } from './audit'
import { mfaReverificationRefusalValue } from './contracts'
import { requireAccountInteractiveHumanPrincipal } from './identity'

const transferWorkspaceReceiptValue = v.union(
  mfaReverificationRefusalValue,
  v.object({
    kind: v.literal('transferred'),
    accountRef: v.string(),
    previousOwnershipRef: v.string(),
    currentOwnershipRef: v.string(),
    accountRevision: v.number(),
  }),
  v.object({
    kind: v.literal('replayed'),
    accountRef: v.string(),
    currentOwnershipRef: v.string(),
    accountRevision: v.number(),
  }),
)

export const transferWorkspaceOwnershipArgs = v.object({
    successorPrincipalRef: v.string(),
    expectedAccountRevision: v.number(),
    expectedOwnershipRevision: v.number(),
    correlationRef: v.string(),
    idempotencyRef: v.string(),
  })

export const transferWorkspaceOwnershipResult = transferWorkspaceReceiptValue

export const transferWorkspaceOwnershipHandler = async (ctx: MutationCtx, args: Infer<typeof transferWorkspaceOwnershipArgs>) => {
    const identity = await ctx.auth.getUserIdentity()
    if (identity === null) throw new InteractiveAuthorityError('identity_invalid')
    const principal = await requireAccountInteractiveHumanPrincipal(ctx.db, identity)
    const canonicalPrincipalRef = principalRef(principal.principalRef)
    const { activeAccountRef } = await resolveActiveAccountRefForPrincipal(
      ctx.db,
      canonicalPrincipalRef,
      identity,
      'require',
    )
    const canonicalAccountRef = accountRef(activeAccountRef)

    const account = await ctx.db
      .query('accounts')
      .withIndex('by_accountRef', (query) => query.eq('accountRef', canonicalAccountRef))
      .unique()
    if (account === null) throw new InteractiveAuthorityError('account_missing')

    const currentOwnership = await requireCurrentOwnership(ctx.db, account)

    if (account.lastAction?.idempotencyRef === args.idempotencyRef) {
      if (currentOwnership.ownerPrincipalRef === args.successorPrincipalRef) {
        return {
          kind: 'replayed' as const,
          accountRef: canonicalAccountRef,
          currentOwnershipRef: currentOwnership.ownershipRef,
          accountRevision: account.revision,
        }
      }
      throw new InteractiveAuthorityError('idempotency_conflict')
    }

    const access = await requireAccessFactForAccount(ctx.db, canonicalPrincipalRef, canonicalAccountRef)
    if (access.kind !== 'ownership') {
      throw new InteractiveAuthorityError('ownership_mismatch')
    }

    if (account.lifecycle !== 'active') throw new InteractiveAuthorityError('account_inactive')

    if (args.successorPrincipalRef === canonicalPrincipalRef) {
      throw new InteractiveAuthorityError('successor_same_as_incumbent')
    }

    const successorMembership = await ctx.db
      .query('memberships')
      .withIndex('by_accountRef_and_memberPrincipalRef_and_lifecycle', (query) => query
        .eq('accountRef', canonicalAccountRef)
        .eq('memberPrincipalRef', args.successorPrincipalRef)
        .eq('lifecycle', 'active'))
      .unique()
    if (successorMembership === null) {
      throw new InteractiveAuthorityError('successor_not_active_member')
    }

    const successorPrincipal = await ctx.db
      .query('principals')
      .withIndex('by_principalRef', (query) => query.eq('principalRef', args.successorPrincipalRef))
      .unique()
    if (successorPrincipal === null || successorPrincipal.lifecycle !== 'active') {
      throw new InteractiveAuthorityError('successor_principal_inactive')
    }
    if (successorPrincipal.kind !== 'human') {
      throw new InteractiveAuthorityError('successor_not_human')
    }

    const stepUp = await assertStepUpForSensitiveAction(ctx.db, identity, {
      accountRef: canonicalAccountRef,
    })
    if (stepUp.kind === 'refused') return stepUp

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
    const newOwnershipRef = generateOwnershipRef()
    const nextAccountRevision = account.revision + 1

    await ctx.db.patch(currentOwnership._id, {
      lifecycle: 'ended',
      revision: currentOwnership.revision + 1,
      endedAt: now,
      endedBy: actionContext,
    })

    await ctx.db.insert('accountOwnerships', {
      ownershipRef: newOwnershipRef,
      accountRef: canonicalAccountRef,
      ownerPrincipalRef: args.successorPrincipalRef,
      lifecycle: 'active',
      changeKind: 'transfer',
      revision: 1,
      createdAt: now,
      createdBy: actionContext,
    })

    const incumbentMembership = await ctx.db
      .query('memberships')
      .withIndex('by_accountRef_and_memberPrincipalRef_and_lifecycle', (query) => query
        .eq('accountRef', canonicalAccountRef)
        .eq('memberPrincipalRef', canonicalPrincipalRef)
        .eq('lifecycle', 'active'))
      .unique()
    if (incumbentMembership === null) {
      await ctx.db.insert('memberships', {
        membershipRef: generateMembershipRef(),
        accountRef: canonicalAccountRef,
        memberPrincipalRef: canonicalPrincipalRef,
        lifecycle: 'active',
        revision: 1,
        createdAt: now,
        createdBy: actionContext,
      })
    }

    await ctx.db.patch(account._id, {
      currentOwnershipRef: newOwnershipRef,
      revision: nextAccountRevision,
      updatedAt: now,
      lastAction: actionContext,
    })

    await recordWorkspaceAuditEvent(ctx.db, {
      eventType: 'account.workspace.ownership_transferred',
      actorPrincipalRef: canonicalPrincipalRef,
      activeAccountRef: canonicalAccountRef,
      correlationRef: args.correlationRef,
      idempotencyRef: args.idempotencyRef,
      beforeState: currentOwnership.ownershipRef,
      outcome: newOwnershipRef,
      createdAt: now,
      redactedPayload: { successorPrincipalRef: args.successorPrincipalRef },
    })

    return {
      kind: 'transferred' as const,
      accountRef: canonicalAccountRef,
      previousOwnershipRef: currentOwnership.ownershipRef,
      currentOwnershipRef: newOwnershipRef,
      accountRevision: nextAccountRevision,
    }
  }
