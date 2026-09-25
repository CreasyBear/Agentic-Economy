import { v } from 'convex/values'
import type { QueryCtx } from '../../../_generated/server'

import { accountRef } from '../../../../src/modules/principal-account/account/public'
import { principalRef } from '../../../../src/modules/principal-account/principal/public'
import { InteractiveAuthorityError, requireAccessFactForAccount, resolveActiveAccountRefForPrincipal } from '../../../interactiveAuthority'
import { CLERK_USER_PROVIDER_NAMESPACE, requireDirectoryInteractiveHumanPrincipal, type WorkspaceDb } from './identity'

const directoryOwnerValue = v.object({
  kind: v.literal('owner'),
  principalRef: v.string(),
  displayName: v.string(),
  email: v.union(v.string(), v.null()),
  clerkUserId: v.union(v.string(), v.null()),
  ownershipRef: v.string(),
  joinedAt: v.number(),
})

const directoryMemberValue = v.object({
  kind: v.literal('member'),
  principalRef: v.string(),
  displayName: v.string(),
  email: v.union(v.string(), v.null()),
  clerkUserId: v.union(v.string(), v.null()),
  membershipRef: v.string(),
  role: v.union(v.literal('admin'), v.literal('member')),
  lifecycle: v.literal('active'),
  joinedAt: v.number(),
})

const directoryViewValue = v.object({
  accountRef: v.string(),
  owner: directoryOwnerValue,
  members: v.array(directoryMemberValue),
})

type DirectoryOwner = {
  kind: 'owner'
  principalRef: string
  displayName: string
  email: string | null
  clerkUserId: string | null
  ownershipRef: string
  joinedAt: number
}

type DirectoryMember = {
  kind: 'member'
  principalRef: string
  displayName: string
  email: string | null
  clerkUserId: string | null
  membershipRef: string
  role: 'admin' | 'member'
  lifecycle: 'active'
  joinedAt: number
}

type DirectoryView = {
  accountRef: string
  owner: DirectoryOwner
  members: DirectoryMember[]
}

async function resolveEmailForPrincipal(
  db: WorkspaceDb,
  targetPrincipalRef: string,
): Promise<string | null> {
  const emailRows = await db
    .query('principalNotificationEmails')
    .withIndex('by_principalRef', (q) => q.eq('principalRef', targetPrincipalRef))
    .take(1)
  const emailRow = emailRows[0]
  if (emailRow !== undefined && typeof emailRow.email === 'string' && emailRow.email.trim().length > 0) {
    return emailRow.email.trim()
  }
  return null
}

async function resolveClerkUserIdForPrincipal(db: WorkspaceDb, targetPrincipalRef: string): Promise<string | null> {
  const bindings = await db.query('externalIdentityBindings')
    .withIndex('by_principalRef_and_lifecycle', (q) => q.eq('principalRef', targetPrincipalRef).eq('lifecycle', 'active'))
    .take(20)
  const binding = bindings.find(row => row.providerNamespace === CLERK_USER_PROVIDER_NAMESPACE)
  const userId = binding?.providerIdentifier.split('|').at(-1)
  return userId?.startsWith('user_') ? userId : null
}

export const listDirectoryArgs = v.object({})

export const listDirectoryResult = directoryViewValue

export const listDirectoryHandler = async (ctx: QueryCtx): Promise<DirectoryView> => {
    const identity = await ctx.auth.getUserIdentity()
    if (identity === null) {
      throw new InteractiveAuthorityError('identity_invalid')
    }

    const principal = await requireDirectoryInteractiveHumanPrincipal(ctx.db, identity)
    const canonicalPrincipalRef = principalRef(principal.principalRef)

    const { activeAccountRef } = await resolveActiveAccountRefForPrincipal(
      ctx.db,
      canonicalPrincipalRef,
      identity,
      'require',
    )
    const canonicalAccountRef = accountRef(activeAccountRef)

    await requireAccessFactForAccount(ctx.db, canonicalPrincipalRef, canonicalAccountRef)

    const account = await ctx.db
      .query('accounts')
      .withIndex('by_accountRef', (q) => q.eq('accountRef', canonicalAccountRef))
      .unique()
    if (account === null) {
      throw new InteractiveAuthorityError('account_missing')
    }
    if (account.lifecycle !== 'active') {
      throw new InteractiveAuthorityError('account_inactive')
    }

    const ownerships = await ctx.db
      .query('accountOwnerships')
      .withIndex('by_accountRef_and_lifecycle', (q) =>
        q.eq('accountRef', canonicalAccountRef).eq('lifecycle', 'active'))
      .collect()

    if (ownerships.length === 0) {
      throw new InteractiveAuthorityError('ownership_missing')
    }
    if (ownerships.length > 1) {
      throw new InteractiveAuthorityError('ownership_ambiguous')
    }

    const [currentOwnership] = ownerships
    if (currentOwnership === undefined || currentOwnership.ownershipRef !== account.currentOwnershipRef) {
      throw new InteractiveAuthorityError('ownership_mismatch')
    }

    const ownerPrincipal = await ctx.db
      .query('principals')
      .withIndex('by_principalRef', (q) => q.eq('principalRef', currentOwnership.ownerPrincipalRef))
      .unique()
    if (ownerPrincipal === null || ownerPrincipal.lifecycle !== 'active' || ownerPrincipal.kind !== 'human') {
      throw new InteractiveAuthorityError('directory_principal_missing')
    }

    const ownerEmail = await resolveEmailForPrincipal(ctx.db, ownerPrincipal.principalRef)

    const owner: DirectoryOwner = {
      kind: 'owner',
      principalRef: ownerPrincipal.principalRef,
      displayName: ownerPrincipal.displayName,
      email: ownerEmail,
      clerkUserId: await resolveClerkUserIdForPrincipal(ctx.db, ownerPrincipal.principalRef),
      ownershipRef: currentOwnership.ownershipRef,
      joinedAt: currentOwnership.createdAt,
    }

    const memberships = await ctx.db
      .query('memberships')
      .withIndex('by_accountRef_and_lifecycle', (q) =>
        q.eq('accountRef', canonicalAccountRef).eq('lifecycle', 'active'))
      .collect()

    const members: DirectoryMember[] = []
    for (const membership of memberships) {
      if (membership.memberPrincipalRef === ownerPrincipal.principalRef) {
        continue
      }

      const memberPrincipal = await ctx.db
        .query('principals')
        .withIndex('by_principalRef', (q) => q.eq('principalRef', membership.memberPrincipalRef))
        .unique()

      if (memberPrincipal === null || memberPrincipal.lifecycle !== 'active') {
        if (memberPrincipal !== null && memberPrincipal.kind !== 'human') {
          continue
        }
        throw new InteractiveAuthorityError('directory_principal_missing')
      }

      if (memberPrincipal.kind !== 'human') {
        continue
      }

      const memberEmail = await resolveEmailForPrincipal(ctx.db, memberPrincipal.principalRef)

      members.push({
        kind: 'member',
        principalRef: memberPrincipal.principalRef,
        displayName: memberPrincipal.displayName,
        clerkUserId: await resolveClerkUserIdForPrincipal(ctx.db, memberPrincipal.principalRef),
        email: memberEmail,
        membershipRef: membership.membershipRef,
        role: membership.role === 'org:admin' ? 'admin' : 'member',
        lifecycle: 'active',
        joinedAt: membership.createdAt,
      })
    }

    return {
      accountRef: canonicalAccountRef,
      owner,
      members,
    }
  }
