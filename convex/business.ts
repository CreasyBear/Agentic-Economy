import type { GenericDatabaseWriter, UserIdentity } from 'convex/server'
import { mutationGeneric } from 'convex/server'
import { v } from 'convex/values'

import { readCurrentActiveAdminMembership as readCurrentActiveMembership, resolveBusinessActor } from './authz'
import { assertAdmission } from './lib/rateLimit'
import { requireSourceWrite, sourceWriteArgs, type SourceWriteArgs } from './sourceWriteAdmission'
import {
  brandNonEmpty,
  type BusinessId,
  type OwnerId,
} from '../src/modules/common/ids'
import { normalizeSlug } from '../src/modules/common/normalize-slug'
import { canonicalDigest } from '../src/modules/common/canonical-digest'
import {
  ClaimStatusValues,
  PublicStatusValues,
  TrustTierValues,
  VisibilityTargetTypeValues,
  suppressBusiness as suppressBusinessModule,
  unsuppressBusiness as unsuppressBusinessModule,
  validateOwnerPublishedPhone,
} from '../src/modules/business/public'
import type { BusinessMutationActor, BusinessRecord, BusinessSuppressionState } from '../src/modules/business/public'
import {
  ActorKindValues,
  AuditEventTypeValues,
  AuditTargetTypeValues,
} from '../src/modules/observability/public'
import type { AuditEventContract, RedactedPayload } from '../src/modules/observability/public'
import {
  AdminMembershipAuditEventTypeValues,
  SuppressionRuleStatusValues,
  normalizeClaimFingerprint,
  recordAdminActionDenied,
  requireAdminAuthority,
  type AdminAuthorityState,
  type AdminDecisionAudit,
  type SuppressionRuleRecord,
} from '../src/modules/security/public'
import type { DataModel, Doc, Id, TableNames } from './_generated/dataModel'

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

    const admission = await assertAdmission(ctx, {
      name: 'public-mutation',
      key: `owner:${actor.clerkUserId}`,
    })
    if (!admission.ok) {
      return claimError('claim_rate_limited', `Retry after ${admission.retryAfter}.`, true)
    }

    return claimBusinessCommand(ctx.db, {
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
  db: GenericDatabaseWriter<DataModel>
  auth: {
    getUserIdentity: () => Promise<UserIdentity | null>
  }
}

type BusinessVisibilitySourceState = {
  businesses: Array<Doc<'businesses'> & { businessId: Id<'businesses'> }>
  suppressionRules: Doc<'suppressionRules'>[]
  auditEvents: Doc<'auditEvents'>[]
  adminMembershipAuditEvents: Doc<'adminMembershipAuditEvents'>[]
}
type VisibilityPersistState = {
  businesses: BusinessRecord[]
  suppressionRules: SuppressionRuleRecord[]
  auditEvents: AuditEventContract[]
  adminMembershipAuditEvents: AdminDecisionAudit[]
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

  const businessId = businessIdFromValue(ctx.db, args.businessId)
  const operationKey = brandNonEmpty(args.operationKey, 'OperationKey')
  const correlationId = brandNonEmpty(args.correlationId, 'CorrelationId')
  const auditEventId = `audit:business.${mode === 'suppress' ? 'suppressed' : 'unsuppressed'}:${businessId}:${operationKey}`
  const [source, adminMembership] = await Promise.all([
    loadBusinessVisibilitySource(ctx.db, businessId, auditEventId),
    readCurrentActiveMembership(ctx),
  ])
  const persisted = visibilityPersistStateFromSource(source, ctx.db)
  const before = structuredClone(persisted)
  const authorityState = adminAuthorityState(persisted)
  const authority = requireAdminAuthority(adminMembership, 'change_public_visibility')
  if (authority.kind === 'denied') {
    const denied = recordAdminActionDenied(authorityState, {
      actorMembership: adminMembership,
      action: 'change_public_visibility',
      targetType: 'business',
      targetRef: businessId,
      reasonCode: authority.reason,
      evidenceRefs: args.evidenceRefs,
      operationKey,
      correlationId,
      now: Date.now(),
    })
    await persistVisibilitySourceState(ctx.db, persisted, before)
    return {
      kind: 'error' as const,
      code: mode === 'suppress' ? 'business_suppress_admin_denied' as const : 'business_unsuppress_admin_denied' as const,
      retryable: false,
      reason: authority.reason,
      auditEvent: summarizeSuppressionAudit(denied.auditEvent),
    }
  }

  const state = businessSuppressionState(persisted)
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

  await persistVisibilitySourceState(ctx.db, persisted, before)
  return summarizeVisibilityResult(result)
}

async function loadBusinessVisibilitySource(
  db: GenericDatabaseWriter<DataModel>,
  businessId: Id<'businesses'>,
  auditEventId: string,
): Promise<BusinessVisibilitySourceState> {
  const [business, suppressionRule, auditEvent] = await Promise.all([
    db.get(businessId),
    db.query('suppressionRules')
      .withIndex('by_target_status', (builder) =>
        builder.eq('targetType', 'business').eq('targetRef', businessId).eq('status', 'active')
      )
      .unique(),
    db.query('auditEvents').withIndex('by_eventId', (builder) => builder.eq('eventId', auditEventId)).unique(),
  ])
  return {
    businesses: business === null ? [] : [{ ...business, businessId: business._id }],
    suppressionRules: suppressionRule === null ? [] : [suppressionRule],
    auditEvents: auditEvent === null ? [] : [auditEvent],
    adminMembershipAuditEvents: [],
  }
}

async function persistVisibilitySourceState(
  db: GenericDatabaseWriter<DataModel>,
  source: VisibilityPersistState,
  before: VisibilityPersistState,
): Promise<void> {
  for (const business of source.businesses) {
    const beforeBusiness = before.businesses.find((candidate) => candidate.businessId === business.businessId)
    if (beforeBusiness !== undefined && JSON.stringify(beforeBusiness) === JSON.stringify(business)) {
      continue
    }

    const businessId = businessIdFromValue(db, business.businessId)
    const { businessId: _businessId, ownerId, ...patch } = business
    await db.patch(businessId, { ...patch, ownerId: ownerIdFromValue(db, ownerId) })
  }

  for (const rule of source.suppressionRules) {
    const beforeRule = before.suppressionRules.find(
      (candidate) => candidate.targetType === rule.targetType && candidate.targetRef === rule.targetRef
    )
    if (beforeRule !== undefined && JSON.stringify(beforeRule) === JSON.stringify(rule)) {
      continue
    }

    const existing = await db
      .query('suppressionRules')
      .withIndex('by_target_status', (builder) =>
        builder.eq('targetType', rule.targetType).eq('targetRef', rule.targetRef).eq('status', beforeRule?.status ?? rule.status)
      )
      .unique()
    if (existing === null) {
      await db.insert('suppressionRules', suppressionRuleDocument(rule))
    } else {
      await db.patch(existing._id, suppressionRuleDocument(rule))
    }
  }

  for (const event of source.auditEvents) {
    const beforeEvent = before.auditEvents.find((candidate) => candidate.eventId === event.eventId)
    if (beforeEvent !== undefined && JSON.stringify(beforeEvent) === JSON.stringify(event)) {
      continue
    }

    const existing = await db
      .query('auditEvents')
      .withIndex('by_eventId', (builder) => builder.eq('eventId', event.eventId))
      .unique()
    if (existing === null) {
      await db.insert('auditEvents', auditEventDocument(event, db))
    }
  }

  for (const membershipAudit of source.adminMembershipAuditEvents) {
    const existing = await db
      .query('adminMembershipAuditEvents')
      .withIndex('by_auditEventId', (builder) => builder.eq('auditEventId', membershipAudit.auditEventId))
      .unique()
    if (existing === null) {
      await db.insert('adminMembershipAuditEvents', adminMembershipAuditDocument(membershipAudit))
    }
  }
}

function businessSuppressionState(source: VisibilityPersistState): BusinessSuppressionState {
  return {
    owners: [],
    businesses: source.businesses,
    businessContexts: [],
    claims: [],
    claimFingerprints: [],
    suppressionRules: source.suppressionRules,
    auditEvents: source.auditEvents,
    invalidationIntents: [],
  }
}

function adminAuthorityState(source: VisibilityPersistState): AdminAuthorityState {
  return {
    adminMemberships: [],
    adminMembershipAuditEvents: source.adminMembershipAuditEvents,
    auditEvents: source.auditEvents,
  }
}



function visibilityPersistStateFromSource(
  source: BusinessVisibilitySourceState,
  db: GenericDatabaseWriter<DataModel>,
): VisibilityPersistState {
  return {
    businesses: source.businesses.map((row) => businessRecordFromSource(row, db)),
    suppressionRules: source.suppressionRules.map((row) => suppressionRuleFromSource(row)),
    auditEvents: source.auditEvents.map((row) => auditEventFromSource(row, db)),
    adminMembershipAuditEvents: source.adminMembershipAuditEvents.map((row) => adminMembershipAuditFromSource(row)),
  }
}

function businessRecordFromSource(
  row: BusinessVisibilitySourceState['businesses'][number],
  db: GenericDatabaseWriter<DataModel>,
): BusinessRecord {
  const publishedPhone = readOptionalString(row.publishedPhone)
  const suppressedAt = readOptionalNumber(row.suppressedAt)
  return {
    businessId: businessIdFromValue(db, row.businessId),
    ownerId: ownerIdFromValue(db, row.ownerId),
    slug: brandNonEmpty(readString(row.slug, 'business slug'), 'Slug'),
    name: readString(row.name, 'business name'),
    normalizedName: readString(row.normalizedName, 'business normalized name'),
    category: readString(row.category, 'business category'),
    suburb: readString(row.suburb, 'business suburb'),
    stateTerritory: readString(row.stateTerritory, 'business state/territory'),
    ...(publishedPhone === undefined ? {} : { publishedPhone }),
    publicStatus: readEnum(row.publicStatus, PublicStatusValues, 'business public status'),
    trustTier: readEnum(row.trustTier, TrustTierValues, 'business trust tier'),
    claimStatus: readEnum(row.claimStatus, ClaimStatusValues, 'business claim status'),
    sourceHash: brandNonEmpty(readString(row.sourceHash, 'business source hash'), 'SourceHash'),
    createdAt: readNumber(row.createdAt, 'business createdAt'),
    updatedAt: readNumber(row.updatedAt, 'business updatedAt'),
    ...(suppressedAt === undefined ? {} : { suppressedAt }),
  }
}

function suppressionRuleFromSource(
  row: BusinessVisibilitySourceState['suppressionRules'][number],
): SuppressionRuleRecord {
  const liftedByAdminRef = readOptionalString(row.liftedByAdminRef)
  const liftedReasonCode = readOptionalString(row.liftedReasonCode)
  const liftedEvidenceRefs = row.liftedEvidenceRefs === undefined
    ? undefined
    : readStringArray(row.liftedEvidenceRefs, 'lifted suppression evidence')
  const liftedAt = readOptionalNumber(row.liftedAt)
  return {
    targetType: readEnum(row.targetType, VisibilityTargetTypeValues, 'suppression target type'),
    targetRef: readString(row.targetRef, 'suppression target ref'),
    status: readEnum(row.status, SuppressionRuleStatusValues, 'suppression status'),
    reasonCode: readString(row.reasonCode, 'suppression reason'),
    evidenceRefs: readStringArray(row.evidenceRefs, 'suppression evidence'),
    createdByAdminRef: readString(row.createdByAdminRef, 'suppression creator'),
    createdAt: readNumber(row.createdAt, 'suppression createdAt'),
    beforePublicStatus: readEnum(row.beforePublicStatus, PublicStatusValues, 'suppression before public status'),
    beforeClaimStatus: readEnum(row.beforeClaimStatus, ClaimStatusValues, 'suppression before claim status'),
    ...(liftedByAdminRef === undefined ? {} : { liftedByAdminRef }),
    ...(liftedEvidenceRefs === undefined ? {} : { liftedEvidenceRefs }),
    ...(liftedAt === undefined ? {} : { liftedAt }),
  }
}

function auditEventFromSource(
  row: BusinessVisibilitySourceState['auditEvents'][number],
  db: GenericDatabaseWriter<DataModel>,
): AuditEventContract {
  const businessId = row.businessId === undefined ? undefined : businessIdFromValue(db, row.businessId)
  const beforeState = readOptionalString(row.beforeState)
  const afterState = readOptionalString(row.afterState)
  const reasonCode = readOptionalString(row.reasonCode)
  const failureCode = readOptionalString(row.failureCode)
  return {
    eventId: brandNonEmpty(readString(row.eventId, 'audit event id'), 'AuditEventId'),
    eventType: readEnum(row.eventType, AuditEventTypeValues, 'audit event type'),
    actorKind: readEnum(row.actorKind, ActorKindValues, 'audit actor kind'),
    actorRef: readString(row.actorRef, 'audit actor ref'),
    targetType: readEnum(row.targetType, AuditTargetTypeValues, 'audit target type'),
    targetRef: readString(row.targetRef, 'audit target ref'),
    idempotencyKey: brandNonEmpty(readString(row.idempotencyKey, 'audit idempotency key'), 'OperationKey'),
    correlationId: brandNonEmpty(readString(row.correlationId, 'audit correlation id'), 'CorrelationId'),
    evidenceRefs: readStringArray(row.evidenceRefs, 'audit evidence'),
    redactedPayload: redactedPayloadFromSource(JSON.parse(row.redactedPayloadJson)),
    payloadHash: brandNonEmpty(readString(row.payloadHash, 'audit payload hash'), 'SourceHash'),
    createdAt: readNumber(row.createdAt, 'audit createdAt'),
    ...(businessId === undefined ? {} : { businessId }),
    ...(beforeState === undefined ? {} : { beforeState }),
    ...(afterState === undefined ? {} : { afterState }),
    ...(reasonCode === undefined ? {} : { reasonCode }),
    ...(failureCode === undefined ? {} : { failureCode }),
  }
}

function adminMembershipAuditFromSource(
  row: BusinessVisibilitySourceState['adminMembershipAuditEvents'][number],
): AdminDecisionAudit {
  return {
    auditEventId: brandNonEmpty(readString(row.auditEventId, 'membership audit id'), 'AuditEventId'),
    eventType: readEnum(row.eventType, AdminMembershipAuditEventTypeValues, 'membership audit event type'),
    actorRef: readString(row.actorRef, 'membership audit actor ref'),
    targetRef: readString(row.targetRef, 'membership audit target ref'),
    reasonCode: readString(row.reasonCode, 'membership audit reason'),
    evidenceRefs: readStringArray(row.evidenceRefs, 'membership audit evidence'),
    operationKey: brandNonEmpty(readString(row.operationKey, 'membership audit operation key'), 'OperationKey'),
    correlationId: brandNonEmpty(readString(row.correlationId, 'membership audit correlation id'), 'CorrelationId'),
    createdAt: readNumber(row.createdAt, 'membership audit createdAt'),
  }
}
function suppressionRuleDocument(rule: SuppressionRuleRecord): Omit<Doc<'suppressionRules'>, '_id' | '_creationTime'> {
  return {
    targetType: rule.targetType,
    targetRef: rule.targetRef,
    status: rule.status,
    reasonCode: rule.reasonCode,
    evidenceRefs: [...rule.evidenceRefs],
    createdByAdminRef: rule.createdByAdminRef,
    createdAt: rule.createdAt,
    beforePublicStatus: rule.beforePublicStatus,
    beforeClaimStatus: rule.beforeClaimStatus,
    ...(rule.liftedByAdminRef === undefined ? {} : { liftedByAdminRef: rule.liftedByAdminRef }),
    ...(rule.liftedReasonCode === undefined ? {} : { liftedReasonCode: rule.liftedReasonCode }),
    ...(rule.liftedEvidenceRefs === undefined ? {} : { liftedEvidenceRefs: [...rule.liftedEvidenceRefs] }),
    ...(rule.liftedAt === undefined ? {} : { liftedAt: rule.liftedAt }),
  }
}
function auditEventDocument(
  event: AuditEventContract,
  db: GenericDatabaseWriter<DataModel>,
): Omit<Doc<'auditEvents'>, '_id' | '_creationTime'> {
  return {
    eventId: event.eventId,
    eventType: event.eventType,
    actorKind: event.actorKind,
    actorRef: event.actorRef,
    targetType: event.targetType,
    targetRef: event.targetRef,
    idempotencyKey: event.idempotencyKey,
    correlationId: event.correlationId,
    evidenceRefs: [...event.evidenceRefs],
    redactedPayloadJson: JSON.stringify(event.redactedPayload),
    payloadHash: event.payloadHash,
    createdAt: event.createdAt,
    ...(event.businessId === undefined ? {} : { businessId: businessIdFromValue(db, event.businessId) }),
    ...(event.beforeState === undefined ? {} : { beforeState: event.beforeState }),
    ...(event.afterState === undefined ? {} : { afterState: event.afterState }),
    ...(event.reasonCode === undefined ? {} : { reasonCode: event.reasonCode }),
    ...(event.failureCode === undefined ? {} : { failureCode: event.failureCode }),
  }
}

function adminMembershipAuditDocument(
  audit: AdminDecisionAudit,
): Omit<Doc<'adminMembershipAuditEvents'>, '_id' | '_creationTime'> {
  return {
    auditEventId: audit.auditEventId,
    eventType: audit.eventType,
    actorRef: audit.actorRef,
    targetRef: audit.targetRef,
    reasonCode: audit.reasonCode,
    evidenceRefs: [...audit.evidenceRefs],
    operationKey: audit.operationKey,
    correlationId: audit.correlationId,
    createdAt: audit.createdAt,
  }
}

function requireNativeId<TableName extends TableNames>(
  db: GenericDatabaseWriter<DataModel>,
  tableName: TableName,
  value: unknown,
  label: string,
): Id<TableName> {
  const id = db.normalizeId(tableName, readString(value, label))
  if (id === null) {
    throw new Error(`Invalid ${label}.`)
  }
  return id
}

function businessIdFromValue(
  db: GenericDatabaseWriter<DataModel>,
  value: unknown,
): Id<'businesses'> & BusinessId {
  const id = requireNativeId(db, 'businesses', value, 'business id')
  return brandNonEmpty<Id<'businesses'>, 'BusinessId'>(id, 'BusinessId')
}

function ownerIdFromValue(
  db: GenericDatabaseWriter<DataModel>,
  value: unknown,
): Id<'owners'> & OwnerId {
  const id = requireNativeId(db, 'owners', value, 'owner id')
  return brandNonEmpty<Id<'owners'>, 'OwnerId'>(id, 'OwnerId')
}

function readString(value: unknown, label: string): string {
  if (typeof value !== 'string') {
    throw new Error(`Invalid ${label}.`)
  }
  return value
}

function readOptionalString(value: unknown): string | undefined {
  return value === undefined ? undefined : readString(value, 'optional string')
}

function readNumber(value: unknown, label: string): number {
  if (typeof value !== 'number') {
    throw new Error(`Invalid ${label}.`)
  }
  return value
}

function readOptionalNumber(value: unknown): number | undefined {
  return value === undefined ? undefined : readNumber(value, 'optional number')
}

function readStringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((candidate) => typeof candidate !== 'string')) {
    throw new Error(`Invalid ${label}.`)
  }
  return value
}

