import {
  makeFunctionReference,
  type GenericDatabaseReader,
  type UserIdentity,
} from 'convex/server'

import type {
  BusinessActor,
  InteractiveBusinessAuthorityContext,
} from '../src/modules/business/public'
import { requireAdminAuthority } from '../src/modules/security/public'
import type { AdminAction, AdminAuthorityMutationResult, AdminAuthorityResult, AdminMembership } from '../src/modules/security/public'
import type { DataModel, Doc } from './_generated/dataModel'
import type { ActionCtx, QueryCtx } from './_generated/server'
import {
  InteractiveAuthorityError,
  resolveInteractiveAuthorityContext,
} from './interactiveAuthority'
type AdminIdentityLookup = Pick<UserIdentity, 'tokenIdentifier'>

type AuthzCtx = {
  db: GenericDatabaseReader<DataModel>
  auth: QueryCtx['auth']
}

type BusinessActorCtx = Readonly<{
  auth: QueryCtx['auth']
}> & (
  | Readonly<{ db: GenericDatabaseReader<DataModel> }>
  | Readonly<{ runQuery: ActionCtx['runQuery'] }>
)

const resolveCurrentInteractiveAuthorityRef = makeFunctionReference<
  'query',
  Record<string, never>,
  InteractiveBusinessAuthorityContext | null
>('interactiveAuthority:resolveCurrentInteractiveAuthority')

export async function resolveBusinessActor(
  ctx: BusinessActorCtx,
): Promise<BusinessActor> {
  const identity = await ctx.auth.getUserIdentity()
  if (identity === null) {
    return anonymousBusinessActor()
  }

  let authority: InteractiveBusinessAuthorityContext | null
  try {
    authority = 'db' in ctx
      ? await resolveInteractiveAuthorityContext(ctx.db, identity)
      : await ctx.runQuery(resolveCurrentInteractiveAuthorityRef, {})
  } catch (error) {
    if (error instanceof InteractiveAuthorityError) return anonymousBusinessActor()
    throw error
  }
  if (authority === null) return anonymousBusinessActor()
  return Object.freeze({
    kind: 'authenticated_owner',
    clerkUserId: authority.legacyOwnerLocator,
    canonicalPrincipalRef: authority.principalRef,
    canonicalAccountRef: authority.accountRef,
    legacyOwnerId: authority.legacyOwnerId,
    authorityRevision: authority.revision,
    authorityProvenance: authority.provenance,
    ...(authority.displayName === undefined ? {} : { displayName: authority.displayName }),
    ...(authority.emailHash === undefined ? {} : { emailHash: authority.emailHash }),
  })
}

function anonymousBusinessActor(): Extract<BusinessActor, { kind: 'anonymous' }> {
  return Object.freeze({
    kind: 'anonymous',
    anonymousBucket: 'convex:anonymous',
  })
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
    .withIndex('by_tokenIdentifier_and_state', (query) =>
      query.eq('tokenIdentifier', identity.tokenIdentifier).eq('state', 'active')
    )
    .unique()
  return row === null ? undefined : adminMembershipFromDoc(row)
}

function adminMembershipFromDoc(membership: Doc<'adminMemberships'>): AdminMembership {
  return {
    clerkUserId: membership.clerkUserId,
    tokenIdentifier: membership.tokenIdentifier,
    role: membership.role,
    state: membership.state,
    grantedBy: membership.grantedBy,
    grantedAt: membership.grantedAt,
    ...(membership.revokedBy === undefined ? {} : { revokedBy: membership.revokedBy }),
    ...(membership.revokedAt === undefined ? {} : { revokedAt: membership.revokedAt }),
    ...(membership.evidenceRef === undefined ? {} : { evidenceRef: membership.evidenceRef }),
  }
}

export type { AdminAuthorityResult, AdminAuthorityMutationResult }
