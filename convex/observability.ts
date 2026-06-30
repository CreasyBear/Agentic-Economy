import type { UserIdentity } from 'convex/server'
import { mutationGeneric, queryGeneric } from 'convex/server'
import { v } from 'convex/values'

import { readActiveAdminMembership } from './authz'
import { requireSourceWrite, sourceWriteArgs } from './sourceWriteAdmission'
import {
  loadPhaseOneSourceState,
  persistPhaseOneSourceState,
  runtimeDb,
  type RuntimeDb,
  type RuntimeDocument,
} from './source_state'
import { brandNonEmpty } from '../src/modules/common/ids'
import {
  parseOwnerActivationStateRow,
  readOperatorControls as readOperatorControlsModule,
  recordFunnelEvent,
  setOperatorControl as setOperatorControlModule,
  type RecordFunnelEventInput,
  type AuditEventContract,
  type OwnerActivationState,
  type OperatorControlReadback,
  type OperatorControlRecord,
  type OperatorControlSourceState,
} from '../src/modules/observability/public'
import {
  recordAdminActionDenied,
  requireAdminAuthority,
} from '../src/modules/security/public'
import type {
  AdminAuthorityState,
  AdminDecisionAudit,
  AdminMembership,
} from '../src/modules/security/public'

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
  v.literal('business_action_attempts_enabled')
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

type RuntimeCtx = {
  db: object
  auth: {
    getUserIdentity: () => Promise<UserIdentity | null>
  }
}

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
    const sourceWrite = await requireSourceWrite(args, 'admin_operator')
    if (sourceWrite.kind === 'rejected') {
      return {
        kind: 'error' as const,
        code: 'operator_control_csrf_rejected' as const,
        retryable: false,
        reason: sourceWrite.reason,
      }
    }

    const db = runtimeDb(ctx.db)
    const source = await loadPhaseOneSourceState(db)
    const adminMembership = await readCurrentActiveMembership(ctx)
    const authority = requireAdminAuthority(adminMembership, 'set_operator_control')
    if (authority.kind === 'denied') {
      const denied = recordAdminActionDenied(adminAuthorityState(source), {
        actorMembership: adminMembership,
        action: 'set_operator_control',
        targetType: 'operator_control',
        targetRef: args.key,
        reasonCode: authority.reason,
        evidenceRefs: args.evidenceRefs,
        operationKey: args.operationKey,
        correlationId: args.correlationId,
        now: Date.now(),
      })
      await persistPhaseOneSourceState(db, source)
      return {
        kind: 'error' as const,
        code: 'operator_control_admin_denied' as const,
        retryable: false,
        reason: authority.reason,
        auditEvent: summarizeOperatorAudit(denied.auditEvent),
        membershipAuditEvent: summarizeMembershipAudit(denied.membershipAuditEvent),
      }
    }

    const state = operatorControlState(source)
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
      operationKey: brandNonEmpty(args.operationKey, 'OperationKey'),
      correlationId: brandNonEmpty(args.correlationId, 'CorrelationId'),
      now: Date.now(),
    })

    await persistPhaseOneSourceState(db, source)
    return summarizeSetOperatorControl(result)
  },
})

export const readOperatorControls = queryGeneric({
  args: {},
  returns: readOperatorControlsResult,
  handler: async (ctx) => {
    const db = runtimeDb(ctx.db)
    const source = await loadPhaseOneSourceState(db)
    const adminMembership = await readCurrentActiveMembership(ctx)
    const authority = requireAdminAuthority(adminMembership, 'set_operator_control')
    if (authority.kind === 'denied') {
      return {
        kind: 'denied' as const,
        reason: authority.reason,
        controls: [],
      }
    }

    return {
      kind: 'allowed' as const,
      controls: readOperatorControlsModule(operatorControlState(source), Date.now())
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
  handler: async (ctx, args) => {
    if (args.businessId === undefined) {
      return { ok: true as const }
    }

    const db = runtimeDb(ctx.db)
    const source = await loadPhaseOneSourceState(db)
    const now = Date.now()
    const ownerActivationByBusiness = new Map<string, OwnerActivationState>(
      source.observability.ownerActivationState.map((row) => [
        String(row.businessId),
        parseOwnerActivationStateRow(row),
      ]),
    )

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
      businessId: brandNonEmpty(args.businessId, 'BusinessId'),
    }

    const result = recordFunnelEvent(input, ownerActivationByBusiness)
    if (result.ownerActivation === undefined) {
      return { ok: true as const }
    }

    source.observability.ownerActivationState = [
      ...source.observability.ownerActivationState.filter(
        (row) => String(row.businessId) !== String(result.ownerActivation?.businessId),
      ),
      result.ownerActivation,
    ]

    await persistPhaseOneSourceState(db, source)
    return { ok: true as const }
  },
})

/** @deprecated Use recordOwnerActivationEvent. Funnel events are stored in PostHog. */
export const recordPublicFunnelEvent = recordOwnerActivationEvent

export const readAdminOwnerActivationSummary = queryGeneric({
  args: {},
  returns: v.object({
    byStage: v.array(ownerActivationSummaryRow),
    totalTracked: v.number(),
  }),
  handler: async (ctx) => {
    const db = runtimeDb(ctx.db)
    const adminMembership = await readCurrentActiveMembership(ctx)
    const authority = requireAdminAuthority(adminMembership, 'set_operator_control')
    if (authority.kind === 'denied') {
      return { byStage: [], totalTracked: 0 }
    }

    const rows = await collect(db, 'ownerActivationState')
    const counts = new Map<string, number>()
    for (const row of rows) {
      const stage = String(row.stage)
      counts.set(stage, (counts.get(stage) ?? 0) + 1)
    }

    const byStage = [...counts.entries()]
      .map(([stage, count]) => ({ stage, count }))
      .sort((left, right) => right.count - left.count)

    return {
      byStage,
      totalTracked: rows.length,
    }
  },
})

/** @deprecated Funnel counts now live in PostHog. */
export const readAdminFunnelSummary = queryGeneric({
  args: {},
  returns: v.object({
    rows: v.array(v.object({
      eventType: v.string(),
      source: v.string(),
      stage: v.string(),
      count: v.number(),
    })),
    totalEvents: v.number(),
  }),
  handler: async () => ({ rows: [], totalEvents: 0 }),
})

function operatorControlState(source: Awaited<ReturnType<typeof loadPhaseOneSourceState>>): OperatorControlSourceState {
  return {
    operatorControls: source.observability.operatorControls as OperatorControlSourceState['operatorControls'],
    auditEvents: source.observability.auditEvents as AuditEventContract[],
  }
}

function adminAuthorityState(source: Awaited<ReturnType<typeof loadPhaseOneSourceState>>): AdminAuthorityState {
  return {
    adminMemberships: source.security.adminMemberships as AdminMembership[],
    adminMembershipAuditEvents: source.security.adminMembershipAuditEvents as AdminDecisionAudit[],
    auditEvents: source.observability.auditEvents as AuditEventContract[],
  }
}

async function readCurrentActiveMembership(ctx: RuntimeCtx): Promise<AdminMembership | undefined> {
  const identity = await ctx.auth.getUserIdentity()
  return identity === null ? undefined : readActiveAdminMembership(runtimeDb(ctx.db), identity.subject)
}

function summarizeSetOperatorControl(result: ReturnType<typeof setOperatorControlModule>) {
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

async function collect(db: Pick<RuntimeDb, 'query'>, tableName: string): Promise<RuntimeDocument[]> {
  return db.query(tableName).collect()
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
