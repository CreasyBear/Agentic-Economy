import type { UserIdentity } from 'convex/server'
import { mutationGeneric } from 'convex/server'
import { v } from 'convex/values'

import { readActiveAdminMembership, resolveBusinessActor } from './authz'
import { requireSourceWrite, sourceWriteArgs, type SourceWriteArgs } from './sourceWriteAdmission'
import { loadPhaseOneSourceState, persistPhaseOneSourceState, runtimeDb, runtimeWriter } from './source_state'
import type { RuntimeDocument, RuntimeWriter } from './source_state'
import { brandNonEmpty } from '../src/modules/common/ids'
import { stableHash } from '../src/modules/common/stable-hash'
import { suppressBusiness as suppressBusinessModule, unsuppressBusiness as unsuppressBusinessModule, validateOwnerPublishedPhone } from '../src/modules/business/public'
import type { BusinessMutationActor, BusinessSuppressionState } from '../src/modules/business/public'
import { recordAdminActionDenied, requireAdminAuthority, normalizeClaimFingerprint } from '../src/modules/security/public'
import type { AdminAuthorityState, AdminDecisionAudit, AdminMembership } from '../src/modules/security/public'
import type { AuditEventContract } from '../src/modules/observability/public'

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
  publishedPhone: v.optional(v.string()),
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
  v.literal('claim_rate_limited'),
  v.literal('claim_operation_conflict')
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
  code: v.union(v.literal('claim_created'), v.literal('claim_replayed')),
  owner: ownerResult,
  business: businessResult,
  claim: claimResult,
  context: contextResult,
})

const suppressionAuditSummary = v.object({
  eventType: v.union(
    v.literal('business.suppressed'),
    v.literal('business.unsuppressed'),
    v.literal('admin.action_denied')
  ),
  actorRef: v.string(),
  targetRef: v.string(),
  beforeState: v.optional(v.string()),
  afterState: v.optional(v.string()),
  reasonCode: v.optional(v.string()),
})

const suppressionErrorResult = v.object({
  kind: v.literal('error'),
  code: v.union(
    v.literal('business_suppress_csrf_rejected'),
    v.literal('business_suppress_admin_denied'),
    v.literal('business_suppress_not_found'),
    v.literal('business_suppress_invalid_reason'),
    v.literal('business_suppress_missing_evidence'),
    v.literal('business_unsuppress_csrf_rejected'),
    v.literal('business_unsuppress_admin_denied'),
    v.literal('business_unsuppress_not_found'),
    v.literal('business_unsuppress_invalid_reason'),
    v.literal('business_unsuppress_missing_evidence')
  ),
  retryable: v.boolean(),
  reason: v.string(),
  auditEvent: v.optional(suppressionAuditSummary),
})

const suppressionOkResult = v.object({
  kind: v.literal('ok'),
  code: v.union(
    v.literal('business_suppressed'),
    v.literal('business_suppression_replayed'),
    v.literal('business_unsuppressed'),
    v.literal('business_unsuppression_replayed')
  ),
  business: businessResult,
  auditEvent: suppressionAuditSummary,
})

const suppressionResult = v.union(suppressionOkResult, suppressionErrorResult)

