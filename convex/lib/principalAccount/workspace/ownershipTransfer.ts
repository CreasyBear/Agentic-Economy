import type { MutationCtx } from '../../../_generated/server'
import { v, type Infer } from 'convex/values'

import { accountRef, generateMembershipRef, generateOwnershipRef } from '../../../../src/modules/principal-account/account/public'
import { principalRef } from '../../../../src/modules/principal-account/principal/public'
import { InteractiveAuthorityError, requireAccessFactForAccount, resolveActiveAccountRefForPrincipal } from '../../../interactiveAuthority'
import { assertStepUpForSensitiveAction, consumeWorkspaceActionProof, requireWorkspaceActionReplay, requireWorkspaceActionSource, workspaceActionDigest } from '../workspaceSecurity/stepUp'
import { clerkMfaConsequenceProofValue } from '../../authority/consequence/proof'
import { sourceWriteArgs } from '../../security/sourceWrite/contracts'
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
    expectedAccountRef: v.string(),
    successorPrincipalRef: v.string(),
    expectedAccountRevision: v.number(),
    expectedOwnershipRevision: v.number(),
    correlationRef: v.string(),
    idempotencyRef: v.string(),
    operationKey: v.string(),
    correlationId: v.string(),
    proof: v.optional(clerkMfaConsequenceProofValue),
    ...sourceWriteArgs,
  })

export const transferWorkspaceOwnershipResult = transferWorkspaceReceiptValue

export const transferWorkspaceOwnershipHandler = async (ctx: MutationCtx, args: Infer<typeof transferWorkspaceOwnershipArgs>) => {
    await requireWorkspaceActionSource(args)
    const identity = await ctx.auth.getUserIdentity()
    if (identity === null) throw new InteractiveAuthorityError('identity_invalid')
    const principal = await requireAccountInteractiveHumanPrincipal(ctx.db, identity)
    const canonicalPrincipalRef = principalRef(principal.principalRef)
    const account = await ctx.db
      .query('accounts')
      .withIndex('by_accountRef', (query) => query.eq('accountRef', args.expectedAccountRef))
      .unique()
    if (account === null) throw new InteractiveAuthorityError('account_missing')
    const canonicalAccountRef = accountRef(account.accountRef)
    const currentOwnership = await requireCurrentOwnership(ctx.db, account)
    const actionDigest = workspaceActionDigest('transfer', args, canonicalPrincipalRef, canonicalAccountRef)

    if (account.lastAction?.idempotencyRef === args.idempotencyRef) {
      if (account.lastAction.actorPrincipalRef !== canonicalPrincipalRef) {
        throw new InteractiveAuthorityError('ownership_mismatch')
      }
      if (currentOwnership.ownerPrincipalRef === args.successorPrincipalRef) {
        await requireWorkspaceActionReplay(ctx.db, { action: 'ownership_transferred', idempotencyRef: args.idempotencyRef,
          commandDigest: actionDigest, actorPrincipalRef: canonicalPrincipalRef, activeAccountRef: canonicalAccountRef })
        return {
          kind: 'replayed' as const,
          accountRef: canonicalAccountRef,
          currentOwnershipRef: currentOwnership.ownershipRef,
          accountRevision: account.revision,
        }
      }
      throw new InteractiveAuthorityError('idempotency_conflict')
    }

    const { activeAccountRef } = await resolveActiveAccountRefForPrincipal(ctx.db, canonicalPrincipalRef, identity)
    if (args.expectedAccountRef !== activeAccountRef) throw new InteractiveAuthorityError('authority_mismatch')

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
      accountRef: canonicalAccountRef, ...(args.proof === undefined ? {} : { proof: args.proof }),
    })
    if (stepUp.kind === 'refused') return stepUp

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
      redactedPayload: { successorPrincipalRef: args.successorPrincipalRef, actionDigest },
    })

    return {
      kind: 'transferred' as const,
      accountRef: canonicalAccountRef,
      previousOwnershipRef: currentOwnership.ownershipRef,
      currentOwnershipRef: newOwnershipRef,
      accountRevision: nextAccountRevision,
    }
  }
