import { type Infer, v } from 'convex/values'

import { accountRef } from '../src/modules/principal-account/account/public'
import { principalRef } from '../src/modules/principal-account/principal/public'
import { mutation, query } from './_generated/server'
import {
  InteractiveAuthorityError,
  resolveActiveAccountRefForPrincipal,
} from './interactiveAuthority'
import {
  redirectPathForRoleIntent,
  requireInteractiveHumanPrincipal,
  validateCorrelationRef,
  validateWorkspaceName,
} from './lib/principalAccount/onboarding/authority'

const roleIntentValue = v.union(v.literal('buyer'), v.literal('supplier'))

const readStateIncompleteValue = v.object({
  phase: v.literal('incomplete'),
  accountRef: v.string(),
  suggestedWorkspaceName: v.string(),
})

const readStateCompleteValue = v.object({
  phase: v.literal('complete'),
  accountRef: v.string(),
  roleIntent: roleIntentValue,
  redirectPath: v.union(v.literal('/owner'), v.literal('/owner/operations')),
})

const completeResultValue = v.object({
  kind: v.literal('completed'),
  accountRef: v.string(),
  roleIntent: roleIntentValue,
  workspaceName: v.string(),
  redirectPath: v.union(v.literal('/owner'), v.literal('/owner/operations')),
  revision: v.number(),
})

export const readState = query({
  args: {},
  returns: v.union(readStateIncompleteValue, readStateCompleteValue),
  handler: async (ctx): Promise<Infer<typeof readStateIncompleteValue> | Infer<typeof readStateCompleteValue>> => {
    const identity = await ctx.auth.getUserIdentity()
    if (identity === null) throw new InteractiveAuthorityError('identity_invalid')
    const principal = await requireInteractiveHumanPrincipal(ctx.db, identity)
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
    if (account.lifecycle !== 'active') throw new InteractiveAuthorityError('account_inactive')

    const completion = await ctx.db
      .query('interactiveOnboardingCompletions')
      .withIndex('by_accountRef', (query) => query.eq('accountRef', canonicalAccountRef))
      .unique()
    if (completion !== null) {
      return {
        phase: 'complete' as const,
        accountRef: canonicalAccountRef,
        roleIntent: completion.roleIntent,
        redirectPath: redirectPathForRoleIntent(completion.roleIntent),
      }
    }

    return {
      phase: 'complete' as const,
      accountRef: canonicalAccountRef,
      roleIntent: 'buyer' as const,
      redirectPath: '/owner' as const,
    }
  },
})

export const complete = mutation({
  args: {
    roleIntent: roleIntentValue,
    workspaceName: v.string(),
    correlationRef: v.string(),
  },
  returns: completeResultValue,
  handler: async (ctx, args) => {
    validateCorrelationRef(args.correlationRef)
    const trimmed = validateWorkspaceName(args.workspaceName)

    const identity = await ctx.auth.getUserIdentity()
    if (identity === null) throw new InteractiveAuthorityError('identity_invalid')
    const principal = await requireInteractiveHumanPrincipal(ctx.db, identity)
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
    if (account.lifecycle !== 'active') throw new InteractiveAuthorityError('account_inactive')

    const completion = await ctx.db
      .query('interactiveOnboardingCompletions')
      .withIndex('by_accountRef', (query) => query.eq('accountRef', canonicalAccountRef))
      .unique()
    if (completion !== null) {
      if (completion.roleIntent === args.roleIntent && completion.workspaceName === trimmed) {
        return {
          kind: 'completed' as const,
          accountRef: canonicalAccountRef,
          roleIntent: completion.roleIntent,
          workspaceName: completion.workspaceName,
          redirectPath: redirectPathForRoleIntent(completion.roleIntent),
          revision: completion.revision,
        }
      }
      throw new InteractiveAuthorityError('onboarding_already_complete')
    }

    return {
      kind: 'completed' as const,
      accountRef: canonicalAccountRef,
      roleIntent: 'buyer' as const,
      workspaceName: account.displayName,
      redirectPath: '/owner' as const,
      revision: account.revision,
    }
  },
})