export const claimBusiness = mutationGeneric({
  args: {
    name: v.string(),
    category: v.string(),
    suburb: v.string(),
    stateTerritory: v.string(),
    requestedSlug: v.string(),
    publishedPhone: v.optional(v.string()),
    ownerMessage: v.optional(v.string()),
    sourceRefs: v.array(sourceRefArg),
    csrfToken: v.optional(v.string()),
    csrfCookie: v.optional(v.string()),
    origin: v.optional(v.string()),
    ...sourceWriteArgs,
    operationKey: v.string(),
    correlationId: v.string(),
  },
  returns: v.union(claimOkResult, claimErrorResult),
  handler: async (ctx, args) => {
    const sourceWrite = await requireSourceWrite(ctx, args, 'owner_claim')
    if (sourceWrite.kind === 'rejected') {
      return claimError('claim_csrf_rejected', sourceWrite.reason)
    }

    const actor = await resolveBusinessActor(ctx, args)
    if (actor.kind !== 'authenticated_owner') {
      return claimError('claim_unauthenticated', 'Authentication is required to claim a business.')
    }

    const db = runtimeWriter(ctx.db)
    const rateLimited = await incrementClaimRateLimit({ db }, actor.clerkUserId, Date.now())
    if (rateLimited !== undefined) {
      return rateLimited
    }
    return claimBusinessCommand(db, {
      actor,
      facts: args,
      operationKey: args.operationKey,
      correlationId: args.correlationId,
    }, Date.now())
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
    ...sourceWriteArgs,
    operationKey: v.string(),
    correlationId: v.string(),
  },
  returns: suppressionResult,
  handler: async (ctx, args) => runVisibilityChange(ctx, 'suppress', args),
})

export const unsuppressBusiness = mutationGeneric({
  args: {
    businessId: v.string(),
    reasonCode: v.string(),
    evidenceRefs: v.array(v.string()),
    csrfToken: v.optional(v.string()),
    csrfCookie: v.optional(v.string()),
    origin: v.optional(v.string()),
    ...sourceWriteArgs,
    operationKey: v.string(),
    correlationId: v.string(),
  },
  returns: suppressionResult,
  handler: async (ctx, args) => runVisibilityChange(ctx, 'unsuppress', args),
})

type VisibilityMutationArgs = {
  businessId: string
  reasonCode: string
  evidenceRefs: string[]
  csrfToken?: string
  csrfCookie?: string
  origin?: string
  sourceWrite?: SourceWriteArgs['sourceWrite']
  operationKey: string
  correlationId: string
}

type VisibilityMutationCtx = {
  db: object
  auth: {
    getUserIdentity: () => Promise<UserIdentity | null>
  }
}

async function runVisibilityChange(
  ctx: VisibilityMutationCtx,
  mode: 'suppress' | 'unsuppress',
  args: VisibilityMutationArgs
) {
  const sourceWrite = await requireSourceWrite(ctx, args, 'admin_operator')
  if (sourceWrite.kind === 'rejected') {
    return {
      kind: 'error' as const,
      code: mode === 'suppress' ? 'business_suppress_csrf_rejected' as const : 'business_unsuppress_csrf_rejected' as const,
      retryable: false,
      reason: sourceWrite.reason,
    }
  }

  const db = runtimeDb(ctx.db)
  const [source, adminMembership] = await Promise.all([
    loadPhaseOneSourceState(db),
    readCurrentActiveMembership(ctx),
  ])
  const authority = requireAdminAuthority(adminMembership, 'change_public_visibility')
  if (authority.kind === 'denied') {
    const denied = recordAdminActionDenied(adminAuthorityState(source), {
      actorMembership: adminMembership,
      action: 'change_public_visibility',
      targetType: 'business',
      targetRef: args.businessId,
      reasonCode: authority.reason,
      evidenceRefs: args.evidenceRefs,
      operationKey: args.operationKey,
      correlationId: args.correlationId,
      now: Date.now(),
    })
    await persistPhaseOneSourceState(db, source)
    return {
      kind: 'error' as const,
      code: mode === 'suppress' ? 'business_suppress_admin_denied' as const : 'business_unsuppress_admin_denied' as const,
      retryable: false,
      reason: authority.reason,
      auditEvent: summarizeSuppressionAudit(denied.auditEvent),
    }
  }

  const state = businessSuppressionState(source)
  const activeSuppressionRule =
    mode === 'unsuppress'
      ? source.security.suppressionRules.find(
          (rule) =>
            stringRecordField(rule, 'targetType') === 'business' &&
            stringRecordField(rule, 'targetRef') === args.businessId &&
            stringRecordField(rule, 'status') === 'active'
        )
      : undefined
  const businessId = brandNonEmpty(args.businessId, 'BusinessId')
  const operationKey = brandNonEmpty(args.operationKey, 'OperationKey')
  const correlationId = brandNonEmpty(args.correlationId, 'CorrelationId')
  const command = {
    adminMembership,
    businessId,
    security: {
      csrf: sourceWrite.csrf,
    },
    reasonCode: args.reasonCode,
    evidenceRefs: args.evidenceRefs,
    operationKey,
    correlationId,
    now: Date.now(),
  }
  const result =
    mode === 'suppress'
      ? suppressBusinessModule(state, command)
      : unsuppressBusinessModule(state, command)

  if (mode === 'unsuppress' && result.kind === 'ok' && activeSuppressionRule !== undefined) {
    await patchLiftedSuppressionRule(db, activeSuppressionRule)
    source.security.suppressionRules = source.security.suppressionRules.filter((rule) => rule !== activeSuppressionRule)
  }
  await persistPhaseOneSourceState(db, source)
  return summarizeVisibilityResult(result)
}

