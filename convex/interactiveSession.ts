import type { GenericDatabaseReader, UserIdentity } from 'convex/server'
import { v } from 'convex/values'

import { accountRef } from '../src/modules/principal-account/account/public'
import { principalRef } from '../src/modules/principal-account/principal/public'
import type { DataModel, Doc } from './_generated/dataModel'
import { internalMutation } from './_generated/server'
import { InteractiveAuthorityError, requireAccessFactForAccount } from './interactiveAuthority'

const CLERK_USER_PROVIDER_NAMESPACE = 'clerk/user' as const


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



export const setActiveWorkspace = internalMutation({
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