function isOneOf<T extends string>(value: unknown, values: readonly T[]): value is T {
  return typeof value === 'string' && values.some((candidate) => candidate === value)
}

function readEnum<T extends string>(value: unknown, values: readonly T[], label: string): T {
  if (!isOneOf(value, values)) {
    throw new Error(`Invalid ${label}.`)
  }
  return value
}

function redactedPayloadFromSource(value: unknown): RedactedPayload {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactedPayloadFromSource(item))
  }
  if (typeof value === 'object') {
    const result: { [key: string]: RedactedPayload } = {}
    for (const [key, item] of Object.entries(value)) {
      result[key] = redactedPayloadFromSource(item)
    }
    return result
  }
  return null
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
  if (event.eventType !== 'business.suppressed' && event.eventType !== 'business.unsuppressed' && event.eventType !== 'admin.action_denied') {
    throw new Error(`Unexpected business visibility audit event: ${event.eventType}`)
  }
  return {
    eventType: event.eventType,
    actorRef: event.actorRef,
    targetRef: event.targetRef,
    ...(event.beforeState === undefined ? {} : { beforeState: event.beforeState }),
    ...(event.afterState === undefined ? {} : { afterState: event.afterState }),
    ...(event.reasonCode === undefined ? {} : { reasonCode: event.reasonCode }),
  }
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
  ownerId: Id<'owners'>
  clerkUserId: string
  displayName?: string
  emailHash?: string
  createdAt: number
  updatedAt: number
}