function businessSuppressionState(source: Awaited<ReturnType<typeof loadPhaseOneSourceState>>): BusinessSuppressionState {
  return {
    owners: source.business.owners as BusinessSuppressionState['owners'],
    businesses: source.business.businesses as BusinessSuppressionState['businesses'],
    businessContexts: source.business.businessContexts as BusinessSuppressionState['businessContexts'],
    claims: source.business.claims as BusinessSuppressionState['claims'],
    claimFingerprints: source.business.claimFingerprints as BusinessSuppressionState['claimFingerprints'],
    abuseRateLimitBuckets: source.business.abuseRateLimitBuckets as BusinessSuppressionState['abuseRateLimitBuckets'],
    businessServices: source.catalog.businessServices as BusinessSuppressionState['businessServices'],
    suppressionRules: source.security.suppressionRules as BusinessSuppressionState['suppressionRules'],
    auditEvents: source.observability.auditEvents as AuditEventContract[],
    invalidationIntents: [],
  }
}

function adminAuthorityState(source: Awaited<ReturnType<typeof loadPhaseOneSourceState>>): AdminAuthorityState {
  return {
    adminMemberships: source.security.adminMemberships as AdminMembership[],
    adminMembershipAuditEvents: source.security.adminMembershipAuditEvents as AdminDecisionAudit[],
    auditEvents: source.observability.auditEvents as AuditEventContract[],
  }
}

async function readCurrentActiveMembership(ctx: VisibilityMutationCtx): Promise<AdminMembership | undefined> {
  const identity = await ctx.auth.getUserIdentity()
  return identity === null ? undefined : readActiveAdminMembership(runtimeDb(ctx.db), identity)
}

function summarizeVisibilityResult(
  result: ReturnType<typeof suppressBusinessModule> | ReturnType<typeof unsuppressBusinessModule>
) {
  if (result.kind === 'error') {
    return result
  }

  return {
    kind: 'ok' as const,
    code: result.code,
    business: result.business,
    auditEvent: summarizeSuppressionAudit(result.auditEvent),
  }
}

function summarizeSuppressionAudit(event: AuditEventContract) {
  return {
    eventType: event.eventType as 'business.suppressed' | 'business.unsuppressed' | 'admin.action_denied',
    actorRef: event.actorRef,
    targetRef: event.targetRef,
    ...(event.beforeState === undefined ? {} : { beforeState: event.beforeState }),
    ...(event.afterState === undefined ? {} : { afterState: event.afterState }),
    ...(event.reasonCode === undefined ? {} : { reasonCode: event.reasonCode }),
  }
}

