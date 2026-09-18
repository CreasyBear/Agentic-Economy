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

const workspaceListValue = v.object({
  principalRef: v.string(),
  activeAccountRef: v.union(v.string(), v.null()),
  selectionState: v.union(
    v.literal('unique'),
    v.literal('selected'),
    v.literal('org_bound'),
    v.literal('selection_required'),
  ),
  workspaces: v.array(v.object({
    accountRef: v.string(),
    displayName: v.string(),
    accessKind: v.union(v.literal('ownership'), v.literal('membership')),
    isActive: v.boolean(),
    clerkOrganizationId: v.optional(v.string()),
  })),
})

const setActiveWorkspaceResultValue = v.object({
  principalRef: v.string(),
  activeAccountRef: v.string(),
  revision: v.number(),
  selectedAt: v.number(),
})

type SessionDb = GenericDatabaseReader<DataModel>

async function requireInteractiveHumanPrincipal(
  db: SessionDb,
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

async function clerkOrganizationIdForAccount(
  db: SessionDb,
  accountRefValue: string,
): Promise<string | undefined> {
  const bindings = await db
    .query('accountExternalOrganizationBindings')
    .withIndex('by_accountRef_and_lifecycle', (query) => query
      .eq('accountRef', accountRefValue)
      .eq('lifecycle', 'active'))
    .take(2)
  if (bindings.length !== 1) return undefined
  const [binding] = bindings
  return binding?.providerIdentifier
}

async function accessKindForAccount(
  db: SessionDb,
  canonicalPrincipalRef: string,
  accountRefValue: string,
): Promise<'ownership' | 'membership'> {
  const ownership = await db
    .query('accountOwnerships')
    .withIndex('by_accountRef_and_ownerPrincipalRef_and_lifecycle', (query) => query
      .eq('accountRef', accountRefValue)
      .eq('ownerPrincipalRef', canonicalPrincipalRef)
      .eq('lifecycle', 'active'))
    .unique()
  if (ownership !== null) return 'ownership'
  return 'membership'
}

export const setActiveWorkspace = mutation({
  args: {
    accountRef: v.string(),
    correlationRef: v.string(),
  },
  returns: setActiveWorkspaceResultValue,
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (identity === null) throw new InteractiveAuthorityError('identity_invalid')
    const principal = await requireInteractiveHumanPrincipal(ctx.db, identity)
    const canonicalPrincipalRef = principalRef(principal.principalRef)
    const targetAccountRef = accountRef(args.accountRef)
    await requireAccessFactForAccount(ctx.db, canonicalPrincipalRef, targetAccountRef)
    const account = await ctx.db
      .query('accounts')
      .withIndex('by_accountRef', (query) => query.eq('accountRef', targetAccountRef))
      .unique()
    if (account === null) throw new InteractiveAuthorityError('account_missing')
    if (account.lifecycle !== 'active') throw new InteractiveAuthorityError('account_inactive')

    const existingRows = await ctx.db
      .query('interactiveSessionSelections')
      .withIndex('by_principalRef', (query) => query.eq('principalRef', canonicalPrincipalRef))
      .take(2)
    if (existingRows.length > 1) throw new InteractiveAuthorityError('authority_fact_invalid')
    const [existing] = existingRows
    if (existing !== undefined) {
      if (existing.activeAccountRef === targetAccountRef) {
        return {
          principalRef: canonicalPrincipalRef,
          activeAccountRef: targetAccountRef,
          revision: existing.revision,
          selectedAt: existing.selectedAt,
        }
      }
      const selectedAt = Date.now()
      const revision = existing.revision + 1
      await ctx.db.patch(existing._id, {
        activeAccountRef: targetAccountRef,
        revision,
        selectedAt,
        lastCorrelationRef: args.correlationRef,
      })
      return {
        principalRef: canonicalPrincipalRef,
        activeAccountRef: targetAccountRef,
        revision,
        selectedAt,
      }
    }

    const selectedAt = Date.now()
    await ctx.db.insert('interactiveSessionSelections', {
      principalRef: canonicalPrincipalRef,
      activeAccountRef: targetAccountRef,
      revision: 1,
      selectedAt,
      lastCorrelationRef: args.correlationRef,
    })
    return {
      principalRef: canonicalPrincipalRef,
      activeAccountRef: targetAccountRef,
      revision: 1,
      selectedAt,
    }
  },
})

export const listUserWorkspaces = query({
  args: {},
  returns: workspaceListValue,
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()
    if (identity === null) throw new InteractiveAuthorityError('identity_invalid')
    const principal = await requireInteractiveHumanPrincipal(ctx.db, identity)
    const canonicalPrincipalRef = principalRef(principal.principalRef)

    const ownerships = await ctx.db
      .query('accountOwnerships')
      .withIndex('by_ownerPrincipalRef_and_lifecycle', (query) =>
        query.eq('ownerPrincipalRef', canonicalPrincipalRef).eq('lifecycle', 'active'))
      .take(50)
    const memberships = await ctx.db
      .query('memberships')
      .withIndex('by_memberPrincipalRef_and_lifecycle', (query) =>
        query.eq('memberPrincipalRef', canonicalPrincipalRef).eq('lifecycle', 'active'))
      .take(50)
    const accountRefs = Array.from(new Set([
      ...ownerships.map((row) => row.accountRef),
      ...memberships.map((row) => row.accountRef),
    ]))

    if (accountRefs.length === 0) {
      throw new InteractiveAuthorityError('account_access_missing')
    }
    const resolution = await resolveActiveAccountRefForPrincipal(
      ctx.db,
      canonicalPrincipalRef,
      identity,
      'nullable',
    )
    const activeAccountRef = resolution.activeAccountRef
    const selectionState = resolution.selectionState

    const workspaces = await Promise.all(accountRefs.map(async (accountRefValue) => {
      const account = await ctx.db
        .query('accounts')
        .withIndex('by_accountRef', (query) => query.eq('accountRef', accountRefValue))
        .unique()
      const displayName = account?.displayName ?? accountRefValue
      const accessKind = await accessKindForAccount(ctx.db, canonicalPrincipalRef, accountRefValue)
      const clerkOrganizationId = await clerkOrganizationIdForAccount(ctx.db, accountRefValue)
      return {
        accountRef: accountRefValue,
        displayName,
        accessKind,
        isActive: activeAccountRef === accountRefValue,
        ...(clerkOrganizationId === undefined ? {} : { clerkOrganizationId }),
      }
    }))

    return {
      principalRef: canonicalPrincipalRef,
      activeAccountRef,
      selectionState,
      workspaces,
    }
  },
})
