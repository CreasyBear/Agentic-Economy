import { mutationGeneric } from 'convex/server'
import { v } from 'convex/values'

import { resolveBusinessActor } from './authz'
import { runtimeWriter } from './source-state'
import type { RuntimeDocument, RuntimeWriter } from './source-state'
import { stableHash } from '../src/modules/common/stable-hash'
import type { BusinessMutationActor } from '../src/modules/business/public'
import { assertCsrf, normalizeClaimFingerprint } from '../src/modules/security/public'

const sourceRefArg = v.object({
  label: v.string(),
  evidenceRef: v.string(),
  sourceHash: v.optional(v.string()),
})

const sourceRefResult = v.object({
  label: v.string(),
  evidenceRef: v.string(),
  sourceHash: v.string(),
})

const ownerResult = v.object({
  ownerId: v.string(),
  clerkUserId: v.string(),
  displayName: v.optional(v.string()),
  emailHash: v.optional(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
})

const businessResult = v.object({
  businessId: v.string(),
  ownerId: v.string(),
  slug: v.string(),
  name: v.string(),
  normalizedName: v.string(),
  category: v.string(),
  suburb: v.string(),
  stateTerritory: v.string(),
  publicStatus: v.union(v.literal('unpublished'), v.literal('published'), v.literal('suppressed')),
  trustTier: v.union(v.literal('claimed'), v.literal('contact_confirmed'), v.literal('listed'), v.literal('registry_verified')),
  claimStatus: v.union(
    v.literal('draft'),
    v.literal('authenticated'),
    v.literal('published'),
    v.literal('contested'),
    v.literal('disputed'),
    v.literal('suppressed')
  ),
  sourceHash: v.string(),
  createdAt: v.number(),
  updatedAt: v.number(),
  suppressedAt: v.optional(v.number()),
})

const claimResult = v.object({
  claimId: v.string(),
  ownerId: v.string(),
  businessId: v.optional(v.string()),
  slug: v.string(),
  status: v.union(
    v.literal('draft'),
    v.literal('authenticated'),
    v.literal('published'),
    v.literal('contested'),
    v.literal('disputed'),
    v.literal('suppressed')
  ),
  submittedFactsHash: v.string(),
  createdAt: v.number(),
  updatedAt: v.number(),
})

const contextResult = v.object({
  businessId: v.string(),
  category: v.string(),
  suburb: v.string(),
  stateTerritory: v.string(),
  postcode: v.optional(v.string()),
  ownerMessage: v.optional(v.string()),
  sourceRefs: v.array(sourceRefResult),
  sourceHash: v.string(),
  approvedAt: v.number(),
})

const claimErrorCode = v.union(
  v.literal('claim_unauthenticated'),
  v.literal('claim_invalid_facts'),
  v.literal('claim_slug_conflict'),
  v.literal('claim_duplicate_conflict'),
  v.literal('claim_pending_review'),
  v.literal('claim_csrf_rejected'),
  v.literal('claim_rate_limited')
)

const claimErrorResult = v.object({
  kind: v.literal('error'),
  code: claimErrorCode,
  retryable: v.boolean(),
  reason: v.string(),
  claim: v.optional(claimResult),
  publicReason: v.optional(v.literal('duplicate_or_impersonation_review')),
})

const claimOkResult = v.object({
  kind: v.literal('ok'),
  code: v.literal('claim_created'),
  owner: ownerResult,
  business: businessResult,
  claim: claimResult,
  context: contextResult,
})

export const claimBusiness = mutationGeneric({
  args: {
    name: v.string(),
    category: v.string(),
    suburb: v.string(),
    stateTerritory: v.string(),
    requestedSlug: v.string(),
    ownerMessage: v.optional(v.string()),
    sourceRefs: v.array(sourceRefArg),
    csrfToken: v.optional(v.string()),
    csrfCookie: v.optional(v.string()),
    origin: v.optional(v.string()),
    operationKey: v.string(),
    correlationId: v.string(),
  },
  returns: v.union(claimOkResult, claimErrorResult),
  handler: async (ctx, args) => {
    const csrfDecision = assertCsrf({
      ...(args.csrfToken === undefined ? {} : { csrfToken: args.csrfToken }),
      ...(args.csrfCookie === undefined ? {} : { csrfCookie: args.csrfCookie }),
      ...(args.origin === undefined ? {} : { origin: args.origin }),
      allowedOrigins: sourceAllowedOrigins(),
    })
    if (csrfDecision.kind === 'rejected') {
      return claimError('claim_csrf_rejected', csrfDecision.reason)
    }

    const actor = await resolveBusinessActor(ctx, args)
    if (actor.kind !== 'authenticated_owner') {
      return claimError('claim_unauthenticated', 'Authentication is required to claim a business.')
    }

    const runtimeCtx = { db: runtimeWriter(ctx.db) }
    const now = Date.now()
    const normalized = normalizeClaimFacts(args)
    if (normalized.kind === 'invalid') {
      return claimError('claim_invalid_facts', normalized.reason)
    }

    const existingBusiness = await ctx.db
      .query('businesses')
      .withIndex('by_slug', (query) => query.eq('slug', normalized.slug))
      .unique()
    if (existingBusiness !== null) {
      return claimError('claim_slug_conflict', 'A business already owns this public slug.')
    }

    const owner = await findOrCreateOwner(runtimeCtx, actor, now)
    const rateLimited = await incrementClaimRateLimit(runtimeCtx, actor.clerkUserId, now)
    if (rateLimited !== undefined) {
      return rateLimited
    }

    const fingerprint = normalizeClaimFingerprint({
      name: normalized.name,
      category: normalized.category,
      suburb: normalized.suburb,
      stateTerritory: normalized.stateTerritory,
    })
    const existingFingerprints = await ctx.db
      .query('claimFingerprints')
      .withIndex('by_fingerprint_status', (query) => query.eq('fingerprint', fingerprint))
      .collect()
    const duplicate = existingFingerprints.at(0)
    if (duplicate !== undefined) {
      const duplicateOwnerRef = typeof duplicate.ownerRef === 'string' ? duplicate.ownerRef : undefined
      if (duplicateOwnerRef === owner.ownerId) {
        return claimError('claim_duplicate_conflict', 'This owner already has a claim for the normalized business identity.')
      }

      const contestedHash = stableHash({
        category: normalized.category,
        duplicate: 'duplicate_or_impersonation_review',
        name: normalized.name,
        slug: normalized.slug,
        stateTerritory: normalized.stateTerritory,
        suburb: normalized.suburb,
      })
      const claimId = await ctx.db.insert('claims', {
        ownerId: owner.ownerId,
        slug: normalized.slug,
        status: 'contested',
        submittedFactsHash: contestedHash,
        createdAt: now,
        updatedAt: now,
      })
      await ctx.db.insert('claimFingerprints', {
        fingerprint,
        status: 'duplicate_suspected',
        businessSlug: normalized.slug,
        ownerRef: owner.ownerId,
        claimId,
        createdAt: now,
        updatedAt: now,
      })
      return {
        kind: 'error' as const,
        code: 'claim_pending_review' as const,
        retryable: false,
        reason: 'This claim needs owner review before it can publish.',
        publicReason: 'duplicate_or_impersonation_review' as const,
        claim: {
          claimId,
          ownerId: owner.ownerId,
          slug: normalized.slug,
          status: 'contested' as const,
          submittedFactsHash: contestedHash,
          createdAt: now,
          updatedAt: now,
        },
      }
    }

    const sourceHash = stableHash({
      category: normalized.category,
      name: normalized.name,
      slug: normalized.slug,
      sourceRefs: normalized.sourceRefs,
      stateTerritory: normalized.stateTerritory,
      suburb: normalized.suburb,
    })
    const businessId = await ctx.db.insert('businesses', {
      ownerId: owner.ownerId,
      slug: normalized.slug,
      name: normalized.name,
      normalizedName: normalized.name.toLowerCase(),
      category: normalized.category,
      suburb: normalized.suburb,
      stateTerritory: normalized.stateTerritory,
      publicStatus: 'unpublished',
      trustTier: 'claimed',
      claimStatus: 'authenticated',
      sourceHash,
      createdAt: now,
      updatedAt: now,
    })
    await ctx.db.insert('businessContexts', {
      businessId,
      category: normalized.category,
      suburb: normalized.suburb,
      stateTerritory: normalized.stateTerritory,
      ...(normalized.ownerMessage === undefined ? {} : { ownerMessage: normalized.ownerMessage }),
      sourceRefs: normalized.sourceRefs,
      sourceHash,
      approvedAt: now,
    })
    const claimId = await ctx.db.insert('claims', {
      ownerId: owner.ownerId,
      businessId,
      slug: normalized.slug,
      status: 'authenticated',
      submittedFactsHash: sourceHash,
      createdAt: now,
      updatedAt: now,
    })
    await ctx.db.insert('claimFingerprints', {
      fingerprint,
      status: 'clear',
      businessSlug: normalized.slug,
      ownerRef: owner.ownerId,
      claimId,
      createdAt: now,
      updatedAt: now,
    })

    return {
      kind: 'ok' as const,
      code: 'claim_created' as const,
      owner,
      business: {
        businessId,
        ownerId: owner.ownerId,
        slug: normalized.slug,
        name: normalized.name,
        normalizedName: normalized.name.toLowerCase(),
        category: normalized.category,
        suburb: normalized.suburb,
        stateTerritory: normalized.stateTerritory,
        publicStatus: 'unpublished' as const,
        trustTier: 'claimed' as const,
        claimStatus: 'authenticated' as const,
        sourceHash,
        createdAt: now,
        updatedAt: now,
      },
      claim: {
        claimId,
        ownerId: owner.ownerId,
        businessId,
        slug: normalized.slug,
        status: 'authenticated' as const,
        submittedFactsHash: sourceHash,
        createdAt: now,
        updatedAt: now,
      },
      context: {
        businessId,
        category: normalized.category,
        suburb: normalized.suburb,
        stateTerritory: normalized.stateTerritory,
        ...(normalized.ownerMessage === undefined ? {} : { ownerMessage: normalized.ownerMessage }),
        sourceRefs: normalized.sourceRefs,
        sourceHash,
        approvedAt: now,
      },
    }
  },
})

export const suppressBusiness = mutationGeneric({
  args: {
    businessId: v.string(),
    reasonCode: v.string(),
    evidenceRefs: v.array(v.string()),
    csrfToken: v.optional(v.string()),
    csrfCookie: v.optional(v.string()),
    origin: v.optional(v.string()),
    operationKey: v.string(),
    correlationId: v.string(),
  },
  returns: v.object({
    kind: v.literal('error'),
    code: v.literal('business_suppress_admin_denied'),
    retryable: v.boolean(),
    reason: v.string(),
  }),
  handler: async () => ({
    kind: 'error' as const,
    code: 'business_suppress_admin_denied' as const,
    retryable: false,
    reason: 'Convex suppression mutations require source-owned admin membership wiring in the deployment boundary.',
  }),
})

export const unsuppressBusiness = mutationGeneric({
  args: {
    businessId: v.string(),
    reasonCode: v.string(),
    evidenceRefs: v.array(v.string()),
    csrfToken: v.optional(v.string()),
    csrfCookie: v.optional(v.string()),
    origin: v.optional(v.string()),
    operationKey: v.string(),
    correlationId: v.string(),
  },
  returns: v.object({
    kind: v.literal('error'),
    code: v.literal('business_unsuppress_admin_denied'),
    retryable: v.boolean(),
    reason: v.string(),
  }),
  handler: async () => ({
    kind: 'error' as const,
    code: 'business_unsuppress_admin_denied' as const,
    retryable: false,
    reason: 'Convex unsuppression mutations require source-owned admin membership wiring in the deployment boundary.',
  }),
})

type ClaimBusinessArgs = {
  name: string
  category: string
  suburb: string
  stateTerritory: string
  requestedSlug: string
  ownerMessage?: string
  sourceRefs: readonly { label: string; evidenceRef: string; sourceHash?: string }[]
}

type NormalizedClaimFacts =
  | {
      kind: 'valid'
      name: string
      category: string
      suburb: string
      stateTerritory: string
      slug: string
      ownerMessage?: string
      sourceRefs: { label: string; evidenceRef: string; sourceHash: string }[]
    }
  | { kind: 'invalid'; reason: string }

type AuthenticatedOwnerActor = Extract<BusinessMutationActor, { kind: 'authenticated_owner' }>

type OwnerContract = {
  ownerId: string
  clerkUserId: string
  displayName?: string
  emailHash?: string
  createdAt: number
  updatedAt: number
}

function claimError(
  code:
    | 'claim_unauthenticated'
    | 'claim_invalid_facts'
    | 'claim_slug_conflict'
    | 'claim_duplicate_conflict'
    | 'claim_csrf_rejected'
    | 'claim_rate_limited',
  reason: string,
  retryable = false
) {
  return { kind: 'error' as const, code, retryable, reason }
}

function normalizeClaimFacts(args: ClaimBusinessArgs): NormalizedClaimFacts {
  const name = normalizePublicText(args.name)
  const category = normalizePublicText(args.category)
  const suburb = normalizePublicText(args.suburb)
  const stateTerritory = normalizePublicText(args.stateTerritory)
  const slug = normalizeSlug(args.requestedSlug)
  const ownerMessage = normalizeOptionalText(args.ownerMessage)
  const sourceRefs = args.sourceRefs.map((sourceRef) => {
    const label = normalizePublicText(sourceRef.label)
    const evidenceRef = normalizePublicText(sourceRef.evidenceRef)
    return {
      label,
      evidenceRef,
      sourceHash: stableHash({ evidenceRef, label, suppliedHash: sourceRef.sourceHash ?? '' }),
    }
  })

  if (name.length === 0 || category.length === 0 || suburb.length === 0 || stateTerritory.length === 0) {
    return { kind: 'invalid', reason: 'Name, category, suburb, and state/territory are required.' }
  }

  if (slug.length === 0) {
    return { kind: 'invalid', reason: 'A public slug is required.' }
  }

  if (sourceRefs.length === 0 || sourceRefs.some((sourceRef) => sourceRef.label.length === 0 || sourceRef.evidenceRef.length === 0)) {
    return { kind: 'invalid', reason: 'At least one source reference is required.' }
  }

  const base = {
    kind: 'valid' as const,
    name,
    category,
    suburb,
    stateTerritory,
    slug,
    sourceRefs,
  }
  return ownerMessage === undefined ? base : { ...base, ownerMessage }
}

type RuntimeCtx = {
  db: RuntimeWriter
}

async function findOrCreateOwner(ctx: RuntimeCtx, actor: AuthenticatedOwnerActor, now: number): Promise<OwnerContract> {
  const db = ctx.db
  const existing = await db
    .query('owners')
    .withIndex('by_clerkUserId', (query) => query.eq('clerkUserId', actor.clerkUserId))
    .unique()
  const displayName = normalizeOptionalText(actor.displayName)
  const emailHash = actor.emailHash

  if (existing !== null) {
    const ownerId = String(existing._id)
    await db.patch(ownerId, {
      ...(displayName === undefined ? {} : { displayName }),
      ...(emailHash === undefined ? {} : { emailHash }),
      updatedAt: now,
    })
    return {
      ownerId,
      clerkUserId: actor.clerkUserId,
      ...(displayName === undefined ? {} : { displayName }),
      ...(emailHash === undefined ? {} : { emailHash }),
      createdAt: typeof existing.createdAt === 'number' ? existing.createdAt : now,
      updatedAt: now,
    }
  }

  const ownerDoc = {
    clerkUserId: actor.clerkUserId,
    ...(displayName === undefined ? {} : { displayName }),
    ...(emailHash === undefined ? {} : { emailHash }),
    createdAt: now,
    updatedAt: now,
  }
  const ownerId = await db.insert('owners', ownerDoc)
  return { ownerId, ...ownerDoc }
}

async function incrementClaimRateLimit(ctx: RuntimeCtx, clerkUserId: string, now: number) {
  const db = ctx.db
  const windowMs = 60_000
  const limit = 5
  const window = String(Math.floor(now / windowMs))
  const key = `owner:${clerkUserId}`
  const existing = await db
    .query('abuseRateLimitBuckets')
    .withIndex('by_scope_key_window', (query) => query.eq('scope', 'claim_submit').eq('key', key).eq('window', window))
    .unique()

  if (existing === null) {
    await db.insert('abuseRateLimitBuckets', {
      scope: 'claim_submit',
      key,
      window,
      count: 1,
      state: 'open',
      resetAt: (Number(window) + 1) * windowMs,
      updatedAt: now,
    })
    return undefined
  }

  const count = typeof existing.count === 'number' ? existing.count : 0
  const resetAt = typeof existing.resetAt === 'number' ? existing.resetAt : (Number(window) + 1) * windowMs
  const bucketId = String(existing._id)
  if (count >= limit) {
    await db.patch(bucketId, { state: 'limited', updatedAt: now })
    return claimError('claim_rate_limited', `Retry after ${resetAt}.`, true)
  }

  const nextCount = count + 1
  await db.patch(bucketId, { count: nextCount, state: nextCount >= limit ? 'limited' : 'open', updatedAt: now })
  return undefined
}

function sourceAllowedOrigins(): readonly string[] {
  const configured = readEnv('AE_ALLOWED_ORIGINS') ?? readEnv('VITE_AE_ALLOWED_ORIGINS') ?? readEnv('SITE_URL') ?? readEnv('VITE_SITE_URL')
  const origins = configured === undefined ? [] : configured.split(',').map((origin) => origin.trim()).filter(Boolean)
  return ['https://ae.example', ...origins.filter((origin) => origin !== 'https://ae.example')]
}

function readEnv(name: string): string | undefined {
  return typeof process === 'undefined' ? undefined : process.env[name]
}

function normalizePublicText(value: string): string {
  return value.replaceAll(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 240)
}

function normalizeOptionalText(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined
  }

  const normalized = normalizePublicText(value)
  return normalized.length === 0 ? undefined : normalized
}

function normalizeSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72)
}

export type {
  BusinessIdentity,
  BusinessSuppressionState,
  BusinessSourceState,
  ClaimBusinessCommand,
  ClaimBusinessResult,
  ClaimContract,
  ClaimStatus,
  PublicStatus,
  SuppressBusinessCommand,
  SuppressBusinessResult,
  TrustTier,
  UnsuppressBusinessCommand,
  UnsuppressBusinessResult,
} from '../src/modules/business/public'
