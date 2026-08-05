import type { GenericDatabaseReader, GenericDatabaseWriter } from 'convex/server'
import { mutationGeneric, queryGeneric } from 'convex/server'
import { v } from 'convex/values'
import { TableAggregate } from '@convex-dev/aggregate'
import { components } from './_generated/api'
import type { DataModel, Doc, Id } from './_generated/dataModel'
import type { MutationCtx, QueryCtx } from './_generated/server'

import { admissionKey, assertAdmission } from './lib/rateLimit'

import { readCurrentActiveAdminMembership as readCurrentActiveMembership } from './authz'
import { requireSourceWrite, sourceWriteArgs } from './sourceWriteAdmission'
import { brandNonEmpty } from '../src/modules/common/ids'
import {
  ActivationStageValues,
  OperatorControlKeyValues,
  parseOwnerActivationStateRow,
  readOperatorControls as readOperatorControlsModule,
  recordFunnelEvent,
  setOperatorControl as setOperatorControlModule,
  type FunnelEventPersistenceRow,
  type RecordFunnelEventInput,
  type AuditEventContract,
  type OwnerActivationState,
  type OperatorControlReadback,
  type OperatorControlRecord,
  type OperatorControlSourceState,
  type SetOperatorControlResult,
} from '../src/modules/observability/public'
import {
  recordAdminActionDenied,
  requireAdminAuthority,
} from '../src/modules/security/public'
import type {
  AdminDecisionAudit,
  AdminMembership,
} from '../src/modules/security/public'


const ownerActivationByStage = new TableAggregate<{
  Key: OwnerActivationState['stage']
  DataModel: DataModel
  TableName: 'ownerActivationState'
}>(components.ownerActivationByStage, {
  sortKey: (document) => document.stage,
})

export const OPERATOR_CONTROL_KEY_COUNT = OperatorControlKeyValues.length

const operatorControlKey = v.union(
  v.literal('claims_enabled'),
  v.literal('publish_enabled'),
  v.literal('registry_enabled'),
  v.literal('discovery_enabled'),
  v.literal('public_copy_safe_mode'),
  v.literal('inquiries_enabled'),
  v.literal('inquiry_owner_replies_enabled'),
  v.literal('notification_dispatch_enabled'),
  v.literal('notification_webhooks_enabled'),
  v.literal('developer_discovery_publish_enabled'),
  v.literal('discovery_api_keys_enabled'),
  v.literal('protected_actions_enabled'),
  v.literal('protected_action_attempts_enabled'),
  v.literal('paid_activation_enabled'),
  v.literal('billing_webhooks_enabled'),
  v.literal('billing_reconciliation_enabled'),
  v.literal('business_actions_enabled'),
  v.literal('business_action_attempts_enabled'),
  v.literal('offering_authoring_enabled'),
  v.literal('offering_public_projection_enabled')
)

const operatorControlReadback = v.object({
  key: operatorControlKey,
  configuredEnabled: v.boolean(),
  effectiveEnabled: v.boolean(),
  expired: v.boolean(),
  expiresAt: v.optional(v.number()),
  source: v.union(v.literal('default'), v.literal('source_owned')),
  reasonCode: v.optional(v.string()),
  changedByAdminRef: v.optional(v.string()),
  correlationId: v.optional(v.string()),
  updatedAt: v.number(),
})

const operatorAuditSummary = v.object({
  eventType: v.union(v.literal('operator_control.changed'), v.literal('admin.action_denied')),
  actorRef: v.string(),
  targetRef: v.string(),
  beforeState: v.optional(v.string()),
  afterState: v.optional(v.string()),
  reasonCode: v.optional(v.string()),
})

const membershipAuditSummary = v.object({
  eventType: v.literal('action_denied'),
  actorRef: v.string(),
  targetRef: v.string(),
  reasonCode: v.string(),
})

const operatorControlRecord = v.object({
  key: operatorControlKey,
  enabled: v.boolean(),
  changedByAdminRef: v.string(),
  reasonCode: v.string(),
  evidenceRefs: v.array(v.string()),
  correlationId: v.string(),
  operationKey: v.string(),
  expiresAt: v.optional(v.number()),
  updatedAt: v.number(),
})