type BusinessDocument = Omit<Doc<'businesses'>, '_id' | '_creationTime'>
type ClaimDocument = Omit<Doc<'claims'>, '_id' | '_creationTime'>
type ContextDocument = Omit<Doc<'businessContexts'>, '_id' | '_creationTime'>

export async function claimBusinessCommand(
  db: GenericDatabaseWriter<DataModel>,
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
  const sourceHash = canonicalDigest({
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
    const requestHash = canonicalDigest({ actorRef: owner.ownerId, facts: normalized })
    const existingOperation = await db
      .query('operationKeys')
      .withIndex('by_actor_operation_key', (query) =>
        query.eq('actorRef', owner.ownerId).eq('operationName', 'claimBusiness').eq('key', command.operationKey)
      )
      .unique()
    if (existingOperation !== null) {
      if (existingOperation.requestHash !== requestHash || existingOperation.status !== 'succeeded') {
        return claimError('claim_operation_conflict', 'Operation key is already reserved for a different claim request.')
      }
      const [businessIdRef, claimIdRef] = existingOperation.effectRefs
      const businessId = businessIdRef === undefined ? undefined : db.normalizeId('businesses', businessIdRef)
      const claimId = claimIdRef === undefined ? undefined : db.normalizeId('claims', claimIdRef)
      if (businessId === undefined || businessId === null || claimId === undefined || claimId === null) {
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
        || business.ownerId !== owner.ownerId
        || business.slug !== normalized.slug
        || business.sourceHash !== sourceHash
        || claim.ownerId !== owner.ownerId
        || claim.businessId !== businessId
        || claim.slug !== normalized.slug
        || claim.submittedFactsHash !== sourceHash
        || context.businessId !== businessId
        || context.sourceHash !== sourceHash
        || existingOperation.sourceHash !== sourceHash
        || existingOperation.resultHash !== claimReceiptHash(businessId, claimId, business, claim, context)
      ) {
        return claimError('claim_operation_conflict', 'Claim operation readback is incomplete.')
      }
      return claimCommandResult('claim_replayed', owner, businessId, claimId, business, claim, context)
    }
  }

  const owner = await findOrCreateOwner(db, command.actor, now)
  const requestHash = canonicalDigest({ actorRef: owner.ownerId, facts: normalized })

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
  const duplicate = await db
    .query('claimFingerprints')
    .withIndex('by_fingerprint_status', (query) => query.eq('fingerprint', fingerprint))
    .first()
  if (duplicate !== null) {
    const duplicateOwnerRef = duplicate.ownerRef
    if (duplicateOwnerRef === owner.ownerId) {
      return claimError('claim_duplicate_conflict', 'This owner already has a claim for the normalized business identity.')
    }

    const contestedHash = canonicalDigest({
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
  const businessDocument: BusinessDocument = {
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
  const contextDocument: ContextDocument = {
    businessId,
    category: normalized.category,
    suburb: normalized.suburb,
    stateTerritory: normalized.stateTerritory,
    ...(normalized.ownerMessage === undefined ? {} : { ownerMessage: normalized.ownerMessage }),
    ...(normalized.photos === undefined || normalized.photos.length === 0
      ? {}
      : { photos: normalized.photos.map((photo) => ({ url: photo.url, alt: photo.alt })) }),
    ...(normalized.responseTimeMinutes === undefined ? {} : { responseTimeMinutes: normalized.responseTimeMinutes }),
    sourceRefs: normalized.sourceRefs.map((sourceRef) => ({ ...sourceRef })),
    sourceHash,
    approvedAt: now,
  }
  await db.insert('businessContexts', contextDocument)
  const claimDocument: ClaimDocument = {
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
  businessId: Id<'businesses'>,
  claimId: Id<'claims'>,
  business: BusinessDocument,
  claim: ClaimDocument,
  context: ContextDocument,
) {
  const publishedPhone = optionalNonEmptyString(business.publishedPhone)
  const ownerMessage = optionalNonEmptyString(context.ownerMessage)
  return {
    kind: 'ok' as const,
    code,
    owner,
    business: {
      businessId,
      ownerId: business.ownerId,
      slug: business.slug,
      name: business.name,
      normalizedName: business.normalizedName,
      category: business.category,
      suburb: business.suburb,
      stateTerritory: business.stateTerritory,
      ...(publishedPhone === undefined ? {} : { publishedPhone }),
      publicStatus: business.publicStatus,
      trustTier: business.trustTier,
      claimStatus: business.claimStatus,
      sourceHash: business.sourceHash,
      createdAt: business.createdAt,
      updatedAt: business.updatedAt,
    },
    claim: {
      claimId,
      ownerId: claim.ownerId,
      ...(claim.businessId === undefined ? {} : { businessId: claim.businessId }),
      slug: claim.slug,
      status: claim.status,
      submittedFactsHash: claim.submittedFactsHash,
      createdAt: claim.createdAt,
      updatedAt: claim.updatedAt,
    },
    context: {
      businessId,
      category: context.category,
      suburb: context.suburb,
      stateTerritory: context.stateTerritory,
      ...(ownerMessage === undefined ? {} : { ownerMessage }),
      sourceRefs: context.sourceRefs.map((sourceRef) => ({ ...sourceRef })),
      sourceHash: context.sourceHash,
      approvedAt: context.approvedAt,
    },
  }
}

function claimReceiptHash(
  businessId: Id<'businesses'>,
  claimId: Id<'claims'>,
  business: BusinessDocument,
  claim: ClaimDocument,
  context: ContextDocument,
): string {
  return canonicalDigest({
    business: {
      businessId,
      ownerId: business.ownerId,
      slug: business.slug,
      name: business.name,
      normalizedName: business.normalizedName,
      category: business.category,
      suburb: business.suburb,
      stateTerritory: business.stateTerritory,
      publishedPhone: optionalNonEmptyString(business.publishedPhone) ?? '',
      sourceHash: business.sourceHash,
      createdAt: business.createdAt,
    },
    claim: {
      claimId,
      ownerId: claim.ownerId,
      businessId: claim.businessId,
      slug: claim.slug,
      submittedFactsHash: claim.submittedFactsHash,
      createdAt: claim.createdAt,
    },
    context: {
      businessId: context.businessId,
      category: context.category,
      suburb: context.suburb,
      stateTerritory: context.stateTerritory,
      ownerMessage: optionalNonEmptyString(context.ownerMessage) ?? '',
      sourceRefs: context.sourceRefs.map((sourceRef) => ({ ...sourceRef })),
      sourceHash: context.sourceHash,
      approvedAt: context.approvedAt,
    },
  })
}

function ownerContractFromDocument(owner: Doc<'owners'>): OwnerContract {
  const displayName = optionalNonEmptyString(owner.displayName)
  const emailHash = optionalNonEmptyString(owner.emailHash)
  return {
    ownerId: owner._id,
    clerkUserId: owner.clerkUserId,
    ...(displayName === undefined ? {} : { displayName }),
    ...(emailHash === undefined ? {} : { emailHash }),
    createdAt: owner.createdAt,
    updatedAt: owner.updatedAt,
  }
}

function optionalNonEmptyString(value: string | undefined): string | undefined {
  return value === undefined || value.length === 0 ? undefined : value
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
      sourceHash: canonicalDigest({ evidenceRef, label, suppliedHash: sourceRef.sourceHash ?? '' }),
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

async function findOrCreateOwner(
  db: GenericDatabaseWriter<DataModel>,
  actor: AuthenticatedOwnerActor,
  now: number,
): Promise<OwnerContract> {
  const existing = await db
    .query('owners')
    .withIndex('by_clerkUserId', (query) => query.eq('clerkUserId', actor.clerkUserId))
    .unique()
  const displayName = normalizeOptionalText(actor.displayName)
  const emailHash = actor.emailHash

  if (existing !== null) {
    const existingDisplayName = optionalNonEmptyString(existing.displayName)
    const existingEmailHash = optionalNonEmptyString(existing.emailHash)
    const metadataPatch = {
      ...(displayName === undefined || displayName === existingDisplayName ? {} : { displayName }),
      ...(emailHash === undefined || emailHash === existingEmailHash ? {} : { emailHash }),
    }
    const metadataChanged = Object.keys(metadataPatch).length > 0
    if (metadataChanged) {
      await db.patch(existing._id, { ...metadataPatch, updatedAt: now })
    }
    const resolvedDisplayName = displayName ?? existingDisplayName
    const resolvedEmailHash = emailHash ?? existingEmailHash
    return {
      ownerId: existing._id,
      clerkUserId: actor.clerkUserId,
      ...(resolvedDisplayName === undefined ? {} : { displayName: resolvedDisplayName }),
      ...(resolvedEmailHash === undefined ? {} : { emailHash: resolvedEmailHash }),
      createdAt: existing.createdAt,
      updatedAt: metadataChanged ? now : existing.updatedAt,
    }
  }

  const ownerDoc: Omit<Doc<'owners'>, '_id' | '_creationTime'> = {
    clerkUserId: actor.clerkUserId,
    ...(displayName === undefined ? {} : { displayName }),
    ...(emailHash === undefined ? {} : { emailHash }),
    createdAt: now,
    updatedAt: now,
  }
  const ownerId = await db.insert('owners', ownerDoc)
  return { ownerId, ...ownerDoc }
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
