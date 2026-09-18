import type { GenericDatabaseReader, UserIdentity } from 'convex/server'
import { v } from 'convex/values'

import { accountRef } from '../src/modules/principal-account/account/public'
import { principalRef } from '../src/modules/principal-account/principal/public'
import type { DataModel, Doc } from './_generated/dataModel'
import { mutation, query } from './_generated/server'
import {
  InteractiveAuthorityError,
  requireAccessFactForAccount,
  resolveActiveAccountRefForPrincipal,
} from './interactiveAuthority'

const CLERK_USER_PROVIDER_NAMESPACE = 'clerk/user' as const
const CORRELATION_REF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/u
const WORKSPACE_NAME_PATTERN = /^[\p{L}\p{N}\p{P}\p{S}\p{Zs}]+$/u

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

type OnboardingDb = GenericDatabaseReader<DataModel>

function redirectPathForRoleIntent(roleIntent: 'buyer' | 'supplier'): '/owner' | '/owner/operations' {
  return roleIntent === 'buyer' ? '/owner' : '/owner/operations'
}

function validateCorrelationRef(value: string): void {
  if (value.length < 3 || value.length > 128 || !CORRELATION_REF_PATTERN.test(value)) {
    throw new InteractiveAuthorityError('correlation_ref_invalid')
  }
}

function validateWorkspaceName(value: string): string {
  const trimmed = value.trim()
  if (trimmed.length === 0 || trimmed.length > 200 || !WORKSPACE_NAME_PATTERN.test(trimmed)) {
    throw new InteractiveAuthorityError('display_name_invalid')
  }
  return trimmed
}

async function requireInteractiveHumanPrincipal(
  db: OnboardingDb,
  identity: UserIdentity,
): Promise<Doc<'principals'>> {
  const tokenIdentifier = identity.tokenIdentifier
  if (typeof tokenIdentifier !== 'string' || tokenIdentifier.trim().length === 0) {
    throw new InteractiveAuthorityError('identity_invalid')
  }
  const bindings = await db
    .query('externalIdentityBindings')
    .withIndex('by_providerNamespace_and_providerIdentifier', (query) => query
      .eq('providerNamespace', CLERK_USER_PROVIDER_NAMESPACE)
      .eq('providerIdentifier', tokenIdentifier))
    .take(2)
  if (bindings.length !== 1) {
    throw new InteractiveAuthorityError(bindings.length === 0 ? 'binding_missing' : 'binding_ambiguous')
  }
  const [binding] = bindings
  if (binding === undefined || binding.lifecycle !== 'active') {
    throw new InteractiveAuthorityError('binding_inactive')
  }
  const principals = await db
    .query('principals')
    .withIndex('by_principalRef', (query) => query.eq('principalRef', binding.principalRef))
    .take(2)
  if (principals.length !== 1) {
    throw new InteractiveAuthorityError(principals.length === 0 ? 'principal_missing' : 'principal_ambiguous')
  }
  const [principal] = principals
  if (principal === undefined || principal.lifecycle !== 'active') {
    throw new InteractiveAuthorityError('principal_inactive')
  }
  if (principal.kind !== 'human') {
    throw new InteractiveAuthorityError('principal_kind_invalid')
  }
  return principal
}

export const readState = query({
  args: {},
  returns: v.union(readStateIncompleteValue, readStateCompleteValue),
  handler: async (ctx) => {
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

    const completion = await ctx.db
      .query('interactiveOnboardingCompletions')
      .withIndex('by_accountRef', (query) => query.eq('accountRef', activeAccountRef))
      .unique()
    if (completion !== null) {
      return {
        phase: 'complete' as const,
        accountRef: activeAccountRef,
        roleIntent: completion.roleIntent,
        redirectPath: redirectPathForRoleIntent(completion.roleIntent),
      }
    }

    const account = await ctx.db
      .query('accounts')
      .withIndex('by_accountRef', (query) => query.eq('accountRef', activeAccountRef))
      .unique()
    if (account === null) throw new InteractiveAuthorityError('account_missing')

    return {
      phase: 'incomplete' as const,
      accountRef: activeAccountRef,
      suggestedWorkspaceName: account.displayName,
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

    const access = await requireAccessFactForAccount(ctx.db, canonicalPrincipalRef, canonicalAccountRef)
    if (access.kind !== 'ownership') {
      throw new InteractiveAuthorityError('ownership_mismatch')
    }

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

    const now = Date.now()
    await ctx.db.patch(account._id, {
      displayName: trimmed,
      revision: account.revision + 1,
      updatedAt: now,
    })
    await ctx.db.insert('interactiveOnboardingCompletions', {
      accountRef: canonicalAccountRef,
      principalRef: canonicalPrincipalRef,
      roleIntent: args.roleIntent,
      workspaceName: trimmed,
      revision: 1,
      completedAt: now,
      correlationRef: args.correlationRef,
    })

    return {
      kind: 'completed' as const,
      accountRef: canonicalAccountRef,
      roleIntent: args.roleIntent,
      workspaceName: trimmed,
      redirectPath: redirectPathForRoleIntent(args.roleIntent),
      revision: 1,
    }
  },
})