const setOperatorControlResult = v.union(
  v.object({
    kind: v.literal('ok'),
    code: v.union(v.literal('operator_control_changed'), v.literal('operator_control_replayed')),
    control: operatorControlRecord,
    readback: operatorControlReadback,
    auditEvent: operatorAuditSummary,
  }),
  v.object({
    kind: v.literal('error'),
    code: v.union(
      v.literal('operator_control_csrf_rejected'),
      v.literal('operator_control_admin_denied'),
      v.literal('operator_control_invalid_reason'),
      v.literal('operator_control_missing_evidence'),
      v.literal('operator_control_invalid_expiry')
    ),
    retryable: v.boolean(),
    reason: v.string(),
    auditEvent: v.optional(operatorAuditSummary),
    membershipAuditEvent: v.optional(membershipAuditSummary),
  })
)

const readOperatorControlsResult = v.union(
  v.object({
    kind: v.literal('allowed'),
    controls: v.array(operatorControlReadback),
  }),
  v.object({
    kind: v.literal('denied'),
    reason: v.union(
      v.literal('missing_membership'),
      v.literal('inactive_membership'),
      v.literal('action_not_allowed')
    ),
    controls: v.array(operatorControlReadback),
  })
)

const funnelEventType = v.union(
  v.literal('visitor_attributed'),
  v.literal('claim_cta_clicked'),
  v.literal('claim_started'),
  v.literal('auth_started'),
  v.literal('auth_completed'),
  v.literal('owner_interest_submitted'),
  v.literal('claim_submitted'),
  v.literal('slug_conflict'),
  v.literal('duplicate_suspected'),
  v.literal('publish_succeeded'),
  v.literal('service_added'),
  v.literal('capability_status_viewed'),
  v.literal('publish_failed'),
  v.literal('owner_status_viewed'),
  v.literal('share_url_copied'),
  v.literal('registry_search'),
  v.literal('service_registry_result_clicked'),
  v.literal('ucp_manifest_fetched'),
  v.literal('dispute_opened'),
  v.literal('suppression_applied'),
  v.literal('inquiry_available_seen'),
  v.literal('inquiry_started'),
  v.literal('inquiry_submitted'),
  v.literal('inquiry_rejected'),
  v.literal('owner_inbox_viewed'),
  v.literal('owner_inquiry_read'),
  v.literal('owner_inquiry_replied'),
  v.literal('inquiry_closed'),
  v.literal('notification_queued'),
  v.literal('notification_delivered'),
  v.literal('notification_failed'),
  v.literal('developer_docs_viewed'),
  v.literal('schema_downloaded'),
  v.literal('example_fixture_downloaded'),
  v.literal('discovery_health_viewed'),
  v.literal('protected_action_proposed'),
  v.literal('protected_action_policy_denied'),
  v.literal('protected_action_approved'),
  v.literal('protected_action_rejected'),
  v.literal('protected_action_attempted'),
  v.literal('protected_action_receipt_viewed'),
  v.literal('paid_activation_started'),
  v.literal('checkout_returned'),
  v.literal('checkout_cancelled'),
  v.literal('billing_provider_event_ingested'),
  v.literal('receipt_viewed'),
  v.literal('refund_or_dispute_recorded'),
  v.literal('billing_reconciliation_failed'),
  v.literal('billing_reconciliation_repaired'),
  v.literal('business_action_card_viewed'),
  v.literal('business_action_request_started'),
  v.literal('business_action_checkpoint_recorded'),
  v.literal('business_action_guardrail_allowed'),
  v.literal('business_action_guardrail_blocked'),
  v.literal('business_action_evidence_ingested'),
  v.literal('business_action_receipt_viewed'),
  v.literal('business_action_proof_gap_recorded')
)

const activationStage = v.union(
  v.literal('visitor'),
  v.literal('claim_started'),
  v.literal('published'),
  v.literal('activated'),
  v.literal('blocked')
)

const ownerActivationSummaryRow = v.object({
  stage: v.string(),
  count: v.number(),
})


