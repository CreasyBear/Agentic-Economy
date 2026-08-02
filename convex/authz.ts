import type { GenericDatabaseReader, UserIdentity } from 'convex/server'

import { canonicalDigest } from '../src/modules/common/canonical-digest'
import type { BusinessMutationActor } from '../src/modules/business/public'
import { requireAdminAuthority } from '../src/modules/security/public'
import type { AdminAction, AdminAuthorityMutationResult, AdminAuthorityResult, AdminMembership } from '../src/modules/security/public'
import type { DataModel, Doc } from './_generated/dataModel'
import type { QueryCtx } from './_generated/server'
type IgnoredBrowserAuthorityPayload = Readonly<Record<string, unknown>>
type AdminIdentityLookup = Pick<UserIdentity, 'tokenIdentifier'>

type AuthzCtx = {
  db: GenericDatabaseReader<DataModel>
  auth: QueryCtx['auth']
}




export async function resolveBusinessActor(
  ctx: Pick<AuthzCtx, 'auth'>,
  _ignoredPayload?: IgnoredBrowserAuthorityPayload
): Promise<BusinessMutationActor> {
  const identity = await ctx.auth.getUserIdentity()
  if (identity === null) {
    return {
      kind: 'anonymous',
      anonymousBucket: 'convex:anonymous',
    }
  }

  return actorFromIdentity(identity)
}

export async function resolveAdminAuthority(ctx: AuthzCtx, action: AdminAction): Promise<AdminAuthorityResult> {
  const identity = await ctx.auth.getUserIdentity()
  if (identity === null) {
    return requireAdminAuthority(undefined, action)
  }

  const membership = await readActiveAdminMembership(ctx.db, identity)
  return requireAdminAuthority(membership, action)
}

export async function readCurrentActiveAdminMembership(
  ctx: Readonly<{
    db: GenericDatabaseReader<DataModel>
    auth: QueryCtx['auth']
  }>,
): Promise<AdminMembership | undefined> {
  const identity = await ctx.auth.getUserIdentity()
  return identity === null ? undefined : readActiveAdminMembership(ctx.db, identity)
}

export async function readActiveAdminMembership(
  db: GenericDatabaseReader<DataModel>,
  identity: AdminIdentityLookup,
): Promise<AdminMembership | undefined> {
  if (typeof identity.tokenIdentifier !== 'string' || identity.tokenIdentifier.length === 0) {
    return undefined
  }

  const row = await db
    .query('adminMemberships')
    .withIndex('by_tokenIdentifier_state', (query) => query.eq('tokenIdentifier', identity.tokenIdentifier).eq('state', 'active'))
    .unique()
  return row === null ? undefined : adminMembershipFromDoc(row)
}

export function actorFromIdentity(identity: UserIdentity): BusinessMutationActor {
  const displayName = optionalIdentityText(identity.name ?? identity.preferredUsername)
  const emailHash = identity.email === undefined ? undefined : canonicalDigest({ email: identity.email.toLowerCase() })
  return {
    kind: 'authenticated_owner',
    clerkUserId: identity.subject,
    ...(displayName === undefined ? {} : { displayName }),
    ...(emailHash === undefined ? {} : { emailHash }),
    sessionRef: identity.tokenIdentifier,
  }
}

function adminMembershipFromDoc(document: Doc<'adminMemberships'>): AdminMembership | undefined {
  const tokenIdentifier = document.tokenIdentifier
  if (typeof tokenIdentifier !== 'string' || tokenIdentifier.length === 0) {
    return undefined
  }

  return {
    clerkUserId: document.clerkUserId,
    tokenIdentifier,
    role: document.role,
    state: document.state,
    grantedBy: document.grantedBy,
    grantedAt: document.grantedAt,
    ...(document.revokedBy === undefined ? {} : { revokedBy: document.revokedBy }),
    ...(document.revokedAt === undefined ? {} : { revokedAt: document.revokedAt }),
    ...(document.evidenceRef === undefined ? {} : { evidenceRef: document.evidenceRef }),
  }
}

function optionalIdentityText(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined
  }

  const normalized = value.replace(/\s+/g, ' ').trim().slice(0, 160)
  return normalized.length === 0 ? undefined : normalized
}



export type { AdminAuthorityResult, AdminAuthorityMutationResult }