async function patchLiftedSuppressionRule(db: ReturnType<typeof runtimeDb>, rule: Record<string, unknown>): Promise<void> {
  const existing = await db
    .query('suppressionRules')
    .withIndex('by_target_status', (query) =>
      query
        .eq('targetType', stringRecordField(rule, 'targetType'))
        .eq('targetRef', stringRecordField(rule, 'targetRef'))
        .eq('status', 'active')
    )
    .unique()
  if (existing === null) {
    return
  }

  await db.patch(existing._id, { ...rule })
}

function stringRecordField(record: Record<string, unknown>, field: string): string {
  const value = record[field]
  return typeof value === 'string' ? value : ''
}

type ClaimBusinessArgs = {
  name: string
  category: string
  suburb: string
  stateTerritory: string
  requestedSlug: string
  publishedPhone?: string
  ownerMessage?: string
  photos?: readonly { url: string; alt: string }[]
  responseTimeMinutes?: number
  sourceRefs: readonly { label: string; evidenceRef: string; sourceHash?: string }[]
}

type NormalizedClaimFacts =
  | {
      kind: 'valid'
      name: string
      category: string
      suburb: string
      stateTerritory: string
      publishedPhone?: string
      slug: string
      ownerMessage?: string
      photos?: readonly { url: string; alt: string }[]
      responseTimeMinutes?: number
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

export async function claimBusinessCommand(
  db: RuntimeWriter,
  command: {
    actor: AuthenticatedOwnerActor
    facts: ClaimBusinessArgs
    operationKey: string
    correlationId: string
  },
  now: number,
) {
  const normalized = normalizeClaimFacts(command.facts)
  if (normalized.kind === 'invalid') {
    return claimError('claim_invalid_facts', normalized.reason)
  }
  const sourceHash = stableHash({
    category: normalized.category,
    name: normalized.name,
    slug: normalized.slug,
    sourceRefs: normalized.sourceRefs,
    stateTerritory: normalized.stateTerritory,
    publishedPhone: normalized.publishedPhone ?? null,
    suburb: normalized.suburb,
  })

  const existingOwner = await db
    .query('owners')
    .withIndex('by_clerkUserId', (query) => query.eq('clerkUserId', command.actor.clerkUserId))
    .unique()
  if (existingOwner !== null) {
    const owner = ownerContractFromDocument(existingOwner)
    const requestHash = stableHash({ actorRef: owner.ownerId, facts: normalized })
    const existingOperation = await db
      .query('operationKeys')
      .withIndex('by_actor_operation_key', (query) =>
        query.eq('actorRef', owner.ownerId).eq('operationName', 'claimBusiness').eq('key', command.operationKey)
      )
      .unique()
    if (existingOperation !== null) {
      if (
        documentString(existingOperation, 'requestHash') !== requestHash
        || documentString(existingOperation, 'status') !== 'succeeded'
      ) {
        return claimError('claim_operation_conflict', 'Operation key is already reserved for a different claim request.')
      }
      const [businessId, claimId] = documentStringArray(existingOperation, 'effectRefs')
      if (businessId === undefined || claimId === undefined) {
        return claimError('claim_operation_conflict', 'Claim operation readback is incomplete.')
      }
      const [business, claim, context] = await Promise.all([
        db.get(businessId),
        db.get(claimId),
        db.query('businessContexts').withIndex('by_business', (query) => query.eq('businessId', businessId)).unique(),
      ])
      if (
        business === null
        || claim === null
        || context === null
        || documentString(business, 'ownerId') !== owner.ownerId
        || documentString(business, 'slug') !== normalized.slug
        || documentString(business, 'sourceHash') !== sourceHash
        || documentString(claim, 'ownerId') !== owner.ownerId
        || documentString(claim, 'businessId') !== businessId
        || documentString(claim, 'slug') !== normalized.slug
        || documentString(claim, 'submittedFactsHash') !== sourceHash
        || documentString(context, 'businessId') !== businessId
        || documentString(context, 'sourceHash') !== sourceHash
        || documentString(existingOperation, 'sourceHash') !== sourceHash
        || documentString(existingOperation, 'resultHash') !== claimReceiptHash(businessId, claimId, business, claim, context)
      ) {
        return claimError('claim_operation_conflict', 'Claim operation readback is incomplete.')
      }
      return claimCommandResult('claim_replayed', owner, businessId, claimId, business, claim, context)
    }
  }

  const owner = await findOrCreateOwner({ db }, command.actor, now)
  const requestHash = stableHash({ actorRef: owner.ownerId, facts: normalized })

  const existingBusiness = await db
    .query('businesses')
    .withIndex('by_slug', (query) => query.eq('slug', normalized.slug))
    .unique()
  if (existingBusiness !== null) {
    return claimError('claim_slug_conflict', 'A business already owns this public slug.')
  }

  const fingerprint = normalizeClaimFingerprint({
    name: normalized.name,
    category: normalized.category,
    suburb: normalized.suburb,
    stateTerritory: normalized.stateTerritory,
  })
  const existingFingerprints = await db
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
    const claimId = await db.insert('claims', {
      ownerId: owner.ownerId,
      slug: normalized.slug,
      status: 'contested',
      submittedFactsHash: contestedHash,
      createdAt: now,
      updatedAt: now,
    })
    await db.insert('claimFingerprints', {
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

  const operationId = await db.insert('operationKeys', {
    scope: 'business_claim',
    actorKind: 'owner',
    actorRef: owner.ownerId,
    operationName: 'claimBusiness',
    key: command.operationKey,
    requestHash,
    sourceHash,
    status: 'in_progress',
    effectRefs: [],
    createdAt: now,
    updatedAt: now,
  })
  const businessDocument = {
    ownerId: owner.ownerId,
    slug: normalized.slug,
    name: normalized.name,
    normalizedName: normalized.name.toLowerCase(),
    category: normalized.category,
    suburb: normalized.suburb,
    stateTerritory: normalized.stateTerritory,
    ...(normalized.publishedPhone === undefined ? {} : { publishedPhone: normalized.publishedPhone }),
    publicStatus: 'unpublished',
    trustTier: 'claimed',
    claimStatus: 'authenticated',
    sourceHash,
    createdAt: now,
    updatedAt: now,
  }
  const businessId = await db.insert('businesses', businessDocument)
  const contextDocument = {
    businessId,
    category: normalized.category,
    suburb: normalized.suburb,
    stateTerritory: normalized.stateTerritory,
    ...(normalized.ownerMessage === undefined ? {} : { ownerMessage: normalized.ownerMessage }),
    ...(normalized.photos === undefined || normalized.photos.length === 0 ? {} : { photos: normalized.photos }),
    ...(normalized.responseTimeMinutes === undefined ? {} : { responseTimeMinutes: normalized.responseTimeMinutes }),
    sourceRefs: normalized.sourceRefs,
    sourceHash,
    approvedAt: now,
  }
  await db.insert('businessContexts', contextDocument)
  const claimDocument = {
    ownerId: owner.ownerId,
    businessId,
    slug: normalized.slug,
    status: 'authenticated',
    submittedFactsHash: sourceHash,
    createdAt: now,
    updatedAt: now,
  }
  const claimId = await db.insert('claims', claimDocument)
  await db.insert('claimFingerprints', {
    fingerprint,
    status: 'clear',
    businessSlug: normalized.slug,
    ownerRef: owner.ownerId,
    claimId,
    createdAt: now,
    updatedAt: now,
  })
  await db.patch(operationId, {
    status: 'succeeded',
    resultHash: claimReceiptHash(businessId, claimId, businessDocument, claimDocument, contextDocument),
    effectRefs: [businessId, claimId],
    updatedAt: now,
  })

  return claimCommandResult('claim_created', owner, businessId, claimId, businessDocument, claimDocument, contextDocument)
}

function claimCommandResult(
  code: 'claim_created' | 'claim_replayed',
  owner: OwnerContract,
  businessId: string,
  claimId: string,
  business: Record<string, unknown>,
  claim: Record<string, unknown>,
  context: Record<string, unknown>,
) {
  return {
    kind: 'ok' as const,
    code,
    owner,
    business: {
      businessId,
      ownerId: documentString(business, 'ownerId'),
      slug: documentString(business, 'slug'),
      name: documentString(business, 'name'),
      normalizedName: documentString(business, 'normalizedName'),
      category: documentString(business, 'category'),
      suburb: documentString(business, 'suburb'),
      stateTerritory: documentString(business, 'stateTerritory'),
      ...(documentOptionalString(business, 'publishedPhone') === undefined ? {} : { publishedPhone: documentString(business, 'publishedPhone') }),
      publicStatus: documentString(business, 'publicStatus') as 'unpublished' | 'published' | 'suppressed',
      trustTier: documentString(business, 'trustTier') as 'claimed' | 'contact_confirmed' | 'listed' | 'registry_verified',
      claimStatus: documentString(business, 'claimStatus') as 'draft' | 'authenticated' | 'published' | 'contested' | 'disputed' | 'suppressed',
      sourceHash: documentString(business, 'sourceHash'),
      createdAt: documentNumber(business, 'createdAt'),
      updatedAt: documentNumber(business, 'updatedAt'),
    },
    claim: {
      claimId,
      ownerId: documentString(claim, 'ownerId'),
      businessId,
      slug: documentString(claim, 'slug'),
      status: documentString(claim, 'status') as 'authenticated',
      submittedFactsHash: documentString(claim, 'submittedFactsHash'),
      createdAt: documentNumber(claim, 'createdAt'),
      updatedAt: documentNumber(claim, 'updatedAt'),
    },
    context: {
      businessId,
      category: documentString(context, 'category'),
      suburb: documentString(context, 'suburb'),
      stateTerritory: documentString(context, 'stateTerritory'),
      ...(documentOptionalString(context, 'ownerMessage') === undefined ? {} : { ownerMessage: documentString(context, 'ownerMessage') }),
      sourceRefs: Array.isArray(context.sourceRefs) ? context.sourceRefs : [],
      sourceHash: documentString(context, 'sourceHash'),
      approvedAt: documentNumber(context, 'approvedAt'),
    },
  }
}

function claimReceiptHash(
  businessId: string,
  claimId: string,
  business: Record<string, unknown>,
  claim: Record<string, unknown>,
  context: Record<string, unknown>,
): string {
  return stableHash({
    business: {
      businessId,
      ownerId: documentString(business, 'ownerId'),
      slug: documentString(business, 'slug'),
      name: documentString(business, 'name'),
      normalizedName: documentString(business, 'normalizedName'),
      category: documentString(business, 'category'),
      suburb: documentString(business, 'suburb'),
      stateTerritory: documentString(business, 'stateTerritory'),
      publishedPhone: documentOptionalString(business, 'publishedPhone') ?? '',
      sourceHash: documentString(business, 'sourceHash'),
      createdAt: documentNumber(business, 'createdAt'),
    },
    claim: {
      claimId,
      ownerId: documentString(claim, 'ownerId'),
      businessId: documentString(claim, 'businessId'),
      slug: documentString(claim, 'slug'),
      submittedFactsHash: documentString(claim, 'submittedFactsHash'),
      createdAt: documentNumber(claim, 'createdAt'),
    },
    context: {
      businessId: documentString(context, 'businessId'),
      category: documentString(context, 'category'),
      suburb: documentString(context, 'suburb'),
      stateTerritory: documentString(context, 'stateTerritory'),
      ownerMessage: documentOptionalString(context, 'ownerMessage') ?? '',
      sourceRefs: documentSourceRefs(context),
      sourceHash: documentString(context, 'sourceHash'),
      approvedAt: documentNumber(context, 'approvedAt'),
    },
  })
}

function documentSourceRefs(document: Record<string, unknown>): { label: string; evidenceRef: string; sourceHash: string }[] {
  return Array.isArray(document.sourceRefs)
    ? document.sourceRefs.map((sourceRef) => {
        const record = typeof sourceRef === 'object' && sourceRef !== null ? sourceRef as Record<string, unknown> : {}
        return {
          label: documentString(record, 'label'),
          evidenceRef: documentString(record, 'evidenceRef'),
          sourceHash: documentString(record, 'sourceHash'),
        }
      })
    : []
}

function documentString(document: Record<string, unknown>, field: string): string {
  return typeof document[field] === 'string' ? document[field] : ''
}

function ownerContractFromDocument(owner: RuntimeDocument): OwnerContract {
  return {
    ownerId: String(owner._id),
    clerkUserId: documentString(owner, 'clerkUserId'),
    ...(documentOptionalString(owner, 'displayName') === undefined ? {} : { displayName: documentString(owner, 'displayName') }),
    ...(documentOptionalString(owner, 'emailHash') === undefined ? {} : { emailHash: documentString(owner, 'emailHash') }),
    createdAt: documentNumber(owner, 'createdAt'),
    updatedAt: documentNumber(owner, 'updatedAt'),
  }
}

function documentOptionalString(document: Record<string, unknown>, field: string): string | undefined {
  const value = document[field]
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function documentNumber(document: Record<string, unknown>, field: string): number {
  return typeof document[field] === 'number' ? document[field] : 0
}

function documentStringArray(document: Record<string, unknown>, field: string): string[] {
  const value = document[field]
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []
}

function claimError(
  code:
    | 'claim_unauthenticated'
    | 'claim_invalid_facts'
    | 'claim_slug_conflict'
    | 'claim_duplicate_conflict'
    | 'claim_csrf_rejected'
    | 'claim_rate_limited'
    | 'claim_operation_conflict',
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
  const publishedPhoneValidation = validateOwnerPublishedPhone(args.publishedPhone)
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

  if (publishedPhoneValidation.kind === 'invalid') {
    return { kind: 'invalid', reason: 'Published phone must be a valid Australian phone number.' }
  }

  const base = {
    kind: 'valid' as const,
    name,
    category,
    suburb,
    stateTerritory,
    slug,
    sourceRefs,
    ...(publishedPhoneValidation.kind === 'valid' ? { publishedPhone: publishedPhoneValidation.value } : {}),
    ...(args.photos === undefined || args.photos.length === 0 ? {} : { photos: args.photos }),
    ...(args.responseTimeMinutes === undefined ? {} : { responseTimeMinutes: args.responseTimeMinutes }),
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
    const metadataPatch = {
      ...(displayName === undefined || displayName === documentOptionalString(existing, 'displayName') ? {} : { displayName }),
      ...(emailHash === undefined || emailHash === documentOptionalString(existing, 'emailHash') ? {} : { emailHash }),
    }
    const metadataChanged = Object.keys(metadataPatch).length > 0
    if (metadataChanged) {
      await db.patch(ownerId, { ...metadataPatch, updatedAt: now })
    }
    return {
      ownerId,
      clerkUserId: actor.clerkUserId,
      ...(documentOptionalString(existing, 'displayName') === undefined && displayName === undefined
        ? {}
        : { displayName: displayName ?? documentString(existing, 'displayName') }),
      ...(documentOptionalString(existing, 'emailHash') === undefined && emailHash === undefined
        ? {}
        : { emailHash: emailHash ?? documentString(existing, 'emailHash') }),
      createdAt: typeof existing.createdAt === 'number' ? existing.createdAt : now,
      updatedAt: metadataChanged ? now : documentNumber(existing, 'updatedAt'),
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