export const setOperatorControl = mutationGeneric({
  args: {
    key: operatorControlKey,
    enabled: v.boolean(),
    reasonCode: v.string(),
    evidenceRefs: v.array(v.string()),
    expiresAt: v.optional(v.number()),
    csrfToken: v.optional(v.string()),
    csrfCookie: v.optional(v.string()),
    origin: v.optional(v.string()),
    ...sourceWriteArgs,
    operationKey: v.string(),
    correlationId: v.string(),
  },
  returns: setOperatorControlResult,
  handler: async (ctx, args) => {
    const sourceWrite = await requireSourceWrite(ctx, args, 'admin_operator')
    if (sourceWrite.kind === 'rejected') {
      return {
        kind: 'error' as const,
        code: 'operator_control_csrf_rejected' as const,
        retryable: false,
        reason: sourceWrite.reason,
      }
    }

    const operationKey = brandNonEmpty(args.operationKey, 'OperationKey')
    const correlationId = brandNonEmpty(args.correlationId, 'CorrelationId')
    const auditEventId = `audit:operator_control.changed:${args.key}:${operationKey}`
    const [operatorSource, adminMembership] = await Promise.all([
      loadOperatorControlSource(ctx.db, args.key, auditEventId),
      readCurrentActiveMembership(ctx),
    ])
    const authority = requireAdminAuthority(adminMembership, 'set_operator_control')
    if (authority.kind === 'denied') {
      const denied = recordAdminActionDenied(
        { adminMemberships: [], adminMembershipAuditEvents: [], auditEvents: [] },
        {
          actorMembership: adminMembership,
          action: 'set_operator_control',
          targetType: 'operator_control',
          targetRef: args.key,
          reasonCode: authority.reason,
          evidenceRefs: args.evidenceRefs,
          operationKey,
          correlationId,
          now: Date.now(),
        }
      )
      await persistAdminAuthorityMutation(ctx.db, denied)
      return {
        kind: 'error' as const,
        code: 'operator_control_admin_denied' as const,
        retryable: false,
        reason: authority.reason,
        auditEvent: summarizeOperatorAudit(denied.auditEvent),
        membershipAuditEvent: summarizeMembershipAudit(denied.membershipAuditEvent),
      }
    }

    const state = operatorControlState(operatorSource)
    const result = setOperatorControlModule(state, {
      adminMembership,
      key: args.key,
      enabled: args.enabled,
      reasonCode: args.reasonCode,
      evidenceRefs: args.evidenceRefs,
      ...(args.expiresAt === undefined ? {} : { expiresAt: args.expiresAt }),
      security: {
        csrf: sourceWrite.csrf,
      },
      operationKey,
      correlationId,
      now: Date.now(),
    })

    await persistOperatorControlMutation(ctx.db, result)
    return summarizeSetOperatorControl(result)
  },
})

export const readOperatorControls = queryGeneric({
  args: {},
  returns: readOperatorControlsResult,
  handler: async (ctx: QueryCtx) => {
    const adminMembership = await readCurrentActiveMembership(ctx)
    const authority = requireAdminAuthority(adminMembership, 'set_operator_control')
    if (authority.kind === 'denied') {
      return {
        kind: 'denied' as const,
        reason: authority.reason,
        controls: [],
      }
    }

    const operatorControls = await ctx.db.query('operatorControls').take(OPERATOR_CONTROL_KEY_COUNT)
    return {
      kind: 'allowed' as const,
      controls: readOperatorControlsModule({
        operatorControls: operatorControls.map(operatorControlFromDocument),
        auditEvents: [],
      }, Date.now())
        .map(summarizeOperatorReadback),
    }
  },
})

