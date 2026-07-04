import type { UserIdentity } from 'convex/server'

import { stableHash } from '../src/modules/common/stable-hash'
import type { BusinessMutationActor } from '../src/modules/business/public'
import { requireAdminAuthority } from '../src/modules/security/public'
import type { AdminAction, AdminAuthorityMutationResult, AdminMembership } from '../src/modules/security/public'

type RuntimeDocument = Record<string, unknown> & { _id: string }

type RuntimeIndexBuilder = {
  eq: (field: string, value: unknown) => RuntimeIndexBuilder
}

type RuntimeQuery = {
  withIndex: (indexName: string, callback: (query: RuntimeIndexBuilder) => RuntimeIndexBuilder) => RuntimeQuery
  collect: () => Promise<RuntimeDocument[]>
  unique: () => Promise<RuntimeDocument | null>
}

type RuntimeDb = {
  query: (tableName: string) => RuntimeQuery
}

type AuthzCtx = {
  db: RuntimeDb
  auth: {
    getUserIdentity: () => Promise<UserIdentity | null>
  }
}

type AdminAuthorityResult = ReturnType<typeof requireAdminAuthority>

type IgnoredBrowserAuthorityPayload = Readonly<Record<string, unknown>>
type AdminIdentityLookup = Pick<UserIdentity, 'issuer' | 'subject' | 'tokenIdentifier'>


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

export async function readActiveAdminMembership(db: RuntimeDb, identity: AdminIdentityLookup): Promise<AdminMembership | undefined> {
  const tokenRow = await db
    .query('adminMemberships')
    .withIndex('by_tokenIdentifier_state', (query) => query.eq('tokenIdentifier', identity.tokenIdentifier).eq('state', 'active'))
    .unique()
  const tokenMembership = tokenRow === null ? undefined : adminMembershipFromDoc(tokenRow)
  if (tokenMembership !== undefined) {
    return tokenMembership
  }

  if (!allowsLegacySubjectFallback(identity)) {
    return undefined
  }

  const subjectRow = await db
    .query('adminMemberships')
    .withIndex('by_clerkUserId_state', (query) => query.eq('clerkUserId', identity.subject).eq('state', 'active'))
    .unique()
  const subjectMembership = subjectRow === null ? undefined : adminMembershipFromDoc(subjectRow)
  if (
    subjectMembership?.tokenIdentifier !== undefined &&
    subjectMembership.tokenIdentifier !== identity.tokenIdentifier
  ) {
    return undefined
  }
  return subjectMembership
}

export function actorFromIdentity(identity: UserIdentity): BusinessMutationActor {
  const displayName = optionalIdentityText(identity.name ?? identity.preferredUsername)
  const emailHash = identity.email === undefined ? undefined : stableHash({ email: identity.email.toLowerCase() })
  return {
    kind: 'authenticated_owner',
    clerkUserId: identity.subject,
    ...(displayName === undefined ? {} : { displayName }),
    ...(emailHash === undefined ? {} : { emailHash }),
    sessionRef: identity.tokenIdentifier,
  }
}

function adminMembershipFromDoc(document: RuntimeDocument): AdminMembership | undefined {
  const role = adminRole(document)
  const state = adminMembershipState(document)
  const clerkUserId = stringField(document, 'clerkUserId')
  const grantedBy = stringField(document, 'grantedBy')
  const grantedAt = numberField(document, 'grantedAt')
  if (role === undefined || state === undefined || clerkUserId.length === 0 || grantedBy.length === 0) {
    return undefined
  }

  return {
    clerkUserId,
    ...(optionalStringField(document, 'tokenIdentifier') === undefined ? {} : { tokenIdentifier: stringField(document, 'tokenIdentifier') }),
    role,
    state,
    grantedBy,
    grantedAt,
    ...(optionalStringField(document, 'revokedBy') === undefined ? {} : { revokedBy: stringField(document, 'revokedBy') }),
    ...(optionalNumberField(document, 'revokedAt') === undefined ? {} : { revokedAt: numberField(document, 'revokedAt') }),
    ...(optionalStringField(document, 'evidenceRef') === undefined ? {} : { evidenceRef: stringField(document, 'evidenceRef') }),
  }
}

function adminRole(document: RuntimeDocument): AdminMembership['role'] | undefined {
  const value = stringField(document, 'role')
  if (value === 'owner_admin' || value === 'support' || value === 'reviewer') {
    return value
  }
  return undefined
}

function adminMembershipState(document: RuntimeDocument): AdminMembership['state'] | undefined {
  const value = stringField(document, 'state')
  if (value === 'active' || value === 'revoked' || value === 'suspended') {
    return value
  }
  return undefined
}

function allowsLegacySubjectFallback(identity: AdminIdentityLookup): boolean {
  const expectedIssuer = typeof process === 'undefined' ? undefined : process.env.CLERK_JWT_ISSUER_DOMAIN
  return expectedIssuer === undefined || expectedIssuer.length === 0 || identity.issuer === expectedIssuer
}

function optionalIdentityText(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined
  }

  const normalized = value.replace(/\s+/g, ' ').trim().slice(0, 160)
  return normalized.length === 0 ? undefined : normalized
}

function stringField(document: RuntimeDocument, field: string): string {
  const value = document[field]
  return typeof value === 'string' ? value : ''
}

function optionalStringField(document: RuntimeDocument, field: string): string | undefined {
  const value = document[field]
  return typeof value === 'string' ? value : undefined
}

function numberField(document: RuntimeDocument, field: string): number {
  const value = document[field]
  return typeof value === 'number' ? value : 0
}

function optionalNumberField(document: RuntimeDocument, field: string): number | undefined {
  const value = document[field]
  return typeof value === 'number' ? value : undefined
}

export type { AdminAuthorityResult, AdminAuthorityMutationResult }