export const recordOwnerActivationEvent = mutationGeneric({
  args: {
    eventType: funnelEventType,
    source: v.string(),
    stage: activationStage,
    pseudonymousSessionId: v.string(),
    correlationId: v.string(),
    consentFlag: v.boolean(),
    referrer: v.optional(v.string()),
    utmSource: v.optional(v.string()),
    utmCampaign: v.optional(v.string()),
    actorRef: v.optional(v.string()),
    businessId: v.optional(v.string()),
    claimId: v.optional(v.string()),
    payload: v.optional(v.record(v.string(), v.union(v.string(), v.number(), v.boolean(), v.null()))),
  },
  returns: v.object({ ok: v.literal(true) }),
  handler: async (ctx: MutationCtx, args) => {
    const admission = await assertAdmission(ctx, {
      name: 'public-mutation',
      key: await admissionKey(ctx, `owner-activation:${args.pseudonymousSessionId}`),
    })
    if (!admission.ok) throw new Error(`rate_limited:${admission.retryAfter}`)

    const now = Date.now()
    const ownerActivationByBusiness =
      args.businessId === undefined
        ? new Map<string, OwnerActivationState>()
        : await readOwnerActivationByBusiness(ctx.db, brandNonEmpty(args.businessId, 'BusinessId'))

    const input: RecordFunnelEventInput = {
      eventType: args.eventType,
      source: args.source,
      stage: args.stage,
      pseudonymousSessionId: args.pseudonymousSessionId,
      correlationId: args.correlationId,
      consentFlag: args.consentFlag,
      now,
      ...(args.referrer === undefined ? {} : { referrer: args.referrer }),
      ...(args.utmSource === undefined ? {} : { utmSource: args.utmSource }),
      ...(args.utmCampaign === undefined ? {} : { utmCampaign: args.utmCampaign }),
      ...(args.actorRef === undefined ? {} : { actorRef: args.actorRef }),
      ...(args.claimId === undefined ? {} : { claimId: args.claimId }),
      ...(args.payload === undefined ? {} : { redactedPayload: args.payload }),
      ...(args.businessId === undefined ? {} : { businessId: brandNonEmpty(args.businessId, 'BusinessId') }),
    }

    const result = recordFunnelEvent(input, ownerActivationByBusiness)
    await upsertFunnelEventRow(ctx.db, result.event)

    if (result.ownerActivation !== undefined) {
      await upsertOwnerActivationStateRow(ctx, result.ownerActivation)
    }

    return { ok: true as const }
  },
})

async function readOwnerActivationByBusiness(
  db: GenericDatabaseReader<DataModel>,
  businessId: OwnerActivationState['businessId']
): Promise<Map<string, OwnerActivationState>> {
  const existing = await db
    .query('ownerActivationState')
    .withIndex('by_business', (builder) =>
      builder.eq('businessId', businessIdFromValue(db, businessId))
    )
    .unique()
  if (existing === null) {
    return new Map()
  }

  return new Map([[businessId, parseOwnerActivationStateRow(existing)]])
}

async function upsertFunnelEventRow(
  db: GenericDatabaseWriter<DataModel>,
  event: FunnelEventPersistenceRow,
): Promise<void> {
  const existing = await readFirstFunnelEventByCorrelationId(db, event.correlationId)
  const businessId = event.businessId === undefined
    ? undefined
    : businessIdFromValue(db, event.businessId)
  const row: Omit<Doc<'funnelEvents'>, '_id' | '_creationTime'> = {
    eventId: event.eventId,
    eventType: event.eventType,
    source: event.source,
    stage: event.stage,
    pseudonymousSessionId: event.pseudonymousSessionId,
    correlationId: event.correlationId,
    consentFlag: event.consentFlag,
    redactedPayloadJson: event.redactedPayloadJson,
    createdAt: event.createdAt,
    ...(event.referrer === undefined ? {} : { referrer: event.referrer }),
    ...(event.utmSource === undefined ? {} : { utmSource: event.utmSource }),
    ...(event.utmCampaign === undefined ? {} : { utmCampaign: event.utmCampaign }),
    ...(event.actorRef === undefined ? {} : { actorRef: event.actorRef }),
    ...(businessId === undefined ? {} : { businessId }),
    ...(event.claimId === undefined
      ? {}
      : { claimId: claimIdFromValue(db, event.claimId) }),
  }

  if (existing === null) {
    await db.insert('funnelEvents', row)
    return
  }

  await db.patch(existing._id, row)
}

async function readFirstFunnelEventByCorrelationId(
  db: GenericDatabaseReader<DataModel>,
  correlationId: FunnelEventPersistenceRow['correlationId'],
): Promise<Doc<'funnelEvents'> | null> {
  return (
    await db
      .query('funnelEvents')
      .withIndex('by_correlationId', (builder) => builder.eq('correlationId', correlationId))
      .take(1)
  )[0] ?? null
}

async function upsertOwnerActivationStateRow(
  ctx: MutationCtx,
  state: OwnerActivationState,
): Promise<void> {
  const businessId = businessIdFromValue(ctx.db, state.businessId)
  const existing = await ctx.db
    .query('ownerActivationState')
    .withIndex('by_business', (builder) => builder.eq('businessId', businessId))
    .unique()
  const row: Omit<Doc<'ownerActivationState'>, '_id' | '_creationTime'> = {
    businessId,
    stage: state.stage,
    publishSeen: state.publishSeen,
    statusSeen: state.statusSeen,
    capabilityHealthSeen: state.capabilityHealthSeen,
    sharedOrInterestSubmitted: state.sharedOrInterestSubmitted,
    attributionRecorded: state.attributionRecorded,
    ...(state.frictionCode === undefined ? {} : { frictionCode: state.frictionCode }),
    ...(state.failureCode === undefined ? {} : { failureCode: state.failureCode }),
    lastEventAt: state.lastEventAt,
  }

  if (existing === null) {
    const id = await ctx.db.insert('ownerActivationState', row)
    const inserted = await ctx.db.get(id)
    if (inserted === null) {
      throw new Error('owner_activation_state_insert_missing')
    }
    await ownerActivationByStage.insert(ctx, inserted)
    return
  }

  await ctx.db.patch(existing._id, row)
  const updated = await ctx.db.get(existing._id)
  if (updated === null) {
    throw new Error('owner_activation_state_patch_missing')
  }
  await ownerActivationByStage.replace(ctx, existing, updated)
}
export const readAdminOwnerActivationSummary = queryGeneric({
  args: {},
  returns: v.object({
    byStage: v.array(ownerActivationSummaryRow),
    totalTracked: v.number(),
  }),
  handler: async (ctx: QueryCtx) => {
    const adminMembership = await readCurrentActiveMembership(ctx)
    const authority = requireAdminAuthority(adminMembership, 'set_operator_control')
    if (authority.kind === 'denied') {
      return { byStage: [], totalTracked: 0 }
    }

    const [stageCounts, totalTracked] = await Promise.all([
      Promise.all(
        ActivationStageValues.map(async (stage) => ({
          stage,
          count: await ownerActivationByStage.count(ctx, { bounds: { eq: stage } }),
        }))
      ),
      ownerActivationByStage.count(ctx),
    ])
    const byStage = stageCounts
      .filter(({ count }) => count > 0)
      .sort((left, right) => right.count - left.count)

    return {
      byStage,
      totalTracked,
    }
  },
})

function businessIdFromValue(
  db: GenericDatabaseReader<DataModel>,
  value: string,
): Id<'businesses'> {
  const id = db.normalizeId('businesses', value)
  if (id === null) {
    throw new Error('invalid_business_id')
  }
  return id
}

function claimIdFromValue(
  db: GenericDatabaseReader<DataModel>,
  value: string,
): Id<'claims'> {
  const id = db.normalizeId('claims', value)
  if (id === null) {
    throw new Error('invalid_claim_id')
  }
  return id
}



type PersistedAdminMembership = AdminMembership & { _sourceDocumentId?: string }

type AdminAuthorityWriteResult = {
  membership?: AdminMembership
  auditEvent?: AuditEventContract
  membershipAuditEvent?: AdminDecisionAudit
}

async function persistAdminAuthorityMutation(
  db: GenericDatabaseWriter<DataModel>,
  result: AdminAuthorityWriteResult,
): Promise<void> {
  if (result.membership !== undefined) {
    const membership = result.membership as PersistedAdminMembership
    const { _sourceDocumentId: sourceDocumentId } = membership
    const document: Omit<Doc<'adminMemberships'>, '_id' | '_creationTime'> = {
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
    if (sourceDocumentId === undefined) {
      await db.insert('adminMemberships', document)
    } else {
      await db.patch(sourceDocumentId as Id<'adminMemberships'>, document)
    }
  }

  if (result.auditEvent !== undefined) {
    await persistAuditEvent(db, result.auditEvent)
  }

  if (result.membershipAuditEvent !== undefined) {
    const membershipAuditEvent = result.membershipAuditEvent
    const existing = await db
      .query('adminMembershipAuditEvents')
      .withIndex('by_auditEventId', (builder) =>
        builder.eq('auditEventId', membershipAuditEvent.auditEventId)
      )
      .unique()
    if (existing === null) {
      await db.insert('adminMembershipAuditEvents', {
        ...membershipAuditEvent,
        evidenceRefs: [...membershipAuditEvent.evidenceRefs],
      })
    }
  }
}

type OperatorControlReadSource = {
  operatorControls: Doc<'operatorControls'>[]
  auditEvents: Doc<'auditEvents'>[]
}

async function loadOperatorControlSource(
  db: GenericDatabaseReader<DataModel>,
  key: OperatorControlRecord['key'],
  auditEventId: string,
): Promise<OperatorControlReadSource> {
  const [control, auditEvent] = await Promise.all([
    db.query('operatorControls').withIndex('by_key', (query) => query.eq('key', key)).unique(),
    db.query('auditEvents').withIndex('by_eventId', (query) => query.eq('eventId', auditEventId)).unique(),
  ])
  return {
    operatorControls: control === null ? [] : [control],
    auditEvents: auditEvent === null ? [] : [auditEvent],
  }
}

type PersistedOperatorControl = OperatorControlRecord & { _sourceDocumentId?: string }

function operatorControlFromDocument(document: Doc<'operatorControls'>): PersistedOperatorControl {
  return {
    key: document.key,
    enabled: document.enabled,
    changedByAdminRef: document.changedByAdminRef,
    reasonCode: document.reasonCode,
    evidenceRefs: [...document.evidenceRefs],
    correlationId: brandNonEmpty(document.correlationId, 'CorrelationId'),
    operationKey: brandNonEmpty(document.operationKey, 'OperationKey'),
    ...(document.expiresAt === undefined ? {} : { expiresAt: document.expiresAt }),
    updatedAt: document.updatedAt,
    _sourceDocumentId: document._id,
  }
}


async function persistOperatorControlMutation(
  db: GenericDatabaseWriter<DataModel>,
  result: SetOperatorControlResult,
): Promise<void> {
  if (result.kind === 'error' || result.code === 'operator_control_replayed') {
    return
  }

  const control = result.control as PersistedOperatorControl
  const { _sourceDocumentId: sourceDocumentId, ...document } = control
  if (sourceDocumentId === undefined) {
    await db.insert('operatorControls', document)
  } else {
    await db.patch(sourceDocumentId as Id<'operatorControls'>, document)
  }

  await persistAuditEvent(db, result.auditEvent)
}

async function persistAuditEvent(
  db: GenericDatabaseWriter<DataModel>,
  event: AuditEventContract,
): Promise<void> {
  const existing = await db
    .query('auditEvents')
    .withIndex('by_eventId', (builder) => builder.eq('eventId', event.eventId))
    .unique()
  if (existing !== null) {
    return
  }

  const redactedPayloadJson = JSON.stringify(event.redactedPayload)
  if (redactedPayloadJson === undefined) {
    throw new Error('audit_event_payload_serialization_failed')
  }
  const businessId = event.businessId === undefined
    ? undefined
    : businessIdFromValue(db, event.businessId)
  const row: Omit<Doc<'auditEvents'>, '_id' | '_creationTime'> = {
    eventId: event.eventId,
    eventType: event.eventType,
    actorKind: event.actorKind,
    actorRef: event.actorRef,
    targetType: event.targetType,
    targetRef: event.targetRef,
    ...(businessId === undefined ? {} : { businessId }),
    idempotencyKey: event.idempotencyKey,
    correlationId: event.correlationId,
    ...(event.beforeState === undefined ? {} : { beforeState: event.beforeState }),
    ...(event.afterState === undefined ? {} : { afterState: event.afterState }),
    ...(event.reasonCode === undefined ? {} : { reasonCode: event.reasonCode }),
    evidenceRefs: [...event.evidenceRefs],
    redactedPayloadJson,
    payloadHash: event.payloadHash,
    ...(event.failureCode === undefined ? {} : { failureCode: event.failureCode }),
    createdAt: event.createdAt,
  }
  await db.insert('auditEvents', row)
}

function operatorControlState(source: OperatorControlReadSource): OperatorControlSourceState {
  return {
    operatorControls: source.operatorControls.map(operatorControlFromDocument),
    auditEvents: source.auditEvents.map(auditEventFromDocument),
  }
}

function auditEventFromDocument(row: Doc<'auditEvents'>): AuditEventContract {
  let redactedPayload: AuditEventContract['redactedPayload'] = null
  try {
    redactedPayload = JSON.parse(row.redactedPayloadJson) as AuditEventContract['redactedPayload']
  } catch {
    redactedPayload = null
  }
  return {
    eventId: brandNonEmpty(row.eventId, 'AuditEventId'),
    eventType: row.eventType,
    actorKind: row.actorKind,
    actorRef: row.actorRef,
    targetType: row.targetType,
    targetRef: row.targetRef,
    ...(row.authSessionRef === undefined ? {} : { authSessionRef: row.authSessionRef }),
    ...(row.orgRef === undefined ? {} : { orgRef: row.orgRef }),
    ...(row.businessId === undefined ? {} : { businessId: brandNonEmpty(String(row.businessId), 'BusinessId') }),
    ...(row.slug === undefined ? {} : { slug: row.slug }),
    ...(row.beforeState === undefined ? {} : { beforeState: row.beforeState }),
    ...(row.afterState === undefined ? {} : { afterState: row.afterState }),
    idempotencyKey: brandNonEmpty(row.idempotencyKey, 'OperationKey'),
    correlationId: brandNonEmpty(row.correlationId, 'CorrelationId'),
    ...(row.reasonCode === undefined ? {} : { reasonCode: row.reasonCode }),
    evidenceRefs: [...row.evidenceRefs],
    redactedPayload,
    payloadHash: brandNonEmpty(row.payloadHash, 'SourceHash'),
    ...(row.failureCode === undefined ? {} : { failureCode: row.failureCode }),
    createdAt: row.createdAt,
  }
}




function summarizeSetOperatorControl(result: SetOperatorControlResult) {
  if (result.kind === 'error') {
    return result
  }

  return {
    kind: 'ok' as const,
    code: result.code,
    control: summarizeOperatorRecord(result.control),
    readback: summarizeOperatorReadback(result.readback),
    auditEvent: summarizeOperatorAudit(result.auditEvent),
  }
}

function summarizeOperatorRecord(control: OperatorControlRecord) {

  return {
    key: control.key,
    enabled: control.enabled,
    changedByAdminRef: control.changedByAdminRef,
    reasonCode: control.reasonCode,
    evidenceRefs: [...control.evidenceRefs],
    correlationId: control.correlationId,
    operationKey: control.operationKey,
    ...(control.expiresAt === undefined ? {} : { expiresAt: control.expiresAt }),
    updatedAt: control.updatedAt,
  }
}

function summarizeOperatorReadback(control: OperatorControlReadback) {

  return {
    key: control.key,
    configuredEnabled: control.configuredEnabled,
    effectiveEnabled: control.effectiveEnabled,
    expired: control.expired,
    ...(control.expiresAt === undefined ? {} : { expiresAt: control.expiresAt }),
    source: control.source,
    ...(control.reasonCode === undefined ? {} : { reasonCode: control.reasonCode }),
    ...(control.changedByAdminRef === undefined ? {} : { changedByAdminRef: control.changedByAdminRef }),
    ...(control.correlationId === undefined ? {} : { correlationId: control.correlationId }),
    updatedAt: control.updatedAt,
  }
}

function summarizeOperatorAudit(event: AuditEventContract) {
  return {
    eventType: event.eventType as 'operator_control.changed' | 'admin.action_denied',
    actorRef: event.actorRef,
    targetRef: event.targetRef,
    ...(event.beforeState === undefined ? {} : { beforeState: event.beforeState }),
    ...(event.afterState === undefined ? {} : { afterState: event.afterState }),
    ...(event.reasonCode === undefined ? {} : { reasonCode: event.reasonCode }),
  }
}

function summarizeMembershipAudit(event: AdminDecisionAudit) {
  return {
    eventType: 'action_denied' as const,
    actorRef: event.actorRef,
    targetRef: event.targetRef,
    reasonCode: event.reasonCode,
  }
}



export type {
  AuditEventContract,
  OperatorControlKey,
  OperatorControlReadback,
  OperatorControlRecord,
  OperatorControlSourceState,
  SetOperatorControlCommand,
  SetOperatorControlResult,
} from '../src/modules/observability/public'
